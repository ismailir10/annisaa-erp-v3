import { z } from "zod";

/**
 * An email field that accepts "not provided".
 *
 * Every admin form in this repo initialises its text inputs to `""`, so a
 * blank Email box submits an empty string rather than omitting the key. A
 * plain `z.string().email().optional().nullable()` rejects that with
 * "Email tidak valid", which made a wali with no email address impossible to
 * create — the exact families the duplicate guard exists to protect, since
 * an emailless parent is the one that used to get a fresh Parent row per
 * child. Empty and whitespace-only collapse to undefined so the optional
 * path fires and the handler's `email = null` default applies.
 */
export const optionalEmail = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().email("Email tidak valid").max(200).optional().nullable(),
);
