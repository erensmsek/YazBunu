// Electron utilityProcess: sherpa-onnx ile konuşmacı ayrımı ve offline Whisper.
// Ayrı süreçte çalışır: arayüzü dondurmaz, iptal = süreci sonlandır.
import os from "node:os";
import { promises as fsp } from "node:fs";
import { workerPort } from "./port";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sherpa = require("sherpa-onnx-node");

const SR = 16000;
const THREADS = Math.max(1, Math.min(4, os.cpus().length - 1));

export interface DiarizeRequest {
  id: number;
  type: "diarize";
  pcmPath: string;
  segmentation: string;
  embedding: string;
  numSpeakers: number;
}

export interface AsrRequest {
  id: number;
  type: "asr";
  pcmPath: string;
  start?: number;
  end?: number;
  model: { encoder: string; decoder: string; tokens: string };
  vad: string;
  language: string;
}

export type WorkerRequest = DiarizeRequest | AsrRequest | { id: number; type: "ping" };

export interface WorkerSegment {
  start: number;
  end: number;
  text: string;
}

const port = workerPort();

function send(msg: unknown): void {
  port.postMessage(msg);
}

async function readFloat(pcmPath: string, start?: number, end?: number): Promise<Float32Array> {
  const buf = await fsp.readFile(pcmPath);
  const from = start ? Math.floor(start * SR) * 2 : 0;
  const to = end ? Math.min(buf.length, Math.floor(end * SR) * 2) : buf.length - (buf.length % 2);
  const n = Math.max(0, (to - from) >> 1);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(from + i * 2) / 32768;
  return out;
}

// ---------- Diyarizasyon ----------

let diarizer: { sd: { process(s: Float32Array): { start: number; end: number; speaker: number }[]; setConfig(c: unknown): void }; key: string } | null = null;

/** Otomatik modda eşik: 4 konuşmacılı test kaydıyla kalibre edildi (0.5 az, 0.3 fazla küme üretiyor). */
const AUTO_THRESHOLD = 0.4;

function diarize(req: DiarizeRequest) {
  const key = `${req.segmentation}|${req.embedding}`;
  if (!diarizer || diarizer.key !== key) {
    diarizer = {
      key,
      sd: new sherpa.OfflineSpeakerDiarization({
        segmentation: { pyannote: { model: req.segmentation }, numThreads: THREADS },
        embedding: { model: req.embedding, numThreads: THREADS },
        clustering: { numClusters: -1, threshold: AUTO_THRESHOLD },
        minDurationOn: 0.2,
        minDurationOff: 0.5,
      }),
    };
  }
  diarizer.sd.setConfig({
    clustering: req.numSpeakers > 0 ? { numClusters: req.numSpeakers, threshold: AUTO_THRESHOLD } : { numClusters: -1, threshold: AUTO_THRESHOLD },
  });
  return readFloat(req.pcmPath).then((samples) => {
    send({ id: req.id, type: "progress", value: -1 });
    const turns = diarizer!.sd.process(samples);
    return turns.map((t) => ({ start: t.start, end: t.end, speaker: t.speaker }));
  });
}

// ---------- Offline Whisper (VAD + Whisper) ----------

interface Recognizer {
  createStream(): { acceptWaveform(w: { samples: Float32Array; sampleRate: number }): void };
  decode(s: unknown): void;
  getResult(s: unknown): { text: string; lang?: string };
  setConfig(c: unknown): void;
}

let recognizer: { rec: Recognizer; encoder: string; language: string; config: Record<string, unknown> } | null = null;

function recognizerConfig(model: AsrRequest["model"], language: string) {
  return {
    featConfig: { sampleRate: SR, featureDim: 80 },
    modelConfig: {
      whisper: { encoder: model.encoder, decoder: model.decoder, language, task: "transcribe", tailPaddings: -1 },
      tokens: model.tokens,
      numThreads: THREADS,
      provider: "cpu",
      debug: 0,
    },
  };
}

