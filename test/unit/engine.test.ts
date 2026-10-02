import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { TranscriptionEngine, type EngineOptions } from "../../src/main/engine";
import { GroqClient } from "../../src/main/groq";
import { startMockGroq, type MockGroq } from "../helpers/mock-groq";
import { FFMPEG, fixturePcm, mlHost, testModels, tmpDir } from "../helpers/env";
import type { WorkerHost } from "../../src/main/worker-host";

let mock: MockGroq;
let ml: WorkerHost;
let engine: TranscriptionEngine;
const dir = tmpDir("yb-engine-");

const base: EngineOptions = { mode: "api", localModel: "tiny", transcribeModel: "whisper-large-v3", language: "", diarize: false, numSpeakers: 0 };

/** Konuşma benzeri (gürültü patlamaları) + düzenli sessizlik içeren uzun PCM. */
function syntheticPcm(totalSec: number, file: string): string {
  const sr = 16000;
  const buf = Buffer.alloc(totalSec * sr * 2);
  for (let i = 0; i < totalSec * sr; i++) {
    const t = i / sr;
    const speaking = t % 50 < 48; // her 50 sn'de 2 sn sessizlik
    const v = speaking ? Math.round((Math.random() * 2 - 1) * 8000) : 0;
    buf.writeInt16LE(v, i * 2);
  }
  writeFileSync(file, buf);
  return file;
}

beforeAll(async () => {
  mock = await startMockGroq();
  ml = mlHost();
  const groq = new GroqClient({ getKey: () => "test-key", baseUrl: mock.url, maxWaitSeconds: 5 });
  engine = new TranscriptionEngine({ ffmpeg: FFMPEG, tmpDir: dir, groq, ml, models: testModels() });
});
afterAll(async () => {
  ml.kill();
  await mock.close();
});

describe("API modu", () => {
  it("22 dakikalık sesi ≤10 dk parçalara böler, zaman damgalarını kaydırır, bağlamı aktarır", async () => {
    const pcm = syntheticPcm(22 * 60, path.join(dir, "long.pcm"));
    const before = mock.requests.length;
    const stages: string[] = [];
    const { result } = await engine.transcribeAll(pcm, { ...base, onProgress: (s) => stages.push(s) });
    const calls = mock.requests.slice(before).filter((r) => r.path === "/audio/transcriptions");
    expect(calls.length).toBe(3);
    for (const c of calls) expect(c.fileBytes).toBeLessThan(25 * 1024 * 1024);
    // İkinci istek, ilk parçanın son metnini prompt olarak taşımalı
    expect(calls[1].fields.prompt?.[0]).toMatch(/Parça 0 cümle \d+\.$/);
    expect(result.language).toBe("tr");
    expect(result.duration).toBeCloseTo(1320, 0);
    for (let i = 1; i < result.segments.length; i++) expect(result.segments[i].start).toBeGreaterThanOrEqual(result.segments[i - 1].start);
    expect(result.segments.at(-1)!.end).toBeGreaterThan(1200);
    expect(result.text).toContain("Parça 2");
    expect(stages).toContain("transcribe");
  });

  it("dil ipucu Groq'a iletilir", async () => {
    const pcm = syntheticPcm(10, path.join(dir, "short.pcm"));
    await engine.transcribeAll(pcm, { ...base, language: "en" });
    expect(mock.requests.at(-1)!.fields.language).toEqual(["en"]);
  });

  it("tamamen sessiz kayıtta errNoSpeech (Groq'a hiç gitmez)", async () => {
    const file = path.join(dir, "silent.pcm");
    writeFileSync(file, Buffer.alloc(16000 * 2 * 5));
    const before = mock.requests.length;
    await expect(engine.transcribeAll(file, base)).rejects.toMatchObject({ code: "errNoSpeech" });
    expect(mock.requests.length).toBe(before);
  });

  it("kota beklemesini ilerleme olarak bildirir", async () => {
    const pcm = syntheticPcm(10, path.join(dir, "rl.pcm"));
    mock.failNext({ status: 429, headers: { "retry-after": "1" } });
    const waits: number[] = [];
    await engine.transcribeAll(pcm, { ...base, onProgress: (s, _f, extra) => s === "wait" && waits.push(extra?.waitSeconds ?? 0) });
    expect(waits).toEqual([1]);
  });
});

