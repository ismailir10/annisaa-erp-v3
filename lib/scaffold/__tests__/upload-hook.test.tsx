// Unit tests for useUploadOnSubmit + uploadFile (lib/scaffold/upload.ts).
//
// Renders a tiny consumer form via @testing-library/react that wires the hook
// into RHF, then drives submit via fetch-mock to exercise: parallel uploads
// across multiple FILE fields, mixed File + already-uploaded skip-through,
// partial-failure abort with per-field RHF errors, network-error mapping to
// UploadError, non-2xx body propagation.
//
// Cycle: docs/cycles/2026-05-06-p1-upload-route-sharp.md (Spec §lib/scaffold/upload.ts + tests)

import { afterEach, describe, expect, it, vi } from "vitest";
import { useForm, type SubmitHandler } from "react-hook-form";
import { render, screen, act } from "@testing-library/react";
import * as React from "react";

import {
  useUploadOnSubmit,
  uploadFile,
  UploadError,
  type UploadFieldRef,
} from "../upload";

type Form = { photo: File | { id: string; signedUrl: string } | null; cv: File | { id: string; signedUrl: string } | null };

const FILE_FIELDS: ReadonlyArray<UploadFieldRef<Form>> = [
  { name: "photo", kind: "IMAGE" as never },
  { name: "cv", kind: "DOCUMENT" as never },
];

function makeFile(name: string, type: string, size = 32): File {
  return new File([new Uint8Array(size)], name, { type });
}

function mockFetchOk(body: object): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  } as Response);
}

function mockFetchSequence(
  responses: Array<{ ok: boolean; status?: number; body?: object } | { reject: Error }>,
): void {
  let i = 0;
  globalThis.fetch = vi.fn().mockImplementation(() => {
    const r = responses[i++];
    if ("reject" in r) return Promise.reject(r.reject);
    return Promise.resolve({
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      json: async () => r.body ?? {},
    } as Response);
  });
}

// Capture the real fetch ONCE at module load (not per-test) so prior-file
// pollution can't leak: a beforeEach capture would store whatever vi.fn the
// previous test file left in globalThis.fetch, then re-install that stale
// mock as the "restored" value, breaking every subsequent test that calls
// fetch. Restoring to the module-load reference is the only safe pattern.
const ORIGINAL_FETCH: typeof globalThis.fetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

// Test harness — a tiny consumer form that mounts the hook and exposes the
// submit + RHF state via callbacks for assertions.
function Harness({
  defaults,
  onValid,
  onCapture,
}: {
  defaults: Form;
  onValid: SubmitHandler<Form>;
  onCapture?: (api: {
    submit: () => Promise<void>;
    getValues: () => Form;
    getFieldError: (name: keyof Form) => unknown;
    isUploading: () => boolean;
  }) => void;
}): React.ReactElement {
  const form = useForm<Form>({ defaultValues: defaults });
  const { wrap, isUploading } = useUploadOnSubmit(form, FILE_FIELDS);

  const submit = React.useCallback(async () => {
    await form.handleSubmit(wrap(onValid))();
  }, [form, wrap, onValid]);

  React.useEffect(() => {
    onCapture?.({
      submit,
      getValues: () => form.getValues(),
      // getFieldState reads the live error directly, bypassing the RHF
      // formState Proxy's subscription model (which only materialises errors
      // for keys the component has actually accessed during render).
      getFieldError: (name) => form.getFieldState(name as never).error,
      isUploading: () => isUploading,
    });
  }, [submit, form, isUploading, onCapture]);

  return <div>{isUploading ? "uploading" : "idle"}</div>;
}

describe("uploadFile — wire shape", () => {
  it("posts FormData to /api/upload with file + kind fields and returns {id, signedUrl}", async () => {
    mockFetchOk({ id: "fa_1", signedUrl: "https://signed/x" });
    const file = makeFile("a.jpg", "image/jpeg");
    const result = await uploadFile(file, "IMAGE" as never);
    expect(result).toEqual({ id: "fa_1", signedUrl: "https://signed/x" });
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/upload", {
      method: "POST",
      body: expect.any(FormData),
    });
    const fd = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as FormData;
    expect(fd.get("file")).toBe(file);
    expect(fd.get("kind")).toBe("IMAGE");
  });

  it("throws UploadError with the server-provided code on non-2xx", async () => {
    mockFetchSequence([
      { ok: false, status: 500, body: { error: "storage_upload_failed", id: "fa_x" } },
    ]);
    const file = makeFile("a.jpg", "image/jpeg");
    await expect(uploadFile(file, "IMAGE" as never)).rejects.toMatchObject({
      name: "UploadError",
      code: "storage_upload_failed",
      assetId: "fa_x",
    });
  });

  it("throws UploadError network_error when fetch rejects", async () => {
    mockFetchSequence([{ reject: new Error("offline") }]);
    const file = makeFile("a.jpg", "image/jpeg");
    await expect(uploadFile(file, "IMAGE" as never)).rejects.toMatchObject({
      name: "UploadError",
      code: "network_error",
    });
  });
});

