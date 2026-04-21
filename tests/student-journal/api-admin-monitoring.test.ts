import { describe, it } from "vitest";

// Route-level integration tests for admin monitoring endpoints.
// Full HTTP-level behaviour belongs in T11 once the shared API harness is ready.
// Todos are tracked here so intent is preserved and CI counts them.

describe("GET /api/student-journal/admin/classes — route behaviour (todo for T11)", () => {
  it.todo("non-admin gets 403 on /admin/classes");
  it.todo("/admin/classes respects tenant filter");
  it.todo("completionPct = 0 when studentCount or indicatorCount = 0");
});

describe("GET /api/student-journal/admin/class-roll-up — route behaviour (todo for T11)", () => {
  it.todo("roll-up returns 404 if class not in tenant");
  it.todo("roll-up returns 401 for unauthenticated request");
  it.todo("roll-up returns 403 for non-admin role (TEACHER, GUARDIAN)");
  it.todo("roll-up returns per-student checkedCount for the requested week only");
  it.todo("totalCells = activeSchoolIndicatorCount * 5");
});
