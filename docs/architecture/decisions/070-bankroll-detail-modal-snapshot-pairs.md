# ADR-070: `BankrollDetailModal` via endpoint `balance-snapshot-pair` com precedence resolution

## Status
ACCEPTED

## Data
2026-05-01

## Contexto

A Sprint Bankroll-3 (ADR-058 auto-snapshot pos-cooldown) garantiu que toda finalizacao de cool-down gere `bankroll_snapshots` consolidado. A Sprint Bankroll-Reports-Detail (ADR-069) adiciona `manual_report` standalone com snapshot dedicado `origin='manual-report'`. Ambas coexistem com snapshots manuais legados (`origin='manual'`) e com sessoes pre-auto-snapshot (sem snapshot dedicado).

QA real do founder revelou gap de visibilidade no historico `/grind`: a pagina mostra dados da sessao (torneios jogados, profit calculado de buy-ins) mas **nao** mostra como a sessao impactou os saldos das wallets. Founder nao consegue auditar:

- "Depois dessa sessao quanto sobrou em cada plataforma?"
- "Em qual wallet eu queimei mais nesta noite?"
- "Esse manual_report capturou meu saldo correto antes do report?"

Mesmo com auto-snapshot (Bankroll-3), o dado existe mas **nao tem UI de consumo** — o founder precisa abrir DevTools + queries SQL para ver o par before/after.

A questao arquitetural eh **como expor before/after de bankroll por entry no historico (sessao OU manual_report) com latencia aceitavel, lidando com snapshots ausentes para sessoes legacy**:

1. **Snapshot computado on-the-fly toda vez** — re-derivar saldo "no instante T" via SUM de transactions ate T.
2. **Endpoint dedicado `GET /api/wallets/balance-snapshot-pair`** com lookup precedence + empty state honesto (escolha proposta).
3. **Adicionar coluna denormalizada `before_snapshot_id`/`after_snapshot_id` em `grind_sessions`** + backfill via migration.
4. **Grafico timeline V1 com bars antes/depois** em modal estilo Mint/Stripe.

### Pre-requisitos satisfeitos

- `bankroll_snapshots` consolidado existe (ADR-017, B2 ADR-047, B3 ADR-058).
- `bankroll_snapshots.wallets_balances` jsonb captura saldo individual de TODAS as wallets do user (multi-wallet B2).
- `bankroll_snapshots.origin` CHECK constraint sera estendida para incluir `'manual-report'` (Sprint atual, migration 0022, ADR-069).
- `bankroll_snapshots.source_ref_id` aponta para `cooldown_log.id` (auto-cooldown), `wallet_transfers.id` (transfer) ou `wallet_transactions.id` (manual-report — novo).
- `wallet_transactions.balance_after_native` registra saldo final pos-tx (necessario para D8 derivacao de before).

### Forcas em jogo

- **Latencia:** modal abre on-demand (click "Ver detalhes da banca"); founder espera <500ms.
- **Coverage:** sessoes pre-Bankroll-3 (sem auto-snapshot dedicado) representam ~80% do historico ate ~maio/2026. Solucao precisa cobrir legacy gracefully.
- **Auditabilidade:** snapshot derivado on-the-fly perde garantia "snapshot tirado naquele momento com aquele FX" — invariante ADR-034 (immutable FX) quebrada se recalcular hoje com rates atuais.
- **Honestidade:** founder prefere "nao tenho esse dado" do que "dado inferido errado". Empty state explicito > maquiagem fake.
- **Reuso:** modal serve sessoes E manual_reports — single endpoint > 2 endpoints separados.
- **Escopo controlado:** grafico timeline V1 inflaria spec; tabela ja resolve 90% dos casos (D11 da spec).

## Decisao

**Adotar opcao 2: novo endpoint `GET /api/wallets/balance-snapshot-pair?from=ISO&to=ISO[&sessionId=X]` retornando par `before/after` derivado de `bankroll_snapshots` com precedence explicita. Para session-bound (D7): (1) snapshot session-bound auto-cooldown via `source_ref_id=cooldownLogId`; (2) snapshots temporal proximos (mais recente <= from para before, mais antigo >= to para after); (3) empty state com `emptyReason`. Para manual_report (D8): `before = wallet.balance_native - transaction.delta` (calculado), `after = transaction.balance_after_native`. `BankrollDetailModal` consome endpoint, renderiza tabela `Plataforma | Saldo antes | Saldo depois | Delta nativo | Delta USD` + footer total USD. Empty state quando snapshot ausente: mensagem PT-BR honesta + sugestao de auditoria manual. Botao "Ver detalhes da banca" gated pelo campo `detailsAvailable: boolean` calculado server-side em `GET /api/grind-sessions/history`. Sem grafico V1 — adiado V2 se strategist sugerir + ICE >= 8.**

