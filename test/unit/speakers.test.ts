import { describe, expect, it } from "vitest";
import { assignSpeakers, offsetSpeakers, remapSpeakerIds, speakerDisplayName } from "../../src/shared/speakers";
import type { Segment } from "../../src/shared/types";

const w = (word: string, start: number, end: number) => ({ word, start, end });

describe("assignSpeakers", () => {
  it("segment düzeyinde en çok örtüşen konuşmacıyı atar ve S1/S2 olarak numaralar", () => {
    const segs: Segment[] = [
      { start: 0, end: 4, text: "merhaba" },
      { start: 4.5, end: 8, text: "selam" },
      { start: 8.5, end: 10, text: "nasılsın" },
    ];
    const turns = [
      { start: 0, end: 4.2, speaker: 7 },
      { start: 4.3, end: 8.2, speaker: 3 },
      { start: 8.4, end: 10, speaker: 7 },
    ];
    const out = assignSpeakers(segs, turns);
    expect(out.map((s) => s.speaker)).toEqual(["S1", "S2", "S1"]);
  });

  it("kelime zaman damgalarıyla segmenti konuşmacı değişiminden böler", () => {
    const seg: Segment = {
      start: 0,
      end: 6,
      text: "ben geldim sen nerdeydin acaba",
      words: [w("ben", 0, 0.5), w("geldim", 0.5, 1.4), w("sen", 3, 3.4), w("nerdeydin", 3.4, 4.6), w("acaba", 4.6, 5.8)],
    };
    const out = assignSpeakers([seg], [
      { start: 0, end: 2, speaker: 0 },
      { start: 2.8, end: 6, speaker: 1 },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ speaker: "S1", text: "ben geldim", start: 0, end: 1.4 });
    expect(out[1]).toMatchObject({ speaker: "S2", text: "sen nerdeydin acaba", start: 3 });
  });

  it("tek kelimelik gürültü değişimlerini yumuşatır", () => {
    const seg: Segment = {
      start: 0,
      end: 5,
      text: "a b c d e",
      words: [w("a", 0, 1), w("b", 1, 2), w("c", 2, 2.2), w("d", 2.2, 3.5), w("e", 3.5, 5)],
    };
    const out = assignSpeakers([seg], [
      { start: 0, end: 2, speaker: 0 },
      { start: 2, end: 2.2, speaker: 1 },
      { start: 2.2, end: 5, speaker: 0 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].speaker).toBe("S1");
    expect(out[0].text).toBe("a b c d e");
  });

  it("örtüşme yoksa yakın dönüşe bağlar, uzaksa boş bırakır", () => {
    const out = assignSpeakers(
      [
        { start: 10, end: 11, text: "yakın" },
        { start: 50, end: 51, text: "uzak" },
      ],
      [{ start: 0, end: 9.5, speaker: 2 }],
    );
    expect(out[0].speaker).toBe("S1");
    expect(out[1].speaker).toBeNull();
  });

  it("dönüş yoksa konuşmacısız döner", () => {
    expect(assignSpeakers([{ start: 0, end: 1, text: "x" }], [])[0].speaker).toBeNull();
  });
});

describe("remapSpeakerIds", () => {
  it("yeniden diyarizasyondan sonra eski kimlikleri (ve dolayısıyla isimleri) korur", () => {
    const old: Segment[] = [
      { start: 0, end: 5, text: "a", speaker: "S1" },
      { start: 5, end: 10, text: "b", speaker: "S2" },
    ];
    // Yeni diyarizasyon kimlikleri ters sırada vermiş + yeni bir kişi eklenmiş
    const fresh: Segment[] = [
      { start: 0, end: 5, text: "a", speaker: "S2" },
      { start: 5, end: 10, text: "b", speaker: "S1" },
      { start: 11, end: 15, text: "c", speaker: "S1" },
      { start: 15, end: 20, text: "d", speaker: "S3" },
    ];
    const out = remapSpeakerIds(old, fresh, 10);
    expect(out.map((s) => s.speaker)).toEqual(["S1", "S2", "S2", "S3"]);
  });
});

describe("offsetSpeakers / speakerDisplayName", () => {
  it("numaraları çakışmayacak şekilde öteler", () => {
    const out = offsetSpeakers([{ start: 0, end: 1, text: "", speaker: "S2" }], [
      { start: 0, end: 1, text: "", speaker: "S1" },
      { start: 1, end: 2, text: "" },
    ]);
    expect(out.map((s) => s.speaker)).toEqual(["S3", undefined]);
  });
  it("özel ad ya da varsayılan etiket", () => {
    const label = (n: number) => `Konuşmacı ${n}`;
    expect(speakerDisplayName("S2", { S2: "Ayşe" }, label)).toBe("Ayşe");
    expect(speakerDisplayName("S2", { S2: "  " }, label)).toBe("Konuşmacı 2");
    expect(speakerDisplayName(null, {}, label)).toBe("");
  });
});
