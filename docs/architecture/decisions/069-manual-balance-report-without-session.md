# ADR-069: Reportar saldo standalone via reason `manual_report` (sem sessionId)

## Status
ACCEPTED

## Data
2026-05-01

## Contexto

A Sprint Bankroll-2.1 (ADR-038, optimistic concurrency) introduziu o modo "Reportar saldo" no `WalletTransactionDialog`: usuario informa o saldo final observado da carteira (ex: "Suprema esta em R$ 1.247 agora") e o servidor calcula o delta contra `wallet.balance` autoritativo. A Sprint B2 (ADR-047, summary inline reconcile) consolidou esse fluxo dentro do `SessionSummaryModal`.

QA real do founder revelou regressao subsequente em main: hoje `WalletTransactionDialog` no modo "Reportar saldo" forca `reason='session_result'`. O servidor em `server/services/walletService.ts:355-361` rejeita com `400 "sessionId obrigatorio quando reason=session_result"` se nao houver sessao ativa.

Isso bloqueia caso de uso legitimo e recorrente:

- Founder jogou em sala fora do Grindfy (ex: torneio offline rapido) e quer atualizar saldo da wallet PokerStars.
- Founder fez retirada externa via PIX e quer reportar saldo final do banco.
- Founder esqueceu de iniciar sessao de grind no app, jogou 4 horas, terminou e quer reportar saldo "como esta agora" sem inventar dados de sessao.

O workaround atual eh **criar sessao fake**: iniciar grind, finalizar imediatamente, abrir summary modal, reportar saldo. Sujam `grind_sessions`, distorcem analytics (ROI, hours played), poluem o historico /grind com sessoes vazias.

A questao arquitetural eh **como permitir reportar saldo sem sessao ativa, mantendo auditoria + integridade do ledger**:

1. **Reusar reason `manual_adjustment`** com flag `viaBalanceMode: true` em note ou metadata.
2. **Novo endpoint dedicado `POST /api/wallets/:id/manual-report`** com lógica isolada.
3. **Novo reason `manual_report`** mutuamente exclusivo com `session_result` via validacao server-side, criando wallet_transaction com `session_id=NULL` (escolha proposta).
4. **Deixar como hoje** + frontend cria sessao fake transparente.

### Pre-requisitos satisfeitos

- `wallet_transactions.session_id` ja eh NULL-able (sessoes pre-Bankroll-2 nao tem session_id).
- `walletService.recordWalletTransaction` ja serializa concorrencia via `SELECT FOR UPDATE` + `expectedPreviousBalance` (ADR-038).
- `WALLET_TX_REASONS` enum em `shared/wallet-reasons.ts` aberto a extensao.
- `bankroll_snapshots.origin` CHECK constraint extensivel via migration idempotente (padrao Bankroll-3 ADR-058).

### Forcas em jogo

- **UX desbloqueada:** reportar saldo eh fluxo critico — bloqueio forca workaround sujo ou abandono.
- **Auditoria:** delta sem sessao precisa ser distinguivel de delta com sessao no ledger (Coach, dashboard, ROI per platform).
- **Integridade do ledger:** ADR-017 invariante `previousNativeBalance == ultimo newNativeBalance` deve ser preservada.
- **Backward-compat:** clientes antigos (Coach tool, dashboard, scripts) nao podem quebrar.
- **Semantica clara:** "manual" para ajuste sem fato externo (correcao de bug, reset); "manual_report" para fato externo nao-rastreado (jogou fora, retirada externa).

## Decisao

**Adotar opcao 3: novo reason `manual_report` em `WALLET_TX_REASONS` + `WALLET_TX_REASONS_P0`. Validacao mutuamente exclusiva server-side: `manual_report` PROIBE `sessionId` (rejeita 400); `session_result` EXIGE `sessionId` (comportamento atual mantido). Helper `isStandaloneReason(reason)` retorna true para `manual_report`. Cria wallet_transaction com `session_id=NULL` + dispara snapshot automatico via `createAutoSnapshot()` com `origin='manual-report'` (NOVO em CHECK constraint, migration 0022). Coach tool `read_user_bankroll_history` estendido para incluir `type: 'session' | 'manual_report'` em entries (back-compat: campo opcional).**

### Detalhes-chave

1. **Reason novo, nao reuso.** `manual_adjustment` continua semanticamente "ajuste sem fato externo" (correcao manual de erro, reset de saldo). `manual_report` semantica nova: "fato externo nao-rastreado pelo app".

2. **Validacao mutuamente exclusiva (D2 da spec).** Em `WalletTxBodyRefinedSchema.superRefine`:
   - `reason='session_result' && !sessionId` → ZodError `session_id_required`.
   - `reason='manual_report' && sessionId` → ZodError `manual_report_no_session`.
   - Outros reasons (deposit/withdrawal/adjustment/transfer/rakeback) ignoram `sessionId` (mantido).

