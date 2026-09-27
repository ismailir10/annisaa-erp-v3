# API Standards

> Loaded on demand by `/build` when staged paths match `app/api/**`, `lib/validations/**`, or `proxy.ts`.

## GET Lists

Support: `?page=1&pageSize=20&search=X&sortBy=field&sortOrder=asc&status=Y`

Use: `lib/api/pagination.ts`, `lib/api/response.ts`

Response: `{ data: [...], pagination: { page, pageSize, total, totalPages } }`

## Mutations (POST/PUT/DELETE)

1. `getSession()` → auth check
2. `session.role` → role check
3. `tenantId` → tenant ownership
4. Zod validation with `validateBody(schema, await req.json())` (`lib/api/validate.ts`) — the schema lives in `lib/validations/**` so the admin form validates with the same one. Its 400 is `{ error: "Validasi gagal", errors: [{ field, message }] }`, which `applyServerErrors` maps onto form fields
5. Other errors: `{ error: "message" }` (business rules such as uniqueness stay in the route, after validation)

## Xendit calls

All Xendit API calls MUST go through `withXenditRetry` (`lib/xendit/with-retry.ts`). Do not call `createXenditSession()` directly except inside the helper. The retry helper provides:

- 3-attempt retry budget with backoff `[250ms, 1000ms]`
- Honors HTTP 429 `Retry-After` (capped at 3000ms)
- Classifies failures via `XenditApiError.code` (5xx/429/408/network → retriable; 401/403/422/4xx → hard)
- Structured `[XENDIT ATTEMPT]` log per attempt for ops grep

When persisting `paymentLinkError` after a final retry exhaustion, use `formatPaymentLinkError(e)` from `lib/xendit/error-prefix.ts` so the SQL aggregator at `GET /api/invoices/pending-payment-link/breakdown` can bucket by category. Landed 2026-04-27 in cycle `invoice-create-auto-retry`.
