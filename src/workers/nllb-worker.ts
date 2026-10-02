// Electron utilityProcess: transformers.js + NLLB-200 ile offline çeviri.
// sherpa-onnx ile aynı süreçte iki farklı onnxruntime kopyası çakışmasın diye ayrı süreçtedir.
import { promises as fsp } from "node:fs";
import path from "node:path";
import { workerPort } from "./port";

const MODEL_ID = "Xenova/nllb-200-distilled-600M";
const BATCH = 8;

export interface TranslateRequest {
  id: number;
  type: "translate";
  texts: string[];
  src: string;
  tgt: string;
  cacheDir: string;
}

export interface PrepareRequest {
  id: number;
  type: "prepare";
  cacheDir: string;
}

type Req = TranslateRequest | PrepareRequest;

const port = workerPort();
const send = (msg: unknown) => port.postMessage(msg);

type Translator = (text: string | string[], opts: Record<string, unknown>) => Promise<{ translation_text: string }[]>;
let translator: Translator | null = null;

async function load(cacheDir: string, reqId: number): Promise<Translator> {
  if (translator) return translator;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const tf = require("@huggingface/transformers");
  tf.env.cacheDir = cacheDir;
  tf.env.allowLocalModels = true;
  tf.env.allowRemoteModels = true;
  // Dosya başına ilerleme → toplam ilerleme (bayt ağırlıklı).
  const files = new Map<string, { loaded: number; total: number }>();
  let last = 0;
  const progress_callback = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status === "progress" && p.file) {
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      const frac = total ? loaded / total : 0;
      const now = Date.now();
      if (now - last > 250) {
        last = now;
        send({ id: reqId, type: "progress", stage: "download", value: frac });
      }
    }
  };
  send({ id: reqId, type: "progress", stage: "load", value: -1 });
  translator = (await tf.pipeline("translation", MODEL_ID, { dtype: "q8", progress_callback })) as Translator;
  await fsp.mkdir(cacheDir, { recursive: true });
  await fsp.writeFile(path.join(cacheDir, ".nllb-complete"), new Date().toISOString());
  return translator;
}

async function translate(req: TranslateRequest): Promise<string[]> {
  const t = await load(req.cacheDir, req.id);
  const out: string[] = new Array(req.texts.length).fill("");
  const idx = req.texts.map((s, i) => (s.trim() ? i : -1)).filter((i) => i >= 0);
  for (let b = 0; b < idx.length; b += BATCH) {
    const slice = idx.slice(b, b + BATCH);
    const res = await t(slice.map((i) => req.texts[i]), { src_lang: req.src, tgt_lang: req.tgt, max_length: 512 });
    slice.forEach((i, k) => (out[i] = res[k]?.translation_text?.trim() ?? ""));
    send({ id: req.id, type: "progress", stage: "translate", value: Math.min(1, (b + BATCH) / idx.length) });
  }
  return out;
}

port.on("message", async (e: { data: Req }) => {
  const req = e.data;
  try {
    const data = req.type === "translate" ? await translate(req) : (await load(req.cacheDir, req.id), true);
    send({ id: req.id, type: "result", data });
  } catch (err) {
    send({ id: req.id, type: "error", message: err instanceof Error ? err.message : String(err) });
  }
});
