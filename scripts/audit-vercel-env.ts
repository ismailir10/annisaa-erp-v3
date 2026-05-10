// Audits production-scope Vercel env vars against .env.example.
// Run before turning on the backup workflow (T6) — prevents shipping with
// PROD_DB_URL pointed at staging or with sandbox Xendit creds in prod.
//
// Usage: npx tsx scripts/audit-vercel-env.ts
// Requires: `vercel login` + `vercel link` to the project.
//
// Exit codes:
//   0 — all required vars present (STAGING_* leaks are warned, not failed)
//   1 — required vars missing
//   2 — `vercel env ls` failed (CLI not installed / not logged in / not linked)
import { execSync } from "child_process";
import { readFileSync } from "fs";

const ENV_EXAMPLE_PATH = ".env.example";

// Optional in .env.example — surfaced for visibility, never fail the audit.
const OPTIONAL_VARS = new Set(["ANALYZE", "STAGING_EMAIL_OVERRIDE"]);

export function parseEnvExample(text: string): Set<string> {
  const names = new Set<string>();
  for (const line of text.split("\n")) {
    const m = line.match(/^[#\s]*([A-Z_][A-Z0-9_]*)=/);
    if (m) names.add(m[1]);
  }
  return names;
}

export function parseVercelEnvOutput(raw: string): Set<string> {
  // `vercel env ls production` output rows look like:
  //   DATABASE_URL                        Encrypted  Production  ...
  // First column is the var name. The regex matches uppercase identifiers
  // starting at the beginning of the line (after whitespace). The header
  // row uses lowercase ("name") which doesn't match — no special-case needed.
  const names = new Set<string>();
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\b/);
    if (m) names.add(m[1]);
  }
  return names;
}

export interface AuditResult {
  expected: Set<string>;
  actual: Set<string>;
  missing: string[];
  extras: string[];
  stagingLeaks: string[];
}

export function diffEnv(
  expected: Set<string>,
  actual: Set<string>,
  optional: Set<string>,
): AuditResult {
  const required = new Set([...expected].filter((v) => !optional.has(v)));
  const missing = [...required].filter((v) => !actual.has(v)).sort();
  const extras = [...actual].filter((v) => !expected.has(v)).sort();
  const stagingLeaks = extras.filter((v) => v.startsWith("STAGING_"));
  return { expected, actual, missing, extras, stagingLeaks };
}

function fetchVercelEnv(): Set<string> {
  let raw: string;
  try {
    raw = execSync("vercel env ls production", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    console.error(
      "ERROR: 'vercel env ls production' failed. Run `vercel login` and `vercel link` first.",
    );
    console.error(err instanceof Error ? err.message : err);
    process.exit(2);
  }
  return parseVercelEnvOutput(raw);
}

function main(): void {
  const expected = parseEnvExample(readFileSync(ENV_EXAMPLE_PATH, "utf-8"));
  const actual = fetchVercelEnv();
  const result = diffEnv(expected, actual, OPTIONAL_VARS);

  console.log("=== Vercel production env audit ===");
  console.log(`Expected (.env.example):   ${expected.size} vars`);
  console.log(`Actual (Vercel prod):      ${actual.size} vars`);
  console.log("");

  if (result.missing.length === 0) {
    console.log("✓ No missing required vars");
  } else {
    console.log(`✗ Missing required vars (${result.missing.length}):`);
    for (const v of result.missing) console.log(`    ${v}`);
  }

  if (result.extras.length > 0) {
    console.log(
      `\nℹ Extras in Vercel not in .env.example (${result.extras.length}):`,
    );
    for (const v of result.extras) console.log(`    ${v}`);
  }

  if (result.stagingLeaks.length > 0) {
    console.log(
      `\n⚠ STAGING_* keys in production scope (${result.stagingLeaks.length}) — likely leak:`,
    );
    for (const v of result.stagingLeaks) console.log(`    ${v}`);
  }

  // STAGING_* leaks warn (printed above) but do NOT fail the audit.
  // Operator decides whether the leak is intentional (e.g., a shared
  // STAGING_EMAIL_OVERRIDE intentionally also set in prod for parity).
  process.exit(result.missing.length > 0 ? 1 : 0);
}

// Run only when invoked directly (not when imported by tests).
const invokedDirectly =
  typeof require !== "undefined" && require.main === module;
if (invokedDirectly) main();
