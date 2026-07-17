<div align="center">
  <img src="static/icons/icon-512.png" width="88" alt="YazBunu logo">

  # YazBunu

  **Konuş, anında yazıya dönüşsün.** &nbsp;·&nbsp; **Speak, and watch it become text instantly.**

  [![Python](https://img.shields.io/badge/python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
  [![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
  [![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)](#-hızlı-başlangıç--quick-start)
  [![License](https://img.shields.io/badge/license-MIT-22c55e)](LICENSE)

  <a href="#-türkçe">🇹🇷 Türkçe</a> &nbsp;·&nbsp; <a href="#-english">🇬🇧 English</a>
</div>

<br>

<p align="center">
  <img src=".github/screenshots/hero-light.png" width="800" alt="YazBunu ana ekran">
</p>

<br>

---

## 🇹🇷 Türkçe

**YazBunu**, konuşmaları anında metne dönüştüren, çeviri ve özetleme yapabilen bir yapay zekâ destekli ses ve toplantı asistanı. Bir BTK Bitirme Projesi olarak başladı; **Windows, macOS ve Linux'ta** çalışır — tek bir ücretsiz API anahtarıyla saniyeler içinde deneyebilirsin. Apple Silicon bir Mac'in varsa, isteğe bağlı olarak transkript ve çeviriyi tamamen cihazında, hiç internete çıkmadan da çalıştırabilirsin.

### ✨ Özellikler

| | |
|---|---|
| 🎙️ **Mikrofon / Dosya / Sekme** | Canlı mikrofon kaydı, dosya yükleme, ya da tarayıcı sekmesindeki sesi dinleme — üç farklı giriş yolu |
| 👥 **Konuşmacı ayrımı** | "Kim ne zaman konuştu" — `pyannote` ile, her zaman yerel çalışır |
| 🌍 **Çeviri** | Transkripti 12 dile çevir (NLLB-200 yerel, ya da Groq API) |
| ✨ **Özetle & İyileştir** | Yapay zekâ ile kısa özet, başlıklı ve düzenli Markdown çıktısı |
| 🗂️ **Geçmiş** | Kayıtların otomatik saklanması, tekrar yükleme, var olan bir kayda sonradan ses ekleme |
| 🌐 **11 dilde arayüz** | Türkçe, English, Deutsch, Français, Español, Italiano, Português, Русский, 中文, 日本語, 한국어 |
| 📤 **5 farklı dışa aktarım** | TXT · SRT · VTT · Markdown · JSON |
| 🖥️ **Masaüstü uygulaması** | Tek tıkla başlat, tarayıcıdan "Yükle" ile Dock/Görev Çubuğu'na ekle |

### 🖼️ Ekran görüntüleri

<table>
<tr>
<td width="50%"><img src=".github/screenshots/results-light.png" alt="Transkript, konuşmacı ayrımı ve özet"></td>
<td width="50%">
  <img src=".github/screenshots/hero-dark.png" alt="Karanlık tema"><br>
  <img src=".github/screenshots/lang-menu.png" alt="11 dilli arayüz seçici">
</td>
</tr>
</table>

### 🔌 İki mod, iki farklı ihtiyaç için

**API modu (varsayılan, her platformda çalışır)**: Whisper ve özetleme/iyileştirme için kullanılan yapay zekâ modelleri milyarlarca parametre içeriyor — ortalama bir bilgisayarda bunları yerelde çalıştırmak her zaman pratik ya da optimum olmuyor. Bu yüzden varsayılan mod, Groq'un ücretsiz API'si üzerinden çalışır: kurulum derdi yok, donanım fark etmez, hızlı sonuç alırsın.

**Lokal mod (Apple Silicon Mac'lerde, isteğe bağlı)**: Yeterince güçlü bir Mac'in varsa, transkript ve çeviriyi tamamen cihazında, hiç internete çıkmadan da çalıştırabilirsin. Konuşmacı ayrımı zaten her iki modda da her zaman yerelde çalışır.

```mermaid
flowchart LR
    A[🎙️ Mikrofon / 📁 Dosya / 🔊 Sekme] --> B{Whisper}
    B -->|Lokal: mlx-whisper| C[Transkript]
    B -->|API: Groq| C
    C --> D{İsteğe bağlı}
    D --> E[👥 Konuşmacı ayrımı]
    D --> F[🌍 Çeviri]
    D --> G[✨ Özet / İyileştir]
    E & F & G --> H[📤 TXT · SRT · VTT · MD · JSON]
```

### 🚀 Hızlı başlangıç

```bash
git clone https://github.com/erensmsek/YazBunu.git
cd YazBunu
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn server:app --host 127.0.0.1 --port 7860
```

`http://127.0.0.1:7860` adresini aç — bu kadar. Groq API anahtarını uygulama içindeki **Ayarlar**'dan girebilirsin ([ücretsiz anahtar al](https://console.groq.com/keys), kart gerekmez).

**Kod satırı yazmak istemiyorsan**, kurulumdan sonra işletim sistemine uygun dosyaya çift tıkla:

| İşletim Sistemi | Dosya |
|---|---|
| 🍎 macOS | `YazBunu-Baslat.command` |
| 🪟 Windows | `YazBunu-Baslat.bat` |
| 🐧 Linux | `YazBunu-Baslat.sh` |

Sistem gereksinimleri, sorun giderme ve masaüstü uygulaması olarak yükleme dahil detaylı adımlar için → **[RUN-GUIDE.md](RUN-GUIDE.md)**

### 🧩 Teknoloji

| Katman | Teknoloji |
|---|---|
| Backend | FastAPI (Python), tek process, build adımı yok |
| Transkript | `mlx-whisper` (large-v3-turbo, 8-bit, Apple Silicon) veya Groq Whisper API |
| Çeviri | `facebook/nllb-200-distilled-600M` veya Groq |
| Konuşmacı ayrımı | `pyannote.audio` — ağırlıklar repoya gömülü, harici indirme yok |
| Özet / İyileştirme | Groq (Llama/Qwen ailesi) |
| Frontend | Vanilla HTML/CSS/JS — framework yok, build adımı yok |

### 📄 Lisans

Bu proje [MIT lisansı](LICENSE) ile paylaşılmıştır. Diyarizasyon modeli ağırlıkları [pyannote projesi](https://github.com/pyannote/pyannote-audio)'nden CC-BY-4.0 lisansıyla vendor edilmiştir — bkz. [`models/diarization/ATTRIBUTION.md`](models/diarization/ATTRIBUTION.md).

<br>

---

## 🇬🇧 English

**YazBunu** ("Write This" in Turkish) is an AI-powered voice and meeting assistant that transcribes, translates, and summarizes speech. It started as a graduation project; it runs on **Windows, macOS, and Linux** — try it in seconds with one free API key. If you have an Apple Silicon Mac, you can optionally run transcription and translation entirely on-device, with no network calls.

### ✨ Features

| | |
|---|---|
| 🎙️ **Mic / File / Tab** | Live microphone recording, file upload, or listening to another browser tab's audio |
| 👥 **Speaker diarization** | "Who said what, when" — via `pyannote`, always runs locally |
| 🌍 **Translation** | Translate the transcript into 12 languages (local NLLB-200 or Groq API) |
| ✨ **Summarize & Polish** | AI-generated short summary, plus a titled, cleaned-up Markdown rewrite |
| 🗂️ **History** | Recordings auto-save, can be reloaded, or appended with more audio later |
| 🌐 **11-language UI** | Turkish, English, German, French, Spanish, Italian, Portuguese, Russian, Chinese, Japanese, Korean |
| 📤 **5 export formats** | TXT · SRT · VTT · Markdown · JSON |
| 🖥️ **Desktop app** | One-click launch, installable to your Dock/Taskbar right from the browser |

### 🖼️ Screenshots

<table>
<tr>
<td width="50%"><img src=".github/screenshots/results-light.png" alt="Transcript, diarization, and summary"></td>
<td width="50%">
  <img src=".github/screenshots/hero-dark.png" alt="Dark theme"><br>
  <img src=".github/screenshots/lang-menu.png" alt="11-language UI switcher">
</td>
</tr>
</table>

### 🔌 Two modes, for two different needs

**API mode (default, works everywhere)**: the AI models behind transcription and summarization have billions of parameters — running them locally isn't always practical or optimal on an average machine. So the default mode routes through Groq's free API: no setup hassle, hardware-independent, fast results.

**Local mode (Apple Silicon Macs, optional)**: if you have a capable enough Mac, you can run transcription and translation entirely on-device, with no network calls. Speaker diarization always runs locally in either mode.

```mermaid
flowchart LR
    A[🎙️ Mic / 📁 File / 🔊 Tab] --> B{Whisper}
    B -->|Local: mlx-whisper| C[Transcript]
    B -->|API: Groq| C
    C --> D{Optional}
    D --> E[👥 Diarization]
    D --> F[🌍 Translation]
    D --> G[✨ Summary / Polish]
    E & F & G --> H[📤 TXT · SRT · VTT · MD · JSON]
```

### 🚀 Quick start

```bash
git clone https://github.com/erensmsek/YazBunu.git
cd YazBunu
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn server:app --host 127.0.0.1 --port 7860
```

Open `http://127.0.0.1:7860` — that's it. Add your Groq API key from the in-app **Settings** ([get a free key](https://console.groq.com/keys), no card required).

**Don't want to touch the command line?** After setup, double-click the file matching your OS:

| Operating System | File |
|---|---|
| 🍎 macOS | `YazBunu-Baslat.command` |
| 🪟 Windows | `YazBunu-Baslat.bat` |
| 🐧 Linux | `YazBunu-Baslat.sh` |

For system requirements, troubleshooting, and installing as a desktop app, see → **[RUN-GUIDE.md](RUN-GUIDE.md)**

### 🧩 Tech stack

| Layer | Technology |
|---|---|
| Backend | FastAPI (Python), single process, no build step |
| Transcription | `mlx-whisper` (large-v3-turbo, 8-bit, Apple Silicon) or Groq Whisper API |
| Translation | `facebook/nllb-200-distilled-600M` or Groq |
| Diarization | `pyannote.audio` — weights vendored in-repo, no external download |
| Summarize / Polish | Groq (Llama/Qwen family) |
| Frontend | Vanilla HTML/CSS/JS — no framework, no build step |

### 📄 License

This project is shared under the [MIT license](LICENSE). Diarization model weights are vendored from the [pyannote project](https://github.com/pyannote/pyannote-audio) under CC-BY-4.0 — see [`models/diarization/ATTRIBUTION.md`](models/diarization/ATTRIBUTION.md).

<br>

<div align="center">

Made with 🎙️ in Turkey.

</div>
