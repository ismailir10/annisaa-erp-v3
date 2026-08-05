/**
 * Parent-portal greeting name + honorific.
 *
 * Two traps this module exists to avoid, both observed live on staging:
 *
 * 1. `Parent.name` already carries an honorific ("Ibu Rina", "Bapak Hendra
 *    Hakim"), so naively taking the first token greets "Bu **Ibu**".
 * 2. `StudentGuardian.relationship` is a free `String` holding the Indonesian
 *    labels `AYAH | IBU | WALI | OTHER` (prisma/schema.prisma:601) — not
 *    `FATHER`/`MOTHER`. Comparing against English never matches, so every
 *    father was addressed "Bu".
 */

/**
 * Honorific tokens that may prefix a stored `Parent.name`. Matched
 * case-insensitively against the leading token, longest-first so "Bapak" wins
 * over "Bapa".
 */
const NAME_HONORIFICS = [
  "bapak",
  "bapa",
  "bpk",
  "pak",
  "ibu",
  "bunda",
  "bu",
  "tn",
  "tuan",
  "ny",
  "nyonya",
  "nn",
  "sdr",
  "sdri",
  "wali",
] as const;

/** Strip trailing punctuation so "Bpk." matches "bpk". */
function normaliseToken(token: string): string {
  return token.replace(/[.,]+$/u, "").toLowerCase();
}

/**
 * First name to greet by, with any stored honorific removed.
 *
 * "Bapak Hendra Hakim" → "Hendra". "Rina" → "Rina". A name that is *only* an
 * honorific ("Ibu") falls back to that token rather than returning empty.
 */
export function parentGreetingName(name: string): string {
  const tokens = name.trim().split(/\s+/u).filter(Boolean);
  if (tokens.length === 0) return name.trim();

  const first = tokens[0]!;
  const isHonorific = NAME_HONORIFICS.includes(
    normaliseToken(first) as (typeof NAME_HONORIFICS)[number],
  );

  // Only strip when something is left to greet — "Ibu" alone stays "Ibu".
  if (isHonorific && tokens.length > 1) return tokens[1]!;
  return first;
}

/**
 * "Pak" for a father, "Bu" otherwise.
 *
 * `Parent` has no gender field, so the guardian relationship label on the
 * first child link is the only signal. Anything that is not AYAH — IBU, WALI,
 * OTHER, an unrecognised value, or no link at all — keeps the "Bu" default:
 * on staging 28 of 36 links are IBU, and "Bu" is the safer miss.
 */
export function parentHonorific(relationship: string | null | undefined): string {
  const rel = (relationship ?? "").trim().toUpperCase();
  if (rel === "AYAH" || rel === "FATHER") return "Pak";
  return "Bu";
}
