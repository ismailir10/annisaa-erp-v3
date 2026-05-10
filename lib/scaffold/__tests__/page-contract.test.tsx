import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { z } from "zod";

// Mock writeAuditLog so the audit-wiring tests below assert call shape
// without touching prisma. Hoisted-state pattern for vi.mock factories.
const { writeAuditLogMock } = vi.hoisted(() => ({
  writeAuditLogMock: vi.fn(),
}));
vi.mock("@/lib/audit/write", () => ({ writeAuditLog: writeAuditLogMock }));

// Cycle p2-scaffold-list-crud-parity (T2): the upgraded `<ScaffoldListPage>`
// shell mounts a `<ScaffoldListPageToolbar>` client island that calls
// `useRouter` / `useSearchParams` from next/navigation. JSDOM has no app
// router context, so stub both with no-op implementations. The push spy is
// captured + asserted in the ScaffoldListRow row-click test below.
const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { ScaffoldListPage, ScaffoldListPageLoading } from "../list-page";
import { ScaffoldListRow } from "../list-page-row";
import { ScaffoldDetailPage, ScaffoldDetailPageLoading } from "../detail-page";
import { ScaffoldErrorState } from "../error-state";
import { defineAction } from "../action";
import type { DataFetcher, EntityDef } from "../entity";

type Demo = { id: string; name: string };

function makeEntity(
  overrides: Partial<EntityDef<Demo>> = {},
): EntityDef<Demo> {
  return {
    key: "demo",
    label: "Demo",
    labelSingular: "Demo",
    icon: "Sparkles",
    schema: z.object({ id: z.string(), name: z.string() }) as never,
    resource: "Demo",
    searchFields: ["name"],
    listColumns: [{ field: "name", label: "Nama", render: { kind: "TEXT" } }],
    filters: [],
    views: [],
    formSections: [],
    detailTabs: [],
    detailActions: [],
    dataFetcher: vi.fn(async () => ({ rows: [], total: 0 })),
    ...overrides,
  };
}

describe("ScaffoldListPage — empty state", () => {
  it("renders 'Belum ada' when no rows + no search", async () => {
    const entity = makeEntity({
      dataFetcher: vi.fn(async () => ({ rows: [], total: 0 })),
    });
    const ui = await ScaffoldListPage({ entity });
    render(ui);
    expect(screen.getByText(/Belum ada demo/i)).toBeInTheDocument();
  });

  it("renders 'Tidak ada hasil' when search returns empty", async () => {
    const entity = makeEntity({
      dataFetcher: vi.fn(async () => ({ rows: [], total: 0 })),
    });
    const ui = await ScaffoldListPage({ entity, searchParams: { q: "xyz" } });
    render(ui);
    expect(screen.getByText(/Tidak ada hasil/i)).toBeInTheDocument();
  });

  it("renders rows when data present", async () => {
    const entity = makeEntity({
      dataFetcher: vi.fn(async () => ({
        rows: [
          { id: "1", name: "Pak Budi" },
          { id: "2", name: "Bu Sari" },
        ],
        total: 2,
      })),
    });
    const ui = await ScaffoldListPage({ entity });
    render(ui);
    expect(screen.getByText("Pak Budi")).toBeInTheDocument();
    expect(screen.getByText("Bu Sari")).toBeInTheDocument();
  });
});

describe("ScaffoldListPage — error state", () => {
  it("renders ScaffoldErrorState when dataFetcher throws", async () => {
    const entity = makeEntity({
      dataFetcher: vi.fn(async () => {
        throw new Error("DB unreachable");
      }),
    });
    const ui = await ScaffoldListPage({ entity });
    render(ui);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Gagal memuat data/i)).toBeInTheDocument();
    expect(screen.getByText(/DB unreachable/i)).toBeInTheDocument();
  });
});

describe("ScaffoldListPage — pagination params", () => {
  it("forwards page + pageSize to dataFetcher with sane defaults", async () => {
    const fetcher = vi.fn<DataFetcher<Demo>>(async () => ({ rows: [], total: 0 }));
    await ScaffoldListPage({
      entity: makeEntity({ dataFetcher: fetcher }),
    });
    expect(fetcher).toHaveBeenCalledWith({
      page: 1,
      pageSize: 25,
      filters: {},
      search: undefined,
    });
  });

  it("clamps pageSize to [1, 100]", async () => {
    const fetcher = vi.fn<DataFetcher<Demo>>(async () => ({ rows: [], total: 0 }));
    await ScaffoldListPage({
      entity: makeEntity({ dataFetcher: fetcher }),
      searchParams: { pageSize: "9999" },
    });
    expect(fetcher.mock.calls[0]?.[0]?.pageSize).toBe(100);
  });

  it("rejects non-numeric page → defaults to 1", async () => {
    const fetcher = vi.fn<DataFetcher<Demo>>(async () => ({ rows: [], total: 0 }));
    await ScaffoldListPage({
      entity: makeEntity({ dataFetcher: fetcher }),
      searchParams: { page: "abc" },
    });
    expect(fetcher.mock.calls[0]?.[0]?.page).toBe(1);
  });
});

