"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";

interface DataTableToolbarProps {
  searchPlaceholder?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (search: string) => void;
  onSearchChange?: (search: string) => void;
  onReset?: () => void;
  /**
   * Marks the Reset button active for filters this toolbar does not own.
   * Needed when a control cannot live in `filters` — e.g. the grouped Kelas
   * select on /admin/student-attendance, which needs SelectGroup headings that
   * the flat `{value,label}[]` shape here cannot express. Without this, Reset
   * renders disabled while that filter is the only active one.
   */
  hasExternalFilter?: boolean;
  filters?: {
    key: string;
    label: string;
    options: { value: string; label: string }[];
    value: string;
    onChange: (value: string) => void;
    resetValue?: string;
  }[];
  actions?: React.ReactNode;
}

export function DataTableToolbar({
  searchPlaceholder = "Cari...",
  value,
  defaultValue = "",
  onValueChange,
  onSearchChange,
  onReset,
  filters,
  hasExternalFilter = false,
  actions,
}: DataTableToolbarProps) {
  const [internalSearch, setInternalSearch] = useState(defaultValue);
  const isControlled = value !== undefined;
  const search = value ?? internalSearch;
  const hasSearch = Boolean(onValueChange || onSearchChange || value !== undefined);
  const hasFilters = Boolean(filters?.length);
  const filterIsActive = (filter: NonNullable<DataTableToolbarProps["filters"]>[number]) => {
    const resetValue = filter.resetValue ?? filter.options[0]?.value ?? "";
    return filter.value !== resetValue;
  };
  const canReset =
    Boolean(search) || Boolean(filters?.some(filterIsActive)) || hasExternalFilter;

  const setSearch = (nextSearch: string) => {
    if (!isControlled) {
      setInternalSearch(nextSearch);
    }
    if (onValueChange) {
      onValueChange(nextSearch);
    } else if (isControlled) {
      onSearchChange?.(nextSearch);
    }
  };

  const handleReset = () => {
    setSearch("");
    filters?.forEach((filter) => {
      const resetValue = filter.resetValue ?? filter.options[0]?.value;
      if (resetValue !== undefined && filter.value !== resetValue) {
        filter.onChange(resetValue);
      }
    });
    onReset?.();
  };

  // Debounce search
  useEffect(() => {
    if (isControlled && !onValueChange) return;
    if (!onSearchChange) return;
    const timeout = setTimeout(() => {
      onSearchChange(search);
    }, 300);
    return () => clearTimeout(timeout);
  }, [isControlled, onValueChange, search, onSearchChange]);

  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-4">
      {hasSearch && (
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            // The search box has no visible label by design — the magnifier
            // icon carries the affordance. A placeholder is not an accessible
            // name (it disappears on input), so name the control explicitly.
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      )}

      {filters?.map((filter) => (
        <Select
          key={filter.key}
          value={filter.value}
          onValueChange={(v) => {
            if (v !== null) filter.onChange(v);
          }}
        >
          {/* `filter.value` always matches one of `filter.options`, so the
              SelectValue placeholder never renders and cannot name the
              control. Name the trigger explicitly instead. "Filter X" rather
              than bare "X": a page often has a form field of the same name
              (e.g. Status), and the accessible name should say which one this
              is. */}
          <SelectTrigger aria-label={`Filter ${filter.label}`} className="w-full sm:w-40 h-9">
            <SelectValue placeholder={filter.label} />
          </SelectTrigger>
          <SelectContent>
            {filter.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {(hasSearch || hasFilters) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 w-full sm:w-auto"
          disabled={!canReset}
          onClick={handleReset}
        >
          Reset
        </Button>
      )}

      {actions && <div className="flex gap-2 ml-auto">{actions}</div>}
    </div>
  );
}
