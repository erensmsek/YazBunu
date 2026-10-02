// Main ve renderer arasında paylaşılan veri tipleri.

export type Mode = "api" | "local";
export type CaptureSource = "mic" | "system" | "meeting";
export type RecordSource = CaptureSource | "file";
export type LocalAsrModel = "tiny" | "small" | "turbo" | "large-v3";

export interface Word {
  start: number;
  end: number;
  word: string;
}

export interface Segment {
  start: number;
  end: number;
  text: string;
  /** Kalıcı konuşmacı kimliği ("S1", "S2"...). Görünen ad record.speakers'tan gelir. */
  speaker?: string | null;
  words?: Word[];
}

export interface TranscriptResult {
  language: string;
  text: string;
  segments: Segment[];
  duration: number;
}

export interface Translation {
  target_lang: string;
  text: string;
  segments: Segment[];
}

export interface HistoryRecord {
  id: string;
  version: 2;
  title: string;
  createdAt: number;
  updatedAt: number;
  language: string;
  duration: number;
  text: string;
  segments: Segment[];
  /** Konuşmacı kimliği → kullanıcının verdiği ad. */
  speakers: Record<string, string>;
  translation: Translation | null;
  summary: string | null;
  polish: string | null;
  /** history/audio altındaki dosya adı (saklanıyorsa). */
  audioFile: string | null;
  source: RecordSource;
  fileName?: string;
}

export interface HistoryIndexEntry {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  language: string;
  duration: number;
  hasAudio: boolean;
  preview: string;
}

export interface Settings {
  uiLang: string;
  theme: "light" | "dark" | "system";
  mode: Mode;
  localModel: LocalAsrModel;
  groqTranscribeModel: string;
  groqLlmModel: string;
  /** Boş = otomatik algıla. */
  transcriptionLanguage: string;
  diarize: boolean;
  /** 0 = otomatik. */
  numSpeakers: number;
  liveTranscription: boolean;
  keepAudio: boolean;
  captureSource: CaptureSource;
  micDeviceId: string;
  shortcut: string;
  closeToTray: boolean;
  checkUpdates: boolean;
  onboardingDone: boolean;
}

/** Renderer'a gönderilen ayarlar: anahtarın kendisi değil, yalnızca var olup olmadığı. */
export interface PublicSettings extends Settings {
  hasApiKey: boolean;
  keyStorage: "os" | "plain";
}

export type JobStage =
  | "decode"
  | "transcribe"
  | "diarize"
  | "translate"
  | "summarize"
  | "polish"
  | "download"
  | "extract"
  | "wait"
  | "load";

export interface JobProgress {
  jobId: string;
  stage: JobStage;
  /** 0..1, belirsizse -1. */
  progress: number;
  /** Kota beklemesi gibi durumlarda saniye cinsinden kalan süre. */
  waitSeconds?: number;
}

export interface ModelStatus {
  id: string;
  kind: "asr" | "translate" | "bundled";
  sizeBytes: number;
  installed: boolean;
  downloading: boolean;
  progress: number;
  error: string | null;
}

export interface AppInfo {
  version: string;
  platform: NodeJS.Platform;
  arch: string;
  systemAudio: "loopback" | "pulse" | "experimental" | "none";
  dataDir: string;
}

export interface LiveUpdate {
  sessionId: string;
  segments: Segment[];
  language: string;
  /** Kuyrukta bekleyen (henüz yazıya dökülmemiş) saniye. */
  pendingSeconds: number;
}

export interface UpdateInfo {
  latest: string;
  url: string;
}

/** Kullanıcıya gösterilebilir hata: code i18n anahtarıdır, detail teknik ek bilgidir. */
export interface AppErrorPayload {
  code: string;
  detail?: string;
}
