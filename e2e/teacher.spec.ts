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
    // Page fetches data async — wait up to 10s for either state to appear.
    // .first() — seed renders one "Tersedia" badge per slip; strict mode
    // would fail without scoping to the first match.
    await expect(
      page
        .locator("text=Tersedia")
        .or(page.locator("text=Belum ada slip gaji"))
        .first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("assessments landing page loads from Penilaian tab", async ({ page }) => {
    // Penilaian tab should be visible in bottom nav
    await expect(page.locator("nav").locator("text=Penilaian")).toBeVisible();
    await page.locator("nav").locator("text=Penilaian").click();
    await page.waitForURL("**/teacher/assessments", { timeout: 15_000 });
    await expect(page.locator("h1", { hasText: "Penilaian" })).toBeVisible({ timeout: 10_000 });
    // Penilaian consolidation: hub shows the new IKTP flow (sentra grid is
    // always present for any assigned teacher) or the no-class empty-state.
    // Legacy "Penilaian lama (template)" section retired.
    await expect(
      page
        .locator("text=Belum ada kelas mengajar")
        .or(page.getByTestId("hub-center-grid"))
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
    // UAT 2026-05-12 — logout now opens a ConfirmDialog before signing out.
    await page.click("[aria-label='Keluar']");
    await page.click("button:has-text('Keluar dari akun')");
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

  // Today's-sessions card renders (academic-hierarchy-refactor Task 9). Light
  // smoke — the card heading is always present; the body is either a list of
  // session rows or the empty-state copy. Both are valid.
  test("teacher dashboard renders the today's-sessions card", async ({ page }) => {
    await expect(page.getByText("Sesi Hari Ini")).toBeVisible({ timeout: 15_000 });
    // Either a session link or the empty-state card body must be present.
    await expect(
      page
        .locator('a[href*="/teacher/sessions/"]')
        .or(page.getByText("Belum ada sesi kelas terjadwal hari ini."))
        .first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // Daily session flow (academic-hierarchy-refactor Task 9). The Part-A seed
  // change generates ClassSession rows across both semesters of AY 2025/2026.
  // "Today" can land on a seeded holiday (reconcileSessions correctly skips
  // those — e.g. 2026-05-15 is "Cuti Bersama"), so this test discovers a
  // session on ANY recent working day the teacher actually teaches — via the
  // dated /api/teacher/sessions param — then drives the roster page (which is
  // date-agnostic): set a status, Tap In, Tap Out, set a pickup relation,
  // Simpan, then reload and assert the entered data persisted.
  test("teacher daily session flow: record roster attendance and verify it persists", async ({ page }) => {
    // Scan back over the last ~21 days for a date on which this teacher has a
    // session with enrolled students. The dated query param mirrors the
    // dashboard card's "today" query but lets the test tolerate today being a
    // holiday / weekend with no generated sessions.
    let session: { id: string; rosterCount: number } | undefined;
    const today = new Date();
    for (let back = 0; back <= 21 && !session; back++) {
      const d = new Date(today);
      d.setDate(d.getDate() - back);
      const ymd = d.toISOString().slice(0, 10);
      const res = await page.request.get(`/api/teacher/sessions?date=${ymd}`);
      if (!res.ok()) continue;
      const list = (await res.json()) as Array<{ id: string; rosterCount: number }>;
      session = list.find((s) => s.rosterCount > 0);
    }
    if (!session) {
      test.skip(
        true,
        "teacher has no recent session with enrolled students in demo seed",
      );
      return;
    }

    // Roster page is date-agnostic — navigate straight to it.
    await page.goto(`/teacher/sessions/${session.id}`);
    await page.waitForURL(`**/teacher/sessions/${session.id}`, { timeout: 15_000 });

    // The roster page renders one row per ACTIVE-enrolled student. This test
    // mutates state, so to stay re-runnable we pick the first row whose "Tap
    // Masuk" button is still ENABLED (i.e. not yet checked in by a prior run).
    // Once checked in, the button re-labels to "Masuk HH:MM" and disables.
    await expect(page.getByTestId("roster-row").first()).toBeVisible({ timeout: 15_000 });
    const rows = page.getByTestId("roster-row");
    const rowCount = await rows.count();
    let targetRow: import("@playwright/test").Locator | undefined;
    for (let i = 0; i < rowCount; i++) {
      const candidate = rows.nth(i);
      const tapIn = candidate.getByRole("button", { name: /^Tap Masuk$/ });
      if (await tapIn.isVisible().catch(() => false)) {
        targetRow = candidate;
        break;
      }
    }
    if (!targetRow) {
      test.skip(
        true,
        "every student in this session is already checked in — no fresh row to exercise",
      );
      return;
    }

    // Capture the student name so the row can be re-located after reload.
    const studentName = (
      await targetRow.locator("p").first().textContent()
    )?.trim();
    expect(studentName).toBeTruthy();

    // Set a status — cycle-tap the status badge once (Hadir → Alpa → ...).
    await targetRow.getByRole("button", { name: /^Ubah status/ }).click();

    // Tap In — enables Tap Out.
    await targetRow.getByRole("button", { name: /^Tap Masuk$/ }).click();
    await expect(targetRow.getByRole("button", { name: /^Masuk \d/ })).toBeVisible();

    // Tap Out — reveals the pickup-relation Select.
    await targetRow.getByRole("button", { name: /^Tap Pulang$/ }).click();
    await expect(targetRow.getByRole("button", { name: /^Pulang \d/ })).toBeVisible();

    // Pickup relation — pick "Orang tua" (PARENT), which needs no name.
    await targetRow.getByRole("combobox").click();
    await page.getByRole("option", { name: "Orang tua" }).click();

    // Save — success toast confirms the bulk upsert landed.
    await page.getByRole("button", { name: /^Simpan$/ }).click();
    await expect(page.getByText(/Absensi tersimpan/)).toBeVisible({ timeout: 15_000 });

    // Reload — re-locate the SAME student row by name; the persisted check-in
    // time + check-out time + pickup relation must still show.
    await page.reload();
    await page.waitForLoadState("networkidle");
    const reloadedRow = page
      .getByTestId("roster-row")
      .filter({ hasText: studentName! })
      .first();
    await expect(reloadedRow).toBeVisible({ timeout: 15_000 });
    // Check-in button now reads "Masuk HH:MM" (disabled, persisted value).
    await expect(reloadedRow.getByRole("button", { name: /^Masuk \d/ })).toBeVisible();
    // Check-out persisted → pickup Select renders with "Orang tua" selected.
    await expect(reloadedRow.getByRole("button", { name: /^Pulang \d/ })).toBeVisible();
    await expect(reloadedRow.getByRole("combobox")).toContainText("Orang tua");
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

  // Teacher mirrors the parent portal's five-slot mobile-navigation contract:
  // four daily-work destinations plus the personal-pages overflow. Pin the
  // smallest supported Android widths so a longer label cannot quietly push a
  // slot outside the viewport again.
  test("teacher bottom nav keeps five unclipped slots at narrow mobile widths", async ({ page }) => {
    for (const width of [320, 360, 375]) {
      await page.setViewportSize({ width, height: 812 });
      await page.goto("/teacher");
      await page.waitForURL("**/teacher", { timeout: 15_000 });

      const nav = page.getByRole("navigation", { name: "Navigasi utama guru" });
      await expect(nav).toBeVisible();
      const slots = nav.locator("a, button");
      await expect(slots).toHaveCount(5);
      for (const label of ["Beranda", "Absensi", "Jurnal", "Penilaian"]) {
        await expect(nav.getByRole("link", { name: label })).toBeVisible();
      }
      await expect(nav.getByRole("button", { name: "Lainnya" })).toBeVisible();

      const boxes = await slots.evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
        }),
      );
      expect(boxes).toHaveLength(5);
      for (const [index, box] of boxes.entries()) {
        expect(box.left).toBeGreaterThanOrEqual(-0.5);
        expect(box.right).toBeLessThanOrEqual(width + 0.5);
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        if (index > 0) expect(box.left).toBeGreaterThanOrEqual(boxes[index - 1]!.right - 0.5);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });

  test("teacher bottom nav marks direct and overflow destinations active", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/teacher/student-journal");
    await page.waitForURL("**/teacher/student-journal", { timeout: 15_000 });
    const nav = page.getByRole("navigation", { name: "Navigasi utama guru" });
    await expect(nav.getByRole("link", { name: "Jurnal" })).toHaveAttribute("aria-current", "page");

    await page.goto("/teacher/slips");
    await page.waitForURL("**/teacher/slips", { timeout: 15_000 });
    await expect(nav.getByRole("button", { name: "Lainnya" }).locator("span").last()).toHaveClass(/text-primary/);
  });

  test("teacher reaches a salary detail through Lainnya and returns to the slip list", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/teacher");
    const trigger = page.locator('nav[aria-label="Navigasi utama guru"] button:has-text("Lainnya")');
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await trigger.click();

    const sheet = page.getByRole("navigation", { name: "Menu lainnya guru" });
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await sheet.getByRole("link", { name: /^Slip Gaji/ }).click();
    await page.waitForURL("**/teacher/slips", { timeout: 15_000 });

    const detail = page.locator('a[href^="/teacher/slips/"]').first();
    await expect(detail).toBeVisible({ timeout: 10_000 });
    const detailHref = await detail.getAttribute("href");
    expect(detailHref).toMatch(/^\/teacher\/slips\/[^/]+$/);
    await detail.click();
    await page.waitForURL(/\/teacher\/slips\/[^/?#]+$/, { timeout: 15_000 });

    // `Tunjangan Transport` is a stable, multi-word component in the demo
    // payroll seed. Exercise the real line at both narrow supported widths,
    // then check a final content row clears the fixed bottom navigation.
    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 812 });
      await page.goto(detailHref!);
      await page.waitForURL(/\/teacher\/slips\/[^/?#]+$/, { timeout: 15_000 });

      const longComponent = page.getByText("Tunjangan Transport", { exact: true });
      await expect(longComponent).toBeVisible({ timeout: 10_000 });
      expect(await page.evaluate(() =>
        document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      )).toBe(true);

      const bottomContent = page.getByText(
        "Slip ini dihasilkan otomatis oleh sistem An Nisaa' ERP. Dokumen resmi.",
        { exact: true },
      );
      await bottomContent.scrollIntoViewIfNeeded();
      const [contentBox, navBox] = await Promise.all([
        bottomContent.boundingBox(),
        page.getByRole("navigation", { name: "Navigasi utama guru" }).boundingBox(),
      ]);
      expect(contentBox).not.toBeNull();
      expect(navBox).not.toBeNull();
      // `boundingBox()` returns { x, y, width, height } — there is no
      // `bottom`, so derive it.
      expect(contentBox!.y + contentBox!.height).toBeLessThanOrEqual(navBox!.y + 0.5);
    }

    await page.getByRole("link", { name: /Kembali ke Slip Gaji/ }).click();
    await page.waitForURL("**/teacher/slips", { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Slip Gaji" })).toBeVisible();
  });
});
