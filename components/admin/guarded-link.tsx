"use client";

import NextLink from "next/link";
import { forwardRef, type ComponentProps, type MouseEvent } from "react";
import { useUnsavedChangesNav } from "@/components/admin/unsaved-changes-provider";

// String hrefs only: the confirm path re-navigates with router.push(href),
// so an object href (pathname + query) would have to be re-serialised — every
// app-shell caller already passes a string, so the type rules the gap out.
type GuardedLinkProps = Omit<ComponentProps<typeof NextLink>, "href"> & { href: string };

/**
 * Drop-in replacement for next/link's `<Link>` for app-shell navigation
 * (sidebar items, breadcrumb links) — same props, rendered the same way via
 * base-ui's `render` prop. While any page has registered a dirty
 * `useUnsavedChangesGuard`, a plain left-click is intercepted: preventDefault
 * and the shared ConfirmDialog opens instead of navigating. Modifier-clicks
 * (ctrl/cmd/shift/alt), non-primary buttons and `target="_blank"` are left
 * alone so opening in a new tab/window still works untouched.
 */
export const GuardedLink = forwardRef<HTMLAnchorElement, GuardedLinkProps>(function GuardedLink(
  { href, onClick, target, ...rest },
  ref,
) {
  const nav = useUnsavedChangesNav();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      target === "_blank"
    ) {
      return;
    }
    if (nav?.requestNavigation(href)) {
      event.preventDefault();
    }
  }

  return <NextLink ref={ref} href={href} target={target} onClick={handleClick} {...rest} />;
});
