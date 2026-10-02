// Kayıt oturumu: renderer'dan (ve Linux'ta parec'ten) gelen 16 kHz PCM'i diske yazar;
// canlı transkript açıksa sessiz anlardan kesilen ~18 sn'lik parçaları sırayla yazıya döker.
import { EventEmitter } from "node:events";
import { closeSync, openSync, writeSync, promises as fsp } from "node:fs";
import { AppError, isCancelled, toPayload } from "./errors";
import { SAMPLE_RATE, FRAME_SAMPLES } from "./audio";
import { FRAME_SEC, findLiveCut } from "../shared/chunking";
import { dominantLanguage } from "../shared/lang";
import type { EngineOptions, TranscriptionEngine } from "./engine";
import { joinSegmentText } from "./engine";
import type { AppErrorPayload, Segment, TranscriptResult } from "../shared/types";

export const LIVE_CHUNK = { minSec: 10, targetSec: 18, maxSec: 28 };

export interface SessionResult {
  result: TranscriptResult;
  warnings: AppErrorPayload[];
  pcmPath: string;
}

/** İki kaynağı (mikrofon + sistem sesi) örnek örnek toplayarak tek akışa indirger. */
export class StreamMixer {
  private a: Int16Array[] = [];
  private b: Int16Array[] = [];
  private aLen = 0;
  private bLen = 0;
  /** Bir kaynak bu kadar örnekten fazla öne geçerse diğeri susmuş sayılır (sıfırla doldurulur). */
  private readonly maxLag = Math.round(SAMPLE_RATE * 0.8);

  constructor(private readonly out: (mixed: Int16Array) => void) {}

  push(which: "a" | "b", data: Int16Array): void {
    if (which === "a") {
      this.a.push(data);
      this.aLen += data.length;
    } else {
      this.b.push(data);
      this.bLen += data.length;
    }
    this.drain();
  }

  private take(which: "a" | "b", n: number): Int16Array {
    const q = which === "a" ? this.a : this.b;
    const out = new Int16Array(n);
    let off = 0;
    while (off < n && q.length) {
      const head = q[0];
      const k = Math.min(head.length, n - off);
      out.set(head.subarray(0, k), off);
      off += k;
      if (k === head.length) q.shift();
      else q[0] = head.subarray(k);
    }
    if (which === "a") this.aLen -= off;
    else this.bLen -= off;
    return out;
  }

  private drain(): void {
    const both = Math.min(this.aLen, this.bLen);
    if (both > 0) this.emitMixed(this.take("a", both), this.take("b", both));
    // Bir kaynak takıldıysa diğerini bekletme.
    if (this.aLen > this.maxLag) this.emitMixed(this.take("a", this.aLen - this.maxLag / 2), null);
    if (this.bLen > this.maxLag) this.emitMixed(null, this.take("b", this.bLen - this.maxLag / 2));
  }

  private emitMixed(x: Int16Array | null, y: Int16Array | null): void {
    const n = Math.max(x?.length ?? 0, y?.length ?? 0);
    if (!n) return;
    const out = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      const v = (x?.[i] ?? 0) + (y?.[i] ?? 0);
      out[i] = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
    }
    this.out(out);
  }

  /** Kayıt bitince kuyrukta kalanları boşalt. */
  flush(): void {
    const n = Math.max(this.aLen, this.bLen);
    if (n) this.emitMixed(this.aLen ? this.take("a", this.aLen) : null, this.bLen ? this.take("b", this.bLen) : null);
  }
}

export class RecordingSession extends EventEmitter {
  readonly pcmPath: string;
  private fd: number | null;
  private bytes = 0;
  private energies: number[] = [];
  private frameAcc = 0;
  private frameCount = 0;
  private processedSec = 0;
  private segments: Segment[] = [];
  private langItems: { language: string; seconds: number }[] = [];
  private queue: Promise<void> = Promise.resolve();
  private pendingSec = 0;
  private failed: { start: number; end: number }[] = [];
  private prompt = "";
  private readonly ctrl = new AbortController();
  private stopped = false;
  private warnings: AppErrorPayload[] = [];

  constructor(
    readonly id: string,
    private readonly engine: TranscriptionEngine,
    private readonly opts: Omit<EngineOptions, "signal">,
    readonly live: boolean,
  ) {
    super();
    this.pcmPath = engine.tmpFile(".pcm");
    this.fd = openSync(this.pcmPath, "w");
  }

  get duration(): number {
    return this.bytes / (SAMPLE_RATE * 2);
  }

