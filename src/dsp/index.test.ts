import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeLogFrequencyBins,
  detectPitch,
  medianOfFinite,
  estimateHabitualF0Hz,
  estimateComfortableF0Range,
  estimateFormants,
} from "./index.ts";

function sineWave(frequencyHz: number, sampleRate: number, length: number): Float32Array {
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    samples[i] = Math.sin((2 * Math.PI * frequencyHz * i) / sampleRate);
  }
  return samples;
}

/**
 * A crude source-filter vowel synthesizer for testing estimateFormants
 * against signals with known F1/F2, not a claim about real vocal-tract
 * acoustics: a sawtooth excitation (broadband harmonic content, so both
 * formants get excited) run through two cascaded 2nd-order IIR
 * resonators tuned to the target frequencies. Standalone test helper,
 * not exported from src/dsp — production formant extraction never
 * synthesizes anything, only analyzes real capture.
 */
function synthesizeVowel(
  f0Hz: number,
  f1Hz: number,
  f2Hz: number,
  sampleRate: number,
  durationSec: number,
): Float32Array {
  const length = Math.round(sampleRate * durationSec);
  const excitation = new Float32Array(length);
  for (let n = 0; n < length; n++) {
    const phase = (f0Hz * n) / sampleRate;
    excitation[n] = 2 * (phase - Math.floor(phase + 0.5)); // naive sawtooth, -1..1
  }
  return resonate(resonate(excitation, f1Hz, 80, sampleRate), f2Hz, 100, sampleRate);
}

/** A single 2nd-order resonant IIR filter (bandpass-like peak at
 * centerHz), the standard building block for source-filter formant
 * synthesis (e.g. the Klatt synthesizer's individual resonators). */
function resonate(
  input: Float32Array,
  centerHz: number,
  bandwidthHz: number,
  sampleRate: number,
): Float32Array {
  const r = Math.exp((-Math.PI * bandwidthHz) / sampleRate);
  const theta = (2 * Math.PI * centerHz) / sampleRate;
  const a1 = 2 * r * Math.cos(theta);
  const a2 = -r * r;
  const b0 = 1 - a1 - a2;
  const output = new Float32Array(input.length);
  let y1 = 0;
  let y2 = 0;
  for (let n = 0; n < input.length; n++) {
    const y = b0 * input[n] + a1 * y1 + a2 * y2;
    output[n] = y;
    y2 = y1;
    y1 = y;
  }
  return output;
}

void test("computeLogFrequencyBins: constant input maps to constant output", () => {
  const input = new Float32Array(512).fill(-42);
  const output = computeLogFrequencyBins(input, 48000, 100);
  assert.equal(output.length, 100);
  for (const value of output) {
    assert.ok(Math.abs(value - -42) < 1e-6, `expected ~-42, got ${value}`);
  }
});

void test("computeLogFrequencyBins: low and high ends map to the requested frequency bounds", () => {
  const linearBinCount = 1024;
  const sampleRate = 48000;
  const nyquist = sampleRate / 2;
  const hzPerLinearBin = nyquist / linearBinCount;
  const input = new Float32Array(linearBinCount);
  for (let i = 0; i < linearBinCount; i++) {
    input[i] = i * hzPerLinearBin; // value at each bin == its own frequency in Hz
  }

  const output = computeLogFrequencyBins(input, sampleRate, 50, { minFrequencyHz: 100 });

  // First output bin should be ~100Hz (the configured floor), last should
  // be ~nyquist, since each bin's value equals its frequency by construction.
  assert.ok(Math.abs(output[0] - 100) < 5, `expected ~100, got ${output[0]}`);
  assert.ok(
    Math.abs(output[output.length - 1] - nyquist) < 50,
    `expected ~${nyquist}, got ${output[output.length - 1]}`,
  );

  // Monotonically increasing, since the underlying spectrum is monotonic.
  for (let i = 1; i < output.length; i++) {
    assert.ok(output[i] >= output[i - 1], `expected non-decreasing at index ${i}`);
  }
});

