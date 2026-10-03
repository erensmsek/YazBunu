// Paketlenmiş uygulamayı doğrular: asar içinde yalnızca çalışma zamanı dosyaları, hedef platformun
// native ikilileri ve gömülü modeller var mı? Kullanım: node scripts/verify-package.mjs <unpacked klasörü> <platform> <arch>
// Örn: node scripts/verify-package.mjs release/linux-unpacked linux x64
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const asar = require("@electron/asar");

const [dir, platform = process.platform, arch = process.arch] = process.argv.slice(2);
if (!dir) {
  console.error("kullanım: verify-package.mjs <unpacked> [platform] [arch]");
  process.exit(2);
}
const resources = platform === "darwin"
  ? path.join(dir, readdirSync(dir).find((f) => f.endsWith(".app")) ?? "", "Contents", "Resources")
  : path.join(dir, "resources");
const errors = [];
const check = (cond, msg) => (cond ? console.log("✓", msg) : errors.push(msg));

const files = asar.listPackage(path.join(resources, "app.asar")).map((f) => f.replace(/\\/g, "/"));
const top = new Set(files.map((f) => f.split("/")[1]).filter(Boolean));
const allowedTop = new Set(["dist", "node_modules", "package.json"]);
check([...top].every((t) => allowedTop.has(t)), `asar yalnızca dist/node_modules/package.json içeriyor (bulunan: ${[...top].join(", ")})`);
check(!files.some((f) => f.endsWith(".map")), "kaynak haritası (.map) yok");
for (const f of ["/dist/main/main.js", "/dist/preload/preload.js", "/dist/renderer/index.html", "/dist/workers/ml-worker.js", "/dist/workers/nllb-worker.js"]) {
  check(files.includes(f), `asar: ${f}`);
}

const unpacked = path.join(resources, "app.asar.unpacked", "node_modules");
const plat = platform === "win32" ? "win" : platform;
check(existsSync(path.join(unpacked, `sherpa-onnx-${plat}-${arch}`, "sherpa-onnx.node")), `sherpa-onnx-${plat}-${arch} native modülü`);
const others = readdirSync(unpacked).filter((d) => d.startsWith("sherpa-onnx-") && d !== "sherpa-onnx-node" && d !== `sherpa-onnx-${plat}-${arch}`);
check(others.length === 0, `başka platformun sherpa ikilisi yok (${others.join(", ") || "-"})`);
const ffmpeg = path.join(unpacked, "ffmpeg-static", platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
check(existsSync(ffmpeg) && statSync(ffmpeg).size > 1e6, `ffmpeg (${path.basename(ffmpeg)})`);
const ortBin = path.join(unpacked, "onnxruntime-node", "bin", "napi-v6");
const ortPlats = existsSync(ortBin) ? readdirSync(ortBin) : [];
if (platform === "darwin" && arch === "x64") {
  console.log("• Intel Mac: onnxruntime-node ikilisi yok (offline çeviri bu platformda kapalı)");
} else {
  check(ortPlats.length === 1 && ortPlats[0] === platform && existsSync(path.join(ortBin, platform, arch)), `onnxruntime-node yalnızca ${platform}/${arch} (bulunan: ${ortPlats.join(", ")})`);
}
const sharpPkgs = existsSync(path.join(unpacked, "@img")) ? readdirSync(path.join(unpacked, "@img")) : [];
check(sharpPkgs.some((p) => p === `sharp-${platform}-${arch}`), `sharp ikilisi @img/sharp-${platform}-${arch}`);
for (const m of ["segmentation.onnx", "embedding.onnx", "silero_vad.onnx"]) {
  check(existsSync(path.join(resources, "models", m)), `gömülü model: ${m}`);
}

if (errors.length) {
  console.error("\n✗ Paket doğrulaması başarısız:");
  for (const e of errors) console.error("  ✗", e);
  process.exit(1);
}
console.log("\npaket doğrulandı ✓");
