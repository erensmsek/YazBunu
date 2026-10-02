// Güncelleme kontrolü: GitHub'daki son sürümü okur, daha yeniyse bildirir.
// Otomatik kurulum yok: imzasız macOS uygulamaları kendini güncelleyemez; kullanıcı indirme sayfasına gider.
import type { FetchLike } from "./groq";
import type { UpdateInfo } from "../shared/types";

export const RELEASES_API = "https://api.github.com/repos/erensmsek/YazBunu/releases/latest";

/** "v2.1.0" ile "2.0.3" karşılaştırması: a > b ise pozitif. */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^v/, "").split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export async function checkForUpdate(current: string, fetchFn: FetchLike): Promise<UpdateInfo | null> {
  const resp = await fetchFn(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } });
  if (!resp.ok) return null;
  const data = (await resp.json()) as { tag_name?: string; html_url?: string; draft?: boolean; prerelease?: boolean };
  if (!data.tag_name || data.draft || data.prerelease) return null;
  if (compareVersions(data.tag_name, current) <= 0) return null;
  return { latest: data.tag_name.replace(/^v/, ""), url: data.html_url ?? "https://github.com/erensmsek/YazBunu/releases" };
}
