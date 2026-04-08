import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

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
