/**
 * Shared rate-limit budgets for API routes.
 *
 * Per-route constants live here so multiple routes that share a budget
 * (e.g. C4 walas weekly POST + C5 sentra session POST both write to
 * AssessmentEntry) can import the same numbers without cross-route
 * coupling.
 */

// Tap-friendly: 60 writes/min/IP. Walas weekly UI taps once per
// student-indicator pair; sentra session POSTs a whole session at once
// but the throttling window still protects against runaway clients.
export const PENILAIAN_WRITE_BUDGET = 60 as const;
export const PENILAIAN_WRITE_WINDOW_MS = 60_000 as const;
