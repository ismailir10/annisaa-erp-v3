import { describe, it, expect, vi } from "vitest";
import {
  ensurePreservedAuthUsers,
  OWNER_EMAIL,
  PRESERVED_USERS,
  type AdminAuthLike,
  type PreservedUser,
} from "../users";

function makeAdmin(
  existing: Array<{ id: string; email: string }>,
  opts: { createError?: string } = {},
): { admin: AdminAuthLike; calls: { listUsers: number; createUser: string[] } } {
  const calls = { listUsers: 0, createUser: [] as string[] };
  const admin: AdminAuthLike = {
    listUsers: async ({ page, perPage }) => {
      calls.listUsers++;
      const start = (page - 1) * perPage;
      const slice = existing.slice(start, start + perPage);
      return { data: { users: slice }, error: null };
    },
    createUser: async ({ email }) => {
      calls.createUser.push(email);
      if (opts.createError) {
        return { data: { user: null }, error: { message: opts.createError } };
      }
      const id = `uuid-${email.replace(/[@.]/g, "-")}`;
      return { data: { user: { id, email } }, error: null };
    },
  };
  return { admin, calls };
}

describe("ensurePreservedAuthUsers", () => {
  it("creates all six users when auth.users is empty", async () => {
    const { admin, calls } = makeAdmin([]);
    const res = await ensurePreservedAuthUsers(admin, PRESERVED_USERS, {
      passwordGenerator: () => "test-password",
    });
    expect(Object.keys(res.uuidByEmail)).toHaveLength(6);
    expect(res.createdEmails).toHaveLength(6);
    expect(res.reusedEmails).toHaveLength(0);
    expect(calls.createUser).toHaveLength(6);
    // Every preserved email mapped to a UUID.
    for (const u of PRESERVED_USERS) {
      expect(res.uuidByEmail[u.email]).toMatch(/^uuid-/);
    }
  });

  it("reuses existing auth.users rows without recreating", async () => {
    const existing = PRESERVED_USERS.map((u, i) => ({
      id: `existing-${i}`,
      email: u.email,
    }));
    const { admin, calls } = makeAdmin(existing);
    const res = await ensurePreservedAuthUsers(admin, PRESERVED_USERS);
    expect(res.reusedEmails).toHaveLength(6);
    expect(res.createdEmails).toHaveLength(0);
    expect(calls.createUser).toHaveLength(0);
    expect(res.uuidByEmail[OWNER_EMAIL]).toBe("existing-0");
  });

  it("matches emails case-insensitively against existing auth rows", async () => {
    const existing = [{ id: "cap-id", email: OWNER_EMAIL.toUpperCase() }];
    const user: PreservedUser = {
      email: OWNER_EMAIL,
      role: "SUPER_ADMIN",
      name: "Test",
    };
    const { admin, calls } = makeAdmin(existing);
    const res = await ensurePreservedAuthUsers(admin, [user]);
    expect(res.reusedEmails).toEqual([OWNER_EMAIL]);
    expect(res.uuidByEmail[OWNER_EMAIL]).toBe("cap-id");
    expect(calls.createUser).toHaveLength(0);
  });

  it("mixes: creates missing, reuses existing", async () => {
    const existing = [
      { id: "e-0", email: OWNER_EMAIL },
      { id: "e-3", email: "wirarajaism@gmail.com" },
    ];
    const { admin, calls } = makeAdmin(existing);
    const res = await ensurePreservedAuthUsers(admin, PRESERVED_USERS, {
      passwordGenerator: () => "pw",
    });
    expect(res.reusedEmails.sort()).toEqual(
      [OWNER_EMAIL, "wirarajaism@gmail.com"].sort(),
    );
    expect(res.createdEmails).toHaveLength(4);
    expect(calls.createUser).toHaveLength(4);
  });

  it("throws on listUsers error", async () => {
    const admin: AdminAuthLike = {
      listUsers: async () => ({
        data: { users: [] },
        error: { message: "rate limited" },
      }),
      createUser: async () => ({
        data: { user: null },
        error: null,
      }),
    };
    await expect(ensurePreservedAuthUsers(admin, PRESERVED_USERS)).rejects.toThrow(
      /rate limited/,
    );
  });

  it("throws on createUser error", async () => {
    const { admin } = makeAdmin([], { createError: "email exists" });
    await expect(
      ensurePreservedAuthUsers(admin, PRESERVED_USERS, {
        passwordGenerator: () => "pw",
      }),
    ).rejects.toThrow(/email exists/);
  });

  it("paginates listUsers until it drains", async () => {
    // 250 users in auth → must call page 1 and page 2.
    const bulk = Array.from({ length: 250 }, (_, i) => ({
      id: `b-${i}`,
      email: `bulk-${i}@example.test`,
    }));
    const { admin, calls } = makeAdmin(bulk);
    const res = await ensurePreservedAuthUsers(admin, [], {
      passwordGenerator: () => "pw",
    });
    expect(res.uuidByEmail).toEqual({});
    expect(calls.listUsers).toBeGreaterThanOrEqual(2);
  });

  it("passes user_metadata on create", async () => {
    const createUser = vi.fn().mockResolvedValue({
      data: { user: { id: "new-1", email: OWNER_EMAIL } },
      error: null,
    });
    const admin: AdminAuthLike = {
      listUsers: async () => ({ data: { users: [] }, error: null }),
      createUser,
    };
    await ensurePreservedAuthUsers(admin, [PRESERVED_USERS[0]], {
      passwordGenerator: () => "pw",
    });
    const callArg = createUser.mock.calls[0][0];
    expect(callArg.email_confirm).toBe(true);
    expect(callArg.user_metadata).toMatchObject({
      seeded_by: "reseed-staging",
      role_hint: "SUPER_ADMIN",
    });
  });
});

