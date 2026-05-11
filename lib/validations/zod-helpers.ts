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
