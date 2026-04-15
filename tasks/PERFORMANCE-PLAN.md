# Performance Optimization Task Breakdown
**Project:** An Nisaa' School ERP - Performance Optimization
**Date:** 2025-04-15
**Status:** READY FOR IMPLEMENTATION

---

## Overview

This plan breaks down the performance optimization work into **vertical slices** that deliver complete, verifiable improvements. Each task is independent and can be merged separately.

**Total Tasks:** 13
**Estimated Effort:** 40-60 hours
**Expected Impact:** 50-70% improvement in page load times

---

## Dependency Graph

```
Phase 1: Quick Wins (Foundation)
├── Task 1: Database Indexes (BLOCKING - must be first)
├── Task 2: Parent Dashboard N+1 Query (depends on Task 1)
├── Task 3: Admin Dashboard Query Parallelization
└── Task 4: Static Data Caching

Phase 2: Bundle Optimization (can run parallel with Phase 1)
├── Task 5: Route-Based Code Splitting
├── Task 6: Lazy Load Heavy Libraries
└── Task 7: Tree Shake Shadcn Components

Phase 3: Advanced Features (depends on Phase 1)
├── Task 8: Redis Caching Infrastructure
├── Task 9: Incremental Static Regeneration
├── Task 10: Prisma Query Optimization
└── Task 11: Server-Side Streaming

Phase 4: Monitoring (can start anytime)
├── Task 12: Performance Monitoring Dashboard
└── Task 13: Database Query Logging
```

---

## Task List

### Task 1: Add Critical Database Indexes ⚡️
**Priority:** CRITICAL (BLOCKS OTHER TASKS)
**Phase:** 1 - Quick Wins
**Effort:** 30 minutes + migration
**Impact:** 30-50% faster queries across all portals

**Description:**
Add composite indexes to frequently queried columns to eliminate full table scans.

**Files to Modify:**
- `prisma/schema.prisma`

**Acceptance Criteria:**
- [ ] Index added to `AttendanceRecord.date`
- [ ] Index added to `AttendanceRecord.[employeeId, date]` (composite)
- [ ] Index added to `Invoice.[studentId, status]` (composite)
- [ ] Index added to `Invoice.[status, createdAt]` (composite)
- [ ] Index added to `StudentGuardian.parentId`
- [ ] Migration generated: `prisma migrate dev --name add_performance_indexes`
- [ ] Migration applied to local database
- [ ] No breaking changes to existing queries

**Verification:**
```bash
# 1. Add indexes to schema
# 2. Generate migration
npx prisma migrate dev --name add_performance_indexes

# 3. Verify indexes created
psql $DATABASE_URL -c "\d AttendanceRecord"
psql $DATABASE_URL -c "\d Invoice"
psql $DATABASE_URL -c "\d StudentGuardian"

# 4. Test queries still work
npm run test
```

**Rollback Plan:**
```bash
npx prisma migrate rollback
```

**Dependencies:** None (must be first)

---

### Task 2: Fix Parent Dashboard N+1 Query 🎯
**Priority:** HIGH
**Phase:** 1 - Quick Wins
**Effort:** 1 hour
**Impact:** 60-70% faster parent dashboard load (3-4s → 1-1.5s)

**Description:**
Currently fetches invoices for ALL children on dashboard load. Only fetch for selected child.

**Files to Modify:**
- `lib/parent-helpers.ts`
- `app/parent/page.tsx`

**Acceptance Criteria:**
- [ ] Invoices no longer fetched in `getParentWithChildren()`
- [ ] Invoices fetched separately for selected child only
- [ ] Dashboard load time reduced by 60%+
- [ ] All existing tests still pass
- [ ] Manual verification: Parent dashboard loads instantly

**Implementation Steps:**
1. Remove `invoices` include from `lib/parent-helpers.ts:48-74`
2. Create new function `getStudentInvoices(studentId: string)`
3. Call `getStudentInvoices()` in `app/parent/page.tsx` for selected child
4. Verify single database query instead of N queries

