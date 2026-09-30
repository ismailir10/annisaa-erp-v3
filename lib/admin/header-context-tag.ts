import { revalidateTag } from "next/cache";

/**
 * Cache tag for the admin shell header (active campuses + academic years),
 * read through `getAdminHeaderContext` in `./header-context`. Kept in its own
 * module so write routes can invalidate it without importing the cached
 * reader (and `unstable_cache`) into every route.
 */
export const ADMIN_HEADER_CONTEXT_TAG = "admin-header-context";

/** Call after any write that can change a campus's or academic year's name or status. */
export function invalidateAdminHeaderContext() {
  revalidateTag(ADMIN_HEADER_CONTEXT_TAG, { expire: 0 });
}
