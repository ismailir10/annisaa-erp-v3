// Demo-mode seed helper for the Playwright admin walk-through
// (e2e/admission-admin.spec.ts). POSTs a fresh Admission row in SUBMITTED
// state directly via prisma (bypasses the /daftar form + sibling-detect to
// keep the spec deterministic and fast). Returns { admissionId } so the
// spec can navigate to /admin/akademik/penerimaan/<id> and drive the
// state-machine through to ACCEPTED.
//
// Production guard: 404 outside DEMO_MODE. Mirrors the existing
// /api/demo/* posture (404 not 403 — no fingerprinting).
//
// Auth: standard demo session cookie via getSession + Admission CREATE
// scope check. Parent role hits FORBIDDEN at the assertScope gate.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-review.md (T11)

import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { admissionPolicy } from "@/lib/entities/admission/policy";
import { assertScope } from "@/lib/scaffold/server-action";
import { AdmissionStatus, AdmissionSource } from "@/lib/generated/prisma/enums";

export async function POST(_request: NextRequest): Promise<NextResponse> {
  if (process.env.DEMO_MODE !== "true") {
    return new NextResponse(null, { status: 404 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  try {
    assertScope(session, admissionPolicy, "create");
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // Resolve the first available program / academic year / address in this
  // tenant. Fail-closed if any is missing — the seed must guarantee these
  // for the demo flow to work.
  const [program, academicYear, address] = await Promise.all([
    prisma.program.findFirst({
      where: { tenantId: session.tenantId, deletedAt: null },
      select: { id: true },
    }),
    prisma.academicYear.findFirst({
      where: { tenantId: session.tenantId, deletedAt: null },
      select: { id: true },
    }),
    prisma.address.findFirst({
      where: { tenantId: session.tenantId },
      select: { id: true },
    }),
  ]);

  if (!program || !academicYear || !address) {
    return NextResponse.json(
      {
        error: "MISSING_FK_TARGETS",
        program: !!program,
        academicYear: !!academicYear,
        address: !!address,
      },
      { status: 500 },
    );
  }

  // Generate a unique applicant name so concurrent test runs don't collide.
  const stamp = Date.now();
  const applicantFullName = `Aisyah Demo ${stamp}`;

  const admission = await prisma.admission.create({
    data: {
      tenantId: session.tenantId,
      programId: program.id,
      academicYearId: academicYear.id,
      addressId: address.id,
      status: AdmissionStatus.SUBMITTED,
      source: AdmissionSource.ONLINE,
      submittedAt: new Date(),
      applicantFullName,
      applicantNickname: "Aisyah",
      applicantGender: "FEMALE",
      applicantBirthDate: new Date("2020-01-15"),
      applicantBirthPlace: "Jakarta",
      fatherName: `Hasan Demo ${stamp}`,
      motherName: `Nur Demo ${stamp}`,
    },
    select: { id: true, status: true, applicantFullName: true },
  });

  return NextResponse.json({
    admissionId: admission.id,
    status: admission.status,
    applicantFullName: admission.applicantFullName,
  });
}
