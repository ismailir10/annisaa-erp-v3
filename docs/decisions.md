# Architecture Decisions

## ADR-001: SQLite for local dev → PostgreSQL everywhere
**Date:** 2026-04-10
**Status:** Decided
**Decision:** Switch from SQLite (local) + PostgreSQL (prod) to PostgreSQL everywhere using `supabase start` for local dev.
**Reason:** SQLite forced String dates and Float amounts. PostgreSQL enables proper Decimal(15,2) and DateTime types. Same DB engine everywhere eliminates adapter complexity.

## ADR-002: Float → Decimal for monetary fields
**Date:** 2026-04-10
**Status:** Planned
**Decision:** Change all monetary fields from Float to Decimal(15,2).
**Reason:** Float causes rounding errors in financial calculations. At scale (24 employees × 13 components × 12 months = 3,744 calculations), errors accumulate.

## ADR-003: Guardian model 1:1 → M:N
**Date:** 2026-04-10
**Status:** Planned
**Decision:** Change Guardian from 1:1 (one student per guardian) to M:N via GuardianStudent junction table.
**Reason:** A parent with 2 children currently requires 2 Guardian records with same data. Parent portal can only show 1 child.

## ADR-004: 6-module architecture
**Date:** 2026-04-10
**Status:** Decided
**Decision:** Organize code and thinking around 6 modules: core, hr, academic, students, finance, learning.
**Reason:** Parent Portal is a view layer, not a module. Communication is a utility. 6 modules map to real school operations.

## ADR-005: TanStack Table + Shadcn DataTable
**Date:** 2026-04-10
**Status:** Planned
**Decision:** Use TanStack Table (React Table v8) with Shadcn styling for all list pages.
**Reason:** Current list pages use custom card loops with no pagination. At 500+ students, pages will break. TanStack provides server-side pagination, sorting, filtering.

## ADR-006: Zod validation on all API inputs
**Date:** 2026-04-10
**Status:** Planned
**Decision:** Add Zod schemas for all POST/PUT inputs with shared validation wrapper.
**Reason:** Current validation is inline and inconsistent. Zod provides compile-time safety and consistent error messages.

## ADR-007: Xendit Session API (not Invoice API)
**Date:** 2026-04-08
**Status:** Decided
**Decision:** Use Xendit Checkout Session API with PAYMENT_LINK mode, not the older Invoice API.
**Reason:** Session API is Xendit's recommended approach. Supports all payment methods (VA, QRIS, e-wallets). 7-day expiry for parents.

## ADR-008: An Nisaa' brand (not generic)
**Date:** 2026-04-07
**Status:** Decided
**Decision:** Use An Nisaa' brand colors (teal #5DB4B8) with Revolut-style layout (dark sidebar).
**Reason:** School ERP should feel premium, not generic admin panel. Plus Jakarta Sans is Indonesian-origin font.
