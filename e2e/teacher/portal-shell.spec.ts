// Teacher portal shell — sidebar visibility, 4 nav items per foundation
// §10A.1, cross-portal redirect smoke. Demo-login `teacher` bucket maps
// to `homeroom_teacher` per `app/api/demo/login/route.ts:33` ROLE_CODE_MAP.
//
// Cycle: docs/cycles/2026-05-08-p2-portal-shell-sidebar.md (T5)

import { test, expect } from "@playwright/test";

test.describe("teacher portal shell", () => {
  test("sidebar renders 4 items + active-route highlight + cross-portal redirect", async ({
    page,
  }) => {
    // 1. Demo login as teacher.
    const loginRes = await page.request.post("/api/demo/login?role=teacher");
    expect(loginRes.status(), "login 200").toBe(200);

    // 2. Navigate to teacher portal root — layout guard + sidebar render.
    await page.goto("/teacher");

    // 3. Sidebar nav region present per AC1.
    const nav = page.locator('nav[aria-label="Portal navigation"]').first();
    await expect(nav, "sidebar nav region visible").toBeVisible();

    // 4. Beranda visible (item 1).
    await expect(
      nav.locator('a[href="/teacher"]').first(),
      "Beranda link visible",
    ).toBeVisible();

    // 5. Active route highlight — Beranda is /teacher exactly.
    await expect(
      nav.locator('a[href="/teacher"]').first(),
      "Beranda aria-current=page on /teacher",
    ).toHaveAttribute("aria-current", "page");

    // 6. Stub items present (Kelas Saya / Sentra Saya / Riwayat — disabled
    //    in nav-config until those scaffold registries land). They render
    //    as muted spans with their labels — assert the labels exist within
    //    the nav. Per AC7: assert ALL 4 teacher items.
    await expect(
      nav.getByText("Kelas Saya"),
      "Kelas Saya item label present",
    ).toBeVisible();
    await expect(
      nav.getByText("Sentra Saya"),
      "Sentra Saya item label present",
    ).toBeVisible();
    await expect(
      nav.getByText("Riwayat"),
      "Riwayat item label present",
    ).toBeVisible();

    // 7. Cross-portal redirect — teacher role hitting /parent redirects.
    //    Use real route (has page.tsx stub) per SD5 — see admin spec note
    //    on Next.js 16 hard-404 layout-chain bypass.
    await page.goto("/parent");
    await page.waitForURL("/", { timeout: 5000 });
    expect(page.url().endsWith("/"), "redirected to /").toBe(true);
  });
});
