import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error("Exchange code error:", error.message);
        return NextResponse.redirect(`${origin}/?error=exchange_failed`);
      }

      const { data: { user } } = await supabase.auth.getUser();

      if (!user?.email) {
        console.error("No user email after exchange");
        return NextResponse.redirect(`${origin}/?error=no_email`);
      }

      // Try to determine role from DB, but don't crash if DB fails
      try {
        const { prisma } = await import("@/lib/db");
        const prismaUser = await prisma.user.findUnique({
          where: { email: user.email },
        });

        if (prismaUser?.role === "SCHOOL_ADMIN") {
          return NextResponse.redirect(`${origin}/admin`);
        } else if (prismaUser?.role === "TEACHER") {
          return NextResponse.redirect(`${origin}/teacher`);
        } else if (prismaUser?.role === "GUARDIAN") {
          return NextResponse.redirect(`${origin}/parent`);
        }

        // Check if employee exists (first-time teacher login)
        const employee = await prisma.employee.findFirst({
          where: { email: user.email },
        });
        if (employee) {
          return NextResponse.redirect(`${origin}/teacher`);
        }

        // Check if parent exists (first-time parent login)
        const parent = await prisma.parent.findFirst({
          where: { email: user.email },
        });
        if (parent) {
          return NextResponse.redirect(`${origin}/parent`);
        }
      } catch (dbError) {
        console.error("DB lookup in callback failed:", dbError);
      }

      // Email not provisioned — no matching Employee, Parent, or User
      return NextResponse.redirect(`${origin}/?error=access_denied`);
    } catch (e) {
      console.error("Auth callback error:", e);
      return NextResponse.redirect(`${origin}/?error=callback_error`);
    }
  }

  return NextResponse.redirect(`${origin}/?error=no_code`);
}
