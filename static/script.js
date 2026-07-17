// --- i18n: uygulama arayüz dili (bkz. CLAUDE.md New Features #7) ---
// Her satır: [key, tr, en, de, fr, es, it, pt, ru, zh, ja, ko] — sütun sırası I18N_LANGS ile birebir eşleşir.
const I18N_LANGS = ["tr", "en", "de", "fr", "es", "it", "pt", "ru", "zh", "ja", "ko"];
// Her dilin kendi yazımıyla (özadı/autonym) adı — dil seçim menüsünde her zaman bu sabit isimler gösterilir,
// böylece kullanıcı hangi arayüz dilinde olursa olsun kendi dilini tanıyabilir.
const LANG_AUTONYMS = {
  tr: "Türkçe", en: "English", de: "Deutsch", fr: "Français", es: "Español",
  it: "Italiano", pt: "Português", ru: "Русский", zh: "中文", ja: "日本語", ko: "한국어",
};
const I18N_ROWS = [
  ["pageTitle", "YazBunu — Yerel Konuşma-Metin Stüdyosu", "YazBunu — Local Speech-to-Text Studio", "YazBunu — Lokales Sprache-zu-Text-Studio", "YazBunu — Studio local de synthèse vocale en texte", "YazBunu — Estudio local de voz a texto", "YazBunu — Studio locale da voce a testo", "YazBunu — Estúdio local de fala para texto", "YazBunu — Локальная студия распознавания речи", "YazBunu — 本地语音转文字工作室", "YazBunu — ローカル音声認識スタジオ", "YazBunu — 로컬 음성 인식 스튜디오"],
  ["diarizeLabel", "Konuşmacı ayrımı", "Speaker diarization", "Sprechererkennung", "Séparation des locuteurs", "Diarización de hablantes", "Diarizzazione dei parlanti", "Diarização de locutores", "Разделение говорящих", "说话人分离", "話者分離", "화자 분리"],
  ["langSwitcherAria", "Uygulama dilini değiştir", "Change app language", "App-Sprache ändern", "Changer la langue de l'application", "Cambiar idioma de la aplicación", "Cambia lingua dell'app", "Alterar idioma do aplicativo", "Изменить язык приложения", "更改应用语言", "アプリの言語を変更", "앱 언어 변경"],
  ["historyAria", "Geçmiş", "History", "Verlauf", "Historique", "Historial", "Cronologia", "Histórico", "История", "历史记录", "履歴", "기록"],
  ["themeAria", "Temayı değiştir", "Toggle theme", "Design wechseln", "Changer de thème", "Cambiar tema", "Cambia tema", "Alternar tema", "Сменить тему", "切换主题", "テーマを切り替え", "테마 전환"],
  ["settingsTitle", "Ayarlar", "Settings", "Einstellungen", "Paramètres", "Ajustes", "Impostazioni", "Configurações", "Настройки", "设置", "設定", "설정"],
  ["closeAria", "Kapat", "Close", "Schließen", "Fermer", "Cerrar", "Chiudi", "Fechar", "Закрыть", "关闭", "閉じる", "닫기"],
  ["setupBannerText", `<strong>Hızlı başla:</strong> Transkript, çeviri ve özet için ücretsiz bir <b>Groq</b> API anahtarı gir. Kart gerekmez, 1 dakikada alınır.`, `<strong>Quick start:</strong> Enter a free <b>Groq</b> API key for transcription, translation, and summaries. No card needed, takes 1 minute.`, `<strong>Schnellstart:</strong> Gib einen kostenlosen <b>Groq</b>-API-Schlüssel für Transkription, Übersetzung und Zusammenfassungen ein. Keine Karte nötig, dauert 1 Minute.`, `<strong>Démarrage rapide :</strong> Entrez une clé API <b>Groq</b> gratuite pour la transcription, la traduction et les résumés. Aucune carte requise, cela prend 1 minute.`, `<strong>Inicio rápido:</strong> Introduce una clave API de <b>Groq</b> gratuita para transcripción, traducción y resúmenes. No necesitas tarjeta, toma 1 minuto.`, `<strong>Avvio rapido:</strong> Inserisci una chiave API <b>Groq</b> gratuita per trascrizione, traduzione e riepiloghi. Nessuna carta richiesta, 1 minuto.`, `<strong>Início rápido:</strong> Insira uma chave de API <b>Groq</b> gratuita para transcrição, tradução e resumos. Não precisa de cartão, leva 1 minuto.`, `<strong>Быстрый старт:</strong> Введите бесплатный API-ключ <b>Groq</b> для транскрипции, перевода и резюме. Карта не нужна, займёт 1 минуту.`, `<strong>快速开始：</strong>输入免费的 <b>Groq</b> API 密钥即可使用转录、翻译和摘要功能。无需信用卡，1 分钟即可完成。`, `<strong>クイックスタート：</strong>文字起こし・翻訳・要約には無料の <b>Groq</b> APIキーを入力してください。カード不要、1分で完了します。`, `<strong>빠른 시작:</strong> 전사, 번역, 요약을 위해 무료 <b>Groq</b> API 키를 입력하세요. 카드 없이 1분이면 충분합니다.`],
  ["getKeyBtn", "Anahtar al", "Get a key", "Schlüssel holen", "Obtenir une clé", "Obtener clave", "Ottieni chiave", "Obter chave", "Получить ключ", "获取密钥", "キーを取得", "키 받기"],
  ["enterKeyBtn", "Anahtarı gir", "Enter key", "Schlüssel eingeben", "Entrer la clé", "Introducir clave", "Inserisci chiave", "Inserir chave", "Ввести ключ", "输入密钥", "キーを入力", "키 입력"],
  ["modeLabel", "Çalışma modu", "Operating mode", "Betriebsmodus", "Mode de fonctionnement", "Modo de funcionamiento", "Modalità operativa", "Modo de operação", "Режим работы", "运行模式", "動作モード", "작동 모드"],
  ["modeHint", "Bu cihaz Apple Silicon. İstersen transkript ve çeviriyi tamamen cihazında (internetsiz) çalıştırabilirsin.", "This device is Apple Silicon. You can run transcription and translation entirely on-device (offline) if you prefer.", "Dieses Gerät nutzt Apple Silicon. Du kannst Transkription und Übersetzung vollständig offline auf dem Gerät ausführen.", "Cet appareil utilise Apple Silicon. Vous pouvez exécuter la transcription et la traduction entièrement hors ligne sur l'appareil.", "Este dispositivo tiene Apple Silicon. Puedes ejecutar la transcripción y la traducción totalmente en el dispositivo (sin conexión).", "Questo dispositivo è Apple Silicon. Puoi eseguire trascrizione e traduzione interamente sul dispositivo (offline).", "Este dispositivo é Apple Silicon. Você pode executar a transcrição e a tradução totalmente no dispositivo (offline).", "Это устройство на Apple Silicon. Вы можете выполнять транскрипцию и перевод полностью на устройстве офлайн.", "此设备为 Apple Silicon。你可以完全在本机（离线）运行转录和翻译。", "このデバイスはApple Siliconです。文字起こしと翻訳を完全にオフラインでデバイス上で実行できます。", "이 기기는 Apple Silicon입니다. 전사와 번역을 기기에서 완전히 오프라인으로 실행할 수 있습니다."],
  ["modeApi", "API (Groq)", "API (Groq)", "API (Groq)", "API (Groq)", "API (Groq)", "API (Groq)", "API (Groq)", "API (Groq)", "API（Groq）", "API（Groq）", "API(Groq)"],
  ["modeLocal", "Lokal (cihazda)", "Local (on-device)", "Lokal (auf dem Gerät)", "Local (sur l'appareil)", "Local (en el dispositivo)", "Locale (sul dispositivo)", "Local (no dispositivo)", "Локально (на устройстве)", "本地（设备端）", "ローカル（端末上）", "로컬(기기 내)"],
  ["apiKeyLabel", "Groq API anahtarı", "Groq API key", "Groq-API-Schlüssel", "Clé API Groq", "Clave API de Groq", "Chiave API Groq", "Chave de API Groq", "API-ключ Groq", "Groq API 密钥", "Groq APIキー", "Groq API 키"],
  ["apiKeyHint", "Özet ve başlıklandırma her modda; API modunda ise transkript ve çeviri de bu anahtarı kullanır. Tarayıcında saklanır, sunucuya kaydedilmez.", "Used for summaries and titling in every mode; in API mode, transcription and translation use this key too. Stored in your browser, never on our server.", "Wird in jedem Modus für Zusammenfassungen und Titel verwendet; im API-Modus nutzen auch Transkription und Übersetzung diesen Schlüssel. In deinem Browser gespeichert, nie auf dem Server.", "Utilisée pour les résumés et les titres dans tous les modes ; en mode API, la transcription et la traduction utilisent aussi cette clé. Stockée dans votre navigateur, jamais sur le serveur.", "Se usa para resúmenes y títulos en todos los modos; en modo API, la transcripción y la traducción también usan esta clave. Se guarda en tu navegador, nunca en el servidor.", "Usata per riepiloghi e titoli in ogni modalità; in modalità API, anche trascrizione e traduzione usano questa chiave. Salvata nel tuo browser, mai sul server.", "Usada para resumos e títulos em todos os modos; no modo API, a transcrição e a tradução também usam esta chave. Armazenada no seu navegador, nunca no servidor.", "Используется для резюме и заголовков в любом режиме; в режиме API транскрипция и перевод тоже используют этот ключ. Хранится в браузере, не на сервере.", "在任何模式下都用于摘要和标题生成；在 API 模式下，转录和翻译也会使用此密钥。仅保存在浏览器中，不会发送到服务器。", "どのモードでも要約とタイトル生成に使用され、APIモードでは文字起こしと翻訳にもこのキーが使われます。ブラウザに保存され、サーバーには送信されません。", "모든 모드에서 요약 및 제목 생성에 사용되며, API 모드에서는 전사와 번역에도 이 키가 사용됩니다. 브라우저에 저장되며 서버에는 저장되지 않습니다."],
  ["showBtn", "Göster", "Show", "Anzeigen", "Afficher", "Mostrar", "Mostra", "Mostrar", "Показать", "显示", "表示", "표시"],
  ["hideBtn", "Gizle", "Hide", "Verbergen", "Masquer", "Ocultar", "Nascondi", "Ocultar", "Скрыть", "隐藏", "非表示", "숨기기"],
  ["freeKeyLink", "Ücretsiz Groq anahtarı al →", "Get a free Groq key →", "Kostenlosen Groq-Schlüssel holen →", "Obtenir une clé Groq gratuite →", "Obtener una clave Groq gratis →", "Ottieni una chiave Groq gratuita →", "Obter uma chave Groq gratuita →", "Получить бесплатный ключ Groq →", "获取免费的 Groq 密钥 →", "無料のGroqキーを取得 →", "무료 Groq 키 받기 →"],
  ["saveBtn", "Kaydet", "Save", "Speichern", "Enregistrer", "Guardar", "Salva", "Salvar", "Сохранить", "保存", "保存", "저장"],
  ["savedStatus", "Kaydedildi ✓", "Saved ✓", "Gespeichert ✓", "Enregistré ✓", "Guardado ✓", "Salvato ✓", "Salvo ✓", "Сохранено ✓", "已保存 ✓", "保存しました ✓", "저장됨 ✓"],
  ["downloadTitle", "Lokal model hazırlanıyor", "Preparing local model", "Lokales Modell wird vorbereitet", "Préparation du modèle local", "Preparando el modelo local", "Preparazione del modello locale", "Preparando o modelo local", "Подготовка локальной модели", "正在准备本地模型", "ローカルモデルを準備中", "로컬 모델 준비 중"],
  ["downloadHintDefault", "Whisper modeli (~824 MB) cihazına indiriliyor. Bu işlem yalnızca ilk kullanımda yapılır.", "The Whisper model (~824 MB) is downloading to your device. This only happens the first time.", "Das Whisper-Modell (~824 MB) wird auf dein Gerät heruntergeladen. Dies geschieht nur beim ersten Mal.", "Le modèle Whisper (~824 Mo) se télécharge sur votre appareil. Cela n'arrive qu'une seule fois.", "El modelo Whisper (~824 MB) se está descargando en tu dispositivo. Esto solo ocurre la primera vez.", "Il modello Whisper (~824 MB) si sta scaricando sul tuo dispositivo. Questo avviene solo la prima volta.", "O modelo Whisper (~824 MB) está sendo baixado para o seu dispositivo. Isso acontece apenas na primeira vez.", "Модель Whisper (~824 МБ) загружается на ваше устройство. Это происходит только один раз.", "Whisper 模型（约 824 MB）正在下载到你的设备。此过程仅在首次使用时进行。", "Whisperモデル（約824MB）を端末にダウンロード中です。これは初回のみ行われます。", "Whisper 모델(~824MB)을 기기에 다운로드하는 중입니다. 이 작업은 처음 한 번만 수행됩니다."],
  ["downloadErrorPrefix", "İndirme hatası: ", "Download error: ", "Downloadfehler: ", "Erreur de téléchargement : ", "Error de descarga: ", "Errore di download: ", "Erro de download: ", "Ошибка загрузки: ", "下载错误：", "ダウンロードエラー：", "다운로드 오류: "],
  ["downloadUnknownError", "bilinmeyen hata", "unknown error", "unbekannter Fehler", "erreur inconnue", "error desconocido", "errore sconosciuto", "erro desconhecido", "неизвестная ошибка", "未知错误", "不明なエラー", "알 수 없는 오류"],
  ["dismissBtn", "Arka planda devam etsin", "Continue in background", "Im Hintergrund fortsetzen", "Continuer en arrière-plan", "Continuar en segundo plano", "Continua in background", "Continuar em segundo plano", "Продолжить в фоне", "后台继续", "バックグラウンドで続行", "백그라운드에서 계속"],
  ["retryBtn", "Tekrar dene", "Retry", "Erneut versuchen", "Réessayer", "Reintentar", "Riprova", "Tentar novamente", "Повторить", "重试", "再試行", "다시 시도"],
  ["historyTitle", "Geçmiş", "History", "Verlauf", "Historique", "Historial", "Cronologia", "Histórico", "История", "历史记录", "履歴", "기록"],
  ["heroTagline", "Konuş, anında yazıya dönüşsün.", "Speak, and watch it become text instantly.", "Sprich, und es wird sofort zu Text.", "Parlez, et voyez-le se transformer instantanément en texte.", "Habla, y velo convertirse en texto al instante.", "Parla, e guardalo trasformarsi in testo all'istante.", "Fale, e veja isso virar texto instantaneamente.", "Говорите — и это мгновенно превращается в текст.", "开口说话，即刻转为文字。", "話すだけで、瞬時にテキストに。", "말하면 즉시 텍스트로 변환됩니다."],
  ["appendBannerText", `"<strong>{title}</strong>" kaydına ses ekleniyor. Aşağıdan kaydı yap ya da dosya yükle, otomatik olarak bu kayda eklenecek.`, `Adding audio to "<strong>{title}</strong>". Record or upload a file below and it will be added to this recording automatically.`, `Audio wird zu „<strong>{title}</strong>" hinzugefügt. Nimm unten auf oder lade eine Datei hoch — sie wird automatisch hinzugefügt.`, `Ajout audio à « <strong>{title}</strong> ». Enregistrez ou importez un fichier ci-dessous, il sera automatiquement ajouté.`, `Añadiendo audio a "<strong>{title}</strong>". Graba o sube un archivo abajo y se añadirá automáticamente.`, `Aggiunta audio a "<strong>{title}</strong>". Registra o carica un file qui sotto: verrà aggiunto automaticamente.`, `Adicionando áudio a "<strong>{title}</strong>". Grave ou envie um arquivo abaixo e será adicionado automaticamente.`, `Добавление аудио к «<strong>{title}</strong>». Запишите или загрузите файл ниже — он будет добавлен автоматически.`, `正在为"<strong>{title}</strong>"添加音频。在下方录音或上传文件，将自动添加到此记录。`, `「<strong>{title}</strong>」に音声を追加中です。下で録音するかファイルをアップロードすると自動的に追加されます。`, `"<strong>{title}</strong>"에 오디오를 추가하는 중입니다. 아래에서 녹음하거나 파일을 업로드하면 자동으로 추가됩니다.`],
  ["cancelBtn", "İptal", "Cancel", "Abbrechen", "Annuler", "Cancelar", "Annulla", "Cancelar", "Отмена", "取消", "キャンセル", "취소"],
  ["tabMic", "Mikrofon", "Microphone", "Mikrofon", "Microphone", "Micrófono", "Microfono", "Microfone", "Микрофон", "麦克风", "マイク", "마이크"],
  ["tabUpload", "Dosya Yükle", "Upload File", "Datei hochladen", "Importer un fichier", "Subir archivo", "Carica file", "Enviar arquivo", "Загрузить файл", "上传文件", "ファイルをアップロード", "파일 업로드"],
  ["tabTabAudio", "Sekme Dinle", "Listen to Tab", "Tab abhören", "Écouter l'onglet", "Escuchar pestaña", "Ascolta scheda", "Ouvir aba", "Слушать вкладку", "收听标签页", "タブを聴く", "탭 듣기"],
  ["recordBtnAria", "Kaydı başlat/durdur", "Start/stop recording", "Aufnahme starten/stoppen", "Démarrer/arrêter l'enregistrement", "Iniciar/detener grabación", "Avvia/ferma registrazione", "Iniciar/parar gravação", "Начать/остановить запись", "开始/停止录音", "録音の開始/停止", "녹음 시작/중지"],
  ["recordHintIdle", "Kaydı başlatmak için tıkla", "Click to start recording", "Klicken, um die Aufnahme zu starten", "Cliquez pour démarrer l'enregistrement", "Haz clic para empezar a grabar", "Clicca per iniziare la registrazione", "Clique para iniciar a gravação", "Нажмите, чтобы начать запись", "点击开始录音", "クリックして録音開始", "클릭하여 녹음 시작"],
  ["recordHintRecording", "Durdurmak için tıkla", "Click to stop", "Klicken, um zu stoppen", "Cliquez pour arrêter", "Haz clic para detener", "Clicca per fermare", "Clique para parar", "Нажмите, чтобы остановить", "点击停止", "クリックして停止", "클릭하여 중지"],
  ["dropzoneText", "Ses dosyasını buraya sürükle ya da seç", "Drag an audio file here or click to choose", "Audiodatei hierher ziehen oder auswählen", "Glissez un fichier audio ici ou cliquez pour choisir", "Arrastra un archivo de audio aquí o haz clic para elegir", "Trascina un file audio qui o clicca per selezionarlo", "Arraste um arquivo de áudio aqui ou clique para escolher", "Перетащите аудиофайл сюда или нажмите, чтобы выбрать", "将音频文件拖到此处或点击选择", "音声ファイルをここにドラッグするか、クリックして選択", "오디오 파일을 여기로 드래그하거나 클릭하여 선택"],
  ["tabAudioNotice", `Dinleme sırasında bu sekmeyi <strong>kapatma</strong> ve paylaşımı durdurma — aksi halde kayıt kesilir. Açılan paylaşım penceresinde <strong>"Chrome Sekmesi"</strong>ni seç, dinlemek istediğin sekmeyi işaretle ve <strong>"Sekme sesini paylaş"</strong> kutusunun işaretli olduğundan emin ol.`, `Don't <strong>close</strong> this tab or stop sharing while listening — otherwise the recording will cut off. In the share dialog, choose <strong>"Chrome Tab"</strong>, select the tab, and make sure <strong>"Share tab audio"</strong> is checked.`, `<strong>Schließe</strong> diesen Tab während des Zuhörens nicht und beende die Freigabe nicht — sonst wird die Aufnahme unterbrochen. Wähle <strong>„Chrome-Tab"</strong>, markiere den Tab und stelle sicher, dass <strong>„Tab-Audio freigeben"</strong> aktiviert ist.`, `Ne <strong>fermez pas</strong> cet onglet et n'arrêtez pas le partage pendant l'écoute — sinon l'enregistrement sera coupé. Choisissez <strong>« Onglet Chrome »</strong>, sélectionnez l'onglet et cochez <strong>« Partager l'audio de l'onglet »</strong>.`, `No <strong>cierres</strong> esta pestaña ni detengas el uso compartido mientras escuchas — la grabación se cortará. Elige <strong>"Pestaña de Chrome"</strong>, selecciona la pestaña y marca <strong>"Compartir audio de la pestaña"</strong>.`, `Non <strong>chiudere</strong> questa scheda né interrompere la condivisione durante l'ascolto — la registrazione verrà interrotta. Scegli <strong>"Scheda Chrome"</strong>, seleziona la scheda e seleziona <strong>"Condividi audio scheda"</strong>.`, `Não <strong>feche</strong> esta aba nem pare o compartilhamento durante a escuta — a gravação será interrompida. Escolha <strong>"Aba do Chrome"</strong>, selecione a aba e marque <strong>"Compartilhar áudio da aba"</strong>.`, `Не <strong>закрывайте</strong> эту вкладку и не останавливайте показ во время прослушивания — запись прервётся. Выберите <strong>«Вкладка Chrome»</strong>, отметьте вкладку и включите <strong>«Транслировать звук вкладки»</strong>.`, `收听期间请勿<strong>关闭</strong>此标签页或停止共享——否则录音会中断。请选择<strong>"Chrome 标签页"</strong>，勾选要收听的标签页，并确保<strong>"共享标签页音频"</strong>已勾选。`, `聴取中はこのタブを<strong>閉じたり</strong>共有を停止したりしないでください——録音が中断されます。<strong>「Chromeタブ」</strong>を選び、タブを選択し、<strong>「タブの音声を共有」</strong>にチェックを入れてください。`, `청취 중에는 이 탭을 <strong>닫거나</strong> 공유를 중지하지 마세요 — 녹음이 중단됩니다. <strong>"Chrome 탭"</strong>을 선택하고 탭을 선택한 다음 <strong>"탭 오디오 공유"</strong>를 체크하세요.`],
  ["tabRecordBtnAria", "Sekme dinlemeyi başlat/durdur", "Start/stop listening to tab", "Tab-Wiedergabe starten/stoppen", "Démarrer/arrêter l'écoute de l'onglet", "Iniciar/detener escucha de pestaña", "Avvia/ferma ascolto scheda", "Iniciar/parar escuta da aba", "Начать/остановить прослушивание вкладки", "开始/停止收听标签页", "タブの聴取を開始/停止", "탭 듣기 시작/중지"],
  ["tabRecordHintIdle", "Dinlemeyi başlatmak için tıkla", "Click to start listening", "Klicken, um das Zuhören zu starten", "Cliquez pour commencer à écouter", "Haz clic para empezar a escuchar", "Clicca per iniziare ad ascoltare", "Clique para começar a ouvir", "Нажмите, чтобы начать прослушивание", "点击开始收听", "クリックして聴取開始", "클릭하여 듣기 시작"],
  ["tabRecordHintRecording", "Dinlemeyi durdurmak için tıkla", "Click to stop listening", "Klicken, um das Zuhören zu stoppen", "Cliquez pour arrêter d'écouter", "Haz clic para dejar de escuchar", "Clicca per fermare l'ascolto", "Clique para parar de ouvir", "Нажмите, чтобы остановить прослушивание", "点击停止收听", "クリックして聴取停止", "클릭하여 듣기 중지"],
  ["transcriptHeading", "Transkript", "Transcript", "Transkript", "Transcription", "Transcripción", "Trascrizione", "Transcrição", "Транскрипт", "转录文本", "文字起こし", "전사 텍스트"],
  ["langPillLabel", "Dil", "Language", "Sprache", "Langue", "Idioma", "Lingua", "Idioma", "Язык", "语言", "言語", "언어"],
  ["selectPlaceholder", "Seç…", "Select…", "Auswählen…", "Choisir…", "Seleccionar…", "Seleziona…", "Selecionar…", "Выбрать…", "选择…", "選択…", "선택…"],
  ["translateBtn", "Çevir", "Translate", "Übersetzen", "Traduire", "Traducir", "Traduci", "Traduzir", "Перевести", "翻译", "翻訳", "번역"],
  ["summarizeBtn", "Özetle", "Summarize", "Zusammenfassen", "Résumer", "Resumir", "Riassumi", "Resumir", "Резюмировать", "总结", "要約", "요약"],
  ["polishBtn", "Başlıklandır & İyileştir", "Title & Polish", "Titel & Verbessern", "Titrer et améliorer", "Titular y mejorar", "Titola e migliora", "Titular e aprimorar", "Заголовок и улучшение", "生成标题并润色", "タイトル生成＆推敲", "제목 및 다듬기"],
  ["translationHeading", "Çeviri", "Translation", "Übersetzung", "Traduction", "Traducción", "Traduzione", "Tradução", "Перевод", "翻译", "翻訳", "번역"],
  ["summaryBadge", "✦ Özet", "✦ Summary", "✦ Zusammenfassung", "✦ Résumé", "✦ Resumen", "✦ Riepilogo", "✦ Resumo", "✦ Резюме", "✦ 摘要", "✦ 要約", "✦ 요약"],
  ["polishBadge", "✎ İyileştirilmiş İçerik", "✎ Polished Content", "✎ Überarbeiteter Inhalt", "✎ Contenu amélioré", "✎ Contenido mejorado", "✎ Contenuto migliorato", "✎ Conteúdo aprimorado", "✎ Улучшенный текст", "✎ 润色内容", "✎ 推敲済みコンテンツ", "✎ 다듬어진 콘텐츠"],
  ["statusTranscribing", "Transkript oluşturuluyor…", "Generating transcript…", "Transkript wird erstellt…", "Génération de la transcription…", "Generando transcripción…", "Generazione trascrizione…", "Gerando transcrição…", "Создание транскрипта…", "正在生成转录文本…", "文字起こしを生成中…", "전사 생성 중…"],
  ["statusDone", "Tamamlandı.", "Done.", "Fertig.", "Terminé.", "Listo.", "Fatto.", "Concluído.", "Готово.", "完成。", "完了しました。", "완료되었습니다."],
  ["statusServerError", "Sunucu hatası ({status})", "Server error ({status})", "Serverfehler ({status})", "Erreur serveur ({status})", "Error del servidor ({status})", "Errore del server ({status})", "Erro no servidor ({status})", "Ошибка сервера ({status})", "服务器错误（{status}）", "サーバーエラー（{status}）", "서버 오류({status})"],
  ["statusGenericError", "Bir hata oluştu.", "An error occurred.", "Ein Fehler ist aufgetreten.", "Une erreur s'est produite.", "Se produjo un error.", "Si è verificato un errore.", "Ocorreu um erro.", "Произошла ошибка.", "发生了错误。", "エラーが発生しました。", "오류가 발생했습니다."],
  ["statusExportError", "Dışa aktarma hatası ({status})", "Export error ({status})", "Exportfehler ({status})", "Erreur d'exportation ({status})", "Error de exportación ({status})", "Errore di esportazione ({status})", "Erro de exportação ({status})", "Ошибка экспорта ({status})", "导出错误（{status}）", "エクスポートエラー（{status}）", "내보내기 오류({status})"],
  ["statusExportErrorGeneric", "Dışa aktarma hatası.", "Export error.", "Exportfehler.", "Erreur d'exportation.", "Error de exportación.", "Errore di esportazione.", "Erro de exportação.", "Ошибка экспорта.", "导出错误。", "エクスポートエラー。", "내보내기 오류."],
  ["statusPickTargetLang", "Önce bir hedef dil seç.", "Choose a target language first.", "Wähle zuerst eine Zielsprache.", "Choisissez d'abord une langue cible.", "Elige primero un idioma de destino.", "Scegli prima una lingua di destinazione.", "Escolha primeiro um idioma de destino.", "Сначала выберите целевой язык.", "请先选择目标语言。", "まず対象の言語を選択してください。", "먼저 대상 언어를 선택하세요."],
  ["statusAlreadyThisLang", "Metin zaten bu dilde.", "The text is already in this language.", "Der Text ist bereits in dieser Sprache.", "Le texte est déjà dans cette langue.", "El texto ya está en este idioma.", "Il testo è già in questa lingua.", "O texto já está neste idioma.", "Текст уже на этом языке.", "文本已经是该语言。", "テキストはすでにこの言語です。", "텍스트가 이미 이 언어입니다."],
  ["statusTranslating", "Çeviriliyor…", "Translating…", "Wird übersetzt…", "Traduction en cours…", "Traduciendo…", "Traduzione in corso…", "Traduzindo…", "Перевод…", "正在翻译…", "翻訳中…", "번역 중…"],
  ["statusTranslateReady", "Çeviri hazır.", "Translation ready.", "Übersetzung ist fertig.", "Traduction prête.", "Traducción lista.", "Traduzione pronta.", "Tradução pronta.", "Перевод готов.", "翻译已完成。", "翻訳が完了しました。", "번역이 완료되었습니다."],
  ["statusTranslateError", "Çeviri hatası.", "Translation error.", "Übersetzungsfehler.", "Erreur de traduction.", "Error de traducción.", "Errore di traduzione.", "Erro de tradução.", "Ошибка перевода.", "翻译错误。", "翻訳エラー。", "번역 오류."],
  ["statusSummarizing", "Özet oluşturuluyor…", "Generating summary…", "Zusammenfassung wird erstellt…", "Génération du résumé…", "Generando resumen…", "Generazione riepilogo…", "Gerando resumo…", "Создание резюме…", "正在生成摘要…", "要約を生成中…", "요약 생성 중…"],
  ["statusSummaryReady", "Özet hazır.", "Summary ready.", "Zusammenfassung ist fertig.", "Résumé prêt.", "Resumen listo.", "Riepilogo pronto.", "Resumo pronto.", "Резюме готово.", "摘要已完成。", "要約が完了しました。", "요약이 완료되었습니다."],
  ["statusSummaryError", "Özetleme hatası.", "Summarization error.", "Fehler bei der Zusammenfassung.", "Erreur de résumé.", "Error al resumir.", "Errore di riepilogo.", "Erro ao resumir.", "Ошибка резюмирования.", "摘要生成错误。", "要約エラー。", "요약 오류."],
  ["statusPolishing", "İçerik iyileştiriliyor…", "Polishing content…", "Inhalt wird überarbeitet…", "Amélioration du contenu…", "Mejorando el contenido…", "Miglioramento del contenuto…", "Aprimorando o conteúdo…", "Улучшение текста…", "正在润色内容…", "コンテンツを推敲中…", "콘텐츠 다듬는 중…"],
  ["statusPolishReady", "İyileştirilmiş içerik hazır.", "Polished content ready.", "Überarbeiteter Inhalt ist fertig.", "Contenu amélioré prêt.", "Contenido mejorado listo.", "Contenuto migliorato pronto.", "Conteúdo aprimorado pronto.", "Улучшенный текст готов.", "润色内容已完成。", "推敲済みコンテンツが完了しました。", "다듬어진 콘텐츠가 완료되었습니다."],
  ["statusPolishError", "İyileştirme hatası.", "Polishing error.", "Fehler bei der Überarbeitung.", "Erreur d'amélioration.", "Error al mejorar.", "Errore di miglioramento.", "Erro ao aprimorar.", "Ошибка улучшения.", "润色错误。", "推敲エラー。", "다듬기 오류."],
  ["historyEmptyText", "Henüz kayıtlı bir transkript yok. Bir kayıt yaptığında burada görünecek.", "No saved transcripts yet. They'll appear here once you make a recording.", "Noch keine gespeicherten Transkripte. Sie erscheinen hier nach einer Aufnahme.", "Aucune transcription enregistrée. Elles apparaîtront ici après un enregistrement.", "Aún no hay transcripciones guardadas. Aparecerán aquí tras una grabación.", "Nessuna trascrizione salvata ancora. Appariranno qui dopo una registrazione.", "Ainda não há transcrições salvas. Aparecerão aqui após uma gravação.", "Пока нет сохранённых транскриптов. Они появятся здесь после записи.", "尚无已保存的转录文本。录制后将显示在此处。", "保存された文字起こしはまだありません。録音するとここに表示されます。", "저장된 전사가 아직 없습니다. 녹음하면 여기에 표시됩니다."],
  ["historyDefaultTitle", "Kayıt", "Recording", "Aufnahme", "Enregistrement", "Grabación", "Registrazione", "Gravação", "Запись", "记录", "記録", "기록"],
  ["loadBtn", "Yükle", "Load", "Laden", "Charger", "Cargar", "Carica", "Carregar", "Загрузить", "加载", "読み込む", "불러오기"],
  ["appendBtn", "Ses Ekle", "Add Audio", "Audio hinzufügen", "Ajouter de l'audio", "Añadir audio", "Aggiungi audio", "Adicionar áudio", "Добавить аудио", "添加音频", "音声を追加", "오디오 추가"],
  ["deleteBtn", "Sil", "Delete", "Löschen", "Supprimer", "Eliminar", "Elimina", "Excluir", "Удалить", "删除", "削除", "삭제"],
  ["deleteConfirm", `"{title}" kaydını silmek istediğine emin misin?`, `Are you sure you want to delete "{title}"?`, `Möchtest du „{title}" wirklich löschen?`, `Voulez-vous vraiment supprimer « {title} » ?`, `¿Seguro que quieres eliminar "{title}"?`, `Sei sicuro di voler eliminare "{title}"?`, `Tem certeza de que deseja excluir "{title}"?`, `Вы уверены, что хотите удалить «{title}»?`, `确定要删除"{title}"吗？`, `「{title}」を削除してもよろしいですか？`, `"{title}"을(를) 삭제하시겠습니까?`],
  ["statusRecordLoaded", "Kayıt yüklendi.", "Recording loaded.", "Aufnahme geladen.", "Enregistrement chargé.", "Grabación cargada.", "Registrazione caricata.", "Gravação carregada.", "Запись загружена.", "记录已加载。", "記録を読み込みました。", "기록을 불러왔습니다."],
  ["statusAppendNotFound", "Eklenecek kayıt bulunamadı.", "The recording to append to was not found.", "Die Aufnahme zum Anhängen wurde nicht gefunden.", "L'enregistrement auquel ajouter n'a pas été trouvé.", "No se encontró la grabación a la que añadir.", "Registrazione a cui aggiungere non trovata.", "A gravação para adicionar não foi encontrada.", "Запись для добавления не найдена.", "未找到要追加的记录。", "追加先の記録が見つかりません。", "추가할 기록을 찾을 수 없습니다."],
  ["statusAppendDone", "Ses eklendi, kayıt güncellendi.", "Audio added, recording updated.", "Audio hinzugefügt, Aufnahme aktualisiert.", "Audio ajouté, enregistrement mis à jour.", "Audio añadido, grabación actualizada.", "Audio aggiunto, registrazione aggiornata.", "Áudio adicionado, gravação atualizada.", "Аудио добавлено, запись обновлена.", "音频已添加，记录已更新。", "音声を追加し、記録を更新しました。", "오디오가 추가되어 기록이 업데이트되었습니다."],
  ["statusAppendPrompt", `"{title}" kaydına ses eklemek için kaydı yap ya da dosya yükle.`, `Record or upload a file to add audio to "{title}".`, `Nimm auf oder lade eine Datei hoch, um Audio zu „{title}" hinzuzufügen.`, `Enregistrez ou importez un fichier pour ajouter de l'audio à « {title} ».`, `Graba o sube un archivo para añadir audio a "{title}".`, `Registra o carica un file per aggiungere audio a "{title}".`, `Grave ou envie um arquivo para adicionar áudio a "{title}".`, `Запишите или загрузите файл, чтобы добавить аудио к «{title}».`, `录音或上传文件以向"{title}"添加音频。`, `「{title}」に音声を追加するには、録音するかファイルをアップロードしてください。`, `"{title}"에 오디오를 추가하려면 녹음하거나 파일을 업로드하세요.`],
  ["micAccessError", "Mikrofona erişilemedi: ", "Could not access microphone: ", "Kein Zugriff auf Mikrofon: ", "Impossible d'accéder au microphone : ", "No se pudo acceder al micrófono: ", "Impossibile accedere al microfono: ", "Não foi possível acessar o microfone: ", "Не удалось получить доступ к микрофону: ", "无法访问麦克风：", "マイクにアクセスできませんでした：", "마이크에 액세스할 수 없습니다: "],
  ["tabShareError", "Sekme paylaşımı başlatılamadı: ", "Could not start tab sharing: ", "Tab-Freigabe konnte nicht gestartet werden: ", "Impossible de démarrer le partage d'onglet : ", "No se pudo iniciar el uso compartido de la pestaña: ", "Impossibile avviare la condivisione della scheda: ", "Não foi possível iniciar o compartilhamento da aba: ", "Не удалось начать демонстрацию вкладки: ", "无法启动标签页共享：", "タブの共有を開始できませんでした：", "탭 공유를 시작할 수 없습니다: "],
  ["tabNoAudioError", `Seçilen kaynakta ses paylaşılmadı. Paylaşım penceresinde "Chrome Sekmesi"ni seçip "Sekme sesini paylaş" kutusunu işaretle.`, `No audio was shared from the selected source. In the share dialog, choose "Chrome Tab" and check "Share tab audio".`, `Aus der ausgewählten Quelle wurde kein Audio freigegeben. Wähle „Chrome-Tab" und aktiviere „Tab-Audio freigeben".`, `Aucun audio partagé depuis la source sélectionnée. Choisissez « Onglet Chrome » et cochez « Partager l'audio de l'onglet ».`, `No se compartió audio desde la fuente seleccionada. Elige "Pestaña de Chrome" y marca "Compartir audio de la pestaña".`, `Nessun audio condiviso dalla fonte selezionata. Scegli "Scheda Chrome" e seleziona "Condividi audio scheda".`, `Nenhum áudio foi compartilhado da fonte selecionada. Escolha "Aba do Chrome" e marque "Compartilhar áudio da aba".`, `Из выбранного источника не было передано аудио. Выберите «Вкладка Chrome» и отметьте «Транслировать звук вкладки».`, `所选来源未共享音频。请选择"Chrome 标签页"并勾选"共享标签页音频"。`, `選択したソースから音声が共有されませんでした。「Chromeタブ」を選び、「タブの音声を共有」にチェックを入れてください。`, `선택한 소스에서 오디오가 공유되지 않았습니다. "Chrome 탭"을 선택하고 "탭 오디오 공유"를 체크하세요.`],
];
const I18N = {};
I18N_LANGS.forEach((lang) => { I18N[lang] = {}; });
I18N_ROWS.forEach(([key, ...vals]) => {
  I18N_LANGS.forEach((lang, i) => { I18N[lang][key] = vals[i]; });
});

