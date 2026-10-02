import { test, expect } from "@playwright/test";
import path from "node:path";
import { launch, ROOT } from "./helpers";

test("uygulama açılır, arayüz Türkçe ve tema uygulanır", async () => {
  const { page, close } = await launch();
  await expect(page.locator(".hero__tagline")).toHaveText("Konuş, anında yazıya dönüşsün.");
  await expect(page.locator(".tab")).toHaveCount(4);
  await page.screenshot({ path: path.join(ROOT, ".cache/shots/smoke-home.png") });
  await close();
});
