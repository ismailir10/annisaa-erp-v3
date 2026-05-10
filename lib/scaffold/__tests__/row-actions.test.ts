// Cycle: docs/cycles/2026-05-10-p2-scaffold-list-crud-parity.md (T1)
//
// Contract test for `RowActionDef<T>` + `resolveRowActions(...)`. The resolver
// must filter actions by the caller-supplied allowed-scope set, treat
// `entity.rowActions` as undefined-safe (returns []), and honor `ALL` as a
// wildcard (matches assertScope writes-gate posture).

import { describe, it, expect } from "vitest";
import { z } from "zod";

import { resolveRowActions, type EntityDef, type RowActionDef, type ScaffoldScope } from "../entity";

type Row = { id: string; ownerId: string };

function makeEntity(overrides: Partial<EntityDef<Row>> = {}): EntityDef<Row> {
  return {
    key: "test",
    label: "Tests",
    labelSingular: "Test",
    icon: "Beaker",
    schema: z.object({ id: z.string(), ownerId: z.string() }) as unknown as EntityDef<Row>["schema"],
    resource: "Test",
    searchFields: [],
    listColumns: [],
    filters: [],
    views: [],
    formSections: [],
    detailTabs: [],
    detailActions: [],
    dataFetcher: async () => ({ rows: [], total: 0 }),
    ...overrides,
  };
}

const row: Row = { id: "row-1", ownerId: "user-1" };

describe("resolveRowActions", () => {
  it("returns [] when entity.rowActions is undefined", () => {
    const entity = makeEntity();
    const result = resolveRowActions(entity, row, new Set<ScaffoldScope>(["ALL"]));
    expect(result).toEqual([]);
  });

  it("returns [] when entity.rowActions is empty", () => {
    const entity = makeEntity({ rowActions: [] });
    const result = resolveRowActions(entity, row, new Set<ScaffoldScope>(["ALL"]));
    expect(result).toEqual([]);
  });

  it("filters rowActions by the allowed-scope set", () => {
    const view: RowActionDef<Row> = {
      key: "view",
      label: "Lihat",
      kind: "view",
      scope: "OWN_STUDENT",
      href: (r) => `/x/${r.id}`,
    };
    const destruct: RowActionDef<Row> = {
      key: "soft-delete",
      label: "Nonaktifkan",
      kind: "destructive",
      scope: "SELF",
      action: async () => ({ ok: true, data: undefined }),
      confirm: { title: "x", description: "y", confirmLabel: "z" },
    };
    const entity = makeEntity({ rowActions: [view, destruct] });

    expect(resolveRowActions(entity, row, new Set<ScaffoldScope>(["OWN_STUDENT"]))).toEqual([view]);
    expect(resolveRowActions(entity, row, new Set<ScaffoldScope>(["SELF"]))).toEqual([destruct]);
    expect(resolveRowActions(entity, row, new Set<ScaffoldScope>(["OWN_PROGRAM"]))).toEqual([]);
  });

  it("ALL in allowedScopes returns every action regardless of declared scope", () => {
    const a: RowActionDef<Row> = { key: "a", label: "A", kind: "view", scope: "OWN_CLASS", href: () => "/" };
    const b: RowActionDef<Row> = { key: "b", label: "B", kind: "edit", scope: "SELF", href: () => "/" };
    const c: RowActionDef<Row> = { key: "c", label: "C", kind: "destructive", scope: "OWN_STUDENT", action: async () => ({ ok: true, data: undefined }) };
    const entity = makeEntity({ rowActions: [a, b, c] });
    const result = resolveRowActions(entity, row, new Set<ScaffoldScope>(["ALL"]));
    expect(result).toEqual([a, b, c]);
  });

  it("returns [] when allowedScopes is empty (zero-permission caller)", () => {
    const a: RowActionDef<Row> = { key: "view", label: "Lihat", kind: "view", scope: "OWN_CAMPUS", href: () => "/" };
    const entity = makeEntity({ rowActions: [a] });
    expect(resolveRowActions(entity, row, new Set<ScaffoldScope>())).toEqual([]);
  });

  it("preserves action order in the resolved set", () => {
    const a: RowActionDef<Row> = { key: "view", label: "Lihat", kind: "view", scope: "OWN_CAMPUS", href: () => "/" };
    const b: RowActionDef<Row> = { key: "edit", label: "Edit", kind: "edit", scope: "OWN_CAMPUS", href: () => "/" };
    const c: RowActionDef<Row> = { key: "del", label: "Hapus", kind: "destructive", scope: "OWN_CAMPUS", action: async () => ({ ok: true, data: undefined }) };
    const entity = makeEntity({ rowActions: [a, b, c] });
    const result = resolveRowActions(entity, row, new Set<ScaffoldScope>(["OWN_CAMPUS"]));
    expect(result.map((x) => x.key)).toEqual(["view", "edit", "del"]);
  });
});

describe("EntityDef.createDisabled flag", () => {
  it("defaults to undefined when not set (treated as false by callers)", () => {
    const entity = makeEntity();
    expect(entity.createDisabled).toBeUndefined();
  });

  it("can be set to true to flag entities whose creation flow lives off-scaffold", () => {
    const entity = makeEntity({ createDisabled: true });
    expect(entity.createDisabled).toBe(true);
  });
});
