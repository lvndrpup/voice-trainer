import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CalibrationEngine,
  CalibrationEngineError,
  STEP_ORDER,
  STEP_PROMPTS,
  type StepReading,
  type FormantStepReading,
  type NonFormantStepId,
  type CornerVowelStepId,
  type StepId,
} from "./index.ts";
import type { Formants } from "../dsp/index.ts";

function readings(f0Values: readonly (number | null)[], levelDb = -20): StepReading[] {
  return f0Values.map((f0Hz) => ({ levelDb, f0Hz }));
}

function formantReadings(
  formants: readonly (Formants | null)[],
  levelDb = -20,
): FormantStepReading[] {
  return formants.map((f) => ({ levelDb, formants: f }));
}

const PLAUSIBLE_FORMANTS: Formants = { f1Hz: 300, f2Hz: 2000 };

/** Submits every step with plausible, validity-passing readings, so
 * tests that only care about one step's behavior don't have to repeat
 * the whole sequence. */
function completeAllSteps(
  engine: CalibrationEngine,
  overrides: Partial<Record<NonFormantStepId, StepReading[]>> = {},
  cornerOverrides: Partial<Record<CornerVowelStepId, FormantStepReading[]>> = {},
): void {
  const defaults: Record<NonFormantStepId, StepReading[]> = {
    0: readings([null, null, null], -60),
    1: readings([200, 201, 199, 200], -20),
    2: readings([150, 152, null, 148, 151], -20),
    4: readings([300, 305], -20),
    5: readings([150, 200, 320, 180], -20),
  };
  const cornerDefaults: Record<CornerVowelStepId, FormantStepReading[]> = {
    "corner-i": formantReadings([PLAUSIBLE_FORMANTS, PLAUSIBLE_FORMANTS]),
    "corner-a": formantReadings([PLAUSIBLE_FORMANTS, PLAUSIBLE_FORMANTS]),
    "corner-u": formantReadings([PLAUSIBLE_FORMANTS, PLAUSIBLE_FORMANTS]),
  };
  for (const stepId of STEP_ORDER) {
    engine.beginStep(stepId);
    if (typeof stepId === "number") {
      engine.submitStep(overrides[stepId] ?? defaults[stepId]);
    } else {
      engine.submitStep(cornerOverrides[stepId] ?? cornerDefaults[stepId]);
    }
  }
}

void test("STEP_PROMPTS: covers all 8 engine steps, corner vowels between steps 2 and 4, in that order", () => {
  // STEP_ORDER is derived from STEP_PROMPTS, so this is the one place
  // that needs to check the actual content — STEP_ORDER can't drift
  // from it independently.
  assert.deepEqual(
    STEP_PROMPTS.map((p) => p.id),
    [0, 1, 2, "corner-i", "corner-a", "corner-u", 4, 5],
  );
  assert.deepEqual(STEP_ORDER, STEP_PROMPTS.map((p) => p.id));
});

void test("CalibrationEngine: submitStep before beginStep throws", () => {
  const engine = new CalibrationEngine(null);
  assert.throws(() => engine.submitStep([]), CalibrationEngineError);
});

void test("CalibrationEngine: beginStep while another step is already in progress throws", () => {
  const engine = new CalibrationEngine(null);
  engine.beginStep(0);
  assert.throws(() => {
    engine.beginStep(1);
  }, CalibrationEngineError);
  // the original in-progress step is unaffected — still submittable
  const check = engine.submitStep(readings([null, null], -70));
  assert.equal(check?.id, "noise-floor");
});

void test("CalibrationEngine: beginStep rejects an unknown step id", () => {
  const engine = new CalibrationEngine(null);
  assert.throws(
    () => {
      // Numeric 3 was never a valid id — corner vowels use string ids
      // (corner-i/corner-a/corner-u), not a numeric step 3.
      engine.beginStep(3 as unknown as StepId);
    },
    CalibrationEngineError,
  );
});

void test("CalibrationEngine: isComplete is false until every step is submitted, true after", () => {
  const engine = new CalibrationEngine(null);
  assert.equal(engine.isComplete(), false);
  for (const stepId of STEP_ORDER.slice(0, -1)) {
    engine.beginStep(stepId);
    if (typeof stepId === "number") {
      engine.submitStep(readings([200]));
    } else {
      engine.submitStep(formantReadings([PLAUSIBLE_FORMANTS]));
    }
  }
  assert.equal(engine.isComplete(), false);
  const lastStep = STEP_ORDER[STEP_ORDER.length - 1];
  engine.beginStep(lastStep);
  if (typeof lastStep === "number") {
    engine.submitStep(readings([200]));
  } else {
    engine.submitStep(formantReadings([PLAUSIBLE_FORMANTS]));
  }
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
  completeAllSteps(
    engine,
    {
      0: readings([null, null], -60),
      1: readings([200, 202, 198], -18),
      2: readings([148, null, 152, 150], -20),
      4: readings([300, 310], -20),
      5: readings([150, 200, 320, 180], -20),
    },
    {
      "corner-i": formantReadings([{ f1Hz: 270, f2Hz: 2290 }, { f1Hz: 280, f2Hz: 2270 }]),
      "corner-a": formantReadings([{ f1Hz: 730, f2Hz: 1090 }]),
      "corner-u": formantReadings([{ f1Hz: 300, f2Hz: 870 }, null, { f1Hz: 310, f2Hz: 850 }]),
    },
  );
  const draft = engine.buildDraft();
  assert.equal(draft.deviceId, "device-abc");
  assert.equal(draft.noiseFloorDb, -60);
  assert.equal(draft.levelReferenceDb, -18);
  assert.equal(draft.habitualF0Hz, 150);
  assert.deepEqual(draft.comfortableF0Range, [150, 320]);
  assert.deepEqual(draft.cornerVowels, {
    i: { f1Hz: 275, f2Hz: 2280 },
    a: { f1Hz: 730, f2Hz: 1090 },
    u: { f1Hz: 305, f2Hz: 860 },
  });
});

