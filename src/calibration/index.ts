// Pure step-sequencing/validity logic for the 6-step calibration
// protocol (docs/calibration.md). No DOM, no Web Audio, no Canvas —
// runs headlessly in Node, same charter as src/dsp. See CLAUDE.md.
//
// Registers all 6 protocol steps. Step 3 (corner-vowel formants) is
// implemented as three sequential engine steps — corner-i/corner-a/
// corner-u — one per vowel, each independently redo-able, rather than
// one step covering all three; see docs/calibration.md's
// implementation note. Uses estimateFormants (src/dsp) via the
// FormantStepReading the caller submits, the same way steps 0/1/2/4/5
// already receive pre-computed levelDb/f0Hz rather than raw audio —
// this module aggregates and validates, it doesn't run DSP on raw
// samples itself.
//
// May import from ../dsp (reusing its aggregation functions and the
// Formants type). Must not import ../audio, ../render, or ../store —
// enforced by eslint.config.mjs. Persistence (turning a
// CalibrationDraft into a stored Calibration) is a caller's job, not
// this module's.

import {
  medianOfFinite,
  estimateHabitualF0Hz,
  estimateComfortableF0Range,
  type Formants,
} from "../dsp/index.ts";

export type NonFormantStepId = 0 | 1 | 2 | 4 | 5;
export type CornerVowel = "i" | "a" | "u";
export type CornerVowelStepId = `corner-${CornerVowel}`;
export type StepId = NonFormantStepId | CornerVowelStepId;

function isCornerVowelStepId(id: StepId): id is CornerVowelStepId {
  return typeof id === "string";
}

function cornerVowelOf(id: CornerVowelStepId): CornerVowel {
  return id.slice("corner-".length) as CornerVowel;
}

export interface StepPrompt {
  id: StepId;
  /** Shown to the user verbatim — calibration.md's "don't say
   * 'calibrating', say what it's for" applies to this copy. */
  prompt: string;
  durationMs: number;
}

/** The canonical step list — order and membership. STEP_ORDER is
 * derived from this rather than hand-duplicated, so the two can't
 * drift out of sync with each other. The corner-vowel prompts sit
 * between steps 2 and 4, matching calibration.md's protocol table. */
export const STEP_PROMPTS: readonly StepPrompt[] = [
  { id: 0, prompt: "Stay quiet a moment while I listen to your room", durationMs: 3000 },
  { id: 1, prompt: "Say ahh, like at the doctor", durationMs: 5000 },
  { id: 2, prompt: "Count to five like you're reading out a phone number", durationMs: 5000 },
  { id: "corner-i", prompt: "Say eee, like in \"see\"", durationMs: 2000 },
  { id: "corner-a", prompt: "Say ahh, quick this time", durationMs: 2000 },
  { id: "corner-u", prompt: "Say ooo, like you're impressed", durationMs: 2000 },
  { id: 4, prompt: "Say hiii like you're greeting a dog", durationMs: 2000 },
  { id: 5, prompt: "Hum a slide up, then down — stop wherever it stops feeling easy", durationMs: 8000 },
];

export const STEP_ORDER: readonly StepId[] = STEP_PROMPTS.map((p) => p.id);

/** One tick's worth of already-computed features for steps 0/1/2/4/5 —
 * the same shape main.ts's tick() loop already produces for session
 * logging (peak dB, detected F0 or null). Collecting these is the
 * caller's job; this module only aggregates and validates. Unchanged
 * by the addition of corner-vowel steps — see FormantStepReading for
 * their parallel, separate shape. */
export interface StepReading {
  levelDb: number;
  f0Hz: number | null;
}

/** One tick's worth of already-computed features for a corner-vowel
 * step (corner-i/corner-a/corner-u) — mirrors StepReading's role, but
 * carries a formant estimate (src/dsp's estimateFormants output)
 * instead of an F0 reading. A separate type rather than widening
 * StepReading, so the existing five steps' reading shape doesn't
 * change. */
export interface FormantStepReading {
  levelDb: number;
  formants: Formants | null;
}

