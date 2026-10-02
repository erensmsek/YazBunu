// Özet, başlıklandırma/iyileştirme ve API çevirisi. Uzun metinler parçalanır; hiçbir çıktı sessizce kesilmez.
import { AppError } from "./errors";
import type { CallOptions, ChatResult, GroqClient } from "./groq";
import { batchByChars, estimateTokens, splitText } from "../shared/chunking";
import { langNameEn } from "../shared/lang";

/** Groq modeli kaldırırsa denenen yedekler. */
export const FALLBACK_LLM_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile"];

// Karakter bütçeleri: ücretsiz katmanın dakikalık token sınırına (TPM) sığacak şekilde.
export const SUMMARY_CHUNK_CHARS = 9000;
export const POLISH_CHUNK_CHARS = 6000;
export const TRANSLATE_BATCH_CHARS = 3500;
const MAX_SPLIT_DEPTH = 4;

export interface LlmCallOptions extends CallOptions {
  onProgress?: (fraction: number) => void;
}

export function summaryPrompt(langName: string, sentences: string): string {
  return (
    `Sen bir özetleme asistanısın. Verilen konuşma metnini ${langName} olarak ${sentences} özetle. ` +
    "Konuşmacının anlattıklarını doğal ve akıcı bir dille aktar; resmi bir haber spikeri ya da " +
    "rapor diliyle değil, konuşmanın tonunu koruyarak yaz. Kalıplaşmış, mesafeli ifadelerden " +
    "kaçın — sanki birine az önce anlatılanı doğal bir şekilde aktarıyormuş gibi yaz. " +
    `KESİNLİKLE sadece ${langName} yaz; başka hiçbir dile çevirme veya başka dilde metin ekleme. ` +
    "Sadece özeti ver, giriş cümlesi veya açıklama ekleme."
  );
}

export function summaryNotesPrompt(langName: string): string {
  return (
    `Sen bir not alma asistanısın. Sana uzun bir konuşmanın bir BÖLÜMÜ verilecek. ` +
    `Bu bölümde konuşulan önemli noktaları, kararları ve somut bilgileri (isim, sayı, tarih) ` +
    `${langName} olarak 3-8 kısa madde halinde yaz. Her madde '- ' ile başlasın. ` +
    `KESİNLİKLE sadece ${langName} yaz. Giriş veya açıklama ekleme.`
  );
}

export function polishPrompt(langName: string, continuation: boolean): string {
  const head =
    `Sen bir metin editörüsün. Sana verilen konuşma transkriptini Markdown formatında, düzgün ` +
    `dilbilgisiyle yeniden yaz. Anlamı ve içeriği değiştirme, hiçbir bilgiyi çıkarma veya ekleme, ` +
    `sadece başlık, noktalama ve akıcılığı düzelt. KESİNLİKLE sadece ${langName} yaz.\n\n` +
    "Markdown kuralları:\n";
  const titleRule = continuation
    ? "- Bu metin, daha önce başlıklandırılmış uzun bir transkriptin DEVAMIDIR: '# ' ile H1 başlık EKLEME. " +
      "Yeni bir konuya geçiliyorsa '## ' ile alt başlık ekleyebilirsin.\n"
    : "- Başlığı '# ' ile bir H1 başlığı yap; başlık metnin konusunu somut ve bilgilendirici " +
      "şekilde yansıtsın (yalnızca bir isim veya genel bir etiket değil, ne anlatıldığını " +
      "belirten açıklayıcı bir başlık olsun).\n" +
      "- Metin birden fazla konuya değiniyorsa, uygun yerlerde '## ' ile alt başlıklar ekle.\n";
  return (
    head +
    titleRule +
    "- Vurgulanması gereken önemli kavramları *italik* yap.\n" +
    "- Model adları, dosya adları, kütüphane adları, teknoloji isimleri gibi teknik terimleri " +
    "`kod` (backtick) formatında yaz.\n" +
    "- Gerekirse madde işaretli liste (- ) kullan.\n" +
    "- Metnin tamamını işle; hiçbir bölümü atlama veya kısaltma.\n" +
    "- Sadece geçerli Markdown çıktısı ver, başka hiçbir açıklama veya yorum ekleme."
  );
}

