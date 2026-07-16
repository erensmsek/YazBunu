import tempfile
from pathlib import Path
from typing import List, Optional

import mlx_whisper
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from huggingface_hub import snapshot_download
from pydantic import BaseModel

import diarize as diarize_module
import llm as llm_module
import translate as translate_module
from export import EXPORTERS

load_dotenv()

MODEL_REPO = "mlx-community/whisper-large-v3-turbo-8bit"
STATIC_DIR = Path(__file__).parent / "static"

app = FastAPI()
app.mount("/assets", StaticFiles(directory=STATIC_DIR), name="assets")


@app.on_event("startup")
def ensure_model_weights_alias() -> None:
    # This repo ships weights as `model.safetensors`, but mlx_whisper only
    # looks for `weights.safetensors` / `weights.npz`. Hardlink an alias so
    # the existing download is picked up without re-fetching or copying data.
    local_dir = Path(snapshot_download(repo_id=MODEL_REPO))
    model_file = local_dir / "model.safetensors"
    alias = local_dir / "weights.safetensors"
    if model_file.exists() and not alias.exists():
        alias.hardlink_to(model_file)


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    target_lang: Optional[str] = Form(None),
    diarize: bool = Form(False),
):
    suffix = Path(file.filename).suffix or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp.flush()

        result = mlx_whisper.transcribe(tmp.name, path_or_hf_repo=MODEL_REPO)

        segments = [
            {"start": seg["start"], "end": seg["end"], "text": seg["text"].strip()}
            for seg in result["segments"]
        ]

        if diarize:
            turns = diarize_module.diarize(tmp.name)
            segments = diarize_module.assign_speakers(segments, turns)

    response = {
        "language": result["language"],
        "text": result["text"].strip(),
        "segments": segments,
    }

    if target_lang and target_lang != result["language"]:
        translated_texts = translate_module.translate_texts(
            [seg["text"] for seg in segments], result["language"], target_lang
        )
        translated_segments = [
            {**seg, "text": t} for seg, t in zip(segments, translated_texts)
        ]
        response["translation"] = {
            "target_lang": target_lang,
            "text": " ".join(translated_texts).strip(),
            "segments": translated_segments,
        }

    return response


class ExportSegment(BaseModel):
    start: float
    end: float
    text: str
    speaker: Optional[str] = None


class ExportRequest(BaseModel):
    format: str
    text: str
    segments: List[ExportSegment]


class LLMRequest(BaseModel):
    text: str


@app.post("/summarize")
async def summarize(payload: LLMRequest):
    if not payload.text.strip():
        return Response(content="Boş metin", status_code=400)
    try:
        return {"summary": llm_module.summarize(payload.text)}
    except Exception as exc:
        return Response(content=f"Özetleme hatası: {exc}", status_code=502)


@app.post("/polish")
async def polish(payload: LLMRequest):
    if not payload.text.strip():
        return Response(content="Boş metin", status_code=400)
    try:
        return {"polished": llm_module.polish(payload.text)}
    except Exception as exc:
        return Response(content=f"İyileştirme hatası: {exc}", status_code=502)


@app.post("/export")
async def export(payload: ExportRequest):
    if payload.format not in EXPORTERS:
        return Response(content="Desteklenmeyen format", status_code=400)

    exporter, media_type = EXPORTERS[payload.format]
    segments = [seg.model_dump() for seg in payload.segments]
    content = exporter(payload.text, segments)

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="transkript.{payload.format}"'},
    )
