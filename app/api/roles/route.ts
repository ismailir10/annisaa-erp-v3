import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { ALL_PERMISSIONS } from "@/lib/permissions";

// Cache roles for 1 hour (static data)
export const revalidate = 3600;

export async function GET() {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const roles = await prisma.role.findMany({
    where: { tenantId: session.tenantId },
    include: { _count: { select: { users: true } } },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });

  return NextResponse.json({ data: roles });
}

export async function POST(req: NextRequest) {
  const { success } = rateLimit(`create-role:${getClientIp(req)}`, 10, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  // Validate required fields
  if (!body.name?.trim() || !body.code?.trim()) {
    return NextResponse.json({ error: "Nama dan kode wajib diisi" }, { status: 400 });
  }

  // Validate code format (uppercase, alphanumeric + underscore)
  const codeRegex = /^[A-Z][A-Z0-9_]{1,30}$/;
  if (!codeRegex.test(body.code.trim())) {
    return NextResponse.json(
      { error: "Kode harus huruf kapital, angka, atau underscore (contoh: FINANCE_ADMIN)" },
      { status: 400 }
    );
  }

  // Check code uniqueness per tenant
  const existing = await prisma.role.findUnique({
    where: { tenantId_code: { tenantId: session.tenantId, code: body.code.trim() } },
  });
  if (existing) {
    return NextResponse.json({ error: "Kode peran sudah digunakan" }, { status: 409 });
  }

  // Validate permissions array
  const permissions: string[] = Array.isArray(body.permissions) ? body.permissions : [];
  const invalidPerms = permissions.filter((p: string) => !ALL_PERMISSIONS.includes(p));
  if (invalidPerms.length > 0) {
    return NextResponse.json(
      { error: `Izin tidak valid: ${invalidPerms.join(", ")}` },
      { status: 400 }
    );
  }

  const role = await prisma.role.create({
    data: {
      tenantId: session.tenantId,
      name: body.name.trim(),
      code: body.code.trim(),
      description: body.description?.trim() || null,
      isSystem: false,
      permissions: JSON.stringify(permissions),
    },
  });

  return NextResponse.json(role, { status: 201 });
}