**Verification:**
```bash
# Before: 3 children × 5 invoices = 15 queries
# After: 1 query for selected child's invoices

# Test manually:
npm run dev
# Visit /parent, check Network tab for query count
```

**Rollback Plan:**
Revert commit to restore invoice fetching in `getParentWithChildren()`

**Dependencies:** Task 1 (indexes must exist first)

---

### Task 3: Parallelize Admin Dashboard Weekly Trend Query 🚀
**Priority:** HIGH
**Phase:** 1 - Quick Wins
**Effort:** 1 hour
**Impact:** 80% faster admin dashboard (700ms → 150ms)

**Description:**
Replace 7 sequential queries with single `groupBy` query using `WHERE IN`.

**Files to Modify:**
- `app/admin/page.tsx`

**Acceptance Criteria:**
- [ ] Single database query for weekly trend (not 7 sequential)
- [ ] Query uses `WHERE IN` for all 7 dates
- [ ] Results aggregated correctly by status
- [ ] Dashboard chart displays correctly
- [ ] Load time reduced by 80%+

**Implementation Steps:**
1. Calculate array of 7 weekday dates
2. Single query:
   ```typescript
   const weeklyTrend = await prisma.attendanceRecord.groupBy({
     by: ["date", "status"],
     where: { date: { in: last7Weekdays } },
     _count: true,
   })
   ```
3. Aggregate results by date in JavaScript
4. Update chart data structure

**Verification:**
```bash
# Test query in Prisma Studio
# Verify single query returns all 7 days

npm run dev
# Visit /admin, check Network tab:
# Before: 7 requests to /admin
# After: 1 request to /admin
```

**Rollback Plan:**
Revert commit to restore sequential query loop

**Dependencies:** Task 1 (indexes must exist first)

---

### Task 4: Implement Static Data Caching 💾
**Priority:** MEDIUM
**Phase:** 1 - Quick Wins
**Effort:** 2 hours
**Impact:** Instant loads for reference data

**Description:**
Add Next.js `revalidate` to API routes for static data (programs, roles, campuses).

**Files to Modify:**
- `app/api/programs/route.ts`
- `app/api/roles/route.ts`
- `app/api/config/campuses/route.ts`
- `app/api/fee-components/route.ts`
- `app/api/salary-components/route.ts`

**Acceptance Criteria:**
- [ ] `export const revalidate = 3600` added to all static data routes
- [ ] Cache headers set correctly (Cache-Control: s-maxage=3600)
- [ ] First load: fetches from database
- [ ] Subsequent loads: returns cached data (instant)
- [ ] Cache invalidates after 1 hour
- [ ] Manual verification: Second load is instant

**Implementation Steps:**
1. Add `export const revalidate = 3600` to each route
2. Test cache behavior:
   - First request: database query
   - Second request (within 1 hour): cached response
3. Verify cache invalidation after 1 hour

**Verification:**
```bash
# First request (should hit database)
curl -w "@curl-format.txt" https://annisaa-erp-v3.vercel.app/api/programs

# Second request (should be cached, much faster)
curl -w "@curl-format.txt" https://annisaa-erp-v3.vercel.app/api/programs

# Check response headers:
# Cache-Control: s-maxage=3600, stale-while-revalidate
```

**Rollback Plan:**
Remove `revalidate` exports from all routes

**Dependencies:** None

---

### Task 5: Route-Based Code Splitting 📦
**Priority:** MEDIUM
**Phase:** 2 - Bundle Optimization
**Effort:** 4 hours
**Impact:** 20-30% smaller bundles per route

**Description:**
Audit and remove unused Shadcn components per route. Ensure each portal only loads its own code.

**Files to Audit:**
- All `app/admin/**/*.tsx` files
- All `app/teacher/**/*.tsx` files
- All `app/parent/**/*.tsx` files

