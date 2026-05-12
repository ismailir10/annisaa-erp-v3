import { z } from "zod";

/**
 * Optional-string preprocessor: trim, treat empty as undefined.
 *
 * HTML form fields that are not filled in arrive as `""` in the JSON
 * payload. Pass that into `.email()`/`.regex()` and the inner validator
 * fails on the empty string, producing false-positive errors like
 * "Email tidak valid" on an unfilled optional email.
 *
 * Wrap the inner validator with this helper so:
 *   - whitespace is trimmed,
 *   - empty becomes `undefined` (the inner validator is skipped),
 *   - non-empty strings still go through the inner validator.
 *
 * Lifted from `lib/admission/submit-validation.ts` (Phase 1.1) and shared
 * here so the admin Zod schemas can use the same shape — closing the
 * cycle 1.1 follow-up bug where the admin create/update schemas rejected
 * `""` on optional emails / phones.
 */
export function optionalTrimmed<T extends z.ZodType<string>>(inner: T) {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    return t === "" ? undefined : t;
  }, inner.optional());
}

/**
 * Optional-enum (or any optional non-string) preprocessor: coerce empty-string
 * and null to undefined before the inner validator runs.
 *
 * Why: `z.enum([...]).optional()` only lets `undefined` pass — an unfilled
 * `<Select>` whose state default is `""` falls through to the enum check
 * and fails with "Invalid option". Form state shapes routinely seed select
 * fields with `""`; preprocessing solves it at the schema layer so every
 * call site doesn't have to remember to omit blanks.
 *
 * Use for enums + any optional non-string whose form-state default is `""`.
 * For optional plain strings, prefer `optionalTrimmed` (also trims whitespace;
 * this helper does not).
 */
export function optionalEnum<T extends z.ZodTypeAny>(inner: T) {
  return z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    inner.optional(),
  );
}
