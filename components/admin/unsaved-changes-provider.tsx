"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type GuardEntry = { dirty: boolean; message?: string };

type UnsavedChangesContextValue = {
  registerGuard: (id: string, dirty: boolean, message?: string) => void;
  unregisterGuard: (id: string) => void;
  /**
   * Called by GuardedLink before it lets a click through. Returns true when
   * some page has unsaved changes and the shared confirm dialog was opened
   * — the caller must preventDefault in that case. Returns false when there
   * is nothing to guard, so navigation proceeds normally.
   */
  requestNavigation: (href: string) => boolean;
};

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

const DEFAULT_MESSAGE = "Perubahan yang belum disimpan akan hilang.";

/**
 * Mounted once in the admin app shell (app/admin/layout.tsx). Holds the set
 * of currently-dirty `useUnsavedChangesGuard` registrations and renders the
 * one shared "Keluar tanpa menyimpan?" ConfirmDialog that app-shell
 * navigation (sidebar links, breadcrumb links, via `GuardedLink`) opens
 * instead of navigating silently.
 */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  // A ref, not state: registering/unregistering a guard must never itself
  // trigger a re-render of every app-shell consumer — only opening the
  // dialog (a genuine click event) needs to.
  const guards = useRef<Map<string, GuardEntry>>(new Map());
  const [pending, setPending] = useState<{ href: string; message?: string } | null>(null);

  const registerGuard = useCallback((id: string, dirty: boolean, message?: string) => {
    if (dirty) {
      guards.current.set(id, { dirty, message });
    } else {
      guards.current.delete(id);
    }
  }, []);

  const unregisterGuard = useCallback((id: string) => {
    guards.current.delete(id);
  }, []);

  const requestNavigation = useCallback((href: string) => {
    const active = [...guards.current.values()].find((g) => g.dirty);
    if (!active) return false;
    setPending({ href, message: active.message });
    return true;
  }, []);

  const value = useMemo<UnsavedChangesContextValue>(
    () => ({ registerGuard, unregisterGuard, requestNavigation }),
    [registerGuard, unregisterGuard, requestNavigation],
  );

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title="Keluar tanpa menyimpan?"
        description={pending?.message ?? DEFAULT_MESSAGE}
        confirmLabel="Ya, Keluar"
        destructive
        onConfirm={() => {
          if (pending) router.push(pending.href);
        }}
      />
    </UnsavedChangesContext.Provider>
  );
}

/**
 * Registers `dirty` as a reason app-shell navigation (sidebar/breadcrumb
 * clicks) should be intercepted. Call unconditionally with the page's own
 * dirty flag — the hook no-ops outside `UnsavedChangesProvider` (e.g. a
 * component test rendered without the app shell).
 *
 * This only guards *app-shell* links via `GuardedLink`; it does not replace
 * a page's own in-editor "leave" confirmation (e.g. a back button), which
 * keeps working unchanged and independently — the two never double-prompt
 * because they intercept different actions.
 */
export function useUnsavedChangesGuard(dirty: boolean, message?: string) {
  const ctx = useContext(UnsavedChangesContext);
  const id = useId();

  useEffect(() => {
    if (!ctx) return;
    ctx.registerGuard(id, dirty, message);
    return () => ctx.unregisterGuard(id);
  }, [ctx, id, dirty, message]);
}

/** Internal — consumed by `GuardedLink` only. */
export function useUnsavedChangesNav() {
  return useContext(UnsavedChangesContext);
}
