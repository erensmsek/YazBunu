# YazBunu — Kullanım Kılavuzu / User Guide

🇹🇷 [Türkçe](#-türkçe) &nbsp;·&nbsp; 🇬🇧 [English](#-english)

---

## 🇹🇷 Türkçe

### 1) Kurulum

| Sistem | Adımlar |
|---|---|
| **macOS** | `.dmg`'yi aç, YazBunu'yu **Uygulamalar**'a sürükle. İlk açılışta "tanınmayan geliştirici" uyarısı çıkarsa uygulamaya **sağ tık → Aç**. "Hasarlı" denirse Terminal'de: `xattr -cr /Applications/YazBunu.app` |
| **Windows** | `YazBunu-Setup-x.y.z.exe`'yi çalıştır. SmartScreen uyarısında **Ek bilgi → Yine de çalıştır**. |
| **Linux (AppImage)** | `chmod +x YazBunu-*.AppImage && ./YazBunu-*.AppImage` |
| **Linux (deb)** | `sudo apt install ./yazbunu_*_amd64.deb` |

### 2) İlk ayar

1. Sağ üstteki ⚙️ **Ayarlar** → **Groq API anahtarı**: [console.groq.com/keys](https://console.groq.com/keys)'ten ücretsiz al (kart gerekmez), yapıştır, **Test et** → **Kaydet**.
2. İstersen **Konuşma dili**ni sabitle (kısa kayıtlarda doğruluğu artırır) ve **Konuşmacı sayısı**nı seç.
3. İnternetsiz çalışmak için **Çalışma modu → Offline** ve bir Whisper modeli indir (önerilen: *Turbo*).

### 3) Kullanım

| Sekme | Ne yapar |
|---|---|
| **Mikrofon** | Kaydı başlat; **Canlı yazı** açıksa metin konuştukça (≈15–20 sn gecikmeyle) belirir. |
| **Sistem Sesi** | Bilgisayarda çalan sesi kaydeder (toplantı, video). |
| **Toplantı** | Mikrofon + sistem sesi birlikte. Yankıyı azaltmak için kulaklık önerilir. |
| **Dosya Yükle** | Bir ses ya da video dosyası seç veya pencereye sürükle-bırak. |

- **Kısayol:** `Ctrl+Shift+Y` (macOS'ta `Cmd+Shift+Y`) uygulama arka plandayken bile kaydı başlatır/durdurur (Ayarlar › Genel'den değiştirilebilir).
- **Sonuçlar:** Konuşmacı adına tıkla → isim ver. **Düzenle** ile metni düzelt. Zaman damgasına tıkla → ses o andan çalar.
- **Çevir / Özetle / Başlıklandır:** "Dil" seçiliyse özet ve iyileştirme de o dilde üretilir; seçili değilse transkriptin dilinde.
- **Geçmiş** (🕘): Kayıtlar otomatik saklanır. **Ses Ekle** ile bir kayda sonradan ses eklenir.

### 4) Sistem sesi — platform notları

| Sistem | Durum |
|---|---|
| **Windows** | Doğrudan çalışır. |
| **macOS 13+** | İlk kullanımda *Ekran ve Sistem Sesi Kaydı* izni istenir: **Sistem Ayarları › Gizlilik ve Güvenlik**'ten YazBunu'ya izin ver, uygulamayı yeniden başlat. Çalışmazsa ücretsiz [BlackHole](https://existential.audio/blackhole/) sanal ses aygıtını kur, Ayarlar › Mikrofon'dan onu seç. |
| **Linux** | PulseAudio ya da PipeWire (`pipewire-pulse`) ve `parec` komutu gerekir: `sudo apt install pulseaudio-utils` |

### 5) Sorun giderme

| Sorun | Çözüm |
|---|---|
| "Groq API anahtarı gerekli" | Ayarlar'dan anahtarı gir ve **Kaydet**. |
| "Groq ücretsiz kota sınırına ulaşıldı" | Ücretsiz katmanın saatlik/günlük sınırı. Uygulama kısa beklemeleri kendisi yapar; uzun sınırda birkaç dakika sonra tekrar dene ya da Offline moda geç. |
| "Groq modeli kullanılamıyor" | Groq modeli kaldırmış: Ayarlar › Gelişmiş'e [güncel model kimliğini](https://console.groq.com/docs/models) yaz. |
| Mikrofon çalışmıyor (macOS) | Sistem Ayarları › Gizlilik ve Güvenlik › Mikrofon › YazBunu'yu aç. |
| Offline model inmiyor | İnternet bağlantısını kontrol et; indirme kaldığı yerden devam eder. |
| Verilerim nerede? | Ayarlar › Gelişmiş › **Veri klasörünü aç** (geçmiş, sesler, modeller). |

---

## 🇬🇧 English

### 1) Install
- **macOS:** open the `.dmg`, drag YazBunu to Applications. On first launch right-click → **Open**. If macOS says the app is "damaged": `xattr -cr /Applications/YazBunu.app`.
- **Windows:** run the installer; on SmartScreen choose **More info → Run anyway**.
- **Linux:** `chmod +x YazBunu-*.AppImage && ./YazBunu-*.AppImage`, or `sudo apt install ./yazbunu_*_amd64.deb`.

### 2) First run
Open ⚙️ **Settings**, paste a free [Groq API key](https://console.groq.com/keys), **Test** → **Save**.
For fully offline use choose **Operating mode → Offline** and download a Whisper model (*Turbo* recommended).

### 3) Use
**Microphone**, **System Audio**, **Meeting** (both) or **Upload File** (or drag & drop).
Global shortcut `Ctrl/Cmd+Shift+Y` toggles recording. Click a speaker name to rename it, **Edit** to fix text,
a timestamp to play from there. Recordings are saved to **History** automatically.

### 4) System audio
Windows: works out of the box. macOS 13+: grant *Screen & System Audio Recording* permission (or use BlackHole).
Linux: requires PulseAudio/PipeWire and `parec` (`sudo apt install pulseaudio-utils`).
