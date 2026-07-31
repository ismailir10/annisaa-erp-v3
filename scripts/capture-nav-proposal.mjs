/**
 * THROWAWAY (feat/parent-nav-mobile-proposal) — captures the `/nav-proposal`
 * mockup route at mobile widths into `docs/proposals/parent-nav/`.
 *
 * Usage: node scripts/capture-nav-proposal.mjs [baseUrl]
 * Requires the dev server on that URL and a demo session cookie (any value —
 * `proxy.ts` only checks for cookie presence when DEMO_MODE=true).
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3117";
const OUT = "docs/proposals/parent-nav";

const SHOTS = [
  { file: "00-current-375", v: "current", w: 375, h: 812 },
  { file: "01-current-360", v: "current", w: 360, h: 800 },
  { file: "02-option-a-375", v: "a", w: 375, h: 812 },
  { file: "03-option-a-sheet-375", v: "a-sheet", w: 375, h: 812 },
  { file: "04-option-b-375", v: "b", w: 375, h: 812 },
  { file: "05-option-c-375", v: "c", w: 375, h: 812 },
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ deviceScaleFactor: 2 });
await context.addCookies([
  {
    name: "school-erp-session",
    value: "mock-preview",
    domain: "localhost",
    path: "/",
  },
]);

for (const shot of SHOTS) {
  const page = await context.newPage();
  await page.setViewportSize({ width: shot.w, height: shot.h });
  await page.goto(`${BASE}/nav-proposal?v=${shot.v}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/${shot.file}.png` });
  console.log(`wrote ${OUT}/${shot.file}.png (${shot.w}x${shot.h})`);
  await page.close();
}

await browser.close();
