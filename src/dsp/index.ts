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
