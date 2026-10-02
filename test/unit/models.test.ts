import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { downloadFile, extractArchive, extractTarBz2, findAsrFiles, ModelManager } from "../../src/main/models";
import { tmpDir } from "../helpers/env";

const payload = Buffer.alloc(300_000, 7);
let server: http.Server;
let base = "";
let dropFirst = true;
let rangeRequests: string[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const range = req.headers.range;
    if (range) rangeRequests.push(range);
    const start = range ? parseInt(/bytes=(\d+)-/.exec(range)![1], 10) : 0;
    const body = payload.subarray(start);
    res.writeHead(range ? 206 : 200, { "Content-Length": String(body.length) });
    if (dropFirst) {
      // İlk istekte bağlantıyı yarıda kopar (ağ kesintisi simülasyonu).
      dropFirst = false;
      res.write(body.subarray(0, 100_000), () => res.destroy());
      return;
    }
    res.end(body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("downloadFile", () => {
  it("kesilen indirmeyi Range ile kaldığı yerden tamamlar", async () => {
    const dest = path.join(tmpDir(), "model.bin");
    const fetchFn = (i: string, init?: RequestInit) => fetch(i, init);
    await expect(downloadFile(fetchFn, `${base}/m`, dest)).rejects.toMatchObject({ code: "errModelDownload" });
    expect(existsSync(dest)).toBe(false);
    const progress: number[] = [];
    await downloadFile(fetchFn, `${base}/m`, dest, { onProgress: (f) => progress.push(f) });
    expect(rangeRequests.at(-1)).toMatch(/^bytes=\d+-$/);
    expect(readFileSync(dest).equals(payload)).toBe(true);
    expect(progress.at(-1)).toBe(1);
  });
});

describe("arşiv açma", () => {
  function makeArchive(): string {
    const dir = tmpDir();
    const src = path.join(dir, "sherpa-onnx-whisper-x");
    mkdirSync(path.join(src, "test_wavs"), { recursive: true });
    writeFileSync(path.join(src, "x-encoder.onnx"), "fp32");
    writeFileSync(path.join(src, "x-encoder.int8.onnx"), "int8");
    writeFileSync(path.join(src, "x-decoder.int8.onnx"), "dec");
    writeFileSync(path.join(src, "x-tokens.txt"), "tok");
    writeFileSync(path.join(src, "test_wavs", "0.wav"), "wav");
    const archive = path.join(dir, "x.tar.bz2");
    execFileSync("tar", ["-cjf", archive, "-C", dir, "sherpa-onnx-whisper-x"]);
    return archive;
  }
  const filter = (n: string) => n.endsWith(".onnx") || n.endsWith("tokens.txt");

  it("yerel tar ile düz klasöre filtreli açar", async () => {
    const out = path.join(tmpDir(), "out");
    const names = await extractArchive(makeArchive(), out, filter);
    expect(names.sort()).toEqual(["x-decoder.int8.onnx", "x-encoder.int8.onnx", "x-encoder.onnx", "x-tokens.txt"]);
    expect(readdirSync(out).sort()).toEqual(names.sort());
    const files = findAsrFiles(readdirSync(out), out)!;
    expect(path.basename(files.encoder)).toBe("x-encoder.int8.onnx");
  });

  it("JS (unbzip2) yedek yolu da aynı sonucu verir", async () => {
    const out = path.join(tmpDir(), "out");
    const names = await extractTarBz2(makeArchive(), out, filter);
    expect(names.sort()).toEqual(["x-decoder.int8.onnx", "x-encoder.int8.onnx", "x-encoder.onnx", "x-tokens.txt"]);
  });

  it("findAsrFiles eksik dosyada null", () => {
    expect(findAsrFiles(["a-encoder.onnx"], "/x")).toBeNull();
  });
});

describe("ModelManager", () => {
  it("gömülü model yolu: paket klasörü yoksa kullanıcı klasörü", () => {
    const m = new ModelManager("/yok/klasor", "/kullanici", (i, init) => fetch(i, init));
    expect(m.bundledPath("vad")).toBe(path.join("/kullanici", "bundled", "silero_vad.onnx"));
    expect(m.isAsrInstalled("tiny")).toBe(false);
    const st = m.statuses();
    expect(st.map((s) => s.id)).toEqual(["asr-tiny", "asr-small", "asr-turbo", "asr-large-v3", "nllb"]);
  });

  it("kurulu olmayan modelde errModelMissing", async () => {
    const m = new ModelManager("/yok", tmpDir(), (i, init) => fetch(i, init));
    await expect(m.asrFiles("turbo")).rejects.toMatchObject({ code: "errModelMissing" });
  });
});
