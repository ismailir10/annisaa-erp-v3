// @public — no session required; clears Supabase + demo cookies.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export async function POST() {
  // Sign out from Supabase
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  // Also clear demo cookie
  const cookieStore = await cookies();
  cookieStore.delete("school-erp-session");

  // Defense-in-depth: explicit no-store so the logout response itself can
  // never be cached by an intermediary or restored from disk cache. Portal
  // HTML pages already carry Next.js's dynamic-route default (private,
  // no-cache, no-store, max-age=0, must-revalidate) — Chrome's bfcache
  // disqualification rule (MainResourceHasCacheControlNoStore) applies on
  // the prior portal page; this header makes the policy explicit at the
  // auth boundary.
  return NextResponse.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    },
  );
}