export function translatePrompt(sourceName: string, targetName: string): string {
  return (
    `You are a professional translator. Translate each value in the given JSON ` +
    `object from ${sourceName} to ${targetName}. ` +
    "Return ONLY a valid JSON object with the exact same keys, where each value is " +
    "the translation of the corresponding input value. Do not add, remove, merge or " +
    "reorder keys. Do not add any commentary. Translate naturally and accurately, " +
    `outputting strictly in ${targetName}.`
  );
}

function isSplittable(err: unknown): boolean {
  return err instanceof AppError && err.code === "errTooLarge";
}

export class LlmService {
  private workingModel: string | null = null;

  constructor(
    private readonly groq: GroqClient,
    private readonly getModel: () => string,
  ) {}

  /** Kullanıcının modeli kaldırılmışsa yedek modellere geçer ve oturum boyunca onu kullanır. */
  private async chat(
    req: { system: string; user: string; maxTokens: number; temperature?: number; json?: boolean },
    call: CallOptions,
  ): Promise<ChatResult> {
    const preferred = this.getModel();
    const chain = [this.workingModel ?? preferred, preferred, ...FALLBACK_LLM_MODELS].filter(
      (m, i, arr) => m && arr.indexOf(m) === i,
    );
    let lastErr: unknown = null;
    for (const model of chain) {
      try {
        const res = await this.groq.chat({ ...req, model, signal: call.signal, onWait: call.onWait });
        if (model !== preferred) this.workingModel = model;
        return res;
      } catch (err) {
        if (err instanceof AppError && err.code === "errModelGone") {
          lastErr = err;
          continue;
        }
        throw err;
      }
    }
    throw lastErr ?? new AppError("errModelGone", preferred);
  }

