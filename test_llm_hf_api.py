#!/usr/bin/env python3
"""HF Inference API üzerinden model indirmeden özet/polishing testi."""

import os
import sys
import time
from huggingface_hub import InferenceClient

MODEL = sys.argv[1] if len(sys.argv) > 1 else "Qwen/Qwen2.5-7B-Instruct"
PROVIDER = sys.argv[2] if len(sys.argv) > 2 else "auto"

client = InferenceClient(model=MODEL, token=os.environ.get("HF_TOKEN"), provider=PROVIDER)

def chat(system_prompt, user_prompt, max_tokens):
    resp = client.chat_completion(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=max_tokens,
        temperature=0.4,
    )
    print(f"   [served by: {resp.model}]")
    return resp.choices[0].message.content

test_text = """Merhaba arkadaşlar, bugün size bitirme projemiz hakkında sunum yapacağız. Projenin adı lokal konuşma-metin dönüştürme uygulaması. Hedefimiz Türkçe ve İngilizce konuşmaları gerçek zamanlı olarak metne dönüştürmek ve bunu tamamen lokal olarak yapmak, yani bulut servislerine bağlı olmamak.

Proje başında çeşitli seçenekler değerlendirdik. Whisper, Wav2Vec2 ve benzeri modelleri karşılaştırdık. Sonunda Whisper'ın large-v3-turbo modelini seçtik çünkü Türkçede en iyi sonuçları veriyor. Bunun yerine Whisper.cpp de kullanabilirdik ama mlx-whisper Apple Silicon'da daha hızlı çalışıyor.

Transkripsiyon haricinde başka özelliklerde ekledik. Birincisi çeviri yapabiliyor. Facebook'un NLLB-200 modelini kullandık ve bu sayede birçok dile çeviri yapılabiliyor, sadece İngilizceye değil. İkincisi ise hoparlör diyarizasyonu yani kimin konuştuğunu belirlemek. Bunun için pyannote kullandık ama şu anda Hugging Face sunucusu problemi nedeniyle bu özellik bloke durumda.

Backend tarafında FastAPI kullandık. Frontend'i ise HTML, CSS ve vanilla JavaScript ile geliştirdik. Hiçbir framework kullanmadık çünkü basit bir aplikasyon olduğu için gerekli değildi ve daha kontrol sahibi olmak istedik.

Teknik detaylara bakarsak, sistem M4 MacBook'ta çalışmak için tasarlandı. Modeller 8-bit kuantize edildi, yani daha hafif. Whisper modeli ilk çalıştırıldığında indirilir sonra offline çalışır. Aynısı NLLB için de geçerli. Bütün işlemler senkron olarak yapılıyor şu anda ama ileride concurrent requests için executor kullanabiliriz.

Gelecek planlarımız arasında özetleme özelliği ve LLM ile içerik iyileştirme var. Metne otomatik başlık eklemek ve dilbilgisini düzeltmek istiyoruz. Bunun için hafif bir model kullanacağız, muhtemelen Qwen-1.5B. Tüm bunlar yine lokal olarak çalışacak, hiçbir dış servis gerekli olmayacak.

Performans açısından Whisper transkripsiyon bir dakikalık ses için yaklaşık 15-20 saniye alıyor. NLLB çevirisi de benzer hızda. Diyarizasyon çalıştığında biraz daha uzun sürüyor ama yine de makul.

Sonuç olarak, basit ama fonksiyonel bir lokal STT uygulaması geliştirdik. Bütün modeller açık kaynaklı, hiçbir ücretli servis kullanmıyor ve kişiye ait veriler başka yere gitmiyordu."""

print(f"MODEL: {MODEL}")
print("=" * 60)

print("TEST 1: ÖZETLEME")
print("=" * 60)
try:
    start = time.time()
    summary = chat(
        "Sen bir özetleme asistanısın. Sadece istenen özeti Türkçe olarak ver, başka açıklama ekleme.",
        f"Aşağıdaki metni 3-4 cümlede özetle:\n\n{test_text}",
        max_tokens=250,
    )
    print(f"({time.time()-start:.1f} sn)")
    print(summary)
except Exception as e:
    print(f"HATA: {e}")

print("\n" + "=" * 60)
print("TEST 2: BAŞLIK + POLİSHİNG (Markdown çıktı)")
print("=" * 60)
try:
    start = time.time()
    polished = chat(
        "Sen bir metin editörüsün. Sana verilen konuşma transkriptini Markdown formatında, düzgün "
        "dilbilgisiyle yeniden yaz. Anlamı ve içeriği değiştirme, hiçbir bilgiyi çıkarma veya ekleme, "
        "sadece başlık, noktalama ve akıcılığı düzelt.\n\n"
        "Markdown kuralları:\n"
        "- Başlığı '# ' ile bir H1 başlığı yap.\n"
        "- Metin birden fazla konuya değiniyorsa, uygun yerlerde '## ' ile alt başlıklar ekle.\n"
        "- Vurgulanması gereken önemli kavramları *italik* yap.\n"
        "- Model adları, dosya adları, kütüphane adları, teknoloji isimleri gibi teknik terimleri "
        "`kod` (backtick) formatında yaz (örn. `Whisper`, `FastAPI`, `server.py`).\n"
        "- Gerekirse madde işaretli liste (- ) kullan.\n"
        "- Sadece geçerli Markdown çıktısı ver, başka hiçbir açıklama veya yorum ekleme.",
        f"Transkript:\n\n{test_text}",
        max_tokens=900,
    )
    print(f"({time.time()-start:.1f} sn)")
    print(polished)
    with open("test_output_polish.md", "w") as f:
        f.write(polished)
    print("\n📄 Ayrıca test_output_polish.md dosyasına kaydedildi.")
except Exception as e:
    print(f"HATA: {e}")
