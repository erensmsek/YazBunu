// Farklı bir mimari için paketlemeden önce native bağımlılıkları hazırlar.
// Örn. Apple Silicon Mac'te Intel (x64) sürümü: node scripts/prepare-arch.mjs x64
// - sherpa-onnx'in hedef mimari paketini kurar
// - ffmpeg-static ikilisini hedef mimari için yeniden indirir
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arch = process.argv[2] ?? process.arch;
const platform = process.argv[3] ?? process.platform;
const plat = platform === "win32" ? "win" : platform;
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

console.log(`→ sherpa-onnx-${plat}-${arch}`);
execFileSync(npm, ["install", "--no-save", "--force", `sherpa-onnx-${plat}-${arch}@1.13.8`], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });

console.log(`→ ffmpeg (${platform}-${arch})`);
execFileSync(process.execPath, [path.join(root, "node_modules/ffmpeg-static/install.js")], {
  cwd: path.join(root, "node_modules/ffmpeg-static"),
  stdio: "inherit",
  env: { ...process.env, npm_config_arch: arch, npm_config_platform: platform },
});
console.log("hazır. Şimdi: npx electron-builder --" + (platform === "darwin" ? "mac" : platform === "win32" ? "win" : "linux") + ` --${arch}`);
