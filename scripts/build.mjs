// esbuild ile main, preload, worker ve renderer paketlerini dist/ altına üretir.
import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");
const watch = process.argv.includes("--watch");

// Native modüller ve büyük çalışma zamanı paketleri bundle'a girmez; node_modules'tan yüklenir.
const nodeExternal = [
  "electron",
  "sherpa-onnx-node",
  "ffmpeg-static",
  "@huggingface/transformers",
  "onnxruntime-node",
  "sharp",
];

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, "renderer"), { recursive: true });

const common = { bundle: true, sourcemap: true, logLevel: "warning", minify: false };

await Promise.all([
  build({
    ...common,
    entryPoints: {
      "main/main": "src/main/main.ts",
      "workers/ml-worker": "src/workers/ml-worker.ts",
      "workers/nllb-worker": "src/workers/nllb-worker.ts",
    },
    outdir: dist,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: nodeExternal,
  }),
  build({
    ...common,
    entryPoints: { "preload/preload": "src/preload/preload.ts" },
    outdir: dist,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron"],
  }),
  build({
    ...common,
    entryPoints: { "renderer/app": "src/renderer/app.ts", "renderer/pcm-worklet": "src/renderer/pcm-worklet.ts" },
    outdir: dist,
    platform: "browser",
    format: "iife",
    target: "chrome130",
  }),
]);

for (const f of ["index.html", "style.css"]) {
  await cp(path.join(root, "src/renderer", f), path.join(dist, "renderer", f));
}
await cp(path.join(root, "resources/icons"), path.join(dist, "renderer/icons"), { recursive: true });

if (!watch) console.log("build ok →", path.relative(root, dist));
