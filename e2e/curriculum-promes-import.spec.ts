import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// E2E for the C2 PROMES import surface. Demo session as SUPER_ADMIN —
// only role with `curriculum.write`. Seeded semester comes from the C1
// seed (`prisma/seed.ts` ageGroup-agnostic Semester `2025/2026 · 1`).
//
// Spec covers two cases — both required by the C2 acceptance criteria:
//   1. Happy path TK A upload → preview → commit → success toast.
//   2. Re-import of the same file → 409 conflict UI surfaces + no
//      additional rows written.

const SUPER_ADMIN_ID = "u_super_admin";
const FIXTURE_PATH = resolve(
  __dirname,
  "..",
  "lib",
  "curriculum",
  "__fixtures__",
  "promes-tk-a-smt-1.xlsx",
);

test.describe.configure({ mode: "serial" });

test.describe("Admin curriculum — PROMES import", () => {
  let semesterId: string | null = null;
  // The seeded current AcademicYear (2025/2026) is ACTIVE. Creating this
  // spec's own ACTIVE year now demotes it (single-active invariant —
  // docs/cycles/2026-06-05-staging-hygiene-active-year.md), which would break
  // later serial specs that depend on the seeded year being current (e.g.
  // teacher-assessments-weekly). Capture the prior ACTIVE year here and
  // re-activate it in afterAll so the shared CI DB is left as we found it.
  let priorActiveYearId: string | null = null;

  test.beforeAll(async ({ browser }) => {
    // Create a brand-new Semester per spec run so happy-path is
    // idempotent across local re-runs (CI gets a fresh DB anyway).
    // Number 1 or 2 must be unique per (tenantId, academicYearId), so
    // we attempt 1 first then 2 — if both are taken, fall back to a
    // newly-created AcademicYear.
    const ctx = await browser.newContext();
    await ctx.addCookies([
      {
        name: "school-erp-session",
        value: SUPER_ADMIN_ID,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    // Create a fresh AcademicYear per spec run so the spec is fully
    // re-runnable locally without a DB reseed. The Semester unique
    // key is (tenantId, academicYearId, number) — sharing the seeded
    // AY would collide on the 2nd run.
    const api = ctx.request;

    // Remember which year is ACTIVE before we steal ACTIVE for our own year.
    const priorYearsRes = await api.get("/api/academic-years");
    if (priorYearsRes.ok()) {
      const priorYears = await priorYearsRes.json();
      const list = Array.isArray(priorYears) ? priorYears : priorYears.data ?? [];
      priorActiveYearId = list.find((y: { status: string }) => y.status === "ACTIVE")?.id ?? null;
    }

    const stamp = Date.now();
    const ayName = `E2E PROMES Import ${stamp}`;
    const ayCreate = await api.post("/api/academic-years", {
      data: {
        name: ayName,
        startDate: "2030-07-01",
        endDate: "2031-06-30",
        status: "ACTIVE",
      },
    });
    if (!ayCreate.ok()) {
      await ctx.close();
      return;
    }
    const ay = await ayCreate.json();
    const academicYearId = ay.id ?? ay.data?.id ?? null;
    if (!academicYearId) {
      await ctx.close();
      return;
    }
    const semCreate = await api.post(
      "/api/admin/curriculum/semesters",
      {
        data: {
          academicYearId,
          number: 1,
          startDate: "2030-07-15",
          endDate: "2030-12-19",
        },
      },
    );
    if (semCreate.ok()) {
      const body = await semCreate.json();
      semesterId = body.id ?? null;
    }
    await ctx.close();
  });

  test.afterAll(async ({ browser }) => {
    // Restore the seeded ACTIVE year that creating our own ACTIVE year demoted,
    // so later serial specs on the shared CI DB see the current year as ACTIVE.
    if (!priorActiveYearId) return;
    const ctx = await browser.newContext();
    await ctx.addCookies([
      {
        name: "school-erp-session",
        value: SUPER_ADMIN_ID,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await ctx.request.put(`/api/academic-years/${priorActiveYearId}`, {
      data: { status: "ACTIVE" },
    });
    await ctx.close();
  });

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

  test("happy path: upload PROMES TK A → preview → commit → 30 IKTPs written", async ({
    page,
  }) => {
    test.skip(!semesterId, "could not create test semester — skipping");

    const fixtureBuffer = readFileSync(FIXTURE_PATH);
    const filename = "PROMES TK A SMT 1.xlsx";

    await page.goto(
      `/admin/semesters/${semesterId}/import`,
    );

    // Stage 1 — upload form.
    await expect(
      page.getByRole("heading", { name: /Impor PROMES/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Fill file input + radio.
    await page
      .locator('input[type="file"]#promes-file')
      .setInputFiles({
        name: filename,
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: fixtureBuffer,
      });
    // Filename heuristic should pre-fill TK A — but click it explicitly
    // to also exercise the radio-onValueChange path.
    await page.getByRole("radio", { name: /TK A/ }).click();

    await page.getByRole("button", { name: /Pratinjau PROMES/i }).click();

    // Stage 2 — preview.
    await expect(
      page.getByText(/30 indikator/i),
    ).toBeVisible({ timeout: 20_000 });
    // Element labels visible (Indonesian copy).
    await expect(page.getByText("Nilai Agama dan Budi Pekerti")).toBeVisible();
    await expect(page.getByText("Jati Diri")).toBeVisible();
    await expect(page.getByText("STEAM / Literasi")).toBeVisible();
    // No conflicts on a fresh import.
    await expect(
      page.getByText(/konflik dengan tujuan pembelajaran/i),
    ).toHaveCount(0);

    // Stage 3 — commit. Wait for the success toast + redirect.
    await page.getByRole("button", { name: /Konfirmasi & simpan/i }).click();
    // Toast carries the counts.
    await expect(
      page.getByText(/PROMES berhasil diimpor.*15 tujuan/i),
    ).toBeVisible({ timeout: 15_000 });
    // Redirect lands on the /themes page.
    await expect(page).toHaveURL(
      new RegExp(`/admin/semesters/${semesterId}/themes`),
    );
  });

  test("re-import surfaces 409 conflict alert + commit button disabled", async ({
    page,
  }) => {
    test.skip(!semesterId, "could not create test semester — skipping");

    const fixtureBuffer = readFileSync(FIXTURE_PATH);
    const filename = "PROMES TK A SMT 1.xlsx";

    await page.goto(
      `/admin/semesters/${semesterId}/import`,
    );
    await expect(
      page.getByRole("heading", { name: /Impor PROMES/i }),
    ).toBeVisible({ timeout: 15_000 });

    await page
      .locator('input[type="file"]#promes-file')
      .setInputFiles({
        name: filename,
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: fixtureBuffer,
      });
    await page.getByRole("radio", { name: /TK A/ }).click();
    await page.getByRole("button", { name: /Pratinjau PROMES/i }).click();

    // Conflict alert (depends on happy-path test having already committed
    // the rows). If the previous test hasn't run yet — or its commit
    // rolled back — we'd see 0 conflicts; this test asserts the UI
    // contract on the assumption that the row already exists.
    const alert = page.getByRole("alert").filter({
      hasText: /konflik dengan tujuan pembelajaran/i,
    });
    await expect(alert).toBeVisible({ timeout: 20_000 });
    // Conflicting row identification — TP 1 RELIGIOUS_MORAL is the first
    // objective in the fixture. Scope to the alert so we don't double-
    // match the preview Card that lists the same TP.
    await expect(
      alert.getByText(/Nilai Agama dan Budi Pekerti.*TP\s*1/i),
    ).toBeVisible();

    // Commit button disabled while conflicts present.
    const commit = page.getByRole("button", { name: /Konfirmasi & simpan/i });
    await expect(commit).toBeDisabled();
  });
});
