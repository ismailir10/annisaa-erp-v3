import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error) {
        const { data: { user } } = await supabase.auth.getUser();

        if (user?.email) {
          // Check if user exists in our DB
          const prismaUser = await prisma.user.findUnique({
            where: { email: user.email },
          });

          if (prismaUser?.role === "SCHOOL_ADMIN") {
            return NextResponse.redirect(`${origin}/admin`);
          } else if (prismaUser?.role === "TEACHER") {
            return NextResponse.redirect(`${origin}/teacher`);
          }

          // Check if employee exists (first-time teacher login)
          const employee = await prisma.employee.findFirst({
            where: { email: user.email },
          });
          if (employee) {
            return NextResponse.redirect(`${origin}/teacher`);
          }

          // New user — will be auto-created as admin by getSession()
          return NextResponse.redirect(`${origin}/admin`);
        }

        return NextResponse.redirect(`${origin}/admin`);
      }
    } catch (e) {
      console.error("Auth callback error:", e);
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth_failed`);
}
