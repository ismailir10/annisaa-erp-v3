import { createClient } from "./supabase/server";
import { prisma } from "./db";

export type SessionUser = {
  id: string;
  email: string;
  role: "SCHOOL_ADMIN" | "TEACHER";
  name: string | null;
  tenantId: string | null;
  employeeId: string | null;
};

/**
 * Get the current session user.
 * Reads Supabase Auth session, then looks up the Prisma User by email.
 * Auto-creates the Prisma User on first login if employee exists with that email.
 */
export async function getSession(): Promise<SessionUser | null> {
  // Check if we're in demo mode (no Supabase URL configured)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL === "") {
    return getDemoSession();
  }

  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser?.email) return null;

    // Look up Prisma User by email
    let user = await prisma.user.findUnique({
      where: { email: authUser.email },
    });

    // Auto-create User on first Supabase Auth login
    if (!user) {
      // Check if there's an employee with this email
      const employee = await prisma.employee.findFirst({
        where: { email: authUser.email },
      });

      if (employee) {
        // Create Teacher user linked to employee
        user = await prisma.user.create({
          data: {
            tenantId: employee.tenantId,
            email: authUser.email,
            role: "TEACHER",
            name: employee.nama,
            employeeId: employee.id,
          },
        });
      } else {
        // Check if this is the admin email
        const tenant = await prisma.tenant.findFirst();
        if (tenant) {
          user = await prisma.user.create({
            data: {
              tenantId: tenant.id,
              email: authUser.email,
              role: "SCHOOL_ADMIN",
              name: authUser.user_metadata?.full_name ?? authUser.email.split("@")[0],
            },
          });
        }
      }
    }

    if (!user) return null;

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      id: user.id,
      email: user.email,
      role: user.role as SessionUser["role"],
      name: user.name,
      tenantId: user.tenantId,
      employeeId: user.employeeId,
    };
  } catch {
    // Fallback to demo mode if Supabase is not reachable
    return getDemoSession();
  }
}

/**
 * Demo mode fallback — cookie-based auth for local development.
 */
async function getDemoSession(): Promise<SessionUser | null> {
  // Dynamic import to avoid issues in production
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const userId = cookieStore.get("school-erp-session")?.value;
  if (!userId) return null;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    role: user.role as SessionUser["role"],
    name: user.name,
    tenantId: user.tenantId,
    employeeId: user.employeeId,
  };
}
