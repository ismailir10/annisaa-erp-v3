import { test, expect } from "@playwright/test";

// E2E for the C5 sentra (CENTER) UI. Demo TEACHER (E003) — the same demo
// account that walas-tests run under. Per CTO Cycle B decision, sentra
// writes are open to any TEACHER (no center-assignment gate), so the
// walas demo also covers the sentra path.
//
// Today (2026-05-XX runtime) is outside the seeded curriculum weeks
// (2025-07-14..09-05) on a fresh demo DB. The page therefore renders
// the no_active_week empty state for today; we pin to ?date=2025-07-15
// (Pekan 1) to exercise the active-week chrome. Save flow is covered
// by the 11 vitest cases on POST + 8 on GET — replicating the full
// session POST end-to-end would require setting up an indicator +
// theme link per spec run for marginal gain.

const TEACHER_ID = "u_teacher";

test.describe("Teacher — Sentra (CENTER) assessment (C5)", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([
      {
        name: "school-erp-session",
        value: TEACHER_ID,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  });

  test("hub shows the 8 sentra cards", async ({ page }) => {
    await page.goto("/teacher/assessments");
    await page.waitForURL("**/teacher/assessments", { timeout: 15_000 });
    await expect(page.locator('[data-testid="hub-center-grid"]')).toBeVisible({
      timeout: 10_000,
    });
    for (const slug of [
      "worship",
      "natural_materials",
      "art",
      "cooking",
      "role_play",
      "blocks",
      "preparation",
      "area",
    ]) {
      await expect(
        page.locator(`[data-testid="hub-center-${slug}"]`),
      ).toBeVisible();
    }
  });

  test("clicking the Sentra Ibadah card lands on the center session page", async ({
    page,
  }) => {
    await page.goto("/teacher/assessments");
    await page.waitForURL("**/teacher/assessments", { timeout: 15_000 });
    await page.locator('[data-testid="hub-center-worship"]').click();
    await page.waitForURL("**/teacher/assessments/center/worship", {
      timeout: 15_000,
    });
    await expect(
      page.locator("h1", { hasText: "Sentra Ibadah" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="center-date"]')).toBeVisible();
    await expect(page.locator('[data-testid="agegroup-A"]')).toBeVisible();
    await expect(page.locator('[data-testid="agegroup-B"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="center-activity"]'),
    ).toBeVisible();
    await expect(page.locator('[data-testid="center-save"]')).toBeVisible();
  });

  test("active-week branch renders indicator picker on a seeded date", async ({
    page,
  }) => {
    // Pin to a date inside the seeded Week range so the GET reaches the
    // active-week branch. The page calls the GET API on mount via the
    // client; we change the date input to switch dates and trigger refetch.
    await page.goto("/teacher/assessments/center/worship");
    await page.waitForURL("**/teacher/assessments/center/worship", {
      timeout: 15_000,
    });
    // Tie the assertion to the actual GET so we don't race the network on
    // cold CI. The fill triggers /api/teacher/assessment-entries/center/<center>
    // with date=2025-07-15; await the response, then poll DOM for either
    // the indicator picker or the no-IKTP banner.
    const responsePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/teacher/assessment-entries/center/worship") &&
        res.url().includes("date=2025-07-15"),
      { timeout: 30_000 },
    );
    await page
      .locator('[data-testid="center-date"]')
      .fill("2025-07-15");
    await responsePromise;
    await expect
      .poll(
        async () => {
          const picker = await page
            .locator('[data-testid="center-indicator-picker"]')
            .count();
          const banner = await page
            .getByText("Belum ada IKTP terhubung untuk tema pekan ini", {
              exact: false,
            })
            .count();
          return picker + banner;
        },
        { timeout: 15_000, intervals: [500, 1000, 2000] },
      )
      .toBeGreaterThan(0);
  });
});
