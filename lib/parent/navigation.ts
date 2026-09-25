/** Parent URLs carry only a guardian-linked child between destinations. */
export function resolveParentChildId(
  childIds: readonly string[],
  requested: string | null | undefined,
): string | null {
  if (childIds.length === 0) return null;
  return requested && childIds.includes(requested) ? requested : childIds[0]!;
}

export function parentHref(
  pathname: string,
  childId?: string | null,
  localParams?: Record<string, string | null | undefined>,
): string {
  const params = new URLSearchParams();
  if (childId) params.set("child", childId);
  for (const [key, value] of Object.entries(localParams ?? {})) {
    if (key !== "child" && key !== "invoice" && key !== "paymentStatus" && key !== "xenditStatus" && value) {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function parentHrefWithChild(
  pathname: string,
  searchParams: Pick<URLSearchParams, "get">,
  childIds: readonly string[],
): string {
  return parentHref(pathname, resolveParentChildId(childIds, searchParams.get("child")));
}
