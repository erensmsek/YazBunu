// Worker iletişim kanalı: Electron utilityProcess'te process.parentPort, düz Node'da
// (testlerde child_process.fork) process.send/on("message") kullanılır.
export interface WorkerPort {
  on(event: "message", fn: (e: { data: never }) => void): void;
  postMessage(msg: unknown): void;
}

export function workerPort(): WorkerPort {
  const pp = (process as unknown as { parentPort?: WorkerPort }).parentPort;
  if (pp) return pp;
  return {
    on: (_event, fn) => process.on("message", (data) => fn({ data: data as never })),
    postMessage: (msg) => process.send?.(msg),
  };
}
