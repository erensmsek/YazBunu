// IPC işleyicileri: renderer'ın her isteği burada servislere yönlendirilir.
import { app, clipboard, dialog, ipcMain, shell, type BrowserWindow } from "electron";
import path from "node:path";
import { promises as fsp } from "node:fs";
import { AppError, isCancelled, toPayload } from "./errors";
import type { SettingsStore } from "./settings";
import type { HistoryStore } from "./history";
import type { ModelManager } from "./models";
import { GroqClient, type FetchLike } from "./groq";
import type { LlmService } from "./llm";
import type { EngineOptions, TranscriptionEngine } from "./engine";
import { joinSegmentText } from "./engine";
import type { RecordService } from "./records";
import type { WorkerHost } from "./worker-host";
import { RecordingSession, StreamMixer } from "./live";
import { ParecCapture, parecAvailable } from "./capture-linux";
import { NLLB_CODES } from "../shared/lang";
import { remapSpeakerIds } from "../shared/speakers";
import type { IpcResult } from "../shared/ipc";
import type { AppInfo, CaptureSource, HistoryRecord, JobStage, LocalAsrModel, Segment, Settings, Translation } from "../shared/types";

export interface Services {
  settings: SettingsStore;
  history: HistoryStore;
  models: ModelManager;
  groq: GroqClient;
  llm: LlmService;
  ml: WorkerHost;
  nllb: WorkerHost;
  engine: TranscriptionEngine;
  records: RecordService;
  ffmpeg: string;
  tmpDir: string;
  window: () => BrowserWindow | null;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export interface Hooks {
  send: (channel: string, payload?: unknown) => void;
  setRecording: (recording: boolean) => void;
  applyShortcut: (accel: string) => boolean;
  notify: (title: string, body: string) => void;
  askMicAccess: () => Promise<boolean>;
}

const EXTERNAL_ALLOW = [
  "https://console.groq.com/",
  "https://github.com/erensmsek/YazBunu",
  "https://existential.audio/blackhole",
  "https://github.com/ExistentialAudio/BlackHole",
];

const PATCHABLE = new Set(["title", "segments", "speakers", "text", "summary", "polish", "translation"]);

export function engineOptions(s: Settings): Omit<EngineOptions, "signal" | "onProgress"> {
  return {
    mode: s.mode,
    localModel: s.localModel,
    transcribeModel: s.groqTranscribeModel,
    language: s.transcriptionLanguage,
    diarize: s.diarize,
    numSpeakers: s.numSpeakers,
  };
}

function rms(samples: Int16Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += (samples[i] / 32768) ** 2;
  return Math.sqrt(sum / Math.max(1, samples.length));
}

interface SessionEntry {
  session: RecordingSession;
  source: CaptureSource;
  appendTo: string | null;
  parec?: ParecCapture;
  mixer?: StreamMixer;
}

export function registerIpc(s: Services, hooks: Hooks): void {
  const jobs = new Map<string, AbortController>();
  const sessions = new Map<string, SessionEntry>();

  function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => Promise<R> | R): void {
    ipcMain.handle(channel, async (event, ...args): Promise<IpcResult<R>> => {
      // Yalnızca kendi penceremizden gelen istekler.
      if (event.sender !== s.window()?.webContents) return { ok: false, error: { code: "errUnknown", detail: "forbidden" } };
      try {
        return { ok: true, data: await fn(...(args as A)) };
      } catch (err) {
        if (!isCancelled(err)) console.error(`[ipc:${channel}]`, err);
        return { ok: false, error: toPayload(err) };
      }
    });
  }

  function startJob(jobId: string): AbortController {
    jobs.get(jobId)?.abort();
    const ctrl = new AbortController();
    jobs.set(jobId, ctrl);
    return ctrl;
  }

