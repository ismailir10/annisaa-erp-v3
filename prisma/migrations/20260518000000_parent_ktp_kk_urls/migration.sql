-- Cycle: 2026-05-18 kesiswaan-crud-audit (T13).
-- Add nullable document-scan columns to Parent for KTP and KK (Kartu Keluarga).
-- Both columns store auth-proxy storage tokens populated by upload endpoints
-- (T14). Additive-only, no backfill required — existing rows remain NULL until
-- a parent uploads scans through the admin/portal UI.

-- AlterTable
ALTER TABLE "Parent" ADD COLUMN     "kkUrl" TEXT,
ADD COLUMN     "ktpUrl" TEXT;
