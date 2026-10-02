// Uygulamaya gömülen modelleri resources/models altına indirir (paketlemeden önce çalışır).
// - segmentation.onnx : pyannote segmentation-3.0 (MIT)
// - embedding.onnx    : WeSpeaker ResNet34-LM (CC-BY-4.0)
// - silero_vad.onnx   : Silero VAD (MIT)
// Kullanım: node scripts/fetch-models.mjs [--whisper-tiny <hedef klasör>]  (tiny yalnızca testler için)
import { createWriteStream, existsSync, createReadStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const bz2 = require("unbzip2-stream");
const tar = require("tar-stream");

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const GH = "https://github.com/k2-fsa/sherpa-onnx/releases/download";
const outDir = path.join(root, "resources", "models");

async function download(url, dest) {
  const resp = await fetch(url, { redirect: "follow" });
  if (!resp.ok || !resp.body) throw new Error(`${url} → HTTP ${resp.status}`);
  const part = dest + ".part";
  await pipeline(Readable.fromWeb(resp.body), createWriteStream(part));
  await rename(part, dest);
}

async function extract(archive, dir, filter) {
  await mkdir(dir, { recursive: true });
  const ex = tar.extract();
  const names = [];
  ex.on("entry", (h, stream, next) => {
    const base = path.basename(h.name);
    if (h.type !== "file" || !filter(base)) {
      stream.on("end", next);
      stream.resume();
      return;
    }
    const out = createWriteStream(path.join(dir, base));
    stream.pipe(out);
    out.on("finish", () => {
      names.push(base);
      next();
    });
  });
  await pipeline(createReadStream(archive), bz2(), ex);
  return names;
}

async function ensure(file, fn) {
  const target = path.join(outDir, file);
  if (existsSync(target) && (await stat(target)).size > 0) {
    console.log(`✓ ${file} (mevcut)`);
    return;
  }
  console.log(`↓ ${file}`);
  await fn(target);
  console.log(`✓ ${file} (${((await stat(target)).size / 1e6).toFixed(1)} MB)`);
}

await mkdir(outDir, { recursive: true });

await ensure("segmentation.onnx", async (target) => {
  const archive = path.join(outDir, "seg.tar.bz2");
  await download(`${GH}/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2`, archive);
  const tmp = path.join(outDir, "seg-tmp");
  await extract(archive, tmp, (n) => n === "model.onnx");
  await rename(path.join(tmp, "model.onnx"), target);
  await rm(tmp, { recursive: true, force: true });
  await rm(archive, { force: true });
});

await ensure("embedding.onnx", (target) =>
  download(`${GH}/speaker-recongition-models/wespeaker_en_voxceleb_resnet34_LM.onnx`, target),
);

await ensure("silero_vad.onnx", (target) => download(`${GH}/asr-models/silero_vad.onnx`, target));

const tinyIdx = process.argv.indexOf("--whisper-tiny");
if (tinyIdx > 0) {
  const dir = process.argv[tinyIdx + 1];
  if (existsSync(path.join(dir, ".complete"))) {
    console.log("✓ whisper-tiny (mevcut)");
  } else {
    console.log("↓ whisper-tiny (test)");
    await mkdir(dir, { recursive: true });
    const archive = path.join(dir, "tiny.tar.bz2");
    await download(`${GH}/asr-models/sherpa-onnx-whisper-tiny.tar.bz2`, archive);
    await extract(archive, dir, (n) => n.endsWith(".int8.onnx") || n.endsWith("tokens.txt") || n === "0.wav" || n === "1.wav");
    await rm(archive, { force: true });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path.join(dir, ".complete"), "ok");
    console.log("✓ whisper-tiny");
  }
}

// Atıf dosyası (CC-BY-4.0 gereği)
const { writeFile } = await import("node:fs/promises");
await writeFile(
  path.join(outDir, "ATTRIBUTION.md"),
  `# Gömülü modeller

- segmentation.onnx — pyannote/segmentation-3.0 (Hervé Bredin), MIT lisansı; ONNX dönüşümü: k2-fsa/sherpa-onnx.
- embedding.onnx — WeSpeaker ResNet34-LM (VoxCeleb), CC-BY-4.0; https://github.com/wenet-e2e/wespeaker
- silero_vad.onnx — Silero VAD, MIT lisansı; https://github.com/snakers4/silero-vad
`,
);
console.log("modeller hazır →", path.relative(root, outDir));
