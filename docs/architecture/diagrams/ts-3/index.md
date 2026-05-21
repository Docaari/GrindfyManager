# Sprint Tournament Selector 3 — Indice de Arquitetura

Spec: [`Docs/specs/sprint-tournament-selector-3.md`](../../../specs/sprint-tournament-selector-3.md)

Q-A..Q-N respondidas 2026-05-21 (founder delegou system-architect onde aplicavel). Pipeline TDD pode prosseguir: test-writer → implementer → reviewer.

---

## ADRs

| ADR | Titulo | Decisao em 1 frase |
|-----|--------|---------------------|
| [178](../../decisions/178-bankroll-tristate-mode.md) | Bankroll tristate semantics (RF-04) | Coluna `user_settings.tournament_selector_bankroll_mode VARCHAR(8) CHECK IN (all,hide,warn) DEFAULT 'warn'` (migration 0072), payload `bankrollWarning.reason ∈ {above_hard_limit, above_soft_limit}` extensible (so 2 valores hoje — `bankrollRules.ts` so tem hard/soft), alias deprecated `bankrollFilter` mantido. |
| [179](../../decisions/179-tournament-selector-calibration-dashboard.md) | Calibration dashboard + admin gate + a11y exception (RF-05) | Endpoint `GET /api/admin/tournament-selector/calibration?lookbackDays=N` `requirePermission('admin')` com `insufficientData` flag quando `totalAdds<50`, query JOIN `tournament_selector_logs ↔ tournaments` (externalId forte + heuristica datetime 14d/48h fallback), `grind_session_id IS NULL` §6.1, `expectedRoiPct` heuristico mid-point por grade, cache TTL 1h, a11y basico apenas. |
| [180](../../decisions/180-coach-tool-tournament-selector-consolidation.md) | Coach tool consolidation (Q-G RF-02) | Estender `get_tournament_suggestions` existente (NAO criar tool nova — overlap completo confirmado por leitura): +`source` +`bankrollMode` +`topN` no input, +`bankrollWarning` +`alreadyInGrid` no output, cache compartilhado com widget (`tournamentSelectorCache` extraido), telemetria dual (`coach_tool_invocations` + `tournament_selector_logs` `metadata.invokedBy='coach_tool'`), tier gate via `isToolEligibleTier` (ADR-167 — Trial passa). |

---

## Diagramas

| Arquivo | Tipo | Foco |
|---------|------|------|
| [`ts-3-c4-component.mermaid`](./ts-3-c4-component.mermaid) | C4 component | Topologia pos-Sprint 3: novos blocos (BankrollTristateFilter, CalibrationDashboard, tournamentSelectorCache extraido, get_tournament_suggestions ESTENDIDA) + relacoes com Coach AI / Bankroll / Telemetria. |
| [`ts-3-bankroll-tristate-flow.mermaid`](./ts-3-bankroll-tristate-flow.mermaid) | Sequence RF-04 | Read default `user_settings`, fallback `warn`, persist debounce 500ms, telemetria `metadata.bankrollMode`, cache-key fragmentado por modo, alias `bankrollFilter` traduzido. |
| [`ts-3-calibration-query-flow.mermaid`](./ts-3-calibration-query-flow.mermaid) | Sequence RF-05 | Admin auth + role check → cache TTL 1h → query JOIN dual matching (externalId forte + datetime heuristica) → discrepancy compute + warnings → `insufficientData` branch quando `totalAdds<50` → toggle lookback. |
| [`ts-3-coach-tool-cache-shared.mermaid`](./ts-3-coach-tool-cache-shared.mermaid) | Sequence RF-02 | LLM tool_use → `isToolEligibleTier` (Trial+Pro+) → resolve `bankrollMode` (input → user_settings → fallback) → cache shared widget×tool → `alreadyInGrid` lookup → dual telemetria → register_tournament_in_grade follow-up. |
| [`ts-3-data-model-delta.mermaid`](./ts-3-data-model-delta.mermaid) | ER delta | Apenas o que muda: nova coluna `user_settings.tournament_selector_bankroll_mode` (migration 0072) + 3 payload extensions documentadas (`/api/tournament-selector` ganha `bankrollWarning`+`alreadyInGrid`, `/api/tournament-library` ganha `selectorGrade`+`selectorRationale`, `/api/admin/.../calibration` shape novo). |

---

## Migrations

- **0072** — `ALTER TABLE user_settings ADD COLUMN tournament_selector_bankroll_mode VARCHAR(8) NOT NULL DEFAULT 'warn' CHECK IN ('all','hide','warn')` (RF-04 / ADR-178).
- RF-05 (ADR-179) e RF-06 **NAO exigem migration** — query lê tabelas existentes + payload extension via recompute on-the-fly.

---

## RFs cobertos por estes artefatos

| RF | Artefatos |
|----|-----------|
| RF-01 supremaSyncRateLimit | (nenhum — fix isolado de 1 linha, sem decisao arquitetural) |
| RF-02 Coach tool consolidation | ADR-180 + `ts-3-coach-tool-cache-shared.mermaid` + `ts-3-c4-component.mermaid` |
| RF-03 ROI proprio no card | (sem ADR — UI refactor; dados ja no payload do Sprint 1) |
| RF-04 Bankroll tristate | ADR-178 + `ts-3-bankroll-tristate-flow.mermaid` + `ts-3-data-model-delta.mermaid` |
| RF-05 Calibration dashboard | ADR-179 + `ts-3-calibration-query-flow.mermaid` |
| RF-06 selectorGrade no payload library | (sem ADR — payload extension reusando `tournamentScorer.ts`; `ts-3-data-model-delta.mermaid` documenta o shape) |

---

## Decisoes de Q-G e Q-I (mandato pm-spec)

- **Q-G (overlap RF-02 com handlers existentes):** Opcao (a) — **estender `get_tournament_suggestions`**. Leitura de `getTournamentSuggestions.ts` confirmou: ja usa `tournamentScoringService.rankTournamentsForContext` (que reusa `computeTournamentScore`), output ja tem score/grade/confidence/rationale. Criar tool nova violaria DRY + confundiria LLM. `explainTournamentScore` confirmado ortogonal (explica vs recomenda). Ver ADR-180 §2.
- **Q-I (bankrollRules expansao):** Leitura de `bankrollRules.ts` confirmou: **so 2 regras** — `softLimitUSD` (rule pct × amount) + `hardLimitUSD` (softLimit × 1.5 BANKROLL_TOLERANCE). NAO ha kelly/BB%/variance. Enum `bankrollWarning.reason` precisa cobrir apenas `above_hard_limit` + `above_soft_limit`. Shape **extensible** (string discriminado, sem CHECK na coluna pois coluna nao armazena reason) para `above_<rule>` no futuro sem migration nova. Ver ADR-178 §1+§2.3.

---

## Proximos agentes

- **test-writer:** red phase a partir desta arquitetura + Acceptance Criteria do `sprint-tournament-selector-3.md`. Lessons criticas: #3 (mock shape real), #14/#26 (`await import` em tests `.tsx`), #28 (`vi.mock` path canonico), #34 (`injectedStorage?` em handlers novos).
- **implementer:** green phase. Reusar `tournamentScoringService` (NUNCA reimplementar scoring — ADR-147). Lessons: #6 (FX → USD normalize), #9 (log antes do fallback), #21 (`_resetCacheForTests`).
- **reviewer:** APPROVED-WITH-NITS standard pos `/simplify`. Foco: cache-key fragmentation, telemetria dual coverage, a11y exception bounds, matching heuristica false positives (RF-05).
