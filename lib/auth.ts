import { createClient } from "./supabase/server";
import { prisma } from "./db";

export type SessionUser = {
  id: string;
  email: string;
  role: "SCHOOL_ADMIN" | "TEACHER" | "GUARDIAN";
  name: string | null;
  tenantId: string | null;
  employeeId: string | null;
  parentId: string | null;
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
        // Check if there's a parent with this email
        const parent = await prisma.parent.findFirst({
          where: { email: authUser.email },
        });

        if (parent) {
          user = await prisma.user.create({
            data: {
              tenantId: parent.tenantId,
              email: authUser.email,
              role: "GUARDIAN",
              name: parent.name,
              parentId: parent.id,
            },
          });
        } else {
          // Not an employee, not a guardian, no existing User → deny access
          return null;
        }
      }
    }

    if (!user) return null;

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // For guardian users, find their parent ID
    let parentId: string | null = (user as { parentId?: string | null }).parentId ?? null;
    if (user.role === "GUARDIAN" && !parentId) {
      const parent = await prisma.parent.findFirst({ where: { email: user.email } });
      parentId = parent?.id ?? null;
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role as SessionUser["role"],
      name: user.name,
      tenantId: user.tenantId,
      employeeId: user.employeeId,
      parentId,
    };
  } catch {
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
    parentId: null,
  };
}
