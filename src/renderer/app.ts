// YazBunu arayüz denetleyicisi.
import { $, api, escapeHtml, newJobId, type UiError } from "./env";
import { AudioCapture, listMicrophones } from "./capture";
import { Waveform } from "./waveform";
import { renderMarkdown } from "./markdown";
import { I18N_LANGS, LANG_AUTONYMS, LOCALE_TAGS, hasKey, translate, type UiLang } from "../shared/i18n";
import { TARGET_LANGS, TRANSCRIBE_LANGS, displayLanguage } from "../shared/lang";
import {
  MARKDOWN_FORMATS,
  TRANSCRIPT_FORMATS,
  clockTime,
  exportMarkdown,
  exportTranscript,
  safeFileName,
  type ExportDoc,
  type MarkdownFormat,
  type TranscriptFormat,
} from "../shared/export";
import { speakerDisplayName, speakerNumber } from "../shared/speakers";
import type {
  AppInfo,
  CaptureSource,
  HistoryRecord,
  JobProgress,
  LiveUpdate,
  ModelStatus,
  PublicSettings,
  Segment,
} from "../shared/types";
import type { TranscribeResponse } from "../shared/ipc";

// ---------------------------------------------------------------- durum

type Tab = "mic" | "system" | "meeting" | "upload";

interface RecordingState {
  sessionId: string;
  capture: AudioCapture;
  systemViaMain: boolean;
  startedAt: number;
  timer: number;
  stopping: boolean;
}

let settings: PublicSettings;
let info: AppInfo;
let currentRecord: HistoryRecord | null = null;
let appendTargetId: string | null = null;
let appendTitle = "";
let activeTab: Tab = "mic";
let recording: RecordingState | null = null;
let job: { id: string; kind: string } | null = null;
let editing = false;
let modelStatuses: ModelStatus[] = [];

const SPEAKER_COLORS = ["#4460d4", "#e0703a", "#2f9e5b", "#b04fc4", "#d4a017", "#1f9db0", "#d6456b", "#7a6f5a"];

const t = (key: string, vars?: Record<string, string | number>) => translate(settings?.uiLang ?? "tr", key, vars);
const waveform = new Waveform($<HTMLCanvasElement>("waveform"));

// ---------------------------------------------------------------- yardımcılar

function errorText(err: unknown): string {
  let e = (err ?? {}) as UiError;
  // contextBridge bazı durumlarda yalnızca mesajı taşır: kodu oradan çöz.
  if (!e.code && typeof e.message === "string") {
    const m = /YBERR:(\{.*\})/.exec(e.message);
    if (m) {
      try {
        e = JSON.parse(m[1]) as UiError;
      } catch {
        /* düz mesaj */
      }
    }
  }
  const code = e.code && hasKey(e.code) ? e.code : null;
  if (!code) return e.message || t("statusGenericError");
  if (code === "errSystemAudio") return t(code, { hint: systemAudioHint() });
  let text = t(code, { detail: e.detail ?? "" });
  if (code === "micAccessError" && e.detail) text += e.detail;
  return text.replace(/\s*[（(]\s*[）)]\s*$/, "").replace(/:\s*$/, "").trim();
}

function systemAudioHint(): string {
  if (info.platform === "darwin") return t("systemAudioHintMac");
  if (info.platform === "linux") return t("systemAudioHintLinux");
  return t("systemAudioHintWin");
}

function setStatus(message: string, kind: "info" | "error" | "warning" | "loading" = "info"): void {
  const el = $("statusLine");
  el.textContent = message;
  el.classList.toggle("is-error", kind === "error");
  el.classList.toggle("is-warning", kind === "warning");
  el.classList.toggle("is-loading", kind === "loading");
}

function errorCode(err: unknown): string | undefined {
  const e = err as UiError;
  if (e?.code) return e.code;
  return /YBERR:\{"code":"(\w+)"/.exec(e?.message ?? "")?.[1];
}

function showError(err: unknown): void {
  if (errorCode(err) === "statusCancelled") setStatus(t("statusCancelled"));
  else setStatus(errorText(err), "error");
}

function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleString(LOCALE_TAGS[settings.uiLang as UiLang] ?? "tr-TR", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return new Date(ts).toLocaleString();
  }
}

function speakerLabel(n: number): string {
  return t("speakerDefault", { n });
}

function speakerName(id: string | null | undefined, rec: HistoryRecord | null = currentRecord): string {
  return speakerDisplayName(id, rec?.speakers, speakerLabel);
}

function speakerColor(id: string): string {
  return SPEAKER_COLORS[(Math.max(1, speakerNumber(id)) - 1) % SPEAKER_COLORS.length];
}

/** Electron'da window.prompt yok: küçük modal. */
function promptText(label: string, value: string): Promise<string | null> {
  const overlay = $("promptOverlay");
  const input = $<HTMLInputElement>("promptInput");
  $("promptLabel").textContent = label;
  input.value = value;
  overlay.classList.remove("is-hidden");
  setTimeout(() => {
    input.focus();
    input.select();
  }, 0);
  return new Promise((resolve) => {
    const done = (v: string | null) => {
      overlay.classList.add("is-hidden");
      $("promptOk").onclick = null;
      $("promptCancel").onclick = null;
      input.onkeydown = null;
      resolve(v);
    };
    $("promptOk").onclick = () => done(input.value);
    $("promptCancel").onclick = () => done(null);
    input.onkeydown = (e) => {
      if (e.key === "Enter") done(input.value);
      if (e.key === "Escape") done(null);
    };
  });
}

// ---------------------------------------------------------------- tema & dil

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme(): void {
  const theme = settings.theme === "system" ? (darkQuery.matches ? "dark" : "light") : settings.theme;
  document.documentElement.setAttribute("data-theme", theme);
  document.querySelectorAll<HTMLElement>("[data-theme-opt]").forEach((b) => b.classList.toggle("is-active", b.dataset.themeOpt === settings.theme));
}
darkQuery.addEventListener("change", () => settings && applyTheme());

