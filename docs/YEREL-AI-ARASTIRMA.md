# YazBunu — Yapay Zekâ Bileşenleri ve Tamamen Yerel Çalışma Araştırması

> Tarih: Ekim 2026 · Amaç: buluta (Groq) bağımlı her adımı, **kalite kaybı olmadan** kullanıcının
> bilgisayarında çalışan araçlarla değiştirmek.

## 1. Bugün uygulamada kullanılan bütün "bot" ve araçlar

| # | Görev | Şu an kullanılan | Nerede çalışıyor | Kod |
|---|---|---|---|---|
| 1 | Transkript (API modu) | Groq · **Whisper large-v3** | ☁️ Bulut | `src/main/groq.ts`, `settings.ts` |
| 2 | Transkript (offline mod) | sherpa-onnx · Whisper tiny/small/turbo/large-v3 **int8, yalnızca CPU** | 💻 Yerel | `src/workers/ml-worker.ts`, `models.ts` |
| 3 | Konuşma algılama (VAD) | Silero VAD | 💻 Yerel | `ml-worker.ts` |
| 4 | Konuşmacı ayrımı | pyannote segmentation-3.0 + WeSpeaker ResNet34-LM + hızlı kümeleme (sherpa-onnx) | 💻 Yerel | `ml-worker.ts`, `shared/speakers.ts` |
| 5 | Çeviri (API modu) | Groq · **Qwen3-32B** | ☁️ Bulut | `src/main/llm.ts` |
| 6 | Çeviri (offline mod) | NLLB-200 distilled 600M (q8) · transformers.js | 💻 Yerel | `src/workers/nllb-worker.ts` |
| 7 | Özet | Groq · Qwen3-32B (yedek: gpt-oss-120b/20b, llama-3.3-70b) | ☁️ Bulut — **offline karşılığı yok** | `llm.ts` |
| 8 | Başlıklandır & İyileştir | Groq · Qwen3-32B | ☁️ Bulut — **offline karşılığı yok** | `llm.ts` |
| 9 | Ses çözme / dönüştürme | ffmpeg | 💻 Yerel | `src/main/audio.ts` |
| 10 | Sistem sesi | Chromium loopback (Win/macOS), PulseAudio `parec` (Linux) | 💻 Yerel | `capture-linux.ts`, renderer |

**Buluta bağımlı olanlar: 1, 5, 7, 8.** Offline modda bile özet ve iyileştirme için Groq anahtarı gerekiyor.
Mevcut offline transkript (2) çalışıyor ama GPU kullanmadığı için yavaş; offline çeviri (6) ise hem kalite
hem lisans (CC-BY-NC, ticari kullanım yok) hem de Intel Mac desteği açısından zayıf halka.

## 2. Önerilen yerel karşılıklar

### 2.1 Transkript → whisper.cpp (GPU hızlandırmalı)

