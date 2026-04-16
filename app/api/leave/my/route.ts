import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Teacher: get my leave requests
export async function GET() {
  const session = await getSession();
  if (!session?.employeeId) return NextResponse.json([], { status: 401 });

  const requests = await prisma.leaveRequest.findMany({
    where: { employeeId: session.employeeId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(requests);
}
