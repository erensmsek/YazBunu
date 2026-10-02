import { describe, expect, it } from "vitest";
import path from "node:path";
import { existsSync } from "node:fs";
import { RecordingSession } from "../../src/main/live";
import type { EngineOptions, RangeResult, TranscriptionEngine } from "../../src/main/engine";
import { AppError } from "../../src/main/errors";
import { tmpDir } from "../helpers/env";
import type { LiveUpdate } from "../../src/shared/types";

const opts: Omit<EngineOptions, "signal"> = { mode: "api", localModel: "tiny", transcribeModel: "m", language: "", diarize: false, numSpeakers: 0 };

function fakeEngine(behaviour: { failFirst?: boolean } = {}) {
  const dir = tmpDir("yb-live-");
  const spans: [number, number][] = [];
  let n = 0;
  let failed = false;
  const engine = {
    tmpFile: (ext: string) => path.join(dir, `f${n++}${ext}`),
    transcribeRange: async (_pcm: string, start: number, end: number): Promise<RangeResult> => {
      spans.push([start, end]);
      if (behaviour.failFirst && !failed) {
        failed = true;
        throw new AppError("errNetwork", "down");
      }
      return { language: "tr", skipped: false, segments: [{ start, end, text: `[${start.toFixed(1)}-${end.toFixed(1)}]` }] };
    },
    transcribeAll: async (_pcm: string) => ({ result: { language: "tr", text: "tam", segments: [{ start: 0, end: 1, text: "tam" }], duration: 1 }, warnings: [] }),
    diarize: async (_pcm: string, segs: unknown[]) => (segs as { speaker?: string }[]).map((s) => ({ ...s, speaker: "S1" })),
  };
  return { engine: engine as unknown as TranscriptionEngine, spans };
}

/** 13 sn konuşma + 1 sn sessizlik desenini 250 ms'lik paketler halinde besler. */
function feed(session: RecordingSession, pattern: [number, boolean][]) {
  for (const [sec, speech] of pattern) {
    const packets = Math.round(sec * 4);
    for (let p = 0; p < packets; p++) {
      const s = new Int16Array(4000);
      if (speech) for (let i = 0; i < s.length; i++) s[i] = Math.round((Math.random() * 2 - 1) * 9000);
      session.write(s);
    }
  }
}

const settle = () => new Promise((r) => setTimeout(r, 50));

describe("RecordingSession (canlı)", () => {
  it("sessiz anlardan keser, parçaları sırayla yazıya döker, durdurunca kalanı işler", async () => {
    const { engine, spans } = fakeEngine();
    const session = new RecordingSession("s1", engine, opts, true);
    const updates: LiveUpdate[] = [];
    session.on("update", (u) => updates.push(u));
    feed(session, [[13, true], [1, false], [13, true], [1, false], [5, true]]);
    await settle();
    expect(spans.length).toBe(2);
    expect(spans[0][1]).toBeGreaterThanOrEqual(13);
    expect(spans[0][1]).toBeLessThanOrEqual(14);
    expect(spans[1][0]).toBe(spans[0][1]);
    expect(updates.at(-1)!.segments.length).toBe(2);
    const { result, pcmPath } = await session.stop();
    expect(spans.length).toBe(3);
    expect(spans[2][1]).toBeCloseTo(33, 0);
    expect(result.segments.map((s) => s.start)).toEqual([...result.segments.map((s) => s.start)].sort((a, b) => a - b));
    expect(result.duration).toBeCloseTo(33, 0);
    expect(existsSync(pcmPath)).toBe(true);
  });

  it("başarısız parçayı kayıt sonunda yeniden dener", async () => {
    const { engine, spans } = fakeEngine({ failFirst: true });
    const session = new RecordingSession("s2", engine, opts, true);
    const errors: unknown[] = [];
    session.on("chunkError", (e) => errors.push(e));
    feed(session, [[13, true], [1, false], [6, true]]);
    await settle();
    expect(errors).toEqual([{ code: "errNetwork", detail: "down" }]);
    const { result } = await session.stop();
    // ilk parça (başarısız) + kalan parça + ilk parçanın yeniden denemesi
    expect(spans.length).toBe(3);
    expect(result.segments.length).toBe(2);
    expect(result.segments[0].start).toBe(0);
  });

  it("canlı kapalıyken kayıt sonunda tek seferde yazıya döker", async () => {
    const { engine, spans } = fakeEngine();
    const session = new RecordingSession("s3", engine, opts, false);
    feed(session, [[20, true]]);
    const { result } = await session.stop();
    expect(spans.length).toBe(0);
    expect(result.text).toBe("tam");
  });

  it("diyarizasyon açıksa kayıt sonunda konuşmacı atar", async () => {
    const { engine } = fakeEngine();
    const session = new RecordingSession("s4", engine, { ...opts, diarize: true }, true);
    feed(session, [[5, true]]);
    const { result } = await session.stop();
    expect(result.segments.every((s) => s.speaker === "S1")).toBe(true);
  });

  it("çok kısa kayıtta errNoSpeech; iptal dosyayı siler", async () => {
    const { engine } = fakeEngine();
    const s = new RecordingSession("s5", engine, opts, true);
    feed(s, [[0.25, true]]);
    await expect(s.stop()).rejects.toMatchObject({ code: "errNoSpeech" });
    const s2 = new RecordingSession("s6", engine, opts, true);
    feed(s2, [[2, true]]);
    await s2.cancel();
    expect(existsSync(s2.pcmPath)).toBe(false);
  });
});
