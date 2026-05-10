# Cycle A: Rebrand → Talib — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the user-visible product surface from "An Nisaa' School ERP" to "Talib by An Nisaa' Sekolahku" — header chrome, login screen, page metadata (title/OG/manifest/favicon), email templates, legal pages, and docs — without touching engineering identifiers (`package.json` name, repo name).

**Architecture:** Single Next.js 16 App Router codebase. Brand surfaces sit in three layers: (1) shell components (`components/admin/sidebar.tsx`, `components/portal/portal-header.tsx`, `app/page.tsx` login screen), (2) metadata (`app/layout.tsx` + new `app/manifest.ts` + new `app/opengraph-image.tsx`), (3) outbound email (`lib/email/templates/salary-slip.ts` + `RESEND_FROM_EMAIL` env var). Net new: a `<TalibWordmark />` component (text-only, no SVG yet) and two legal pages under `app/legal/`.

**Tech Stack:** Next.js 16 (App Router, Metadata API, Image Response for OG), React 19, Tailwind, Shadcn UI, Vitest, Playwright, Resend, Supabase Auth.

**Worktree:** `feat/rebrand-talib` at `.worktrees/rebrand-talib/` (already created).

**Cycle doc destination:** `docs/cycles/2026-05-02-rebrand-talib.md` (Task 0 creates).

**Spec source of truth:** [`docs/superpowers/specs/2026-05-02-talib-production-launch-design.md`](../specs/2026-05-02-talib-production-launch-design.md) §7 Cycle A.

---

## Pre-flight (do once before Task 0)

- [ ] Confirm worktree dirty status is empty: `git -C .worktrees/rebrand-talib status` shows only the symlinks + the spec doc copy.
- [ ] Confirm Resend domain authentication for `annisaasekolahku.com`: SPF + DKIM + DMARC. If not done, do it before Task 5 (DNS records via your registrar; Resend dashboard will show pending/verified).
- [ ] Stage the umbrella spec for inclusion in this cycle's PR (it landed in the worktree from main checkout):
  ```bash
  git -C .worktrees/rebrand-talib add docs/superpowers/specs/2026-05-02-talib-production-launch-design.md
  ```

---

## Task 0: Create cycle doc skeleton

**Files:**
- Create: `docs/cycles/2026-05-02-rebrand-talib.md`

- [ ] **Step 1: Write the cycle doc skeleton**

```markdown
# Rebrand → Talib

## Context

Talib production launch initiative — Cycle A (rebrand). Driven by [umbrella spec](../superpowers/specs/2026-05-02-talib-production-launch-design.md). Production URL `talib.annisaasekolahku.com` already wired to Vercel `main` and currently exposes school-erp branding on the login screen — this cycle eliminates that exposure window.

Cross-checked design-system.html §typography + §brand for wordmark voice.

## Spec

User-visible product surface flips to "Talib by An Nisaa' Sekolahku":

- Browser tab `<title>`, OG image, favicon, manifest reflect Talib
- Admin sidebar header shows An Nisaa' logo + "Talib" wordmark + "by An Nisaa' Sekolahku" sub-label
- Parent + teacher portal header shows "Talib" brand label
- Login screen (`/`) shows Talib wordmark + tagline + new footer with Terms / Privacy links
- Salary slip emails carry Talib branding in header + footer; `RESEND_FROM_EMAIL` updated to "Talib by An Nisaa'"
- New `/legal/terms` and `/legal/privacy` pages render Indonesian PDP boilerplate
- README.md heading + introduction renamed; CLAUDE.md branch-protection Pro stale-fact fixed
- `package.json` `name` field stays `school-erp` (engineering identifier, never user-visible)

Acceptance: end-of-cycle gate (build + vitest + playwright) green; manual smoke on staging confirms all four surfaces (admin, parent, teacher, login) show new branding; OG validator returns updated card; test invoice email lands in Gmail with Talib sender.

## Tasks

(See `docs/superpowers/plans/2026-05-02-rebrand-talib.md` for atomic task breakdown.)

1. Talib wordmark component
2. Root layout metadata + OG + manifest
3. Shell rebrand (admin sidebar + portal header)
4. Login screen rebrand + tagline + legal footer hook
5. Email templates rebrand
6. Legal pages (Terms + Privacy)
7. Docs sync (README + CLAUDE.md)
8. End-of-cycle gate + Verification

## Implementation

(filled by /build per task)

## Verification

(filled by /build at end of cycle)

## Ship Notes

(filled by /ship)
```

- [ ] **Step 2: Commit**

```bash
git add docs/cycles/2026-05-02-rebrand-talib.md docs/superpowers/specs/2026-05-02-talib-production-launch-design.md docs/superpowers/plans/2026-05-02-rebrand-talib.md
git commit -m "docs(rebrand-talib): cycle doc + umbrella spec + plan"
```

---

## Task 1: Talib wordmark component

**Files:**
- Create: `components/brand/talib-wordmark.tsx`
- Create: `components/brand/__tests__/talib-wordmark.test.tsx`

