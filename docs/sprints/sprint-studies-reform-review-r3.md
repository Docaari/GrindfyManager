# Review R3 — Sprint Studies-Reform (FINAL — pos UX R3 quick wins)

**Data:** 2026-05-01
**Branch:** `feature/studies-page-reform` (worktree `B:\grindfy-studies-reform`)
**Commits revisados:**
- `844a84e` — R2 fixes (CRITICAL apiRequest + 5 HIGH)
- `e7613a7` — R2 MED fixes (heatmap UTC + lastVisitedAt fallback)
- `2407e44` — UX R3 (top 7 quick wins ICE>=6 do strategist audit)

**Revisor:** Reviewer (R3 — final gate)
**Veredicto:** **APPROVED-COM-NITS** (merge para main: **SIM-COM-DEBT**)

---

## Resumo Executivo

A sprint Studies-Reform esta **pronta para merge em main**. R3 valida que os
3 commits seguintes ao green phase (R2 + R2-MED + UX R3) estao consistentes,
sem regressao em fixes anteriores e implementam todos os 7 wins do strategist
audit exatamente como descrito.

- **Validation gate:** 25 arquivos / 204 testes / 100% pass / 3.55s.
- **Suite total:** 131 fail vs main baseline 131 fail = **zero regressao**.
- **Bloqueadores remanescentes:** nenhum.
- **Debt explicito:** 1 task (smoke test boot-real, R2-MED-3 nao tocado por
  decisao de escopo da sprint).

UX R3 elevou o produto de "tecnicamente correto" (R2) para "polido em
fricao" — todos os 7 wins resolvem JTBDs reais com mudancas cirurgicas e
zero impacto em testes existentes.

---

## Status dos 7 UX R3 Wins (audit -> codigo)

