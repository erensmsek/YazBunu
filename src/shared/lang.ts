// Dil kodları ve eşlemeleri (ISO 639-1 merkezli).

/** Prompt'larda hedef dili adlandırmak için İngilizce dil adları. */
export const LANG_NAMES_EN: Record<string, string> = {
  tr: "Turkish", en: "English", de: "German", fr: "French",
  es: "Spanish", it: "Italian", pt: "Portuguese", nl: "Dutch",
  ru: "Russian", ar: "Arabic", zh: "Chinese", ja: "Japanese",
  ko: "Korean", pl: "Polish", sv: "Swedish", uk: "Ukrainian",
  el: "Greek", hi: "Hindi", fa: "Persian", ro: "Romanian",
  az: "Azerbaijani", bg: "Bulgarian", cs: "Czech", da: "Danish",
  fi: "Finnish", he: "Hebrew", hu: "Hungarian", id: "Indonesian",
  no: "Norwegian", th: "Thai", vi: "Vietnamese", ka: "Georgian",
  kk: "Kazakh", ku: "Kurdish", sr: "Serbian", hr: "Croatian",
  bs: "Bosnian", sq: "Albanian", mk: "Macedonian", ms: "Malay",
};

/** Çeviri hedefi olarak sunulan diller (web sürümüyle aynı 12 dil). */
export const TARGET_LANGS = ["tr", "en", "de", "fr", "es", "it", "pt", "ru", "ar", "zh", "ja", "ko"];

/** Transkript dili ipucu olarak sunulan diller. */
export const TRANSCRIBE_LANGS = [
  "tr", "en", "de", "fr", "es", "it", "pt", "nl", "ru", "ar", "zh", "ja", "ko",
  "pl", "sv", "uk", "el", "hi", "fa", "ro", "az", "ku",
];

/** ISO 639-1 → NLLB (FLORES-200) kodları. */
export const NLLB_CODES: Record<string, string> = {
  tr: "tur_Latn", en: "eng_Latn", de: "deu_Latn", fr: "fra_Latn",
  es: "spa_Latn", it: "ita_Latn", pt: "por_Latn", nl: "nld_Latn",
  ru: "rus_Cyrl", ar: "arb_Arab", zh: "zho_Hans", ja: "jpn_Jpan",
  ko: "kor_Hang", pl: "pol_Latn", sv: "swe_Latn", uk: "ukr_Cyrl",
  el: "ell_Grek", hi: "hin_Deva", fa: "pes_Arab", ro: "ron_Latn",
  az: "azj_Latn", bg: "bul_Cyrl", cs: "ces_Latn", da: "dan_Latn",
  fi: "fin_Latn", he: "heb_Hebr", hu: "hun_Latn", id: "ind_Latn",
  th: "tha_Thai", vi: "vie_Latn", ka: "kat_Geor", kk: "kaz_Cyrl",
  sr: "srp_Cyrl", hr: "hrv_Latn", bs: "bos_Latn", sq: "als_Latn",
  mk: "mkd_Cyrl", ms: "zsm_Latn",
};

const NAME_TO_ISO: Record<string, string> = Object.fromEntries(
  Object.entries(LANG_NAMES_EN).map(([code, name]) => [name.toLowerCase(), code]),
);

/**
 * Groq Whisper dili tam adla ("turkish"), sherpa-onnx ISO koduyla ("tr") döndürür.
 * Uygulamanın geri kalanı her zaman ISO 639-1 kodu bekler.
 */
export function normalizeLanguage(value: string | null | undefined): string {
  if (!value) return "";
  const v = value.trim().toLowerCase();
  if (NAME_TO_ISO[v]) return NAME_TO_ISO[v];
  // "en-US" gibi bölge ekli kodlar
  const base = v.split(/[-_]/)[0];
  if (base.length === 2) return base;
  return v;
}

export function langNameEn(code: string | null | undefined, fallback = "Turkish"): string {
  if (!code) return fallback;
  return LANG_NAMES_EN[code] ?? fallback;
}

/** Arayüz dilinde yerelleştirilmiş dil adı (Intl.DisplayNames ile). */
export function displayLanguage(code: string, uiLang: string): string {
  if (!code) return "";
  try {
    const dn = new Intl.DisplayNames([uiLang], { type: "language" });
    const name = dn.of(code);
    if (name && name !== code) return name.charAt(0).toLocaleUpperCase(uiLang) + name.slice(1);
  } catch {
    /* tanınmayan kod: aşağıda düz döner */
  }
  return LANG_NAMES_EN[code] ?? code;
}

/** Dil ağırlıklı çoğunluk: parça başına (dil, süre) listesinden en uzun süre konuşulan dil. */
export function dominantLanguage(items: { language: string; seconds: number }[]): string {
  const totals = new Map<string, number>();
  for (const { language, seconds } of items) {
    if (!language) continue;
    totals.set(language, (totals.get(language) ?? 0) + Math.max(seconds, 0.001));
  }
  let best = "";
  let bestSec = -1;
  for (const [lang, sec] of totals) {
    if (sec > bestSec) {
      best = lang;
      bestSec = sec;
    }
  }
  return best;
}
