import { test, expect, type Page } from "@playwright/test";
import { existsSync, readFileSync, readdirSync, cpSync, mkdirSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { launch, ROOT, type Launched } from "./helpers";

const WAV_EN = path.join(ROOT, ".cache/whisper-tiny/1.wav");
const WAV_4SPK = path.join(ROOT, ".cache/fixtures/0-four-speakers-zh.wav");
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(ROOT, ".cache/shots", `${name}.png`) });

/** Main süreçteki dosya seçme diyaloğunu verilen dosyayla yanıtlayacak şekilde değiştirir. */
async function stubOpenDialog(l: Launched, file: string) {
  await l.app.evaluate(({ dialog }, f) => {
    (dialog as unknown as { showOpenDialog: unknown }).showOpenDialog = async () => ({ canceled: false, filePaths: [f] });
  }, file);
}

async function uploadFile(l: Launched, file: string) {
  await stubOpenDialog(l, file);
  await l.page.click('.tab[data-tab="upload"]');
  await l.page.click("#dropzone");
}

test.describe.configure({ mode: "serial" });

test("dosya → transkript → export → çeviri → özet → iyileştirme → geçmiş", async () => {
  const l = await launch();
  const { page } = l;
  await uploadFile(l, WAV_EN);
  await expect(page.locator("#results")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#statusLine")).toHaveText("Tamamlandı.");
  await expect(page.locator("#segments .segment-row")).toHaveCount(4); // sahte Groq: ~16.7 sn / 4 sn
  await expect(page.locator("#recordTitle")).toHaveText("1"); // dosya adından başlık
  await expect(page.locator("#detectedLang")).toHaveText("Türkçe");
  await expect(page.locator("#player")).toBeVisible(); // ses saklandı

  // Export: her format dosyaya yazılır
  for (const fmt of ["TXT", "SRT", "VTT", "MD", "JSON"]) {
    await page.locator("#exportOriginal .export-btn", { hasText: fmt }).click();
    await expect(page.locator("#statusLine")).toContainText("Kaydedildi");
  }
  const files = readdirSync(l.saveDir).sort();
  expect(files).toEqual(["1.json", "1.md", "1.srt", "1.txt", "1.vtt"]);
  expect(readFileSync(path.join(l.saveDir, "1.srt"), "utf8")).toContain("00:00:00,000 -->");
  expect(JSON.parse(readFileSync(path.join(l.saveDir, "1.json"), "utf8")).segments.length).toBe(4);

  // Çeviri: hedef dil seçilmeden uyarı
  await page.click("#translateBtn");
  await expect(page.locator("#statusLine")).toHaveText("Önce bir hedef dil seç.");
  await page.selectOption("#targetLang", "en");
  await page.click("#translateBtn");
  await expect(page.locator("#translationBlock")).toBeVisible();
  await expect(page.locator("#translatedSegments .segment-row").first()).toContainText("[English]");

  await page.click("#summarizeBtn");
  await expect(page.locator("#summaryBlock")).toBeVisible();
  await expect(page.locator("#summaryContent")).toContainText("özeti");
  // Hedef dil seçiliyken özet o dilde istenir
  const summaryReq = l.mock.requests.filter((r) => r.path === "/chat/completions").at(-1)!;
  expect(String((summaryReq.json!.messages as { content: string }[])[0].content)).toContain("English");

  await page.click("#polishBtn");
  await expect(page.locator("#polishBlock")).toBeVisible();
  await expect(page.locator("#polishContent h1")).toHaveText("Başlık");
  await expect(page.locator("#results")).toHaveClass(/has-ai/);
  await shot(page, "flow-results");

  // Kopyala
  await page.click("#copyTranscriptBtn");
  await expect(page.locator("#statusLine")).toHaveText("Panoya kopyalandı ✓");
  const clip = await l.app.evaluate(({ clipboard }) => clipboard.readText());
  expect(clip).toContain("Parça 0 cümle 1.");

  // Geçmiş: kayıt ve AI çıktıları kalıcı
  await page.click("#historyBtn");
  await expect(page.locator(".history-item")).toHaveCount(1);
  await page.fill("#historySearch", "bulunamayacak-kelime");
  await expect(page.locator(".history-empty")).toHaveText("Eşleşen kayıt yok.");
  await page.fill("#historySearch", "cümle");
  await expect(page.locator(".history-item")).toHaveCount(1);
  await shot(page, "flow-history");
  await page.click('.history-item [data-action="load"]');
  await expect(page.locator("#summaryBlock")).toBeVisible();
  await expect(page.locator("#translationBlock")).toBeVisible();
  await expect(page.locator("#statusLine")).toHaveText("Kayıt yüklendi.");

  // Silme
  page.once("dialog", (d) => d.accept());
  await page.click("#historyBtn");
  await page.click('.history-item [data-action="delete"]');
  await expect(page.locator(".history-empty")).toBeVisible();
  await expect(page.locator("#results")).toBeHidden();
  await l.close();
});

test("mikrofon kaydı (sahte mikrofon) + canlı transkript", async () => {
  const l = await launch({ fakeAudio: WAV_EN });
  const { page } = l;
  await page.click("#recordBtn");
  await expect(page.locator("#recorder")).toHaveClass(/is-recording/);
  await expect(page.locator("#liveBox")).toBeVisible();
  // ~18 sn sonra ilk canlı parça yazıya dökülür
  await expect(page.locator("#liveText")).toContainText("Parça 0", { timeout: 40_000 });
  await shot(page, "flow-live");
  await page.click("#recordBtn");
  await expect(page.locator("#results")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#segments .segment-row").first()).toContainText("Parça 0");
  // Groq'a giden ses gerçekten konuşma içeriyordu (sessiz parçalar gönderilmez)
  const calls = l.mock.requests.filter((r) => r.path === "/audio/transcriptions");
  expect(calls.length).toBeGreaterThanOrEqual(2);
  for (const c of calls) expect(c.fileBytes).toBeLessThan(30 * 32000 + 100);
  await expect(page.locator("#player")).toBeVisible();
  await l.close();
});

test("canlı kapalıyken kayıt sonunda tek seferde transkript; kısayol olayı kaydı başlatıp durdurur", async () => {
  const l = await launch({ fakeAudio: WAV_EN, settings: { liveTranscription: false } });
  const { page } = l;
  // Global kısayol / tepsi menüsü → main 'toggle-recording' gönderir
  await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send("toggle-recording"));
  await expect(page.locator("#recorder")).toHaveClass(/is-recording/);
  await expect(page.locator("#liveBox")).toBeHidden();
  await page.waitForTimeout(3500);
  await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send("toggle-recording"));
  await expect(page.locator("#results")).toBeVisible({ timeout: 30_000 });
  expect(l.mock.requests.filter((r) => r.path === "/audio/transcriptions").length).toBe(1);
  await l.close();
});