describe("useUploadOnSubmit — parallel uploads", () => {
  it("uploads all File-typed fields in parallel and replaces RHF values before invoking the wrapped handler", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount += 1;
      const which = callCount;
      return {
        ok: true,
        json: async () => ({ id: `fa_${which}`, signedUrl: `https://s/${which}` }),
      } as Response;
    });

    const onValid = vi.fn().mockResolvedValue(undefined);
    let api!: {
      submit: () => Promise<void>;
      getValues: () => Form;
      getFieldError: (name: keyof Form) => unknown;
      isUploading: () => boolean;
    };
    render(
      <Harness
        defaults={{ photo: makeFile("p.jpg", "image/jpeg"), cv: makeFile("c.pdf", "application/pdf") }}
        onValid={onValid}
        onCapture={(a) => {
          api = a;
        }}
      />,
    );
    await act(async () => {
      await api.submit();
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(onValid).toHaveBeenCalledTimes(1);
    const submitted = onValid.mock.calls[0][0] as Form;
    // Parallel = order of completion is non-deterministic; just assert both
    // are now {id, signedUrl} shapes.
    expect(submitted.photo).toMatchObject({ id: expect.stringMatching(/^fa_/), signedUrl: expect.any(String) });
    expect(submitted.cv).toMatchObject({ id: expect.stringMatching(/^fa_/), signedUrl: expect.any(String) });
  });
});

describe("useUploadOnSubmit — mixed state passthrough", () => {
  it("skips fields whose value is already an uploaded {id, signedUrl} shape", async () => {
    mockFetchSequence([{ ok: true, body: { id: "fa_new", signedUrl: "https://s/new" } }]);

    const onValid = vi.fn().mockResolvedValue(undefined);
    let api!: Parameters<NonNullable<React.ComponentProps<typeof Harness>["onCapture"]>>[0];
    render(
      <Harness
        defaults={{
          // photo is a real File → should upload
          photo: makeFile("p.jpg", "image/jpeg"),
          // cv is already uploaded → should skip
          cv: { id: "fa_existing", signedUrl: "https://s/existing" },
        }}
        onValid={onValid}
        onCapture={(a) => {
          api = a;
        }}
      />,
    );
    await act(async () => {
      await api.submit();
    });

    // Only one fetch — the existing-shape cv was skipped.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(onValid).toHaveBeenCalledTimes(1);
    const submitted = onValid.mock.calls[0][0] as Form;
    expect(submitted.photo).toEqual({ id: "fa_new", signedUrl: "https://s/new" });
    expect(submitted.cv).toEqual({ id: "fa_existing", signedUrl: "https://s/existing" });
  });

  it("calls the handler immediately when no field needs uploading", async () => {
    globalThis.fetch = vi.fn();
    const onValid = vi.fn().mockResolvedValue(undefined);
    let api!: Parameters<NonNullable<React.ComponentProps<typeof Harness>["onCapture"]>>[0];
    render(
      <Harness
        defaults={{ photo: null, cv: null }}
        onValid={onValid}
        onCapture={(a) => {
          api = a;
        }}
      />,
    );
    await act(async () => {
      await api.submit();
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(onValid).toHaveBeenCalledTimes(1);
  });
});

describe("useUploadOnSubmit — failure path", () => {
  it("aborts the submit and sets per-field RHF errors when one upload fails", async () => {
    // photo upload succeeds; cv upload fails.
    mockFetchSequence([
      { ok: true, body: { id: "fa_photo", signedUrl: "https://s/photo" } },
      { ok: false, status: 500, body: { error: "storage_upload_failed", id: "fa_cv" } },
    ]);

    const onValid = vi.fn();
    let api!: Parameters<NonNullable<React.ComponentProps<typeof Harness>["onCapture"]>>[0];
    render(
      <Harness
        defaults={{
          photo: makeFile("p.jpg", "image/jpeg"),
          cv: makeFile("c.pdf", "application/pdf"),
        }}
        onValid={onValid}
        onCapture={(a) => {
          api = a;
        }}
      />,
    );
    await act(async () => {
      await api.submit();
    });

    expect(onValid).not.toHaveBeenCalled();
    expect(api.getFieldError("cv")).toMatchObject({ type: "upload" });
    // photo upload succeeded — value was replaced even though submit aborted,
    // so a retry skips photo and just retries cv.
    const values = api.getValues();
    expect(values.photo).toEqual({ id: "fa_photo", signedUrl: "https://s/photo" });
  });

  it("maps an UploadError thrown by uploadFile through to the per-field error message", async () => {
    mockFetchSequence([
      { ok: false, status: 400, body: { error: "file_too_large" } },
    ]);
    const onValid = vi.fn();
    let api!: Parameters<NonNullable<React.ComponentProps<typeof Harness>["onCapture"]>>[0];
    render(
      <Harness
        defaults={{ photo: makeFile("p.jpg", "image/jpeg"), cv: null }}
        onValid={onValid}
        onCapture={(a) => {
          api = a;
        }}
      />,
    );
    await act(async () => {
      await api.submit();
    });
    expect(onValid).not.toHaveBeenCalled();
    expect(api.getFieldError("photo")).toMatchObject({
      type: "upload",
      message: expect.stringContaining("file_too_large"),
    });
  });
});

describe("UploadError class shape", () => {
  it("carries code + assetId + extends Error", () => {
    const e = new UploadError("storage_upload_failed", "bytes broke", "fa_42");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("UploadError");
    expect(e.code).toBe("storage_upload_failed");
    expect(e.message).toBe("bytes broke");
    expect(e.assetId).toBe("fa_42");
  });
});

// Suppress the "uploading" flag-during-submit text in the harness — keeps
// the test output free of noise from the React 18 act warnings around the
// React.useEffect that captures the api handle.
afterEach(() => {
  if (screen.queryByText("uploading") || screen.queryByText("idle")) {
    // Intentionally empty — node accessed for teardown side effects of jsdom.
  }
});
