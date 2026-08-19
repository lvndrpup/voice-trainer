import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CalibrationEngine,
  CalibrationEngineError,
  STEP_ORDER,
  STEP_PROMPTS,
  type StepReading,
  type NonFormantStepId,
} from "./index.ts";

function readings(f0Values: readonly (number | null)[], levelDb = -20): StepReading[] {
  return f0Values.map((f0Hz) => ({ levelDb, f0Hz }));
}

/** Submits every step with plausible, validity-passing readings, so
 * tests that only care about one step's behavior don't have to repeat
 * the whole sequence. */
function completeAllSteps(engine: CalibrationEngine, overrides: Partial<Record<NonFormantStepId, StepReading[]>> = {}): void {
  const defaults: Record<NonFormantStepId, StepReading[]> = {
    0: readings([null, null, null], -60),
    1: readings([200, 201, 199, 200], -20),
    2: readings([150, 152, null, 148, 151], -20),
    4: readings([300, 305], -20),
    5: readings([150, 200, 320, 180], -20),
  };
  for (const stepId of STEP_ORDER) {
    engine.beginStep(stepId);
    engine.submitStep(overrides[stepId] ?? defaults[stepId]);
  }
}

void test("STEP_ORDER and STEP_PROMPTS: cover exactly steps 0, 1, 2, 4, 5", () => {
  assert.deepEqual(STEP_ORDER, [0, 1, 2, 4, 5]);
  assert.deepEqual(
    STEP_PROMPTS.map((p) => p.id),
    [0, 1, 2, 4, 5],
  );
});

void test("CalibrationEngine: submitStep before beginStep throws", () => {
  const engine = new CalibrationEngine(null);
  assert.throws(() => engine.submitStep([]), CalibrationEngineError);
});

void test("CalibrationEngine: beginStep rejects an unknown step id", () => {
  const engine = new CalibrationEngine(null);
  assert.throws(
    () => {
      engine.beginStep(3 as unknown as NonFormantStepId); // step 3 doesn't exist yet — see module header
    },
    CalibrationEngineError,
  );
});

void test("CalibrationEngine: isComplete is false until every step is submitted, true after", () => {
  const engine = new CalibrationEngine(null);
  assert.equal(engine.isComplete(), false);
  for (const stepId of STEP_ORDER.slice(0, -1)) {
    engine.beginStep(stepId);
    engine.submitStep(readings([200]));
  }
  assert.equal(engine.isComplete(), false);
  const lastStep = STEP_ORDER[STEP_ORDER.length - 1];
  engine.beginStep(lastStep);
  engine.submitStep(readings([200]));
  assert.equal(engine.isComplete(), true);
});

void test("CalibrationEngine: buildDraft throws before every step is submitted", () => {
  const engine = new CalibrationEngine(null);
  assert.throws(() => engine.buildDraft(), CalibrationEngineError);
});

void test("CalibrationEngine: redoStep clears a step's result, making the engine incomplete again", () => {
  const engine = new CalibrationEngine(null);
  completeAllSteps(engine);
  assert.equal(engine.isComplete(), true);
  engine.redoStep(2);
  assert.equal(engine.isComplete(), false);
  engine.beginStep(2);
  engine.submitStep(readings([150, 151]));
  assert.equal(engine.isComplete(), true);
});

void test("CalibrationEngine: submitStep returns null for steps 4 and 5 (no check defined yet)", () => {
  const engine = new CalibrationEngine(null);
  engine.beginStep(4);
  assert.equal(engine.submitStep(readings([300])), null);
  engine.beginStep(5);
  assert.equal(engine.submitStep(readings([200])), null);
});

void test("CalibrationEngine: buildDraft aggregates each field from the right step", () => {
  const engine = new CalibrationEngine("device-abc");
  completeAllSteps(engine, {
    0: readings([null, null], -60),
    1: readings([200, 202, 198], -18),
    2: readings([148, null, 152, 150], -20),
    4: readings([300, 310], -20),
    5: readings([150, 200, 320, 180], -20),
  });
  const draft = engine.buildDraft();
  assert.equal(draft.deviceId, "device-abc");
  assert.equal(draft.noiseFloorDb, -60);
  assert.equal(draft.levelReferenceDb, -18);
  assert.equal(draft.habitualF0Hz, 150);
  assert.deepEqual(draft.comfortableF0Range, [150, 320]);
});

void test("CalibrationEngine: noise-floor check fails when step 0's level is above threshold", () => {
  const engine = new CalibrationEngine(null);
  engine.beginStep(0);
  const check = engine.submitStep(readings([null, null], -30)); // loud room
  assert.ok(check);
  assert.equal(check.id, "noise-floor");
  assert.equal(check.passed, false);
});

void test("CalibrationEngine: noise-floor check passes when step 0's level is below threshold", () => {
  const engine = new CalibrationEngine(null);
  engine.beginStep(0);
  const check = engine.submitStep(readings([null, null], -70)); // quiet room
  assert.ok(check);
  assert.equal(check.passed, true);
});

void test("CalibrationEngine: f0-variance check fails on an erratic pitch trace", () => {
  const engine = new CalibrationEngine(null);
  engine.beginStep(1);
  const check = engine.submitStep(readings([150, 400, 90, 500, 120], -20));
  assert.ok(check);
  assert.equal(check.id, "f0-variance");
  assert.equal(check.passed, false);
});

void test("CalibrationEngine: f0-variance check passes on a steady pitch trace", () => {
  const engine = new CalibrationEngine(null);
  engine.beginStep(1);
  const check = engine.submitStep(readings([200, 201, 199, 200, 202], -20));
  assert.ok(check);
  assert.equal(check.passed, true);
});

void test("CalibrationEngine: voiced-ratio check fails when most step-2 readings are unvoiced", () => {
  const engine = new CalibrationEngine(null);
  engine.beginStep(2);
  const check = engine.submitStep(readings([null, null, null, 150], -20));
  assert.ok(check);
  assert.equal(check.id, "voiced-ratio");
  assert.equal(check.passed, false);
});

void test("CalibrationEngine: buildDraft's validity.valid is false if any of steps 0/1/2 failed", () => {
  const engine = new CalibrationEngine(null);
  completeAllSteps(engine, { 0: readings([null, null], -30) }); // loud room -> fails
  const draft = engine.buildDraft();
  assert.equal(draft.validity.valid, false);
  assert.equal(
    draft.validity.checks.some((c) => c.id === "noise-floor" && !c.passed),
    true,
  );
});
