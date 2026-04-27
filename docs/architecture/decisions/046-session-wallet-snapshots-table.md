# ADR-046: Tabela `session_wallet_snapshots` para persistencia da reconciliacao por sessao

## Status
Proposto

## Data
2026-04-27

## Contexto

A spec `Docs/specs/session-end-reconciliation-v2.md` (RF-07 e RF-09) precisa persistir, por sessao por wallet, o estado da banca em quatro pontos:

1. **`openingBalance`** — `wallet.balance` no momento em que a reconciliacao comeca.
2. **`closingBalance`** — saldo final reportado pelo jogador (verdade de campo).
3. **`expectedDelta`** — soma derivada de `session_tournaments` agrupada por site->wallet, convertida para `wallet.nativeCurrency` (RF-02).
4. **`manualAdjustment`** — `closingBalance - (openingBalance + expectedDelta)`. Quando != 0, indica divergencia entre registro durante sessao e realidade.

Esses quatro valores precisam estar disponiveis depois da sessao para alimentar a aba "Banca" do edit modal de `SessionHistory` (RF-09: tabela `wallet | inicial | final | delta esperado | ajuste manual | reason`).

Hoje, o estado da reconciliacao vive apenas em `wallet_transactions` com `reason='session_result'` e `source='auto_session'`. Essa tabela registra a *transacao gerada* (delta_total como `nativeAmount` mais `direction`), mas:

- **Nao captura `openingBalance`** em sessoes onde nao havia tx anterior na wallet — `wallet_transactions` registra mudanca, nao estado pre-existente.
- **Nao captura `expectedDelta`** separado de `manualAdjustment`. A tx tem o delta total fundido. Para auditoria, preciso saber quanto veio da derivacao automatica vs quanto o jogador ajustou na mao.
- **Perde quando o jogador clica "Pular reconciliacao"** — sem tx criada, nao ha rastro nenhum de que a sessao foi vista pelo dialog.
- **Nao tem unicidade `(sessionId, walletId)`** — uma wallet pode ter N tx com mesma sessionId no futuro (ex rakeback adicionado depois). Idempotencia da reconciliacao depende dessa unicidade.

A spec exige que a pagina detalhes da sessao mostre esses dados de forma estavel e queryable, com base limpa para audit (`contributingTournamentIds[]`, `reason`, `walletTransactionId` opcional).

## Decisao

Criar nova tabela `session_wallet_snapshots` em `shared/schema.ts` para capturar o estado da banca por wallet por sessao. Schema:

```ts
export const sessionWalletSnapshots = pgTable("session_wallet_snapshots", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull()
    .references(() => users.userPlatformId, { onDelete: "cascade" }),
  sessionId: varchar("session_id").notNull()
    .references(() => grindSessions.id, { onDelete: "cascade" }),
  walletId: varchar("wallet_id").notNull()
    .references(() => wallets.id, { onDelete: "cascade" }),
  nativeCurrency: varchar("native_currency", { length: 8 }).notNull(),
  openingBalance: decimal("opening_balance").notNull(),
  closingBalance: decimal("closing_balance"),         // null quando skipReconciliation=true
  expectedDelta: decimal("expected_delta").notNull(),
  manualAdjustment: decimal("manual_adjustment"),     // null quando skipReconciliation=true
  contributingTournamentIds: jsonb("contributing_tournament_ids")
    .$type<string[]>().default([]),
  reason: varchar("reason").notNull().default("session_result"),
  walletTransactionId: varchar("wallet_transaction_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("uq_session_wallet_snapshot").on(table.sessionId, table.walletId),
  index("idx_session_wallet_snapshots_user").on(table.userId, table.sessionId),
]);
```

Caracteristicas:

- **Imutavel apos insert** — convencao ledger ADR-017. Sem trigger explicito; suficiente que `storage.ts` nao implemente UPDATE/DELETE.
- **`UNIQUE(sessionId, walletId)`** — camada extra de idempotencia. Segundo POST `/reconcile-wallets` falha mesmo que `wallet_transactions` nao tenha sido criada (caso `|delta_total| < 0.01`).
- **`closingBalance` e `manualAdjustment` nullable** — explicito para o caso `skipReconciliation=true` onde o jogador pulou conscientemente. Outros campos permanecem `notNull` porque sao derivados ate na skip.
- **`walletTransactionId` opcional** — populado quando ha tx criada (delta_total >= 0.01). Null quando delta zero ou skip. Permite join 1-para-0/1 com `wallet_transactions`.
- **`contributingTournamentIds` em jsonb array** — preserva auditoria de quais `session_tournaments` somaram para o `expectedDelta` daquela wallet.
- **`reason` extensivel** — default `session_result`. Permite no futuro `manual_recon`, `bulk_import`, etc, sem alterar schema.
- **Migration via `drizzle-kit push`** alinhado com a convencao do projeto (sem migration formal; CLAUDE.md secao 5).
- **Sem back-fill** — sessoes pre-spec nao tem snapshots. RF-09 lida com `snapshots: []` graceful (a aba "Banca" nao aparece). Pagina detalhes mostra "Snapshots indisponiveis para sessoes anteriores a esta versao" como nota informativa quando aplicavel.

## Consequencias

### Positivas

