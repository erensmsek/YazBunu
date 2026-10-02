// Renderer ↔ main IPC sözleşmesi. preload bunu window.yazbunu olarak açar.
import type {
  AppErrorPayload,
  AppInfo,
  CaptureSource,
  HistoryIndexEntry,
  HistoryRecord,
  JobProgress,
  LiveUpdate,
  ModelStatus,
  PublicSettings,
  Segment,
  Translation,
  UpdateInfo,
} from "./types";

/** invoke yanıtları: hata, AppError kodu ile taşınır (Electron yalnızca mesajı korur). */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: AppErrorPayload };

export interface TranscribeResponse {
  record: HistoryRecord;
  warnings: AppErrorPayload[];
}

export interface StartRecordingResponse {
  sessionId: string;
  /** Linux'ta sistem sesi main süreçte parec ile yakalanır; renderer yalnızca mikrofonu gönderir. */
  systemViaMain: boolean;
}

export interface YazbunuApi {
  appInfo(): Promise<AppInfo>;

  getSettings(): Promise<PublicSettings>;
  updateSettings(patch: Partial<PublicSettings>): Promise<PublicSettings>;
  setApiKey(key: string | null): Promise<PublicSettings>;
  testApiKey(key: string): Promise<void>;

  listHistory(query: string): Promise<HistoryIndexEntry[]>;
  getRecord(id: string): Promise<HistoryRecord | null>;
  patchRecord(id: string, patch: Partial<Pick<HistoryRecord, "title" | "segments" | "speakers" | "text" | "summary" | "polish" | "translation">>): Promise<HistoryRecord>;
  deleteRecord(id: string): Promise<void>;
  audioUrl(record: HistoryRecord): string | null;

  pathForFile(file: File): string;
  pickAudioFile(): Promise<string | null>;
  transcribeFile(args: { jobId: string; path: string; appendTo?: string | null }): Promise<TranscribeResponse>;
  rediarize(args: { jobId: string; recordId: string; numSpeakers: number }): Promise<HistoryRecord>;
  cancelJob(jobId: string): Promise<void>;

  startRecording(args: { source: CaptureSource; appendTo?: string | null }): Promise<StartRecordingResponse>;
  pushAudio(sessionId: string, samples: Int16Array): void;
  stopRecording(args: { sessionId: string; jobId: string }): Promise<TranscribeResponse>;
  cancelRecording(sessionId: string): Promise<void>;
  setRecordingState(recording: boolean): void;

  summarize(args: { jobId: string; recordId: string | null; text: string; lang: string }): Promise<string>;
  polish(args: { jobId: string; recordId: string | null; text: string; lang: string }): Promise<string>;
  translate(args: { jobId: string; recordId: string | null; segments: Segment[]; source: string; target: string }): Promise<Translation>;

  saveTextFile(args: { defaultName: string; content: string; ext: string }): Promise<string | null>;
  copyText(text: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  openDataFolder(): Promise<void>;

  modelStatus(): Promise<ModelStatus[]>;
  downloadModel(id: string): Promise<void>;
  cancelModel(id: string): Promise<void>;
  deleteModel(id: string): Promise<void>;

  on(channel: "job-progress", fn: (p: JobProgress) => void): () => void;
  on(channel: "live-update", fn: (u: LiveUpdate) => void): () => void;
  on(channel: "live-chunk-error", fn: (e: AppErrorPayload) => void): () => void;
  on(channel: "system-level", fn: (level: number) => void): () => void;
  on(channel: "models-status", fn: (s: ModelStatus[]) => void): () => void;
  on(channel: "toggle-recording", fn: () => void): () => void;
  on(channel: "update-available", fn: (u: UpdateInfo) => void): () => void;
  on(channel: "settings-changed", fn: (s: PublicSettings) => void): () => void;
}

/** invoke kanalları (preload ve main aynı listeyi kullanır). */
export const INVOKE_CHANNELS = [
  "appInfo",
  "getSettings",
  "updateSettings",
  "setApiKey",
  "testApiKey",
  "listHistory",
  "getRecord",
  "patchRecord",
  "deleteRecord",
  "pickAudioFile",
  "transcribeFile",
  "rediarize",
  "cancelJob",
  "startRecording",
  "stopRecording",
  "cancelRecording",
  "summarize",
  "polish",
  "translate",
  "saveTextFile",
  "copyText",
  "openExternal",
  "openDataFolder",
  "modelStatus",
  "downloadModel",
  "cancelModel",
  "deleteModel",
] as const;

export type InvokeChannel = (typeof INVOKE_CHANNELS)[number];

export const EVENT_CHANNELS = [
  "job-progress",
  "live-update",
  "live-chunk-error",
  "system-level",
  "models-status",
  "toggle-recording",
  "update-available",
  "settings-changed",
] as const;

export const AUDIO_PROTOCOL = "yb-audio";
