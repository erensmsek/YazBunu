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

const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel");
const statusLine = document.getElementById("statusLine");
const resultsSection = document.getElementById("results");
const fullText = document.getElementById("fullText");
const segmentsEl = document.getElementById("segments");
const detectedLangEl = document.getElementById("detectedLang");
const targetLangSelect = document.getElementById("targetLang");
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
  resultsSection.classList.add("is-hidden");

  const formData = new FormData();
  formData.append("file", blob, filename);
  if (targetLangSelect.value) formData.append("target_lang", targetLangSelect.value);
  formData.append("diarize", diarizeToggle.checked ? "true" : "false");

  try {
    const res = await fetch("/transcribe", { method: "POST", body: formData });
    if (!res.ok) throw new Error(`Sunucu hatası (${res.status})`);
    const data = await res.json();
    renderResults(data);
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

  // Yeni transkriptte eski AI çıktılarını gizle.
  summaryBlock.classList.add("is-hidden");
  polishBlock.classList.add("is-hidden");
  const hasText = Boolean((data.text || "").trim());
  summarizeBtn.disabled = !hasText;
  polishBtn.disabled = !hasText;

  if (data.translation) {
    translatedText.value = data.translation.text || "";
    renderSegments(translatedSegmentsEl, data.translation.segments);
    renderExportRow(exportTranslationEl, () => ({
      text: data.translation.text || "",
      segments: data.translation.segments || [],
    }));
    translationBlock.classList.remove("is-hidden");
  } else {
    translationBlock.classList.add("is-hidden");
  }

  resultsSection.classList.remove("is-hidden");
}

// --- AI tools: summarize & polish ---
async function callLLM(endpoint, key) {
  const text = fullText.value.trim();
  if (!text) return null;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
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
    setStatus("İyileştirilmiş içerik hazır.");
  } catch (err) {
    setStatus(err.message || "İyileştirme hatası.", { error: true });
  } finally {
    polishBtn.disabled = false;
  }
});

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

// Web Audio için görselleştirme durumu
let audioContext = null;
let analyser = null;
let waveformRAF = null;

function startWaveform(stream) {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioContext.createMediaStreamSource(stream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 128;
  analyser.smoothingTimeConstant = 0.75;
  source.connect(analyser);

  const ctx = waveformCanvas.getContext("2d");
  const bufferLength = analyser.frequencyBinCount;
  const data = new Uint8Array(bufferLength);
  waveformCanvas.classList.add("is-active");

  const waveColor = getComputedStyle(document.documentElement).getPropertyValue("--red").trim() || "#ff3b30";

  function draw() {
    waveformRAF = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(data);

    const dpr = window.devicePixelRatio || 1;
    const cssW = waveformCanvas.clientWidth;
    const cssH = waveformCanvas.clientHeight;
    if (waveformCanvas.width !== cssW * dpr || waveformCanvas.height !== cssH * dpr) {
      waveformCanvas.width = cssW * dpr;
      waveformCanvas.height = cssH * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const bars = 40;
    const step = Math.floor(bufferLength / bars) || 1;
    const gap = 3;
    const barW = (cssW - (bars - 1) * gap) / bars;
    const mid = cssH / 2;

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

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

function stopWaveform() {
  if (waveformRAF) cancelAnimationFrame(waveformRAF);
  waveformRAF = null;
  waveformCanvas.classList.remove("is-active");
  const ctx = waveformCanvas.getContext("2d");
  ctx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
  if (audioContext) { audioContext.close(); audioContext = null; }
  analyser = null;
}

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
      stopWaveform();
      recorderEl.classList.remove("is-recording");
      recordBtn.setAttribute("aria-pressed", "false");
      recordHint.textContent = "Kaydı başlatmak için tıkla";

      const blob = new Blob(audioChunks, { type: "audio/webm" });
      sendForTranscription(blob, "recording.webm");
    };

    mediaRecorder.start();
    recorderEl.classList.add("is-recording");
    startWaveform(stream);
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
