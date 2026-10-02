// Electron ana süreci: pencere, güvenlik, izinler, tepsi, kısayol, protokol ve servislerin kurulumu.
import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  globalShortcut,
  Menu,
  nativeImage,
  net,
  Notification,
  protocol,
  safeStorage,
  session,
  shell,
  systemPreferences,
  Tray,
  utilityProcess,
} from "electron";
import path from "node:path";
import { promises as fsp, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { AUDIO_PROTOCOL } from "../shared/ipc";
import { pickUiLang, translate } from "../shared/i18n";
import { defaultSettings, SettingsStore, type KeyCipher } from "./settings";
import { HistoryStore } from "./history";
import { ModelManager } from "./models";
import { DEFAULT_BASE_URL, GroqClient, type FetchLike } from "./groq";
import { LlmService } from "./llm";
import { TranscriptionEngine } from "./engine";
import { RecordService } from "./records";
import { WorkerHost, type Spawner } from "./worker-host";
import { registerIpc, type Services } from "./ipc-handlers";
import { checkForUpdate } from "./updates";

const isDev = !app.isPackaged;
const log = (msg: string) => console.log(`[yazbunu] ${msg}`);

// Testler kendi izole veri klasörünü kullanır.
if (process.env.YAZBUNU_USER_DATA) app.setPath("userData", process.env.YAZBUNU_USER_DATA);

// macOS sistem sesi (loopback): ScreenCaptureKit / CoreAudio tap. Bilinmeyen özellik adlarını Chromium yok sayar.
if (process.platform === "darwin") {
  app.commandLine.appendSwitch("enable-features", "MacLoopbackAudioForScreenShare,MacCatapLoopbackAudioForScreenShare");
}

protocol.registerSchemesAsPrivileged([
  { scheme: AUDIO_PROTOCOL, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isRecording = false;
let quitting = false;
let services: Services;

function resourcesDir(): string {
  return isDev ? path.join(app.getAppPath(), "resources") : process.resourcesPath;
}

function ffmpegPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const p = (require("ffmpeg-static") as string) ?? "ffmpeg";
  // Paketli uygulamada ikili dosya asar arşivinin dışına (app.asar.unpacked) çıkarılır.
  return p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
}

function iconPath(name = "icon-512.png"): string {
  return path.join(__dirname, "../renderer/icons", name);
}

function utilitySpawner(file: string, name: string): Spawner {
  return () => {
    const child = utilityProcess.fork(path.join(__dirname, "../workers", file), [], {
      serviceName: name,
      stdio: "inherit",
    });
    return {
      postMessage: (m) => child.postMessage(m),
      onMessage: (fn) => child.on("message", fn),
      onExit: (fn) => child.on("exit", (code) => fn(code)),
      kill: () => child.kill(),
    };
  };
}

const cipher: KeyCipher = {
  available: () => {
    if (!safeStorage.isEncryptionAvailable()) return false;
    // Linux'ta keyring yoksa "basic_text" (sabit anahtarla şifreleme) döner: güvenli sayılmaz.
    if (process.platform === "linux") {
      const backend = (safeStorage as unknown as { getSelectedStorageBackend?: () => string }).getSelectedStorageBackend?.();
      return backend !== "basic_text" && backend !== "unknown";
    }
    return true;
  },
  encrypt: (plain) => safeStorage.encryptString(plain).toString("base64"),
  decrypt: (enc) => safeStorage.decryptString(Buffer.from(enc, "base64")),
};

function t(key: string, vars?: Record<string, string | number>): string {
  return translate(services?.settings.get().uiLang ?? "en", key, vars);
}

async function createServices(): Promise<Services> {
  const userData = app.getPath("userData");
  const tmpDir = path.join(app.getPath("temp"), "yazbunu");
  // Önceki çökmüş oturumlardan kalan geçici dosyaları temizle.
  await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  await fsp.mkdir(tmpDir, { recursive: true });

  const settings = new SettingsStore(
    path.join(userData, "settings.json"),
    cipher,
    defaultSettings(pickUiLang(app.getLocale())),
    process.env.GROQ_API_KEY || null,
  );
  await settings.load();

  const history = new HistoryStore(path.join(userData, "history"));
  await history.init();

  // Chromium ağ yığını: sistem proxy ayarlarını kullanır (kurumsal ağlarda önemli).
  const fetchFn: FetchLike = (input, init) => net.fetch(input, init as RequestInit);
  const models = new ModelManager(path.join(resourcesDir(), "models"), path.join(userData, "models"), fetchFn);
  const groq = new GroqClient({
    getKey: () => settings.getApiKey(),
    baseUrl: process.env.YAZBUNU_GROQ_BASE_URL || DEFAULT_BASE_URL,
    fetch: process.env.YAZBUNU_GROQ_BASE_URL ? (input, init) => fetch(input, init) : fetchFn,
  });
  const llm = new LlmService(groq, () => settings.get().groqLlmModel);
  const ml = new WorkerHost(utilitySpawner("ml-worker.js", "YazBunu ML"), "ml", log, "errLocalAsr");
  const nllb = new WorkerHost(utilitySpawner("nllb-worker.js", "YazBunu Translate"), "nllb", log, "statusTranslateError");
  const ffmpeg = ffmpegPath();
  const engine = new TranscriptionEngine({ ffmpeg, tmpDir, groq, ml, models });
  const records = new RecordService({ history, engine, ffmpeg });

  return { settings, history, models, groq, llm, ml, nllb, engine, records, ffmpeg, tmpDir, window: () => mainWindow, t };
}

function send(channel: string, payload?: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function showWindow(): void {
  if (!mainWindow) createWindow();
  else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
}

function createWindow(): void {
  const s = services.settings.get();
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 720,
    minHeight: 560,
    show: false,
    title: "YazBunu",
    icon: iconPath(),
    backgroundColor: s.theme === "dark" ? "#111113" : "#f7f7f8",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false, // Arka planda kayıt sürerken ses işleme yavaşlamasın.
    },
  });
  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  mainWindow.once("ready-to-show", () => mainWindow?.show());

  // Harici bağlantılar uygulama içinde değil, sistem tarayıcısında açılır.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("file://")) e.preventDefault();
  });

  mainWindow.on("close", (e) => {
    if (quitting) return;
    const { closeToTray } = services.settings.get();
    if (process.platform === "darwin" || (closeToTray && tray)) {
      e.preventDefault();
      mainWindow?.hide();
      return;
    }
    if (isRecording && !confirmQuitWhileRecording()) e.preventDefault();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function confirmQuitWhileRecording(): boolean {
  const choice = dialog.showMessageBoxSync({
    type: "warning",
    buttons: [t("trayQuit"), t("cancelBtn")],
    defaultId: 1,
    cancelId: 1,
    message: t("quitWhileRecording"),
  });
  return choice === 0;
}

function trayImage(): Electron.NativeImage {
  const img = nativeImage.createFromPath(iconPath(process.platform === "win32" ? "icon.ico" : "icon-192.png"));
  return img.isEmpty() ? img : img.resize({ width: 18, height: 18 });
}

function refreshTray(): void {
  if (!tray) return;
  tray.setToolTip(isRecording ? `YazBunu — ${t("recordingIndicator")}` : "YazBunu");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t("trayShow"), click: showWindow },
      { label: isRecording ? t("trayStop") : t("trayRecord"), click: () => toggleRecording() },
      { type: "separator" },
      { label: t("trayQuit"), click: () => app.quit() },
    ]),
  );
}

