import { describe, expect, it } from "vitest";
import { clockTime, exportMarkdown, exportTranscript, markdownToPlain, safeFileName, srtTimestamp, vttTimestamp } from "../../src/shared/export";
import type { ExportDoc } from "../../src/shared/export";

const labels = { transcriptHeading: "Transkript", segmentsHeading: "Segmentler", speakerLabel: (n: number) => `Konuşmacı ${n}` };

const doc: ExportDoc = {
  title: "Toplantı",
  language: "tr",
  text: "Merhaba. Selam. Nasılsın?",
  segments: [
    { start: 0, end: 1.5, text: "Merhaba.", speaker: "S1" },
    { start: 1.5, end: 3.25, text: "Selam.", speaker: "S2" },
    { start: 3725.5, end: 3727, text: "Nasılsın?", speaker: "S2" },
  ],
  speakers: { S1: "Ayşe" },
};

describe("zaman damgaları", () => {
  it("SRT/VTT/saat biçimleri", () => {
    expect(srtTimestamp(3725.5)).toBe("01:02:05,500");
    expect(vttTimestamp(1.2345)).toBe("00:00:01.235");
    expect(srtTimestamp(-1)).toBe("00:00:00,000");
    expect(clockTime(65)).toBe("01:05");
    expect(clockTime(3725)).toBe("1:02:05");
  });
});

describe("exportTranscript", () => {
  it("TXT: konuşmacıların ardışık segmentlerini paragrafta birleştirir, isimleri kullanır", () => {
    expect(exportTranscript("txt", doc, labels)).toBe("Ayşe: Merhaba.\n\nKonuşmacı 2: Selam. Nasılsın?\n");
  });
  it("TXT: konuşmacı yoksa düz metin", () => {
    expect(exportTranscript("txt", { ...doc, segments: doc.segments.map((s) => ({ ...s, speaker: null })) }, labels)).toBe("Merhaba. Selam. Nasılsın?\n");
  });
  it("SRT", () => {
    const srt = exportTranscript("srt", doc, labels);
    expect(srt).toContain("1\n00:00:00,000 --> 00:00:01,500\nAyşe: Merhaba.\n");
    expect(srt).toContain("3\n01:02:05,500 --> 01:02:07,000\nKonuşmacı 2: Nasılsın?\n");
  });
  it("VTT: standart <v> konuşmacı etiketi", () => {
    const vtt = exportTranscript("vtt", doc, labels);
    expect(vtt.startsWith("WEBVTT\n")).toBe(true);
    expect(vtt).toContain("00:00:00.000 --> 00:00:01.500\n<v Ayşe>Merhaba.");
  });
  it("MD: yerelleştirilmiş başlıklar", () => {
    const md = exportTranscript("md", doc, labels);
    expect(md.startsWith("# Toplantı\n")).toBe(true);
    expect(md).toContain("## Segmentler");
    expect(md).toContain("- **[1:02:05 – 1:02:07]** *Konuşmacı 2:* Nasılsın?");
  });
  it("JSON: geçerli ve kelime listesi içermez", () => {
    const parsed = JSON.parse(exportTranscript("json", { ...doc, segments: [{ ...doc.segments[0], words: [{ word: "x", start: 0, end: 1 }] }] }, labels));
    expect(parsed.title).toBe("Toplantı");
    expect(parsed.segments[0]).toEqual({ start: 0, end: 1.5, text: "Merhaba.", speaker: "Ayşe", speaker_id: "S1" });
  });
});

describe("markdown ve dosya adı", () => {
  it("markdown'ı düz metne indirger", () => {
    expect(markdownToPlain("# Başlık\n\n*italik* ve **kalın** `kod`\n- madde")).toBe("Başlık\n\nitalik ve kalın kod\n• madde\n");
    expect(exportMarkdown("md", "# A")).toBe("# A\n");
  });
  it("güvenli dosya adı", () => {
    expect(safeFileName('a/b:c*?"<>|d')).toBe("a b c d");
    expect(safeFileName("CON")).toBe("transkript");
    expect(safeFileName("  ")).toBe("transkript");
    expect(safeFileName("x".repeat(100)).length).toBe(60);
    expect(safeFileName("bitti. ")).toBe("bitti");
  });
});
