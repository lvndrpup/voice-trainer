// Pure functions over Float32Array. No DOM, no Web Audio. Runs headlessly in Node. See CLAUDE.md.

export interface LogFrequencyBinsOptions {
  minFrequencyHz?: number;
}

/**
 * Remaps a linear-frequency magnitude spectrum (as returned by
 * AnalyserNode.getFloatFrequencyData) onto `outputBinCount` log-spaced
 * frequency buckets, via linear interpolation between the two nearest
 * linear bins. Used to drive a log-frequency-axis spectrogram, where
 * equal pixel distances represent equal frequency ratios rather than
 * equal Hz — the axis convention every reference instrument (Overtone
 * Analyzer, VoceVista, Voice Tools) uses, because pitch and formant
 * spacing are logarithmic, not linear.
 *
 * `minFrequencyHz` bounds the low end of the log axis (default 20Hz,
 * the conventional floor of audible range) — this is a display-axis
 * bound, not a coaching target; it doesn't tell the user what to aim
 * for, only how the spectrum is laid out on screen. See CLAUDE.md's
 * "no hardcoded frequency targets" rule.
 */
export function computeLogFrequencyBins(
  magnitudesDb: Float32Array,
  sampleRate: number,
  outputBinCount: number,
  options: LogFrequencyBinsOptions = {},
): Float32Array {
  const minFrequencyHz = options.minFrequencyHz ?? 20;
  const linearBinCount = magnitudesDb.length;
  const nyquist = sampleRate / 2;

  if (linearBinCount < 2) {
    throw new Error("magnitudesDb must have at least 2 bins.");
  }
  if (!Number.isInteger(outputBinCount) || outputBinCount < 1) {
    throw new Error("outputBinCount must be a positive integer.");
  }
  if (!(minFrequencyHz > 0) || !(minFrequencyHz < nyquist)) {
    throw new Error(`minFrequencyHz must be in (0, ${nyquist}).`);
  }

  const hzPerLinearBin = nyquist / linearBinCount;
  const logMin = Math.log2(minFrequencyHz);
  const logMax = Math.log2(nyquist);
  const logRange = logMax - logMin;
  const output = new Float32Array(outputBinCount);

  for (let i = 0; i < outputBinCount; i++) {
    const t = outputBinCount === 1 ? 0 : i / (outputBinCount - 1);
    const freqHz = 2 ** (logMin + t * logRange);
    const exactBin = freqHz / hzPerLinearBin;
    const lowerBin = Math.max(0, Math.min(linearBinCount - 1, Math.floor(exactBin)));
    const upperBin = Math.min(linearBinCount - 1, lowerBin + 1);
    const frac = Math.max(0, Math.min(1, exactBin - lowerBin));
    output[i] = magnitudesDb[lowerBin] * (1 - frac) + magnitudesDb[upperBin] * frac;
  }

  return output;
}

export interface PitchDetectionOptions {
  minFrequencyHz?: number;
  maxFrequencyHz?: number;
  clarityThreshold?: number;
}

/**
 * Estimates the fundamental frequency of a time-domain signal window
 * via normalized autocorrelation (the NSDF formulation from the McLeod
 * Pitch Method — 2*ACF(lag) / (energy of that lag's own overlap
 * window), not a single whole-window energy divisor, since the latter
 * systematically penalizes larger lags as the overlap shrinks). Adds
 * parabolic interpolation around the peak for sub-sample lag precision.
 * Returns null when the signal is silent or not confidently periodic
 * (voiceless consonant, noise, below `clarityThreshold`) — never a
 * misleading number.
 *
 * `minFrequencyHz`/`maxFrequencyHz` (default 50-1000Hz) bound the lag
 * search range. This is the physically plausible fundamental-frequency
 * range for a human voice in general — an algorithm search bound, not
 * a coaching target. It doesn't tell the user what to aim for; it just
 * limits which periodicities the search considers. See CLAUDE.md's "no
 * hardcoded frequency targets" rule, and the same reasoning applied to
 * computeLogFrequencyBins's minFrequencyHz above.
 */
