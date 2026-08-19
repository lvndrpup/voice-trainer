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
