// Entry point. Wires audio capture, dsp remapping, and canvas rendering
// together for the v0.1 instrument display. See docs/audio-capture.md
// and docs/spectrogram.md.

import {
  MicrophoneCapture,
  MicrophonePermissionDeniedError,
  MicrophoneNotFoundError,
  MicrophoneHardwareError,
  MicrophoneConstraintsUnsupportedError,
  AudioContextSuspendedError,
} from "./audio";
import { computeLogFrequencyBins, detectPitch } from "./dsp";
import { SpectrogramRenderer } from "./render";
import { SessionStore } from "./store";

// T is set by the caller's explicit type argument (mirrors DOM's own
// querySelector<T>), not inferred from the selector string.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
function requireElement<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) {
    throw new Error(`Expected element matching "${selector}" in index.html.`);
  }
  return el;
}

const button = requireElement<HTMLButtonElement>("#mic-toggle");
const peakEl = requireElement<HTMLSpanElement>("#peak-db");
const f0El = requireElement<HTMLSpanElement>("#f0-hz");
const statusEl = requireElement<HTMLParagraphElement>("#mic-status");
const canvas = requireElement<HTMLCanvasElement>("#spectrogram");

const capture = new MicrophoneCapture();
const spectrogram = new SpectrogramRenderer(canvas);
const sessionStore = new SessionStore();

// Feature-frame logging rate, not the ~60Hz tick() rate — see
// docs/session-store.md.
const FRAME_LOG_INTERVAL_MS = 100;

let rafHandle: number | null = null;
let currentSessionId: string | null = null;
let lastFrameLoggedAt = 0;

function peakDb(spectrum: Float32Array): number {
  let peak = -Infinity;
  for (const value of spectrum) {
    if (value > peak) peak = value;
  }
  return peak;
}

function tick(): void {
  const spectrum = capture.getSpectrum();
  const info = capture.info;
  const peak = peakDb(spectrum);
  let f0: number | null = null;

  if (info) {
    const logBins = computeLogFrequencyBins(spectrum, info.sampleRate, canvas.height);
    spectrogram.pushColumn(logBins);

    const waveform = capture.getWaveform();
    f0 = detectPitch(waveform, info.sampleRate);
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

function describeError(err: unknown): string {
  if (err instanceof MicrophonePermissionDeniedError) {
    return "Microphone permission denied.";
  }
  if (err instanceof MicrophoneNotFoundError) {
    return "No microphone found.";
  }
  if (err instanceof MicrophoneHardwareError) {
    return "Microphone is in use or unavailable.";
  }
  if (err instanceof MicrophoneConstraintsUnsupportedError) {
    return "This device/browser can't disable echo cancellation, noise suppression, and AGC.";
  }
  if (err instanceof AudioContextSuspendedError) {
    return "Audio is suspended — click Start again.";
  }
  return `Capture failed: ${err instanceof Error ? err.message : String(err)}`;
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
    lastFrameLoggedAt = 0;
    tick();
  } catch (err) {
    statusEl.textContent = describeError(err);
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
  peakEl.textContent = "—";
  f0El.textContent = "—";
  statusEl.textContent = "Stopped";
  button.textContent = "Start capture";
  spectrogram.clear();
}

button.addEventListener("click", () => {
  void (capture.state === "active" ? handleStop() : handleStart());
});
