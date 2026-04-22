"use client";

/**
 * Admin-namespaced re-export of Shadcn `<Tabs>` primitives.
 *
 * Currently a passthrough — the admin portal is happy with Shadcn's
 * default variant (pill on `bg-muted`). The wrapper exists so future
 * admin-wide tab styling changes (spacing, active underline, color
 * tokens) land in one place instead of across every detail page.
 *
 * Consumers that import `AdminTabs*` will automatically pick up any
 * future admin-specific tweak without further per-page edits.
 */

export {
  Tabs as AdminTabs,
  TabsList as AdminTabsList,
  TabsTrigger as AdminTabsTrigger,
  TabsContent as AdminTabsContent,
} from "@/components/ui/tabs";
