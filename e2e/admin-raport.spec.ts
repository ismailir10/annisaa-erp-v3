import { test, expect } from "@playwright/test";

// Demo-mode smoke for the admin raport MVP. On a fresh seed (no Term) the
// surface opens on the "Buat Triwulan" create form; once a Term exists (e.g. a
// drifted staging DB, or a fresh seed that later gains a Term) it opens on the
// Triwulan/Kelas selector. The smoke tolerates EITHER surface — we only assert
// the page renders and its APIs answer (no 500), not which branch shows.

const ADMIN_USER_ID = "u_super_admin"; // SUPER_ADMIN — has reportCard.*

test.describe("Admin raport", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([
      {
        name: "school-erp-session",
        value: ADMIN_USER_ID,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await page.goto("/admin/raport");
    await page.waitForURL("**/admin/raport", { timeout: 15_000 });
  });

  test("raport surface loads", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Raport", exact: true })).toBeVisible();
    // Tolerate either surface: the "Buat Triwulan" create card (no Term seeded)
    // OR the "Triwulan" term selector (a Term exists). The label is exact so it
    // does not also match the "Buat Triwulan" heading.
    const createCard = page.getByRole("heading", { name: "Buat Triwulan" });
    const termSelector = page.getByLabel("Triwulan", { exact: true });
    await expect(createCard.or(termSelector).first()).toBeVisible({ timeout: 10_000 });
  });

  test("raport APIs respond for an authorized admin", async ({ page }) => {
    const terms = await page.request.get("/api/admin/terms");
    expect(terms.status()).toBe(200);
    const termsJson = await terms.json();
    expect(Array.isArray(termsJson.data)).toBe(true);

    // Missing params → 400, proving the roster route is wired + validated.
    const roster = await page.request.get("/api/admin/raport");
    expect(roster.status()).toBe(400);
  });
});
