# Talib Production Launch — Design

**Date:** 2026-05-02
**Author:** ismailir10 (CTO)
**Status:** Approved umbrella design, awaiting per-cycle `/spec` kickoffs
**Domain:** `talib.annisaasekolahku.com` (DNS already wired to Vercel `main`)

---

## 1. Goal

Take the school-erp codebase to production for An Nisaa' Sekolahku as a single-tenant deployment under the brand "Talib by An Nisaa' Sekolahku". Real money via Xendit prod. Phased user rollout. ASAP timeline.

## 2. Product positioning

- **Product name:** Talib — طالب, "seeker of knowledge", student.
- **Full brand:** "Talib by An Nisaa' Sekolahku".
- **Logo strategy:** existing An Nisaa' logo unchanged. "Talib" rendered as text wordmark next to the logo. Sub-label "by An Nisaa' Sekolahku" on first paint.
- **Scope of tenancy:** schema stays multi-tenant; UX behaves single-tenant. No public signup. No marketing site.
- **Out of scope (forever, for this initiative):** sales to other schools, mobile app, deep analytics, lawyer-reviewed legal docs.

## 3. Hosting + infra decisions

| Layer | Decision | Rationale |
|---|---|---|
| **Hosting** | Vercel, single project, branch-based deploys: `main` → `talib.annisaasekolahku.com` (production env), `staging` branch → existing staging URL (preview env) | Already in place; no migration cost |
| **Vercel plan** | Hobby — accept ToS commercial-use risk, budget Pro upgrade if traffic grows | Cost minimization for soft launch |
| **Database + auth** | Supabase, two separate projects: `school-erp-staging` (existing) and new `talib-prod` | Env isolation; staging migrations cannot corrupt prod |
| **Supabase plan** | Free — accept 500 MB DB cap, 7-day backup retention, no PITR | Cost minimization; mitigated by R2 nightly dump |
| **DR / backup** | GitHub Actions cron nightly `pg_dump` of prod Supabase, GPG-encrypted, uploaded to Cloudflare R2 bucket `talib-backups` (10 GB free) with 30-day retention | Independent of Supabase; encrypted at rest; 30-day window covers Day-8-discovery scenarios |
| **Uptime monitor** | UptimeRobot free, ping `/api/health` every 5min, alert email + WhatsApp | Free; doubles as Supabase keepalive against auto-pause |
| **Observability** | Vercel logs + Supabase logs only — no Sentry | Cost minimization. **Tradeoff accepted:** prod errors require manual log-grep, slower MTTR. Revisit if ops pain |
| **Email transactional** | Resend (already in use for payslips) for invoice emails + invite blast | Single provider; deliverability already proven |
| **Auth invites** | Supabase Auth magic-link via Admin API; Resend SMTP under the hood | Native to platform |
| **Payments** | Xendit prod merchant (creds already wired in Vercel) | Real money on Day 1 |
| **GitHub plan** | Free; enable branch protection on `main` and `staging` | Branch protection on private repos became free Feb 2023; CLAUDE.md note is stale and must be fixed |
| **DNS** | `talib.annisaasekolahku.com` CNAME → Vercel; **already configured** | Currently exposes school-erp branded login screen — Cycle A is therefore time-sensitive |

## 4. Data + user strategy

| Question | Answer |
|---|---|
| Data import method | Manual `prisma/seed-prod.ts` authored from An Nisaa' spreadsheet, run once against prod |
| Historic finance data | None — clean start, only invoices generated from launch onward |
| User onboarding | Phased: staff first (D-day), parents at D+7 after staff soak |
| Invite mechanism | Resend transactional email containing Supabase magic-link |
| First-login flow | Click link → set password → land on portal home |

## 5. Risk + mitigation summary