const UiLang = {
  get value() { return localStorage.getItem("uiLang") || "tr"; },
  set value(v) { localStorage.setItem("uiLang", v); },
};

function t(key, vars) {
  let str = (I18N[UiLang.value] && I18N[UiLang.value][key]) || I18N.tr[key] || key;
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => { str = str.replace(`{${k}}`, v); });
  }
  return str;
}

function applyI18n() {
  document.documentElement.lang = UiLang.value;
  document.title = t("pageTitle");
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
  const codeEl = document.getElementById("langBtnCode");
  if (codeEl) codeEl.textContent = UiLang.value.toUpperCase();
  // Kayıt/dinleme düğmelerinin durumsal (idle/recording) ipucu metinleri data-i18n ile
  // tutulmuyor (state'e göre JS değiştiriyor) — dil değişince o an aktif duruma göre tazelenir.
  const recordHintEl = document.getElementById("recordHint");
  if (recordHintEl && recorderElIsRecording()) recordHintEl.textContent = t("recordHintRecording");
  const tabRecordHintEl = document.getElementById("tabRecordHint");
  if (tabRecordHintEl && tabRecorderElIsRecording()) tabRecordHintEl.textContent = t("tabRecordHintRecording");
  // Geçmiş listesi ve ek ses banner'ı dinamik olarak oluşturulur — açıksa yeniden çizilir.
  if (typeof renderHistoryList === "function" && !historyOverlay.classList.contains("is-hidden")) renderHistoryList();
  if (typeof appendTargetId !== "undefined" && appendTargetId) refreshAppendBannerText();
}

