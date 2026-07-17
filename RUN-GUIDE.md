# YazBunu — Çalıştırma Kılavuzu / Run Guide

🇹🇷 [Türkçe](#-türkçe) &nbsp;·&nbsp; 🇬🇧 [English](#-english)

---

## 🇹🇷 Türkçe

Bu kılavuz, projeyi ilk kez klonlayan/indiren biri için hazırlandı. Kod satırı
yazmadan, çift tıklayarak başlatma seçeneği içerir.

### 1) Tek seferlik kurulum (her platformda gerekli)

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

### 2) Uygulamayı başlatma — kod satırı yazmadan

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

### 3) Masaüstüne/Dock'a "uygulama" olarak ekleme (opsiyonel)

Uygulama çalışırken tarayıcıda `http://127.0.0.1:7860` açıkken:

- **Chrome / Edge**: Adres çubuğunun sağındaki yükleme ikonuna (⊕) tıkla → **Yükle**. Uygulama artık kendi penceresinde, Dock/Görev Çubuğu'ndan açılabilir bir simgeyle çalışır.
- **macOS Safari**: Paylaş menüsü → **Dock'a Ekle**.

İkon, uygulamanın kendi marka simgesiyle (mavi dalga formu, yuvarlatılmış kare) otomatik gelir — ayrıca bir ayar gerekmez.

### 4) Sorun mu yaşıyorsun?

- Sunucu açılmıyor / `venv bulunamadı` hatası → Adım 1'i atlamışsındır, kurulumu tekrar yap.
- Diyarizasyon 502 hatası veriyor → `ffmpeg` kurulu değil, yukarıdaki adımdan kur.
- Apple Silicon dışı bir cihazdasın ve "Lokal" mod seçeneği görünmüyor → beklenen davranış, o mod yalnızca Apple Silicon Mac'lerde sunulur; API modu (Groq anahtarıyla) her platformda tam işlevseldir.

<br>

---

## 🇬🇧 English

This guide is for anyone cloning/downloading the project for the first time. It includes a no-command-line, double-click startup option.

### 1) One-time setup (required on every platform)

```bash
python3 -m venv venv
```
- **macOS/Linux**: `source venv/bin/activate`
- **Windows**: `venv\Scripts\activate`

```bash
pip install -r requirements.txt
```

**System requirements** (in addition to the Python packages):
- **Python 3.10+**
- **`ffmpeg`** — required for speaker diarization. Without it, transcription/translation/summaries still work fine, but enabling "Speaker diarization" will error out.
  - macOS: `brew install ffmpeg`
  - Windows: download from [ffmpeg.org](https://ffmpeg.org/download.html) and add it to `PATH`, or `winget install ffmpeg`
  - Linux: `sudo apt install ffmpeg` (Debian/Ubuntu) or your distro's package manager

(Optional) Instead of putting your Groq API key in `.env`, you can enter it from the in-app **Settings** once the app is running — it's stored in your browser.

### 2) Launching the app — no command line needed

After setup, **double-click** the file matching your OS in the project's root folder:

| Platform | File |
|---|---|
| macOS | `YazBunu-Baslat.command` |
| Windows | `YazBunu-Baslat.bat` |
| Linux | `YazBunu-Baslat.sh` |

A window opens, the server starts, and your browser opens automatically to
`http://127.0.0.1:7860` within a couple seconds. To stop the app, close that
window or press `Ctrl+C` inside it.

**Platform-specific notes:**
- **macOS**: If you see an "unknown developer" warning on first run, right-click the file and choose **Open** instead (only needed once).
- **Linux**: Double-click behavior varies by file manager (some prompt "Run", others open it in a text editor). If it doesn't work, run `./YazBunu-Baslat.sh` from a terminal instead.

### 3) Installing as a desktop app (optional)

With the app running and `http://127.0.0.1:7860` open in your browser:

- **Chrome / Edge**: Click the install icon (⊕) at the right of the address bar → **Install**. The app now runs in its own window, launchable from your Dock/Taskbar.
- **macOS Safari**: Share menu → **Add to Dock**.

The icon is the app's own brand mark (blue waveform, rounded square) — no extra setup needed.

### 4) Troubleshooting

- Server won't start / `venv not found` error → you skipped step 1, redo the setup.
- Diarization returns a 502 error → `ffmpeg` isn't installed, see the step above.
- You're on a non-Apple-Silicon device and don't see a "Local" mode option → expected — that mode is only offered on Apple Silicon Macs; API mode (with a Groq key) is fully functional on every platform.
