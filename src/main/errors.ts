// Kullanıcıya gösterilebilir hata: code = i18n anahtarı, detail = teknik ek bilgi.
import type { AppErrorPayload } from "../shared/types";

export class AppError extends Error {
  readonly code: string;
  readonly detail?: string;

  constructor(code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "AppError";
    this.code = code;
    this.detail = detail;
  }
}

/** İptal edilen işler bu hatayı fırlatır; arayüzde hata olarak değil "İptal edildi" olarak görünür. */
export const CANCELLED = "statusCancelled";

export function isCancelled(err: unknown): boolean {
  return (
    (err instanceof AppError && err.code === CANCELLED) ||
    (err instanceof Error && err.name === "AbortError")
  );
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AppError(CANCELLED);
}

export function toPayload(err: unknown): AppErrorPayload {
  if (isCancelled(err)) return { code: CANCELLED };
  if (err instanceof AppError) return { code: err.code, detail: err.detail };
  const msg = err instanceof Error ? err.message : String(err);
  return { code: "errUnknown", detail: msg.slice(0, 500) };
}

/** Bekleme; iptal edilirse hemen AppError(CANCELLED) fırlatır. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AppError(CANCELLED));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AppError(CANCELLED));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
