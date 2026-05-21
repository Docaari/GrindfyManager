# Sprint: home-reform-completion (audit)

## Status
Audit-only — **veredito: NOTHING-TO-DO (founder mental model stale)**.

Founder solicitou completar home-reform-2/3/4. Apuracao via `git log` + `grep` mostra
que TODAS as RFs+items dessas tres ondas estao **shipped, em uso e nao regredidas**
em commits 2026-05-03/04. Ondas subsequentes (home-reform-5 + audits + variance-1 +
UX-QW-2) refinaram/substituiram alguns componentes de forma planejada (rename), nao
regressao.

Nao ha RF novo a implementar neste sprint. Recomendacao: `/verify` visual review
da Home pelo founder; se confirmar gap visual, abrir spec especifico (home-reform-6
ou bugfix dedicado).

---

## 1. Audit Status — evidencia commit-by-commit

### 1.1 home-reform-2 (Onda 2 — heuristicas + storage real + timezone)

Commit fonte: **`4eda9738`** (2026-05-03) "feat(home): Sprint home-reform-2".

DoD §12 do spec (`Docs/specs/home-reform-2.md` linha 783):

| Item DoD | Status | Evidencia |
|---|---|---|
| 5 wrappers em `server/storage.ts` retornam dados reais (RF-32: `getProfileStateForDay`, `getCurrentBankroll`, `getActiveCooldown`, `getActiveFlightSeries`, `getPendingStarredHands`) | shipped | `4eda9738` adiciona; consumidos em `server/routes/home.ts` linhas 405-413 (timed Promise.allSettled). |
| `home.ts` chama `storage.getUserTimezone` + Intl.DateTimeFormat (RF-33) | shipped | `server/routes/home.ts` retorna `meta.userTimezone`; Home.tsx linha 363 consome. |
| Payload `/api/home/overview` inclui `topDeltas, variance, tournamentRecommendations, heuristics, meta.userTimezone` | shipped (modulo nota *) | `home.ts:912-914` retorna `topDeltas`, `variance`, `heuristics`. `meta.userTimezone` presente. *Nota:* `tournamentRecommendations` foi substituido em home-reform-4 item 5 por `GradeTodayCard` (decisao registrada em `home-reform-4.md` linha 29). |
| 4 componentes React novos em `client/src/components/home/` com testes RTL | shipped | `StatsTopDeltas.tsx`, `VarianceCard.tsx`, `HeuristicsCard.tsx`, `EmptyPerformanceCluster.tsx` (todos importados em Home.tsx linhas 52-57; render em Zone 3 linha 494-498). |
| Servico `homeHeuristics.ts` puro com 4 regras + testes unit | shipped | Consumido em `home.ts:743-781`. |
| Subqueries novas respeitam timeout 800ms + Promise.allSettled | shipped | `home.ts` usa wrapper `timed()` + `unwrap()` indexada (linhas 462-463). |
| Empty states corretos para cada bloco | shipped | `EmptyPerformanceCluster` (Home.tsx:490). |
| Tracker events emitidos | shipped | `emit('home_view')` linha 311 + `emit('home_profile_detected')` linha 322. |
| ADR-108 + ADR-109 escritos | shipped | `Docs/architecture/decisions/`. |
| Diagrama Mermaid Onda 2 | shipped | `Docs/architecture/diagrams/home-reform-2-flow.mermaid` (referenciado no spec). |
| `npm run check` + vitest total verde + zero regressao | shipped | Commit 4eda9738 push origin/main. |
| Commit caveman + push origin main | shipped | `4eda9738` em main. |

**Conclusao home-reform-2:** 100% shipped. Variance ate foi ressuscitado posteriormente em **variance-1 (ff5b6470)** quando o stub voltou a aparecer (lesson learned: "stub null em storage.ts substituido por query real 90d + FX cascade").

---

### 1.2 home-reform-3 (Onda 3 — zoning + news consolidation + quick wins)

Commit fonte: **`b598d8cf`** (2026-05-03) "feat(home): Sprints home-reform-3 + home-reform-4 item 11".

Checklist §17 validacao final do spec ja marca todos os itens `[x]`. Verificacao independente:

