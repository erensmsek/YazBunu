import platform
import tempfile
import threading
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from tqdm.auto import tqdm as _base_tqdm

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

_download_lock = threading.Lock()
_download_state: dict = {"status": "idle", "downloaded_bytes": 0, "total_bytes": 0, "error": None}
_download_thread: Optional[threading.Thread] = None


class _TrackingTqdm(_base_tqdm):
    """huggingface_hub'ın tqdm_class= kancası, aynı sınıftan birden çok bar oluşturur:
    "Fetching N files" (unit=dosya sayısı), "Downloading bytes" (ağdan inen toplam
    bayt) ve "Reconstructing..." (diske yazılan bayt) — yalnızca "Downloading bytes"
    barı gerçek indirme ilerlemesini temsil eder, diğer ikisi filtrelenip yok sayılır.
    Bu barın `total`'i, yeni dosyalar keşfedildikçe huggingface_hub tarafından
    dışarıdan doğrudan mutasyonla güncellenir (kendi metodları üzerinden değil) —
    bu yüzden kendi sayaç toplamımızı tutmak yerine, her update() çağrısında barın
    o anki self.n/self.total değerlerini _download_state'e aynen yansıtıyoruz.
    """

    def update(self, n=1):
        super().update(n)
        if self.desc == "Downloading bytes":
            with _download_lock:
                _download_state["downloaded_bytes"] = self.n
                _download_state["total_bytes"] = self.total or 0


def _run_mlx_download() -> None:
    """824MB mlx-whisper modelini indirir + ağırlık dosyası adını düzeltir.

    Her zaman ayrı bir arka plan thread'inde çalışır (bkz. _ensure_mlx_weights ve
    /prepare-local) — böylece indirme sırasında da event loop /download-status
    isteklerine cevap verebilir, tek istekte bloklanıp kalmaz.
    """
    global _mlx_weights_ready
    with _download_lock:
        _download_state.update(status="downloading", downloaded_bytes=0, total_bytes=0, error=None)
    try:
        from huggingface_hub import snapshot_download

        # Bu repo ağırlıkları `model.safetensors` olarak paketliyor, ama mlx_whisper
        # yalnızca `weights.safetensors` / `weights.npz` arıyor. İndirilen dosyaya
        # hardlink alias'ı ekle (yeniden indirme/kopyalama yok).
        local_dir = Path(snapshot_download(repo_id=MODEL_REPO, tqdm_class=_TrackingTqdm))
        model_file = local_dir / "model.safetensors"
        alias = local_dir / "weights.safetensors"
        if model_file.exists() and not alias.exists():
            alias.hardlink_to(model_file)
        _mlx_weights_ready = True
        with _download_lock:
            _download_state["status"] = "ready"
    except Exception as exc:
        # Teknik detay konsola yazılır; kullanıcıya gösterilen mesaj kısa ve Türkçe
        # tutulur (bkz. groq_api.py'deki GroqError deseni ile tutarlı).
        print(f"[mlx-whisper indirme hatası] {exc}")
        with _download_lock:
            _download_state.update(
                status="error",
                error="Model indirilemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.",
            )


def _start_download_thread_if_needed() -> threading.Thread:
    global _download_thread
    with _download_lock:
        thread = _download_thread
        if thread is None or not thread.is_alive():
            thread = threading.Thread(target=_run_mlx_download, daemon=True)
            _download_thread = thread
            thread.start()
        return thread


def _download_status_payload() -> dict:
    with _download_lock:
        state = dict(_download_state)
    total = state["total_bytes"]
    if total:
        state["progress"] = min(100, int(state["downloaded_bytes"] / total * 100))
    else:
        state["progress"] = 100 if state["status"] == "ready" else 0
    return state


def _ensure_mlx_weights() -> None:
    """Lokal moddaki her transkript isteğinden önce çağrılır.

    Kasıtlı olarak lazy: Apple Silicon'da bile, kullanıcı hiç Lokal moda geçmezse
    bu asla tetiklenmez — API modu kullanan biri boşuna 824MB indirmez. İndirme
    zaten /prepare-local ile arka planda başlamışsa onun bitmesini bekler; hiç
    başlamamışsa (kullanıcı Ayarlar popup'ını beklemeden doğrudan kayda bastıysa)
    burada güvenlik ağı olarak başlatıp bekler.
    """
    if _mlx_weights_ready:
        return
    thread = _start_download_thread_if_needed()
    thread.join()
    if _download_state["status"] == "error":
        raise RuntimeError(_download_state["error"])


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


@app.post("/prepare-local")
def prepare_local():
    """Ayarlar'da Lokal mod seçilip kaydedildiğinde tetiklenir: 824MB mlx-whisper
    modelini arka planda indirmeye başlar (zaten hazırsa hiçbir şey yapmaz) ve hemen
    döner — frontend /download-status'u polling ederek ilerlemeyi popup'ta gösterir."""
    if _mlx_weights_ready:
        return _download_status_payload()
    _start_download_thread_if_needed()
    return _download_status_payload()


@app.get("/download-status")
def download_status():
    return _download_status_payload()


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