describe("offline mod (gerçek Whisper tiny)", () => {
  it("İngilizce konuşmayı yazıya döker ve dili algılar", async () => {
    const pcm = await fixturePcm("1.wav", dir);
    const progress: number[] = [];
    const { result } = await engine.transcribeAll(pcm, { ...base, mode: "local", onProgress: (s, f) => s === "transcribe" && progress.push(f) });
    expect(result.language).toBe("en");
    const text = result.text.toLowerCase();
    expect(text).toMatch(/consequence/);
    expect(text).toMatch(/heaven/);
    expect(result.segments.length).toBeGreaterThan(0);
    expect(progress.at(-1)).toBeGreaterThan(0.5);
  }, 120000);

  it("iptal worker'ı durdurur, sonraki istek yeniden başlatılan worker'la çalışır", async () => {
    const pcm = await fixturePcm("1.wav", dir);
    const ctrl = new AbortController();
    const p = engine.transcribeAll(pcm, { ...base, mode: "local", signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 300);
    await expect(p).rejects.toMatchObject({ code: "statusCancelled" });
    const pcm0 = await fixturePcm("0.wav", dir);
    const { result } = await engine.transcribeAll(pcm0, { ...base, mode: "local" });
    expect(result.text.toLowerCase()).toMatch(/lamps|nightfall/);
  }, 120000);
});

describe("konuşmacı ayrımı (gerçek modeller)", () => {
  it("konuşmacı sayısı verilince 4 konuşmacıyı ayırır", async () => {
    const pcm = await fixturePcm("0-four-speakers-zh.wav", dir);
    const segs = [
      { start: 0.3, end: 6.8, text: "a" },
      { start: 7, end: 17, text: "b" },
      { start: 22, end: 25, text: "c" },
      { start: 27.6, end: 32, text: "d" },
      { start: 33.7, end: 38.3, text: "e" },
      { start: 40, end: 56, text: "f" },
    ];
    const out = await engine.diarize(pcm, segs, { numSpeakers: 4 });
    expect(new Set(out.map((s) => s.speaker)).size).toBeGreaterThanOrEqual(3);
    expect(out[0].speaker).toBe("S1");
  }, 120000);

  it("otomatik modda birden fazla konuşmacı bulur", async () => {
    const pcm = await fixturePcm("0-four-speakers-zh.wav", dir);
    const out = await engine.diarize(pcm, [{ start: 0, end: 56, text: "x" }, { start: 7, end: 10, text: "y" }], { numSpeakers: 0 });
    expect(out.every((s) => s.speaker)).toBe(true);
  }, 120000);

  it("API + diyarizasyon birlikte; diyarizasyon hatası transkripti düşürmez", async () => {
    const pcm = await fixturePcm("0-four-speakers-zh.wav", dir);
    const { result, warnings } = await engine.transcribeAll(pcm, { ...base, diarize: true, numSpeakers: 4 });
    expect(warnings).toEqual([]);
    expect(result.segments.some((s) => s.speaker)).toBe(true);

    // Bozuk model yolu → uyarı, transkript yine döner
    const broken = new TranscriptionEngine({
      ffmpeg: FFMPEG,
      tmpDir: dir,
      groq: new GroqClient({ getKey: () => "test-key", baseUrl: mock.url }),
      ml,
      models: Object.assign(testModels(), { ensureBundled: async () => path.join(dir, "yok.onnx") }),
    });
    const r2 = await broken.transcribeAll(pcm, { ...base, diarize: true });
    expect(r2.warnings[0].code).toBe("errDiarize");
    expect(r2.result.segments.length).toBeGreaterThan(0);
  }, 120000);
});