  function progress(jobId: string) {
    let last = 0;
    let lastStage = "";
    return (stage: JobStage, fraction: number, extra?: { waitSeconds?: number }) => {
      const now = Date.now();
      // IPC trafiğini sınırla: aşama değişimi ya da 150 ms'de bir.
      if (stage === lastStage && now - last < 150 && fraction < 1 && !extra) return;
      last = now;
      lastStage = stage;
      hooks.send("job-progress", { jobId, stage, progress: fraction, waitSeconds: extra?.waitSeconds });
    };
  }

  function llmCall(jobId: string, stage: JobStage, signal: AbortSignal) {
    const p = progress(jobId);
    p(stage, 0);
    return {
      signal,
      onWait: (sec: number) => p("wait", -1, { waitSeconds: sec }),
      onProgress: (f: number) => p(stage, f),
    };
  }

  async function finishTranscription(
    result: Awaited<ReturnType<TranscriptionEngine["transcribeAll"]>>["result"],
    pcm: string,
    meta: { source: HistoryRecord["source"]; fileName?: string; appendTo: string | null; signal: AbortSignal; onProgress: EngineOptions["onProgress"] },
  ) {
    const settings = s.settings.get();
    if (meta.appendTo) {
      return s.records.append(meta.appendTo, result, pcm, {
        keepAudio: settings.keepAudio,
        engine: { diarize: settings.diarize, numSpeakers: settings.numSpeakers, signal: meta.signal, onProgress: meta.onProgress },
      });
    }
    const record = await s.records.create(result, pcm, {
      source: meta.source,
      fileName: meta.fileName,
      keepAudio: settings.keepAudio,
      defaultTitle: s.t("historyDefaultTitle"),
    });
    return { record, warnings: [] };
  }

  // ---------- Uygulama / ayarlar ----------

  handle("appInfo", (): AppInfo => {
    const systemAudio =
      process.platform === "win32" ? "loopback" : process.platform === "darwin" ? "experimental" : parecAvailable() ? "pulse" : "none";
    return { version: app.getVersion(), platform: process.platform, arch: process.arch, systemAudio, dataDir: app.getPath("userData") };
  });

  handle("getSettings", () => s.settings.getPublic());

  handle("updateSettings", async (patch: Record<string, unknown>) => {
    const prev = s.settings.get();
    await s.settings.update(patch);
    const next = s.settings.get();
    if (patch.shortcut !== undefined && next.shortcut !== prev.shortcut && !hooks.applyShortcut(next.shortcut)) {
      await s.settings.update({ shortcut: prev.shortcut });
      hooks.applyShortcut(prev.shortcut);
      throw new AppError("shortcutInvalid");
    }
    return s.settings.getPublic();
  });

  handle("setApiKey", async (key: string | null) => {
    await s.settings.setApiKey(key);
    return s.settings.getPublic();
  });

  handle("testApiKey", async (key: string) => {
    const client = new GroqClient({
      getKey: () => key,
      baseUrl: process.env.YAZBUNU_GROQ_BASE_URL || undefined,
      fetch: ((input, init) => fetch(input, init)) as FetchLike,
      maxAttempts: 2,
    });
    await client.testKey();
  });

  // ---------- Geçmiş ----------

  handle("listHistory", (query: string) => s.history.search(query ?? ""));
  handle("getRecord", (id: string) => s.history.get(id));
  handle("deleteRecord", (id: string) => s.history.remove(id));
  handle("patchRecord", async (id: string, patch: Record<string, unknown>) => {
    const rec = await s.history.get(id);
    if (!rec) throw new AppError("statusAppendNotFound");
    const clean: Partial<HistoryRecord> = {};
    for (const [k, v] of Object.entries(patch ?? {})) if (PATCHABLE.has(k)) (clean as Record<string, unknown>)[k] = v;
    const merged: HistoryRecord = { ...rec, ...clean, updatedAt: Date.now() };
    if (clean.segments && clean.text === undefined) merged.text = joinSegmentText(merged.segments, merged.language);
    return s.history.save(merged);
  });

  // ---------- Dosyadan transkript ----------

