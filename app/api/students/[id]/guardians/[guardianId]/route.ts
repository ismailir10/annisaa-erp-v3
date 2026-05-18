import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { validateBody } from "@/lib/api/validate";
import { updateGuardianSchema } from "@/lib/validations/guardian";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; guardianId: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: studentId, guardianId } = await params;

  // Verify student belongs to tenant
  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: session.tenantId },
  });
  if (!student) return NextResponse.json({ error: "Siswa tidak ditemukan" }, { status: 404 });

  // Verify guardian belongs to student
  const guardian = await prisma.studentGuardian.findFirst({
    where: { id: guardianId, studentId },
    include: { parent: true },
  });
  if (!guardian) return NextResponse.json({ error: "Wali tidak ditemukan" }, { status: 404 });

  const result = await validateBody(updateGuardianSchema, await req.json());
  if (result.error) return result.error;
  const body = result.data;

  // Update parent contact fields. `address` and `childrenTotal` were silently
  // dropped before T7 — the unified GuardianForm now passes them through, and
  // updateGuardianSchema already permits both.
  await prisma.parent.update({
    where: { id: guardian.parentId },
    data: {
      name: body.name?.trim() || guardian.parent.name,
      phone: body.phone !== undefined ? (body.phone?.trim() || null) : guardian.parent.phone,
      email: body.email !== undefined ? (body.email?.trim() || null) : guardian.parent.email,
      whatsapp: body.whatsapp !== undefined ? (body.whatsapp?.trim() || null) : guardian.parent.whatsapp,
      nik: body.parentNik !== undefined ? (body.parentNik?.trim() || null) : undefined,
      education: body.education !== undefined ? (body.education?.trim() || null) : undefined,
      occupation: body.occupation !== undefined ? (body.occupation?.trim() || null) : undefined,
      employer: body.employer !== undefined ? (body.employer?.trim() || null) : undefined,
      employerAddress: body.employerAddress !== undefined ? (body.employerAddress?.trim() || null) : undefined,
      employerCity: body.employerCity !== undefined ? (body.employerCity?.trim() || null) : undefined,
      incomeRange: body.incomeRange !== undefined ? (body.incomeRange?.trim() || null) : undefined,
      address: body.address !== undefined ? (body.address?.trim() || null) : undefined,
      // childrenTotal is z.coerce.number() in the schema — arrives as a
      // number (not a string), so no trim.
      childrenTotal: body.childrenTotal !== undefined ? body.childrenTotal : undefined,
    },
  });

  // T8: race-safe single-primary invariant.
  //
  // The studentGuardian junction has no unique constraint on (studentId,
  // isPrimary=true), so two concurrent promotion requests could each
  // observe zero existing primaries and both commit as primary. Serializable
  // isolation lets Postgres abort the loser (SQLSTATE 40001 → P2034); we
  // retry once with a fresh tx, then surface 409 to the caller.
  //
  // Demotion (isPrimary === false) needs no clear-step. childOrder is a
  // plain field write — no invariant to enforce.
  const promotingPrimary = body.isPrimary === true;
  // Capture non-null fallbacks into closure-stable locals so TS narrowing
  // survives the async tx callback boundary.
  const currentGuardian = guardian;

  async function runPrimaryTx() {
    return prisma.$transaction(
      async (tx) => {
        if (promotingPrimary) {
          await tx.studentGuardian.updateMany({
            where: { studentId, isPrimary: true, id: { not: guardianId } },
            data: { isPrimary: false },
          });
        }
        return tx.studentGuardian.update({
          where: { id: guardianId },
          data: {
            relationship: body.relationship || currentGuardian.relationship,
            isPrimary: body.isPrimary !== undefined ? body.isPrimary : currentGuardian.isPrimary,
            // childOrder: undefined → Prisma skips; explicit null → clear.
            childOrder: body.childOrder === undefined ? undefined : body.childOrder,
          },
          include: { parent: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  let updated;
  try {
    updated = await runPrimaryTx();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") {
      try {
        updated = await runPrimaryTx();
      } catch (e2) {
        if (e2 instanceof Prisma.PrismaClientKnownRequestError && e2.code === "P2034") {
          return NextResponse.json(
            { error: "Konflik penyimpanan, coba lagi." },
            { status: 409 },
          );
        }
        throw e2;
      }
    } else {
      throw e;
    }
  }

  return NextResponse.json(updated);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; guardianId: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: studentId, guardianId } = await params;

  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: session.tenantId },
  });
  if (!student) return NextResponse.json({ error: "Siswa tidak ditemukan" }, { status: 404 });

  const guardian = await prisma.studentGuardian.findFirst({
    where: { id: guardianId, studentId },
  });
  if (!guardian) return NextResponse.json({ error: "Wali tidak ditemukan" }, { status: 404 });

  const body = await req.json();
  const newStatus = body.status === "INACTIVE" ? "INACTIVE" : "ACTIVE";

  const updated = await prisma.studentGuardian.update({
    where: { id: guardianId },
    data: { status: newStatus },
    include: { parent: true },
  });

  return NextResponse.json(updated);
}
