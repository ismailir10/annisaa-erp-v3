import { NextRequest, NextResponse } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { ReportCardPdf, type ReportCardData, type ReportCardSection } from "@/lib/pdf/report-card";
import {
  BUCKETED_SECTIONS,
  CLOSING_SECTIONS,
  SECTION_LABELS,
  SECTION_HAS_SUGGESTION,
  LEVEL_LABELS,
  type ReportSectionKey,
  type RaportLevel,
} from "@/lib/raport/labels";
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

  const levels = (entry.sectionLevels ?? {}) as Record<string, RaportLevel>;
  const narratives = (entry.sectionNarratives ?? {}) as Record<string, string>;

  const order: ReportSectionKey[] = [...BUCKETED_SECTIONS, ...CLOSING_SECTIONS];
  const sections: ReportCardSection[] = order.map((key) => {
    const isLevelBearing = (BUCKETED_SECTIONS as readonly string[]).includes(key) && SECTION_HAS_SUGGESTION[key as keyof typeof SECTION_HAS_SUGGESTION];
    const lvl = isLevelBearing ? levels[key] : undefined;
    return {
      label: SECTION_LABELS[key],
      level: lvl ? LEVEL_LABELS[lvl] : null,
      narrative: narratives[key] ?? "",
    };
  });

  const data: ReportCardData = {
    schoolName: tenant?.name ?? "Sekolah",
    studentName: student.name,
    className: student.enrollments[0]?.classSection.name ?? null,
    termLabel: `Triwulan ${term.number} · Semester ${term.semester.number} · ${term.semester.academicYear.name}`,
    sections,
    attendance: {
      sick: entry.sickDays,
      permitted: entry.permittedAbsenceDays,
      unexcused: entry.unexcusedAbsenceDays,
      total: entry.totalSchoolDays,
    },
    hafalan: entry.memorizationNotes,
    height: measurement?.heightCm != null ? String(measurement.heightCm) : null,
    weight: measurement?.weightKg != null ? String(measurement.weightKg) : null,
    generatedDate: new Date().toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    }),
  };

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