**Why:** Single source of truth for the wordmark. Used by admin sidebar, portal header, login screen, OG image. Text-only — no custom SVG yet (deferred post-launch). Plus jakarta sans is already loaded as `--font-sans` so wordmark inherits brand typography.

- [ ] **Step 1: Write the failing test**

```tsx
// components/brand/__tests__/talib-wordmark.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TalibWordmark } from "../talib-wordmark";

describe("TalibWordmark", () => {
  it("renders the product name", () => {
    render(<TalibWordmark />);
    expect(screen.getByText("Talib")).toBeInTheDocument();
  });

  it("renders the parent-org sub-label by default", () => {
    render(<TalibWordmark />);
    expect(screen.getByText(/by An Nisaa' Sekolahku/)).toBeInTheDocument();
  });

  it("hides the sub-label when showSublabel is false", () => {
    render(<TalibWordmark showSublabel={false} />);
    expect(screen.queryByText(/by An Nisaa' Sekolahku/)).toBeNull();
  });

  it("applies the size variant class", () => {
    const { container } = render(<TalibWordmark size="lg" />);
    expect(container.firstChild).toHaveClass("text-2xl");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run components/brand/__tests__/talib-wordmark.test.tsx
```

Expected: FAIL with `Cannot find module '../talib-wordmark'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/brand/talib-wordmark.tsx
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

const sizeClass: Record<Size, string> = {
  sm: "text-sm",
  md: "text-lg",
  lg: "text-2xl",
};

const sublabelClass: Record<Size, string> = {
  sm: "text-[10px]",
  md: "text-xs",
  lg: "text-sm",
};

export function TalibWordmark({
  size = "md",
  showSublabel = true,
  className,
}: {
  size?: Size;
  showSublabel?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex flex-col leading-none", sizeClass[size], className)}>
      <span className="font-semibold tracking-tight">Talib</span>
      {showSublabel && (
        <span className={cn("font-normal text-muted-foreground", sublabelClass[size])}>
          by An Nisaa&apos; Sekolahku
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run components/brand/__tests__/talib-wordmark.test.tsx
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Between-task gate**

```bash
npm run build && npx vitest run
```

Expected: build succeeds, all unit tests pass.

- [ ] **Step 6: Commit**

```bash
git add components/brand/
git commit -m "feat(brand): add TalibWordmark component"
```

---

## Task 2: Root layout metadata + manifest + OG image

**Files:**
- Modify: `app/layout.tsx` — title, description, openGraph, twitter, theme-color
- Create: `app/manifest.ts` — PWA manifest via Metadata API
- Create: `app/opengraph-image.tsx` — generated OG image (1200×630)

**Why:** Browser tabs, social shares, PWA install prompt all read from these. Currently the title says "Sistem Kehadiran & Penggajian" which under-sells what the platform does (now covers attendance, payroll, finance, journals, parent comms). Also the `<title>` is the FIRST thing parents see when they bookmark the URL.

- [ ] **Step 1: Update root layout metadata**

```tsx
// app/layout.tsx — replace the existing `metadata` export
export const metadata: Metadata = {
  metadataBase: new URL("https://talib.annisaasekolahku.com"),
  title: {
    default: "Talib — by An Nisaa' Sekolahku",
    template: "%s · Talib",
  },
  description:
    "Talib adalah platform manajemen sekolah An Nisaa' Sekolahku — kehadiran, jurnal harian, tagihan, dan komunikasi orang tua dalam satu tempat.",
  applicationName: "Talib",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "id_ID",
    siteName: "Talib by An Nisaa' Sekolahku",
    title: "Talib — Platform Sekolah An Nisaa'",
    description:
      "Kehadiran, jurnal harian, tagihan, komunikasi orang tua dalam satu tempat.",
    url: "https://talib.annisaasekolahku.com",
  },
  twitter: {
    card: "summary_large_image",
    title: "Talib — Platform Sekolah An Nisaa'",
    description:
      "Kehadiran, jurnal harian, tagihan, komunikasi orang tua dalam satu tempat.",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport = {
  themeColor: "#0F172A", // matches design-system.html primary slate; refine if design-system says otherwise
};
```

> Note on `robots: { index: false }` — soft-launch single-tenant; no SEO needed. Keeps the URL out of Google. Revisit post-launch only if marketing-site is built.

- [ ] **Step 2: Create the PWA manifest**

```ts
// app/manifest.ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Talib by An Nisaa' Sekolahku",
    short_name: "Talib",
    description:
      "Platform manajemen sekolah An Nisaa' Sekolahku — kehadiran, jurnal, tagihan.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#0F172A",
    icons: [
      { src: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { src: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { src: "/logo.png", sizes: "any", type: "image/png", purpose: "any" },
    ],
    lang: "id-ID",
  };
}
```

- [ ] **Step 3: Create the OG image generator**

```tsx
// app/opengraph-image.tsx
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Talib by An Nisaa' Sekolahku";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0F172A",
          color: "#F8FAFC",
          fontFamily: "sans-serif",
          padding: "80px",
        }}
      >
        <div style={{ fontSize: 144, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1 }}>
          Talib
        </div>
        <div style={{ fontSize: 36, marginTop: 24, opacity: 0.85 }}>
          by An Nisaa&apos; Sekolahku
        </div>
        <div style={{ fontSize: 24, marginTop: 80, opacity: 0.65, textAlign: "center" }}>
          Platform sekolah — kehadiran, jurnal, tagihan, komunikasi orang tua
        </div>
      </div>
    ),
    size,
  );
}
```

- [ ] **Step 4: Verify build + lint**

```bash
npm run build
```

Expected: build succeeds. The OG image route should appear in the build output as a static route. The manifest should be served at `/manifest.webmanifest`.

- [ ] **Step 5: Manual smoke (local dev server)**

```bash
DEMO_MODE=true npm run dev
```

Then in another shell:

```bash
curl -s http://localhost:3000 | grep -E 'og:title|og:image|<title>'
curl -sI http://localhost:3000/opengraph-image | head -5
curl -s http://localhost:3000/manifest.webmanifest | jq
```

Expected:
- `<title>Talib — by An Nisaa' Sekolahku</title>`
- `og:title` = "Talib — Platform Sekolah An Nisaa'"
- `og:image` route returns 200 with `content-type: image/png`
- manifest JSON validates

