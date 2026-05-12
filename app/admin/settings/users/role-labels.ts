/**
 * Pengguna-table role display helpers. Extracted from page.tsx so that
 * vitest can import the pure logic without evaluating the `"use client"`
 * page module (which transitively pulls React hooks, sonner, lucide,
 * Shadcn Dialog, etc.).
 */

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  SCHOOL_ADMIN: "Admin",
  TEACHER: "Guru",
  GUARDIAN: "Wali Murid",
};

type RoleSubject = {
  role: string;
  customRole: { name: string } | null;
};

export function getRoleLabel(user: RoleSubject): string {
  if (user.customRole) return user.customRole.name;
  return ROLE_LABELS[user.role] ?? user.role;
}