function fillSelect(select: HTMLSelectElement, options: [string, string][], value: string): void {
  select.innerHTML = "";
  for (const [v, label] of options) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = label;
    select.appendChild(opt);
  }
  select.value = value;
}

function applyI18n(): void {
  const lang = settings.uiLang;
  document.documentElement.lang = lang;
  document.title = t("pageTitle");
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n!)));
  document.querySelectorAll<HTMLElement>("[data-i18n-html]").forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml!)));
  document.querySelectorAll<HTMLElement>("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria!)));
  document.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => el.setAttribute("title", t(el.dataset.i18nTitle!)));
  document.querySelectorAll<HTMLInputElement>("[data-i18n-placeholder]").forEach((el) => (el.placeholder = t(el.dataset.i18nPlaceholder!)));
  $("langBtnCode").textContent = lang.toUpperCase();
  $("liveText").dataset.placeholder = t("liveListening");

  const target = $<HTMLSelectElement>("targetLang");
  const prevTarget = target.value;
  fillSelect(target, [["", t("selectPlaceholder")], ...TARGET_LANGS.map((c) => [c, displayLanguage(c, lang)] as [string, string])], prevTarget);

  fillSelect(
    $<HTMLSelectElement>("transcriptionLanguage"),
    [["", t("autoDetect")], ...TRANSCRIBE_LANGS.map((c) => [c, displayLanguage(c, lang)] as [string, string])],
    settings.transcriptionLanguage,
  );
  const counts: [string, string][] = [["0", t("autoDetect")], ...[2, 3, 4, 5, 6, 7, 8].map((n) => [String(n), String(n)] as [string, string])];
  fillSelect($<HTMLSelectElement>("numSpeakers"), counts, String(settings.numSpeakers));
  fillSelect($<HTMLSelectElement>("speakerCountQuick"), counts, String(settings.numSpeakers));
  fillSelect($<HTMLSelectElement>("uiLangSelect"), I18N_LANGS.map((l) => [l, LANG_AUTONYMS[l]] as [string, string]), lang);

  refreshSourceHint();
  refreshAppendBanner();
  if (!recording) $("recordHint").textContent = t("recordHintIdle");
  else $("recordHint").textContent = t("recordHintRecording");
  if (currentRecord) renderRecord();
  if (!$("historyOverlay").classList.contains("is-hidden")) void renderHistory();
  if (!$("settingsOverlay").classList.contains("is-hidden")) renderModels();
}

// ---------------------------------------------------------------- dil menüsü

function renderLangMenu(): void {
  const menu = $("langMenu");
  menu.innerHTML = "";
  for (const lang of I18N_LANGS) {
    const opt = document.createElement("button");
    opt.type = "button";
    opt.className = "lang-menu__opt" + (lang === settings.uiLang ? " is-active" : "");
    opt.textContent = LANG_AUTONYMS[lang];
    opt.addEventListener("click", async () => {
      await updateSettings({ uiLang: lang });
      menu.classList.add("is-hidden");
      $("langBtn").setAttribute("aria-expanded", "false");
    });
    menu.appendChild(opt);
  }
}

$("langBtn").addEventListener("click", () => {
  const menu = $("langMenu");
  const open = menu.classList.contains("is-hidden");
  if (open) renderLangMenu();
  menu.classList.toggle("is-hidden", !open);
  $("langBtn").setAttribute("aria-expanded", String(open));
});
document.addEventListener("click", (e) => {
  if (!(e.target as HTMLElement).closest(".lang-switcher")) {
    $("langMenu").classList.add("is-hidden");
    $("langBtn").setAttribute("aria-expanded", "false");
  }
});

// ---------------------------------------------------------------- ayarlar

async function updateSettings(patch: Partial<PublicSettings>): Promise<void> {
  const prevLang = settings.uiLang;
  try {
    settings = await api.updateSettings(patch);
  } catch (err) {
    if (errorCode(err) === "shortcutInvalid") {
      $("shortcutStatus").textContent = t("shortcutInvalid");
      settings = await api.getSettings();
      syncSettingsForm();
      return;
    }
    throw err;
  }
  applyTheme();
  syncTopbar();
  refreshBanner();
  if (settings.uiLang !== prevLang) applyI18n();
}

function syncTopbar(): void {
  $<HTMLInputElement>("liveToggle").checked = settings.liveTranscription;
  $<HTMLInputElement>("diarizeToggle").checked = settings.diarize;
  const quick = $<HTMLSelectElement>("speakerCountQuick");
  quick.classList.toggle("is-hidden", !settings.diarize);
  quick.value = String(settings.numSpeakers);
}

function refreshBanner(): void {
  $("setupBanner").classList.toggle("is-hidden", settings.hasApiKey);
}

$<HTMLInputElement>("liveToggle").addEventListener("change", (e) => updateSettings({ liveTranscription: (e.target as HTMLInputElement).checked }));
$<HTMLInputElement>("diarizeToggle").addEventListener("change", (e) => updateSettings({ diarize: (e.target as HTMLInputElement).checked }));
$<HTMLSelectElement>("speakerCountQuick").addEventListener("change", (e) => updateSettings({ numSpeakers: Number((e.target as HTMLSelectElement).value) }));

$("themeToggle").addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  void updateSettings({ theme: current === "dark" ? "light" : "dark" });
});

function openSettings(tab = "transcription"): void {
  syncSettingsForm();
  switchSettingsTab(tab);
  $("settingsOverlay").classList.remove("is-hidden");
  void api.modelStatus().then((s) => {
    modelStatuses = s;
    renderModels();
  });
  void fillMicDevices();
}

function closeSettings(): void {
  $("settingsOverlay").classList.add("is-hidden");
}

function switchSettingsTab(tab: string): void {
  document.querySelectorAll<HTMLElement>("[data-stab]").forEach((b) => b.classList.toggle("is-active", b.dataset.stab === tab));
  document.querySelectorAll<HTMLElement>("[data-stab-panel]").forEach((p) => p.classList.toggle("is-hidden", p.dataset.stabPanel !== tab));
}

