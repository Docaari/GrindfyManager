---
sprint: bankroll-reports-detail
status: PROPOSED
owner: AFK autonomous (founder out)
branch: feature/bankroll-standalone-reports-grind-detail
worktree: B:\grindfy-bankroll-reports
prereqs:
  - Sprint Bankroll-2.1 (Wallet Balance Mode + optimistic concurrency, ADR-038)
  - Sprint Bankroll-3 (auto-snapshot pos-cooldown, transfers, pending, stops, ROI by platform, ADRs 058-061)
  - Sprint B2 (SessionSummaryModal reconcile inline + BankrollReconcileSection)
migrations:
  reserved: 0022
  forbidden: [0020, 0021]
created: 2026-05-01
---

# Sprint Bankroll-Reports-Detail

> Permite "Reportar saldo" sem sessao ativa + visibilidade do impacto bankroll por sessao no historico de /grind.

---

## 1. Resumo Executivo

### Problema 1 — "Reportar saldo" exige sessionId (regressao)

Hoje `WalletTransactionDialog` no modo "Reportar saldo" forca `reason='session_result'`. Servidor (`server/services/walletService.ts:355-361`) rejeita com `400 "sessionId obrigatorio quando reason=session_result"` se nao houver sessao ativa.

Isso bloqueia o caso de uso legitimo: usuario quer registrar **"PokerStars esta em $1.247 agora"** sem ter iniciado sessao no app (jogou fora do app, fez retirada externa, esqueceu de iniciar grind). Founder ja pediu remover esse vinculo antes — feature regrediu.

**Esperado:** sistema cria `wallet_transaction` com delta calculado contra saldo atual + persiste com `reason='manual_report'` (NOVO) e `session_id=NULL`. Dispara snapshot automatico com `origin='manual-report'`.

### Problema 2 — Grind sem visibilidade do impacto bankroll por sessao

Hoje historico de sessoes em `/grind` (`SessionHistory.tsx`, endpoint `GET /api/grind-sessions/history`) mostra dados da sessao (torneios, profit calculado de buy-ins) mas **nao** mostra como a sessao impactou os saldos das wallets. User nao consegue auditar "depois dessa sessao quanto sobrou em cada plataforma".

**Esperado:**
1. Adicionar tipo de entry **"Report de resultados"** no historico — manual_report standalone aparece como linha distinta com data/hora, plataformas afetadas, ganho/perda agregado USD, **sem** detalhes de torneios. Entra no profit total da pagina.
2. Botao **"Ver detalhes da banca"** em cada linha (sessoes registradas + manual reports). Click abre modal com tabela `Plataforma | Saldo antes | Saldo depois | Delta nativo | Delta USD`. Source: `bankroll_snapshots` antes/depois ou `wallet_transactions` agregadas no intervalo.

### Valor para o Founder

- **Audit trail completo:** toda mutacao de banca (sessao ou manual) tem snapshot pre/pos rastreavel.
- **Confianca em saldos reportados:** founder pode reportar saldo sem precisar simular sessao falsa.
- **Visibilidade granular:** /grind para de ser "lista de buy-ins" e vira "log de mutacoes da banca".
- **Coach beneficia:** read_user_bankroll_history passa a expor manual_reports separadamente — Coach pode comentar "Voce reportou perda nao-rastreada de $300 ontem em PokerStars".

---

## 2. Defaults Decididos (D1-D14)

