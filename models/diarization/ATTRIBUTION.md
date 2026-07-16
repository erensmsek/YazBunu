# Atıf

Bu klasördeki ağırlıklar [`pyannote/speaker-diarization-community-1`](https://huggingface.co/pyannote/speaker-diarization-community-1)
(Hervé Bredin ve pyannote ekibi) reposundan alınmıştır — **CC-BY-4.0** lisanslıdır,
yeniden dağıtıma atıf şartıyla izin verir.

- `segmentation.bin` — konuşma segmentasyonu modeli
- `embedding.bin` — konuşmacı embedding modeli (WeSpeaker ResNet34)
- `plda.npz`, `xvec_transform.npz` — PLDA kalibrasyon parametreleri

Bu proje bu ağırlıkları, `pyannote/speaker-diarization-3.1`'in Hugging Face'den
çalışma zamanında indirilmesindeki güvenilmezliği (bkz. CLAUDE.md) ve pyannote
4.x'in artık bu gated pakete bağımlı olmasını aşmak için doğrudan repoya gömer;
kullanıcının herhangi bir HF hesabı veya token'a ihtiyacı olmaz.

Orijinal çalışma: Bredin, H. (2023). *pyannote.audio 2.1 speaker diarization pipeline*.
