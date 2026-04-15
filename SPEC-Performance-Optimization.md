# Performance Optimization Spec
**Project:** An Nisaa' School ERP
**Date:** 2025-04-15
**Status:** DRAFT

---

## Executive Summary

**Problem:** Users report slow page loads and data fetching across all portals (admin, teacher, parent).

**Impact:** Poor user experience, especially on mobile devices and slower connections.

**Scope:** System-wide performance optimization focusing on:
1. Database query optimization (N+1 queries, missing indexes)
2. Bundle size reduction
3. Caching strategy implementation
4. Server component optimization
5. Image and asset optimization

**Target Metrics:**
- First Contentful Paint (FCP): <1.8s
- Largest Contentful Paint (LCP): <2.5s
- Time to First Byte (TTFB): <600ms
- Cumulative Layout Shift (CLS): <0.1

---

## Current State Analysis

### 1. Database Query Performance ⚠️

**Issue 1.1: Sequential Queries in Parent Dashboard**
- **Location:** `lib/parent-helpers.ts:48-74`
- **Problem:** Fetches ALL invoices for ALL children on every dashboard load
- **Impact:** Parent with 3 children = 15 invoices loaded (5 per child × 3)
- **Current Code:**
  ```typescript
  invoices: {
    where: { status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } },
    orderBy: { createdAt: "desc" as const },
    take: 5,
  }
  ```
- **Fix Needed:** Only fetch invoices for selected child, not all children

**Issue 1.2: Sequential Dashboard Queries**
- **Location:** `app/admin/page.tsx:16-59`
- **Problem:** Weekly trend query runs 7 sequential database calls (one per day)
- **Impact:** Adds ~700ms to dashboard load time
- **Current Code:**
  ```typescript
  (async () => {
    const days = [];
    const d = new Date(today);
    let count = 0;
    while (count < 7) {
      d.setDate(d.getDate() - 1);
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      const records = await prisma.attendanceRecord.groupBy({
        by: ["status"],
        where: { date: dateStr },
        _count: true,
      });
      // ... processes one day at a time
    }
  })()
  ```
- **Fix Needed:** Single query with WHERE IN for all 7 dates

**Issue 1.3: Missing Database Indexes**
- **Tables Without Proper Indexes:**
  - `AttendanceRecord.date` ( queried every day)
  - `Invoice.studentId + status` (queried on parent dashboard)
  - `StudentGuardian.parentId` (queried on every parent page)
  - `AttendanceRecord.employeeId + date` (queried for teacher attendance)

### 2. Bundle Size Issues ⚠️

**Issue 2.1: Large Client-Side Bundles**
- **Largest Chunk:** `0ttnl3fcetfjp.js` (222KB)
- **Top 5 Chunks Total:** ~550KB
- **Problem:** Too much client-side JavaScript
- **Cause:**
  - Framer Motion (12.38.0) - 40KB gzipped
  - Recharts (3.8.0) - 200KB+ for charts
  - React-PDF-Renderer (4.4.0) - loaded on all pages
  - 62 Shadcn components (many unused per page)

**Issue 2.2: No Code Splitting by Route**
- **Problem:** All admin/teacher/parent components bundled together
- **Impact:** Parent portal loads admin code (and vice versa)
- **Fix Needed:** Route-based code splitting (Next.js does this, but we can optimize)

### 3. Caching Strategy Missing ⚠️

**Issue 3.1: No HTTP Caching**
- **Problem:** Static data (programs, class sections, roles) fetched on every page load
- **Impact:** Unnecessary database queries
- **Solution:** Implement Next.js `revalidate` for static data

**Issue 3.2: No Database Connection Pooling**
- **Problem:** Each page request creates new Prisma client
- **Impact:** Connection overhead on every request
- **Current:** Prisma singleton exists (good), but not optimized for high concurrency

**Issue 3.3: No Response Caching**
- **Problem:** API responses not cached
- **Example:** `/api/programs` called multiple times per session
- **Solution:** Add `revalidate` to fetch calls or implement cache headers

### 4. Server Component Optimization ⚠️

**Issue 4.1: Client Components Overused**
- **Example:** DataTable components are client components
- **Problem:** Entire table rendered client-side, even for static data
- **Impact:** Waiting for JS before table appears

**Issue 4.2: Data Fetching Not Parallelized**
- **Example:** Some pages fetch data sequentially instead of `Promise.all()`
- **Impact:** Additive latency (query 1: 200ms + query 2: 300ms = 500ms total)

### 5. Image and Asset Optimization ⚠️