function syncSettingsForm(): void {
  const key = $<HTMLInputElement>("apiKeyInput");
  key.value = "";
  key.placeholder = settings.hasApiKey ? "••••••••••••••••" : "gsk_...";
  key.type = "password";
  $("apiKeyToggle").textContent = t("showBtn");
  $("keyStatus").textContent = "";
  $("keyPlainWarning").classList.toggle("is-hidden", settings.keyStorage !== "plain");
  document.querySelectorAll<HTMLElement>("#modeSegmented .segmented__opt").forEach((b) => b.classList.toggle("is-active", b.dataset.mode === settings.mode));
  $("localModels").classList.toggle("is-hidden", settings.mode !== "local");
  $<HTMLSelectElement>("transcriptionLanguage").value = settings.transcriptionLanguage;
  $<HTMLSelectElement>("numSpeakers").value = String(settings.numSpeakers);
  $<HTMLInputElement>("keepAudio").checked = settings.keepAudio;
  $<HTMLSelectElement>("uiLangSelect").value = settings.uiLang;
  $<HTMLInputElement>("shortcutInput").value = settings.shortcut;
  $("shortcutStatus").textContent = "";
  $<HTMLInputElement>("closeToTray").checked = settings.closeToTray;
  $("closeToTrayRow").classList.toggle("is-hidden", info.platform === "darwin");
  $<HTMLInputElement>("checkUpdates").checked = settings.checkUpdates;
  $<HTMLInputElement>("groqTranscribeModel").value = settings.groqTranscribeModel;
  $<HTMLInputElement>("groqLlmModel").value = settings.groqLlmModel;
  $("versionInfo").textContent = `YazBunu ${info.version} · ${info.platform}-${info.arch}`;
  applyTheme();
}

async function fillMicDevices(): Promise<void> {
  const select = $<HTMLSelectElement>("micDevice");
  const mics = await listMicrophones();
  fillSelect(
    select,
    [["", t("defaultDevice")], ...mics.map((m, i) => [m.deviceId, m.label || `${t("micDeviceLabel")} ${i + 1}`] as [string, string])],
    settings.micDeviceId,
  );
  if (select.value !== settings.micDeviceId) select.value = "";
}

const MODEL_LABELS: Record<string, string> = {
  "asr-tiny": "modelTiny",
  "asr-small": "modelSmall",
  "asr-turbo": "modelTurbo",
  "asr-large-v3": "modelLarge",
};

function modelRow(st: ModelStatus, selectable: boolean): HTMLElement {
  const row = document.createElement("div");
  const id = st.id.replace(/^asr-/, "");
  const selected = selectable && settings.localModel === id;
  row.className = "model-row" + (selected ? " is-selected" : "");
  const mb = Math.round(st.sizeBytes / 1e6);
  const name = selectable ? t(MODEL_LABELS[st.id]) : "NLLB-200 (600M)";
  let status = "";
  if (st.downloading) status = `<span class="model-row__status">${Math.round(st.progress * 100)}%</span><button class="mini-btn" data-act="cancel">${t("cancelBtn")}</button>`;
  else if (st.installed) status = `<span class="model-row__status model-row__status--ok">${t("modelInstalled")} ✓</span><button class="mini-btn" data-act="delete">${t("deleteBtn")}</button>`;
  else status = `${st.error ? `<span class="model-row__status" style="color:var(--red)">${escapeHtml(t(st.error))}</span>` : ""}<button class="mini-btn" data-act="download">${t("modelDownloadBtn")}</button>`;
  row.innerHTML = `
    ${selectable ? `<input type="radio" name="localModel" ${selected ? "checked" : ""} />` : "<span></span>"}
    <span class="model-row__name">${escapeHtml(name)}<span class="model-row__meta">${t("sizeMB", { n: mb })}</span></span>
    <span class="model-row__actions">${status}</span>
    ${st.downloading ? `<div class="progress-bar"><div class="progress-bar__fill" style="width:${Math.round(st.progress * 100)}%"></div></div>` : ""}`;
  if (selectable) {
    row.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      void updateSettings({ localModel: id as PublicSettings["localModel"] }).then(renderModels);
    });
  }
  row.querySelectorAll<HTMLButtonElement>("button[data-act]").forEach((b) =>
    b.addEventListener("click", async () => {
      const act = b.dataset.act;
      try {
        if (act === "download") await api.downloadModel(st.id);
        else if (act === "cancel") await api.cancelModel(st.id);
        else if (act === "delete" && confirm(`${name} — ${t("deleteBtn")}?`)) await api.deleteModel(st.id);
      } catch (err) {
        if (errorCode(err) !== "statusCancelled") $("keyStatus").textContent = errorText(err);
      }
      modelStatuses = await api.modelStatus();
      renderModels();
    }),
  );
  return row;
}

function renderModels(): void {
  const list = $("modelList");
  list.innerHTML = "";
  modelStatuses.filter((m) => m.kind === "asr").forEach((m) => list.appendChild(modelRow(m, true)));
  const nllb = $("nllbRow");
  nllb.innerHTML = "";
  const tr = modelStatuses.find((m) => m.id === "nllb");
  if (tr) nllb.appendChild(modelRow(tr, false));
  // Intel Mac'te offline çeviri yok: başlığı da gizle.
  nllb.classList.toggle("is-hidden", !tr);
  nllb.previousElementSibling?.classList.toggle("is-hidden", !tr);
}

api.on("models-status", (s) => {
  modelStatuses = s;
  if (!$("settingsOverlay").classList.contains("is-hidden")) renderModels();
});

$("settingsBtn").addEventListener("click", () => openSettings());
$("settingsClose").addEventListener("click", closeSettings);
$("settingsOverlay").addEventListener("click", (e) => e.target === e.currentTarget && closeSettings());
$("setupBannerBtn").addEventListener("click", () => openSettings("transcription"));
$("getKeyBtn").addEventListener("click", () => api.openExternal("https://console.groq.com/keys"));
$("freeKeyLink").addEventListener("click", (e) => {
  e.preventDefault();
  void api.openExternal("https://console.groq.com/keys");
});
document.querySelectorAll<HTMLElement>("[data-stab]").forEach((b) => b.addEventListener("click", () => switchSettingsTab(b.dataset.stab!)));

