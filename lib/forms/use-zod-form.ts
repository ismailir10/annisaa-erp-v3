"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type FieldValues, type UseFormProps } from "react-hook-form";
import type * as z4 from "zod/v4/core";

/**
 * The one way an admin form is created: react-hook-form driven by the same
 * zod schema the API route validates with (`lib/validations/**`), or a form
 * schema derived from it.
 *
 * - `mode: "onTouched"` — a field shows its error after the user leaves it
 *   (or on submit), then re-validates live. No red text while still typing
 *   into a field for the first time.
 * - `shouldFocusError` — submit moves focus to the first invalid field.
 *   `FormField` registers a focus target by id, so this works for Select,
 *   DatePicker, RupiahInput etc., not only native inputs.
 *
 * Values are typed as the schema's input; `handleSubmit` receives the
 * parsed output (trimmed strings, coerced numbers, preprocessed optionals).
 */
export function useZodForm<TSchema extends z4.$ZodType<FieldValues, FieldValues>>(
  schema: TSchema,
  options?: Omit<UseFormProps<z4.input<TSchema>, unknown, z4.output<TSchema>>, "resolver">,
) {
  return useForm<z4.input<TSchema>, unknown, z4.output<TSchema>>({
    mode: "onTouched",
    shouldFocusError: true,
    ...options,
    resolver: zodResolver(schema),
  });
}
