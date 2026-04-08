import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Demo-only: list users for login selector — disabled when Supabase is configured
export async function GET() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json(
      { error: "Demo user list disabled. Use Supabase Auth." },
      { status: 403 }
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