$("apiKeyToggle").addEventListener("click", () => {
  const input = $<HTMLInputElement>("apiKeyInput");
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  $("apiKeyToggle").textContent = show ? t("hideBtn") : t("showBtn");
});

$("apiKeySave").addEventListener("click", async () => {
  const value = $<HTMLInputElement>("apiKeyInput").value.trim();
  try {
    settings = await api.setApiKey(value || null);
    $("keyStatus").textContent = t("savedStatus");
    syncSettingsForm();
    $("keyStatus").textContent = t("savedStatus");
    refreshBanner();
  } catch (err) {
    $("keyStatus").textContent = errorText(err);
  }
});

$("apiKeyTest").addEventListener("click", async () => {
  const value = $<HTMLInputElement>("apiKeyInput").value.trim();
  if (!value) return;
  $("keyStatus").textContent = "…";
  try {
    await api.testApiKey(value);
    $("keyStatus").textContent = t("keyValid");
  } catch (err) {
    $("keyStatus").textContent = errorText(err);
  }
});

document.querySelectorAll<HTMLElement>("#modeSegmented .segmented__opt").forEach((b) =>
  b.addEventListener("click", async () => {
    await updateSettings({ mode: b.dataset.mode as PublicSettings["mode"] });
    syncSettingsForm();
    renderModels();
  }),
);
document.querySelectorAll<HTMLElement>("[data-theme-opt]").forEach((b) =>
  b.addEventListener("click", () => updateSettings({ theme: b.dataset.themeOpt as PublicSettings["theme"] })),
);

const bindSelect = (id: string, fn: (v: string) => Partial<PublicSettings>) =>
  $<HTMLSelectElement>(id).addEventListener("change", (e) => updateSettings(fn((e.target as HTMLSelectElement).value)));
bindSelect("transcriptionLanguage", (v) => ({ transcriptionLanguage: v }));
bindSelect("numSpeakers", (v) => ({ numSpeakers: Number(v) }));
bindSelect("micDevice", (v) => ({ micDeviceId: v }));
bindSelect("uiLangSelect", (v) => ({ uiLang: v }));

const bindCheck = (id: string, fn: (v: boolean) => Partial<PublicSettings>) =>
  $<HTMLInputElement>(id).addEventListener("change", (e) => updateSettings(fn((e.target as HTMLInputElement).checked)));
bindCheck("keepAudio", (v) => ({ keepAudio: v }));
bindCheck("closeToTray", (v) => ({ closeToTray: v }));
bindCheck("checkUpdates", (v) => ({ checkUpdates: v }));

for (const id of ["groqTranscribeModel", "groqLlmModel"] as const) {
  $<HTMLInputElement>(id).addEventListener("change", async (e) => {
    await updateSettings({ [id]: (e.target as HTMLInputElement).value });
    $<HTMLInputElement>(id).value = settings[id];
  });
}

// Kısayol yakalama: tuş kombinasyonundan Electron accelerator dizesi üretir.
$<HTMLInputElement>("shortcutInput").addEventListener("keydown", (e) => {
  e.preventDefault();
  if (e.key === "Escape") return ($<HTMLInputElement>("shortcutInput").blur());
  if (["Backspace", "Delete"].includes(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
    $<HTMLInputElement>("shortcutInput").value = "";
    void updateSettings({ shortcut: "" });
    return;
  }
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
  const mods: string[] = [];
  if (e.ctrlKey) mods.push(info.platform === "darwin" ? "Control" : "CommandOrControl");
  if (e.metaKey) mods.push(info.platform === "darwin" ? "Command" : "Super");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  const keyMap: Record<string, string> = { " ": "Space", ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right" };
  let key = keyMap[e.key] ?? (e.code.startsWith("Key") ? e.code.slice(3) : e.code.startsWith("Digit") ? e.code.slice(5) : e.key);
  if (key.length === 1) key = key.toUpperCase();
  const isFn = /^F\d{1,2}$/.test(key);
  if (!mods.length && !isFn) return;
  const accel = [...mods, key].join("+");
  $<HTMLInputElement>("shortcutInput").value = accel;
  $("shortcutStatus").textContent = "";
  void updateSettings({ shortcut: accel });
});

$("openDataFolder").addEventListener("click", () => api.openDataFolder());

// ---------------------------------------------------------------- sekmeler

function refreshSourceHint(): void {
  const hint = $("sourceHint");
  hint.textContent = activeTab === "system" ? t("systemHint") : activeTab === "meeting" ? t("meetingHint") : t("micHint");
  const note = $("systemNote");
  const showMac = info?.platform === "darwin" && (activeTab === "system" || activeTab === "meeting");
  note.classList.toggle("is-hidden", !showMac);
  if (showMac) $("systemNoteText").textContent = t("systemAudioMacNote");
}

function switchTab(tab: Tab): void {
  if (recording) return;
  activeTab = tab;
  document.querySelectorAll<HTMLElement>(".tab").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === tab));
  $("recordPanel").classList.toggle("is-hidden", tab === "upload");
  document.querySelector<HTMLElement>('[data-panel="upload"]')!.classList.toggle("is-hidden", tab !== "upload");
  refreshSourceHint();
}

document.querySelectorAll<HTMLElement>(".tab").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab as Tab)));

// ---------------------------------------------------------------- iş (job) göstergesi

const STAGE_KEYS: Record<string, string> = {
  decode: "stageDecode",
  transcribe: "statusTranscribing",
  diarize: "stageDiarize",
  translate: "statusTranslating",
  summarize: "statusSummarizing",
  polish: "statusPolishing",
  download: "stageDownload",
  extract: "stageExtract",
  load: "stageLoad",
};

function showJob(label: string, progress: number): void {
  $("jobBox").classList.remove("is-hidden");
  $("jobLabel").textContent = label;
  const bar = $("jobFill").parentElement!;
  bar.classList.toggle("is-indeterminate", progress < 0);
  $("jobFill").style.width = progress < 0 ? "" : `${Math.round(Math.min(1, progress) * 100)}%`;
}