| Risk | Mitigation |
|---|---|
| `talib.annisaasekolahku.com` exposes `school-erp` branding right now | Cycle A is the next ship; soaks 24-48h on staging then merges to main immediately |
| Vercel Hobby ToS forbids commercial use, suspension possible | Budget Pro upgrade as fallback; keep traffic low; no public marketing |
| Supabase free 500 MB cap | Monitor monthly; trigger Pro upgrade ($25/mo) at 300 MB |
| Supabase auto-pause after 1 week idle | UptimeRobot 5-min ping = keepalive |
| 7-day backup retention with no PITR | Nightly pg_dump to R2 with 30-day retention |
| GPG private key loss = entire R2 backup chain unreadable | Cycle B Task 6 generates keypair + stores private key in 1Password + printed copy in safe; Cycle B Task 9 DR drill verifies restore path end-to-end before launch |
| Vercel env-var contamination (prod scope leaking staging creds or vice versa) | Cycle B Task 2 audits + locks env vars |
| Xendit webhook still pointed at staging | Cycle B Task 3 re-points + tests |
| Cold Resend sender → spam folder | Cycle B verifies SPF + DKIM + DMARC; D-2 deliverability spot-test to Gmail/Outlook/Yahoo |
| Seed errors (wrong fee amount, wrong NIS) | Spreadsheet review with you + dry-run on scratch project + 5-row spot-check before real seed |
| Xendit first real transaction bug | D-2 self-test: Rp 10k payment + refund |
| Staff blocker discovered in Phase 1 → parents already invited | Never pre-announce Phase 2; D+7 go/no-go gate |
| Catastrophic launch failure | Runbook in `docs/runbooks/prod-incident.md`: Vercel rollback, R2 restore, status page |

## 6. Sequencing — three cycles

```
[Cycle A: Rebrand → Talib]
  ↓ ship to staging, soak 24-48h, manual review
  ↓ merge to main → talib URL flips to new look immediately
  ↓
[Cycle B: Production Infrastructure]
  ↓ provision Supabase prod, R2 backup, UptimeRobot, branch protection
  ↓ DR drill, security headers, rate-limit audit
  ↓ smoke: open talib URL, verify clean prod state, no real users yet
  ↓
[Cycle C: Launch Day]
  ↓ author + dry-run seed-prod
  ↓ Xendit real-money smoke (Rp 10k self-test + refund)
  ↓ run seed-prod against prod
  ↓ Phase 1 — staff invite blast
  ↓ 7-day soak + go/no-go gate
  ↓ Phase 2 — parent invite blast
  ↓ 14-day intensive monitoring
  ↓ Postmortem cycle doc
```

**Cycle gating:** previous cycle's PR must be merged to `main` before next cycle's `/spec` runs. No parallel work.

**Each cycle:**
- Gets its own brainstorm before `/spec`
- Gets its own `docs/cycles/YYYY-MM-DD-<slug>.md`
- Gets its own worktree
- Follows the standard 3-step loop (`/spec` → `/build` → `/ship`)

**Calendar estimate:** 2-3 weeks total (A: 1-2d, B: 2-3d, C: 1-2 weeks).

---

## 7. Cycle A — Rebrand → Talib (detailed)

### 7.1 Scope

| Layer | Change |
|---|---|
| App metadata | `<title>`, description, OG image, manifest.json, theme-color, favicon, apple-touch-icon |
| Header | An Nisaa' logo (unchanged) + "Talib" text wordmark + "by An Nisaa' Sekolahku" sub-label |
| Login screen | Copy refresh, tagline (Bu Sari voice check) |
| Email templates | Resend templates: sender display "Talib by An Nisaa'", header logo, footer branding (invoice + payslip + invite) |
| Legal pages | `/legal/terms` + `/legal/privacy` — Indonesian PDP boilerplate, footer link, explicit Xendit data-sharing clause |
| Docs | README.md product name, CLAUDE.md branch-protection-Pro stale-fact fix |

### 7.2 Files (estimated)

- `app/layout.tsx`
- `app/manifest.ts` or `public/manifest.json`
- `app/opengraph-image.tsx`
- `public/favicon.ico`, `public/icon-{192,512}.png`
- `components/layout/header.tsx` (or wherever logo lives)
- `app/(auth)/login/page.tsx`
- `lib/email/templates/*.tsx`
- `lib/email/from.ts`
- `app/legal/terms/page.tsx` (new)
- `app/legal/privacy/page.tsx` (new)
- `components/layout/footer.tsx`
- `README.md`
- `CLAUDE.md`

### 7.3 Tasks (one commit each)

1. Assets + `<TalibWordmark />` component
2. Layout metadata (title, description, OG, manifest, theme-color)
3. Header rebrand (logo + wordmark + sub-label)
4. Login copy + tagline
5. Email templates (sender name + header/footer)
6. Legal pages (Terms + Privacy + footer link)
7. Docs sync (README, CLAUDE.md fix)

