import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// Cache campuses for 1 hour (static data)
export const revalidate = 3600;

export async function GET(req?: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json([], { status: 401 });

  // FIND-004: support an optional `?status=` query so the Campus page can
  // surface deactivated rows for the reactivate flow. Default remains ACTIVE
  // for backwards compatibility (the dropdown population in dialogs etc.
  // should never see inactive campuses without explicit opt-in). `req` is
  // optional because existing tests call GET() with no argument.
  const statusParam = req?.nextUrl?.searchParams.get("status") ?? null;
  const where: { tenantId: string; status?: "ACTIVE" | "INACTIVE" } = {
    tenantId: session.tenantId,
  };
  if (statusParam === "INACTIVE") where.status = "INACTIVE";
  else if (statusParam === "ALL") {
    // no status filter
  } else where.status = "ACTIVE";

  const campuses = await prisma.campus.findMany({
    where,
    include: { _count: { select: { employees: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(campuses);
}

export async function POST(req: NextRequest) {
  const { success } = rateLimit(`create-campus:${getClientIp(req)}`, 5, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, address, lat, lng } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const campus = await prisma.campus.create({
    data: {
      tenantId: session.tenantId,
      name: name.trim(),
      address: address?.trim() || null,
      lat: lat ? parseFloat(lat) : null,
      lng: lng ? parseFloat(lng) : null,
    },
  });

  return NextResponse.json(campus, { status: 201 });
}
