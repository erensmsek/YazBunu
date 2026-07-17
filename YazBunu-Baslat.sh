#!/bin/bash
# Linux: terminalden "./YazBunu-Baslat.sh" ile, ya da dosya yöneticinin
# "Çalıştır" seçeneğiyle başlatılabilir (masaüstü ortamına göre değişir —
# bkz. RUN-GUIDE.md'deki Linux notu).
cd "$(dirname "$0")"

if [ ! -d "venv" ]; then
  echo "venv bulunamadı. Önce kurulum yapman gerekiyor:"
  echo "  python3 -m venv venv"
  echo "  source venv/bin/activate"
  echo "  pip install -r requirements.txt"
  read -p "Kapatmak için Enter'a bas..."
  exit 1
fi

source venv/bin/activate

if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi
export HF_HUB_DISABLE_XET=1

echo "YazBunu başlatılıyor... Tarayıcı birazdan otomatik açılacak."
echo "Uygulamayı kapatmak için bu pencereyi kapat ya da Ctrl+C'ye bas."
( sleep 2 && (xdg-open http://127.0.0.1:7860 2>/dev/null || true) ) &

uvicorn server:app --host 127.0.0.1 --port 7860
