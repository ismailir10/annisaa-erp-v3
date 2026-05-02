import { test, expect } from "@playwright/test";

// Branding smoke — verifies Talib wordmark renders in admin sidebar,
// portal headers (parent + teacher), and the login screen.

let adminUserId: string;
let teacherUserId: string;
let parentUserId: string;

test.describe("Branding — Talib wordmark", () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.get("/api/auth/users");
    const users = await res.json();
    adminUserId =
      users.find((u: { role: string }) => u.role === "SUPER_ADMIN")?.id ??
      users.find((u: { role: string }) => u.role === "SCHOOL_ADMIN")?.id;
    teacherUserId = users.find((u: { role: string }) => u.role === "TEACHER")?.id;
    parentUserId = users.find((u: { role: string }) => u.role === "GUARDIAN")?.id;
    if (!adminUserId) throw new Error("No admin user found in demo DB");
    if (!teacherUserId) throw new Error("No TEACHER user found in demo DB");
    if (!parentUserId) throw new Error("No GUARDIAN user found in demo DB");
  });

  test("admin sidebar shows Talib wordmark + sub-label", async ({ page }) => {
    await page.context().addCookies([{
      name: "school-erp-session",
      value: adminUserId,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    }]);
    await page.goto("/admin");
    await page.waitForURL("**/admin", { timeout: 15_000 });
    await expect(page.getByText("Talib", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/by An Nisaa' Sekolahku/).first()).toBeVisible();
  });

  test("teacher portal header shows Talib brand label", async ({ page }) => {
    await page.context().addCookies([{
      name: "school-erp-session",
      value: teacherUserId,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    }]);
    await page.goto("/teacher");
    await page.waitForURL("**/teacher", { timeout: 15_000 });
    await expect(page.getByText("Talib", { exact: true }).first()).toBeVisible();
  });

  test("parent portal header shows Talib brand label", async ({ page }) => {
    await page.context().addCookies([{
      name: "school-erp-session",
      value: parentUserId,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    }]);
    await page.goto("/parent");
    await page.waitForURL("**/parent", { timeout: 15_000 });
    await expect(page.getByText("Talib", { exact: true }).first()).toBeVisible();
  });

  test("login screen shows Talib wordmark + tagline", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/");
    await expect(page.getByText("Talib", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Sahabat belajar anak/)).toBeVisible();
  });

  test("legal pages render and are linked from login", async ({ page }) => {
    await page.context().clearCookies();

    // Verify pages render directly (anyone can hit /legal/* without auth)
    await page.goto("/legal/terms");
    await expect(page.getByRole("heading", { name: /Syarat & Ketentuan/i })).toBeVisible();

    await page.goto("/legal/privacy");
    await expect(page.getByRole("heading", { name: /Kebijakan Privasi/i })).toBeVisible();

    // Verify links present on login footer
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Syarat & Ketentuan/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Kebijakan Privasi/i })).toBeVisible();
  });
});
