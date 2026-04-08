import { cookies } from "next/headers";
import { prisma } from "./db";

const SESSION_COOKIE = "school-erp-session";

export type SessionUser = {
  id: string;
  email: string;
  role: "SCHOOL_ADMIN" | "TEACHER";
  name: string | null;
  tenantId: string | null;
  employeeId: string | null;
};

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;
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

export async function createSession(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
