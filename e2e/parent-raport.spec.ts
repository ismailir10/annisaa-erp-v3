import { test, expect } from "@playwright/test";

// Demo-mode smoke for the parent rapor fix (2026-06-16 cycle): /parent/reports
// must read the admin-authored ReportCardEntry, NOT the legacy "(Demo)"
// StudentAssessment, and the guardian PDF route must be ownership-gated.
//
// Why no admin-publish→guardian-sees content assertion here: the staging DB has
// no Term/ReportCardEntry fixture, there is no Term/ReportCardEntry DELETE API
// to tear one down, and reseeding staging would wipe pilot data. The authored-
// content end-to-end (admin "Simpan & Terbitkan" → guardian opens the rapor) is
// covered by /ship preview-verify against the real Vercel preview with the
// staging Google logins (admin + guardian Siti) — the surface that found the bug.

let guardianUserId: string;
let adminUserId: string;

test.describe("Parent rapor (ReportCardEntry)", () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.get("/api/auth/users");
    const users = (await res.json()) as { id: string; role: string }[];
    const guardian = users.find((u) => u.role === "GUARDIAN");
    const admin = users.find((u) => u.role === "SUPER_ADMIN" || u.role === "SCHOOL_ADMIN");
    if (!guardian) throw new Error("No GUARDIAN user in demo DB");
    if (!admin) throw new Error("No admin user in demo DB");
    guardianUserId = guardian.id;
    adminUserId = admin.id;
  });

  async function loginAs(page: import("@playwright/test").Page, userId: string) {
    await page.context().addCookies([
      {
        name: "school-erp-session",
        value: userId,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  }

  test("reports page renders and never shows the legacy (Demo) report", async ({ page }) => {
    await loginAs(page, guardianUserId);
    await page.goto("/parent/reports");
    await page.waitForURL("**/parent/reports", { timeout: 15_000 });

    // New surface header.
    await expect(page.getByRole("heading", { name: "Rapor", exact: true })).toBeVisible();

    // The legacy StudentAssessment template ("Laporan Perkembangan Semester 1
    // (Demo)" with Motorik/Bahasa categories) must no longer appear anywhere on
    // the parent rapor surface.
    await expect(page.getByText("Laporan Perkembangan Semester 1")).toHaveCount(0);
    await expect(page.getByText("Perkembangan Motorik Halus")).toHaveCount(0);

    // Either the empty state or the published-rapor surface — both are valid
    // depending on whether this guardian's child has a PUBLISHED ReportCardEntry.
    const empty = page.getByText("Rapor belum terbit");
    const openBtn = page.getByRole("button", { name: "Buka rapor" });
    await expect(empty.or(openBtn).first()).toBeVisible({ timeout: 10_000 });

    // If a published rapor exists, the drawer must render the authored surface:
    // narrative sections + Kehadiran + Unduh PDF (not template indicators).
    if (await openBtn.count()) {
      await openBtn.first().click();
      await expect(page.getByRole("heading", { name: "Kehadiran" })).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByRole("button", { name: "Unduh PDF" })).toBeVisible();
    }
  });

  test("guardian rapor PDF route is ownership- and role-gated", async ({ page }) => {
    // As guardian: a bogus student/term → flat 404 (ownership + existence).
    await loginAs(page, guardianUserId);
    const notOwned = await page.request.get(
      "/api/guardian/raport/does-not-exist/does-not-exist/pdf",
    );
    expect(notOwned.status()).toBe(404);

    // As admin (non-GUARDIAN role) → 403, proving the route is GUARDIAN-only and
    // not reachable with admin credentials.
    await page.context().clearCookies();
    await loginAs(page, adminUserId);
    const asAdmin = await page.request.get(
      "/api/guardian/raport/does-not-exist/does-not-exist/pdf",
    );
    expect(asAdmin.status()).toBe(403);
  });
});