  write(samples: Int16Array): void {
    if (this.stopped || this.fd === null || !samples.length) return;
    writeSync(this.fd, Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength));
    this.bytes += samples.byteLength;
    for (let i = 0; i < samples.length; i++) {
      const v = samples[i] / 32768;
      this.frameAcc += v * v;
      if (++this.frameCount === FRAME_SAMPLES) {
        this.energies.push(Math.sqrt(this.frameAcc / this.frameCount));
        this.frameAcc = 0;
        this.frameCount = 0;
      }
    }
    if (this.live) this.maybeCut();
  }

  private maybeCut(): void {
    const fromFrame = Math.round(this.processedSec / FRAME_SEC);
    const cut = findLiveCut(this.energies, fromFrame, { ...LIVE_CHUNK, frameSec: FRAME_SEC });
    if (cut < 0) return;
    const span = { start: this.processedSec, end: cut * FRAME_SEC };
    this.processedSec = span.end;
    this.enqueue(span);
  }

  private enqueue(span: { start: number; end: number }): void {
    this.pendingSec += span.end - span.start;
    this.emitUpdate();
    this.queue = this.queue.then(() => this.process(span));
  }

  private async process(span: { start: number; end: number }): Promise<void> {
    try {
      const res = await this.engine.transcribeRange(this.pcmPath, span.start, span.end, {
        ...this.opts,
        prompt: this.prompt,
        signal: this.ctrl.signal,
      });
      if (!res.skipped && res.segments.length) {
        this.segments.push(...res.segments);
        this.segments.sort((a, b) => a.start - b.start);
        this.langItems.push({ language: res.language, seconds: span.end - span.start });
        this.prompt = joinSegmentText(res.segments, res.language).slice(-200);
      }
    } catch (err) {
      if (isCancelled(err)) return;
      // Parça başarısız (kota, ağ): ses dosyada duruyor, kayıt bitince yeniden denenir.
      this.failed.push(span);
      this.emit("chunkError", toPayload(err));
    } finally {
      this.pendingSec = Math.max(0, this.pendingSec - (span.end - span.start));
      this.emitUpdate();
    }
  }

  private emitUpdate(): void {
    this.emit("update", {
      sessionId: this.id,
      segments: this.segments,
      language: dominantLanguage(this.langItems),
      pendingSeconds: Math.round(this.pendingSec),
    });
  }

  private closeFile(): void {
    if (this.fd !== null) {
      closeSync(this.fd);
      this.fd = null;
    }
  }

  /** Kaydı bitirir ve tam transkripti döndürür. */
  async stop(onProgress?: EngineOptions["onProgress"]): Promise<SessionResult> {
    this.stopped = true;
    this.closeFile();
    const signal = this.ctrl.signal;
    if (this.duration < 0.5) throw new AppError("errNoSpeech");

    if (!this.live) {
      const { result, warnings } = await this.engine.transcribeAll(this.pcmPath, { ...this.opts, signal, onProgress });
      return { result, warnings, pcmPath: this.pcmPath };
    }

    if (this.duration - this.processedSec > 0.3) {
      const span = { start: this.processedSec, end: this.duration };
      this.processedSec = this.duration;
      this.enqueue(span);
    }
    onProgress?.("transcribe", -1);
    await this.queue;
    // Başarısız parçaları bir kez daha dene; yine olmazsa hatayı kullanıcıya ilet.
    const retry = this.failed.splice(0);
    for (const span of retry) {
      try {
        const res = await this.engine.transcribeRange(this.pcmPath, span.start, span.end, { ...this.opts, signal });
        this.segments.push(...res.segments);
        this.langItems.push({ language: res.language, seconds: span.end - span.start });
      } catch (err) {
        if (isCancelled(err)) throw err;
        // Kısmi transkript yine de kaydedilir; ses dosyası saklandıysa sonra yeniden işlenebilir.
        this.warnings.push(toPayload(err));
      }
    }
    this.segments.sort((a, b) => a.start - b.start);
    if (!this.segments.length) throw new AppError("errNoSpeech");

    const language = this.opts.language || dominantLanguage(this.langItems);
    let segments = this.segments;
    if (this.opts.diarize) {
      try {
        segments = await this.engine.diarize(this.pcmPath, segments, { numSpeakers: this.opts.numSpeakers, signal, onProgress });
      } catch (err) {
        if (isCancelled(err)) throw err;
        this.warnings.push({ code: "errDiarize", detail: toPayload(err).detail ?? toPayload(err).code });
      }
    }
    return {
      result: { language, text: joinSegmentText(segments, language), segments, duration: this.duration },
      warnings: this.warnings,
      pcmPath: this.pcmPath,
    };
  }

  /** Kaydı iptal eder: dosya silinir, bekleyen istekler durdurulur. */
  async cancel(): Promise<void> {
    this.stopped = true;
    this.ctrl.abort();
    this.closeFile();
    await fsp.rm(this.pcmPath, { force: true });
  }

  abortProcessing(): void {
    this.ctrl.abort();
  }
}
