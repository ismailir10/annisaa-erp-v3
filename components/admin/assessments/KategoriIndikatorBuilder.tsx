"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";

export type CategoryForm = { name: string; indicators: string[] };

export const EMPTY_CATEGORY: CategoryForm = { name: "", indicators: [""] };

export function KategoriIndikatorBuilder({
  value,
  onChange,
  disabled = false,
  lockNotice,
}: {
  value: CategoryForm[];
  onChange: (next: CategoryForm[]) => void;
  disabled?: boolean;
  lockNotice?: string;
}) {
  function addCategory() {
    onChange([...value, { ...EMPTY_CATEGORY }]);
  }
  function removeCategory(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }
  function updateCategoryName(index: number, name: string) {
    const next = [...value];
    next[index] = { ...next[index], name };
    onChange(next);
  }
  function addIndicator(catIndex: number) {
    const next = [...value];
    next[catIndex] = { ...next[catIndex], indicators: [...next[catIndex].indicators, ""] };
    onChange(next);
  }
  function removeIndicator(catIndex: number, indIndex: number) {
    const next = [...value];
    next[catIndex] = {
      ...next[catIndex],
      indicators: next[catIndex].indicators.filter((_, i) => i !== indIndex),
    };
    onChange(next);
  }
  function updateIndicator(catIndex: number, indIndex: number, text: string) {
    const next = [...value];
    const inds = [...next[catIndex].indicators];
    inds[indIndex] = text;
    next[catIndex] = { ...next[catIndex], indicators: inds };
    onChange(next);
  }

  return (
    <div className="border-t pt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">Kategori &amp; Indikator</span>
        <Button size="sm" variant="outline" onClick={addCategory} disabled={disabled}>
          <Plus size={12} className="mr-1" /> Kategori
        </Button>
      </div>

      {lockNotice ? (
        <p className="mb-2 rounded-md border border-status-late bg-status-late-subtle px-3 py-2 text-xs text-status-late-text">
          {lockNotice}
        </p>
      ) : null}

      {value.map((cat, ci) => (
        <div key={ci} className="border rounded-lg p-3 mb-3 space-y-2">
          <div className="flex items-end gap-2">
            <Field className="flex-1">
              <FieldLabel htmlFor={`category-${ci}`} required>
                Nama Kategori
              </FieldLabel>
              <Input
                id={`category-${ci}`}
                placeholder="Nama kategori"
                value={cat.name}
                onChange={(e) => updateCategoryName(ci, e.target.value)}
                disabled={disabled}
                required
              />
            </Field>
            {value.length > 1 && !disabled && (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive h-8 w-8 p-0"
                onClick={() => removeCategory(ci)}
                aria-label={`Hapus kategori ${ci + 1}`}
              >
                <Trash2 size={14} />
              </Button>
            )}
          </div>
          {cat.indicators.map((ind, ii) => (
            <div key={ii} className="flex items-end gap-2 pl-4">
              <Field className="flex-1">
                <FieldLabel htmlFor={`category-${ci}-indicator-${ii}`} required>
                  Indikator {ii + 1}
                </FieldLabel>
                <Input
                  id={`category-${ci}-indicator-${ii}`}
                  className="text-sm"
                  placeholder={`Indikator ${ii + 1}`}
                  value={ind}
                  onChange={(e) => updateIndicator(ci, ii, e.target.value)}
                  disabled={disabled}
                  required
                />
              </Field>
              {cat.indicators.length > 1 && !disabled && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive h-7 w-7 p-0"
                  onClick={() => removeIndicator(ci, ii)}
                  aria-label={`Hapus indikator ${ii + 1}`}
                >
                  <Trash2 size={12} />
                </Button>
              )}
            </div>
          ))}
          {!disabled && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-4 text-xs"
              onClick={() => addIndicator(ci)}
            >
              + Indikator
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
