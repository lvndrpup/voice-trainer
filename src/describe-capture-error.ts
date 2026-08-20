// Shared MicrophoneCapture error -> human-readable message mapping —
// used by main.ts's instrument capture and wizard.ts's calibration
// capture, so a mic failure reads the same way in either flow.
// Standalone for the same reason as tick-features.ts/dom.ts.

import {
  MicrophonePermissionDeniedError,
  MicrophoneNotFoundError,
  MicrophoneHardwareError,
  MicrophoneConstraintsUnsupportedError,
  AudioContextSuspendedError,
} from "./audio";

export function describeCaptureError(err: unknown): string {
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
