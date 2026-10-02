// Model indirme yöneticisi: offline Whisper modelleri (isteğe bağlı) ve gömülü
// diyarizasyon/VAD modelleri (paketle gelir; geliştirme ortamında eksikse indirilir).
import { createWriteStream, promises as fsp, existsSync } from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { EventEmitter } from "node:events";
import bz2 from "unbzip2-stream";
import * as tar from "tar-stream";
import { AppError, CANCELLED, isCancelled } from "./errors";
import type { FetchLike } from "./groq";
import type { LocalAsrModel, ModelStatus } from "../shared/types";

const GH = "https://github.com/k2-fsa/sherpa-onnx/releases/download";

export const ASR_MODELS: Record<LocalAsrModel, { archive: string; bytes: number }> = {
  tiny: { archive: "sherpa-onnx-whisper-tiny.tar.bz2", bytes: 116_204_861 },
  small: { archive: "sherpa-onnx-whisper-small.tar.bz2", bytes: 639_387_718 },
  turbo: { archive: "sherpa-onnx-whisper-turbo.tar.bz2", bytes: 563_790_207 },
  "large-v3": { archive: "sherpa-onnx-whisper-large-v3.tar.bz2", bytes: 1_068_482_488 },
};

export type BundledModel = "segmentation" | "embedding" | "vad";

export const BUNDLED_MODELS: Record<BundledModel, { url: string; file: string; member?: string; bytes: number }> = {
  segmentation: {
    url: `${GH}/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2`,
    member: "model.onnx",
    file: "segmentation.onnx",
    bytes: 6_958_444,
  },
  embedding: {
    url: `${GH}/speaker-recongition-models/wespeaker_en_voxceleb_resnet34_LM.onnx`,
    file: "embedding.onnx",
    bytes: 26_530_550,
  },
  vad: { url: `${GH}/asr-models/silero_vad.onnx`, file: "silero_vad.onnx", bytes: 643_854 },
};

export interface AsrFiles {
  encoder: string;
  decoder: string;
  tokens: string;
}

type ProgressFn = (stage: "download" | "extract", fraction: number) => void;

/** HTTP indirmesi; yarım kalan .part dosyası varsa Range ile kaldığı yerden devam eder. */
export async function downloadFile(
  fetchFn: FetchLike,
  url: string,
  dest: string,
  opts: { signal?: AbortSignal; onProgress?: (fraction: number) => void; expectedBytes?: number } = {},
): Promise<void> {
  const part = `${dest}.part`;
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  let have = 0;
  try {
    have = (await fsp.stat(part)).size;
  } catch {
    have = 0;
  }
  const headers: Record<string, string> = have > 0 ? { Range: `bytes=${have}-` } : {};
  let resp: Response;
  try {
    resp = await fetchFn(url, { headers, signal: opts.signal, redirect: "follow" });
  } catch (err) {
    if (opts.signal?.aborted) throw new AppError(CANCELLED);
    throw new AppError("errModelDownload", err instanceof Error ? err.message : String(err));
  }
  if (resp.status === 416) {
    // Dosya zaten tam inmiş.
    await fsp.rename(part, dest);
    return;
  }
  if (!resp.ok || !resp.body) throw new AppError("errModelDownload", `HTTP ${resp.status}`);
  const append = resp.status === 206 && have > 0;
  if (!append) have = 0;
  const lenHeader = Number(resp.headers.get("content-length") ?? 0);
  const total = append ? have + lenHeader : lenHeader || opts.expectedBytes || 0;
  let received = have;
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      received += chunk.length;
      if (total) opts.onProgress?.(Math.min(1, received / total));
      cb(null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(resp.body as import("node:stream/web").ReadableStream),
      counter,
      createWriteStream(part, { flags: append ? "a" : "w" }),
      { signal: opts.signal },
    );
  } catch (err) {
    if (opts.signal?.aborted || isCancelled(err)) throw new AppError(CANCELLED);
    throw new AppError("errModelDownload", err instanceof Error ? err.message : String(err));
  }
  if (total && received < total) throw new AppError("errModelDownload", `incomplete ${received}/${total}`);
  await fsp.rename(part, dest);
}

