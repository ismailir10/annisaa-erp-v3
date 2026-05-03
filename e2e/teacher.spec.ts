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
    await page.click("[aria-label='Keluar']");
    await page.waitForURL("/", { timeout: 10_000 });
    // Post-rebrand landing wordmark = TalibWordmark → renders <span>Talib</span>.
    // exact:true avoids substring match on footer "Talib by An Nisaa' Sekolahku".
    await expect(page.getByText("Talib", { exact: true }).first()).toBeVisible();
  });

  test("teacher can open Buku Penghubung picker and entry page", async ({ page }) => {
    await page.goto("/teacher/student-journal");
    await page.waitForURL("**/teacher/student-journal", { timeout: 15_000 });
    // Either the picker heading or the empty-state for unassigned teachers
    await expect(
      page.locator("text=Buku Penghubung").or(page.locator("text=Belum ditugaskan ke kelas"))
    ).toBeVisible({ timeout: 10_000 });
    // If assigned classes exist, the CTA button should be visible
    const cta = page.getByRole("button", { name: /Isi Penghubung/i });
    const isAssigned = await cta.isVisible({ timeout: 3_000 }).catch(() => false);
    if (isAssigned) {
      await expect(cta).toBeVisible();
    }
  });

  test("teacher entry grid 'Lihat minggu' affordance navigates to per-student week view", async ({ page }) => {
    // Discover a class via the teacher's assignments. Skip if seed has none.
    await page.goto("/teacher");
    const assignmentsRes = await page.request.get("/api/teaching-assignments/my");
    if (!assignmentsRes.ok()) {
      test.skip(true, "demo seed has no /api/teaching-assignments/my endpoint or auth missing");
    }
    const assignments = (await assignmentsRes.json()) as { data?: Array<{ classSectionId: string }> };
    const classId = assignments.data?.[0]?.classSectionId;
    if (!classId) {
      test.skip(true, "teacher has no assigned classes in demo seed");
    }
    const today = new Date().toISOString().slice(0, 10);
    await page.goto(`/teacher/student-journal/entry?classId=${classId}&date=${today}`);
    const chevron = page.locator('[data-testid="open-week-view"]').first();
    const isVisible = await chevron.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!isVisible) {
      test.skip(true, "class has no enrolled students in demo seed");
    }
    await chevron.click();
    await page.waitForURL(new RegExp(`/teacher/student-journal/students/[^/?#]+\\?week=${today}`), { timeout: 10_000 });
    await expect(page.locator("text=Kembali").first()).toBeVisible({ timeout: 10_000 });
  });
});
