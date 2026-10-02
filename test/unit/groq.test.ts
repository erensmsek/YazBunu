import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attachWords, buildMultipart, GroqClient, isLikelyHallucination, parseResetDuration } from "../../src/main/groq";
import { wavFromPcm } from "../../src/main/audio";
import { startMockGroq, type MockGroq } from "../helpers/mock-groq";

let mock: MockGroq;
beforeAll(async () => {
  mock = await startMockGroq();
});
afterAll(() => mock.close());

const client = (key = "test-key") => new GroqClient({ getKey: () => key, baseUrl: mock.url, maxWaitSeconds: 5 });
const wav = (sec: number) => wavFromPcm(new Uint8Array(sec * 32000));

describe("yardımcılar", () => {
  it("Groq süre başlıklarını çözer", () => {
    expect(parseResetDuration("2")).toBe(2);
    expect(parseResetDuration("1m30.5s")).toBeCloseTo(90.5);
    expect(parseResetDuration("450ms")).toBeCloseTo(0.45);
    expect(parseResetDuration("2h")).toBe(7200);
    expect(parseResetDuration(null)).toBeNull();
    expect(parseResetDuration("abc")).toBeNull();
  });

  it("multipart gövdesi dizi alanları tekrarlar", () => {
    const { body, contentType } = buildMultipart({ a: "1", "b[]": ["x", "y"] }, { field: "file", name: "f.wav", data: new Uint8Array([1, 2]), type: "audio/wav" });
    const text = Buffer.from(body).toString("latin1");
    expect(contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(text.match(/name="b\[\]"/g)).toHaveLength(2);
    expect(text).toContain('filename="f.wav"');
  });

  it("halüsinasyon filtresi", () => {
    expect(isLikelyHallucination({ start: 0, end: 1, text: "Altyazı M.K.", no_speech_prob: 0.9, avg_logprob: -1.5 })).toBe(true);
    expect(isLikelyHallucination({ start: 0, end: 1, text: "Merhaba", no_speech_prob: 0.9, avg_logprob: -0.3 })).toBe(false);
    expect(isLikelyHallucination({ start: 0, end: 1, text: "  " })).toBe(true);
  });

  it("kelimeleri segmentlere dağıtır", () => {
    const segs = attachWords(
      [
        { start: 0, end: 2, text: "a b" },
        { start: 2, end: 4, text: "c" },
      ],
      [
        { word: "a", start: 0, end: 1 },
        { word: "b", start: 1, end: 2 },
        { word: "c", start: 2.1, end: 3 },
      ],
    );
    expect(segs[0].words?.map((w) => w.word)).toEqual(["a", "b"]);
    expect(segs[1].words?.map((w) => w.word)).toEqual(["c"]);
  });
});

describe("GroqClient", () => {
  it("transkript: verbose_json, kelime zaman damgası, dil normalizasyonu", async () => {
    const res = await client().transcribe(wav(8), { model: "whisper-large-v3", prompt: "önceki" });
    expect(res.language).toBe("tr");
    expect(res.segments.length).toBe(2);
    expect(res.segments[0].words?.length).toBeGreaterThan(0);
    const req = mock.requests.at(-1)!;
    expect(req.fields.model).toEqual(["whisper-large-v3"]);
    expect(req.fields.response_format).toEqual(["verbose_json"]);
    expect(req.fields["timestamp_granularities[]"]).toEqual(["segment", "word"]);
    expect(req.fields.prompt).toEqual(["önceki"]);
    expect(req.fileBytes).toBe(8 * 32000 + 44);
  });

  it("anahtar yoksa errNoApiKey", async () => {
    await expect(client("").transcribe(wav(1), { model: "m" })).rejects.toMatchObject({ code: "errNoApiKey" });
  });

  it("401 → errInvalidKey", async () => {
    await expect(client("bad").chat({ model: "m", system: "s", user: "u", maxTokens: 10 })).rejects.toMatchObject({ code: "errInvalidKey" });
  });

  it("429'da retry-after kadar bekleyip yeniden dener", async () => {
    mock.failNext({ status: 429, headers: { "retry-after": "1" } });
    const waits: number[] = [];
    const t0 = Date.now();
    const res = await client().chat({ model: "m", system: "x", user: "merhaba", maxTokens: 10, onWait: (s) => waits.push(s) });
    expect(res.content).toContain("merhaba");
    expect(waits).toEqual([1]);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(1000);
  });

  it("çok uzun kota beklemesinde errRateLimit", async () => {
    mock.failNext({ status: 429, headers: { "retry-after": "3600" } });
    await expect(client().chat({ model: "m", system: "x", user: "u", maxTokens: 10 })).rejects.toMatchObject({ code: "errRateLimit" });
  });

  it("kaldırılmış model → errModelGone", async () => {
    mock.failNext({ status: 400, body: { error: { message: "decommissioned", code: "model_decommissioned" } } });
    await expect(client().chat({ model: "old", system: "x", user: "u", maxTokens: 10 })).rejects.toMatchObject({ code: "errModelGone" });
  });

  it("5xx'te yeniden dener", async () => {
    mock.failNext({ status: 503 });
    const res = await client().chat({ model: "m", system: "x", user: "tekrar", maxTokens: 10 });
    expect(res.content).toContain("tekrar");
  });

  it("muhakeme parametreleri ve <think> temizliği", async () => {
    await client().chat({ model: "qwen/qwen3-32b", system: "x", user: "u", maxTokens: 10 });
    expect(mock.requests.at(-1)!.json!.reasoning_effort).toBe("none");
    await client().chat({ model: "openai/gpt-oss-120b", system: "x", user: "u", maxTokens: 10 });
    expect(mock.requests.at(-1)!.json!.reasoning_effort).toBe("low");
    await client().chat({ model: "llama", system: "x", user: "u", maxTokens: 10 });
    expect(mock.requests.at(-1)!.json!.reasoning_effort).toBeUndefined();
  });

  it("iptal edilince CANCELLED", async () => {
    const ctrl = new AbortController();
    mock.failNext({ status: 429, headers: { "retry-after": "3" } });
    const p = client().chat({ model: "m", system: "x", user: "u", maxTokens: 10, signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 200);
    await expect(p).rejects.toMatchObject({ code: "statusCancelled" });
  });

  it("ağ hatası → errNetwork", async () => {
    const c = new GroqClient({ getKey: () => "test-key", baseUrl: "http://127.0.0.1:1", maxAttempts: 2 });
    await expect(c.testKey()).rejects.toMatchObject({ code: "errNetwork" });
  });
});
