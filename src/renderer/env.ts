// Preload'un açtığı API ve renderer genelinde paylaşılan küçük yardımcılar.
import type { YazbunuApi } from "../shared/ipc";

export const api: YazbunuApi = (window as unknown as { yazbunu: YazbunuApi }).yazbunu;

export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} bulunamadı`);
  return el as T;
}

export function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

export function newJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** IPC'den gelen hata nesnesi: { code, detail } taşır. */
export interface UiError {
  code?: string;
  detail?: string;
  message?: string;
}
