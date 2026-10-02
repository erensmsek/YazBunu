// E2E yardımcıları: izole veri klasörü + sahte Groq ile Electron uygulamasını başlatır.
import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startMockGroq, type MockGroq } from "../helpers/mock-groq";

export const ROOT = path.resolve(__dirname, "../..");

export interface Launched {
  app: ElectronApplication;
  page: Page;
  mock: MockGroq;
  userData: string;
  saveDir: string;
  close: () => Promise<void>;
}

export async function launch(opts: { settings?: Record<string, unknown>; apiKey?: string | null; fakeAudio?: string } = {}): Promise<Launched> {
  const mock = await startMockGroq();
  const userData = mkdtempSync(path.join(os.tmpdir(), "yb-e2e-"));
  const saveDir = path.join(userData, "exports");
  mkdirSync(saveDir, { recursive: true });
  const settings = { uiLang: "tr", liveTranscription: true, ...(opts.settings ?? {}) };
  // Test ortamında güvenli depo yok: anahtar düz metin olarak önceden yazılır.
  writeFileSync(
    path.join(userData, "settings.json"),
    JSON.stringify({ ...settings, ...(opts.apiKey === null ? {} : { apiKeyPlain: opts.apiKey ?? "test-key" }) }),
  );
  // YAZBUNU_E2E_EXECUTABLE verilirse testler paketlenmiş uygulama üzerinde çalışır.
  const packaged = process.env.YAZBUNU_E2E_EXECUTABLE;
  const args = [...(packaged ? [] : [ROOT]), "--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];
  if (opts.fakeAudio) args.push(`--use-file-for-fake-audio-capture=${opts.fakeAudio}`);
  const app = await electron.launch({
    ...(packaged ? { executablePath: packaged } : {}),
    args,
    env: {
      ...process.env,
      YAZBUNU_USER_DATA: userData,
      YAZBUNU_GROQ_BASE_URL: mock.url,
      YAZBUNU_SAVE_DIR: saveDir,
      GROQ_API_KEY: "",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    },
  });
  const page = await app.firstWindow();
  page.on("console", (m) => {
    if (m.type() === "error") console.log("[renderer]", m.text());
  });
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  await page.waitForSelector("body.is-ready");
  return {
    app,
    page,
    mock,
    userData,
    saveDir,
    close: async () => {
      await app.close().catch(() => undefined);
      await mock.close();
    },
  };
}