| | Şu an (sherpa-onnx) | Önerilen (whisper.cpp) |
|---|---|---|
| Model | Whisper int8 ONNX | **Aynı Whisper large-v3 ağırlıkları**, GGML Q8_0 / Q5_0 |
| Donanım | Yalnızca CPU | **Metal** (Apple Silicon), **CUDA** (NVIDIA), **Vulkan** (AMD/Intel GPU), CPU yedek |
| Kalite | int8 nicemleme kaybı | Q8_0 pratikte kayıpsız → **Groq ile aynı model, aynı kalite** |
| Ek | — | Kelime zaman damgası (konuşmacı eşleme için), önceki metni bağlam olarak verme (Groq'taki `prompt` gibi) |

- **Node bağlantısı:** [`@fugood/whisper.node`](https://www.npmjs.com/package/@fugood/whisper.node), macOS (arm64/x64), Windows ve Linux için hazır derlenmiş ikililer (CUDA ve Vulkan varyantları dahil) sunuyor. Son kararlı sürüm 1.1.3; `latest` etiketi 1.2.0-rc. Alternatifler: [`whisper-cpp-node`](https://www.npmjs.com/package/whisper-cpp-node) (yalnızca macOS arm64 + Windows), [`@kutalia/whisper-node-addon`](https://github.com/Kutalia/whisper-node-addon) (CUDA yok). Bunlar da olmazsa, CI'da derlenmiş `whisper-server` ikilisini yan süreç olarak çalıştırmak garantili bir B planı.
- **Model seçimi (Türkçe):** large-v3 en doğrusu. turbo 2–5 kat hızlı ama Türkçede WER'i ~2–4 puan kötü ([kaynak](https://vexascribe.com/whisper-large-v3-vs-turbo)). Öneri: GPU varsa varsayılan **large-v3 (Q5/Q8)**, yalnızca CPU varsa turbo ve bunu kullanıcıya açıkça söylemek.
- **Disk:** large-v3 Q5_0 ≈ 1,1 GB, Q8_0 ≈ 1,6 GB; turbo Q5_0 ≈ 0,55 GB.

### 2.2 Özet + Başlıklandır & İyileştir → node-llama-cpp + yerel LLM

- **Motor:** [`node-llama-cpp`](https://www.npmjs.com/package/node-llama-cpp) 3.22 (Eylül 2026). Metal, CUDA ve Vulkan için hazır ikililer sunuyor, Electron örneği var, çıktıyı **JSON şemasına zorlayabiliyor**. Bu sonuncusu çeviri ve yapılandırılmış özet için çok değerli: bugün Groq'ta "geçersiz JSON" yüzünden yeniden deneme yapıyoruz.
- **Kaliteyi korumanın dürüst cevabı RAM'e bağlı:**

| Bilgisayar | Önerilen model (GGUF Q4_K_M) | RAM/VRAM | Kalite (Groq Qwen3-32B'ye göre) |
|---|---|---|---|
| 32 GB+ (M-serisi Pro/Max, güçlü PC) | **Qwen3-32B** — Groq'taki modelin aynısı | ~20 GB | **Aynı** |
| 32 GB+ (daha hızlı alternatif) | **Gemma 4 26B-A4B** (MoE, 3,8B aktif) | ~16 GB | Eşdeğer, daha hızlı |
| 16 GB | **Qwen3.5-9B** ya da **Gemma 4 12B** | 6–8 GB | Biraz düşük; özet için genelde yeterli, uzun "iyileştir" metninde fark edilebilir |
| 8 GB | Qwen3.5-4B / Gemma 4 E4B | 3–5 GB | Belirgin düşük — bu sınıfta Groq'u önermek daha doğru |

- **Lisanslar:** Qwen3/3.5 ve Gemma 4 → Apache-2.0 (ticari kullanım serbest).
- **Türkçe uyarısı:** Türkçe özet kıyaslarında daha büyük modeller açık ara önde ([Cetvel](https://arxiv.org/pdf/2508.16431)). Model seçimini tahmine değil ölçüme dayandırmalıyız. Plan: 10 gerçek Türkçe transkript üzerinde Groq çıktılarıyla kör karşılaştırma.

### 2.3 Çeviri → TranslateGemma (NLLB'nin yerine)

- **Model:** Google [TranslateGemma](https://blog.google/innovation-and-ai/technology/developers-tools/translategemma/) 4B / 12B / 27B (Ocak 2026). Gemma 3 tabanlı, Türkçe dahil 55 dil. 12B, Gemma 3 27B'yi çeviride geçiyor. GGUF sürümleri llama.cpp ile çalışıyor.
- **Kazançlar:**
  - Kalite NLLB-600M'den belirgin şekilde yüksek; cümle cümle değil bağlamla çeviriyor.
  - Lisans Gemma Kullanım Şartları: ticari kullanıma izin var. NLLB'nin CC-BY-NC sorunu ortadan kalkıyor.
  - llama.cpp Intel Mac'i desteklediği için **Intel Mac'teki çeviri boşluğu kapanıyor**.
  - Özetle aynı motor (node-llama-cpp) kullanılıyor. transformers.js + onnxruntime-node + sharp kaldırılabiliyor, paket ~70 MB küçülüyor.
- **Önerilen boyutlar:** 16 GB'ta 4B (Q4 ≈ 2,5 GB) ya da 12B (≈ 7 GB); 32 GB'ta 12B Q8.

### 2.4 Konuşmacı ayrımı → zaten yerel; kalite yükseltmesi mümkün

- Şu an pyannote **3.0** segmentasyon + hızlı kümeleme kullanılıyor. Web sürümü pyannote **community-1** (VBx kümeleme) kullanıyordu.
- community-1, 3.1'e göre konuşmacı karıştırmayı belirgin azaltıyor ([pyannote](https://www.pyannote.ai/blog/community-1)): DER AMI 18,8 → 17,0, AliMeeting 24,5 → 20,3.
- Topluluk tarafından yapılmış bir ONNX dönüşümü var ([altunenes/speaker-diarization-community-1-onnx](https://huggingface.co/altunenes/speaker-diarization-community-1-onnx)). Ancak sherpa-onnx VBx/PLDA kümelemeyi desteklemiyor; bu adımı TypeScript'te yazmak gerekiyor.
- Orta zorlukta bir iş. Mevcut 4 konuşmacılı test kaydı ve AMI örnekleriyle ölçülerek yapılmalı. (Not: HF sayfası bu ortamdan açılamadı; dosya içeriği doğrulanmalı.)

### 2.5 Zaten yerel olanlar
VAD (Silero), ffmpeg, sistem sesi yakalama — değişiklik gerekmiyor.

## 3. Hedef mimari: "Tamamen yerel" mod

```
Ses ─► ffmpeg/AudioWorklet ─► Silero VAD ─► whisper.cpp (Metal/CUDA/Vulkan) ─► transkript
                                              │
                    pyannote (community-1, ONNX) ─► konuşmacılar
                                              │
                 node-llama-cpp ─┬─ Qwen3 / Gemma 4  ─► özet, başlıklandır & iyileştir
                                 └─ TranslateGemma   ─► çeviri
```

- **Donanım algılama:** node-llama-cpp GPU türünü ve VRAM'i, `os.totalmem()` RAM'i verir. Buna göre "Hafif / Dengeli / En iyi kalite" ön ayarı otomatik önerilir; modeller ilk kullanımda indirilir (mevcut model yöneticisi kullanılabilir).
- **16 GB'lık bir makinede toplam disk:** ~9–11 GB (Whisper large-v3 Q5 + 9B LLM + TranslateGemma 4B).
- **Groq isteğe bağlı "hızlı mod" olarak kalır:** zayıf donanımda ya da kullanıcı isterse.

## 4. Apple Developer üyeliğiyle gelenler

1. **İmzalı ve notarize edilmiş `.dmg`:** "Tanınmayan geliştirici" ve "hasarlı" uyarıları kalkar. `electron-builder.yml`'de `identity` ve `notarize`; CI'da `CSC_LINK`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` secret'ları.
2. **İzinlerin kalıcı olması:** ad-hoc imza her derlemede değiştiği için macOS mikrofon ve ekran/sistem sesi iznini her yeni sürümde yeniden sorabiliyor. Developer ID ile izinler sürümler arasında korunur. Sistem sesi (mac) güvenilirliği için önemli.
3. **Otomatik güncelleme:** imzalı mac uygulaması `electron-updater` ile kendini güncelleyebilir.

## 5. Önerilen sıra

| Faz | İş | Etki | Risk |
|---|---|---|---|
| 1 | whisper.cpp motoru (sherpa ASR yerine) + Türkçe ölçüm seti | Offline transkript Groq kalitesinde ve GPU ile hızlı | node binding RC → gerekirse `whisper-server` yan süreci |
| 2 | node-llama-cpp + yerel özet/iyileştir + donanım ön ayarları | Uygulama tamamen internetsiz çalışır | 16 GB altında kalite düşer — ölçümle karar |
| 3 | TranslateGemma (NLLB yerine), transformers.js'in kaldırılması | Daha iyi çeviri, ticari lisans, Intel Mac desteği | Düşük |
| 4 | pyannote community-1 + VBx | Daha az konuşmacı karışması | Orta (VBx'i TS'te yazmak) |
| 5 | Developer ID imza + notarization + otomatik güncelleme | Uyarısız kurulum, kalıcı izinler | Düşük |
