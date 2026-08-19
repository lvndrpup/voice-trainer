import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeLogFrequencyBins,
  detectPitch,
  medianOfFinite,
  estimateHabitualF0Hz,
  estimateComfortableF0Range,
} from "./index.ts";

function sineWave(frequencyHz: number, sampleRate: number, length: number): Float32Array {
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    samples[i] = Math.sin((2 * Math.PI * frequencyHz * i) / sampleRate);
  }
  return samples;
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
