import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { programBelongsToTenant } from "@/lib/enrollment/resolve-token";

const CUID_REGEX = /^c[a-z0-9]{24,}$/i;

// Admin status workflow. INVITED is owned by the parent (pre-submit) and is
// never an admin target. A converted application (studentId set) is frozen.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  SUBMITTED: ["UNDER_REVIEW", "ACCEPTED", "REJECTED"],
  UNDER_REVIEW: ["ACCEPTED", "REJECTED", "SUBMITTED"],
  ACCEPTED: ["UNDER_REVIEW", "REJECTED"],
  REJECTED: ["UNDER_REVIEW"],
};

const patchSchema = z
  .object({
    status: z.enum(["UNDER_REVIEW", "ACCEPTED", "REJECTED", "SUBMITTED"]).optional(),
    studentData: z.object({}).passthrough().optional(),
    ayahData: z.object({}).passthrough().optional(),
    ibuData: z.object({}).passthrough().optional(),
    consentData: z.object({}).passthrough().optional(),
    programId: z.union([z.string().regex(CUID_REGEX), z.literal(""), z.null()]).optional(),
    dcareAddon: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, "Tidak ada perubahan");

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const app = await prisma.enrollmentApplication.findUnique({
    where: { id },
    include: {
      program: { select: { id: true, name: true } },
      admission: { select: { id: true, parentName: true, parentPhone: true, parentRelationship: true } },
    },
  });
  if (!app || app.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(app);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const app = await prisma.enrollmentApplication.findUnique({
    where: { id },
    select: { id: true, tenantId: true, status: true, studentId: true },
  });
  if (!app || app.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (app.studentId) {
    return NextResponse.json(
      { error: "Pendaftaran ini sudah dikonversi menjadi siswa dan tidak bisa diubah." },
      { status: 409 },
    );
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    console.error("[enrollments PATCH] validation failed", JSON.stringify(parsed.error.issues));
    return NextResponse.json({ error: "Validasi gagal" }, { status: 400 });
  }
  const body = parsed.data;

  const data: Record<string, unknown> = {};
  if (body.status !== undefined) {
    const allowed = ALLOWED_TRANSITIONS[app.status] ?? [];
    if (!allowed.includes(body.status)) {
      return NextResponse.json(
        { error: `Transisi status ${app.status} → ${body.status} tidak diizinkan` },
        { status: 400 },
      );
    }
    data.status = body.status;
  }
  if (body.studentData !== undefined) {
    data.studentData = body.studentData;
    const cn = (body.studentData as { childName?: unknown }).childName;
    if (typeof cn === "string" && cn.trim()) data.childName = cn.trim().slice(0, 80);
  }
  if (body.ayahData !== undefined) data.ayahData = body.ayahData;
  if (body.ibuData !== undefined) data.ibuData = body.ibuData;
  if (body.consentData !== undefined) data.consentData = body.consentData;
  if (body.programId !== undefined) {
    if (body.programId && body.programId !== "") {
      // Guard against a cross-tenant program reference (IDOR write).
      if (!(await programBelongsToTenant(body.programId, session.tenantId))) {
        return NextResponse.json({ error: "Program tidak ditemukan" }, { status: 400 });
      }
      data.programId = body.programId;
    } else {
      data.programId = null;
    }
  }
  if (body.dcareAddon !== undefined) data.dcareAddon = body.dcareAddon;

  const updated = await prisma.enrollmentApplication.update({
    where: { id },
    data,
    select: { id: true, status: true },
  });
  return NextResponse.json(updated);
}
