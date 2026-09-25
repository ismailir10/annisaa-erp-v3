import { NextRequest, NextResponse } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { ReportCardPdf } from "@/lib/pdf/report-card";
import { buildReportCardData } from "@/lib/raport/build";
import { resolveTerm } from "../../../_helpers";
import { pickPrimaryEnrollment } from "@/lib/enrollment/active";

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
          where: {
            status: "ACTIVE",
            // Exclude ARCHIVED-year rows. Un-closed prior-year ACTIVE
            // enrollments (bulk-import artifact — see T9 regression,
            // docs/cycles/2026-08-21-enrollment-flexibility.md) would
            // otherwise sit in `pickPrimaryEnrollment`'s pool alongside the
            // real current-year row and can win its earliest-enrollDate
            // tiebreak, naming last year's class on the raport.
            classSection: { academicYear: { NOT: { status: "ARCHIVED" } } },
          },
          // No `take: 1` — a dual-enrolled student (sekolah + daycare) needs
          // every ACTIVE row so `pickPrimaryEnrollment` below can pick the
          // SEMESTER (sekolah) one. A raport must never name the daycare
          // class.
          select: {
            id: true,
            enrollDate: true,
            classSection: { select: { name: true, program: { select: { type: true } } } },
          },
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

  const primaryEnrollment =
    student.enrollments.length <= 1
      ? (student.enrollments[0] ?? null)
      : pickPrimaryEnrollment(student.enrollments);

  const data = buildReportCardData({
    schoolName: tenant?.name ?? "Sekolah",
    studentName: student.name,
    className: primaryEnrollment?.classSection.name ?? null,
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
