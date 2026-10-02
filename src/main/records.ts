// Transkript sonucundan geçmiş kaydı oluşturma ve var olan kayda ses ekleme.
import { promises as fsp } from "node:fs";
import path from "node:path";
import { concatPcm, encodeForStorage } from "./audio";
import type { HistoryStore } from "./history";
import { newRecordId } from "./history";
import type { EngineOptions, TranscriptionEngine } from "./engine";
import { joinSegmentText, shiftSegments } from "./engine";
import { isCancelled, toPayload, AppError } from "./errors";
import { offsetSpeakers, remapSpeakerIds } from "../shared/speakers";
import type { AppErrorPayload, HistoryRecord, RecordSource, TranscriptResult } from "../shared/types";

const APPEND_GAP_SEC = 1;

export function makeTitle(text: string, fallback: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return fallback;
  return trimmed.length > 46 ? trimmed.slice(0, 46) + "…" : trimmed;
}

export interface RecordDeps {
  history: HistoryStore;
  engine: TranscriptionEngine;
  ffmpeg: string;
}

export class RecordService {
  constructor(private readonly deps: RecordDeps) {}

  private async storeAudio(pcmPath: string, id: string): Promise<string | null> {
    try {
      const out = await encodeForStorage(this.deps.ffmpeg, pcmPath, path.join(this.deps.history.audioDir, `${id}-${Date.now()}`));
      return path.basename(out);
    } catch {
      // Ses saklanamadı (disk dolu vb.): transkript yine de kaydedilir.
      return null;
    }
  }

  async create(
    result: TranscriptResult,
    pcmPath: string,
    meta: { source: RecordSource; fileName?: string; keepAudio: boolean; defaultTitle: string },
  ): Promise<HistoryRecord> {
    const id = newRecordId();
    const now = Date.now();
    const audioFile = meta.keepAudio ? await this.storeAudio(pcmPath, id) : null;
    const title = meta.fileName
      ? meta.fileName.replace(/\.[^.]+$/, "").slice(0, 60)
      : makeTitle(result.text, meta.defaultTitle);
    const record: HistoryRecord = {
      id,
      version: 2,
      title,
      createdAt: now,
      updatedAt: now,
      language: result.language,
      duration: result.duration,
      text: result.text,
      segments: result.segments,
      speakers: {},
      translation: null,
      summary: null,
      polish: null,
      audioFile,
      source: meta.source,
      ...(meta.fileName ? { fileName: meta.fileName } : {}),
    };
    return this.deps.history.save(record);
  }

  /**
   * Var olan kayda yeni ses ekler. Kaydın sesi saklıysa iki ses birleştirilir ve konuşmacılar
   * birleşik ses üzerinden yeniden ayrılır (aynı kişi aynı kimliği alır); değilse yalnızca
   * numara çakışması önlenir.
   */
  async append(
    id: string,
    result: TranscriptResult,
    newPcm: string,
    opts: { keepAudio: boolean; engine: Pick<EngineOptions, "diarize" | "numSpeakers" | "signal" | "onProgress"> },
  ): Promise<{ record: HistoryRecord; warnings: AppErrorPayload[] }> {
    const record = await this.deps.history.get(id);
    if (!record) throw new AppError("statusAppendNotFound");
    const warnings: AppErrorPayload[] = [];
    const offset = record.duration + APPEND_GAP_SEC;
    let incoming = shiftSegments(result.segments, offset);
    const hadSpeakers = record.segments.some((s) => s.speaker) || incoming.some((s) => s.speaker);
    let segments = [...record.segments, ...incoming];
    let audioFile = record.audioFile;

    const oldAudio = record.audioFile ? this.deps.history.audioPath(record.audioFile) : null;
    let combinedPcm: string | null = null;
    try {
      if (oldAudio) {
        const oldPcm = await this.deps.engine.decode(oldAudio, { signal: opts.engine.signal });
        combinedPcm = this.deps.engine.tmpFile(".pcm");
        await concatPcm(oldPcm, newPcm, combinedPcm, APPEND_GAP_SEC);
        await fsp.rm(oldPcm, { force: true });
      }
      if (combinedPcm && (opts.engine.diarize || hadSpeakers)) {
        try {
          const rediarized = await this.deps.engine.diarize(combinedPcm, segments.map((s) => ({ ...s, speaker: null })), opts.engine);
          segments = remapSpeakerIds(record.segments, rediarized, record.duration);
        } catch (err) {
          if (isCancelled(err)) throw err;
          warnings.push({ code: "errDiarize", detail: toPayload(err).detail });
          incoming = offsetSpeakers(record.segments, incoming);
          segments = [...record.segments, ...incoming];
        }
      } else if (hadSpeakers) {
        incoming = offsetSpeakers(record.segments, incoming);
        segments = [...record.segments, ...incoming];
      }
      if (opts.keepAudio || oldAudio) {
        const source = combinedPcm ?? newPcm;
        const stored = await this.storeAudio(source, record.id);
        if (stored) {
          if (oldAudio) await fsp.rm(oldAudio, { force: true });
          audioFile = stored;
        }
      }
    } finally {
      if (combinedPcm) await fsp.rm(combinedPcm, { force: true });
    }

    const language = record.language || result.language;
    const updated: HistoryRecord = {
      ...record,
      segments,
      text: joinSegmentText(segments, language),
      duration: offset + result.duration,
      language,
      audioFile,
      updatedAt: Date.now(),
      // Eklenen ses önceki çeviri/özet/iyileştirmeyi geçersiz kılar.
      translation: null,
      summary: null,
      polish: null,
    };
    return { record: await this.deps.history.save(updated), warnings };
  }

  /** Kaydın sesini PCM olarak çözer (yeniden konuşmacı ayrımı için). */
  async decodeRecordAudio(record: HistoryRecord, signal?: AbortSignal): Promise<string> {
    if (!record.audioFile) throw new AppError("errDecode", "no audio");
    return this.deps.engine.decode(this.deps.history.audioPath(record.audioFile), { signal });
  }
}

