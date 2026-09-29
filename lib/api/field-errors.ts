import { NextResponse } from "next/server";

/**
 * Standard "one field is wrong" response for business-rule failures the Zod
 * schema cannot see (uniqueness, ownership). Same envelope as
 * `validateBody`'s 400 — `{ error, errors: [{ field, message }] }` — so the
 * client's `applyServerErrors` lands the message on the named form field.
 * Default status is 409 (conflict with existing data).
 */
export function fieldErrorResponse(field: string, message: string, status = 409) {
  return NextResponse.json({ error: message, errors: [{ field, message }] }, { status });
}

/** True for a Prisma unique-constraint violation (P2002), without importing the client. */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code?: unknown }).code === "P2002";
}