  handle("pickAudioFile", async () => {
    const win = s.window();
    const opts: Electron.OpenDialogOptions = {
      properties: ["openFile"],
      filters: [
        { name: "Audio / Video", extensions: ["wav", "mp3", "m4a", "aac", "ogg", "oga", "opus", "flac", "webm", "mp4", "mov", "mkv", "wma", "amr", "3gp"] },
        { name: "*", extensions: ["*"] },
      ],
    };
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
  });

  handle("transcribeFile", async ({ jobId, path: input, appendTo }: { jobId: string; path: string; appendTo?: string | null }) => {
    const ctrl = startJob(jobId);
    const onProgress = progress(jobId);
    let pcm: string | null = null;
    try {
      pcm = await s.engine.decode(input, { signal: ctrl.signal, onProgress });
      const { result, warnings } = await s.engine.transcribeAll(pcm, {
        ...engineOptions(s.settings.get()),
        signal: ctrl.signal,
        onProgress,
      });
      const out = await finishTranscription(result, pcm, {
        source: "file",
        fileName: path.basename(input),
        appendTo: appendTo ?? null,
        signal: ctrl.signal,
        onProgress,
      });
      hooks.notify(s.t("notifyDoneTitle"), out.record.title);
      return { record: out.record, warnings: [...warnings, ...out.warnings] };
    } finally {
      jobs.delete(jobId);
      if (pcm) await fsp.rm(pcm, { force: true });
    }
  });

  handle("rediarize", async ({ jobId, recordId, numSpeakers }: { jobId: string; recordId: string; numSpeakers: number }) => {
    const ctrl = startJob(jobId);
    const onProgress = progress(jobId);
    let pcm: string | null = null;
    try {
      const rec = await s.history.get(recordId);
      if (!rec) throw new AppError("statusAppendNotFound");
      pcm = await s.records.decodeRecordAudio(rec, ctrl.signal);
      const diarized = await s.engine.diarize(
        pcm,
        rec.segments.map((x) => ({ ...x, speaker: null })),
        { numSpeakers, signal: ctrl.signal, onProgress },
      );
      const segments = rec.segments.some((x) => x.speaker) ? remapSpeakerIds(rec.segments, diarized, rec.duration) : diarized;
      return s.history.save({ ...rec, segments, text: joinSegmentText(segments, rec.language), updatedAt: Date.now() });
    } finally {
      jobs.delete(jobId);
      if (pcm) await fsp.rm(pcm, { force: true });
    }
  });

  handle("cancelJob", (jobId: string) => {
    jobs.get(jobId)?.abort();
    jobs.delete(jobId);
  });

  // ---------- Kayıt ----------

  handle("startRecording", async ({ source, appendTo }: { source: CaptureSource; appendTo?: string | null }) => {
    if (source !== "system" && !(await hooks.askMicAccess())) throw new AppError("micAccessError", "permission denied");
    const settings = s.settings.get();
    const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const session = new RecordingSession(id, s.engine, engineOptions(settings), settings.liveTranscription);
    const entry: SessionEntry = { session, source, appendTo: appendTo ?? null };
    const systemViaMain = process.platform === "linux" && source !== "mic";

    if (systemViaMain) {
      if (!parecAvailable()) {
        await session.cancel();
        throw new AppError("errSystemAudio", "linux");
      }
      const parec = new ParecCapture();
      entry.parec = parec;
      if (source === "meeting") entry.mixer = new StreamMixer((mixed) => session.write(mixed));
      let lastLevel = 0;
      parec.on("data", (d: Int16Array) => {
        if (entry.mixer) entry.mixer.push("b", d);
        else session.write(d);
        const now = Date.now();
        if (now - lastLevel > 50) {
          lastLevel = now;
          hooks.send("system-level", rms(d));
        }
      });
      parec.on("error", (err: Error) => hooks.send("live-chunk-error", { code: "errSystemAudio", detail: err.message }));
      parec.start();
    }

    session.on("update", (u) => hooks.send("live-update", u));
    session.on("chunkError", (e) => hooks.send("live-chunk-error", e));
    sessions.set(id, entry);
    hooks.setRecording(true);
    return { sessionId: id, systemViaMain };
  });

