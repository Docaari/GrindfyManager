# ADR-039: Rakeback como `reason='rakeback'` em wallet_transactions (sem novo endpoint, sem nova tabela)

## Status
Proposto

## Data
2026-04-26

## Contexto

A spec `Docs/specs/rakeback-reporting.md` introduz um novo conceito de movimento financeiro extra-jogo: **rakeback** — devolucao percentual do rake pago pela sala de poker. Hoje o jogador registra rakeback como `reason='deposit'` ou `reason='manual_adjustment'` no ledger multi-wallet (ADR-034), o que contamina dois relatorios futuros importantes:

1. **"Depositos reais" (capital novo entrando):** rakeback inflado dentro de `deposit` distorce o KPI de aporte mensal — uma metrica que o jogador profissional usa para responder "estou queimando ou crescendo?".
2. **"Ganhos extra-jogo por plataforma":** sem distincao no schema, e impossivel responder "quanto a sala X devolveu de rakeback no ultimo mes?" sem heuristicas de texto na coluna `note` (fragil).

A pergunta arquitetural: **como modelar rakeback como first-class no ledger sem inflar o schema, sem quebrar backward-compat e sem antecipar features futuras (dashboard agregado, recurring rakeback, conversao automatica de moeda)?**

### Restricoes

- **Backward-compat 100%.** Rows historicas com `reason='deposit'` continuam validas; nao ha migracao retroativa.
- **Reuso de infra.** Sprint Bankroll-2 ja entrega `walletService.recordWalletTransaction` com `SELECT FOR UPDATE`, espelho em `bankroll_snapshots` e rate limit no router. Duplicar essa logica para um endpoint dedicado seria desperdicio.
- **Sem migration SQL.** `wallet_transactions.reason` e `bankroll_snapshots.reason` sao `varchar` (nao Postgres `enum type`). Adicionar valor e transparente no DB.
- **YAGNI.** Bonus, milestone reward, leaderboard, freeroll prize — outros ganhos extra-jogo possiveis no futuro — nao estao no escopo agora. Modelar prematuramente cria abstracoes erradas.
- **Diferente de balance-mode (ADR-038).** Rakeback nao depende de saldo previo conhecido pelo cliente: usuario informa **delta absoluto** ("recebi R$ 50 de rakeback"), nao **saldo final** ("agora tenho R$ 1.247"). Optimistic concurrency e desnecessario.

## Opcoes Consideradas

### Opcao A (ESCOLHIDA): Adicionar `'rakeback'` ao enum existente `WALLET_TX_REASONS_P0`; reusar `POST /api/wallets/:id/transactions`

Sem nova coluna, sem novo endpoint, sem nova tabela. Os shims:

```ts
// shared/wallet-reasons.ts
export const WALLET_TX_REASONS_P0 = [
  'deposit',
  'withdrawal',
  'session_result',
  'rakeback',          // <-- adicao
  'manual_adjustment',
] as const;
```

Validacao adicional no service-layer (ou Zod `superRefine` no endpoint):

```ts
if (input.reason === 'rakeback' && input.direction !== 'in') {
  throw makeError('invalid_rakeback_direction', 400);
}
```

UI: novo `RakebackDialog` (componente proprio, nao um modo dentro de `WalletTransactionDialog`) submete sempre com `direction='in'` + `reason='rakeback'`.

**Pros:**
- **Zero codigo backend novo.** Endpoint, validacao de ownership, `SELECT FOR UPDATE`, espelho em `bankroll_snapshots`, rate limit (`walletLimiter`) — tudo reutilizado.
- **Zero migration SQL.** `varchar` aceita o valor novo; rows historicas nao mudam.
- **Modelo expressa intent.** `reason='rakeback'` comunica direto. Filtro futuro (`SELECT * FROM wallet_transactions WHERE reason='rakeback'`) e trivial.
- **Pattern consistente com o ledger.** `deposit`, `withdrawal`, `session_result`, `manual_adjustment` ja sao discriminados por `reason`. Adicionar `rakeback` segue o mesmo eixo de evolucao.
- **Desbloqueia dashboard futuro de rakeback agregado** sem novo schema — query direta por `reason`.
- **Backward-compat perfeita.** Codigo legado (sem RakebackDialog) continua valido; chamadas antigas com `reason in ('deposit', ..., 'manual_adjustment')` nao mudam.
- **Testavel em isolamento.** A validacao `direction='in'` quando `reason='rakeback'` e regra pura — testes de unidade triviais.