/**
 * tar.bz2 arşivinden filtreye uyan dosyaları hedef klasöre (düz) çıkarır.
 * Dönen değer çıkarılan dosya adlarıdır.
 */
export async function extractTarBz2(
  archive: string,
  destDir: string,
  filter: (name: string) => boolean,
  opts: { signal?: AbortSignal; onProgress?: (fraction: number) => void } = {},
): Promise<string[]> {
  await fsp.mkdir(destDir, { recursive: true });
  const total = (await fsp.stat(archive)).size;
  let read = 0;
  const extracted: string[] = [];
  const extract = tar.extract();
  extract.on("entry", (header, stream, next) => {
    const base = path.basename(header.name);
    if (header.type !== "file" || !filter(base)) {
      stream.on("end", next);
      stream.resume();
      return;
    }
    const out = createWriteStream(path.join(destDir, base));
    stream.pipe(out);
    out.on("finish", () => {
      extracted.push(base);
      next();
    });
    out.on("error", next);
  });
  const { createReadStream } = await import("node:fs");
  const src = createReadStream(archive);
  src.on("data", (chunk) => {
    read += chunk.length;
    opts.onProgress?.(Math.min(1, read / total));
  });
  try {
    await pipeline(src, bz2(), extract, { signal: opts.signal });
  } catch (err) {
    if (opts.signal?.aborted) throw new AppError(CANCELLED);
    throw new AppError("errModelDownload", `extract: ${err instanceof Error ? err.message : String(err)}`);
  }
  return extracted;
}

/**
 * Önce sistemdeki yerel tar (macOS/Linux; Windows 10+ bsdtar) ile açar — saf JS bz2'den ~3 kat hızlı.
 * Başarısız olursa JS uygulamasına düşer. Dosyalar düz (alt klasörsüz) olarak çıkarılır.
 */
export async function extractArchive(
  archive: string,
  destDir: string,
  filter: (name: string) => boolean,
  opts: { signal?: AbortSignal; onProgress?: (fraction: number) => void } = {},
): Promise<string[]> {
  const { spawn } = await import("node:child_process");
  const nativeDir = `${destDir}.native`;
  await fsp.rm(nativeDir, { recursive: true, force: true });
  await fsp.mkdir(nativeDir, { recursive: true });
  try {
    opts.onProgress?.(0);
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("tar", ["-xjf", archive, "-C", nativeDir], { windowsHide: true, stdio: "ignore" });
      const onAbort = () => proc.kill();
      opts.signal?.addEventListener("abort", onAbort, { once: true });
      proc.on("error", reject);
      proc.on("close", (code) => {
        opts.signal?.removeEventListener("abort", onAbort);
        if (opts.signal?.aborted) reject(new AppError(CANCELLED));
        else if (code === 0) resolve();
        else reject(new Error(`tar exited ${code}`));
      });
    });
    await fsp.mkdir(destDir, { recursive: true });
    const names: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const ent of await fsp.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) await walk(full);
        else if (ent.isFile() && filter(ent.name)) {
          await fsp.rename(full, path.join(destDir, ent.name));
          names.push(ent.name);
        }
      }
    };
    await walk(nativeDir);
    opts.onProgress?.(1);
    return names;
  } catch (err) {
    if (opts.signal?.aborted) throw new AppError(CANCELLED);
    return extractTarBz2(archive, destDir, filter, opts);
  } finally {
    await fsp.rm(nativeDir, { recursive: true, force: true });
  }
}

/** Bir klasördeki Whisper dosyalarını bulur (int8 sürümü tercih edilir). */
export function findAsrFiles(files: string[], dir: string): AsrFiles | null {
  const pick = (kind: "encoder" | "decoder") => {
    const cands = files.filter((f) => f.includes(`-${kind}`) && f.endsWith(".onnx"));
    return cands.find((f) => f.includes(".int8.")) ?? cands[0];
  };
  const encoder = pick("encoder");
  const decoder = pick("decoder");
  const tokens = files.find((f) => f.endsWith("tokens.txt"));
  if (!encoder || !decoder || !tokens) return null;
  return { encoder: path.join(dir, encoder), decoder: path.join(dir, decoder), tokens: path.join(dir, tokens) };
}

