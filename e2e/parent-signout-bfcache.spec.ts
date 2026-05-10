import { test, expect } from "@playwright/test";

// Regression guard for UAT 2026-05-03 BLOCKER U6 (sign-out bfcache leak).
// After signing out from /parent/home, the browser back-button must not
// restore the cached parent page from bfcache (privacy: prior user's
// children, invoices, reports must not be visible without re-auth).
//
// Why this is a Cache-Control HEADER assertion, not a `page.goBack()`
// assertion: Playwright Chromium does not reliably exercise the
// back/forward cache. `page.goBack()` typically issues a fresh navigation
// rather than restoring from bfcache, so a "log in → log out → goBack →
// expect login" flow passes whether or not Cache-Control: no-store is
// set, making it useless as a regression guard.
//
// Chrome's bfcache disqualification rule
// (`MainResourceHasCacheControlNoStore`) is keyed off the response
// header itself, so asserting the header gives a true regression guard:
// the OS-level bfcache eviction will follow as long as the header is
// present.
//
// Acceptance:
//   - Portal HTML responses (/admin, /parent, /teacher and a sub-route
//     of each) carry Cache-Control containing no-store, no-cache,
//     must-revalidate, AND private.
//   - POST /api/auth/logout response carries Cache-Control containing
//     no-store, no-cache, AND must-revalidate.

const ADMIN_USER_ID = "u_super_admin";

let guardianUserId: string;
let teacherUserId: string;

test.describe("Sign-out bfcache header guard (UAT U6 — 2026-05-03)", () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.get("/api/auth/users");
    const users = (await res.json()) as Array<{ id: string; role: string }>;
    const guardian = users.find((u) => u.role === "GUARDIAN");
    const teacher = users.find((u) => u.role === "TEACHER");
    if (!guardian) throw new Error("No GUARDIAN user found in demo DB");
    if (!teacher) throw new Error("No TEACHER user found in demo DB");
    guardianUserId = guardian.id;
    teacherUserId = teacher.id;
  });

  for (const role of ["admin", "parent", "teacher"] as const) {
    test(`portal HTML response under ${role} carries Cache-Control: no-store`, async ({
      page,
    }) => {
      const userId =
        role === "admin"
          ? ADMIN_USER_ID
          : role === "parent"
            ? guardianUserId
            : teacherUserId;
      await page.context().addCookies([
        {
          name: "school-erp-session",
          value: userId,
          domain: "localhost",
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);

      const root = `/${role === "admin" ? "admin" : role}`;
      const res = await page.request.fetch(root, {
        maxRedirects: 0,
      });
      const cc = res.headers()["cache-control"] ?? "";
      expect(cc, `Cache-Control on ${root}`).toContain("no-store");
      expect(cc, `Cache-Control on ${root}`).toContain("no-cache");
      expect(cc, `Cache-Control on ${root}`).toContain("must-revalidate");
      expect(cc, `Cache-Control on ${root}`).toContain("private");
    });
  }

  test("POST /api/auth/logout response carries explicit Cache-Control: no-store", async ({
    page,
  }) => {
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
    const res = await page.request.post("/api/auth/logout");
    expect(res.status()).toBe(200);
    const cc = res.headers()["cache-control"] ?? "";
    expect(cc, "Cache-Control on /api/auth/logout").toContain("no-store");
    expect(cc, "Cache-Control on /api/auth/logout").toContain("no-cache");
    expect(cc, "Cache-Control on /api/auth/logout").toContain("must-revalidate");
    expect(res.headers()["pragma"]).toBe("no-cache");
    expect(res.headers()["expires"]).toBe("0");
  });
});
