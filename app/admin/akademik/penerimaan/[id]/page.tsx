// /admin/akademik/penerimaan/[id] — Admission detail + state-machine action surface.
//
// Server component fetches the Admission row + denormalized parent snapshots +
// sibling Household label (when FK populated) + acceptedStudent (when FK
// populated) + InitialAssessment rows + recent TimelineEvent rows
// (subjectKind=Admission, ordered occurredAt desc) — then hands off to
// AdmissionDetailClient for the state-aware UI surface.
//
// The 6 state-machine transitions (review / interview / offer / accept /
// reject / withdraw) are wrapped in `./actions.ts` as "use server" functions
// returning ActionResult<T>. The client component dispatches via those.
//
// Per .claude/standards/patterns.md Recipe 2 (Admin Detail). PageHeader +
// breadcrumbs + Tabs + state-aware action cluster (top-right). Sibling-
// detected Household label surfaces as a badge in the header.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-review.md (T8)

import { notFound } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

import { AdmissionDetailClient } from "./client";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) notFound();

  const row = await prisma.admission.findFirst({
    where: { id, tenantId: session.tenantId, deletedAt: null },
    select: {
      id: true,
      status: true,
      source: true,
      submittedAt: true,
      decidedAt: true,
      interviewScheduledFor: true,
      programId: true,
      academicYearId: true,
      addressId: true,
      acceptedStudentId: true,
      siblingDetectedFromHouseholdId: true,
      applicantFullName: true,
      applicantNickname: true,
      applicantBirthDate: true,
      applicantBirthPlace: true,
      applicantGender: true,
      fatherName: true,
      fatherOccupation: true,
      motherName: true,
      motherOccupation: true,
      notes: true,
      // PII fields (NIK + phone) are intentionally NOT loaded to the client
      // — admin views the masked roster on the parent's Guardian record once
      // the bundle commits, and the redactor handles audit display. Per
      // .claude/standards/audit-pii.md.
    },
  });
  if (!row) notFound();

  // Parallel resolves for the header + tabs.
  const [program, academicYear, sibling, acceptedStudent, assessments, timeline, tenant] =
    await Promise.all([
      prisma.program.findUnique({
        where: { id_tenantId: { id: row.programId, tenantId: session.tenantId } },
        select: { name: true },
      }),
      prisma.academicYear.findUnique({
        where: {
          id_tenantId: { id: row.academicYearId, tenantId: session.tenantId },
        },
        select: { name: true },
      }),
      row.siblingDetectedFromHouseholdId
        ? prisma.household.findFirst({
            where: {
              id: row.siblingDetectedFromHouseholdId,
              tenantId: session.tenantId,
              deletedAt: null,
            },
            select: { id: true, code: true },
          })
        : Promise.resolve(null),
      row.acceptedStudentId
        ? prisma.student.findFirst({
            where: { id: row.acceptedStudentId, tenantId: session.tenantId },
            select: { id: true, fullName: true, nis: true },
          })
        : Promise.resolve(null),
      prisma.initialAssessment.findMany({
        where: { admissionId: row.id, tenantId: session.tenantId },
        select: { id: true, assessmentDate: true, score: true, notes: true },
        orderBy: { assessmentDate: "desc" },
        take: 20,
      }),
      prisma.timelineEvent.findMany({
        where: {
          tenantId: session.tenantId,
          subjectKind: "Admission",
          subjectId: row.id,
        },
        select: {
          id: true,
          kind: true,
          occurredAt: true,
          actorUserId: true,
          payload: true,
        },
        orderBy: { occurredAt: "desc" },
        take: 50,
      }),
      prisma.tenant.findUnique({
        where: { id: session.tenantId },
        select: { name: true },
      }),
    ]);

  return (
    <AdmissionDetailClient
      admission={{
        id: row.id,
        status: row.status,
        source: row.source,
        submittedAt: row.submittedAt?.toISOString() ?? null,
        decidedAt: row.decidedAt?.toISOString() ?? null,
        interviewScheduledFor: row.interviewScheduledFor?.toISOString() ?? null,
        applicantFullName: row.applicantFullName,
        applicantNickname: row.applicantNickname,
        applicantBirthDate: row.applicantBirthDate?.toISOString() ?? null,
        applicantBirthPlace: row.applicantBirthPlace,
        applicantGender: row.applicantGender,
        fatherName: row.fatherName,
        fatherOccupation: row.fatherOccupation,
        motherName: row.motherName,
        motherOccupation: row.motherOccupation,
        notes: row.notes,
        programLabel: program?.name ?? row.programId,
        academicYearLabel: academicYear?.name ?? row.academicYearId,
        siblingHouseholdLabel: sibling
          ? sibling.code ?? `Keluarga ${sibling.id.slice(0, 6)}`
          : null,
        acceptedStudentLabel: acceptedStudent
          ? `${acceptedStudent.fullName}${acceptedStudent.nis ? ` (NIS ${acceptedStudent.nis})` : ""}`
          : null,
      }}
      assessments={assessments.map((a) => ({
        id: a.id,
        assessmentDate: a.assessmentDate.toISOString(),
        score: a.score,
        notes: a.notes,
      }))}
      timeline={timeline.map((t) => ({
        id: t.id,
        kind: t.kind,
        occurredAt: t.occurredAt.toISOString(),
        actorUserId: t.actorUserId,
        payload: t.payload as Record<string, unknown>,
      }))}
      tenantDisplayName={tenant?.name ?? ""}
    />
  );
}
