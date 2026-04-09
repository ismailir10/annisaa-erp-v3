import { Label } from "@/components/ui/label";
import { ReactNode } from "react";

/**
 * Consistent form field wrapper: label + input + error + help text.
 * Standardizes spacing and error display across all forms.
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
    <div className={className}>
      <Label>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      {help && !error && <p className="text-xs text-muted-foreground mt-1">{help}</p>}
    </div>
  );
}