export function detectPitch(
  samples: Float32Array,
  sampleRate: number,
  options: PitchDetectionOptions = {},
): number | null {
  const minFrequencyHz = options.minFrequencyHz ?? 50;
  const maxFrequencyHz = options.maxFrequencyHz ?? 1000;
  const clarityThreshold = options.clarityThreshold ?? 0.9;

  if (samples.length < 2) {
    throw new Error("samples must have at least 2 elements.");
  }
  if (!(minFrequencyHz > 0) || !(maxFrequencyHz > minFrequencyHz)) {
    throw new Error("minFrequencyHz must be > 0 and less than maxFrequencyHz.");
  }
  if (!(clarityThreshold > 0) || !(clarityThreshold <= 1)) {
    throw new Error("clarityThreshold must be in (0, 1].");
  }

  const minLag = Math.max(1, Math.floor(sampleRate / maxFrequencyHz));
  const maxLag = Math.min(samples.length - 1, Math.ceil(sampleRate / minFrequencyHz));
  if (minLag >= maxLag) {
    return null; // window too short to search the requested frequency range
  }

  let totalEnergy = 0;
  for (const sample of samples) {
    totalEnergy += sample * sample;
  }
  if (totalEnergy === 0) {
    return null; // silence
  }

  // A periodic signal correlates strongly at every integer multiple of its
  // true period, so taking the single highest-correlation lag over the
  // whole range risks locking onto a subharmonic (half the true frequency)
  // instead of the fundamental. Scanning for the *first* local maximum
  // that clears clarityThreshold — rather than the global maximum — avoids
  // this "octave error", per the McLeod Pitch Method.
  let bestLag = -1;
  let previousValue = normalizedCorrelationAtLag(samples, minLag);
  let wasRising = false;
  for (let lag = minLag + 1; lag <= maxLag; lag++) {
    const value = normalizedCorrelationAtLag(samples, lag);
    const isRising = value > previousValue;
    if (wasRising && !isRising && previousValue >= clarityThreshold) {
      bestLag = lag - 1;
      break;
    }
    wasRising = isRising;
    previousValue = value;
  }

  if (bestLag === -1) {
    return null; // no confidently periodic lag in range
  }

  const refinedLag = parabolicPeakLag(samples, bestLag, minLag, maxLag);
  return sampleRate / refinedLag;
}

/**
 * Robust central tendency for calibration aggregation — median rather
 * than mean, since one stray click/pop shifts a mean but not a median.
 * Non-finite inputs (e.g. the `-Infinity` a silent-frame `peakDb`
 * reading can legitimately be — see decisions.md's "Open" entry on
 * `FeatureFrame.peakDb`) are filtered out rather than left to corrupt
 * the result. Returns null, not NaN, when nothing finite remains —
 * "never a misleading number," same convention as detectPitch.
 */
export function medianOfFinite(values: readonly number[]): number | null {
  const finite = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (finite.length === 0) {
    return null;
  }
  const mid = Math.floor(finite.length / 2);
  return finite.length % 2 === 0 ? (finite[mid - 1] + finite[mid]) / 2 : finite[mid];
}

/**
 * Median of the non-null pitch readings collected during calibration's
 * "count to five" step (calibration.md step 2) — "the most important
 * single number" calibration produces, per that doc. Kept as its own
 * function rather than a bare `medianOfFinite` call at the call site
 * because it also has to strip the nulls that mean "no confident pitch
 * this frame" before aggregating.
 */
export function estimateHabitualF0Hz(f0Samples: readonly (number | null)[]): number | null {
  const voiced = f0Samples.filter((f0): f0 is number => f0 !== null);
  return medianOfFinite(voiced);
}

/**
 * Comfortable F0 range from calibration.md steps 4 ("hiii like greeting
 * a dog" — top of comfortable range, in greeting register) and 5 (a
 * hum slide up then down, stopping "wherever it stops feeling easy").
 * Floor is the hum slide's own low end; ceiling is the higher of the
 * greeting-register top and the hum slide's own top, since either task
 * might turn out to reach higher on a given day.
 *
 * [likely] — calibration.md documents what each step produces
 * individually, not a formula for combining them into one range; this
 * is a reading of the two step descriptions, not a specified formula.
 * See decisions.md.
 */