function recorderElIsRecording() {
  const el = document.getElementById("recorder");
  return Boolean(el && el.classList.contains("is-recording"));
}
function tabRecorderElIsRecording() {
  const el = document.getElementById("tabRecorder");
  return Boolean(el && el.classList.contains("is-recording"));
}

const langBtn = document.getElementById("langBtn");
const langMenu = document.getElementById("langMenu");

function renderLangMenu() {
  langMenu.innerHTML = "";
  I18N_LANGS.forEach((lang) => {
    const opt = document.createElement("button");
    opt.type = "button";
    opt.className = "lang-menu__opt" + (lang === UiLang.value ? " is-active" : "");
    opt.textContent = LANG_AUTONYMS[lang];
    opt.addEventListener("click", () => {
      UiLang.value = lang;
      applyI18n();
      closeLangMenu();
    });
    langMenu.appendChild(opt);
  });
}

function openLangMenu() {
  renderLangMenu();
  langMenu.classList.remove("is-hidden");
  langBtn.setAttribute("aria-expanded", "true");
}
function closeLangMenu() {
  langMenu.classList.add("is-hidden");
  langBtn.setAttribute("aria-expanded", "false");
}
langBtn.addEventListener("click", () => {
  if (langMenu.classList.contains("is-hidden")) openLangMenu();
  else closeLangMenu();
});
document.addEventListener("click", (e) => {
  if (!langMenu.classList.contains("is-hidden") && !e.target.closest(".lang-switcher")) closeLangMenu();
});

