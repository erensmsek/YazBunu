import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { I18N_LANGS, I18N_ROWS, hasKey, pickUiLang, translate } from "../../src/shared/i18n";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("i18n tablosu", () => {
  it("her satırda 11 dil var ve boş metin yok", () => {
    for (const row of I18N_ROWS) {
      expect(row, row[0]).toHaveLength(I18N_LANGS.length + 1);
      for (const v of row) expect(v.trim().length, row[0]).toBeGreaterThan(0);
    }
  });

  it("anahtarlar benzersiz", () => {
    const keys = I18N_ROWS.map((r) => r[0]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("yer tutucular tüm dillerde aynı", () => {
    for (const [key, ...vals] of I18N_ROWS) {
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
      for (const v of vals) expect(ph(v), key).toBe(ph(vals[0]));
    }
  });

  it("koddaki tüm AppError kodları ve i18n anahtarları tabloda var", () => {
    const src = walk(path.join(__dirname, "../../src")).filter((f) => f.endsWith(".ts"));
    const missing: string[] = [];
    for (const f of src) {
      const code = readFileSync(f, "utf8");
      for (const m of code.matchAll(/new AppError\("([a-zA-Z]+)"/g)) if (!hasKey(m[1])) missing.push(`${path.basename(f)}: ${m[1]}`);
      for (const m of code.matchAll(/\bt\("([a-zA-Z]+)"/g)) if (!hasKey(m[1])) missing.push(`${path.basename(f)}: ${m[1]}`);
      for (const m of code.matchAll(/code: "([a-zA-Z]+)"/g)) if (!hasKey(m[1])) missing.push(`${path.basename(f)}: ${m[1]}`);
    }
    const html = path.join(__dirname, "../../src/renderer/index.html");
    try {
      const page = readFileSync(html, "utf8");
      for (const m of page.matchAll(/data-i18n(?:-html|-aria|-placeholder|-title)?="([a-zA-Z]+)"/g)) {
        if (!hasKey(m[1])) missing.push(`index.html: ${m[1]}`);
      }
    } catch {
      /* renderer henüz yok */
    }
    expect(missing).toEqual([]);
  });

  it("çeviri ve yer tutucu değişimi", () => {
    expect(translate("tr", "speakerDefault", { n: 3 })).toBe("Konuşmacı 3");
    expect(translate("en", "speakerDefault", { n: 3 })).toBe("Speaker 3");
    expect(translate("xx", "saveBtn")).toBe("Save");
    expect(translate("tr", "yokBoyleAnahtar")).toBe("yokBoyleAnahtar");
  });

  it("işletim sistemi dilinden arayüz dili", () => {
    expect(pickUiLang("tr-TR")).toBe("tr");
    expect(pickUiLang("pt_BR")).toBe("pt");
    expect(pickUiLang("nl-NL")).toBe("en");
    expect(pickUiLang(undefined)).toBe("en");
  });
});
