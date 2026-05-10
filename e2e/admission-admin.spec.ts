// Admin admission walk-through canary (p2-admission-funnel-ui-review T11).
//
// Walks the demo-cookie admin login → fresh SUBMITTED admission seed →
// admin detail page → SUBMITTED → UNDER_REVIEW → OFFER_EXTENDED → ACCEPTED
// chain. Asserts (a) state-aware action button cluster transitions per
// state, (b) ACCEPTED confirmation dialog appears before commit, (c)
// side-effect rows (Household + Student + Guardians) created in test DB
// via /api/demo/admission/[id]/effects, (d) post-ACCEPTED reload shows
// no action buttons (terminal state).
//
// Demo-mode requirement: production build with DEMO_MODE=true (per
// playwright.config.ts webServer). Admin login via /api/demo/login?role=admin.
// Fresh SUBMITTED admission via /api/demo/admission/seed-submitted (T11
// helper) — keeps the spec deterministic vs depending on /daftar's full
// region-API rate-limited path.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-review.md (T11)

import { test, expect } from "@playwright/test";

test.describe("admin admission funnel walk-through", () => {
  // Cycle p2-scaffold-list-crud-parity (T7) — track the seeded admission id
  // in a describe-scoped closure so the cleanup DELETE fires regardless of
  // mid-test assertion failure. Previously the cleanup was inlined at the
  // tail of the happy-path test and silently leaked rows on any failure
  // upstream of step 10 (the demo DB grew an `Aisyah Demo <stamp>` orphan
  // tree per failed run; cycle T4 ships a one-off cleanup script for the
  // existing leakage).
  let seededAdmissionId: string | null = null;

  test.afterEach(async ({ request }) => {
    if (seededAdmissionId) {
      await request.delete(
        `/api/demo/admission/${seededAdmissionId}/effects`,
        { failOnStatusCode: false },
      );
      seededAdmissionId = null;
    }
  });

  test("SUBMITTED → UNDER_REVIEW → OFFER_EXTENDED → ACCEPTED + side-effect bundle", async ({
    page,
  }) => {
    // 1. Demo-mode admin login.
    const loginRes = await page.request.post(
      "/api/demo/login?role=admin",
      { failOnStatusCode: false },
    );
    expect(loginRes.status(), "admin login responds 200").toBe(200);

    // 2. Seed a fresh SUBMITTED admission (bypasses /daftar for determinism).
    const seedRes = await page.request.post(
      "/api/demo/admission/seed-submitted",
      { failOnStatusCode: false },
    );
    expect(seedRes.status(), "seed-submitted responds 200").toBe(200);
    const { admissionId, applicantFullName } = await seedRes.json();
    expect(admissionId, "seed returns admissionId").toBeTruthy();
    // Hand the id to the afterEach cleanup hook so a mid-test assertion
    // failure still tears down the seeded rows.
    seededAdmissionId = admissionId;

    // 3. Navigate to the admin detail page.
    await page.goto(`/admin/akademik/penerimaan/${admissionId}`);
    await expect(
      page.locator(`h1:has-text("${applicantFullName}")`),
      "header shows applicant name",
    ).toBeVisible();
    await expect(
      page.locator('[data-slot="status-badge"]'),
      "status badge visible",
    ).toContainText("Disubmit");

    // 4. SUBMITTED → UNDER_REVIEW via "Pindahkan ke review" button.
    await page.getByRole("button", { name: "Pindahkan ke review" }).click();
    await expect(
      page.locator('[data-slot="status-badge"]'),
      "status badge transitions to Dalam Review",
    ).toContainText("Dalam Review", { timeout: 10_000 });

    // 5. UNDER_REVIEW → OFFER_EXTENDED via "Tawarkan tempat" (fast-track,
    //    skip interview).
    await page.getByRole("button", { name: "Tawarkan tempat" }).click();
    await expect(
      page.locator('[data-slot="status-badge"]'),
      "status badge transitions to Tawaran Diberikan",
    ).toContainText("Tawaran Diberikan", { timeout: 10_000 });

    // 6. OFFER_EXTENDED → click "Tandai diterima" → confirmation dialog
    //    visible BEFORE commit (per AC3 + AC5).
    await page.getByRole("button", { name: "Tandai diterima" }).click();
    await expect(
      page.locator('text=/Akan membuat .* Keluarga \\+ 1 Siswa \\+ \\d+ Wali baru/'),
      "ACCEPT confirmation dialog visible with N-Wali count copy",
    ).toBeVisible();

    // 7. Confirm — click "Lanjutkan" inside the dialog.
    await page.getByRole("button", { name: "Lanjutkan" }).click();
    await expect(
      page.locator('[data-slot="status-badge"]'),
      "status badge transitions to Diterima",
    ).toContainText("Diterima", { timeout: 15_000 });

    // 8. Side-effect bundle assertion via the demo introspection endpoint.
    const effectsRes = await page.request.get(
      `/api/demo/admission/${admissionId}/effects`,
      { failOnStatusCode: false },
    );
    expect(effectsRes.status(), "effects endpoint returns 200").toBe(200);
    const effects = await effectsRes.json();
    expect(effects.admission.status, "Admission row landed at ACCEPTED").toBe(
      "ACCEPTED",
    );
    expect(effects.admission.acceptedStudentId, "acceptedStudentId populated").toBeTruthy();
    expect(effects.household, "Household created").toBeTruthy();
    expect(effects.student, "Student created").toBeTruthy();
    expect(effects.studentGuardians, "StudentGuardian rows created").toHaveLength(2);
    const relationships = effects.studentGuardians
      .map((sg: { relationship: string }) => sg.relationship)
      .sort();
    expect(relationships, "FATHER + MOTHER SG rows").toEqual(["FATHER", "MOTHER"]);
    for (const sg of effects.studentGuardians) {
      expect(sg.isPrimary, "every SG row is PRIMARY (per #192 partial-unique)").toBe(true);
    }
    expect(effects.guardians, "2 Guardian rows").toHaveLength(2);

    // 9. Reload — terminal state should hide the action cluster.
    await page.reload();
    await expect(
      page.locator('[data-slot="status-badge"]'),
      "status badge still ACCEPTED post-reload",
    ).toContainText("Diterima");
    await expect(
      page.locator('[data-slot="action-cluster"]'),
      "action cluster hidden in terminal state",
    ).toHaveCount(0);

    // Cleanup happens in `afterEach` (cycle p2-scaffold-list-crud-parity T7
    // — runs even when assertions above fail mid-test, so failed runs do
    // not leak Aisyah Demo orphan rows). The describe-scoped
    // `seededAdmissionId` variable tracks the seed for the hook.
  });
});