3. **Snapshot pos-tx (D3).** Apos sucesso da `wallet_transactions`, dispara `bankrollService.createAutoSnapshot({userId, origin: 'manual-report', sourceRefId: tx.id})`. Captura saldo de TODAS as wallets do user (mesmo padrao Bankroll-3 RF-2). Falha de snapshot **nao** faz rollback (best-effort, mesmo trade-off ADR-058 addendum).

4. **Coach tool enriched (D12).** `read_user_bankroll_history` retorna entries com `type` discriminator. Coach pode citar: "voce reportou perda de $300 em PokerStars sem sessao registrada" (manual_report) vs "voce perdeu $200 na sessao 19h-22h" (session).

5. **Idempotencia best-effort.** Se cliente faz POST duplicado dentro de 5 segundos com mesmo `nativeAmount` + mesmo `walletId` + mesmo `reason='manual_report'`, app aceita (sem dedup ativo). Trade-off vs Bankroll-3 RF-2 (idempotencia via unique index parcial em `source_ref_id`): aqui NAO ha source_ref natural — `tx.id` eh gerado pelo proprio insert. Aceitavel por enquanto; se duplicacao virar problema, sprint futuro adiciona dedup window via `external_reference`.

## Opcoes Consideradas

### Opcao 1: Reusar `manual_adjustment` + flag `viaBalanceMode`

- **Pros:**
  - Zero schema delta. Sem novo enum value.
  - Dialog atual ja conhece `manual_adjustment` para modo "Movimento".

- **Contras:**
  - **Ambiguidade semantica fatal.** `manual_adjustment` significa "ajuste manual sem fato externo" (correcao). `manual_report` significa "delta derivado de fato externo observado". Misturar = perde audit trail.
  - **Coach perde discriminacao.** Tool retornaria entries indistinguiveis — Coach nao consegue dizer "voce reportou saldo extra-sessao" vs "voce ajustou saldo por correcao".
  - **Dashboard ROI per platform polui.** Ajustes de correcao (raros, valor pequeno) somam com reports de jogo externo (frequentes, valor variado). Metricas de ROI viram bagunca.
  - **Flag em note/metadata eh fragil.** Validacao app-level sem enforcement no schema. Typo na flag = bug latente.
  - **Rejeitada — esconde o problema, nao resolve.**

### Opcao 2: Endpoint dedicado `POST /api/wallets/:id/manual-report`

- **Pros:**
  - Logica isolada, sem if/else no walletService.
  - Validacao independente.

- **Contras:**
  - **Duplicacao significativa.** Endpoint precisaria reimplementar `SELECT FOR UPDATE`, `expectedPreviousBalance` check (ADR-038), criacao de tx, calculo de delta_usd_at_time via fxResolver, atualizacao de wallet.balance, idempotencia. ~200 linhas duplicadas de `recordWalletTransaction`.
  - **Snapshot dispatch duplicado.** Mesmo `createAutoSnapshot` precisaria ser invocado de 2 lugares.
  - **Frontend mais complexo.** Dialog precisaria escolher endpoint baseado em sessionId — outra fonte de bug.
  - **Coach tool teria que JOIN 2 tabelas/endpoints.** Perde unificacao do ledger.
  - **Rejeitada — duplicacao excessiva por separacao puramente cosmetica.**

### Opcao 3 (escolhida): Novo reason `manual_report` mutuamente exclusivo

Detalhes acima.

- **Pros:**
  - **Auditoria preservada.** Reason discriminator no ledger permite Coach + dashboard + analytics filtrarem.
  - **Reuso total.** `recordWalletTransaction` ganha 1 if a mais; resto da logica intocada (FX, snapshot dispatch, optimistic concurrency).
  - **Validacao no schema.** ZodError com path explicito — frontend exibe mensagem certa.
  - **Migration trivial.** Apenas extensao de CHECK constraint via DO $$ idempotente.
  - **Coach tool extensivel.** Campo `type` opcional preserva back-compat de clients antigos.
  - **Snapshot consistente.** `origin='manual-report'` permite analytics distinguir source (auto-cooldown vs manual-report vs manual vs transfer vs import).

- **Contras:**
  - **Mais um path no walletService.** Risco de regressao em testes existentes — mitigado por test #3 mock shape REAL (lessons-learned spec RF-02).
  - **Coach output union estendido.** Clients que ja consomem o tool precisam tolerar campo extra. Mitigado por documentacao explicita + back-compat (campo opcional).
  - **Front-end dialog logic.** Helper text dinamico baseado em prop `sessionId`. Mitigado por data-testid estavel + RTL test.

### Opcao 4: Deixar como hoje + sessao fake

- **Pros:**
  - Zero codigo novo.