**Acceptance Criteria:**
- [ ] Admin routes don't load teacher/parent components
- [ ] Teacher routes don't load admin/parent components
- [ ] Parent routes don't load admin/teacher components
- [ ] Bundle size reduced by 20-30%
- [ ] All functionality still works
- [ ] No import errors

**Implementation Steps:**
1. Run `npx @next/bundle-analyzer` to identify unused imports
2. For each page, list actually used Shadcn components
3. Replace barrel imports with specific imports:
   ```typescript
   // Before:
   import { Button, Card, DataTable } from "@/components/ui"

   // After:
   import { Button } from "@/components/ui/button"
   import { Card } from "@/components/ui/card"
   import { DataTable } from "@/components/ui/data-table"
   ```
4. Test each portal still works

**Verification:**
```bash
# Build and analyze bundles
npm run build
npx @next/bundle-analyzer

# Check each route's bundle size
# Admin: <100KB per route
# Teacher: <80KB per route
# Parent: <80KB per route
```

**Rollback Plan:**
Revert commit to restore barrel imports

**Dependencies:** None

---

### Task 6: Lazy Load Heavy Libraries ⚡️
**Priority:** MEDIUM
**Phase:** 2 - Bundle Optimization
**Effort:** 3 hours
**Impact:** 40-50% smaller initial bundle

**Description:**
Dynamic import heavy libraries only when needed (Framer Motion, Recharts, React-PDF).

**Files to Modify:**
- Components using `framer-motion`
- Dashboard components using `recharts`
- PDF generation routes

**Acceptance Criteria:**
- [ ] Framer Motion only loaded on pages with animations
- [ ] Recharts only loaded on dashboard pages
- [ ] React-PDF only loaded on PDF generation
- [ ] Initial bundle reduced by 40-50%
- [ ] No FOUC (Flash of Unstyled Content)
- [ ] All animations/charts still work

**Implementation Steps:**
1. Identify components using heavy libraries
2. Convert to dynamic imports:
   ```typescript
   // Before:
   import { motion } from "framer-motion"

   // After:
   const motion = dynamic(() => import("framer-motion").then(mod => mod.motion), {
     ssr: false,
     loading: () => <Skeleton />,
   })
   ```
3. Add loading states (Skeletons)
4. Test no FOUC

**Verification:**
```bash
# Build and check initial bundle
npm run build

# Before: Framer Motion in initial bundle
# After: Framer Motion in separate chunk, loaded on demand

# Test visually:
npm run dev
# Navigate to pages, verify smooth loading
```

**Rollback Plan:**
Revert commit to restore direct imports

**Dependencies:** None

---

### Task 7: Tree Shake Shadcn Components 🌳
**Priority:** LOW
**Phase:** 2 - Bundle Optimization
**Effort:** 2 hours
**Impact:** 10-15% smaller bundles

**Description:**
Ensure Shadcn components are tree-shakeable by using individual imports.

**Files to Audit:**
- All files with `@/components/ui` barrel imports

**Acceptance Criteria:**
- [ ] No barrel imports from `@/components/ui`
- [ ] All imports are specific to component files
- [ ] Bundle size reduced by 10-15%
- [ ] All functionality still works
- [ ] No import errors

**Implementation Steps:**
1. Find all barrel imports:
   ```bash
   grep -r "from '@/components/ui'" app/
   ```
2. Replace with specific imports:
   ```typescript
   // Before:
   import { Button, Card, Skeleton } from "@/components/ui"

   // After:
   import { Button } from "@/components/ui/button"
   import { Card } from "@/components/ui/card"
   import { Skeleton } from "@/components/ui/skeleton"
   ```
3. Test each page

**Verification:**
```bash
# Build and analyze
npm run build

# Check webpack bundle analysis
# Verify unused components not included
```

**Rollback Plan:**
Revert commit to restore barrel imports

**Dependencies:** Task 5 (do after route-based splitting)

---

### Task 8: Implement Redis Caching Infrastructure 🚀
**Priority:** MEDIUM
**Phase:** 3 - Advanced Features
**Effort:** 8 hours (setup + implementation)
**Impact:** 90% faster cached data loads

