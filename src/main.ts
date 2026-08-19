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
import { computeLogFrequencyBins } from "./dsp";
import { SpectrogramRenderer } from "./render";

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
const statusEl = requireElement<HTMLParagraphElement>("#mic-status");
const canvas = requireElement<HTMLCanvasElement>("#spectrogram");

const capture = new MicrophoneCapture();
const spectrogram = new SpectrogramRenderer(canvas);
let rafHandle: number | null = null;

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
  if (info) {
    const logBins = computeLogFrequencyBins(spectrum, info.sampleRate, canvas.height);
    spectrogram.pushColumn(logBins);
  }

  const peak = peakDb(spectrum);
  peakEl.textContent = Number.isFinite(peak) ? peak.toFixed(1) : "—";
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
    statusEl.textContent = `Capturing (device ${info.deviceId ?? "unknown"})`;
    button.textContent = "Stop capture";
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
  await capture.stop();
  peakEl.textContent = "—";
  statusEl.textContent = "Stopped";
  button.textContent = "Start capture";
  spectrogram.clear();
}

button.addEventListener("click", () => {
  void (capture.state === "active" ? handleStop() : handleStart());
});
