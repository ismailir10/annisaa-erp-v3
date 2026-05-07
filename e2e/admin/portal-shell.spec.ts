// Admin portal shell — sidebar visibility, active-route highlight, and
// cross-portal redirect smoke. Mounts on the new layout shell from cycle
// p2-portal-shell-sidebar (T2).
//
// Cycle: docs/cycles/2026-05-08-p2-portal-shell-sidebar.md (T5)

import { test, expect } from "@playwright/test";

test.describe("admin portal shell", () => {
  test("sidebar renders w/ Akademik group + active-route highlight + cross-portal redirect", async ({
    page,
  }) => {
    // 1. Demo login as admin.
    const loginRes = await page.request.post("/api/demo/login?role=admin");
    expect(loginRes.status(), "login 200").toBe(200);

    // 2. Navigate to a mounted admin page — sidebar becomes visible.
    await page.goto("/admin/akademik/siswa");

    // 3. Sidebar nav region present + accessible label set per AC1.
    const nav = page.locator('nav[aria-label="Portal navigation"]').first();
    await expect(nav, "sidebar nav region visible").toBeVisible();

    // 4. Akademik group heading present per foundation §10A.1 IA.
    await expect(
      nav.locator("h3", { hasText: "Akademik" }),
      "Akademik group heading visible",
    ).toBeVisible();

    // 5. Sistem group heading present (5-group admin IA).
    await expect(
      nav.locator("h3", { hasText: "Sistem" }),
      "Sistem group heading visible",
    ).toBeVisible();

    // 6. Active route highlight — Siswa link carries aria-current="page".
    const siswaLink = nav.locator('a[href="/admin/akademik/siswa"]').first();
    await expect(siswaLink, "Siswa link visible").toBeVisible();
    await expect(
      siswaLink,
      "Siswa link aria-current=page on its own route",
    ).toHaveAttribute("aria-current", "page");

    // 7. Cross-portal redirect — admin role hitting /parent redirects to
    //    "/" via assertPortalAccess SD1. Sequential await per spec-time
    //    review SR5: page.goto follows the server-side redirect chain to
    //    settlement; waitForURL then confirms the final URL. Use /parent
    //    (real route — has page.tsx stub) rather than /parent/foo so the
    //    layout guard reliably fires (Next.js 16 may bypass layout chain
    //    on a hard 404 leaf, which would mask the assertPortalAccess
    //    redirect).
    await page.goto("/parent");
    await page.waitForURL("/", { timeout: 5000 });
    expect(page.url().endsWith("/"), "redirected to / from /parent").toBe(true);
  });
});