// --- Theme (browser-independent, persisted) ---
const themeToggle = document.getElementById("themeToggle");
const rootEl = document.documentElement;
(function initTheme() {
  const saved = localStorage.getItem("theme");
  const initial = saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  rootEl.setAttribute("data-theme", initial);
})();
themeToggle.addEventListener("click", () => {
  const next = rootEl.getAttribute("data-theme") === "dark" ? "light" : "dark";
  rootEl.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
});

// --- Ayarlar: çalışma modu (Lokal/API) + Groq API anahtarı ---
const Settings = {
  appleSilicon: false,
  get mode() {
    // Apple Silicon değilse her zaman API; aksi halde kullanıcı seçimi (varsayılan API).
    if (!this.appleSilicon) return "api";
    return localStorage.getItem("appMode") || "api";
  },
  set mode(v) { localStorage.setItem("appMode", v); },
  get apiKey() { return localStorage.getItem("groqApiKey") || ""; },
  set apiKey(v) {
    if (v) localStorage.setItem("groqApiKey", v);
    else localStorage.removeItem("groqApiKey");
  },
};

const settingsBtn = document.getElementById("settingsBtn");
const settingsOverlay = document.getElementById("settingsOverlay");
const settingsClose = document.getElementById("settingsClose");
const settingsSave = document.getElementById("settingsSave");
const modeSetting = document.getElementById("modeSetting");
const modeSegmented = document.getElementById("modeSegmented");
const apiKeyInput = document.getElementById("apiKeyInput");
const apiKeyToggle = document.getElementById("apiKeyToggle");
const keyStatus = document.getElementById("keyStatus");
const setupBanner = document.getElementById("setupBanner");
const setupBannerBtn = document.getElementById("setupBannerBtn");

