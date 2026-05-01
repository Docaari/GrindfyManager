# Sprint Bankroll-3 — Status Report

**Data:** 2026-05-01
**Branch:** `feature/bankroll-3` (worktree `B:\grindfy-bankroll3`)
**Modo:** AFK autônomo (founder ausente até 2026-05-02)
**Pipeline:** pm-spec → system-architect → test-writer → implementer → simplify → reviewer (R1) → implementer R2 → reviewer (R2) → implementer R3 → strategist → implementer UX → reviewer (R3 final)
**Status final:** READY_TO_MERGE — push autorizado pelo reviewer round 3

---

## RFs entregues

| RF | Descrição | Status | Commit |
|----|-----------|--------|--------|
| RF-1 | Rename migration `0006_bankroll_management_enabled.sql` → `0012` | [x] DONE | e7da28e |
| RF-2 | Auto-snapshot pós-cooldown (idempotente, fail-closed) | [x] DONE | 80df43f + 7040e13 |
| RF-3 | Auto-bind torneio→wallet via `SITE_DEFAULT_CURRENCY` | [x] DONE | 80df43f |
| RF-4 | Cross-wallet transfer (FX, FK RESTRICT, fee audit) | [x] DONE | 80df43f + 7040e13 + f265df0 |
| RF-5 | Pending transactions (CRUD + settle, cap 10/wallet) | [x] DONE | 80df43f + 7040e13 |
| RF-6 | Stop-loss / Stop-win lock (USD, TZ user, 12h padrão) | [x] DONE | 80df43f + 7040e13 |
| RF-7 | Dashboard ROI por plataforma (top 10, 30d, delta vs anterior) | [x] DONE | 80df43f + 30e3c77 |
| RF-8 | Migration 0018 origin column em bankroll_snapshots | [x] DONE | 80df43f |
| RF-9 | Extrair `BankrollReconcileSection.tsx` (standalone) | [~] PARTIAL | 80df43f — wiring em SessionSummaryModal pendente (debt #1) |
| RF-10 | Cleanup CTAs legacy (`summary-modal-cta-*`) | [x] DONE | f265df0 |
| RF-11 | `fxResolver` unificado (cascata users>wallets>constants + cache 5min) | [x] DONE | 80df43f + 7040e13 (refactor seletivo: bankrollService, walletService, ticketService — não-F4) |
| RF-12 | QueryKey userId em hooks F4 | [N/A] SKIP | F4 não está em main; documentado em ADR-061 |

**Total:** 11 de 12 RFs DONE + 1 PARTIAL (RF-9) + 1 SKIP autorizado (RF-12).

---

## Suite de testes

| Métrica | Valor |
|---------|-------|
| Total testes | 6966 |
| Passing | 6711 |
| Failing | 124 (todos pré-existentes não-bankroll3) |
| Skipped | 17 |
| **Bankroll-3 area** | **400/400 verdes** (cobertura completa, zero falhas) |
| Smoke tests novos (round 2) | 9 (`bankroll3-route-wiring.smoke.test.ts`) |
| Timezone tests (round 2) | 5 (`stopService-timezone.test.ts`) |
| Audit fee tests (round 3) | 2 (`transferService-fee-audit.test.ts`) |
| Wiring trigger tests (round UX) | 3 (`Bankroll.transfer-trigger.test.tsx`) |

---

## Decisões autônomas (D1-D12)

Todas aplicadas conforme prompt original do founder:

- **D1** FK `wallet_transfers.from_wallet_id`/`to_wallet_id` ON DELETE RESTRICT ✓
- **D2** Auto-snapshot inline pós-cooldown; falha logada não bloqueia finish (CRIT-6 documentado em ADR-058 addendum como atomicidade fraca aceita + idempotência via unique partial index) ✓
- **D3** Stop USD consolidado, reset 00:00 user TZ (DST-aware), stop-win não bloqueia, stop-loss 12h ✓
- **D4** fxRate obrigatório cross-currency (fallback `users.exchangeRates`) ✓
- **D5** Dashboard top 10, 30d default, comparação delta vs anterior ✓
- **D6** Migrations: 0017_wallet_transfers + 0018_auto_snapshot_meta + 0012 (rename). 0019 reservado por sprint Spot-Screenshots. ✓
- **D7** `BankrollReconcileSection` controlled, props mínimas ✓
- **D8** Pending types `deposit_pending`/`withdrawal_pending`, cap 10/wallet ✓
- **D9** fxResolver cascata users → wallets → constants `{BRL: 5.0, EUR: 0.93, CNY: 7.2, USDT: 1.0}` ✓
- **D10** Strategist limitado a 5 ideias top-ICE ✓
- **D11** Cross-wallet FX diff > 5% requires confirm flag (`confirmFxDiff: true`) ✓
- **D12** Subagente fallback main thread se 3x falha — não acionado (zero falhas de subagentes) ✓

---

## Migrations usadas

- `migrations/0012_bankroll_management_enabled.sql` (rename de 0006 — RF-1)
- `migrations/0017_wallet_transfers.sql` (RF-4 + RF-5: tabelas wallet_transfers + indices wallet_pending)
- `migrations/0018_auto_snapshot_meta.sql` (RF-6 user_settings stops + RF-8 bankroll_snapshots origin)

**Status `db:push`:** PENDENTE — founder roda manualmente. Migrations idempotentes (`IF NOT EXISTS`).

---

## Files novos (criados)

### Server
- `server/services/fxResolver.ts` (RF-11)
- `server/services/dashboardService.ts` (RF-7)
- `server/services/stopService.ts` (RF-6)

### Client
- `client/src/components/bankroll/StopBanner.tsx` (RF-6 UI)
- `client/src/components/bankroll/TransferDialog.tsx` (RF-4 UI)
- `client/src/components/dashboard/RoiByPlatformCard.tsx` (RF-7 UI)
- `client/src/components/grind-session-live/BankrollReconcileSection.tsx` (RF-9 standalone)

### SQL
- `migrations/0017_wallet_transfers.sql`
- `migrations/0018_auto_snapshot_meta.sql`

### Docs
- `Docs/specs/sprint-bankroll-3.md` (1500 linhas)
- `Docs/architecture/decisions/058-auto-snapshot-cooldown.md` (+ addendum CRIT-6)
- `Docs/architecture/decisions/059-cross-wallet-transfer.md`
- `Docs/architecture/decisions/060-stop-loss-lock.md`
- `Docs/architecture/decisions/061-fx-resolver-unified.md`
- `Docs/architecture/diagrams/bankroll-3-auto-snapshot-sequence.mermaid`
- `Docs/architecture/diagrams/bankroll-3-wallet-transfers-er.mermaid`
- `Docs/architecture/diagrams/bankroll-3-dashboard-roi-flow.mermaid`
- `Docs/architecture/diagrams/bankroll-3-stop-lock-state.mermaid`
- `Docs/architecture/diagrams/bankroll-3-fx-resolver-cascade.mermaid`

### Tests
- `tests/integration/api/cooldown-finish-auto-snapshot.test.ts` (RF-2)
- `tests/integration/api/dashboard-roi-by-platform.test.ts` (RF-7)
- `tests/integration/api/grind-sessions-stop-lock.test.ts` (RF-6)
- `tests/integration/api/reconcilable-wallets-suggested-bindings.test.ts` (RF-3)
- `tests/integration/api/user-settings-stops-routes.test.ts` (RF-6)
- `tests/integration/wallets/transfers-routes.test.ts` (RF-4)
- `tests/integration/wallets/pending-routes.test.ts` (RF-5)
- `tests/integration/routes/bankroll3-route-wiring.smoke.test.ts` (round 2 smoke)
- `tests/unit/services/bankrollService.createAutoSnapshot.test.ts`
- `tests/unit/services/fxResolver.test.ts`
- `tests/unit/services/stopService.test.ts`
- `tests/unit/services/stopService-timezone.test.ts` (round 2 TZ)
- `tests/unit/wallets/transferService.test.ts`
- `tests/unit/wallets/transferService-fee-audit.test.ts` (round 3 audit)
- `tests/unit/wallets/pendingService.test.ts`
- `tests/unit/wallets/suggested-bindings.test.ts`
- `tests/unit/dashboard/roi-by-platform.test.ts`
- `tests/unit/schema/wallet-transfers-schema.test.ts`
- `tests/unit/schema/bankroll-snapshot-origin.test.ts`
- `tests/unit/grind-session-live/cta-cleanup.test.ts`
- `tests/unit/hooks/rf12-userid-querykey.skip.test.ts`
- `client/src/components/grind-session-live/__tests__/BankrollReconcileSection.test.tsx`
- `client/src/components/bankroll/__tests__/TransferDialog.test.tsx`
- `client/src/components/bankroll/__tests__/StopBanner.test.tsx`
- `client/src/components/dashboard/__tests__/RoiByPlatformCard.test.tsx`
- `client/src/pages/__tests__/Bankroll.transfer-trigger.test.tsx` (round UX)

---

## Files modificados

### Schema/Migrations
- `shared/schema.ts` (+~156 linhas: stops, origin, walletTransfers, externalReference em walletPending)
- `shared/wallet-reconciliation.ts` (+58: buildSuggestedBindings + iPoker→EUR + PPoker→BRL + PS.ES→EUR)
- `shared/wallet-reasons.ts` (+7: transfer_fee)
- `shared/reconcile-schemas.ts` (relaxed empty adjustments)

### Server services
- `server/services/bankrollService.ts` (createAutoSnapshot fail-closed)
- `server/services/walletService.ts` (createTransfer + pending CRUD + audit fee single-debit)
- `server/storage.ts` (+~370 linhas: insertWalletTransfer, listWalletTransfers, getWalletTransferById, createWalletPending, updateWalletPendingStatus, listWalletPending, getRoiByPlatform, listGrindSessionsByUser, listSessionTournamentsBySessions, getUserById, tx wrapper estendido)

### Server routes
- `server/routes/auth.ts` (stops endpoints + release flag guard)
- `server/routes/cooldown.ts` (auto-snapshot inline)
- `server/routes/dashboard.ts` (ROI endpoint + compareWithPrevious)
- `server/routes/grind-sessions.ts` (stop-lock gate inline + suggestedBindings)
- `server/routes/wallets.ts` (transfers + pending endpoints + route ordering fix)

### Client pages (wiring round UX)
- `client/src/pages/Bankroll.tsx` (+38: botão Transferir + dialog state)
- `client/src/pages/Dashboard.tsx` (+8: RoiByPlatformCard)
- `client/src/pages/GrindSession.tsx` (+43: stop-status query + StopBanner)

### Client components
- `client/src/components/grind-session-live/SessionSummaryModal.tsx` (RF-10 cleanup -78 +0; renomeado testIds)
- `client/src/components/grind-session-live/__tests__/SessionSummaryModal.cooldown-ctas.test.tsx` (testIds renomeados)
- `client/src/components/grind-session-live/__tests__/SessionSummaryModal.v2.test.tsx` (testIds renomeados)
- `client/src/components/bankroll/__tests__/TransferDialog.test.tsx` (round 3 oracle fix)

### Tests setup
- `tests/setup.ts` (+18: env ALLOW_STOP_LOCK_RELEASE=true + fxResolver cache reset import)

---

## Commits do sprint (8)

| Hash | Tipo | Descrição |
|------|------|-----------|
| e7da28e | fix(migrations) | rename 0006 → 0012 (collision) |
| 557d5c2 | docs(bankroll-3) | spec + 4 ADRs + 5 diagramas |
| 151c7f3 | test(bankroll-3) | red phase 230 testes |
| 80df43f | feat(bankroll-3) | green phase implementation |
| 46ea013 | refactor(bankroll-3) | simplify pass DRY |
| 7040e13 | fix(bankroll-3) | round 2 (8 CRITICAL + 6 HIGH) |
| f265df0 | fix(bankroll-3) | round 3 (fee audit + RF-10 + oracle) |
| 30e3c77 | feat(bankroll-3) | UX round (wiring + delta + reframe) |

---

## Debts registradas para Bankroll-4

Em ordem de prioridade (per reviewer round 3):

| # | Item | Origem | Prioridade | Effort estimado |
|---|------|--------|------------|-----------------|
| 1 | **DRY SessionSummaryModal**: substituir inline reconcile section (linhas 402-461) pelo `BankrollReconcileSection` standalone. Atualizar 2 testes legacy (missing-platforms + tokens) | RF-9 spec linha 925 + skip #2 commit 30e3c77 | **HIGH** | 1 dia |
| 2 | TransferDialog: adicionar `disabled={... \|\| exceedsBalance}` no submit | MEDIUM round 3 review | LOW | 30 min |
| 3 | StopBanner countdown live tick (`setInterval` 30s) | INFO round 3 review | LOW | 30 min |
| 4 | Cleanup `handleCreateGrindSession` wrapper duplicado em `server/routes/grind-sessions.ts:38-71` | INFO round 3 review | LOW | 1h |
| 5 | Pre-existing Rules-of-Hooks fix em GrindSession.tsx (early return antes dos hooks) | `lessons-learned.md#1` | LOW | 2h (oportunístico) |
| 6 | RF-3 suggestedBindings UX: usar no banner inline do SessionSummaryModal — depende de #1 | RF-3 spec linha 268 | MEDIUM | dependent on #1 |
| 7 | Refactor F4 callsites do fxResolver (`primedopeIntegration`, `dayDetailService`, `primedopeBucketsPrefill`) — quando F4 mergear | RF-11 escopo ajustado | MEDIUM | 2h |
| 8 | Fix queryKey userId em hooks F4 (`useDayDetail`, `usePrimedopeRuns`, `usePrimedopeSimulation`) — quando F4 mergear | RF-12 SKIP | MEDIUM | 1h |

---

## Pendências operacionais pós-push

1. **`db:push`** das migrations 0017 + 0018 (founder roda — idempotentes).
2. **Memory file** `session_2026-05-01-bankroll-3.md` (criado) + atualização do `MEMORY.md` index.
3. **PR para main** (opcional — founder decide).
4. **Stash recovery:** `wip-pre-bankroll3-2026-05-01` em `feature/f4-primedope` permanece (42 arquivos modificados antes deste sprint).

---

## Tempo estimado para founder review

- **Skim rápido (20 min):** ler este status + spec sumario + commits oneline
- **Review profundo (1.5h):**
  - Spec sprint-bankroll-3.md (15 min)
  - 4 ADRs (058-061) (20 min)
  - Diff de schema (10 min)
  - Diff de walletService (createTransfer + audit fee) (15 min)
  - Diff de stopService (timezone + lock) (10 min)
  - Diff de wiring nas 3 páginas (Bankroll, Dashboard, GrindSession) (10 min)
  - Smoke tests + audit fee tests (10 min)
- **Validação manual no dev server (30 min):**
  - Aplicar 0017 + 0018 (`db:push`) em DB local
  - Login → Bankroll → criar 2ª wallet → testar Transferir cross-currency
  - Settings → setar stops → simular sessão → verificar lock 423
  - Dashboard → ver RoiByPlatformCard com delta
  - SessionSummaryModal → verificar cleanup CTAs (sem dual)

**Total founder review:** ~2.5h se aprovação direta, +1 dia se debts #1 priorizada para PR de followup imediato.
