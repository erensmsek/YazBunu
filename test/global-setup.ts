// Testlerden önce: worker'ları derle, gömülü modelleri ve test fixture'larını hazırla.
import { build } from "esbuild";
import { existsSync, mkdirSync, createWriteStream } from "node:fs";
import { execFileSync } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";

const root = path.resolve(__dirname, "..");

export default async function setup() {
  await build({
    entryPoints: {
      "ml-worker": path.join(root, "src/workers/ml-worker.ts"),
      "nllb-worker": path.join(root, "src/workers/nllb-worker.ts"),
    },
    outdir: path.join(root, ".cache/test-dist/workers"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["sherpa-onnx-node", "@huggingface/transformers", "onnxruntime-node", "sharp"],
    logLevel: "warning",
  });
  if (!existsSync(path.join(root, ".cache/whisper-tiny/.complete")) || !existsSync(path.join(root, "resources/models/embedding.onnx"))) {
    execFileSync(process.execPath, [path.join(root, "scripts/fetch-models.mjs"), "--whisper-tiny", path.join(root, ".cache/whisper-tiny")], { stdio: "inherit" });
  }
  const fx = path.join(root, ".cache/fixtures/0-four-speakers-zh.wav");
  if (!existsSync(fx)) {
    mkdirSync(path.dirname(fx), { recursive: true });
    const r = await fetch("https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/0-four-speakers-zh.wav");
    await pipeline(Readable.fromWeb(r.body as never), createWriteStream(fx));
  }
}
