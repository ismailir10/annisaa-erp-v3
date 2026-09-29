import { NextResponse } from "next/server";
import { getSystemRolePermissions } from "@/lib/permissions";

/**
 * Privilege-escalation guards for role / user management (HR-1).
 *
 * Rule: a non-SUPER_ADMIN may only hand out permissions they currently hold.
 * Without it a SCHOOL_ADMIN could create a role with `payroll.*`, assign it to
 * themselves, and `derivePermissions` would replace their enum defaults with it.
 * SUPER_ADMIN is the owner escape hatch and is never restricted.
 */

type Actor = { role: string; permissions?: string[] | null };

/** Permission codes in `wanted` that `actor` does not currently hold. */
export function permissionsActorLacks(actor: Actor, wanted: readonly string[]): string[] {
  if (actor.role === "SUPER_ADMIN") return [];
  const held = new Set(actor.permissions ?? []);
  return Array.from(new Set(wanted)).filter((p) => !held.has(p));
}

/** Parse Role.permissions (JSON string[]). Malformed → [] (grants nothing). */
export function parseRolePermissions(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

/** Effective permissions of a user with no custom role (enum defaults). */
export function enumRolePermissions(role: string): string[] {
  return getSystemRolePermissions(role);
}

/** 403 naming the permissions the actor is trying to hand out but does not hold. */
export function escalationForbidden(missing: string[]): NextResponse {
  return NextResponse.json(
    {
      error: `Anda tidak bisa memberikan izin yang tidak Anda miliki: ${missing.join(", ")}`,
      missing,
    },
    { status: 403 },
  );
}
