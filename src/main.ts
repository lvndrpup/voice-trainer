// Entry point. Wires audio capture, dsp remapping, and canvas rendering
// together for the v0.1 instrument display. See docs/audio-capture.md
// and docs/spectrogram.md.

import { MicrophoneCapture } from "./audio";
import { computeLogFrequencyBins } from "./dsp";
import { SpectrogramRenderer } from "./render";
import { SessionStore, sessionsToExportJson } from "./store";
import { readTickFeatures } from "./tick-features";
import { requireElement } from "./dom";
import { describeCaptureError } from "./describe-capture-error";
import { initCalibrationWizard } from "./wizard";

const button = requireElement<HTMLButtonElement>("#mic-toggle");
const peakEl = requireElement<HTMLSpanElement>("#peak-db");
const f0El = requireElement<HTMLSpanElement>("#f0-hz");
const statusEl = requireElement<HTMLParagraphElement>("#mic-status");
const canvas = requireElement<HTMLCanvasElement>("#spectrogram");
const deleteAllButton = requireElement<HTMLButtonElement>("#delete-all");
const exportButton = requireElement<HTMLButtonElement>("#export-json");

const capture = new MicrophoneCapture();
const spectrogram = new SpectrogramRenderer(canvas);
const sessionStore = new SessionStore();

// The instrument and the calibration wizard both need exclusive use of
// the microphone — running both at once would also double-write to
// two different stores in a confusing way. Each side disables the
// other's start control while it's active; see wizard.ts's own header
// comment for the other half of this two-way wiring.
const wizardController = initCalibrationWizard((wizardActive) => {
  button.disabled = wizardActive;
});

// Feature-frame logging rate, not the ~60Hz tick() rate — see
// docs/session-store.md.
const FRAME_LOG_INTERVAL_MS = 100;

let rafHandle: number | null = null;
let currentSessionId: string | null = null;
let lastFrameLoggedAt = 0;

function tick(): void {
  const spectrum = capture.getSpectrum();
  const info = capture.info;
  const waveform = info ? capture.getWaveform() : null;
  const { peakDb: peak, f0Hz: f0 } = readTickFeatures(spectrum, waveform, info?.sampleRate ?? null);

  if (info) {
    const logBins = computeLogFrequencyBins(spectrum, info.sampleRate, canvas.height);
    spectrogram.pushColumn(logBins);
    f0El.textContent = f0 !== null ? f0.toFixed(1) : "—";
  }

  peakEl.textContent = Number.isFinite(peak) ? peak.toFixed(1) : "—";

  if (currentSessionId && info) {
    const now = performance.now();
    if (now - lastFrameLoggedAt >= FRAME_LOG_INTERVAL_MS) {
      lastFrameLoggedAt = now;
      void sessionStore.appendFrame(currentSessionId, {
        timestamp: Date.now(),
        f0Hz: f0,
        peakDb: peak,
      });
    }
  }

  rafHandle = requestAnimationFrame(tick);
}

async function handleStart(): Promise<void> {
  button.disabled = true;
  statusEl.textContent = "Requesting microphone…";
  try {
    const info = await capture.start();
    let statusText = `Capturing (device ${info.deviceId ?? "unknown"})`;

    // Persistence failures degrade gracefully rather than blocking the
    // instrument — a broken IndexedDB shouldn't stop you from seeing
    // your own spectrogram. The failure is still surfaced, not swallowed.
    try {
      const session = await sessionStore.startSession(info.deviceId);
      currentSessionId = session.id;
    } catch (err) {
      console.error("Failed to start a session; capture will continue without saving.", err);
      currentSessionId = null;
      statusText += " — not saving (storage unavailable)";
    }

    statusEl.textContent = statusText;
    button.textContent = "Stop capture";
    deleteAllButton.disabled = true;
    exportButton.disabled = true;
    lastFrameLoggedAt = 0;
    wizardController.setInstrumentActive(true);
    tick();
  } catch (err) {
    statusEl.textContent = describeCaptureError(err);
    throw err;
  } finally {
    button.disabled = false;
  }
}

async function handleStop(): Promise<void> {
  if (rafHandle !== null) {
    cancelAnimationFrame(rafHandle);
    rafHandle = null;
  }

  if (currentSessionId) {
    try {
      await sessionStore.endSession(currentSessionId);
    } catch (err) {
      console.error("Failed to close the session record.", err);
    }
    currentSessionId = null;
  }

  await capture.stop();
  wizardController.setInstrumentActive(false);
  peakEl.textContent = "—";
  f0El.textContent = "—";
  statusEl.textContent = "Stopped";
  button.textContent = "Start capture";
  deleteAllButton.disabled = false;
  exportButton.disabled = false;
  spectrogram.clear();
}

async function handleDeleteAll(): Promise<void> {
  const confirmed = window.confirm("Delete all saved sessions? This cannot be undone.");
  if (!confirmed) {
    return;
  }
  deleteAllButton.disabled = true;
  try {
    await sessionStore.deleteAll();
    statusEl.textContent = "All sessions deleted.";
  } catch (err) {
    statusEl.textContent = "Failed to delete sessions — see console.";
    throw err;
  } finally {
    deleteAllButton.disabled = false;
  }
}

function downloadJson(filename: string, json: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function handleExport(): Promise<void> {
  exportButton.disabled = true;
  try {
    const sessions = await sessionStore.getAllSessionsWithFrames();
    const json = sessionsToExportJson(sessions);
    downloadJson(`resonance-scope-sessions-${Date.now()}.json`, json);
  } catch (err) {
    statusEl.textContent = "Failed to export sessions — see console.";
    throw err;
  } finally {
    exportButton.disabled = false;
  }
}

button.addEventListener("click", () => {
  void (capture.state === "active" ? handleStop() : handleStart());
});

deleteAllButton.addEventListener("click", () => {
  void handleDeleteAll();
});

exportButton.addEventListener("click", () => {
  void handleExport();
});
