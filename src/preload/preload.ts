// contextBridge: renderer'a yalnızca beyaz listedeki IPC kanallarını açar (nodeIntegration kapalı).
import { contextBridge, ipcRenderer, webUtils } from "electron";
import { AUDIO_PROTOCOL, EVENT_CHANNELS, INVOKE_CHANNELS, type IpcResult, type YazbunuApi } from "../shared/ipc";
import type { HistoryRecord } from "../shared/types";

/** Main'den gelen {ok:false} yanıtını, kodu taşıyan bir Error'a çevirir. */
class IpcError extends Error {
  constructor(
    readonly code: string,
    readonly detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>;
  if (res.ok) return res.data;
  const err = new IpcError(res.error.code, res.error.detail);
  throw Object.assign(err, { code: res.error.code, detail: res.error.detail });
}

const api: Record<string, unknown> = {};
for (const ch of INVOKE_CHANNELS) api[ch] = (...args: unknown[]) => invoke(ch, ...args);

Object.assign(api, {
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  audioUrl: (record: HistoryRecord) =>
    record.audioFile ? `${AUDIO_PROTOCOL}://audio/${encodeURIComponent(record.audioFile)}` : null,
  pushAudio: (sessionId: string, samples: Int16Array) => {
    // ArrayBuffer olarak gönder: yapılandırılmış klonlama hızlı ve kopyasız değil ama küçük (≈8 KB/250 ms).
    ipcRenderer.send("pushAudio", sessionId, samples.buffer.slice(samples.byteOffset, samples.byteOffset + samples.byteLength));
  },
  setRecordingState: (recording: boolean) => ipcRenderer.send("setRecordingState", recording),
  on: (channel: string, fn: (payload: unknown) => void) => {
    if (!(EVENT_CHANNELS as readonly string[]).includes(channel)) throw new Error(`unknown channel ${channel}`);
    const listener = (_e: Electron.IpcRendererEvent, payload: unknown) => fn(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});

contextBridge.exposeInMainWorld("yazbunu", api as unknown as YazbunuApi);