export interface ValidityCheck {
  id: string;
  /** Which step a failure should offer a one-tap redo for. */
  stepId: StepId;
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

/** Mirrors src/store/calibration.ts's CornerVowelFormants — declared
 * separately rather than imported, since src/calibration may not
 * import ../store (same one-way-boundary precedent as src/dsp's own
 * Formants vs. store's copy, see decisions.md). */
export interface CornerVowelFormants {
  i: Formants;
  a: Formants;
  u: Formants;
}

/** Everything this module can produce on its own — a Calibration
 * (src/store/calibration.ts) minus the fields the store stamps at
 * save time (`schemaVersion`, `id`, `timestamp`). */
export interface CalibrationDraft {
  deviceId: string | null;
  noiseFloorDb: number | null;
  levelReferenceDb: number | null;
  habitualF0Hz: number | null;
  comfortableF0Range: [number, number] | null;
  cornerVowels: CornerVowelFormants | null;
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

/**
 * Corner-vowel validity check: at least MIN_VOICED_RATIO of the
 * step's readings produced a formant estimate — the same "did we get
 * a usable signal" shape as step 2's voiced-ratio check, reusing the
 * same threshold. Deliberately does NOT check the resulting F1/F2
 * *values* against any expected per-vowel range: CLAUDE.md forbids
 * hardcoded frequency/formant targets in src/ outright, and
 * estimateFormants already bounds its own output to a broad
 * physiologically-plausible range (minFormantHz/maxFormantHz) before
 * this check ever sees it — an out-of-range or unresolved formant
 * already shows up as `null`, not as a value this check would need to
 * separately reject. This is calibration.md's "formants outside
 * physiological bounds" check, implemented at the DSP layer rather
 * than duplicated here with vowel-specific numbers.
 */
function computeCornerVowelValidity(
  stepId: CornerVowelStepId,
  readings: readonly FormantStepReading[],
): ValidityCheck {
  // != null (not !==) deliberately treats `formants: undefined` the
  // same as `formants: null` — submitStep's shape guard only checks
  // that the `formants` key exists, not that its value is well-typed,
  // so a malformed-but-present value shouldn't count as "voiced" here.
  const voicedCount = readings.filter((r) => r.formants != null).length;
  const ratio = readings.length === 0 ? 0 : voicedCount / readings.length;
  const passed = ratio >= MIN_VOICED_RATIO;
  return {
    id: `corner-vowel-${cornerVowelOf(stepId)}`,
    stepId,
    passed,
    message: passed
      ? "Got a clear formant reading."
      : "Couldn't get a clear formant reading — try that vowel again, a little clearer, and redo this step.",
  };
}

function computeStepValidity(
  stepId: StepId,
  readings: readonly (StepReading | FormantStepReading)[],
): ValidityCheck | null {
  if (isCornerVowelStepId(stepId)) {
    return computeCornerVowelValidity(stepId, readings as readonly FormantStepReading[]);
  }
  const pitchReadings = readings as readonly StepReading[];
  switch (stepId) {
    case 0: {
      const noiseFloorDb = medianOfFinite(pitchReadings.map((r) => r.levelDb));
      const passed = noiseFloorDb !== null && noiseFloorDb <= NOISE_FLOOR_MAX_DB;
      return {
        id: "noise-floor",
        stepId,
        passed,
        message:
          noiseFloorDb === null
            ? "Couldn't get a level reading — check your mic and redo this step."
            : passed
              ? "Room is quiet enough."
              : "It's noisy in here — find a quieter spot and redo this step.",
      };
    }
    case 1: {
      const voicedF0 = pitchReadings.map((r) => r.f0Hz).filter((f0): f0 is number => f0 !== null);
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
      const voicedCount = pitchReadings.filter((r) => r.f0Hz !== null).length;
      const ratio = pitchReadings.length === 0 ? 0 : voicedCount / pitchReadings.length;
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

/** Medians each of a vowel's formant readings independently (same
 * "median, not mean" robustness rationale as medianOfFinite/
 * estimateHabitualF0Hz), producing one Formants estimate for the
 * step. Null if no reading in the window produced formants at all. */
function aggregateFormants(readings: readonly FormantStepReading[]): Formants | null {
  // != null, same reasoning as computeCornerVowelValidity above.
  const voiced = readings.map((r) => r.formants).filter((f): f is Formants => f != null);
  const f1Hz = medianOfFinite(voiced.map((f) => f.f1Hz));
  const f2Hz = medianOfFinite(voiced.map((f) => f.f2Hz));
  return f1Hz === null || f2Hz === null ? null : { f1Hz, f2Hz };
}

/**
 * Drives one run of the full 6-step protocol (8 engine steps, with
 * step 3 split into corner-i/corner-a/corner-u). One instance per
 * calibration attempt — construct a fresh one for a redo-from-scratch
 * rather than reusing an instance across attempts.
 */
export class CalibrationEngine {
  readonly #deviceId: string | null;
  readonly #readingsByStep = new Map<StepId, readonly (StepReading | FormantStepReading)[]>();
  #currentStep: StepId | null = null;

  constructor(deviceId: string | null) {
    this.#deviceId = deviceId;
  }

  /** Marks `stepId` as in progress. The caller collects readings for
   * the step's duration (see STEP_PROMPTS), then calls submitStep().
   * Does not enforce STEP_ORDER's sequence — any not-yet-in-progress
   * step may begin at any time; only one step may be in progress at
   * once. */
  beginStep(stepId: StepId): void {
    if (!STEP_ORDER.includes(stepId)) {
      throw new CalibrationEngineError(`Unknown calibration step ${String(stepId)}.`);
    }
    if (this.#currentStep !== null) {
      throw new CalibrationEngineError(
        `beginStep(${String(stepId)}) called while step ${String(this.#currentStep)} is still in progress — call submitStep() first.`,
      );
    }
    this.#currentStep = stepId;
  }

  /** Finalizes the step begun by the most recent beginStep() call and
   * returns its validity check (null for steps with no check
   * defined). Throws if called without a matching beginStep() first,
   * or if `readings`' shape doesn't match the step just begun (pass
   * StepReading[] for steps 0/1/2/4/5, FormantStepReading[] for
   * corner-i/corner-a/corner-u) — checked explicitly rather than
   * trusted, since a mismatch would otherwise fail silently: the two
   * shapes don't share a field name, so `formants !== null` on a
   * StepReading array is `undefined !== null`, which is `true` —
   * every reading would count as "voiced" and the mistake would only
   * surface later, as an unrelated-looking crash in buildDraft(). */
  submitStep(readings: readonly StepReading[] | readonly FormantStepReading[]): ValidityCheck | null {
    if (this.#currentStep === null) {
      throw new CalibrationEngineError("submitStep() called before beginStep().");
    }
    const stepId = this.#currentStep;
    const expectFormants = isCornerVowelStepId(stepId);
    for (const reading of readings) {
      if (("formants" in reading) !== expectFormants) {
        throw new CalibrationEngineError(
          `submitStep(${String(stepId)}) received ${expectFormants ? "StepReading" : "FormantStepReading"}-shaped readings; ` +
            `this step expects ${expectFormants ? "FormantStepReading" : "StepReading"}.`,
        );
      }
    }
    this.#readingsByStep.set(stepId, readings);
    this.#currentStep = null;
    return computeStepValidity(stepId, readings);
  }

  /** Clears a previously-submitted step so it can be re-run — one-tap
   * redo per calibration.md's UI constraints. Corner-vowel steps redo
   * independently of each other and of the other four steps: a bad
   * /i/ doesn't require redoing /a/ or /u/. */
  redoStep(stepId: StepId): void {
    this.#readingsByStep.delete(stepId);
  }

  isComplete(): boolean {
    return STEP_ORDER.every((id) => this.#readingsByStep.has(id));
  }

  /** Raw readings for a submitted step, for callers that want to
   * persist them alongside the summary draft — calibration.md asks to
   * "store the raw feature frames too... so old calibrations can be
   * recomputed when the formant code changes." Null if `stepId` hasn't
   * been submitted yet. */
  getStepReadings(stepId: NonFormantStepId): readonly StepReading[] | null;
  getStepReadings(stepId: CornerVowelStepId): readonly FormantStepReading[] | null;
  getStepReadings(stepId: StepId): readonly (StepReading | FormantStepReading)[] | null {
    return this.#readingsByStep.get(stepId) ?? null;
  }

  /** Throws if isComplete() would return false — callers should check
   * first rather than rely on the throw for control flow. */
  buildDraft(): CalibrationDraft {
    if (!this.isComplete()) {
      throw new CalibrationEngineError("buildDraft() called before every step was submitted.");
    }

    const step0 = (this.#readingsByStep.get(0) ?? []) as readonly StepReading[];
    const step1 = (this.#readingsByStep.get(1) ?? []) as readonly StepReading[];
    const step2 = (this.#readingsByStep.get(2) ?? []) as readonly StepReading[];
    const step4 = (this.#readingsByStep.get(4) ?? []) as readonly StepReading[];
    const step5 = (this.#readingsByStep.get(5) ?? []) as readonly StepReading[];
    const cornerI = (this.#readingsByStep.get("corner-i") ?? []) as readonly FormantStepReading[];
    const cornerA = (this.#readingsByStep.get("corner-a") ?? []) as readonly FormantStepReading[];
    const cornerU = (this.#readingsByStep.get("corner-u") ?? []) as readonly FormantStepReading[];

    const iFormants = aggregateFormants(cornerI);
    const aFormants = aggregateFormants(cornerA);
    const uFormants = aggregateFormants(cornerU);
    const cornerVowels: CornerVowelFormants | null =
      iFormants !== null && aFormants !== null && uFormants !== null
        ? { i: iFormants, a: aFormants, u: uFormants }
        : null;

    const checksToRun: readonly StepId[] = [0, 1, 2, "corner-i", "corner-a", "corner-u"];
    const checks = checksToRun
      .map((stepId) => computeStepValidity(stepId, this.#readingsByStep.get(stepId) ?? []))
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
      cornerVowels,
      validity: { checks, valid: checks.every((check) => check.passed) },
    };
  }
}