const pulseOk = spawnSync("pactl", ["info"]).status === 0;

test("Linux sistem sesi (PulseAudio monitor) ve toplantı modu", async () => {
  test.skip(process.platform !== "linux" || !pulseOk, "PulseAudio yok");
  const l = await launch({ fakeAudio: WAV_EN, settings: { liveTranscription: false } });
  const { page } = l;
  const info = await page.evaluate(() => (window as unknown as { yazbunu: { appInfo(): Promise<{ systemAudio: string }> } }).yazbunu.appInfo());
  expect(info.systemAudio).toBe("pulse");

  for (const tab of ["system", "meeting"]) {
    await page.click(`.tab[data-tab="${tab}"]`);
    await page.click("#recordBtn");
    await expect(page.locator("#recorder")).toHaveClass(/is-recording/);
    // Sistem çıkışında ses çal → parec yakalamalı
    const player = spawn("paplay", [WAV_EN]);
    await page.waitForTimeout(4000);
    player.kill();
    await page.click("#recordBtn");
    await expect(page.locator("#statusLine")).toHaveText("Tamamlandı.", { timeout: 30_000 });
  }
  const calls = l.mock.requests.filter((r) => r.path === "/audio/transcriptions");
  expect(calls.length).toBe(2);
  await l.close();
});

test("konuşmacı ayrımı (gerçek model) + isim verme + düzenleme + yeniden ayırma", async () => {
  const l = await launch({ settings: { diarize: true, numSpeakers: 4 } });
  const { page } = l;
  await expect(page.locator("#speakerCountQuick")).toBeVisible();
  await expect(page.locator("#speakerCountQuick")).toHaveValue("4");
  // Sahte Groq: 4-konuşmacılı kaydın bölümlerine göre segmentler (her 4 sn)
  await uploadFile(l, WAV_4SPK);
  await expect(page.locator("#results")).toBeVisible({ timeout: 90_000 });
  const chips = page.locator("#speakerChips .speaker-chip:not(.speaker-chip--action)");
  expect(await chips.count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator("#segments .speaker-tag").first()).toHaveText("Konuşmacı 1");

  // İsim ver
  await chips.first().click();
  await page.fill("#promptInput", "Ayşe");
  await page.click("#promptOk");
  await expect(page.locator("#segments .speaker-tag").first()).toHaveText("Ayşe");

  // Düzenle
  await page.click("#editBtn");
  const body = page.locator("#segments .segment-row__body").first();
  await body.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" EKLENDİ");
  await page.click("#editBtn");
  await expect(page.locator("#segments .segment-row__body").first()).toContainText("EKLENDİ");

  // Kalıcılık
  const rec = await page.evaluate(async () => {
    const api = (window as unknown as { yazbunu: { listHistory(q: string): Promise<{ id: string }[]>; getRecord(id: string): Promise<{ speakers: Record<string, string>; text: string }> } }).yazbunu;
    const [first] = await api.listHistory("");
    return api.getRecord(first.id);
  });
  expect(rec.speakers.S1).toBe("Ayşe");
  expect(rec.text).toContain("EKLENDİ");

  // Yeniden ayır: isimler korunur
  await page.click("#speakerChips .speaker-chip--action");
  await expect(page.locator("#statusLine")).toHaveText("Tamamlandı.", { timeout: 90_000 });
  await expect(page.locator("#speakerChips")).toContainText("Ayşe");
  await shot(page, "flow-speakers");

  // TXT export konuşmacı adlarını içerir
  await page.locator("#exportOriginal .export-btn", { hasText: "TXT" }).click();
  await expect(page.locator("#statusLine")).toContainText("Kaydedildi");
  const txt = readFileSync(path.join(l.saveDir, readdirSync(l.saveDir).find((f) => f.endsWith(".txt"))!), "utf8");
  expect(txt).toMatch(/Ayşe: /);
  await l.close();
});

