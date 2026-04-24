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

  const stagingRef = env.STAGING_SUPABASE_REF?.trim().toLowerCase();
  if (!stagingRef) {
    errors.push(
      "STAGING_SUPABASE_REF is required (the Supabase project ref for the staging project, e.g. 'abcde12345').",
    );
  } else if (
    PROD_REF_MARKERS.some((m) => stagingRef.toLowerCase().includes(m))
  ) {
    errors.push(
      `STAGING_SUPABASE_REF='${stagingRef}' contains a prod marker. Refusing to run.`,
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

  if (host && stagingRef && !host.startsWith(`${stagingRef}.`)) {
    errors.push(
      `NEXT_PUBLIC_SUPABASE_URL host '${host}' does not start with staging ref '${stagingRef}.'. Refusing to run against a non-staging project.`,
    );
  }

  if (!env.DATABASE_URL?.trim()) {
    errors.push("DATABASE_URL is required.");
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