export function estimateComfortableF0Range(
  greetingF0Samples: readonly (number | null)[],
  humSlideF0Samples: readonly (number | null)[],
): [number, number] | null {
  const humVoiced = humSlideF0Samples.filter((f0): f0 is number => f0 !== null);
  if (humVoiced.length === 0) {
    return null; // the hum slide anchors the floor; no range without it
  }

  let floorHz = Infinity;
  let ceilingHz = -Infinity;
  for (const f0 of humVoiced) {
    if (f0 < floorHz) floorHz = f0;
    if (f0 > ceilingHz) ceilingHz = f0;
  }
  for (const f0 of greetingF0Samples) {
    if (f0 !== null && f0 > ceilingHz) ceilingHz = f0;
  }
  return [floorHz, ceilingHz];
}

export interface Formants {
  f1Hz: number;
  f2Hz: number;
}

export interface FormantExtractionOptions {
  /** Lower bound of the formant search range. Default 150Hz — below the
   * typical F1 floor for any vowel, leaves margin without wandering into
   * F0/harmonic territory. Algorithm search bound, not a coaching target;
   * same category as detectPitch's minFrequencyHz. */
  minFormantHz?: number;
  /** Upper bound of the search range, and (via `2 * maxFormantHz`) the
   * target rate the signal is decimated to before LPC analysis — see the
   * module doc comment below for why. Default 5000Hz, comfortably above
   * F2 for any vowel in adult speech. Algorithm parameter, not a target. */
  maxFormantHz?: number;
  /** LPC predictor order. Default 12 (see below) if unset. */
  lpcOrder?: number;
  /** Two spectral-envelope peaks closer together than this are treated as
   * one ambiguous peak, not two formants — default 150Hz. */
  minPeakSeparationHz?: number;
  /** Minimum topographic prominence (dB) for a spectral-envelope local
   * maximum to count as a real resonance rather than numerical ripple
   * from an LPC pole with nothing principled to model — see
   * findSpectralPeaks. Default 3dB; real formant peaks are typically
   * far more prominent than this, spurious ripple from unvoiced/noisy
   * input typically isn't. */
  minPeakProminenceDb?: number;
}

/**
 * Estimates the first two formants (F1, F2) of a voiced vowel window via
 * linear predictive coding: decimate → pre-emphasize → Hamming window →
 * autocorrelation → Levinson-Durbin → peak-pick the resulting all-pole
 * spectral envelope. Returns null (never a misleading number, same
 * convention as detectPitch) for silence, an ill-conditioned/degenerate
 * window, or fewer than two sufficiently prominent, adequately-separated
 * spectral peaks in range — including unvoiced/noisy input that happens
 * to be numerically well-conditioned (e.g. white noise): LPC still fits
 * *some* all-pole model to it, but the resulting peaks are typically weak
 * ripple, not real resonances, which `minPeakProminenceDb` exists to
 * reject rather than reporting them as confident formants.
 *
 * Decimates to `2 * maxFormantHz` (10kHz at the default 5000Hz) before
 * analysis, mirroring standard formant-analysis practice (e.g. Praat):
 * running LPC directly at a raw 44.1k/48k capture rate would need a much
 * higher predictor order to span that bandwidth, most of which is
 * irrelevant to F1/F2, and produces a wigglier envelope more prone to
 * spurious peaks. Decimating first means `lpcOrder`'s default (12) is a
 * fixed value tuned to the working rate rather than the raw one — capture
 * rate stops mattering at all once the signal is downsampled, which is a
 * cleaner way to avoid the "misbehaves at 44.1k vs 48k" failure mode than
 * scaling the order to the raw rate would be. See docs/formant-extraction.md.
 *
 * Peak-picking (scan the envelope, take local maxima) was chosen over
 * polynomial root-finding for the LPC denominator: root-finding is more
 * precise but needs complex-number polynomial root arithmetic, which this
 * project doesn't already depend on — adding it would mean either writing
 * a general complex root-finder from scratch or asking to add a
 * dependency (CLAUDE.md: ask before adding one). Peak-picking is real-
 * arithmetic-only and reuses the same parabolic-interpolation technique
 * detectPitch already applies to its own correlation peak.
 */
