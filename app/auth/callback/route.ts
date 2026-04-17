import { isAdminRole } from "@/lib/auth";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallbackOrigin } from "@/lib/auth-callback";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const base = resolveCallbackOrigin(request);
  const go = (path: string) => NextResponse.redirect(`${base}${path}`);

  if (!code) return go("/?error=no_code");

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("Exchange code error:", error.message);
      return go("/?error=exchange_failed");
    }

    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.email) {
      console.error("No user email after exchange");
      return go("/?error=no_email");
    }

    // Try to determine role from DB, but don't crash if DB fails
    try {
      const { prisma } = await import("@/lib/db");
      const prismaUser = await prisma.user.findUnique({
        where: { email: user.email },
      });

      if (isAdminRole(prismaUser?.role ?? "")) return go("/admin");
      if (prismaUser?.role === "TEACHER") return go("/teacher");
      if (prismaUser?.role === "GUARDIAN") return go("/parent");

      // Check if employee exists (first-time teacher login)
      const employee = await prisma.employee.findFirst({
        where: { email: user.email },
      });
      if (employee) return go("/teacher");

      // Check if parent exists (first-time parent login)
      const parent = await prisma.parent.findFirst({
        where: { email: user.email },
      });
      if (parent) return go("/parent");
    } catch (dbError) {
      console.error("DB lookup in callback failed:", dbError);
    }

    // Email not provisioned — no matching Employee, Parent, or User
    return go("/?error=access_denied");
  } catch (e) {
    console.error("Auth callback error:", e);
    return go("/?error=callback_error");
  }
}
