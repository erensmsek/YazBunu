import { describe, expect, it } from "vitest";
import { batchByChars, findLiveCut, frameRms, isSilent, planChunks, quietestFrame, splitText } from "../../src/shared/chunking";

/** 100 ms kareler: konuşma = 0.2, sessizlik = 0.001 */
function energies(pattern: [number, number][]): Float32Array {
  const out: number[] = [];
  for (const [sec, level] of pattern) for (let i = 0; i < Math.round(sec * 10); i++) out.push(level);
  return Float32Array.from(out);
}

describe("planChunks", () => {
  it("kısa sesi tek parça bırakır", () => {
    expect(planChunks(energies([[60, 0.2]]), { targetSec: 480, minSec: 240, maxSec: 600 })).toEqual([{ start: 0, end: 60 }]);
  });

  it("uzun sesi sessiz anlardan, sınırı aşmadan böler", () => {
    // 25 dk: her 100 sn'de bir 2 sn sessizlik
    const pattern: [number, number][] = [];
    for (let i = 0; i < 15; i++) pattern.push([98, 0.2], [2, 0.001]);
    const e = energies(pattern);
    const spans = planChunks(e, { targetSec: 480, minSec: 240, maxSec: 600 });
    expect(spans.length).toBeGreaterThanOrEqual(3);
    for (const s of spans) expect(s.end - s.start).toBeLessThanOrEqual(600.0001);
    // Kesimler sessiz bölgeye düşmeli (kesim karesi sessizlik içinde)
    for (const s of spans.slice(0, -1)) {
      const frame = Math.round(s.end * 10);
      expect(e[frame]).toBeLessThan(0.01);
    }
    // Kesintisiz kapsama
    expect(spans[0].start).toBe(0);
    for (let i = 1; i < spans.length; i++) expect(spans[i].start).toBeCloseTo(spans[i - 1].end);
    expect(spans[spans.length - 1].end).toBeCloseTo(e.length / 10);
  });

  it("hiç sessizlik yoksa maxSec'te zorla keser", () => {
    const spans = planChunks(energies([[1300, 0.2]]), { targetSec: 480, minSec: 240, maxSec: 600 });
    for (const s of spans) expect(s.end - s.start).toBeLessThanOrEqual(600.0001);
    expect(spans[spans.length - 1].end).toBeCloseTo(1300);
  });
});

describe("quietestFrame", () => {
  it("eşit sessizlikte hedefe en yakını seçer", () => {
    // 3 karelik sessiz bölgeler: merkezleri 2 ve 9 (pencere ortalaması 0)
    const e = Float32Array.from([0.2, 0, 0, 0, 0.2, 0.2, 0.2, 0.2, 0, 0, 0, 0.2]);
    expect(quietestFrame(e, 0, 12, 8)).toBe(9);
    expect(quietestFrame(e, 0, 12, 3)).toBe(2);
  });
});

describe("findLiveCut", () => {
  const opts = { minSec: 10, targetSec: 18, maxSec: 28 };
  it("hedef süre dolmadan kesmez", () => {
    expect(findLiveCut(energies([[15, 0.2]]), 0, opts)).toBe(-1);
  });
  it("sessiz bir an varsa orada keser", () => {
    const e = energies([[13, 0.2], [1, 0.001], [6, 0.2]]);
    const cut = findLiveCut(e, 0, opts);
    expect(cut).toBeGreaterThanOrEqual(130);
    expect(cut).toBeLessThan(140);
  });
  it("sessizlik yoksa maxSec'e kadar bekler, sonra keser", () => {
    expect(findLiveCut(energies([[25, 0.2]]), 0, opts)).toBe(-1);
    expect(findLiveCut(energies([[30, 0.2]]), 0, opts)).toBeGreaterThan(0);
  });
  it("fromFrame'e göre çalışır", () => {
    const e = energies([[20, 0.2], [13, 0.2], [1, 0.001], [6, 0.2]]);
    const cut = findLiveCut(e, 200, opts);
    expect(cut).toBeGreaterThanOrEqual(330);
  });
});

describe("isSilent / frameRms", () => {
  it("sessizliği ve konuşmayı ayırır", () => {
    expect(isSilent(energies([[5, 0.0005]]))).toBe(true);
    expect(isSilent(energies([[5, 0.0005], [1, 0.2]]))).toBe(false);
    expect(isSilent(new Float32Array())).toBe(true);
  });
  it("RMS hesaplar", () => {
    const s = new Int16Array(3200).fill(16384);
    const r = frameRms(s, 1600);
    expect(r.length).toBe(2);
    expect(r[0]).toBeCloseTo(0.5, 3);
  });
});

describe("splitText", () => {
  const para = "Bu bir cümle. ".repeat(50).trim();
  const text = [para, para, "Son paragraf burada."].join("\n\n");

  it("sınırı aşmaz ve içerik kaybetmez", () => {
    const chunks = splitText(text, 300);
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(300);
    const norm = (s: string) => s.replace(/\s+/g, " ").trim();
    expect(norm(chunks.join(" "))).toBe(norm(text));
  });

  it("boşluksuz çok uzun metni de böler", () => {
    const chunks = splitText("a".repeat(1000), 300);
    expect(chunks.join("")).toBe("a".repeat(1000));
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(300);
  });

  it("kısa metni olduğu gibi döndürür, boşu atar", () => {
    expect(splitText("  merhaba  ", 100)).toEqual(["merhaba"]);
    expect(splitText("   ", 100)).toEqual([]);
  });
});

describe("batchByChars", () => {
  it("ardışık ve eksiksiz gruplar üretir", () => {
    const items = Array.from({ length: 20 }, (_, i) => "x".repeat(i * 10 + 5));
    const batches = batchByChars(items, 400);
    expect(batches[0][0]).toBe(0);
    expect(batches[batches.length - 1][1]).toBe(20);
    for (let i = 1; i < batches.length; i++) expect(batches[i][0]).toBe(batches[i - 1][1]);
  });
  it("tek başına büyük öğe kendi grubunda", () => {
    expect(batchByChars(["x".repeat(1000), "y"], 100)).toEqual([[0, 1], [1, 2]]);
  });
});
