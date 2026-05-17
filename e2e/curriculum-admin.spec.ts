import { test, expect } from "@playwright/test";

// E2E for the C1 admin curriculum surface. Demo session as SUPER_ADMIN —
// only role with curriculum.write. The seed places the curriculum example
// (2 Themes + 4 SubThemes + 8 Weeks) under Semester 1 of AY "2025/2026";
// since the academic-hierarchy-refactor cycle the seed also ships a second
// Semester (number 2) under the SAME academic year for session-calendar
// coverage. Tests therefore scope to Semester 1 explicitly and use `.first()`
// where the AY name now renders on more than one row.

const SUPER_ADMIN_ID = "u_super_admin";

test.describe("Admin curriculum", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([
      {
        name: "school-erp-session",
        value: SUPER_ADMIN_ID,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  });

  test("semester list shows seeded row + sidebar Kurikulum entry", async ({ page }) => {
    await page.goto("/admin/semesters");
    await expect(page.getByRole("heading", { name: /Kurikulum.*Semester/i })).toBeVisible({
      timeout: 15_000,
    });
    // Seeded AY name is "2025/2026" — now renders once per Semester row
    // (Semester 1 + Semester 2), so scope to the first match.
    await expect(page.getByText("2025/2026").first()).toBeVisible();
    // Sidebar entry: scope to the sidebar nav so the breadcrumb's
    // aria-current page (also role="link" + text "Semester") doesn't
    // collide with the strict-mode resolver.
    await expect(
      page.locator('[data-slot="sidebar-menu-button"]', { hasText: "Semester" }).first(),
    ).toBeVisible();
  });

  test("theme create + subtheme create + week create end-to-end", async ({ page }) => {
    // Discover the seeded Semester 1 of AY "2025/2026" via the API. The
    // curriculum example hangs off that specific semester; the seed now also
    // ships Semester 2 under the same AY, and prior test runs may have left
    // other `number: 1` semesters under different years — so match BOTH the
    // AY name and the semester number rather than relying on list order.
    const semRes = await page.request.get(
      "/api/admin/curriculum/semesters?pageSize=100",
    );
    const semJson = await semRes.json();
    const semester = (
      semJson.data as
        | Array<{ id: string; number: number; academicYear: { name: string } }>
        | undefined
    )?.find((s) => s.number === 1 && s.academicYear.name === "2025/2026");
    const semesterId = semester?.id;
    test.skip(!semesterId, "seed produced no Semester 1 for AY 2025/2026 — skipping");

    await page.goto(`/admin/semesters/${semesterId}/themes`);
    await expect(page.getByText(/2025\/2026 · Semester 1/i)).toBeVisible({ timeout: 15_000 });

    const themeName = `E2E Tema ${Date.now()}`;
    await page.locator('[data-testid="theme-card"]').getByRole("button", { name: /Tambah/ }).click();
    await page.locator('[data-testid="theme-name-input"]').fill(themeName);
    await page.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(
      page.locator('[data-testid="theme-row"]').filter({ hasText: themeName }),
    ).toBeVisible({ timeout: 10_000 });

    // Select the newly created theme.
    await page.locator('[data-testid="theme-row"]').filter({ hasText: themeName }).click();

    const subThemeName = `E2E Subtema ${Date.now()}`;
    await page.locator('[data-testid="subtheme-card"]').getByRole("button", { name: /Tambah/ }).click();
    await page.locator('[data-testid="subtheme-name-input"]').fill(subThemeName);
    await page.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(
      page.locator('[data-testid="subtheme-row"]').filter({ hasText: subThemeName }),
    ).toBeVisible({ timeout: 10_000 });

    // Select the new subtheme.
    await page.locator('[data-testid="subtheme-row"]').filter({ hasText: subThemeName }).click();

    // Create a Mon–Fri week. Pick a stable far-future range so it cannot
    // overlap with seeded weeks: Mon 2030-01-07 → Fri 2030-01-11.
    await page.locator('[data-testid="week-card"]').getByRole("button", { name: /Tambah/ }).click();
    await page.locator('[data-testid="week-start"]').fill("2030-01-07");
    await page.locator('[data-testid="week-end"]').fill("2030-01-11");
    await page.locator('[data-testid="week-save"]').click();
    await expect(
      page.locator('[data-testid="week-row"]').filter({ hasText: /Pekan/ }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("week overlap → 409 surfaces inline error", async ({ page }) => {
    // Discover everything via API so renamed seed strings cannot silently
    // break this test — only structural assertions remain. Target Semester 1
    // of AY "2025/2026" (the seed now also ships Semester 2 under the same
    // AY, and prior runs may leave other `number: 1` semesters behind).
    const semRes = await page.request.get(
      "/api/admin/curriculum/semesters?pageSize=100",
    );
    const semesterId = (
      (await semRes.json()).data as
        | Array<{ id: string; number: number; academicYear: { name: string } }>
        | undefined
    )?.find((s) => s.number === 1 && s.academicYear.name === "2025/2026")?.id;
    test.skip(!semesterId, "seed produced no Semester 1 for AY 2025/2026");

    const themeRes = await page.request.get(
      `/api/admin/curriculum/themes?semesterId=${semesterId}&status=ACTIVE&pageSize=1`,
    );
    const theme = (await themeRes.json()).data?.[0];
    test.skip(!theme, "seed produced no theme");

    const subRes = await page.request.get(
      `/api/admin/curriculum/subthemes?themeId=${theme.id}&status=ACTIVE&pageSize=1`,
    );
    const subTheme = (await subRes.json()).data?.[0];
    test.skip(!subTheme, "seed produced no subtheme");

    const weekRes = await page.request.get(
      `/api/admin/curriculum/weeks?subThemeId=${subTheme.id}&status=ACTIVE&pageSize=1`,
    );
    const existingWeek = (await weekRes.json()).data?.[0];
    test.skip(!existingWeek, "seed produced no week");

    const startYmd: string = existingWeek.startDate.slice(0, 10);
    const endYmd: string = existingWeek.endDate.slice(0, 10);

    await page.goto(`/admin/semesters/${semesterId}/themes`);

    await page
      .locator('[data-testid="theme-row"]')
      .filter({ hasText: theme.name })
      .first()
      .click();
    await page
      .locator('[data-testid="subtheme-row"]')
      .filter({ hasText: subTheme.name })
      .first()
      .click();

    await page.locator('[data-testid="week-card"]').getByRole("button", { name: /Tambah/ }).click();
    // Submit a one-day-shifted overlap so the candidate hits the existing
    // range without matching the unique (subThemeId, number) tuple.
    await page.locator('[data-testid="week-start"]').fill(startYmd);
    await page.locator('[data-testid="week-end"]').fill(endYmd);
    await page.locator('[data-testid="week-save"]').click();
    await expect(page.locator('[data-testid="week-overlap-error"]')).toBeVisible({
      timeout: 5_000,
    });
  });
});