- **Queryable** — `SELECT * FROM session_wallet_snapshots WHERE userId = ? AND sessionId = ?` retorna o estado completo em uma query. Nao depende de joins acrobaticos com `wallet_transactions` filtrado por `reason`/`source`.
- **Captura `openingBalance` como point-in-time** — mesmo em wallets sem historico de tx anterior, a sessao registra o saldo de partida. Base limpa para auditoria.
- **Separa `expectedDelta` de `manualAdjustment`** — analytics futuro (ex "% sessoes com ajuste manual >= 5% do volume", indicando registro inconsistente durante sessao) fica trivial.
- **Captura skip explicito** — `skipReconciliation=true` cria row com nulls. O sistema sabe que aquela sessao foi vista e pulada deliberadamente, nao apenas "ignorada por bug".
- **Imutabilidade preserva historico** — coerente com `wallet_transactions` (ADR-017) e `bankroll_snapshots`. Nenhum dado de sessao concluida se perde.
- **Idempotencia adicional via UNIQUE** — segunda chamada de POST `/reconcile-wallets` falha tambem por essa restricao, alem da preflight de `wallet_transactions`.

### Negativas

- **Nova tabela = nova superficie de bug** — implementer precisa lembrar de inserir snapshot SEMPRE no handler `POST /reconcile-wallets`, mesmo quando `|delta_total| < 0.01` (sem tx). Mitigacao: testes RF-07 e RF-06.
- **Sem back-fill** — sessoes antigas nao terao a aba "Banca" em `SessionHistory`. UX inconsistente entre sessoes pre-v2 e pos-v2 ate o tempo passar. Aceitavel: sessoes antigas tambem nao tinham reconciliacao funcional (P1 em prod), entao nao ha dado a back-fill mesmo se quisesse.
- **Insert duplo no handler de POST `/reconcile-wallets`** — uma row em `wallet_transactions` (quando aplicavel) + uma em `session_wallet_snapshots`. Custos de write 2x (negligenciavel a este volume — fim de sessao eh evento raro).
- **Cascade delete** — se `grind_sessions` for deletada (cenario raro, hoje nao implementado), snapshot some. Aceitavel, pois nao ha sessao para auditar.

### Neutras

- Tabela vive ao lado de `bankroll_snapshots` (que captura agregado de banca total em pontos no tempo) sem conflito. As duas tem propositos distintos: `bankroll_snapshots` = agregado por moeda; `session_wallet_snapshots` = detalhe por wallet por sessao especifica.
- Nada no handler de UPDATE/DELETE da app toca essa tabela. Ledger imutavel = invariante por ausencia.

## Alternativas Consideradas

### (b) Coluna JSON `walletSnapshots: jsonb` em `grind_sessions`

```ts
walletSnapshots: jsonb("wallet_snapshots").$type<{
  walletId: string;
  openingBalance: string;
  closingBalance: string | null;
  expectedDelta: string;
  manualAdjustment: string | null;
  contributingTournamentIds: string[];
}[]>().default([])
```

- **Pros:** zero nova tabela, zero migration. Mais simples de implementar.
- **Contras:** **nao queryable** em historico/aggregations sem `jsonb_array_elements` em todo SQL. Analytics como "% sessoes com manualAdjustment > 5%" exigem unnest custoso. Sem unique constraint nativa para idempotencia. Sem indice secundario por walletId. Sem FK enforcement no nivel do walletId. Imutabilidade depende de nao reescrever a coluna inteira (fragil).
- **Veredito:** rejeitado — economiza implementacao agora mas paga em todas as queries de analytics futuras.

### (c) Derivar on-read filtrando `wallet_transactions` por `sessionId + reason='session_result'`

- **Pros:** stateless. Nada novo no schema. Reusa tx ja criada.
- **Contras:** **nao captura `openingBalance` se nao havia tx anterior** — para wallet recem-criada, derivar opening exige raciocinio circular (`balance` agora menos delta total = opening, mas balance pode ter sido alterado por txs nao-relacionadas no meio). **Nao captura skip** — sessao com `skipReconciliation=true` nao tem nenhuma tx, entao "snapshot derivado" eh literalmente `null`. **Custoso** — toda exibicao de detalhes recalcula. **Frangil** — qualquer mudanca em `wallet_transactions` (ex novo `reason` futuro) poluti a derivacao.
- **Veredito:** rejeitado — alem da fragilidade, perde casos importantes (skip explicito, opening point-in-time).

### (d) Reusar `bankroll_snapshots` adicionando coluna `sessionId`

- **Pros:** uma so tabela de snapshots. Menos surface area.
- **Contras:** `bankroll_snapshots` eh agregado por currency (USD, BRL, etc) somando todas wallets do user. Adicionar `sessionId` mistura granularidades (banca total vs detalhe por wallet). Quebraria analytics historicos ja em producao.
- **Veredito:** rejeitado — granularidades distintas merecem tabelas distintas.

### (e) Salvar snapshot apenas em `wallet_transactions.metadata` (jsonb)

- **Pros:** sem nova tabela.
- **Contras:** nao funciona para skip (sem tx). Nao funciona para `|delta_total| < 0.01` (sem tx). Esconde dados de auditoria dentro de coluna de payload arbitrario.
- **Veredito:** rejeitado — mesmos problemas de (c) somados a poluicao de schema de tx.

## Referencias

- Spec: `Docs/specs/session-end-reconciliation-v2.md`, RF-07 e RF-09.
- ADR companheiro: `045-session-end-wallet-tie-break.md` (politica de divisao do `expectedDelta`).
- ADR-017: ledger imutavel — fundamento da imutabilidade de snapshots.
- ADR-033: convencao FX (`exchangeRates` em units-per-USD).
- ADR-034: multi-wallet com FX imutavel.
- ADR-038: optimistic concurrency em `wallet_transactions`.
- ADR-040: predecessora (spec v1 arquivada).
- Convencao do projeto sobre `drizzle-kit push` em vez de migrations formais: `CLAUDE.md` secao 5.