interface ModelState {
  downloading: boolean;
  progress: number;
  error: string | null;
}

export class ModelManager extends EventEmitter {
  private states = new Map<string, ModelState>();
  private inflight = new Map<string, { promise: Promise<void>; ctrl: AbortController }>();

  constructor(
    private readonly bundledDir: string,
    private readonly userDir: string,
    private readonly fetchFn: FetchLike,
  ) {
    super();
  }

  private state(id: string): ModelState {
    let s = this.states.get(id);
    if (!s) {
      s = { downloading: false, progress: 0, error: null };
      this.states.set(id, s);
    }
    return s;
  }

  private emitStatus(): void {
    this.emit("status", this.statuses());
  }

  asrDir(id: LocalAsrModel): string {
    return path.join(this.userDir, `whisper-${id}`);
  }

  isAsrInstalled(id: LocalAsrModel): boolean {
    return existsSync(path.join(this.asrDir(id), ".complete"));
  }

  async asrFiles(id: LocalAsrModel): Promise<AsrFiles> {
    if (!this.isAsrInstalled(id)) throw new AppError("errModelMissing", id);
    const dir = this.asrDir(id);
    const found = findAsrFiles(await fsp.readdir(dir), dir);
    if (!found) throw new AppError("errModelMissing", id);
    return found;
  }

  bundledPath(name: BundledModel): string {
    const spec = BUNDLED_MODELS[name];
    const shipped = path.join(this.bundledDir, spec.file);
    if (existsSync(shipped)) return shipped;
    return path.join(this.userDir, "bundled", spec.file);
  }

  /** Paketle gelmesi gereken model eksikse (geliştirme ortamı) indirir. */
  async ensureBundled(name: BundledModel, signal?: AbortSignal): Promise<string> {
    const target = this.bundledPath(name);
    if (existsSync(target)) return target;
    const spec = BUNDLED_MODELS[name];
    await this.singleFlight(`bundled-${name}`, async (ctrl, progress) => {
      const tmpDir = path.join(this.userDir, "tmp");
      if (spec.member) {
        const archive = path.join(tmpDir, path.basename(spec.url));
        await downloadFile(this.fetchFn, spec.url, archive, { signal: ctrl.signal, onProgress: (f) => progress("download", f) });
        const outDir = path.join(tmpDir, `x-${name}`);
        await extractArchive(archive, outDir, (n) => n === spec.member, { signal: ctrl.signal });
        await fsp.mkdir(path.dirname(target), { recursive: true });
        await fsp.rename(path.join(outDir, spec.member), target);
        await fsp.rm(outDir, { recursive: true, force: true });
        await fsp.rm(archive, { force: true });
      } else {
        await downloadFile(this.fetchFn, spec.url, target, { signal: ctrl.signal, onProgress: (f) => progress("download", f) });
      }
    }, signal);
    return target;
  }

