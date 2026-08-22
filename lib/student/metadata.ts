/**
 * `Student.metadata` field registry.
 *
 * The enrollment-form convert route (`app/api/enrollments/[id]/convert`) writes
 * the richest data the school holds — allergies, illness history, birth
 * circumstances, body measurements, sibling counts — into `Student.metadata` as
 * a flat JSON object keyed by *machine* names (`foodAllergy`, `birthDelivery`).
 * Until this registry existed the student detail page rendered that blob as raw
 * key/value <input> rows, so an admin looking for "does this child have
 * allergies" saw a text box labelled `foodAllergy`.
 *
 * This module is the single place that maps those keys to Indonesian labels and
 * input affordances. Three disjoint buckets:
 *
 *   known   — in KNOWN_FIELDS. Rendered as a labelled, typed field.
 *   system  — in SYSTEM_KEYS. Machine-owned (provenance, derived flags,
 *             nested arrays). Never editable, never dumped into the free-form
 *             editor, always round-tripped verbatim on save.
 *   extra   — everything else. Falls through to the pre-existing key/value
 *             editor so hand-added fields keep working untouched.
 *
 * IMPORTANT — option-backed fields store the *label*, not the enum value.
 * `convert` runs each option field through `label(AGAMA_OPTIONS, …)` before
 * writing, so metadata holds "Islam", not "ISLAM". The selects below therefore
 * use labels as their option values, and an unrecognised stored value is shown
 * verbatim rather than silently blanked.
 */

import {
  AGAMA_OPTIONS,
  KEWARGANEGARAAN_OPTIONS,
  BIRTH_DELIVERY_OPTIONS,
  BIRTH_TERM_OPTIONS,
  BLOOD_TYPE_OPTIONS,
  type Option,
} from "@/lib/enrollment/constants";

export type MetadataInput = "text" | "number" | "select";

export type MetadataGroup = "kesehatan" | "kelahiran" | "keluarga";

export type MetadataField = {
  key: string;
  label: string;
  input: MetadataInput;
  group: MetadataGroup;
  /** Option labels (not enum values) — see the module note above. */
  options?: string[];
  /** Rendered after the value in read mode, e.g. "kg". */
  unit?: string;
  placeholder?: string;
};

const labels = (opts: Option[]): string[] => opts.map((o) => o.label);

/**
 * Ordered — this is the render order inside the "Kesehatan & Kelahiran"
 * section, grouped by `group`.
 */
export const KNOWN_FIELDS: MetadataField[] = [
  // --- kesehatan ---
  { key: "bloodType", label: "Golongan Darah", input: "select", options: labels(BLOOD_TYPE_OPTIONS), group: "kesehatan" },
  { key: "foodAllergy", label: "Alergi Makanan", input: "text", group: "kesehatan", placeholder: "Contoh: telur, udang" },
  // Two writers, two keys, same concept: the enrollment-form convert route
  // writes `foodAllergy`, while `prisma/seed.ts` writes `allergies`. Both are
  // registered as first-class fields rather than aliased — aliasing would make
  // a save ambiguous about which key to persist, and silently rewriting one
  // key to the other would edit rows nobody asked to migrate.
  { key: "allergies", label: "Alergi", input: "text", group: "kesehatan", placeholder: "Contoh: debu, susu sapi" },
  { key: "seriousIllness", label: "Riwayat Penyakit Serius", input: "text", group: "kesehatan", placeholder: "Kosongkan bila tidak ada" },
  { key: "weightKg", label: "Berat Badan", input: "number", unit: "kg", group: "kesehatan" },
  { key: "heightCm", label: "Tinggi Badan", input: "number", unit: "cm", group: "kesehatan" },
  { key: "headCircumferenceCm", label: "Lingkar Kepala", input: "number", unit: "cm", group: "kesehatan" },
  // --- kelahiran ---
  { key: "birthDelivery", label: "Jalan Lahir", input: "select", options: labels(BIRTH_DELIVERY_OPTIONS), group: "kelahiran" },
  { key: "birthTerm", label: "Usia Kandungan Saat Lahir", input: "select", options: labels(BIRTH_TERM_OPTIONS), group: "kelahiran" },
  // --- keluarga ---
  { key: "religion", label: "Agama", input: "select", options: labels(AGAMA_OPTIONS), group: "keluarga" },
  { key: "citizenship", label: "Kewarganegaraan", input: "select", options: labels(KEWARGANEGARAAN_OPTIONS), group: "keluarga" },
  { key: "homeLanguage", label: "Bahasa Sehari-hari di Rumah", input: "text", group: "keluarga" },
  { key: "siblingsKandung", label: "Saudara Kandung", input: "number", group: "keluarga" },
  { key: "siblingsTiri", label: "Saudara Tiri", input: "number", group: "keluarga" },
  { key: "siblingsAngkat", label: "Saudara Angkat", input: "number", group: "keluarga" },
];

export const GROUP_LABELS: Record<MetadataGroup, string> = {
  kesehatan: "Kesehatan",
  kelahiran: "Kelahiran",
  keluarga: "Keluarga & Bahasa",
};

export const GROUP_ORDER: MetadataGroup[] = ["kesehatan", "kelahiran", "keluarga"];

