/**
 * `EnrollmentApplication.consentData` embeds each parent's signed consent
 * letter as `{ ayah: { signatureToken }, ibu: { signatureToken } }` — a raw
 * Supabase storage token (see lib/storage). Admin payloads must never carry
 * it: the UI only needs to know a signature exists, and the image itself is
 * served through the auth-proxied `/api/enrollments/[id]/signature` route.
 */

type ConsentBlock = Record<string, unknown> & { signatureToken?: unknown };

function redactBlock(block: unknown): unknown {
  if (!block || typeof block !== "object") return block;
  const { signatureToken, ...rest } = block as ConsentBlock;
  return { ...rest, hasSignature: !!signatureToken };
}

export function redactConsentSignatures(consentData: unknown): unknown {
  if (!consentData || typeof consentData !== "object") return consentData;
  const c = consentData as Record<string, unknown>;
  return { ...c, ayah: redactBlock(c.ayah), ibu: redactBlock(c.ibu) };
}