**Description:**
Set up Redis caching layer for frequently accessed data (programs, class sections, fee structures).

**Files to Create:**
- `lib/cache/redis.ts`
- `lib/cache/cache-helpers.ts`

**Files to Modify:**
- API routes for programs, class sections, fee structures
- `.env.local` (add Redis URL)

**Acceptance Criteria:**
- [ ] Redis client configured and connected
- [ ] Cache helper functions created
- [ ] Programs cached with 5-minute TTL
- [ ] Class sections cached with 5-minute TTL
- [ ] Fee structures cached with 15-minute TTL
- [ ] Cache invalidation on update/delete
- [ ] Fallback to database if Redis fails
- [ ] Metrics: cache hit rate >80%

**Implementation Steps:**
1. Install Redis client: `npm install ioredis`
2. Create Redis singleton in `lib/cache/redis.ts`
3. Create cache helpers:
   ```typescript
   export async function getCached<T>(key: string, fn: () => Promise<T>, ttl: number): Promise<T>
   export async function invalidateCache(pattern: string): Promise<void>
   ```
4. Update API routes to use caching
5. Add cache invalidation on mutations
6. Monitor cache hit rate

**Verification:**
```bash
# Test Redis connection
redis-cli ping
# Should return: PONG

# Test cache behavior
curl https://annisaa-erp-v3.vercel.app/api/programs
# First request: cache miss, database query
# Second request: cache hit, instant response

# Check cache hit rate in logs
```

**Rollback Plan:**
Remove Redis client, restore direct database queries

**Dependencies:** None (but recommend after Phase 1)

---

### Task 9: Implement Incremental Static Regeneration (ISR) ⚡️
**Priority:** MEDIUM
**Phase:** 3 - Advanced Features
**Effort:** 6 hours
**Impact:** Near-instant page loads for list pages

**Description:**
Generate static pages for admin list pages (employees, students, invoices) with 60-second revalidation.

**Files to Modify:**
- `app/admin/employees/page.tsx`
- `app/admin/students/page.tsx`
- `app/admin/invoices/page.tsx`

**Acceptance Criteria:**
- [ ] `export const revalidate = 60` added to list pages
- [ ] Pages generate statically at build time
- [ ] Pages regenerate in background every 60 seconds
- [ ] Stale data shown while revalidating
- [ ] First load: <100ms (served from cache)
- [ ] Subsequent loads: <50ms (edge cache)

**Implementation Steps:**
1. Add `export const revalidate = 60` to each list page
2. Ensure pages are cacheable (no user-specific data in URL)
3. Test stale-while-revalidate behavior
4. Verify background regeneration works

**Verification:**
```bash
# Build static pages
npm run build

# Test cache behavior
curl -w "@curl-format.txt" https://annisaa-erp-v3.vercel.app/admin/employees
# First request: generated statically
# Second request: served from cache (instant)

# Check response headers:
# Cache-Control: s-maxage=60, stale-while-revalidate
```

**Rollback Plan:**
Remove `revalidate` exports from pages

**Dependencies:** Task 4 (static data caching should work first)

---

### Task 10: Optimize Prisma Queries 🔍
**Priority:** MEDIUM
**Phase:** 3 - Advanced Features
**Effort:** 4 hours
**Impact:** 20-30% smaller payloads

**Description:**
Use `select` to limit returned fields. Only fetch data that's actually displayed.

**Files to Audit:**
- All API routes with `prisma.findMany()`
- All page components with database queries

**Acceptance Criteria:**
- [ ] All queries use `select` instead of `include` where possible
- [ ] Only fetched fields are displayed to user
- [ ] Payload size reduced by 20-30%
- [ ] No over-fetching of nested relations
- [ ] All functionality still works

**Implementation Steps:**
1. Audit all queries for over-fetching
2. Replace `include` with `select`:
   ```typescript
   // Before:
   include: { student: true }

   // After:
   include: { student: { select: { name: true, nickname: true } } }
   ```
