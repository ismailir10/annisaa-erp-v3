import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { ALL_PERMISSIONS } from "@/lib/permissions";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const role = await prisma.role.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });

  if (!role || role.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(role);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { success } = rateLimit(`update-role:${getClientIp(req)}`, 20, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const existing = await prisma.role.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.isSystem) {
    return NextResponse.json({ error: "Peran bawaan tidak bisa diedit" }, { status: 403 });
  }

  const body = await req.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};

  if (body.name?.trim()) data.name = body.name.trim();
  if (body.description !== undefined) data.description = body.description?.trim() || null;

  if (Array.isArray(body.permissions)) {
    const invalidPerms = body.permissions.filter((p: string) => !ALL_PERMISSIONS.includes(p));
    if (invalidPerms.length > 0) {
      return NextResponse.json(
        { error: `Izin tidak valid: ${invalidPerms.join(", ")}` },
        { status: 400 }
      );
    }
    data.permissions = JSON.stringify(body.permissions);
  }

  const role = await prisma.role.update({
    where: { id },
    data,
  });

  return NextResponse.json(role);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { success } = rateLimit(`delete-role:${getClientIp(req)}`, 10, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const existing = await prisma.role.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.isSystem) {
    return NextResponse.json({ error: "Peran bawaan tidak bisa dihapus" }, { status: 403 });
  }

  if (existing._count.users > 0) {
    return NextResponse.json(
      { error: `Peran masih digunakan oleh ${existing._count.users} pengguna` },
      { status: 409 }
    );
  }

  // Intentional hard delete — Role has no status field (config entity)
  await prisma.role.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
