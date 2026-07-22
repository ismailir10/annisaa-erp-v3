/**
 * Pure, client-safe display helpers for student-journal note authors.
 *
 * Kept separate from `lib/student-journal/note-metadata.ts` (which imports
 * `@/lib/db`/prisma and is server-only) so client components — namely
 * `components/student-journal/note-thread.tsx` — can import this without
 * pulling a server-only module into the client bundle.
 */

export const ROLE_LABELS: Record<string, string> = {
  TEACHER: "Guru",
  GUARDIAN: "Orang Tua",
  SCHOOL_ADMIN: "Admin",
  SUPER_ADMIN: "Admin",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

/**
 * Display name for a note author: the author's name when present,
 * otherwise the Indonesian role label (e.g. "Guru", "Orang Tua").
 */
export function getNoteAuthorLabel(
  authorName: string | null | undefined,
  role: string,
): string {
  const trimmed = authorName?.trim();
  return trimmed || roleLabel(role);
}

/**
 * Derive 1-2 uppercase initials for a note author avatar.
 * - Two-or-more-word name → first letter of first two words (e.g. "Bu Sari" → "BS").
 * - Single-word name → first two letters (e.g. "Fatimah" → "FA").
 * - Missing/blank name → first letter of the role label (e.g. TEACHER → "G").
 */
export function getNoteAuthorInitials(
  authorName: string | null | undefined,
  role: string,
): string {
  const trimmed = authorName?.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  return roleLabel(role).slice(0, 1).toUpperCase();
}
