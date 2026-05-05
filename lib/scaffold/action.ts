// Override-hatch helper per spec §5.3. Per-feature actions live at
// `app/<portal>/<entity>/_actions/<verb>.tsx` and are mounted in the detail
// header via `entity.detailActions[]`. `defineAction({...})` is the typed
// factory that produces a `DetailActionDef<T>` — single 1-line touch from a
// feature author to add a workflow button to the scaffold detail page.
//
// Wiring contract for downstream cycles:
//   1. `scope` is checked against the user's resolved permissions before the
//      button is rendered (resolver lives in `permission.ts`).
//   2. `confirm` triggers the shared ConfirmDialog before invoking onClick.
//   3. `onClick` is responsible for its own audit log + mutation toast — the
//      shell only wires render + click forwarding. Audit middleware lands in
//      `p1-audit-write-middleware`; until then onClick implementations call
//      `lib/audit/write.ts` directly when it ships.

import type { DetailActionDef, ScaffoldScope } from "./entity";

export type DefineActionInput<T> = {
  /** Stable kebab-case key, e.g. "promote-to-active". Used for audit + telemetry. */
  key: string;
  label: string;
  /** Lucide icon name. */
  icon?: string;
  /** PermissionScope checked before render. */
  scope: ScaffoldScope;
  /** Visual treatment. Maps to Button variant in DetailActionButton. */
  variant?: "default" | "destructive" | "warning";
  confirm?: {
    title: string;
    description?: string;
  };
  onClick: (row: T) => Promise<void> | void;
};

export function defineAction<T>(input: DefineActionInput<T>): DetailActionDef<T> {
  return {
    key: input.key,
    label: input.label,
    icon: input.icon,
    scope: input.scope,
    variant: input.variant,
    confirm: input.confirm,
    onClick: input.onClick,
  };
}