/**
 * Machine-owned keys. Excluded from BOTH the typed section and the free-form
 * editor, and preserved byte-for-byte through every save.
 *
 * `priorFamilyAttendees` is a nested array (the paper form's "keluarga yang
 * pernah bersekolah di sini" table) — a flat key/value row cannot represent it,
 * and letting the editor stringify it would destroy the data on the next save.
 */
export const SYSTEM_KEYS = new Set([
  "fromEnrollmentApplication",
  "dcareAddon",
  "priorFamilyAttendees",
]);

const KNOWN_KEYS = new Set(KNOWN_FIELDS.map((f) => f.key));

export type PriorFamilyAttendee = { name?: string; yearEntered?: string };

export type StudentSystemMetadata = {
  /** EnrollmentApplication id this student was converted from, if any. */
  fromEnrollmentApplication: string | null;
  dcareAddon: boolean;
  priorFamilyAttendees: PriorFamilyAttendee[];
};

export type MetadataExtraRow = { key: string; value: string };

export type SplitMetadata = {
  /** Known keys → display string. Absent keys are omitted, not blank-filled. */
  known: Record<string, string>;
  system: StudentSystemMetadata;
  extra: MetadataExtraRow[];
};

/** Parse the stored JSON string. Malformed or non-object → null. */
export function parseStudentMetadata(
  raw: string | null | undefined,
): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** null/undefined/"" collapse to "". Numbers and booleans stringify. */
function toDisplay(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

/**
 * Bucket a parsed metadata object into known / system / extra.
 *
 * A known key whose stored value is null or "" is dropped from `known` — the
 * read view then omits the row entirely rather than printing a dangling label,
 * matching how the rest of the detail page treats empty optional fields.
 */
export function splitStudentMetadata(
  parsed: Record<string, unknown> | null,
): SplitMetadata {
  const known: Record<string, string> = {};
  const extra: MetadataExtraRow[] = [];
  const system: StudentSystemMetadata = {
    fromEnrollmentApplication: null,
    dcareAddon: false,
    priorFamilyAttendees: [],
  };
  if (!parsed) return { known, system, extra };

  for (const [key, value] of Object.entries(parsed)) {
    if (SYSTEM_KEYS.has(key)) {
      if (key === "fromEnrollmentApplication") {
        system.fromEnrollmentApplication = typeof value === "string" && value.trim() ? value : null;
      } else if (key === "dcareAddon") {
        system.dcareAddon = value === true;
      } else if (key === "priorFamilyAttendees") {
        system.priorFamilyAttendees = Array.isArray(value)
          ? (value.filter((v) => v && typeof v === "object") as PriorFamilyAttendee[])
          : [];
      }
      continue;
    }
    if (KNOWN_KEYS.has(key)) {
      const display = toDisplay(value);
      if (display !== "") known[key] = display;
      continue;
    }
    extra.push({ key, value: toDisplay(value) });
  }
  return { known, system, extra };
}

/**
 * Rebuild the metadata object for a PUT.
 *
 * Contract, in priority order:
 *  1. System keys survive verbatim — an admin editing "Alergi Makanan" must
 *     never drop the provenance pointer or the prior-family table.
 *  2. Blank known fields are omitted, not written as "". Round-tripping an
 *     untouched student must not grow the blob with empty strings.
 *  3. Numeric fields are written as numbers when they parse, so the value
 *     keeps the shape `convert` originally wrote.
 *  4. An entirely empty result returns null, so the PUT clears the column
 *     rather than storing "{}" (pre-existing behaviour of the free editor).
 */
export function buildStudentMetadata({
  known,
  extra,
  system,
}: {
  known: Record<string, string>;
  extra: MetadataExtraRow[];
  system: StudentSystemMetadata;
}): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};

  for (const field of KNOWN_FIELDS) {
    const raw = (known[field.key] ?? "").trim();
    if (raw === "") continue;
    if (field.input === "number") {
      const n = Number(raw);
      out[field.key] = Number.isFinite(n) ? n : raw;
    } else {
      out[field.key] = raw;
    }
  }

  for (const row of extra) {
    const key = row.key.trim();
    if (key === "") continue;
    out[key] = row.value;
  }

  if (system.fromEnrollmentApplication) {
    out.fromEnrollmentApplication = system.fromEnrollmentApplication;
  }
  if (system.dcareAddon) out.dcareAddon = true;
  if (system.priorFamilyAttendees.length > 0) {
    out.priorFamilyAttendees = system.priorFamilyAttendees;
  }

  return Object.keys(out).length === 0 ? null : out;
}

/**
 * Health flags worth surfacing in the page header, where an admin sees them
 * without opening a section. Returns trimmed strings or null.
 */
export function healthFlags(parsed: Record<string, unknown> | null): {
  allergy: string | null;
  illness: string | null;
} {
  // Checks both allergy keys (see the `allergies` entry in KNOWN_FIELDS).
  // "Tidak ada" is what the seed writes for *no* allergy — surfacing that as a
  // warning chip would cry wolf on most of the roster.
  const raw = [toDisplay(parsed?.foodAllergy), toDisplay(parsed?.allergies)]
    .map((v) => v.trim())
    .find((v) => v !== "" && !/^(tidak ada|tidak|-|none)$/i.test(v));
  const illness = toDisplay(parsed?.seriousIllness).trim();
  return {
    allergy: raw ?? null,
    illness: illness === "" || /^(tidak ada|tidak|-|none)$/i.test(illness) ? null : illness,
  };
}
