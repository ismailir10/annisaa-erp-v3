import { test, expect } from "@playwright/test";

test.describe("Parent flows", () => {
  test.beforeEach(async ({ page }) => {
    // Login as parent via demo mode
    await page.goto("/");
    await page.waitForSelector("text=Orang Tua", { timeout: 10_000 });
    // Click first parent user
    await page.click("text=Orang Tua");
    await page.waitForURL("**/parent", { timeout: 10_000 });
  });

  test("dashboard loads with child info", async ({ page }) => {
    await expect(page.locator("text=Assalamu")).toBeVisible();
    // Should show at least one child tab or child name
    const hasChild = await page.locator("[data-testid='child-tab'], text=Kelas").first().isVisible();
    expect(hasChild).toBeTruthy();
  });

  test("unpaid invoices section visible on dashboard", async ({ page }) => {
    // Either shows unpaid invoices table or empty state
    const hasTable = await page.locator("text=Tagihan Belum Lunas").isVisible();
    const hasEmpty = await page.locator("text=Semua tagihan lunas").isVisible();
    expect(hasTable || hasEmpty).toBeTruthy();
  });

  test("invoices page loads", async ({ page }) => {
    await page.click("text=Tagihan");
    await page.waitForURL("**/parent/invoices");
    await expect(page.locator("text=Tagihan")).toBeVisible();
    // Either shows invoice list or empty state
    const hasList = await page.locator("table").isVisible();
    const hasEmpty = await page.locator("text=Belum ada tagihan").isVisible();
    expect(hasList || hasEmpty).toBeTruthy();
  });

  test("attendance page loads", async ({ page }) => {
    await page.click("text=Kehadiran");
    await page.waitForURL("**/parent/attendance");
    await expect(page.locator("text=Kehadiran")).toBeVisible();
    // Either shows attendance grid or empty state
    const hasGrid = await page.locator("text=Hadir").isVisible();
    const hasEmpty = await page.locator("text=Belum ada data").isVisible();
    expect(hasGrid || hasEmpty).toBeTruthy();
  });

  test("reports page loads", async ({ page }) => {
    await page.click("text=Rapor");
    await page.waitForURL("**/parent/reports");
    await expect(page.locator("text=Rapor")).toBeVisible();
    // Either shows report list or empty state
    const hasReport = await page.locator("text=Semester").isVisible();
    const hasEmpty = await page.locator("text=Belum ada rapor").isVisible();
    expect(hasReport || hasEmpty).toBeTruthy();
  });

  test("logout works", async ({ page }) => {
    await page.click("[title='Keluar']");
    await page.waitForURL("/", { timeout: 10_000 });
    await expect(page.locator("text=An Nisaa")).toBeVisible();
  });
});
