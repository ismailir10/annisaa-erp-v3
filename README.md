# An Nisaa' School ERP

Teacher attendance tracking and payroll management system for **An Nisaa' Sekolahku** — an Islamic early childhood education school in Bekasi, Indonesia.

**Production:** [annisaa-erp-v3.vercel.app](https://annisaa-erp-v3.vercel.app)

---

## Features

### Teacher Portal (Mobile)
- **Check-in / Check-out** — GPS captured as documentation, never blocks
- **Attendance Calendar** — monthly color-coded view with day details
- **Salary Slips** — view and download PDF payslips
- **Profile** — view personal info, campus, position

### Admin Portal (Desktop)
- **Dashboard** — real-time attendance stats + quick actions
- **Employee Management** — CRUD with auto-generated codes, position dropdown
- **Attendance** — daily dashboard, monthly grid, override with LEAVE status
- **Payroll** — full cycle: draft → attendance variables → review → approve → BSI CSV → PDF slips → email
- **Settings** — campus, org config, holidays (2026 Indonesia), salary components (13 configurable)

### Payroll Engine
- 13 salary components (FIXED, PCT_OF_BASE, ATTENDANCE_BASED)
- Working days auto-calculated (excludes weekends + holidays)
- Pro-rating for partial attendance
- Attendance variables: overtime, outdoor days, holiday worked, DC days
- Line-by-line adjustment with notes
- BSI bank CSV export
- PDF salary slip generation with branded template
- Email delivery via Resend with PDF attachment

---

## Environments

| Environment | Branch | URL | Database | Purpose |
|-------------|--------|-----|----------|---------|
| **Production** | `main` | annisaa-erp-v3.vercel.app | Supabase Mumbai (`qrnbanxcrmrwganpmzmn`) | Real teachers, real payroll |
| **Staging** | `staging` | Vercel preview URL | Supabase Tokyo (`jzhujpqaxyeeokgexerc`) | Testing with safe data |

### Key Differences

| | Production | Staging |
|---|-----------|---------|
| Database | 25 real users, 24 employees | 3 test users, 2 test employees |
| Admin | ismailir10@gmail.com | ismailir10@gmail.com |
| Teachers | Real teacher emails | ismail10rabbanii@gmail.com, rightjet.hq@gmail.com |
| Emails | Sent to real teacher emails | Sent to test teacher emails only |
| Banner | None | Yellow "STAGING" banner at top |

---

## Development Workflow (SOP)

### The Golden Rule: `staging` is always AHEAD of `main`

```
Feature branch → staging (test on preview) → PR to main → production
     ↓                ↓                            ↓
   develop        Vercel Preview               Vercel Production
                  Staging Supabase             Production Supabase
```

### Step-by-step

1. **Always work on `staging` branch** (or a feature branch merged into staging)
   ```bash
   git checkout staging
   ```

2. **Develop and push**
   ```bash
   git add -A && git commit -m "feat: ..." && git push
   ```

3. **Vercel auto-deploys** a Preview at the staging URL

4. **Test on staging** — login, check features, test payroll/email (safe: only test users)

5. **When satisfied, create PR**
   ```bash
   gh pr create --base main --head staging --title "Release: ..."
   ```

6. **CI runs** — lint, typecheck, unit tests (GitHub Actions)

7. **Merge PR** → production auto-deploys
   ```bash
   gh pr merge --merge
   ```

8. **NEVER push directly to `main`**

### Payroll Safety Rules

- **ALWAYS test salary slip generation on staging first** before running on production
- Staging emails go to `STAGING_EMAIL_OVERRIDE` (admin email), never to test teachers
- Verify PDF content and amounts before sending on production
- BSI CSV: preview the employee list before downloading
- Once payroll is APPROVED, attendance is locked — no going back

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict) |
| Database | Supabase PostgreSQL (prod: Mumbai, staging: Tokyo) / SQLite (local dev) |
| ORM | Prisma 7 |
| Auth | Supabase Auth (Google OAuth + Magic Link) |
| UI | Shadcn UI + Tailwind CSS |
| Fonts | Plus Jakarta Sans + JetBrains Mono |
| Animation | Framer Motion |
| Email | Resend (with branded HTML template + PDF attachment) |
| PDF | @react-pdf/renderer |
| Hosting | Vercel |
| CI | GitHub Actions (lint, typecheck, test on PR) |
| Testing | Vitest (unit) |

