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

  return NextResponse.json({ ok: true });
}