| RF | Status | Evidencia |
|---|---|---|
| RF-A1 — Header reduzido + cumprimento contextual | shipped | `HomeHeader` (Home.tsx:372-376) recebe `firstName/timezone/streakDays`. Component em `client/src/components/home/HomeHeader.tsx`. |
| RF-A2 — 4 zonas semanticas (Hoje/Acao/Performance/Sinal Externo) | shipped | Home.tsx ja tem 5 zonas (incluindo Estudos como zona 4 explicita): `home-zone-today` (411), `home-zone-action` (432), `home-zone-perf` (471), `home-zone-estudos` (505), `home-zone-news` (517). Zoning estendido pos home-reform-5 (item 7 Dashboard All Time + Estudos isolado). |
| RF-A3 — StatusStrip sticky | shipped | `data-testid="sticky-status-strip"` Home.tsx:400 com classes `sticky top-0 z-30 backdrop-blur-sm bg-background/85`. HeaderStrip (home-reform-5 item 2) substitui StatusStrip quando payload disponivel (linha 403-407), com fallback gracioso para StatusStrip. |
| RF-A5 — `EmptyPerformanceCluster` | shipped | `client/src/components/home/EmptyPerformanceCluster.tsx` + render Home.tsx:490. Threshold = `topDeltas==[] AND variance==null AND heuristics==[]` (linha 358-361). |
| Bloco B (News Consolidation, RF-B1..RF-B10) | shipped+evoluido | `NewsFeed.tsx` consolidou 5 secoes em 1. Endpoint `/api/news/feed` ativo. **Refactor adicional:** sprint **news-3 (f05ad82b)** religou RSS+X + sprint home-reform-5 item 10 (3efb0f2a) renomeou + 5 chips + carousel. |
| Bloco C (Quick Wins) — fix link "Hoje", destaque grade S, badge "Ja na grade" | shipped | `TournamentRecommendationCard` foi substituido por `GradeTodayCard` (home-reform-4 item 5) que herdou semantica. Badges e link "Hoje" presentes em `HeaderStrip`/`TodayCard`. |

**Conclusao home-reform-3:** 100% shipped. Bloco B evolutivamente refatorado em sprints subsequentes (news-3, home-reform-5 item 10) sem regressao funcional.

---

### 1.3 home-reform-4 (11 items)

Status tracker §"Status Tracker" do spec (`Docs/specs/home-reform-4.md` linha 23):

| # | Item | Spec | Reality (commit) | Status atual |
|---|---|---|---|---|
| 1 | Card "Sessoes" mes atual — fix tamanho/espaco | Concluido 2026-05-03 | `3f85e730` (SessionsMonthCard) -> substituido em home-reform-5 item 6 por `SessionsRegisteredCard` (6147ad5b) | shipped (renomeado/expandido) |
| 2 | Card "Dashboard" mes atual | Concluido 2026-05-03 (unificado com item 6) | `1bf208f2` (DashboardMonthCard) -> substituido em home-reform-5 item 7 por `DashboardAllTimeCard` (5c791de4) | shipped (renomeado/expandido) |
| 3 | Explicacao "Acao imediata" | Concluido 2026-05-03 (entrega inline doc, sem codigo) | `0d0eb3b8` (commit conjunto items 5+3 — doc inline) | shipped (doc) |
| 4 | Coach IA recomendacao semanal | Pendente (no spec) | **`75d13ec8`** (2026-05-03) — coach_lesson_recommendations + cron + CoachRecommendationCard + 5 ADRs 111-115 + migration 0042 | shipped |
| 5 | Visao rapida grade planner | Concluido 2026-05-03 | `0d0eb3b8` (GradeTodayCard) — Home.tsx:445-465 | shipped |
| 6 | Performance abaixo de Sessoes com empty states | Concluido 2026-05-03 (unificado com item 2) | `1bf208f2` + `0dc52852` (MonthEvolutionChart) -> evoluiu em home-reform-5 itens 6/7 (per-session detail + All Time chart) | shipped |
| 7 | Card Estudos: 3 stats foco do mes + temas linkados | Pendente (no spec) | **`a8da8111`** (2026-05-04) — user_focus_stats + FocusStatsCard + migration 0043 + 21 audit issues | shipped |
| 8 | Remover card "4 torneios, 2 sessoes, 1 dia ativo" | Concluido 2026-05-03 | `3d5a0957` (remove LifetimeStats card) | shipped |
| 9 | Card "Ultimas Sessoes" reorder | Concluido 2026-05-03 | `0dc52852` (RecentSessionsList reorder) | shipped |
| 10 | Dashboard com grafico evolucao mes | Concluido 2026-05-03 | `0dc52852` (MonthEvolutionChart) -> substituido em home-reform-5 item 7 por `AllTimeEvolutionChart` (5c791de4) | shipped (renomeado) |
| 11 | News: cards nao aparecem, links "Link nao encontrado" | Concluido 2026-05-03 | `b598d8cf` (junto com home-reform-3) | shipped |

