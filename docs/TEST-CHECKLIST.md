# Elle Doğrulama Listesi (macOS / Windows)

Otomatik testler (unit + E2E) Linux'ta çalışıyor ve paketlenmiş Linux uygulamasında da geçiyor.
macOS ve Windows'a özgü davranışlar (izinler, sistem sesi, imza) bu ortamda çalıştırılamadığı için
bir kez elle doğrulanmalı. Her madde ~1 dakika.

## Kurulum ve açılış
- [ ] Paket kurulur ve çift tıklayınca açılır (macOS: sağ tık → Aç gerekebilir)
- [ ] Ayarlar › Groq anahtarı: **Test et** → "Anahtar geçerli ✓", **Kaydet**
- [ ] Uygulamayı kapat/aç: anahtar hâlâ kayıtlı (Keychain / DPAPI)

## Ses girişleri
- [ ] **Mikrofon**: ilk kayıtta mikrofon izni istenir (macOS), 30 sn konuş → canlı metin akar, durdur → transkript
- [ ] **Sistem Sesi**: YouTube'da bir video aç, kaydet → videonun konuşması yazıya döner
  - macOS: izin penceresi → izin ver → gerekiyorsa uygulamayı yeniden başlat
- [ ] **Toplantı**: kendin konuşurken video da çalsın → ikisi de transkriptte
- [ ] **Dosya**: bir `.mp3` ve bir `.mp4` video sürükle-bırak → transkript
- [ ] 30+ dakikalık bir dosya: ilerleme çubuğu ilerler, sonuç tam gelir

## Özellikler
- [ ] Konuşmacı ayrımı açık + 2 kişilik kayıt → iki konuşmacı; isim ver → kalıcı
- [ ] Çevir (İngilizce), Özetle, Başlıklandır & İyileştir
- [ ] Segment zamanına tıkla → ses o andan çalar
- [ ] Düzenle → metni değiştir → Bitti → geçmişten tekrar yükle, değişiklik duruyor
- [ ] Export: TXT / SRT / MD kaydet diyaloğu açılır, dosya doğru
- [ ] Geçmiş › Ses Ekle → yeni kayıt eklenir, zaman damgaları devam eder
- [ ] Offline mod → Turbo modelini indir → internet kapalıyken dosya yazıya döker
- [ ] Offline çeviri (yalnızca Apple Silicon / Windows / Linux): NLLB iner, çeviri çalışır
- [ ] Global kısayol `Cmd/Ctrl+Shift+Y` uygulama arka plandayken kaydı başlatır/durdurur
- [ ] Tepsi ikonu (Windows) / menü çubuğu ikonu (macOS) menüsü çalışır
- [ ] Kayıt sürerken pencereyi kapatmaya çalış → uyarı çıkar
- [ ] Arayüz dilini değiştir, koyu tema
