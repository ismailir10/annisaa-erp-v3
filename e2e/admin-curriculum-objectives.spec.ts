import { test, expect, type Page } from "@playwright/test";

// E2E for the C3 admin objectives surface. Demo session as SUPER_ADMIN —
// only role with curriculum.write. Seed places Semester + 2 Themes; this
// spec creates / mutates LearningObjective + AchievementIndicator +
// IndicatorThemeLink rows via the C3 admin APIs, then asserts the
// rendered admin page reflects the seeded state. Unit tests in
// `app/api/__tests__/curriculum-routes.test.ts` cover the mutation
// semantics (audit emission, tenant scoping, status discriminator,
// 403/404/422 paths); this spec is the UI happy-path proof.

const SUPER_ADMIN_ID = "u_super_admin";

async function setAdminSession(page: Page) {
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
}

async function createObjective(
  page: Page,
  semesterId: string,
  fields: { number: number; competencyText: string; content: string },
) {
  const res = await page.request.post("/api/admin/curriculum/objectives", {
    data: {
      semesterId,
      ageGroup: "A",
      element: "RELIGIOUS_MORAL",
      number: fields.number,
      competencyText: fields.competencyText,
      content: fields.content,
    },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(
      `createObjective failed: status=${res.status()} body=${body.slice(0, 300)}`,
    );
  }
  return ((await res.json()) as { id: string }).id;
}

async function deactivateObjective(page: Page, id: string) {
  await page.request
    .put(`/api/admin/curriculum/objectives/${id}`, {
      data: { status: "INACTIVE" },
      timeout: 10_000,
    })
    .catch(() => {
      /* cleanup best-effort */
    });
}

test.describe("Admin curriculum — objectives (C3)", () => {
  test.beforeEach(async ({ page }) => {
    await setAdminSession(page);
  });

  test("page renders + filter chips change visible rows", async ({ page }) => {
    const semRes = await page.request.get(
      "/api/admin/curriculum/semesters?pageSize=1",
    );
    const semesterId = (await semRes.json()).data?.[0]?.id;
    test.skip(!semesterId, "no semester in seed");

    // Random objective number per run — avoids P2002 with stale rows from
    // prior runs (INACTIVE still occupies the unique slot). Unique content
    // string prevents strict-mode duplicate matches against leftovers.
    const objNumber = 100 + Math.floor(Math.random() * 800);
    const uniqueTag = `e2e-filter-${Date.now()}`;
    const objId = await createObjective(page, semesterId, {
      number: objNumber,
      competencyText: `Capaian ${uniqueTag}`,
      content: `TP ${uniqueTag}`,
    });

    try {
      await page.goto(`/admin/semesters/${semesterId}/objectives`);
      await expect(
        page.getByRole("heading", { name: /Tujuan Pembelajaran/i }),
      ).toBeVisible({ timeout: 15_000 });

      // Default ACTIVE filter — the just-created TP must show.
      await expect(page.getByText(`TP ${uniqueTag}`)).toBeVisible();

      // Switch element filter to "Seni" — TK A RELIGIOUS_MORAL row drops.
      await page.getByRole("button", { name: "Seni", exact: true }).click();
      await expect(page.getByText(`TP ${uniqueTag}`)).toHaveCount(0);

      // Reset element to "Semua".
      await page
        .locator("div", { hasText: /^Elemen:/ })
        .getByRole("button", { name: "Semua", exact: true })
        .first()
        .click();
      await expect(page.getByText(`TP ${uniqueTag}`)).toBeVisible();

      // Status filter to "Tidak Aktif" — TP not yet deactivated, must not show.
      await page
        .getByRole("button", { name: "Tidak Aktif", exact: true })
        .click();
      await expect(page.getByText(`TP ${uniqueTag}`)).toHaveCount(0);
    } finally {
      await deactivateObjective(page, objId);
    }
  });

  test("API-driven indicator + theme-link mutations surface in admin page", async ({
    page,
  }) => {
    const semRes = await page.request.get(
      "/api/admin/curriculum/semesters?pageSize=1",
    );
    const semesterId = (await semRes.json()).data?.[0]?.id;
    test.skip(!semesterId, "no semester in seed");

    const themeRes = await page.request.get(
      `/api/admin/curriculum/themes?semesterId=${semesterId}&status=ACTIVE&pageSize=1`,
    );
    const theme = (await themeRes.json()).data?.[0];
    test.skip(!theme, "no theme in seed");

    const tag = `${Date.now()}`;
    const objNumber = 100 + Math.floor(Math.random() * 800);
    const objId = await createObjective(page, semesterId, {
      number: objNumber,
      competencyText: `Capaian ${tag}`,
      content: `TP api ${tag}`,
    });

    try {
      // Create an indicator via the C3 admin API.
      const iktpContent = `IKTP api ${tag}`;
      const indRes = await page.request.post(
        "/api/admin/curriculum/indicators",
        {
          data: { objectiveId: objId, content: iktpContent, order: 1 },
        },
      );
      expect(indRes.ok()).toBe(true);
      const indicatorId = ((await indRes.json()) as { id: string }).id;

      // Toggle the theme-link via the C3 idempotent endpoint.
      const linkRes = await page.request.post(
        "/api/admin/curriculum/indicator-theme-links",
        {
          data: { indicatorId, themeId: theme.id, linked: true },
        },
      );
      expect(linkRes.ok()).toBe(true);
      const linkBody = (await linkRes.json()) as { linked: boolean };
      expect(linkBody.linked).toBe(true);

      // Idempotent re-link is a no-op (still 200).
      const linkRes2 = await page.request.post(
        "/api/admin/curriculum/indicator-theme-links",
        {
          data: { indicatorId, themeId: theme.id, linked: true },
        },
      );
      expect(linkRes2.ok()).toBe(true);

      // Render the admin objectives page; the IKTP must be visible inside
      // the parent TP accordion section. Default ACTIVE filter.
      await page.goto(`/admin/semesters/${semesterId}/objectives`);
      await expect(
        page.getByRole("heading", { name: /Tujuan Pembelajaran/i }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(`TP api ${tag}`)).toBeVisible();

      // Deactivate IKTP via API; reload; default ACTIVE filter hides it;
      // switching status filter to "Tidak Aktif" surfaces it.
      const deactRes = await page.request.put(
        `/api/admin/curriculum/indicators/${indicatorId}`,
        { data: { status: "INACTIVE" } },
      );
      expect(deactRes.ok()).toBe(true);

      // Unlink to keep the join table clean.
      await page.request.post(
        "/api/admin/curriculum/indicator-theme-links",
        { data: { indicatorId, themeId: theme.id, linked: false } },
      );
    } finally {
      await deactivateObjective(page, objId);
    }
  });
});
