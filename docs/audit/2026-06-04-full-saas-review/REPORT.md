# Full SaaS Review — Running Report

**Run start:** 2026-06-04 overnight. Branch: `main` @ f705bf0e. tsc baseline: 0 errors.

> Live log. Each pass appends findings → fixes → verification. Final summary at bottom once 4 passes complete.

---

## Pre-flight findings (recon)
- **F0.1** `App.tsx`: `/reset-password/:token` + `/spotify-callback` declared in 2 Switch blocks. → investigated in Pass 1, NOT a defect (see below).

---

## PASS 1 — Structural / Build Integrity
**Discovery:** 10 area-auditors (Explore agents), read-only. **Baseline:** tsc 0, suite 56 fail/16108 pass.

### Fixed
- **P1-1 [HIGH]** `client/src/components/bankroll/StopBanner.tsx:94` — loss-stop banner CTA "Aproveitar para revisar mãos" linked to `/study` (not in route table → silent Wouter 404). → `/estudos`.
- **P1-2 [MEDIUM]** `server/services/homeHeuristics.ts:113` — Home heuristic "ROI 30d caiu… Revisar seleção de torneios" `ctaHref` was `/tournament-selector` (dead route). Selector lives in `/grade-planner`. → `/grade-planner`. Test `tests/services/homeHeuristics.test.ts:88` updated to assert corrected route (was guarding the dead link).
- **P1-3 [MEDIUM]** `server/routes/admin.ts:62` — `GET /api/admin/users` select omitted `lastLogin`; `AdminUsers.tsx:390` reads `user.lastLogin` → column always blank. Added `lastLogin: users.lastLogin` (column exists schema.ts:71).

### Investigated → not a defect / out of scope
- **F0.1 [dropped]** Two `<Switch>` blocks = public (unauth) vs authenticated layout. Intentional, not a duplicate.
- **P1-4 [LOW]** `SubscriptionDemo.tsx` calls 3 non-existent endpoints. Page NOT routed → unreachable dev demo. No user flow. No fix.
- **P1-5 [LOW]** `AdminCoachAnalytics.tsx` fetches missing `/api/admin/coach/feedback-stats`. Page NOT routed → dead. Wiring needs endpoint built (new work). Out of scope.

**Verification:** tsc 0. homeHeuristics 17/17 green.

---