### Detalhes do contrato

**Endpoint (`server/routes/wallets.ts`):**

```ts
GET /api/wallets/balance-snapshot-pair
  ?from=2026-05-01T18:00:00Z
  &to=2026-05-01T22:00:00Z
  [&sessionId=SES-1234]    // hint: tenta source_ref_id=cooldownLogId primeiro
Auth: requireAuth
```

**Response shape:**

```ts
{
  before: Array<{
    walletId: string;
    walletName: string;
    platform: string;
    currency: string;
    balanceNative: number;
    balanceUsd: number;
    snapshotId: string | null;     // null se derivado por aritmetica (manual_report)
    snapshotOrigin: string | null; // 'auto-cooldown' | 'manual' | 'manual-report' | etc
  }>;
  after: Array<{ /* mesmo shape */ }>;
  delta: Array<{
    walletId: string;
    walletName: string;
    platform: string;
    currency: string;
    deltaNative: number;
    deltaUsd: number;
  }>;
  empty: boolean;
  emptyReason?: 'no_snapshot_before' | 'no_snapshot_after' | 'data_corrupt';
}
```

**Lookup precedence sessao (D7):**

1. `SELECT * FROM bankroll_snapshots WHERE source_ref_id = ? AND origin = 'auto-cooldown' AND user_id = ?`. Se 1 row, eh o `after` (snapshot tirado AO finalizar cooldown). `before` = snapshot anterior mais proximo na timeline (qualquer origin).
2. Se nao ha auto-cooldown: `before` = `MAX(occurred_at) WHERE occurred_at <= from AND user_id = ?`; `after` = `MIN(occurred_at) WHERE occurred_at >= to AND user_id = ?`.
3. Se faltar before OR after: `empty: true`, `emptyReason: 'no_snapshot_before'` (priorizando before como mais informativo). Frontend exibe estado D6.

**Lookup precedence manual_report (D8):**

1. Identifica `wallet_transaction WHERE reason='manual_report' AND user_id=? AND occurred_at BETWEEN from AND to`. Cluster D5 (5min) pode trazer N transactions.
2. Para cada wallet afetada do cluster:
   - `after.balanceNative` = `tx.balance_after_native` (ja registrado no insert).
   - `before.balanceNative` = `tx.balance_after_native - tx.deltaNative` (calculado).
3. Se ha snapshot `origin='manual-report'` com `source_ref_id IN (cluster.txIds)`: usa snapshot.wallets_balances como before (mais autoritativo) — fallback derivacao se snapshot ausente.
4. `data_corrupt` (raro): se `tx.balance_after_native IS NULL` (legacy bug). Empty state.

**`detailsAvailable` no history endpoint (RF-05):**

`GET /api/grind-sessions/history` calcula server-side:
- Para `type='session'`: `true` se `EXISTS snapshot WHERE source_ref_id=cooldownLogId` OR existe `MAX/MIN snapshots cobrindo intervalo`. `false` para sessoes legacy sem snapshot.
- Para `type='manual_report'`: `true` sempre (D8 garante derivacao por aritmetica). `false` apenas se `data_corrupt` raro.

Frontend renderiza botao `[Ver detalhes da banca]` apenas se `detailsAvailable === true`. Sessoes legacy mostram tooltip explicativo "Sem snapshot disponivel — sessao anterior a Bankroll-3".

**Wallets criadas/arquivadas no intervalo:**

- Wallet criada APOS `from` mas presente em `after`: aparece em `after`, NAO aparece em `before`. Frontend renderiza `before.balanceNative=0` + badge "Wallet criada nesta sessao".
- Wallet arquivada DURANTE intervalo: aparece em `before`, NAO aparece em `after`. Frontend renderiza `after.balanceNative=0` + badge "Wallet arquivada".

**FX freeze:**

`balanceUsd` em `before/after` usa o FX rate do momento do snapshot (`bankroll_snapshots.exchange_rates_used` jsonb, ADR-034). Para manual_report derivado por aritmetica, usa `wallet_transactions.delta_usd_at_time` + reverso. Garantia: dois usuarios olhando o mesmo modal hoje vs daqui 6 meses veem o mesmo USD (immutable FX).

## Opcoes Consideradas

### Opcao 1: Snapshot computado on-the-fly toda vez

Re-derivar saldo "no instante T" via `SUM(wallet_transactions.delta WHERE occurred_at <= T) + wallet.initial_balance`.