Between-task gate: `npm run build && npx vitest run`.

### 7.4 Verification (end-of-cycle gate)

- `npm run build && npx vitest run && npx playwright test` all green
- Manual smoke on staging: home, login, header in admin/teacher/parent
- Browser tab `<title>` correct
- OG preview via opengraph.xyz or X validator
- Test invoice email — sender + branding render in Gmail and Outlook
- `/legal/terms` and `/legal/privacy` render mobile + desktop, footer link works
- design-system.html cross-check (frontend-gate Verification bullet)
- 24-48h soak on staging before merge to main

### 7.5 Risks specific to Cycle A

- **Email DKIM/SPF**: confirm before Task 5 — if Resend not yet authenticated for `annisaasekolahku.com`, deliverability collapses
- **Cookie/session domain**: confirm Supabase Auth uses host-only cookies on `talib.annisaasekolahku.com` (default behavior); avoids accidental sharing with parent org
- **Wordmark asset**: text-only first cycle — designer commission deferred post-launch

---

## 8. Cycle B — Production Infrastructure (sketch)

Full design deferred to Cycle B's own brainstorm. Locking scope here.

### 8.1 Scope

| Area | Tasks |
|---|---|
| Supabase prod | Create `talib-prod` project, run migrations, verify schema parity, configure auth (allowed redirect URLs for `talib.annisaasekolahku.com`, Supabase Auth invite email template = "you're invited to Talib"), enable RLS coverage check via `scripts/verify-rls-coverage.ts` |
| Vercel env split | Audit + lock production-scope env vars; verify no preview-scope leaks |
| Xendit webhook | Re-point dashboard webhook URL → `https://talib.annisaasekolahku.com/api/webhooks/xendit`; test |
| Backup pipeline | GitHub Actions cron `0 17 * * *` UTC (00:00 WIB), `pg_dump` → GPG-encrypt → R2 bucket `talib-backups` with 30-day lifecycle |
| Uptime ping | UptimeRobot account, `/api/health` every 5min, email + WhatsApp alerts |
| Health endpoint | Add `/api/health` if not present; checks Supabase reachability |
| Branch protection | GitHub UI: protect `main` + `staging`; require PR; require CI checks (`Lint, Typecheck & Test`, `Build`, `Playwright E2E`); forbid force-push; no owner bypass |
| Security headers | Audit `proxy.ts` CSP, HSTS, X-Frame-Options, Referrer-Policy; tighten for prod domain |
| Rate limiting | Audit `/api/auth/*` and `/api/webhooks/xendit`; add minimal middleware if missing |
| DR drill | Manual snapshot of prod Supabase; restore to scratch project; verify schema + sample row; document |
| Runbook | `docs/runbooks/prod-incident.md` — rollback steps (Vercel + R2 restore), Xendit webhook re-point, status page |

### 8.2 Tasks

1. Create Supabase `talib-prod` project + run migrations + verify schema
2. Audit + lock Vercel env vars (production scope)
3. Update Xendit dashboard webhook URL + sandbox test
4. Add `/api/health` endpoint
5. Configure UptimeRobot
6. R2 bucket + GitHub Actions backup workflow + GPG keypair
7. GitHub branch protection on `main` + `staging`
8. Security headers + rate-limit audit + tighten
9. DR drill — restore staging backup to scratch project, document
10. Write `docs/runbooks/prod-incident.md`

### 8.3 Verification

- All 10 tasks gate-green
- Supabase prod schema matches staging (`prisma migrate diff` empty)
- Vercel env-var audit log: prod scope = prod creds only, no preview-scope leaks
- Xendit sandbox webhook test: arrives at prod URL, handled correctly
- R2 backup: first nightly run succeeds; encrypted blob present
- DR drill: restore succeeded; runbook accurate
- UptimeRobot: 24h of green pings before Cycle C
- Branch protection: direct push to main rejected

---

## 9. Cycle C — Launch Day (sketch)

Mostly procedural. Own brainstorm before kickoff.

### 9.1 Phases