**Contras:**
- **Risco do enum crescer demais.** Se aparecerem `bonus`, `milestone_reward`, `tournament_leaderboard`, `freeroll_prize`, `affiliate_commission` etc., o enum pode chegar a 8-10 valores e perder semantica. Mitigacao: promover `reason` para uma `category` quando atingir N >= 4 valores extra-jogo (ver "Notas para evolucao").
- **Nao distingue rakeback semanal de rakeback mensal de rakeback de leaderboard.** Granularidade fica em `note` por enquanto. Aceito — feature de relatorio agregado pode adicionar campo derivado depois.

### Opcao B: Novo campo `category` (ou `tag`) separado de `reason`

Adicionar coluna `category varchar nullable` em `wallet_transactions`. `reason` continua `'deposit'` (ou um novo `'extra_game'`); `category` discrimina `rakeback`/`bonus`/`milestone`/etc.

**Pros:**
- Modelo mais "limpo" se eventualmente tivermos 10+ tipos de ganho extra-jogo.
- Permite combinacoes (`reason='deposit' + category='referral_credit'`).

**Contras:**
- **Migration SQL** (ALTER TABLE com nullable + indice opcional).
- **Schema delta hoje sem demanda real.** YAGNI: a unica feature pedida e rakeback. Adicionar uma coluna por antecipacao introduz complexidade sem ganho proporcional.
- **Duplica o eixo de discriminacao.** Hoje `reason` ja faz esse papel; ter dois eixos para o mesmo fim (classificar movimento) gera ambiguidade ("deposit + rakeback"? "session_result + rakeback"?).
- **Forca Zod refinements cruzados** (`if (category) { reason must be in [...] }`) que poluem o schema.
- **Frontend precisa de UI dupla** (qual reason escolho? qual category?). Hoje rakeback e sempre `direction='in'` + sem ambiguidade — categoria seria sobreposicao redundante.
- **Rejeitada — premature optimization.** Promover `reason` para `category` quando o enum efetivamente crescer e refactor aditivo trivial.

### Opcao C: Tabela nova `rakeback_movements`

Tabela dedicada com FK para `wallet_id`, mais campos especificos (`source_room`, `period_start`, `period_end`, `volume_played`, `pct`).

**Pros:**
- Modelo canonicamente correto se rakeback eventualmente tiver atributos proprios (ex: "rakeback de 25% sobre R$ 4.000 de volume").

**Contras:**
- **Quebra unicidade do ledger.** Hoje `wallet_transactions` + `bankroll_snapshots` sao a fonte de verdade para movimentacao financeira (ADR-017, ADR-034). Criar uma terceira tabela paralela fragmenta auditoria, calculo de saldo e historico.
- **Refactor de saldo.** Saldo da wallet teria que somar `wallet_transactions` + `rakeback_movements` — invariante ADR-017 (`previousNativeBalance == ultimo newNativeBalance`) quebra.
- **2x espelhamento.** `bankroll_snapshots` precisaria refletir a nova tabela tambem.
- **Custo enorme para zero ganho v1.** Spec atual nao precisa de `volume_played`/`pct`/`source_room` — sao curiosidades, nao requisitos.
- **Rejeitada — overkill.**

### Opcao D: Flag boolean `isRakeback` em `wallet_transactions`

Adicionar coluna `is_rakeback boolean default false NOT NULL`. `reason` continua `'deposit'`.

**Pros:**
- Migration trivial.
- Zero impacto em codigo legado.

**Contras:**
- **Nao escala.** Se amanha tivermos `is_bonus`, `is_milestone`, `is_freeroll_prize`, viramos uma colcha de retalhos com 5+ booleans mutualmente exclusivos — exatamente o problema que enums resolvem.
- **Invariante "exatamente um eixo de classificacao" quebra.** Algumas rows teriam `reason='deposit' + is_rakeback=true`; outras `reason='manual_adjustment' + is_rakeback=true`. Filtro vira disjuncao confusa.
- **Frontend precisa renderizar combinacao** (`reason` vs `is_rakeback` qual prevalece no badge?).
- **Rejeitada — modelo errado para discriminacao mutualmente exclusiva.**

### Opcao E: Endpoint dedicado `POST /api/wallets/:id/rakeback`

Manter `reason` como esta; criar rota dedicada.

**Pros:**
- Path semantico (`/rakeback` vs `/transactions`).
- Validacao de `direction='in'` implicita (endpoint nao aceita outro valor).

