import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLogFrequencyBins } from "./index.ts";

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