| Phase | Action |
|---|---|
| **D-7** | Author `prisma/seed-prod.ts` from An Nisaa' spreadsheet (org config, academic year, classes, fee schedules) — pair session |
| **D-3** | Dry-run seed against scratch Supabase project; verify rows; drop scratch |
| **D-2** | Real-money smoke: 1 prod invoice for self → pay Rp 10k via Xendit prod → verify webhook → invoice flips to PAID → refund |
| **D-1** | Run `seed-prod.ts` against prod Supabase; spot-check 5 students, 3 classes, 1 fee schedule |
| **D-day** | Phase 1 staff invite blast (~10-20 staff: principal, admin, teachers) via Resend + Supabase magic-link |
| **D+1 to D+6** | Staff training; daily log review; hotfix blockers |
| **D+7 gate** | Go/no-go decision: staff feedback green? Zero P0 blocker in 7 days? |
| **D+7** | Phase 2 parent invite blast (stagger 100/hr if list large) |
| **D+7 to D+21** | Intensive monitoring; UptimeRobot alerts; daily Vercel log review |
| **D+21** | Postmortem cycle doc — wins, breaks, deferrals |

### 9.2 Tasks

1. Author `prisma/seed-prod.ts`
2. Dry-run seed on scratch project
3. Xendit prod real-money smoke (Rp 10k self-test + refund)
4. Run `seed-prod.ts` against prod Supabase
5. Phase 1 staff invite blast
6. Phase 1 monitor (7-day soak)
7. Go/no-go decision
8. Phase 2 parent invite blast
9. Monitor (14-day intensive)
10. Postmortem cycle doc

### 9.3 Success criteria

- Seed dry-run produces exactly N expected rows per table
- Real-money smoke: payment → webhook → PAID flip within 60s
- Phase 1: ≥ 80% of staff log in within 48h
- Phase 1 → 2 gate: zero P0 blocker (login fail, payment fail, cross-org leak)
- Phase 2: ≥ 60% of parents log in within 7 days
- Zero data-loss incidents during 21-day window
- R2 backups verified daily for first 3 days

### 9.4 Rollback options

- Vercel `Promote previous deployment` for code-level regression
- R2 restore via runbook for data corruption
- Freeze invites + serve `/maintenance` route for catastrophic failure

---

## 10. Approvals

- [x] Branding direction (Talib by An Nisaa', logo unchanged) — approved
- [x] 3-cycle sequencing — approved (Approach 2)
- [x] Tier choices: Vercel Hobby + Supabase free + GitHub free + R2 backup — approved with risks acknowledged
- [x] Phased user rollout (staff D-day, parents D+7) — approved
- [x] Real money via Xendit prod from Day 1 — approved
- [ ] Spec doc (this file) — pending user review

## 11. Next steps after this design is approved

1. User reviews this spec
2. On approval, invoke `superpowers:writing-plans` to produce Cycle A implementation plan
3. Set up worktree `feat/rebrand-talib` per `scripts/setup-worktree.sh`
4. Run `/spec` inside worktree → creates `docs/cycles/2026-05-XX-rebrand-talib.md`
5. Run `/build` to execute Cycle A tasks
6. Run `/ship` → PR to staging → soak → merge to main
7. Repeat for Cycle B, then Cycle C

---

## Appendix A — Domain + DNS

- `annisaasekolahku.com` — owned, parent organization
- `talib.annisaasekolahku.com` — CNAME to Vercel `cname.vercel-dns.com`, SSL issued via Vercel automatic certs, currently serving `main` branch deploys
- Cookie scope: host-only on `talib.annisaasekolahku.com` (Supabase Auth default)

## Appendix B — Stale facts to fix in CLAUDE.md (Cycle A Task 7)

- "Branch protection / required checks / auto-merge require GitHub Pro and are **not active today**." — incorrect since Feb 2023; private-repo branch protection is free. Update wording to reflect "free, will be enabled in Cycle B".

## Appendix C — Deferred / out of scope

- Multi-school onboarding flow (forever)
- Marketing site / public signup (forever)
- Mobile app (forever, this initiative)
- Sentry / dedicated APM (revisit if ops pain)
- Lawyer-reviewed legal docs (boilerplate sufficient for soft launch)
- Custom Talib wordmark by designer (text-only initially)
- Vercel Pro upgrade (revisit if traffic or commercial-use enforcement risk)
- Supabase Pro upgrade (revisit at 300 MB DB usage)
- Sales/billing pipeline for other schools (forever)
