// Diyarizasyon dönüşlerini (turn) transkript segmentlerine eşler.
import type { Segment, Word } from "./types";

export interface SpeakerTurn {
  start: number;
  end: number;
  speaker: number | string;
}

/** Kelime/segment hiçbir dönüşle örtüşmüyorsa en yakın dönüşe bu kadar saniyeye kadar bağlanır. */
const NEAREST_MAX_GAP = 1.5;
/** Bundan kısa konuşmacı değişimleri (kelime düzeyinde) gürültü sayılıp komşuya katılır. */
const MIN_RUN_SECONDS = 1.0;

const CJK_RE = /[぀-ヿ㐀-鿿가-힯]/;

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
}

function speakerFor(start: number, end: number, turns: SpeakerTurn[]): string | null {
  let best: SpeakerTurn | null = null;
  let bestOverlap = 0;
  for (const turn of turns) {
    const ov = overlap(start, end, turn.start, turn.end);
    if (ov > bestOverlap) {
      bestOverlap = ov;
      best = turn;
    }
  }
  if (best) return String(best.speaker);
  // Örtüşme yok: aradaki boşluğa göre en yakın dönüş.
  let nearest: SpeakerTurn | null = null;
  let nearestGap = Infinity;
  for (const turn of turns) {
    const gap = turn.end < start ? start - turn.end : turn.start > end ? turn.start - end : 0;
    if (gap < nearestGap) {
      nearestGap = gap;
      nearest = turn;
    }
  }
  return nearest && nearestGap <= NEAREST_MAX_GAP ? String(nearest.speaker) : null;
}

interface Run {
  speaker: string | null;
  words: Word[];
}

function smoothRuns(runs: Run[]): Run[] {
  // Kısa koşuları (ör. tek kelimelik yanlış atama) daha uzun komşuya kat.
  let changed = true;
  while (changed && runs.length > 1) {
    changed = false;
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      const dur = run.words[run.words.length - 1].end - run.words[0].start;
      if (dur >= MIN_RUN_SECONDS && run.speaker !== null) continue;
      const prev = runs[i - 1];
      const next = runs[i + 1];
      const target =
        prev && next
          ? (prev.words.length >= next.words.length ? prev : next)
          : (prev ?? next);
      if (!target) continue;
      if (target === prev) prev.words.push(...run.words);
      else next.words.unshift(...run.words);
      runs.splice(i, 1);
      changed = true;
      break;
    }
    // Komşuları aynı konuşmacı olanları birleştir.
    for (let i = runs.length - 1; i > 0; i--) {
      if (runs[i].speaker === runs[i - 1].speaker) {
        runs[i - 1].words.push(...runs[i].words);
        runs.splice(i, 1);
        changed = true;
      }
    }
  }
  return runs;
}

function joinWords(words: Word[], cjk: boolean): string {
  return words
    .map((w) => w.word.trim())
    .filter(Boolean)
    .join(cjk ? "" : " ")
    .replace(/\s+([,.;:!?…])/g, "$1");
}

/**
 * Segmentlere konuşmacı atar. Kelime zaman damgaları varsa segment, konuşmacı
 * değiştiği yerden bölünür (tek Whisper segmenti iki kişiyi kapsayabiliyor).
 * Ham konuşmacı etiketleri ilk görünme sırasına göre "S1", "S2"... olarak yeniden adlandırılır.
 */
export function assignSpeakers(segments: Segment[], turns: SpeakerTurn[]): Segment[] {
  const sortedTurns = [...turns].sort((a, b) => a.start - b.start);
  const out: Segment[] = [];

  for (const seg of segments) {
    const words = seg.words ?? [];
    if (!sortedTurns.length) {
      out.push({ ...seg, speaker: null });
      continue;
    }
    if (words.length < 2) {
      out.push({ ...seg, speaker: speakerFor(seg.start, seg.end, sortedTurns) });
      continue;
    }
    const runs: Run[] = [];
    let lastSpeaker: string | null = null;
    for (const w of words) {
      const sp: string | null = speakerFor(w.start, w.end, sortedTurns) ?? lastSpeaker;
      lastSpeaker = sp;
      const tail = runs[runs.length - 1];
      if (tail && tail.speaker === sp) tail.words.push(w);
      else runs.push({ speaker: sp, words: [w] });
    }
    const smoothed = smoothRuns(runs);
    if (smoothed.length === 1) {
      out.push({ ...seg, speaker: smoothed[0].speaker ?? speakerFor(seg.start, seg.end, sortedTurns) });
      continue;
    }
    const cjk = CJK_RE.test(seg.text);
    for (const run of smoothed) {
      out.push({
        start: run.words[0].start,
        end: run.words[run.words.length - 1].end,
        text: joinWords(run.words, cjk),
        speaker: run.speaker,
        words: run.words,
      });
    }
  }

  // Ham etiket → S1, S2... (ilk görünme sırası)
  const order = new Map<string, string>();
  for (const seg of out) {
    if (seg.speaker == null) continue;
    if (!order.has(seg.speaker)) order.set(seg.speaker, `S${order.size + 1}`);
    seg.speaker = order.get(seg.speaker)!;
  }
  return out;
}

