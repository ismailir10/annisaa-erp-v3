// Parent SELF-write canary — exercises the SELF-scope widening on
// `Guardian.update` end-to-end via the DEMO_MODE-gated harness route at
// `app/api/demo/guardian/route.ts`. Path A asserts the parent CAN update
// their own Guardian row; Path B asserts the parent CANNOT update a
// non-owned row (NOT_FOUND, not FORBIDDEN — SELF posture leaks no row
// existence to non-owners).
//
// Without the unowned fixture row from seed 10, Path B would be vacuous
// (regression that drops the SELF predicate would still return NOT_FOUND
// because the row never existed). The seed makes the canary meaningful.
//
// Cycle: docs/cycles/2026-05-08-p2-portal-write-widening.md (T4b)

import { test, expect } from "@playwright/test";

test.describe("parent SELF-write canary (Guardian.update)", () => {
  test("Path A: parent updates own Guardian row → ok + readback reflects new fullName", async ({
    page,
  }) => {
    const loginRes = await page.request.post("/api/demo/login?role=parent");
    expect(loginRes.status(), "demo-login 200").toBe(200);

    const listRes = await page.request.post("/api/demo/guardian", {
      data: { list: true },
    });
    expect(listRes.status(), "list 200").toBe(200);
    const list = (await listRes.json()) as {
      ownGuardianId: string | null;
      otherGuardianId: string | null;
    };
    expect(list.ownGuardianId, "own Guardian id present").toBeTruthy();

    const newName = `Demo Parent Guardian — ${Date.now()}`;
    const updateRes = await page.request.post("/api/demo/guardian", {
      data: {
        id: list.ownGuardianId,
        payload: { fullName: newName },
        readback: true,
      },
    });
    expect(updateRes.status(), "update 200").toBe(200);
    const body = (await updateRes.json()) as {
      ok: boolean;
      data?: { fullName: string };
      readback?: { fullName: string } | null;
    };
    expect(body.ok, "result.ok").toBe(true);
    expect(body.readback?.fullName, "readback fullName matches new value").toBe(newName);
  });

  test("Path B: parent attempts to update non-owned Guardian row → NOT_FOUND (not FORBIDDEN)", async ({
    page,
  }) => {
    const loginRes = await page.request.post("/api/demo/login?role=parent");
    expect(loginRes.status(), "demo-login 200").toBe(200);

    const listRes = await page.request.post("/api/demo/guardian", {
      data: { list: true },
    });
    const list = (await listRes.json()) as {
      ownGuardianId: string | null;
      otherGuardianId: string | null;
    };
    expect(list.otherGuardianId, "fixture (other) Guardian id present").toBeTruthy();

    const updateRes = await page.request.post("/api/demo/guardian", {
      data: {
        id: list.otherGuardianId,
        payload: { fullName: "Should Not Apply" },
      },
    });
    expect(updateRes.status(), "harness route returns 200 + ActionResult body").toBe(200);
    const body = (await updateRes.json()) as { ok: boolean; error?: string };
    expect(body.ok, "result.ok").toBe(false);
    expect(body.error, "error code").toBe("NOT_FOUND");
  });
});