| ID | Decisao | Racional |
|---|---|---|
| **D1** | Novo reason `manual_report` em `WALLET_TX_REASONS`. Label PT-BR "Report manual". Helper `isStandaloneReason(reason)` retorna true para `manual_report`. | Separar semanticamente "delta vinculado a sessao" de "delta sem sessao". Necessario para Coach + filtros UI. |
| **D2** | Validacao mutuamente exclusiva: `session_result` exige `sessionId`; `manual_report` PROIBE `sessionId`; outros reasons (deposit/withdrawal/adjustment/transfer_in/transfer_out/rakeback) ignoram `sessionId`. | Evita estado ambiguo. `manual_report` com sessionId quebra premissa "manual = avulso". |
| **D3** | Snapshot `origin` novo: `'manual-report'` adicionado ao CHECK constraint de `bankroll_snapshots.origin`. Migration 0022. | Reporting/analytics precisam distinguir snapshot disparado por report manual vs auto-cooldown. |
| **D4** | History endpoint unificado: estender `GET /api/grind-sessions/history` retornando union type `{ type: 'session' | 'manual_report', ... }`. Preserva contract via campo opcional `type` (default `'session'` se ausente — back-compat com clients antigos). | Evita N+1 fetches no frontend. Mantem ordem cronologica unificada. |
| **D5** | Cluster manual_reports: transactions com `reason='manual_report'` dentro de janela **5min** agrupam em UM entry. Timestamp = mais antigo. | Founder reporta multiplas wallets em sequencia ("PS=$1247", "GG=$832", "ACR=$410"). Mostrar 3 linhas separadas polui historico. |
| **D6** | Detail modal **sem** snapshot disponivel: empty state com explicacao "Snapshot indisponivel — saldo registrado retroativamente" + sugestao "Verifique extrato bancario manualmente". Sem fallback hacky. | Honestidade > maquiagem. Founder prefere "nao tenho dado" do que "dado inferido errado". |
| **D7** | Snapshot lookup precedence (sessao registrada): (1) `bankroll_snapshots WHERE session_id = sessionId AND origin = 'auto-cooldown'`; (2) snapshot mais proximo ANTES `startedAt` para `before`, mais proximo DEPOIS `completedAt` para `after`; (3) empty state. | Cobre sessoes auto-snapshot (Sprint B3 RF-2) + sessoes legacy sem snapshot dedicado. |
| **D8** | Snapshot lookup (manual_report): `before = wallet.balance_native - transaction.delta` (calculado); `after = transaction.balance_after_native`. Empty se data corrupta (`balance_after_native = NULL`). | Manual report ja tem after computado em tx. Before deriva por aritmetica simples. |
| **D9** | Profit total da pagina /grind: somar `wallet_transactions.delta_usd_at_time` para sessoes registradas + manual_reports. Re-converter via `fxResolver` se `delta_usd_at_time` ausente (sessoes pre-FX-aware). | Lessons-learned #6 (FX-aware). Manter consistencia com Sprint Bankroll-2 QW-1. |
| **D10** | Filtros default: **"Tudo"** (sessoes + reports). Persistir em `localStorage['grind-history-filter']`. | Default mais informativo. Power-user pode filtrar para auditar so um tipo. |
| **D11** | `BankrollDetailModal`: sem grafico V1 (so tabela). Grafico de barras antes/depois fica V2 se strategist sugerir e ICE >= 8. | Escopo controlado. Tabela ja resolve 90% dos casos. |
| **D12** | Coach tool extension: estender `read_user_bankroll_history` retornando entries com `type: 'session' | 'manual_report'`. Backward compat: omitir `type` em clients antigos = trata como `'session'`. | Coach precisa distinguir "voce jogou e perdeu" vs "voce reportou perda externa". |
| **D13** | Migration 0022: idempotente via `DO $$ ... EXCEPTION WHEN duplicate_object ... $$`. So altera CHECK constraint se existir. | Permite re-run sem erro. Defensivo contra ambiente local + neon. |
| **D14** | Rate-limit fallback (R9): subagente falhar 3x = implementar direto. Marcar `R9_FALLBACK` no commit message. | Auto mode + AFK. Evita bloqueio infinito por rate-limit Anthropic. |

---

## 3. Modelo de Dados

### 3.1 `shared/wallet-reasons.ts` — adicionar `manual_report`

```ts
export const WALLET_TX_REASONS = [
  // P0
  "deposit",
  "withdrawal",
  "session_result",
  "rakeback",
  "manual_adjustment",
  // Sprint Bankroll-Reports-Detail (NOVO)
  "manual_report",
  // P1 reservados
  "transfer_in", "transfer_out", "fee", "fx_adjustment",
  "transfer_fee",
  "staking_payout", "staking_buyin", "makeup_clear",
] as const;

// NOVO: helper para distinguir reasons que NAO vinculam sessao
export function isStandaloneReason(reason: WalletTxReason): boolean {
  return reason === "manual_report";
}

// Estender WALLET_TX_REASONS_P0 incluindo manual_report
export const WALLET_TX_REASONS_P0 = [
  "deposit", "withdrawal", "session_result", "rakeback",
  "manual_adjustment", "manual_report",
] as const;

// Label PT-BR (extender se houver mapa central; senao criar `WALLET_TX_REASON_LABELS_PT`)
export const WALLET_TX_REASON_LABELS_PT: Record<WalletTxReason, string> = {
  deposit: "Deposito",
  withdrawal: "Saque",
  session_result: "Resultado de sessao",
  rakeback: "Rakeback",
  manual_adjustment: "Ajuste manual",
  manual_report: "Report manual", // NOVO
  // ... demais
};
```

Estender `WalletTxBodyRefinedSchema.superRefine` com regras D2:

```ts
.superRefine((data, ctx) => {
  if (data.reason === "rakeback" && data.direction === "out") { /* existente */ }
  if (data.reason === "session_result" && !data.sessionId) {
    ctx.addIssue({ /* session_id_required */ });
  }
  if (data.reason === "manual_report" && data.sessionId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sessionId"],
      message: "manual_report nao aceita sessionId — use session_result",
    });
  }
});
```

### 3.2 `bankroll_snapshots.origin` — CHECK constraint

Origins aceitas (apos sprint):
`'manual'`, `'auto-cooldown'`, `'transfer'`, `'import'`, `'manual-report'` (NOVO)

Migration **0022_manual_report_origin.sql**:

```sql
-- Sprint Bankroll-Reports-Detail RF-04
-- Adiciona 'manual-report' ao CHECK constraint de bankroll_snapshots.origin.
-- Idempotente: so altera se constraint existir, recria com nova lista.

DO $$
BEGIN
  -- Drop CHECK existente se houver (nome convencional)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bankroll_snapshots_origin_check'
  ) THEN
    ALTER TABLE bankroll_snapshots DROP CONSTRAINT bankroll_snapshots_origin_check;
  END IF;

  -- Recria com 'manual-report' incluido
  ALTER TABLE bankroll_snapshots
    ADD CONSTRAINT bankroll_snapshots_origin_check
    CHECK (origin IN ('manual', 'auto-cooldown', 'transfer', 'import', 'manual-report'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_column THEN
    RAISE NOTICE 'bankroll_snapshots.origin nao existe ainda; pulando.';
END $$;

-- Index ja existe (0018). Nada a fazer.
```

### 3.3 Sem alteracoes em outras tabelas

