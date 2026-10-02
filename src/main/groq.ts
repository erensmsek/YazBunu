// Groq (OpenAI uyumlu) API istemcisi. Electron'dan bağımsızdır (fetch enjekte edilir) → unit test edilebilir.
import { AppError, CANCELLED, sleep } from "./errors";
import { normalizeLanguage } from "../shared/lang";
import type { Segment, Word } from "../shared/types";

export const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface GroqOptions {
  getKey: () => string | null;
  baseUrl?: string;
  fetch?: FetchLike;
  /** Toplam deneme sayısı (ilk istek dahil). */
  maxAttempts?: number;
  /** Bundan uzun kota beklemesi gerekiyorsa beklemek yerine hata ver. */
  maxWaitSeconds?: number;
  timeoutMs?: number;
}

export interface CallOptions {
  signal?: AbortSignal;
  /** Kota (429) beklemesi başladığında saniye cinsinden çağrılır. */
  onWait?: (seconds: number) => void;
}

export interface TranscribeOptions extends CallOptions {
  model: string;
  language?: string;
  /** Önceki parçanın sonu: Whisper'a bağlam verir (cümle bölünmelerini azaltır). */
  prompt?: string;
}

export interface ChunkTranscript {
  language: string;
  text: string;
  segments: Segment[];
  duration: number;
}

export interface ChatOptions extends CallOptions {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  json?: boolean;
}

export interface ChatResult {
  content: string;
  finishReason: string;
}

/** "1m30.5s", "2.3s", "450ms" gibi Groq süre başlıklarını saniyeye çevirir. */
export function parseResetDuration(value: string | null): number | null {
  if (!value) return null;
  const v = value.trim();
  if (/^\d+(\.\d+)?$/.test(v)) return parseFloat(v);
  let total = 0;
  let matched = false;
  const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(v))) {
    matched = true;
    const n = parseFloat(m[1]);
    total += m[2] === "h" ? n * 3600 : m[2] === "m" ? n * 60 : m[2] === "s" ? n : n / 1000;
  }
  return matched ? total : null;
}

