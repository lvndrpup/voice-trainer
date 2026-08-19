// Web Audio API. The ONLY place in src/ that touches it. See CLAUDE.md.
//
// Captures a microphone input with echoCancellation, noiseSuppression, and
// autoGainControl all forced off (CLAUDE.md, non-negotiable), and exposes
// its spectrum via an AnalyserNode. See docs/audio-capture.md for the audio
// graph and state machine, and docs/adr/0002-agc-off-raw-constraints.md for
// why raw constraints are required rather than requested.

export type AudioCaptureState =
  | "uninitialized"
  | "permission-requested"
  | "active"
  | "suspended"
  | "denied"
  | "error"
  | "stopped";

export interface MicrophoneCaptureOptions {
  fftSize?: number;
  smoothingTimeConstant?: number;
  minDecibels?: number;
  maxDecibels?: number;
}

export interface MicrophoneCaptureInfo {
  deviceId: string | null;
  label: string;
  sampleRate: number;
  channelCount: number;
  echoCancellation: boolean | null;
  noiseSuppression: boolean | null;
  autoGainControl: boolean | null;
}

export class MicrophoneCaptureError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class MicrophonePermissionDeniedError extends MicrophoneCaptureError {}
export class MicrophoneNotFoundError extends MicrophoneCaptureError {}
export class MicrophoneHardwareError extends MicrophoneCaptureError {}
export class MicrophoneConstraintsUnsupportedError extends MicrophoneCaptureError {}
export class AudioContextSuspendedError extends MicrophoneCaptureError {}
export class MicrophoneCaptureStateError extends MicrophoneCaptureError {}

const DEFAULT_OPTIONS: Required<MicrophoneCaptureOptions> = {
  fftSize: 2048,
  smoothingTimeConstant: 0.8,
  minDecibels: -100,
  maxDecibels: -30,
};

function buildConstraints(): MediaStreamConstraints {
  return {
    audio: {
      echoCancellation: { exact: false },
      noiseSuppression: { exact: false },
      autoGainControl: { exact: false },
      channelCount: 1,
    },
    video: false,
  };
}

function mapGetUserMediaError(err: unknown): MicrophoneCaptureError {
  const name = err instanceof Error ? err.name : undefined;
  const cause = err instanceof Error ? err : undefined;
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return new MicrophonePermissionDeniedError(
        "Microphone permission was denied.",
        { cause },
      );
    case "NotFoundError":
    case "DevicesNotFoundError":
      return new MicrophoneNotFoundError(
        "No audio input device was found.",
        { cause },
      );
    case "NotReadableError":
    case "TrackStartError":
      return new MicrophoneHardwareError(
        "Microphone could not be started (in use or hardware failure).",
        { cause },
      );
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return new MicrophoneConstraintsUnsupportedError(
        "This device/browser cannot disable echoCancellation, noiseSuppression, and autoGainControl.",
        { cause },
      );
    default:
      return new MicrophoneCaptureError(
        `getUserMedia failed: ${name ?? String(err)}`,
        { cause },
      );
  }
}

export class MicrophoneCapture {
  #state: AudioCaptureState = "uninitialized";
  #options: Required<MicrophoneCaptureOptions>;
  #audioContext: AudioContext | null = null;
  #stream: MediaStream | null = null;
  #sourceNode: MediaStreamAudioSourceNode | null = null;
  #analyser: AnalyserNode | null = null;
  #spectrumBuffer: Float32Array<ArrayBuffer> | null = null;
  #info: MicrophoneCaptureInfo | null = null;

  constructor(options: MicrophoneCaptureOptions = {}) {
    this.#options = { ...DEFAULT_OPTIONS, ...options };
  }

  get state(): AudioCaptureState {
    return this.#state;
  }

  get info(): MicrophoneCaptureInfo | null {
    return this.#info;
  }

