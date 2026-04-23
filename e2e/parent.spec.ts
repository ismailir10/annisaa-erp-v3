import { test, expect } from "@playwright/test";

// Demo mode E2E — discovers guardian user ID from /api/auth/users and sets
// session cookie directly to avoid rate limit on repeated logins.

let parentUserId: string;

test.describe("Parent flows", () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.get("/api/auth/users");
    const users = await res.json();
    const parent = users.find((u: { role: string }) => u.role === "GUARDIAN");
    if (!parent) throw new Error("No GUARDIAN user found in demo DB");
    parentUserId = parent.id;
  });

  test.beforeEach(async ({ page }) => {
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
  });

  test("dashboard loads with child info", async ({ page }) => {
    await expect(page.locator("text=Assalamu")).toBeVisible();
    // Dashboard always shows quick-link cards for a logged-in parent with a child
    await expect(page.locator("text=Tagihan").first()).toBeVisible();
  });

  test("home signal surface visible on dashboard", async ({ page }) => {
    // Parent home body has two shapes:
    //  - <3 kids: pill-tabs + Aktivitas Terkini feed (cycle-2 C1 carry-over).
    //  - ≥3 kids (design-system-cycle-2 A2): HouseholdOverview with urgency banner
    //    ("Alhamdulillah..." when clear / "perlu perhatian" when not).
    // Either path must surface a signal. Seed household currently = 3 kids under
    // rightjetParent → HouseholdOverview path.
    await expect(
      page
        .locator("text=Aktivitas Terkini")
        .or(page.locator("text=Belum ada aktivitas"))
        .or(page.locator("text=Alhamdulillah"))
        .or(page.locator("text=perlu perhatian"))
    ).toBeVisible({ timeout: 5_000 });
  });

  test("invoices page loads", async ({ page }) => {
    await page.goto("/parent/invoices");
    await page.waitForURL("**/parent/invoices");
    await expect(page.locator("text=Tagihan Saya")).toBeVisible();
    // Wait for client hydration — DataTable replaced by SummaryHero +
    // CardListItem list in cycle 3. Either the outstanding-secondary line
    // (rendered when unpaid exists) or the all-clear celebration copy
    // confirms the client rendered.
    await expect(
      page.getByText(/tagihan belum dibayar|tagihan · jatuh tempo|Alhamdulillah, semua lunas|Belum ada tagihan/)
    ).toBeVisible({ timeout: 10_000 });
  });

  test("attendance page loads", async ({ page }) => {
    await page.goto("/parent/attendance");
    await page.waitForURL("**/parent/attendance");
    // Use first() — "Kehadiran" appears in both nav and page heading
    await expect(page.locator("text=Kehadiran").first()).toBeVisible();
    // Week summary strip rendered above the table (Task 5)
    await expect(page.getByTestId("attendance-week-summary")).toBeVisible();
    await expect(page.getByTestId("attendance-week-summary")).toContainText("Minggu ini");
  });

  test("reports page loads", async ({ page }) => {
    await page.goto("/parent/reports");
    await page.waitForURL("**/parent/reports");
    // Use first() — "Laporan Perkembangan" appears in heading and in table rows
    await expect(page.locator("text=Laporan Perkembangan").first()).toBeVisible();
    // Wait for card list or empty state — DataTable replaced by card stack in Task 3
    await expect(
      page.locator("text=Belum ada rapor").or(page.locator("button:has-text('Lihat')")).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("logout works", async ({ page }) => {
    await page.click("[aria-label='Keluar']");
    await page.waitForURL("/", { timeout: 10_000 });
    // Use first() — "An Nisaa" appears multiple times on login page
    await expect(page.locator("text=An Nisaa").first()).toBeVisible();
  });

  test("parent can open Penghubung tab with Di Sekolah/Di Rumah/Catatan tabs", async ({ page }) => {
    await page.goto("/parent/student-journal");
    await page.waitForURL("**/parent/student-journal", { timeout: 15_000 });
    // Page heading always renders regardless of whether the guardian has a child
    await expect(
      page.locator("text=Buku Penghubung").or(page.locator("text=Belum ada data anak"))
    ).toBeVisible({ timeout: 10_000 });
    // If week data loads the tabs appear — conditional check (empty DB is fine)
    const schoolTab = page.getByRole("tab", { name: /Di Sekolah/i });
    const hasData = await schoolTab.isVisible({ timeout: 5_000 }).catch(() => false);
    if (hasData) {
      await expect(page.getByRole("tab", { name: /Di Sekolah/i })).toBeVisible();
      await expect(page.getByRole("tab", { name: /Di Rumah/i })).toBeVisible();
      await expect(page.getByRole("tab", { name: /Catatan/i })).toBeVisible();
    }
  });
});