function getRecognizer(model: AsrRequest["model"], language: string): Recognizer {
  if (!recognizer || recognizer.encoder !== model.encoder) {
    send({ id: -1, type: "log", message: `loading whisper ${model.encoder}` });
    const config = recognizerConfig(model, language);
    recognizer = { rec: new sherpa.OfflineRecognizer(config), encoder: model.encoder, language, config };
  } else if (recognizer.language !== language) {
    const config = recognizerConfig(model, language);
    recognizer.rec.setConfig(config);
    recognizer.language = language;
    recognizer.config = config;
  }
  return recognizer.rec;
}

function decodeSegment(rec: Recognizer, samples: Float32Array): { text: string; lang: string } {
  const st = rec.createStream();
  st.acceptWaveform({ samples, sampleRate: SR });
  rec.decode(st);
  const r = rec.getResult(st);
  return { text: (r.text ?? "").trim(), lang: (r.lang ?? "").replace(/[<>|]/g, "").trim() };
}

/** Whisper'ın sessizlik/müzikte sık uydurduğu kalıplar (yalnızca segmentin tamamıysa atılır). */
const HALLUCINATIONS = [
  /^(altyazı|alt yazı)\s*m\.?k\.?\.?$/i,
  /^(thanks|thank you) for watching[.!]?$/i,
  /^izlediğiniz için teşekkürler[.!]?$/i,
  /^\[?(music|müzik|applause|alkış)\]?$/i,
  /^(\.|…|-)+$/,
];

async function asr(req: AsrRequest) {
  const offset = req.start ?? 0;
  const samples = await readFloat(req.pcmPath, req.start, req.end);
  let language = req.language;
  const rec = getRecognizer(req.model, language);
  const vad = new sherpa.Vad(
    {
      sileroVad: { model: req.vad, threshold: 0.5, minSpeechDuration: 0.25, minSilenceDuration: 0.5, windowSize: 512, maxSpeechDuration: 20 },
      sampleRate: SR,
      numThreads: 1,
    },
    60,
  );
  const segments: WorkerSegment[] = [];
  const langVotes = new Map<string, number>();
  let lastProgress = 0;

  const drain = () => {
    while (!vad.isEmpty()) {
      const seg = vad.front(false) as { start: number; samples: Float32Array };
      vad.pop();
      let r = decodeSegment(rec, seg.samples);
      const dur = seg.samples.length / SR;
      if (!language && r.lang) {
        // Dil bir kez (ilk konuşma bölümünden) belirlenir ve sabitlenir; her segmentte
        // ayrı algılama kısa segmentlerde dili zıplatıyor.
        language = r.lang;
        getRecognizer(req.model, language);
        if (dur < 3) r = decodeSegment(rec, seg.samples);
      }
      if (r.lang) langVotes.set(r.lang, (langVotes.get(r.lang) ?? 0) + dur);
      if (!r.text || HALLUCINATIONS.some((re) => re.test(r.text))) continue;
      segments.push({ start: offset + seg.start / SR, end: offset + (seg.start + seg.samples.length) / SR, text: r.text });
    }
  };

  const win = 512;
  for (let i = 0; i + win <= samples.length; i += win) {
    vad.acceptWaveform(samples.subarray(i, i + win));
    drain();
    const p = i / samples.length;
    if (p - lastProgress > 0.01) {
      lastProgress = p;
      send({ id: req.id, type: "progress", value: p });
    }
  }
  vad.flush();
  drain();
  const detected = language || [...langVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  return { segments, language: detected };
}

port.on("message", async (e: { data: WorkerRequest }) => {
  const req = e.data;
  try {
    let data: unknown;
    if (req.type === "diarize") data = await diarize(req);
    else if (req.type === "asr") data = await asr(req);
    else data = { ok: true, version: sherpa.version };
    send({ id: req.id, type: "result", data });
  } catch (err) {
    send({ id: req.id, type: "error", message: err instanceof Error ? err.message : String(err) });
  }
});
