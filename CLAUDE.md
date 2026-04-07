# School ERP - Project Instructions

## Project Overview

**Project**: School ERP - Teacher Attendance & Payroll System
**Primary User**: An Nisaa' Sekolahku (Indonesia - 2 campuses, ~24 teachers)
**Goal**: Replace manual Google Sheets + Apps Script with a modern web-based system
**PRD**: See `prd.md` v8.0 — trimmed MVP scope

## Agent Skills Integration

This project uses [agent-skills](https://github.com/addyosmani/agent-skills) for production-grade engineering workflows. Skills are located in `.agent-skills/`.

### Workflow Commands

Follow this development lifecycle:
1. `/spec` - Define requirements (prd.md is our spec)
2. `/plan` - Break down work into atomic tasks
3. `/build` - Implement features incrementally
4. `/test` - Verify functionality
5. `/review` - Quality gates
6. `/code-simplify` - Reduce complexity
7. `/ship` - Deploy to production

### Key Skills to Reference

| Phase | Skill | Path |
|-------|-------|------|
| Define | spec-driven-development | `.agent-skills/skills/spec-driven-development/` |
| Plan | planning-and-task-breakdown | `.agent-skills/skills/planning-and-task-breakdown/` |
| Build | incremental-implementation | `.agent-skills/skills/incremental-implementation/` |
| Build | frontend-ui-engineering | `.agent-skills/skills/frontend-ui-engineering/` |
| Build | api-and-interface-design | `.agent-skills/skills/api-and-interface-design/` |
| Build | test-driven-development | `.agent-skills/skills/test-driven-development/` |
| Verify | debugging-and-error-recovery | `.agent-skills/skills/debugging-and-error-recovery/` |
| Review | code-review-and-quality | `.agent-skills/skills/code-review-and-quality/` |
| Review | security-and-hardening | `.agent-skills/skills/security-and-hardening/` |
| Ship | git-workflow-and-versioning | `.agent-skills/skills/git-workflow-and-versioning/` |

### Agent Personas

- **Code Reviewer** (`.agent-skills/agents/code-reviewer.md`) - For code review
- **Test Engineer** (`.agent-skills/agents/test-engineer.md`) - For test strategy
- **Security Auditor** (`.agent-skills/agents/security-auditor.md`) - For security review

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict) |
| Database | Supabase PostgreSQL (Singapore) |
| ORM | Prisma |
| Auth | Supabase Auth (Google OAuth + Magic Link) |
| UI Framework | Shadcn UI (Radix primitives) |
| Styling | Tailwind CSS + CSS variables for design tokens |
| Fonts | Plus Jakarta Sans (variable) + JetBrains Mono |
| Animation | Framer Motion (complex) + CSS transitions (simple) |
| Email | Resend |
| PDF | @react-pdf/renderer |
| Hosting | Vercel |
| E2E Testing | Playwright |
| Unit Testing | Vitest |

## Design Direction — Revolut-Inspired

**NOT generic admin panel.** Every screen should feel like a premium fintech tool.

### Key Design Rules
- **Dark sidebar** (`#0D0D12`) + clean white content area
- **Plus Jakarta Sans** — Indonesian-origin geometric sans-serif (NOT Inter, NOT Roboto)
- **JetBrains Mono** for currency amounts and codes
- **One accent color**: `#0066FF` (Revolut blue) — no pastel rainbows
- **Generous whitespace** — let content breathe
- **Numbers are heroes** — large, monospaced, prominent on dashboards
- **Mobile-first for teachers** — bottom nav (3 tabs: Home, Attendance, Slips)
- **Staggered reveal animations** on page load
- **Skeleton loading states** — no blank screens

### What to Avoid
- Generic Inter/Roboto/Arial fonts
- Purple gradients on white backgrounds
- Cookie-cutter admin templates
- Timid, evenly-distributed color palettes
- Static, lifeless interfaces

Use Shadcn UI components as base, customize with our design tokens. Only write custom CSS when Shadcn doesn't cover the need.

## Core Principles

1. **Flexibility First** - Salary components are row-based, configurable by admin
2. **Single Tenant MVP** - tenantId in models for future multi-tenant, but single school for now
3. **Indonesia-Specific** - Payroll 21st-20th, BSI bank format, Asia/Jakarta timezone
4. **Mobile-First for Teachers** - Check-in on phones, responsive design
5. **GPS as Documentation** - Capture location, never block check-in

## MVP Scope (20 features)

Core loop: Teacher Check-in → Admin Reviews Attendance → Payroll → BSI CSV → PDF Slips → Email

**Deferred to v2**: Multi-tenant, GPS enforcement, leave management, in-app notifications, offline/PWA, payroll reopen, bulk import, teacher profile editing.

## Coding Standards

- TypeScript strict mode
- Follow incremental-implementation skill: small slices, working software at every step
- Comprehensive audit trails for payroll operations
- Tests for payroll calculation engine (critical path)

## Artifacts

- `artifacts/Slip Gaji Annisaa' Sekolahku (Master) (1).xlsx` - Current payroll spreadsheet (source of truth for seed data)
- `artifacts/annisaa-salary-slip-sender.md` - Existing Apps Script for PDF generation
