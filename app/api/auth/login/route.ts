import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cookies } from "next/headers";

// Demo-only login — disabled when Supabase Auth is configured
export async function POST(req: NextRequest) {
  // Block in production — only allow when Supabase is not configured
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json(
      { error: "Demo login disabled. Use Supabase Auth." },
      { status: 403 }
    );
  }

  const { userId } = await req.json();
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const cookieStore = await cookies();
  cookieStore.set("school-erp-session", userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const redirectUrl = user.role === "SCHOOL_ADMIN" ? "/admin" : "/teacher";
  return NextResponse.json({ ok: true, role: user.role, redirectUrl });
}
