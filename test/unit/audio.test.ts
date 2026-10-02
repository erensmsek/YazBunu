import { describe, expect, it, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { computeEnergies, concatPcm, decodeToPcm, encodeForStorage, parseFfmpegDuration, pcmDuration, readPcmRange, wavFromPcm, int16View } from "../../src/main/audio";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpeg: string = require("ffmpeg-static");

const dir = mkdtempSync(path.join(os.tmpdir(), "yb-audio-"));

/** 1 sn 440 Hz ton + 1 sn sessizlik, 44.1 kHz stereo WAV. */
function toneWav(): string {
  const sr = 44100;
  const n = sr * 2;
  const pcm = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const v = i < sr ? Math.round(Math.sin((2 * Math.PI * 440 * i) / sr) * 12000) : 0;
    pcm.writeInt16LE(v, i * 4);
    pcm.writeInt16LE(v, i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(sr, 24);
  header.writeUInt32LE(sr * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  const file = path.join(dir, "tone.wav");
  writeFileSync(file, Buffer.concat([header, pcm]));
  return file;
}

let pcm = "";
beforeAll(async () => {
  pcm = path.join(dir, "tone.pcm");
  await decodeToPcm(ffmpeg, toneWav(), pcm);
});

describe("ffmpeg", () => {
  it("Duration satırını çözer", () => {
    expect(parseFfmpegDuration("  Duration: 01:02:03.50, start")).toBeCloseTo(3723.5);
    expect(parseFfmpegDuration("yok")).toBeNull();
  });

  it("stereo 44.1k WAV'ı 16k mono PCM'e çevirir", async () => {
    expect(await pcmDuration(pcm)).toBeCloseTo(2, 1);
  });

  it("enerji: ilk saniye ses, ikinci saniye sessiz", async () => {
    const e = await computeEnergies(pcm);
    expect(e.length).toBe(20);
    expect(e[5]).toBeGreaterThan(0.1);
    expect(e[15]).toBeLessThan(0.001);
  });

  it("bozuk dosyada errDecode", async () => {
    const bad = path.join(dir, "bad.mp3");
    writeFileSync(bad, "bu bir ses dosyası değil");
    await expect(decodeToPcm(ffmpeg, bad, path.join(dir, "bad.pcm"))).rejects.toMatchObject({ code: "errDecode" });
  });

  it("iptal edilince CANCELLED", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(decodeToPcm(ffmpeg, pcm, path.join(dir, "x.pcm"), { signal: ctrl.signal })).rejects.toMatchObject({ code: "statusCancelled" });
  });

  it("saklama için Opus'a sıkıştırır ve geri çözülebilir", async () => {
    const out = await encodeForStorage(ffmpeg, pcm, path.join(dir, "stored"));
    expect([".ogg", ".m4a", ".wav"]).toContain(path.extname(out));
    expect(statSync(out).size).toBeLessThan(statSync(pcm).size);
    const back = path.join(dir, "back.pcm");
    await decodeToPcm(ffmpeg, out, back);
    expect(await pcmDuration(back)).toBeCloseTo(2, 0);
  });
});

describe("PCM yardımcıları", () => {
  it("WAV başlığı", () => {
    const wav = Buffer.from(wavFromPcm(new Uint8Array(3200)));
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt32LE(24)).toBe(16000);
    expect(wav.readUInt32LE(40)).toBe(3200);
    expect(wav.length).toBe(3244);
  });

  it("aralık okuma ve birleştirme", async () => {
    const part = await readPcmRange(pcm, 0.5, 1.5);
    expect(part.length).toBe(32000);
    expect(int16View(part).length).toBe(16000);
    const joined = path.join(dir, "joined.pcm");
    await concatPcm(pcm, pcm, joined, 1);
    expect(await pcmDuration(joined)).toBeCloseTo(5, 1);
    expect(readFileSync(joined).length).toBe(readFileSync(pcm).length * 2 + 32000);
  });
});