/** "S3" → 3; tanınmayan kimlikte 0. */
export function speakerNumber(id: string | null | undefined): number {
  const m = /(\d+)$/.exec(id ?? "");
  return m ? parseInt(m[1], 10) : 0;
}

/** Görünen konuşmacı adı: kullanıcının verdiği ad ya da "Konuşmacı N". */
export function speakerDisplayName(
  id: string | null | undefined,
  names: Record<string, string> | undefined,
  defaultLabel: (n: number) => string,
): string {
  if (!id) return "";
  const custom = names?.[id]?.trim();
  if (custom) return custom;
  const n = speakerNumber(id);
  return n ? defaultLabel(n) : id;
}

/**
 * Ses saklanmadığı için yeniden diyarizasyon yapılamayan eklemelerde: yeni segmentlerin
 * konuşmacı numaralarını mevcut en büyük numaranın üstüne öteler (çakışmayı önler,
 * aynı kişiyi eşleştirmez).
 */
export function offsetSpeakers(existing: Segment[], incoming: Segment[]): Segment[] {
  const maxExisting = existing.reduce((m, s) => Math.max(m, speakerNumber(s.speaker)), 0);
  return incoming.map((s) =>
    s.speaker ? { ...s, speaker: `S${speakerNumber(s.speaker) + maxExisting}` } : { ...s },
  );
}

/**
 * Yeniden diyarizasyon sonrası yeni kimlikleri (S1, S2...) eski kimliklerle eşler:
 * kaydın eski kısmında (0..oldDuration) en çok örtüşen eski konuşmacının kimliği korunur.
 * Böylece kullanıcının verdiği isimler ses eklendikten sonra da doğru kişide kalır.
 */
export function remapSpeakerIds(oldSegments: Segment[], newSegments: Segment[], oldDuration: number): Segment[] {
  const score = new Map<string, Map<string, number>>();
  for (const ns of newSegments) {
    if (!ns.speaker || ns.start >= oldDuration) continue;
    for (const os of oldSegments) {
      if (!os.speaker) continue;
      const ov = overlap(ns.start, ns.end, os.start, os.end);
      if (ov <= 0) continue;
      const m = score.get(ns.speaker) ?? new Map<string, number>();
      m.set(os.speaker, (m.get(os.speaker) ?? 0) + ov);
      score.set(ns.speaker, m);
    }
  }
  // Açgözlü eşleme: en yüksek örtüşmeden başlayarak, her eski kimlik en fazla bir kez.
  const pairs: [string, string, number][] = [];
  for (const [n, m] of score) for (const [o, v] of m) pairs.push([n, o, v]);
  pairs.sort((a, b) => b[2] - a[2]);
  const mapping = new Map<string, string>();
  const usedOld = new Set<string>();
  for (const [n, o] of pairs) {
    if (mapping.has(n) || usedOld.has(o)) continue;
    mapping.set(n, o);
    usedOld.add(o);
  }
  // Eşlenemeyen yeni konuşmacılar mevcut en büyük numaranın üstünden numaralanır.
  let next = Math.max(0, ...oldSegments.map((s) => speakerNumber(s.speaker)), ...[...usedOld].map(speakerNumber));
  for (const ns of newSegments) {
    if (ns.speaker && !mapping.has(ns.speaker)) mapping.set(ns.speaker, `S${++next}`);
  }
  return newSegments.map((s) => (s.speaker ? { ...s, speaker: mapping.get(s.speaker)! } : s));
}
