// Transkript motoru: PCM → (Groq ya da offline Whisper) → (isteğe bağlı) konuşmacı ayrımı.
// Electron'a bağımlı değildir; bağımlılıklar enjekte edilir → testlerde sahte Groq + gerçek ML worker.
import path from "node:path";
import { promises as fsp } from "node:fs";
import { AppError, isCancelled, throwIfAborted, toPayload } from "./errors";
import type { GroqClient } from "./groq";
import type { ModelManager } from "./models";
import type { WorkerHost } from "./worker-host";
import { computeEnergies, decodeToPcm, readPcmRange, wavFromPcm, pcmDuration, int16View, FRAME_SAMPLES } from "./audio";
import { FRAME_SEC, frameRms, isSilent, planChunks } from "../shared/chunking";
import { dominantLanguage } from "../shared/lang";
import { assignSpeakers, type SpeakerTurn } from "../shared/speakers";
import type { AppErrorPayload, JobStage, LocalAsrModel, Mode, Segment, TranscriptResult } from "../shared/types";

/** API modunda tek isteğe giden parçanın sınırları (WAV 10 dk ≈ 19 MB < Groq'un 25 MB sınırı). */
export const API_CHUNK = { targetSec: 480, minSec: 240, maxSec: 600 };

export interface EngineDeps {
  ffmpeg: string;
  tmpDir: string;
  groq: GroqClient;
  ml: WorkerHost;
  models: ModelManager;
}

export interface EngineOptions {
  mode: Mode;
  localModel: LocalAsrModel;
  transcribeModel: string;
  language: string;
  diarize: boolean;
  numSpeakers: number;
  signal?: AbortSignal;
  onProgress?: (stage: JobStage, fraction: number, extra?: { waitSeconds?: number }) => void;
}

export interface RangeResult {
  language: string;
  segments: Segment[];
  /** Parça sessizdi, gönderilmedi. */
  skipped: boolean;
}

export function joinSegmentText(segments: Segment[], language: string): string {
  const sep = ["zh", "ja"].includes(language) ? "" : " ";
  return segments
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join(sep)
    .trim();
}

export function shiftSegments(segments: Segment[], offset: number): Segment[] {
  return segments.map((s) => ({
    ...s,
    start: s.start + offset,
    end: s.end + offset,
    ...(s.words ? { words: s.words.map((w) => ({ ...w, start: w.start + offset, end: w.end + offset })) } : {}),
  }));
}

let tmpCounter = 0;

export class TranscriptionEngine {
  constructor(private readonly deps: EngineDeps) {}

  tmpFile(ext: string): string {
    return path.join(this.deps.tmpDir, `yb-${process.pid}-${Date.now()}-${tmpCounter++}${ext}`);
  }

  /** Herhangi bir ses/video dosyasını geçici PCM'e çevirir. */
  async decode(input: string, opts: Pick<EngineOptions, "signal" | "onProgress">): Promise<string> {
    await fsp.mkdir(this.deps.tmpDir, { recursive: true });
    const out = this.tmpFile(".pcm");
    try {
      await decodeToPcm(this.deps.ffmpeg, input, out, {
        signal: opts.signal,
        onProgress: (f) => opts.onProgress?.("decode", f),
      });
      return out;
    } catch (err) {
      await fsp.rm(out, { force: true });
      throw err;
    }
  }

  private async localModelFiles(opts: EngineOptions) {
    if (!this.deps.models.isAsrInstalled(opts.localModel)) {
      // Model yoksa burada indir (ilerleme çubuğuyla).
      const handler = (p: { id: string; stage: "download" | "extract"; progress: number }) => {
        if (p.id === `asr-${opts.localModel}`) opts.onProgress?.(p.stage, p.stage === "download" ? p.progress / 0.9 : (p.progress - 0.9) / 0.1);
      };
      this.deps.models.on("progress", handler);
      try {
        await this.deps.models.downloadAsr(opts.localModel, opts.signal);
      } finally {
        this.deps.models.off("progress", handler);
      }
    }
    const [model, vad] = await Promise.all([
      this.deps.models.asrFiles(opts.localModel),
      this.deps.models.ensureBundled("vad", opts.signal),
    ]);
    return { model, vad };
  }