function beginJob(kind: string, label: string): string {
  const id = newJobId();
  job = { id, kind };
  setStatus("");
  showJob(label, -1);
  setBusy(true);
  return id;
}

function endJob(): void {
  job = null;
  $("jobBox").classList.add("is-hidden");
  setBusy(false);
}

function setBusy(busy: boolean): void {
  for (const id of ["translateBtn", "summarizeBtn", "polishBtn"]) {
    $<HTMLButtonElement>(id).disabled = busy || !currentRecord?.text.trim();
  }
  $("dropzone").classList.toggle("is-disabled", busy);
  $<HTMLButtonElement>("recordBtn").disabled = busy && !recording;
}

api.on("job-progress", (p: JobProgress) => {
  if (!job || p.jobId !== job.id) return;
  if (p.stage === "wait") return showJob(t("stageWait", { s: p.waitSeconds ?? 0 }), -1);
  showJob(t(STAGE_KEYS[p.stage] ?? "statusTranscribing"), p.progress);
});

$("jobCancel").addEventListener("click", () => {
  if (job) void api.cancelJob(job.id);
});

// ---------------------------------------------------------------- kayıt

function setRecordingUi(on: boolean): void {
  $("recorder").classList.toggle("is-recording", on);
  $("recordBtn").setAttribute("aria-pressed", String(on));
  $("recordHint").textContent = on ? t("recordHintRecording") : t("recordHintIdle");
  document.querySelector(".tabs")!.classList.toggle("is-locked", on);
}

async function startRecording(): Promise<void> {
  if (recording || job) return;
  if (activeTab === "upload") switchTab("mic");
  const source = activeTab as CaptureSource;
  setStatus("");
  let start;
  try {
    start = await api.startRecording({ source, appendTo: appendTargetId });
  } catch (err) {
    return showError(err);
  }
  const sessionId = start.sessionId;
  const capture = new AudioCapture({
    source,
    micDeviceId: settings.micDeviceId,
    systemViaMain: start.systemViaMain,
    onPcm: (samples) => api.pushAudio(sessionId, samples),
    onLevel: (level) => waveform.push(level),
    onEnded: () => void stopRecording(),
  });
  try {
    await capture.start();
  } catch (err) {
    await api.cancelRecording(sessionId).catch(() => undefined);
    return showError(err);
  }
  recording = { sessionId, capture, systemViaMain: start.systemViaMain, startedAt: Date.now(), timer: 0, stopping: false };
  setRecordingUi(true);
  waveform.start();
  $("recordTimer").textContent = "00:00";
  recording.timer = window.setInterval(() => {
    if (recording) $("recordTimer").textContent = clockTime((Date.now() - recording.startedAt) / 1000);
  }, 500);
  $("liveText").textContent = "";
  $("livePending").textContent = "";
  $("liveBox").classList.toggle("is-hidden", !settings.liveTranscription);
}

async function stopRecording(): Promise<void> {
  const rec = recording;
  if (!rec || rec.stopping) return;
  rec.stopping = true;
  await rec.capture.stop();
  clearInterval(rec.timer);
  waveform.stop();
  setRecordingUi(false);
  const jobId = beginJob("record", t("statusFinishing"));
  try {
    const res = await api.stopRecording({ sessionId: rec.sessionId, jobId });
    handleTranscribed(res);
  } catch (err) {
    showError(err);
  } finally {
    recording = null;
    endJob();
    $("liveBox").classList.add("is-hidden");
  }
}

$("recordBtn").addEventListener("click", () => (recording ? stopRecording() : startRecording()));

api.on("live-update", (u: LiveUpdate) => {
  if (!recording || u.sessionId !== recording.sessionId) return;
  const box = $("liveText");
  box.textContent = u.segments.map((s) => s.text).join(["zh", "ja"].includes(u.language) ? "" : " ");
  $("livePending").textContent = u.pendingSeconds > 0 ? t("livePending", { s: u.pendingSeconds }) : "";
  const wrap = $("liveBox");
  wrap.scrollTop = wrap.scrollHeight;
});

api.on("live-chunk-error", (e) => setStatus(errorText(e), "warning"));
api.on("system-level", (level) => {
  if (recording?.systemViaMain) waveform.push(level);
});
api.on("toggle-recording", () => {
  if (recording) void stopRecording();
  else void startRecording();
});

// ---------------------------------------------------------------- dosya

async function transcribePath(filePath: string): Promise<void> {
  if (job || recording) return setStatus(t("errBusy"), "warning");
  $("fileName").textContent = filePath.split(/[\\/]/).pop() ?? "";
  const jobId = beginJob("file", t("stageDecode"));
  try {
    handleTranscribed(await api.transcribeFile({ jobId, path: filePath, appendTo: appendTargetId }));
  } catch (err) {
    showError(err);
  } finally {
    endJob();
  }
}

const dropzone = $("dropzone");
dropzone.addEventListener("click", async () => {
  if (job || recording) return;
  const p = await api.pickAudioFile();
  if (p) void transcribePath(p);
});
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    dropzone.click();
  }
});
// Dosya pencerenin herhangi bir yerine bırakılabilir.
document.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("is-dragover");
});
document.addEventListener("dragleave", (e) => {
  if (!e.relatedTarget) dropzone.classList.remove("is-dragover");
});
document.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("is-dragover");
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  const p = api.pathForFile(file);
  if (p) {
    switchTab("upload");
    void transcribePath(p);
  }
});

function handleTranscribed(res: TranscribeResponse): void {
  const appended = Boolean(appendTargetId);
  cancelAppendMode();
  currentRecord = res.record;
  editing = false;
  renderRecord();
  if (res.warnings.length) setStatus(errorText(res.warnings[0]), "warning");
  else setStatus(appended ? t("statusAppendDone") : t("statusDone"));
}

// ---------------------------------------------------------------- sonuçlar

function exportLabels() {
  return { transcriptHeading: t("transcriptHeading"), segmentsHeading: t("segmentsHeading"), speakerLabel };
}

