# Sprint Grind Live + Tickets cluster

**Data:** 2026-05-21
**Estado base:** pos AI-3.1 commit `6d9c1be8` origin/main
**Modo:** caveman full
**PM-Spec output. Bias: cortar trabalho ja feito. Documentar gaps reais.**

---

## Sumario executivo

4 RFs investigados. 3 ja **majoritariamente shipped** (parcial), 1 **shipped subset** (TTS) + restante alerts polish. Sprint D = **gaps especificos**, NAO refazer foundation.

| RF | Spec base | Status real | Decisao |
|---|---|---|---|
| RF-01 grind-live-addon-ux | `grind-live-addon-ux.md` | **SHIPPED ~95%** (addon UX completo + KPI currency-aware ja em SessionDashboard) | **SKIP feature ; INCLUIR 2 gaps minor (retroativo CompletedCard + tooltip default-minimo)** |
| RF-02 grind-live-break-auto-open | `grind-live-break-auto-open.md` | **SHIPPED 100%** (toggle + helpers + migration 0050 + BreakAutoOpenToggle + 11 refs) | **SKIP — feature completa, nada a fazer** |
| RF-03 satellite-tickets-management | `satellite-tickets-management.md` | **SHIPPED Tickets-1 + Tickets-2 parcial** (RF-01..05 + RF-06 helpers OK ; RF-07 selector boost MISSING ; RF-08 coach context MISSING ; RF-09 cron MISSING ; RF-10 notifs MISSING ; RF-11 cancel UI OK ; RF-13 telemetria parcial) | **INCLUIR — 5 gaps reais (cron, notifs, coach context, selector boost, telemetria sweep)** |
| RF-04 generic-alerts-system | `generic-alerts-system.md` | **SHIPPED ~85%** (SessionAlertManager + AlertsPanel + tipo tournament alem dos 2 spec'd + TTS extras pos-spec) | **INCLUIR 3 gaps (clear-all toast, dismissed cleanup, re-fire UX edge)** |

**Escopo sprint final:** RF-03 gaps (5 itens) + RF-01 polish (2 itens) + RF-04 polish (3 itens) = **10 work items**.
**Effort estimado:** S+M+S = 1-2 dias TDD.
**RF-02 OFF (zero work).**

---

## RF-01 grind-live-addon-ux

### Status real

**SHIPPED ~95%**. Evidencia:

- `TournamentCard.tsx:56` prop `onAddOnTaken?: (tournamentId: string, value: boolean) => void` ✓
- `TournamentCard.tsx:226-235` badges Plus/ReA renderizadas ✓
- `TournamentCard.tsx:278-299` botao toggle verde/dourado com `addOnState.disabled` ✓
- `TournamentCard.tsx:541,722,727` CompletedCard ja exibe estado ✓
- `GrindSessionLive.tsx:566` `const handleAddOnTaken = ...` ✓
- `GrindSessionLive.tsx:2685` `onAddOnTaken={handleAddOnTaken}` plugado ✓
- `SessionDashboard.tsx:119-138` KPI Add-ons Pagos com `stats.addOnsPaid.count`/`totalUSD`/`byCurrency`/`hasMissingRate` — **mais robusto que spec original** (FX-aware) ✓
- Migration `0007_addon_reentry_cols_pending.sql` ✓
- ADR-014 ✓

### Gaps reais (subset escopo Sprint D)

#### Gap RF-01.1 — Add-on retroativo em CompletedCard

**Onde:** `TournamentCard.tsx:722,727` ja mostra estado mas **falta toggle ativo** quando torneio finalizado.

**Spec original §7 caso 10:** "v1: via EditDialog" — aceito como limitacao. **Founder UX hint:** jogador termina torneio, lembra do add-on, hoje precisa abrir EditDialog (3 cliques) em vez de 1 clique no card.

**Criterio aceite (Given/When/Then):**
- Given torneio status=finished + `allowsAddOn=true` + `addOnTaken=false`
- When user clica botao `+ Add-on retroativo` no CompletedCard
- Then PUT `/api/session-tournaments/:id` com `addOnTaken=true` + toast "Add-on registrado retroativamente" + KPI atualiza
- And botao some, badge "+ Add-on pago" aparece

**Effort:** S (1h). Reusa `handleAddOnTaken` ja existente.

**Decisao:** INCLUIR — barato + UX win.

#### Gap RF-01.2 — Tooltip default-minimo no Plus badge

**Onde:** `TournamentCard.tsx:227` badge Plus sem `title`/`Tooltip`.

**Spec original §7 caso 14:** mensagem clara "Configure o custo do add-on primeiro" pendente. Hoje user ve badge mas nao entende o que e "Plus".

**Criterio aceite:**
- Given badge "Plus" renderizado
- When user hover
- Then Tooltip mostra "Torneio com add-on disponivel ($X). Clique no botao verde durante o break para pagar."

**Effort:** XS (15min).

**Decisao:** INCLUIR — gratis.

### O que NAO inclui

- Mutation duplicada, refatoracao addon (ja feito)
- Multiplos add-ons (out-of-scope spec original)
- Toggle em planejamento (`planned_tournaments`) — spec original v1 nao inclui

---

## RF-02 grind-live-break-auto-open

### Status real

**SHIPPED 100%**. Evidencia:

- `client/src/components/grind-session/break-clock-helpers.ts` ✓ (helpers puros BRT)
- `client/src/components/grind-session/BreakAutoOpenToggle.tsx` ✓ (toggle component)
- `shared/schema.ts` 2 refs `breakAutoOpenEnabled` ✓
- Migration `0050_break_auto_open_enabled.sql` ✓
- `GrindSessionLive.tsx` 8 refs BreakFeedbackPopup/breakAutoOpen + 11 refs lastTriggerHourKey/wasAutoOpened/shouldAutoOpenAtClock/shouldAutoCloseAtClock ✓
- ADR-124 ✓

### Gaps reais

Nenhum gap acionavel detectado na investigacao. Spec aprovada + implementada. Bug "feedbacks pararam" do contexto da spec ja resolvido pelo deploy do auto-open.

### Decisao

**SKIP TOTAL.** Zero work no Sprint D para RF-02.

**Caveat:** se founder reportar regressao na verify, abrir spec de correcao separada (`fix-break-auto-open-XXX.md`).

---

## RF-03 satellite-tickets-management

### Status real

Spec original tem 13 RFs (RF-01..RF-13). Status por RF:

| RF spec | Status | Evidencia |
|---|---|---|
| RF-01 tabela tickets | **SHIPPED** | Migration `0008_tickets_foundation.sql` + `server/services/ticketService` + ADR-037 |
| RF-02 outcome 3-way no live | **SHIPPED** | `SatelliteResultDialog.tsx:17` `outcome ∈ {ticket, cash, nopass}` + `data-testid="satellite-outcome-ticket"` |
| RF-03 registro manual | **SHIPPED** | `client/src/components/tickets/RegisterTicketDialog.tsx` + POST `/api/tickets` |
| RF-04 widget dashboard | **SHIPPED** | `TicketsWidget.tsx` montado em `GradePlanner.tsx:817` (NAO Dashboard — desvio spec, aceitar) |
| RF-05 pagar com ticket | **SHIPPED** | `RegisterPaymentDialog.tsx` + `useTicketMatchesForTournament` hook + `TournamentCard.tsx:641-642` plugado |
| RF-06 effectiveBuyIn helper | **SHIPPED** | `shared/ticketScoring.ts:getEffectiveBuyIn` + ADR-036 |
| RF-07 selector boost | **MISSING** | grep `server/scoring` por `availableTicket\|ticketBoost` = 0 matches |
| RF-08 coach context | **MISSING** | grep `server/coach` por `buildTicketsContext\|TICKETS_CONTEXT` = 0 matches |
| RF-09 cron expiracao | **MISSING** | glob `server/jobs/expireTickets*` = no files |
| RF-10 notifs ticket_expiring/expired | **MISSING** | grep `server` por `ticket_expiring` = 0 matches |
| RF-11 cancel manual | **SHIPPED** | `TicketsWidget.tsx:45` `confirmingCancelId` + PATCH `/api/tickets/:id/cancel` |
| RF-12 FIFO match | **SHIPPED** | sort em `ticketScoring.ts` + `RegisterPaymentDialog` ja ordena |
| RF-13 telemetria | **PARCIAL** | nao verificado evento-a-evento; provavel ticket_won_logged OK, ticket_used OK, demais MISSING |

**Resumo:** Tickets-1 + Tickets-2 (consumption) **DONE**. **Falta Tickets-3 inteiro** (RF-07 + RF-08 + RF-09 + RF-10 + sweep telemetria).

### Gaps reais (incluir no Sprint D)

#### Gap RF-03.1 — Cron de expiracao (RF-09 spec)

**Onde:** criar `server/jobs/expireTickets.ts` + wire no cronRunner existente.

**Criterio aceite (Given/When/Then):**
- Given tickets com `status='available'` + `expiresAt < NOW()`
- When cron diario roda (1x/dia 03:00 UTC)
- Then UPDATE para `status='expired'` + idempotente (rodar 2x = no-op no 2o run)
- And zero wallet side-effects
- And logs cada execucao com count de tickets afetados

**Pontos atencao:**
- Pattern de cronRunner: ver `server/cronRunner.ts` existente, padrao igual aos jobs do Coach (B-GAPCHECK, B-IMPORT)
- Gate por `COACH_NUDGES_ENABLED`? — **decisao Q-A** (sugest: NAO, expiracao nao e nudge, e housekeeping)
- Lesson #9 — try/catch granular + log antes de fallback

**Effort:** M (3-4h).

**Decisao:** INCLUIR.

#### Gap RF-03.2 — Notificacoes in-app (RF-10 spec)

**Onde:** integrar no cron RF-03.1 + table `notifications` (existente).

**Criterio aceite:**
- Given cron rodando RF-03.1
- When ticket sera expirado em 48h (passa de >48h pra <=48h na janela do run)
- Then cria 1 notification `type='ticket_expiring'` priority=`medium` titulo "Ticket expirando em breve" + deep_link `/grade-planner#tickets`
- And tambem cria `type='ticket_expired'` ao virar expired
- And dedupe: nao recria notification do mesmo ticket+type ja existente nas ultimas 7 dias

**Effort:** S (1-2h ; reusa cron RF-03.1).

**Decisao:** INCLUIR (junto com RF-03.1).

#### Gap RF-03.3 — Coach AI context block (RF-08 spec)

**Onde:** criar `server/coach/contextBuilders/buildTicketsContext.ts` + injetar em `server/coach/coachSystemBuilder.ts` ou `coachContext.ts`.

**Criterio aceite:**
- Given user com >=1 ticket `status='available'`
- When system prompt eh montado E (a) conversa contem keyword `ticket|satelite|grade|selecionar torneio` OU (b) feature explicitamente solicitada
- Then bloco injetado:
  ```
  Inventario ativo: N tickets (total $X USD).
  Proximos a expirar: <name> ($Y) em Z dias, ...
  ```
- And cache key Anthropic respeita injection condicional (ver lesson #10 — DRY prompts, sem divergencia silenciosa)
- And bloco vazio quando 0 tickets active

**Pontos atencao:**
- Reusa `getActiveTicketsByUser` do storage
- NAO mexer no system prompt base — append ao final como bloco DINAMICO (padrao Coach existente)
- Cache: bloco DINAMICO ja eh `cache_control: ephemeral` no padrao Coach atual

**Effort:** S (1-2h).

**Decisao:** INCLUIR.

#### Gap RF-03.4 — Tournament Selector boost (RF-07 spec)

**Onde:** `server/scoring/buildScoringInput.ts` + tournament-selector route + UI badge no card.

**Criterio aceite:**
- Given user com >=1 ticket `available` matching torneio listado
- When `GET /api/tournament-selector` retorna scoring
- Then cada item ganha campo `availableTicket: { id, valueUSD, expiresAt } | null`
- And `score += 10` (clamp 100) quando availableTicket != null
- And bankroll filter bypass: torneio com ticket aparece mesmo se `effectiveBuyIn > maxBuyIn` (porque effective com ticket = 0)
- And UI card badge "🎟️ Ticket disponivel ($X)" no SelectorPanel

**Pontos atencao:**
- **PROIBIDO mexer em `server/services/scoring*.ts`** (escopo Sprint B ; conferir antes de tocar)
- Verificar quem owns scoring agora — pode ser `server/scoring/buildScoringInput.ts` (foi mexido em AI-0A)
- Se conflito de ownership: **defer pra Sprint dedicado** (sugest Q-B)

**Effort:** M (3-4h se ownership claro ; bloqueado se nao).

**Decisao:** INCLUIR CONDICIONAL — confirmar ownership antes (Q-B).

#### Gap RF-03.5 — Telemetria sweep (RF-13 spec)

**Onde:** auditar callsites e adicionar eventos faltantes.

**Eventos a auditar:**
- `ticket_won_logged` (RF-02) — verificar
- `ticket_manually_registered` (RF-03) — verificar
- `ticket_used` (RF-05) — verificar
- `ticket_expired` (RF-09) — **add no cron RF-03.1**
- `ticket_cancelled` (RF-11) — verificar
- `ticket_offered_in_register_dialog` (RF-05) — verificar
- `ticket_widget_viewed` (RF-04) — verificar

**Criterio aceite:**
- Cada evento dispara no momento certo + payload conforme spec original §RF-13 tabela
- Eventos vao para `user_activity` table

**Effort:** S (1-2h sweep + add).

**Decisao:** INCLUIR.

### Riscos RF-03

- **Race RF-03.1 vs notifs duplicadas:** se cron crasha entre UPDATE tickets e INSERT notification, proximo run nao recria (dedupe 7d). Aceitavel.
- **RF-03.4 ownership:** se scoring foi mudado em sprint paralelo, merge pode quebrar. Mitigar via Q-B antes de impl.
- **Lesson #36:** se RF-03.3 tests mockam `db` parcial, lazy import de schema necessario.

---

## RF-04 generic-alerts-system

### Status real

**SHIPPED ~85%**. Evidencia:

- `shared/generic-alerts.ts` ✓ `SessionAlertManager` + `SessionAlert` + 3 types `late-reg | custom | tournament` (1 a mais que spec — `tournament` extra)
- `AlertsPanel.tsx` ✓ com TTS extras (Sprint Alarmes 2.0 pos-spec: voice/volume/ttsAvailable/soundMode props)
- `LateRegAlertManager` em `client/src/lib/lateRegAlerts.ts` ✓ mantido
- `tests/components/grind-session-live/AlertsPanel.tts.test.tsx` ✓ cobertura
- `GrindSessionLive.tsx` 10 refs SessionAlert/fireAlert/useAlerts ✓
- ADR-008 + memory session 2026-04-27 TTS Wiring ✓

### Gaps reais (subset escopo Sprint D)

#### Gap RF-04.1 — Botao clear-all com toast

**Onde:** `AlertsPanel.tsx:41` ja tem `onClearAll` prop mas verificar feedback UX.

**Criterio aceite:**
- Given >=1 alerta ativo
- When user clica "Limpar todos"
- Then confirm dialog "Descartar N alertas?" + toast "Alertas removidos" + lista vazia + empty state visivel

**Effort:** XS (30min).

**Decisao:** INCLUIR (verificar antes — pode ja estar shipped).

#### Gap RF-04.2 — Dismissed cleanup ao trocar sessao

**Onde:** alertas com `dismissed=true` persistem em memoria mesmo apos session end?

**Criterio aceite:**
- Given sessao A com 5 alertas dismissed
- When user finaliza sessao A e inicia sessao B
- Then `SessionAlertManager` reseta (0 alertas, dismissed nao herdam)

**Effort:** XS (15min — provavelmente ja eh comportamento default mas confirmar).

**Decisao:** INCLUIR sanity check + test guard.

#### Gap RF-04.3 — Re-fire alerta marca timestamp novo

**Onde:** spec RF-05 fala "botao re-disparar seta fired=false". Mas se user re-fire e o `triggerAt` ja passou ha 2h, dispara agora ou nao?

**Criterio aceite:**
- Given alerta com `triggerAt = 2h atras` + `fired=true`
- When user clica re-fire
- Then `fired=false` + alerta dispara IMEDIATAMENTE no proximo tick (porque triggerAt <= now)
- And NAO precisa ajustar triggerAt (re-fire = "dispara de novo agora")

**Pontos atencao:**
- Decisao Q-C: re-fire move `triggerAt = now` OU mantem original e dispara imediato? Sugest: mantem original + dispara imediato (audit trail mais limpo)

**Effort:** XS (30min).

**Decisao:** INCLUIR.

### O que NAO inclui RF-04

- Persistencia entre sessoes (spec original out-of-scope)
- Push notification quando app fechado
- Som customizado
- Alertas no GradePlanner/Dashboard

---

## Files alvo (escopo final Sprint D)

**Edit:**
- `client/src/components/grind-session-live/TournamentCard.tsx` — RF-01.1 (CompletedCard add-on retroativo) + RF-01.2 (tooltip Plus)
- `client/src/components/grind-session-live/AlertsPanel.tsx` — RF-04.1/2/3
- `server/cronRunner.ts` — wire RF-03.1
- `server/coach/coachSystemBuilder.ts` (OU `coachContext.ts`) — wire RF-03.3
- `server/scoring/buildScoringInput.ts` — RF-03.4 (CONDICIONAL Q-B)
- `client/src/components/tournament-selector/SelectorPanel.tsx` (OU shim) — RF-03.4 UI badge

**Create:**
- `server/jobs/expireTickets.ts` — RF-03.1 cron
- `server/coach/contextBuilders/buildTicketsContext.ts` — RF-03.3
- `tests/integration/tickets-cron.test.ts` — RF-03.1+RF-03.2
- `tests/coach/buildTicketsContext.test.ts` — RF-03.3
- `tests/scoring/selectorTicketBoost.test.ts` — RF-03.4

**Migration:** **NENHUMA** (cron sem nova tabela ; notifications.type ja livre varchar)

---

## Files PROIBIDOS (NAO tocar)

- `client/src/pages/Home*`, `components/home/*`, `components/dashboard/*` (exceto verificar TicketsWidget montagem)
- `components/grade-planner/*`, `pages/GradePlanner*` (TicketsWidget ja la, sem mover)
- `server/coach/jobs/*Report*.ts` (escopo Coach sprints)
- `server/services/*Report*.ts`
- `server/services/scoring*.ts` (legacy — Sprint B owns)
- `server/storage.ts` (so usar metodos existentes ; nenhum novo metodo)

---

## Riscos & dependencias

**Riscos:**
- **R1** RF-03.4 scoring ownership conflict — mitigar Q-B
- **R2** cron RF-03.1 sem testes E2E em prod ate verify manual — aceitar, log granular
- **R3** RF-03.3 cache break Anthropic — bloco dinamico ja eh ephemeral, baixo risco
- **R4** RF-04.2 reset entre sessoes — pode quebrar testes existentes se ja eh comportamento implicito

**Dependencias:**
- `server/cronRunner.ts` (exists) — extensao trivial
- `notifications` table (exists) — sem migration
- `server/coach/coachSystemBuilder.ts` (exists) — append bloco
- `server/scoring/buildScoringInput.ts` (exists pos AI-0A) — extensao
- `shared/ticketScoring.ts:getEffectiveBuyIn` (exists) — reuso direto no selector
- `tournament_pool_intelligence` (exists AI-2A) — nao usado aqui

---

## Perguntas Q-A..Q-G ao founder (auto-mode default selecionado)

### Q-A — Gate cron expiracao tickets por `COACH_NUDGES_ENABLED`?

**Sugest default:** **NAO**. Expiracao eh housekeeping de dados, nao proatividade do Coach. Notifs RF-03.2 dependem do user ja optar in por notifs gerais (gate via `notifications_enabled` em user_settings se existe).

### Q-B — RF-03.4 selector boost: scoring owner

**Risk:** `server/scoring/buildScoringInput.ts` foi tocado em AI-0A (religou tool). Posso estender com `availableTicket` field?

**Sugest default:** **SIM, posso estender** desde que adicionar como campo NOVO opcional (`availableTicket?: {...}`) sem alterar logica existente. Se conflitar Sprint paralelo, defer pra Sprint Tickets-3 dedicado.

### Q-C — RF-04.3 re-fire alerta: move triggerAt ou mantem?

**Sugest default:** **MANTEM original triggerAt** + dispara imediato no proximo tick (porque `triggerAt <= now`). Audit trail preservado, comportamento previsivel.

### Q-D — RF-03.3 coach context: keyword trigger sensibilidade

**Spec original:** `ticket | satelite | grade | selecionar torneio`. Adicionar mais? (ex: `WSOP, qualifier, supersat`)

**Sugest default:** **MANTEM 4 keywords da spec.** Expandir gera ruido + cache invalidations desnecessarias.

### Q-E — RF-03.4 UI badge no SelectorPanel: usar shim ou edit direto?

**Lesson #28:** se test mockar componente em path X mas codigo importar Y, criar re-export. **Sugest default:** edit direto + grep antes de adicionar import novo.

### Q-F — RF-01.1 Add-on retroativo: confirmar?

**Spec original §7 caso 10:** "v1: via EditDialog". Estendo pra CompletedCard?

**Sugest default:** **SIM**. 1 clique > 3 cliques. Add-on retroativo eh use case real ("acabei o torneio e lembrei do add-on").

### Q-G — RF-04.1 clear-all confirm dialog: obrigatorio?

**Sugest default:** **SIM se >=3 alertas, NAO se <=2** (UX padrao Lifely — confirm proporcional ao dano).

---

## Verificacao final pm-spec

- [x] Cada gap tem criterio Given/When/Then verificavel
- [x] Cenarios cobrem happy + edge + race (cron 2x, dedupe notif, re-fire passado)
- [x] Fora de escopo explicito (per-RF + proibidos globais)
- [x] Ambiguidades resolvidas via Q-A..G inline com default
- [x] Spec independente — test-writer pode gerar testes sem perguntar
- [x] Endpoints listados (zero novos ; reuso existentes)
- [x] Modelos de dados: zero migration

---

## Proximo passo recomendado

```
Spec aprovada ? Sprint D scope-locked.

? Use o agente system-architect para:
  - 1 ADR sobre cron tickets (job pattern + dedupe notif)
  - 1 ADR sobre coach context block (cache strategy)
  - 1 diagrama sequencia cron RF-03.1+RF-03.2 (expire ? notif ? telemetria)
  - 1 diagrama selector RF-03.4 (com vs sem ticket boost)

? Apos arch: test-writer ? implementer ? simplify ? reviewer ? commit.
```

**OU se founder responder Q-A..G com mudancas materiais:** revisar spec antes de avancar.