  /**
   * PCM dosyasının [start, end) aralığını yazıya döker. Zaman damgaları dosyanın başına göredir.
   * Canlı transkriptteki her parça ve API modundaki her 10 dakikalık parça buradan geçer.
   */
  async transcribeRange(
    pcmPath: string,
    start: number,
    end: number,
    opts: EngineOptions & { prompt?: string; onLocalProgress?: (f: number) => void },
  ): Promise<RangeResult> {
    throwIfAborted(opts.signal);
    if (opts.mode === "local") {
      const { model, vad } = await this.localModelFiles(opts);
      opts.onProgress?.("load", -1);
      const res = await this.deps.ml.call<{ segments: Segment[]; language: string }>(
        { type: "asr", pcmPath, start, end, model, vad, language: opts.language },
        { signal: opts.signal, onProgress: (v) => opts.onLocalProgress?.(v) },
      );
      return { language: res.language, segments: res.segments, skipped: false };
    }
    const pcm = await readPcmRange(pcmPath, start, end);
    if (pcm.length < 0.3 * 32000) return { language: "", segments: [], skipped: true };
    if (isSilent(frameRms(int16View(pcm), FRAME_SAMPLES))) return { language: "", segments: [], skipped: true };
    const res = await this.deps.groq.transcribe(wavFromPcm(pcm), {
      model: opts.transcribeModel,
      language: opts.language || undefined,
      prompt: opts.prompt,
      signal: opts.signal,
      onWait: (s) => opts.onProgress?.("wait", -1, { waitSeconds: s }),
    });
    return { language: res.language, segments: shiftSegments(res.segments, start), skipped: false };
  }

  /** Bütün PCM dosyasını yazıya döker (dosya yükleme ya da canlı kapalıyken kayıt sonu). */
  async transcribeAll(pcmPath: string, opts: EngineOptions): Promise<{ result: TranscriptResult; warnings: AppErrorPayload[] }> {
    const duration = await pcmDuration(pcmPath);
    const energies = await computeEnergies(pcmPath);
    if (isSilent(energies)) throw new AppError("errNoSpeech");

    let segments: Segment[] = [];
    const langItems: { language: string; seconds: number }[] = [];

    if (opts.mode === "local") {
      opts.onProgress?.("transcribe", 0);
      const res = await this.transcribeRange(pcmPath, 0, duration, {
        ...opts,
        onLocalProgress: (f) => opts.onProgress?.("transcribe", f),
      });
      segments = res.segments;
      langItems.push({ language: res.language, seconds: duration });
    } else {
      const chunks = planChunks(energies, { ...API_CHUNK, frameSec: FRAME_SEC });
      let prompt = "";
      for (let i = 0; i < chunks.length; i++) {
        opts.onProgress?.("transcribe", i / chunks.length);
        const { start, end } = chunks[i];
        const res = await this.transcribeRange(pcmPath, start, end, { ...opts, prompt });
        if (res.skipped) continue;
        segments.push(...res.segments);
        langItems.push({ language: res.language, seconds: end - start });
        const text = joinSegmentText(res.segments, res.language);
        prompt = text.slice(-200);
      }
      opts.onProgress?.("transcribe", 1);
    }

    if (!segments.length) throw new AppError("errNoSpeech");
    const language = opts.language || dominantLanguage(langItems);
    const warnings: AppErrorPayload[] = [];
    if (opts.diarize) {
      try {
        segments = await this.diarize(pcmPath, segments, opts);
      } catch (err) {
        if (isCancelled(err)) throw err;
        warnings.push({ code: "errDiarize", detail: toPayload(err).detail ?? toPayload(err).code });
      }
    }
    return {
      result: { language, text: joinSegmentText(segments, language), segments, duration },
      warnings,
    };
  }

  /** Konuşmacı ayrımı + segmentlere eşleme. */
  async diarize(pcmPath: string, segments: Segment[], opts: Pick<EngineOptions, "numSpeakers" | "signal" | "onProgress">): Promise<Segment[]> {
    opts.onProgress?.("diarize", -1);
    const [segmentation, embedding] = await Promise.all([
      this.deps.models.ensureBundled("segmentation", opts.signal),
      this.deps.models.ensureBundled("embedding", opts.signal),
    ]);
    const turns = await this.deps.ml.call<SpeakerTurn[]>(
      { type: "diarize", pcmPath, segmentation, embedding, numSpeakers: opts.numSpeakers },
      { signal: opts.signal },
    );
    return assignSpeakers(segments, turns);
  }
}