let pendingMode = Settings.mode;

function refreshModeSegmented() {
  modeSegmented.querySelectorAll(".segmented__opt").forEach((opt) => {
    opt.classList.toggle("is-active", opt.dataset.mode === pendingMode);
  });
}

function refreshBanner() {
  // Groq anahtarı yoksa ilk-kurulum banner'ını göster (anahtar her modda gerekli olabilir).
  setupBanner.classList.toggle("is-hidden", Boolean(Settings.apiKey));
}

function openSettings() {
  pendingMode = Settings.mode;
  apiKeyInput.value = Settings.apiKey;
  apiKeyInput.type = "password";
  apiKeyToggle.textContent = t("showBtn");
  modeSetting.classList.toggle("is-hidden", !Settings.appleSilicon);
  refreshModeSegmented();
  keyStatus.textContent = "";
  settingsOverlay.classList.remove("is-hidden");
}

function closeSettings() { settingsOverlay.classList.add("is-hidden"); }

settingsBtn.addEventListener("click", openSettings);
settingsClose.addEventListener("click", closeSettings);
settingsOverlay.addEventListener("click", (e) => {
  if (e.target === settingsOverlay) closeSettings();
});
setupBannerBtn.addEventListener("click", openSettings);

modeSegmented.addEventListener("click", (e) => {
  const opt = e.target.closest(".segmented__opt");
  if (!opt) return;
  pendingMode = opt.dataset.mode;
  refreshModeSegmented();
});

apiKeyToggle.addEventListener("click", () => {
  const show = apiKeyInput.type === "password";
  apiKeyInput.type = show ? "text" : "password";
  apiKeyToggle.textContent = show ? t("hideBtn") : t("showBtn");
});

settingsSave.addEventListener("click", () => {
  Settings.mode = pendingMode;
  Settings.apiKey = apiKeyInput.value.trim();
  refreshBanner();
  keyStatus.textContent = t("savedStatus");
  setTimeout(closeSettings, 500);
  if (pendingMode === "local") ensureLocalModelReady();
});

// --- Lokal model indirme popup'ı: Lokal mod seçiliyken ağırlıklar hazır değilse
// /prepare-local'i tetikler ve /download-status'u polling ederek ilerlemeyi gösterir ---
const downloadOverlay = document.getElementById("downloadOverlay");
const downloadProgressFill = document.getElementById("downloadProgressFill");
const downloadPercent = document.getElementById("downloadPercent");
const downloadBytes = document.getElementById("downloadBytes");
const downloadHint = document.getElementById("downloadHint");
const downloadNormalFoot = document.getElementById("downloadNormalFoot");
const downloadErrorFoot = document.getElementById("downloadErrorFoot");
const downloadDismiss = document.getElementById("downloadDismiss");
const downloadRetry = document.getElementById("downloadRetry");

let downloadPollTimer = null;

function stopDownloadPolling() {
  if (downloadPollTimer) {
    clearInterval(downloadPollTimer);
    downloadPollTimer = null;
  }
}

function formatMB(bytes) { return (bytes / (1024 * 1024)).toFixed(0); }

function renderDownloadState(state) {
  if (state.status === "error") {
    downloadHint.textContent = t("downloadErrorPrefix") + (state.error || t("downloadUnknownError"));
    downloadNormalFoot.style.display = "none";
    downloadErrorFoot.style.display = "";
    stopDownloadPolling();
    return;
  }
  downloadHint.textContent = t("downloadHintDefault");
  downloadNormalFoot.style.display = "";
  downloadErrorFoot.style.display = "none";
  const pct = state.progress || 0;
  downloadProgressFill.style.width = `${pct}%`;
  downloadPercent.textContent = `${pct}%`;
  downloadBytes.textContent = state.total_bytes
    ? `${formatMB(state.downloaded_bytes)} / ${formatMB(state.total_bytes)} MB`
    : "";
  if (state.status === "ready") {
    stopDownloadPolling();
    setTimeout(() => downloadOverlay.classList.add("is-hidden"), 400);
  }
}

