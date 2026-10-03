# Geliştirme ve Derleme

## Gereksinimler
- Node.js 22+ ve npm
- (Linux'ta sistem sesi testi için) `pulseaudio-utils`

Python, ffmpeg ya da başka bir sistem bağımlılığı **gerekmez**: ffmpeg ve sherpa-onnx npm paketleriyle gelir.

## Geliştirme

```bash
npm install            # bağımlılıklar (ffmpeg + platforma uygun native modüller dahil)
npm run fetch-models   # gömülü diyarizasyon/VAD modelleri → resources/models (~33 MB, bir kez)
npm run dev            # derle + uygulamayı aç
```

Geliştirmede Groq anahtarını uygulama içinden girmek yerine `GROQ_API_KEY` ortam değişkeni de kullanılabilir.

## Testler

```bash
npm run typecheck   # TypeScript
npm test            # Vitest: unit + gerçek modellerle (Whisper tiny, diyarizasyon) entegrasyon
npm run test:e2e    # Playwright + Electron: uçtan uca senaryolar (sahte Groq sunucusu, sahte mikrofon)
npm run check       # hepsi
```

- İlk `npm test` test modellerini indirir (Whisper tiny ~116 MB, `.cache/` altına).
- Linux'ta E2E için ekran yoksa: `xvfb-run -a npm run test:e2e`.
- Paketlenmiş uygulamayı test etmek: `YAZBUNU_E2E_EXECUTABLE=release/linux-unpacked/yazbunu npx playwright test`

## Paket derleme

Native modüller (sherpa-onnx, onnxruntime, sharp) ve ffmpeg o platform için kurulur; bu yüzden
**her platform kendi işletim sisteminde derlenir** (ya da GitHub Actions'taki `Release` iş akışıyla).

| Hedef | Komut | Çıktı (`release/`) |
|---|---|---|
| macOS (bu Mac'in mimarisi) | `npm run dist:mac` | `.dmg`, `.zip` |
| macOS Intel (Apple Silicon'da) | `npm run dist:mac-x64` | `.dmg`, `.zip` |
| Windows x64 | `npm run dist:win` | `YazBunu-Setup-x.y.z.exe` |
| Linux x64 | `npm run dist:linux` | `.AppImage`, `.deb` |

Linux'tan Windows paketi de derlenebilir (wine gerekir): `node scripts/prepare-arch.mjs x64 win32`, ardından
Linux ikililerini silip `npx electron-builder --win --x64`. Temiz sonuç için Windows'ta derlemek önerilir.

### GitHub Actions
`.github/workflows/release.yml`: **Actions › Release › Run workflow** ile dört paketi (mac arm64, mac x64,
win x64, linux x64) derler ve "artifact" olarak sunar. `v2.0.0` gibi bir etiket push edilince paketler taslak
GitHub Release'e yüklenir. Repo public olduğu için dakikalar ücretsizdir.

### İmzalama
- **macOS:** varsayılan ad-hoc imza (`identity: "-"`) → kullanıcı ilk açılışta sağ tık → Aç demelidir.
  Sorunsuz dağıtım için Apple Developer ID ($99/yıl) + notarization: `electron-builder.yml`'de `identity`'yi
  sertifika adıyla değiştir, `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` ile `notarize: true` ekle.
- **Windows:** imzasız kurulumda SmartScreen uyarısı çıkar. Kod imzalama sertifikası `CSC_LINK` / `CSC_KEY_PASSWORD` ile verilir.

## Klasör yapısı

```
src/main/      Electron ana süreç: pencere, IPC, ayarlar, geçmiş, Groq, LLM, transkript motoru, kayıt oturumu
src/workers/   utilityProcess: ml-worker (sherpa-onnx), nllb-worker (transformers.js)
src/shared/    ortak: tipler, i18n (11 dil), export, parçalama, konuşmacı eşleme
src/preload/   contextBridge API
src/renderer/  arayüz (HTML/CSS/TS), ses yakalama (AudioWorklet)
test/          unit, e2e, yardımcılar (sahte Groq sunucusu)
scripts/       build, fetch-models, prepare-arch
```
