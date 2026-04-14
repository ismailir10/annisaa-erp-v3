import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      customRole: { select: { id: true, name: true, code: true } },
      employee: { select: { id: true, nama: true, jabatan: true } },
    },
  });

  if (!user || user.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(user);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { success } = rateLimit(`update-user:${getClientIp(req)}`, 20, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Verify tenant ownership
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};

  // Assign custom role
  if ("customRoleId" in body) {
    if (body.customRoleId) {
      // Verify role belongs to tenant
      const role = await prisma.role.findUnique({ where: { id: body.customRoleId } });
      if (!role || role.tenantId !== session.tenantId) {
        return NextResponse.json({ error: "Peran tidak ditemukan" }, { status: 400 });
      }
      data.customRoleId = body.customRoleId;
    } else {
      data.customRoleId = null;
    }
  }

  // Update status
  if ("status" in body && (body.status === "ACTIVE" || body.status === "INACTIVE")) {
    // Prevent deactivating self
    if (body.status === "INACTIVE" && id === session.id) {
      return NextResponse.json({ error: "Tidak bisa menonaktifkan akun sendiri" }, { status: 400 });
    }
    data.status = body.status;
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    include: {
      customRole: { select: { id: true, name: true, code: true } },
    },
  });

  return NextResponse.json(user);
}
