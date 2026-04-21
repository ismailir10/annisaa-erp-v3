import { NextResponse } from "next/server";
import { getSession, isAdminRole, type SessionUser } from "@/lib/auth";

/**
 * Admin guard for Student Journal routes.
 *
 * Returns `{ session }` when the caller is authenticated AND carries an admin
 * role (SUPER_ADMIN or SCHOOL_ADMIN) AND has a tenantId. Otherwise returns
 * `{ error: NextResponse }` ready to be returned from the handler.
 *
 * Using `isAdminRole()` (not `session.role === "SCHOOL_ADMIN"`) — the
 * latter pattern caused a bug during the student CRUD cycle where
 * SUPER_ADMIN users were denied their own tenant's data.
 */
export async function requireAdmin(): Promise<
  | { session: SessionUser & { tenantId: string }; error?: undefined }
  | { session?: undefined; error: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!isAdminRole(session.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (!session.tenantId) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session: session as SessionUser & { tenantId: string } };
}