  ipcMain.on("pushAudio", (event, sessionId: string, buf: ArrayBuffer) => {
    if (event.sender !== s.window()?.webContents) return;
    const entry = sessions.get(sessionId);
    if (!entry || !(buf instanceof ArrayBuffer)) return;
    const samples = new Int16Array(buf);
    if (entry.mixer) entry.mixer.push("a", samples);
    else entry.session.write(samples);
  });

  ipcMain.on("setRecordingState", (event, recording: boolean) => {
    if (event.sender === s.window()?.webContents) hooks.setRecording(Boolean(recording));
  });

  function detach(sessionId: string): SessionEntry {
    const entry = sessions.get(sessionId);
    if (!entry) throw new AppError("errUnknown", "no such recording session");
    entry.parec?.stop();
    entry.mixer?.flush();
    sessions.delete(sessionId);
    hooks.setRecording(sessions.size > 0);
    return entry;
  }

  handle("stopRecording", async ({ sessionId, jobId }: { sessionId: string; jobId: string }) => {
    const entry = detach(sessionId);
    const ctrl = startJob(jobId);
    ctrl.signal.addEventListener("abort", () => entry.session.abortProcessing(), { once: true });
    const onProgress = progress(jobId);
    let pcm: string | null = entry.session.pcmPath;
    try {
      const { result, warnings } = await entry.session.stop(onProgress);
      const out = await finishTranscription(result, entry.session.pcmPath, {
        source: entry.source,
        appendTo: entry.appendTo,
        signal: ctrl.signal,
        onProgress,
      });
      hooks.notify(s.t("notifyDoneTitle"), out.record.title);
      return { record: out.record, warnings: [...warnings, ...out.warnings] };
    } finally {
      jobs.delete(jobId);
      if (pcm) await fsp.rm(pcm, { force: true });
      pcm = null;
    }
  });

  handle("cancelRecording", async (sessionId: string) => {
    if (!sessions.has(sessionId)) return;
    const entry = detach(sessionId);
    await entry.session.cancel();
  });

  // ---------- Yapay zekâ ----------

  async function patchIfRecord(recordId: string | null, patch: Partial<HistoryRecord>): Promise<void> {
    if (!recordId) return;
    const rec = await s.history.get(recordId);
    if (rec) await s.history.save({ ...rec, ...patch, updatedAt: Date.now() });
  }

  handle("summarize", async ({ jobId, recordId, text, lang }: { jobId: string; recordId: string | null; text: string; lang: string }) => {
    const ctrl = startJob(jobId);
    try {
      const summary = await s.llm.summarize(text, lang, llmCall(jobId, "summarize", ctrl.signal));
      await patchIfRecord(recordId, { summary });
      return summary;
    } finally {
      jobs.delete(jobId);
    }
  });

  handle("polish", async ({ jobId, recordId, text, lang }: { jobId: string; recordId: string | null; text: string; lang: string }) => {
    const ctrl = startJob(jobId);
    try {
      const polished = await s.llm.polish(text, lang, llmCall(jobId, "polish", ctrl.signal));
      await patchIfRecord(recordId, { polish: polished });
      return polished;
    } finally {
      jobs.delete(jobId);
    }
  });