- **Pros:**
  - Sem dependencia de `bankroll_snapshots`. Funciona para 100% das sessoes legacy.
  - Sem schema delta.

- **Contras:**
  - **Custo computacional alto.** Para cada modal aberto, scan completo de `wallet_transactions` por wallet — em user com 5000 transactions, modal demoraria >2s.
  - **Quebra immutable FX (ADR-034).** Recalcular USD hoje usa rates atuais — contradiz invariante "FX freeze no snapshot". Founder olhando modal daqui 6 meses veria USD diferente.
  - **Sem snapshot real para auditar.** Confianca no dado depende de garantia "transactions sao imutaveis" — verdadeira mas nao questionavel se houve bug de import.
  - **Drift entre snapshot manual gravado e snapshot computado.** Se founder ja gravou snapshot em T1, computacao on-the-fly em T2 (proximo) pode dar valor diferente por causa de `manual_adjustment` inserido entre os dois. Inconsistencia silenciosa.
  - **Rejeitada — performance + invariantes ADR-034 quebradas.**

### Opcao 2 (escolhida): Endpoint dedicado com lookup precedence + empty state

Detalhes acima.

- **Pros:**
  - **Latencia <100ms.** Lookup precedence eh 2-3 SELECTs com index em `(user_id, occurred_at DESC)` + `(source_ref_id)`.
  - **Reuso de snapshots existentes.** Sessoes pos-Bankroll-3 + manual_reports tem snapshot dedicado — lookup direto.
  - **Empty state honesto para legacy.** Sem maquiar com derivacoes erradas.
  - **Single endpoint serve sessao + manual_report.** Frontend (`BankrollDetailModal`) tem um caminho de fetch.
  - **Botao gated pelo `detailsAvailable`.** UX nao quebra (sem botao morto que abre modal vazio).
  - **Immutable FX preservada.** Snapshot tem `exchange_rates_used` jsonb (ADR-034); derivacao manual_report usa `delta_usd_at_time` historicamente congelado.
  - **Coverage incremental.** Conforme founder usa app pos-Bankroll-3, % de sessoes com snapshot cresce; legacy degrada gracefully.
  - **Manual_report sempre tem detalhes** (D8 derivacao garante) — UX consistente para esse fluxo critico.

- **Contras:**
  - **Sessoes legacy sem snapshot mostram empty state.** Founder pode interpretar como bug. Mitigado por copy explicita: "Sem snapshot disponivel — sessao anterior a Bankroll-3" + sugestao "Verifique extrato bancario manualmente".
  - **Mais um endpoint para manter.** Aceitavel — tem responsabilidade unica.
  - **Frontend precisa lidar com 4 estados.** Loading / data / empty (no_snapshot_before) / empty (data_corrupt). Mitigado por sub-componente `<WalletDeltaTable>` reusavel.

### Opcao 3: Coluna denormalizada `before_snapshot_id`/`after_snapshot_id` em `grind_sessions`

- **Pros:**
  - Lookup trivial (1 query, JOIN simples).
  - Sem precedence logic em runtime.

- **Contras:**
  - **Migration dolorosa para backfill.** ~10k sessoes legacy precisariam JOIN temporal + UPDATE em batch. Janela de manutencao + risco de erro.
  - **Schema delta em hot table.** `grind_sessions` eh queried em todo dashboard, history, analytics — adicionar 2 FKs vira reescrita de N queries.
  - **Nao resolve manual_reports.** Tabela diferente; precisa de outra coluna em `wallet_transactions`.
  - **Constraint em FK = wallet_id changeable.** Se founder deleta snapshot manualmente (hoje raro mas possivel), FK quebra ou cascade apaga sessao.
  - **Rejeitada — migration cara para ganho marginal de latencia.**

### Opcao 4: Grafico timeline V1 com bars antes/depois

- **Pros:**
  - UX visual atrativa.
  - Permite comparar multiplas sessoes de um dia em um grafico.

- **Contras:**
  - **Spec inflada.** Grafico exige design + lib (recharts ja temos mas customizacao nao trivial) + responsive (mobile vs desktop layouts diferentes).
  - **Tabela ja resolve 90% dos casos (D11).** Founder principal pediu "ver delta por wallet" — tabela atende diretamente.
  - **V2 se strategist sugerir + ICE >= 8.** Mantem opcao aberta sem bloquear V1.
  - **Rejeitada — escopo controlado vence; pode subir V2.**

## Consequencias

### Positivas