`wallet_transactions` ja tem `reason VARCHAR` aberto + `session_id NULL-able`. Nada de DDL.

---

## 4. Requisitos Funcionais

### Backend (RF-01 ate RF-08)

---

#### RF-01 — Novo reason `manual_report` em `shared/wallet-reasons.ts`

**Descricao:** adicionar `'manual_report'` ao enum `WALLET_TX_REASONS` + `WALLET_TX_REASONS_P0` + helper `isStandaloneReason()` + label PT-BR + estender `WalletTxBodyRefinedSchema`.

**Criterios de aceitacao:**
- [ ] `WALLET_TX_REASONS.includes('manual_report')` === true
- [ ] `WALLET_TX_REASONS_P0.includes('manual_report')` === true
- [ ] `isStandaloneReason('manual_report')` === true; `isStandaloneReason('session_result')` === false
- [ ] `WALLET_TX_REASON_LABELS_PT.manual_report` === `'Report manual'`
- [ ] `WalletTxBodyRefinedSchema.parse({ reason: 'manual_report', sessionId: 'SES-1', ... })` lanca ZodError com mensagem `"manual_report nao aceita sessionId"`
- [ ] `WalletTxBodyRefinedSchema.parse({ reason: 'session_result', sessionId: undefined, ... })` lanca ZodError `"session_id_required"`
- [ ] `WalletTxBodyRefinedSchema.parse({ reason: 'manual_report', sessionId: undefined, direction: 'in', nativeAmount: 1247 })` SUCEDE

**Dependencias:** nenhuma.

**Lessons aplicaveis:** #8 (NAO testar `WALLET_TX_REASONS.length === N` — usar `.includes()`).

---

#### RF-02 — Relaxar validacao server-side em `walletService.ts`

**Descricao:** modificar `recordWalletTransaction` em `server/services/walletService.ts:340+` para aplicar regras D2 (mutuamente exclusivo). Hoje so checa `session_result + !sessionId`.

**Criterios de aceitacao:**
- [ ] POST com `reason='manual_report'` + `sessionId=undefined` retorna 200 + cria tx com `session_id=NULL`
- [ ] POST com `reason='manual_report'` + `sessionId='SES-X'` retorna 400 com code `manual_report_no_session`
- [ ] POST com `reason='session_result'` + `sessionId=undefined` retorna 400 com code `session_id_required` (comportamento atual mantido)
- [ ] POST com `reason='deposit'` + qualquer sessionId nao quebra (ignorado, mantido)
- [ ] Reason `manual_report` aceita em `WALLET_TX_REASONS_P0` check (RF-01 pre-req)

**Dependencias:** RF-01.

**Lessons aplicaveis:** #9 (logue antes de fallback — manter `console.error` em paths de erro).

---

#### RF-03 — POST `/api/wallets/:id/transactions` aceita `manual_report` + dispara snapshot

**Descricao:** quando `reason='manual_report'` recebido, criar `wallet_transaction` com `session_id=NULL` + disparar snapshot automatico via `createAutoSnapshot()` (reuso, Sprint B3 RF-2) com `origin='manual-report'` e `source_ref_id=transaction.id`.

**Criterios de aceitacao:**
- [ ] POST `manual_report` cria 1 row em `wallet_transactions` com `session_id=NULL`, `reason='manual_report'`, `delta_usd_at_time` calculado via fxResolver
- [ ] Apos sucesso, 1 row criada em `bankroll_snapshots` com `origin='manual-report'`, `source_ref_id=<tx.id>`, `user_id` correto
- [ ] Snapshot captura saldo de TODAS as wallets do user (nao so a impactada) — comportamento padrao de `createAutoSnapshot`
- [ ] Falha de snapshot NAO faz rollback da transaction (snapshot eh best-effort, mesmo padrao Sprint B3 RF-2)
- [ ] Response inclui `{ transaction, wallet, snapshot?: { id, origin } }`

**Dependencias:** RF-01, RF-02, RF-04 (migration aplicada).

**Lessons aplicaveis:** #6 (FX-aware), #9 (log no fallback de snapshot).

---

#### RF-04 — Migration `0022_manual_report_origin.sql`

**Descricao:** criar `migrations/0022_manual_report_origin.sql` adicionando `'manual-report'` ao CHECK constraint de `bankroll_snapshots.origin`. Idempotente.

**Criterios de aceitacao:**
- [ ] Arquivo `migrations/0022_manual_report_origin.sql` existe
- [ ] `psql -f 0022...sql` executa sem erro em DB com constraint existente
- [ ] Re-run da migration nao falha (idempotencia via `DO $$ ... EXCEPTION ...`)
- [ ] Apos migration, `INSERT INTO bankroll_snapshots (..., origin) VALUES (..., 'manual-report')` SUCEDE
- [ ] `INSERT ... origin='invalid-x'` ainda FALHA (constraint preservada)

**Dependencias:** nenhuma. Aplicar via `psql` antes de RF-03.

**Lessons aplicaveis:** #7 (deprecation gradual via DO $$).

---

#### RF-05 — Estender `GET /api/grind-sessions/history` com union type

**Descricao:** modificar `server/routes/grind-sessions.ts:522+` para retornar union de sessoes registradas + manual_reports clusterizados (D5).

**Shape de resposta:**

