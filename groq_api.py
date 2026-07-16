"""Groq (OpenAI-uyumlu) API sarmalayıcısı — "API modu"nun tek sağlayıcısı.

Uygulama iki modda çalışır:
- **Lokal mod** (yalnızca Apple Silicon): transkript `mlx-whisper`, çeviri `NLLB`
  ile cihazda çalışır (bkz. server.py). İnternet/hesap gerekmez.
- **API modu** (varsayılan, her platform): transkript + çeviri + özet + polish
  tek bir Groq API anahtarıyla bu modül üzerinden çalışır.

Groq'un uçları OpenAI ile uyumlu olduğundan tek bir `Bearer` anahtarı ses
(`/audio/transcriptions`) ve sohbet (`/chat/completions`) uçlarının ikisini de
kapsar — kullanıcı tek bir ücretsiz Groq hesabı açar. Ağır bir SDK eklememek
için sade `requests` kullanılır (zaten transitive bir bağımlılık).

Anahtar sunucuda saklanmaz: her istekte frontend'den gelir (localStorage'da tutulur).
"""

import os
from typing import Dict, List, Optional

import requests

BASE_URL = "https://api.groq.com/openai/v1"

# Groq katalog kimlikleri. Groq zaman zaman model kaldırıyor (ör. Haziran 2026'da
# llama-3.3-70b-versatile / llama-3.1-8b-instant kaldırıldı) — sorun çıkarsa güncel
# kimliği https://console.groq.com/docs/models adresinden doğrula.
TRANSCRIBE_MODEL = "whisper-large-v3"
# Türkçe kalitesi için Qwen ailesi (llm.py'deki lokal tercihle tutarlı).
LLM_MODEL = "qwen/qwen3-32b"

TIMEOUT = 120

# ISO 639-1 -> insan-okur dil adı (çeviri prompt'unda hedef dili adlandırmak için).
LANG_NAMES = {
    "tr": "Turkish", "en": "English", "de": "German", "fr": "French",
    "es": "Spanish", "it": "Italian", "pt": "Portuguese", "nl": "Dutch",
    "ru": "Russian", "ar": "Arabic", "zh": "Chinese", "ja": "Japanese",
    "ko": "Korean", "pl": "Polish", "sv": "Swedish", "uk": "Ukrainian",
    "el": "Greek", "hi": "Hindi", "fa": "Persian", "ro": "Romanian",
}


class GroqError(RuntimeError):
    """Groq çağrısı başarısız olduğunda fırlatılır (kullanıcıya gösterilebilir mesaj)."""


_NAME_TO_ISO = {name.lower(): code for code, name in LANG_NAMES.items()}


def _normalize_language(value: str) -> str:
    """Groq'un Whisper uç noktası dili tam isim döndürür (ör. "Turkish"),
    mlx-whisper ise ISO 639-1 kodu ("tr") döndürür. server.py'nin target_lang
    karşılaştırması ve frontend'in LANG_NAMES eşlemesi ISO kod beklediği için
    burada normalize ediyoruz — aksi halde çeviri hiç tetiklenmez/gereksiz tetiklenir.
    """
    if not value:
        return value
    return _NAME_TO_ISO.get(value.strip().lower(), value)


def _require_key(api_key: Optional[str]) -> str:
    key = (api_key or os.environ.get("GROQ_API_KEY") or "").strip()
    if not key:
        raise GroqError("Groq API anahtarı gerekli. Ayarlar'dan anahtarınızı girin.")
    return key


def _raise_for_status(resp: requests.Response) -> None:
    if resp.status_code >= 400:
        detail = ""
        try:
            detail = resp.json().get("error", {}).get("message", "")
        except Exception:
            detail = resp.text[:300]
        if resp.status_code in (401, 403):
            raise GroqError("Groq anahtarı geçersiz veya yetkisiz. Ayarlar'dan kontrol edin.")
        if resp.status_code == 429:
            raise GroqError("Groq ücretsiz kota sınırına ulaşıldı, birazdan tekrar deneyin.")
        raise GroqError(f"Groq hatası ({resp.status_code}): {detail}")


def transcribe(audio_path: str, api_key: Optional[str], language: Optional[str] = None) -> Dict:
    """Groq Whisper API ile transkript. mlx-whisper ile aynı sözlük yapısını döndürür.

    Dönüş: {"language": str, "text": str, "segments": [{"start","end","text"}]}
    """
    key = _require_key(api_key)
    data = {
        "model": TRANSCRIBE_MODEL,
        "response_format": "verbose_json",  # segment + dil bilgisi için
        "temperature": "0",
    }
    if language:
        data["language"] = language
    with open(audio_path, "rb") as f:
        files = {"file": (os.path.basename(audio_path), f)}
        resp = requests.post(
            f"{BASE_URL}/audio/transcriptions",
            headers={"Authorization": f"Bearer {key}"},
            files=files,
            data=data,
            timeout=TIMEOUT,
        )
    _raise_for_status(resp)
    payload = resp.json()
    segments = [
        {"start": seg["start"], "end": seg["end"], "text": seg["text"].strip()}
        for seg in payload.get("segments", [])
    ]
    return {
        "language": _normalize_language(payload.get("language", "")),
        "text": payload.get("text", "").strip(),
        "segments": segments,
    }


