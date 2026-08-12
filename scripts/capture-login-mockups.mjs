/**
 * Headless-renders the login-redesign mockups into
 * `docs/proposals/login-redesign/` at desktop + mobile widths.
 *
 *   node scripts/capture-login-mockups.mjs
 *
 * Same shape as scripts/capture-parent-nav.mjs, but loads static file:// mockups
 * instead of the running app — these are proposals, not shipped pages. Also
 * asserts the single primary action clears the 44px touch minimum and that
 * nothing overflows the viewport horizontally.
 */
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const DIR = "docs/proposals/login-redesign";
const SHOTS = [
  { file: "mockup-a-quiet-card.html", tag: "a-desktop", w: 1280, h: 860 },
  { file: "mockup-a-quiet-card.html", tag: "a-mobile", w: 390, h: 844 },
  { file: "mockup-a-quiet-card.html", tag: "a-mobile-error", w: 390, h: 844, query: "?state=error" },
  { file: "mockup-b-split-brand.html", tag: "b-desktop", w: 1280, h: 860 },
  { file: "mockup-b-split-brand.html", tag: "b-mobile", w: 390, h: 844 },
];

const browser = await chromium.launch();
const context = await browser.newContext({ deviceScaleFactor: 2 });

let failures = 0;

for (const { file, tag, w, h, query = "" } of SHOTS) {
  const page = await context.newPage();
  await page.setViewportSize({ width: w, height: h });
  const url = pathToFileURL(resolve(DIR, file)).href + query;
  await page.goto(url, { waitUntil: "networkidle" });
  // Let the webfont swap in before the shot; the entrance animation is 420ms.
  await page.waitForTimeout(900);

  const btn = page.locator("button.google");
  const box = await btn.boundingBox();
  if (box.height < 44) {
    console.error(`  ✗ ${tag}: primary button ${box.height}px < 44px`);
    failures += 1;
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 0.5,
  );
  if (overflow) {
    console.error(`  ✗ ${tag}: horizontal overflow at ${w}px`);
    failures += 1;
  }

  await page.screenshot({ path: `${DIR}/${tag}.png`, fullPage: true });
  console.log(`  wrote ${DIR}/${tag}.png  (button ${box.height}px, no overflow: ${!overflow})`);
  await page.close();
}

await browser.close();

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll mockups: primary action >= 44px, no horizontal overflow.");
