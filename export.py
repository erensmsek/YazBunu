import json
from typing import List, Optional, TypedDict


class Segment(TypedDict, total=False):
    start: float
    end: float
    text: str
    speaker: Optional[str]


def _srt_timestamp(seconds: float) -> str:
    ms = round(seconds * 1000)
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1_000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _vtt_timestamp(seconds: float) -> str:
    ms = round(seconds * 1000)
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1_000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def _label(seg: Segment) -> str:
    speaker = seg.get("speaker")
    return f"{speaker}: " if speaker else ""


def to_txt(full_text: str, segments: List[Segment]) -> str:
    return full_text.strip() + "\n"


def to_srt(full_text: str, segments: List[Segment]) -> str:
    blocks = []
    for i, seg in enumerate(segments, start=1):
        blocks.append(
            f"{i}\n"
            f"{_srt_timestamp(seg['start'])} --> {_srt_timestamp(seg['end'])}\n"
            f"{_label(seg)}{seg['text'].strip()}\n"
        )
    return "\n".join(blocks) + "\n"


def to_vtt(full_text: str, segments: List[Segment]) -> str:
    blocks = ["WEBVTT\n"]
    for seg in segments:
        blocks.append(
            f"{_vtt_timestamp(seg['start'])} --> {_vtt_timestamp(seg['end'])}\n"
            f"{_label(seg)}{seg['text'].strip()}\n"
        )
    return "\n".join(blocks) + "\n"


def to_md(full_text: str, segments: List[Segment]) -> str:
    lines = ["# Transkript\n", full_text.strip() + "\n", "## Zaman Damgalı Segmentler\n"]
    for seg in segments:
        start_m, start_s = divmod(int(seg["start"]), 60)
        end_m, end_s = divmod(int(seg["end"]), 60)
        lines.append(
            f"- **[{start_m:02d}:{start_s:02d} – {end_m:02d}:{end_s:02d}]** "
            f"{_label(seg)}{seg['text'].strip()}"
        )
    return "\n".join(lines) + "\n"


def to_json(full_text: str, segments: List[Segment]) -> str:
    return json.dumps({"text": full_text.strip(), "segments": segments}, ensure_ascii=False, indent=2)


EXPORTERS = {
    "txt": (to_txt, "text/plain"),
    "srt": (to_srt, "application/x-subrip"),
    "vtt": (to_vtt, "text/vtt"),
    "md": (to_md, "text/markdown"),
    "json": (to_json, "application/json"),
}