  async summarize(text: string, lang: string, call: LlmCallOptions = {}): Promise<string> {
    const langName = langNameEn(lang);
    const chunks = splitText(text, SUMMARY_CHUNK_CHARS);
    if (!chunks.length) throw new AppError("errNoSpeech");
    if (chunks.length === 1) {
      const res = await this.chat(
        { system: summaryPrompt(langName, "3-4 cümlede"), user: `Aşağıdaki metni özetle:\n\n${chunks[0]}`, maxTokens: 500 },
        call,
      );
      call.onProgress?.(1);
      return res.content;
    }
    // Map: her bölümden not çıkar. Reduce: notlardan tek özet.
    let notes: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const res = await this.chat(
        { system: summaryNotesPrompt(langName), user: chunks[i], maxTokens: 600, temperature: 0.3 },
        call,
      );
      notes.push(res.content);
      call.onProgress?.((i + 1) / (chunks.length + 1));
    }
    // Notlar da çok uzunsa (çok uzun kayıt) notları da gruplayıp yoğunlaştır.
    while (notes.join("\n").length > SUMMARY_CHUNK_CHARS) {
      const groups = splitText(notes.join("\n\n"), SUMMARY_CHUNK_CHARS);
      const condensed: string[] = [];
      for (const g of groups) {
        const res = await this.chat({ system: summaryNotesPrompt(langName), user: g, maxTokens: 600, temperature: 0.3 }, call);
        condensed.push(res.content);
      }
      if (condensed.join("\n").length >= notes.join("\n").length) break;
      notes = condensed;
    }
    const res = await this.chat(
      {
        system: summaryPrompt(langName, "5-8 cümlede"),
        user: `Aşağıdaki notlar uzun bir konuşmanın sırasıyla bölümlerinden çıkarıldı. Konuşmanın tamamını özetle:\n\n${notes.join("\n\n")}`,
        maxTokens: 800,
      },
      call,
    );
    call.onProgress?.(1);
    return res.content;
  }

  private async polishChunk(chunk: string, langName: string, continuation: boolean, call: CallOptions, depth = 0): Promise<string> {
    const maxTokens = Math.min(8000, Math.ceil(estimateTokens(chunk) * 1.7) + 300);
    try {
      const res = await this.chat(
        { system: polishPrompt(langName, continuation), user: `Transkript:\n\n${chunk}`, maxTokens },
        call,
      );
      if (res.finishReason !== "length") return res.content;
      if (depth >= MAX_SPLIT_DEPTH) throw new AppError("errGroq", "output truncated");
    } catch (err) {
      if (!isSplittable(err) || depth >= MAX_SPLIT_DEPTH) throw err;
    }
    // Çıktı kesildi ya da istek çok büyük: ikiye bölüp ayrı ayrı işle.
    const halves = splitText(chunk, Math.ceil(chunk.length / 2) + 1);
    const parts: string[] = [];
    for (let i = 0; i < halves.length; i++) {
      parts.push(await this.polishChunk(halves[i], langName, continuation || i > 0, call, depth + 1));
    }
    return parts.join("\n\n");
  }

  async polish(text: string, lang: string, call: LlmCallOptions = {}): Promise<string> {
    const langName = langNameEn(lang);
    const chunks = splitText(text, POLISH_CHUNK_CHARS);
    if (!chunks.length) throw new AppError("errNoSpeech");
    const parts: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      parts.push(await this.polishChunk(chunks[i], langName, i > 0, call));
      call.onProgress?.((i + 1) / chunks.length);
    }
    return parts.join("\n\n");
  }

  private async translateBatch(
    texts: string[],
    sourceName: string,
    targetName: string,
    call: CallOptions,
    depth = 0,
  ): Promise<string[]> {
    if (!texts.length) return [];
    const numbered: Record<string, string> = {};
    texts.forEach((t, i) => (numbered[String(i)] = t));
    const user = JSON.stringify(numbered);
    const maxTokens = Math.min(8000, Math.ceil(estimateTokens(user) * 3) + 200);

    let parsed: Record<string, unknown> | null = null;
    try {
      const res = await this.chat(
        { system: translatePrompt(sourceName, targetName), user, maxTokens, temperature: 0.2, json: true },
        call,
      );
      if (res.finishReason !== "length") {
        try {
          const obj = JSON.parse(res.content);
          if (obj && typeof obj === "object") parsed = obj as Record<string, unknown>;
        } catch {
          parsed = null;
        }
      }
    } catch (err) {
      if (!isSplittable(err) && !(err instanceof AppError && err.code === "errGroq")) throw err;
    }

    const missing = parsed ? texts.filter((_, i) => typeof parsed![String(i)] !== "string").length : texts.length;
    if (parsed && missing === 0) return texts.map((_, i) => String(parsed![String(i)]));

    if (texts.length === 1 || depth >= MAX_SPLIT_DEPTH) {
      if (texts.length === 1) {
        // Tek segment JSON'da bile başarısızsa düz metin çevirisi iste.
        const res = await this.chat(
          {
            system: `Translate the user's text from ${sourceName} to ${targetName}. Output only the translation.`,
            user: texts[0],
            maxTokens: Math.min(4000, estimateTokens(texts[0]) * 3 + 100),
            temperature: 0.2,
          },
          call,
        );
        return [res.content];
      }
      // Derinlik sınırı: bulunanları kullan, eksikleri tek tek çevir.
      const out: string[] = [];
      for (let i = 0; i < texts.length; i++) {
        const v = parsed?.[String(i)];
        out.push(typeof v === "string" ? v : (await this.translateBatch([texts[i]], sourceName, targetName, call, depth + 1))[0]);
      }
      return out;
    }
    const mid = Math.ceil(texts.length / 2);
    const left = await this.translateBatch(texts.slice(0, mid), sourceName, targetName, call, depth + 1);
    const right = await this.translateBatch(texts.slice(mid), sourceName, targetName, call, depth + 1);
    return [...left, ...right];
  }

  async translate(texts: string[], sourceLang: string, targetLang: string, call: LlmCallOptions = {}): Promise<string[]> {
    const sourceName = langNameEn(sourceLang, sourceLang || "the source language");
    const targetName = langNameEn(targetLang, targetLang);
    const out: string[] = texts.map(() => "");
    // Boş segmentler modele gönderilmez (anahtar düşürmeye yol açabiliyor).
    const idx = texts.map((t, i) => (t.trim() ? i : -1)).filter((i) => i >= 0);
    const items = idx.map((i) => texts[i]);
    const batches = batchByChars(items, TRANSLATE_BATCH_CHARS);
    for (let b = 0; b < batches.length; b++) {
      const [s, e] = batches[b];
      const translated = await this.translateBatch(items.slice(s, e), sourceName, targetName, call);
      translated.forEach((t, i) => (out[idx[s + i]] = t.trim()));
      call.onProgress?.((b + 1) / batches.length);
    }
    return out;
  }
}