function toggleRecording(): void {
  showWindow();
  send("toggle-recording");
}

function applyShortcut(accel: string): boolean {
  globalShortcut.unregisterAll();
  if (!accel.trim()) return true;
  try {
    return globalShortcut.register(accel, toggleRecording);
  } catch {
    return false;
  }
}

function setupPermissions(): void {
  const ses = session.defaultSession;
  const allowed = new Set(["media", "display-capture", "clipboard-sanitized-write", "notifications"]);
  ses.setPermissionRequestHandler((wc, permission, cb) => {
    cb(wc === mainWindow?.webContents && allowed.has(permission));
  });
  ses.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));

  // Sistem sesi: getDisplayMedia çağrısını sistem seçicisi olmadan ekran + loopback sesine bağla.
  ses.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer
        .getSources({ types: ["screen"] })
        .then((sources) => {
          if (!sources.length) return callback({});
          callback({ video: sources[0], audio: process.platform === "linux" ? undefined : "loopback" });
        })
        .catch(() => callback({}));
    },
    { useSystemPicker: false },
  );
}

function setupAudioProtocol(): void {
  // yb-audio://audio/<dosya> → history/audio/<dosya>. Range istekleri (ileri sarma) net.fetch ile desteklenir.
  protocol.handle(AUDIO_PROTOCOL, (request) => {
    const url = new URL(request.url);
    const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
    const file = services.history.audioPath(name);
    if (!existsSync(file)) return new Response("not found", { status: 404 });
    return net.fetch(pathToFileURL(file).toString(), { headers: request.headers, bypassCustomProtocolHandlers: true });
  });
}

function setupMenu(): void {
  if (process.platform === "darwin") {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        { role: "appMenu" },
        { role: "editMenu" },
        { role: "viewMenu" },
        { role: "windowMenu" },
      ]),
    );
  } else {
    // Win/Linux: menü çubuğu yok, ama kopyala/yapıştır kısayolları çalışsın.
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: "editMenu" }, ...(isDev ? [{ role: "viewMenu" as const }] : [])]));
  }
}

app.on("second-instance", () => showWindow());

app.on("before-quit", (e) => {
  if (isRecording && !quitting) {
    if (!confirmQuitWhileRecording()) {
      e.preventDefault();
      return;
    }
  }
  quitting = true;
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  services?.ml.kill();
  services?.nllb.kill();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !(services.settings.get().closeToTray && tray)) app.quit();
});

app.on("activate", () => showWindow());

app.whenReady().then(async () => {
  services = await createServices();
  setupPermissions();
  setupAudioProtocol();
  setupMenu();

  registerIpc(services, {
    send,
    setRecording: (rec) => {
      isRecording = rec;
      refreshTray();
    },
    applyShortcut,
    notify: (title, body) => {
      if (mainWindow?.isFocused()) return;
      if (Notification.isSupported()) new Notification({ title, body, icon: iconPath() }).show();
    },
    askMicAccess: async () => {
      if (process.platform !== "darwin") return true;
      return systemPreferences.askForMediaAccess("microphone");
    },
  });

  createWindow();

  try {
    tray = new Tray(trayImage());
    tray.on("click", showWindow);
    refreshTray();
  } catch (err) {
    log(`tray unavailable: ${String(err)}`);
  }

  const s = services.settings.get();
  applyShortcut(s.shortcut);
  services.settings.onChange(() => refreshTray());

  if (s.checkUpdates && !isDev && !process.env.YAZBUNU_USER_DATA) {
    checkForUpdate(app.getVersion(), (input, init) => net.fetch(input, init as RequestInit))
      .then((u) => u && send("update-available", u))
      .catch(() => undefined);
  }
});
