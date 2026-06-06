import { test, expect } from "@playwright/test";

// Demo-mode smoke for the admin raport MVP. The seed ships a Semester +
// ClassSections but no Term, so the surface opens on the "Buat Triwulan"
// create form — we assert the surface renders and its APIs answer (no 500).

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
    // No term seeded → the create-term card is shown.
    await expect(page.getByRole("heading", { name: "Buat Triwulan" })).toBeVisible();
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