test("geçmiş kayda ses ekleme: zaman damgaları devam eder", async () => {
  const l = await launch();
  const { page } = l;
  await uploadFile(l, WAV_EN);
  await expect(page.locator("#results")).toBeVisible({ timeout: 30_000 });
  const before = await page.locator("#segments .segment-row").count();
  await page.click("#historyBtn");
  await page.click('.history-item [data-action="append"]');
  await expect(page.locator("#appendBanner")).toBeVisible();
  await page.click("#dropzone");
  await expect(page.locator("#statusLine")).toHaveText("Ses eklendi, kayıt güncellendi.", { timeout: 30_000 });
  await expect(page.locator("#appendBanner")).toBeHidden();
  const rows = page.locator("#segments .segment-row");
  expect(await rows.count()).toBe(before * 2);
  await expect(rows.last().locator(".segment-row__time")).toContainText("00:3"); // 16.7 + 1 + ~16 sn
  await page.click("#historyBtn");
  await expect(page.locator(".history-item")).toHaveCount(1);
  await l.close();
});

test("offline mod (gerçek Whisper tiny)", async () => {
  const l = await launch({ apiKey: null, settings: { mode: "local", localModel: "tiny" } });
  const dest = path.join(l.userData, "models", "whisper-tiny");
  mkdirSync(dest, { recursive: true });
  for (const f of ["tiny-encoder.int8.onnx", "tiny-decoder.int8.onnx", "tiny-tokens.txt"]) cpSync(path.join(ROOT, ".cache/whisper-tiny", f), path.join(dest, f));
  writeFileSync(path.join(dest, ".complete"), "ok");
  const { page } = l;
  await uploadFile(l, WAV_EN);
  await expect(page.locator("#results")).toBeVisible({ timeout: 90_000 });
  await expect(page.locator("#segments")).toContainText(/heaven/i);
  await expect(page.locator("#detectedLang")).toHaveText("İngilizce");
  expect(l.mock.requests.length).toBe(0); // internete hiç çıkmadı
  // Anahtar yokken özet → anlaşılır hata
  await page.click("#summarizeBtn");
  await expect(page.locator("#statusLine")).toHaveText("Groq API anahtarı gerekli. Ayarlar'dan anahtarını gir.");
  await l.close();
});

test("ayarlar: anahtar test/kaydet, mod, model listesi, dil, tema, kısayol", async () => {
  const l = await launch({ apiKey: null });
  const { page } = l;
  await expect(page.locator("#setupBanner")).toBeVisible();
  await page.click("#setupBannerBtn");
  await expect(page.locator("#settingsOverlay")).toBeVisible();

  await page.fill("#apiKeyInput", "yanlis");
  await page.click("#apiKeyTest");
  await expect(page.locator("#keyStatus")).toHaveText("Groq anahtarı geçersiz veya yetkisiz. Ayarlar'dan kontrol et.");
  await page.fill("#apiKeyInput", "test-key");
  await page.click("#apiKeyTest");
  await expect(page.locator("#keyStatus")).toHaveText("Anahtar geçerli ✓");
  await page.click("#apiKeySave");
  await expect(page.locator("#keyStatus")).toHaveText("Kaydedildi ✓");
  await expect(page.locator("#setupBanner")).toBeHidden();
  expect(readFileSync(path.join(l.userData, "settings.json"), "utf8")).toContain("test-key"); // test ortamında düz depo

  await page.click('#modeSegmented [data-mode="local"]');
  await expect(page.locator("#localModels")).toBeVisible();
  await expect(page.locator("#modelList .model-row")).toHaveCount(4);
  await expect(page.locator("#nllbRow .model-row")).toHaveCount(1);
  await page.locator("#modelList .model-row").first().click();
  await expect(page.locator("#modelList .model-row").first()).toHaveClass(/is-selected/);
  await shot(page, "flow-settings");

  await page.click('[data-stab="general"]');
  await page.click("#shortcutInput");
  await page.keyboard.press("Control+Shift+K");
  await expect(page.locator("#shortcutInput")).toHaveValue("CommandOrControl+Shift+K");
  await page.click('[data-theme-opt="dark"]');
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.selectOption("#uiLangSelect", "en");
  await expect(page.locator(".hero__tagline")).toHaveText("Speak, and watch it become text instantly.");
  await expect(page.locator("#settingsTitle")).toHaveText("Settings");
  await page.click("#settingsClose");
  await shot(page, "flow-dark-en");

  const saved = JSON.parse(readFileSync(path.join(l.userData, "settings.json"), "utf8"));
  expect(saved).toMatchObject({ mode: "local", localModel: "tiny", theme: "dark", uiLang: "en", shortcut: "CommandOrControl+Shift+K" });
  await l.close();
});