```ts
type HistoryEntry =
  | {
      type: 'session';
      id: string;             // grind_sessions.id
      occurredAt: string;     // ISO — startedAt
      completedAt: string;
      profitUsd: number;
      tournamentsCount: number;
      platformsAffected: string[];  // sites unicos das tournaments
      detailsAvailable: boolean;    // true se snapshot before+after existir
      // ... campos existentes mantidos (status, network, etc)
    }
  | {
      type: 'manual_report';
      id: string;             // ID sintetico cluster: `mr_<oldestTxId>`
      occurredAt: string;     // ISO — tx mais antigo do cluster
      profitUsd: number;      // soma delta_usd_at_time do cluster
      transactionIds: string[];  // ids de TODAS as txs no cluster
      platformsAffected: string[]; // sites das wallets afetadas
      detailsAvailable: boolean;   // true sempre (manual_report tem before computado)
    };

type Response = HistoryEntry[]; // ordem desc por occurredAt
```

**Cluster algorithm (D5):**
1. SELECT todas `wallet_transactions WHERE user_id=? AND reason='manual_report'` ordem ASC.
2. Greedy: iniciar cluster com primeira tx; agrupar enquanto `nextTx.occurredAt - clusterStart.occurredAt <= 5min`.
3. Fechar cluster quando gap > 5min ou wallet repetida (mesma wallet 2x = clusters separados).

**Criterios de aceitacao:**
- [ ] Sessao registrada existente continua aparecendo com `type: 'session'` (back-compat — campo opcional default)
- [ ] Manual report standalone aparece com `type: 'manual_report'`
- [ ] 3 manual reports em wallets diferentes dentro de 4min = 1 entry com 3 ids em `transactionIds`
- [ ] 2 manual reports em wallets diferentes com 6min de gap = 2 entries
- [ ] 2 manual reports na MESMA wallet com 2min de gap = 2 entries (D5 regra de wallet repetida)
- [ ] `platformsAffected` resolve via `wallet.platform`/`wallet.site`
- [ ] `detailsAvailable: true` para manual_report sempre; para session: true sse snapshots before+after disponiveis (D7)
- [ ] Ordem desc por `occurredAt`

**Dependencias:** RF-01.

**Lessons aplicaveis:** #6 (FX-aware soma), #11 (default minimo — `type` opcional).

---

#### RF-06 — Novo endpoint `GET /api/wallets/balance-snapshot-pair`

**Descricao:** retornar snapshots before/after dado intervalo `[from, to]`. Usado pelo `BankrollDetailModal` (RF-12).

**Request:**
- `GET /api/wallets/balance-snapshot-pair?from=2026-05-01T18:00:00Z&to=2026-05-01T22:00:00Z`
- Auth: `requireAuth`

**Response:**
```ts
{
  before: Array<{
    walletId: string;
    walletName: string;
    platform: string;
    currency: string;
    balanceNative: number;
    balanceUsd: number;
    snapshotId: string | null;  // null se derivado por aritmetica
    snapshotOrigin: string | null;
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
  empty: boolean;  // true se NAO foi possivel resolver before/after (D6)
  emptyReason?: 'no_snapshot_before' | 'no_snapshot_after' | 'data_corrupt';
}
```

**Lookup precedence (D7):**
- `before`: snapshot mais recente com `created_at <= from` (qualquer origin)
- `after`: snapshot mais antigo com `created_at >= to` (qualquer origin)
- Se ambos ausentes: `empty: true`

**Criterios de aceitacao:**
- [ ] Sessao com auto-cooldown snapshot retorna `before` e `after` populados
- [ ] Sessao sem snapshot dedicado retorna snapshot mais proximo (D7 fallback)
- [ ] Sessao sem snapshot algum retorna `empty: true, emptyReason: 'no_snapshot_before'`
- [ ] `delta[i].deltaUsd` === `after[i].balanceUsd - before[i].balanceUsd`
- [ ] `delta[i].deltaNative` === `after[i].balanceNative - before[i].balanceNative`
- [ ] Wallets sem mudanca aparecem com delta=0 (nao filtrar)
- [ ] Wallets criadas no intervalo: aparecem em `after` mas nao em `before` (mostrar `before.balanceNative=0`)
- [ ] Auth obrigatorio — 401 sem token

**Dependencias:** snapshots existentes (Sprint B3 RF-2, B2.1).

**Lessons aplicaveis:** #6 (FX-aware), #9 (logar quando empty).

---

#### RF-07 — Coach tool `read_user_bankroll_history` inclui `type`

**Descricao:** estender `server/coach/tools/readUserBankrollHistory.ts` para incluir campo `type: 'session' | 'manual_report'` em cada entry retornado. Manter back-compat (clients antigos do Coach ignoram campo extra).

**Criterios de aceitacao:**
- [ ] Tool reuso de `getGrindSessionHistory()` (mesmo source que RF-05)
- [ ] Cada entry no retorno do tool tem campo `type`
- [ ] Manual reports aparecem como entries separados (cluster D5 aplicado)
- [ ] Schema JSON do tool documenta campo `type` em description
- [ ] Tests passam com novo shape (snapshot tests do tool)

**Dependencias:** RF-05.

**Lessons aplicaveis:** #10 (DRY de prompts — descricao do tool nao duplica logica).

---

#### RF-08 — `dashboardService.ts` profit calc soma manual_report deltas USD

**Descricao:** atualizar funcoes em `server/services/dashboardService.ts` (calc de profit per platform/period) para incluir `wallet_transactions WHERE reason='manual_report'` na soma de profit.

