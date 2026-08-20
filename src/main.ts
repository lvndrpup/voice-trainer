// Entry point. Wires audio capture, dsp remapping, and canvas rendering
// together for the v0.1 instrument display. See docs/audio-capture.md
// and docs/spectrogram.md.

import { MicrophoneCapture } from "./audio";
import { computeLogFrequencyBins } from "./dsp";
import { SpectrogramRenderer } from "./render";
import { SessionStore, sessionsToExportJson } from "./store";
import { readTickFeatures } from "./tick-features";
import { requireElement, focusIfIdle } from "./dom";
import { describeCaptureError } from "./describe-capture-error";
import { initCalibrationWizard } from "./wizard";

const button = requireElement<HTMLButtonElement>("#mic-toggle");
const peakEl = requireElement<HTMLSpanElement>("#peak-db");
const f0El = requireElement<HTMLSpanElement>("#f0-hz");
const readoutAnnouncementEl = requireElement<HTMLParagraphElement>("#readout-announcement");
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

// #peak-db/#f0-hz are visual-only spans, updated on every ~60Hz rAF
// tick — fine for a sighted user watching them continuously, but
// there's no live region on them (the digits themselves are not what
// gets announced; see READOUT_ANNOUNCE_INTERVAL_MS below).
//
// A screen-reader accessibility-tester audit found that even throttling
// a role="status" region to 10Hz (this project's usual UI-update
// cadence, see docs/session-store.md) still floods AT: role="status"
// implies aria-live="polite", which *queues* rather than drops
// announcements, so 10-20 queued announcements/second backs up into an
// unstoppable stream a screen-reader user can't outrun. The actual
// announcement (via #readout-announcement, a separate visually-hidden
// role="status" region) is throttled far more coarsely instead — about
// once a second, independent of the visual refresh rate.
const READOUT_ANNOUNCE_INTERVAL_MS = 1000;

let rafHandle: number | null = null;
let currentSessionId: string | null = null;
let lastFrameLoggedAt = 0;
let lastAnnouncedAt = 0;

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

  const now = performance.now();
  if (now - lastAnnouncedAt >= READOUT_ANNOUNCE_INTERVAL_MS) {
    lastAnnouncedAt = now;
    readoutAnnouncementEl.textContent = `Peak ${peakEl.textContent} dB, F0 ${f0El.textContent} Hz`;
  }

  if (currentSessionId && info && now - lastFrameLoggedAt >= FRAME_LOG_INTERVAL_MS) {
    lastFrameLoggedAt = now;
    void sessionStore.appendFrame(currentSessionId, {
      timestamp: Date.now(),
      f0Hz: f0,
      peakDb: peak,
    });
  }

  rafHandle = requestAnimationFrame(tick);
}

async function handleStart(): Promise<void> {
  button.disabled = true;
  statusEl.textContent = "Requesting microphone…";
  // Claim exclusivity *before* awaiting capture.start(), not after it
  // resolves — the native getUserMedia permission prompt can stay open
  // indefinitely, and a wizard-review correctness pass found that
  // gating on the resolved state left a real window where both this
  // instrument and the wizard could have a permission prompt pending
  // at once, then both become active. Neither MicrophoneCapture
  // instance would reject that — #state is a private per-instance
  // field, not a cross-instance registry (src/audio/index.ts) — so
  // this claim is the only thing actually closing the window.
  wizardController.setInstrumentActive(true);
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
    tick();
  } catch (err) {
    statusEl.textContent = describeCaptureError(err);
    wizardController.setInstrumentActive(false);
    throw err;
  } finally {
    button.disabled = false;
    // Disabling the button that was just keyboard-activated drops focus
    // to <body> with no automatic re-target — restore it (unless the
    // user has since moved focus elsewhere) rather than stranding a
    // keyboard/screen-reader user at the top of the document. Surfaced
    // by an accessibility-tester audit (issue #63).
    focusIfIdle(button);
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
  readoutAnnouncementEl.textContent = "";
  lastAnnouncedAt = 0;
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
    focusIfIdle(deleteAllButton);
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
    focusIfIdle(exportButton);
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