test("hatalar: anahtarsız API modu, bozuk dosya, sessiz kayıt", async () => {
  const l = await launch({ apiKey: null });
  const { page } = l;
  await uploadFile(l, WAV_EN);
  await expect(page.locator("#statusLine")).toHaveText("Groq API anahtarı gerekli. Ayarlar'dan anahtarını gir.", { timeout: 30_000 });
  await expect(page.locator("#jobBox")).toBeHidden();

  const bad = path.join(l.userData, "bozuk.mp3");
  writeFileSync(bad, "ses değil");
  await stubOpenDialog(l, bad);
  await page.click("#dropzone");
  await expect(page.locator("#statusLine")).toHaveText(/Ses dosyası okunamadı/);

  const silent = path.join(l.userData, "sessiz.wav");
  const pcm = Buffer.alloc(16000 * 2 * 3);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(16000, 24);
  header.writeUInt32LE(32000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  writeFileSync(silent, Buffer.concat([header, pcm]));
  await stubOpenDialog(l, silent);
  await page.click("#dropzone");
  await expect(page.locator("#statusLine")).toHaveText("Kayıtta konuşma algılanmadı.");
  expect(existsSync(path.join(l.userData, "history", "index.json"))).toBe(true);
  await l.close();
});

test("offline çeviri worker'ı (transformers.js) paketli uygulamada yüklenir", async () => {
  // Bu ortamda Hugging Face erişimi yok: model indirme hatası beklenir — ama modül çözümlemesi
  // ve onnxruntime-node yüklemesi bu noktaya kadar başarılı olmalıdır.
  const l = await launch({ settings: { mode: "local" } });
  const { page } = l;
  const res = await page.evaluate(async () => {
    const api = (window as unknown as { yazbunu: { translate(a: unknown): Promise<unknown> } }).yazbunu;
    try {
      await api.translate({ jobId: "t1", recordId: null, segments: [{ start: 0, end: 1, text: "Merhaba" }], source: "tr", target: "en" });
      return "ok";
    } catch (e) {
      return JSON.stringify(e);
    }
  });
  expect(res === "ok" || /errModelDownload/.test(res)).toBe(true);
  expect(res).not.toMatch(/Cannot find module|MODULE_NOT_FOUND/);
  await l.close();
});

test("offline modeli arayüzden indir (GitHub, gerçek ağ) ve kullan", async () => {
  test.setTimeout(600_000);
  const l = await launch({ apiKey: null, settings: { mode: "local", localModel: "tiny" } });
  const { page } = l;
  await page.click("#settingsBtn");
  const tinyRow = page.locator("#modelList .model-row").first();
  await tinyRow.locator('button[data-act="download"]').click();
  await expect(tinyRow.locator(".progress-bar")).toBeVisible({ timeout: 30_000 });
  await expect(tinyRow).toContainText("İndirildi", { timeout: 540_000 });
  await page.click("#settingsClose");
  await uploadFile(l, WAV_EN);
  await expect(page.locator("#segments")).toContainText(/heaven/i, { timeout: 120_000 });
  await l.close();
});

test("offline modda model yokken kayıt başlamaz, anlaşılır uyarı verir", async () => {
  const l = await launch({ fakeAudio: WAV_EN, settings: { mode: "local", localModel: "small" } });
  const { page } = l;
  await page.click("#recordBtn");
  await expect(page.locator("#statusLine")).toHaveText("Offline model henüz indirilmedi. Ayarlar'dan indir.");
  await expect(page.locator("#recorder")).not.toHaveClass(/is-recording/);
  await l.close();
});
