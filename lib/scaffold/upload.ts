"use client";

// Client-side upload helpers for FILE-kind scaffold fields.
//
// `uploadFile(file, kind)` POSTs multipart/form-data to /api/upload (T5) and
// unwraps the structured response. `useUploadOnSubmit(form, fileFields)`
// returns a `wrap(handler)` that walks the listed FILE fields, replaces any
// `File` value with the upload result `{id, signedUrl}` before invoking the
// caller's submit handler. On any upload failure, the wrapper sets per-field
// RHF errors and aborts (does NOT call the caller's handler).
//
// Lazy strategy (per cycle Assumption §4): uploads fire on form submit, NOT
// on input change. Trade-off: user waits during compress + upload, but no
// PENDING_UPLOAD orphan rows accumulate from abandoned forms (orphan-cleanup
// cron deferred to p3+). Eager would create orphans this cycle can't reap.
//
// Hook signature explicitly takes `{name, kind}` pairs (Assumption §9 +
// spec-time review MAJOR §5) — the existing FieldDef type has no name/key
// property, so the hook cannot walk fields by name internally; consumers
// thread the pairs in. Avoids registry-wide refactor in this cycle.
//
// Cycle: docs/cycles/2026-05-06-p1-upload-route-sharp.md (Spec §lib/scaffold/upload.ts)

import * as React from "react";
import type {
  FieldPath,
  FieldValues,
  SubmitHandler,
  UseFormReturn,
} from "react-hook-form";

import type { FileKind } from "@/lib/generated/prisma/client";

export class UploadError extends Error {
  readonly code: string;
  readonly assetId?: string;
  constructor(code: string, message: string, assetId?: string) {
    super(message);
    this.name = "UploadError";
    this.code = code;
    this.assetId = assetId;
  }
}

export type UploadResult = { id: string; signedUrl: string };

export async function uploadFile(
  file: File,
  kind: FileKind,
): Promise<UploadResult> {
  const fd = new FormData();
  fd.set("file", file);
  fd.set("kind", kind);
  let res: Response;
  try {
    res = await fetch("/api/upload", { method: "POST", body: fd });
  } catch (e) {
    throw new UploadError(
      "network_error",
      e instanceof Error ? e.message : "network failure",
    );
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    // Non-JSON 5xx response — fall through to the !ok branch with a
    // synthetic message.
  }
  if (!res.ok) {
    const code = (body.error as string | undefined) ?? `http_${res.status}`;
    const assetId = body.id as string | undefined;
    throw new UploadError(code, `upload failed: ${code}`, assetId);
  }
  if (typeof body.id !== "string" || typeof body.signedUrl !== "string") {
    throw new UploadError(
      "invalid_response",
      "upload response missing id / signedUrl",
    );
  }
  return { id: body.id, signedUrl: body.signedUrl };
}

export type UploadFieldRef<TForm extends FieldValues> = {
  name: FieldPath<TForm>;
  kind: FileKind;
};

export type UseUploadOnSubmitReturn<TForm extends FieldValues> = {
  wrap: (handler: SubmitHandler<TForm>) => SubmitHandler<TForm>;
  isUploading: boolean;
};

export function useUploadOnSubmit<TForm extends FieldValues>(
  form: UseFormReturn<TForm>,
  fileFields: ReadonlyArray<UploadFieldRef<TForm>>,
): UseUploadOnSubmitReturn<TForm> {
  const [isUploading, setIsUploading] = React.useState(false);

  // Stabilize the consumer-supplied fileFields array internally — consumers
  // commonly pass an inline array literal (`useUploadOnSubmit(form, [{name,
  // kind}])`), which would change reference on every render and thrash the
  // wrap callback below. Stringify-key memo is fine: the array is small, the
  // shape is shallow, and the cost beats forcing every consumer to wrap in
  // their own useMemo. Per feature-dev:code-reviewer T7+T8 finding M2.
  const fileFieldsKey = React.useMemo(
    () => JSON.stringify(fileFields),
    [fileFields],
  );
  const stableFileFields = React.useMemo(
    () => fileFields,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fileFieldsKey],
  );

  const wrap = React.useCallback(
    (handler: SubmitHandler<TForm>): SubmitHandler<TForm> => {
      return async (_values, event) => {
        // Identify fields whose RHF value is still a File (vs already-uploaded
        // {id, signedUrl} from a previous submit attempt or hydration).
        const pending = stableFileFields
          .map((ref) => {
            // Cast to unknown first — RHF's getValues<TForm, FieldPath<TForm>>
            // resolves to a complex conditional that TS doesn't accept as the
            // LHS of `instanceof`. The runtime check is unaffected.
            const value: unknown = form.getValues(ref.name);
            return value instanceof File ? { ref, file: value } : null;
          })
          .filter((x): x is { ref: UploadFieldRef<TForm>; file: File } => x !== null);

        // Always re-read values via form.getValues() rather than the RHF
        // snapshot `_values` for parity across both branches — keeps a
        // consistent values origin for the consumer handler regardless of
        // whether uploads ran. Per feature-dev:code-reviewer T7+T8 M1.
        if (pending.length === 0) {
          return handler(form.getValues(), event);
        }

        setIsUploading(true);
        try {
          // Promise.allSettled (NOT Promise.all): a partial-failure scenario
          // must still let successful uploads complete + persist their
          // {id, signedUrl} into RHF state, so a retry skips them. With
          // Promise.all the first reject would short-circuit, leaving
          // in-flight successful uploads orphaned in storage with their
          // FileAsset rows still PENDING_UPLOAD (no FAILED transition fires
          // until the next submit). allSettled gives a clean retry surface.
          const results = await Promise.allSettled(
            pending.map((p) => uploadFile(p.file, p.ref.kind)),
          );

          const failures: Array<{ name: FieldPath<TForm>; error: UploadError }> = [];
          results.forEach((r, i) => {
            const ref = pending[i].ref;
            if (r.status === "fulfilled") {
              // RHF setValue accepts deep paths via the second arg; the value
              // shape mirrors what the row stores once the entity ships
              // (FileAsset id + signedUrl for client preview).
              form.setValue(
                ref.name,
                r.value as never,
                { shouldDirty: true, shouldValidate: false },
              );
            } else {
              const error =
                r.reason instanceof UploadError
                  ? r.reason
                  : new UploadError(
                      "unknown",
                      r.reason instanceof Error ? r.reason.message : String(r.reason),
                    );
              failures.push({ name: ref.name, error });
            }
          });

          if (failures.length > 0) {
            // Set per-field RHF errors so the renderer surfaces them inline.
            // Do NOT invoke the caller's handler — the form is in a partial-
            // upload state. The user can retry by submitting again; uploaded
            // files now hold the {id, signedUrl} shape and skip on retry.
            failures.forEach((f) => {
              form.setError(f.name, {
                type: "upload",
                message: f.error.message,
              });
            });
            return;
          }

          // Re-read values so the handler sees the replaced FILE fields.
          return handler(form.getValues(), event);
        } finally {
          setIsUploading(false);
        }
      };
    },
    [form, stableFileFields],
  );

  return { wrap, isUploading };
}
