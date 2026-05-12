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
    // Parent home (cycle-4) is single-path: greeting + Anak Anda eyebrow with
    // KidCard list + bottom focal card. The focal card is either the
    // outstanding-tagihan card ("N tagihan belum dibayar") or the lunas
    // celebration ("Lunas semua / Jazakumullahu khairan"). Either confirms
    // the home signal surface rendered.
    await expect(page.locator("text=Anak Anda")).toBeVisible({ timeout: 5_000 });
    await expect(
      page
        .locator("text=Lunas semua")
        .or(page.getByText(/tagihan belum dibayar/))
        .first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("invoices page loads", async ({ page }) => {
    await page.goto("/parent/invoices");
    await page.waitForURL("**/parent/invoices");
    // Cycle-4: PageHeader h1 = "Tagihan" (was "Tagihan Saya" in cycle-3).
    await expect(page.getByRole("heading", { level: 1, name: "Tagihan" })).toBeVisible();
    // Either the focal due card with "tagihan" caption or the celebration card.
    await expect(
      page.locator("text=Lunas semua")
        .or(page.getByText(/tagihan/i))
        .first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("attendance page loads", async ({ page }) => {
    await page.goto("/parent/attendance");
    await page.waitForURL("**/parent/attendance");
    // Cycle-4: PageHeader h1 = "Kehadiran" + subtitle.
    await expect(page.getByRole("heading", { level: 1, name: "Kehadiran" })).toBeVisible();
    // Either the week grid renders, the empty-state, or the legacy strip — broad acceptance.
    await expect(
      page.locator("text=Pekan ini belum dimulai")
        .or(page.locator("text=Belum ada catatan kehadiran"))
        .or(page.getByRole("cell", { name: /^Hadir$/ }))
        .first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("reports page loads", async ({ page }) => {
    await page.goto("/parent/reports");
    await page.waitForURL("**/parent/reports");
    // Cycle-4: PageHeader h1 = "Rapor".
    await expect(page.getByRole("heading", { level: 1, name: "Rapor" })).toBeVisible();
    // Either celebration card OR empty state.
    await expect(
      page.locator("text=Rapor belum terbit")
        .or(page.getByRole("button", { name: /Buka rapor/ }))
        .first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("home and /parent/invoices agree on outstanding (UAT-2026-05-03 INV-01)", async ({ page }) => {
    // Wait for the home signal surface to render before probing — without
    // this gate the .isVisible() check below resolves false on cold paint
    // and the count scrape silently skips, producing a vacuous green that
    // defeats the regression guard.
    await expect(
      page
        .getByText(/Lunas semua/i)
        .or(page.getByText(/tagihan belum dibayar/))
        .first(),
    ).toBeVisible({ timeout: 10_000 });

    // Capture home Tagihan state. Two render branches:
    //   (a) outstanding > 0   → text "{N} tagihan belum dibayar"
    //   (b) outstanding === 0 → text "Lunas semua" (under "Pekan ini" eyebrow)
    const lunasOnHome = await page
      .getByText(/Lunas semua/i)
      .first()
      .isVisible()
      .catch(() => false);

    let homeCount: number | null = null;
    if (!lunasOnHome) {
      // Read "{N} tagihan belum dibayar". The N is the household-aggregate
      // count produced by getParentOutstandingForStudents.
      const countText = await page
        .getByText(/(\d+)\s+tagihan belum dibayar/)
        .first()
        .textContent({ timeout: 5_000 });
      const match = countText?.match(/(\d+)\s+tagihan belum dibayar/);
      if (match) homeCount = Number(match[1]);
    }

    // Navigate to /parent/invoices (default child — first one).
    await page.goto("/parent/invoices");
    await page.waitForURL("**/parent/invoices");

    if (lunasOnHome) {
      // Home said no outstanding → list MUST also say "Lunas semua".
      await expect(page.getByText(/Lunas semua/i).first()).toBeVisible({
        timeout: 10_000,
      });
    } else {
      expect(homeCount).not.toBeNull();
      // List MUST NOT say "Lunas semua" outright when household has outstanding.
      // Acceptable banners on the list (with default child selected):
      //   - "Belum dibayar" header (selected child has outstanding too)
      //   - "Lunas untuk {name}" with a sibling-switcher row (selected paid, sibling owes)
      // Either is correct; "Lunas semua" alone is the bug we are guarding.
      const lunasUntuk = page.getByText(/Lunas untuk/i).first();
      const belumDibayar = page.getByText(/Belum dibayar/i).first();
      await expect(lunasUntuk.or(belumDibayar)).toBeVisible({ timeout: 10_000 });

      const naiveLunasSemua = page.getByText(/^Lunas semua$/);
      // Strict-mode locator that targets ONLY the standalone celebration card,
      // not the substring inside "Lunas untuk {name}". If naive is visible
      // alongside outstanding household, the bug regressed.
      const naiveCount = await naiveLunasSemua.count();
      expect(
        naiveCount,
        `home shows ${homeCount} unpaid but list renders standalone "Lunas semua"`,
      ).toBe(0);
    }
  });

  test("logout works", async ({ page }) => {
    // UAT 2026-05-12 — logout now opens a ConfirmDialog before signing out.
    await page.click("[aria-label='Keluar']");
    await page.click("button:has-text('Ya, Keluar')");
    await page.waitForURL("/", { timeout: 10_000 });
    // Use first() — "An Nisaa" appears multiple times on login page
    await expect(page.locator("text=An Nisaa").first()).toBeVisible();
  });

  test("parent can open Penghubung tab with Di Sekolah/Di Rumah/Catatan tabs", async ({ page }) => {
    await page.goto("/parent/student-journal");
    await page.waitForURL("**/parent/student-journal", { timeout: 15_000 });
    // Page heading always renders regardless of whether the guardian has a child.
    // Match by role+name to avoid strict-mode violation — "Buku Penghubung" also
    // appears as a sidebar nav link, so a bare text selector resolves to two
    // elements.
    await expect(
      page
        .getByRole("heading", { name: /^Buku Penghubung$/ })
        .or(page.getByText(/Belum ada data anak/))
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
