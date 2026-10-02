// Ses işleme: ffmpeg ile çözme/sıkıştırma, 16 kHz mono PCM dosyaları, WAV, enerji analizi.
// Electron'a bağımlı değildir (ffmpeg yolu parametre olarak gelir) → unit test edilebilir.
import { spawn } from "node:child_process";
import { promises as fsp, createReadStream } from "node:fs";
import { AppError, CANCELLED } from "./errors";
import { FRAME_SEC } from "../shared/chunking";

export const SAMPLE_RATE = 16000;
export const BYTES_PER_SEC = SAMPLE_RATE * 2;
export const FRAME_SAMPLES = Math.round(SAMPLE_RATE * FRAME_SEC);

export function pcmDurationFromBytes(bytes: number): number {
  return bytes / BYTES_PER_SEC;
}

export async function pcmDuration(pcmPath: string): Promise<number> {
  const st = await fsp.stat(pcmPath);
  return pcmDurationFromBytes(st.size);
}

/** "Duration: 00:01:02.34" → 62.34 */
export function parseFfmpegDuration(stderr: string): number | null {
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (!m) return null;
  return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]);
}

interface RunOptions {
  signal?: AbortSignal;
  onStdoutLine?: (line: string) => void;
  onStderr?: (chunk: string) => void;
}

function runFfmpeg(ffmpeg: string, args: string[], opts: RunOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new AppError(CANCELLED));
    const proc = spawn(ffmpeg, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let outBuf = "";
    const onAbort = () => proc.kill("SIGKILL");
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (d: string) => {
      outBuf += d;
      let nl: number;
      while ((nl = outBuf.indexOf("\n")) >= 0) {
        opts.onStdoutLine?.(outBuf.slice(0, nl).trim());
        outBuf = outBuf.slice(nl + 1);
      }
    });
    proc.stderr.setEncoding("utf8");
    proc.stderr.on("data", (d: string) => {
      // Sadece son kısmı tut (uzun dosyalarda stderr büyüyebilir), ama Duration satırı baştadır.
      stderr = stderr.length > 200_000 ? stderr.slice(0, 20_000) + stderr.slice(-50_000) : stderr + d;
      opts.onStderr?.(d);
    });
    proc.on("error", (err) => {
      opts.signal?.removeEventListener("abort", onAbort);
      reject(new AppError("errDecode", `ffmpeg: ${err.message}`));
    });
    proc.on("close", (code) => {
      opts.signal?.removeEventListener("abort", onAbort);
      if (opts.signal?.aborted) return reject(new AppError(CANCELLED));
      if (code === 0) resolve(stderr);
      else reject(new AppError("errDecode", stderr.trim().split("\n").slice(-3).join(" ").slice(0, 400)));
    });
  });
}

/**
 * Herhangi bir ses/video dosyasını akış halinde 16 kHz mono s16le PCM'e çevirir.
 * Belleğe tüm dosyayı almaz; 2 saatlik kayıtta bile güvenlidir.
 */
export async function decodeToPcm(
  ffmpeg: string,
  input: string,
  outPcm: string,
  opts: { signal?: AbortSignal; onProgress?: (fraction: number) => void } = {},
): Promise<number> {
  let duration: number | null = null;
  await runFfmpeg(
    ffmpeg,
    [
      "-hide_banner", "-nostdin", "-y",
      "-i", input,
      "-vn", "-sn", "-dn",
      "-ac", "1", "-ar", String(SAMPLE_RATE),
      "-acodec", "pcm_s16le", "-f", "s16le",
      "-progress", "pipe:1", "-nostats",
      outPcm,
    ],
    {
      signal: opts.signal,
      onStderr: (chunk) => {
        if (duration === null) duration = parseFfmpegDuration(chunk);
      },
      onStdoutLine: (line) => {
        const m = /^out_time_(?:us|ms)=(\d+)/.exec(line);
        if (m && duration) opts.onProgress?.(Math.min(1, parseInt(m[1], 10) / 1e6 / duration));
      },
    },
  );
  const seconds = await pcmDuration(outPcm);
  if (seconds < 0.1) throw new AppError("errDecode", "no audio stream");
  return seconds;
}