function docFor(rec: HistoryRecord, segments = rec.segments, text = rec.text, suffix = ""): ExportDoc {
  return { title: rec.title + suffix, language: rec.language, text, segments, speakers: rec.speakers };
}

async function saveExport(name: string, ext: string, content: string): Promise<void> {
  try {
    const file = await api.saveTextFile({ defaultName: safeFileName(name, "transkript"), content, ext });
    if (file) setStatus(t("statusExported", { file }));
  } catch (err) {
    showError(err);
  }
}

function renderExportRow(container: HTMLElement, formats: string[], onClick: (fmt: string) => void): void {
  container.innerHTML = "";
  for (const fmt of formats) {
    const btn = document.createElement("button");
    btn.className = "export-btn";
    btn.type = "button";
    btn.textContent = fmt.toUpperCase();
    btn.addEventListener("click", () => onClick(fmt));
    container.appendChild(btn);
  }
}

function renderSegments(container: HTMLElement, segments: Segment[], interactive: boolean): void {
  container.innerHTML = "";
  segments.forEach((seg, i) => {
    const row = document.createElement("div");
    row.className = "segment-row";
    row.dataset.index = String(i);
    const time = document.createElement("span");
    time.className = "segment-row__time";
    time.textContent = `${clockTime(seg.start)} – ${clockTime(seg.end)}`;
    const text = document.createElement("span");
    text.className = "segment-row__text";
    if (seg.speaker) {
      const tag = document.createElement("span");
      tag.className = "speaker-tag";
      tag.style.color = speakerColor(seg.speaker);
      tag.textContent = speakerName(seg.speaker);
      if (interactive) tag.addEventListener("click", () => void renameSpeaker(seg.speaker!));
      text.appendChild(tag);
    }
    const body = document.createElement("span");
    body.className = "segment-row__body";
    body.textContent = seg.text;
    if (interactive && editing) {
      body.contentEditable = "plaintext-only";
      body.spellcheck = true;
    }
    text.appendChild(body);
    if (interactive) time.addEventListener("click", () => seekTo(seg.start));
    row.append(time, text);
    container.appendChild(row);
  });
}

function hasAiOutput(): boolean {
  return !$("summaryBlock").classList.contains("is-hidden") || !$("polishBlock").classList.contains("is-hidden");
}

/** Özet/polish yokken çeviri sağ sütunda; varsa transkriptin altında. */
function layoutResults(): void {
  const tb = $("translationBlock");
  const hasTranslation = !tb.classList.contains("is-hidden");
  if (hasAiOutput()) $("resultsMain").appendChild(tb);
  else $("resultsSide").insertBefore(tb, $("resultsSide").firstChild);
  $("results").classList.toggle("has-ai", hasAiOutput() || hasTranslation);
}

function renderRecord(): void {
  const rec = currentRecord;
  if (!rec) {
    $("results").classList.add("is-hidden");
    return;
  }
  $("results").classList.remove("is-hidden");
  const title = $("recordTitle");
  title.textContent = rec.title || t("transcriptHeading");
  title.title = rec.title;
  $("detectedLang").textContent = rec.language ? displayLanguage(rec.language, settings.uiLang) : "";

  // Oynatıcı
  const audio = $<HTMLAudioElement>("audio");
  const url = api.audioUrl(rec);
  $("player").classList.toggle("is-hidden", !url);
  if (url && audio.dataset.src !== url) {
    audio.pause();
    audio.dataset.src = url;
    audio.src = url;
    $("player").classList.remove("is-playing");
  } else if (!url) {
    audio.pause();
    audio.removeAttribute("src");
    delete audio.dataset.src;
  }

  // Konuşmacılar
  const ids = [...new Set(rec.segments.map((s) => s.speaker).filter(Boolean) as string[])].sort((a, b) => speakerNumber(a) - speakerNumber(b));
  const chips = $("speakerChips");
  chips.innerHTML = "";
  for (const id of ids) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "speaker-chip";
    chip.innerHTML = `<span class="speaker-chip__dot" style="background:${speakerColor(id)}"></span>${escapeHtml(speakerName(id))}`;
    chip.title = t("renamePrompt");
    chip.addEventListener("click", () => void renameSpeaker(id));
    chips.appendChild(chip);
  }
  if (rec.audioFile) {
    const act = document.createElement("button");
    act.type = "button";
    act.className = "speaker-chip speaker-chip--action";
    act.textContent = `↻ ${t("diarizeLabel")}`;
    act.addEventListener("click", () => void rediarize());
    chips.appendChild(act);
  }
  $("speakersRow").classList.toggle("is-hidden", !ids.length && !rec.audioFile);

  // Segmentler
  $("segments").classList.toggle("is-editing", editing);
  $("editHint").classList.toggle("is-hidden", !editing);
  $("editBtn").textContent = editing ? t("doneBtn") : t("editBtn");
  $("editBtn").classList.toggle("is-active", editing);
  renderSegments($("segments"), rec.segments, true);
  renderExportRow($("exportOriginal"), TRANSCRIPT_FORMATS, (fmt) =>
    saveExport(rec.title, fmt, exportTranscript(fmt as TranscriptFormat, docFor(rec), exportLabels())),
  );

  // Çeviri
  const tr = rec.translation;
  $("translationBlock").classList.toggle("is-hidden", !tr);
  if (tr) {
    $("translationLang").textContent = displayLanguage(tr.target_lang, settings.uiLang);
    renderSegments($("translatedSegments"), tr.segments, false);
    renderExportRow($("exportTranslation"), TRANSCRIPT_FORMATS, (fmt) =>
      saveExport(`${rec.title} (${tr.target_lang})`, fmt, exportTranscript(fmt as TranscriptFormat, docFor(rec, tr.segments, tr.text, ` (${tr.target_lang})`), exportLabels())),
    );
  }

  // Özet / iyileştirme
  $("summaryBlock").classList.toggle("is-hidden", !rec.summary);
  if (rec.summary) {
    $("summaryContent").innerHTML = renderMarkdown(rec.summary);
    renderExportRow($("exportSummary"), MARKDOWN_FORMATS, (fmt) =>
      saveExport(`${rec.title} - ${t("summarizeBtn")}`, fmt, exportMarkdown(fmt as MarkdownFormat, rec.summary!)),
    );
  }
  $("polishBlock").classList.toggle("is-hidden", !rec.polish);
  if (rec.polish) {
    $("polishContent").innerHTML = renderMarkdown(rec.polish);
    renderExportRow($("exportPolish"), MARKDOWN_FORMATS, (fmt) => saveExport(rec.title, fmt, exportMarkdown(fmt as MarkdownFormat, rec.polish!)));
  }
  layoutResults();
  setBusy(Boolean(job));
}

