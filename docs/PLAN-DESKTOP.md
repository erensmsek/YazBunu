# YazBunu 2.0 — Masaüstü Uygulaması Planı

> Durum: uygulanıyor (`feature/desktop-app`). Web sürümü (FastAPI) `9e0712e` commit'inde duruyor.

## 1. Hedef

Web sürümündeki her özelliği **Windows, macOS ve Linux'ta kurulup çift tıkla açılan** bir masaüstü
uygulamasına taşımak; web sürümündeki hataları düzeltmek ve masaüstünün açtığı kapıları kullanmak.

Kabul kriteri = README'deki özellik tablosu + aşağıdaki yeni özellikler, üç platformda.

## 2. Mimari kararı

| Seçenek | Karar | Neden |
|---|---|---|
| Kabuk | **Electron** | Her platformda aynı Chromium → MediaRecorder/AudioWorklet/getDisplayMedia aynı davranır. Tauri/pywebview sistem WebView'ı kullanır (WebKitGTK/WKWebView) ve ses yakalamada zayıftır. |
| Backend | **TypeScript (Electron main + utilityProcess)** | Python/torch kalkar: paket ~1-2 GB → ~250 MB, PyInstaller kırılganlığı yok, üç platform aynı kodla. |
| Konuşmacı ayrımı | **sherpa-onnx** (pyannote segmentation-3.0 ONNX + WeSpeaker ResNet34-LM) | Python'suz, önceden derlenmiş native modül (win/mac/linux). Modeller uygulamaya gömülü (~35 MB), internet gerekmez. |
| Offline transkript | **sherpa-onnx Whisper** (VAD + int8 Whisper) | Artık yalnızca Apple Silicon değil, **her platformda** internetsiz transkript. Modeller ilk kullanımda indirilir. |
| Offline çeviri | **transformers.js + NLLB-200 (ONNX)** | Web sürümündeki NLLB'nin birebir karşılığı; ayrı süreçte çalışır. |
| Ses çözme | **ffmpeg-static** | Her formatı (mp3, m4a, mp4 video, ...) akış halinde 16 kHz mono PCM'e çevirir; 2 saatlik dosyada bile RAM şişmez. |
| API | **Groq** (Whisper + Qwen3) | Web sürümüyle aynı sağlayıcı ve tek ücretsiz anahtar. |

### Süreç modeli

```
Renderer (UI, ses yakalama: AudioWorklet → 16 kHz PCM)
   │ IPC (contextBridge, beyaz liste)
Main (ayarlar, geçmiş, Groq/LLM, ffmpeg, iş kuyruğu, model indirme, tepsi, kısayol)
   ├── utilityProcess: ml-worker   (sherpa-onnx: diarization, VAD, offline Whisper)
   └── utilityProcess: nllb-worker (transformers.js: offline çeviri)
```

ML işleri ayrı süreçte: arayüz donmaz, iptal = süreci öldür, iki ayrı onnxruntime kopyası çakışmaz.

## 3. Web sürümünde bulunan ve düzeltilen hatalar

1. Windows'ta `NamedTemporaryFile` ikinci kez açılamadığı için API modu + diyarizasyon çalışmıyordu.
2. Groq 25 MB sınırı → ~25 dk üstü kayıtlar hata veriyordu. → Sessizlikten bölünen ≤10 dk parçalar.
3. "İyileştir" `max_tokens=1500` ile uzun metni **sessizce kesiyordu**. → Parça parça işleme + `finish_reason=length` kontrolü.
4. Çeviri tek istekte gidiyordu (`max_tokens=4000`) → uzun metinde geçersiz JSON. → Toplu (batch) + bölerek yeniden deneme.
5. Özet uzun metinde TPM/413 hatası. → Map-reduce özet.
6. Bloklayan çağrılar sunucuyu donduruyordu. → Asenkron main + ayrı ML süreçleri.
7. `.env` anahtarı özet/polish'te kullanılmıyordu. → Tek anahtar kaynağı (şifreli ayarlar).
8. Sabitlenmemiş bağımlılıklar. → Tüm sürümler `-E` ile sabit, `package-lock.json`.
9. Yerel NLLB ilk kullanımda ilerleme göstermeden ~2.4 GB indiriyordu. → İlerleme çubuklu model yöneticisi.
10. localStorage kotası (~5 MB) → uzun kayıtta hata. → Disk tabanlı geçmiş.
11. Hedef dil seçilmezse özet her zaman Türkçe çıkıyordu. → Varsayılan: transkriptin dili.
12. "Konuşmacı_1"/MD başlıkları dilden bağımsız Türkçe; polish için boş SRT/VTT; sabit port; auth'suz yerel sunucu. → Hepsi giderildi (sunucu yok).

