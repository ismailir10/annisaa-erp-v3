"use client";

import { toast } from "sonner";
import type { FieldPath, FieldValues, UseFormSetError } from "react-hook-form";

import { ApiError, userMessage } from "@/lib/api/client-errors";

/** Message shown when the server rejected specific fields. */
export const FIELD_ERRORS_MESSAGE = "Gagal menyimpan. Periksa kolom yang ditandai.";

function hasPath(values: unknown, path: string): boolean {
  let cursor: unknown = values;
  for (const key of path.split(".")) {
    if (cursor === null || typeof cursor !== "object" || !(key in cursor)) return false;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return true;
}

/**
 * Route a failed submit back into the form.
 *
 * - An `ApiError` carrying `fieldErrors` (the standard `validateBody` 400
 *   body `{ error, errors: [{ field, message }] }`) → each error whose
 *   `field` is a path in the form's values lands on that field; focus moves
 *   to the first one.
 * - If none of them match a form field — or the error carries no field
 *   errors at all (a 409/500, a network failure) — the message goes to
 *   `errors.root.server` (rendered by `FormRootError`) + a toast. Only an
 *   `ApiError`'s message is ever shown; everything else gets `fallback`.
 */
export function applyServerErrors<T extends FieldValues>(
  form: { setError: UseFormSetError<T>; getValues: () => unknown },
  err: unknown,
  fallback: string,
): void {
  const values = form.getValues();
  let mapped = 0;
  if (err instanceof ApiError) {
    for (const { field: rawField, message } of err.fieldErrors) {
      // zod paths arrive dotted (`lines.0.amount`); accept bracket form too.
      const field = rawField.replace(/\[(\d+)\]/g, ".$1");
      if (!field || !hasPath(values, field)) continue;
      form.setError(field as FieldPath<T>, { type: "server", message }, { shouldFocus: mapped === 0 });
      mapped++;
    }
  }

  if (mapped > 0) {
    toast.error(FIELD_ERRORS_MESSAGE);
    return;
  }

  const message = userMessage(err, fallback);
  form.setError("root.server" as FieldPath<T>, { type: "server", message });
  toast.error(message);
}