async function patchCurrent(patch: Parameters<typeof api.patchRecord>[1]): Promise<void> {
  if (!currentRecord) return;
  try {
    currentRecord = await api.patchRecord(currentRecord.id, patch);
    renderRecord();
  } catch (err) {
    showError(err);
  }
}

async function renameSpeaker(id: string): Promise<void> {
  if (!currentRecord) return;
  const name = await promptText(t("renamePrompt"), speakerName(id));
  if (name === null) return;
  await patchCurrent({ speakers: { ...currentRecord.speakers, [id]: name.trim() } });
}

$("recordTitle").addEventListener("click", async () => {
  if (!currentRecord) return;
  const title = await promptText(t("historyTitle"), currentRecord.title);
  if (title && title.trim()) await patchCurrent({ title: title.trim() });
});

$("editBtn").addEventListener("click", async () => {
  if (!currentRecord) return;
  if (!editing) {
    editing = true;
    renderRecord();
    return;
  }
  // Düzenlemeleri topla: zamanlamalar aynı kalır, yalnızca metin değişir.
  const rows = $("segments").querySelectorAll<HTMLElement>(".segment-row");
  const segments = currentRecord.segments.map((s, i) => {
    const body = rows[i]?.querySelector<HTMLElement>(".segment-row__body");
    const text = body ? (body.textContent ?? "").replace(/\s+/g, " ").trim() : s.text;
    // Metin değiştiyse kelime zaman damgaları artık geçerli değil.
    if (text === s.text) return s;
    const { words: _words, ...rest } = s;
    return { ...rest, text };
  });
  editing = false;
  const changed = segments.some((s, i) => s !== currentRecord!.segments[i]);
  if (changed) await patchCurrent({ segments: segments.filter((s) => s.text) });
  else renderRecord();
});

async function copy(text: string): Promise<void> {
  await api.copyText(text);
  setStatus(t("copiedStatus"));
}

$("copyTranscriptBtn").addEventListener("click", () => currentRecord && copy(exportTranscript("txt", docFor(currentRecord), exportLabels()).trim()));
$("copyTranslationBtn").addEventListener("click", () => {
  const rec = currentRecord;
  if (rec?.translation) void copy(exportTranscript("txt", docFor(rec, rec.translation.segments, rec.translation.text), exportLabels()).trim());
});
$("copySummaryBtn").addEventListener("click", () => currentRecord?.summary && copy(currentRecord.summary));
$("copyPolishBtn").addEventListener("click", () => currentRecord?.polish && copy(currentRecord.polish));

async function rediarize(): Promise<void> {
  if (!currentRecord || job) return;
  const jobId = beginJob("diarize", t("stageDiarize"));
  try {
    currentRecord = await api.rediarize({ jobId, recordId: currentRecord.id, numSpeakers: settings.numSpeakers });
    renderRecord();
    setStatus(t("statusDone"));
  } catch (err) {
    showError(err);
  } finally {
    endJob();
  }
}

// ---------------------------------------------------------------- oynatıcı

const audio = $<HTMLAudioElement>("audio");

function seekTo(sec: number): void {
  if (!audio.src) return;
  audio.currentTime = sec;
  void audio.play();
}

$("playBtn").addEventListener("click", () => (audio.paused ? void audio.play() : audio.pause()));
audio.addEventListener("play", () => $("player").classList.add("is-playing"));
audio.addEventListener("pause", () => $("player").classList.remove("is-playing"));
audio.addEventListener("ended", () => $("player").classList.remove("is-playing"));
audio.addEventListener("timeupdate", () => {
  const dur = audio.duration && isFinite(audio.duration) ? audio.duration : currentRecord?.duration ?? 0;
  $<HTMLInputElement>("seekBar").value = dur ? String(Math.round((audio.currentTime / dur) * 1000)) : "0";
  $("playTime").textContent = `${clockTime(audio.currentTime)} / ${clockTime(dur)}`;
  if (!currentRecord || editing) return;
  const now = audio.currentTime;
  const idx = currentRecord.segments.findIndex((s) => now >= s.start && now < s.end + 0.15);
  $("segments").querySelectorAll<HTMLElement>(".segment-row").forEach((row) => {
    const on = Number(row.dataset.index) === idx;
    if (on && !row.classList.contains("is-current") && !audio.paused) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
    row.classList.toggle("is-current", on);
  });
});
$<HTMLInputElement>("seekBar").addEventListener("input", (e) => {
  const dur = audio.duration && isFinite(audio.duration) ? audio.duration : currentRecord?.duration ?? 0;
  audio.currentTime = (Number((e.target as HTMLInputElement).value) / 1000) * dur;
});

// ---------------------------------------------------------------- yapay zekâ

function outputLang(): string {
  return $<HTMLSelectElement>("targetLang").value || currentRecord?.language || settings.uiLang;
}

$("translateBtn").addEventListener("click", async () => {
  const rec = currentRecord;
  if (!rec || job) return;
  const target = $<HTMLSelectElement>("targetLang").value;
  if (!target) return setStatus(t("statusPickTargetLang"), "error");
  if (target === rec.language) return setStatus(t("statusAlreadyThisLang"), "error");
  const jobId = beginJob("translate", t("statusTranslating"));
  try {
    // Kelime listeleri çeviride gereksiz: IPC yükünü azalt.
    const segments = rec.segments.map(({ words: _w, ...s }) => s);
    const translation = await api.translate({ jobId, recordId: rec.id, segments, source: rec.language, target });
    if (currentRecord?.id === rec.id) {
      currentRecord = { ...currentRecord, translation };
      renderRecord();
    }
    setStatus(t("statusTranslateReady"));
  } catch (err) {
    showError(err);
  } finally {
    endJob();
  }
});

