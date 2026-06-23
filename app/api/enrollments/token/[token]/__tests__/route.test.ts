import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { findUnique, update } = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: { enrollmentApplication: { findUnique, update } },
}));

import { PATCH } from "../route";
import { __resetRateLimitForTest } from "@/lib/rate-limit";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/enrollments/token/tok", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ token: "tok" }) };
const future = new Date(Date.now() + 86_400_000);

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimitForTest();
  update.mockResolvedValue({});
});

describe("PATCH /api/enrollments/token/[token] (draft save)", () => {
  it("404 for an unknown token", async () => {
    findUnique.mockResolvedValue(null);
    const res = await PATCH(req({ studentData: { childName: "X" } }), ctx);
    expect(res.status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });

  it("410 for an expired token", async () => {
    findUnique.mockResolvedValue({ id: "a", status: "INVITED", tokenExpiresAt: new Date(Date.now() - 1000) });
    const res = await PATCH(req({ studentData: {} }), ctx);
    expect(res.status).toBe(410);
  });

  it("409 when already submitted", async () => {
    findUnique.mockResolvedValue({ id: "a", status: "SUBMITTED", tokenExpiresAt: future });
    const res = await PATCH(req({ studentData: {} }), ctx);
    expect(res.status).toBe(409);
    expect(update).not.toHaveBeenCalled();
  });

  it("saves only the provided blobs and mirrors childName", async () => {
    findUnique.mockResolvedValue({ id: "a", status: "INVITED", tokenExpiresAt: future });
    const res = await PATCH(req({ studentData: { childName: "  Aisyah  " }, dcareAddon: true }), ctx);
    expect(res.status).toBe(200);
    const arg = update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "a" });
    expect(arg.data.studentData).toEqual({ childName: "  Aisyah  " });
    expect(arg.data.childName).toBe("Aisyah");
    expect(arg.data.dcareAddon).toBe(true);
    expect("ayahData" in arg.data).toBe(false);
  });

  it("normalizes empty programId to null", async () => {
    findUnique.mockResolvedValue({ id: "a", status: "INVITED", tokenExpiresAt: future });
    await PATCH(req({ programId: "" }), ctx);
    expect(update.mock.calls[0][0].data.programId).toBeNull();
  });
});
