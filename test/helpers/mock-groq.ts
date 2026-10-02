// Sahte Groq sunucusu: unit ve E2E testlerinde gerçek API yerine kullanılır.
import http from "node:http";
import type { AddressInfo } from "node:net";

export interface RecordedRequest {
  path: string;
  headers: http.IncomingHttpHeaders;
  fields: Record<string, string[]>;
  fileBytes: number;
  json?: Record<string, unknown>;
}

export interface MockGroq {
  url: string;
  requests: RecordedRequest[];
  /** Sıradaki isteklere uygulanacak hazır yanıtlar (ör. 429). */
  failNext: (resp: { status: number; body?: unknown; headers?: Record<string, string> }, count?: number) => void;
  /** Transkript metni üretimi: (parça indeksi, süre) → segment metinleri */
  transcriptText: (fn: (callIndex: number, duration: number) => string[]) => void;
  close: () => Promise<void>;
}

function parseMultipart(body: Buffer, contentType: string): { fields: Record<string, string[]>; fileBytes: number; fileData?: Buffer } {
  const m = /boundary=(.+)$/.exec(contentType);
  const fields: Record<string, string[]> = {};
  let fileBytes = 0;
  let fileData: Buffer | undefined;
  if (!m) return { fields, fileBytes };
  const boundary = Buffer.from(`--${m[1]}`);
  let pos = body.indexOf(boundary);
  while (pos >= 0) {
    const next = body.indexOf(boundary, pos + boundary.length);
    if (next < 0) break;
    const part = body.subarray(pos + boundary.length + 2, next - 2);
    const headerEnd = part.indexOf("\r\n\r\n");
    const header = part.subarray(0, headerEnd).toString();
    const content = part.subarray(headerEnd + 4);
    const name = /name="([^"]+)"/.exec(header)?.[1] ?? "";
    if (/filename=/.test(header)) {
      fileBytes = content.length;
      fileData = content;
    } else (fields[name] ??= []).push(content.toString());
    pos = next;
  }
  return { fields, fileBytes, fileData };
}

export async function startMockGroq(): Promise<MockGroq> {
  const requests: RecordedRequest[] = [];
  const failQueue: { status: number; body?: unknown; headers?: Record<string, string> }[] = [];
  let transcribeCalls = 0;
  let textFn = (i: number, dur: number) => {
    const n = Math.max(1, Math.round(dur / 4));
    return Array.from({ length: n }, (_, k) => `Parça ${i} cümle ${k + 1}.`);
  };

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const path = (req.url ?? "").replace(/^\/openai\/v1/, "");
      const rec: RecordedRequest = { path, headers: req.headers, fields: {}, fileBytes: 0 };
      requests.push(rec);
      const send = (status: number, payload: unknown, headers: Record<string, string> = {}) => {
        res.writeHead(status, { "Content-Type": "application/json", ...headers });
        res.end(typeof payload === "string" ? payload : JSON.stringify(payload));
      };
      if (req.headers.authorization !== "Bearer test-key") return send(401, { error: { message: "Invalid API Key" } });
      const fail = failQueue.shift();
      if (fail) return send(fail.status, fail.body ?? { error: { message: "mock failure" } }, fail.headers);

      if (path === "/models") return send(200, { data: [] });

      if (path === "/audio/transcriptions") {
        const { fields, fileBytes, fileData } = parseMultipart(body, req.headers["content-type"] ?? "");
        rec.fields = fields;
        rec.fileBytes = fileBytes;
        // WAV başlığından süre: (boyut-44) / 32000
        const duration = fileData ? Math.max(0, (fileData.length - 44) / 32000) : 0;
        const texts = textFn(transcribeCalls++, duration);
        const step = duration / texts.length;
        const segments = texts.map((text, k) => ({
          id: k,
          start: +(k * step).toFixed(2),
          end: +((k + 1) * step).toFixed(2),
          text: " " + text,
          avg_logprob: -0.2,
          no_speech_prob: 0.01,
        }));
        const words = segments.flatMap((s) => {
          const ws = s.text.trim().split(/\s+/);
          const d = (s.end - s.start) / ws.length;
          return ws.map((word, j) => ({ word, start: +(s.start + j * d).toFixed(2), end: +(s.start + (j + 1) * d).toFixed(2) }));
        });
        return send(200, { task: "transcribe", language: fields.language?.[0] ? "english" : "turkish", duration, text: texts.join(" "), segments, words });
      }

      if (path === "/chat/completions") {
        const json = JSON.parse(body.toString());
        rec.json = json;
        const system: string = json.messages[0].content;
        const user: string = json.messages[1].content;
        let content: string;
        if (json.response_format?.type === "json_object") {
          const input = JSON.parse(user) as Record<string, string>;
          const target = /to (\w+)\./.exec(system)?.[1] ?? "X";
          content = JSON.stringify(Object.fromEntries(Object.entries(input).map(([k, v]) => [k, `[${target}] ${v}`])));
        } else if (/özetleme asistanı/.test(system)) {
          content = `Bu konuşmanın özeti (${user.length} karakter).`;
        } else if (/not alma asistanı/.test(system)) {
          content = "- önemli nokta";
        } else if (/metin editörü/.test(system)) {
          const text = user.replace(/^Transkript:\n\n/, "");
          content = /DEVAMIDIR/.test(system) ? `## Devam\n\n${text}` : `# Başlık\n\n${text}`;
        } else {
          content = `[translated] ${user}`;
        }
        return send(200, { choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }] });
      }
      send(404, { error: { message: "not found" } });
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}/openai/v1`,
    requests,
    failNext: (resp, count = 1) => {
      for (let i = 0; i < count; i++) failQueue.push(resp);
    },
    transcriptText: (fn) => {
      textFn = fn;
    },
    close: () => new Promise((r) => server.close(() => r())),
  };
}