async function pollDownloadStatus() {
  try {
    const res = await fetch("/download-status");
    renderDownloadState(await res.json());
  } catch { /* ağ hatası: sıradaki pollde tekrar dene */ }
}

async function ensureLocalModelReady() {
  try {
    const res = await fetch("/prepare-local", { method: "POST" });
    const state = await res.json();
    if (state.status === "ready") return; // zaten hazır, popup'a gerek yok
    downloadOverlay.classList.remove("is-hidden");
    renderDownloadState(state);
    stopDownloadPolling();
    downloadPollTimer = setInterval(pollDownloadStatus, 800);
  } catch { /* prepare-local başarısız: /transcribe zaten güvenlik ağı olarak senkron indirir */ }
}

downloadDismiss.addEventListener("click", () => {
  // İndirme sunucuda arka planda devam eder; popup'ı kapatmak onu iptal etmez.
  downloadOverlay.classList.add("is-hidden");
});
downloadRetry.addEventListener("click", ensureLocalModelReady);

// Sunucudan platform bilgisini al -> mod seçicisini gösterip gösterme kararı.
(async function initConfig() {
  try {
    const res = await fetch("/config");
    const cfg = await res.json();
    Settings.appleSilicon = Boolean(cfg.apple_silicon);
  } catch { /* varsayılan: API modu */ }
  refreshBanner();
  // Önceki oturumdan Lokal mod kalıcıysa (localStorage), sayfa yüklenir yüklenmez
  // ağırlıkların hazır olup olmadığını kontrol et — hazır değilse popup göster.
  if (Settings.mode === "local") ensureLocalModelReady();
})();

const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel");
const statusLine = document.getElementById("statusLine");
const resultsSection = document.getElementById("results");
const resultsMainEl = document.getElementById("resultsMain");
const resultsSideEl = document.getElementById("resultsSide");
const fullText = document.getElementById("fullText");
const segmentsEl = document.getElementById("segments");
const detectedLangEl = document.getElementById("detectedLang");
const targetLangSelect = document.getElementById("targetLang");
const translateBtn = document.getElementById("translateBtn");
const diarizeToggle = document.getElementById("diarizeToggle");
const translationBlock = document.getElementById("translationBlock");
const translatedText = document.getElementById("translatedText");
const translatedSegmentsEl = document.getElementById("translatedSegments");
const exportOriginalEl = document.getElementById("exportOriginal");
const exportTranslationEl = document.getElementById("exportTranslation");

const summarizeBtn = document.getElementById("summarizeBtn");
const polishBtn = document.getElementById("polishBtn");
const summaryBlock = document.getElementById("summaryBlock");
const summaryContent = document.getElementById("summaryContent");
const polishBlock = document.getElementById("polishBlock");
const polishContent = document.getElementById("polishContent");
const exportPolishEl = document.getElementById("exportPolish");

const historyBtn = document.getElementById("historyBtn");
const historyOverlay = document.getElementById("historyOverlay");
const historyClose = document.getElementById("historyClose");
const historyListEl = document.getElementById("historyList");
const appendBanner = document.getElementById("appendBanner");
const appendBannerTextEl = document.getElementById("appendBannerText");
const appendBannerCancel = document.getElementById("appendBannerCancel");
let appendBannerRecordTitle = "";
function refreshAppendBannerText() {
  appendBannerTextEl.innerHTML = t("appendBannerText", { title: escapeHtml(appendBannerRecordTitle) });
}

const LANG_NAMES = {
  tr: "Türkçe", en: "İngilizce", de: "Almanca", fr: "Fransızca", es: "İspanyolca",
  it: "İtalyanca", pt: "Portekizce", nl: "Felemenkçe", ru: "Rusça", ar: "Arapça",
  zh: "Çince", ja: "Japonca", ko: "Korece", pl: "Lehçe", sv: "İsveççe", uk: "Ukraynaca",
};

const EXPORT_FORMATS = ["txt", "srt", "vtt", "md", "json"];

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((otherTab) => otherTab.classList.remove("is-active"));
    tab.classList.add("is-active");
    const target = tab.dataset.tab;
    panels.forEach((p) => p.classList.toggle("is-hidden", p.dataset.panel !== target));
  });
});

function setStatus(message, { error = false, loading = false } = {}) {
  statusLine.textContent = message;
  statusLine.classList.toggle("is-error", error);
  statusLine.classList.toggle("is-loading", loading);
}

async function sendForTranscription(blob, filename) {
  setStatus(t("statusTranscribing"), { loading: true });
  if (!appendTargetId) resultsSection.classList.add("is-hidden");

  const formData = new FormData();
  formData.append("file", blob, filename);
  formData.append("diarize", diarizeToggle.checked ? "true" : "false");
  formData.append("mode", Settings.mode);
  if (Settings.apiKey) formData.append("api_key", Settings.apiKey);

  try {
    const res = await fetch("/transcribe", { method: "POST", body: formData });
    if (!res.ok) throw new Error(t("statusServerError", { status: res.status }));
    const data = await res.json();
    if (appendTargetId) {
      appendToHistoryRecord(appendTargetId, data);
    } else {
      renderResults(data);
      currentHistoryId = saveNewHistoryRecord(data);
    }
    setStatus(t("statusDone"));
  } catch (err) {
    setStatus(err.message || t("statusGenericError"), { error: true });
  }
}

function renderSegments(container, segments) {
  container.innerHTML = "";
  (segments || []).forEach((seg) => {
    const row = document.createElement("div");
    row.className = "segment-row";
    const speakerTag = seg.speaker ? `<span class="speaker-tag">${escapeHtml(seg.speaker)}</span>` : "";
    row.innerHTML = `
      <span class="segment-row__time">${formatTime(seg.start)} – ${formatTime(seg.end)}</span>
      <span class="segment-row__text">${speakerTag}${escapeHtml(seg.text)}</span>
    `;
    container.appendChild(row);
  });
}

function renderExportRow(container, getPayload) {
  container.innerHTML = "";
  EXPORT_FORMATS.forEach((format) => {
    const btn = document.createElement("button");
    btn.className = "export-btn";
    btn.textContent = format.toUpperCase();
    btn.addEventListener("click", () => downloadExport(format, getPayload()));
    container.appendChild(btn);
  });
}

async function downloadExport(format, payload) {
  try {
    const res = await fetch("/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format, ...payload }),
    });
    if (!res.ok) throw new Error(t("statusExportError", { status: res.status }));
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transkript.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    setStatus(err.message || t("statusExportErrorGeneric"), { error: true });
  }
}

let currentData = null;

function renderResults(data) {
  currentData = data;
  fullText.value = data.text || "";
  detectedLangEl.textContent = data.language ? (LANG_NAMES[data.language] || data.language) : "";
  renderSegments(segmentsEl, data.segments);
  renderExportRow(exportOriginalEl, () => ({ text: data.text || "", segments: data.segments || [] }));

  // Yeni transkriptte eski AI çıktılarını ve önceki çeviriyi gizle, tek sütuna dön.
  summaryBlock.classList.add("is-hidden");
  polishBlock.classList.add("is-hidden");
  translationBlock.classList.add("is-hidden");
  resultsMainEl.appendChild(translationBlock); // varsayılan konum: transkriptin altında (solda)
  resultsSection.classList.remove("has-ai");
  const hasText = Boolean((data.text || "").trim());
  summarizeBtn.disabled = !hasText;
  polishBtn.disabled = !hasText;
  translateBtn.disabled = !hasText;

  resultsSection.classList.remove("is-hidden");
}

// Özet/polish henüz üretilmemişse çeviri sağ sütuna (AI kutularının yerine), üretilmişse
// transkriptin altına (sol sütuna) yerleşir — istenen davranış: "çeviri sağa, AI üretilince
// çeviri sola AI kutuları sağa" (bkz. CLAUDE.md gotcha #10 devamı).
function hasAiOutput() {
  return !summaryBlock.classList.contains("is-hidden") || !polishBlock.classList.contains("is-hidden");
}

function repositionTranslation() {
  if (hasAiOutput()) {
    resultsMainEl.appendChild(translationBlock);
  } else {
    resultsSideEl.insertBefore(translationBlock, resultsSideEl.firstChild);
  }
}

// --- Çeviri: mevcut transkript üzerinde, seçilen dile göre sonradan tetiklenir ---
translateBtn.addEventListener("click", async () => {
  if (!currentData || !(currentData.segments || []).length) return;
  const target = targetLangSelect.value;
  if (!target) {
    setStatus(t("statusPickTargetLang"), { error: true });
    return;
  }
  if (target === currentData.language) {
    setStatus(t("statusAlreadyThisLang"), { error: true });
    return;
  }
  translateBtn.disabled = true;
  setStatus(t("statusTranslating"), { loading: true });
  try {
    const res = await fetch("/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        segments: currentData.segments,
        source_lang: currentData.language,
        target_lang: target,
        mode: Settings.mode,
        api_key: Settings.apiKey || null,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(detail || t("statusServerError", { status: res.status }));
    }
    const data = await res.json();
    translatedText.value = data.text || "";
    renderSegments(translatedSegmentsEl, data.segments);
    renderExportRow(exportTranslationEl, () => ({
      text: data.text || "",
      segments: data.segments || [],
    }));
    translationBlock.classList.remove("is-hidden");
    repositionTranslation();
    resultsSection.classList.add("has-ai");
    persistCurrentRecord({ translation: { target_lang: target, text: data.text || "", segments: data.segments || [] } });
    setStatus(t("statusTranslateReady"));
  } catch (err) {
    setStatus(err.message || t("statusTranslateError"), { error: true });
  } finally {
    translateBtn.disabled = false;
  }
});