**Contras:**
- **Duplicacao de codigo.** Validacao Zod, ownership check, rate limit, chamada ao `walletService.recordWalletTransaction` — tudo precisaria ser replicado ou compartilhado via helper. Sem ganho real.
- **Divergencia futura.** Cada endpoint evolui separado; bug fix em um nao propaga para o outro.
- **Mais um rate limiter** (ou compartilhar com `walletLimiter`, anulando o "isolamento" alegado).
- **Cliente ainda precisa saber qual endpoint chamar** — o discriminador final continua sendo "e rakeback ou outro reason?". Movemos a decisao do body para a URL sem ganho.
- **Rejeitada — duplicacao sem beneficio.**

## Decisao

Adotar **Opcao A**.

1. Adicionar `'rakeback'` em `WALLET_TX_REASONS_P0` (e em `WALLET_TX_REASONS` forward-compat) em `shared/wallet-reasons.ts`.
2. Adicionar `'rakeback'` em `BANKROLL_REASON_ENUM` em `shared/schema.ts` (espelho de `bankroll_snapshots`).
3. Reusar `POST /api/wallets/:id/transactions` — cliente envia `{ reason: 'rakeback', direction: 'in', nativeAmount, note?, occurredAt? }`.
4. Validacao adicional no service-layer (ou Zod `superRefine`): `reason='rakeback' && direction !== 'in'` -> `400 invalid_rakeback_direction`.
5. **Sem optimistic concurrency** (contraste com ADR-038): rakeback nao depende de saldo previo conhecido pelo cliente. Cliente envia `nativeAmount` absoluto; backend faz `SELECT FOR UPDATE` + INSERT sem comparar baseline. ADR-034 ja garante atomicidade entre concurrent writes.
6. Frontend: novo componente `RakebackDialog` (NAO um modo dentro de `WalletTransactionDialog`) — fluxo enxuto, evita poluir dialog que ja tem 2 modos (movement + balance).
7. Helper centralizado `reasonLabel(reason)` em `client/src/lib/bankrollHelpers.ts` mapeia `rakeback -> "Rakeback"` (PT-BR), garantindo typesafety via `Record<WalletTxReasonP0, string>`.

### Por que SEM optimistic concurrency aqui (contraste com ADR-038)

ADR-038 introduziu `expectedPreviousBalance` para detectar drift entre o saldo que o cliente assumiu e o saldo real no servidor — necessario quando o cliente **calcula delta** a partir de `novoSaldo - saldoConhecido` (modo balance). Em rakeback:

| Aspecto | Modo balance (ADR-038) | Rakeback (este ADR) |
|---|---|---|
| Input do usuario | Saldo final observado | Valor absoluto recebido |
| Calculo de delta | Cliente calcula (`novoSaldo - saldoConhecido`) | Servidor recebe `nativeAmount` direto |
| Depende de saldo previo? | Sim (baseline) | Nao |
| Drift quebra a operacao? | Sim (delta vira mentira) | Nao (valor absoluto preservado) |
| Necessita 409 `balance_mismatch`? | Sim | Nao |

Concorrencia entre 2 abas reportando rakeback ao mesmo tempo e resolvida pelo `SELECT FOR UPDATE` ja existente no `walletService.recordWalletTransaction` (ADR-034). Cada submit cria uma transacao independente; saldo final da wallet acumula corretamente. Nao ha "drift semantico" possivel — o usuario digitou o valor explicitamente.

## Consequencias

### Positivas

- **Resolve o leak analitico** sem migracao SQL: relatorios futuros distinguem rakeback de deposit limpo via `WHERE reason='rakeback'`.
- **Zero refactor backend.** Endpoint, service, snapshot mirror, rate limit — todos reusados sem alteracao alem do enum Zod.
- **Backward-compat perfeita.** Rows historicas `reason='deposit'` continuam validas; suite existente verde sem mudanca.
- **Frontend isolado.** `RakebackDialog` novo, sem mexer em `WalletTransactionDialog` existente — diff cirurgico.
- **Dashboard futuro de rakeback fica trivial.** `SELECT walletId, SUM(nativeAmount) FROM wallet_transactions WHERE userId=? AND reason='rakeback' GROUP BY walletId, DATE_TRUNC('month', occurredAt)` resolve em uma query.
- **Pattern consistente com o ledger.** Manter um unico eixo de discriminacao (`reason`) preserva legibilidade do schema.
- **Custo de evolucao linear.** Adicionar `bonus` ou `milestone_reward` no futuro segue o mesmo passo: append no enum.

