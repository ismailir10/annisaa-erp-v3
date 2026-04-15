import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// Cache campuses for 1 hour (static data)
export const revalidate = 3600;

export async function GET() {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json([], { status: 401 });

  const campuses = await prisma.campus.findMany({
    where: { tenantId: session.tenantId },
    include: { _count: { select: { employees: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(campuses);
}

export async function POST(req: NextRequest) {
  const { success } = rateLimit(`create-campus:${getClientIp(req)}`, 5, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
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
