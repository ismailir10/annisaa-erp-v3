"use client";

import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

const SCORE_LABELS: Record<string, { label: string; color: string }> = {
  BB: { label: "Belum Berkembang", color: "text-destructive" },
  MB: { label: "Mulai Berkembang", color: "text-[var(--status-late)]" },
  BSH: { label: "Berkembang Sesuai Harapan", color: "text-[var(--status-present)]" },
  BSB: { label: "Berkembang Sangat Baik", color: "text-primary" },
};

type AssessmentItem = {
  id: string;
  templateName: string;
  period: string;
  programName: string;
  status: string;
  categories: {
    id: string;
    name: string;
    indicators: {
      id: string;
      description: string;
    }[];
  }[];
  scores: {
    indicatorId: string;
    score: string | null;
  }[];
};

type AssessmentsTableProps = {
  data: AssessmentItem[];
};

export function AssessmentsTable({ data }: AssessmentsTableProps) {
  const [selectedAssessment, setSelectedAssessment] = useState<AssessmentItem | null>(null);

  const columns: ColumnDef<AssessmentItem>[] = [
    {
      accessorKey: "templateName",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Template" />,
      cell: ({ row }) => (
        <span className="text-sm font-medium">{row.original.templateName}</span>
      ),
    },
    {
      accessorKey: "period",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Periode" />,
      cell: ({ row }) => (
        <span className="text-sm">{row.original.period}</span>
      ),
    },
    {
      accessorKey: "programName",
      header: "Program",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.programName}</span>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setSelectedAssessment(row.original)}
        >
          <Eye size={14} className="mr-1" /> Lihat
        </Button>
      ),
    },
  ];

  const scoreMap = selectedAssessment
    ? new Map(selectedAssessment.scores.map((s) => [s.indicatorId, s]))
    : null;

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        defaultSort={{ field: "period", order: "desc" }}
        emptyTitle="Belum ada rapor"
        emptyDescription="Rapor akan tersedia setelah guru menilai dan admin menerbitkan."
      />

      <Sheet open={!!selectedAssessment} onOpenChange={() => setSelectedAssessment(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selectedAssessment && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedAssessment.templateName}</SheetTitle>
                <p className="text-sm text-muted-foreground">
                  {selectedAssessment.period} · {selectedAssessment.programName}
                </p>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {selectedAssessment.categories.map((cat) => (
                  <div key={cat.id}>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                      {cat.name}
                    </h3>
                    <div className="space-y-3">
                      {cat.indicators.map((ind) => {
                        const score = scoreMap?.get(ind.id);
                        const scoreInfo = score?.score
                          ? SCORE_LABELS[score.score]
                          : null;
                        return (
                          <div
                            key={ind.id}
                            className="flex items-start justify-between py-2 border-b border-border/50 last:border-0"
                          >
                            <p className="text-xs flex-1 pr-3">
                              {ind.description}
                            </p>
                            <div className="text-right shrink-0">
                              {scoreInfo ? (
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] ${scoreInfo.color}`}
                                >
                                  {score!.score}
                                </Badge>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">
                                  —
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