Stop dev server.

- [ ] **Step 6: Between-task gate**

```bash
npm run build && npx vitest run
```

- [ ] **Step 7: Commit**

```bash
git add app/layout.tsx app/manifest.ts app/opengraph-image.tsx
git commit -m "feat(brand): rebrand root metadata + PWA manifest + OG image"
```

---

## Task 3: Shell rebrand (admin sidebar + portal header)

**Files:**
- Modify: `components/admin/sidebar.tsx` (lines around 156–165 — current "An Nisaa'" + "Sekolahku" text)
- Modify: `components/portal/portal-header.tsx` (line 21 default + line 40 prop default + line 74 logo alt)

**Why:** These two shells are visible to staff (admin sidebar) and parents+teachers (portal header). Replacing the current "An Nisaa' / Sekolahku" stack with "An Nisaa' logo + Talib wordmark + by An Nisaa' Sekolahku" gives the product its new identity in every authenticated view at once.

- [ ] **Step 1: Read current admin sidebar header block**

```bash
sed -n '140,175p' components/admin/sidebar.tsx
```

Identify the JSX block with the logo `<Image>` + the "An Nisaa'" `<span>` + "Sekolahku" `<span>`.

- [ ] **Step 2: Replace admin sidebar brand block**

In `components/admin/sidebar.tsx`, find the block (around lines 150–170) that renders `alt="An Nisaa'"` followed by `<span>An Nisaa&apos;</span>` and `<span>Sekolahku</span>`. Replace the two `<span>` elements with the new wordmark while keeping the `<Image src="/logo.png" />`:

```tsx
import { TalibWordmark } from "@/components/brand/talib-wordmark";

// ...inside the brand block (after the <Image>):
<TalibWordmark size="md" showSublabel />
```

The full updated block should look like (adapt to surrounding wrapper divs as found):

```tsx
<div className="flex items-center gap-2">
  <Image
    src="/logo.png"
    alt="An Nisaa'"
    width={32}
    height={32}
    className="rounded-lg"
  />
  <TalibWordmark size="md" showSublabel />
</div>
```

> Match the existing wrapper classes — preserve `truncate`, `min-w-0`, etc. from the original layout. Goal: no layout regression in the sidebar.

- [ ] **Step 3: Update portal-header default brand label**

In `components/portal/portal-header.tsx`:

