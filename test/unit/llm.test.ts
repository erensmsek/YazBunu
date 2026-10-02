import { describe, expect, it } from "vitest";
import { LlmService, POLISH_CHUNK_CHARS, SUMMARY_CHUNK_CHARS } from "../../src/main/llm";
import { AppError } from "../../src/main/errors";
import type { ChatOptions, ChatResult, GroqClient } from "../../src/main/groq";

type Handler = (o: ChatOptions) => ChatResult | Promise<ChatResult>;
function fakeGroq(handler: Handler) {
  const calls: ChatOptions[] = [];
  const groq = {
    chat: async (o: ChatOptions) => {
      calls.push(o);
      return handler(o);
    },
  } as unknown as GroqClient;
  return { groq, calls };
}

const sentence = "Bugün toplantıda bütçe ve takvim konuşuldu. ";

describe("özet", () => {
  it("kısa metin tek istekle, hedef dilde özetlenir", async () => {
    const { groq, calls } = fakeGroq(() => ({ content: "özet", finishReason: "stop" }));
    const out = await new LlmService(groq, () => "m").summarize("kısa metin", "en");
    expect(out).toBe("özet");
    expect(calls).toHaveLength(1);
    expect(calls[0].system).toContain("English");
  });

  it("uzun metin map-reduce ile (bölüm notları + son özet) işlenir", async () => {
    const { groq, calls } = fakeGroq((o) => ({ content: /not alma/.test(o.system) ? "- not" : "son özet", finishReason: "stop" }));
    const text = sentence.repeat(Math.ceil((SUMMARY_CHUNK_CHARS * 2.5) / sentence.length));
    const progress: number[] = [];
    const out = await new LlmService(groq, () => "m").summarize(text, "tr", { onProgress: (f) => progress.push(f) });
    expect(out).toBe("son özet");
    const mapCalls = calls.filter((c) => /not alma/.test(c.system));
    expect(mapCalls.length).toBe(3);
    expect(calls.at(-1)!.user).toContain("- not");
    expect(progress.at(-1)).toBe(1);
  });
});

describe("iyileştirme (polish)", () => {
  it("uzun metni bölümlere ayırır; yalnızca ilk bölüm H1 alır", async () => {
    const { groq, calls } = fakeGroq((o) => ({ content: /DEVAMIDIR/.test(o.system) ? "## devam" : "# başlık", finishReason: "stop" }));
    const text = sentence.repeat(Math.ceil((POLISH_CHUNK_CHARS * 2.2) / sentence.length));
    const out = await new LlmService(groq, () => "m").polish(text, "tr");
    expect(calls.length).toBe(3);
    expect(out.split("\n\n")).toEqual(["# başlık", "## devam", "## devam"]);
  });

  it("çıktı kesilirse (finish_reason=length) bölüp yeniden dener — sessizce kesmez", async () => {
    let first = true;
    const { groq, calls } = fakeGroq((o) => {
      if (first) {
        first = false;
        return { content: "yarım...", finishReason: "length" };
      }
      return { content: o.user.length > 0 ? "parça" : "", finishReason: "stop" };
    });
    const out = await new LlmService(groq, () => "m").polish(sentence.repeat(20), "tr");
    expect(calls.length).toBe(3);
    expect(out).toBe("parça\n\nparça");
    expect(calls[2].system).toContain("DEVAMIDIR");
  });

  it("413 (çok büyük) hatasında da böler", async () => {
    let n = 0;
    const { groq } = fakeGroq(() => {
      if (n++ === 0) throw new AppError("errTooLarge", "tpm");
      return { content: "ok", finishReason: "stop" };
    });
    expect(await new LlmService(groq, () => "m").polish(sentence.repeat(10), "tr")).toBe("ok\n\nok");
  });
});

describe("çeviri", () => {
  it("JSON toplu çeviri; boş segmentler gönderilmez", async () => {
    const { groq, calls } = fakeGroq((o) => {
      const input = JSON.parse(o.user) as Record<string, string>;
      return { content: JSON.stringify(Object.fromEntries(Object.entries(input).map(([k, v]) => [k, v.toUpperCase()]))), finishReason: "stop" };
    });
    const out = await new LlmService(groq, () => "m").translate(["a", "", "b"], "tr", "en");
    expect(out).toEqual(["A", "", "B"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].json).toBe(true);
    expect(calls[0].system).toContain("from Turkish to English");
  });

  it("eksik anahtar dönerse yarıya bölüp tekrar dener, tek segmentte düz çeviriye düşer", async () => {
    const { groq, calls } = fakeGroq((o) => {
      if (!o.json) return { content: `düz:${o.user}`, finishReason: "stop" };
      const input = JSON.parse(o.user) as Record<string, string>;
      const keys = Object.keys(input);
      // Model "y" ve "w" değerlerini JSON modunda hep düşürsün
      const outObj = Object.fromEntries(keys.filter((k) => !["y", "w"].includes(input[k])).map((k) => [k, `t:${input[k]}`]));
      return { content: JSON.stringify(outObj), finishReason: "stop" };
    });
    const out = await new LlmService(groq, () => "m").translate(["x", "y", "z", "w"], "tr", "en");
    expect(out).toEqual(["t:x", "düz:y", "t:z", "düz:w"]);
    expect(calls.some((c) => !c.json)).toBe(true);
  });

  it("geçersiz JSON da bölmeyi tetikler", async () => {
    const { groq } = fakeGroq((o) => {
      const input = JSON.parse(o.user) as Record<string, string>;
      if (Object.keys(input).length > 1) return { content: "{bozuk", finishReason: "stop" };
      return { content: JSON.stringify({ "0": `ok:${input["0"]}` }), finishReason: "stop" };
    });
    expect(await new LlmService(groq, () => "m").translate(["a", "b", "c"], "tr", "de")).toEqual(["ok:a", "ok:b", "ok:c"]);
  });
});

describe("model yedekleme", () => {
  it("model kaldırılmışsa yedek modele geçer ve onu hatırlar", async () => {
    const { groq, calls } = fakeGroq((o) => {
      if (o.model === "eski/model") throw new AppError("errModelGone", "gone");
      return { content: `ok:${o.model}`, finishReason: "stop" };
    });
    const svc = new LlmService(groq, () => "eski/model");
    expect(await svc.summarize("x", "tr")).toBe("ok:openai/gpt-oss-120b");
    await svc.summarize("y", "tr");
    expect(calls.at(-1)!.model).toBe("openai/gpt-oss-120b");
  });

  it("diğer hatalar yedeğe geçmeden fırlatılır", async () => {
    const { groq, calls } = fakeGroq(() => {
      throw new AppError("errInvalidKey");
    });
    await expect(new LlmService(groq, () => "m").summarize("x", "tr")).rejects.toMatchObject({ code: "errInvalidKey" });
    expect(calls).toHaveLength(1);
  });
});