**Conclusao home-reform-4:** 11/11 shipped (incluindo os 2 itens "Pendentes" no spec — item 4 em `75d13ec8` e item 7 em `a8da8111`). Founder informacao 17 dias defasada.

---

### 1.4 Sprints subsequentes que tocaram Home (informativo, fora de escopo deste sprint)

Listado para registro completo de cenario atual:

| Sprint | Commit | Toca em |
|---|---|---|
| home-reform-5 item 1 (FlightBanner removed) | `6b1b6895` | Home.tsx |
| home-reform-5 item 2 (HeaderStrip) | `c93fdbf1` + `04463abe` | Home.tsx + HeaderStrip.tsx |
| home-reform-5 item 3 (coachContext) | `a29b82ec` | TodayCard + NextTournamentCountdown + payload |
| home-reform-5 item 4 (ImmediateAction) | `7d00949c` | ImmediateAction.tsx + payload |
| home-reform-5 item 5 (Grade do Dia 1o + Ultimo registro) | `58e4424f` | GradeTodayCard ajustes |
| home-reform-5 item 6 (Sessoes Registradas — rename Performance) | `6147ad5b` | SessionsRegisteredCard.tsx |
| home-reform-5 item 7 (Dashboard All Time + chart) | `5c791de4` | DashboardAllTimeCard + AllTimeEvolutionChart |
| home-reform-5 item 10 (News rename + chips + carousel) | `3efb0f2a` | NewsFeed.tsx |
| home-reform-5 item 11 (settings gear visibility toggles) | `fc420cfe` | HomeSettingsGear + visibility filter Home.tsx |
| home-reform-5 audit (18 review issues) | `1b87064f` + `e776fd38` | varios |
| Duplicate SessionsMonthCard cleanup | `37c4268d` | Home (remove SessionsMonthCard duplicado) |
| variance-1 (religou KPI variance) | `ff5b6470` | storage.getVarianceVsExpected real (era stub null) |
| news-3 (RSS+X refactor) | `f05ad82b` | server news + NewsFeed |
| UX-QW-2 (empty states + lens chips) | `38e3184d` | varios incluindo home empty states |

Total: ~14 sprints/audits subsequentes refinaram a Home depois do 2026-05-04.

---

## 2. Veredito

**Resultado:** nenhuma RF/item de home-reform-2/3/4 esta em estado `partial`, `regressed` ou `missing`. Founder mental model esta defasado em ~17 dias.

**Causa provavel do mismatch mental:** founder lembra dos commits originais (2026-05-03) mas pode estar olhando o `Status Tracker` da spec de home-reform-4 (`Pendente` para itens 4 e 7) que NUNCA foi atualizada para "Concluido" depois dos shipments `75d13ec8` e `a8da8111`. Sugiro corrigir o tracker da spec como nice-to-have (LOW prio).

### Diferencas planejadas (NAO regressao) entre spec original e codigo atual

- `tournamentRecommendations` (planejado em home-reform-2) foi substituido por `GradeTodayCard` (home-reform-4 item 5 — decisao registrada no spec).
- `SessionsMonthCard` (home-reform-4 item 1) foi renomeado/expandido em `SessionsRegisteredCard` (home-reform-5 item 6) com 6 KPIs + per-session breakdown.
- `DashboardMonthCard` (home-reform-4 item 2) foi renomeado/expandido em `DashboardAllTimeCard` (home-reform-5 item 7) com escopo All Time.
- `MonthEvolutionChart` (home-reform-4 item 10) foi renomeado/expandido em `AllTimeEvolutionChart` (home-reform-5 item 7).
- `StatusStrip` (home-reform-3 RF-A3) ainda existe como fallback mas o componente primario virou `HeaderStrip` (home-reform-5 item 2). Ambos em uso.

