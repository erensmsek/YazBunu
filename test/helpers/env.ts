import { cpSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ModelManager } from "../../src/main/models";
import { WorkerHost, nodeForkSpawner } from "../../src/main/worker-host";
import { decodeToPcm } from "../../src/main/audio";

export const ROOT = path.resolve(__dirname, "../..");
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const FFMPEG: string = require("ffmpeg-static");

export function tmpDir(prefix = "yb-"): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** whisper-tiny kurulu sayılan bir model yöneticisi (gömülü modeller resources/models'tan). */
export function testModels(): ModelManager {
  const userDir = tmpDir("yb-models-");
  const dest = path.join(userDir, "whisper-tiny");
  mkdirSync(dest, { recursive: true });
  for (const f of ["tiny-encoder.int8.onnx", "tiny-decoder.int8.onnx", "tiny-tokens.txt"]) {
    cpSync(path.join(ROOT, ".cache/whisper-tiny", f), path.join(dest, f));
  }
  writeFileSync(path.join(dest, ".complete"), "ok");
  return new ModelManager(path.join(ROOT, "resources/models"), userDir, (i, init) => fetch(i, init));
}

export function mlHost(): WorkerHost {
  return new WorkerHost(nodeForkSpawner(path.join(ROOT, ".cache/test-dist/workers/ml-worker.js")), "ml", () => undefined, "errLocalAsr");
}

export async function fixturePcm(name: string, dir = tmpDir()): Promise<string> {
  const src = name.startsWith("0-four") ? path.join(ROOT, ".cache/fixtures", name) : path.join(ROOT, ".cache/whisper-tiny", name);
  const out = path.join(dir, name + ".pcm");
  await decodeToPcm(FFMPEG, src, out);
  return out;
}
