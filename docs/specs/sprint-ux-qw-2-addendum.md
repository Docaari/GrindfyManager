# Addendum — Sprint UX-QW-2 (Scope Creep Documentation)

> Data: 2026-05-20
> Origem: Reviewer formal pre-merge identificou 5 deltas implementados FORA do escopo declarado em `sprint-ux-qw-2.md` (HIGH-1).
> Status: documentacao retroativa — features ja shipadas no bundle UX-QW-2.

---

## 1. Contexto

Sprint UX-QW-2 spec original cobre RF-01..RF-08 (empty states, staleness badge, coach lens tooltips, toast actions). Durante implementacao, foram introduzidos 5 deltas adicionais nao cobertos pela spec. Reviewer marcou como HIGH-1 (scope creep nao-documentado).

Decisao: manter os deltas no merge (ja testados + funcionais) + documentar aqui para audit trail e onboarding futuro. Nao virar ADR porque sao mudancas tactical-UX, nao decisoes arquiteturais.

---

## 2. Deltas Documentados

### 2.1 SessionSummaryModal — gate `hasMissing` afroxado + skip-reconcile inline

**Arquivos:** `client/src/components/grind-session-live/SessionSummaryModal.tsx`, `client/src/pages/GrindSessionLive.tsx`

**Antes:** CTA `cta-finalize-session` ficava `disabled={isReconciling || hasMissing}`. Usuario tinha que abrir reconcile modal e preencher saldos manuais antes de poder finalizar sessao.

**Depois:** CTA habilita mesmo com `hasMissing=true`. Click chama `/api/grind-sessions/:id/reconcile-wallets` com `skipReconciliation:true` ANTES de finalizar — registra a sessao como "finalizada sem reconciliar" em vez de bloquear.

**Telemetria event-rename:**
- `summary_submit_blocked_missing_platforms` → `summary_submit_skipped_missing_platforms`
- **AVISO:** dashboards/queries que filtram pelo nome antigo precisam atualizar.

**Justificativa retroativa:** auditoria 2026-05-20 friction point #14 ("usuario abandona sessao sem finalizar porque skip-reconcile e fora do happy path"). Defer reconcile pos-sessao reduz friccao + mantem auditabilidade.

### 2.2 grind_sessions.wallet_profit_usd persistido + cascata de precedencia

**Arquivos:** `server/services/grindSessionHistory.ts`, `server/storage.ts` (`listSessionWalletSnapshotsByUser`)

**Antes:** historico calculava profit on-the-fly via delta de wallet snapshots OU P&L de torneios.

**Depois:** sessao agora persiste `wallet_profit_usd` direto (snapshot do reconcile). Cascata em buildSessionEntry:
1. `walletProfitUsd` (autoritativo, preenchido no finalize com skip-reconcile)
2. delta de snapshots (reconcile completo)
3. P&L torneios (fallback historico sem reconcile)

**Justificativa:** evita re-calculo divergente conforme wallet snapshots sao corrigidos retroativamente. Tornar valor imutavel = source of truth no fechamento.

### 2.3 SessionDashboard — rename `kpi-avg-participants` → `kpi-median-participants`

**Arquivo:** `client/src/components/grind-session-live/SessionDashboard.tsx:168`

**Antes:** KPI mostrava media aritmetica de participantes.

**Depois:** KPI mostra mediana. data-testid renomeado, label PT-BR ajustado.

**Justificativa:** distribuicao de field size em MTT eh long-tail (poucos torneios com 5000+ entries puxam a media). Mediana reflete melhor o "torneio tipico" da sessao.

**AVISO telemetria:** `data-testid` mudou — se algum dashboard externo (analytics, e2e suite global) selecionar pelo testid antigo, atualizar.

### 2.4 WeekGrid — refator visual (sem `MAX_VISIBLE_CHIPS` cap)

**Arquivo:** `client/src/components/grade-planner/WeekGrid.tsx`

**Antes:**
- `MAX_VISIBLE_CHIPS = 3` — celula mostrava 3 chips + `<OverflowIndicator>` "+N torneios".
- `<DaySummaryFooter>` separado.

**Depois:**
- `MAX_VISIBLE_CHIPS = Number.MAX_SAFE_INTEGER` — todos os chips renderizam (celula expande verticalmente).
- `OverflowIndicator` e `DaySummaryFooter` deletados; logica inline.

**Justificativa:** auditoria #22 ("usuario clica +N para expandir celula mas nao tem onde clicar — overlay nao implementado"). Solucao expand-by-default eh menor friccao que implementar modal/popover.

**Trade-off:** celulas com 8+ torneios ficam altas. Mitigacao futura: scroll vertical no week-grid container OU re-introduzir cap com expand-on-click.

### 2.5 TournamentChip — visual refresh

**Arquivo:** `client/src/components/grade-planner/TournamentChip.tsx`

**Antes:** chip com `getPlannerTypeColor` + `getSpeedColor` (cores hardcoded por tipo de torneio).

**Depois:**
- Cores derivadas via lookup de `siteIcon` (PNG real da rede).
- Helper `formatGtdCompact` para GTD em formato curto (10K, 100K, 1M).
- Tamanho do chip ~dobrado para acomodar icon + label + GTD.

**Justificativa:** consistencia visual com `LibraryCard` (pos-sprint biblioteca-enrich). Cores por site sao mais discriminaveis que cores por tipo (lesson da auditoria: usuario ja reconhece logos das redes).

---

## 3. Cobertura de Testes

| Delta | Tests |
|---|---|
| Skip-reconcile gate | `SessionSummaryModal.missing-platforms.test.tsx` (reescrito) |
| walletProfitUsd precedencia | `grindSessions.history-unified.test.ts` (+4 cenarios) |
| Median participants | `calculate-session-stats-fx.test.ts` (renomeado) |
| WeekGrid expand-all | sem teste dedicado — coberto indiretamente por `WeekGrid.empty-state.test.tsx` |
| TournamentChip refresh | sem teste — refator estetico, visual regression nao auditado |

---

## 4. Follow-ups Recomendados

1. **Telemetria:** atualizar dashboards externos que filtram `summary_submit_blocked_missing_platforms` ou selector `data-testid="kpi-avg-participants"`.
2. **WeekGrid escalabilidade:** se celulas longas virarem problema UX, re-introduzir cap + expand-on-click (modal/popover).
3. **TournamentChip:** adicionar visual regression test (Storybook + chromatic OU snapshot test) antes de proxima refator.
4. **walletProfitUsd auditabilidade:** verificar se relatorios financeiros (bankroll reports, monthly report AI-1C) usam o novo campo ou recalculam — alinhar com source of truth.

---

## 5. Processo

Esse addendum existe porque o pipeline TDD spec→test→impl→reviewer pegou o scope creep apenas na reviewer phase. Lesson para sprints futuros: implementer deve sinalizar via `/simplify` quando deltas excederem o escopo da spec; test-writer deve recusar testes que cubram comportamento nao-spec'ado e pedir addendum antes.

Reviewer aceitou os deltas como APPROVED-WITH-NITS condicional a esse documento existir.