export function estimateFormants(
  samples: Float32Array,
  sampleRate: number,
  options: FormantExtractionOptions = {},
): Formants | null {
  const minFormantHz = options.minFormantHz ?? 150;
  const maxFormantHz = options.maxFormantHz ?? 5000;
  const lpcOrder = options.lpcOrder ?? 12;
  const minPeakSeparationHz = options.minPeakSeparationHz ?? 150;
  const minPeakProminenceDb = options.minPeakProminenceDb ?? 3;

  if (samples.length < 2) {
    throw new Error("samples must have at least 2 elements.");
  }
  if (!(sampleRate > 0)) {
    throw new Error("sampleRate must be > 0.");
  }
  if (!(minFormantHz > 0) || !(maxFormantHz > minFormantHz)) {
    throw new Error("minFormantHz must be > 0 and less than maxFormantHz.");
  }
  if (!Number.isInteger(lpcOrder) || lpcOrder < 2) {
    throw new Error("lpcOrder must be an integer >= 2.");
  }

  let totalEnergy = 0;
  for (const sample of samples) {
    totalEnergy += sample * sample;
  }
  if (totalEnergy === 0) {
    return null; // silence
  }

  const targetRateHz = 2 * maxFormantHz;
  const { samples: working, sampleRate: workingRate } = decimate(samples, sampleRate, targetRateHz);
  if (working.length <= lpcOrder) {
    throw new Error(
      `samples must contain more than lpcOrder (${lpcOrder}) samples after decimation; ` +
        `got ${working.length} (from ${samples.length} at ${sampleRate}Hz, decimated to ${workingRate}Hz).`,
    );
  }

  const emphasized = preEmphasize(working);
  const windowed = applyHammingWindow(emphasized);
  const autocorrelation = autocorrelate(windowed, lpcOrder);
  const coefficients = levinsonDurbin(autocorrelation, lpcOrder);
  if (coefficients === null) {
    return null; // ill-conditioned (e.g. unvoiced/noisy input)
  }

  const nyquistMargin = workingRate / 2 - 1;
  const searchMaxHz = Math.min(maxFormantHz, nyquistMargin);
  if (searchMaxHz <= minFormantHz) {
    return null; // degenerate range, e.g. maxFormantHz too close to Nyquist
  }
  const peaks = findSpectralPeaks(coefficients, workingRate, minFormantHz, searchMaxHz);
  const filtered = filterSpectralPeaks(peaks, minPeakProminenceDb, minPeakSeparationHz);

  if (filtered.length < 2) {
    return null;
  }
  return { f1Hz: filtered[0], f2Hz: filtered[1] };
}

/** Windowed-sinc lowpass FIR (Hamming window), used only to anti-alias
 * before decimate()'s subsampling — see estimateFormants's doc comment. */
function lowpassFirTaps(cutoffHz: number, sampleRate: number, halfLength: number): Float64Array {
  const length = 2 * halfLength + 1;
  const taps = new Float64Array(length);
  const normalizedCutoff = cutoffHz / sampleRate;
  for (let i = 0; i < length; i++) {
    const n = i - halfLength;
    const sinc = n === 0 ? 2 * normalizedCutoff : Math.sin(2 * Math.PI * normalizedCutoff * n) / (Math.PI * n);
    const hamming = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (length - 1));
    taps[i] = sinc * hamming;
  }
  let dcGain = 0;
  for (const tap of taps) dcGain += tap;
  if (dcGain !== 0) {
    for (let i = 0; i < length; i++) taps[i] /= dcGain;
  }
  return taps;
}

function applyFir(samples: Float32Array, taps: Float64Array): Float64Array {
  const halfLength = (taps.length - 1) / 2;
  const output = new Float64Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    let accumulator = 0;
    for (let k = 0; k < taps.length; k++) {
      const sampleIndex = i + k - halfLength;
      if (sampleIndex >= 0 && sampleIndex < samples.length) {
        accumulator += taps[k] * samples[sampleIndex];
      }
    }
    output[i] = accumulator;
  }
  return output;
}