- **Visibilidade de bankroll por sessao desbloqueada.** Founder audita "depois dessa noite quanto sobrou em cada plataforma" sem DevTools.
- **Manual_reports auditaveis visualmente.** Dado capturado pelo snapshot pos-tx (RF-03) renderizado em UI.
- **Single endpoint serve ambos os tipos.** `BankrollDetailModal` tem 1 query, 1 shape de resposta.
- **Coverage gracefully degradante.** Sessoes pos-Bankroll-3 plenamente suportadas; legacy mostra empty state honesto.
- **Botao gated impede UX quebrada.** `detailsAvailable` calculado server-side evita "click no botao, modal vazio, frustracao".
- **Immutable FX preservada.** ADR-034 invariante mantida — auditoria temporal valida.
- **Coach pode citar deltas.** Tool futura pode ler endpoint para responder "qual wallet teve maior queda na sessao 19h-22h?".
- **Empty state didatico.** Founder aprende sobre auto-snapshot ao ver "Sem snapshot disponivel — sessao anterior a Bankroll-3".

### Negativas

- **Mais um endpoint para documentar/manter.** ~150 linhas server-side + tests. Aceitavel para feature critica.
- **Sessoes legacy poluem UX com empty state.** Conforme founder usa pos-Bankroll-3, % degrada. Mitigado por copy + tooltip.
- **Lookup precedence pode confundir devs novos.** ADR + comentarios inline em `walletService.getBalanceSnapshotPair` mitigam.
- **Snapshot temporal proximo (D7 fallback 2) pode dar par "errado" se snapshot foi tirado por outra acao.** Ex: snapshot manual entre sessao A e sessao B usaria como `after` da A e `before` da B — atribui delta de A errado se houve `manual_adjustment` entre. Aceitavel; raro; founder pode auditar via ledger.
- **Cluster D5 + lookup intervalo `[from-1ms, to+1ms]` em manual_report** eh logica especifica do frontend (RF-12) — duplica conhecimento do server. Mitigado por documentacao em RF-06.

### Neutras

- **Wallets is_shot_pocket (excluidas de consolidatedUSD)** ainda aparecem no modal — auditoria total. Founder pode filtrar V2 se ruido.
- **Sem cache no endpoint inicialmente.** Latencia <100ms aceita; cache TanStack no frontend (`queryKey: ['wallet-snapshot-pair', from, to]`) cobre re-renders.
- **Sem export PDF/CSV.** Out of scope V1; pode subir V2 (#11 lessons-learned default minimo respeitado).
- **Mobile responsive (RF-15)** nao impacta endpoint — apenas layout: dialog vira sheet, table vira cards.
- **Endpoint nao filtra wallets archived.** Aparecem em `before/after` se contribuiram para o intervalo. Frontend pode filtrar via toggle V2.
- **Edge case "wallet criada/arquivada no intervalo"** documentado acima — frontend renderiza badge informativo.

## Confianca

**Alta.** Padrao "endpoint com lookup precedence + empty state honesto" eh estabelecido (ADR-058 telemetria + skip; ADR-061 fxResolver cascata). Reuso de `bankroll_snapshots` existente sem schema delta. Risco principal (sessoes legacy sem cobertura) tem mitigacao concreta (botao gated + copy didatica). Reversibilidade alta: remover endpoint + esconder botao = volta ao estado atual sem perda de dados.

## Referencias

- Spec: `Docs/specs/sprint-bankroll-reports-detail.md` (RF-05, RF-06, RF-11, RF-12, D6, D7, D8, D11)
- ADR-017: Bankroll snapshot vs derived
- ADR-034: Multi-wallet com immutable FX (`exchange_rates_used` jsonb)
- ADR-046: `session_wallet_snapshots` table (padrao snapshot per-wallet)
- ADR-047: Summary inline reconcile (B2)
- ADR-058: Auto-snapshot pos-cooldown (origin='auto-cooldown', source_ref_id=cooldownLogId)
- ADR-059: Cross-wallet transfer (origin='transfer' opcional)
- ADR-061: `fxResolver` unificado (USD conversion para `delta`)
- ADR-069 (companion): Manual balance report sem session (origin='manual-report')
- Diagrama ER: `Docs/architecture/bankroll-reports-detail-er-extension.mermaid`
- Diagrama fluxo modal: `Docs/architecture/bankroll-reports-detail-flow-modal.mermaid`
- Endpoint: `server/routes/wallets.ts` (novo `GET /balance-snapshot-pair`)
- Frontend: `client/src/components/bankroll/BankrollDetailModal.tsx` (NOVO)
- Sub-componente: `client/src/components/bankroll/WalletDeltaTable.tsx` (NOVO)
- History endpoint: `server/routes/grind-sessions.ts` (`detailsAvailable` calc)