**Criterios de aceitacao:**
- [ ] Profit por platform inclui delta de manual_reports da wallet
- [ ] Profit por periodo (dia/semana/mes) inclui manual_reports no intervalo
- [ ] Manual_reports aparecem em metricas separadas se houver granularidade por reason (back-compat: campo opcional)
- [ ] Zero impacto se user nao tem manual_reports (regression test)

**Dependencias:** RF-01, RF-03.

**Lessons aplicaveis:** #6 (FX-aware), #12 (cuidado com cache TanStack — invalidar `dashboard` queries pos-manual_report).

---

### Frontend (RF-09 ate RF-15)

---

#### RF-09 — `WalletTransactionDialog` refactor: modo "Reportar saldo" sem sessionId

**Descricao:** modificar `client/src/components/.../WalletTransactionDialog.tsx`:
- Modo "Reportar saldo" auto-seleciona `reason` baseado em prop `sessionId`:
  - `sessionId` presente → `reason='session_result'` (comportamento atual)
  - `sessionId` ausente → `reason='manual_report'` (NOVO)
- Helper text PT-BR: `"Sem sessao ativa — sera registrado como Report manual"` quando standalone
- Submit: omit `sessionId` do body se `reason='manual_report'`

**Criterios de aceitacao:**
- [ ] Dialog aberto via `<WalletTransactionDialog mode="report" sessionId={undefined} />` envia `reason='manual_report'`, sem `sessionId`
- [ ] Dialog aberto via `<WalletTransactionDialog mode="report" sessionId="SES-1" />` envia `reason='session_result'`, com `sessionId`
- [ ] Helper text muda dinamicamente
- [ ] Submit success: invalida queries `wallets`, `bankroll-snapshots`, `grind-history`, `dashboard`
- [ ] Modo "Movimento" inalterado
- [ ] data-testid `wallet-tx-dialog-helper-text` para test

**Dependencias:** RF-02, RF-03.

**Lessons aplicaveis:** #2 (data-testid estavel), #11 (default minimo — sem actions decorativas), #12 (invalidate cache).

---

#### RF-10 — Bankroll page `/bankroll` botao "+ Reportar saldo" funciona standalone

**Descricao:** garantir que botao em `/bankroll` (page) abre `WalletTransactionDialog` com `mode="report" sessionId={undefined}` e flow completa sem 400.

**Criterios de aceitacao:**
- [ ] Botao "+ Reportar saldo" em `/bankroll` abre dialog
- [ ] Submit com saldo informado cria `manual_report` tx via RF-03
- [ ] UI atualiza saldo da wallet imediatamente (optimistic ou invalidate)
- [ ] Toast PT-BR: `"Saldo reportado com sucesso"`
- [ ] data-testid `bankroll-report-balance-btn`

**Dependencias:** RF-09.

**Lessons aplicaveis:** #2, #12.

---

#### RF-11 — `SessionHistory.tsx` — novo entry type "Report de resultados"

**Descricao:** modificar `client/src/components/grind/SessionHistory.tsx` (ou path equivalente) para renderizar entries `type='manual_report'` distintamente:

- Icone: `Wallet` (lucide-react)
- Badge PT-BR: `"Report manual"`
- Chips de plataformas afetadas (1 chip por platform em `platformsAffected`)
- Profit USD destacado (verde +/vermelho -)
- **Sem** secao expandivel de torneios (nao se aplica)
- Botao `"Ver detalhes da banca"` (RF-12)

**Criterios de aceitacao:**
- [ ] Entry `type='manual_report'` renderiza icone Wallet + badge "Report manual"
- [ ] Entry `type='session'` renderiza como hoje (sem regressao)
- [ ] Plataformas viram chips clicaveis (filtrar historico por platform — opcional V2)
- [ ] Profit USD usa formato existente (`formatUsd()` helper)
- [ ] Botao "Ver detalhes da banca" presente em AMBOS os tipos de entry
- [ ] data-testid: `session-history-entry-{type}-{id}`, `view-bankroll-detail-btn-{id}`

**Dependencias:** RF-05.

**Lessons aplicaveis:** #2, #11 (sem actions extras nao especificadas).

---

#### RF-12 — `BankrollDetailModal.tsx` NOVO componente

**Descricao:** novo arquivo `client/src/components/bankroll/BankrollDetailModal.tsx` + sub-componente `WalletDeltaTable.tsx`.

**Props:**
```ts
interface BankrollDetailModalProps {
  open: boolean;
  onClose: () => void;
  entry: HistoryEntry; // session ou manual_report
}
```

**Comportamento:**
- Fetch via TanStack Query: `GET /api/wallets/balance-snapshot-pair?from=...&to=...`
  - Para `type='session'`: `from=startedAt`, `to=completedAt`
  - Para `type='manual_report'`: `from=cluster.occurredAt - 1ms`, `to=cluster.occurredAt + 1ms` (snapshot capturado pelo RF-03)
- Loading state: skeleton de tabela
- Empty state (D6): mensagem PT-BR + sugestao
- Tabela colunas: `Plataforma | Saldo antes | Saldo depois | Delta nativo | Delta USD`
- Footer: total `Delta USD` (soma)

