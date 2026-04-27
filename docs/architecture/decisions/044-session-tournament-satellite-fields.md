# ADR-044: Campos de satelite em `session_tournaments`

## Status
Proposto

## Data
2026-04-27

## Contexto

A tabela `tournaments` (historico, populada via CSV upload) e `planned_tournaments` (Grade Planner) tem campos satelite desde Sprint 1 / ADR-031:

- `satelliteRewardType: 'ticket' | 'cash' | 'package' | 'mixed'`
- `satelliteTicketValue: decimal` — valor face do ticket
- `satelliteTargetTemplateId: varchar` — ref ao template do torneio alvo
- `satelliteTargetName: varchar` — nome textual do torneio alvo
- `satelliteExtraCash: decimal` — premio cash adicional alem do ticket

`session_tournaments` (lifecycle live durante sessao de grind) **NAO** tem esses campos. Tem apenas `enteredViaSatellite: boolean` (back-ref que sinaliza "entrei neste torneio via ticket vindo de outro satelite") e `consumedTicketId: varchar` (FK para `tickets`).

### Implicacoes do gap

1. **Live page nao consegue registrar satelite.** Quando user adiciona manualmente "Suprema R$5 -> ticket Sunday Plus R$50" no `AddTournamentDialog`, nao tem campo para sinalizar que premio nao eh cash — o resultado eh forcado em `result: decimal`, distorcendo ROI.
2. **Copy-on-promote planned -> session perde os campos.** `GrindSessionLive.tsx:1314-1321` (handleRegisterTournament path planned->session) so copia `allowsAddOn`, `addOnCost`, `allowsReentry`, `maxReentries`. Campos satelite ficam no planned mas nao aparecem no live row.
3. **GG dialog nao pergunta tipo de premio.** `RegisteredCard` aciona dialogo de resultado generico assumindo cash. User que ganha ticket digita o valor face em `result` (cash), gera linha cash inexistente em analytics.
4. **ROI calculator confunde ticket com cash.** `calculateSessionStats` (linha 540 em analytics) faz `profit = result - invested`. Ticket de R$50 ganho em satelite R$5 vira "+R$45 cash" — falso positivo de cravada.
5. **Tickets table existe (ADR-036/037) mas eh decoupled.** Quando user vence um satelite e gera ticket, nao ha caminho automatico de criacao em `tickets` a partir de `session_tournaments` — o user teria que registrar manualmente.

### Cenarios reais do publico

- "**Seats Supremo**" (Suprema): satelite que paga N tickets para um torneio principal. Multi-vencedores.
- "**Mega Sat Sunday Storm**" (PokerStars): satelite com mix — primeiros N posicoes ganham ticket, demais ITM ganham cash residual.
- "**WCOOP Phase 1**" (PokerStars): flight com phase 2 buy-in equivalente — funcionalmente um satelite com `rewardType=ticket`.

Nenhum desses casos eh registravel hoje no /grind-session-live sem corromper analytics.

## Decisao

Adicionar 4 colunas em `session_tournaments` espelhando `plannedTournaments`:

```ts
satelliteRewardType: varchar          // SatelliteRewardTypeSchema, nullable
satelliteTicketValue: decimal         // valor face do ticket; nullable
satelliteTargetName: varchar          // nome textual; nullable
prizeIsTicket: boolean default(false) // true = result eh valor de ticket nao cash
```

Plus campo derivado/operacional:

- `prizeIsTicket: boolean` — flag UX para o GG dialog perguntar "cash ou ticket?" e para analytics excluir essa linha de profit cash. Default false (preserva backward-compat: rows pre-migration ficam como cash).

`satelliteTargetTemplateId` **nao** sera incluido no MVP — referencia para template no live nao agrega valor imediato e adiciona complexidade de FK (templates podem mudar). Pode ser adicionado depois sob demanda.

`satelliteExtraCash` **nao** sera incluido — caso "mixed" eh raro e pode ser registrado como linha normal cash + linha satelite separada (workaround manual).

### Copy-on-promote

`GrindSessionLive.tsx:1314-1321` (handleRegisterTournament path planned->session) deve copiar:

```ts
satelliteRewardType: plannedTournament.satelliteRewardType ?? null,
satelliteTicketValue: plannedTournament.satelliteTicketValue ?? null,
satelliteTargetName: plannedTournament.satelliteTargetName ?? null,
prizeIsTicket: plannedTournament.satelliteRewardType === 'ticket',
```

`server/routes/grind-sessions.ts:619-648` (load-from-grade-planner ao iniciar sessao) deve incluir os mesmos campos.

`client/src/components/grind-session-live/helpers.ts:300+ organizeTournaments` (display-time merge) ja faz fallback para addon/reentry quando session row vem de planned — extender para satelite.

### GG dialog

Quando `prizeIsTicket=true`, dialog de finalizar torneio mostra:

- Input "Valor do Ticket Ganho" (decimal) — preenche `satelliteTicketValue` se diferente do face value default.
- Input "Posicao no Satelite" (int) — preenche `position`.
- Campo `result` permanece igual a `satelliteTicketValue` (mesma coluna, mesmo dado, semantica diferente via flag).
- Toggle "Eu ganhei cash adicional" -> abre input opcional para valor cash (raramente usado, vai pra `bounty` ou linha de transacao separada — TBD).

### ROI / Analytics

`calculateSessionStats` (e `analytics.ts:538-540`) deve filtrar:

- `prizeIsTicket=true` -> NAO contribuir para `profitCash` direto.
- Tracking opcional: `satelliteEquity = sum(satelliteTicketValue) - sum(buyIn) onde prizeIsTicket=true`. KPI separada "Equity em Tickets" no dashboard.
- `bankroll_snapshots` continua usando apenas cash flows. Tickets nao saem de wallet.

