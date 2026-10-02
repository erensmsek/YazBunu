// Ayarlar: userData/settings.json. API anahtarı işletim sisteminin anahtar deposuyla
// (macOS Keychain, Windows DPAPI, Linux libsecret/kwallet) şifrelenir — Electron safeStorage.
import { promises as fsp } from "node:fs";
import path from "node:path";
import type { PublicSettings, Settings } from "../shared/types";

export interface KeyCipher {
  /** Güvenli depo kullanılabiliyor mu (Linux'ta keyring yoksa false). */
  available(): boolean;
  encrypt(plain: string): string;
  decrypt(cipher: string): string;
}

export const DEFAULT_TRANSCRIBE_MODEL = "whisper-large-v3";
export const DEFAULT_LLM_MODEL = "qwen/qwen3-32b";

export function defaultSettings(uiLang: string): Settings {
  return {
    uiLang,
    theme: "system",
    mode: "api",
    localModel: "turbo",
    groqTranscribeModel: DEFAULT_TRANSCRIBE_MODEL,
    groqLlmModel: DEFAULT_LLM_MODEL,
    transcriptionLanguage: "",
    diarize: false,
    numSpeakers: 0,
    liveTranscription: true,
    keepAudio: true,
    captureSource: "mic",
    micDeviceId: "",
    shortcut: "CommandOrControl+Shift+Y",
    // macOS'ta pencere kapanınca uygulama zaten Dock'ta yaşamaya devam eder; bu ayar Win/Linux içindir.
    closeToTray: false,
    checkUpdates: true,
    onboardingDone: false,
  };
}

interface StoredFile extends Partial<Settings> {
  apiKeyEnc?: string;
  apiKeyPlain?: string;
}

const ALLOWED_KEYS = new Set<keyof Settings>(Object.keys(defaultSettings("en")) as (keyof Settings)[]);

/** Dışarıdan gelen kısmi ayarı tip ve değer aralığına göre temizler. */
export function sanitizePatch(patch: Record<string, unknown>, base: Settings): Partial<Settings> {
  const out: Partial<Settings> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!ALLOWED_KEYS.has(k as keyof Settings)) continue;
    const key = k as keyof Settings;
    const current = base[key];
    if (typeof current !== typeof v) continue;
    (out as Record<string, unknown>)[key] = v;
  }
  if (out.mode && !["api", "local"].includes(out.mode)) delete out.mode;
  if (out.theme && !["light", "dark", "system"].includes(out.theme)) delete out.theme;
  if (out.localModel && !["tiny", "small", "turbo", "large-v3"].includes(out.localModel)) delete out.localModel;
  if (out.captureSource && !["mic", "system", "meeting"].includes(out.captureSource)) delete out.captureSource;
  if (out.numSpeakers !== undefined) out.numSpeakers = Math.max(0, Math.min(12, Math.round(out.numSpeakers)));
  for (const key of ["groqTranscribeModel", "groqLlmModel"] as const) {
    if (out[key] !== undefined) out[key] = out[key]!.trim() || defaultSettings("en")[key];
  }
  return out;
}

export class SettingsStore {
  private data: Settings;
  private apiKey: string | null = null;
  private listeners = new Set<(s: Settings) => void>();

  constructor(
    private readonly file: string,
    private readonly cipher: KeyCipher,
    defaults: Settings,
    private readonly envKey: string | null = null,
  ) {
    this.data = defaults;
  }

  async load(): Promise<void> {
    let stored: StoredFile = {};
    try {
      stored = JSON.parse(await fsp.readFile(this.file, "utf8"));
    } catch {
      stored = {};
    }
    const { apiKeyEnc, apiKeyPlain, ...rest } = stored;
    this.data = { ...this.data, ...sanitizePatch(rest as Record<string, unknown>, this.data) };
    if (apiKeyEnc) {
      try {
        this.apiKey = this.cipher.decrypt(apiKeyEnc);
      } catch {
        // Farklı kullanıcı/makineden kopyalanmış dosya: anahtar çözülemez, yeniden girilmeli.
        this.apiKey = null;
      }
    } else if (apiKeyPlain) {
      this.apiKey = apiKeyPlain;
    }
  }

  private async persist(): Promise<void> {
    const out: StoredFile = { ...this.data };
    if (this.apiKey) {
      if (this.cipher.available()) out.apiKeyEnc = this.cipher.encrypt(this.apiKey);
      else out.apiKeyPlain = this.apiKey;
    }
    await fsp.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(out, null, 2), { encoding: "utf8", mode: 0o600 });
    await fsp.rename(tmp, this.file);
  }

  get(): Settings {
    return { ...this.data };
  }

  getPublic(): PublicSettings {
    return { ...this.data, hasApiKey: Boolean(this.getApiKey()), keyStorage: this.cipher.available() ? "os" : "plain" };
  }

  /** Kayıtlı anahtar, yoksa (geliştirici için) GROQ_API_KEY ortam değişkeni. */
  getApiKey(): string | null {
    return this.apiKey || this.envKey || null;
  }

  async update(patch: Record<string, unknown>): Promise<Settings> {
    this.data = { ...this.data, ...sanitizePatch(patch, this.data) };
    await this.persist();
    for (const fn of this.listeners) fn(this.get());
    return this.get();
  }

  async setApiKey(key: string | null): Promise<void> {
    this.apiKey = key?.trim() || null;
    await this.persist();
    for (const fn of this.listeners) fn(this.get());
  }

  onChange(fn: (s: Settings) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
