// Calibration wizard: DOM wiring for the 6-step protocol (8 engine
// steps — see src/calibration). Sibling to main.ts, not a growth of
// it (see docs/decisions.md) — main.ts imports initCalibrationWizard()
// and calls it once at startup, passing a callback that fires when the
// wizard's active/inactive state changes, so main.ts can disable its
// own #mic-toggle while the wizard holds the microphone (and vice
// versa, via the WizardController it gets back — see main.ts). Two-way
// wiring between two top-level files, not a natural fit for either
// module's own "one file, one job" scope, but there's no home for it
// under src/calibration (must stay headless) or src/audio (Web Audio
// only) either — main.ts/wizard.ts are where composition lives.
//
// This module owns DOM + MicrophoneCapture + timing; it does not
// reimplement anything src/calibration or src/dsp already do — it
// only calls beginStep/submitStep/redoStep/buildDraft and
// estimateFormants/detectPitch (via tick-features) and reports what
// they return.

import { MicrophoneCapture } from "./audio";
import { estimateFormants, type Formants } from "./dsp";
import { readTickFeatures } from "./tick-features";
import { requireElement } from "./dom";
import { describeCaptureError } from "./describe-capture-error";
import {
  CalibrationEngine,
  STEP_ORDER,
  STEP_PROMPTS,
  isCornerVowelStepId,
  type StepId,
  type StepReading,
  type FormantStepReading,
  type ValidityCheck,
  type CalibrationDraft,
} from "./calibration";
import { CalibrationStore } from "./store/calibration";

// Reading-collection cadence during a step, independent of main.ts's
// ~60Hz tick() and matching the same ~10Hz convention session logging
// already uses (docs/session-store.md) — an explicit choice, not
// inherited by copy-paste. At this rate even the shortest steps
// (corner-vowel/greeting, 2000ms) collect ~20 readings, comfortably
// enough for MIN_VOICED_RATIO (0.5, src/calibration) to mean anything.
const READING_INTERVAL_MS = 100;

export interface WizardController {
  /** main.ts calls this whenever the instrument's own active state
   * changes, so the wizard can disable its start button while the
   * instrument holds the microphone. */
  setInstrumentActive(active: boolean): void;
}

function stepPromptText(id: StepId): string {
  return STEP_PROMPTS.find((p) => p.id === id)?.prompt ?? "";
}

function stepDurationMs(id: StepId): number {
  return STEP_PROMPTS.find((p) => p.id === id)?.durationMs ?? 0;
}

class WizardCancelledError extends Error {}

interface StepCollection {
  pitchReadings: StepReading[];
  formantReadings: FormantStepReading[];
}

/** Runs one step's timed reading-collection window, wall-clock timed
 * (setInterval/setTimeout, not requestAnimationFrame) so a backgrounded
 * tab's rAF throttling can't silently stretch or shrink a step's real
 * duration. Aborts cleanly via `signal` if the wizard is cancelled
 * mid-step. */
