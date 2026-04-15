# Performance Optimization Todo List

## Phase 1: Quick Wins (Week 1)

### Task 1: Add Critical Database Indexes ⚡️
**Status:** 🔲 NOT STARTED
**Priority:** CRITICAL (BLOCKS OTHER TASKS)
**Effort:** 30 minutes + migration

- [ ] Add index to `AttendanceRecord.date`
- [ ] Add composite index to `AttendanceRecord.[employeeId, date]`
- [ ] Add composite index to `Invoice.[studentId, status]`
- [ ] Add composite index to `Invoice.[status, createdAt]`
- [ ] Add index to `StudentGuardian.parentId`
- [ ] Generate migration: `prisma migrate dev --name add_performance_indexes`
- [ ] Apply migration to local database
- [ ] Verify indexes created in PostgreSQL
- [ ] Run tests to ensure no breaking changes

### Task 2: Fix Parent Dashboard N+1 Query 🎯
**Status:** 🔲 NOT STARTED
**Priority:** HIGH
**Effort:** 1 hour
**Dependencies:** Task 1

- [ ] Remove `invoices` include from `lib/parent-helpers.ts`
- [ ] Create `getStudentInvoices(studentId: string)` function
- [ ] Update `app/parent/page.tsx` to fetch invoices for selected child only
- [ ] Test dashboard load time (target: <1.5s)
- [ ] Verify single database query instead of N queries
- [ ] Manual verification on staging

### Task 3: Parallelize Admin Dashboard Weekly Trend Query 🚀
**Status:** 🔲 NOT STARTED
**Priority:** HIGH
**Effort:** 1 hour
**Dependencies:** Task 1

- [ ] Calculate array of 7 weekday dates
- [ ] Replace 7 sequential queries with single `groupBy` query
- [ ] Use `WHERE IN` for all 7 dates
- [ ] Aggregate results by status in JavaScript
- [ ] Update chart data structure
- [ ] Test dashboard load time (target: <2s)
- [ ] Verify single query in Network tab

### Task 4: Implement Static Data Caching 💾
**Status:** 🔲 NOT STARTED
**Priority:** MEDIUM
**Effort:** 2 hours

- [ ] Add `export const revalidate = 3600` to `app/api/programs/route.ts`
- [ ] Add `export const revalidate = 3600` to `app/api/roles/route.ts`
- [ ] Add `export const revalidate = 3600` to `app/api/config/campuses/route.ts`
- [ ] Add `export const revalidate = 3600` to `app/api/fee-components/route.ts`
- [ ] Add `export const revalidate = 3600` to `app/api/salary-components/route.ts`
- [ ] Test cache behavior (first request vs second request)
- [ ] Verify cache headers set correctly
- [ ] Manual verification: second load is instant

**Checkpoint 1: Quick Wins Complete**
- [ ] Parent dashboard: <1.5s load time ✅
- [ ] Admin dashboard: <2s load time ✅
- [ ] Static data cached (1-hour TTL) ✅
- [ ] Overall improvement: 50-60% 🎯

---

## Phase 2: Bundle Optimization (Week 2)

### Task 5: Route-Based Code Splitting 📦
**Status:** 🔲 NOT STARTED
**Priority:** MEDIUM
**Effort:** 4 hours

- [ ] Run bundle analyzer to identify unused imports
- [ ] Audit all admin routes for unused components
- [ ] Audit all teacher routes for unused components
- [ ] Audit all parent routes for unused components
- [ ] Replace barrel imports with specific imports
- [ ] Test each portal still works
- [ ] Verify bundle size reduced by 20-30%
- [ ] Check for import errors

### Task 6: Lazy Load Heavy Libraries ⚡️
**Status:** 🔲 NOT STARTED
**Priority:** MEDIUM
**Effort:** 3 hours

- [ ] Identify components using Framer Motion
- [ ] Convert to dynamic imports with loading states
- [ ] Identify components using Recharts
- [ ] Convert to dynamic imports
- [ ] Identify PDF generation routes
- [ ] Convert React-PDF to dynamic import
- [ ] Add Skeleton loading components
- [ ] Test no FOUC (Flash of Unstyled Content)
- [ ] Verify bundle size reduced by 40-50%

### Task 7: Tree Shake Shadcn Components 🌳
**Status:** 🔲 NOT STARTED
**Priority:** LOW
**Effort:** 2 hours
**Dependencies:** Task 5

- [ ] Find all barrel imports from `@/components/ui`
- [ ] Replace with specific imports (Button, Card, etc.)
- [ ] Test each page still works
- [ ] Verify no import errors
- [ ] Check bundle size reduced by 10-15%
- [ ] Run full test suite

**Checkpoint 2: Bundle Optimization Complete**
- [ ] Initial bundle: <200KB gzipped ✅
- [ ] Per-route bundle: <100KB gzipped ✅
- [ ] Overall bundle reduction: 20-30% 🎯

---

## Phase 3: Advanced Features (Week 3)

