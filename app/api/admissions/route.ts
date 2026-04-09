import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json([], { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const where: Record<string, unknown> = { tenantId: session.tenantId };
  if (status && status !== "all") where.status = status;

  const admissions = await prisma.admission.findMany({
    where,
    include: { program: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(admissions);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  if (!body.childName?.trim() || !body.parentName?.trim()) {
    return NextResponse.json({ error: "Nama anak dan nama orang tua wajib diisi" }, { status: 400 });
  }

  const admission = await prisma.admission.create({
    data: {
      tenantId: session.tenantId,
      childName: body.childName.trim(),
      childAge: body.childAge?.trim() || null,
      childGender: body.childGender || null,
      dateOfBirth: body.dateOfBirth || null,
      parentName: body.parentName.trim(),
      parentPhone: body.parentPhone?.trim() || null,
      parentEmail: body.parentEmail?.trim() || null,
      parentWhatsapp: body.parentWhatsapp?.trim() || null,
      programId: body.programId || null,
      source: body.source ?? "WALK_IN",
      notes: body.notes?.trim() || null,
      followUpDate: body.followUpDate || null,
    },
  });
  return NextResponse.json(admission, { status: 201 });
}
