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
    await page.waitForURL("**/teacher/slips", { timeout: 15_000 });
    await expect(page.locator("text=Slip Gaji")).toBeVisible({ timeout: 10_000 });
    // Page fetches data async — wait up to 10s for either state to appear
    await expect(
      page.locator("text=Tersedia").or(page.locator("text=Belum ada slip gaji"))
    ).toBeVisible({ timeout: 10_000 });
  });

  test("assessments landing page loads from Penilaian tab", async ({ page }) => {
    // Penilaian tab should be visible in bottom nav
    await expect(page.locator("nav").locator("text=Penilaian")).toBeVisible();
    await page.locator("nav").locator("text=Penilaian").click();
    await page.waitForURL("**/teacher/assessments", { timeout: 15_000 });
    await expect(page.locator("h1", { hasText: "Penilaian" })).toBeVisible({ timeout: 10_000 });
    // Either shows classes ("siswa" count) or the empty-state — both are valid
    await expect(
      page
        .locator("text=Belum ada kelas mengajar")
        .or(page.locator("text=siswa"))
        .first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("profile page loads", async ({ page }) => {
    await page.goto("/teacher/profile");
    await expect(page.locator("text=Profil Saya")).toBeVisible();
    // Verify the info card rendered — "Nama Lengkap" label always appears
    await expect(page.locator("text=Nama Lengkap")).toBeVisible();
    await expect(page.locator("text=Jabatan").first()).toBeVisible();
  });

  test("logout works", async ({ page }) => {
    await page.click("[title='Keluar']");
    await page.waitForURL("/", { timeout: 10_000 });
    await expect(page.locator("text=An Nisaa")).toBeVisible();
  });
});
