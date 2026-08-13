import { z } from "zod";

/**
 * Body schema for `PUT /api/employees/[id]/salary`.
 *
 * Each entry sets a single salary-component value for the employee.
 * Empty arrays are permitted — that is the canonical way to clear all
 * component values for an employee (the upsert loop is a no-op).
 *
 * Validation rules:
 *   - body must be an array (top-level non-array → 400)
 *   - `componentDefId` is a non-empty string (the FK to `SalaryComponentDef`)
 *   - `value` is a finite number ≥ 0 (negative salary components are not
 *     a valid concept here — deductions are modeled as a separate component
 *     category, not as negative income values)
 *   - `value` must be a number, not a numeric string (callers must coerce
 *     before sending — this catches the F-05 bug where Prisma blew up on
 *     `value: "not-a-number"`)
 */
export const updateEmployeeSalarySchema = z.array(
  z.object({
    componentDefId: z.string().min(1, "Komponen gaji wajib dipilih"),
    value: z
      .number({ message: "Nilai harus berupa angka" })
      .nonnegative("Nilai tidak boleh kurang dari 0")
      .finite("Nilai harus berupa angka yang valid"),
  })
);

export type UpdateEmployeeSalaryInput = z.infer<typeof updateEmployeeSalarySchema>;
