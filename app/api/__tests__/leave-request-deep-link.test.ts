import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const db = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { leaveRequest: db } }));
vi.mock("@/lib/auth-guards", () => ({ requirePermission: vi.fn(async () => ({ session: { tenantId: "tenant-a", role: "SCHOOL_ADMIN", permissions: ["hr.view", "leave.view"] } })) }));
import { GET } from "../leave/requests/route";
beforeEach(() => { vi.clearAllMocks(); db.findMany.mockResolvedValue([]); db.count.mockResolvedValue(0); });
describe("leave request lookup", () => {
  it("keeps record lookup tenant-scoped and leaves no-record distinct from another row", async () => {
    const response = await GET(new NextRequest("http://localhost/api/leave/requests?requestId=foreign-id&pageSize=1"));
    expect(db.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { employee: { tenantId: "tenant-a" }, id: "foreign-id" }, skip: 0, take: 1 }));
    expect(await response.json()).toMatchObject({ data: [], capabilities: { approve: false } });
  });
});