  private async singleFlight(
    id: string,
    task: (ctrl: AbortController, progress: ProgressFn) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<void> {
    let entry = this.inflight.get(id);
    if (!entry) {
      const ctrl = new AbortController();
      const st = this.state(id);
      st.downloading = true;
      st.error = null;
      st.progress = 0;
      this.emitStatus();
      let lastEmit = 0;
      const progress: ProgressFn = (stage, f) => {
        // İndirme %0-90, açma %90-100 olarak tek çubukta gösterilir.
        st.progress = stage === "download" ? f * 0.9 : 0.9 + f * 0.1;
        const now = Date.now();
        if (now - lastEmit > 250 || f >= 1) {
          lastEmit = now;
          this.emit("progress", { id, stage, progress: st.progress });
          this.emitStatus();
        }
      };
      const promise = task(ctrl, progress)
        .then(() => {
          st.progress = 1;
        })
        .catch((err) => {
          st.error = isCancelled(err) ? null : err instanceof AppError ? err.code : String(err);
          throw err;
        })
        .finally(() => {
          st.downloading = false;
          this.inflight.delete(id);
          this.emitStatus();
        });
      entry = { promise, ctrl };
      this.inflight.set(id, entry);
    }
    // Çağıranın iptali yalnızca kendi beklemesini bırakır; indirme UI'den iptal edilene kadar sürer.
    if (!signal) return entry.promise;
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => reject(new AppError(CANCELLED));
      signal.addEventListener("abort", onAbort, { once: true });
      entry!.promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
    });
  }

  async downloadAsr(id: LocalAsrModel, signal?: AbortSignal): Promise<void> {
    if (this.isAsrInstalled(id)) return;
    const spec = ASR_MODELS[id];
    await this.singleFlight(`asr-${id}`, async (ctrl, progress) => {
      const tmpDir = path.join(this.userDir, "tmp");
      const archive = path.join(tmpDir, spec.archive);
      await downloadFile(this.fetchFn, `${GH}/asr-models/${spec.archive}`, archive, {
        signal: ctrl.signal,
        expectedBytes: spec.bytes,
        onProgress: (f) => progress("download", f),
      });
      const staging = `${this.asrDir(id)}.staging`;
      await fsp.rm(staging, { recursive: true, force: true });
      const names = await extractArchive(
        archive,
        staging,
        (n) => n.endsWith(".onnx") || n.endsWith("tokens.txt") || n.endsWith(".weights") || n.endsWith(".data"),
        { signal: ctrl.signal, onProgress: (f) => progress("extract", f) },
      );
      // Hem fp32 hem int8 varsa yalnızca int8'i tut (disk tasarrufu).
      for (const n of names) {
        if (n.endsWith(".onnx") && !n.includes(".int8.") && names.includes(n.replace(/\.onnx$/, ".int8.onnx"))) {
          await fsp.rm(path.join(staging, n), { force: true });
        }
      }
      if (!findAsrFiles(await fsp.readdir(staging), staging)) {
        throw new AppError("errModelDownload", "archive missing model files");
      }
      await fsp.writeFile(path.join(staging, ".complete"), new Date().toISOString());
      await fsp.rm(this.asrDir(id), { recursive: true, force: true });
      await fsp.rename(staging, this.asrDir(id));
      await fsp.rm(archive, { force: true });
    }, signal);
  }

  cancel(id: string): void {
    this.inflight.get(id)?.ctrl.abort();
  }

  async deleteAsr(id: LocalAsrModel): Promise<void> {
    this.cancel(`asr-${id}`);
    await fsp.rm(this.asrDir(id), { recursive: true, force: true });
    this.emitStatus();
  }

  /** NLLB önbelleği transformers.js tarafından yönetilir; burada yalnızca durum tutulur. */
  setExternalState(id: string, patch: Partial<ModelState>): void {
    Object.assign(this.state(id), patch);
    this.emitStatus();
  }

  statuses(extra: ModelStatus[] = []): ModelStatus[] {
    const asr = (Object.keys(ASR_MODELS) as LocalAsrModel[]).map((id) => {
      const st = this.state(`asr-${id}`);
      return {
        id: `asr-${id}`,
        kind: "asr" as const,
        sizeBytes: ASR_MODELS[id].bytes,
        installed: this.isAsrInstalled(id),
        downloading: st.downloading,
        progress: st.progress,
        error: st.error,
      };
    });
    const translate = this.states.get("nllb");
    return [
      ...asr,
      {
        id: "nllb",
        kind: "translate" as const,
        sizeBytes: 920_000_000,
        installed: existsSync(path.join(this.userDir, "hf", ".nllb-complete")),
        downloading: translate?.downloading ?? false,
        progress: translate?.progress ?? 0,
        error: translate?.error ?? null,
      },
      ...extra,
    ];
  }

  get hfCacheDir(): string {
    return path.join(this.userDir, "hf");
  }
}
