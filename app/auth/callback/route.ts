import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Get user to determine redirect
      const { data: { user } } = await supabase.auth.getUser();

      if (user?.email) {
        // Import prisma dynamically to check user role
        const { prisma } = await import("@/lib/db");
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

        // Default: admin (will be auto-created by getSession)
        return NextResponse.redirect(`${origin}/admin`);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth error — redirect back to login
  return NextResponse.redirect(`${origin}/?error=auth_failed`);
}
