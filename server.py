import platform
import tempfile
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import groq_api
from export import EXPORTERS

load_dotenv()

MODEL_REPO = "mlx-community/whisper-large-v3-turbo-8bit"
STATIC_DIR = Path(__file__).parent / "static"

# Lokal (mlx-whisper) yol yalnızca Apple Silicon'da mümkün. Diğer platformlarda
# uygulama yalnızca API modunda çalışır; ayarlarda Lokal/API seçeneği bile gösterilmez.
IS_APPLE_SILICON = platform.system() == "Darwin" and platform.machine() == "arm64"

app = FastAPI()
app.mount("/assets", StaticFiles(directory=STATIC_DIR), name="assets")


_mlx_weights_ready = False


def _ensure_mlx_weights() -> None:
    """824MB mlx-whisper modelini indirir + ağırlık dosyası adını düzeltir.

    Kasıtlı olarak lazy: yalnızca Lokal moddaki İLK transkript isteğinde çağrılır
    (bkz. _transcribe_local). Apple Silicon'da bile, kullanıcı hiç Lokal moda
    geçmezse bu asla tetiklenmez — API modu kullanan biri boşuna 824MB indirmez.
    """
    global _mlx_weights_ready
    if _mlx_weights_ready:
        return
    from huggingface_hub import snapshot_download

    # Bu repo ağırlıkları `model.safetensors` olarak paketliyor, ama mlx_whisper
    # yalnızca `weights.safetensors` / `weights.npz` arıyor. İndirilen dosyaya
    # hardlink alias'ı ekle (yeniden indirme/kopyalama yok).
    local_dir = Path(snapshot_download(repo_id=MODEL_REPO))
    model_file = local_dir / "model.safetensors"
    alias = local_dir / "weights.safetensors"
    if model_file.exists() and not alias.exists():
        alias.hardlink_to(model_file)
    _mlx_weights_ready = True


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/config")
def config():
    # Frontend, Lokal/API modu seçicisini gösterip göstermeyeceğine buna göre karar verir.
    return {"apple_silicon": IS_APPLE_SILICON, "default_mode": "api"}


def _use_local(mode: Optional[str]) -> bool:
    # Lokal yol yalnızca Apple Silicon'da ve kullanıcı açıkça "local" seçtiğinde.
    return IS_APPLE_SILICON and (mode == "local")


def _transcribe_local(audio_path: str) -> dict:
    import mlx_whisper  # Apple-only; yalnızca lokal yolda import edilir.

    _ensure_mlx_weights()
    result = mlx_whisper.transcribe(audio_path, path_or_hf_repo=MODEL_REPO)
    segments = [
        {"start": seg["start"], "end": seg["end"], "text": seg["text"].strip()}
        for seg in result["segments"]
    ]
    return {
        "language": result["language"],
        "text": result["text"].strip(),
        "segments": segments,
    }


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    diarize: bool = Form(False),
    mode: Optional[str] = Form(None),
    api_key: Optional[str] = Form(None),
):
    use_local = _use_local(mode)
    suffix = Path(file.filename).suffix or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp.flush()

        try:
            if use_local:
                base = _transcribe_local(tmp.name)
            else:
                base = groq_api.transcribe(tmp.name, api_key)
        except groq_api.GroqError as exc:
            return Response(content=str(exc), status_code=502)

        language = base["language"]
        segments = base["segments"]

        # Diyarizasyon her zaman lokal çalışır (bkz. CLAUDE.md). Yalnızca istenirse.
        if diarize:
            try:
                import diarize as diarize_module

                turns = diarize_module.diarize(tmp.name)
                segments = diarize_module.assign_speakers(segments, turns)
            except Exception as exc:
                return Response(content=f"Diyarizasyon hatası: {exc}", status_code=502)

    return {"language": language, "text": base["text"], "segments": segments}


class TranslateSegment(BaseModel):
    start: float
    end: float
    text: str
    speaker: Optional[str] = None


class TranslateRequest(BaseModel):
    segments: List[TranslateSegment]
    source_lang: str
    target_lang: str
    mode: Optional[str] = None
    api_key: Optional[str] = None


@app.post("/translate")
async def translate_endpoint(payload: TranslateRequest):
    """Var olan bir transkripti sonradan çevirir (kullanıcı transkripti gördükten
    sonra hedef dili seçip 'Çevir'e bastığında tetiklenir — /transcribe'a bağımlı
    değildir, bkz. CLAUDE.md New Features #8 UX notu)."""
    if not payload.segments:
        return Response(content="Boş segment listesi", status_code=400)

    use_local = _use_local(payload.mode)
    texts = [seg.text for seg in payload.segments]
    try:
        if use_local:
            import translate as translate_module

            translated_texts = translate_module.translate_texts(
                texts, payload.source_lang, payload.target_lang
            )
        else:
            translated_texts = groq_api.translate_texts(
                texts, payload.source_lang, payload.target_lang, payload.api_key
            )
    except groq_api.GroqError as exc:
        return Response(content=str(exc), status_code=502)
    except Exception as exc:
        return Response(content=f"Çeviri hatası: {exc}", status_code=502)

    translated_segments = [
        {**seg.model_dump(), "text": t}
        for seg, t in zip(payload.segments, translated_texts)
    ]
    return {
        "target_lang": payload.target_lang,
        "text": " ".join(translated_texts).strip(),
        "segments": translated_segments,
    }


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
    api_key: Optional[str] = None
    lang: Optional[str] = None  # ISO 639-1; verilmezse Türkçe (bkz. groq_api._lang_name)


def _run_llm(kind: str, text: str, api_key: Optional[str], lang: Optional[str]) -> str:
    """Özet/polish'i Groq'a yönlendirir; anahtar yoksa lokal HF sarmalayıcıya (llm.py) düşer.

    kind: "summarize" | "polish".
    """
    if api_key and api_key.strip():
        fn = groq_api.summarize if kind == "summarize" else groq_api.polish
        return fn(text, api_key, lang)
    # Geriye dönük uyum / geliştirici yolu: .env'deki HF_TOKEN ile llm.py.
    import llm as llm_module

    fn = llm_module.summarize if kind == "summarize" else llm_module.polish
    return fn(text, lang)


@app.post("/summarize")
async def summarize(payload: LLMRequest):
    if not payload.text.strip():
        return Response(content="Boş metin", status_code=400)
    try:
        return {"summary": _run_llm("summarize", payload.text, payload.api_key, payload.lang)}
    except groq_api.GroqError as exc:
        return Response(content=str(exc), status_code=502)
    except Exception as exc:
        return Response(content=f"Özetleme hatası: {exc}", status_code=502)


@app.post("/polish")
async def polish(payload: LLMRequest):
    if not payload.text.strip():
        return Response(content="Boş metin", status_code=400)
    try:
        return {"polished": _run_llm("polish", payload.text, payload.api_key, payload.lang)}
    except groq_api.GroqError as exc:
        return Response(content=str(exc), status_code=502)
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
