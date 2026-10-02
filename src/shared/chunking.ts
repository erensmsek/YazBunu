// Ses ve metin parçalama yardımcıları (saf fonksiyonlar → unit test edilebilir).

export const FRAME_SEC = 0.1;

/** 16-bit PCM'den kare (frame) başına RMS enerji, [0,1] aralığında. */
export function frameRms(samples: Int16Array, frameSize: number): Float32Array {
  const n = Math.ceil(samples.length / frameSize);
  const out = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    const start = f * frameSize;
    const end = Math.min(start + frameSize, samples.length);
    let sum = 0;
    for (let i = start; i < end; i++) {
      const v = samples[i] / 32768;
      sum += v * v;
    }
    out[f] = Math.sqrt(sum / Math.max(1, end - start));
  }
  return out;
}

function smoothedAt(energies: ArrayLike<number>, i: number): number {
  // 3 karelik (≈300 ms) pencere: tek bir sessiz kareye değil, kısa bir duraklamaya keselim.
  const a = energies[Math.max(0, i - 1)] ?? 0;
  const b = energies[i] ?? 0;
  const c = energies[Math.min(energies.length - 1, i + 1)] ?? 0;
  return (a + b + c) / 3;
}

/** [fromFrame, toFrame) aralığındaki en sessiz kare; eşitlikte preferFrame'e en yakını. */
export function quietestFrame(
  energies: ArrayLike<number>,
  fromFrame: number,
  toFrame: number,
  preferFrame: number,
): number {
  let best = -1;
  let bestE = Infinity;
  for (let i = Math.max(0, fromFrame); i < Math.min(toFrame, energies.length); i++) {
    const e = smoothedAt(energies, i);
    if (best < 0 || e < bestE * 0.98) {
      best = i;
      bestE = e;
    } else if (e <= bestE * 1.02 && Math.abs(i - preferFrame) < Math.abs(best - preferFrame)) {
      // Neredeyse eşit sessizlikte hedefe yakın olanı seç.
      best = i;
      bestE = Math.min(bestE, e);
    }
  }
  return best;
}

export interface ChunkSpan {
  start: number;
  end: number;
}

/**
 * Uzun sesi en fazla maxSec uzunluğunda, sessiz anlardan kesilen parçalara böler.
 * Groq'un dosya boyutu sınırını aşmamak ve ilerleme gösterebilmek için kullanılır.
 */
export function planChunks(
  energies: ArrayLike<number>,
  opts: { targetSec: number; minSec: number; maxSec: number; frameSec?: number },
): ChunkSpan[] {
  const frameSec = opts.frameSec ?? FRAME_SEC;
  const total = energies.length;
  const spans: ChunkSpan[] = [];
  const maxF = Math.round(opts.maxSec / frameSec);
  const minF = Math.round(opts.minSec / frameSec);
  const targetF = Math.round(opts.targetSec / frameSec);
  let pos = 0;
  while (total - pos > maxF) {
    const cut = quietestFrame(energies, pos + minF, pos + maxF, pos + targetF);
    const at = cut > pos ? cut : pos + maxF;
    spans.push({ start: pos * frameSec, end: at * frameSec });
    pos = at;
  }
  if (total > pos) spans.push({ start: pos * frameSec, end: total * frameSec });
  return spans;
}

/** Adaptif sessizlik eşiği: kaydın kendi gürültü tabanına göre. */
export function silenceThreshold(energies: ArrayLike<number>): number {
  const arr = Array.from(energies).sort((a, b) => a - b);
  if (!arr.length) return 0.01;
  const p20 = arr[Math.floor(arr.length * 0.2)];
  return Math.min(0.02, Math.max(0.003, p20 * 2));
}

/**
 * Canlı transkript için kesim noktası. fromFrame'den itibaren biriken ses yeterince uzunsa
 * ve sessiz bir an varsa (ya da maxSec aşıldıysa) kesilecek kareyi döndürür; yoksa -1.
 */