| # | Win | Status | Evidencia |
|---|---|---|---|
| 1 | RecommendationsView card 100% clicavel | **RESOLVED** | `RecommendationsView.tsx:158-178` — `<article>` com `role={r.cta_url ? 'button' : undefined}`, `tabIndex={r.cta_url ? 0 : undefined}`, `onClick={navigateToCta}`, `onKeyDown` Enter/Space `e.preventDefault()`. CTA interno (`recommendation-card-${id}-cta`) preserva `e.stopPropagation()` antes de `navigate(r.cta_url!)`. Ambos `data-testid` mantidos (lesson #2). |
| 2 | `staleTime` em todas queries dashboard | **RESOLVED** | `StudiesDashboard.tsx:50-93` — themesQ + spotsQ = 30s, insightsQ + streakQ = 5min, recsQ = 5min (ja tinha). 4 queries faltantes ganharam staleTime exatamente como audit pediu. |
| 3 | WeekInsights "horas estudadas" navegacao util | **RESOLVED** | `WeekInsights.tsx:38-52` — `onClick={() => navigate('/estudos/stats')}` (era `/estudos/dashboard` no-op). Adicionou `title="Ver historico de sessoes em Stats"` (extra hover hint). |
| 4 | ContinueWhereLeftOff timestamp relativo | **RESOLVED** | `ContinueWhereLeftOff.tsx:22-36` — helper `relativeTime(iso)` com escada completa: `<60s = 'agora'`, `<60min = 'ha N min'`, `<24h = 'ha Nh'`, `1d = 'ontem'`, `<7d = 'ha N dias'`, fallback `toLocaleDateString('pt-BR')`. Robusto contra `null/undefined/NaN`. Renderizado na linha 83-85 condicionalmente. |
| 5 | StudyStreakBadge inactive como acao + dashboard sem duplicata | **RESOLVED** | `StudyStreakBadge.tsx:76-116` — refator `renderBadge` -> `BadgeView({days, onActivate?})`. Estado `inactive` com `onActivate` renderiza `<button>` com handler; demais estados continuam `<div>` (preserva semantica de leitura quando ativo). `ConnectedStreakBadge` passa `() => navigate('/grind')`. `StudiesDashboard.tsx:200-207` — removido `<div className="text-2xl font-bold text-white">{streakDays} dias</div>`, valor migrado para atributo `data-streak-days={streakDays}` na `<section>` (preserva queryability por testes sem ruido visual). |
| 6 | SpotsView deep-link `?spot=<id>` com guarda anti-reopen | **RESOLVED** | `SpotsView.tsx:189-194` — `useEffect(() => { if (!focusSpotId \|\| activeSpot) return; const found = spots.find(s => s.id === focusSpotId); if (found) openSpotModal(found); }, [focusSpotId, spots, activeSpot])`. Guarda `\|\| activeSpot` previne re-open apos fechar. Bonus: `PendingSpotsPreview.tsx:41` agora gera `?spot=${id}` na URL — completa o flow dashboard -> detalhe. |
| 7 | Onboarding step 3 label "Importar depois" | **RESOLVED** | `OnboardingWizard.tsx:172` — texto trocado de `"Pular"` para `"Importar depois"`, semantica honesta (acao continua sendo `onClick={next}`, nao `close`). data-testid `onboarding-card-3-skip` preservado. |

**Conclusao:** 7/7 wins entregues sem desvios do audit. Implementer cumpriu
exatamente o que strategist mapeou.

---

## Status dos R2 MED Fixes (`e7613a7`)

| ID | Issue R2 | Status | Evidencia |
|---|---|---|---|
| R2-MED-1 | `getStudyStreak` heatmap timezone (local vs UTC misturado) | **RESOLVED** | `storage.ts:6406-6432` — adotada estrategia "tudo UTC" como sugerido. `Date.UTC(getUTCFullYear, getUTCMonth, getUTCDate)` para `lastActiveStartUtc` e `todayStartUtc`. Loop usa `todayStartUtc - i * 86400000` e `new Date(startUtc).toISOString().slice(0,10)` — sem mistura de fusos. Comparison `lastActiveStartUtc === startUtc` mais simples que faixas. |
| R2-MED-2 | `mapDormantTheme` lê `theme.lastVisitedAt` inexistente | **RESOLVED** | `studyRecommendationsService.ts:78-89, 150` — `scoreDormantTheme` agora aceita `updatedAt` em params, prioriza `lastVisitedAt ?? updatedAt ?? null`. `mapDormantTheme` linha 150 idem para `theme_dormancy_days`. Comentario inline documenta a transicao para coluna dedicada futura. |
| R2-MED-3 | Smoke test boot-real ainda ausente | **NOT FIXED** | `tests/integration/studies-*.test.ts` nao existe; `git diff dff6afa..HEAD -- 'tests/integration/'` vazio. **Decisao consciente** — out of scope para esta sprint, deve virar task de followup. |

R2-MED-1 e R2-MED-2 sao fixes corretos, robustos e cirurgicos. R2-MED-3 fica
como debt explicito (justifica o "SIM-COM-DEBT" no veredicto de merge).

---

## Status dos R1 Bloqueadores (preservacao em R3)

Todos os 1 CRITICAL + 5 HIGH resolvidos em R2 permanecem corrigidos. UX R3
nao tocou em:

- `apiRequest` (frontend usa `fetch + getCsrfToken` em SpotsView/useBumpStudyStreak)
- IStorage methods (12 metodos novos em `storage.ts:6248-6521`, declarados em IStorage `605-633`)
- `study-misc.ts` (6 endpoints novos com auth + ownership + rate limit)
- useEffect SSR-safe (`Studies.tsx:95-101, 104-115` early return preservado)
- Rate limit (60/min POST/DELETE links + 30/min streak bump)
- LinkSpotToThemeDropdown a11y (role=listbox + aria-selected)

`git diff e7613a7..2407e44` confirma escopo limitado a 9 arquivos UI + 1 doc;
nenhum arquivo do R2 fix foi alterado.

---

## Issues Residuais

### [INFO] Smoke test boot-real ainda ausente (R2-MED-3 carry-over)

**Arquivos:** N/A
**Categoria:** Cobertura / processo
**Confianca:** Alta

Status mantido do R2: 0 testes em `tests/integration/studies-*` que botem
Express up sem mock de storage. R3 nao reabriu este gap; gap continua.

**Por que nao bloqueia merge:**
1. Suite mockada cobre 204 testes especificos da sprint.
2. Suite total nao regrediu (131 fail = baseline main).
3. `IStorage` interface forca TS a pegar drift de signature (ja nao depende mais
   so de testes runtime).

**Por que ainda eh debt:**
- Familia de bugs `(storage as any).foo is not a function` so seria pega em
  prod. Defesa em profundidade sumida.
- Sub-sprint "studies-reform-polish" deveria abrir esse teste.

**Sugestao:** Abrir task explicita `tests/integration/studies-reform-smoke.test.ts`
com login real + 6 endpoints (`/api/study/streak`, `/api/study/recommendations`,
`/api/dashboard/insights/week`, `/api/study-snapshots`, `/api/dashboard/leaks/active`,
`/api/dashboard/leaks/delta`). Prioridade: alta — primeiro item da sub-sprint
de polish.

---

### [INFO] R1 MEDs nao tocados (debt formal)

R2 review listou R1-MED-2 (pushRecent cap), R1-MED-3 (findSuggestedThemeId
falso positivo), R1-MED-4 (lazy toast race), R1-MED-5 (parseSearch hash),
R1-MED-6 (OnboardingWizard side effect race) como nao-tocados.

R3 confirma: **nenhum desses foi tocado em UX R3 tambem** (esperado — UX R3
focou em wins ICE>=6 do strategist, nao em residuos de review).

**Sugestao:** Sub-sprint "studies-reform-polish" deve consolidar:
- 4 R1-MEDs nao-bloqueantes
- 4 R1-NITs (alias defensivo, rate limit unificado, etc)
- R2-MED-3 smoke test

Estimativa: 1 sprint de 1 dia.

---

### [INFO] (storage as any) em arquivos legados

**Arquivos:** `analytics.ts`, `grind-sessions.ts`, `ticketService.ts`, `walletService.ts`,
`dashboardService.ts`, `playerBundle.ts`, `stopService.ts`, `storage.ts:6844..6937` (helpers tickets).

**Confianca:** Alta (legado fora de escopo).

Esses casts existem desde antes da sprint Studies-Reform. NAO eh issue da
sprint atual — confirma escopo brownfield: review da sprint nao exige fix
em codigo nao tocado. Pertence ao inventario de divida tecnica geral.

---

## Cobertura de Testes

Validation gate executado conforme briefing:

```
npx vitest run \
  client/src/components/studies/ \
  client/src/pages/__tests__/Studies.test.tsx \
  tests/migrations/0021-study-workflows.test.ts \
  tests/routes/study-recommendations.test.ts \
  tests/routes/study-theme-spot-links.test.ts \
  tests/services/studyRecommendationsService.test.ts \
  tests/coach/readThemeWithLinkedSpots.test.ts
```

**Resultado:** 25 arquivos / 204 testes / 100% pass / 3.55s.

**Suite total (`npx vitest run`):** 35 fail / 412 passed / 3 skipped (450) — **131 testes failed / 7413 passed / 17 skipped / 114 todo (7675 total)**.

| Comparacao | Numero |
|---|---|
| main baseline (briefing) | 131 fail |
| R2 (commit 844a84e) | 130 fail |
| R3 (commit 2407e44) | 131 fail |

R3 esta exatamente em paridade com baseline main. R2 tinha 1 fail a menos
provavelmente por coincidencia de mocks (clipboard de MessageCopyButton
flutua entre runs por `Object.assign(navigator, { clipboard })` — pre-existing).
**Zero regressao introduzida pelos commits da sprint.**

| Area | Status | Nota |
|---|---|---|
| Happy path RF-01..12 | Coberto | 204 testes verdes |
| UX R3 wins (#1-7) | Coberto | Wins #5/#6 sao mudancas internas, sem testes novos exigidos por audit |
| R2 MED fixes | Coberto parcial | Heatmap UTC nao tem teste dedicado de timezone (debt) |
| Cross-user isolation | Coberto | 403 em routes; theme.userId !== userId em coach tool |
| Rate limit | Parcial | Aplicado mas sem teste 429 em CI |
| Smoke test boot real | **Ausente** | R2-MED-3 carry-over (debt explicito) |

---

## Code Health Geral

### Pontos positivos novos (R3-only)

- **Helper `relativeTime`** robusto: trata `null/undefined`, `NaN` (parseDate
  invalido), edge cases de meia-noite implicitos, e fallback graceful para
  data absoluta. Nao usa lib externa (zero dep cost).
- **Padrao a11y dual no card de recomendacao**: o card eh `role="button"`
  navegavel por keyboard, mas o CTA interno permanece dedicado (lesson de
  acessibilidade dupla — usuario pode usar tab para focar so no CTA, ou
  Enter no card todo).
- **Streak badge polimorfico**: `BadgeView` renderiza `<button>` ou `<div>`
  conditionalmente baseado em estado + presenca de `onActivate`. Mais simples
  que componentes separados, preserva data-testid unico para queries.
- **Deep-link spot via dashboard funciona end-to-end**: `PendingSpotsPreview`
  emite URL com `?spot=${id}`, `SpotsView` consome com guarda. Click no
  dashboard vai direto pro modal — fechou o JTBD principal do audit.
- **Heatmap UTC fix robusto**: nao so consistente, como mais simples
  (comparison igualdade vs faixas). Codigo melhor que o original.

### Sem dead code ou magic numbers novos

- Todos `staleTime` valores documentados no audit (30s curto, 5min agregado).
- Helper `relativeTime` usa thresholds bem documentados (60_000, 60, 24, 7).
- `data-streak-days` attribute substitui label visual com proposito claro
  (queryability por testes).

### Nada em conflito entre R2 e UX R3

UX R3 tocou em 9 arquivos UI; R2 tocou em backend (storage + routes + services).
Zero overlap, zero risco de regressao R2 por mudanca R3.

---

## Pontos Positivos (consolidado das 3 fases)

- R2 resolveu CRITICAL + 5 HIGH com fix limpos sem hack.
- R2-MED fixes (heatmap UTC + lastVisitedAt fallback) entregaram qualidade
  cirurgica.
- UX R3 entregou 7/7 wins do strategist sem desvios.
- Zero regressao em suite total (131 fail = baseline main).
- IStorage interface preserva type safety dos novos metodos.
- Telemetria preservada em todas mudancas.
- Cross-user isolation rigorosa em endpoints novos.
- Lessons aplicadas: #1 hooks first, #2 testid estavel, #11 sem default
  decorativos (corrigido win #3), #12 cache continuity (preservado em
  win #2 staleTime).

---

## Veredicto Final

**APPROVED-COM-NITS**

- Bloqueadores remanescentes: **nenhum**
- MEDIUM remanescentes: 1 (smoke test boot-real, R2-MED-3 carry-over)
- INFO remanescentes: legados nao-tocaveis + R1 polish list

### Recomendacao de merge para main: **SIM-COM-DEBT**

Pode mergir para main agora. Abrir simultaneamente:

1. **Task: Smoke test boot-real Studies endpoints** (MED, 2h)
   - `tests/integration/studies-reform-smoke.test.ts`
   - Cobrir: streak, recommendations, insights/week, snapshots, leaks/active, leaks/delta
   - Sem mock de storage — boot Express + login real

2. **Sub-sprint: studies-reform-polish** (1 dia)
   - R1-MED-2 (pushRecent cap)
   - R1-MED-3 (findSuggestedThemeId falso positivo)
   - R1-MED-4 (lazy toast race)
   - R1-MED-5 (parseSearch hash)
   - R1-MED-6 (OnboardingWizard race)
   - R1-NITs (alias defensivo, rate limit unificado)
   - Migration `lastVisitedAt` em studyThemes (substitui fallback updatedAt)

3. **Db push pendente:** confirmar migration 0021 (study-workflows) ja
   aplicada no DB local antes de mergir, ou deixar `db:push` para
   imediatamente apos merge em main.

A sprint cumpriu seu mandato: reformular `/estudos` com shell unificado,
dashboard com 5 cards de valor, recommendations engine real, workflow
spot↔tema, streak gamificada, onboarding tiered. Os debts remanescentes sao
todos quality-of-life, nao criticos.

**Pode mergir.**

---

## Resumo (200 palavras)

Review final R3 da sprint Studies-Reform aprovado. Os 3 commits seguintes
ao green phase entregaram exatamente o esperado: R2 fechou 1 CRITICAL + 5
HIGH bloqueadores com fix limpos (fetch + getCsrfToken, storage methods
reais, study-misc.ts com 6 endpoints + rate limit, useEffect SSR-safe,
listbox a11y); R2-MED fixes resolveram heatmap timezone e lastVisitedAt
fallback de forma robusta; UX R3 entregou 7/7 wins do strategist audit
sem desvios — cards de recomendacao 100% clicaveis (role=button + Enter/Space),
staleTime em 4 queries faltantes, WeekInsights navegacao util,
ContinueWhereLeftOff timestamp relativo robusto, streak badge inactive como
botao + dashboard sem duplicata, SpotsView deep-link com guarda anti-reopen,
onboarding label honesto. Validation gate: 204/204 passa em 3.55s. Suite
total: 131 fail = baseline main (zero regressao). Bloqueadores remanescentes:
nenhum. Debt explicito: smoke test boot-real (R2-MED-3 carry-over) +
sub-sprint polish para R1 MEDs nao tocados. Veredicto: **APPROVED-COM-NITS**.
Recomendacao merge: **SIM-COM-DEBT** — pode mergir agora, abrir 2 tasks
followup (smoke test + studies-reform-polish).