void test("computeLogFrequencyBins: outputBinCount of 1 returns a single value at the floor frequency", () => {
  const input = new Float32Array(512);
  input[0] = -80;
  input[1] = -10;
  const output = computeLogFrequencyBins(input, 48000, 1, { minFrequencyHz: 30 });
  assert.equal(output.length, 1);
});

void test("computeLogFrequencyBins: rejects too-few linear bins", () => {
  assert.throws(() => computeLogFrequencyBins(new Float32Array(1), 48000, 10));
});

void test("computeLogFrequencyBins: rejects non-positive-integer outputBinCount", () => {
  const input = new Float32Array(512);
  assert.throws(() => computeLogFrequencyBins(input, 48000, 0));
  assert.throws(() => computeLogFrequencyBins(input, 48000, 1.5));
});

void test("computeLogFrequencyBins: rejects minFrequencyHz outside (0, nyquist)", () => {
  const input = new Float32Array(512);
  assert.throws(() => computeLogFrequencyBins(input, 48000, 10, { minFrequencyHz: 0 }));
  assert.throws(() => computeLogFrequencyBins(input, 48000, 10, { minFrequencyHz: 24000 }));
});

void test("detectPitch: recovers the frequency of a pure sine wave", () => {
  const sampleRate = 48000;
  for (const frequencyHz of [110, 220, 440]) {
    const samples = sineWave(frequencyHz, sampleRate, 2048);
    const detected = detectPitch(samples, sampleRate);
    assert.ok(detected !== null, `expected a pitch for ${frequencyHz}Hz, got null`);
    assert.ok(
      Math.abs(detected - frequencyHz) < 1,
      `expected ~${frequencyHz}Hz, got ${detected}`,
    );
  }
});

void test("detectPitch: returns null for silence", () => {
  const samples = new Float32Array(2048);
  assert.equal(detectPitch(samples, 48000), null);
});

void test("detectPitch: returns null for white noise (not confidently periodic)", () => {
  const samples = new Float32Array(2048);
  // Deterministic pseudo-random noise, not a real PRNG dependency — just
  // needs to be non-periodic, not cryptographically random.
  let seed = 42;
  for (let i = 0; i < samples.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    samples[i] = (seed / 0x7fffffff) * 2 - 1;
  }
  assert.equal(detectPitch(samples, 48000), null);
});

void test("detectPitch: returns null when the window is too short for the frequency range", () => {
  const samples = sineWave(220, 48000, 8);
  assert.equal(detectPitch(samples, 48000), null);
});

void test("detectPitch: rejects invalid options", () => {
  const samples = sineWave(220, 48000, 2048);
  assert.throws(() => detectPitch(samples, 48000, { minFrequencyHz: 0 }));
  assert.throws(() =>
    detectPitch(samples, 48000, { minFrequencyHz: 1000, maxFrequencyHz: 500 }),
  );
  assert.throws(() => detectPitch(samples, 48000, { clarityThreshold: 0 }));
  assert.throws(() => detectPitch(samples, 48000, { clarityThreshold: 1.5 }));
});

void test("detectPitch: rejects a too-short sample array", () => {
  assert.throws(() => detectPitch(new Float32Array(1), 48000));
});

void test("medianOfFinite: odd-length input returns the middle value", () => {
  assert.equal(medianOfFinite([3, 1, 2]), 2);
});

void test("medianOfFinite: even-length input averages the two middle values", () => {
  assert.equal(medianOfFinite([1, 2, 3, 4]), 2.5);
});

void test("medianOfFinite: filters out non-finite values, including -Infinity", () => {
  assert.equal(medianOfFinite([-Infinity, 1, 2, 3, Infinity, NaN]), 2);
});

void test("medianOfFinite: returns null when nothing finite remains", () => {
  assert.equal(medianOfFinite([]), null);
  assert.equal(medianOfFinite([-Infinity, NaN]), null);
});

void test("medianOfFinite: one stray outlier doesn't move the median the way it would a mean", () => {
  const withOutlier = medianOfFinite([100, 101, 102, 5000]);
  assert.equal(withOutlier, 101.5);
});

