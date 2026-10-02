// Disk tabanlı geçmiş: history/index.json + history/records/<id>.json + history/audio/<dosya>.
// localStorage'ın ~5 MB kotası yok; yazmalar atomik (tmp + rename) → çökmede bozulmaz.
import { promises as fsp } from "node:fs";
import path from "node:path";
import type { HistoryIndexEntry, HistoryRecord } from "../shared/types";

async function writeAtomic(file: string, data: string): Promise<void> {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, data, "utf8");
  await fsp.rename(tmp, file);
}

function toEntry(r: HistoryRecord): HistoryIndexEntry {
  return {
    id: r.id,
    title: r.title,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    language: r.language,
    duration: r.duration,
    hasAudio: Boolean(r.audioFile),
    preview: r.text.slice(0, 160),
  };
}

const ID_RE = /^[a-zA-Z0-9_-]{1,80}$/;

export function newRecordId(): string {
  return `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export class HistoryStore {
  private index: HistoryIndexEntry[] | null = null;
  private writeChain: Promise<unknown> = Promise.resolve();

  constructor(private readonly dir: string) {}

  get recordsDir(): string {
    return path.join(this.dir, "records");
  }

  get audioDir(): string {
    return path.join(this.dir, "audio");
  }

  private recordPath(id: string): string {
    if (!ID_RE.test(id)) throw new Error(`invalid record id: ${id}`);
    return path.join(this.recordsDir, `${id}.json`);
  }

  private get indexPath(): string {
    return path.join(this.dir, "index.json");
  }

  /** Yazmaları sıraya koyar: eşzamanlı iki kayıt index'i ezmesin. */
  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.writeChain.then(fn, fn);
    this.writeChain = next.catch(() => undefined);
    return next;
  }

  async init(): Promise<void> {
    await fsp.mkdir(this.recordsDir, { recursive: true });
    await fsp.mkdir(this.audioDir, { recursive: true });
    await this.loadIndex();
  }

  private async loadIndex(): Promise<HistoryIndexEntry[]> {
    if (this.index) return this.index;
    try {
      const parsed = JSON.parse(await fsp.readFile(this.indexPath, "utf8"));
      if (Array.isArray(parsed)) {
        this.index = parsed;
        return parsed;
      }
    } catch {
      /* yok ya da bozuk: kayıtlardan yeniden kur */
    }
    this.index = await this.rebuildIndex();
    return this.index;
  }

  /** index.json kaybolsa bile kayıt dosyalarından geri kurulur. */
  async rebuildIndex(): Promise<HistoryIndexEntry[]> {
    const entries: HistoryIndexEntry[] = [];
    let files: string[] = [];
    try {
      files = await fsp.readdir(this.recordsDir);
    } catch {
      files = [];
    }
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const rec = JSON.parse(await fsp.readFile(path.join(this.recordsDir, f), "utf8")) as HistoryRecord;
        if (rec?.id) entries.push(toEntry(rec));
      } catch {
        /* bozuk kayıt atlanır */
      }
    }
    entries.sort((a, b) => b.updatedAt - a.updatedAt);
    this.index = entries;
    await fsp.mkdir(this.dir, { recursive: true });
    await writeAtomic(this.indexPath, JSON.stringify(entries));
    return entries;
  }

  async list(query = ""): Promise<HistoryIndexEntry[]> {
    const all = [...(await this.loadIndex())].sort((a, b) => b.updatedAt - a.updatedAt);
    const q = query.trim().toLocaleLowerCase();
    if (!q) return all;
    return all.filter((e) => e.title.toLocaleLowerCase().includes(q) || e.preview.toLocaleLowerCase().includes(q));
  }

  /** Tam metin araması (önizlemede yoksa kayıt dosyasına bakar). */
  async search(query: string): Promise<HistoryIndexEntry[]> {
    const q = query.trim().toLocaleLowerCase();
    const all = await this.list();
    if (!q) return all;
    const out: HistoryIndexEntry[] = [];
    for (const e of all) {
      if (e.title.toLocaleLowerCase().includes(q) || e.preview.toLocaleLowerCase().includes(q)) {
        out.push(e);
        continue;
      }
      const rec = await this.get(e.id);
      if (rec && rec.text.toLocaleLowerCase().includes(q)) out.push(e);
    }
    return out;
  }

  async get(id: string): Promise<HistoryRecord | null> {
    try {
      return JSON.parse(await fsp.readFile(this.recordPath(id), "utf8")) as HistoryRecord;
    } catch {
      return null;
    }
  }

  async save(record: HistoryRecord): Promise<HistoryRecord> {
    return this.serialize(async () => {
      await writeAtomic(this.recordPath(record.id), JSON.stringify(record));
      const idx = await this.loadIndex();
      const entry = toEntry(record);
      const i = idx.findIndex((e) => e.id === record.id);
      if (i >= 0) idx[i] = entry;
      else idx.unshift(entry);
      await writeAtomic(this.indexPath, JSON.stringify(idx));
      return record;
    });
  }

  async remove(id: string): Promise<void> {
    return this.serialize(async () => {
      const rec = await this.get(id);
      await fsp.rm(this.recordPath(id), { force: true });
      if (rec?.audioFile) await fsp.rm(this.audioPath(rec.audioFile), { force: true });
      const idx = await this.loadIndex();
      this.index = idx.filter((e) => e.id !== id);
      await writeAtomic(this.indexPath, JSON.stringify(this.index));
    });
  }

  audioPath(fileName: string): string {
    // Yol geçişini (path traversal) engelle: yalnızca düz dosya adı.
    const base = path.basename(fileName);
    return path.join(this.audioDir, base);
  }
}