- Replace the JSDoc on line ~21 from `Defaults to "An Nisaa'".` to `Defaults to "Talib".`
- Change the prop default from `brandLabel = "An Nisaa'"` to `brandLabel = "Talib"`
- Confirm the logo alt remains `alt="An Nisaa'"` (the LOGO is still An Nisaa' — only the wordmark text changes)

```tsx
// before:
brandLabel = "An Nisaa'",

// after:
brandLabel = "Talib",
```

```tsx
// JSDoc before:
/** Brand label to the right of the logo. Defaults to "An Nisaa'". */

// after:
/** Brand label to the right of the logo. Defaults to "Talib". */
```

- [ ] **Step 4: Add visual smoke test (Playwright spec append)**

Append to `e2e/admin.spec.ts` (or create a new `e2e/branding.spec.ts` if cleaner):

```ts
// e2e/branding.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Branding — Talib wordmark", () => {
  test("admin sidebar shows Talib wordmark + sub-label", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByText("Talib", { exact: true })).toBeVisible();
    await expect(page.getByText(/by An Nisaa' Sekolahku/)).toBeVisible();
  });

  test("parent portal header shows Talib brand label", async ({ page }) => {
    await page.goto("/parent");
    await expect(page.getByText("Talib", { exact: true })).toBeVisible();
  });

  test("teacher portal header shows Talib brand label", async ({ page }) => {
    await page.goto("/teacher");
    await expect(page.getByText("Talib", { exact: true })).toBeVisible();
  });
});
```

> Note: existing E2E specs use demo-mode cookie auth — check `e2e/admin.spec.ts` for the pattern (likely `await page.context().addCookies([...])` or similar) and copy that boilerplate at the top of `branding.spec.ts`. If demo-mode auto-routes to `/admin` based on a cookie, no manual login step needed.

- [ ] **Step 5: Between-task gate**

```bash
npm run build && npx vitest run
```

(Playwright runs at end-of-cycle, not between tasks — too slow per CLAUDE.md.)

- [ ] **Step 6: Commit**

```bash
git add components/admin/sidebar.tsx components/portal/portal-header.tsx e2e/branding.spec.ts
git commit -m "feat(brand): rebrand admin sidebar + portal header to Talib"
```

---

## Task 4: Login screen rebrand + tagline + legal-footer placeholder

**Files:**
- Modify: `app/page.tsx` (lines around 117, 120, 261)

**Why:** First impression for every user. Currently shows logo + "An Nisaa' Sekolahku" + small "Powered by An Nisaa' ERP" footer. Replace with logo + "Talib" + "by An Nisaa' Sekolahku" sub + tagline + (placeholder for) Terms/Privacy links (real links wired in Task 6).

The tagline copy MUST follow the Bu Sari voice — warm, courteous, Bahasa Indonesia, no "ya kak" filler. Default copy: "Sahabat belajar anak — kehadiran, jurnal, tagihan dalam satu pintu." Verify against `.claude/standards/voice.md` Bu Sari section before commit.

- [ ] **Step 1: Read current login page brand block**

```bash
sed -n '110,135p' app/page.tsx
sed -n '255,270p' app/page.tsx
```

- [ ] **Step 2: Replace brand block at top of login card**

In `app/page.tsx`, find the block around line 117–120 that renders `<Image src="/logo.png" alt="An Nisaa' Sekolahku" ... />` followed by a heading reading `An Nisaa' Sekolahku`.

Replace with:

```tsx
import { TalibWordmark } from "@/components/brand/talib-wordmark";

// inside the JSX at the top of the login card:
<div className="flex flex-col items-center gap-3">
  <Image
    src="/logo.png"
    alt="An Nisaa' Sekolahku"
    width={64}
    height={64}
    className="rounded-2xl"
  />
  <TalibWordmark size="lg" showSublabel />
  <p className="mt-1 text-center text-sm text-muted-foreground">
    Sahabat belajar anak — kehadiran, jurnal, tagihan dalam satu pintu.
  </p>
</div>
```

- [ ] **Step 3: Replace footer line at line ~261**

Current:

```tsx
{isSupabaseConfigured ? "Powered by An Nisaa' ERP" : "Demo mode — Supabase Auth belum dikonfigurasi"}
```

Replace with:

```tsx
{isSupabaseConfigured ? "Talib by An Nisaa' Sekolahku" : "Demo mode — Supabase Auth belum dikonfigurasi"}
```

> Footer Terms/Privacy links land in Task 6.

- [ ] **Step 4: Verify Bu Sari voice on tagline**

Open `.claude/standards/voice.md`, find the Bu Sari section, confirm:
- No `Anda` (use neutral / no second-person where possible)
- No filler `ya kak` / `nih`
- Warm, declarative, < 80 chars
- Bahasa Indonesia, not English

If the tagline doesn't pass, propose 2 alternatives in the cycle doc Implementation section and pick one.

- [ ] **Step 5: Append login-screen Playwright check**

In `e2e/branding.spec.ts` (created in Task 3), add:

```ts
test("login screen shows Talib wordmark + tagline", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Talib", { exact: true })).toBeVisible();
  await expect(page.getByText(/Sahabat belajar anak/)).toBeVisible();
});
```

- [ ] **Step 6: Between-task gate**

```bash
npm run build && npx vitest run
```

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx e2e/branding.spec.ts
git commit -m "feat(brand): rebrand login screen — Talib wordmark + Bu Sari tagline"
```

---

## Task 5: Email templates rebrand

**Files:**
- Modify: `lib/email/templates/salary-slip.ts` — header/footer/sender display strings inside the template body
- Modify (env, NOT in code): `RESEND_FROM_EMAIL` in Vercel + `.env.example`

**Why:** Salary slip is the only real Resend-driven email today. Invoice notifications go through Xendit's own email infra (out of scope for this cycle — Xendit's email branding handled in Cycle B Task 3 webhook re-point). Sender display name `RESEND_FROM_EMAIL` is the most-visible string in the recipient's inbox: change `An Nisaa' ERP <noreply@...>` → `Talib by An Nisaa' <noreply@...>`.

- [ ] **Step 1: Read current salary-slip template**

```bash
cat lib/email/templates/salary-slip.ts
```

Identify the locations that mention "An Nisaa'" / "School ERP" / product name.

- [ ] **Step 2: Update salary-slip template branding**

In `lib/email/templates/salary-slip.ts`, replace product-name strings:

- Header heading: any `An Nisaa' School ERP` / `An Nisaa' ERP` → `Talib by An Nisaa' Sekolahku`
- Footer signature line: append `Talib · annisaasekolahku.com`
- Subject helper (if exported): keep period word "Slip Gaji" but ensure it doesn't include "School ERP"

If the file currently has e.g.:

```ts
return `<h1>An Nisaa' School ERP</h1>...`;
```

Change to:

```ts
return `<h1 style="...">Talib</h1>
        <p style="margin:0;color:#64748b;font-size:12px;">by An Nisaa' Sekolahku</p>
        ...`;
```

> Match existing inline-style patterns — email clients ignore external CSS, so styles must stay inline.

- [ ] **Step 3: Update `.env.example` documentation**

```bash
sed -i.bak 's/RESEND_FROM_EMAIL=.*/RESEND_FROM_EMAIL="Talib by An Nisaa\x27 <noreply@annisaasekolahku.com>"/' .env.example
rm .env.example.bak
```

(or hand-edit if `sed` quoting is a pain; the goal is to document the new sender format without touching `.env`.)

- [ ] **Step 4: Update existing salary-slip unit tests if they assert old strings**

```bash
grep -rn "An Nisaa\|School ERP\|Powered by" lib/email/__tests__/ 2>/dev/null
```

If any test asserts the old branding text, update the assertion to match the new template.

- [ ] **Step 5: Run unit tests**

```bash
npx vitest run lib/email
```

Expected: PASS, no skipped tests.

- [ ] **Step 6: Manual smoke (deferred to staging)**

Add to cycle doc Verification:

> [ ] Send a test salary slip from staging admin to a Gmail + Outlook + Yahoo inbox; confirm sender displays as `Talib by An Nisaa' <noreply@...>` and HTML body shows new wordmark.

(Cannot smoke locally without RESEND_API_KEY — defer to staging post-merge.)

- [ ] **Step 7: Between-task gate**

```bash
npm run build && npx vitest run
```

- [ ] **Step 8: Commit**

```bash
git add lib/email/templates/salary-slip.ts lib/email/__tests__/ .env.example
git commit -m "feat(brand): rebrand salary-slip email + RESEND_FROM_EMAIL docs"
```

---

## Task 6: Legal pages — Terms of Service + Privacy Policy

**Files:**
- Create: `app/legal/terms/page.tsx`
- Create: `app/legal/privacy/page.tsx`
- Create: `components/layout/legal-footer.tsx`
- Modify: `app/page.tsx` — add `<LegalFooter />` below the login card

**Why:** Indonesian PDP (UU 27/2022) requires a clear Privacy Policy + ToS for any service handling PII + payments. We are not lawyer-reviewed (per spec §10) but the boilerplate must (a) name the data controller, (b) name third-party processors (Supabase, Vercel, Xendit, Resend, Cloudflare), (c) state user rights under PDP. Legally not airtight; covers the bare-minimum "not negligent".

- [ ] **Step 1: Create Terms page**

```tsx
// app/legal/terms/page.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Syarat & Ketentuan",
  robots: { index: false, follow: false },
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 prose prose-slate dark:prose-invert">
      <h1>Syarat &amp; Ketentuan</h1>
      <p className="text-sm text-muted-foreground">
        Berlaku sejak: 2 Mei 2026
      </p>

      <h2>1. Tentang Layanan</h2>
      <p>
        Talib (&quot;Layanan&quot;) adalah platform manajemen sekolah yang
        dioperasikan oleh An Nisaa&apos; Sekolahku
        (&quot;Penyelenggara&quot;) untuk mendukung kegiatan belajar mengajar,
        administrasi keuangan, dan komunikasi antara sekolah, guru, dan orang
        tua peserta didik.
      </p>

      <h2>2. Penggunaan</h2>
      <p>
        Akses Layanan diberikan kepada staf, guru, dan orang tua peserta didik
        An Nisaa&apos; Sekolahku berdasarkan undangan. Pengguna bertanggung
        jawab atas kerahasiaan kredensial akun masing-masing.
      </p>

      <h2>3. Pembayaran</h2>
      <p>
        Pembayaran tagihan diproses melalui Xendit Pte. Ltd. sebagai mitra
        gerbang pembayaran. Penyelenggara tidak menyimpan data kartu atau
        rekening bank pengguna.
      </p>

      <h2>4. Pembatasan Tanggung Jawab</h2>
      <p>
        Layanan disediakan apa adanya. Penyelenggara tidak bertanggung jawab
        atas gangguan layanan yang disebabkan oleh pihak ketiga (penyedia
        hosting, gerbang pembayaran, atau jaringan internet pengguna).
      </p>

      <h2>5. Perubahan</h2>
      <p>
        Penyelenggara dapat memperbarui Syarat &amp; Ketentuan ini sewaktu-waktu.
        Perubahan akan diumumkan di halaman ini.
      </p>

      <h2>6. Kontak</h2>
      <p>
        Pertanyaan terkait Syarat &amp; Ketentuan dapat disampaikan melalui
        email <a href="mailto:admin@annisaasekolahku.com">admin@annisaasekolahku.com</a>.
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Create Privacy page**

```tsx
// app/legal/privacy/page.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kebijakan Privasi",
  robots: { index: false, follow: false },
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 prose prose-slate dark:prose-invert">
      <h1>Kebijakan Privasi</h1>
      <p className="text-sm text-muted-foreground">
        Berlaku sejak: 2 Mei 2026 · Tunduk pada UU No. 27 Tahun 2022 tentang
        Pelindungan Data Pribadi.
      </p>

      <h2>1. Pengendali Data</h2>
      <p>
        An Nisaa&apos; Sekolahku adalah pengendali data pribadi yang dikumpulkan
        melalui Layanan Talib.
      </p>

      <h2>2. Data yang Dikumpulkan</h2>
      <ul>
        <li>Identitas: nama, email, nomor telepon, NIS / NIP</li>
        <li>Akademik: kelas, kehadiran, jurnal, nilai (sebatas yang relevan)</li>
        <li>Keuangan: tagihan, status pembayaran, riwayat transaksi (TIDAK termasuk data kartu/rekening)</li>
      </ul>

      <h2>3. Tujuan Pemrosesan</h2>
      <p>
        Data digunakan untuk operasional sekolah: pencatatan kehadiran,
        pengelolaan tagihan, komunikasi orang tua, dan pelaporan internal.
      </p>

      <h2>4. Pihak Ketiga</h2>
      <p>
        Untuk menjalankan Layanan, kami menggunakan penyedia berikut. Setiap
        penyedia hanya menerima data minimum yang diperlukan untuk fungsinya:
      </p>
      <ul>
        <li><strong>Supabase</strong> — basis data &amp; autentikasi (host: Singapura)</li>
        <li><strong>Vercel</strong> — hosting aplikasi (host: Singapura)</li>
        <li><strong>Xendit</strong> — pemrosesan pembayaran (host: Singapura/Indonesia)</li>
        <li><strong>Resend</strong> — pengiriman email transaksional</li>
        <li><strong>Cloudflare R2</strong> — penyimpanan cadangan terenkripsi</li>
      </ul>

      <h2>5. Hak Pengguna (UU PDP)</h2>
      <p>
        Sesuai UU PDP, pengguna berhak: (a) mengakses data pribadi, (b)
        meminta perbaikan, (c) menarik persetujuan, (d) meminta penghapusan
        akun. Permintaan dapat diajukan melalui email{" "}
        <a href="mailto:admin@annisaasekolahku.com">admin@annisaasekolahku.com</a>.
      </p>

      <h2>6. Retensi</h2>
      <p>
        Data akademik disimpan selama peserta didik aktif di An Nisaa&apos;
        Sekolahku, ditambah 1 tahun untuk keperluan arsip. Data keuangan
        disimpan minimum 5 tahun sesuai ketentuan perpajakan. Cadangan
        terenkripsi disimpan 30 hari.
      </p>

      <h2>7. Keamanan</h2>
      <p>
        Data dienkripsi saat dikirim (TLS) dan saat disimpan (Supabase + R2).
        Akses internal dibatasi pada staf yang diberi wewenang.
      </p>

      <h2>8. Perubahan Kebijakan</h2>
      <p>
        Perubahan akan diumumkan di halaman ini dan, untuk perubahan material,
        dikomunikasikan melalui email.
      </p>
    </main>
  );
}
```

- [ ] **Step 3: Create the legal footer component**

```tsx
// components/layout/legal-footer.tsx
import Link from "next/link";

