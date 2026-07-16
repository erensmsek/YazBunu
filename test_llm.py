#!/usr/bin/env python3
"""Test Qwen2-1.5B modeli için özet ve polishing fonksiyonları"""

import sys
from mlx_lm import load, generate
from mlx_lm.sample_utils import make_sampler, make_logits_processors
import time

MODEL_NAME = sys.argv[1] if len(sys.argv) > 1 else "mlx-community/Qwen2-1.5B-instruct-4bit"

# Model yükle (ilk kere ~2-3 dakika alabilir)
print(f"📥 Model yükleniyor: {MODEL_NAME}")
start = time.time()
model, tokenizer = load(MODEL_NAME)
print(f"✅ Model yüklendi ({time.time() - start:.1f} sn)\n")

# Küçük modeller repetition_penalty olmadan kolayca döngüye giriyor (loop/tekrar).
sampler = make_sampler(temp=0.4)
logits_processors = make_logits_processors(repetition_penalty=1.3, repetition_context_size=64)

def chat(system_prompt, user_prompt, max_tokens):
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    prompt = tokenizer.apply_chat_template(messages, add_generation_prompt=True, tokenize=False)
    return generate(
        model, tokenizer, prompt=prompt, max_tokens=max_tokens,
        sampler=sampler, logits_processors=logits_processors,
    )

def summarize(text):
    """Metni özetle"""
    system_prompt = "Sen bir özetleme asistanısın. Sadece istenen özeti Türkçe olarak ver, başka açıklama ekleme."
    user_prompt = f"Aşağıdaki metni 3-4 cümlede özetle:\n\n{text}"

    print("⏳ Özetleniyor...")
    start = time.time()
    response = chat(system_prompt, user_prompt, max_tokens=250)
    elapsed = time.time() - start
    print(f"✅ Özet tamamlandı ({elapsed:.1f} sn)\n")
    return response

def polish_content(text):
    """Başlık ekle ve içeriği Markdown olarak düzelt"""
    system_prompt = (
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
        "- Sadece geçerli Markdown çıktısı ver, başka hiçbir açıklama veya yorum ekleme."
    )
    user_prompt = f"Transkript:\n\n{text}"

    print("⏳ Başlık ve polishing yapılıyor...")
    start = time.time()
    response = chat(system_prompt, user_prompt, max_tokens=900)
    elapsed = time.time() - start
    print(f"✅ Polishing tamamlandı ({elapsed:.1f} sn)\n")
    return response

# Test metni (Akademik proje hakkında, Whisper transcription çıktısına benzer)
test_text = """Merhaba arkadaşlar, bugün size bitirme projemiz hakkında sunum yapacağız. Projenin adı lokal konuşma-metin dönüştürme uygulaması. Hedefimiz Türkçe ve İngilizce konuşmaları gerçek zamanlı olarak metne dönüştürmek ve bunu tamamen lokal olarak yapmak, yani bulut servislerine bağlı olmamak.

Proje başında çeşitli seçenekler değerlendirdik. Whisper, Wav2Vec2 ve benzeri modelleri karşılaştırdık. Sonunda Whisper'ın large-v3-turbo modelini seçtik çünkü Türkçede en iyi sonuçları veriyor. Bunun yerine Whisper.cpp de kullanabilirdik ama mlx-whisper Apple Silicon'da daha hızlı çalışıyor.

Transkripsiyon haricinde başka özelliklerde ekledik. Birincisi çeviri yapabiliyor. Facebook'un NLLB-200 modelini kullandık ve bu sayede birçok dile çeviri yapılabiliyor, sadece İngilizceye değil. İkincisi ise hoparlör diyarizasyonu yani kimin konuştuğunu belirlemek. Bunun için pyannote kullandık ama şu anda Hugging Face sunucusu problemi nedeniyle bu özellik bloke durumda.

Backend tarafında FastAPI kullandık. Frontend'i ise HTML, CSS ve vanilla JavaScript ile geliştirdik. Hiçbir framework kullanmadık çünkü basit bir aplikasyon olduğu için gerekli değildi ve daha kontrol sahibi olmak istedik.

Teknik detaylara bakarsak, sistem M4 MacBook'ta çalışmak için tasarlandı. Modeller 8-bit kuantize edildi, yani daha hafif. Whisper modeli ilk çalıştırıldığında indirilir sonra offline çalışır. Aynısı NLLB için de geçerli. Bütün işlemler senkron olarak yapılıyor şu anda ama ileride concurrent requests için executor kullanabiliriz.

Gelecek planlarımız arasında özetleme özelliği ve LLM ile içerik iyileştirme var. Metne otomatik başlık eklemek ve dilbilgisini düzeltmek istiyoruz. Bunun için hafif bir model kullanacağız, muhtemelen Qwen-1.5B. Tüm bunlar yine lokal olarak çalışacak, hiçbir dış servis gerekli olmayacak.

Performans açısından Whisper transkripsiyon bir dakikalık ses için yaklaşık 15-20 saniye alıyor. NLLB çevirisi de benzer hızda. Diyarizasyon çalıştığında biraz daha uzun sürüyor ama yine de makul.

Sonuç olarak, basit ama fonksiyonel bir lokal STT uygulaması geliştirdik. Bütün modeller açık kaynaklı, hiçbir ücretli servis kullanmıyor ve kişiye ait veriler başka yere gitmiyordu."""

print("=" * 60)
print("TEST METNİ:")
print("=" * 60)
print(test_text)
print("\n" + "=" * 60)

# Test 1: Özetleme
print("TEST 1: ÖZETLEME")
print("=" * 60)
summary = summarize(test_text)
print("SONUÇ:")
print(summary)
print("\n")

# Test 2: Polishing
print("=" * 60)
print("TEST 2: BAŞLIK + POLİSHİNG")
print("=" * 60)
polished = polish_content(test_text)
print("SONUÇ:")
print(polished)
print("\n")

print("=" * 60)
print("✨ Testler tamamlandı!")
print("=" * 60)