### Negativas

- **Risco de o enum crescer demais.** Se aparecerem 4+ tipos extra-jogo (`bonus`, `milestone_reward`, `freeroll_prize`, `affiliate_commission`), a discriminacao via `reason` se torna ambigua (rakeback e bonus sao "ganhos extra-jogo" — agrupar para relatorio exigiria lista hardcoded de reasons). **Mitigacao:** quando atingir N >= 4 valores extra-jogo, promover `reason` para uma `category` separada (refactor aditivo: cria coluna `category`, backfill via mapping `reason -> category`, mantem `reason` como sub-tipo). Ate la, YAGNI.
- **Granularidade limitada.** "Rakeback semanal vs rakeback mensal vs rakeback de leaderboard" todos compartilham `reason='rakeback'`. Granularidade fica em `note`. Aceito v1; helper futuro pode parsear `note` para sub-classificar.
- **Validacao `direction='in'` quando `reason='rakeback'` precisa ser garantida em DOIS lugares** (Zod do endpoint + service layer) ou centralizada via `superRefine` para nao divergir. Documentado nas notas de implementacao.

### Neutras

- Sem custo de storage (zero coluna nova).
- Sem custo de CPU (zero check adicional alem do `enum.parse`).
- Conversao de moeda inalterada — rakeback usa `nativeCurrency` da wallet selecionada; sem campo de moeda no dialog.

## Notas para evolucao

### Quando promover `reason` para `category`

Trigger: enum atinge N >= 4 valores extra-jogo (ex: `rakeback`, `bonus`, `milestone_reward`, `freeroll_prize`).

Migracao aditiva proposta:
1. Adicionar coluna `category varchar nullable` em `wallet_transactions` + `bankroll_snapshots`.
2. Backfill via mapping:
   - `reason in ('rakeback', 'bonus', 'milestone_reward', ...)` -> `category='extra_game'`
   - `reason='session_result'` -> `category='gameplay'`
   - `reason in ('deposit', 'withdrawal')` -> `category='cash_movement'`
   - `reason='manual_adjustment'` -> `category='adjustment'`
3. Frontend agrega por `category` em relatorios; mantem badge por `reason` para granularidade visual.
4. Zod refinement para garantir consistencia `(category, reason)`.

Este caminho mantem rows historicas validas e permite rollback trivial (drop column).

### Conversao automatica de moeda

Hoje rakeback usa `nativeCurrency` da wallet. Se sala paga rakeback em USD para wallet BRL, jogador escolhe a wallet certa ou converte mentalmente. **Fora de escopo.** Quando demanda aparecer, adicionar campo opcional `originalCurrency + originalAmount + fxRate` ao body do POST (similar ao FX historico ja em `wallet_transactions`).

### Editar/deletar transacao de rakeback

Usa o mesmo CRUD futuro generico de `wallet_transactions`. Sem tratamento especial.

## Confianca

Alta.

A decisao toma 4 restricoes como hard-constraints (backward-compat, reuso de infra, sem migration SQL, YAGNI) e a Opcao A passa nas 4. Alternativas B/C/D/E falham em pelo menos uma. Reversibilidade: remover `'rakeback'` do enum ZodvolitsaltSchema (e back-classificar rows como `'manual_adjustment'`) e a unica acao para rollback — nenhuma migracao de schema necessaria. Risco principal — enum crescer demais — mitigado por trigger explicito (N >= 4 valores extra-jogo) que dispara refactor aditivo para `category`.

## Referencias

- Spec principal: `Docs/specs/rakeback-reporting.md` (RF-01 a RF-08).
- ADR-017 (companion): tabela `bankroll_snapshots` — `reason='rakeback'` espelha em snapshot sem mudanca.
- ADR-034 (companion): modelo multi-wallet com FX historico — `walletService.recordWalletTransaction` reusado sem alteracao.
- ADR-038 (contraste): optimistic concurrency em modo balance — explicado na secao "Por que SEM optimistic concurrency aqui".
- Sequence: `Docs/architecture/flows/bankroll/sequence-rakeback-report.mermaid` — fluxo completo do RakebackDialog com branches de erro.
- Memory: `session_2026-04-26-wallet-balance-mode.md` (sprint anterior, entrega base de Bankroll-2.1).
