import { z } from "zod";

/**
 * Identifier for a fee or salary component (`FeeComponentDef.code`,
 * `SalaryComponentDef.code`). The code is permanent, unique per tenant, and
 * referenced by import files, seed data and payroll rules (`gaji_pokok`), so it
 * must be a plain slug — the dialogs used to save "E2E FIN BAD!!" as
 * "e2e fin bad!!" (FIN-4 / HR-10, cycle 2026-09-29 data-integrity).
 *
 * Existing rows are lowercase snake_case (`spp`, `gaji_pokok`), so the rule
 * keeps that convention: letters, digits, `_` and `-`, starting with a letter
 * or digit, normalised to lowercase (which also keeps the (tenantId, code)
 * unique key case-insensitive in practice).
 */
export const COMPONENT_CODE_REGEX = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export const componentCodeSchema = z
  .string({ message: "Kode wajib diisi" })
  .trim()
  .min(1, "Kode wajib diisi")
  .max(64, "Kode maksimal 64 karakter")
  .regex(
    COMPONENT_CODE_REGEX,
    "Kode hanya boleh huruf, angka, garis bawah (_) atau tanda hubung (-), tanpa spasi",
  )
  .transform((s) => s.toLowerCase());
