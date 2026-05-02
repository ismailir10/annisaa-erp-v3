import type { SupabaseClient } from "@supabase/supabase-js";

export type PreservedRole =
  | "SUPER_ADMIN"
  | "SCHOOL_ADMIN"
  | "TEACHER"
  | "GUARDIAN";

export type PreservedUser = {
  email: string;
  role: PreservedRole;
  name: string;
  /** Optional: Employee `kode` for teachers. */
  employeeKode?: string;
  /** Optional: linked child name for guardians. */
  childName?: string;
  /** Optional: linked parent display name for guardians. */
  parentName?: string;
};

export const PRESERVED_USERS: PreservedUser[] = [
  {
    email: "ismailir10@gmail.com",
    role: "SUPER_ADMIN",
    name: "Ismail Rabbani (Super Admin)",
  },
  {
    email: "wirarajaisme@gmail.com",
    role: "SCHOOL_ADMIN",
    name: "Wira Raja (School Admin)",
  },
  {
    email: "ismail10rabbanii@gmail.com",
    role: "TEACHER",
    name: "Ismail Rabbani (Teacher)",
    employeeKode: "IR01",
  },
  {
    email: "wirarajaism@gmail.com",
    role: "TEACHER",
    name: "Wira Raja (Teacher)",
    employeeKode: "WR03",
  },
  {
    email: "rightjet.hq@gmail.com",
    role: "GUARDIAN",
    name: "Ibu Nurul",
    parentName: "Ibu Nurul",
    childName: "Bilal Hakim",
  },
  {
    email: "commandprompt.adhan@gmail.com",
    role: "GUARDIAN",
    name: "Ibu Rina",
    parentName: "Ibu Rina",
    childName: "Ahmad Faris Abdullah",
  },
];

export type EnsureAuthUsersResult = {
  /** Map from email → auth.users.id (UUID). */
  uuidByEmail: Record<string, string>;
  /** Emails we created fresh this run. */
  createdEmails: string[];
  /** Emails that already existed in auth.users. */
  reusedEmails: string[];
};

/**
 * Minimal shape we need from the Supabase Admin API, so tests can mock it
 * without importing the full SupabaseClient type.
 */
export type AdminAuthLike = {
  listUsers: (args: {
    page: number;
    perPage: number;
  }) => Promise<{
    data: { users: Array<{ id: string; email: string | null }> };
    error: { message: string } | null;
  }>;
  createUser: (args: {
    email: string;
    email_confirm: boolean;
    password: string;
    user_metadata?: Record<string, unknown>;
  }) => Promise<{
    data: { user: { id: string; email: string | null } | null };
    error: { message: string } | null;
  }>;
};

function generatePassword(): string {
  // 32 random bytes → base64url → 43 chars. Only used for staging test accounts.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Page through auth.users and index by lowercased email.
 * Returns a map email → id for every user found.
 */
async function indexExistingAuthUsers(
  admin: AdminAuthLike,
): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  const perPage = 200;
  let page = 1;
  // Hard cap pagination to avoid runaway loops on a bugged API.
  const maxPages = 50;

  while (page <= maxPages) {
    const { data, error } = await admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`listUsers failed on page ${page}: ${error.message}`);
    }
    const users = data.users ?? [];
    for (const u of users) {
      if (u.email) index.set(u.email.toLowerCase(), u.id);
    }
    if (users.length < perPage) break;
    page++;
  }

  return index;
}

/**
 * Ensure every preserved email has an `auth.users` row.
 * Returns the resolved UUID for each email.
 *
 * Idempotent: rerunning this against a partially-seeded staging DB reuses
 * existing rows rather than erroring.
 */
export async function ensurePreservedAuthUsers(
  admin: AdminAuthLike,
  users: PreservedUser[] = PRESERVED_USERS,
  opts: { passwordGenerator?: () => string } = {},
): Promise<EnsureAuthUsersResult> {
  const gen = opts.passwordGenerator ?? generatePassword;
  const existing = await indexExistingAuthUsers(admin);

  const uuidByEmail: Record<string, string> = {};
  const createdEmails: string[] = [];
  const reusedEmails: string[] = [];

  for (const u of users) {
    const key = u.email.toLowerCase();
    const existingId = existing.get(key);
    if (existingId) {
      uuidByEmail[u.email] = existingId;
      reusedEmails.push(u.email);
      continue;
    }

    const { data, error } = await admin.createUser({
      email: u.email,
      email_confirm: true,
      password: gen(),
      user_metadata: {
        name: u.name,
        seeded_by: "reseed-staging",
        role_hint: u.role,
      },
    });
    if (error || !data.user) {
      throw new Error(
        `createUser failed for ${u.email}: ${error?.message ?? "no user returned"}`,
      );
    }
    uuidByEmail[u.email] = data.user.id;
    createdEmails.push(u.email);
  }

  return { uuidByEmail, createdEmails, reusedEmails };
}

/**
 * Narrow adapter over a real SupabaseClient so production code can pass
 * `client.auth.admin` directly while tests pass a mocked object.
 */
export function adminAuthFrom(client: SupabaseClient): AdminAuthLike {
  return {
    listUsers: (args) => client.auth.admin.listUsers(args),
    createUser: (args) => client.auth.admin.createUser(args),
  };
}