3. Test each endpoint still works
4. Measure payload size reduction

**Verification:**
```bash
# Measure payload sizes
curl https://annisaa-erp-v3.vercel.app/api/invoices | jq length

# Before: 50KB response
# After: 35KB response (30% reduction)
```

**Rollback Plan:**
Revert commit to restore `include` statements

**Dependencies:** Task 1 (indexes must exist)

---

### Task 11: Implement Server-Side Streaming 🌊
**Priority:** LOW
**Phase:** 3 - Advanced Features
**Effort:** 6 hours
**Impact:** Improved perceived performance

**Description:**
Add Suspense boundaries for slow data. Show skeleton screens immediately, stream data in.

**Files to Modify:**
- Dashboard pages (admin, teacher, parent)
- Create loading components

**Acceptance Criteria:**
- [ ] Suspense boundaries added to all dashboards
- [ ] Skeleton screens shown immediately
- [ ] Data streams in progressively
- [ ] No layout shift (CLS <0.1)
- [ ] Perceived performance improved

**Implementation Steps:**
1. Create skeleton components for each dashboard
2. Wrap slow data in Suspense:
   ```typescript
   <Suspense fallback={<DashboardSkeleton />}>
     <DashboardData />
   </Suspense>
   ```
3. Test streaming behavior
4. Measure CLS metric

**Verification:**
```bash
# Test perceived performance
npm run dev
# Visit dashboards, verify:
# 1. Skeleton appears instantly
# 2. Data streams in smoothly
# 3. No layout shift

# Measure CLS with Lighthouse
```

**Rollback Plan:**
Remove Suspense boundaries, restore synchronous data fetching

**Dependencies:** None

---

### Task 12: Set Up Performance Monitoring Dashboard 📊
**Priority:** HIGH
**Phase:** 4 - Monitoring (can start anytime)
**Effort:** 2 hours
**Impact:** Visibility into performance metrics

**Description:**
Integrate Vercel Analytics and Web Vitals reporting. Track LCP, FID, CLS over time.

**Files to Create:**
- `components/analytics/web-vitals.tsx`

**Files to Modify:**
- `app/layout.tsx`

**Acceptance Criteria:**
- [ ] Vercel Analytics integrated
- [ ] Web Vitals reported (LCP, FID, CLS)
- [ ] Dashboard showing metrics over time
- [ ] Alerts configured for metric degradation
- [ ] Real-user monitoring (RUM) enabled

**Implementation Steps:**
1. Install Vercel Analytics: `npm install @vercel/analytics`
2. Add Analytics to root layout
3. Create Web Vitals component
4. Configure alerts in Vercel dashboard
5. Verify metrics are reported

**Verification:**
```bash
# Deploy to staging
git push origin staging

# Visit staging site
# Check Vercel Analytics dashboard
# Verify Web Vitals are reported
```

**Rollback Plan:**
Remove Analytics components from layout

**Dependencies:** None (can start immediately)

---

### Task 13: Database Query Logging 🔍
**Priority:** LOW
**Phase:** 4 - Monitoring
**Effort:** 2 hours
**Impact:** Identify remaining bottlenecks

**Description:**
Log slow queries (>500ms) to identify remaining optimization opportunities.

**Files to Modify:**
- `lib/db.ts` (Prisma client)

**Acceptance Criteria:**
- [ ] Query logging enabled
- [ ] Slow queries (>500ms) logged
- [ ] Query execution time tracked
- [ ] Dashboard showing query metrics
- [ ] Alerts for slow queries

**Implementation Steps:**
1. Add Prisma middleware for logging:
   ```typescript
   prisma.$use(async (params, next) => {
     const before = Date.now()
     const result = await next(params)
     const after = Date.now()
     if (after - before > 500) {
       console.log(`Slow query: ${params.model}.${params.action} took ${after - before}ms`)
     }
     return result
   })
   ```
2. Test logging works
3. Create dashboard for query metrics