/** Lowpass-filters (if decimating) and subsamples to ~targetRateHz. A
 * no-op (beyond a Float64Array copy) when sampleRate is already at or
 * below the target, e.g. a synthetic test running at 8kHz. */
function decimate(
  samples: Float32Array,
  sampleRate: number,
  targetRateHz: number,
): { samples: Float64Array; sampleRate: number } {
  const factor = Math.max(1, Math.floor(sampleRate / targetRateHz));
  if (factor === 1) {
    return { samples: Float64Array.from(samples), sampleRate };
  }
  const newRate = sampleRate / factor;
  const cutoffHz = (newRate / 2) * 0.9; // margin below the new Nyquist
  const taps = lowpassFirTaps(cutoffHz, sampleRate, 32);
  const filtered = applyFir(samples, taps);
  const decimatedLength = Math.floor(filtered.length / factor);
  const decimated = new Float64Array(decimatedLength);
  for (let i = 0; i < decimatedLength; i++) {
    decimated[i] = filtered[i * factor];
  }
  return { samples: decimated, sampleRate: newRate };
}

/** y[n] = x[n] - alpha*x[n-1]. Flattens voiced speech's natural
 * -6dB/octave spectral tilt so LPC models the vocal-tract resonances
 * rather than mostly re-deriving the tilt. alpha=0.97 is the standard
 * value used throughout the LPC/formant-analysis literature. */
function preEmphasize(samples: Float64Array, alpha = 0.97): Float64Array {
  const output = new Float64Array(samples.length);
  output[0] = samples[0];
  for (let i = 1; i < samples.length; i++) {
    output[i] = samples[i] - alpha * samples[i - 1];
  }
  return output;
}

function applyHammingWindow(samples: Float64Array): Float64Array {
  const n = samples.length;
  const output = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const weight = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1));
    output[i] = samples[i] * weight;
  }
  return output;
}

function autocorrelate(samples: Float64Array, maxLag: number): Float64Array {
  const r = new Float64Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < samples.length - lag; i++) {
      sum += samples[i] * samples[i + lag];
    }
    r[lag] = sum;
  }
  return r;
}

/** Solves for LPC coefficients a[1..order] (a[0] implicitly 1) via the
 * Levinson-Durbin recursion over autocorrelation r[0..order], such that
 * the all-pole denominator is D(z) = 1 - sum_k a[k] z^-k. Returns null if
 * the input is degenerate (no energy, or a reflection coefficient with
 * |k| >= 1 makes the prediction error non-positive — an ill-conditioned
 * or non-predictable signal, e.g. white noise). */
function levinsonDurbin(r: Float64Array, order: number): Float64Array | null {
  if (!(r[0] > 0)) {
    return null;
  }
  let a = new Float64Array(order + 1);
  let error = r[0];
  for (let i = 1; i <= order; i++) {
    let acc = r[i];
    for (let j = 1; j < i; j++) {
      acc -= a[j] * r[i - j];
    }
    const reflection = acc / error;
    const previousA = a;
    a = new Float64Array(order + 1);
    a.set(previousA);
    a[i] = reflection;
    for (let j = 1; j < i; j++) {
      a[j] = previousA[j] - reflection * previousA[i - j];
    }
    error *= 1 - reflection * reflection;
    if (!(error > 0)) {
      return null;
    }
  }
  return a.slice(1, order + 1);
}

/** |H(e^jw)| = 1 / |D(e^jw)| for the all-pole model, evaluated at a
 * single frequency. Used only for peak-picking the envelope shape, so
 * the overall gain term is omitted — it doesn't move peak locations. */
function lpcMagnitudeAt(coefficients: Float64Array, freqHz: number, workingRate: number): number {
  const omega = (2 * Math.PI * freqHz) / workingRate;
  let realPart = 1;
  let imagPart = 0;
  for (let k = 1; k <= coefficients.length; k++) {
    const angle = omega * k;
    realPart -= coefficients[k - 1] * Math.cos(angle);
    imagPart += coefficients[k - 1] * Math.sin(angle);
  }
  const denominatorMagSq = realPart * realPart + imagPart * imagPart;
  return denominatorMagSq === 0 ? Number.POSITIVE_INFINITY : 1 / Math.sqrt(denominatorMagSq);
}

