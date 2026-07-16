"""LLM tabanlı özetleme ve içerik iyileştirme (başlık + Markdown polish).

Whisper/NLLB/pyannote'un aksine bu modül modeli lokal çalıştırmaz; Hugging Face
Inference API üzerinden `Qwen/Qwen2.5-7B-Instruct` (tam hassasiyet, BF16) modelini
çağırır. Bu bilinçli bir istisna: 7B modelin 4-bit lokal sürümü M4'te hem yavaş
(~35 sn) hem de kalitesi düşük kaldığı için, bu iki özellik HF platformu üzerinden
servis ediliyor. Diğer tüm botlar (transkripsiyon, çeviri, diyarizasyon) lokal kalır.

Diğer modüllerle aynı desen: modül seviyesinde lazy-initialize edilen singleton client.
"""

import os
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


def summarize(text: str) -> str:
    """Transkripti birkaç cümlede Türkçe özetler."""
    system_prompt = (
        "Sen bir özetleme asistanısın. Verilen metni Türkçe olarak 3-4 cümlede özetle. "
        "KESİNLİKLE sadece Türkçe yaz; başka hiçbir dile çevirme veya başka dilde metin ekleme. "
        "Sadece özeti ver, giriş cümlesi veya açıklama ekleme."
    )
    user_prompt = f"Aşağıdaki metni özetle:\n\n{text}"
    # max_tokens'ı dar tutmak, modelin doğal bitişten sonra başka dile kaymasını da engeller.
    return _chat(system_prompt, user_prompt, max_tokens=220)


def polish(text: str) -> str:
    """Transkripte başlık ekler ve içeriği Markdown formatında düzenler."""
    system_prompt = (
        "Sen bir metin editörüsün. Sana verilen konuşma transkriptini Markdown formatında, düzgün "
        "dilbilgisiyle yeniden yaz. Anlamı ve içeriği değiştirme, hiçbir bilgiyi çıkarma veya ekleme, "
        "sadece başlık, noktalama ve akıcılığı düzelt. KESİNLİKLE sadece Türkçe yaz.\n\n"
        "Markdown kuralları:\n"
        "- Başlığı '# ' ile bir H1 başlığı yap.\n"
        "- Metin birden fazla konuya değiniyorsa, uygun yerlerde '## ' ile alt başlıklar ekle.\n"
        "- Vurgulanması gereken önemli kavramları *italik* yap.\n"
        "- Model adları, dosya adları, kütüphane adları, teknoloji isimleri gibi teknik terimleri "
        "`kod` (backtick) formatında yaz (örn. `Whisper`, `FastAPI`, `server.py`).\n"
        "- Gerekirse madde işaretli liste (- ) kullan.\n"
        "- Sadece geçerli Markdown çıktısı ver, başka hiçbir açıklama veya yorum ekleme."
    )
    user_prompt = f"Transkript:\n\n{text}"
    return _chat(system_prompt, user_prompt, max_tokens=1200)