function collectStepReadings(
  capture: MicrophoneCapture,
  stepId: StepId,
  durationMs: number,
  signal: AbortSignal,
): Promise<StepCollection> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new WizardCancelledError());
      return;
    }
    const formant = isCornerVowelStepId(stepId);
    const pitchReadings: StepReading[] = [];
    const formantReadings: FormantStepReading[] = [];

    const collect = (): void => {
      if (capture.state !== "active") {
        return;
      }
      const spectrum = capture.getSpectrum();
      const waveform = capture.getWaveform();
      const info = capture.info;
      if (!info) {
        return;
      }
      if (formant) {
        // estimateFormants throws on non-finite/malformed input rather
        // than always returning null — one bad tick shouldn't kill the
        // whole step's collection loop.
        let formants: Formants | null;
        try {
          formants = estimateFormants(waveform, info.sampleRate);
        } catch {
          formants = null;
        }
        const { peakDb } = readTickFeatures(spectrum, null, null);
        formantReadings.push({ levelDb: peakDb, formants });
      } else {
        const { peakDb, f0Hz } = readTickFeatures(spectrum, waveform, info.sampleRate);
        pitchReadings.push({ levelDb: peakDb, f0Hz });
      }
    };

    const intervalHandle = setInterval(collect, READING_INTERVAL_MS);
    const onAbort = (): void => {
      clearInterval(intervalHandle);
      clearTimeout(timeoutHandle);
      reject(new WizardCancelledError());
    };
    const timeoutHandle = setTimeout(() => {
      clearInterval(intervalHandle);
      signal.removeEventListener("abort", onAbort);
      resolve({ pitchReadings, formantReadings });
    }, durationMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function initCalibrationWizard(
  onActiveChange: (active: boolean) => void,
): WizardController {
  const startButton = requireElement<HTMLButtonElement>("#wizard-start");
  const panel = requireElement<HTMLDivElement>("#wizard-panel");
  const progressEl = requireElement<HTMLParagraphElement>("#wizard-progress");
  const promptEl = requireElement<HTMLParagraphElement>("#wizard-prompt");
  const validityEl = requireElement<HTMLParagraphElement>("#wizard-validity");
  const redoButton = requireElement<HTMLButtonElement>("#wizard-redo");
  const nextButton = requireElement<HTMLButtonElement>("#wizard-next");
  const cancelButton = requireElement<HTMLButtonElement>("#wizard-cancel");
  const statusEl = requireElement<HTMLParagraphElement>("#wizard-status");

  const capture = new MicrophoneCapture();
  const calibrationStore = new CalibrationStore();

  let instrumentActive = false;
  let abortController: AbortController | null = null;
  let pendingAction: ((action: "next" | "redo") => void) | null = null;

  function waitForUserAction(signal: AbortSignal): Promise<"next" | "redo"> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new WizardCancelledError());
        return;
      }
      const onAbort = (): void => {
        pendingAction = null;
        reject(new WizardCancelledError());
      };
      pendingAction = (action) => {
        signal.removeEventListener("abort", onAbort);
        pendingAction = null;
        resolve(action);
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  function showValidity(check: ValidityCheck | null): void {
    validityEl.textContent = check?.message ?? "";
  }

  function showProgress(index: number, stepId: StepId): void {
    progressEl.textContent = `Step ${index + 1} of ${STEP_ORDER.length}`;
    promptEl.textContent = stepPromptText(stepId);
  }

  function buildCompletionMessage(draft: CalibrationDraft, saved: boolean): string {
    const failed = draft.validity.checks.filter((c) => !c.passed);
    let message = saved
      ? "Calibration saved."
      : "Calibration captured, but saving failed — see console.";
    if (failed.length > 0) {
      const stepNumbers = failed.map((c) => STEP_ORDER.indexOf(c.stepId) + 1).join(", ");
      message += ` Some steps didn't get a clean reading (step ${stepNumbers}) — you can run a fresh calibration attempt anytime for a cleaner one.`;
    } else {
      message += " Every step captured cleanly.";
    }
    return message;
  }

  function resetToIdle(): void {
    panel.hidden = true;
    startButton.disabled = instrumentActive;
    startButton.hidden = false;
  }

  async function runWizard(): Promise<void> {
    const controller = new AbortController();
    abortController = controller;
    const { signal } = controller;

    startButton.disabled = true;
    startButton.hidden = true;
    panel.hidden = false;
    statusEl.textContent = "";

    // Claim exclusivity *before* awaiting capture.start(), not after it
    // resolves — see the matching comment in main.ts's handleStart()
    // for why: the native permission prompt can stay open indefinitely,
    // and gating on the resolved state left a real window where the
    // instrument could also start during that wait.
    onActiveChange(true);
    let info;
    try {
      // Known, low-impact gap (wizard-review): clicking Cancel while
      // this await is pending isn't observed until the next tick of
      // collectStepReadings()'s own `signal.aborted` check, since
      // nothing here races the abort against capture.start() itself.
      // The mic still gets stopped correctly in the finally block
      // below either way — worst case is a brief flash of "Capturing"
      // before the cancel takes visible effect, not a stuck state.
      info = await capture.start();
    } catch (err) {
      statusEl.textContent = describeCaptureError(err);
      onActiveChange(false);
      resetToIdle();
      abortController = null;
      return;
    }

    const engine = new CalibrationEngine(info.deviceId);

    try {
      let index = 0;
      while (index < STEP_ORDER.length) {
        const stepId = STEP_ORDER[index];
        showProgress(index, stepId);
        showValidity(null);
        redoButton.hidden = true;
        nextButton.hidden = true;

        engine.beginStep(stepId);
        const { pitchReadings, formantReadings } = await collectStepReadings(
          capture,
          stepId,
          stepDurationMs(stepId),
          signal,
        );
        const check = isCornerVowelStepId(stepId)
          ? engine.submitStep(formantReadings)
          : engine.submitStep(pitchReadings);
        showValidity(check);

        redoButton.hidden = false;
        nextButton.hidden = false;
        nextButton.textContent = index === STEP_ORDER.length - 1 ? "Finish" : "Next";

        const action = await waitForUserAction(signal);
        if (action === "redo") {
          engine.redoStep(stepId);
          continue;
        }
        index++;
      }

      const draft = engine.buildDraft();
      let saved = true;
      try {
        await calibrationStore.saveCalibration(draft, new Map());
      } catch (err) {
        console.error("Failed to save calibration.", err);
        saved = false;
      }
      panel.hidden = true;
      statusEl.textContent = buildCompletionMessage(draft, saved);
    } catch (err) {
      if (!(err instanceof WizardCancelledError)) {
        throw err;
      }
      // Cancelled: no partial Calibration is ever saved (buildDraft()
      // only runs after the loop above completes normally), so there's
      // nothing to discard beyond letting `engine` go out of scope.
    } finally {
      await capture.stop();
      onActiveChange(false);
      resetToIdle();
      abortController = null;
    }
  }

  startButton.addEventListener("click", () => {
    void runWizard();
  });

  redoButton.addEventListener("click", () => {
    pendingAction?.("redo");
  });

  nextButton.addEventListener("click", () => {
    pendingAction?.("next");
  });

  cancelButton.addEventListener("click", () => {
    abortController?.abort();
  });

  resetToIdle();

  return {
    setInstrumentActive(active: boolean): void {
      instrumentActive = active;
      if (panel.hidden) {
        startButton.disabled = active;
      }
    },
  };
}
