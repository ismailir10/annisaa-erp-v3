import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { ReactNode } from "react";

/**
 * Backward-compatible form field wrapper built on the canonical Field primitives.
 */
export function FormField({
  label,
  required,
  error,
  help,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  error?: string;
  help?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Field className={className} data-invalid={error ? "true" : undefined}>
      <FieldLabel required={required}>{label}</FieldLabel>
      {children}
      {error ? <FieldError>{error}</FieldError> : null}
      {help && !error ? <FieldDescription>{help}</FieldDescription> : null}
    </Field>
  );
}
