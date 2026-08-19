// Pure step-sequencing/validity logic for the 6-step calibration
// protocol (docs/calibration.md). No DOM, no Web Audio, no Canvas —
// runs headlessly in Node, same charter as src/dsp. See CLAUDE.md.
//
// Registers steps 0, 1, 2, 4, and 5 only. Step 3 (corner-vowel
// formants) needs LPC-based formant extraction that doesn't exist yet
// and, per decisions.md's "Corrected" ledger entry on custom DSP
// needing an oracle, needs its own golden-file fixtures before it can
// land — a follow-up PR adds it and completes the sequence. This
// module never claims a calibration is complete on its own; callers
// check isComplete() before trusting buildDraft().
//
// May import from ../dsp (reusing its aggregation functions). Must
// not import ../audio, ../render, or ../store — enforced by
// eslint.config.mjs. Persistence (turning a CalibrationDraft into a
// stored Calibration, once step 3 exists) is a caller's job, not
// this module's.

import { medianOfFinite, estimateHabitualF0Hz, estimateComfortableF0Range } from "../dsp/index.ts";

export type NonFormantStepId = 0 | 1 | 2 | 4 | 5;

export const STEP_ORDER: readonly NonFormantStepId[] = [0, 1, 2, 4, 5];

export interface StepPrompt {
  id: NonFormantStepId;
  /** Shown to the user verbatim — calibration.md's "don't say
   * 'calibrating', say what it's for" applies to this copy. */
  prompt: string;
  durationMs: number;
}

export const STEP_PROMPTS: readonly StepPrompt[] = [
  { id: 0, prompt: "Stay quiet a moment while I listen to your room", durationMs: 3000 },
  { id: 1, prompt: "Say ahh, like at the doctor", durationMs: 5000 },
  { id: 2, prompt: "Count to five like you're reading out a phone number", durationMs: 5000 },
  { id: 4, prompt: "Say hiii like you're greeting a dog", durationMs: 2000 },
  { id: 5, prompt: "Hum a slide up, then down — stop wherever it stops feeling easy", durationMs: 8000 },
];

/** One tick's worth of already-computed features — the same shape
 * main.ts's tick() loop already produces for session logging (peak dB,
 * detected F0 or null). Collecting these is the caller's job; this
 * module only aggregates and validates. */
export interface StepReading {
  levelDb: number;
  f0Hz: number | null;
}

export interface ValidityCheck {
  id: string;
  /** Which step a failure should offer a one-tap redo for. */
  stepId: NonFormantStepId;
  passed: boolean;
  /** Human-readable, per calibration.md's "must say what went wrong". */
  message: string;
}

export interface ValidityReport {
  checks: ValidityCheck[];
  /** True only if every check passed. Consumers needing granular
   * Tier A/B/C gating (docs/strain.md) should read `checks` directly —
   * "degrade, do not block" per docs/calibration.md. */
  valid: boolean;
}

/** Everything this module can produce on its own — a Calibration
 * (src/store/calibration.ts) minus the fields step 3 owns
 * (`cornerVowels`) and the fields the store stamps at save time
 * (`schemaVersion`, `id`, `timestamp`). */
export interface CalibrationDraft {
  deviceId: string | null;
  noiseFloorDb: number | null;
  levelReferenceDb: number | null;
  habitualF0Hz: number | null;
  comfortableF0Range: [number, number] | null;
  validity: ValidityReport;
}

export class CalibrationEngineError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

// Validity thresholds, not coaching targets — same category as
// detectPitch's minFrequencyHz/clarityThreshold (CLAUDE.md's "no
// hardcoded frequency targets" rule applies to what the user is told
// to aim for, not to algorithm/QA bounds). [likely] — chosen without
// real device calibration data; revisit once some exists.
const NOISE_FLOOR_MAX_DB = -50;
const MIN_VOICED_RATIO = 0.5;
const MAX_F0_STDEV_HZ = 40;

function stdevOfFinite(values: readonly number[]): number | null {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length < 2) {
    return null; // stdev of 0-1 samples isn't a meaningful signal
  }
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  const variance = finite.reduce((sum, value) => sum + (value - mean) ** 2, 0) / finite.length;
  return Math.sqrt(variance);
}