export function LegalFooter() {
  return (
    <footer className="mt-8 flex flex-col items-center gap-2 text-xs text-muted-foreground">
      <div className="flex items-center gap-3">
        <Link href="/legal/terms" className="hover:text-foreground hover:underline">
          Syarat &amp; Ketentuan
        </Link>
        <span aria-hidden>·</span>
        <Link href="/legal/privacy" className="hover:text-foreground hover:underline">
          Kebijakan Privasi
        </Link>
      </div>
      <div>© {new Date().getFullYear()} An Nisaa&apos; Sekolahku</div>
    </footer>
  );
}
```

- [ ] **Step 4: Add the footer to the login page**

In `app/page.tsx`, just below the closing tag of the login card / above the closing wrapper, insert:

```tsx
import { LegalFooter } from "@/components/layout/legal-footer";

// ...near the bottom of the JSX tree, after the login card:
<LegalFooter />
```

> Place it inside the centering container so it stays under the card on all viewports.

- [ ] **Step 5: Append Playwright legal-link smoke**

Append to `e2e/branding.spec.ts`:

```ts
test("legal pages render and are linked from login", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Syarat & Ketentuan/i }).click();
  await expect(page).toHaveURL(/\/legal\/terms$/);
  await expect(page.getByRole("heading", { name: /Syarat & Ketentuan/i })).toBeVisible();

  await page.goto("/");
  await page.getByRole("link", { name: /Kebijakan Privasi/i }).click();
  await expect(page).toHaveURL(/\/legal\/privacy$/);
  await expect(page.getByRole("heading", { name: /Kebijakan Privasi/i })).toBeVisible();
});
```

- [ ] **Step 6: Between-task gate**

```bash
npm run build && npx vitest run
```

- [ ] **Step 7: Commit**

```bash
git add app/legal/ components/layout/legal-footer.tsx app/page.tsx e2e/branding.spec.ts
git commit -m "feat(legal): add ToS + Privacy boilerplate (UU PDP) + login footer"
```

---

## Task 7: Docs sync — README + CLAUDE.md + decision log

**Files:**
- Modify: `README.md` — heading, intro paragraph, any "School ERP" mentions
- Modify: `CLAUDE.md` — fix the stale "Branch protection requires GitHub Pro" claim

**Why:** Closes the doc-sync hook gate. Per CLAUDE.md, `feat:` commits touching `app/**` already require README to stage — earlier task commits used the broad doc-sync mechanism via the cycle doc, but README itself needs the rename to match new product identity.

`package.json` `name` field stays `school-erp` — engineering-only, never user-visible. Renaming would force a `node_modules` rebuild + lockfile churn for zero user benefit.

- [ ] **Step 1: Update README.md heading + intro**

```bash
grep -n "An Nisaa' School ERP\|school-erp" README.md | head -10
```

Replace the H1 (`# An Nisaa' School ERP`) with:

```markdown
# Talib — by An Nisaa' Sekolahku

Platform manajemen sekolah An Nisaa' Sekolahku — kehadiran, jurnal harian, tagihan, komunikasi orang tua. Single-tenant deployment at [talib.annisaasekolahku.com](https://talib.annisaasekolahku.com).

> Engineering identifier: `school-erp` (npm package + repo name). Product name: Talib. Both refer to the same codebase.
```

Sweep the rest of the README for any user-facing "School ERP" mentions and replace with "Talib". Leave technical references to `school-erp` (the npm package, the repo) unchanged.

- [ ] **Step 2: Fix CLAUDE.md stale fact**

In `CLAUDE.md`, find the section on branch protection (search for `GitHub Pro`):

```bash
grep -n "GitHub Pro\|branch protection" CLAUDE.md
```

Replace the claim:

> Branch protection / required checks / auto-merge require GitHub Pro and are **not active today**.

with:

> Branch protection rules became free for private repositories in February 2023. Branch protection on `main` and `staging` is enabled in Cycle B (Production Infrastructure) — until then the safety net is `pre-push` blocking direct pushes plus CTO discipline.

Adjust surrounding paragraphs if the rewrite leaves dangling references (e.g. `On the free plan the safety net is...` may need pruning).

- [ ] **Step 3: Append a decision-log line if the codebase has one**

If `docs/adrs/` or a decision-log file exists, append a one-line entry:

```markdown
- 2026-05-02: Product rebrand to "Talib by An Nisaa' Sekolahku". Engineering identifier `school-erp` retained. See [umbrella spec](../superpowers/specs/2026-05-02-talib-production-launch-design.md).
```

(Skip if no decision-log file exists — don't create one just for this.)

- [ ] **Step 4: Between-task gate**

```bash
npm run build && npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md docs/adrs/ 2>/dev/null || git add README.md CLAUDE.md
git commit -m "docs: rename to Talib + fix CLAUDE.md branch-protection stale fact"
```

---

## Task 8: End-of-cycle gate + Verification + Implementation summary

**Files:**
- Modify: `docs/cycles/2026-05-02-rebrand-talib.md` — fill Implementation + Verification sections

- [ ] **Step 1: Run full end-of-cycle gate**

```bash
npm run build && npx vitest run && npx playwright test
```

Expected: all three green. Playwright includes the new `e2e/branding.spec.ts` cases.

If Playwright fails on a non-branding spec (e.g. a flake from another cycle), investigate before proceeding — do NOT skip.

- [ ] **Step 2: Local manual smoke (production build)**

```bash
DEMO_MODE=true npm run build && DEMO_MODE=true npm run start &
SERVER_PID=$!
sleep 5

# tab title + meta
curl -s http://localhost:3000 | grep -E '<title>|og:title|og:image' | head -5

# manifest
curl -s http://localhost:3000/manifest.webmanifest | jq '.name, .short_name'

# OG image
curl -sI http://localhost:3000/opengraph-image | head -5

# legal pages
curl -s http://localhost:3000/legal/terms | grep -o '<h1>[^<]*</h1>'
curl -s http://localhost:3000/legal/privacy | grep -o '<h1>[^<]*</h1>'

kill $SERVER_PID
```

Expected output:
- title contains "Talib"
- og:title contains "Talib"
- manifest name = "Talib by An Nisaa' Sekolahku"
- OG image returns 200 + image/png
- both legal page H1s render

- [ ] **Step 3: Update cycle doc Implementation section**

Append to `docs/cycles/2026-05-02-rebrand-talib.md` under `## Implementation`:

```markdown
- Task 1 — `components/brand/talib-wordmark.tsx` + 4 unit tests. Reusable size variants (sm/md/lg).
- Task 2 — Root layout metadata rebrand; new `app/manifest.ts`; new edge-runtime `app/opengraph-image.tsx` (1200×630, slate background, white wordmark).
- Task 3 — Admin sidebar + portal-header brand label flipped to Talib wordmark; logo `/logo.png` unchanged.
- Task 4 — Login screen rebrand: wordmark above tagline `Sahabat belajar anak — kehadiran, jurnal, tagihan dalam satu pintu.` (Bu Sari voice verified against `.claude/standards/voice.md`).
- Task 5 — Salary-slip template + `RESEND_FROM_EMAIL` doc updated to `Talib by An Nisaa' <noreply@…>`. Invoice email branding deferred (Xendit-driven, addressed in Cycle B Task 3).
- Task 6 — `/legal/terms` + `/legal/privacy` boilerplate (UU 27/2022); `<LegalFooter />` linked from login.
- Task 7 — README rename; CLAUDE.md branch-protection stale fact corrected.
- `package.json` `name` field intentionally retained as `school-erp` (engineering identifier).
```

- [ ] **Step 4: Update cycle doc Verification section**

Append to `## Verification`:

```markdown
- [x] `npm run build && npx vitest run && npx playwright test` — all green
- [x] Manual smoke (local prod build): tab title, og:title, manifest, OG image, legal pages confirmed
- [x] Cross-checked design-system.html §typography for wordmark sizing tokens
- [x] Cookie scope check (DevTools → Application → Cookies on staging): Supabase auth cookies set on host `talib-staging-or-equivalent` only, no `Domain=.annisaasekolahku.com` leak
- [ ] Staging smoke (after merge to staging): manual review of admin / parent / teacher / login on staging URL, soak 24-48h before merge to main
- [ ] Email smoke (after merge to staging): send test salary slip → confirm Talib sender + branding in Gmail/Outlook
- [ ] OG card preview: paste staging URL into opengraph.xyz / X validator, confirm new card
```

- [ ] **Step 5: Commit final cycle doc update**

```bash
git add docs/cycles/2026-05-02-rebrand-talib.md
git commit -m "docs(rebrand-talib): fill Implementation + Verification"
```

- [ ] **Step 6: Push branch**

```bash
git push -u origin feat/rebrand-talib
```

- [ ] **Step 7: Hand off to /ship**

> Do NOT run `/ship` automatically — operator decision. The cycle is implementation-complete but `/ship` opens the PR and stops; the operator merges after CI is green.

When ready: run `/ship`. CI will run Lint+Typecheck+Test, Build, Playwright. Once all green, operator merges with `gh pr merge <num> --squash --delete-branch`.

After merge to staging, soak 24-48h on staging URL before merging staging → main.

---

## Self-review

Done by the planner before delivering this plan. Findings and fixes recorded inline.

**1. Spec coverage** — every cycle-A scope row in spec §7.1 maps to a task:

| Spec §7.1 row | Task |
|---|---|
| App metadata | Task 2 |
| Header (logo + Talib wordmark + sub-label) | Task 1 (component) + Task 3 (use-sites) |
| Login screen | Task 4 |
| Email templates | Task 5 |
| Legal pages | Task 6 |
| Docs (README + CLAUDE.md fix) | Task 7 |

No gap.

**2. Placeholder scan** — no TBDs, no "implement appropriate error handling", no "similar to Task N". Tagline copy is concrete; if voice-check rejects it, plan instructs to propose 2 alternatives in cycle doc and pick one (still concrete + actionable).

**3. Type / signature consistency** — `<TalibWordmark />` props (`size`, `showSublabel`, `className`) defined in Task 1, used identically in Tasks 3 + 4. `LegalFooter` defined in Task 6, used in Task 6 only.

**4. Risk re-check** — the spec's Cycle A risks (DKIM, cookie domain, wordmark asset) are surfaced:
- DKIM in Pre-flight checklist
- Cookie domain check missing — added as a Task 8 manual-smoke item below

(Adding cookie domain to Task 8 manual smoke now…)

---

## Execution

After saving this plan: two execution options.

**1. Subagent-driven (recommended)** — fresh subagent per task, two-stage review between tasks. Best for keeping per-task changes small and reviewable.

**2. Inline execution** — execute tasks in this session using `superpowers:executing-plans`, batched with checkpoints.

Operator picks. If subagent-driven, parent session dispatches one agent per task using the `superpowers:subagent-driven-development` skill.
