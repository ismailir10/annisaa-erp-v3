import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn(), findUnique: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/db", () => ({ prisma: { leaveRequest: mocks, payrollRun: mocks } }));
const cases = [
  ["../leave/requests/route", "GET", "leave.view", 200],
  ["../leave/stats/route", "GET", "leave.view", 200],
  ["../leave/requests/[id]/approve/route", "POST", "leave.approve", 404],
  ["../leave/requests/[id]/reject/route", "POST", "leave.approve", 404],
  ["../payroll/route", "GET", "payroll.view", 200],
  ["../payroll/stats/route", "GET", "payroll.view", 200],
  ["../payroll/[id]/route", "GET", "payroll.view", 404],
  ["../payroll/[id]/approve/route", "POST", "payroll.approve", 404],
] as const;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([]);
  mocks.count.mockResolvedValue(0);
  mocks.groupBy.mockResolvedValue([]);
  mocks.findUnique.mockResolvedValue(null);
});
function session(permissions: string[]) { return { id: "admin", tenantId: "tenant-a", role: "SCHOOL_ADMIN", permissions }; }
async function call(file: string, method: string) {
  const route = await import(file);
  return route[method](new NextRequest("http://localhost/api/test?requestId=foreign", { method, ...(method === "POST" ? { body: JSON.stringify({ note: "Tidak memenuhi syarat" }) } : {}) }), { params: Promise.resolve({ id: "foreign" }) });
}
describe("queue HR destination permission alignment", () => {
  it.each(cases)("%s %s denies leaf capability without hr.view", async (file, method, permission) => {
    mocks.getSession.mockResolvedValue(session([permission]));
    const response = await call(file, method);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ missing: "hr.view" });
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.groupBy).not.toHaveBeenCalled();
  });
  it.each(cases)("%s %s still denies hr.view without domain capability", async (file, method, permission) => {
    mocks.getSession.mockResolvedValue(session(["hr.view"]));
    const response = await call(file, method);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ missing: permission });
  });
  it.each(cases)("%s %s reaches tenant-scoped record handling with both capabilities", async (file, method, permission, expected) => {
    mocks.getSession.mockResolvedValue(session(["hr.view", permission]));
    const response = await call(file, method);
    expect(response.status).toBe(expected);
    // Record routes still return 404 for an unknown/foreign id; list routes
    // perform their existing tenant-scoped empty read without inventing a row.
    if (expected === 404) expect(mocks.findUnique).toHaveBeenCalled();
    else expect(mocks.findMany.mock.calls.length + mocks.groupBy.mock.calls.length).toBeGreaterThan(0);
  });
});
