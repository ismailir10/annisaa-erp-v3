# Roadmap

## Current State (April 2026)

All 8 phases built on staging. Foundation refactor in progress before production deployment.

## Foundation Refactor (Complete ✅)

1. ✅ Rewrite CLAUDE.md (operating manual)
2. ✅ PostgreSQL migration + schema fixes (Decimal, indexes)
3. ✅ Shared API utilities (pagination, response, validate) + Zod schemas
4. ✅ DataTable component (TanStack + Shadcn)
5. ✅ Migrate all list pages to DataTable (6 pages + 6 APIs paginated)
6. ✅ Security review (tenant ownership on 9 routes, rate limiting on 5 routes)

## Future Features (After Foundation)

### Near-term
- WhatsApp notification integration (Fonnte/Wablas) for fee reminders
- Pop Up Class scheduling + per-session registration
- Bulk holiday import (CSV)
- Multi-admin per campus

### Medium-term
- Multi-tenant architecture (serve multiple schools)
- Customizable report card templates
- Parent communication (announcements, messaging)
- Student promotion (end of year → next academic year)

### Long-term
- PWA for teacher mobile experience
- Advanced analytics dashboard
- Integration with Indonesian government education reporting (Dapodik)
- Biometric attendance alternative

## Build Order Principle

> Build brick by brick. Each feature must be stable before the next begins.
> Quality over speed. No new features until foundation is solid.
