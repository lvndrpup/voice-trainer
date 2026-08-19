// Entry point. Wiring to audio/dsp/render/store lands with v0.1.
//
// This is a throwaway manual test harness for mic capture: a start/stop
// button and a peak-dB readout, so capture can be verified before the
// spectrogram/render pipeline exists. Replace when src/render/ lands.
// See docs/audio-capture.md.

import {
  MicrophoneCapture,
  MicrophonePermissionDeniedError,
  MicrophoneNotFoundError,
  MicrophoneHardwareError,
  MicrophoneConstraintsUnsupportedError,
  AudioContextSuspendedError,
} from "./audio";

const button = document.querySelector<HTMLButtonElement>("#mic-toggle")!;
const peakEl = document.querySelector<HTMLSpanElement>("#peak-db")!;
const statusEl = document.querySelector<HTMLParagraphElement>("#mic-status")!;

const capture = new MicrophoneCapture();
let rafHandle: number | null = null;

function peakDb(spectrum: Float32Array): number {
  let peak = -Infinity;
  for (const value of spectrum) {
    if (value > peak) peak = value;
  }
  return peak;
}

function tick(): void {
  const peak = peakDb(capture.getSpectrum());
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
}

button.addEventListener("click", () => {
  void (capture.state === "active" ? handleStop() : handleStart());
});
