// Reference fixture demonstrating the full `EntityDef` contract for downstream
// cycle authors. Excluded from `scaffold-check` (lives under `__fixtures__/`).
//
// Per spec §5.1, real entities live at `lib/entities/<name>/{schema,entity,
// policy}.ts`. The first concrete entity (Student) lands in
// `p2-students-guardians-household`. This fixture exists so authors writing
// their first entity have a complete typed example, including the override-
// hatch action and detail-tab render contract.

import * as React from "react";
import { z } from "zod";

import {
  defineAction,
  type DataFetcher,
  type EntityDef,
} from "@/lib/scaffold";

export const exampleSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Nama wajib diisi").max(255),
  email: z.string().email().optional(),
  isActive: z.boolean().default(true),
});

export type Example = z.infer<typeof exampleSchema>;

const dataFetcher: DataFetcher<Example> = async () => ({
  rows: [],
  total: 0,
});

export const exampleEntity: EntityDef<Example> = {
  key: "example",
  label: "Contoh",
  labelSingular: "Contoh",
  icon: "Sparkles",
  schema: exampleSchema,
  resource: "Example",
  searchFields: ["name", "email"],
  listColumns: [
    { field: "name", label: "Nama", render: { kind: "TEXT" }, sortable: true },
    {
      field: "email",
      label: "Surel",
      render: { kind: "EMAIL" },
    },
    {
      field: "isActive",
      label: "Aktif",
      render: { kind: "BOOLEAN", trueLabel: "Aktif", falseLabel: "Nonaktif" },
    },
  ],
  filters: [
    {
      key: "status",
      label: "Status",
      kind: "SELECT",
      options: [
        { value: "active", label: "Aktif" },
        { value: "inactive", label: "Nonaktif" },
      ],
    },
  ],
  views: [
    {
      key: "all",
      label: "Semua",
      filters: {},
      defaultFor: ["admin"],
    },
    {
      key: "active",
      label: "Aktif saja",
      filters: { status: "active" },
    },
  ],
  formSections: [
    {
      key: "basic",
      label: "Informasi dasar",
      fields: [
        {
          key: "name",
          def: { kind: "TEXT", placeholder: "Nama lengkap", maxLength: 255 },
          label: "Nama",
          required: true,
        },
        {
          key: "email",
          def: { kind: "EMAIL" },
          label: "Surel",
        },
      ],
    },
  ],
  detailTabs: [
    {
      key: "ringkasan",
      label: "Ringkasan",
      render: (row) => React.createElement("p", null, `Nama: ${row.name}`),
    },
    {
      key: "aktivitas",
      label: "Aktivitas",
      render: () => React.createElement("p", null, "Belum ada aktivitas."),
    },
  ],
  detailActions: [
    defineAction<Example>({
      key: "deactivate",
      label: "Nonaktifkan",
      icon: "PowerOff",
      scope: "OWN_CAMPUS",
      variant: "warning",
      confirm: {
        title: "Nonaktifkan contoh?",
        description: "Data tetap tersimpan, hanya ditandai nonaktif.",
      },
      onClick: async (row) => {
        // Real implementations call lib/audit/write.ts (lands p1-audit-write-middleware)
        // + a server action. This is a contract-only stub for downstream authors.
        void row;
      },
    }),
  ],
  dataFetcher,
};

export default exampleEntity;
