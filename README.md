# An Nisaa' School ERP

Teacher attendance tracking and payroll management system for **An Nisaa' Sekolahku** — an Islamic early childhood education school in Bekasi, Indonesia.

**Live:** [annisaa-erp-v3.vercel.app](https://annisaa-erp-v3.vercel.app)

## Features

### Teacher Portal (Mobile)
- **Check-in / Check-out** — GPS captured as documentation, never blocks
- **Attendance Calendar** — monthly color-coded view with day details
- **Salary Slips** — view and download PDF payslips

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
- PDF salary slip generation

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict) |
| Database | Supabase PostgreSQL (prod) / SQLite (dev) |
| ORM | Prisma 7 |
| Auth | Supabase Auth (Google OAuth + Magic Link) |
| UI | Shadcn UI + Tailwind CSS |
| Fonts | Plus Jakarta Sans + JetBrains Mono |
| Animation | Framer Motion |
| PDF | @react-pdf/renderer |
| Hosting | Vercel |
| Testing | Vitest (unit) |

## Getting Started

### Prerequisites
- Node.js 20+
- npm

### Local Development

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

# Start dev server
npm run dev
```

Open http://localhost:3000 — demo mode with user selector (no Supabase needed locally).

### Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Local Dev | Production |
|----------|-----------|------------|
| `DATABASE_URL` | `file:./dev.db` (auto) | Supabase pooler URL |
| `DIRECT_URL` | — | Supabase session URL |
| `NEXT_PUBLIC_SUPABASE_URL` | — | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | — | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Supabase service role key |
| `STAGING_EMAIL_OVERRIDE` | — | Test email for staging |

## Branching Strategy

| Branch | Environment | URL |
|--------|-------------|-----|
| `main` | Production | annisaa-erp-v3.vercel.app |
| `staging` | Preview | Vercel preview URL |

- Develop on `staging` → test on preview → merge to `main` for production
- Staging overrides all email recipients to `STAGING_EMAIL_OVERRIDE`

## Project Structure

```
app/
├── admin/           # Admin pages (dashboard, employees, attendance, payroll, settings)
├── teacher/         # Teacher pages (check-in, attendance calendar, salary slips)
├── auth/callback/   # Supabase OAuth callback
├── api/             # API routes (39 endpoints)
└── page.tsx         # Login (Supabase Auth + demo fallback)

components/
├── admin/           # Sidebar, page header, stat card
├── attendance/      # Calendar, override modal
├── teacher/         # Bottom nav
└── ui/              # Shadcn UI components

lib/
├── auth.ts          # Session management (Supabase + demo fallback)
├── auth-guard.ts    # Tenant ownership verification
├── db.ts            # Prisma client (auto-detects SQLite/PostgreSQL)
├── attendance/      # Status logic, timezone helpers
├── payroll/         # Calculation engine, working days, BSI export
├── pdf/             # Salary slip PDF template
└── supabase/        # Client, server, middleware utilities

prisma/
├── schema.prisma    # 13 models
├── seed.ts          # Full seed script
└── data/            # Employees, holidays, salary components, values
```

## Tests

```bash
npx vitest run        # 12 unit tests (payroll engine + working days)
```

## License

Private — An Nisaa' Sekolahku
