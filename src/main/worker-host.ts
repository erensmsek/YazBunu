// utilityProcess (ya da testlerde child_process) üzerinde istek/yanıt köprüsü.
// İstekler sıraya alınır (worker tek iş parçacıklı); iptal = süreci öldür.
import { AppError, CANCELLED } from "./errors";

export interface ChildLike {
  postMessage(msg: unknown): void;
  onMessage(fn: (msg: unknown) => void): void;
  onExit(fn: (code: number | null) => void): void;
  kill(): void;
}

export type Spawner = () => ChildLike;

interface WorkerMessage {
  id: number;
  type: "progress" | "result" | "error" | "log";
  value?: number;
  stage?: string;
  data?: unknown;
  message?: string;
  /** Worker kullanıcıya gösterilebilir bir i18n kodu verdiyse onu kullan. */
  code?: string;
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  onProgress?: (value: number, stage?: string) => void;
}

export class WorkerHost {
  private child: ChildLike | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly spawn: Spawner,
    private readonly name: string,
    private readonly log: (msg: string) => void = () => undefined,
    /** Yerel (native) çöküşü kullanıcıya gösterilebilir hataya çevirir. */
    private readonly crashCode = "errUnknown",
  ) {}

  private ensure(): ChildLike {
    if (this.child) return this.child;
    const child = this.spawn();
    child.onMessage((raw) => {
      const msg = raw as WorkerMessage;
      if (msg.type === "log") return this.log(`[${this.name}] ${msg.message}`);
      const p = this.pending.get(msg.id);
      if (!p) return;
      if (msg.type === "progress") p.onProgress?.(msg.value ?? -1, msg.stage);
      else if (msg.type === "result") {
        this.pending.delete(msg.id);
        p.resolve(msg.data);
      } else if (msg.type === "error") {
        this.pending.delete(msg.id);
        p.reject(new AppError(msg.code ?? this.crashCode, msg.message));
      }
    });
    child.onExit((code) => {
      if (this.child === child) this.child = null;
      const err = new AppError(this.crashCode, `${this.name} exited (${code})`);
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    });
    this.child = child;
    return child;
  }

  /** İsteği sıraya ekler. signal iptal edilirse worker öldürülür ve istek CANCELLED ile reddedilir. */
  call<T>(payload: Record<string, unknown>, opts: { signal?: AbortSignal; onProgress?: (v: number, stage?: string) => void } = {}): Promise<T> {
    const run = () =>
      new Promise<T>((resolve, reject) => {
        if (opts.signal?.aborted) return reject(new AppError(CANCELLED));
        const id = this.nextId++;
        const onAbort = () => {
          this.pending.delete(id);
          reject(new AppError(CANCELLED));
          this.kill();
        };
        opts.signal?.addEventListener("abort", onAbort, { once: true });
        this.pending.set(id, {
          resolve: (v) => {
            opts.signal?.removeEventListener("abort", onAbort);
            resolve(v as T);
          },
          reject: (e) => {
            opts.signal?.removeEventListener("abort", onAbort);
            reject(e);
          },
          onProgress: opts.onProgress,
        });
        try {
          this.ensure().postMessage({ ...payload, id });
        } catch (err) {
          this.pending.delete(id);
          reject(err);
        }
      });
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  kill(): void {
    const child = this.child;
    this.child = null;
    if (child) {
      for (const p of this.pending.values()) p.reject(new AppError(CANCELLED));
      this.pending.clear();
      child.kill();
    }
  }
}

/** Node child_process.fork tabanlı spawner (testler ve Electron dışı kullanım). */
export function nodeForkSpawner(modulePath: string, env: NodeJS.ProcessEnv = process.env): Spawner {
  return () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { fork } = require("node:child_process") as typeof import("node:child_process");
    const cp = fork(modulePath, [], { env, stdio: ["ignore", "inherit", "inherit", "ipc"] });
    return {
      postMessage: (m) => cp.send(m as never),
      onMessage: (fn) => cp.on("message", fn),
      onExit: (fn) => cp.on("exit", (code) => fn(code)),
      kill: () => cp.kill("SIGKILL"),
    };
  };
}
