import { NextRequest, NextResponse } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { ReportCardPdf } from "@/lib/pdf/report-card";
import { buildReportCardData } from "@/lib/raport/build";
import { resolveTerm } from "../../../_helpers";

/**
 * GET /api/admin/raport/[studentId]/[termId]/pdf
 *
 * Streams the per-student raport as a PDF (@react-pdf/renderer). Requires a
 * saved entry (404 otherwise). Gated by `reportCard.read`. Tenant-scoped.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ studentId: string; termId: string }> },
) {
  const auth = await requirePermission("reportCard.read");
  if ("error" in auth) return auth.error;
  const { session } = auth;
  const { studentId, termId } = await ctx.params;

  const [term, student, entry, measurement, tenant] = await Promise.all([
    resolveTerm(session.tenantId, termId),
    prisma.student.findFirst({
      where: { id: studentId, tenantId: session.tenantId },
      select: {
        name: true,
        enrollments: {
          where: { status: "ACTIVE" },
          select: { classSection: { select: { name: true } } },
          take: 1,
        },
      },
    }),
    prisma.reportCardEntry.findFirst({
      where: { tenantId: session.tenantId, studentId, termId, deletedAt: null },
      select: { sectionLevels: true, sectionNarratives: true, sickDays: true, permittedAbsenceDays: true, unexcusedAbsenceDays: true, totalSchoolDays: true, memorizationNotes: true },
    }),
    prisma.studentMeasurement.findFirst({
      where: { tenantId: session.tenantId, studentId, termId, deletedAt: null },
      select: { heightCm: true, weightKg: true },
    }),
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { name: true } }),
  ]);

  if (!term) return NextResponse.json({ error: "Triwulan tidak ditemukan." }, { status: 404 });
  if (!student) return NextResponse.json({ error: "Siswa tidak ditemukan." }, { status: 404 });
  if (!entry) {
    return NextResponse.json(
      { error: "Raport belum dibuat — simpan terlebih dahulu." },
      { status: 404 },
    );
  }

  const data = buildReportCardData({
    schoolName: tenant?.name ?? "Sekolah",
    studentName: student.name,
    className: student.enrollments[0]?.classSection.name ?? null,
    termNumber: term.number,
    semesterNumber: term.semester.number,
    academicYear: term.semester.academicYear.name,
    entry,
    measurement,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(React.createElement(ReportCardPdf, { data }) as any);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="raport-${studentId}-${termId}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
