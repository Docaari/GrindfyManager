# ADR-037: Tabela `tickets` Separada vs JSON Column em `tournaments`

## Status
Aceito

## Data
2026-04-26

## Contexto

A feature de Gestao de Tickets de Satelite (spec `docs/specs/satellite-tickets-management.md`) requer modelar inventario de tickets do usuario:
- Cada ticket tem um valor em USD, target (template ou nome), datas (earned/expires/used/cancelled), origem (satelite jogado ou avulso), status.
- O usuario tipico carrega 5-30 tickets vivos a qualquer momento.
- Operacoes frequentes: listar tickets ativos do usuario, match por target, query do widget no dashboard.

Existem 3 grandes formas de modelar isso. **Onde armazenar tickets?**

### Sintomas / restricoes

- 1:N entre satelite e tickets distribuidos (em principio 1:1 em v1, mas RF-12 abre porta para multiplos por player).
- Ticket avulso (manual, sem source) — nao tem torneio satelite associado.
- Match e-eficiente por target_template_id ou (target_name, target_site) — query critica do RegisterPaymentDialog.
- Cron de expiracao precisa scan eficiente de `expires_at < NOW() AND status='available'`.
- Audit imutavel: `cancelledAt`, `usedAt`, `transferredAt` precisam ser preservados.
- Coach AI consulta inventario para inject context.

## Opcoes Consideradas

### Opcao A: JSON column em `tournaments` (`distributedTickets jsonb`)

Cada satelite jogado teria coluna `distributedTickets jsonb` com array de tickets que ele distribuiu.

```ts
tournaments {
  // ...
  distributedTickets: jsonb, // [{ id, valueUSD, targetName, status, ... }, ...]
}
```

**Pros:**
- 0 nova tabela. Migration trivial.
- Localidade fisica: todo info do satelite em uma row.

**Contras:**
- **Tickets avulsos nao tem onde morar.** Manual register cria ticket sem `tournament` associado — opcao B "salvar em coluna jsonb de OUTRA entidade" (user?) e mais ugly ainda.
- Query "meus tickets ativos" exige scan e parse de jsonb em todas as rows de `tournaments` (`SELECT id, jsonb_array_elements(distributedTickets) ... WHERE userId=X`). Sem indice, performance degrada com volume.
- Match por target (sub-100ms p95 segundo NFR) impossivel sem GIN index custom em jsonb path.
- Update atomico de UM ticket dentro do array exige ou jsonb_set transacionado ou re-write da array inteira (race conditions).
- FK integrity para `targetTemplateId`, `usedInTournamentId`, etc.: jsonb nao tem FK. Validacao apenas em app layer.
- Audit: para visualizar historico de mudancas em UM ticket especifico, seria preciso versionar a coluna jsonb inteira. Caos.

### Opcao B: Array de tickets em `users` (`users.tickets jsonb`)

Cada user teria coluna jsonb com seu inventario.

**Pros:**
- Tickets avulsos cabem (user-bound).
- Localidade da listagem do widget — uma row contem todos.

**Contras:**
- Mesmos problemas de Opcao A em escala (parse jsonb, sem FK, sem indices triviais).
- Concorrencia: usuario abre 2 abas, consume ticket em uma, registra manual em outra → 2 UPDATEs em mesma jsonb column → race com last-write-wins, **perde dado**.
- Volume: usuario com 1000 tickets historico (used + expired) tem jsonb gigante na linha. Cada SELECT em `users` carrega isso — perda de performance em queries nao-relacionadas a tickets (auth, profile, etc.).

### Opcao C (ESCOLHIDA): Tabela separada `tickets` com FKs

Modelo relacional classico — tabela dedicada com colunas tipadas e FKs:

```sql
CREATE TABLE tickets (
  id varchar PRIMARY KEY,
  userId varchar NOT NULL REFERENCES users(userPlatformId) ON DELETE CASCADE,
  sourceTournamentId varchar REFERENCES tournaments(id) ON DELETE SET NULL,
  sourceSessionTournamentId varchar REFERENCES session_tournaments(id) ON DELETE SET NULL,
  targetTemplateId varchar REFERENCES tournament_templates(id) ON DELETE SET NULL,
  targetName varchar,
  ticketValueUSD decimal NOT NULL CHECK (ticketValueUSD > 0),
  status varchar NOT NULL DEFAULT 'available',
  -- ...
);

CREATE INDEX idx_tickets_user_status ON tickets (userId, status);
CREATE INDEX idx_tickets_user_target_template ON tickets (userId, targetTemplateId);
-- ...
```

