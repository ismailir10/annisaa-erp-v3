/**
 * Captures the parent portal bottom nav at mobile widths into
 * `docs/proposals/parent-nav/`, and asserts nothing overflows the viewport.
 *
 *   DEMO_MODE=true npm run start        # or next dev
 *   node scripts/capture-parent-nav.mjs [baseUrl]
 *
 * Auth: resolves a GUARDIAN id from /api/auth/users and sets the demo session
 * cookie, the same way e2e/parent.spec.ts does. Read-only — it only loads
 * pages and opens the overflow sheet; it never posts.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3117";
const OUT = "docs/proposals/parent-nav";
const WIDTHS = [
  { w: 375, h: 812, tag: "375" },
  { w: 360, h: 800, tag: "360" },
];

mkdirSync(OUT, { recursive: true });

const users = await fetch(`${BASE}/api/auth/users`).then((r) => r.json());
const guardian = users.find((u) => u.role === "GUARDIAN");
if (!guardian) throw new Error("No GUARDIAN user in the demo DB");

const browser = await chromium.launch();
const context = await browser.newContext({ deviceScaleFactor: 2 });
await context.addCookies([
  { name: "school-erp-session", value: guardian.id, domain: "localhost", path: "/" },
]);

let failures = 0;

for (const { w, h, tag } of WIDTHS) {
  const page = await context.newPage();
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`${BASE}/parent`, { waitUntil: "networkidle" });

  const nav = page.getByRole("navigation", { name: "Navigasi utama orang tua" });
  await nav.waitFor({ state: "visible", timeout: 15_000 });

  const slots = await nav.locator("a, button").all();
  const report = [];
  for (const slot of slots) {
    const box = await slot.boundingBox();
    const label = (await slot.innerText()).trim();
    const clipped = box.x < -0.5 || box.x + box.width > w + 0.5;
    const smallTarget = box.width < 44 || box.height < 44;
    if (clipped || smallTarget) failures += 1;
    report.push(
      `    ${label.padEnd(10)} ${box.width.toFixed(1).padStart(6)}px @ ` +
        `${box.x.toFixed(1)}-${(box.x + box.width).toFixed(1)}` +
        `${clipped ? "  ✗ CLIPPED" : ""}${smallTarget ? "  ✗ TAP<44" : ""}`,
    );
  }
  console.log(`  ${tag}px — ${slots.length} slots`);
  console.log(report.join("\n"));

  await page.screenshot({ path: `${OUT}/fixed-${tag}-nav.png` });
  console.log(`  wrote ${OUT}/fixed-${tag}-nav.png`);

  // The trigger is a client component — clicking before hydration is a no-op,
  // so settle first and retry once rather than failing the capture.
  await page.waitForTimeout(1000);
  const sheetNav = page.getByRole("navigation", { name: "Menu lainnya" });
  await nav.getByRole("button", { name: "Lainnya" }).click();
  try {
    await sheetNav.waitFor({ timeout: 8_000 });
  } catch {
    await nav.getByRole("button", { name: "Lainnya" }).click();
    await sheetNav.waitFor({ timeout: 15_000 });
  }
  await page.waitForTimeout(500); // let the drawer settle before the shot
  await page.screenshot({ path: `${OUT}/fixed-${tag}-sheet.png` });
  console.log(`  wrote ${OUT}/fixed-${tag}-sheet.png`);

  await page.close();
}

await browser.close();

if (failures > 0) {
  console.error(`\n${failures} slot(s) clipped or under the 44px tap minimum`);
  process.exit(1);
}
console.log("\nAll slots inside the viewport, all tap targets >= 44px.");
