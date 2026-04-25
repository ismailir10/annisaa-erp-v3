export type GuardEnv = {
  STAGING_CONFIRM?: string;
  STAGING_SUPABASE_REF?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  DATABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  XENDIT_SECRET_KEY?: string;
};

export type GuardResult = {
  ok: boolean;
  errors: string[];
  resolved: {
    stagingRef: string;
    supabaseHost: string;
  } | null;
};

const PROD_REF_MARKERS = ["prod", "production", "live"];

export function validateReseedEnv(env: GuardEnv): GuardResult {
  const errors: string[] = [];

  if (env.STAGING_CONFIRM?.trim() !== "yes") {
    errors.push(
      "STAGING_CONFIRM=yes is required. This script performs a destructive reseed.",
    );
  }

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl) {
    errors.push("NEXT_PUBLIC_SUPABASE_URL is required.");
  }

  let host = "";
  if (supabaseUrl) {
    try {
      host = new URL(supabaseUrl).host;
    } catch {
      errors.push(
        `NEXT_PUBLIC_SUPABASE_URL='${supabaseUrl}' is not a valid URL.`,
      );
    }
  }

  // Auto-derive STAGING_SUPABASE_REF from the Supabase URL host when unset.
  // Pattern: `<ref>.supabase.co` or `<ref>.supabase.in`.
  let stagingRef = env.STAGING_SUPABASE_REF?.trim().toLowerCase();
  if (!stagingRef && host) {
    const m = host.match(/^([a-z0-9-]+)\.supabase\.(co|in)$/i);
    if (m) stagingRef = m[1].toLowerCase();
  }

  if (!stagingRef) {
    errors.push(
      "STAGING_SUPABASE_REF could not be determined. Either set it explicitly, or supply NEXT_PUBLIC_SUPABASE_URL pointing at a `<ref>.supabase.co` host.",
    );
  } else if (
    PROD_REF_MARKERS.some((m) => stagingRef!.toLowerCase().includes(m))
  ) {
    errors.push(
      `STAGING_SUPABASE_REF='${stagingRef}' contains a prod marker. Refusing to run.`,
    );
  }

  if (host && stagingRef && !host.startsWith(`${stagingRef}.`)) {
    errors.push(
      `NEXT_PUBLIC_SUPABASE_URL host '${host}' does not start with staging ref '${stagingRef}.'. Refusing to run against a non-staging project.`,
    );
  }

  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    errors.push("DATABASE_URL is required.");
  } else if (stagingRef) {
    // Cross-check: DATABASE_URL must reference the same staging project.
    // Supabase direct hosts use `db.<ref>.supabase.co`.
    // Supabase pooler URLs put the ref in the username: `postgres.<ref>@aws-0-…pooler.supabase.com`.
    let parsed: URL | null = null;
    try {
      parsed = new URL(databaseUrl);
    } catch {
      errors.push(`DATABASE_URL is not a valid URL.`);
    }
    if (parsed) {
      const haystack = `${parsed.host}|${parsed.username}`.toLowerCase();
      if (!haystack.includes(stagingRef)) {
        errors.push(
          `DATABASE_URL does not contain staging ref '${stagingRef}'. Refusing to run — possible split-brain (auth wipe in staging Supabase, TRUNCATE elsewhere).`,
        );
      }
    }
  }

  if (!env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    errors.push("SUPABASE_SERVICE_ROLE_KEY is required.");
  }

  const xenditKey = env.XENDIT_SECRET_KEY?.trim();
  if (!xenditKey) {
    errors.push("XENDIT_SECRET_KEY is required.");
  } else if (!xenditKey.startsWith("xnd_development_")) {
    errors.push(
      "XENDIT_SECRET_KEY must be a sandbox key (prefix 'xnd_development_'). Refusing to run against production Xendit.",
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    resolved:
      errors.length === 0 && stagingRef && host
        ? { stagingRef, supabaseHost: host }
        : null,
  };
}

export function formatGuardErrors(errors: string[]): string {
  const header = "Reseed preflight failed:";
  const body = errors.map((e) => `  - ${e}`).join("\n");
  const footer =
    "\nSet every env var listed above and re-run. See README for details.";
  return `${header}\n${body}${footer}`;
}
