import { test, expect } from "@playwright/test";

const SUPER_ADMIN_USER_ID = "u_super_admin";
const SCHOOL_ADMIN_USER_ID = "u_school_admin";

type DemoUser = {
  id: string;
  role: string;
};

let superAdminUserId = SUPER_ADMIN_USER_ID;
let schoolAdminUserId = SCHOOL_ADMIN_USER_ID;

async function loginAs(page: import("@playwright/test").Page, userId: string) {
  await page.context().addCookies([{
    name: "school-erp-session",
    value: userId,
    domain: "localhost",
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
  }]);
}

test.beforeAll(async ({ request }) => {
  const res = await request.get("/api/auth/users");
  expect(res.ok()).toBeTruthy();

  const users = (await res.json()) as DemoUser[];
  const superAdmin =
    users.find((user) => user.id === SUPER_ADMIN_USER_ID) ??
    users.find((user) => user.role === "SUPER_ADMIN");
  const schoolAdmin =
    users.find((user) => user.id === SCHOOL_ADMIN_USER_ID) ??
    users.find((user) => user.role === "SCHOOL_ADMIN");

  expect(superAdmin, "SUPER_ADMIN demo user required").toBeTruthy();
  expect(schoolAdmin, "SCHOOL_ADMIN demo user required").toBeTruthy();

  superAdminUserId = superAdmin!.id;
  schoolAdminUserId = schoolAdmin!.id;
});

test.describe("admin dashboard rebuild — SUPER_ADMIN", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, superAdminUserId);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin$/, { timeout: 15_000 });
  });

  test("renders stat grid with all four metric cards", async ({ page }) => {
    const statGrid = page.getByTestId("dashboard-stat-grid");
    await expect(statGrid.getByText("Total Karyawan", { exact: false })).toBeVisible();
    await expect(statGrid.getByText("Hadir Hari Ini", { exact: false })).toBeVisible();
    await expect(statGrid.getByText("Terlambat", { exact: false })).toBeVisible();
    await expect(statGrid.getByText("Tidak Hadir", { exact: false })).toBeVisible();
  });

  test("renders attendance trend chart container or its empty state", async ({ page }) => {
    await expect(page.getByText("Tren Kehadiran")).toBeVisible();
    await expect(page.getByText("7 hari kerja terakhir")).toBeVisible();
    // Either the chart container is rendered (data path), or the empty state copy
    // is visible (zero-data path). Accept either — both are valid.
    const chartEl = page.locator('[data-slot="chart"]');
    const emptyEl = page.getByText("Data kehadiran belum tersedia");
    const chartOrEmpty = chartEl.or(emptyEl).first();
    await expect(chartOrEmpty).toBeVisible();
  });

  test("renders actionable leave and admission records in the work queue", async ({ page }) => {
    const queue = page.getByTestId("admin-work-queue");
    await expect(queue).toBeVisible();
    const [leaveResponse, enrollmentResponse] = await Promise.all([
      page.request.get("/api/leave/requests?status=PENDING&pageSize=100"),
      page.request.get("/api/enrollments?pageSize=100"),
    ]);
    expect(leaveResponse.ok()).toBeTruthy();
    expect(enrollmentResponse.ok()).toBeTruthy();
    const leaveBody = await leaveResponse.json() as { data: Array<{ id: string; employee: { nama: string } }>; capabilities: { approve: boolean } };
    const enrollmentBody = await enrollmentResponse.json() as { data: Array<{ id: string; childName: string; studentId: string | null; status: string }> };
    expect(leaveBody.capabilities.approve).toBe(true);

    const pendingLeave = leaveBody.data[0];
    if (pendingLeave) {
      await queue.getByRole("textbox", { name: "Cari pekerjaan, nama, atau nomor…" }).fill(pendingLeave.employee.nama);
      await expect(queue.locator(`a[href="/admin/leave-requests?requestId=${pendingLeave.id}"]`)).toBeVisible();
    }
    const pendingForm = enrollmentBody.data.find(row => !row.studentId && ["SUBMITTED", "UNDER_REVIEW"].includes(row.status));
    if (pendingForm) {
      await queue.getByRole("textbox", { name: "Cari pekerjaan, nama, atau nomor…" }).fill(pendingForm.childName);
      await expect(queue.locator(`a[href="/admin/enrollments/${pendingForm.id}"]`)).toBeVisible();
    }
  });

  test("renders activity feed (rows or empty state copy)", async ({ page }) => {
    await expect(page.getByText("Aktivitas Terbaru")).toBeVisible();
    // Either activity rows (avatar) or empty-state copy — both valid
    const avatarEl = page.locator('[data-slot="avatar"]');
    const emptyEl = page.getByText("Belum ada aktivitas hari ini");
    const feedOrEmpty = avatarEl.or(emptyEl).first();
    await expect(feedOrEmpty).toBeVisible();
  });

  test("renders quick actions with all four links for full perms", async ({ page }) => {
    // Scope to quick-actions section (h2 with "Aksi Cepat" + sibling grid)
    const quickActionsSection = page.getByTestId("quick-actions");
    await expect(quickActionsSection.getByText("Aksi Cepat")).toBeVisible();
    await expect(quickActionsSection.getByRole("link", { name: /Jalankan Penggajian/ })).toBeVisible();
    await expect(quickActionsSection.getByRole("link", { name: /Lihat kehadiran/ })).toHaveAttribute("href", "/admin/employee-attendance");
    await expect(quickActionsSection.getByRole("link", { name: /Pengajuan izin/ })).toHaveAttribute("href", "/admin/leave-requests");
    await expect(quickActionsSection.getByRole("link", { name: /Tambah karyawan/ })).toHaveAttribute("href", "/admin/employees?create=1");
  });
});

test.describe("admin dashboard rebuild — SCHOOL_ADMIN gating", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, schoolAdminUserId);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin$/, { timeout: 15_000 });
  });

  test("keeps payroll records out of the authorized work queue", async ({ page }) => {
    const queue = page.getByTestId("admin-work-queue");
    await expect(queue).toBeVisible();
    expect((await page.request.get("/api/enrollments?pageSize=1")).status()).toBe(200);
    await expect(queue.locator('a[href^="/admin/payroll/"]')).toHaveCount(0);
    expect((await page.request.get("/api/payroll")).status()).toBe(403);
  });

  test("keeps leave decisions out of the authorized work queue", async ({ page }) => {
    const queue = page.getByTestId("admin-work-queue");
    await expect(queue).toBeVisible();
    expect((await page.request.get("/api/invoices?pageSize=1")).status()).toBe(200);
    await expect(queue.locator('a[href^="/admin/leave-requests?requestId="]')).toHaveCount(0);
    expect((await page.request.get("/api/leave/requests")).status()).toBe(403);
  });

  test("hides the Aksi Cepat section entirely", async ({ page }) => {
    // SCHOOL_ADMIN lacks `hr.view`, so all four HR-anchored quick actions
    // (Jalankan Penggajian + Lihat Kehadiran + Pengajuan Cuti + Tambah
    // Karyawan) gate out and the whole `<QuickActions>` returns null.
    await expect(page.getByTestId("quick-actions")).toHaveCount(0);
    await expect(page.getByText("Aksi Cepat")).toHaveCount(0);
  });
});
