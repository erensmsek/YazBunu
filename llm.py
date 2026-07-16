"""LLM tabanlı özetleme ve içerik iyileştirme (başlık + Markdown polish).

Whisper/NLLB/pyannote'un aksine bu modül modeli lokal çalıştırmaz; Hugging Face
Inference API üzerinden `Qwen/Qwen2.5-7B-Instruct` (tam hassasiyet, BF16) modelini
çağırır. Bu bilinçli bir istisna: 7B modelin 4-bit lokal sürümü M4'te hem yavaş
(~35 sn) hem de kalitesi düşük kaldığı için, bu iki özellik HF platformu üzerinden
servis ediliyor. Diğer tüm botlar (transkripsiyon, çeviri, diyarizasyon) lokal kalır.

Diğer modüllerle aynı desen: modül seviyesinde lazy-initialize edilen singleton client.
"""

import os
from typing import Optional

from huggingface_hub import InferenceClient

MODEL = "Qwen/Qwen2.5-7B-Instruct"
# featherless-ai orijinal (BF16) ağırlıkları servis ediyor; together ise FP8 "Turbo".
# BF16 polish kalitesi testlerde en temizi olduğu için onu sabitliyoruz.
PROVIDER = "featherless-ai"

_client = None


def _get_client() -> InferenceClient:
    global _client
    if _client is None:
        token = os.environ.get("HF_TOKEN")
        if not token:
            raise RuntimeError("HF_TOKEN tanımlı değil (.env dosyasını kontrol edin).")
        _client = InferenceClient(model=MODEL, token=token, provider=PROVIDER)
    return _client


def _chat(system_prompt: str, user_prompt: str, max_tokens: int) -> str:
    client = _get_client()
    resp = client.chat_completion(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=max_tokens,
        temperature=0.4,
    )
    return resp.choices[0].message.content.strip()


# groq_api.py ile aynı ISO 639-1 -> insan-okur dil adı eşlemesi (Groq'a bağımlı olmadan).
_LANG_NAMES = {
    "tr": "Turkish", "en": "English", "de": "German", "fr": "French",
    "es": "Spanish", "it": "Italian", "pt": "Portuguese", "nl": "Dutch",
    "ru": "Russian", "ar": "Arabic", "zh": "Chinese", "ja": "Japanese",
    "ko": "Korean", "pl": "Polish", "sv": "Swedish", "uk": "Ukrainian",
    "el": "Greek", "hi": "Hindi", "fa": "Persian", "ro": "Romanian",
}


def _lang_name(lang: Optional[str]) -> str:
    if not lang:
        return "Turkish"
    return _LANG_NAMES.get(lang, "Turkish")


def summarize(text: str, lang: Optional[str] = None) -> str:
    """Transkripti birkaç cümlede özetler. `lang` verilmezse Türkçe."""
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
    # max_tokens'ı dar tutmak, modelin doğal bitişten sonra başka dile kaymasını da engeller.
    return _chat(system_prompt, user_prompt, max_tokens=220)


def polish(text: str, lang: Optional[str] = None) -> str:
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
        "`kod` (backtick) formatında yaz (örn. `Whisper`, `FastAPI`, `server.py`).\n"
        "- Gerekirse madde işaretli liste (- ) kullan.\n"
        "- Sadece geçerli Markdown çıktısı ver, başka hiçbir açıklama veya yorum ekleme."
    )
    user_prompt = f"Transkript:\n\n{text}"
    return _chat(system_prompt, user_prompt, max_tokens=1200)