function computeStepValidity(
  stepId: NonFormantStepId,
  readings: readonly StepReading[],
): ValidityCheck | null {
  switch (stepId) {
    case 0: {
      const noiseFloorDb = medianOfFinite(readings.map((r) => r.levelDb));
      const passed = noiseFloorDb !== null && noiseFloorDb <= NOISE_FLOOR_MAX_DB;
      return {
        id: "noise-floor",
        stepId,
        passed,
        message: passed
          ? "Room is quiet enough."
          : "It's noisy in here — find a quieter spot and redo this step.",
      };
    }
    case 1: {
      const voicedF0 = readings.map((r) => r.f0Hz).filter((f0): f0 is number => f0 !== null);
      const stdevHz = stdevOfFinite(voicedF0);
      const passed = stdevHz !== null && stdevHz <= MAX_F0_STDEV_HZ;
      return {
        id: "f0-variance",
        stepId,
        passed,
        message:
          stdevHz === null
            ? "Couldn't get enough pitch readings — try a steady \"ahh\" and redo this step."
            : passed
              ? "Pitch was steady."
              : "Pitch wasn't steady enough to read — try a smoother, sustained \"ahh\" and redo this step.",
      };
    }
    case 2: {
      const voicedCount = readings.filter((r) => r.f0Hz !== null).length;
      const ratio = readings.length === 0 ? 0 : voicedCount / readings.length;
      const passed = ratio >= MIN_VOICED_RATIO;
      return {
        id: "voiced-ratio",
        stepId,
        passed,
        message: passed
          ? "Got a clear pitch reading."
          : "Couldn't get a clear pitch reading — try speaking a little louder and redo this step.",
      };
    }
    default:
      return null; // steps 4 and 5 have no formant-independent check defined yet
  }
}

/**
 * Drives one run of steps 0/1/2/4/5. One instance per calibration
 * attempt — construct a fresh one for a redo-from-scratch rather than
 * reusing an instance across attempts.
 */
export class CalibrationEngine {
  readonly #deviceId: string | null;
  readonly #readingsByStep = new Map<NonFormantStepId, readonly StepReading[]>();
  #currentStep: NonFormantStepId | null = null;

  constructor(deviceId: string | null) {
    this.#deviceId = deviceId;
  }

  /** Marks `stepId` as in progress. The caller collects readings for
   * the step's duration (see STEP_PROMPTS), then calls submitStep(). */
  beginStep(stepId: NonFormantStepId): void {
    if (!STEP_ORDER.includes(stepId)) {
      throw new CalibrationEngineError(`Unknown calibration step ${String(stepId)}.`);
    }
    this.#currentStep = stepId;
  }

  /** Finalizes the step begun by the most recent beginStep() call and
   * returns its validity check (null for steps with no check defined).
   * Throws if called without a matching beginStep() first. */
  submitStep(readings: readonly StepReading[]): ValidityCheck | null {
    if (this.#currentStep === null) {
      throw new CalibrationEngineError("submitStep() called before beginStep().");
    }
    const stepId = this.#currentStep;
    this.#readingsByStep.set(stepId, readings);
    this.#currentStep = null;
    return computeStepValidity(stepId, readings);
  }

  /** Clears a previously-submitted step so it can be re-run — one-tap
   * redo per calibration.md's UI constraints. */
  redoStep(stepId: NonFormantStepId): void {
    this.#readingsByStep.delete(stepId);
  }

  isComplete(): boolean {
    return STEP_ORDER.every((id) => this.#readingsByStep.has(id));
  }

  /** Throws if isComplete() would return false — callers should check
   * first rather than rely on the throw for control flow. */
  buildDraft(): CalibrationDraft {
    if (!this.isComplete()) {
      throw new CalibrationEngineError("buildDraft() called before every step was submitted.");
    }

    const step0 = this.#readingsByStep.get(0) ?? [];
    const step1 = this.#readingsByStep.get(1) ?? [];
    const step2 = this.#readingsByStep.get(2) ?? [];
    const step4 = this.#readingsByStep.get(4) ?? [];
    const step5 = this.#readingsByStep.get(5) ?? [];

    const checks = [0, 1, 2]
      .map((stepId) => computeStepValidity(stepId as NonFormantStepId, this.#readingsByStep.get(stepId as NonFormantStepId) ?? []))
      .filter((check): check is ValidityCheck => check !== null);

    return {
      deviceId: this.#deviceId,
      noiseFloorDb: medianOfFinite(step0.map((r) => r.levelDb)),
      levelReferenceDb: medianOfFinite(step1.map((r) => r.levelDb)),
      habitualF0Hz: estimateHabitualF0Hz(step2.map((r) => r.f0Hz)),
      comfortableF0Range: estimateComfortableF0Range(
        step4.map((r) => r.f0Hz),
        step5.map((r) => r.f0Hz),
      ),
      validity: { checks, valid: checks.every((check) => check.passed) },
    };
  }
}
