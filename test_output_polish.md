# Bitirme Projesi Sunumu

## Proje Tanımı
Bugün, Türkçe ve İngilizce konuşmaları gerçek zamanlı olarak metne dönüştürme ve bu işlemi tamamen lokal olarak gerçekleştiren bir uygulamanın sunumunu yapacağız. Hedefimiz, bulut servislerine bağımlı olmaksızın bu dönüşümü gerçekleştirmektir.

## Seçenekler ve Karşılaştırma
Proje başlangıcında, çeşitli seçenekler değerlendirildi. Whisper, Wav2Vec2 ve benzeri modelleri karşılaştırdık. Sonuç olarak, Whisper'ın large-v3-turbo modelini seçtik çünkü Türkçede en iyi sonuçları veriyordu. Alternatif olarak, Whisper.cpp de kullanılabilirdi, ancak `mlx-whisper` Apple Silicon'da daha hızlı çalışıyordu.

## Ek Özellikler
Transkripsiyon haricinde, uygulamada diğer bazı özellikler de eklenmiştir:
- **Çeviri**: Facebook'un NLLB-200 modelini kullanarak birçok dile çeviri yapılabiliyor, sadece İngilizceye değil.
- **Diyarizasyon**: Kimin konuştuğunu belirlemek için `pyannote` kullanılmıştır, ancak şu anda Hugging Face sunucusu problemi nedeniyle bu özellik bloke durumda.

## Teknik Detaylar
- **Backend**: FastAPI kullanılmıştır.
- **Frontend**: HTML, CSS ve vanilla JavaScript ile geliştirilmiştir. Herhangi bir framework kullanılmamıştır çünkü basit bir uygulama olduğu için gerekli değildi ve daha kontrol sahibi olmak istenmişti.
- **Sistem Tasarımı**: M4 MacBook'ta çalışmak üzere tasarlanmıştır. Modeller 8-bit kuantize edilerek daha hafif hale getirilmiştir.
- **Çalışma Modu**: Whisper modeli ilk çalıştırıldığında indirilir ve offline çalışır. NLLB için de aynı uygulama geçerli. Tüm işlemler şu anda senkron olarak yapılır, ancak ileride concurrent requests için executor kullanılabilmektedir.

## Gelecek Planlar
- **Özetleme**: Özetleme özelliği eklenecek.
- **İçerik İyileştirme**: LLM ile içerik iyileştirme için Qwen-1.5B gibi bir hafif model kullanılacaktır.
- **Lokal Çalışma**: Tüm bu özellikler, hiçbir dış servis kullanılmadan ve hiçbir kişiye ait veri başka yere gitmeyen bir şekilde yerel olarak çalışacak.

## Performans
Whisper transkripsiyonu, bir dakikalık ses için yaklaşık 15-20 saniye sürer. NLLB çevirisi de benzer hızda. Diyarizasyon çalıştığında biraz daha uzun sürer, ancak makul bir süre içinde tamamlanır.

Sonuç olarak, basit ama fonksiyonel bir lokal STT uygulaması geliştirmiş olduk. Tüm modeller açık kaynaklı, hiçbir ücretli servis kullanılmamış ve kişiye ait veriler başka yere gitmemişti.