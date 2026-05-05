// Override-hatch helper per spec §5.3. `defineAction({...})` is the typed
// factory that produces a `DetailActionDef<T>` — feature actions mount via
// `entity.detailActions[]`. Optional `audit` config wires a post-success
// `writeAuditLog` call (p1-audit-write-middleware): user `onClick` awaits
// first; if it throws, the second await is naturally skipped and the error
// re-throws — no try/catch needed.

import type { DetailActionDef, ScaffoldScope } from "./entity";
import { AuditAction } from "@/lib/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit/write";

export type DefineActionInput<T> = {
  /** Stable kebab-case key, e.g. "promote-to-active". */
  key: string;
  label: string;
  /** Lucide icon name. */
  icon?: string;
  /** PermissionScope checked before render. */
  scope: ScaffoldScope;
  variant?: "default" | "destructive" | "warning";
  confirm?: { title: string; description?: string };
  /** Opt-in audit write on success. Caller resolves session at render time. */
  audit?: {
    resource: string;
    resourceId: (row: T) => string;
    /** Defaults to AuditAction.UPDATE — pass CREATE / DELETE / SOFT_DELETE / RESTORE explicitly. */
    action?: AuditAction;
    tenantId: string;
    actorUserId: string | null;
  };
  onClick: (row: T) => Promise<void> | void;
};

export function defineAction<T>(input: DefineActionInput<T>): DetailActionDef<T> {
  const { audit } = input;
  const onClick: (row: T) => Promise<void> | void = audit
    ? async (row) => {
        await input.onClick(row);
        await writeAuditLog({
          tenantId: audit.tenantId,
          actorUserId: audit.actorUserId,
          action: audit.action ?? AuditAction.UPDATE,
          resource: audit.resource,
          resourceId: audit.resourceId(row),
        });
      }
    : input.onClick;

  return {
    key: input.key,
    label: input.label,
    icon: input.icon,
    scope: input.scope,
    variant: input.variant,
    confirm: input.confirm,
    onClick,
  };
}
