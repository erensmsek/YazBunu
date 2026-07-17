@echo off
REM Windows: bu dosyaya çift tıklayarak çalıştırılabilir başlatıcı.
cd /d "%~dp0"

if not exist venv (
  echo venv bulunamadi. Once kurulum yapman gerekiyor:
  echo   python -m venv venv
  echo   venv\Scripts\activate
  echo   pip install -r requirements.txt
  pause
  exit /b 1
)

call venv\Scripts\activate.bat

if exist .env (
  for /f "usebackq tokens=1,* delims==" %%a in (`findstr /v "^#" .env`) do set "%%a=%%b"
)
set HF_HUB_DISABLE_XET=1

echo YazBunu baslatiliyor... Tarayici birazdan otomatik acilacak.
echo Uygulamayi kapatmak icin bu pencereyi kapat ya da Ctrl+C'ye bas.
start "" cmd /c "timeout /t 2 >nul & start http://127.0.0.1:7860"

uvicorn server:app --host 127.0.0.1 --port 7860
