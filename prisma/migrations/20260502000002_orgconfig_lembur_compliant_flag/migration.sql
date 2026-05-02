-- F-14 overtime compliance feature flag.
-- Adds OrgConfig.lemburCompliant. When true, payroll engine applies
-- UU 13/2003 §78(4) tiered overtime rates (1.5× first hour, 2× thereafter).
-- Defaults to false so existing tenants keep the historical flat per-hour
-- calculation until they explicitly opt into the compliant path.

ALTER TABLE "OrgConfig"
  ADD COLUMN "lemburCompliant" BOOLEAN NOT NULL DEFAULT false;
