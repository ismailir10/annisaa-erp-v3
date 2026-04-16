import { test, expect } from "@playwright/test";

// Demo mode E2E — direct cookie auth to avoid rate limit on repeated logins.
const TEACHER_USER_ID = "4e54f00f-e1d9-480c-8b6c-e462557943bb"; // Redacted Employee

test.describe("Teacher flows", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([{
      name: "school-erp-session",
      value: TEACHER_USER_ID,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    }]);
    await page.goto("/teacher");
    await page.waitForURL("**/teacher", { timeout: 15_000 });
  });

  test("home page shows check-in button", async ({ page }) => {
    await expect(page.locator("text=Selamat")).toBeVisible();
    // Use .first() to avoid strict mode violation — MASUK button + nav label both match
    const hasCheckIn = await page.locator("text=MASUK").first().isVisible();
    const hasCheckOut = await page.locator("text=PULANG").first().isVisible();
    const hasDone = await page.locator("text=Selesai").first().isVisible();
    expect(hasCheckIn || hasCheckOut || hasDone).toBeTruthy();
  });

  test("attendance calendar loads", async ({ page }) => {
    await page.goto("/teacher/attendance");
    await page.waitForURL("**/teacher/attendance");
    await expect(page.locator("text=Kehadiran Saya")).toBeVisible();
    await expect(page.locator("text=Hadir").first()).toBeVisible();
  });

  test("salary slips page loads", async ({ page }) => {
    await page.goto("/teacher/slips");
    await page.waitForURL("**/teacher/slips");
    await expect(page.locator("text=Slip Gaji")).toBeVisible();
    // Page fetches data async — wait up to 10s for either state to appear
    await expect(
      page.locator("text=Tersedia").or(page.locator("text=Belum ada slip gaji"))
    ).toBeVisible({ timeout: 10_000 });
  });

  test("profile page loads", async ({ page }) => {
    await page.goto("/teacher/profile");
    await expect(page.locator("text=Profil Saya")).toBeVisible();
    await expect(page.locator("text=Jabatan").first()).toBeVisible();
  });

  test("logout works", async ({ page }) => {
    await page.click("[title='Keluar']");
    await page.waitForURL("/", { timeout: 10_000 });
    await expect(page.locator("text=An Nisaa")).toBeVisible();
  });
});
