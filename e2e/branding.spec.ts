import { test, expect } from "@playwright/test";

// Branding smoke — verifies Talib wordmark renders in admin sidebar,
// portal headers (parent + teacher), and the login screen.

const ADMIN_USER_ID = "u_super_admin";
let teacherUserId: string;
let parentUserId: string;

test.describe("Branding — Talib wordmark", () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.get("/api/auth/users");
    const users = await res.json();
    teacherUserId = users.find((u: { role: string }) => u.role === "TEACHER")?.id;
    parentUserId = users.find((u: { role: string }) => u.role === "GUARDIAN")?.id;
    if (!teacherUserId) throw new Error("No TEACHER user found in demo DB");
    if (!parentUserId) throw new Error("No GUARDIAN user found in demo DB");
  });

  test("admin sidebar shows Talib wordmark + sub-label", async ({ page }) => {
    await page.context().addCookies([{
      name: "school-erp-session",
      value: ADMIN_USER_ID,
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
});
