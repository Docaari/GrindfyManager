# Sprint Studies-Reform — Status Report Final

**Data:** 2026-05-01
**Branch:** `feature/studies-page-reform` (worktree `B:\grindfy-studies-reform`)
**Status:** APPROVED-COM-NITS — pronto para merge em main com debt rastreado.

---

## RFs entregues (12)

| RF | Descricao | Status |
|----|-----------|--------|
| RF-01 | Studies wrapper reformado (sidebar/bottom-nav/Cmd+K) | DONE |
| RF-02 | StudiesDashboard 5 cards | DONE |
| RF-03 | ThemesView com filtro fromStats | DONE |
| RF-04 | StatsView wrapper | DONE |
| RF-05 | SpotsView + workflow link spot-tema | DONE |
| RF-06 | RecommendationsView + service | DONE |
| RF-07 | Coach tool read_theme_with_linked_spots (tier-gated) | DONE |
| RF-08 | Cross-user isolation (linkSpotToTheme + getLinkedSpots) | DONE |
| RF-09 | QuickSearchPalette (Cmd+K) | DONE |
| RF-10 | EmptyState personalizados por area | DONE |
| RF-11 | OnboardingWizard (4 steps + skip auto se tem dados) | DONE |
| RF-12 | StudyStreakBadge + bump endpoint | DONE |

---

## Defaults D1-D12

Todas seguidas conforme prompt original (ver memory `session_2026-05-01-studies-reform.md`).

---

## Suite de testes

- **Studies-Reform:** 204/204 verdes (3.55s)
- **Suite total:** 131 fail = baseline main (zero regressao)
- Comando:
  ```
  cd /b/grindfy-studies-reform && npx vitest run client/src/components/studies/ client/src/pages/__tests__/Studies.test.tsx tests/migrations/0021-study-workflows.test.ts tests/routes/study-recommendations.test.ts tests/routes/study-theme-spot-links.test.ts tests/services/studyRecommendationsService.test.ts tests/coach/readThemeWithLinkedSpots.test.ts
  ```

---

## Commits (7 ahead de main)

1. `dff6afa` feat(studies-reform): research + spec + ADRs (Phases 1-3)
2. `09c0e6e` test(studies-reform): red phase 147 tests across 18 files (Phase 4)
3. `c581efa` feat(studies-reform): green phase (Phase 5)
4. `34ed52e` refactor(studies-reform): simplify pass post-green phase
5. `844a84e` fix(studies-reform): R2 fixes CRITICAL apiRequest + HIGH storage/endpoints/SSR/rate-limit/a11y
6. `e7613a7` fix(studies-reform): R2 MED fixes — heatmap UTC + lastVisitedAt fallback
7. `2407e44` feat(studies-reform): UX R3 - top 7 quick wins ICE>=6

---

## Reviews

- **R1:** 1 CRITICAL + 6 HIGH + 5 MED + 4 INFO + 2 NIT — `Docs/sprints/sprint-studies-reform-review-r1.md`
- **R2:** APPROVED-COM-NITS (todos R1 RESOLVED, 3 MEDs novos) — `Docs/sprints/sprint-studies-reform-review-r2.md`
- **R3:** APPROVED-COM-NITS final — `Docs/sprints/sprint-studies-reform-review-r3.md`
- **UX audit:** top 7 wins ICE>=6 — `Docs/sprints/sprint-studies-reform-ux-audit.md`

---

## Files novos/modificados (resumo)

### Frontend
- `client/src/pages/Studies.tsx` (REFORMED wrapper)
- `client/src/components/studies/{StudiesNavSidebar,StudiesBottomNav,navItems,ThemesView,StatsView,SpotsView,StudyStreakBadge,EmptyState,QuickSearchPalette}.tsx`
- `client/src/components/studies/dashboard/{StudiesDashboard,ContinueWhereLeftOff,WeekInsights,PendingSpotsPreview,RecommendationsPreview}.tsx`
- `client/src/components/studies/recommendations/RecommendationsView.tsx`
- `client/src/components/studies/onboarding/OnboardingWizard.tsx`
- `client/src/components/studies/workflow/{LinkSpotToThemeDropdown,SuggestedThemeSidePanel}.tsx`
- `client/src/hooks/{useBumpStudyStreak,useStudyActivityInvalidation}.ts`
- `client/src/lib/url.ts`

### Backend
- `server/routes/{study-recommendations,study-theme-spot-links,study-misc}.ts`
- `server/services/studyRecommendationsService.ts`
- `server/coachTools/readThemeWithLinkedSpots.ts`
- `server/storage.ts` (+12 methods novos em IStorage + DatabaseStorage)
- `server/coachTools/index.ts`, `server/routes/index.ts` (registry)

### Shared
- `shared/spot-theme-mapping.ts`
- `shared/schema.ts` (study_theme_spot_links + users.study_streak_days/lastStudyActivityAt)

### Migrations
- `migrations/0021_studies_reform.sql` + `0021_studies_reform_rollback.sql`

---

## Pendente antes/apos merge

1. **db:push 0021** — aplicar migration em DB local (founder + dev). Aplicado via psql ou drizzle-kit.
2. **Push origin** — pendente autorizacao founder.

## Debts rastreados (post-merge)

1. **R2-MED-3 — smoke test boot-real** (~2h) — testar 6 endpoints novos sem mock de storage.
2. **studies-reform-polish sub-sprint** (~1 dia) — R1 MEDs nao tocados (pushRecent cap, parseSearch hash, lazy toast race, OnboardingWizard race, findSuggestedThemeId fuzzy).
3. **Schema lastVisitedAt** — adicionar coluna em studyThemes; remove fallback `?? updatedAt`.
4. **getStatsLeaks impl real** — wire detection via hud_stats_snapshots.

## Compatibilidade com sprints paralelas

- StatsAnalyzerTab e Hud* (Sess 3 — feature/stats-analyzer-v3-grouped-ocr) NAO tocados. Wrapper /estudos/stats trata como caixa preta.
- Bankroll-3 + Reports-Detail (Sess 5 — feature/bankroll-standalone-reports-grind-detail) NAO tocados. Zero overlap.
- Migration 0021 nao colide com 0020 (Stats V3) ou 0022 (Bankroll Reports).

---

## Lessons learned aplicadas

- #1 hooks first, #2 data-testid estavel, #3 mocks idealizados (armadilha real — green phase passou com `(storage as any)` mas storage methods nao existiam; smoke test boot-real teria pego), #5 vi.fn()/vi.mock TDZ (resolvido com lazy dynamic import + `toast` direct export), #9 try/catch + log antes do fallback, #11 sem default actions decorativas (UX R3 wins #3, #5, #7), #12 cache continuity (UX R3 win #2 staleTime).
