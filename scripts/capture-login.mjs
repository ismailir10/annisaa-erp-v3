/**
 * Captures the real login screen into `docs/archive/legacy-doc-dirs/proposals/login-redesign/` at
 * desktop + mobile widths, and asserts the layout contract the redesign
 * promised.
 *
 *   npm run build
 *   npm run start -- --port 3120         # NOT DEMO_MODE — the Supabase branch
 *   node scripts/capture-login.mjs [baseUrl]
 *
 * Note the missing `DEMO_MODE=true`: with it set, `/` renders the demo-mode
 * account picker instead of the Google sign-in screen. `.env` supplies
 * NEXT_PUBLIC_SUPABASE_URL, which is what the page branches on.
 *
 * Read-only — it loads one page and never signs in.
 *
 * Asserted:
 *   - the Google button is >= 48px tall at every width (it used to be 36px)
 *   - at 390px the Google button sits ABOVE the brand panel, i.e. the primary
 *     action is thumb-reachable rather than buried under the pitch
 *   - nothing overflows the viewport horizontally
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3120";
const OUT = "docs/archive/legacy-doc-dirs/proposals/login-redesign";
const SHOTS = [
  { tag: "login-desktop-1280", w: 1280, h: 860 },
  { tag: "login-mobile-390", w: 390, h: 844 },
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ deviceScaleFactor: 2 });

let failures = 0;

for (const { tag, w, h } of SHOTS) {
  const page = await context.newPage();
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

  const button = page.getByRole("button", { name: /Masuk dengan Google/ });
  await button.waitFor({ state: "visible", timeout: 15_000 });
  // The entrance transition is 420ms; settle before measuring or shooting.
  await page.waitForTimeout(900);

  const btnBox = await button.boundingBox();
  if (btnBox.height < 48) {
    console.error(`  ✗ ${tag}: Google button ${btnBox.height}px < 48px`);
    failures += 1;
  }

  // The brand panel is anchored by its tagline heading — a real user-visible
  // string, so this assertion breaks if the panel is removed or reordered.
  const brand = page.getByRole("heading", { name: "Sahabat belajar anak" });
  const brandBox = await brand.boundingBox();

  if (w < 1024) {
    if (!(btnBox.y < brandBox.y)) {
      console.error(
        `  ✗ ${tag}: Google button y=${btnBox.y} is not above the brand panel y=${brandBox.y}`,
      );
      failures += 1;
    }
  } else if (!(brandBox.x < btnBox.x)) {
    console.error(
      `  ✗ ${tag}: expected the brand panel left of the sign-in column ` +
        `(brand x=${brandBox.x}, button x=${btnBox.x})`,
    );
    failures += 1;
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 0.5,
  );
  if (overflow) {
    console.error(`  ✗ ${tag}: horizontal overflow at ${w}px`);
    failures += 1;
  }

  await page.screenshot({ path: `${OUT}/${tag}.png`, fullPage: true });
  console.log(
    `  wrote ${OUT}/${tag}.png  (button ${btnBox.height}px @ y=${Math.round(btnBox.y)}, ` +
      `brand @ x=${Math.round(brandBox.x)} y=${Math.round(brandBox.y)}, overflow: ${overflow})`,
  );
  await page.close();
}

await browser.close();

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nLogin screen: button >= 48px, mobile action above the brand panel, no overflow.");