// --- AI tools: summarize & polish ---
async function callLLM(endpoint, key) {
  const text = fullText.value.trim();
  if (!text) return null;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, api_key: Settings.apiKey || null, lang: targetLangSelect.value || null }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || t("statusServerError", { status: res.status }));
  }
  const data = await res.json();
  return data[key];
}

summarizeBtn.addEventListener("click", async () => {
  summarizeBtn.disabled = true;
  setStatus(t("statusSummarizing"), { loading: true });
  try {
    const summary = await callLLM("/summarize", "summary");
    summaryContent.innerHTML = renderMarkdown(summary || "");
    summaryBlock.classList.remove("is-hidden");
    resultsSection.classList.add("has-ai");
    repositionTranslation();
    persistCurrentRecord({ summary: summary || "" });
    setStatus(t("statusSummaryReady"));
  } catch (err) {
    setStatus(err.message || t("statusSummaryError"), { error: true });
  } finally {
    summarizeBtn.disabled = false;
  }
});

polishBtn.addEventListener("click", async () => {
  polishBtn.disabled = true;
  setStatus(t("statusPolishing"), { loading: true });
  try {
    const polished = await callLLM("/polish", "polished");
    polishContent.innerHTML = renderMarkdown(polished || "");
    renderExportRow(exportPolishEl, () => ({ text: polished || "", segments: [] }));
    polishBlock.classList.remove("is-hidden");
    resultsSection.classList.add("has-ai");
    repositionTranslation();
    persistCurrentRecord({ polish: polished || "" });
    setStatus(t("statusPolishReady"));
  } catch (err) {
    setStatus(err.message || t("statusPolishError"), { error: true });
  } finally {
    polishBtn.disabled = false;
  }
});

// --- Geçmiş: localStorage tabanlı kayıt geçmişi (kaydet / yükle / ses ekle / sil) ---
const HISTORY_KEY = "yazbunuHistory";
const HISTORY_MAX = 50; // localStorage şişmesini önlemek için üst sınır

const History = {
  list() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
    catch { return []; }
  },
  save(records) { localStorage.setItem(HISTORY_KEY, JSON.stringify(records)); },
  get(id) { return this.list().find((r) => r.id === id) || null; },
  upsert(record) {
    const records = this.list();
    const idx = records.findIndex((r) => r.id === record.id);
    if (idx >= 0) {
      records[idx] = record;
    } else {
      records.unshift(record);
      if (records.length > HISTORY_MAX) records.length = HISTORY_MAX;
    }
    this.save(records);
  },
  remove(id) { this.save(this.list().filter((r) => r.id !== id)); },
};

const LOCALE_TAGS = {
  tr: "tr-TR", en: "en-US", de: "de-DE", fr: "fr-FR", es: "es-ES",
  it: "it-IT", pt: "pt-PT", ru: "ru-RU", zh: "zh-CN", ja: "ja-JP", ko: "ko-KR",
};

function makeHistoryTitle(text) {
  const trimmed = (text || "").trim().replace(/\s+/g, " ");
  if (!trimmed) return t("historyDefaultTitle");
  return trimmed.length > 46 ? trimmed.slice(0, 46) + "…" : trimmed;
}

let currentHistoryId = null;
let appendTargetId = null;

function renderHistoryList() {
  const records = History.list().sort((a, b) => b.updatedAt - a.updatedAt);
  historyListEl.innerHTML = "";
  if (!records.length) {
    historyListEl.innerHTML = `<div class="history-empty">${t("historyEmptyText")}</div>`;
    return;
  }
  records.forEach((record) => {
    const row = document.createElement("div");
    row.className = "history-item";
    const dateStr = new Date(record.updatedAt).toLocaleString(LOCALE_TAGS[UiLang.value] || "tr-TR", { dateStyle: "medium", timeStyle: "short" });
    const langLabel = record.language ? (LANG_NAMES[record.language] || record.language) : "";
    row.innerHTML = `
      <div class="history-item__main">
        <div class="history-item__title">${escapeHtml(record.title || t("historyDefaultTitle"))}</div>
        <div class="history-item__meta">
          <span>${dateStr}</span>
          ${langLabel ? `<span class="lang-tag">${escapeHtml(langLabel)}</span>` : ""}
        </div>
      </div>
      <div class="history-item__actions">
        <button class="btn btn--ghost btn--sm" data-action="load" type="button">${t("loadBtn")}</button>
        <button class="btn btn--ghost btn--sm" data-action="append" type="button">${t("appendBtn")}</button>
        <button class="btn btn--ghost btn--sm btn--danger" data-action="delete" type="button">${t("deleteBtn")}</button>
      </div>
    `;
    row.querySelector('[data-action="load"]').addEventListener("click", () => loadHistoryRecord(record.id));
    row.querySelector('[data-action="append"]').addEventListener("click", () => startAppendMode(record.id));
    row.querySelector('[data-action="delete"]').addEventListener("click", () => {
      if (confirm(t("deleteConfirm", { title: record.title }))) deleteHistoryRecord(record.id);
    });
    historyListEl.appendChild(row);
  });
}

function openHistory() {
  renderHistoryList();
  historyOverlay.classList.remove("is-hidden");
}
function closeHistory() { historyOverlay.classList.add("is-hidden"); }

historyBtn.addEventListener("click", openHistory);
historyClose.addEventListener("click", closeHistory);
historyOverlay.addEventListener("click", (e) => {
  if (e.target === historyOverlay) closeHistory();
});

// Çeviri/özet/iyileştirme üretildiğinde o an yüklü olan geçmiş kayda yazılır — böylece
// bir kayıt tekrar yüklendiğinde daha önce üretilmiş AI çıktıları da geri gelir.
function persistCurrentRecord(patch) {
  if (!currentHistoryId) return;
  const record = History.get(currentHistoryId);
  if (!record) return;
  Object.assign(record, patch, { updatedAt: Date.now() });
  History.upsert(record);
}

