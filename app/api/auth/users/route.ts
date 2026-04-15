import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Demo-only: list users for login selector — only when DEMO_MODE=true
export async function GET() {
  if (process.env.DEMO_MODE !== "true") {
    return NextResponse.json(
      { error: "Demo user list disabled." },
      { status: 404 }
    );
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      employeeId: true,
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(users);
}