**Criterios de aceitacao:**
- [ ] Modal abre/fecha via `open` prop
- [ ] Loading skeleton enquanto query em flight
- [ ] Tabela popula com `delta` array de RF-06
- [ ] Empty state quando `empty: true` — texto: `"Snapshot indisponivel — saldo registrado retroativamente"` + linha `"Verifique extrato bancario manualmente"`
- [ ] Footer total USD: soma de `delta[i].deltaUsd`
- [ ] Wallets com delta=0 aparecem (NAO filtrar)
- [ ] Cores: delta>0 verde, delta<0 vermelho, delta=0 cinza
- [ ] data-testid: `bankroll-detail-modal`, `wallet-delta-row-{walletId}`, `bankroll-detail-empty`, `bankroll-detail-total`

**Dependencias:** RF-06, RF-11.

**Lessons aplicaveis:** #1 (hooks antes de early return), #2 (data-testid), #11 (sem actions extras), #12 (queryKey estavel).

---

#### RF-13 — Profit total da pagina /grind atualizado para incluir manual reports

**Descricao:** o cabecalho de `/grind` mostra "Profit total: $X". Atualizar calc para incluir manual_reports.

**Criterios de aceitacao:**
- [ ] Profit total = soma de `entry.profitUsd` de TODOS entries (session + manual_report) respeitando filtro D10
- [ ] Filtro "Apenas sessoes" mostra so sessoes; "Apenas reports" so manual_reports; "Tudo" ambos
- [ ] Re-calcula quando filtro muda (sem re-fetch — derivacao client-side)
- [ ] Formato existente (`formatUsd`)

**Dependencias:** RF-05, RF-14.

**Lessons aplicaveis:** #6 (FX-aware ja resolvido em RF-05), #11.

---

#### RF-14 — Filtros toggle "Apenas sessoes / Apenas reports / Tudo" no historico

**Descricao:** adicionar filter chips no topo do historico em `/grind`. Persistir selecao em `localStorage['grind-history-filter']` (D10).

**Criterios de aceitacao:**
- [ ] 3 chips: `"Tudo"` (default), `"Apenas sessoes"`, `"Apenas reports"`
- [ ] Click em chip filtra entries client-side
- [ ] Selecao persiste em `localStorage['grind-history-filter']`
- [ ] Reload da pagina recupera filtro
- [ ] Chip ativo destacado (estilo Tailwind `bg-primary text-primary-foreground`)
- [ ] data-testid: `grind-history-filter-{all|sessions|reports}`

**Dependencias:** RF-11.

**Lessons aplicaveis:** #2, #12 (localStorage hidratacao SSR-safe — `useEffect` com window check).

---

#### RF-15 — Mobile responsive (modal full-screen <768px, tabela vira cards)

**Descricao:** `BankrollDetailModal` adaptativo:
- `>= 768px`: modal centralizado, tabela compacta
- `< 768px`: full-screen Sheet, cada wallet vira Card (Plataforma top, Antes/Depois em grid 2-col, Delta em destaque)

**Criterios de aceitacao:**
- [ ] Viewport >=768px: render `<Dialog>` com `<Table>`
- [ ] Viewport <768px: render `<Sheet side="bottom">` com lista de `<Card>`
- [ ] Card layout: header=`platform` + `walletName`; body=grid 2 colunas (Antes | Depois) + linha total Delta
- [ ] Acessivel via teclado (focus trap em Sheet)
- [ ] data-testid: `bankroll-detail-card-{walletId}` (mobile), `bankroll-detail-row-{walletId}` (desktop)

**Dependencias:** RF-12.

**Lessons aplicaveis:** #2.

---

## 5. Endpoints — Request/Response Shapes

### POST `/api/wallets/:id/transactions` (estendido — RF-03)

**Request:**
```json
{
  "direction": "in",
  "nativeAmount": 1247.50,
  "reason": "manual_report",
  "note": "Saldo reportado pos-jogo externo",
  "occurredAt": "2026-05-01T22:30:00Z"
  // sessionId OMITIDO (D2)
}
```

**Response 200:**
```json
{
  "transaction": {
    "id": "tx_abc123",
    "walletId": "wal_xyz",
    "userId": "USER-1234",
    "direction": "in",
    "nativeAmount": 1247.50,
    "deltaUsdAtTime": 1247.50,
    "balanceAfterNative": 1247.50,
    "reason": "manual_report",
    "sessionId": null,
    "occurredAt": "2026-05-01T22:30:00Z"
  },
  "wallet": { /* updated wallet state */ },
  "snapshot": {
    "id": "snap_def456",
    "origin": "manual-report",
    "sourceRefId": "tx_abc123"
  }
}
```

**Errors:**
- 400 `manual_report_no_session` — `sessionId` enviado com `manual_report`
- 400 `session_id_required` — `session_result` sem `sessionId`
- 400 `reason_not_supported_in_p0` — reason fora P0
- 401 — sem token

### GET `/api/grind-sessions/history` (estendido — RF-05)

**Response 200:** array `HistoryEntry[]` (shape em RF-05).

### GET `/api/wallets/balance-snapshot-pair` (NOVO — RF-06)

Shape em RF-06.

---

## 6. Fluxos UX

### Fluxo A — Manual report standalone (Problema 1 resolvido)

1. Founder abre `/bankroll`
2. Click `[+ Reportar saldo]` → abre `WalletTransactionDialog` modo "Reportar saldo", `sessionId=undefined`
3. Helper text: `"Sem sessao ativa — sera registrado como Report manual"`
4. Founder seleciona wallet "PokerStars", informa saldo `$1247`
5. Submit → POST `/api/wallets/wal_ps/transactions` `{ reason: 'manual_report', ... }` (RF-03)
6. Backend cria tx + snapshot `origin='manual-report'`
7. Toast: `"Saldo reportado com sucesso"`
8. Wallet card atualiza saldo
9. Em `/grind`, novo entry aparece no historico: badge "Report manual", chip "PokerStars", delta USD

