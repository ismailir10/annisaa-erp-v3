import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { noteUpdateSchema } from "@/lib/validations/student-journal";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Auth
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimit(`sj-note-put:${getClientIp(req)}`, 20, 60_000);
  if (!rl.success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });
  }

  // Parse + validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const parsed = noteUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input tidak valid" },
      { status: 400 },
    );
  }

  // Find existing note
  const existing = await prisma.studentJournalNote.findUnique({
    where: { id },
    select: { id: true, tenantId: true, authorUserId: true },
  });

  // Return 404 if missing OR cross-tenant
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Catatan tidak ditemukan" }, { status: 404 });
  }

  // Only author can edit
  if (existing.authorUserId !== session.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Update
  const updated = await prisma.studentJournalNote.update({
    where: { id },
    data: { body: parsed.data.body },
    select: {
      id: true,
      date: true,
      authorRole: true,
      body: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimit(`sj-note-delete:${getClientIp(req)}`, 20, 60_000);
  if (!rl.success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });
  }

  const existing = await prisma.studentJournalNote.findUnique({
    where: { id },
    select: { id: true, tenantId: true, authorUserId: true, status: true },
  });

  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Catatan tidak ditemukan" }, { status: 404 });
  }

  if (existing.authorUserId !== session.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Soft-delete via status flag
  await prisma.studentJournalNote.update({
    where: { id },
    data: { status: "DELETED" },
  });

  return NextResponse.json({ data: { id } });
}
