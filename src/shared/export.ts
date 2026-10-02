// Dışa aktarma formatları (TXT · SRT · VTT · Markdown · JSON).
import type { Segment } from "./types";
import { speakerDisplayName } from "./speakers";

export type TranscriptFormat = "txt" | "srt" | "vtt" | "md" | "json";
export type MarkdownFormat = "md" | "txt";

export const TRANSCRIPT_FORMATS: TranscriptFormat[] = ["txt", "srt", "vtt", "md", "json"];
export const MARKDOWN_FORMATS: MarkdownFormat[] = ["md", "txt"];

export interface ExportDoc {
  title: string;
  language?: string;
  text: string;
  segments: Segment[];
  speakers?: Record<string, string>;
}

export interface ExportLabels {
  transcriptHeading: string;
  segmentsHeading: string;
  speakerLabel: (n: number) => string;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

function splitMs(seconds: number) {
  let ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  ms -= h * 3_600_000;
  const m = Math.floor(ms / 60_000);
  ms -= m * 60_000;
  const s = Math.floor(ms / 1000);
  ms -= s * 1000;
  return { h, m, s, ms };
}

export function srtTimestamp(seconds: number): string {
  const { h, m, s, ms } = splitMs(seconds);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

export function vttTimestamp(seconds: number): string {
  const { h, m, s, ms } = splitMs(seconds);
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

/** mm:ss, bir saati aşınca h:mm:ss. */
export function clockTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function nameOf(seg: Segment, doc: ExportDoc, labels: ExportLabels): string {
  return speakerDisplayName(seg.speaker, doc.speakers, labels.speakerLabel);
}

function hasSpeakers(segments: Segment[]): boolean {
  return segments.some((s) => s.speaker);
}

function toTxt(doc: ExportDoc, labels: ExportLabels): string {
  if (!hasSpeakers(doc.segments)) return doc.text.trim() + "\n";
  // Konuşmacılı metin: aynı kişinin ardışık segmentleri tek paragrafta.
  const paras: string[] = [];
  let lastName: string | null = null;
  for (const seg of doc.segments) {
    const name = nameOf(seg, doc, labels);
    const text = seg.text.trim();
    if (!text) continue;
    if (name === lastName && paras.length) paras[paras.length - 1] += " " + text;
    else paras.push(name ? `${name}: ${text}` : text);
    lastName = name;
  }
  return paras.join("\n\n") + "\n";
}

function toSrt(doc: ExportDoc, labels: ExportLabels): string {
  const blocks = doc.segments
    .filter((s) => s.text.trim())
    .map((seg, i) => {
      const name = nameOf(seg, doc, labels);
      return `${i + 1}\n${srtTimestamp(seg.start)} --> ${srtTimestamp(seg.end)}\n${name ? name + ": " : ""}${seg.text.trim()}\n`;
    });
  return blocks.join("\n");
}

function toVtt(doc: ExportDoc, labels: ExportLabels): string {
  const blocks = ["WEBVTT\n"];
  for (const seg of doc.segments) {
    if (!seg.text.trim()) continue;
    const name = nameOf(seg, doc, labels);
    // WebVTT'nin standart konuşmacı etiketi: <v Ad>
    const voice = name ? `<v ${name.replace(/[<>]/g, "")}>` : "";
    blocks.push(`${vttTimestamp(seg.start)} --> ${vttTimestamp(seg.end)}\n${voice}${seg.text.trim()}\n`);
  }
  return blocks.join("\n");
}

function toMd(doc: ExportDoc, labels: ExportLabels): string {
  const lines = [`# ${doc.title || labels.transcriptHeading}`, "", toTxt(doc, labels).trim(), "", `## ${labels.segmentsHeading}`, ""];
  for (const seg of doc.segments) {
    if (!seg.text.trim()) continue;
    const name = nameOf(seg, doc, labels);
    lines.push(`- **[${clockTime(seg.start)} – ${clockTime(seg.end)}]** ${name ? `*${name}:* ` : ""}${seg.text.trim()}`);
  }
  return lines.join("\n") + "\n";
}

function toJson(doc: ExportDoc, labels: ExportLabels): string {
  const segments = doc.segments.map((s) => ({
    start: Math.round(s.start * 1000) / 1000,
    end: Math.round(s.end * 1000) / 1000,
    text: s.text.trim(),
    ...(s.speaker ? { speaker: nameOf(s, doc, labels), speaker_id: s.speaker } : {}),
  }));
  return JSON.stringify(
    { title: doc.title, language: doc.language ?? "", text: doc.text.trim(), segments },
    null,
    2,
  ) + "\n";
}

export function exportTranscript(format: TranscriptFormat, doc: ExportDoc, labels: ExportLabels): string {
  switch (format) {
    case "txt": return toTxt(doc, labels);
    case "srt": return toSrt(doc, labels);
    case "vtt": return toVtt(doc, labels);
    case "md": return toMd(doc, labels);
    case "json": return toJson(doc, labels);
  }
}

/** Markdown'ı düz metne indirger (özet/iyileştirilmiş içeriğin TXT çıktısı için). */
export function markdownToPlain(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .trim() + "\n";
}

export function exportMarkdown(format: MarkdownFormat, md: string): string {
  return format === "md" ? md.trim() + "\n" : markdownToPlain(md);
}

/** Dosya adı için güvenli başlık (tüm işletim sistemlerinde geçerli). */
export function safeFileName(title: string, fallback = "transkript"): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, 60)
    .trim();
  // Windows'ta ayrılmış adlar (CON, NUL...) dosya adı olamaz.
  if (!cleaned || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(cleaned)) return fallback;
  return cleaned;
}
