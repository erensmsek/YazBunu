# YazBunu'yu Çalıştırma Kılavuzu

Bu kılavuz, projeyi ilk kez klonlayan/indiren biri için hazırlandı. Kod satırı
yazmadan, çift tıklayarak başlatma seçeneği içerir.

## 1) Tek seferlik kurulum (her platformda gerekli)

```bash
python3 -m venv venv
```
- **macOS/Linux**: `source venv/bin/activate`
- **Windows**: `venv\Scripts\activate`

```bash
pip install -r requirements.txt
```

**Sistem gereksinimleri** (Python paketleri dışında, ayrıca kurulmalı):
- **Python 3.10+**
- **`ffmpeg`** — konuşmacı ayrımı (diyarizasyon) özelliği için zorunlu. Kurulu değilse "Konuşmacı ayrımı" işaretliyken hata alırsın; diğer tüm özellikler `ffmpeg` olmadan da çalışır.
  - macOS: `brew install ffmpeg`
  - Windows: [ffmpeg.org](https://ffmpeg.org/download.html)'dan indirip PATH'e ekle, ya da `winget install ffmpeg`
  - Linux: `sudo apt install ffmpeg` (Debian/Ubuntu) ya da dağıtımının paket yöneticisi

(İsteğe bağlı) Groq API anahtarını `.env` dosyasına eklemek yerine, uygulama açıldığında sağ üstteki **Ayarlar**'dan da girebilirsin — tarayıcında saklanır.

## 2) Uygulamayı başlatma — kod satırı yazmadan

Kurulumdan sonra, projenin ana klasöründeki şu dosyaya **çift tıkla**:

| Platform | Dosya |
|---|---|
| macOS | `YazBunu-Baslat.command` |
| Windows | `YazBunu-Baslat.bat` |
| Linux | `YazBunu-Baslat.sh` |

Açılan pencerede sunucu başlar ve birkaç saniye içinde tarayıcı otomatik açılır
(`http://127.0.0.1:7860`). Uygulamayı kapatmak için o pencereyi kapatman ya da
içinde `Ctrl+C`'ye basman yeterli.

**Platforma özgü notlar:**
- **macOS**: İlk çalıştırmada "bilinmeyen geliştirici" uyarısı çıkarsa, dosyaya sağ tıklayıp **Aç**'ı seç (yalnızca ilk seferde gerekir).
- **Linux**: Dosya yöneticiler arasında çift tıklamanın davranışı değişir (bazıları "Çalıştır" seçeneği sorar, bazıları metin editöründe açar). Çalışmazsa bir terminalde `./YazBunu-Baslat.sh` komutuyla çalıştırabilirsin.

## 3) Masaüstüne/Dock'a "uygulama" olarak ekleme (opsiyonel)

Uygulama çalışırken tarayıcıda `http://127.0.0.1:7860` açıkken:

- **Chrome / Edge**: Adres çubuğunun sağındaki yükleme ikonuna (⊕) tıkla → **Yükle**. Uygulama artık kendi penceresinde, Dock/Görev Çubuğu'ndan açılabilir bir simgeyle çalışır.
- **macOS Safari**: Paylaş menüsü → **Dock'a Ekle**.

İkon, uygulamanın kendi marka simgesiyle (mavi dalga formu, yuvarlatılmış kare) otomatik gelir — ayrıca bir ayar gerekmez.

## 4) Sorun mu yaşıyorsun?

- Sunucu açılmıyor / `venv bulunamadı` hatası → Adım 1'i atlamışsındır, kurulumu tekrar yap.
- Diyarizasyon 502 hatası veriyor → `ffmpeg` kurulu değil, yukarıdaki adımdan kur.
- Apple Silicon dışı bir cihazdasın ve "Lokal" mod seçeneği görünmüyor → beklenen davranış, o mod yalnızca Apple Silicon Mac'lerde sunulur; API modu (Groq anahtarıyla) her platformda tam işlevseldir.