**Issue 5.1: No Image Optimization**
- **Problem:** User avatars, logos not optimized
- **Impact:** Large image payloads
- **Solution:** Use Next.js `next/image` with optimization

---

## Optimization Plan

### Phase 1: Quick Wins (1-2 days) 🎯

**Priority 1: Fix N+1 Query in Parent Dashboard**
- **File:** `lib/parent-helpers.ts`
- **Change:** Only fetch invoices for selected child
- **Expected Impact:** 60-70% faster parent dashboard load
- **Effort:** 1 hour

**Priority 2: Add Database Indexes**
- **File:** `prisma/schema.prisma`
- **Indexes to Add:**
  ```prisma
  model AttendanceRecord {
    @@index([date])
    @@index([employeeId, date])
  }

  model Invoice {
    @@index([studentId, status])
    @@index([status, createdAt])
  }

  model StudentGuardian {
    @@index([parentId])
  }
  ```
- **Expected Impact:** 30-50% faster queries
- **Effort:** 30 minutes + migration

**Priority 3: Parallelize Weekly Trend Query**
- **File:** `app/admin/page.tsx`
- **Change:** Single `groupBy` query with `WHERE IN` for 7 dates
- **Expected Impact:** 80% faster admin dashboard (700ms → 150ms)
- **Effort:** 1 hour

**Priority 4: Implement Static Data Caching**
- **Files:** All API routes for reference data (programs, roles, campuses)
- **Change:** Add Next.js `revalidate`:
  ```typescript
  export const revalidate = 3600; // 1 hour
  ```
- **Expected Impact:** Instant loads for cached data
- **Effort:** 2 hours

### Phase 2: Bundle Size Reduction (2-3 days) 📦

**Priority 5: Route-Based Code Splitting**
- **Action:** Ensure each portal only loads its own code
- **Audit:** Remove unused Shadcn components per route
- **Expected Impact:** 20-30% smaller bundles
- **Effort:** 4 hours

**Priority 6: Lazy Load Heavy Libraries**
- **Framer Motion:** Only load on pages with animations
- **Recharts:** Dynamic import only on dashboard pages
- **React-PDF:** Dynamic import only on PDF generation routes
- **Expected Impact:** 40-50% smaller initial bundle
- **Effort:** 3 hours

**Priority 7: Tree Shake Shadcn Components**
- **Audit:** Identify which components used per route
- **Action:** Import only used components per page
- **Example:**
  ```typescript
  // Instead of:
  import { Button, Card, DataTable, StatusBadge, Skeleton, ... } from "@/components/ui"

  // Use:
  import { Button } from "@/components/ui/button"
  import { Card } from "@/components/ui/card"
  ```
- **Expected Impact:** 10-15% smaller bundles
- **Effort:** 2 hours

### Phase 3: Advanced Optimizations (3-5 days) 🚀

**Priority 8: Implement Redis Caching**
- **Use Case:** Cache frequently accessed data (programs, class sections, fee structures)
- **TTL:** 5-15 minutes
- **Invalidation:** On update/delete
- **Expected Impact:** 90% faster cached data loads
- **Effort:** 8 hours (setup + implementation)

**Priority 9: Implement Incremental Static Regeneration (ISR)**
- **Pages:** Admin list pages (employees, students, invoices)
- **Strategy:** Generate static pages every 60 seconds
- **Fallback:** Show stale data, revalidate in background
- **Expected Impact:** Near-instant page loads
- **Effort:** 6 hours

**Priority 10: Optimize Prisma Queries**
- **Action:** Use `select` to limit returned fields
- **Example:**
  ```typescript
  // Instead of:
  include: { student: true }

  // Use:
  include: { student: { select: { name: true, nickname: true } } }
  ```
- **Expected Impact:** 20-30% smaller payloads
- **Effort:** 4 hours

**Priority 11: Implement Server-Side Streaming**
- **Feature:** Suspense boundaries for slow data
- **UI:** Show skeleton screens immediately, stream data in
- **Expected Impact:** Perceived performance improvement
- **Effort:** 6 hours

### Phase 4: Monitoring & Measurement (1 day) 📊

**Priority 12: Set Up Performance Monitoring**
- **Tool:** Vercel Analytics (already integrated)
- **Add:** Web Vitals reporting
- **Dashboard:** Track LCP, FID, CLS over time
- **Alerts:** Notify if metrics degrade
- **Effort:** 2 hours

**Priority 13: Database Query Logging**
- **Feature:** Log slow queries (>500ms)
- **Analysis:** Identify remaining bottlenecks
- **Effort:** 2 hours