  handle(
    "translate",
    async ({ jobId, recordId, segments, source, target }: { jobId: string; recordId: string | null; segments: Segment[]; source: string; target: string }) => {
      const ctrl = startJob(jobId);
      const p = progress(jobId);
      try {
        const texts = segments.map((x) => x.text);
        let out: string[];
        if (s.settings.get().mode === "local") {
          const src = NLLB_CODES[source];
          const tgt = NLLB_CODES[target];
          if (!src || !tgt) throw new AppError("statusTranslateError", `${source} → ${target}`);
          s.models.setExternalState("nllb", { downloading: true, error: null });
          try {
            out = await s.nllb.call<string[]>(
              { type: "translate", texts, src, tgt, cacheDir: s.models.hfCacheDir },
              {
                signal: ctrl.signal,
                onProgress: (v, stage) => {
                  if (stage === "download") s.models.setExternalState("nllb", { progress: v });
                  p(stage === "download" ? "download" : stage === "load" ? "load" : "translate", v);
                },
              },
            );
          } finally {
            s.models.setExternalState("nllb", { downloading: false });
          }
        } else {
          out = await s.llm.translate(texts, source, target, llmCall(jobId, "translate", ctrl.signal));
        }
        const translatedSegments: Segment[] = segments.map((seg, i) => ({
          start: seg.start,
          end: seg.end,
          text: out[i] ?? "",
          ...(seg.speaker ? { speaker: seg.speaker } : {}),
        }));
        const translation: Translation = {
          target_lang: target,
          text: joinSegmentText(translatedSegments, target),
          segments: translatedSegments,
        };
        await patchIfRecord(recordId, { translation });
        return translation;
      } finally {
        jobs.delete(jobId);
      }
    },
  );

  // ---------- Dosya / sistem ----------

  handle("saveTextFile", async ({ defaultName, content, ext }: { defaultName: string; content: string; ext: string }) => {
    const safeExt = ext.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "txt";
    // Testler kayıt diyaloğunu atlamak için hedef klasör verir.
    if (process.env.YAZBUNU_SAVE_DIR) {
      const file = path.join(process.env.YAZBUNU_SAVE_DIR, `${defaultName}.${safeExt}`);
      await fsp.writeFile(file, content, "utf8");
      return file;
    }
    const win = s.window();
    const opts: Electron.SaveDialogOptions = {
      defaultPath: path.join(app.getPath("documents"), `${defaultName}.${safeExt}`),
      filters: [{ name: safeExt.toUpperCase(), extensions: [safeExt] }],
    };
    const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
    if (r.canceled || !r.filePath) return null;
    await fsp.writeFile(r.filePath, content, "utf8");
    return r.filePath;
  });

  handle("copyText", (text: string) => clipboard.writeText(String(text ?? "")));

  handle("openExternal", async (url: string) => {
    if (!EXTERNAL_ALLOW.some((prefix) => String(url).startsWith(prefix))) throw new AppError("errUnknown", "blocked url");
    await shell.openExternal(url);
  });

  handle("openDataFolder", async () => {
    await shell.openPath(app.getPath("userData"));
  });

  // ---------- Modeller ----------

  handle("modelStatus", () => s.models.statuses());

  handle("downloadModel", async (id: string) => {
    if (id.startsWith("asr-")) return s.models.downloadAsr(id.slice(4) as LocalAsrModel);
    if (id === "nllb") {
      s.models.setExternalState("nllb", { downloading: true, progress: 0, error: null });
      try {
        await s.nllb.call(
          { type: "prepare", cacheDir: s.models.hfCacheDir },
          { onProgress: (v, stage) => stage === "download" && s.models.setExternalState("nllb", { progress: v }) },
        );
      } catch (err) {
        s.models.setExternalState("nllb", { error: isCancelled(err) ? null : "errModelDownload" });
        throw isCancelled(err) ? err : new AppError("errModelDownload", toPayload(err).detail);
      } finally {
        s.models.setExternalState("nllb", { downloading: false });
      }
      return;
    }
    throw new AppError("errUnknown", `unknown model ${id}`);
  });

  handle("cancelModel", (id: string) => {
    if (id === "nllb") s.nllb.kill();
    else s.models.cancel(id);
  });

  handle("deleteModel", async (id: string) => {
    if (id.startsWith("asr-")) await s.models.deleteAsr(id.slice(4) as LocalAsrModel);
    else if (id === "nllb") {
      s.nllb.kill();
      await fsp.rm(s.models.hfCacheDir, { recursive: true, force: true });
      s.models.setExternalState("nllb", { progress: 0 });
    }
  });

  s.models.on("status", (st) => hooks.send("models-status", st));
  s.settings.onChange(() => hooks.send("settings-changed", s.settings.getPublic()));
}