describe("ScaffoldListPage — loading skeleton", () => {
  it("renders skeleton placeholder", () => {
    const { container } = render(<ScaffoldListPageLoading />);
    expect(container.querySelector('[data-slot="scaffold-list-page-loading"]'))
      .not.toBeNull();
  });
});

describe("ScaffoldDetailPage — error / not-found / row states", () => {
  it("renders error state when fetchRow throws", async () => {
    const ui = await ScaffoldDetailPage({
      entity: makeEntity(),
      fetchRow: async () => {
        throw new Error("permission denied");
      },
    });
    render(ui);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders not-found when fetchRow returns null", async () => {
    const ui = await ScaffoldDetailPage({
      entity: makeEntity(),
      fetchRow: async () => null,
    });
    const { container } = render(ui);
    expect(container.querySelector('[data-slot="scaffold-detail-page-not-found"]'))
      .not.toBeNull();
    expect(screen.getAllByText(/Tidak ditemukan/i).length).toBeGreaterThanOrEqual(1);
  });

  it("renders row + tabs when present", async () => {
    const entity = makeEntity({
      detailTabs: [
        {
          key: "ringkasan",
          label: "Ringkasan",
          render: (row) => <span>nama: {row.name}</span>,
        },
        {
          key: "aktivitas",
          label: "Aktivitas",
          render: () => <span>aktivitas tab</span>,
        },
      ],
    });
    const ui = await ScaffoldDetailPage({
      entity,
      fetchRow: async () => ({ id: "1", name: "Bu Sari" }),
      rowLabel: (row) => row.name,
    });
    render(ui);
    expect(screen.getByRole("heading", { level: 1, name: "Bu Sari" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Ringkasan" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Aktivitas" })).toBeInTheDocument();
  });

  it("renders status pill when rowStatus returns one", async () => {
    const entity = makeEntity();
    const ui = await ScaffoldDetailPage({
      entity,
      fetchRow: async () => ({ id: "1", name: "x" }),
      rowStatus: () => ({ label: "Aktif", tone: "success" }),
    });
    render(ui);
    expect(screen.getByText("Aktif")).toBeInTheDocument();
  });
});

describe("ScaffoldDetailPage — loading skeleton", () => {
  it("renders skeleton placeholder", () => {
    const { container } = render(<ScaffoldDetailPageLoading />);
    expect(container.querySelector('[data-slot="scaffold-detail-page-loading"]'))
      .not.toBeNull();
  });
});

