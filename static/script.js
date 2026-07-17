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
  apiKeyToggle.textContent = "Göster";
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
  apiKeyToggle.textContent = show ? "Gizle" : "Göster";
});

settingsSave.addEventListener("click", () => {
  Settings.mode = pendingMode;
  Settings.apiKey = apiKeyInput.value.trim();
  refreshBanner();
  keyStatus.textContent = "Kaydedildi ✓";
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
    downloadHint.textContent = `İndirme hatası: ${state.error || "bilinmeyen hata"}`;
    downloadNormalFoot.style.display = "none";
    downloadErrorFoot.style.display = "";
    stopDownloadPolling();
    return;
  }
  downloadHint.textContent = "Whisper modeli (~824 MB) cihazına indiriliyor. Bu işlem yalnızca ilk kullanımda yapılır.";
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
const appendBannerTitle = document.getElementById("appendBannerTitle");
const appendBannerCancel = document.getElementById("appendBannerCancel");

const LANG_NAMES = {
  tr: "Türkçe", en: "İngilizce", de: "Almanca", fr: "Fransızca", es: "İspanyolca",
  it: "İtalyanca", pt: "Portekizce", nl: "Felemenkçe", ru: "Rusça", ar: "Arapça",
  zh: "Çince", ja: "Japonca", ko: "Korece", pl: "Lehçe", sv: "İsveççe", uk: "Ukraynaca",
};

const EXPORT_FORMATS = ["txt", "srt", "vtt", "md", "json"];

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("is-active"));
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
  setStatus("Transkript oluşturuluyor…", { loading: true });
  if (!appendTargetId) resultsSection.classList.add("is-hidden");

  const formData = new FormData();
  formData.append("file", blob, filename);
  formData.append("diarize", diarizeToggle.checked ? "true" : "false");
  formData.append("mode", Settings.mode);
  if (Settings.apiKey) formData.append("api_key", Settings.apiKey);

  try {
    const res = await fetch("/transcribe", { method: "POST", body: formData });
    if (!res.ok) throw new Error(`Sunucu hatası (${res.status})`);
    const data = await res.json();
    if (appendTargetId) {
      appendToHistoryRecord(appendTargetId, data);
    } else {
      renderResults(data);
      currentHistoryId = saveNewHistoryRecord(data);
    }
    setStatus("Tamamlandı.");
  } catch (err) {
    setStatus(err.message || "Bir hata oluştu.", { error: true });
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
    if (!res.ok) throw new Error(`Dışa aktarma hatası (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transkript.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    setStatus(err.message || "Dışa aktarma hatası.", { error: true });
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
    setStatus("Önce bir hedef dil seç.", { error: true });
    return;
  }
  if (target === currentData.language) {
    setStatus("Metin zaten bu dilde.", { error: true });
    return;
  }
  translateBtn.disabled = true;
  setStatus("Çeviriliyor…", { loading: true });
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
      throw new Error(detail || `Sunucu hatası (${res.status})`);
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
    setStatus("Çeviri hazır.");
  } catch (err) {
    setStatus(err.message || "Çeviri hatası.", { error: true });
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
    throw new Error(detail || `Sunucu hatası (${res.status})`);
  }
  const data = await res.json();
  return data[key];
}

summarizeBtn.addEventListener("click", async () => {
  summarizeBtn.disabled = true;
  setStatus("Özet oluşturuluyor…", { loading: true });
  try {
    const summary = await callLLM("/summarize", "summary");
    summaryContent.innerHTML = renderMarkdown(summary || "");
    summaryBlock.classList.remove("is-hidden");
    resultsSection.classList.add("has-ai");
    repositionTranslation();
    persistCurrentRecord({ summary: summary || "" });
    setStatus("Özet hazır.");
  } catch (err) {
    setStatus(err.message || "Özetleme hatası.", { error: true });
  } finally {
    summarizeBtn.disabled = false;
  }
});

polishBtn.addEventListener("click", async () => {
  polishBtn.disabled = true;
  setStatus("İçerik iyileştiriliyor…", { loading: true });
  try {
    const polished = await callLLM("/polish", "polished");
    polishContent.innerHTML = renderMarkdown(polished || "");
    renderExportRow(exportPolishEl, () => ({ text: polished || "", segments: [] }));
    polishBlock.classList.remove("is-hidden");
    resultsSection.classList.add("has-ai");
    repositionTranslation();
    persistCurrentRecord({ polish: polished || "" });
    setStatus("İyileştirilmiş içerik hazır.");
  } catch (err) {
    setStatus(err.message || "İyileştirme hatası.", { error: true });
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

function makeHistoryTitle(text) {
  const trimmed = (text || "").trim().replace(/\s+/g, " ");
  if (!trimmed) return "Kayıt";
  return trimmed.length > 46 ? trimmed.slice(0, 46) + "…" : trimmed;
}

let currentHistoryId = null;
let appendTargetId = null;

function renderHistoryList() {
  const records = History.list().sort((a, b) => b.updatedAt - a.updatedAt);
  historyListEl.innerHTML = "";
  if (!records.length) {
    historyListEl.innerHTML = `<div class="history-empty">Henüz kayıtlı bir transkript yok. Bir kayıt yaptığında burada görünecek.</div>`;
    return;
  }
  records.forEach((record) => {
    const row = document.createElement("div");
    row.className = "history-item";
    const dateStr = new Date(record.updatedAt).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
    const langLabel = record.language ? (LANG_NAMES[record.language] || record.language) : "";
    row.innerHTML = `
      <div class="history-item__main">
        <div class="history-item__title">${escapeHtml(record.title || "Kayıt")}</div>
        <div class="history-item__meta">
          <span>${dateStr}</span>
          ${langLabel ? `<span class="lang-tag">${escapeHtml(langLabel)}</span>` : ""}
        </div>
      </div>
      <div class="history-item__actions">
        <button class="btn btn--ghost btn--sm" data-action="load" type="button">Yükle</button>
        <button class="btn btn--ghost btn--sm" data-action="append" type="button">Ses Ekle</button>
        <button class="btn btn--ghost btn--sm btn--danger" data-action="delete" type="button">Sil</button>
      </div>
    `;
    row.querySelector('[data-action="load"]').addEventListener("click", () => loadHistoryRecord(record.id));
    row.querySelector('[data-action="append"]').addEventListener("click", () => startAppendMode(record.id));
    row.querySelector('[data-action="delete"]').addEventListener("click", () => {
      if (confirm(`"${record.title}" kaydını silmek istediğine emin misin?`)) deleteHistoryRecord(record.id);
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
  setStatus("Kayıt yüklendi.");
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
  appendBannerTitle.textContent = record.title || "Kayıt";
  appendBanner.classList.remove("is-hidden");
  closeHistory();
  setStatus(`"${record.title}" kaydına ses eklemek için kaydı yap ya da dosya yükle.`);
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
    setStatus("Eklenecek kayıt bulunamadı.", { error: true });
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
  setStatus("Ses eklendi, kayıt güncellendi.");
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
      recordHint.textContent = "Kaydı başlatmak için tıkla";

      const blob = new Blob(audioChunks, { type: "audio/webm" });
      sendForTranscription(blob, "recording.webm");
    };

    mediaRecorder.start();
    recorderEl.classList.add("is-recording");
    micWaveform.start(stream);
    recordBtn.setAttribute("aria-pressed", "true");
    recordHint.textContent = "Durdurmak için tıkla";
    elapsedSeconds = 0;
    recordTimer.textContent = "00:00";
    timerInterval = setInterval(() => {
      elapsedSeconds += 1;
      recordTimer.textContent = formatTime(elapsedSeconds);
    }, 1000);
  } catch (err) {
    setStatus("Mikrofona erişilemedi: " + err.message, { error: true });
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
    setStatus("Sekme paylaşımı başlatılamadı: " + err.message, { error: true });
    return;
  }

  const audioTracks = displayStream.getAudioTracks();
  if (!audioTracks.length) {
    displayStream.getTracks().forEach((track) => track.stop());
    setStatus(
      "Seçilen kaynakta ses paylaşılmadı. Paylaşım penceresinde \"Chrome Sekmesi\"ni seçip \"Sekme sesini paylaş\" kutusunu işaretle.",
      { error: true }
    );
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
    tabRecordHint.textContent = "Dinlemeyi başlatmak için tıkla";

    const blob = new Blob(tabAudioChunks, { type: "audio/webm" });
    sendForTranscription(blob, "tab-audio.webm");
  };

  tabMediaRecorder.start();
  tabRecorderEl.classList.add("is-recording");
  tabWaveform.start(audioStream);
  tabRecordBtn.setAttribute("aria-pressed", "true");
  tabRecordHint.textContent = "Dinlemeyi durdurmak için tıkla";
  window.addEventListener("beforeunload", warnBeforeUnload);
  tabElapsedSeconds = 0;
  tabRecordTimer.textContent = "00:00";
  tabTimerInterval = setInterval(() => {
    tabElapsedSeconds += 1;
    tabRecordTimer.textContent = formatTime(tabElapsedSeconds);
  }, 1000);
});
