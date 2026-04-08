import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Demo-only: list all users for login selector
// Remove when switching to Supabase Auth
export async function GET() {
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
