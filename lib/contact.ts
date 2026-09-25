/**
 * Click-to-contact hrefs for Indonesian phone numbers.
 *
 * Numbers arrive from a free-text column in every shape the office types them:
 * "0812-8877-4402", "+62 812 8877 4402", "(021) 8877402". Both helpers strip
 * formatting; the WhatsApp one additionally normalises to the international
 * form wa.me requires (digits only, country code, no plus).
 */

/** Digits only, with a leading "+" preserved as a marker. */
function digits(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

/**
 * `tel:` href, or null when there is nothing dialable.
 * Keeps a leading "+" so international numbers still dial correctly.
 */
export function telHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  const d = digits(trimmed);
  if (d.length < 6) return null;
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${d}`;
}

/**
 * `https://wa.me/…` href, or null when the number is unusable.
 *
 * Normalisation, in order: strip formatting → "0…" is a local Indonesian
 * number, so swap the trunk 0 for 62 → "62…" passes through → anything else is
 * assumed already international.
 */
export function whatsappHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = digits(phone);
  if (d.length < 6) return null;
  if (d.startsWith("0")) d = `62${d.slice(1)}`;
  return `https://wa.me/${d}`;
}
