# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A graduation project (BTK Bitirme Projesi): a fully local speech-to-text application. No cloud hosting, no Hugging Face Spaces, no ZeroGPU — everything runs on the user's MacBook Air M4 (16GB). Hugging Face Hub is used only as a model registry (downloading weights once, then running entirely offline/locally).

Stack:
- **Transcription**: `large-v3-turbo` Whisper, 8-bit quantized, via `mlx-whisper` (Apple Silicon-native, Metal-accelerated) — chosen over `whisper.cpp` and over PyTorch+MPS.
- **Translation**: `facebook/nllb-200-distilled-600M` via `transformers`, arbitrary source→target language (not just X→English like Whisper's built-in translate task).
- **Speaker diarization**: `pyannote/speaker-diarization-3.1` via `pyannote.audio` (gated model, currently blocked — see Current Status).
- **Summarize + polish (LLM)**: `Qwen/Qwen2.5-7B-Instruct` (BF16) via **Hugging Face Inference API** (`llm.py`). This is the one **deliberate exception** to the "everything local" rule — see gotcha #7. The local 4-bit MLX version was tested and rejected (too slow ~35s, hallucinations, degraded Turkish).
- **Backend**: FastAPI (`server.py`), single process, no build step.
- **Frontend**: hand-written HTML/CSS/JS in `static/` — deliberately **not** Gradio/Streamlit. Chosen for a more polished, custom-designed UI since the app never needs to be deployed to Spaces.

## Setup & running

```bash
cd "BTK Bitiriş Projesi"
source venv/bin/activate          # venv already created, deps already installed
export $(grep -v '^#' .env | xargs)   # loads HF_TOKEN (needed for gated diarization model)

HF_HUB_DISABLE_XET=1 uvicorn server:app --host 127.0.0.1 --port 7860
```

Open `http://127.0.0.1:7860`. There is no separate build/lint/test tooling in this repo — it's a small FastAPI app plus static assets, run directly.

To reinstall dependencies from scratch: `pip install -r requirements.txt` (see gotcha #2 below — `hf_xet` must stay uninstalled).

**Note on the Browser-pane preview tool**: `preview_start` with a `name` (launch.json config `stt-server`) fails with "Operation not permitted" in this project directory, likely because the path contains a space and a Turkish character. Workaround: start `uvicorn` manually in the background via Bash, then call `preview_start` with just a `url` pointing at the already-running `http://127.0.0.1:7860`.

## Architecture

`server.py` is the single entry point (FastAPI). Routes:
- `GET /` — serves `static/index.html`.
- `POST /transcribe` — multipart form: `file` (audio), optional `target_lang` (ISO 639-1 code), optional `diarize` (bool). Pipeline: `mlx_whisper.transcribe()` → build segment list → if `diarize`, merge in speaker labels from `diarize.py` → if `target_lang` differs from detected language, translate segments via `translate.py`. Returns `{language, text, segments[], translation?}`.
- `POST /summarize` — JSON body `{text}` → `{summary}`. Calls `llm.summarize()` (HF Inference API). See gotcha #7.
- `POST /polish` — JSON body `{text}` → `{polished}` (Markdown string with H1 title, subheadings, `code` spans). Calls `llm.polish()`. The frontend renders the Markdown client-side (minimal renderer in `script.js`) and lets it be exported via `/export` (as raw text/md).
- `POST /export` — JSON body `{format, text, segments[]}` → returns a downloadable file via `export.py`'s `EXPORTERS` dict. Used independently for both the original transcript and the translated one (frontend calls it twice with different payloads).
- `@app.on_event("startup")` — `ensure_model_weights_alias()`, see gotcha #1.

Supporting modules (each is a standalone, lazily-initialized wrapper — same pattern: a module-level `_model`/`_pipeline` singleton populated on first use):
- `export.py` — pure formatting functions, no I/O: `to_txt`, `to_srt`, `to_vtt`, `to_md`, `to_json`, all registered in `EXPORTERS: {format: (fn, media_type)}`.
- `translate.py` — NLLB wrapper. `LANG_MAP` (ISO 639-1 → FLORES-200 code) is the single source of truth for which languages the UI's translate dropdown should offer — extend both `LANG_MAP` here and the `<select>` in `static/index.html` together when adding a language. `translate_texts()` batches all segment texts into one `model.generate()` call rather than one call per segment.
- `diarize.py` — pyannote wrapper. `diarize()` returns raw speaker turns; `assign_speakers()` merges them onto Whisper segments by max-time-overlap and relabels pyannote's raw IDs (`SPEAKER_00`, ...) into sequential `Konuşmacı_1`, `Konuşmacı_2`, ... in order of first appearance (deliberately no gender/identity detection — sequential labels only, per project requirements).
- `llm.py` — **NOT local** (unlike every other module): thin wrapper over `huggingface_hub.InferenceClient` calling `Qwen/Qwen2.5-7B-Instruct` via the `featherless-ai` provider (BF16, full precision). Same lazy-singleton pattern (`_client`). `summarize()` → short Turkish summary (narrow `max_tokens` + explicit "sadece Türkçe" to prevent the observed Chinese-drift glitch); `polish()` → Markdown-formatted rewrite with title. Both use a system+user chat template and `temperature=0.4`. Needs `HF_TOKEN` in `.env`. See gotcha #7 for why this is API-based, not local.

`static/` — no framework, no build step:
- `index.html` — settings row (target-language `<select>`, diarize `<checkbox>`) shared by both input modes, a tab switcher (Mikrofon / Dosya Yükle), and a results section with two parallel blocks (original transcript, optional translation), each with its own segment list and export button row.
- `script.js` — `MediaRecorder`-based mic capture (see gotcha #4), drag-and-drop + `<input type=file>` upload, renders segments (with speaker-tag prefix when present) and drives `/export` downloads via `Blob` + a synthetic anchor click. Also: live mic **waveform** via Web Audio `AnalyserNode` drawn on a `<canvas>` (`startWaveform`/`stopWaveform`, `requestAnimationFrame` bar chart); `Özetle`/`Başlıklandır & İyileştir` buttons that POST the transcript to `/summarize` & `/polish`; and a **minimal Markdown renderer** (`renderMarkdown()` — handles `#`/`##`/`###`, `- `/`1.` lists, `**bold**`, `*italic*`, `` `code` ``) for the LLM output. No external Markdown lib (keeps the no-build-step constraint).
- `style.css` — CSS custom properties, `prefers-color-scheme` for dark/light, no framework. Refreshed to a modern rounded light theme (indigo accent, gradient-bordered AI cards, pill settings, animated record button + waveform). Light is the primary/designed-for theme; dark is a maintained fallback.

## Key technical decisions & gotchas

1. **Model weights filename mismatch (already fixed — don't reintroduce)**: `mlx-community/whisper-large-v3-turbo-8bit` ships weights as `model.safetensors`, but `mlx_whisper`'s `load_model()` only looks for `weights.safetensors` / `weights.npz`. `ensure_model_weights_alias()` in `server.py` hardlinks one name to the other at startup (no data duplication, no re-download). If `MODEL_REPO` is ever pointed at a different `mlx-community` quantization, check its actual filenames first via `huggingface.co/api/models/<repo>` — some repos (e.g. `whisper-large-v3-turbo-q4`, the plain `whisper-large-v3-turbo`) already use `weights.safetensors`/`weights.npz` natively and need no fix; others (`-8bit`, `-4bit`, `-asr-*` variants) use `model.safetensors` and need this same alias trick.

2. **Hugging Face's "Xet" CDN (`cas-bridge.xethub.hf.co`) has been unreliable in this environment**: large public-model downloads have repeatedly stalled for many minutes at a fixed byte offset before either completing or requiring a retry. `hf_xet` (the accelerated Xet client) has been uninstalled to force the classic HTTP download path — keep it uninstalled (don't let `pip install -r requirements.txt` silently pull it back in via `transformers`/`huggingface_hub` extras). Also always export `HF_HUB_DISABLE_XET=1` as a second guard. If a download appears stuck, check whether `~/.cache/huggingface/hub/**/*.incomplete` is actually growing over ~30s before concluding it's broken.

3. **Gated diarization model — currently blocked, see Current Status.** `pyannote/speaker-diarization-3.1` requires accepting gated terms for *both* itself and its dependency `pyannote/segmentation-3.0` (two separate gates) at huggingface.co while logged in, plus an `HF_TOKEN` (read scope) in `.env`. Acceptance status is visible at `https://huggingface.co/settings/gated-repos`. Also note: `pyannote.audio`'s `Pipeline.from_pretrained()` takes a `token=` kwarg, not `use_auth_token=` (older API, removed in the installed version).

4. **Mic recording quality**: `script.js`'s `getUserMedia` call explicitly sets `echoCancellation`, `noiseSuppression`, and `autoGainControl` to `false`, and `MediaRecorder` is given `audioBitsPerSecond: 128000`. Browser defaults are tuned for VoIP calls and were measurably degrading Whisper's transcription accuracy (especially non-English) on real microphone input versus a clean uploaded file — don't revert this without re-testing accuracy.

5. **`mlx_whisper.transcribe()` caches its loaded model** as a class attribute (`ModelHolder`, keyed by the `path_or_hf_repo` string) across calls within the same process — as long as `MODEL_REPO` doesn't change between requests, the model loads once and stays warm. No additional caching layer needed in `server.py`.

6. **Everything in `/transcribe` runs synchronously inside an `async def` handler** (`mlx_whisper.transcribe`, `translate_texts`, `diarize` are all blocking calls) — the server can't service a second request while one transcription is in flight. Acceptable for the intended single-user local use; would need `run_in_executor`/threading if concurrent usage is ever required. Note `/summarize` and `/polish` are also blocking (synchronous HTTP call to HF) — same single-user assumption.

7. **Summarize/polish LLM is API-based, NOT local — a deliberate, user-approved exception to the "everything local" principle.** We benchmarked local MLX quantizations (`mlx-community/Qwen2-1.5B`, `Qwen2.5-3B`, `Qwen2.5-7B-Instruct-4bit`) against the API. The 1.5B/3B produced broken Turkish (invented words, wrong grammar, ignored instructions); the local 7B-4bit was usable but had hallucinations (invented "HearSay" label), broken numbering, minor grammar slips, and was **slow (~35s for a polish)**. The BF16 model over HF Inference API was clearly the cleanest and fast (~7-12s), so `llm.py` calls it remotely. Provider notes: `Qwen/Qwen2.5-7B-Instruct` is served by two providers for this token — `together` (FP8 "-Turbo", quantized) and `featherless-ai` (original BF16). We pinned `featherless-ai` for best polish quality. The MLX 4-bit repo canNOT be served via the API (Apple-Silicon-only format) — only local. The user's rationale for accepting cloud here: the project's grading is partly about HF-platform usage, and for personal use the only real blockers are cost/hardware, not the local-privacy purity that governs the other three models. If privacy ever matters again, the local 7B-4bit path already works (`test_llm.py`) — just slower/rougher.

## Current status (2026-07-16)

**Working & verified end-to-end (added 2026-07-16)**: Summarize + Başlıklandır & İyileştir (title + Markdown polish) via `llm.py` / `/summarize` / `/polish`. Verified by curl AND in-browser (injected transcript → clicked both buttons → summary card + Markdown-rendered polish card with H1/H2/italic/`code` + export buttons, no console errors). UI redesigned to a modern rounded light theme with a live mic waveform (`AnalyserNode` on canvas — code verified, but not exercised with real mic audio in the headless preview browser; worth a manual mic test).

**Working & verified end-to-end** (tested via curl, direct Python calls, and in-browser with synthetic TTS audio in Turkish/German/English):
- Core transcription, both microphone recording and file upload.
- Translation to any of the ~20 languages currently listed in `translate.py`'s `LANG_MAP`, via NLLB-200 — verified Turkish→English with correct grammar.
- Export to TXT / SRT / VTT / MD / JSON, for both the original transcript and (when requested) the translated one — verified via curl and via the browser's export buttons.

**Blocked, paused by user request**: Speaker diarization. `diarize.py` is fully implemented and already wired into `server.py` (the `diarize` form field) and the frontend (checkbox + per-segment speaker tags), but `pyannote/speaker-diarization-3.1` cannot currently be downloaded — Hugging Face's Xet CDN returns `403 Forbidden` / `AccessDenied` for this gated model's weight file, even with a correctly-scoped `HF_TOKEN` and both required repos showing `ACCEPTED` at `huggingface.co/settings/gated-repos`. This was confirmed to be server-side (not a bug in this codebase) via a raw `curl -H "Authorization: Bearer $HF_TOKEN"` request bypassing all Python tooling — HF's own resolve endpoint issues a validly-signed redirect URL, but the CAS bridge that should serve the actual bytes rejects it. Multiple retries over ~40 minutes all failed identically. This matches a known, documented class of issue on HF's own forums (not unique to this project):
- https://discuss.huggingface.co/t/cas-service-error-when-downloading-gated-models-on-databricks-even-with-hf-hub-disable-xet-1/164793
- https://discuss.huggingface.co/t/cas-bridge-xethub-hf-co-broke/158626

The user decided to pause this feature rather than keep debugging further. **Next time this is picked up**: just retry the snippet below — no code changes are expected to be needed, only for HF's backend to start honoring the (already-granted) gate:
```bash
cd "BTK Bitiriş Projesi" && source venv/bin/activate && export $(grep -v '^#' .env | xargs)
python3 -c "from pyannote.audio import Pipeline; import os; Pipeline.from_pretrained('pyannote/speaker-diarization-3.1', token=os.environ['HF_TOKEN']); print('OK')"
```
If it prints `OK`, wire-test `diarize.py` (synthetic 2-speaker audio, e.g. two different `say` voices concatenated) then re-verify `/transcribe?diarize=true` end to end and the UI's speaker tags — everything downstream of the model download is already built and should just work.

## New Features
- ~~Summary Button: Summarize the transcript with the press of a button, using the LLM from HuggingFace.~~ ✅ Done (2026-07-16) — `/summarize`.
- ~~Adding a LLM that reedit the text for titles and reasonable content.~~ ✅ Done (2026-07-16) — `/polish` (title + Markdown).