- **Contras:**
  - **Suja `grind_sessions` permanentemente.** Sessoes vazias com profit nulo poluem historico, dashboard, analytics.
  - **Distorcoes em hours played.** Sessao iniciada e finalizada em segundos infla contagem de sessoes mas zera tempo medio.
  - **Coach analyses corrompidas.** "Voce jogou 30 sessoes esta semana" inclui 15 fakes — analise de pace fica errada.
  - **UX terrivel.** Founder ja pediu remover esse vinculo antes — feature regrediu.
  - **Rejeitada — workaround sujo eh divida tecnica imediata.**

## Consequencias

### Positivas

- **UX desbloqueada.** Founder reporta saldo standalone sem ginastica.
- **Audit trail completo.** Toda mutacao de banca tem snapshot pre/pos rastreavel + reason discriminator.
- **Coach contextual.** Tool distingue "jogou e perdeu" vs "reportou perda externa" — analise mais precisa.
- **Dashboard ROI per platform inclui movimentos extra-sessao.** Coverage real de bankroll, nao so de jogo trackeado.
- **Snapshot origin auditavel.** Analytics futuros podem segmentar evolucao por origem (jogo registrado vs reports manuais).
- **Sem schema delta em `wallet_transactions`.** Coluna `session_id` ja NULL-able; coluna `reason` ja VARCHAR aberto.
- **Migration idempotente.** Pattern DO $$ EXCEPTION (ADR-058) garante re-run safe.
- **Back-compat 100%.** Clients sem conhecimento de `manual_report` continuam funcionando (entries com `type='session'` indistinguiveis das atuais).

### Negativas

- **Mais um path no walletService.** ~10 linhas de logica + 2 testes adicionais de validacao mutuamente exclusiva. Trade-off aceitavel.
- **Snapshot best-effort pos-tx.** Mesmo trade-off de ADR-058 addendum: se snapshot falha, perdemos 1 ponto na serie temporal — tx ja commitada. Mitigado por log + idempotencia (replays seguros via natural key futura).
- **Coach output schema mais complexo.** Union type `'session' | 'manual_report'` em entries. Documentacao explicita em tool description + back-compat doc.
- **Frontend dialog precisa logic dinamica.** `reason` derivado de `sessionId` prop. Helper text muda. RF-09 cobre com data-testid + test.
- **Sem dedup window inicial.** POST duplicado dentro de janela curta cria 2 manual_reports. Aceitavel por enquanto — mitigado se virar problema via `external_reference` em sprint futuro.

### Neutras

- **Cluster D5 (5min) eh decisao de apresentacao,** nao de modelagem. Tabela continua granular (1 row por POST); cluster acontece em `GET /api/grind-sessions/history` (RF-05).
- **`isStandaloneReason()` helper expansivel.** Hoje so `manual_report` retorna true. Futuros reasons standalone (ex: `staking_external_payout`) podem entrar.
- **Profit calc dashboard inclui manual_reports automaticamente.** RF-08 garante via soma de `delta_usd_at_time` por reason.
- **Empty state em detail modal (D6).** Manual_report sempre tem before+after computado (D8); session pode falhar lookup (D7) e cair em empty.

## Confianca

**Alta.** Padrao "novo reason discriminator + validacao Zod + snapshot best-effort" eh estabelecido (ADR-039 rakeback, ADR-058 auto-snapshot, ADR-059 transfer). Reuso quase total da logica existente do walletService. Risco principal (snapshot falha silenciosa) tem mitigacao concreta (log + alerta + idempotencia futura). Reversibilidade alta: remover o reason equivale a marcar `WALLET_TX_REASONS` legacy + frontend cair de volta no fluxo session-bound.

## Referencias

- Spec: `Docs/specs/sprint-bankroll-reports-detail.md` (RF-01, RF-02, RF-03, D1, D2, D3, D12)
- ADR-017: Bankroll snapshot vs derived (invariante `previousNativeBalance`)
- ADR-033: FX rate convention (units per USD)
- ADR-034: Multi-wallet com immutable FX
- ADR-038: Wallet tx optimistic concurrency (`expectedPreviousBalance`)
- ADR-039: Rakeback as wallet tx reason (padrao reasons enum)
- ADR-047: Summary inline reconcile (B2)
- ADR-058: Auto-snapshot pos-cooldown (padrao snapshot best-effort)
- ADR-059: Cross-wallet transfer (padrao novo reason + integracao snapshot)
- ADR-061: `fxResolver` unificado (calcula `delta_usd_at_time`)
- Diagrama ER: `Docs/architecture/bankroll-reports-detail-er-extension.mermaid`
- Diagrama fluxo: `Docs/architecture/bankroll-reports-detail-flow-manual-report.mermaid`
- Migration: `migrations/0022_manual_report_origin.sql`
- Schema: `shared/wallet-reasons.ts` (extensao `WALLET_TX_REASONS`, helper `isStandaloneReason`)
- Service: `server/services/walletService.ts:340+` (validacao mutuamente exclusiva)
- Coach tool: `server/coach/tools/readUserBankrollHistory.ts` (campo `type`)
