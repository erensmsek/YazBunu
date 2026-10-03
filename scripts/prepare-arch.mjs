// Farklı bir mimari için paketlemeden önce native bağımlılıkları hazırlar.
// Örn. Apple Silicon Mac'te Intel (x64) sürümü: node scripts/prepare-arch.mjs x64
// - sherpa-onnx'in hedef mimari paketini kurar
// - ffmpeg-static ikilisini hedef mimari için yeniden indirir
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arch = process.argv[2] ?? process.arch;
const platform = process.argv[3] ?? process.platform;
const plat = platform === "win32" ? "win" : platform;
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

console.log(`→ sherpa-onnx-${plat}-${arch}`);
execFileSync(npm, ["install", "--no-save", "--force", `sherpa-onnx-${plat}-${arch}@1.13.8`], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });

// transformers.js (offline çeviri) sharp'ı açılışta yükler: hedefin sharp ikilisi gerekli.
const sharpVersion = JSON.parse(readFileSync(path.join(root, "node_modules/sharp/package.json"), "utf8")).version;
const sharpPkgs = [`@img/sharp-${platform}-${arch}@${sharpVersion}`];
if (platform !== "win32") {
  const libvips = JSON.parse(readFileSync(path.join(root, "node_modules/sharp/package.json"), "utf8")).optionalDependencies?.[`@img/sharp-libvips-${platform}-${arch}`];
  if (libvips) sharpPkgs.push(`@img/sharp-libvips-${platform}-${arch}@${libvips}`);
}
console.log(`→ ${sharpPkgs.join(", ")}`);
execFileSync(npm, ["install", "--no-save", "--force", ...sharpPkgs], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });

console.log(`→ ffmpeg (${platform}-${arch})`);
execFileSync(process.execPath, [path.join(root, "node_modules/ffmpeg-static/install.js")], {
  cwd: path.join(root, "node_modules/ffmpeg-static"),
  stdio: "inherit",
  env: { ...process.env, npm_config_arch: arch, npm_config_platform: platform },
});
// Başka platform/mimarinin ikililerini kaldır (pakete karışmasın).
const nm = path.join(root, "node_modules");
for (const d of readdirSync(nm)) {
  if (d.startsWith("sherpa-onnx-") && d !== "sherpa-onnx-node" && d !== `sherpa-onnx-${plat}-${arch}`) {
    rmSync(path.join(nm, d), { recursive: true, force: true });
    console.log(`  - ${d}`);
  }
}
const img = path.join(nm, "@img");
if (existsSync(img)) {
  for (const d of readdirSync(img)) {
    const m = /^sharp-(?:libvips-)?([a-z0-9]+)-([a-z0-9]+)$/.exec(d);
    if (m && !(m[1] === platform && m[2] === arch)) {
      rmSync(path.join(img, d), { recursive: true, force: true });
      console.log(`  - @img/${d}`);
    }
  }
}
if (platform === "win32") rmSync(path.join(nm, "ffmpeg-static", "ffmpeg"), { force: true });
else rmSync(path.join(nm, "ffmpeg-static", "ffmpeg.exe"), { force: true });

console.log("hazır. Şimdi: npx electron-builder --" + (platform === "darwin" ? "mac" : platform === "win32" ? "win" : "linux") + ` --${arch}`);
