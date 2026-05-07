"use client";

// ScaffoldFormPage<T> — client form-page shell per spec §5.2 + §5.4
// (Breadcrumbs → Header → RHF sections → Footer Cancel + Save). Mobile
// responsive per §5.8 (1-col mobile, 2-col md+ within sections).
//
// Client component because it owns RHF Controller + form state. Field
// renderers stay server-component-friendly; only the Controller wrapper
// crosses the client boundary.

import * as React from "react";
import Link from "next/link";
import {
  useForm,
  Controller,
  type DefaultValues,
  type FieldValues,
  type Path,
} from "react-hook-form";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import type { EntityDef, FieldDef } from "./entity";
import { ScaffoldErrorState } from "./error-state";
import type { ActionResult } from "./server-action";
import {
  getRenderer,
  MissingRendererError,
  type FieldRendererProps,
} from "./field-renderer";

export type ScaffoldFormPageProps<T extends FieldValues> = {
  entity: EntityDef<T>;
  initialValues?: Partial<T>;
  breadcrumbs?: ReadonlyArray<{ label: string; href?: string }>;
  /** "Tambah" / "Ubah" — drives header label. Default: "Tambah". */
  mode?: "create" | "edit";
  /**
   * Server-action submit handler. Pass the imported `"use server"` action
   * directly (e.g. `onSubmit={createStudent}`) — Next.js App Router only
   * serialises server actions across the RSC → Client Component boundary.
   * Inline closures wrapping a server action are NOT serialisable and break
   * at build time. Returns `ActionResult<unknown>`; the form reads `result.ok`
   * and surfaces `result.error` via the inline error state on `false`.
   */
  onSubmit: (values: T) => Promise<ActionResult<unknown>>;
  cancelHref?: string;
};

export function ScaffoldFormPage<T extends FieldValues>({
  entity,
  initialValues,
  breadcrumbs = [],
  mode = "create",
  onSubmit,
  cancelHref,
}: ScaffoldFormPageProps<T>) {
  const form = useForm<T>({ defaultValues: initialValues as DefaultValues<T> });
  const [submitError, setSubmitError] = React.useState<Error | null>(null);

  const handleSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      const result = await onSubmit(values);
      if (!result.ok) {
        // Server-action failure surfaces as inline error. ActionResult.error
        // is the contract per `lib/scaffold/server-action.ts`. The optional
        // `field` is forwarded to RHF in a future cycle (per-field validation
        // surface); currently rendered via the page-level ScaffoldErrorState.
        setSubmitError(new Error(result.error));
      }
    } catch (e) {
      // Network failure / unexpected throw — server actions normally return
      // ActionResult, so reaching this branch indicates infra-level error.
      setSubmitError(e instanceof Error ? e : new Error(String(e)));
    }
  });

  const headerLabel =
    mode === "edit" ? `Ubah ${entity.labelSingular}` : `Tambah ${entity.labelSingular}`;
  const trail = [...breadcrumbs, { label: entity.label, href: cancelHref }, { label: headerLabel }];

  return (
    <form
      data-slot="scaffold-form-page"
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 p-4 md:p-6"
    >
      <Breadcrumb>
        <BreadcrumbList>
          {trail.map((step, i) => {
            const isLast = i === trail.length - 1;
            return (
              <React.Fragment key={`${step.label}-${i}`}>
                <BreadcrumbItem>
                  {isLast || !step.href ? (
                    <BreadcrumbPage>{step.label}</BreadcrumbPage>
                  ) : (
                    <Link href={step.href} className="hover:text-foreground transition-colors">
                      {step.label}
                    </Link>
                  )}
                </BreadcrumbItem>
                {!isLast && <BreadcrumbSeparator />}
              </React.Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{headerLabel}</h1>
      </header>
      {submitError && <ScaffoldErrorState error={submitError} title="Gagal menyimpan" />}
      {entity.formSections.map((section) => (
        <fieldset key={section.key} className="rounded-lg border p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <legend className="px-2 text-sm font-medium">{section.label}</legend>
          {section.fields.map((f) => (
            <ScaffoldFormField<T>
              key={f.key}
              fieldKey={f.key as Path<T>}
              def={f.def}
              label={f.label}
              required={f.required}
              helpText={f.helpText}
              control={form.control}
            />
          ))}
        </fieldset>
      ))}
      <footer className="flex items-center justify-end gap-2 border-t pt-4">
        {cancelHref ? (
          <Link href={cancelHref}>
            <Button type="button" variant="ghost">
              Batal
            </Button>
          </Link>
        ) : (
          <Button type="button" variant="ghost" onClick={() => form.reset()}>
            Batal
          </Button>
        )}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Menyimpan…" : "Simpan"}
        </Button>
      </footer>
    </form>
  );
}

function ScaffoldFormField<T extends FieldValues>({
  fieldKey,
  def,
  label,
  required,
  helpText,
  control,
}: {
  fieldKey: Path<T>;
  def: FieldDef;
  label: string;
  required?: boolean;
  helpText?: string;
  control: ReturnType<typeof useForm<T>>["control"];
}) {
  let Renderer: React.ComponentType<FieldRendererProps>;
  try {
    Renderer = getRenderer(def.kind) as typeof Renderer;
  } catch (e) {
    if (e instanceof MissingRendererError) {
      return (
        <div className="col-span-full rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          Renderer untuk kind <code className="font-mono">{def.kind}</code> belum tersedia. Hadir di cycle <code className="font-mono">p1-scaffold-renderers</code>.
        </div>
      );
    }
    throw e;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={fieldKey as string}>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <Controller
        name={fieldKey}
        control={control}
        render={({ field, fieldState }) => (
          <Renderer
            field={field as FieldRendererProps["field"]}
            def={def}
            ariaInvalid={!!fieldState.error}
          />
        )}
      />
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
    </div>
  );
}

export function ScaffoldFormPageLoading() {
  return (
    <div data-slot="scaffold-form-page-loading" className="flex flex-col gap-4 p-4 md:p-6">
      <div className="h-4 w-48 rounded bg-muted animate-pulse" />
      <div className="h-8 w-72 rounded bg-muted animate-pulse" />
      <div className="rounded-lg border p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <div className="h-3 w-24 rounded bg-muted animate-pulse" />
            <div className="h-8 w-full rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 border-t pt-4">
        <div className="h-8 w-20 rounded bg-muted animate-pulse" />
        <div className="h-8 w-24 rounded bg-muted animate-pulse" />
      </div>
    </div>
  );
}
