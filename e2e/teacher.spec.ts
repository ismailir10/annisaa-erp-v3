import { test, expect } from "@playwright/test";

test.describe("Teacher flows", () => {
  test.beforeEach(async ({ page }) => {
    // Login as teacher via demo mode
    await page.goto("/");
    await page.waitForSelector("text=Guru", { timeout: 10_000 });
    // Click first teacher (Eneng Rina)
    await page.click("text=Eneng Rina");
    await page.waitForURL("**/teacher", { timeout: 10_000 });
  });

  test("home page shows check-in button", async ({ page }) => {
    await expect(page.locator("text=Selamat")).toBeVisible();
    // Should show MASUK or PULANG or Selesai
    const hasCheckIn = await page.locator("text=MASUK").isVisible();
    const hasCheckOut = await page.locator("text=PULANG").isVisible();
    const hasDone = await page.locator("text=Selesai").isVisible();
    expect(hasCheckIn || hasCheckOut || hasDone).toBeTruthy();
  });

  test("attendance calendar loads", async ({ page }) => {
    await page.click("text=Kehadiran");
    await page.waitForURL("**/teacher/attendance");
    await expect(page.locator("text=Kehadiran Saya")).toBeVisible();
    // Should show summary counts
    await expect(page.locator("text=Hadir")).toBeVisible();
  });

  test("salary slips page loads", async ({ page }) => {
    await page.click("text=Slip Gaji");
    await page.waitForURL("**/teacher/slips");
    // Should show slip list or empty state
    const hasSlip = await page.locator("text=Tersedia").isVisible();
    const hasEmpty = await page.locator("text=Belum ada slip gaji").isVisible();
    expect(hasSlip || hasEmpty).toBeTruthy();
  });

  test("profile page loads", async ({ page }) => {
    await page.click("text=Profil");
    await page.waitForURL("**/teacher/profile");
    await expect(page.locator("text=Profil Saya")).toBeVisible();
    await expect(page.locator("text=Eneng Rina")).toBeVisible();
    await expect(page.locator("text=Nama Lengkap")).toBeVisible();
  });

  test("logout works", async ({ page }) => {
    // Click logout in header
    await page.click("[title='Keluar']");
    await page.waitForURL("/", { timeout: 10_000 });
    // Should be back on login page
    await expect(page.locator("text=An Nisaa")).toBeVisible();
  });
});
