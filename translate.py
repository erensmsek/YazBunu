from typing import List

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

MODEL_NAME = "facebook/nllb-200-distilled-600M"

# Whisper (ISO 639-1) -> NLLB (FLORES-200) language codes
LANG_MAP = {
    "tr": "tur_Latn",
    "en": "eng_Latn",
    "de": "deu_Latn",
    "fr": "fra_Latn",
    "es": "spa_Latn",
    "it": "ita_Latn",
    "pt": "por_Latn",
    "nl": "nld_Latn",
    "ru": "rus_Cyrl",
    "ar": "arb_Arab",
    "zh": "zho_Hans",
    "ja": "jpn_Jpan",
    "ko": "kor_Hang",
    "pl": "pol_Latn",
    "sv": "swe_Latn",
    "uk": "ukr_Cyrl",
    "el": "ell_Grek",
    "hi": "hin_Deva",
    "fa": "pes_Arab",
    "ro": "ron_Latn",
}

_device = "mps" if torch.backends.mps.is_available() else "cpu"
_tokenizer = None
_model = None


def _load():
    global _tokenizer, _model
    if _model is None:
        _tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
        _model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME).to(_device)
        _model.eval()
    return _tokenizer, _model


def flores_code(iso_639_1: str) -> str:
    try:
        return LANG_MAP[iso_639_1]
    except KeyError:
        raise ValueError(f"Desteklenmeyen dil kodu: {iso_639_1}")


def translate_texts(texts: List[str], source_lang: str, target_lang: str) -> List[str]:
    if not texts:
        return []

    tokenizer, model = _load()
    tokenizer.src_lang = flores_code(source_lang)
    target_code = flores_code(target_lang)

    inputs = tokenizer(texts, return_tensors="pt", padding=True, truncation=True).to(_device)
    with torch.no_grad():
        generated = model.generate(
            **inputs,
            forced_bos_token_id=tokenizer.convert_tokens_to_ids(target_code),
            max_length=512,
        )
    return tokenizer.batch_decode(generated, skip_special_tokens=True)