**Verification:**
```bash
# Run app with query logging
npm run dev

# Check console for slow query logs
# Visit pages, trigger queries
# Verify slow queries are logged
```

**Rollback Plan:**
Remove logging middleware from Prisma client

**Dependencies:** None

---

## Phase Checkpoints

### Checkpoint 1: Quick Wins Complete ✅
**After Tasks 1-4:**
- [ ] All database indexes applied
- [ ] Parent dashboard loads in <1.5s
- [ ] Admin dashboard loads in <2s
- [ ] Static data cached (1-hour TTL)
- [ ] **Metrics:** 50-60% improvement in page load times

### Checkpoint 2: Bundle Optimization Complete ✅
**After Tasks 5-7:**
- [ ] Initial bundle <200KB gzipped
- [ ] Per-route bundle <100KB gzipped
- [ ] Heavy libraries lazy-loaded
- [ ] **Metrics:** 20-30% reduction in bundle sizes

### Checkpoint 3: Advanced Features Complete ✅
**After Tasks 8-11:**
- [ ] Redis cache hit rate >80%
- [ ] ISR pages serving in <100ms
- [ ] Query payloads reduced by 20-30%
- [ ] Suspense boundaries on all dashboards
- [ ] **Metrics:** 30-40% additional improvement

### Checkpoint 4: Monitoring Complete ✅
**After Tasks 12-13:**
- [ ] Web Vitals tracked
- [ ] Performance dashboard active
- [ ] Slow query logging enabled
- [ ] Alerts configured
- [ ] **Metrics:** Full visibility into performance

---

## Success Metrics

### Performance Targets
| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Admin Dashboard Load | 4-5s | <2s | **60%** |
| Parent Dashboard Load | 3-4s | <1.5s | **63%** |
| Teacher Dashboard Load | 2-3s | <1s | **67%** |
| API Response Time (p95) | ~1s | <500ms | **50%** |
| Database Query Time (p95) | ~400ms | <200ms | **50%** |

### Bundle Size Targets
| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Initial JS Bundle | ~400KB | <200KB | **50%** |
| Per-Route Bundle | ~150KB | <100KB | **33%** |
| First Contentful Paint | ~2.5s | <1.8s | **28%** |
| Largest Contentful Paint | ~4s | <2.5s | **38%** |

---

## Testing Strategy

### Performance Testing
```bash
# Run Lighthouse CI on every PR
npm run lighthouse

# Thresholds:
# Performance score: >90
# FCP: <1.8s
# LCP: <2.5s
# CLS: <0.1
```

### Load Testing
```bash
# Install k6
brew install k6

# Run load test
k6 run load-test.js

# Scenario: 100 concurrent users, 10 minutes
# Success: <5% error rate, p95 latency <2s
```

### Regression Testing
```bash
# Run full test suite after each task
npm run test

# Ensure no functionality broken
npm run build
npm run lint
```

---

## Rollback Strategy

Each task is independently reversible:

1. **Database Changes (Task 1, 10):**
   ```bash
   npx prisma migrate rollback
   ```

2. **Code Changes (All other tasks):**
   ```bash
   git revert <commit-hash>
   git push origin staging
   ```

3. **Emergency Rollback:**
   ```bash
   # If critical issues detected
   git reset --hard HEAD~1
   git push origin staging --force
   ```

**Rollback Triggers:**
- Error rate increases >10%
- p95 latency regresses >20%
- User complaints spike
- Critical functionality broken

---

## Next Steps

1. **Review this plan** and approve task breakdown
2. **Set baseline measurements** before starting
3. **Start with Task 1** (database indexes) - must be first
4. **Complete Phase 1** (Tasks 1-4) for quick wins
5. **Measure impact** after each task
6. **Iterate** based on real-world data

---

**Prepared by:** Claude Sonnet 4.5 (Planning and Task Breakdown)
**Status:** ✅ READY FOR IMPLEMENTATION
**Total Effort:** 40-60 hours over 4 weeks
**Expected Impact:** 50-70% improvement in page load times
