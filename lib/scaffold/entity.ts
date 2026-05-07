// Entity registry types per foundation spec §5.4 (page anatomy) + §5.10
// (filtering / views) + §5.13 (audit). Pure type module — no runtime code.
//
// Each domain entity (Student, Employee, ...) lives in `lib/entities/<name>/`
// with `schema.ts` + `entity.ts` + `policy.ts` per §5.1, and exports an
// `EntityDef<T>` instance consumed by the three scaffold page shells.
//
// `FieldDef` is the discriminated-union renderer contract (§5.5). The
// runtime renderer table + `FIELD_KINDS` tuple live in `field-renderer.ts`.

import type { ReactNode } from "react";
import type { ZodType } from "zod";

// ── Field renderer contract ──────────────────────────────────
// 15 kinds locked by spec §5.5. Adding/removing a kind is a cross-cycle
// change requiring registry + scaffold-check updates.

export type FieldKind =
  | "TEXT"
  | "TEXTAREA"
  | "NUMBER"
  | "DECIMAL"
  | "CURRENCY"
  | "DATE"
  | "DATETIME"
  | "BOOLEAN"
  | "SELECT"
  | "MULTISELECT"
  | "EMAIL"
  | "PHONE"
  | "RELATION"
  | "FILE"
  | "ENUM";

type Option = { readonly value: string; readonly label: string };
type Options = ReadonlyArray<Option>;

export type FieldDef =
  | { kind: "TEXT"; placeholder?: string; maxLength?: number }
  | { kind: "TEXTAREA"; placeholder?: string; rows?: number; maxLength?: number }
  | { kind: "NUMBER"; min?: number; max?: number; step?: number }
  | { kind: "DECIMAL"; min?: number; max?: number; precision?: number }
  | { kind: "CURRENCY"; showCents?: boolean }
  | { kind: "DATE" }
  | { kind: "DATETIME" }
  | { kind: "BOOLEAN"; trueLabel?: string; falseLabel?: string }
  | { kind: "SELECT"; options: Options }
  | { kind: "MULTISELECT"; options: Options }
  | { kind: "EMAIL" }
  | { kind: "PHONE" }
  | { kind: "RELATION"; resource: string; labelField: string }
  | { kind: "FILE"; accept?: string; maxBytes?: number }
  | { kind: "ENUM"; enumName: string; options: Options };

// ── List page contract ───────────────────────────────────────

export type SortDir = "asc" | "desc";

export type DataFetcherParams<T> = {
  page: number;
  pageSize: number;
  filters: Record<string, unknown>;
  search?: string;
  sort?: { field: keyof T & string; dir: SortDir };
};

export type DataFetcherResult<T> = {
  rows: ReadonlyArray<T>;
  total: number;
};

export type DataFetcher<T> = (
  params: DataFetcherParams<T>,
) => Promise<DataFetcherResult<T>>;

export type ListColumnDef<T> = {
  field: keyof T & string;
  label: string;
  /** Full renderer definition (kind + per-kind metadata e.g. `RELATION.labelField`). */
  render: FieldDef;
  sortable?: boolean;
  className?: string;
  /** Per-row formatter override; receives full row. */
  format?: (row: T) => string;
};

// ── Filter / view contract (§5.10) ───────────────────────────

export type FilterKind =
  | "SELECT"
  | "MULTISELECT"
  | "DATE_RANGE"
  | "BOOLEAN"
  | "SEARCH";

export type FilterDef<T> = {
  /** URL query-param key. */
  key: string;
  label: string;
  kind: FilterKind;
  options?: Options;
  loadOptions?: () => Promise<Options>;
  /** Optional client-side predicate (server-side filter via dataFetcher.filters). */
  predicate?: (row: T, value: unknown) => boolean;
};

export type ViewDef<T> = {
  key: string;
  label: string;
  filters: Record<string, unknown>;
  /** Role codes (matches Role.code) for which this view is default. */
  defaultFor?: ReadonlyArray<string>;
  description?: string;
  predicate?: (row: T) => boolean;
};

// ── Form contract (§5.4) ─────────────────────────────────────

export type FormFieldRef<T> = {
  key: keyof T & string;
  def: FieldDef;
  label: string;
  required?: boolean;
  helpText?: string;
};

export type FormSectionDef<T> = {
  key: string;
  label: string;
  description?: string;
  fields: ReadonlyArray<FormFieldRef<T>>;
};

// ── Detail contract (§5.4) ───────────────────────────────────
// Spec §5.4 cites canonical Student-domain tabs (Ringkasan / Wali / Riwayat /
// Lampiran / Aktivitas) as the page-anatomy template. Other entities define
// their own tab keys (e.g. Employee uses Profil / Kontrak / Kepegawaian) — so
// `key` is a free-form string here and per-entity literal-union types live in
// each `lib/entities/<name>/entity.ts`.

export type DetailTabDef<T> = {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
};

// ── Detail action contract (§5.3 override hatch) ─────────────
// PermissionScope is referenced as a string-literal-typed scope so the
// scaffold has zero compile-time dependency on the generated Prisma client
// (which is not present in test contexts). `lib/scaffold/permission.ts`
// owns the runtime mapping to the PermissionScope Postgres enum.
//
// ⚠ SELF-on-write contract (cycle p2-portal-shell-sidebar T4): the
// `assertScope` writes-gate at `lib/scaffold/server-action.ts` accepts
// SELF for write actions. Every policy that grants SELF on a WRITE
// action (create / update / soft_delete / restore / delete) MUST pair
// the grant with a row-level `userId: session.userId` (or equivalent
// caller-identity) predicate at the action layer. The static meta-test
// at `lib/scaffold/__tests__/self-write-contract.test.ts` enforces this
// pairing and breaks CI on regression. OWN_* scopes still fail-closed
// at the writes-gate.

export type ScaffoldScope =
  | "ALL"
  | "OWN_CAMPUS"
  | "OWN_PROGRAM"
  | "OWN_CLASS"
  | "OWN_SESSION"
  | "OWN_STUDENT"
  | "SELF";

export type DetailActionDef<T> = {
  key: string;
  label: string;
  icon?: string;
  scope: ScaffoldScope;
  variant?: "default" | "destructive" | "warning";
  confirm?: { title: string; description?: string };
  onClick: (row: T) => Promise<void> | void;
};

// ── Top-level entity contract (§5.10) ────────────────────────

export type EntityDef<T> = {
  /** Stable kebab-case key, e.g. "student". Used for routes + audit + scaffold-check. */
  key: string;
  /** Plural Indonesian label, e.g. "Siswa". */
  label: string;
  /** Singular Indonesian label, e.g. "Siswa". */
  labelSingular: string;
  /** Lucide icon name, e.g. "Users". */
  icon: string;
  /** Zod schema validating mutation input. `ZodType<T>` matches resolvers v5 / Standard Schema. */
  schema: ZodType<T>;
  /** Permission resource string, e.g. "Student". Matches Permission.resource. */
  resource: string;
  searchFields: ReadonlyArray<keyof T & string>;
  listColumns: ReadonlyArray<ListColumnDef<T>>;
  filters: ReadonlyArray<FilterDef<T>>;
  views: ReadonlyArray<ViewDef<T>>;
  formSections: ReadonlyArray<FormSectionDef<T>>;
  detailTabs: ReadonlyArray<DetailTabDef<T>>;
  detailActions: ReadonlyArray<DetailActionDef<T>>;
  dataFetcher: DataFetcher<T>;
};