**Pros:**
- **Queries diretas e baratas.** "Meus tickets ativos" = `SELECT * FROM tickets WHERE userId=X AND status='available' ORDER BY expiresAt ASC NULLS LAST` com indice composto. Sub-100ms p95 trivial.
- **FK integrity nativo.** `targetTemplateId` aponta para `tournament_templates` com ON DELETE SET NULL — orphans tratados corretamente.
- **Atomicidade barata.** UPDATE single-row em UM ticket usa SELECT FOR UPDATE para concurrency control sem afetar outros tickets.
- **Audit log natural.** Cada coluna timestamp (`earnedAt`, `usedAt`, `cancelledAt`, `transferredAt`) preserva eventos. Query historica e simples.
- **Tickets avulsos cabem naturalmente** — `sourceTournamentId IS NULL`, sem hack.
- **Migration evolutiva facil.** Adicionar campo (e.g., `transferredToUserId` em v2) e ALTER TABLE. JSON exige re-write de todas as rows.
- **Indices funcionais para match medio.** `lower(targetName)` indice em PostgreSQL — match case-insensitive O(log n).

**Contras:**
- **+1 join no widget.** Para listar tickets com nome do template, precisa `JOIN tournament_templates`. Custo: 1 join, indexed → trivial em pratica.
- **+2 colunas em `tournaments` e `session_tournaments`** (`enteredViaSatellite` ja existia em uma; `consumedTicketId` nova). Aumenta levemente row width.
- **+1 tabela na arquitetura.** Mais entropia. Mas e a forma normal correta.

### Opcao D: Tabela tickets + denormalizacao em tournaments (`tournaments.consumedTicketSnapshot jsonb`)

Hybrid: tabela `tickets` autoritativa + snapshot em `tournaments.consumedTicketSnapshot` para queries rapidas sem join.

**Pros:**
- Reads ultra-rapidos sem join.

**Contras:**
- Duplicacao de dados — 2 fontes de verdade.
- Sync manual em UPDATEs (ticket muda → atualizar snapshot).
- ADRs 017/034 ja deixaram claro o anti-pattern de duplicar dados authoritativos sem trigger SQL ou camada de service rigorosa. **Skip.**

## Decisao

Adotar **Opcao C**: tabela `tickets` separada com FKs explicitas, indices compostos para queries criticas, e CHECK constraints para invariantes (XOR de `usedInTournamentId`/`usedInSessionTournamentId`, `ticketValueUSD>0`, etc.).

Modelar relacao back-ref em `tournaments` e `session_tournaments` via coluna `consumedTicketId` (FK para `tickets.id`, nullable, ON DELETE SET NULL) — permite navegacao `tournament -> ticket consumido` sem JOIN reverso.

Detalhes do schema completo em `docs/architecture/data-model/tickets.md`.

## Consequencias

### Positivas

- Performance previsivel via indices.
- Schema evolui linearmente (ALTER TABLE simples).
- Audit log natural.
- Tickets avulsos suportados sem hack.
- FK integrity automatica (orphans tratados).

### Negativas

- 1 nova tabela na arquitetura — overhead conceitual minimo.
- Joins necessarios para enriquecer leituras (template name, etc.) — mitigado por indices.
- Queries de scoring/dashboard agora precisam considerar tabela `tickets` para context (Tournament Selector boost, Coach context).

### Neutras

- Migration: ALTER TABLE em `session_tournaments` e `tournaments` adiciona 1 ou 2 colunas nullable. Zero risco de quebra.
- Volume esperado: usuario tipico 5-30 tickets ativos, total 200-500 tickets historico. Tabela pequena. Indice `idx_tickets_user_expires WHERE status='available'` mantem apenas ativos no indice — escalavel para 10k tickets/user.

## Confianca

Alta. Decisao alinhada com convenções relacionais classicas e com o resto do schema do Grindfy (todas as outras entidades com 1:N seguem o mesmo padrao — `wallets`/`wallet_transactions`, `bankroll_snapshots`, `session_tournaments`, etc.).

## Riscos a observar

- **Hook de migracao session_tournaments → tournaments:** quando session termina e migra, ticket consumido durante a live tem `usedInSessionTournamentId` apontando para uma row que sera deletada. Hook deve transferir para `usedInTournamentId` ANTES do delete. ON DELETE SET NULL e safety net, nao primary mechanism.
- **Indice unico parcial em `(sourceTournamentId, source='satellite_result')`:** assume 1 satelite -> 1 ticket distribuido. Spec gap se isso mudar — facil relaxar removendo o indice.

## Referencias

- Spec: `docs/specs/satellite-tickets-management.md` RF-01
- Data model: `docs/architecture/data-model/tickets.md`
- ADR-009 (`tournament_library` separate table) — precedente similar para "tabela separada vs join em tournaments".
- ADR-014 (Add-on/Re-entry como flags ortogonais) — precedente para "evitar expandir enum, modelar separado".