### Task 8: Implement Redis Caching Infrastructure 🚀
**Status:** 🔲 NOT STARTED
**Priority:** MEDIUM
**Effort:** 8 hours

- [ ] Install `ioredis` package
- [ ] Create Redis singleton in `lib/cache/redis.ts`
- [ ] Create cache helper functions in `lib/cache/cache-helpers.ts`
- [ ] Add Redis URL to `.env.local`
- [ ] Update programs API to use caching (5-min TTL)
- [ ] Update class sections API to use caching (5-min TTL)
- [ ] Update fee structures API to use caching (15-min TTL)
- [ ] Add cache invalidation on update/delete
- [ ] Implement fallback to database if Redis fails
- [ ] Test cache hit rate (target: >80%)
- [ ] Deploy to staging and verify

### Task 9: Implement Incremental Static Regeneration (ISR) ⚡️
**Status:** 🔲 NOT STARTED
**Priority:** MEDIUM
**Effort:** 6 hours
**Dependencies:** Task 4

- [ ] Add `export const revalidate = 60` to `app/admin/employees/page.tsx`
- [ ] Add `export const revalidate = 60` to `app/admin/students/page.tsx`
- [ ] Add `export const revalidate = 60` to `app/admin/invoices/page.tsx`
- [ ] Ensure pages are cacheable (no user-specific data)
- [ ] Test stale-while-revalidate behavior
- [ ] Verify background regeneration works
- [ ] Test first load: <100ms (from cache)
- [ ] Test subsequent loads: <50ms (edge cache)

### Task 10: Optimize Prisma Queries 🔍
**Status:** 🔲 NOT STARTED
**Priority:** MEDIUM
**Effort:** 4 hours
**Dependencies:** Task 1

- [ ] Audit all API routes for over-fetching
- [ ] Replace `include` with `select` where possible
- [ ] Test each endpoint still works
- [ ] Measure payload size reduction (target: 20-30%)
- [ ] Run full test suite
- [ ] Manual verification on staging

### Task 11: Implement Server-Side Streaming 🌊
**Status:** 🔲 NOT STARTED
**Priority:** LOW
**Effort:** 6 hours

- [ ] Create skeleton components for admin dashboard
- [ ] Create skeleton components for teacher dashboard
- [ ] Create skeleton components for parent dashboard
- [ ] Add Suspense boundaries to all dashboards
- [ ] Test streaming behavior
- [ ] Verify no layout shift (CLS <0.1)
- [ ] Measure perceived performance improvement

**Checkpoint 3: Advanced Features Complete**
- [ ] Redis cache hit rate: >80% ✅
- [ ] ISR pages: <100ms load time ✅
- [ ] Query payloads: reduced by 20-30% ✅
- [ ] Suspense boundaries: on all dashboards ✅
- [ ] Overall additional improvement: 30-40% 🎯

---

## Phase 4: Monitoring (Week 4)

### Task 12: Set Up Performance Monitoring Dashboard 📊
**Status:** 🔲 NOT STARTED
**Priority:** HIGH
**Effort:** 2 hours

- [ ] Install `@vercel/analytics` package
- [ ] Add Analytics to root layout
- [ ] Create Web Vitals component
- [ ] Integrate Vercel Analytics dashboard
- [ ] Configure alerts for metric degradation
- [ ] Verify Web Vitals are reported
- [ ] Test on staging environment

### Task 13: Database Query Logging 🔍
**Status:** 🔲 NOT STARTED
**Priority:** LOW
**Effort:** 2 hours

- [ ] Add Prisma middleware for logging
- [ ] Log queries taking >500ms
- [ ] Track query execution time
- [ ] Create dashboard for query metrics
- [ ] Configure alerts for slow queries
- [ ] Test logging works in development
- [ ] Deploy to staging and verify

**Checkpoint 4: Monitoring Complete**
- [ ] Web Vitals tracked ✅
- [ ] Performance dashboard active ✅
- [ ] Slow query logging enabled ✅
- [ ] Alerts configured ✅
- [ ] Full visibility into performance 🎯

---

## Final Success Metrics

### Performance Targets
- [ ] Admin Dashboard: <2s load time (currently 4-5s)
- [ ] Parent Dashboard: <1.5s load time (currently 3-4s)
- [ ] Teacher Dashboard: <1s load time (currently 2-3s)
- [ ] API Response Time: p95 <500ms
- [ ] Database Query Time: p95 <200ms

### Bundle Size Targets
- [ ] Initial JS Bundle: <200KB gzipped (currently ~400KB)
- [ ] Per-Route Bundle: <100KB gzipped
- [ ] First Contentful Paint: <1.8s
- [ ] Largest Contentful Paint: <2.5s

### Overall Achievement
- [ ] **50-70% improvement in page load times** 🎯
- [ ] All tests passing ✅
- [ ] No regressions detected ✅
- [ ] User satisfaction improved ✅

---

**Total Tasks:** 13
**Estimated Effort:** 40-60 hours
**Timeline:** 4 weeks
**Status:** 🔲 NOT STARTED

**Next Action:** Start with Task 1 (Database Indexes) - must be completed first
