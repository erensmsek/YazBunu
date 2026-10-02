import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { HistoryStore, newRecordId } from "../../src/main/history";
import { SettingsStore, defaultSettings, sanitizePatch, type KeyCipher } from "../../src/main/settings";
import type { HistoryRecord } from "../../src/shared/types";

const tmp = () => mkdtempSync(path.join(os.tmpdir(), "yb-store-"));

function record(text: string, updatedAt = Date.now()): HistoryRecord {
  return {
    id: newRecordId(),
    version: 2,
    title: text.slice(0, 20),
    createdAt: updatedAt,
    updatedAt,
    language: "tr",
    duration: 3,
    text,
    segments: [{ start: 0, end: 3, text }],
    speakers: {},
    translation: null,
    summary: null,
    polish: null,
    audioFile: null,
    source: "mic",
  };
}

describe("HistoryStore", () => {
  it("kaydeder, listeler (yeniden eskiye), arar, siler", async () => {
    const store = new HistoryStore(tmp());
    await store.init();
    const a = await store.save(record("elma armut", 1000));
    const b = await store.save(record("muz kiraz", 2000));
    expect((await store.list()).map((e) => e.id)).toEqual([b.id, a.id]);
    expect((await store.search("armut")).map((e) => e.id)).toEqual([a.id]);
    expect(await store.get(a.id)).toMatchObject({ text: "elma armut" });
    await store.remove(a.id);
    expect((await store.list()).map((e) => e.id)).toEqual([b.id]);
    expect(await store.get(a.id)).toBeNull();
  });

  it("tam metin araması önizlemede olmayanı da bulur", async () => {
    const store = new HistoryStore(tmp());
    await store.init();
    const long = "x ".repeat(200) + "gizlikelime";
    const r = await store.save(record(long));
    expect((await store.search("gizlikelime")).map((e) => e.id)).toEqual([r.id]);
  });

  it("index.json silinirse kayıtlardan geri kurulur", async () => {
    const dir = tmp();
    const store = new HistoryStore(dir);
    await store.init();
    const r = await store.save(record("kurtarılacak"));
    rmSync(path.join(dir, "index.json"));
    const fresh = new HistoryStore(dir);
    await fresh.init();
    expect((await fresh.list()).map((e) => e.id)).toEqual([r.id]);
  });

  it("eşzamanlı kayıtlar index'i bozmaz", async () => {
    const store = new HistoryStore(tmp());
    await store.init();
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.save(record(`kayıt ${i}`, i))));
    expect(await store.list()).toHaveLength(20);
  });

  it("geçersiz kimlik ve yol geçişi engellenir", async () => {
    const store = new HistoryStore(tmp());
    await store.init();
    expect(await store.get("../../etc/passwd")).toBeNull();
    expect(path.basename(store.audioPath("../../secret.txt"))).toBe("secret.txt");
    expect(store.audioPath("../../secret.txt").startsWith(store.audioDir)).toBe(true);
  });
});

const fakeCipher = (available = true): KeyCipher => ({
  available: () => available,
  encrypt: (s) => Buffer.from(s).toString("base64").split("").reverse().join(""),
  decrypt: (s) => Buffer.from(s.split("").reverse().join(""), "base64").toString(),
});

describe("SettingsStore", () => {
  it("varsayılanlar, güncelleme ve kalıcılık", async () => {
    const file = path.join(tmp(), "settings.json");
    const store = new SettingsStore(file, fakeCipher(), defaultSettings("tr"));
    await store.load();
    expect(store.get().mode).toBe("api");
    await store.update({ mode: "local", numSpeakers: 3, bilinmeyen: 1 });
    const again = new SettingsStore(file, fakeCipher(), defaultSettings("tr"));
    await again.load();
    expect(again.get()).toMatchObject({ mode: "local", numSpeakers: 3 });
    expect((again.get() as unknown as Record<string, unknown>).bilinmeyen).toBeUndefined();
  });

  it("API anahtarı şifreli saklanır, düz metin dosyada yer almaz", async () => {
    const file = path.join(tmp(), "settings.json");
    const store = new SettingsStore(file, fakeCipher(), defaultSettings("tr"));
    await store.load();
    await store.setApiKey("gsk_gizli");
    const raw = readFileSync(file, "utf8");
    expect(raw).not.toContain("gsk_gizli");
    expect(raw).toContain("apiKeyEnc");
    const again = new SettingsStore(file, fakeCipher(), defaultSettings("tr"));
    await again.load();
    expect(again.getApiKey()).toBe("gsk_gizli");
    expect(again.getPublic().hasApiKey).toBe(true);
    expect(JSON.stringify(again.getPublic())).not.toContain("gsk_gizli");
  });

  it("güvenli depo yoksa düz saklar ve bunu bildirir", async () => {
    const file = path.join(tmp(), "settings.json");
    const store = new SettingsStore(file, fakeCipher(false), defaultSettings("tr"));
    await store.load();
    await store.setApiKey("k");
    expect(store.getPublic().keyStorage).toBe("plain");
    expect(JSON.parse(readFileSync(file, "utf8")).apiKeyPlain).toBe("k");
  });

  it("bozuk dosya varsayılanlara döner; çözülemeyen anahtar yok sayılır", async () => {
    const file = path.join(tmp(), "settings.json");
    writeFileSync(file, "{bozuk");
    const store = new SettingsStore(file, fakeCipher(), defaultSettings("en"));
    await store.load();
    expect(store.get().uiLang).toBe("en");
    writeFileSync(file, JSON.stringify({ apiKeyEnc: "%%%" }));
    const s2 = new SettingsStore(file, { ...fakeCipher(), decrypt: () => { throw new Error("x"); } }, defaultSettings("en"));
    await s2.load();
    expect(s2.getApiKey()).toBeNull();
  });

  it("ortam değişkenindeki anahtar yedek olarak kullanılır", async () => {
    const store = new SettingsStore(path.join(tmp(), "s.json"), fakeCipher(), defaultSettings("tr"), "env-key");
    await store.load();
    expect(store.getApiKey()).toBe("env-key");
  });

  it("sanitizePatch tip ve aralık kontrolü", () => {
    const base = defaultSettings("tr");
    expect(sanitizePatch({ mode: "uzay", numSpeakers: 99, diarize: "evet", groqLlmModel: "  " }, base)).toEqual({ numSpeakers: 12, groqLlmModel: "qwen/qwen3-32b" });
  });
});
