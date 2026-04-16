import { test, expect } from "@playwright/test";

// Demo mode E2E — discovers teacher user ID from /api/auth/users and sets
// session cookie directly to avoid rate limit on repeated logins.

let teacherUserId: string;

test.describe("Teacher flows", () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.get("/api/auth/users");
    const users = await res.json();
    const teacher = users.find((u: { role: string }) => u.role === "TEACHER");
    if (!teacher) throw new Error("No TEACHER user found in demo DB");
    teacherUserId = teacher.id;
  });

  test.beforeEach(async ({ page }) => {
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
    // Verify the info card rendered — "Nama Lengkap" label always appears
    await expect(page.locator("text=Nama Lengkap")).toBeVisible();
  });

  test("logout works", async ({ page }) => {
    await page.click("[title='Keluar']");
    await page.waitForURL("/", { timeout: 10_000 });
    await expect(page.locator("text=An Nisaa")).toBeVisible();
  });
});