### Dead code candidato (NAO confirmado dead)

- **Nenhum** dos 27 componentes em `client/src/components/home/` esta sem referencia. Validacao:
  - `HomeSettingsGear` -> usado em `HomeHeader.tsx:111`.
  - `NewsPreferencesDialog` -> usado em `NewsFeed.tsx:490`.
  - `Sparkline` (em components/home/) -> usado em `StatusStrip.tsx:19`.
  - `StatusStrip` -> ainda usado como fallback em `Home.tsx:406`.
  - Todos os outros (DailyInsight, CoachRecommendationCard, EmptyHomeOnboarding, GradeTodayCard, PendingHandsList, etc) -> importados diretamente em Home.tsx.

### Recomendacao

1. **Founder rodar /verify (visual review) da Home (`/`).** Se identificar gap visual concreto, abrir um spec especifico (home-reform-6 ou fix-home-XYZ).
2. **Atualizar `Docs/specs/home-reform-4.md` linha 28 + 31** trocando "Pendente" por "Concluido (2026-05-03/04, commits `75d13ec8` / `a8da8111`)" — chore documentacional pequeno (5min). Pode ser executado neste mesmo sprint OU fica para depois.
3. **Nao iniciar pipeline TDD.** Nao ha RF a testar/implementar.

---

## 3. Escopo Final do Sprint

### Lista de RFs realmente a implementar

**Nenhum RF de codigo.** Sprint sem entregaveis funcionais.

### Unica acao opcional (chore docs)

#### RF-DOC-01 (opcional, low prio) — atualizar Status Tracker do home-reform-4.md

**Descricao:** Trocar "Pendente" -> "Concluido (commit)" nos items 4 e 7 do Status Tracker
para refletir realidade. Adicionar nota informativa de superseding/rename para items 1/2/9/10.

**Criterio de aceite:**
- [ ] `Docs/specs/home-reform-4.md` linha 28 (item 4) status = `Concluido (2026-05-03)` + ref a commit `75d13ec8`.
- [ ] `Docs/specs/home-reform-4.md` linha 31 (item 7) status = `Concluido (2026-05-04)` + ref a commit `a8da8111`.
- [ ] (opcional) Nota apos a tabela: "Items 1, 2, 9, 10 foram expandidos em home-reform-5 itens 6/7 (rename `SessionsMonthCard -> SessionsRegisteredCard`, `DashboardMonthCard -> DashboardAllTimeCard`, `MonthEvolutionChart -> AllTimeEvolutionChart`)".

**Arquivos afetados:** `Docs/specs/home-reform-4.md` (1 arquivo, doc-only).

**Restricoes founder respeitadas:** sem server, sem schema, sem GradePlanner/GrindSession/Tickets, sem coach write.

**Estimativa:** 5 min (sem pipeline TDD — UI doc puro).

---

## 4. Estimativa Pipeline

| Cenario | Estimativa |
|---|---|
| Nothing-to-do (recomendado) | 0h (apenas reportar veredito + /verify pelo founder) |
| RF-DOC-01 (chore docs) executado | 5min |
| Founder confirmar gap visual via /verify -> novo spec | ~30min de spec + pipeline TDD apenas se for fix real |

---

## 5. Pos-condicoes

- Spec gerado em `Docs/specs/sprint-home-reform-completion.md`.
- Nenhum codigo alterado.
- Tasks `#1` audit + `#2` verify pendente do founder.

## 6. Proximo Passo Recomendado

1. Founder roda `/verify` na Home (`/`) navegando pelas 5 zonas (Inicio, Acao Imediata, Sessoes Registradas, Estudos, Noticias) + interagindo com HeaderStrip + abrindo HomeSettingsGear (engrenagem) + checando se HeaderStrip, ImmediateAction, GradeTodayCard, CoachRecommendationCard, SessionsRegisteredCard, DashboardAllTimeCard, AllTimeEvolutionChart, FocusStatsCard, NewsFeed renderizam com dados reais.
2. Se algo visual quebrado for confirmado por /verify, abrir spec especifico (home-reform-6 ou fix dedicado).
3. (Opcional) Executar RF-DOC-01 para limpar tracker do home-reform-4.md.