  async start(): Promise<MicrophoneCaptureInfo> {
    if (this.#state === "active" || this.#state === "permission-requested") {
      throw new MicrophoneCaptureStateError(
        `start() called while state is "${this.#state}".`,
      );
    }

    if (this.#state === "suspended" && this.#audioContext && this.#stream) {
      await this.#ensureRunning(this.#audioContext);
      this.#info = this.#buildInfo(this.#stream, this.#audioContext);
      this.#state = "active";
      return this.#info;
    }

    this.#state = "permission-requested";
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(buildConstraints());
    } catch (err) {
      const mapped = mapGetUserMediaError(err);
      this.#state =
        mapped instanceof MicrophonePermissionDeniedError ? "denied" : "error";
      throw mapped;
    }

    const audioContext = new AudioContext();
    const sourceNode = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = this.#options.fftSize;
    analyser.smoothingTimeConstant = this.#options.smoothingTimeConstant;
    analyser.minDecibels = this.#options.minDecibels;
    analyser.maxDecibels = this.#options.maxDecibels;
    sourceNode.connect(analyser);

    try {
      await this.#ensureRunning(audioContext);
    } catch (err) {
      this.#audioContext = audioContext;
      this.#stream = stream;
      this.#sourceNode = sourceNode;
      this.#analyser = analyser;
      this.#state = "suspended";
      throw err;
    }

    this.#info = this.#buildInfo(stream, audioContext);
    this.#audioContext = audioContext;
    this.#stream = stream;
    this.#sourceNode = sourceNode;
    this.#analyser = analyser;
    this.#spectrumBuffer = new Float32Array(analyser.frequencyBinCount);
    this.#state = "active";
    return this.#info;
  }

  async stop(): Promise<void> {
    if (this.#state === "uninitialized" || this.#state === "stopped") {
      return;
    }

    this.#stream?.getTracks().forEach((track) => {
      track.stop();
    });
    this.#sourceNode?.disconnect();
    this.#analyser?.disconnect();
    const ctx = this.#audioContext;

    this.#audioContext = null;
    this.#stream = null;
    this.#sourceNode = null;
    this.#analyser = null;
    this.#spectrumBuffer = null;
    this.#info = null;
    this.#state = "stopped";

    if (ctx && ctx.state !== "closed") {
      await ctx.close();
    }
  }

  getSpectrum(): Float32Array<ArrayBuffer> {
    if (this.#state !== "active" || !this.#analyser || !this.#spectrumBuffer) {
      throw new MicrophoneCaptureStateError(
        `getSpectrum() called while state is "${this.#state}"; call and await start() first.`,
      );
    }
    this.#analyser.getFloatFrequencyData(this.#spectrumBuffer);
    return this.#spectrumBuffer;
  }

  #buildInfo(stream: MediaStream, audioContext: AudioContext): MicrophoneCaptureInfo {
    const track = stream.getAudioTracks()[0];
    const settings = track.getSettings();
    return {
      deviceId: settings.deviceId ?? null,
      label: track.label,
      sampleRate: audioContext.sampleRate,
      channelCount: settings.channelCount ?? 1,
      echoCancellation:
        typeof settings.echoCancellation === "boolean"
          ? settings.echoCancellation
          : null,
      noiseSuppression: settings.noiseSuppression ?? null,
      autoGainControl: settings.autoGainControl ?? null,
    };
  }

  async #ensureRunning(ctx: AudioContext): Promise<void> {
    if (ctx.state === "running") {
      return;
    }
    try {
      await ctx.resume();
    } catch (err) {
      throw new AudioContextSuspendedError("audioContext.resume() rejected.", {
        cause: err instanceof Error ? err : undefined,
      });
    }
    const stateAfterResume = ctx.state as AudioContextState;
    if (stateAfterResume !== "running") {
      throw new AudioContextSuspendedError(
        `Context state is still "${stateAfterResume}" after resume(); needs another user gesture.`,
      );
    }
  }
}
