"""Konuşmacı ayrımı — her zaman lokal (bkz. CLAUDE.md gotcha #8, #4).

pyannote/speaker-diarization-3.1'i çalışma zamanında HF'den indirmek yerine,
pyannote/speaker-diarization-community-1'in ağırlıkları (segmentation + embedding
+ plda, cc-by-4.0, ~33MB) models/diarization/ altına gömülüdür. Pipeline burada,
community-1'in config.yaml'ındaki hiperparametrelerle elle kurulur — hem gated HF
indirmesine hem de pyannote 4.x'in artık gated community-1'i zorunlu kılan
davranışına bağımlılığı ortadan kaldırır.
"""

import subprocess
import tempfile
from pathlib import Path
from typing import Dict, List

from pyannote.audio import Model
from pyannote.audio.core.plda import PLDA
from pyannote.audio.pipelines import SpeakerDiarization

WEIGHTS_DIR = Path(__file__).parent / "models" / "diarization"

_pipeline = None


def _load():
    global _pipeline
    if _pipeline is None:
        segmentation = Model.from_pretrained(str(WEIGHTS_DIR / "segmentation.bin"))
        embedding = Model.from_pretrained(str(WEIGHTS_DIR / "embedding.bin"))
        plda = PLDA(
            transform_npz=str(WEIGHTS_DIR / "xvec_transform.npz"),
            plda_npz=str(WEIGHTS_DIR / "plda.npz"),
        )
        pipeline = SpeakerDiarization(
            segmentation=segmentation,
            embedding=embedding,
            embedding_batch_size=32,
            embedding_exclude_overlap=True,
            plda=plda,
            clustering="VBxClustering",
            segmentation_batch_size=32,
        )
        # community-1/config.yaml'daki varsayılan hiperparametreler.
        pipeline.instantiate({
            "clustering": {"threshold": 0.6, "Fa": 0.07, "Fb": 0.8},
            "segmentation": {"min_duration_off": 0.0},
        })
        _pipeline = pipeline
    return _pipeline


def _to_wav(audio_path: str, wav_path: str) -> None:
    # pyannote/torchaudio bu ortamda webm/opus gibi konteyner formatlarının
    # süresini header'dan okuyamıyor (None döner -> "None * int" TypeError'ı).
    # Mikrofon kaydı script.js'den her zaman webm geliyor; ffmpeg ile 16kHz
    # mono WAV'a çevirmek hem bu sorunu çözüyor hem her formatı (mp3, m4a, ...)
    # tek bir yoldan geçiriyor.
    subprocess.run(
        ["ffmpeg", "-y", "-i", audio_path, "-ar", "16000", "-ac", "1", wav_path],
        check=True,
        capture_output=True,
    )


def diarize(audio_path: str) -> List[Dict]:
    pipeline = _load()
    with tempfile.NamedTemporaryFile(suffix=".wav") as wav_file:
        _to_wav(audio_path, wav_file.name)
        output = pipeline(wav_file.name)
    return [
        {"start": turn.start, "end": turn.end, "speaker": speaker}
        for turn, _, speaker in output.speaker_diarization.itertracks(yield_label=True)
    ]


def assign_speakers(segments: List[Dict], turns: List[Dict]) -> List[Dict]:
    speaker_order: List[str] = []

    def label_for(raw_speaker: str) -> str:
        if raw_speaker not in speaker_order:
            speaker_order.append(raw_speaker)
        return f"Konuşmacı_{speaker_order.index(raw_speaker) + 1}"

    for seg in segments:
        best_turn = None
        best_overlap = -1.0
        for turn in turns:
            overlap = min(seg["end"], turn["end"]) - max(seg["start"], turn["start"])
            if overlap > best_overlap:
                best_overlap = overlap
                best_turn = turn
        seg["speaker"] = label_for(best_turn["speaker"]) if best_turn else None

    return segments