describe("PRESERVED_USERS constant", () => {
  it("contains exactly six users with the expected roles", () => {
    expect(PRESERVED_USERS).toHaveLength(6);
    const emails = PRESERVED_USERS.map((u) => u.email);
    expect(emails).toContain(OWNER_EMAIL);
    expect(emails).toContain("wirarajaisme@gmail.com");
    expect(emails).toContain("ismail10rabbanii@gmail.com");
    expect(emails).toContain("wirarajaism@gmail.com");
    expect(emails).toContain("rightjet.hq@gmail.com");
    expect(emails).toContain("commandprompt.adhan@gmail.com");

    const superAdmin = PRESERVED_USERS.find(
      (u) => u.email === OWNER_EMAIL,
    );
    expect(superAdmin?.role).toBe("SUPER_ADMIN");

    const schoolAdmin = PRESERVED_USERS.find(
      (u) => u.email === "wirarajaisme@gmail.com",
    );
    expect(schoolAdmin?.role).toBe("SCHOOL_ADMIN");

    const teacher1 = PRESERVED_USERS.find(
      (u) => u.email === "ismail10rabbanii@gmail.com",
    );
    expect(teacher1?.role).toBe("TEACHER");
    expect(teacher1?.employeeKode).toBe("IR01");

    const teacher2 = PRESERVED_USERS.find(
      (u) => u.email === "wirarajaism@gmail.com",
    );
    expect(teacher2?.employeeKode).toBe("WR03");

    const guardian1 = PRESERVED_USERS.find(
      (u) => u.email === "rightjet.hq@gmail.com",
    );
    expect(guardian1?.role).toBe("GUARDIAN");
    expect(guardian1?.childName).toBe("Bilal Hakim");

    const guardian2 = PRESERVED_USERS.find(
      (u) => u.email === "commandprompt.adhan@gmail.com",
    );
    expect(guardian2?.childName).toBe("Ahmad Faris Abdullah");
  });
});