describe("defineAction (override hatch §5.3)", () => {
  it("returns DetailActionDef shape with all input fields", () => {
    const onClick = vi.fn();
    const action = defineAction<Demo>({
      key: "promote",
      label: "Aktifkan",
      icon: "CheckCircle",
      scope: "OWN_CAMPUS",
      variant: "default",
      confirm: { title: "Aktifkan?", description: "Konfirmasi tindakan." },
      onClick,
    });
    expect(action.key).toBe("promote");
    expect(action.label).toBe("Aktifkan");
    expect(action.icon).toBe("CheckCircle");
    expect(action.scope).toBe("OWN_CAMPUS");
    expect(action.variant).toBe("default");
    expect(action.confirm?.title).toBe("Aktifkan?");
    expect(action.onClick).toBe(onClick);
  });

  it("preserves type parameter T through the factory", async () => {
    const captured: Array<Demo> = [];
    const action = defineAction<Demo>({
      key: "x",
      label: "X",
      scope: "ALL",
      onClick: (row) => {
        captured.push(row);
      },
    });
    await action.onClick({ id: "1", name: "Bu Sari" });
    expect(captured).toEqual([{ id: "1", name: "Bu Sari" }]);
  });

  it("supports actions without confirm (immediate click)", () => {
    const action = defineAction<Demo>({
      key: "x",
      label: "X",
      scope: "ALL",
      onClick: () => undefined,
    });
    expect(action.confirm).toBeUndefined();
  });

  describe("audit wiring (p1-audit-write-middleware)", () => {
    it("calls writeAuditLog after a successful onClick with the resolved row args", async () => {
      writeAuditLogMock.mockReset();
      const userOnClick = vi.fn().mockResolvedValue(undefined);
      const action = defineAction<Demo>({
        key: "promote",
        label: "Aktifkan",
        scope: "ALL",
        onClick: userOnClick,
        audit: {
          resource: "Demo",
          resourceId: (row) => row.id,
          tenantId: "t_1",
          actorUserId: "u_1",
        },
      });

      await action.onClick({ id: "demo_42", name: "Bu Sari" });

      expect(userOnClick).toHaveBeenCalledTimes(1);
      expect(writeAuditLogMock).toHaveBeenCalledTimes(1);
      expect(writeAuditLogMock).toHaveBeenCalledWith({
        tenantId: "t_1",
        actorUserId: "u_1",
        action: "UPDATE",
        resource: "Demo",
        resourceId: "demo_42",
      });
    });

    it("does NOT call writeAuditLog when the user onClick throws — error re-throws", async () => {
      writeAuditLogMock.mockReset();
      const boom = new Error("user onClick failed");
      const action = defineAction<Demo>({
        key: "promote",
        label: "Aktifkan",
        scope: "ALL",
        onClick: vi.fn().mockRejectedValue(boom),
        audit: {
          resource: "Demo",
          resourceId: (row) => row.id,
          tenantId: "t_1",
          actorUserId: null,
        },
      });

      await expect(
        action.onClick({ id: "demo_42", name: "Bu Sari" }),
      ).rejects.toBe(boom);
      expect(writeAuditLogMock).not.toHaveBeenCalled();
    });
  });
});

describe("ScaffoldListRow — T2 client island", () => {
  beforeEach(() => {
    routerPush.mockReset();
  });

  it("clicking the row navigates to the View action's href", () => {
    render(
      <table><tbody>
        <ScaffoldListRow
          rowId="row-1"
          cells={["Pak Budi"]}
          actions={[{ key: "view", label: "Lihat", kind: "view", href: "/x/1" }]}
        />
      </tbody></table>,
    );
    const row = document.querySelector('[data-slot="scaffold-list-row"]') as HTMLElement;
    fireEvent.click(row);
    expect(routerPush).toHaveBeenCalledWith("/x/1");
  });

  it("Enter key on focused row triggers nav", () => {
    render(
      <table><tbody>
        <ScaffoldListRow
          rowId="row-1"
          cells={["Pak Budi"]}
          actions={[{ key: "view", label: "Lihat", kind: "view", href: "/x/2" }]}
        />
      </tbody></table>,
    );
    const row = document.querySelector('[data-slot="scaffold-list-row"]') as HTMLElement;
    fireEvent.keyDown(row, { key: "Enter", target: row, currentTarget: row });
    expect(routerPush).toHaveBeenCalledWith("/x/2");
  });

  it("renders no row-click affordance when no View action present", () => {
    render(
      <table><tbody>
        <ScaffoldListRow
          rowId="row-1"
          cells={["Pak Budi"]}
          actions={[]}
        />
      </tbody></table>,
    );
    const row = document.querySelector('[data-slot="scaffold-list-row"]') as HTMLElement;
    expect(row.getAttribute("tabIndex")).toBeNull();
    expect(row.getAttribute("data-clickable")).toBeNull();
  });

  it("renders the inline 'Lihat' button when View action present", () => {
    render(
      <table><tbody>
        <ScaffoldListRow
          rowId="row-1"
          cells={["x"]}
          actions={[{ key: "view", label: "Lihat", kind: "view", href: "/x/1" }]}
        />
      </tbody></table>,
    );
    expect(screen.getByText(/Lihat/i)).toBeInTheDocument();
  });
});

describe("ScaffoldErrorState", () => {
  it("uses default 'Gagal memuat data' title", () => {
    render(<ScaffoldErrorState error={new Error("oops")} />);
    expect(screen.getByText(/Gagal memuat data/i)).toBeInTheDocument();
    expect(screen.getByText(/oops/i)).toBeInTheDocument();
  });

  it("respects custom title", () => {
    render(<ScaffoldErrorState error={new Error("x")} title="Gagal menyimpan" />);
    expect(screen.getByText(/Gagal menyimpan/i)).toBeInTheDocument();
  });
});
