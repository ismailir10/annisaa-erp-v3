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

import type { ActionResult } from "./server-action";

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

// ── Row action contract (cycle p2-scaffold-list-crud-parity T1) ──────
// Per-row affordances rendered in the rightmost column of the scaffold list
// shell. Mirrors the DetailActionDef pattern but list-scoped: each row gets
// its own resolved set, gated by `scope` against the caller-supplied
// allowed-scope set (computed externally from EntityPolicy + session role to
// keep the engine free of any `lib/entities/_types` import).
//
// Two action shapes:
//   • Navigation (kind=view|edit) — `href(row)` returns the destination URL;
//     scaffold renders an inline `<Link>`.
//   • Server-action (kind=destructive|extra) — `action(id)` invokes a server
//     action; scaffold renders a button (with optional `confirm` AlertDialog
//     for destructive). The action returns ActionResult<unknown>; scaffold
//     surfaces toast on ok=false.

export type RowActionKind = "view" | "edit" | "destructive" | "extra";

export type RowActionDef<T> = {
  key: string;
  label: string;
  kind: RowActionKind;
  scope: ScaffoldScope;
  icon?: string;
  /** Navigation actions (view/edit): destination URL per row. */
  href?: (row: T) => string;
  /** Server-action actions (destructive/extra): invoked with row.id. Returns
   * the canonical `ActionResult<unknown>` (matches every existing soft-delete
   * + state-machine action wrapper signature; scaffold surfaces toast on
   * `ok: false` and revalidates on `ok: true`). */
  action?: (id: string) => Promise<ActionResult<unknown>>;
  /** AlertDialog metadata for destructive actions. */
  confirm?: {
    title: string;
    description: string;
    confirmLabel: string;
  };
};

/**
 * Filter `entity.rowActions` by the caller-supplied allowed-scope set. Returns
 * `[]` when `entity.rowActions` is undefined (the default for entities not yet
 * migrated). `allowedScopes` is computed externally — the engine has no
 * dependency on EntityPolicy.
 *
 * `ALL` in allowedScopes implicitly grants every action regardless of its own
 * declared scope (matches the assertScope writes-gate posture).
 *
 * `_row` is reserved for forward-use per-row predicate enforcement (e.g. a
 * future OWN_STUDENT scope that needs to compare `row.studentId === session
 * .resolvedStudentId`). Today the resolver filters by scope set only; do NOT
 * drop the parameter when adapting the signature — keep the threading.
 */
export function resolveRowActions<T>(
  entity: EntityDef<T>,
  _row: T,
  allowedScopes: ReadonlySet<ScaffoldScope>,
): ReadonlyArray<RowActionDef<T>> {
  const acts = entity.rowActions;
  if (!acts || acts.length === 0) return [];
  if (allowedScopes.has("ALL")) return acts;
  return acts.filter((a) => allowedScopes.has(a.scope));
}

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
  /**
   * Per-row action affordances rendered in the scaffold list shell's action
   * column. Optional — entities not yet migrated to the new shell omit this
   * field; `resolveRowActions` returns `[]` for them. Cycle
   * `p2-scaffold-list-crud-parity` populates it for student/guardian/
   * household/admission.
   */
  rowActions?: ReadonlyArray<RowActionDef<T>>;
  /**
   * Hides the scaffold list shell's "Tambah <labelSingular>" CTA when `true`.
   * Defaults to `false`. Set `true` for entities whose creation flow lives at
   * a non-`/admin/<group>/<key>/new` route (e.g. `admission` creates via
   * the public `/daftar` route).
   */
  createDisabled?: boolean;
};