---

## Getting Started (Local Development)

### Prerequisites
- Node.js 20+
- npm

### Setup

```bash
# Clone
git clone https://github.com/ismailir10/annisaa-erp-v3.git
cd annisaa-erp-v3

# Install
npm install

# Generate Prisma client + push schema to SQLite
npx prisma generate
npx prisma db push

# Seed data (24 employees, 312 salary values, 23 holidays, attendance, payroll)
npx prisma db seed

# Start dev server (demo mode — no Supabase needed)
npm run dev
```

Open http://localhost:3000 — demo mode with user selector.

### Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Local Dev | Staging (Preview) | Production |
|----------|-----------|-------------------|------------|
| `DATABASE_URL` | `file:./dev.db` (auto) | Staging Supabase pooler | Production Supabase pooler |
| `NEXT_PUBLIC_SUPABASE_URL` | — (demo mode) | Staging Supabase URL | Production Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | — | Staging anon key | Production anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Staging service key | Production service key |
| `RESEND_API_KEY` | — | Resend API key | Resend API key |

---

## Security

- **Auth:** Supabase Auth (Google OAuth + Magic Link). Demo auth disabled when Supabase is configured.
- **Tenant isolation:** All mutation endpoints verify `tenantId` ownership via `verifyTenantOwnership()`
- **Rate limiting:** Check-in (5/min), payroll generate (2/min)
- **Payroll access:** Teachers can ONLY view their own approved salary slips. No draft access.
- **Security headers:** X-Frame-Options DENY, HSTS, X-Content-Type-Options nosniff
- **Email safety:** Staging overrides all recipients to admin email. Production sends to actual teachers.

---

## Project Structure

```
app/
├── admin/           # Admin pages (dashboard, employees, attendance, payroll, settings)
├── teacher/         # Teacher pages (check-in, attendance, slips, profile)
├── auth/callback/   # Supabase OAuth callback
├── api/             # API routes (40+ endpoints)
└── page.tsx         # Login (Supabase Auth + demo fallback)

components/
├── admin/           # Sidebar, page header, stat card
├── attendance/      # Calendar, override modal
├── teacher/         # Bottom nav, header
└── ui/              # Shadcn UI components

lib/
├── auth.ts          # Session management (Supabase + demo fallback)
├── auth-guard.ts    # Tenant ownership verification
├── db.ts            # Prisma client (auto-detects SQLite/PostgreSQL)
├── rate-limit.ts    # In-memory rate limiter
├── attendance/      # Status logic, timezone helpers
├── payroll/         # Calculation engine, working days, BSI export
├── pdf/             # Salary slip PDF template
├── email/           # Resend integration + branded HTML template
└── supabase/        # Client, server, middleware utilities

prisma/
├── schema.prisma    # 13 models
├── seed.ts          # Full seed script
└── data/            # Employees, holidays, salary components, values
```

---

## Tests

```bash
npx vitest run        # 12 unit tests (payroll engine + working days)
```

---

## Email Setup (Resend)

To enable actual email delivery:

1. Create account at [resend.com](https://resend.com)
2. Add and verify your sending domain
3. Get API key
4. Add `RESEND_API_KEY=re_xxxxx` to Vercel env vars (both Preview and Production)
5. Test on staging first — emails go to `STAGING_EMAIL_OVERRIDE`

Without `RESEND_API_KEY`, emails are simulated (logged but not sent).

---

## License

Private — An Nisaa' Sekolahku