## 4. Yeni özellikler

- **Sistem sesi + toplantı modu**: tüm bilgisayar sesi; mikrofon + sistem sesi birlikte.
  - Windows: Chromium loopback. macOS 14.2+: CoreAudio tap (deneysel, izin gerekir; olmazsa BlackHole rehberi).
  - Linux: PulseAudio/PipeWire monitor kaynağı (`parec`).
- **Canlı transkript**: kayıt sürerken ~20 sn'lik, sessizlikten kesilen parçalarla metin akar.
- **Her platformda offline mod** (tiny / small / turbo / large-v3 Whisper seçimi).
- **Konuşmacı isimlendirme**, konuşmacı sayısı seçimi, transkript düzenleme, kopyalama.
- **Ses oynatıcı**: geçmişteki kaydı dinle, segmente tıklayınca o saniyeye git.
- **Disk tabanlı geçmiş** (arama, ses saklama, sonradan ses ekleyince konuşmacıların yeniden ayrımı).
- **API anahtarı işletim sistemi anahtar zincirinde** (Electron `safeStorage`).
- Global kısayol (kaydı başlat/durdur), tepsi ikonu, bildirimler, güncelleme kontrolü.
- Uzun dosyalar için ilerleme çubuğu + iptal.

## 5. Klasör yapısı

```
src/main/        Electron main: app, ipc, settings, history, audio, groq, llm, pipeline, models, capture
src/workers/     utilityProcess: ml-worker (sherpa), nllb-worker (transformers.js)
src/shared/      main + renderer ortak: tipler, export, dil tabloları, metin parçalama, konuşmacı eşleme
src/preload/     contextBridge API
src/renderer/    UI (HTML/CSS/TS), AudioWorklet
resources/       ikonlar, gömülü modeller (scripts/fetch-models.mjs indirir)
test/unit        vitest
test/e2e         Playwright + Electron (xvfb, sahte mikrofon, sahte Groq sunucusu)
```

## 6. Test stratejisi

- **Unit (vitest)**: export formatları, parça planlama, konuşmacı eşleme, LLM parçalama/yeniden deneme,
  Groq istemcisi (sahte HTTP sunucusu), geçmiş deposu, i18n tablosu bütünlüğü.
- **E2E (Playwright `_electron`)**: Linux/xvfb'de uygulamayı açar; sahte mikrofonla kayıt → canlı transkript,
  dosya yükleme → transkript, çeviri/özet/polish, geçmiş, export. Groq yerine yerel sahte sunucu.
- **Gerçek ML testi**: diarization + offline Whisper gerçek modellerle (tiny) çalıştırılır.
- **Doğrulanamayanlar** (bu ortamda yok): macOS/Windows çalışma zamanı, macOS sistem sesi izni,
  gerçek Groq anahtarıyla uçtan uca. Bunlar `docs/TEST-CHECKLIST.md` ile elle doğrulanır.

## 7. Paketleme

electron-builder: macOS `dmg`+`zip` (arm64, x64), Windows `nsis` (x64), Linux `AppImage`+`deb` (x64).
Native modül ve ffmpeg her platformun kendi makinesinde kurulur → **her platform kendi OS'unda derlenir**
(`npm run dist:mac|win|linux`). `.github/workflows/release.yml` üç OS'u matris olarak derler
(repo public olduğu için Actions dakikaları ücretsizdir; hesap kilidi kalkınca çalışır).

İmzasız uygulama uyarıları: macOS Gatekeeper ("tanınmayan geliştirici") ve Windows SmartScreen.
Sorunsuz dağıtım için Apple Developer ID ($99/yıl) + notarization ve Windows kod imzalama sertifikası gerekir.