interface SpectralPeak {
  freqHz: number;
  prominenceDb: number;
}

/** Scans [minHz, maxHz] on a fixed grid, returns ascending-frequency
 * local maxima of the LPC envelope (in dB, for a numerically well-behaved
 * parabolic fit near sharp poles), each refined via the same parabolic-
 * interpolation technique detectPitch uses on its correlation peak, and
 * tagged with topographic prominence (peak height minus the higher of
 * the lowest points on either side before the envelope would rise again)
 * so a caller can reject peaks that are just numerical ripple rather than
 * a real resonance — see estimateFormants's `minPeakProminenceDb`. */
function findSpectralPeaks(
  coefficients: Float64Array,
  workingRate: number,
  minHz: number,
  maxHz: number,
): SpectralPeak[] {
  const gridStepHz = 5;
  const freqs: number[] = [];
  const magsDb: number[] = [];
  for (let f = minHz; f <= maxHz; f += gridStepHz) {
    freqs.push(f);
    magsDb.push(20 * Math.log10(lpcMagnitudeAt(coefficients, f, workingRate)));
  }

  const peaks: SpectralPeak[] = [];
  for (let i = 1; i < magsDb.length - 1; i++) {
    const y0 = magsDb[i - 1];
    const y1 = magsDb[i];
    const y2 = magsDb[i + 1];
    if (y1 > y0 && y1 > y2) {
      const denominator = y0 - 2 * y1 + y2;
      const offset = denominator === 0 ? 0 : (0.5 * (y0 - y2)) / denominator;
      let leftMin = y1;
      for (let j = i - 1; j >= 0 && magsDb[j] <= y1; j--) leftMin = Math.min(leftMin, magsDb[j]);
      let rightMin = y1;
      for (let j = i + 1; j < magsDb.length && magsDb[j] <= y1; j++) rightMin = Math.min(rightMin, magsDb[j]);
      peaks.push({
        freqHz: freqs[i] + offset * gridStepHz,
        prominenceDb: y1 - Math.max(leftMin, rightMin),
      });
    }
  }
  return peaks;
}

/** Drops peaks below the prominence floor, then collapses any remaining
 * ascending-frequency peaks closer together than minSeparationHz into
 * one (the LPC envelope splitting a single broad resonance into two
 * nearby local maxima) — keeps the first of each such cluster, rather
 * than reporting two formants that are really one. */
function filterSpectralPeaks(
  peaks: readonly SpectralPeak[],
  minProminenceDb: number,
  minSeparationHz: number,
): number[] {
  const prominent = peaks.filter((peak) => peak.prominenceDb >= minProminenceDb);
  const kept: number[] = [];
  for (const peak of prominent) {
    if (kept.length === 0 || peak.freqHz - kept[kept.length - 1] >= minSeparationHz) {
      kept.push(peak.freqHz);
    }
  }
  return kept;
}

function normalizedCorrelationAtLag(samples: Float32Array, lag: number): number {
  let correlation = 0;
  let localEnergy = 0;
  for (let i = 0; i < samples.length - lag; i++) {
    correlation += samples[i] * samples[i + lag];
    localEnergy += samples[i] * samples[i] + samples[i + lag] * samples[i + lag];
  }
  return localEnergy === 0 ? 0 : (2 * correlation) / localEnergy;
}

function parabolicPeakLag(
  samples: Float32Array,
  peakLag: number,
  minLag: number,
  maxLag: number,
): number {
  if (peakLag <= minLag || peakLag >= maxLag) {
    return peakLag;
  }
  const yBefore = normalizedCorrelationAtLag(samples, peakLag - 1);
  const yAt = normalizedCorrelationAtLag(samples, peakLag);
  const yAfter = normalizedCorrelationAtLag(samples, peakLag + 1);
  const denominator = yBefore - 2 * yAt + yAfter;
  if (denominator === 0) {
    return peakLag;
  }
  const offset = (0.5 * (yBefore - yAfter)) / denominator;
  return peakLag + offset;
}
