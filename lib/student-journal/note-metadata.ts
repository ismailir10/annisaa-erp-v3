import { prisma } from "@/lib/db";

type UserRoleLike = string | null | undefined;

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Admin",
  SCHOOL_ADMIN: "Admin",
  TEACHER: "Guru",
  GUARDIAN: "Orang tua",
};

export type JournalNoteWithAuthorFields = {
  authorUserId: string;
  authorRole: string;
};

export type JournalAuditWithChangerFields = {
  changedByUserId: string;
};

export function fallbackActorName(role: UserRoleLike, userId?: string | null): string {
  const roleLabel = role ? ROLE_LABELS[role] : undefined;
  if (roleLabel) return roleLabel;
  if (userId) return `Pengguna ${userId.slice(0, 8)}`;
  return "Pengguna";
}

async function resolveUserNameMap(
  tenantId: string,
  userIds: string[],
): Promise<Map<string, string>> {
  const distinctIds = [...new Set(userIds.filter(Boolean))];
  if (distinctIds.length === 0) return new Map();

  const users = await prisma.user.findMany({
    where: { tenantId, id: { in: distinctIds } },
    select: { id: true, name: true, role: true },
  });

  return new Map(
    users.map((user) => [
      user.id,
      user.name?.trim() || fallbackActorName(user.role, user.id),
    ]),
  );
}

export async function enrichNotesWithAuthorMetadata<
  T extends JournalNoteWithAuthorFields,
>(tenantId: string, notes: T[]): Promise<Array<T & { authorName: string }>> {
  if (notes.length === 0) return [];

  const userNames = await resolveUserNameMap(
    tenantId,
    notes.map((note) => note.authorUserId),
  );

  return notes.map((note) => ({
    ...note,
    authorName:
      userNames.get(note.authorUserId) ??
      fallbackActorName(note.authorRole, note.authorUserId),
  }));
}

export async function enrichAuditsWithChangerNames<
  T extends JournalAuditWithChangerFields,
>(tenantId: string, audits: T[]): Promise<Array<T & { changedByName: string }>> {
  if (audits.length === 0) return [];

  const userNames = await resolveUserNameMap(
    tenantId,
    audits.map((audit) => audit.changedByUserId),
  );

  return audits.map((audit) => ({
    ...audit,
    changedByName:
      userNames.get(audit.changedByUserId) ??
      fallbackActorName(null, audit.changedByUserId),
  }));
}

