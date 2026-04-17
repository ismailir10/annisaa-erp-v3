import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminRole } from "@/lib/auth";
import { resolveCallbackOrigin } from "@/lib/auth-callback";

type PendingCookie = {
  name: string;
  value: string;
  options: Parameters<
    ReturnType<typeof NextResponse.next>["cookies"]["set"]
  >[2];
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const base = resolveCallbackOrigin(request);

  // Cookies written by `exchangeCodeForSession` are captured here and applied
  // to the final redirect response. Returning `NextResponse.redirect(...)`
  // directly from a route handler does NOT inherit ambient `cookies().set()`
  // writes — the Set-Cookie headers are lost and the browser has no session
  // on the next request, producing the /auth/callback → /admin → / loop.
  const pending: PendingCookie[] = [];

  const respond = (path: string) => {
    const res = NextResponse.redirect(`${base}${path}`);
    for (const { name, value, options } of pending) {
      res.cookies.set(name, value, options);
    }
    console.log(
      `[AUTH-DBG] callback redirect: path=${path} base=${base} attached=${pending.length}`
    );
    return res;
  };

  if (!code) return respond("/?error=no_code");

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            for (const c of cookiesToSet) {
              pending.push({ name: c.name, value: c.value, options: c.options });
            }
            console.log(
              `[AUTH-DBG] callback setAll: ${cookiesToSet.length} cookies — ${cookiesToSet
                .map((c) => c.name)
                .join(",")}`
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth/callback] exchange_failed:", error.message);
      return respond("/?error=exchange_failed");
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      console.error("[auth/callback] no_email after exchange");
      return respond("/?error=no_email");
    }

    try {
      const { prisma } = await import("@/lib/db");
      const prismaUser = await prisma.user.findUnique({
        where: { email: user.email },
      });

      if (isAdminRole(prismaUser?.role ?? "")) return respond("/admin");
      if (prismaUser?.role === "TEACHER") return respond("/teacher");
      if (prismaUser?.role === "GUARDIAN") return respond("/parent");

      const employee = await prisma.employee.findFirst({
        where: { email: user.email },
      });
      if (employee) return respond("/teacher");

      const parent = await prisma.parent.findFirst({
        where: { email: user.email },
      });
      if (parent) return respond("/parent");
    } catch (dbError) {
      console.error("[auth/callback] db_lookup_failed:", dbError);
    }

    return respond("/?error=access_denied");
  } catch (e) {
    console.error("[auth/callback] unhandled:", e);
    return respond("/?error=callback_error");
  }
}