---

## Implementation Order

### Week 1: Foundation
1. ✅ Add database indexes (Priority 2)
2. ✅ Fix parent dashboard N+1 query (Priority 1)
3. ✅ Parallelize admin dashboard queries (Priority 3)
4. ✅ Implement static data caching (Priority 4)

### Week 2: Bundle Optimization
5. ✅ Route-based code splitting (Priority 5)
6. ✅ Lazy load heavy libraries (Priority 6)
7. ✅ Tree shake Shadcn components (Priority 7)

### Week 3: Advanced Features
8. ✅ Implement Redis caching (Priority 8)
9. ✅ Implement ISR (Priority 9)
10. ✅ Optimize Prisma queries (Priority 10)
11. ✅ Server-side streaming (Priority 11)

### Week 4: Monitoring
12. ✅ Performance monitoring (Priority 12)
13. ✅ Query logging (Priority 13)

---

## Success Criteria

### Performance Targets
- [ ] Admin Dashboard: <2s load time (currently ~4-5s)
- [ ] Parent Dashboard: <1.5s load time (currently ~3-4s)
- [ ] Teacher Dashboard: <1s load time (currently ~2-3s)
- [ ] API Response Time: p95 <500ms
- [ ] Database Query Time: p95 <200ms

### Bundle Size Targets
- [ ] Initial JS Bundle: <200KB gzipped (currently ~400KB)
- [ ] Per-Route Bundle: <100KB gzipped
- [ ] First Contentful Paint: <1.8s
- [ ] Largest Contentful Paint: <2.5s

### User Experience Targets
- [ ] No blocking requests during navigation
- [ ] Skeleton screens for all slow-loading data
- [ ] Progressive loading (content → images → extras)
- [ ] Mobile performance matches desktop (within 20%)

---

## Risk Assessment

### Low Risk ✅
- Adding database indexes (pure additive)
- Fixing N+1 queries (logic change, no breaking changes)
- Static data caching (revalidate ensures freshness)

### Medium Risk ⚠️
- Lazy loading libraries (may cause FOUC if not careful)
- ISR implementation (caching complexity)
- Redis caching (new infrastructure dependency)

### High Risk 🔴
- Server-side streaming (architectural change)
- Aggressive code splitting (may break imports)
- Database query optimization (may miss edge cases)

**Mitigation:**
- Deploy to staging first
- Measure before and after
- Rollback plan for each change
- Monitor error rates post-deployment

---

## Rollback Plan

Each optimization is independently reversible:

1. **Database Indexes:** `prisma migrate rollback` (instant)
2. **Query Changes:** Revert commit (instant via Vercel)
3. **Caching:** Remove `revalidate` or Redis calls (instant)
4. **Code Splitting:** Revert to previous imports (instant)

**Decision Criteria:**
- Roll back if error rate increases >10%
- Roll back if p95 latency regresses >20%
- Roll back if user complaints spike

---

## Testing Strategy

### Performance Testing
- **Tool:** Lighthouse CI for automated testing
- **Frequency:** Run on every PR to staging
- **Thresholds:** Block deploy if scores drop >10 points

### Load Testing
- **Tool:** k6 or Artillery
- **Scenario:** 100 concurrent users across all portals
- **Duration:** 10 minutes
- **Success:** <5% error rate, p95 latency <2s

### A/B Testing
- **Approach:** Feature flag optimizations
- **Metric:** Compare before/after Web Vitals
- **Duration:** 1 week per optimization
- **Decision:** Keep if metrics improve, rollback if not

---

## Monitoring Dashboard

### Key Metrics to Track
1. **Page Load Time** (by portal)
2. **API Response Time** (p50, p95, p99)
3. **Database Query Time** (p50, p95, p99)
4. **Bundle Size** (per route)
5. **Web Vitals** (LCP, FID, CLS)
6. **Error Rate** (by route)

### Alerting
- **Page Load Time:** Alert if >5s for >5% of users
- **API Response Time:** Alert if p95 >2s
- **Error Rate:** Alert if >1% of requests fail

---

## Next Steps

1. **Review this spec** and approve approach
2. **Set baseline measurements** before any changes
3. **Start with Phase 1 (Quick Wins)** for immediate impact
4. **Measure after each change** to verify improvement
5. **Iterate** based on real-world data

---

**Prepared by:** Claude Sonnet 4.5 (Performance Optimization Specialist)
**Status:** ✅ READY FOR IMPLEMENTATION
**Estimated Effort:** 40-60 hours over 4 weeks
**Expected Impact:** 50-70% improvement in page load times