void test("CalibrationEngine: buildDraft's cornerVowels is null if any vowel never produced formants", () => {
  const engine = new CalibrationEngine(null);
  completeAllSteps(engine, {}, {
    "corner-i": formantReadings([null, null]), // no confident formant reading at all
  });
  const draft = engine.buildDraft();
  assert.equal(draft.cornerVowels, null);
});

void test("CalibrationEngine: corner-vowel validity check fails when most readings have no formants", () => {
  const engine = new CalibrationEngine(null);
  engine.beginStep("corner-i");
  const check = engine.submitStep(
    formantReadings([null, null, null, PLAUSIBLE_FORMANTS]),
  );
  assert.ok(check);
  assert.equal(check.id, "corner-vowel-i");
  assert.equal(check.passed, false);
});

void test("CalibrationEngine: corner-vowel validity check passes when most readings have formants", () => {
  const engine = new CalibrationEngine(null);
  engine.beginStep("corner-a");
  const check = engine.submitStep(
    formantReadings([PLAUSIBLE_FORMANTS, PLAUSIBLE_FORMANTS, null]),
  );
  assert.ok(check);
  assert.equal(check.id, "corner-vowel-a");
  assert.equal(check.passed, true);
});

void test("CalibrationEngine: redoStep on one corner-vowel step doesn't affect the other two", () => {
  const engine = new CalibrationEngine(null);
  completeAllSteps(engine);
  assert.equal(engine.isComplete(), true);
  engine.redoStep("corner-u");
  assert.equal(engine.isComplete(), false);
  assert.notEqual(engine.getStepReadings("corner-i"), null);
  assert.notEqual(engine.getStepReadings("corner-a"), null);
  assert.equal(engine.getStepReadings("corner-u"), null);
  engine.beginStep("corner-u");
  engine.submitStep(formantReadings([PLAUSIBLE_FORMANTS, PLAUSIBLE_FORMANTS]));
  assert.equal(engine.isComplete(), true);
});

void test("CalibrationEngine: submitStep throws on StepReading submitted for a corner-vowel step", () => {
  // Regression test: without the shape guard, StepReading's f0Hz field
  // is absent from FormantStepReading, so a corner-vowel step's check
  // read `reading.formants` (undefined) and compared `undefined !== null`
  // (true) — every wrong-shaped reading silently counted as "voiced,"
  // reporting a false-positive pass instead of failing loudly here.
  const engine = new CalibrationEngine(null);
  engine.beginStep("corner-i");
  assert.throws(() => {
    engine.submitStep(readings([200, 201]));
  }, CalibrationEngineError);
});

void test("CalibrationEngine: submitStep throws on FormantStepReading submitted for a non-formant step", () => {
  const engine = new CalibrationEngine(null);
  engine.beginStep(2);
  assert.throws(() => {
    engine.submitStep(formantReadings([PLAUSIBLE_FORMANTS]));
  }, CalibrationEngineError);
});

void test("CalibrationEngine: noise-floor check fails when step 0's level is above threshold", () => {
  const engine = new CalibrationEngine(null);
  engine.beginStep(0);
  const check = engine.submitStep(readings([null, null], -30)); // loud room
  assert.ok(check);
  assert.equal(check.id, "noise-floor");
  assert.equal(check.passed, false);
});

void test("CalibrationEngine: noise-floor check reports a distinct message when there's no level reading at all, not 'noisy'", () => {
  const engine = new CalibrationEngine(null);
  engine.beginStep(0);
  const check = engine.submitStep([]); // no readings collected at all
  assert.ok(check);
  assert.equal(check.id, "noise-floor");
  assert.equal(check.passed, false);
  assert.match(check.message, /couldn't get a level reading/i);
  assert.doesNotMatch(check.message, /noisy/i);
});

void test("CalibrationEngine: getStepReadings returns raw readings for a submitted step, null otherwise", () => {
  const engine = new CalibrationEngine(null);
  assert.equal(engine.getStepReadings(0), null);
  engine.beginStep(0);
  const submitted = readings([null, null], -70);
  engine.submitStep(submitted);
  assert.deepEqual(engine.getStepReadings(0), submitted);
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

void test("CalibrationEngine: buildDraft's validity.valid is also false if a corner-vowel step failed", () => {
  const engine = new CalibrationEngine(null);
  completeAllSteps(engine, {}, { "corner-a": formantReadings([null, null, null]) });
  const draft = engine.buildDraft();
  assert.equal(draft.validity.valid, false);
  assert.equal(
    draft.validity.checks.some((c) => c.id === "corner-vowel-a" && !c.passed),
    true,
  );
});
