/**
 * Reseed staging — destructive reseed of the staging Supabase project.
 *
 * Usage:
 *   STAGING_CONFIRM=yes \
 *   STAGING_SUPABASE_REF=<staging-project-ref> \
 *   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
 *   DATABASE_URL=postgres://... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   XENDIT_SECRET_KEY=xnd_development_... \
 *   npm run reseed:staging
 *
 * Refuses to run if:
 *   - any env var above is missing
 *   - STAGING_SUPABASE_REF looks like a production ref
 *   - NEXT_PUBLIC_SUPABASE_URL host does not match STAGING_SUPABASE_REF
 *   - XENDIT_SECRET_KEY is not a sandbox key (xnd_development_*)
 *
 * Take a manual Supabase snapshot via the dashboard before running.
 */
import { validateReseedEnv, formatGuardErrors } from "./reseed/guards";

const REMINDER = `
==============================================================
 RESEED STAGING — DESTRUCTIVE
 This will TRUNCATE every application table and delete
 non-preserved auth.users rows in the staging Supabase project.
 Take a manual DB snapshot via the Supabase dashboard BEFORE
 continuing. Press Ctrl+C within 5 seconds to abort.
==============================================================
`;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function countdown(seconds: number): Promise<void> {
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`  Starting in ${i}s ... \r`);
    await sleep(1000);
  }
  process.stdout.write("  Starting now.        \n");
}

async function main() {
  const guard = validateReseedEnv({
    STAGING_CONFIRM: process.env.STAGING_CONFIRM,
    STAGING_SUPABASE_REF: process.env.STAGING_SUPABASE_REF,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    XENDIT_SECRET_KEY: process.env.XENDIT_SECRET_KEY,
  });

  if (!guard.ok || !guard.resolved) {
    console.error(formatGuardErrors(guard.errors));
    process.exit(1);
  }

  console.log(REMINDER);
  console.log(`  Staging ref    : ${guard.resolved.stagingRef}`);
  console.log(`  Supabase host  : ${guard.resolved.supabaseHost}`);
  console.log(`  Xendit mode    : sandbox`);
  console.log("");

  await countdown(5);

  console.log("[reseed] scaffolding complete — orchestration lands in T9.");
}

main().catch((err) => {
  console.error("[reseed] fatal:", err);
  process.exit(1);
});
