import { describe, expect, it } from "vitest";
import { compareVersions } from "../../src/main/updates";
import { StreamMixer } from "../../src/main/live";
import { dominantLanguage, displayLanguage, normalizeLanguage } from "../../src/shared/lang";

describe("sürüm karşılaştırma", () => {
  it("semver", () => {
    expect(compareVersions("v2.1.0", "2.0.9")).toBeGreaterThan(0);
    expect(compareVersions("2.0.0", "2.0.0")).toBe(0);
    expect(compareVersions("2.0", "2.0.1")).toBeLessThan(0);
  });
});

describe("dil yardımcıları", () => {
  it("normalize", () => {
    expect(normalizeLanguage("Turkish")).toBe("tr");
    expect(normalizeLanguage("en-US")).toBe("en");
    expect(normalizeLanguage("")).toBe("");
  });
  it("çoğunluk dili süreye göre", () => {
    expect(dominantLanguage([{ language: "en", seconds: 5 }, { language: "tr", seconds: 20 }, { language: "en", seconds: 6 }])).toBe("tr");
    expect(dominantLanguage([])).toBe("");
  });
  it("yerelleştirilmiş dil adı", () => {
    expect(displayLanguage("tr", "tr")).toBe("Türkçe");
    expect(displayLanguage("de", "en")).toBe("German");
  });
});

describe("StreamMixer", () => {
  it("iki kaynağı toplar ve taşmayı kırpar", () => {
    const out: number[] = [];
    const m = new StreamMixer((d) => out.push(...d));
    m.push("a", Int16Array.from([100, 30000, -30000]));
    m.push("b", Int16Array.from([1, 10000, -10000]));
    expect(out).toEqual([101, 32767, -32768]);
  });
  it("bir kaynak susarsa diğerini bekletmez", () => {
    const out: number[] = [];
    const m = new StreamMixer((d) => out.push(...d));
    m.push("a", new Int16Array(16000).fill(5));
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((v) => v === 5)).toBe(true);
  });
  it("flush kalanları boşaltır", () => {
    const out: number[] = [];
    const m = new StreamMixer((d) => out.push(...d));
    m.push("a", Int16Array.from([1, 2]));
    m.push("b", Int16Array.from([1]));
    m.flush();
    expect(out).toEqual([2, 2]);
  });
});
