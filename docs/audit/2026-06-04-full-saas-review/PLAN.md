# Full SaaS Review — Master Plan

**Started:** 2026-06-04 (overnight autonomous run)
**Operator:** Claude (central orchestrator) + multi-agent fan-out
**Working tree:** `B:/grindfy` on `main` (serves localhost:3000)
**Mandate:** Hunt every bug, broken flow, dead button/link, missing polish, flow gap. Fix HIGH→minimum. NO new features. 4 full passes. Document everything.

## Operating rules (autonomy decisions, AFK)
- All edits on `B:/grindfy` main tree (hosts localhost:3000). ✅ confirmed by founder.
- Commit locally after each pass (reversible). **Do NOT `git push`** — only irreversible/shared action in the autonomy contract; left as 1-click for morning review.
- Fixes partitioned by area → no two fix-agents touch same files (memory entanglement lessons).
- Baseline at start: `tsc` = **0 errors**. Full test suite baseline captured below.
- Browser visual click-through skipped: extension requires user to click "Connect" (AFK). Substituted by static analysis + full test suite + HTTP smoke against live :3000 + multi-agent code audits.

## Codebase surface
- 41 Wouter routes (App.tsx), 42 page files, 70 server route modules, 585 components.
- 5 product modules: Análise de Dados, Assistente de Grind, Coach AI, Bankroll, Tournament Selector.

## Audit areas (non-overlapping partition for safe parallel fixes)
1. **AUTH** — login/register/forgot/reset/verify/confirmation + server/routes/auth
2. **DASH** — Dashboard, Analytics, Home + dashboard/analytics routes
3. **TOURN** — TournamentLibraryNew, UploadHistory, GradePlanner + tournament/library/upload routes
4. **GRIND** — GrindSession, GrindSessionLive, SessionHistory, MentalPrep, Flight + grind routes
5. **COACH** — coach-ai, CoachAI, CoachOnboarding, WeeklyReportView, coach/* + coach routes
6. **BANK** — Bankroll + bankroll/wallet routes
7. **STUDY** — Studies, estudos/*, biblioteca/* + study/calendar routes
8. **METAS** — metas/* + goals routes
9. **CALC** — Calculadoras, CalculadoraPopup + calc libs
10. **ADMIN** — Settings, Subscriptions, admin/* + admin/subscription/notification routes

## 4 passes (rotating lens — each adds new value, not repetition)

### Pass 1 — STRUCTURAL / BUILD INTEGRITY
Per area, find: dead routes (CTA/Link target not in route table — lesson #19/#23), dead buttons (onClick/onSubmit unwired or no-op), frontend `apiRequest`/fetch URL with no matching backend route, missing exports/dead imports, duplicate routes, tsc errors, failing tests.
→ Fix all build-breaking + dead-link + dead-button. Commit.

### Pass 2 — BACKEND CONTRACT / DATA INTEGRITY
Per area route module: auth guard present, Zod validation before ops, try/catch+status error handling, storage method actually exists, §6.1 (`grind_session_id IS NULL`) compliance, unhandled promise/missing await, N+1. HTTP smoke: hit each GET endpoint on live :3000, catch 500s.
→ Fix. Commit.

### Pass 3 — FRONTEND FLOW / UX POLISH
Per page+modal: loading/empty/error states present (ErrorBoundary — lesson #29), form validation feedback, mutation cache invalidation (lesson #21), broken redirects/404 flows, modal open/close correctness, disabled-state correctness.
→ Fix. Commit.

### Pass 4 — REGRESSION + CROSS-CUTTING + FINAL VERIFY
Re-run full tsc + test suite. Re-audit every fix from passes 1-3 (no regressions). Deep cross-cutting sweep (shared utils, auth middleware, query client config). Final consolidated report.
→ Fix any regressions. Commit. Write FINAL REPORT.

## Per-pass loop
discovery workflow (10 area-auditors parallel, structured JSON findings) → triage/dedupe/prioritize → partitioned fixes → verify (tsc + targeted tests) → commit → append to REPORT.md.

## Convergence (founder directive: more rounds if needed)
4 passes is the MINIMUM. After pass 4, if any HIGH/MEDIUM remains open, run additional rounds (Pass 5, 6, …) until a full pass surfaces **zero new HIGH/MEDIUM**. Only then stop.

## Frontend verification method (no real browser, no new deps)
- **Every page**: jsdom + RTL render-smoke (mount with QueryClientProvider + memory router, mocked `apiRequest`) → asserts mounts without throw, primary buttons/modals present.
- **Every button**: static check each `onClick`/`onSubmit` is wired to a real handler (not no-op/undefined) + the action's target exists (route in table, or endpoint registered).
- **Every modal**: open trigger wired, close path present, content renders.
- Existing 600+ client RTL tests = regression signal.
- Real-browser visual pass deferred to founder morning check (MCP extension needs manual "Connect").

## Severity scale
HIGH = broken/crashes/data-wrong/security · MEDIUM = degraded UX/flow gap · LOW = polish/inconsistency · INFO = note.
Target: HIGH→LOW all fixed. INFO documented.
