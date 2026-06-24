"use client";

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  SortingState,
  getSortedRowModel,
  getPaginationRowModel,
} from "@tanstack/react-table";
import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTablePagination } from "./data-table-pagination";
import { EmptyState } from "./empty-state";
import { Skeleton } from "./skeleton";
import { Inbox } from "lucide-react";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onSortChange?: (field: string, order: "asc" | "desc") => void;
  defaultSort?: { field: string; order: "asc" | "desc" };
  emptyTitle?: string;
  emptyDescription?: string;
  loading?: boolean;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  pagination,
  onPageChange,
  onPageSizeChange,
  onSortChange,
  defaultSort,
  emptyTitle = "Tidak ada data",
  emptyDescription,
  loading = false,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>(
    defaultSort
      ? [{ id: defaultSort.field, desc: defaultSort.order === "desc" }]
      : []
  );
  const isClientPaginated = Boolean(pagination && !onPageChange);
  const [clientPage, setClientPage] = useState(pagination?.page ?? 1);
  const [clientPageSize, setClientPageSize] = useState(pagination?.pageSize ?? 10);
  const clientTotalPages = Math.max(1, Math.ceil(data.length / clientPageSize));
  const displayPagination = pagination
    ? isClientPaginated
      ? {
          page: Math.min(clientPage, clientTotalPages),
          pageSize: clientPageSize,
          total: data.length,
          totalPages: clientTotalPages,
        }
      : pagination
    : undefined;

  useEffect(() => {
    if (!isClientPaginated) return;
    setClientPage((page) => Math.min(page, clientTotalPages));
  }, [clientTotalPages, isClientPaginated]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: onSortChange ? undefined : getSortedRowModel(),
    getPaginationRowModel: isClientPaginated ? getPaginationRowModel() : undefined,
    onSortingChange: setSorting,
    state: {
      sorting,
      ...(displayPagination && isClientPaginated
        ? {
            pagination: {
              pageIndex: Math.max(0, displayPagination.page - 1),
              pageSize: displayPagination.pageSize,
            },
          }
        : {}),
    },
    manualPagination: !isClientPaginated,
    manualSorting: !!onSortChange,
    pageCount: pagination?.totalPages ?? -1,
  });

  // Notify parent when sorting changes (server-side sorting)
  useEffect(() => {
    if (!onSortChange || sorting.length === 0) return;
    const { id, desc } = sorting[0];
    onSortChange(id, desc ? "desc" : "asc");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorting]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {columns.map((_, i) => (
                <TableHead key={i}>
                  <Skeleton className="h-4 w-20" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3, 4, 5].map((row) => (
              <TableRow key={row}>
                {columns.map((_, i) => (
                  <TableCell key={i}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (data.length === 0 && !loading) {
    return (
      <EmptyState
        icon={Inbox}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-muted/50">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="text-xs font-semibold text-muted-foreground tracking-wider"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="hover:bg-muted/30 transition-colors"
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="text-sm">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {displayPagination && (
        <DataTablePagination
          page={displayPagination.page}
          pageSize={displayPagination.pageSize}
          total={displayPagination.total}
          totalPages={displayPagination.totalPages}
          onPageChange={
            isClientPaginated
              ? (page) => setClientPage(Math.min(Math.max(page, 1), clientTotalPages))
              : onPageChange
          }
          onPageSizeChange={
            isClientPaginated
              ? (pageSize) => {
                  setClientPageSize(pageSize);
                  setClientPage(1);
                }
              : onPageSizeChange
          }
        />
      )}
    </div>
  );
}
