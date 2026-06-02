import { test, expect, type Page } from "@playwright/test";

/**
 * T12 — kesiswaan CRUD parity.
 *
 * Locks the single-primary invariant on the StudentGuardian junction: a
 * student with two guardians can only ever have one row with isPrimary=true.
 * T8's race-safe pattern lives in
 *   app/api/students/[id]/guardians/[guardianId]/route.ts
 * — wraps the promotion + updateMany in a Serializable tx so concurrent
 * flips converge on one winner.
 *
 * This spec exercises the SEQUENTIAL invariant via the public PUT contract:
 *   1. Seed a student with two guardians (A primary, B not).
 *   2. PUT guardian B → isPrimary: true.
 *   3. Refetch the student → exactly one isPrimary=true row, and it's B.
 *
 * The concurrent-promotion race is covered by Vitest in
 *   app/api/students/[id]/guardians/[guardianId]/__tests__/route.test.ts
 * (mock harness with Promise.all). An e2e race needs identical wall-clock
 * tx start which is fragile in headless Playwright; the API-level coverage
 * is the stronger gate.
 *
 * Auth: demo cookie school-erp-session=u_super_admin.
 * Isolation: every test creates a fresh student + 2 fresh parents.
 */

const ADMIN_USER_ID = "u_super_admin";

async function loginAsAdmin(page: Page) {
  await page.context().addCookies([
    {
      name: "school-erp-session",
      value: ADMIN_USER_ID,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

test.describe("Admin guardian — single-primary invariant", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("toggling primary on a non-primary guardian unsets the previously-primary row", async ({
    page,
  }) => {
    const suffix = Date.now();

    // ---------- Build student + 2 guardians via API ----------
    const studentRes = await page.request.post("/api/students", {
      data: { name: `E2E PrimaryHost ${suffix}` },
    });
    expect(studentRes.status()).toBe(201);
    const student = (await studentRes.json()) as { id: string };

    // First guardian — explicit isPrimary=true.
    const gARes = await page.request.post(
      `/api/students/${student.id}/guardians`,
      {
        data: {
          name: `E2E Primary A ${suffix}`,
          relationship: "IBU",
          phone: `0817111${String(suffix).slice(-4)}`,
          email: `e2e-primary-a-${suffix}@example.test`,
          isPrimary: true,
        },
      },
    );
    expect(gARes.status()).toBe(201);
    const guardianA = (await gARes.json()) as {
      id: string;
      isPrimary: boolean;
    };
    expect(guardianA.isPrimary).toBe(true);

    // Second guardian — explicit isPrimary=false. (POST handler auto-defaults
    // to true ONLY when this is the first ACTIVE guardian; with A already
    // present, the explicit false sticks.)
    const gBRes = await page.request.post(
      `/api/students/${student.id}/guardians`,
      {
        data: {
          name: `E2E Primary B ${suffix}`,
          relationship: "AYAH",
          phone: `0817222${String(suffix).slice(-4)}`,
          email: `e2e-primary-b-${suffix}@example.test`,
          isPrimary: false,
        },
      },
    );
    expect(gBRes.status()).toBe(201);
    const guardianB = (await gBRes.json()) as {
      id: string;
      isPrimary: boolean;
    };
    expect(guardianB.isPrimary).toBe(false);

    // ---------- Promote B → primary ----------
    const promoteRes = await page.request.put(
      `/api/students/${student.id}/guardians/${guardianB.id}`,
      { data: { isPrimary: true } },
    );
    expect(promoteRes.ok()).toBeTruthy();
    const promoted = (await promoteRes.json()) as { isPrimary: boolean };
    expect(promoted.isPrimary).toBe(true);

    // ---------- Refetch student → invariant holds ----------
    const after = await page.request.get(`/api/students/${student.id}`);
    expect(after.ok()).toBeTruthy();
    const afterJson = (await after.json()) as {
      guardians: Array<{ id: string; isPrimary: boolean }>;
    };

    const primaries = afterJson.guardians.filter((g) => g.isPrimary);
    expect(primaries).toHaveLength(1);
    expect(primaries[0].id).toBe(guardianB.id);

    // A specifically must now be non-primary.
    const a = afterJson.guardians.find((g) => g.id === guardianA.id);
    expect(a?.isPrimary).toBe(false);

    // ---------- Demote B → primary stays off A; zero primaries is allowed ----------
    // Demotion needs no clear-step (per the route's invariant: promotion is
    // the only branch that flips siblings). After demoting B, both should
    // be false — the invariant is "AT MOST one primary", not "exactly one".
    const demoteRes = await page.request.put(
      `/api/students/${student.id}/guardians/${guardianB.id}`,
      { data: { isPrimary: false } },
    );
    expect(demoteRes.ok()).toBeTruthy();

    const after2 = await page.request.get(`/api/students/${student.id}`);
    const after2Json = (await after2.json()) as {
      guardians: Array<{ id: string; isPrimary: boolean }>;
    };
    expect(after2Json.guardians.filter((g) => g.isPrimary)).toHaveLength(0);

    // ---------- Re-promote A → invariant still single ----------
    const repromoteRes = await page.request.put(
      `/api/students/${student.id}/guardians/${guardianA.id}`,
      { data: { isPrimary: true } },
    );
    expect(repromoteRes.ok()).toBeTruthy();

    const after3 = await page.request.get(`/api/students/${student.id}`);
    const after3Json = (await after3.json()) as {
      guardians: Array<{ id: string; isPrimary: boolean }>;
    };
    const primaries3 = after3Json.guardians.filter((g) => g.isPrimary);
    expect(primaries3).toHaveLength(1);
    expect(primaries3[0].id).toBe(guardianA.id);

    // ---------- Cleanup ----------
    await page.request
      .put(`/api/students/${student.id}`, { data: { status: "INACTIVE" } })
      .catch(() => undefined);
  });
});
