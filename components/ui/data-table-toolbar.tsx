"use client";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";

interface DataTableToolbarProps {
  searchPlaceholder?: string;
  onSearchChange?: (search: string) => void;
  filters?: {
    key: string;
    label: string;
    options: { value: string; label: string }[];
    value: string;
    onChange: (value: string) => void;
  }[];
  actions?: React.ReactNode;
}

export function DataTableToolbar({
  searchPlaceholder = "Cari...",
  onSearchChange,
  filters,
  actions,
}: DataTableToolbarProps) {
  const [search, setSearch] = useState("");

  // Debounce search
  useEffect(() => {
    const timeout = setTimeout(() => {
      onSearchChange?.(search);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, onSearchChange]);

  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-4">
      {onSearchChange && (
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      )}

      {filters?.map((filter) => (
        <Select key={filter.key} value={filter.value} onValueChange={(v) => v && filter.onChange(v)}>
          <SelectTrigger className="w-full sm:w-40 h-9">
            <SelectValue placeholder={filter.label} />
          </SelectTrigger>
          <SelectContent>
            {filter.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {actions && <div className="flex gap-2 ml-auto">{actions}</div>}
    </div>
  );
}
