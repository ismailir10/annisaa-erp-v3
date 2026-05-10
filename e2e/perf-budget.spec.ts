import { test, expect } from "@playwright/test";

/**
 * Perf-budget regression guard — Phase 0.3 (cycle phase0-perf-sweep).
 *
 * Encodes the CLAUDE.md UAT page-load BLOCKER threshold (> 4 s = blocker)
 * as a hard e2e gate against `DEMO_MODE=true npm run start` (production
 * build). Failing this guard means a regression on one of the four
 * surfaces UAT 2026-04-26 flagged. Diagnosis on rolled-back staging
 * recorded in docs/cycles/2026-05-10-phase0-perf-sweep.md §"Task 1"
 * found all four surfaces healed by rollback alone (medians: /teacher
 * 119 ms, /teacher/class-attendance roster-visible 541 ms, /parent
 * 127 ms, /parent/reports 147 ms). This spec is the long-lived guard
 * that fails loud if any of those surfaces ever crosses the 4 000 ms
 * BLOCKER threshold again.
 *
 * Per-surface measurement shape:
 * - RSC routes (/teacher, /parent, /parent/reports) — content arrives
 *   in the HTML; the browser `load` event fires once the document and
 *   static resources finish. Measure
 *   `performance.timing.loadEventEnd - performance.timing.navigationStart`.
 * - "use client" route (/teacher/class-attendance) — roster renders
 *   AFTER `loadEventEnd` via two sequential client fetches. Measure
 *   time-to-roster-visible via `waitForSelector` on the `data-roster-row`
 *   anchor (or one of the empty-state anchors landed in cycle T3).
 *   `loadEventEnd` would always read ~150 ms on this surface even when a
 *   user-visible 4 s bug fully reproduces — the timing metric must align
 *   with the user-perceived render, not the document-load event.
 *
 * Cookie discovery follows the existing demo-mode pattern
 * (e2e/teacher.spec.ts, e2e/parent-attendance-scoping.spec.ts):
 * `GET /api/auth/users` in `beforeAll`, filter by role, use the `id` as
 * the `school-erp-session` cookie value. Static slugs do not exist in
 * the demo auth resolver and would silently 307 → vacuous-green timing.
 */

const PERF_BUDGET_MS = 4000;

let teacherUserId: string;
let parentUserId: string;

test.describe("Perf budget — page load < 4s", () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.get("/api/auth/users");
    const users = await res.json();
    const teacher = users.find((u: { role: string }) => u.role === "TEACHER");
    const parent = users.find((u: { role: string }) => u.role === "GUARDIAN");
    if (!teacher) throw new Error("No TEACHER user found in demo DB");
    if (!parent) throw new Error("No GUARDIAN user found in demo DB");
    teacherUserId = teacher.id;
    parentUserId = parent.id;
  });

  async function measureRscLoad(page: import("@playwright/test").Page, path: string): Promise<number> {
    await page.goto(path);
    // waitForLoadState('load') guarantees `loadEventEnd` is set before we
    // read it. Without this, on a fast prod build the timing read can fire
    // before the load event resolves and return 0 — silently passing the
    // assertion (cycle 0.2 review lesson on hard expects vs vacuous green).
    await page.waitForLoadState("load");
    return await page.evaluate(() => {
      const t = performance.timing;
      return t.loadEventEnd - t.navigationStart;
    });
  }

  test("/teacher load < 4s", async ({ page }) => {
    await page.context().addCookies([
      {
        name: "school-erp-session",
        value: teacherUserId,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const ms = await measureRscLoad(page, "/teacher");
    expect(ms, `/teacher loadEventEnd-navigationStart ${ms}ms (UAT BLOCKER threshold ${PERF_BUDGET_MS}ms)`).toBeLessThan(
      PERF_BUDGET_MS,
    );
  });

  test("/parent load < 4s", async ({ page }) => {
    await page.context().addCookies([
      {
        name: "school-erp-session",
        value: parentUserId,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const ms = await measureRscLoad(page, "/parent");
    expect(ms, `/parent loadEventEnd-navigationStart ${ms}ms (UAT BLOCKER threshold ${PERF_BUDGET_MS}ms)`).toBeLessThan(
      PERF_BUDGET_MS,
    );
  });

  test("/parent/reports load < 4s", async ({ page }) => {
    await page.context().addCookies([
      {
        name: "school-erp-session",
        value: parentUserId,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const ms = await measureRscLoad(page, "/parent/reports");
    expect(
      ms,
      `/parent/reports loadEventEnd-navigationStart ${ms}ms (UAT BLOCKER threshold ${PERF_BUDGET_MS}ms)`,
    ).toBeLessThan(PERF_BUDGET_MS);
  });

  test("/teacher/class-attendance roster visible < 4s", async ({ page }) => {
    await page.context().addCookies([
      {
        name: "school-erp-session",
        value: teacherUserId,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const t0 = Date.now();
    await page.goto("/teacher/class-attendance");
    // Wait for either a real roster row, or one of the deliberate empty
    // states (no students in this class / teacher unassigned). All three
    // anchors land in cycle T3. Hard timeout 6 s so a regression beyond
    // budget fails loud rather than hanging at the default 30 s.
    await page.waitForSelector(
      '[data-roster-row], [data-empty-state="no-students"], [data-empty-state="no-class-assigned"]',
      { timeout: 6000 },
    );
    const ms = Date.now() - t0;
    expect(
      ms,
      `/teacher/class-attendance roster-visible ${ms}ms (UAT BLOCKER threshold ${PERF_BUDGET_MS}ms)`,
    ).toBeLessThan(PERF_BUDGET_MS);
  });
});