### Migration

```sql
ALTER TABLE session_tournaments
  ADD COLUMN satellite_reward_type VARCHAR,
  ADD COLUMN satellite_ticket_value DECIMAL,
  ADD COLUMN satellite_target_name VARCHAR,
  ADD COLUMN prize_is_ticket BOOLEAN DEFAULT FALSE NOT NULL;
```

Backfill: para rows existentes com `enteredViaSatellite=true` (ja sinalizam que veio de satelite anterior), `prizeIsTicket` permanece `false` por seguranca (a coluna refere-se ao premio DESTE torneio, nao a entrada).

## Alternativas

### A. Adicionar 4 colunas em `session_tournaments` (recomendada / esta ADR)

**Pros:** mantem simetria com `plannedTournaments` e `tournaments`. Copy-on-promote trivial. Migration simples (ALTER TABLE com defaults). Analytics e UI consultam um unico lugar.

**Contras:** 4 colunas nullable em row legado. NULLs na maioria dos torneios (nao satelites).

### B. Tabela separada `session_tournament_satellite_results`

```sql
CREATE TABLE session_tournament_satellite_results (
  id varchar PK,
  session_tournament_id varchar FK,
  reward_type varchar,
  ticket_value decimal,
  target_name varchar,
  ticket_id varchar FK NULL,
  created_at timestamp
)
```

**Pros:** normalizado, suporta multi-tickets (raro mas real em "10 Seats" satellites). Sem NULLs em rows que nao sao satelite. FK direta para `tickets` quando ticket eh gerado.

**Contras:** JOIN obrigatorio em todas as queries de analytics que diferenciam cash vs ticket. Copy-on-promote vira 2 inserts. Display layer precisa de hidratacao adicional. Maior complexidade no MVP.

### C. JSONB `satellite_metadata`

**Pros:** flexivel. Sem migration adicional para evoluir schema (adicionar campos depois).

**Contras:** Drizzle/Zod precisa schema explicito anyway. Loss-of-typing afora a mascara Zod. Dificuldade de queries indexadas (ex: "todos os satelites do mes ganhos com ticket > 50"). Mesma materia organica das colunas mas com piora de DX.

## Consequencias

### Positivas

- Live page passa a registrar satelite corretamente.
- ROI separa cash de equity em tickets — KPIs nao mais distorcidos por cravadas em satelite.
- Copy-on-promote planned -> session preserva contexto satelite.
- GG dialog ganha modo "ticket" com inputs corretos.
- Analytics historico continua intacto para rows legacy (`prize_is_ticket=false` default).

### Negativas

- 4 novas colunas nullable em tabela quente. Storage marginal (decimal ~16B + varchar ~16B medio + boolean 1B) por row. Aceitavel.
- TypeScript types em `SessionTournament` interface precisam ser estendidos.
- Tests existentes que mockam shape minimal precisam ser revisados (especialmente `tests/unit/grind-session/calculate-session-stats-*`).
- ROI calculator vira condicional (`if prizeIsTicket -> exclui de profit cash`). Adiciona complexidade incremental — testes obrigatorios para cobrir mix cash + ticket.

### Riscos / migracao

- Para usuarios que ja registraram satelites como "cash result" historico, ROI nao muda automaticamente. Decisao: deixar como esta (inferir tipo via heuristica de nome viola idempotencia). Documentar workaround "edit tournament -> mark as ticket retroativamente" como feature futura.
- Se algum endpoint server-side faz `INSERT INTO session_tournaments` sem schema parser (raro mas existe em legacy), receberia colunas com defaults — comportamento OK.

## Implementacao

Sequencia proposta:

1. **Schema** (`shared/schema.ts`): adicionar 4 colunas em `sessionTournaments`. Atualizar `addOnReaFieldsSession` -> renomear para `addOnReaSatelliteFieldsSession` e incluir os 4 novos campos com Zod refinement (ex: `prizeIsTicket=true` so quando `satelliteRewardType` setado).
2. **Migration**: `drizzle-kit generate` + revisar SQL gerado. Aplicar em dev. **Aprovacao explicita do founder antes de prod.**
3. **Server routes** (`server/routes/grind-sessions.ts`): incluir 4 colunas em `cleanData` da POST /api/session-tournaments. PUT ja faz spread de `processedData` — confirmar que aceita.
4. **Copy-on-promote** (`GrindSessionLive.tsx:1314-1321` + `server/routes/grind-sessions.ts:619-648`): copiar campos satelite.
5. **Display merge** (`helpers.ts organizeTournaments`): extender fallback de planned -> session para campos satelite.
6. **GG dialog** (`TournamentCard.tsx`): condicional `prizeIsTicket` que troca label "Premio (cash)" por "Valor Ticket".
7. **Analytics** (`analytics.ts:538-540`): excluir `prizeIsTicket=true` de `profit cash`. Adicionar `satelliteEquity` separado.
8. **Tests**: TDD pelo test-writer cobrindo (a) copy-on-promote satelite, (b) GG dialog mode ticket, (c) ROI calculator mix cash+ticket, (d) display merge satelite.

## Referencias

- ADR-014 — Add-on / Re-entry (mesmo padrao de copy-on-promote).
- ADR-031 — Tournament types orthogonal model (introduziu satelliteRewardType em `tournaments` e `plannedTournaments`).
- ADR-036 — Tickets effective buy-in.
- ADR-037 — Tickets table vs JSONB (decisao paralela; tickets table eh canonical para token-of-value).
- `shared/tournamentTypes.ts` — `SatelliteRewardTypeSchema`.
- `Docs/architecture/decisions/038-wallet-tx-optimistic-concurrency.md` — template de estilo.
