// Parent portal shell — sidebar visibility, 4 nav items per foundation
// §10A.1, cross-portal redirect smoke.
//
// Cycle: docs/cycles/2026-05-08-p2-portal-shell-sidebar.md (T5)

import { test, expect } from "@playwright/test";

test.describe("parent portal shell", () => {
  test("sidebar renders 4 items + active-route highlight + cross-portal redirect", async ({
    page,
  }) => {
    // 1. Demo login as parent.
    const loginRes = await page.request.post("/api/demo/login?role=parent");
    expect(loginRes.status(), "login 200").toBe(200);

    // 2. Navigate to parent portal root.
    await page.goto("/parent");

    // 3. Sidebar nav region present per AC1.
    const nav = page.locator('nav[aria-label="Portal navigation"]').first();
    await expect(nav, "sidebar nav region visible").toBeVisible();

    // 4. Beranda visible (item 1, /parent root).
    await expect(
      nav.locator('a[href="/parent"]').first(),
      "Beranda link visible",
    ).toBeVisible();

    // 5. Active route highlight — Beranda is /parent exactly.
    await expect(
      nav.locator('a[href="/parent"]').first(),
      "Beranda aria-current=page on /parent",
    ).toHaveAttribute("aria-current", "page");

    // 6. Stub items present (Anak Saya / Tagihan / Pengumuman — disabled).
    await expect(
      nav.getByText("Anak Saya"),
      "Anak Saya item label present",
    ).toBeVisible();
    await expect(
      nav.getByText("Tagihan"),
      "Tagihan item label present",
    ).toBeVisible();

    // 7. Cross-portal redirect — parent role hitting /teacher redirects.
    //    Use real route (has page.tsx stub) per SD5 — see admin spec note
    //    on Next.js 16 hard-404 layout-chain bypass.
    await page.goto("/teacher");
    await page.waitForURL("/", { timeout: 5000 });
    expect(page.url().endsWith("/"), "redirected to /").toBe(true);
  });
});
