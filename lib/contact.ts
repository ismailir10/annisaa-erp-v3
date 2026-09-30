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

/**
 * `https://wa.me/…` href with a prefilled message, or null when the number is
 * unusable. Same normalisation as `whatsappHref`.
 */
export function whatsappHrefWithText(phone: string | null | undefined, text: string): string | null {
  const base = whatsappHref(phone);
  return base ? `${base}?text=${encodeURIComponent(text)}` : null;
}

/**
 * The school's finance/admin contact number shown to parents when an invoice
 * has no payment link. There is no school phone in OrgConfig/Tenant/Campus
 * (a schema change is out of scope), so it comes from the optional
 * `SCHOOL_CONTACT_PHONE` env var; unset -> null and the UI falls back to
 * "hubungi admin sekolah" plus the invoice number to quote.
 */
export function schoolContactPhone(): string | null {
  const v = process.env.SCHOOL_CONTACT_PHONE?.trim();
  return v ? v : null;
}
