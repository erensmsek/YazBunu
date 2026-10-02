// Linux sistem sesi: PulseAudio / PipeWire (pipewire-pulse) varsayılan çıkışın "monitor"
// kaynağını parec ile 16 kHz mono PCM olarak okur. Chromium Linux'ta loopback desteklemiyor.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

export function parecAvailable(): boolean {
  try {
    const r = spawnSync("parec", ["--version"], { timeout: 3000 });
    return r.status === 0;
  } catch {
    return false;
  }
}

export class ParecCapture extends EventEmitter {
  private proc: ChildProcess | null = null;
  private carry: Buffer | null = null;

  start(device = "@DEFAULT_MONITOR@"): void {
    if (this.proc) return;
    const proc = spawn(
      "parec",
      [`--device=${device}`, "--format=s16le", "--rate=16000", "--channels=1", "--latency-msec=100"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    this.proc = proc;
    let stderr = "";
    proc.stderr?.on("data", (d) => (stderr += String(d)));
    proc.stdout?.on("data", (chunk: Buffer) => {
      let data = this.carry ? Buffer.concat([this.carry, chunk]) : chunk;
      this.carry = null;
      if (data.length % 2) {
        this.carry = data.subarray(data.length - 1);
        data = data.subarray(0, data.length - 1);
      }
      if (!data.length) return;
      const copy = new Int16Array(data.length / 2);
      for (let i = 0; i < copy.length; i++) copy[i] = data.readInt16LE(i * 2);
      this.emit("data", copy);
    });
    proc.on("error", (err) => this.emit("error", err));
    proc.on("exit", (code) => {
      this.proc = null;
      if (code && code !== 0 && code !== null) this.emit("error", new Error(stderr.trim() || `parec exited ${code}`));
    });
  }

  stop(): void {
    this.proc?.kill("SIGTERM");
    this.proc = null;
  }
}
