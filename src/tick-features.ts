// Shared per-tick feature capture — peak dB and pitch detection — used
// by both the v0.1 instrument's tick() loop (main.ts) and the
// calibration wizard's own per-step collection loop. A standalone
// module, not exported from main.ts: main.ts has import-time side
// effects (wires up DOM event listeners immediately), so anything else
// that needs this logic must not import main.ts to get it.

import { detectPitch } from "./dsp";

export interface TickFeatures {
  peakDb: number;
  f0Hz: number | null;
}

export function peakDb(spectrum: Float32Array): number {
  let peak = -Infinity;
  for (const value of spectrum) {
    if (value > peak) peak = value;
  }
  return peak;
}

/**
 * `waveform`/`sampleRate` are null together — pitch detection needs
 * both, and callers only have a waveform to read once capture is
 * actually active (mirrors main.ts's own `info`-gated getWaveform()
 * call, preserved as-is by this extraction, not a new behavior).
 */
export function readTickFeatures(
  spectrum: Float32Array,
  waveform: Float32Array | null,
  sampleRate: number | null,
): TickFeatures {
  return {
    peakDb: peakDb(spectrum),
    f0Hz: waveform !== null && sampleRate !== null ? detectPitch(waveform, sampleRate) : null,
  };
}