### Fluxo B — Abrir detail modal de sessao registrada (Problema 2 parte 1)

1. Founder em `/grind` ve historico
2. Sessao "Grind 19h-22h" tem botao `[Ver detalhes da banca]`
3. Click → abre `BankrollDetailModal` (RF-12)
4. Modal fetch `GET /api/wallets/balance-snapshot-pair?from=19:00&to=22:30`
5. Tabela: PokerStars $800→$650 (-$150), GG $400→$520 (+$120), ACR $200→$200 ($0)
6. Footer: `Total: -$30 USD`
7. Founder fecha → volta historico

### Fluxo C — Abrir detail modal de manual_report (Problema 2 parte 2)

1. Founder em `/grind`, entry "Report manual 14:32" tem `[Ver detalhes da banca]`
2. Click → modal fetch com `from=cluster.occurredAt - 1ms`, `to=cluster.occurredAt + 1ms`
3. Modal mostra snapshot capturado pelo RF-03 — Antes/Depois do report
4. Caso snapshot ausente: empty state D6
5. Footer: total delta cluster

---

## 7. Conflict Avoidance

### NAO TOCAR (paths reservados a outras sprints/sessoes paralelas)
- `client/src/components/studies/**`
- `client/src/pages/Studies.tsx`
- `shared/hud-stat-catalog.ts`
- `shared/stat-direction-logic.ts`
- `server/routes/statsAnalyzer.ts`
- `server/routes/study-recommendations.ts`
- `client/src/components/studies/dashboard/**`

### PODE TOCAR
- `client/src/components/.../WalletTransactionDialog.tsx`
- `client/src/components/grind/SessionHistory*` (e variantes)
- `client/src/components/bankroll/BankrollDetailModal.tsx` (NOVO)
- `client/src/components/bankroll/WalletDeltaTable.tsx` (NOVO)
- `client/src/pages/Grind.tsx` (header profit + filtros)
- `client/src/pages/Bankroll.tsx` (botao + report)
- `server/services/walletService.ts`
- `server/services/dashboardService.ts`
- `server/services/bankrollService.ts`
- `server/routes/wallets.ts` (novo endpoint balance-snapshot-pair)
- `server/routes/grind-sessions.ts` (history estendido)
- `server/coach/tools/readUserBankrollHistory.ts`
- `shared/wallet-reasons.ts`
- `migrations/0022_manual_report_origin.sql` (NOVO)

### Migration numbering
- **Reservado:** 0022
- **Proibido:** 0020 (Sess 3 paralela), 0021 (Sess 4 paralela)

---

## 8. Cenarios de Teste Esperados (~110 distribuidos)

| RF | Categoria | Casos esperados | Total |
|---|---|---|---|
| RF-01 | unit (schema/enum) | enum, helper, label, schema validacao | ~10 |
| RF-02 | unit (walletService) | validacao mutuamente exclusiva | ~6 |
| RF-03 | integration (route) | manual_report tx + snapshot creation, fail isolation | ~10 |
| RF-04 | migration | apply, idempotent re-run, constraint enforces | ~3 |
| RF-05 | integration (route) | session entries, manual_report entries, cluster D5 (5min, wallet repeat), order, back-compat | ~12 |
| RF-06 | integration (route) | snapshot precedence D7, empty states, delta math, auth | ~10 |
| RF-07 | unit (coach tool) | tool inclui type, back-compat, schema doc | ~5 |
| RF-08 | unit (dashboardService) | profit per platform/period inclui manual_reports, regression sem reports | ~8 |
| RF-09 | RTL (dialog) | mode report+sessionId, mode report sem sessionId, helper text dynamic, submit shape | ~10 |
| RF-10 | RTL (page) | botao abre dialog, submit success, toast, invalidate | ~5 |
| RF-11 | RTL (history) | render manual_report entry, render session entry sem regressao, chips, sem secao tournaments | ~8 |
| RF-12 | RTL (modal) | open/close, loading, table populate, empty state D6, footer total, delta=0 visivel | ~10 |
| RF-13 | RTL (header) | profit total inclui reports, recalc on filter change | ~5 |
| RF-14 | RTL (filters) | 3 chips, click filtra, localStorage persist, reload recupera | ~5 |
| RF-15 | RTL (responsive) | <768 sheet/cards, >=768 dialog/table, focus trap | ~5 |

**Total estimado:** ~112 testes.

---

## 9. Lessons-Learned Obrigatorias

### #1 — Hooks primeiro
- `BankrollDetailModal` (RF-12): TODOS `useState`/`useQuery` ANTES de qualquer `if (!open) return null`. Test `renders without crashing when closed`.

### #2 — Tests com data-testid estavel
- Cada novo elemento UI ganha `data-testid` documentado no criterio de aceitacao.
- NAO usar `findByText(/Report manual/)` em test — usar `findByTestId('session-history-entry-manual_report-...')`.

### #3 — Mocks idealizados sao bug magnet
- Test de RF-05 (history) DEVE validar shape REAL de `wallet_transactions` row antes de mockar `storage.getWalletTransactions`. Inspecionar 1 row de teste (DB local) ou copiar de fixture existente.
- Test de RF-06 DEVE validar shape REAL de `bankroll_snapshots` (cols: `id`, `user_id`, `created_at`, `origin`, `source_ref_id`, `wallets_balances` jsonb...).

