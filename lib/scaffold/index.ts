// Public surface of the scaffold engine. Domain entities consume only what
// is re-exported here; deeper imports (`lib/scaffold/permission`, etc.) are
// allowed but discouraged — keeps the contract surface stable across cycles.

export { ScaffoldListPage, ScaffoldListPageLoading } from "./list-page";
export { ScaffoldFormPage, ScaffoldFormPageLoading } from "./form-page";
export { formSpecFromEntity, type ScaffoldFormSpec } from "./form-spec";
export { ScaffoldDetailPage, ScaffoldDetailPageLoading } from "./detail-page";
export { ScaffoldErrorState } from "./error-state";
export { OwnStudentUnresolvedError } from "./errors";
export { defineAction } from "./action";
export { assertScope, type ActionResult } from "./server-action";
export { fmt, type Fmt } from "./format";
export {
  resolvePermissions,
  getJwtTenantId,
  clearPermissionCache,
  ALLOWLIST_CAP,
  CACHE_TTL_MS,
  type ResolvedPermissions,
  type ResolveArgs,
  type PermissionPrismaLike,
} from "./permission";
export {
  FIELD_KINDS,
  FIELD_RENDERERS,
  getRenderer,
  hasRenderer,
  MissingRendererError,
  type FieldRendererProps,
} from "./field-renderer";
export type {
  EntityDef,
  ListColumnDef,
  FilterDef,
  FilterKind,
  ViewDef,
  FormSectionDef,
  FormFieldRef,
  DetailTabDef,
  DetailActionDef,
  DataFetcher,
  DataFetcherParams,
  DataFetcherResult,
  FieldDef,
  FieldKind,
  ScaffoldScope,
  SortDir,
} from "./entity";