def _chat(
    system_prompt: str,
    user_prompt: str,
    api_key: Optional[str],
    max_tokens: int,
    temperature: float = 0.4,
    json_mode: bool = False,
) -> str:
    key = _require_key(api_key)
    body = {
        "model": LLM_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
        # Qwen3 "thinking" modeli varsayılan olarak <think>...</think> muhakemesini
        # yanıt içeriğine gömer. Bizim görevlerimiz (özet/polish/çeviri) muhakeme
        # gerektirmiyor; kapatınca hem çıktı temizleniyor hem de daha hızlı/ucuz oluyor.
        "reasoning_effort": "none",
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    resp = requests.post(
        f"{BASE_URL}/chat/completions",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json=body,
        timeout=TIMEOUT,
    )
    _raise_for_status(resp)
    return resp.json()["choices"][0]["message"]["content"].strip()


def translate_texts(
    texts: List[str], source_lang: str, target_lang: str, api_key: Optional[str]
) -> List[str]:
    """Segment metinlerini tek çağrıda toplu çevirir (NLLB'nin batch davranışının API karşılığı).

    Hizalamayı korumak için numaralı JSON gidip numaralı JSON dönüyor.
    """
    if not texts:
        return []

    import json as _json

    target_name = LANG_NAMES.get(target_lang, target_lang)
    source_name = LANG_NAMES.get(source_lang, source_lang)

    numbered = {str(i): t for i, t in enumerate(texts)}
    system_prompt = (
        f"You are a professional translator. Translate each value in the given JSON "
        f"object from {source_name} to {target_name}. "
        "Return ONLY a valid JSON object with the exact same keys, where each value is "
        "the translation of the corresponding input value. Do not add, remove, merge or "
        "reorder keys. Do not add any commentary. Translate naturally and accurately, "
        f"outputting strictly in {target_name}."
    )
    user_prompt = _json.dumps(numbered, ensure_ascii=False)

    raw = _chat(system_prompt, user_prompt, api_key, max_tokens=4000, temperature=0.2, json_mode=True)

    try:
        parsed = _json.loads(raw)
    except _json.JSONDecodeError:
        raise GroqError("Çeviri yanıtı çözümlenemedi (geçersiz JSON).")

    # Anahtar sırasını girişe göre yeniden kur; eksik olanı orijinaliyle doldur.
    return [str(parsed.get(str(i), texts[i])) for i in range(len(texts))]


def _lang_name(lang: Optional[str]) -> str:
    """ISO 639-1 -> insan-okur dil adı; seçim yoksa Türkçe varsayılan (geriye dönük uyum)."""
    if not lang:
        return "Turkish"
    return LANG_NAMES.get(lang, "Turkish")


def summarize(text: str, api_key: Optional[str], lang: Optional[str] = None) -> str:
    """Transkripti birkaç cümlede özetler (llm.py ile aynı sözleşme). `lang` verilmezse Türkçe."""
    lang_name = _lang_name(lang)
    system_prompt = (
        f"Sen bir özetleme asistanısın. Verilen konuşma metnini {lang_name} olarak 3-4 cümlede özetle. "
        "Konuşmacının anlattıklarını doğal ve akıcı bir dille aktar; resmi bir haber spikeri ya da "
        "rapor diliyle değil, konuşmanın tonunu koruyarak yaz. Kalıplaşmış, mesafeli ifadelerden "
        "kaçın — sanki birine az önce anlatılanı doğal bir şekilde aktarıyormuş gibi yaz. "
        f"KESİNLİKLE sadece {lang_name} yaz; başka hiçbir dile çevirme veya başka dilde metin ekleme. "
        "Sadece özeti ver, giriş cümlesi veya açıklama ekleme."
    )
    user_prompt = f"Aşağıdaki metni özetle:\n\n{text}"
    return _chat(system_prompt, user_prompt, api_key, max_tokens=350)


def polish(text: str, api_key: Optional[str], lang: Optional[str] = None) -> str:
    """Transkripte başlık ekler ve içeriği Markdown formatında düzenler. `lang` verilmezse Türkçe."""
    lang_name = _lang_name(lang)
    system_prompt = (
        f"Sen bir metin editörüsün. Sana verilen konuşma transkriptini Markdown formatında, düzgün "
        f"dilbilgisiyle yeniden yaz. Anlamı ve içeriği değiştirme, hiçbir bilgiyi çıkarma veya ekleme, "
        f"sadece başlık, noktalama ve akıcılığı düzelt. KESİNLİKLE sadece {lang_name} yaz.\n\n"
        "Markdown kuralları:\n"
        "- Başlığı '# ' ile bir H1 başlığı yap; başlık metnin konusunu somut ve bilgilendirici "
        "şekilde yansıtsın (yalnızca bir isim veya genel bir etiket değil, ne anlatıldığını "
        "belirten açıklayıcı bir başlık olsun).\n"
        "- Metin birden fazla konuya değiniyorsa, uygun yerlerde '## ' ile alt başlıklar ekle.\n"
        "- Vurgulanması gereken önemli kavramları *italik* yap.\n"
        "- Model adları, dosya adları, kütüphane adları, teknoloji isimleri gibi teknik terimleri "
        "`kod` (backtick) formatında yaz.\n"
        "- Gerekirse madde işaretli liste (- ) kullan.\n"
        "- Sadece geçerli Markdown çıktısı ver, başka hiçbir açıklama veya yorum ekleme."
    )
    user_prompt = f"Transkript:\n\n{text}"
    return _chat(system_prompt, user_prompt, api_key, max_tokens=1500)