async function runLlm(kind: "summarize" | "polish"): Promise<void> {
  const rec = currentRecord;
  if (!rec || job || !rec.text.trim()) return;
  const jobId = beginJob(kind, t(kind === "summarize" ? "statusSummarizing" : "statusPolishing"));
  try {
    const args = { jobId, recordId: rec.id, text: exportTranscript("txt", docFor(rec), exportLabels()), lang: outputLang() };
    const out = kind === "summarize" ? await api.summarize(args) : await api.polish(args);
    if (currentRecord?.id === rec.id) {
      currentRecord = { ...currentRecord, [kind === "summarize" ? "summary" : "polish"]: out };
      renderRecord();
    }
    setStatus(t(kind === "summarize" ? "statusSummaryReady" : "statusPolishReady"));
  } catch (err) {
    showError(err);
  } finally {
    endJob();
  }
}

$("summarizeBtn").addEventListener("click", () => runLlm("summarize"));
$("polishBtn").addEventListener("click", () => runLlm("polish"));

// ---------------------------------------------------------------- geçmiş

let searchTimer = 0;

async function renderHistory(): Promise<void> {
  const list = $("historyList");
  const query = $<HTMLInputElement>("historySearch").value;
  const items = await api.listHistory(query);
  list.innerHTML = "";
  if (!items.length) {
    list.innerHTML = `<div class="history-empty">${escapeHtml(query ? t("historyNoMatch") : t("historyEmptyText"))}</div>`;
    return;
  }
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "history-item";
    const lang = item.language ? `<span class="lang-tag">${escapeHtml(displayLanguage(item.language, settings.uiLang))}</span>` : "";
    row.innerHTML = `
      <div class="history-item__main">
        <div class="history-item__title" title="${escapeHtml(item.title)}">${escapeHtml(item.title || t("historyDefaultTitle"))}</div>
        <div class="history-item__meta"><span>${escapeHtml(formatDate(item.updatedAt))}</span><span>${clockTime(item.duration)}</span>${lang}${item.hasAudio ? '<span class="history-item__audio" aria-hidden="true">♪</span>' : ""}</div>
      </div>
      <div class="history-item__actions">
        <button class="btn btn--ghost btn--sm" data-action="load" type="button">${t("loadBtn")}</button>
        <button class="btn btn--ghost btn--sm" data-action="append" type="button">${t("appendBtn")}</button>
        <button class="btn btn--ghost btn--sm btn--danger" data-action="delete" type="button">${t("deleteBtn")}</button>
      </div>`;
    row.querySelector('[data-action="load"]')!.addEventListener("click", () => loadRecord(item.id));
    row.querySelector('[data-action="append"]')!.addEventListener("click", () => startAppendMode(item.id, item.title));
    row.querySelector('[data-action="delete"]')!.addEventListener("click", async () => {
      if (!confirm(t("deleteConfirm", { title: item.title }))) return;
      await api.deleteRecord(item.id);
      if (currentRecord?.id === item.id) {
        currentRecord = null;
        renderRecord();
      }
      if (appendTargetId === item.id) cancelAppendMode();
      void renderHistory();
    });
    list.appendChild(row);
  }
}

async function loadRecord(id: string): Promise<void> {
  const rec = await api.getRecord(id);
  if (!rec) return;
  cancelAppendMode();
  currentRecord = rec;
  editing = false;
  renderRecord();
  $("historyOverlay").classList.add("is-hidden");
  setStatus(t("statusRecordLoaded"));
}

function refreshAppendBanner(): void {
  $("appendBanner").classList.toggle("is-hidden", !appendTargetId);
  if (appendTargetId) $("appendBannerText").innerHTML = t("appendBannerText", { title: escapeHtml(appendTitle) });
}

function startAppendMode(id: string, title: string): void {
  appendTargetId = id;
  appendTitle = title || t("historyDefaultTitle");
  refreshAppendBanner();
  $("historyOverlay").classList.add("is-hidden");
  setStatus(t("statusAppendPrompt", { title: appendTitle }));
}

function cancelAppendMode(): void {
  appendTargetId = null;
  refreshAppendBanner();
}

$("appendBannerCancel").addEventListener("click", cancelAppendMode);
$("historyBtn").addEventListener("click", () => {
  $<HTMLInputElement>("historySearch").value = "";
  $("historyOverlay").classList.remove("is-hidden");
  void renderHistory();
  setTimeout(() => $("historySearch").focus(), 0);
});
$("historyClose").addEventListener("click", () => $("historyOverlay").classList.add("is-hidden"));
$("historyOverlay").addEventListener("click", (e) => e.target === e.currentTarget && $("historyOverlay").classList.add("is-hidden"));
$("historySearch").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => void renderHistory(), 200);
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!$("promptOverlay").classList.contains("is-hidden")) return;
  $("settingsOverlay").classList.add("is-hidden");
  $("historyOverlay").classList.add("is-hidden");
});

// ---------------------------------------------------------------- güncelleme

api.on("update-available", (u) => {
  $("updateBannerText").textContent = t("updateAvailable", { v: u.latest });
  $("updateBanner").classList.remove("is-hidden");
  $("updateBannerBtn").onclick = () => void api.openExternal(u.url);
});

api.on("settings-changed", (s) => {
  const langChanged = settings && s.uiLang !== settings.uiLang;
  settings = s;
  syncTopbar();
  refreshBanner();
  applyTheme();
  if (langChanged) applyI18n();
});

// ---------------------------------------------------------------- başlangıç

(async function init() {
  [settings, info] = await Promise.all([api.getSettings(), api.appInfo()]);
  applyTheme();
  syncTopbar();
  refreshBanner();
  applyI18n();
  switchTab("mic");
  document.body.classList.add("is-ready");
})();
