import { describe, it } from "vitest";

/**
 * Integration tests for admin audit endpoints.
 * These require a live database and auth context — run with Playwright or
 * a dedicated integration test harness. Marked as todos for the next cycle.
 */
describe("PUT /api/student-journal/admin/entries/[id]", () => {
  it.todo("non-admin gets 403 on PUT /admin/entries/[id]");
  it.todo("cross-tenant entry returns 404");
  it.todo("transactional audit: entry update rolls back if audit write fails");
});

describe("DELETE /api/student-journal/admin/notes/[id]", () => {
  it.todo("soft-delete note creates audit DELETE row");
  it.todo("cross-tenant note returns 404");
});

describe("GET /api/student-journal/admin/audit", () => {
  it.todo("audit list filters by entityId + entityType");
  it.todo("audit list returns scoped rows for studentId filter");
  it.todo("missing params returns 400");
});
