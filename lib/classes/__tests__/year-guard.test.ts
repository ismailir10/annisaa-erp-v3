import { describe, it, expect, vi, beforeEach } from "vitest";

const { classSectionFindFirst, academicYearFindFirst } = vi.hoisted(() => ({
  classSectionFindFirst: vi.fn(),
  academicYearFindFirst: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    classSection: { findFirst: classSectionFindFirst },
    academicYear: { findFirst: academicYearFindFirst },
  },
}));

import {
  ensureYearWritableForClass,
  ensureYearWritableById,
} from "../year-guard";
import { NextResponse } from "next/server";

beforeEach(() => {
  classSectionFindFirst.mockReset();
  academicYearFindFirst.mockReset();
});

describe("ensureYearWritableForClass", () => {
  it("returns ok when class belongs to ACTIVE year", async () => {
    classSectionFindFirst.mockResolvedValue({
      academicYear: { status: "ACTIVE" },
    });
    const r = await ensureYearWritableForClass("class-1", "tenant-1");
    expect("ok" in r ? r.ok : false).toBe(true);
  });

  it("returns ok when class belongs to PLANNING year", async () => {
    classSectionFindFirst.mockResolvedValue({
      academicYear: { status: "PLANNING" },
    });
    const r = await ensureYearWritableForClass("class-1", "tenant-1");
    expect("ok" in r ? r.ok : false).toBe(true);
  });

  it("returns 404 NextResponse when class not found", async () => {
    classSectionFindFirst.mockResolvedValue(null);
    const r = await ensureYearWritableForClass("class-x", "tenant-1");
    expect(r).toBeInstanceOf(NextResponse);
    if (r instanceof NextResponse) expect(r.status).toBe(404);
  });

  it("returns 403 NextResponse with YEAR_ARCHIVED code when year is ARCHIVED", async () => {
    classSectionFindFirst.mockResolvedValue({
      academicYear: { status: "ARCHIVED" },
    });
    const r = await ensureYearWritableForClass("class-1", "tenant-1");
    expect(r).toBeInstanceOf(NextResponse);
    if (r instanceof NextResponse) {
      expect(r.status).toBe(403);
      const body = await r.json();
      expect(body.code).toBe("YEAR_ARCHIVED");
    }
  });

  it("scopes the lookup to the provided tenantId", async () => {
    classSectionFindFirst.mockResolvedValue(null);
    await ensureYearWritableForClass("class-1", "tenant-1");
    expect(classSectionFindFirst).toHaveBeenCalledWith({
      where: { id: "class-1", tenantId: "tenant-1" },
      select: { academicYear: { select: { status: true } } },
    });
  });
});

describe("ensureYearWritableById", () => {
  it("returns ok when year is ACTIVE or PLANNING", async () => {
    academicYearFindFirst.mockResolvedValue({ status: "ACTIVE" });
    expect(
      "ok" in (await ensureYearWritableById("year-1", "tenant-1"))
        ? true
        : false,
    ).toBe(true);
    academicYearFindFirst.mockResolvedValue({ status: "PLANNING" });
    expect(
      "ok" in (await ensureYearWritableById("year-1", "tenant-1"))
        ? true
        : false,
    ).toBe(true);
  });

  it("returns 400 when year not found", async () => {
    academicYearFindFirst.mockResolvedValue(null);
    const r = await ensureYearWritableById("year-x", "tenant-1");
    expect(r).toBeInstanceOf(NextResponse);
    if (r instanceof NextResponse) expect(r.status).toBe(400);
  });

  it("returns 403 with YEAR_ARCHIVED when year is ARCHIVED", async () => {
    academicYearFindFirst.mockResolvedValue({ status: "ARCHIVED" });
    const r = await ensureYearWritableById("year-1", "tenant-1");
    expect(r).toBeInstanceOf(NextResponse);
    if (r instanceof NextResponse) {
      expect(r.status).toBe(403);
      const body = await r.json();
      expect(body.code).toBe("YEAR_ARCHIVED");
    }
  });
});
