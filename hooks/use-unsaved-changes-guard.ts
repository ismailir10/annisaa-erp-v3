"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Pending = { kind: "href"; href: string } | { kind: "back" } | null;

/**
 * Warns before unsaved input is thrown away (TCH-2).
 *
 * Next's App Router has no route-change veto, so the three ways out of a page
 * are covered separately:
 *
 * - **Reload / close tab / external link** — the native `beforeunload` prompt.
 * - **In-app link** (bottom nav, header, back links) — a capture-phase click
 *   listener that swallows the click and raises `pending`, which the caller
 *   renders as a confirm dialog. `confirmLeave` then performs the navigation.
 * - **Back button / gesture** — while dirty, one sentinel history entry sits on
 *   top of the page; Back lands on the same page, which we treat as "asked to
 *   leave", re-arm the sentinel and raise `pending`. `confirmLeave` steps back
 *   over the sentinel and the real entry. Once the page is clean again the
 *   sentinel is consumed so Back is a single step like anywhere else.
 *
 * Nothing here blocks anything when `dirty` is false.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(null);
  const dirtyRef = useRef(dirty);
  const sentinelActive = useRef(false);
  // Set right before we navigate away ourselves, so our own exit is not vetoed.
  const leaving = useRef(false);
  // Set when we call history.back() to consume the sentinel: that popstate is ours.
  const consumingSentinel = useRef(false);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // Reload / close / external navigation.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (leaving.current) return;
      event.preventDefault();
      // Legacy browsers only show the prompt when returnValue is set.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // In-app links.
  useEffect(() => {
    if (!dirty) return;
    const onClick = (event: MouseEvent) => {
      if (leaving.current || event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return; // beforeunload covers it
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setPending({ kind: "href", href: `${url.pathname}${url.search}${url.hash}` });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty]);

  // Back button / gesture.
  useEffect(() => {
    if (dirty) {
      if (!sentinelActive.current) {
        window.history.pushState(window.history.state, "", window.location.href);
        sentinelActive.current = true;
      }
      const onPopState = () => {
        if (consumingSentinel.current || leaving.current || !dirtyRef.current) return;
        // Back took us off the sentinel onto the real entry: put it back and ask.
        window.history.pushState(window.history.state, "", window.location.href);
        setPending({ kind: "back" });
      };
      window.addEventListener("popstate", onPopState);
      return () => window.removeEventListener("popstate", onPopState);
    }
    if (sentinelActive.current) {
      sentinelActive.current = false;
      consumingSentinel.current = true;
      const clear = () => {
        consumingSentinel.current = false;
        window.removeEventListener("popstate", clear);
      };
      window.addEventListener("popstate", clear);
      window.history.back();
    }
  }, [dirty]);

  const stay = useCallback(() => setPending(null), []);

  const confirmLeave = useCallback(() => {
    const target = pending;
    setPending(null);
    if (!target) return;
    leaving.current = true;
    if (target.kind === "href") {
      // While the sentinel is on top, replace it: pushing would leave a second
      // copy of this page in history that Back from the next page lands on.
      if (sentinelActive.current) router.replace(target.href);
      else router.push(target.href);
    } else {
      // Over the sentinel and the page itself.
      window.history.go(-2);
    }
  }, [pending, router]);

  return { confirmOpen: pending !== null, stay, confirmLeave };
}
