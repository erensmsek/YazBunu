import os
from typing import Dict, List

from pyannote.audio import Pipeline

_pipeline = None


def _load():
    global _pipeline
    if _pipeline is None:
        token = os.environ.get("HF_TOKEN")
        _pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1", token=token
        )
    return _pipeline


def diarize(audio_path: str) -> List[Dict]:
    pipeline = _load()
    diarization = pipeline(audio_path)
    return [
        {"start": turn.start, "end": turn.end, "speaker": speaker}
        for turn, _, speaker in diarization.itertracks(yield_label=True)
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