### #6 — Conversao de moeda
- `delta_usd_at_time` SEMPRE calculado via `fxResolver` em `walletService.recordWalletTransaction`. Nunca confiar em valor cliente.
- Profit total /grind (RF-13) re-converte se `delta_usd_at_time` ausente (sessoes pre-FX-aware).
- `BankrollDetailModal` exibe Delta nativo + Delta USD lado a lado para auditabilidade.

### #8 — Length de enum em test
- Tests de RF-01 NAO devem checar `WALLET_TX_REASONS.length === N`. Usar `expect(WALLET_TX_REASONS).toContain('manual_report')`.
- Spec RF-01 explicitamente lista checks `.includes()`.

### #11 — Default minimo em componentes
- `BankrollDetailModal` NAO ganha botoes "Exportar PDF", "Compartilhar", "Editar". So fecha modal.
- `SessionHistory` entry de manual_report NAO ganha "Editar report" (V2 se solicitado).
- Botao "Ver detalhes da banca" eh acao explicita da spec — OK.

### #12 — Estado persistente / cache
- `WalletTransactionDialog` submit success invalida queries: `['wallets']`, `['bankroll-snapshots']`, `['grind-history']`, `['dashboard']`.
- `BankrollDetailModal` queryKey: `['wallet-snapshot-pair', from, to]` — estavel cross re-mount.
- Filtro localStorage (RF-14) hydration SSR-safe via `useEffect(() => setFilter(localStorage.getItem(...)), [])`.

---

## 10. Riscos e Mitigacao

| Risco | Probabilidade | Impacto | Mitigacao |
|---|---|---|---|
| Migration 0022 conflita com 0020/0021 paralelos | Baixa | Alto | Numero reservado por sessao orquestradora. CHECK constraint de origin nao tem overlap com outros sprints (Stats/Spots). |
| Cluster D5 agrupa errado (5min muito curto/longo) | Media | Medio | Threshold 5min derivado de pattern observado (founder reportando ~3 wallets em sequencia). Tornar config se feedback negativo. |
| Snapshot lookup precedence D7 nao cobre legacy | Media | Medio | Fallback para "snapshot mais proximo" + empty state D6 explicito. Founder pode auditar manualmente. |
| `read_user_bankroll_history` Coach tool quebra clients antigos | Baixa | Alto | `type` opcional + back-compat doc explicita em tool description. |
| Frontend regressao em sessoes registradas (RF-11) | Media | Alto | RF-11 criterio explicito "sem regressao" + RTL test render session entry inalterado. |
| Optimistic concurrency (Sprint B2.1 ADR-038) interage mal com snapshot pos-manual_report | Baixa | Medio | Snapshot eh best-effort pos-tx (nao bloqueia). Se snapshot falhar, tx ja commitada. Logue erro. |
| Rate-limit Anthropic durante test-writer | Alta | Baixo | D14 — fallback direto apos 3 falhas. Marcar `R9_FALLBACK` no commit. |
| FX rate ausente em `delta_usd_at_time` para sessoes legacy | Media | Medio | RF-08 + RF-13 re-convertem via fxResolver. |

---

## 11. Definition of Done

- [ ] Migration 0022 aplicada via psql em DB local + idempotencia confirmada
- [ ] `npm run check` (tsc) passa sem erros
- [ ] Vitest: ~110 testes verdes (RF-01 ate RF-15)
- [ ] `npm run dev` boot OK (porta 3000)
- [ ] Smoke manual: criar manual_report standalone via UI → aparece em /bankroll + /grind historico
- [ ] Smoke manual: abrir detail modal de sessao + manual_report → tabelas populadas
- [ ] Smoke manual: empty state D6 reproduzido (sessao legacy sem snapshot)
- [ ] Filtros /grind persistem em localStorage
- [ ] Mobile (DevTools 375px) — modal vira sheet com cards
- [ ] Coach tool `read_user_bankroll_history` retorna `type` em entries
- [ ] ADR atualizado em `Docs/architecture/decisions/` se decisao significativa emergir (opcional — D1-D14 ja documentadas aqui)
- [ ] Memory file `session_2026-05-01-bankroll-reports-detail.md` criado pos-sprint
- [ ] Branch `feature/bankroll-standalone-reports-grind-detail` pushed (founder valida antes de merge)
- [ ] Reviewer agent invocado com APPROVED ou APPROVED-CLEAN
- [ ] Conflict avoidance respeitado (zero modificacao em paths reservados secao 7)

---

## 12. Pipeline de Execucao Sugerido

```
1. system-architect — diagrama Mermaid (fluxos A/B/C) + ADR-064 "manual_report reason + snapshot origin"
2. test-writer (RF-01 a RF-08, backend) — red phase
3. implementer (RF-01 a RF-08) — green phase
4. test-writer (RF-09 a RF-15, frontend) — red phase
5. implementer (RF-09 a RF-15) — green phase
6. /simplify pos-implementer
7. reviewer — round 1
8. (fix se necessario) — round 2
9. Smoke manual founder
10. Push branch (sem merge automatico — founder decide)
```

R9_FALLBACK ativo (D14): subagentes com 3 falhas consecutivas viram execucao direta marcada no commit.