/** Basit multipart/form-data gövdesi (Electron net.fetch ile de çalışsın diye elle kurulur). */
export function buildMultipart(
  fields: Record<string, string | string[]>,
  file: { name: string; field: string; data: Uint8Array; type: string },
): { body: Uint8Array; contentType: string } {
  const boundary = "----yazbunu" + Math.random().toString(16).slice(2) + Date.now().toString(16);
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  for (const [key, value] of Object.entries(fields)) {
    for (const v of Array.isArray(value) ? value : [value]) {
      parts.push(enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${v}\r\n`));
    }
  }
  parts.push(
    enc.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`,
    ),
  );
  parts.push(file.data);
  parts.push(enc.encode(`\r\n--${boundary}--\r\n`));
  const size = parts.reduce((n, p) => n + p.length, 0);
  const body = new Uint8Array(size);
  let off = 0;
  for (const p of parts) {
    body.set(p, off);
    off += p.length;
  }
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

interface RawSegment {
  start: number;
  end: number;
  text: string;
  no_speech_prob?: number;
  avg_logprob?: number;
}

/** Whisper'ın sessizlik/gürültüde uydurduğu segmentleri ayıklar. */
export function isLikelyHallucination(seg: RawSegment): boolean {
  const text = seg.text.trim();
  if (!text) return true;
  const noSpeech = seg.no_speech_prob ?? 0;
  const logprob = seg.avg_logprob ?? 0;
  return noSpeech > 0.6 && logprob < -1.0;
}

/** Üst düzey kelime listesini segmentlere zamana göre dağıtır. */
export function attachWords(segments: Segment[], words: Word[]): Segment[] {
  if (!words.length) return segments;
  let wi = 0;
  return segments.map((seg, si) => {
    const nextStart = segments[si + 1]?.start ?? Infinity;
    const own: Word[] = [];
    while (wi < words.length) {
      const w = words[wi];
      const mid = (w.start + w.end) / 2;
      if (mid < seg.start - 0.5) {
        wi++;
        continue;
      }
      if (mid >= nextStart && si < segments.length - 1) break;
      own.push(w);
      wi++;
    }
    return own.length ? { ...seg, words: own } : seg;
  });
}

export class GroqClient {
  private readonly opts: Required<Omit<GroqOptions, "getKey">> & Pick<GroqOptions, "getKey">;

  constructor(opts: GroqOptions) {
    this.opts = {
      baseUrl: DEFAULT_BASE_URL,
      fetch: (input, init) => fetch(input, init),
      maxAttempts: 5,
      maxWaitSeconds: 90,
      timeoutMs: 180_000,
      ...opts,
    };
  }

  private key(): string {
    const key = this.opts.getKey()?.trim();
    if (!key) throw new AppError("errNoApiKey");
    return key;
  }

  /** Yeniden deneme + kota beklemesi + hata eşleme ile tek HTTP çağrısı. */
  private async request(path: string, init: RequestInit, call: CallOptions): Promise<Response> {
    const { maxAttempts, maxWaitSeconds, timeoutMs } = this.opts;
    let lastNetworkError: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (call.signal?.aborted) throw new AppError(CANCELLED);
      const ctrl = new AbortController();
      const onAbort = () => ctrl.abort();
      call.signal?.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      let resp: Response;
      try {
        resp = await this.opts.fetch(this.opts.baseUrl + path, {
          ...init,
          headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${this.key()}` },
          signal: ctrl.signal,
        });
      } catch (err) {
        if (call.signal?.aborted) throw new AppError(CANCELLED);
        if (err instanceof AppError) throw err;
        // Ağ hatası / zaman aşımı: kısa bekleyip tekrar dene.
        lastNetworkError = err;
        if (attempt < Math.min(maxAttempts, 3)) {
          await sleep(1000 * attempt, call.signal);
          continue;
        }
        throw new AppError("errNetwork", err instanceof Error ? err.message : String(err));
      } finally {
        clearTimeout(timer);
        call.signal?.removeEventListener("abort", onAbort);
      }

      if (resp.ok) return resp;

      const status = resp.status;
      const bodyText = await resp.text().catch(() => "");
      let detail = bodyText.slice(0, 300);
      let code = "";
      try {
        const parsed = JSON.parse(bodyText);
        detail = parsed?.error?.message ?? detail;
        code = parsed?.error?.code ?? "";
      } catch {
        /* JSON değil */
      }

      if (status === 401 || status === 403) throw new AppError("errInvalidKey");
      if (code === "model_not_found" || code === "model_decommissioned" || status === 404) {
        throw new AppError("errModelGone", detail);
      }
      if (status === 413) throw new AppError("errTooLarge", detail);
      if (status === 429) {
        const wait =
          parseResetDuration(resp.headers.get("retry-after")) ??
          parseResetDuration(resp.headers.get("x-ratelimit-reset-tokens")) ??
          parseResetDuration(resp.headers.get("x-ratelimit-reset-requests")) ??
          Math.min(60, 4 * attempt);
        // Günlük kota bitmişse saatlerce beklemek anlamsız.
        if (wait > maxWaitSeconds || attempt === maxAttempts) throw new AppError("errRateLimit", detail);
        call.onWait?.(Math.ceil(wait));
        await sleep(Math.ceil(wait * 1000) + 250, call.signal);
        continue;
      }
      if (status >= 500 && attempt < Math.min(maxAttempts, 3)) {
        await sleep(1500 * attempt, call.signal);
        continue;
      }
      throw new AppError("errGroq", `${status} ${detail}`.trim());
    }
    throw new AppError("errNetwork", String(lastNetworkError ?? "unknown"));
  }

  async transcribe(wav: Uint8Array, opts: TranscribeOptions): Promise<ChunkTranscript> {
    const fields: Record<string, string | string[]> = {
      model: opts.model,
      response_format: "verbose_json",
      temperature: "0",
      "timestamp_granularities[]": ["segment", "word"],
    };
    if (opts.language) fields.language = opts.language;
    if (opts.prompt) fields.prompt = opts.prompt;
    const { body, contentType } = buildMultipart(fields, {
      field: "file",
      name: "audio.wav",
      data: wav,
      type: "audio/wav",
    });
    const resp = await this.request(
      "/audio/transcriptions",
      { method: "POST", headers: { "Content-Type": contentType }, body: body as unknown as BodyInit },
      opts,
    );
    const payload = (await resp.json()) as {
      language?: string;
      text?: string;
      duration?: number;
      segments?: RawSegment[];
      words?: { word: string; start: number; end: number }[];
    };
    const segments: Segment[] = (payload.segments ?? [])
      .filter((s) => !isLikelyHallucination(s))
      .map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }));
    const words: Word[] = (payload.words ?? []).map((w) => ({ word: w.word, start: w.start, end: w.end }));
    const withWords = attachWords(segments, words);
    return {
      language: normalizeLanguage(payload.language),
      text: withWords.map((s) => s.text).join(" ").trim(),
      segments: withWords,
      duration: payload.duration ?? 0,
    };
  }

  async chat(opts: ChatOptions): Promise<ChatResult> {
    const body: Record<string, unknown> = {
      model: opts.model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens,
    };
    // Muhakeme ("thinking") modelleri: görevlerimiz muhakeme gerektirmiyor, kapat/kıs.
    if (/qwen3/i.test(opts.model)) body.reasoning_effort = "none";
    else if (/gpt-oss/i.test(opts.model)) body.reasoning_effort = "low";
    if (opts.json) body.response_format = { type: "json_object" };

    const resp = await this.request(
      "/chat/completions",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      opts,
    );
    const data = (await resp.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
    };
    const choice = data.choices?.[0];
    const raw = choice?.message?.content ?? "";
    // Bazı modeller muhakemeyi içerikte <think> etiketiyle döndürür.
    const content = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    return { content, finishReason: choice?.finish_reason ?? "stop" };
  }

  /** Anahtarı doğrular (ücretsiz uç: model listesi). */
  async testKey(signal?: AbortSignal): Promise<void> {
    await this.request("/models", { method: "GET" }, { signal });
  }
}