function saveNewHistoryRecord(data) {
  const id = `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  History.upsert({
    id,
    createdAt: now,
    updatedAt: now,
    title: makeHistoryTitle(data.text),
    language: data.language || "",
    text: data.text || "",
    segments: data.segments || [],
    translation: null,
    summary: null,
    polish: null,
  });
  return id;
}

function loadHistoryRecord(id) {
  const record = History.get(id);
  if (!record) return;
  cancelAppendMode();
  currentHistoryId = record.id;

  renderResults({ language: record.language, text: record.text, segments: record.segments });

  if (record.translation) {
    translatedText.value = record.translation.text || "";
    renderSegments(translatedSegmentsEl, record.translation.segments);
    renderExportRow(exportTranslationEl, () => ({
      text: record.translation.text || "",
      segments: record.translation.segments || [],
    }));
    translationBlock.classList.remove("is-hidden");
  }
  if (record.summary) {
    summaryContent.innerHTML = renderMarkdown(record.summary);
    summaryBlock.classList.remove("is-hidden");
    resultsSection.classList.add("has-ai");
  }
  if (record.polish) {
    polishContent.innerHTML = renderMarkdown(record.polish);
    renderExportRow(exportPolishEl, () => ({ text: record.polish || "", segments: [] }));
    polishBlock.classList.remove("is-hidden");
    resultsSection.classList.add("has-ai");
  }
  repositionTranslation();
  closeHistory();
  setStatus(t("statusRecordLoaded"));
}

function deleteHistoryRecord(id) {
  History.remove(id);
  if (currentHistoryId === id) currentHistoryId = null;
  if (appendTargetId === id) cancelAppendMode();
  renderHistoryList();
}

function startAppendMode(id) {
  const record = History.get(id);
  if (!record) return;
  appendTargetId = id;
  appendBannerRecordTitle = record.title || t("historyDefaultTitle");
  refreshAppendBannerText();
  appendBanner.classList.remove("is-hidden");
  closeHistory();
  setStatus(t("statusAppendPrompt", { title: record.title }));
}

function cancelAppendMode() {
  appendTargetId = null;
  appendBanner.classList.add("is-hidden");
}

appendBannerCancel.addEventListener("click", cancelAppendMode);

// Var olan bir kayda yeni ses eklendiğinde: yeni segmentlerin zaman damgaları önceki
// kaydın son segmentinin bitişinden devam edecek şekilde kaydırılır, konuşmacı numaraları
// çakışmasın diye ötelenir. Not: pyannote her transkripsiyonu bağımsız kümelediği için
// "Konuşmacı_1" iki ayrı kayıtta aynı kişi olduğu garanti değildir — bu yalnızca numara
// çakışmasını önler, ses profiliyle eşleştirme yapmaz (bkz. CLAUDE.md gotcha #9, #8).
function appendToHistoryRecord(id, data) {
  const record = History.get(id);
  if (!record) {
    setStatus(t("statusAppendNotFound"), { error: true });
    cancelAppendMode();
    return;
  }

  const gap = 1;
  const offset = record.segments.length ? record.segments[record.segments.length - 1].end + gap : 0;

  const existingSpeakerNums = record.segments
    .map((s) => (s.speaker || "").match(/_(\d+)$/))
    .filter(Boolean)
    .map((m) => parseInt(m[1], 10));
  const speakerOffset = existingSpeakerNums.length ? Math.max(...existingSpeakerNums) : 0;

  const newSegments = (data.segments || []).map((seg) => {
    const shifted = { ...seg, start: seg.start + offset, end: seg.end + offset };
    const m = (seg.speaker || "").match(/^(.*_)(\d+)$/);
    if (m) shifted.speaker = `${m[1]}${parseInt(m[2], 10) + speakerOffset}`;
    return shifted;
  });

  record.segments = [...record.segments, ...newSegments];
  record.text = [record.text, data.text].filter(Boolean).join(" ");
  record.updatedAt = Date.now();
  // Eklenen ses önceki çeviri/özet/iyileştirmeyi geçersiz kılar — kullanıcı isterse tekrar üretir.
  record.translation = null;
  record.summary = null;
  record.polish = null;

  History.upsert(record);
  cancelAppendMode();
  currentHistoryId = record.id;
  renderResults({ language: record.language, text: record.text, segments: record.segments });
  setStatus(t("statusAppendDone"));
}

// --- Minimal Markdown renderer (LLM çıktısı için yeterli: başlık, liste, bold/italik, kod) ---
function renderMarkdown(md) {
  const escaped = escapeHtml(md);
  const lines = escaped.split("\n");
  let html = "";
  let inList = false;

  const inline = (s) =>
    s
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");

  const closeList = () => {
    if (inList) { html += "</ul>"; inList = false; }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }

    if (/^###\s+/.test(line)) { closeList(); html += `<h3>${inline(line.replace(/^###\s+/, ""))}</h3>`; }
    else if (/^##\s+/.test(line)) { closeList(); html += `<h2>${inline(line.replace(/^##\s+/, ""))}</h2>`; }
    else if (/^#\s+/.test(line)) { closeList(); html += `<h1>${inline(line.replace(/^#\s+/, ""))}</h1>`; }
    else if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inline(line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, ""))}</li>`;
    } else {
      closeList();
      html += `<p>${inline(line)}</p>`;
    }
  }
  closeList();
  return html;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// --- Microphone recording + live waveform ---
const recordBtn = document.getElementById("recordBtn");
const recordTimer = document.getElementById("recordTimer");
const recordHint = document.getElementById("recordHint");
const waveformCanvas = document.getElementById("waveform");
const recorderEl = document.getElementById("recorder");

let mediaRecorder = null;
let audioChunks = [];
let timerInterval = null;
let elapsedSeconds = 0;

function roundRect(ctx, x, y, w, h, r) {
  if (w <= 0 || h <= 0) return;
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

// Her kayıt yüzeyi (mikrofon / sekme dinleme) kendi canvas'ına bağlı ayrı bir
// görselleştirici alır — aynı anda yalnızca biri aktif olsa da state paylaşılmasın diye.
function createWaveform(canvas) {
  let audioContext = null;
  let analyser = null;
  let raf = null;

  function start(stream) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.75;
    source.connect(analyser);

    const ctx = canvas.getContext("2d");
    const bufferLength = analyser.frequencyBinCount;
    const data = new Uint8Array(bufferLength);
    canvas.classList.add("is-active");

    const waveColor = getComputedStyle(document.documentElement).getPropertyValue("--red").trim() || "#ff3b30";

    function draw() {
      raf = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);

      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
        canvas.width = cssW * dpr;
        canvas.height = cssH * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      const bars = 40;
      const step = Math.floor(bufferLength / bars) || 1;
      const gap = 3;
      const barW = (cssW - (bars - 1) * gap) / bars;
      const mid = cssH / 2;

      // İlk karelerde canvas genişliği ~0 olabilir (max-width geçişi); barW negatif
      // olduğunda Safari roundRect içinde IndexSizeError fırlatır — bu kareyi atla.
      if (barW <= 0 || cssW <= 0) return;

      for (let i = 0; i < bars; i++) {
        const v = data[i * step] / 255;
        const h = Math.max(3, v * cssH * 0.92);
        const x = i * (barW + gap);
        ctx.fillStyle = waveColor;
        ctx.globalAlpha = 0.35 + v * 0.65;
        roundRect(ctx, x, mid - h / 2, barW, h, Math.min(barW / 2, 3));
      }
      ctx.globalAlpha = 1;
    }
    draw();
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    canvas.classList.remove("is-active");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (audioContext) { audioContext.close(); audioContext = null; }
    analyser = null;
  }

  return { start, stop };
}

const micWaveform = createWaveform(waveformCanvas);

recordBtn.addEventListener("click", async () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream, { audioBitsPerSecond: 128000 });

    mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      clearInterval(timerInterval);
      micWaveform.stop();
      recorderEl.classList.remove("is-recording");
      recordBtn.setAttribute("aria-pressed", "false");
      recordHint.textContent = t("recordHintIdle");

      const blob = new Blob(audioChunks, { type: "audio/webm" });
      sendForTranscription(blob, "recording.webm");
    };

    mediaRecorder.start();
    recorderEl.classList.add("is-recording");
    micWaveform.start(stream);
    recordBtn.setAttribute("aria-pressed", "true");
    recordHint.textContent = t("recordHintRecording");
    elapsedSeconds = 0;
    recordTimer.textContent = "00:00";
    timerInterval = setInterval(() => {
      elapsedSeconds += 1;
      recordTimer.textContent = formatTime(elapsedSeconds);
    }, 1000);
  } catch (err) {
    setStatus(t("micAccessError") + err.message, { error: true });
  }
});

// --- File upload ---
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const fileNameEl = document.getElementById("fileName");

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) handleFile(file);
});

["dragover", "dragenter"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("is-dragover");
  })
);

["dragleave", "drop"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("is-dragover");
  })
);

dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

function handleFile(file) {
  fileNameEl.textContent = file.name;
  sendForTranscription(file, file.name);
}

// --- Sekme sesi dinleme (getDisplayMedia, yalnızca ses parçası kullanılır) ---
const tabRecordBtn = document.getElementById("tabRecordBtn");
const tabRecordTimer = document.getElementById("tabRecordTimer");
const tabRecordHint = document.getElementById("tabRecordHint");
const tabWaveformCanvas = document.getElementById("tabWaveform");
const tabRecorderEl = document.getElementById("tabRecorder");
const tabWaveform = createWaveform(tabWaveformCanvas);

let tabMediaRecorder = null;
let tabAudioChunks = [];
let tabTimerInterval = null;
let tabElapsedSeconds = 0;

// Kayıt sürerken sekme kapatılır/yenilenirse tarayıcının kendi onay diyaloğunu tetikler —
// kullanıcıyı "sekmeyi kapatma" uyarısını görmezden gelip veri kaybetmekten korur.
function warnBeforeUnload(e) {
  e.preventDefault();
  e.returnValue = "";
}

tabRecordBtn.addEventListener("click", async () => {
  if (tabMediaRecorder && tabMediaRecorder.state === "recording") {
    tabMediaRecorder.stop();
    return;
  }

  let displayStream;
  try {
    displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  } catch (err) {
    setStatus(t("tabShareError") + err.message, { error: true });
    return;
  }

  const audioTracks = displayStream.getAudioTracks();
  if (!audioTracks.length) {
    displayStream.getTracks().forEach((track) => track.stop());
    setStatus(t("tabNoAudioError"), { error: true });
    return;
  }

  const audioStream = new MediaStream(audioTracks);
  tabAudioChunks = [];
  tabMediaRecorder = new MediaRecorder(audioStream, { audioBitsPerSecond: 128000 });

  // Kullanıcı tarayıcının kendi "Paylaşımı durdur" arayüzünden kapatırsa kaydı da sonlandır.
  displayStream.getTracks().forEach((track) => {
    track.addEventListener("ended", () => {
      if (tabMediaRecorder && tabMediaRecorder.state === "recording") tabMediaRecorder.stop();
    });
  });

  tabMediaRecorder.ondataavailable = (e) => tabAudioChunks.push(e.data);
  tabMediaRecorder.onstop = () => {
    displayStream.getTracks().forEach((track) => track.stop());
    clearInterval(tabTimerInterval);
    tabWaveform.stop();
    window.removeEventListener("beforeunload", warnBeforeUnload);
    tabRecorderEl.classList.remove("is-recording");
    tabRecordBtn.setAttribute("aria-pressed", "false");
    tabRecordHint.textContent = t("tabRecordHintIdle");

    const blob = new Blob(tabAudioChunks, { type: "audio/webm" });
    sendForTranscription(blob, "tab-audio.webm");
  };

  tabMediaRecorder.start();
  tabRecorderEl.classList.add("is-recording");
  tabWaveform.start(audioStream);
  tabRecordBtn.setAttribute("aria-pressed", "true");
  tabRecordHint.textContent = t("tabRecordHintRecording");
  window.addEventListener("beforeunload", warnBeforeUnload);
  tabElapsedSeconds = 0;
  tabRecordTimer.textContent = "00:00";
  tabTimerInterval = setInterval(() => {
    tabElapsedSeconds += 1;
    tabRecordTimer.textContent = formatTime(tabElapsedSeconds);
  }, 1000);
});

// Tüm DOM referansları ve render fonksiyonları tanımlandıktan sonra ilk çeviriyi uygula
// (applyI18n, henüz burada tanımlanmış historyOverlay/renderHistoryList gibi isimlere
// referans veriyor — dosyanın başında çağrılırsa TDZ hatası verir).
applyI18n();