/**
 * PCM'i saklama için sıkıştırır: önce Opus (≈0.2 MB/dk), olmazsa AAC, en son WAV.
 * Dönen değer üretilen dosyanın yoludur (uzantı başarılı codec'e göre değişir).
 */
export async function encodeForStorage(ffmpeg: string, pcm: string, outBase: string): Promise<string> {
  const input = ["-hide_banner", "-nostdin", "-y", "-f", "s16le", "-ar", String(SAMPLE_RATE), "-ac", "1", "-i", pcm];
  const attempts: [string, string[]][] = [
    [".ogg", ["-c:a", "libopus", "-b:a", "24k", "-application", "voip"]],
    [".m4a", ["-c:a", "aac", "-b:a", "48k"]],
    [".wav", ["-c:a", "pcm_s16le"]],
  ];
  let lastErr: unknown = null;
  for (const [ext, codec] of attempts) {
    const out = outBase + ext;
    try {
      await runFfmpeg(ffmpeg, [...input, ...codec, out]);
      return out;
    } catch (err) {
      lastErr = err;
      await fsp.rm(out, { force: true });
    }
  }
  throw lastErr;
}

/** 16-bit mono PCM için 44 baytlık WAV başlığı + veri. */
export function wavFromPcm(pcm: Uint8Array, sampleRate = SAMPLE_RATE): Uint8Array {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  const out = new Uint8Array(44 + pcm.length);
  out.set(header, 0);
  out.set(pcm, 44);
  return out;
}

/** PCM dosyasından [start, end) saniye aralığını okur. */
export async function readPcmRange(pcmPath: string, start: number, end: number): Promise<Buffer> {
  const fh = await fsp.open(pcmPath, "r");
  try {
    const st = await fh.stat();
    const from = Math.max(0, Math.floor(start * SAMPLE_RATE) * 2);
    const to = Math.min(st.size - (st.size % 2), Math.floor(end * SAMPLE_RATE) * 2);
    const len = Math.max(0, to - from);
    const buf = Buffer.alloc(len);
    if (len) await fh.read(buf, 0, len, from);
    return buf;
  } finally {
    await fh.close();
  }
}

export function int16View(buf: Buffer | Uint8Array): Int16Array {
  // Hizalama garantisi için kopyala (Buffer havuzundan gelen dilimler tek adreste olabilir).
  const copy = new Uint8Array(buf.byteLength - (buf.byteLength % 2));
  copy.set(buf.subarray(0, copy.length));
  return new Int16Array(copy.buffer);
}

/** Dosyayı akış halinde okuyup 100 ms'lik karelerin RMS enerjisini çıkarır. */
export async function computeEnergies(pcmPath: string): Promise<Float32Array> {
  const st = await fsp.stat(pcmPath);
  const totalSamples = Math.floor(st.size / 2);
  const out = new Float32Array(Math.ceil(totalSamples / FRAME_SAMPLES));
  let frame = 0;
  let acc = 0;
  let count = 0;
  let carry: Buffer | null = null;
  for await (const chunk of createReadStream(pcmPath, { highWaterMark: 1 << 20 }) as AsyncIterable<Buffer>) {
    let data: Buffer = chunk;
    if (carry) {
      data = Buffer.concat([carry, chunk]);
      carry = null;
    }
    const usable = data.length - (data.length % 2);
    if (usable < data.length) carry = data.subarray(usable);
    for (let i = 0; i < usable; i += 2) {
      const v = data.readInt16LE(i) / 32768;
      acc += v * v;
      if (++count === FRAME_SAMPLES) {
        out[frame++] = Math.sqrt(acc / count);
        acc = 0;
        count = 0;
      }
    }
  }
  if (count > 0 && frame < out.length) out[frame++] = Math.sqrt(acc / count);
  return out.subarray(0, frame);
}

/** İki PCM dosyasını araya sessizlik koyarak birleştirir (geçmiş kayda ses ekleme). */
export async function concatPcm(first: string, second: string, out: string, gapSec = 1): Promise<void> {
  const a = await fsp.readFile(first);
  const b = await fsp.readFile(second);
  const gap = Buffer.alloc(Math.round(gapSec * SAMPLE_RATE) * 2);
  await fsp.writeFile(out, Buffer.concat([a, gap, b]));
}
