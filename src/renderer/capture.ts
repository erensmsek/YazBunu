// Ses yakalama: mikrofon / sistem sesi / ikisi birden → AudioWorklet → 16 kHz mono Int16 PCM.
// AudioContext 16 kHz açılır; Chromium kaynakları kendisi yeniden örnekler. Birden fazla kaynak
// aynı worklet girişine bağlanınca Web Audio onları otomatik toplar (karıştırır).
import type { CaptureSource } from "../shared/types";

const WORKLET_SRC = `
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 4000; // 250 ms
    this.buf = new Int16Array(this.size);
    this.n = 0;
    this.sum = 0;
    this.cnt = 0;
    this.port.onmessage = (e) => {
      if (e.data === "flush") {
        if (this.n) this.port.postMessage({ type: "pcm", data: this.buf.slice(0, this.n) });
        this.n = 0;
        this.port.postMessage({ type: "flushed" });
      }
    };
  }
  process(inputs) {
    const input = inputs[0];
    if (input && input.length) {
      const ch = input[0];
      for (let i = 0; i < ch.length; i++) {
        let v = ch[i];
        if (v > 1) v = 1; else if (v < -1) v = -1;
        this.buf[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        this.sum += v * v;
        if (++this.cnt >= 800) {
          this.port.postMessage({ type: "level", value: Math.sqrt(this.sum / this.cnt) });
          this.sum = 0;
          this.cnt = 0;
        }
        if (this.n === this.size) {
          this.port.postMessage({ type: "pcm", data: this.buf });
          this.buf = new Int16Array(this.size);
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
`;

export interface CaptureOptions {
  source: CaptureSource;
  micDeviceId: string;
  /** Linux: sistem sesi main süreçte (parec) yakalanır; burada yalnızca mikrofon alınır. */
  systemViaMain: boolean;
  onPcm: (samples: Int16Array) => void;
  onLevel: (level: number) => void;
  onEnded: () => void;
}

export class CaptureError extends Error {
  constructor(
    readonly code: string,
    readonly detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

export class AudioCapture {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private streams: MediaStream[] = [];
  private stopped = false;

  constructor(private readonly opts: CaptureOptions) {}

  private async micStream(meeting: boolean): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: this.opts.micDeviceId ? { exact: this.opts.micDeviceId } : undefined,
          // Toplantı modunda hoparlör sesi mikrofona da girer: yankı engelleme açık.
          // Yalnız mikrofon modunda ham ses (Whisper için en doğal sinyal).
          echoCancellation: meeting,
          noiseSuppression: meeting,
          autoGainControl: meeting,
          channelCount: 1,
        },
      });
    } catch (err) {
      const e = err as DOMException;
      // Seçili mikrofon çıkarıldıysa varsayılana düş.
      if (e?.name === "OverconstrainedError" && this.opts.micDeviceId) {
        this.opts.micDeviceId = "";
        return this.micStream(meeting);
      }
      throw new CaptureError("micAccessError", e?.message || String(err));
    }
  }

  private async systemStream(): Promise<MediaStream> {
    let ds: MediaStream;
    try {
      ds = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    } catch (err) {
      throw new CaptureError("errSystemAudio", (err as Error)?.message);
    }
    // Yalnızca ses gerekli: görüntü parçasını hemen kapat.
    ds.getVideoTracks().forEach((t) => t.stop());
    if (!ds.getAudioTracks().length) {
      ds.getTracks().forEach((t) => t.stop());
      throw new CaptureError("errSystemAudio", "no audio track");
    }
    return new MediaStream(ds.getAudioTracks());
  }

  async start(): Promise<void> {
    const { source, systemViaMain } = this.opts;
    const wantMic = source === "mic" || source === "meeting";
    const wantSystem = (source === "system" || source === "meeting") && !systemViaMain;

    if (wantMic) this.streams.push(await this.micStream(source === "meeting"));
    if (wantSystem) {
      try {
        this.streams.push(await this.systemStream());
      } catch (err) {
        this.release();
        throw err;
      }
    }
    if (!this.streams.length) return; // Linux "sistem sesi": her şey main süreçte

    const ctx = new AudioContext({ sampleRate: 16000, latencyHint: "interactive" });
    this.ctx = ctx;
    const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: "application/javascript" }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const node = new AudioWorkletNode(ctx, "pcm-capture", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: "explicit",
      channelInterpretation: "speakers",
    });
    this.node = node;
    node.port.onmessage = (e: MessageEvent<{ type: string; data?: Int16Array; value?: number }>) => {
      if (e.data.type === "pcm" && e.data.data) this.opts.onPcm(e.data.data);
      else if (e.data.type === "level") this.opts.onLevel(e.data.value ?? 0);
    };
    for (const stream of this.streams) {
      ctx.createMediaStreamSource(stream).connect(node);
      stream.getAudioTracks().forEach((t) =>
        t.addEventListener("ended", () => {
          if (!this.stopped) this.opts.onEnded();
        }),
      );
    }
    // Worklet'in işlenmesi için grafiğin hedefe bağlı olması gerekir; sesi duyurmamak için kazanç 0.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    node.connect(mute).connect(ctx.destination);
    if (ctx.state === "suspended") await ctx.resume();
  }

  /** Kalan tamponu boşaltıp her şeyi kapatır. */
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    const node = this.node;
    if (node) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 600);
        const prev = node.port.onmessage;
        node.port.onmessage = (e: MessageEvent) => {
          prev?.call(node.port, e);
          if ((e.data as { type: string }).type === "flushed") {
            clearTimeout(timer);
            resolve();
          }
        };
        node.port.postMessage("flush");
      });
    }
    this.release();
  }

  private release(): void {
    this.node?.disconnect();
    this.node = null;
    this.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    this.streams = [];
    this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}

/** Mikrofon listesi (etiketler ancak izin verildikten sonra dolu gelir). */
export async function listMicrophones(): Promise<MediaDeviceInfo[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "audioinput" && d.deviceId !== "default" && d.deviceId !== "communications");
  } catch {
    return [];
  }
}
