import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import { z } from "zod";

import { ScaffoldListPage, ScaffoldListPageLoading } from "../list-page";
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