void test("estimateHabitualF0Hz: medians the voiced (non-null) readings", () => {
  assert.equal(estimateHabitualF0Hz([110, null, 112, null, 108]), 110);
});

void test("estimateHabitualF0Hz: returns null when every reading is unvoiced", () => {
  assert.equal(estimateHabitualF0Hz([null, null, null]), null);
});

void test("estimateComfortableF0Range: floor from the hum slide, ceiling is the higher of both steps", () => {
  const greeting = [300, 310, 305];
  const humSlide = [150, 200, 320, 180];
  assert.deepEqual(estimateComfortableF0Range(greeting, humSlide), [150, 320]);
});

void test("estimateComfortableF0Range: greeting step never lowers the ceiling below the hum slide's own top", () => {
  const greeting = [200, null, 210];
  const humSlide = [150, 400, 180];
  assert.deepEqual(estimateComfortableF0Range(greeting, humSlide), [150, 400]);
});

void test("estimateComfortableF0Range: returns null when the hum slide has no voiced readings", () => {
  assert.equal(estimateComfortableF0Range([300, 310], [null, null]), null);
});

// Corner-vowel-ish F1/F2 pairs (adult Peterson-Barney-adjacent values),
// used only as synthetic-fixture ground truth for these tests — never
// surfaced as shipped coaching targets. Recovered at both 44.1k and 48k
// to confirm decimation makes the result sample-rate-independent, per
// estimateFormants's doc comment.
const CORNER_VOWEL_FIXTURES: readonly [string, number, number][] = [
  ["/i/-like", 270, 2290],
  ["/a/-like", 730, 1090],
  ["/u/-like", 300, 870],
];

for (const sampleRate of [44100, 48000]) {
  void test(`estimateFormants: recovers corner-vowel-like F1/F2 at ${sampleRate}Hz`, () => {
    for (const [label, f1Hz, f2Hz] of CORNER_VOWEL_FIXTURES) {
      const signal = synthesizeVowel(150, f1Hz, f2Hz, sampleRate, 0.5);
      const result = estimateFormants(signal, sampleRate);
      assert.ok(result !== null, `${label}: expected formants, got null`);
      assert.ok(
        Math.abs(result.f1Hz - f1Hz) < 40,
        `${label}: expected F1 ~${f1Hz}Hz, got ${result.f1Hz.toFixed(1)}`,
      );
      assert.ok(
        Math.abs(result.f2Hz - f2Hz) < 60,
        `${label}: expected F2 ~${f2Hz}Hz, got ${result.f2Hz.toFixed(1)}`,
      );
    }
  });
}

void test("estimateFormants: returns null for silence", () => {
  assert.equal(estimateFormants(new Float32Array(4096), 48000), null);
});

void test("estimateFormants: returns null for white noise (no real resonance, just LPC ripple)", () => {
  const samples = new Float32Array(4096);
  let seed = 42;
  for (let i = 0; i < samples.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    samples[i] = (seed / 0x7fffffff) * 2 - 1;
  }
  assert.equal(estimateFormants(samples, 48000), null);
});

void test("estimateFormants: returns null for a pure tone (one resonance, no meaningful F2)", () => {
  const samples = sineWave(440, 48000, 4096);
  assert.equal(estimateFormants(samples, 48000), null);
});

void test("estimateFormants: throws when the window is too short for lpcOrder after decimation", () => {
  assert.throws(() => estimateFormants(new Float32Array(20).fill(0.5), 48000));
});

void test("estimateFormants: rejects a too-short sample array", () => {
  assert.throws(() => estimateFormants(new Float32Array(1), 48000));
});

void test("estimateFormants: rejects invalid options", () => {
  const samples = synthesizeVowel(150, 730, 1090, 48000, 0.3);
  assert.throws(() => estimateFormants(samples, 0));
  assert.throws(() => estimateFormants(samples, 48000, { minFormantHz: 5000, maxFormantHz: 1000 }));
  assert.throws(() => estimateFormants(samples, 48000, { lpcOrder: 1 }));
  assert.throws(() => estimateFormants(samples, 48000, { lpcOrder: 1.5 }));
});