export function findLiveCut(
  energies: ArrayLike<number>,
  fromFrame: number,
  opts: { minSec: number; targetSec: number; maxSec: number; frameSec?: number },
): number {
  const frameSec = opts.frameSec ?? FRAME_SEC;
  const available = energies.length - fromFrame;
  const minF = Math.round(opts.minSec / frameSec);
  const targetF = Math.round(opts.targetSec / frameSec);
  const maxF = Math.round(opts.maxSec / frameSec);
  if (available < targetF) return -1;
  // Son 2 kareyi kesme adayı yapma: konuşma o an sürüyor olabilir.
  const upto = fromFrame + Math.min(available - 2, maxF);
  const cut = quietestFrame(energies, fromFrame + minF, upto, fromFrame + targetF);
  if (cut < 0) return available >= maxF ? fromFrame + maxF : -1;
  const thr = silenceThreshold(Array.prototype.slice.call(energies, fromFrame));
  if (smoothedAt(energies, cut) <= thr || available >= maxF) return cut;
  return -1;
}

/** Parçanın tamamen sessiz olup olmadığı (Whisper sessizlikte "altyazı" uydurur). */
export function isSilent(energies: ArrayLike<number>, absThreshold = 0.004): boolean {
  if (!energies.length) return true;
  const arr = Array.from(energies).sort((a, b) => a - b);
  const p95 = arr[Math.floor(arr.length * 0.95)];
  return p95 < absThreshold;
}

// ---------- Metin ----------

/** Kaba token tahmini (Türkçe gibi eklemeli dillerde karakter/token ≈ 3). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

function splitSentences(paragraph: string): string[] {
  const parts = paragraph.match(/[^.!?…。！？]+[.!?…。！？]+["'”’)\]]*\s*|[^.!?…。！？]+$/g);
  return parts ?? [paragraph];
}

/**
 * Metni en fazla maxChars uzunluğunda parçalara böler; önce paragraf, sonra cümle,
 * en son kelime sınırından keser. Parçalar birleşince orijinal içerik korunur.
 */
export function splitText(text: string, maxChars: number): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  // Her parça, kendinden önce konacak ayraçla birlikte tutulur (paragraf arası "\n\n", cümle arası " ").
  const pieces: { text: string; sep: string }[] = [];
  clean.split(/\n{2,}/).forEach((para, pi) => {
    const units: string[] = [];
    if (para.length <= maxChars) units.push(para);
    else {
      for (const sentence of splitSentences(para)) {
        let rest = sentence.trim();
        while (rest.length > maxChars) {
          let cut = rest.lastIndexOf(" ", maxChars);
          if (cut < maxChars * 0.5) cut = maxChars;
          units.push(rest.slice(0, cut));
          rest = rest.slice(cut).trim();
        }
        if (rest) units.push(rest);
      }
    }
    units.forEach((u, ui) => {
      const t = u.trim();
      if (t) pieces.push({ text: t, sep: ui === 0 ? (pi === 0 ? "" : "\n\n") : " " });
    });
  });

  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (current && current.length + piece.sep.length + piece.text.length > maxChars) {
      chunks.push(current);
      current = piece.text;
    } else {
      current = current ? current + piece.sep + piece.text : piece.text;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Metin listesini toplam karakter bütçesine göre ardışık gruplara (indeks aralıkları) böler. */
export function batchByChars(items: string[], maxChars: number): [number, number][] {
  const batches: [number, number][] = [];
  let start = 0;
  let size = 0;
  items.forEach((item, i) => {
    const len = item.length + 12; // JSON anahtarı + tırnak payı
    if (i > start && size + len > maxChars) {
      batches.push([start, i]);
      start = i;
      size = 0;
    }
    size += len;
  });
  if (items.length > start) batches.push([start, items.length]);
  return batches;
}
