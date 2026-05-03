# Sprint Flight-1 — Multi-Flight Tournaments + Auto-Add Day 2

- Status: Aprovada (decisoes finais aplicadas em 2026-05-02)
- Data: 2026-05-02
- Autor: pm-spec
- Branch sugerida: `feature/flight-1` (worktree opcional `B:\grindfy-flight1`)
- Modulo: Torneios + Calendario + Parser CSV + Bankroll/Reports
- Tier: all paid (Pro+, Coach+); Free preserva fluxo single-flight atual
- Predecessoras relevantes:
  - **ADR-031** (modelo ortogonal `type` + `isFlight` + `isLive`) — flags ja existem em `tournaments` / `planned_tournaments` mas hoje sao **estaticas e sem agrupamento**. **DEPRECADAS NESTA SPRINT** (ver RF-17).
  - **ADR-032** (deprecation `category`) — nao toca aqui, so respeitar.
  - **Sprint Tickets-Wiring** (commit `7eb4dbd`) — sem dependencia direta, mas estabeleceu padrao "satellite ticket flow" que sera analogo ao "flight series flow".
- Sucessoras candidatas: **Flight-2** (Day 3+, best-stack mode GG WSOP, conflict detection opcional), **Flight-3** (forfeit / shootout multi-day).

---

## 1. Sumario Executivo

**Objetivo.** Modelar **torneios multi-flight** (Day 1A / 1B / 1C / Phase 1 / Stage 1 / ...) como entidade de primeira classe via nova tabela `tournament_series`, **single source of truth desde dia 1**. Quando o jogador marca "passei o Day 1", o sistema **adiciona automaticamente o Day 2 na grade planejada** e linka todas as entries pagas a uma serie unica para fins de P&L (combined-stack mode soma N entries pra 1 prize do Day 2). Parser CSV detecta nomes-chave ("Flight", "Stage", "Day 1", "Phase") e abre **modal inline pos-upload**: founder responde "isso e flight? Day 2 quando?". Sprint inclui **migracao + remocao dos flags legados ADR-031** (`isFlight`, `flightDay`, `flightParentId`, `flightAdvanced`) — wizard atual e refatorado para usar API `tournament_series`.

**Escopo.** 17 RFs entregaveis em sprint media (~7-9 dias dev solo + dias de polish). Spec **substitui** o uso atual dos flags estaticos por agrupamento via FK `series_id`. Founder ja descartou:
- "best stack" mode (GG WSOP) — fora.
- conflict detection / overlap alerts — fora.
- Day 3+ — fora.
- forfeit / "baggou e nao joga" tratamento especial — fora.
- modelagem via flag boolean shortcut — descartada em favor de `tournament_series` desde MVP.
- estado persistente `pending_flight_confirmation` no DB + banner global header + filtro automatico de reports — **simplificado** (ver D10 + RF-06 atualizados).

**Caso de uso central (founder, palavras dele):**

> "Quando marco que PASSEI um Day 1 Flight, o sistema deve adicionar automaticamente o Day 2 (data+hora) na minha grade planejada."

**17 RFs em 1 linha:**

- **RF-01** Schema: `tournament_series` (nova) + colunas `series_id` em `tournaments` e `planned_tournaments` + ENUMs (`series_stack_mode`, `series_day2_status`)
- **RF-02** Storage methods CRUD `tournament_series` + helpers de linking
- **RF-03** Endpoints REST `/api/tournament-series` (list, create, get, patch, delete)
- **RF-04** Endpoint `POST /api/tournament-series/:id/mark-bagged` (cria/atualiza Day 2 planned automaticamente)
- **RF-05** Parser CSV: detector de keywords + extracao de nome-base + flag `requiresFlightConfirmation` (em memoria, **NAO persistido**)
- **RF-06** Endpoint `POST /api/upload` aumentado: response inclui lista `pendingFlightConfirmations` (in-memory, dados ja inseridos como tournaments normais)
- **RF-07** Endpoint `POST /api/upload/confirm-flights`: aplica decisoes do founder em batch (cap 50 confirmacoes/request)
- **RF-08** Auto-link Day 1 + Day 2 quando ambos vem no mesmo CSV (sem prompt)
- **RF-09** Modal frontend `FlightConfirmationDialog` inline pos-upload (descartavel; cancelar = entries ficam normais sem `seriesId`)
- **RF-10** Pagina `/flight` (lista + drill-down) sob "Ferramentas" no sidebar
- **RF-11** Action "Marcar Day 1 X bagged" disponivel em 3 contextos (lista de torneios, tela series, pagina detalhe da entry)
- **RF-12** Visual indicators: badges nos torneios da biblioteca + planned do calendario quando linkados a serie
- **RF-13** UI back-fill manual: form "Adicionar Series Retroativo" + multi-select N torneios ja na biblioteca + linkar (usa `PATCH /api/tournaments/:id` em N requests; sem endpoint batch dedicado)
- **RF-14** Edit-in-place do Day 2 datetime (rede mudou horario)
- **RF-15** `calculateSessionStats` + reports respeitam combined-stack: P&L soma todas entries pagas, prize do Day 2 conta uma vez
- **RF-16** Filtro nos relatorios: "considerar series como 1 torneio" vs "expandir entries individuais"
- **RF-17** **Migracao + Deprecacao flags ADR-031**: refatorar wizard manual para usar API `tournament_series`; migrar dados existentes (rows com `isFlight=true`) para series; remover 4 colunas via migration final

---

## 2. Contexto e Motivacao

### 2.1. Estado atual

Hoje o tracker assume **single-flight implicito**: cada linha em `tournaments` representa uma entry atomica (1 buy-in → 1 ITM ou bust). A spec ADR-031 (Sprint 1 Tournament Types) ja **adicionou os flags** `isFlight`, `flightDay`, `flightParentId`, `flightAdvanced` no schema e wizard, antecipando suporte a flights, mas:

1. Esses flags sao **estaticos** — preenchidos no wizard manualmente, sem inferencia.
2. **Nao ha agrupamento** — N entries do mesmo torneio Phased sao N tournaments isoladas; impossivel reportar "Sunday Million Phased: 3 Day 1s pagos, P&L combinado".
3. **Nao ha automacao Day 2** — quando jogador marca `flightAdvanced=true`, nada acontece no calendar.
4. **Parser CSV nao distingue** flight de single-flight — Day 1A vira tournament normal e o Day 2 (se cair no mesmo upload) vira **outro tournament normal sem relacao**.
5. Reports e P&L tratam cada entry individualmente — combined-stack inflate a contagem de torneios e dilui ROI medio.

### 2.2. Tese

Criar entidade `tournament_series` agrupa entries pagas (N Day 1s) e a entrada do Day 2 numa unica unidade economica auditavel. Linkagem via FK opcional (`series_id`) preserva 100% dos torneios single-flight existentes (eles ficam com `series_id IS NULL`). Auto-add Day 2 fecha o loop "passei → joga" sem trabalho manual. Single source of truth desde dia 1 (sem flags duplicados).

### 2.3. Por que `tournament_series` e nao "bolt-on" nos flags existentes

Founder explicitamente descartou shortcut com flag adicional. Razoes operacionais:
- **Day 2 datetime precisa de coluna propria** (rede define horario unico, nao por entry). Se ficar em `tournaments`, replica-se em N rows.
- **`stackMode` e propriedade da serie**, nao da entry.
- **`totalDay1s` e propriedade da serie** (jogador pode ter pago 3 de 17 Day 1s do Sunday Million Phased).
- **Status do Day 2 (pending/completed)** e propriedade da serie.
- **Back-fill retroativo** (RF-13) precisa criar series sem necessariamente ter as entries — modelar como entidade independente facilita isso.

### 2.4. Riscos de adiar

- Founder ja perdeu rastro de **dezenas de torneios Phased pagos historicamente** (memoria dele) — lista manual sera fornecida pra back-fill.
- Cada semana sem suporte multi-flight, founder paga buy-ins de Day 1 sem ter `series` no calendario — perde o lembrete automatico do Day 2.
- Reports continuam distorcidos para combined-stack (ROI inflado por entries duplicadas).
- Coach AI nao consegue analisar performance em formato Phased (categoria importante de MTT moderno).

---

## 3. Defaults Autonomos D1-D14

Decisoes ja tomadas. Test-writer e implementer assumem sem requestionar.

| ID | Default | Justificativa |
|----|---------|---------------|
| **D1** | **`tournament_series.id` e nanoid string** (igual padrao Grindfy). Nao auto-increment. | Convencao do projeto. |
| **D2** | **`series_id` em `tournaments` e `planned_tournaments` e FK nullable** (`ON DELETE SET NULL`). Deletar uma serie NAO apaga as entries — orfaniza-as preservando historico. | Auditoria > integridade. Founder pode recriar a serie sem perder P&L historico. |
| **D3** | **`stack_mode` enum: `single` \| `combined`.** "single-bag" = 1 Day 1 → 1 Day 2 (founder pagou 1 entry, Day 2 mantem 1 stack). "combined" = N Day 1s → 1 Day 2 (todas stacks somam). **Sem `best`** (fora do escopo). | Cobre 95% dos casos reais relevantes pro founder. |
| **D4** | **`day2_status` enum: `pending` \| `completed` \| `cancelled`.** Default `pending`. Vira `completed` quando o jogador marca o Day 2 finalizado (ou via reconcile pos-sessao). `cancelled` reservado pra casos raros (rede cancela o torneio). | Status simples, alinhado com vocabulario `planned_tournaments.status`. |
| **D5** | **Auto-add Day 2 cria `planned_tournaments` row novo com `series_id` setado, `status='upcoming'`, `start_time = series.day2DateTime`.** Idempotente: se ja existe planned com mesmo `series_id` e `dayOfWeek`, NAO duplica — atualiza datetime se mudou. | Evita poluir grade com Day 2 duplicados em multi-bag. |
| **D6** | **Datetime do Day 2 armazenado em UTC.** Frontend renderiza no TZ do user (`users.timezone` se setada, fallback `America/Sao_Paulo`). | Padrao Grindfy (cooldowns, snapshots, planned). |
| **D7** | **Detector de keywords (RF-05) usa regex case-insensitive em `tournament.name`:** `\b(flight|phase|stage|day\s*1[a-z]?|1[a-z]\b)\b`. Captura "Day 1A", "Day 1B", "Day1B", "Phase 1", "Stage 2", "Flight 3", "1A", "1B", "1C" no nome. Falsos positivos esperados (ex: "Day 1 of the Year" freeroll) — por isso prompt **interativo**, nunca silencioso. | Prompt-first design. Founder valida cada caso. Falso positivo custa 1 click ("Nao e flight"). |
| **D8** | **Flags `isFlight + flightDay + flightParentId + flightAdvanced` (legados ADR-031) SAO REMOVIDOS NESTA SPRINT** via RF-17. Single source of truth = `tournament_series` desde dia 1. Wizard manual refatorado pra usar API `tournament_series` (criar serie + linkar tournament, ou linkar a serie existente). Migration de dados back-fill rows existentes com `isFlight=true` para criar series + popular `series_id`. Migration final dropa as 4 colunas. | Evita divergencia silenciosa (lessons-learned #10 — DRY). Founder priorizou clean schema. |
| **D9** | **Late-reg direto no Day 2 (sem ter pago Day 1):** founder pode criar serie manual via UI back-fill (RF-13) com `totalDay1s=0` ou simplesmente registrar o Day 2 como tournament normal sem `series_id`. Nao ha fluxo dedicado — caso raro nao merece UI dedicada no MVP. | Cobre o caso sem UI nova. |
| **D10** | **Modal inline pos-upload e descartavel.** **NAO ha persistencia de "pending confirmation" no DB**, **NAO ha banner global no header**, **NAO ha filtro automatico de reports**. Tournaments detectados como flight-candidate sao inseridos normalmente em `tournaments` (com `series_id=NULL`); o response do upload inclui `pendingFlightConfirmations[]` em memoria, e o modal abre uma vez. **Se founder cancelar o modal** sem confirmar, os tournaments ficam normais na biblioteca (sem `seriesId`). Founder pode criar serie manualmente depois via tela `/flight` + RF-13 back-fill. | Founder: "uploads sao esporadicos, usuarios nao fazem upload, nao precisa muito codigo pra isso." Simplifica drasticamente schema, frontend e backend. |
| **D11** | **Sem cap de "series pendentes" no DB** (nao existe mais conceito de "pending" persistido). **Cap 50 confirmacoes por batch** no modal RF-09 / endpoint RF-07 (protecao UI/payload). | Sem estado persistente, nao ha o que limitar. Cap UI evita request gigante. |
| **D12** | **Reconcile pos-sessao (`SessionSummaryModal`) reconhece series:** se sessao tem entries de Day 2 com `series_id != null`, calcula P&L combinado **automaticamente** (sum de todas entries do series + prize do Day 2). Founder ve linha "Sunday Million Phased (combined): 3 entries / R$1500 buy-in / R$8000 prize / +R$6500" em vez de 3 linhas separadas. | Reuso da invariante de reconcile do Bankroll-3 (RF-3 ja faz auto-bind torneio→wallet). |
| **D13** | **Filtro de relatorios (RF-16) padrao = "agregar series".** Toggle persistente em user_settings (`reportsExpandFlightSeries: boolean`, default `false`). | Default reflete intuicao economica do founder. Power-user expande quando precisa. |
| **D14** | **Sidebar: novo item "Flight" sob grupo "FERRAMENTAS"**, icone `Layers` (lucide-react), rota `/flight`. **Conflito com Tournament Selector (`/tournament-selector`):** ambos sob FERRAMENTAS, ordem alfabetica fica `Flight` antes de `Selector`. Sem conflito de naming. | Decisao founder: nome curto e direto. |

---

## 4. Goals / Non-Goals

### Goals

1. Modelar series multi-flight como entidade dedicada (`tournament_series`).
2. Suportar 2 modos: `single` (1 Day 1 → 1 Day 2) e `combined` (N Day 1s → 1 Day 2).
3. Detectar flights no parser CSV via keywords e abrir modal interativo pos-upload (descartavel).
4. Auto-linkar Day 1 + Day 2 quando ambos vem no mesmo CSV (sem prompt).
5. "Marcar Day 1 bagged" cria/atualiza Day 2 planned automatico.
6. Tela dedicada de gestao de series + visual indicators na biblioteca/calendar.
7. Back-fill manual retroativo (founder vai dar lista).
8. Reports e P&L respeitam combined-stack (sum entries / 1 prize).
9. Filtro toggle "agregar vs expandir" nos reports.
10. Compatibilidade total com torneios single-flight existentes (zero regressao).
11. **Migrar dados legados (flags ADR-031) para `tournament_series` + remover colunas antigas.**
12. **Refatorar wizard manual de torneio para usar API `tournament_series` (sem flags estaticos).**

### Non-Goals (esta sprint)

- Day 3+ (WCOOP Main, GG WSOP Main → Day 3) — Sprint Flight-2.
- Best-stack mode (GG WSOP usa stack mais alto entre Day 1s) — Sprint Flight-2.
- Conflict detection / overlap alerts entre torneios — fora (multi-tabling normal pra pro).
- Forfeit/walkaway flow ("baggou e decide nao jogar") — fora.
- Shootout multi-day — fora (estrutura diferente).
- Stripe gating de feature — feature liberada pra todos os tiers pagos.
- **Estado persistente de "pending flight confirmation" no DB** — descartado (D10).
- **Banner global persistente no header de "X torneios aguardando confirmacao"** — descartado (D10).
- **Filtragem automatica de reports/dashboard ate confirmacao** — descartada (D10).
- Notificacao push lembrando do Day 2 (pode ser feature futura sob sistema de alertas).
- Coach AI tool nova "analisar performance Phased" — defer.

---

## 5. Usuarios e Personas

| Persona | O que faz no fluxo Multi-Flight | Trigger principal |
|---------|--------------------------------|-------------------|
| **Pro multi-tabling Phased (founder)** | Importa CSV pos-sessao com 3 Day 1s do Sunday Million Phased; modal pergunta Day 2; founder informa "domingo 19h", marca combined; Day 2 vira planned auto. Domingo 18h ele ja ve Day 2 na grade. Ao terminar Day 2, P&L combinado aparece. **Se founder cancelar o modal**, entries ficam normais e ele cria serie depois via tela `/flight`. | Upload CSV OU click manual "Marcar bagged" |
| **Pro com agendamento antecipado** | Sabe que vai jogar GG Phased no fim de semana; cria series manualmente via UI (RF-13 caminho "criar serie") com Day 2 datetime; na sexta importa CSV do Day 1A pago, sistema reconhece e linka automatico (matching por nome + data proxima). | Pre-cadastro manual + import CSV |
| **Founder em back-fill** | Tem lista mental/textual de ~30 torneios Phased que pagou Day 1 e jogou Day 2 ao longo dos ultimos meses. Usa "Adicionar Series Retroativo" pra criar 30 series + linkar entries existentes da biblioteca. P&L historico consolida. | Form back-fill |
| **Jogador Pro casual single-flight** | Nunca toca em flights. Upload CSV de torneios normais segue funcionando identico. Modal nao aparece (nenhum nome bate keyword). Reports identicos. | Zero impacto |
| **Coach AI** | (Futuro Flight-2) Analisara performance em formato Phased usando dados consolidados. **Esta sprint:** Coach apenas le `series_id` se aparecer no contexto de pagina, sem tool nova. | Out of scope desta sprint |

---

## 6. Requisitos Funcionais

> Cada RF tem `Descricao` (o que faz), `Criterios de aceitacao` (verificavel objetivamente), `Edge cases` (cenarios que test-writer deve cobrir) e `Notas tecnicas` (sugestoes nao-vinculantes pra implementer/architect).

### RF-01 — Schema: `tournament_series` + ENUMs + colunas FK

#### Descricao
Criar tabela nova `tournament_series` + adicionar coluna `series_id` (FK nullable) em `tournaments` e `planned_tournaments` + criar 2 ENUMs Postgres. **NAO ha coluna `pending_flight_confirmation`** — D10 descartou estado persistente.

#### Campos `tournament_series`
| Campo | Tipo | Constraints | Notas |
|-------|------|-------------|-------|
| `id` | varchar | PK, nanoid | Padrao Grindfy |
| `userId` | varchar | FK `users.userPlatformId` ON DELETE CASCADE | Owner |
| `name` | varchar | NOT NULL | Nome-base extraido (ex: "Sunday Million Phased") |
| `network` | varchar | NULL OK | Site/rede (ex: "PokerStars") — derivado das entries |
| `totalDay1s` | integer | NOT NULL DEFAULT 1 | Numero de Day 1s definidos pela rede (ex: 17 pro Sunday Million Phased). Founder informa no create. **Nao confundir com `entries pagas`** (que pode ser <= totalDay1s). |
| `day2DateTime` | timestamp (UTC) | NOT NULL | Data+hora do Day 2 (quando definida). Pode ser editada (RF-14). |
| `day2Status` | enum `series_day2_status` | NOT NULL DEFAULT `pending` | `pending` / `completed` / `cancelled` |
| `stackMode` | enum `series_stack_mode` | NOT NULL DEFAULT `single` | `single` / `combined` |
| `notes` | text | NULL | Campo livre opcional |
| `createdAt` | timestamp | DEFAULT NOW() | |
| `updatedAt` | timestamp | DEFAULT NOW() | |

#### Indexes
- `(userId, day2Status)` — query "minhas series pendentes" rapida
- `(userId, day2DateTime)` — query "proximas series do calendario"
- `(userId, name)` — match aproximado para auto-link CSV

#### Migration
- Arquivo: `migrations/00XX_tournament_series.sql` (numero exato definido pelo system-architect baseado no estado HEAD da main).
- Inclui: CREATE TYPE para os 2 ENUMs, CREATE TABLE, ALTER TABLE pra `tournaments.series_id` (FK SET NULL) e `planned_tournaments.series_id` (FK SET NULL).
- Drizzle ORM declaration em `shared/schema.ts` espelha SQL.
- **Migration de remocao de flags legados ADR-031 e separada** (ver RF-17).

#### Criterios de aceitacao
- [ ] Tabela `tournament_series` criada com todos os campos acima.
- [ ] ENUMs `series_stack_mode` e `series_day2_status` criados.
- [ ] `tournaments.series_id` adicionada como FK nullable (ON DELETE SET NULL).
- [ ] `planned_tournaments.series_id` adicionada como FK nullable (ON DELETE SET NULL).
- [ ] Indexes (userId, day2Status), (userId, day2DateTime), (userId, name) criados.
- [ ] `npm run db:push` em ambiente clean executa sem erro.
- [ ] Tests unit Drizzle: schema declarations correspondem a migration SQL (presente em `tests/unit/schema/`).
- [ ] Inserir tournament com `series_id=null` continua funcionando (backwards-compat).

#### Edge cases
- User existente com tournaments pre-existentes: backfill `series_id=null` automatico (default da coluna).
- Deletar serie via DELETE → tournaments e planned_tournaments com aquele `series_id` ficam com `series_id=null` (nao cascade delete).
- Deletar user (CASCADE em users) → series CASCADE deletadas, mas tournaments tambem cascade pelo FK pra users (nao pelo series).

#### Notas tecnicas
- system-architect deve produzir ADR documentando decisao "single source of truth = `tournament_series`" + plano de remocao dos flags legados (RF-17).
- `network` derivado vs explicito: assume serie e single-network. Se vier Day 1 de outra rede, parser cria serie nova. Cross-network e edge case raro fora do MVP.

---

### RF-02 — Storage methods CRUD `tournament_series` + helpers de linking

#### Descricao
Camada `server/storage.ts` ganha methods novos pra criar/ler/atualizar/deletar series e linkar entries (`tournaments.series_id`) ou planneds (`planned_tournaments.series_id`).

#### Methods novos
| Method | Signature (TS-like) | Descricao |
|--------|---------------------|-----------|
| `createSeries` | `(userId, data: InsertTournamentSeries) → Promise<TournamentSeries>` | Insere nova serie. |
| `getSeriesByUserId` | `(userId, opts?: { status?, limit?, offset? }) → Promise<TournamentSeries[]>` | Lista series do user, ordenadas por `day2DateTime DESC`. Filtravel por status. |
| `getSeriesById` | `(userId, seriesId) → Promise<TournamentSeries \| null>` | Owner check via userId. |
| `updateSeries` | `(userId, seriesId, patch: PartialUpdate) → Promise<TournamentSeries>` | Patch parcial. Nao permite mudar `userId` ou `id`. |
| `deleteSeries` | `(userId, seriesId) → Promise<void>` | Hard delete. Trigger SET NULL nas entries. |
| `linkTournamentToSeries` | `(userId, tournamentId, seriesId \| null) → Promise<Tournament>` | Atualiza `tournaments.series_id`. Owner check em ambos. |
| `linkPlannedToSeries` | `(userId, plannedTournamentId, seriesId \| null) → Promise<PlannedTournament>` | Atualiza `planned_tournaments.series_id`. |
| `getEntriesBySeriesId` | `(userId, seriesId) → Promise<Tournament[]>` | Lista de entries (Day 1s + Day 2 jogado) linkadas. |
| `getPlannedBySeriesId` | `(userId, seriesId) → Promise<PlannedTournament[]>` | Lista de planneds (Day 2 agendado) linkados. |
| `markSeriesAsCompleted` | `(userId, seriesId) → Promise<TournamentSeries>` | Helper: atualiza `day2Status='completed'`. Chamado quando reconcile detecta Day 2 jogado. |

#### Criterios de aceitacao
- [ ] Cada method tem teste unit cobrindo happy path + owner check (user A nao acessa serie de user B).
- [ ] `createSeries` aceita payload Zod validado via `insertTournamentSeriesSchema` (gerado por `drizzle-zod`).
- [ ] `updateSeries` rejeita patch que tenta mudar `userId` ou `id` (Zod refinement).
- [ ] `linkTournamentToSeries` falha 404 se tournament nao pertence ao user OU se series nao pertence ao user.
- [ ] `getSeriesByUserId` retorna apenas series do user (sem leak cross-user).
- [ ] Pattern Drizzle queries via `db.select().from(...).where(eq(...))` consistente com resto do storage.

#### Edge cases
- `linkTournamentToSeries(userId, tId, null)` → unlink (set null). Permitido.
- `deleteSeries` em serie com entries linkadas → SET NULL automatico (FK), retorna void normal.
- `getEntriesBySeriesId` em serie sem entries linkadas → array vazio, nao 404.
- `markSeriesAsCompleted` em serie ja `completed` → idempotente, retorna serie sem mudanca.

#### Notas tecnicas
- Reuso do pattern de `Docs/api/wallets.md` (storage method + endpoint thin wrapper).
- Considerar transaction quando linkagem batch (RF-08 vai bater varios `linkTournamentToSeries` consecutivos) — provavel via `db.transaction()`.

---

### RF-03 — Endpoints REST `/api/tournament-series`

#### Descricao
5 endpoints REST CRUD em `server/routes/tournament-series.ts` (arquivo novo). Registrados no router principal.

#### Endpoints
| Metodo | Rota | Auth | Body / Query | Retorna |
|--------|------|------|--------------|---------|
| GET | `/api/tournament-series` | JWT | query: `status`, `limit`, `offset` | `TournamentSeries[]` |
| POST | `/api/tournament-series` | JWT | body: `{ name, network?, totalDay1s, day2DateTime, stackMode, notes? }` | `TournamentSeries` (201) |
| GET | `/api/tournament-series/:id` | JWT | — | `{ series, entries: Tournament[], planneds: PlannedTournament[] }` |
| PATCH | `/api/tournament-series/:id` | JWT | body: partial fields | `TournamentSeries` |
| DELETE | `/api/tournament-series/:id` | JWT | — | `204 No Content` |

#### Criterios de aceitacao
- [ ] Cada endpoint exige `requireAuth` middleware.
- [ ] Validacao Zod via `insertTournamentSeriesSchema.parse(req.body)` no POST + `updateTournamentSeriesSchema.parse(req.body)` no PATCH.
- [ ] Erros: 400 (Zod fail) com `{ message }`, 404 (not found / not owner) com `{ message: 'Not found' }`, 500 com `{ message: 'Internal error' }` + `console.error`.
- [ ] GET `/api/tournament-series` aceita `status=pending|completed|cancelled` (filter), default sem filter.
- [ ] Rate limit 60 req/min por user (consistente com outros endpoints CRUD).
- [ ] Endpoints registrados no `server/routes/index.ts` (ou equivalente).
- [ ] Documentacao em `Docs/api/endpoints.md` + entrada em `Docs/api/endpoints-index.md` na secao Torneios.

#### Edge cases
- POST com `day2DateTime` no passado → permitido (back-fill) mas warning visual no frontend.
- POST com `totalDay1s=0` → permitido (caso late-reg Day 2 puro, D9).
- GET `/:id` com `id` invalido (nao nanoid) → 404 (nao 400).
- PATCH com body vazio → 200 retornando series sem mudancas (idempotente).

#### Notas tecnicas
- Pattern de modulo seguindo `server/routes/wallets.ts` (recente, bem estruturado).
- `server/routes/tournament-series.ts` exporta default Router.

---

### RF-04 — Endpoint `POST /api/tournament-series/:id/mark-bagged`

#### Descricao
Endpoint dedicado pra **acao "marcar Day 1 X bagged"**. Recebe `tournamentId` (qual entry passou) e opcionalmente `day2DateTime` (se nao foi definido na serie, ou se mudou) + `stackMode` (idem). Em resposta:
1. Cria/atualiza `planned_tournaments` Day 2 (se nao existir, cria com `series_id=:id`).
2. Atualiza `series.day2DateTime` se body trouxe valor novo.
3. Retorna `{ series, plannedDay2 }`.

> **Nota:** RF-17 deprecou `tournament.flightAdvanced`. Esta acao NAO espelha mais flag legado — `series_id != null` ja indica linkagem; bagged status pode ser inferido por `entries linkadas + planned Day 2 existente` ou modelado via novo campo se necessario (ver Notas tecnicas).

#### Body
```json
{
  "tournamentId": "<nanoid>",
  "day2DateTime": "2026-05-10T19:00:00Z",  // opcional, sobrescreve series.day2DateTime
  "stackMode": "combined"                   // opcional, sobrescreve series.stackMode
}
```

#### Criterios de aceitacao
- [ ] Endpoint POST `/api/tournament-series/:id/mark-bagged` registrado.
- [ ] Owner check duplo: `series` e `tournament` ambos do user autenticado.
- [ ] `tournament.series_id` deve ser igual a `:id` (404 se divergir — entry nao linkada).
- [ ] Se `series.day2DateTime` nao definido (NULL ou epoch) E body nao trouxer `day2DateTime` → 400 com message `"day2DateTime required"`.
- [ ] Cria planned_tournaments com `series_id=:id`, `dayOfWeek` derivado do `day2DateTime`, `time` em "HH:mm", `start_time=day2DateTime`, `status='upcoming'`, `name=series.name + " — Day 2"`, `site=series.network`, `buyIn=0` (Day 2 nao tem buy-in adicional, founder ajusta se quiser via edit), `type='Vanilla'`, `speed='Normal'` (defaults sensatos).
- [ ] Idempotente: chamar duas vezes seguidas com mesmo body NAO duplica planned (re-checa via `series_id + dayOfWeek` antes de inserir).
- [ ] Se planned ja existe e datetime mudou → atualiza datetime do existente, NAO cria novo.
- [ ] Retorna `200` com `{ series: {...updated}, plannedDay2: {...} }`.
- [ ] Test integration completo: fluxo "import CSV → confirm flight → mark bagged → planned criado".

#### Edge cases
- 2 Day 1s pagos da mesma serie em combined mode + jogador marca cada um como bagged separadamente → planned Day 2 unico (idempotencia D5).
- Founder marca bagged depois de ja ter terminado Day 2 (ordem inversa) → backend permite, mas planned ficaria duplicada com Day 2 ja jogado. **Decisao:** se ja existe `tournament` linkado a serie com nome contendo "Day 2" (heuristica) ou se `series.day2Status='completed'`, retornar 409 `{ message: 'Day 2 already completed' }`.
- `day2DateTime` no passado → permitido com warning no payload `{ warning: 'past_date' }`.
- Mudar `stackMode` apos Day 2 ja jogado (`completed`) → 409 `{ message: 'cannot change stackMode after completion' }` (afeta P&L retroativo).

#### Notas tecnicas
- Endpoint chama `storage.linkPlannedToSeries` apos criar planned.
- Possivel reuso de `storage.createPlannedTournament` (existente) ao inves de SQL direto.
- system-architect avaliar se "bagged status" precisa de novo campo na tabela `tournaments` (ex: `bagged_at: timestamp NULL`) ou se o modelo "entry linkada + planned Day 2 = bagged" e suficiente. **Recomendacao:** adicionar `tournaments.bagged_at TIMESTAMP NULL` para clareza explicita (substitui `flightAdvanced` boolean legado de forma mais rica). Test-writer assumir esse default.

---

### RF-05 — Parser CSV: detector de keywords + extracao de nome-base

#### Descricao
`server/csvParser.ts` ganha helper `detectFlightCandidate(tournamentName: string)` que retorna `{ isFlightCandidate: boolean, baseName: string, flightDay: string | null }`.

#### Regex (D7)
```
\b(flight|phase|stage|day\s*1[a-z]?|\b1[a-z]\b)\b
```
Case-insensitive. Exemplos:
- `"Sunday Million Phased Day 1A — $215"` → `{ isFlightCandidate: true, baseName: "Sunday Million Phased", flightDay: "1A" }`
- `"Bigger $109 Phase 1"` → `{ isFlightCandidate: true, baseName: "Bigger $109", flightDay: "Phase 1" }`
- `"Venom Stage 3"` → `{ isFlightCandidate: true, baseName: "Venom", flightDay: "Stage 3" }`
- `"Sunday $5 Bounty Hunter"` → `{ isFlightCandidate: false, baseName: "Sunday $5 Bounty Hunter", flightDay: null }`
- `"Sunday Million Phased Day 2 — $215"` → `{ isFlightCandidate: true, baseName: "Sunday Million Phased", flightDay: "Day 2" }` (Day 2 tambem dispara — necessario pra auto-link RF-08)

#### Extracao de `baseName`
- Remove substring que casou com regex (e tudo apos ela ate fim ou separador `—`/`-`/`(`).
- Trim.
- Se resultar em string vazia, fallback `baseName = tournamentName`.

#### Criterios de aceitacao
- [ ] Helper exportado de `server/csvParser.ts` (ou novo arquivo `server/flightDetector.ts` se architect preferir).
- [ ] 12+ tests unit cobrindo variacoes: "Day 1A", "Day 1B", "1A", "1C", "Phase 1", "Phase 2", "Stage 1", "Flight 3", "Day 2", false positives ("Day 1 of the Year", "Stage Hands Open").
- [ ] Para nomes em PT-BR ("Dia 1A"), **fora do escopo MVP** — keywords sao em ingles (redes operam em ingles).
- [ ] Performance: detectFlightCandidate em < 1ms por nome (regex compilado uma vez).

#### Edge cases
- Nome vazio ou null → `{ isFlightCandidate: false, baseName: '', flightDay: null }`.
- Nome com acentos/unicode → regex `\b` + flag `u` se necessario; testar com "Phased Brasileirão Day 1A".
- Multiplo match (ex: "Phase 1 Stage 2") → captura primeiro match para `flightDay`, baseName remove ate o primeiro match.

#### Notas tecnicas
- Regex compilado como const `FLIGHT_KEYWORDS_REGEX` no top-level do modulo.
- Dont integrar com Day 2 detection ainda — RF-08 trata.

---

### RF-06 — `POST /api/upload` aumentado: `pendingFlightConfirmations` na response (in-memory)

#### Descricao
Endpoint `POST /api/upload` (parser CSV existente) ganha logica adicional: apos parsear cada tournament, chamar `detectFlightCandidate(name)`. Se `isFlightCandidate=true`:
1. Insere o tournament normalmente em `tournaments` **sem flag de pending** (D10 — sem coluna `pending_flight_confirmation`). Tournament fica visivel imediatamente em reports/dashboard com `series_id=NULL`.
2. Acumula info no array de resposta `pendingFlightConfirmations[]` para o frontend abrir o modal RF-09.

> **Diferenca chave vs spec original:** Tournaments detectados como flight-candidate **NAO sao escondidos** dos reports. Founder pode confirmar via modal e linkar a serie depois (mudando `series_id` de NULL → valor); ou cancelar e tournaments ficam normais para sempre (sem `series_id`). Nao ha "estado de espera".

#### Response shape
```json
{
  "imported": 47,
  "duplicates": 3,
  "errors": [],
  "pendingFlightConfirmations": [
    {
      "tournamentId": "abc123",
      "name": "Sunday Million Phased Day 1A — $215",
      "baseName": "Sunday Million Phased",
      "flightDay": "1A",
      "site": "PokerStars",
      "datePlayed": "2026-04-28T18:00:00Z",
      "buyIn": "215.00",
      "suggestedSeriesId": null      // se RF-08 encontrou match auto, vem populado
    }
  ]
}
```

#### Criterios de aceitacao
- [ ] Tournaments detectados como flight-candidate sao inseridos com `series_id=NULL` e **aparecem normalmente** em queries default (`getTournamentsByUserId`, dashboard, reports).
- [ ] `pendingFlightConfirmations[]` retornado em memoria apenas (nao persistido).
- [ ] Hook frontend `useUpload` recebe `pendingFlightConfirmations` na response.
- [ ] Quando array vazio, comportamento identico ao atual.
- [ ] Test integration: CSV com 5 nomes-flight + 10 nomes normais → todos 15 visiveis em reports, 5 retornam no array `pendingFlightConfirmations`.
- [ ] **NAO existe endpoint `GET /api/upload/pending-flight-confirmations`** — descartado (D10).
- [ ] **NAO existe coluna `pending_flight_confirmation` em `tournaments`** — descartada (D10).

#### Edge cases
- Upload duplicado (founder reenvia mesmo CSV): tournaments ja inseridos sao detectados via duplicate check existente. Se duplicate = skip; se inseridos novamente (cenario raro), `pendingFlightConfirmations` re-aparece no response — modal abre de novo, founder pode confirmar ou cancelar.
- Founder fecha o frontend antes de confirmar: tournaments ficam normais com `series_id=NULL`. Founder pode criar serie depois via tela `/flight` e linkar via RF-13.
- Falha parcial no parser: tournaments validos sao inseridos, errors documentados em `errors[]`. `pendingFlightConfirmations` reflete os flight-candidates inseridos.

#### Notas tecnicas
- **Sem filter `WHERE pending_flight_confirmation=false` em queries** — D10 simplificou. Reduz complexidade em N storage methods.
- Frontend sera responsavel por abrir modal RF-09 imediatamente apos response do upload, baseado em `pendingFlightConfirmations.length > 0`.

---

### RF-07 — `POST /api/upload/confirm-flights`: aplica decisoes em batch

#### Descricao
Endpoint que recebe map de decisoes do founder (do modal `FlightConfirmationDialog`) e aplica em batch. **Cap de 50 confirmacoes por request** (D11).

#### Body
```json
{
  "confirmations": [
    {
      "tournamentId": "abc123",
      "isFlight": true,
      "seriesId": null,                          // null = criar nova serie
      "newSeries": {                             // obrigatorio se seriesId=null
        "name": "Sunday Million Phased",
        "totalDay1s": 17,
        "day2DateTime": "2026-04-29T19:00:00Z",
        "stackMode": "combined"
      }
    },
    {
      "tournamentId": "xyz789",
      "isFlight": true,
      "seriesId": "existing-series-id"           // linkar a existente
    },
    {
      "tournamentId": "def456",
      "isFlight": false                          // falso positivo — no-op (entry ja esta normal)
    }
  ]
}
```

#### Comportamento
- `isFlight=true` + `seriesId=null` + `newSeries` → cria series nova + `linkTournamentToSeries(tId, novoSeriesId)`.
- `isFlight=true` + `seriesId=<existente>` → `linkTournamentToSeries(tId, seriesId)`.
- `isFlight=false` → no-op (tournament ja esta com `series_id=NULL` desde o insert original — D10 mudou isso). Apenas registra a decisao para metrics opcional.

#### Resposta
```json
{
  "processed": 3,
  "createdSeries": 1,
  "linkedToExisting": 1,
  "markedNotFlight": 1,
  "errors": []
}
```

#### Criterios de aceitacao
- [ ] Endpoint POST `/api/upload/confirm-flights` registrado.
- [ ] Batch processado em transaction unica (rollback completo se qualquer erro).
- [ ] Owner check em cada `tournamentId` E em cada `seriesId` referenciado.
- [ ] Validacao: `isFlight=true` exige OU `seriesId` valido OU `newSeries` completo (Zod refinement).
- [ ] **Limite de 50 confirmations por request** (Zod max + rate limit).
- [ ] Erros parciais NAO sao permitidos — atomico.
- [ ] Test integration cobrindo: criar nova + linkar existente + no-op para false-positive em uma mesma request.

#### Edge cases
- Confirmation duplicada (mesmo tournamentId 2x no array) → reject 400 `{ message: 'duplicate tournamentIds' }`.
- `seriesId` referencia serie de outro user → 404.
- `newSeries.day2DateTime` invalido (string nao parseavel) → 400.
- Confirmation com `isFlight=false` em tournament que ja tem `series_id != null` → defesa: backend faz unlink (set `series_id=NULL`).
- Founder envia body vazio (`confirmations: []`) → 200 sem mudancas, processed=0.
- Batch com > 50 → 400 `{ message: 'max 50 confirmations per batch' }`.

---

### RF-08 — Auto-link Day 1 + Day 2 quando ambos vem no mesmo CSV

#### Descricao
Otimizacao do parser: se o mesmo upload contem tournaments que `detectFlightCandidate` identificou como "Day 2" (ex: "Sunday Million Phased Day 2") **E** outros como "Day 1" do mesmo `baseName`, o parser:
1. Cria automaticamente a serie (sem prompt).
2. Linka todos os Day 1s + o Day 2 a essa serie.
3. NAO inclui essas tournaments em `pendingFlightConfirmations[]` (ja inferiu).
4. Inclui no response um campo extra `autoLinkedSeries: [{ seriesId, name, entryCount }]` pra UI mostrar toast informativo.

#### Heuristica de matching
- Mesmo `baseName` (case-insensitive trim).
- Mesmo `site`.
- `Day 2 datetime` deve estar entre 1 e 7 dias **apos** a data do Day 1 mais antigo (faixa razoavel pra cobrir Phased semanal e weekend torneios).

#### Auto-criacao da serie
- `name` = baseName extraido.
- `network` = site das entries.
- `totalDay1s` = quantidade de Day 1s detectados no upload (founder pode editar depois).
- `day2DateTime` = datePlayed do tournament Day 2 detectado.
- `stackMode` = `combined` se >=2 Day 1s detectados, senao `single`.
- `day2Status` = `completed` (Day 2 ja esta no CSV → ja foi jogado).

#### Criterios de aceitacao
- [ ] Detector usa `baseName` exato (case-insensitive) + `site` igual + janela 1-7 dias.
- [ ] Series criada automaticamente com defaults acima.
- [ ] Day 1s e Day 2 todos linkados via `series_id`.
- [ ] Tournaments auto-linkados NAO aparecem em `pendingFlightConfirmations[]`.
- [ ] Toast/banner no frontend: "Series 'Sunday Million Phased' criada automaticamente (3 entries linkadas)".
- [ ] Heuristica falha (ex: Day 1 e Day 2 em datas que nao batem) → fallback para fluxo RF-06 (entry vai pro `pendingFlightConfirmations[]`, founder confirma).

#### Edge cases
- 2 Day 1s + 0 Day 2 no upload → NAO auto-cria, vai pro fluxo de prompt (RF-06).
- 0 Day 1 + 1 Day 2 no upload → NAO auto-cria (sem entries pra linkar). Day 2 vai pra `pendingFlightConfirmations` e founder pode linkar via modal escolhendo serie existente.
- 3 Day 1s + 1 Day 2 mas com nomes que diferem por sufixo (ex: "Sunday Million Phased Day 1A — $215" vs "Sunday Million Phased — Final Table Day 2") → matching de baseName precisa ser robusto a sufixos. Test cobrindo essa variacao.
- Upload com 2 series diferentes simultaneas (ex: Sunday Million Phased + Bigger Phased) → cria 2 series, linka cada uma corretamente.

#### Notas tecnicas
- Logica roda **apos** parser detectar todos candidates do upload, **antes** de retornar response.
- system-architect deve avaliar se isso aumenta latency de upload acima do aceitavel — provavel impacto < 50ms para uploads tipicos (100-500 entries).

---

### RF-09 — Modal frontend `FlightConfirmationDialog` (inline pos-upload, descartavel)

#### Descricao
Componente React `FlightConfirmationDialog` (em `client/src/components/upload/`) abre **uma vez**, imediatamente apos `POST /api/upload` retornar `pendingFlightConfirmations.length > 0`. Lista cada tournament detectado e pede:
1. **Toggle: SIM e flight / NAO nao e flight** (default SIM).
2. Se SIM, dropdown: **"Criar nova serie" / "Linkar a serie existente"**.
3. Se "Criar nova serie": form inline com `name` (pre-preenchido com `baseName`), `totalDay1s` (input number, default 1), `day2DateTime` (datetime picker em TZ user, output UTC), `stackMode` (radio `single`/`combined`).
4. Se "Linkar a serie existente": dropdown buscavel listando series do user com `day2Status='pending'` (ordenadas por `day2DateTime DESC`).
5. Botao "Confirmar todos" submete batch para `POST /api/upload/confirm-flights`.

#### UI/UX details
- Modal **descartavel** (D10): tem botao "Cancelar / Confirmar depois" alem de "Confirmar todos". Cancelar = entries ficam normais sem `series_id` (founder pode criar serie depois via `/flight`).
- **NAO ha persistencia de estado intermediario em localStorage** — modal e single-shot pos-upload.
- **NAO ha endpoint `GET /api/upload/pending-flight-confirmations`** para reabrir — modal nao reabre automaticamente em outra sessao.
- Loading states + error toast para falhas de rede.
- Responsive: stack vertical em mobile.
- Cap UI: se `pendingFlightConfirmations.length > 50`, mostra warning e force pagination interna do modal (submeter em batches de 50).

#### Criterios de aceitacao
- [ ] Modal renderiza imediatamente quando upload retorna pendentes.
- [ ] Toggle SIM/NAO funciona por entry.
- [ ] Form inline "Criar nova serie" valida campos (Zod no client + backend).
- [ ] Dropdown "linkar a existente" filtravel via search (typeahead).
- [ ] Datetime picker output em UTC (componentes `<DateTimePicker>` ja existentes em `client/src/components/ui/`).
- [ ] Botao "Confirmar todos" desabilitado se ha entries com SIM mas sem decisao completa.
- [ ] Botao "Cancelar / Confirmar depois" fecha modal sem submeter — entries permanecem com `series_id=NULL`.
- [ ] Apos sucesso, modal fecha + toast "X series criadas, Y linkadas" + invalida `useQuery` keys de tournaments/series.
- [ ] Test RTL com data-testid estaveis (lessons-learned #2).

#### Edge cases
- Founder marca todos como NAO e clica "Confirmar todos" → request com `isFlight=false` em todos (no-op no backend), modal fecha.
- Network falha durante submit → mantem state, retry button habilitado.
- Founder fecha tab/browser durante modal aberto → estado perdido; entries ficam normais sem `series_id`. Founder usa back-fill (RF-13) depois.
- 50+ pendentes em uma upload: paginar UI submeter em batches.

#### Notas tecnicas
- Reuso de patterns do `RegisterPaymentDialog` recente (Sprint Tickets-Wiring RF-05) — mesmo tipo de modal batch.

---

### RF-10 — Pagina `/flight` (lista + drill-down)

#### Descricao
Nova rota `/flight` no Wouter. Pagina renderiza:

#### Layout
- **Header:** titulo "Flight" + botao "Adicionar Series Retroativo" (link pra modal RF-13).
- **Tabs:** "Pendentes" (default, mostra `day2Status='pending'`) | "Concluidas" | "Canceladas" | "Todas".
- **Grid/lista:** cada serie como card com:
  - Nome + network badge.
  - Status pill (pending/completed/cancelled).
  - Stack mode badge ("Single" ou "Combined").
  - `entries.length` / `totalDay1s` (ex: "3 / 17 Day 1s pagos").
  - `day2DateTime` formatado em TZ user.
  - P&L preview (se completed).
  - Botoes: "Ver detalhe" / "Marcar Day 1 bagged" (se pending) / "Editar" / "Deletar".
- **Detail panel (click "Ver detalhe"):** drawer ou rota `/flight/:id` mostrando:
  - Series metadata.
  - Lista de entries linkadas (Day 1s) — cada com link pra TournamentDetail.
  - Lista de planneds linkados (Day 2 se ainda pending).
  - P&L combinado.
  - Botao "Editar serie" (modal abre form).

#### Sidebar
- Adicionar item **"Flight"** sob FERRAMENTAS (D14 — nome curto).
- Icone `Layers`.
- Ordem alfabetica: `Flight` antes de `Selector` (Tournament Selector).

#### Criterios de aceitacao
- [ ] Rota `/flight` registrada em Wouter.
- [ ] Sidebar atualizada com novo item "Flight".
- [ ] Tabs alteram filtro `?status=` na URL (deep-linkavel).
- [ ] Cards usam `useQuery(['tournament-series', { status }])` para data fetching.
- [ ] Loading skeleton + empty state ("Voce ainda nao tem nenhuma serie multi-flight. Importe um CSV ou adicione retroativo.").
- [ ] Drill-down via Sheet/Drawer ou rota dedicada `/flight/:id` (system-architect decide).
- [ ] Botoes de acao chamam endpoints corretos.
- [ ] Test RTL cobrindo: render lista, click em card, render detail, click "Marcar bagged" (mock endpoint), confirm modal aparece.

#### Edge cases
- User sem nenhuma serie → empty state com CTA "Adicionar Series Retroativo".
- Series com 0 entries linkadas (criada manual sem entries ainda) → render OK com "0 / N pagos".
- Drill-down de serie deletada (race condition) → 404 → toast "Serie nao encontrada" + redirect pra lista.

---

### RF-11 — Action "Marcar Day 1 X bagged" em 3 contextos

#### Descricao
Botao "Marcar bagged" disponivel em:
1. **Lista de torneios da biblioteca** (`/tournaments`): em cada row de tournament com `series_id != null` E `bagged_at IS NULL` (ver RF-04 Notas tecnicas), botao inline.
2. **Tela series** (`/flight/:id`): em cada entry listada.
3. **Pagina detalhe do tournament** (`/tournaments/:id`): botao destaque se `series_id != null` E `bagged_at IS NULL`.

Click → abre `MarkBaggedDialog` que pre-preenche datetime do Day 2 (se ja na serie) e permite override + override stackMode + comentario opcional. Submit chama `POST /api/tournament-series/:seriesId/mark-bagged`.

#### Criterios de aceitacao
- [ ] Botao aparece nos 3 contextos com mesma label e icone.
- [ ] `MarkBaggedDialog` reutilizado nos 3 (DRY).
- [ ] Pre-preenche datetime e stackMode da serie.
- [ ] Submit invalida queries: `tournaments`, `tournament-series`, `planned-tournaments`.
- [ ] Toast sucesso: "Day 2 adicionado a grade ({datetime})".
- [ ] Test RTL nos 3 contextos.

#### Edge cases
- Tournament sem `series_id` (single-flight normal) → botao NAO aparece (filter visual).
- `bagged_at` ja preenchido → botao some, badge "Bagged" aparece.
- Backend retorna 409 (Day 2 already completed) → toast erro + nao fecha dialog.

---

### RF-12 — Visual indicators: badges nos torneios + planneds

#### Descricao
Em qualquer renderizacao de tournament ou planned_tournament que tenha `series_id != null`, mostrar badge:
- **Tournament Day 1:** badge com flightDay extraido do nome (ex: "Day 1A") + badge "Phased" (cor azul).
- **Tournament Day 2:** badge "Day 2" + badge "Phased" + tooltip mostrando nome da serie ao hover.
- **Planned Day 2:** badge "Day 2" + tooltip "Auto-criado por serie 'Sunday Million Phased'".

Locais que renderizam: TournamentLibrary, TournamentDetail, PlannedTournamentCard (no GradePlanner), Calendar view, GrindSession active tournaments list.

#### Criterios de aceitacao
- [ ] Componente `<SeriesBadge tournament={t} />` ou `<SeriesBadge planned={p} />` reutilizado.
- [ ] Cor consistente (definida em `@/lib/ui-tokens`).
- [ ] Tooltip mostra `series.name` (fetch lazy se necessario via `useQuery`).
- [ ] Filter visual nas listas: opcao "Mostrar apenas series" (toggle).
- [ ] Test RTL: render badge em cada local.

#### Edge cases
- Series deletada mas tournament ainda referencia (orfao via SET NULL) → tournament fica `series_id=null` → sem badge (consistente).
- Planned Day 2 cujo series foi deletado → mesma logica.
- flightDay nao extraivel do nome → fallback badge generico "Day 1" sem letra.

---

### RF-13 — UI back-fill manual: "Adicionar Series Retroativo"

#### Descricao
Form modal acessivel pelo botao "Adicionar Series Retroativo" em `/flight`. Permite founder:
1. Definir metadata da serie (nome, network, totalDay1s, day2DateTime, stackMode).
2. **Selecionar N tournaments existentes da biblioteca** via search/multiselect (filter por nome + site + faixa de datas) → linkar como entries.
3. Opcionalmente criar planned Day 2 retroativo (se `day2DateTime` futuro) ou marcar `day2Status='completed'` direto se passado.
4. Submit cria serie + linka entries via N requests sequenciais (ou Promise.all) ao endpoint generico `PATCH /api/tournaments/:id` setando `series_id`. **Sem endpoint batch dedicado** (D-decisao founder: volume baixo, founder vai usar pessoalmente).

#### Criterios de aceitacao
- [ ] Modal `BackfillSeriesDialog` em `client/src/components/tournament-series/`.
- [ ] Search/multiselect de tournaments via `GET /api/tournaments?search=&site=&dateFrom=&dateTo=`.
- [ ] Validacao: pelo menos 1 entry selecionada OR `totalDay1s=0` (caso founder cria serie pre-evento).
- [ ] Submit:
  1. `POST /api/tournament-series` para criar a serie.
  2. Para cada tournament selecionado, `PATCH /api/tournaments/:id` body `{ seriesId: novoId }`. Pode usar `Promise.all` (volume baixo).
  3. Se algum PATCH falhar, mostra warning toast com lista de IDs nao-linkados; serie criada permanece (founder pode linkar manualmente depois).
- [ ] Apos sucesso, redirect pra detail da serie criada.
- [ ] Test integration: criar serie + linkar 5 entries via N PATCHs + verificar P&L combinado.

#### Edge cases
- Founder seleciona tournament que ja tem `series_id != null` (ja linkado a outra serie) → confirma override ou bloqueia (decisao: bloquear, mostrar warning "Tournament X ja pertence a serie Y. Desvincule antes.").
- Backfill de serie com Day 2 que nao foi jogado (founder esqueceu de importar) → permitido, founder pode importar depois e linkar manualmente via "Editar serie".
- Multi-select com 50+ entries → paginar UI (founder dificilmente vai linkar tudo de uma vez); se fizer, N PATCHs sequenciais.
- 1 ou mais PATCHs falham (rede, owner check) → serie persiste, lista de falhas mostrada ao founder com retry manual.

#### Notas tecnicas
- **Sem `POST /api/tournament-series/:id/link-tournaments` batch endpoint** — usar API existente de update de tournament (`PATCH /api/tournaments/:id` ja existe e aceita `seriesId` no body apos RF-01 incluir o campo no schema).
- system-architect verificar se `PATCH /api/tournaments/:id` existente aceita `seriesId` ou precisa de update (provavel update minimo no Zod schema do PATCH para incluir `seriesId` opcional).

---

### RF-14 — Edit-in-place do Day 2 datetime + outros campos

#### Descricao
Founder pode editar uma serie existente (caso rede mude horario do Day 2, founder precisa ajustar `totalDay1s`, etc). UI:
- Botao "Editar" no card da serie + na pagina detail.
- Modal `EditSeriesDialog` com campos editaveis: `name`, `totalDay1s`, `day2DateTime`, `stackMode`, `notes`, `day2Status`.
- Submit chama `PATCH /api/tournament-series/:id`.

**Side-effect importante:** se `day2DateTime` mudou, **atualizar o `planned_tournaments` Day 2 linkado** (`start_time`, `time`, `dayOfWeek`) automaticamente. Idempotente.

#### Criterios de aceitacao
- [ ] Modal renderiza com valores atuais.
- [ ] Submit PATCH funciona.
- [ ] Side-effect: `planned_tournaments.start_time` atualizado quando `day2DateTime` muda.
- [ ] Confirmacao explicita pra mudar `stackMode` se serie ja `completed` (ja blocked no backend RF-04, mas UI tambem alerta).
- [ ] Test integration: editar datetime + verificar planned atualizado.

#### Edge cases
- Mudar datetime pra passado quando ja `completed` → permitido (apenas correcao historica).
- Mudar `day2Status='completed' → 'pending'` → permitido mas warning "Isso pode afetar reports".
- Editar serie cuja planned Day 2 foi deletada manualmente → side-effect skip silencioso (nao 500).

---

### RF-15 — `calculateSessionStats` + reports respeitam combined-stack

#### Descricao
A funcao `calculateSessionStats` (em `server/storage.ts` ou `server/services/`) e os endpoints de relatorio (`/api/analytics/*`, `/api/dashboard/*`, `/api/bankroll/reports`) devem respeitar `series_id`:
- Se tournament tem `series_id` E `series.stackMode='combined'`:
  - Em modo "agregar series" (default), tratar todas entries da serie como **um unico evento**: `buyInTotal = sum(entries.buyIn) + sum(entries.rebuy * cost)`, `prizeTotal = max(entries.prize)` (Day 2 ganha 1 prize, Day 1s perdedores tem prize=0; max captura o ganho do Day 2 sem dupla contagem).
  - ROI calculado: `(prizeTotal - buyInTotal) / buyInTotal`.
  - Conta como 1 torneio (`tournamentsPlayed += 1`, nao N).
- Se `stackMode='single'`:
  - Trata como single-flight normal mas linkado (badge so visual; P&L calculado normalmente entry-a-entry).
- Filter "expandir" (RF-16) inverte: cada entry conta separadamente como hoje.

#### Criterios de aceitacao
- [ ] `calculateSessionStats` aceita parametro `expandFlightSeries: boolean` (default `false` — agregar).
- [ ] Reports endpoints aceitam query param `?expandFlightSeries=true` (default false).
- [ ] Quando agregando, ROI por torneio unico (1 serie = 1 torneio).
- [ ] Quando expandindo, comportamento atual preservado.
- [ ] Test integration com series combined: 3 entries de R$215 + Day 2 prize R$5000 → agregado: 1 torneio, buyIn=R$645, prize=R$5000, ROI=675%. Expandido: 4 torneios, ROI total identico.
- [ ] Test integration com series single: agregado e expandido produzem mesmo resultado (1 entry, 1 prize).
- [ ] Bankroll snapshots e P&L diario consideram default agregado.

#### Edge cases
- Serie com 0 entries linkadas (orfanada via SET NULL) → ignorada nos reports (sem afetar).
- Serie completed com Day 2 perdido (todas entries tem prize=0 ou apenas Day 2 com prize parcial) → calculo correto (max entre todas).
- Serie cujo Day 2 ainda esta pending mas Day 1s ja jogados → agregado considera como pending ROI (nao computa final ate Day 2 completed).

#### Notas tecnicas
- system-architect deve definir se a flag `expandFlightSeries` vai em `user_settings` global (D13) ou apenas query param. **Decisao D13:** ambos — settings define default, query param override.
- Cuidado com `lessons-learned #6` (conversao moeda): se entries em moedas diferentes, normalizar pra USD antes de somar.

---

### RF-16 — Filtro de relatorios "agregar vs expandir"

#### Descricao
UI toggle no topo das telas de reports (Dashboard, Bankroll Reports, Grind History) com 2 opcoes:
- **"Agregar series" (default)** — combined-stack vira 1 torneio.
- **"Expandir entries"** — cada entry conta separadamente.

Estado persistido em `user_settings.reportsExpandFlightSeries` (boolean default false). Mudanca trigger refetch de queries.

#### Criterios de aceitacao
- [ ] Toggle component reutilizavel (`<FlightAggregationToggle />`).
- [ ] Persistido em `user_settings` via `PATCH /api/user/settings`.
- [ ] Queries de reports incluem param `expandFlightSeries`.
- [ ] Test E2E: toggle → reports atualizam → numeros mudam corretamente.

#### Edge cases
- User sem nenhuma serie → toggle ainda aparece mas nao tem efeito visivel.
- Mudanca durante sessao ativa → snapshots ja persistidos NAO sao recalculados, apenas display futuro.

---

### RF-17 — Migracao + Deprecacao flags ADR-031 (single source of truth)

#### Descricao
**Substituir completamente** os flags estaticos legados ADR-031 (`isFlight`, `flightDay`, `flightParentId`, `flightAdvanced`) pela entidade `tournament_series`. Inclui:

1. **Migration de dados (script):** scan em `tournaments` por rows com `isFlight=true`. Para cada grupo de rows com mesmo `flightParentId` (ou se NULL, mesmo `name` base + mesmo user + janela de datas), criar `tournament_series` correspondente e popular `series_id` nas rows. Casos ambiguos (sem `flightParentId` e sem heuristica de matching clara) → log + criar serie individual por entry.
2. **Refator do wizard manual de torneio** (`client/src/components/grade-planner/AddTournamentWizard.tsx` ou equivalente): remover campos `isFlight/flightDay/flightParentId/flightAdvanced` do form. Adicionar opcao "Faz parte de uma serie multi-flight?" → se SIM, dropdown "Linkar a serie existente" ou "Criar nova serie inline" (mini-form de criacao de serie). Submeter usa endpoints `/api/tournament-series` em vez dos flags.
3. **Refator do schema Zod:** remover os 4 campos dos schemas de input/update de `tournaments` e `planned_tournaments`. Atualizar `insertTournamentSchema`, `updateTournamentSchema`, `insertPlannedTournamentSchema`, `updatePlannedTournamentSchema`.
4. **Migration final (DROP COLUMN):** apos refator + migration de dados, criar segunda migration que dropa as 4 colunas. **Esta migration roda APOS toda a sprint estar verde** (test-writer + implementer + reviewer aprovados).

#### Criterios de aceitacao
- [ ] Script de migracao de dados em `scripts/migrate-flight-flags-to-series.ts`.
  - [ ] Idempotente (rodar 2x nao duplica series).
  - [ ] Logs detalhados de cada serie criada e cada tournament linkado.
  - [ ] Modo dry-run via flag `--dry-run` (mostra o que faria sem persistir).
  - [ ] Test integration com fixture de DB com 10+ rows pre-existentes em varios cenarios.
- [ ] Wizard refatorado:
  - [ ] Tests existentes em `tests/integration/grade-planner/add-tournament-wizard-flow.test.ts` adaptados para nova UX.
  - [ ] Novo test cobrindo "criar tournament + linkar a serie nova inline".
  - [ ] Novo test cobrindo "criar tournament + linkar a serie existente".
  - [ ] Tests de regressao: wizard sem opcao multi-flight (single tournament) continua funcionando.
- [ ] Schema Zod atualizado, sem os 4 campos legados.
- [ ] Migration `00YY_drop_legacy_flight_flags.sql` criada (DROP COLUMN x4).
- [ ] Migration final NAO roda automaticamente em `npm run db:push` da sprint — precisa ser invocada manualmente apos founder validar dados (founder pede sign-off explicito antes de drop).
- [ ] Documentacao em `Docs/architecture/decisions/0XX-deprecate-flight-flags-adr-031.md` (novo ADR).
- [ ] CLAUDE.md atualizado removendo mencao aos flags legados.

#### Edge cases
- Tournaments com `isFlight=true` mas sem `flightParentId` (orfao na ADR-031): script cria serie individual com `totalDay1s=1`, `stackMode='single'`, `name` derivado do tournament name.
- Tournaments com `flightParentId` apontando pra outro `tournament.id` (modelo da ADR-031): script identifica grupo via `flightParentId` e cria 1 serie agrupando todas.
- Tournaments com `flightAdvanced=true`: script popula `tournaments.bagged_at = updatedAt` (proxy, ja que nao temos timestamp exato de quando foi marcado).
- Wizard atual usado por user em sessao no momento do deploy: refator e backwards-incompatible — necessario warning de "feature reformulada, wizard atualizado".
- Test legados que dependem dos flags vao quebrar — test-writer deve identificar e adaptar (lessons-learned #2 + #11 — spec eh fonte de verdade).

#### Notas tecnicas
- **Risco principal:** quebrar wizard atual + tests de wizard. Mitigacao: test-writer escreve testes da nova UX antes do refator; reviewer faz pass dedicado em `tests/integration/grade-planner/`.
- system-architect deve criar diagrama de sequencia mostrando "wizard novo: criar tournament + linkar serie inline".
- Coordenacao com RF-04 / RF-11: campo `bagged_at` substitui `flightAdvanced`. Adicionar coluna `tournaments.bagged_at TIMESTAMP NULL` na mesma migration RF-01 (ou em migration separada antes de RF-17).
- Comunicacao: founder usa o wizard pessoalmente — refator deve preservar UX intuitiva (toggle simples + dropdown).

---

## 7. Pre-requisitos Tecnicos

| Item | Responsavel | Quando |
|------|-------------|--------|
| ADR documentando "single source of truth = tournament_series" + plano de remocao flags ADR-031 | system-architect | antes do test-writer |
| ADR documentando `stack_mode` enum (decisao single vs combined vs best, justificar exclusao de best) | system-architect | antes do test-writer |
| Migration SQL `00XX_tournament_series.sql` + adicao de `tournaments.bagged_at` | implementer (apos arquitetura) | RF-01 |
| Migration final `00YY_drop_legacy_flight_flags.sql` | implementer | RF-17 (rodar manualmente apos sign-off) |
| Script `scripts/migrate-flight-flags-to-series.ts` | implementer | RF-17 |
| Drizzle schema declarations atualizadas (com novas colunas + sem flags legados na fase final) | implementer | RF-01 + RF-17 |
| `insertTournamentSeriesSchema` Zod via `drizzle-zod` | implementer | RF-01 |
| Atualizar `Docs/architecture/data-model-index.md` + `data-model.mermaid` | system-architect | parallel com RF-01 |
| Atualizar `Docs/api/endpoints-index.md` + `endpoints.md` | implementer | RF-03 + RF-04 + RF-06 + RF-07 |
| Tests setup: `tests/integration/tournament-series/` (novo dir) + `tests/unit/csvParser/flight-detector.test.ts` + `tests/integration/migrations/migrate-flight-flags.test.ts` | test-writer | antes do implementer |

---

## 8. Estimativa de Esforco

> Escala S (≤2h) / M (≤1 dia) / L (≤2 dias) / XL (>2 dias)

| RF | Esforco | Notas |
|----|---------|-------|
| RF-01 (schema) | M | Migration + drizzle + tests schema (sem `pending_flight_confirmation`; com `bagged_at`) |
| RF-02 (storage) | M | 9 methods + tests unit |
| RF-03 (endpoints CRUD) | M | 5 endpoints REST + Zod + tests integration |
| RF-04 (mark-bagged) | L | Side-effect Day 2 + idempotencia + tests integration |
| RF-05 (parser detector) | S | Helper isolado + tests unit |
| RF-06 (upload pending) | S | **Simplificado** — sem filter automatico em N storage methods, sem endpoint extra `pending-list`. Apenas response shape. |
| RF-07 (confirm-flights batch) | M | Transaction + Zod refinements + cap 50 |
| RF-08 (auto-link CSV) | L | Heuristica + tests com fixtures CSV reais |
| RF-09 (FlightConfirmationDialog) | M | **Simplificado** — sem localStorage de estado intermediario, sem reabertura automatica. Modal single-shot pos-upload. |
| RF-10 (pagina + sidebar) | L | Lista + drill-down + Wouter (rota `/flight`) |
| RF-11 (mark bagged 3 contextos) | M | Reuso dialog + 3 callsites |
| RF-12 (badges visuais) | S | Componente reutilizavel + 5+ callsites |
| RF-13 (back-fill UI) | M | **Simplificado** — multi-select + N PATCHs (sem endpoint batch dedicado) |
| RF-14 (edit serie) | M | Modal edit + side-effect planned update |
| RF-15 (stats combined) | XL | Mudanca em `calculateSessionStats` + reports + cobertura tests integration grande |
| RF-16 (toggle reports) | S | Toggle + settings persist |
| **RF-17 (migrate + deprecate flags ADR-031)** | **XL** | **Script de migracao + refator wizard + tests adaptados + DROP COLUMN final + ADR. Risco principal da sprint.** |

**Total estimado:** ~8-10 dias dev solo (founder modo auto), assumindo ~70% green phase com test-writer pavimentando. RF-17 adiciona ~2 dias mas RF-06 e RF-09 simplificados compensam parcialmente.

**Delta vs estimativa anterior:** +1-2 dias liquido (RF-17 e XL, mas RF-06 caiu de M→S, RF-09 de L→M, RF-13 de L→M).

---

## 9. Paralelismo e Dependencias

```
RF-01 (schema)
  ├─→ RF-02 (storage)
  │     ├─→ RF-03 (endpoints CRUD)
  │     ├─→ RF-04 (mark-bagged)
  │     ├─→ RF-06 (upload pending)
  │     ├─→ RF-07 (confirm-flights batch)
  │     ├─→ RF-08 (auto-link)
  │     ├─→ RF-13 (back-fill UI usa endpoints existentes + RF-03)
  │     ├─→ RF-14 (edit backend)
  │     └─→ RF-15 (stats combined)
  │           └─→ RF-16 (toggle reports)
  ├─→ RF-12 (badges — depende so de tipo TS)
  └─→ RF-17 (migration + deprecate flags) — depende RF-01/02/03 (precisa endpoints series prontos pro wizard refatorado)

RF-05 (parser detector) — INDEPENDENTE de RF-01, pode ir paralelo
  └─→ RF-06 (upload pending)
        └─→ RF-08 (auto-link)
        └─→ RF-09 (modal frontend)
              └─→ RF-07 (confirm-flights backend)

RF-10 (pagina) — depende de RF-03 + RF-04
  └─→ RF-11 (mark bagged 3 contextos)
        └─→ RF-13 (UI back-fill)
        └─→ RF-14 (UI edit)
```

**Pode rodar em paralelo:**
- RF-05 (parser) e RF-01 (schema) podem comecar simultaneamente.
- RF-12 (badges) pode comecar assim que types TS de `TournamentSeries` existem (apos RF-01).
- RF-15 + RF-16 (reports) podem comecar quando RF-02 estiver done — independente do frontend.
- RF-09 (modal) depende apenas de tipo TS dos endpoints RF-06/RF-07 — pode ser stub-driven.
- **RF-17 (migration script)** pode comecar assim que RF-01/02/03 estiverem prontos — refator do wizard depende de endpoints series funcionais.

**Caminho critico (atualizado):**
RF-01 → RF-02 → RF-04 → RF-09 → RF-15 → RF-17 (migration + drop columns) → release.

> **RF-17 entrou no caminho critico** porque o DROP COLUMN final precisa rodar apos toda a sprint estar verde + sign-off founder.

---

## 10. Cenarios de Teste (visao consolidada)

### Happy paths
- [ ] Upload CSV com 5 Day 1s + 1 Day 2 da mesma serie → auto-link, sem prompt, badge na biblioteca.
- [ ] Upload CSV com 3 Day 1s sem Day 2 → modal abre → founder cria nova serie → planned Day 2 criado.
- [ ] **Upload CSV com 3 Day 1s sem Day 2 → founder CANCELA modal → entries ficam normais com `series_id=NULL`, visiveis em reports.**
- [ ] Marcar Day 1 X bagged manualmente → planned Day 2 aparece no calendar.
- [ ] Editar `day2DateTime` da serie → planned Day 2 atualiza automaticamente.
- [ ] Reports default agregam combined-stack: 3 entries + 1 prize = 1 torneio com ROI calculado.
- [ ] Toggle "expandir" inverte: 4 torneios separados.
- [ ] Back-fill: criar serie + linkar 5 tournaments antigos via N PATCHs → P&L combinado aparece corretamente.
- [ ] **Wizard manual: criar tournament + linkar serie inline → tournament salvo com `series_id` correto, sem usar flags legados.**
- [ ] **Migracao de dados: rodar script em DB com flags legados → series criadas + `series_id` populado em todos tournaments com `isFlight=true`.**

### Validacao de input
- [ ] POST `/tournament-series` sem `name` → 400.
- [ ] POST `/tournament-series` com `totalDay1s=-1` → 400.
- [ ] POST `/tournament-series` com `stackMode='best'` → 400 (enum).
- [ ] POST `/tournament-series/:id/mark-bagged` com `tournamentId` que nao pertence a serie → 404.
- [ ] POST `/upload/confirm-flights` com 51 confirmations → 400 (cap 50).

### Regras de negocio
- [ ] Cross-user access bloqueado em todos endpoints (404).
- [ ] Idempotencia mark-bagged: chamar 2x nao duplica planned.
- [ ] Combined stack ROI: 3 entries R$215 + Day 2 R$5000 = ROI 675% (agregado), ROI total identico (expandido).
- [ ] **Tournaments detectados como flight-candidate aparecem normalmente em reports/dashboard ANTES de qualquer confirmacao** (D10 — sem filter automatico).

### Edge cases
- [ ] Serie deletada → tournaments ficam orfanos (`series_id=null`), sem cascade.
- [ ] Tournament Day 2 sem Day 1 (late-reg direto) → permitido, sem auto-link.
- [ ] Naming variations: "Day 1A", "1A", "Phase 1", "Stage 1", "Flight 3" → todas disparam prompt.
- [ ] Falsa deteccao: "Day 1 of the Year Freeroll" → modal aparece, founder marca "nao e flight" → no-op no backend (entry ja esta normal).
- [ ] Multi-bag combined: 3 Day 1s pagos, 1 Day 2 jogado → P&L = (entries sum) vs prize.
- [ ] Series com Day 1s em datas diferentes (5 Day 1s ao longo da semana → 1 Day 2 domingo) → agrega corretamente.
- [ ] Timezone: founder em BRT, rede em UTC. Datetime UTC armazenado, render em BRT.
- [ ] Edit datetime do Day 2 quando ja `completed` → side-effect planned update silencioso.
- [ ] Upload duplicado (mesmo CSV 2x): tournaments duplicados detectados (skip) ou re-inseridos com modal abrindo de novo (founder cancela ou confirma).
- [ ] **Founder fecha modal sem confirmar → entries permanecem normais, modal NAO reabre em outra sessao.**
- [ ] `day2DateTime` no passado em PATCH → permitido (correcao historica).
- [ ] **Migracao de dados: rodar 2x → idempotente, sem duplicar series.**
- [ ] **Migracao com tournament `isFlight=true` orfao (sem `flightParentId`) → cria serie individual `totalDay1s=1`.**

### Regressoes (zero-impact)
- [ ] User sem nenhuma serie nunca ve modal, badge, ou toggle visivel (toggle existe mas inerte).
- [ ] Reports com `expandFlightSeries=true` produz output identico ao codigo pre-Flight-1 quando nenhum tournament tem `series_id`.
- [ ] **Wizard de torneio manual REFATORADO continua permitindo criar tournament single (sem opcao series) — comportamento identico ao usuario que nunca usa flights.**
- [ ] Upload CSV de torneios sem keywords flight: zero overhead, zero modal, response shape preserva backwards-compat (`pendingFlightConfirmations: []` adicionado mas nao quebra clientes antigos).
- [ ] **Apos DROP COLUMN final, queries em `tournaments` sem mencao aos 4 campos legados continuam funcionando.**

---

## 11. Riscos

| Risco | Probabilidade | Impacto | Mitigacao |
|-------|---------------|---------|-----------|
| Falsos positivos do regex (D7) inundam o founder com prompts | M | M | Founder marca "nao e flight" 1x, aprende. **Sprint Flight-2 pode adicionar lista negra de keywords.** |
| Auto-link RF-08 erra match (linka Day 2 errado) | M | A | Heuristica conservadora (mesmo `baseName` exato + mesmo site + janela 1-7d). Tests cobrindo casos borderline. Founder pode desfazer via edit serie. |
| Schema mudanca em `tournaments` (FK + `bagged_at`) quebra migrations existentes | B | A | Zero-downtime: nova coluna nullable + default. Test em ambiente staging antes de db:push prod. |
| Reports dual-mode (agregar vs expandir) duplicam codigo de calculo | A | M | Implementar com flag-driven function (parametro `expandFlightSeries`) ao inves de copiar logica. Tests cobrindo ambos modos. |
| Modal `FlightConfirmationDialog` demais clicks pra confirmar 17 Day 1s do Sunday Million Phased | M | B | Dialog tem botao "Aplicar a todos" (pra mesmo `baseName`) — confirma tudo de uma vez. **Defer pra polish:** se o feedback inicial mostrar fricao, implementar em sprint subsequente. |
| Tests de `calculateSessionStats` (RF-15) tem matriz combinatoria grande | A | M | Test-writer prioriza casos: (single, agregado), (single, expandido), (combined 2 entries, agregado), (combined 2 entries, expandido), (combined 3+ entries com Day 2 perdido), (combined com moedas mistas). |
| **Refator do wizard atual (RF-17) quebra fluxo do founder** | **A** | **A** | **Test-writer escreve nova UX antes do refator (TDD). Reviewer faz pass dedicado em wizard tests. Founder valida UX manualmente antes do DROP COLUMN final. Migration final so roda apos sign-off explicito.** |
| **Migracao de dados (RF-17) cria series duplicadas ou perde linkagem** | **M** | **A** | **Script idempotente + dry-run obrigatorio antes de prod. Test integration com fixture diversa. Founder revisa output do dry-run.** |
| **DROP COLUMN final causa perda irreversivel se tests falharem** | **B** | **A** | **DROP COLUMN em migration separada que NAO roda em `npm run db:push` automatico. Founder invoca manualmente apos sprint verde + sign-off. Backup de DB antes.** |
| Performance: queries de tournaments com JOIN em `tournament_series` adicionam latencia | B | B | Index em `(userId, day2Status)` + lazy fetch de series no detail. Benchmark se preocupar. |

> **Risco anterior REMOVIDO:** "Founder esquece de confirmar pending durante semanas → tournaments ficam fora dos reports" — D10 simplificou (entries aparecem normais, sem estado pending).
> **Risco anterior REMOVIDO:** "Convivencia com flags ADR-031 confunde dev futuro" — RF-17 elimina a convivencia.

---

## 12. Metricas de Sucesso (post-release, 30 dias)

| Metrica | Alvo | Como medir |
|---------|------|------------|
| Series criadas (auto + manual) | >= 10 (founder solo) | `count(*) FROM tournament_series WHERE created_at > release_date` |
| Auto-link CSV taxa de acerto | >= 80% (sem necessidade de correcao manual) | `count(series_id != null AND created_via='auto') / count(series totais)` |
| Reports default mode (agregado) usado por % das visitas | >= 90% | Track `expandFlightSeries=true` requests |
| Bug rate post-release primeira semana | <= 2 issues P1 | Bug reports + console.errors |
| Founder satisfaction (qualitativo) | "salvou meu workflow" | Founder feedback direto |
| **Migracao de dados sem perda de informacao** | **100% das rows com `isFlight=true` linkadas a alguma serie** | **Diff pre/post migration** |
| **Wizard refatorado sem regressao funcional** | **0 tests existentes do wizard quebrados (apos adaptacao)** | **CI green pos-RF-17** |

> **Metrica anterior REMOVIDA:** "Tournaments com `pending_flight_confirmation=true` por > 7 dias <= 5" — coluna nao existe mais (D10).

---

## 13. Fora de Escopo (explicito)

Para evitar scope creep e marcar limites pro implementer:

- Day 3, Day 4, Day 5+ (WCOOP Main, GG WSOP Main → Day 3) → **Sprint Flight-2**.
- Best-stack mode (GG WSOP usa apenas o stack mais alto) → **Sprint Flight-2**.
- Conflict detection / overlap alerts entre torneios (multi-tabling pro nao quer alertas).
- Forfeit / walkaway flow ("baggou e nao joga") — sem tratamento especial.
- Shootout multi-day (estrutura diferente, nao e flight).
- Notificacao push lembrando do Day 2 (defer pra sistema generico de alertas).
- Coach AI tool nova `analyze_phased_performance` → defer.
- Stripe gating — feature liberada pra todos os tiers pagos no MVP.
- **Estado persistente "pending flight confirmation" no DB** — descartado (D10).
- **Banner global no header** — descartado (D10).
- **Filtro automatico de reports/dashboard de tournaments nao-confirmados** — descartado (D10).
- **Endpoint `GET /api/upload/pending-flight-confirmations`** — descartado (D10).
- **Endpoint batch `POST /api/tournament-series/:id/link-tournaments`** — descartado (decisao founder, usar PATCH normal).
- **Cap de "series pendentes" no DB** — descartado (D11).
- **Persistencia de estado intermediario do modal em localStorage** — descartado (D10 + RF-09).
- Suporte multi-network em uma serie (Day 1s na PokerStars + GG simultaneamente — caso impossivel real).
- Keyword detection em PT-BR ("Dia 1A") — redes operam em ingles.
- API publica `/api/tournament-series` exposta a integracoes externas (so consumo interno por enquanto).
- UI mobile-first dedicada (responsive OK, mas otimizacao mobile defer).

---

## 14. Aprovacao

> **Decisoes finais aplicadas em 2026-05-02.** Founder revisou bloco de perguntas original e respondeu:
>
> 1. **D8 / RF-17 — Flags ADR-031 deprecadas e removidas NESTA SPRINT.** Single source of truth = `tournament_series`. Migration de dados + refator wizard + DROP COLUMN final.
> 2. **D10 — Modal upload simplificado drasticamente.** Sem `pending_flight_confirmation` no DB, sem banner global, sem filtro automatico. Modal inline pos-upload, descartavel; cancelar = entries ficam normais.
> 3. **D14 — Sidebar item nomeado "Flight"** (curto), sob FERRAMENTAS, icone Layers, rota `/flight`.
> 4. **RF-13 (back-fill) simplificado** — sem endpoint batch dedicado; usa `PATCH /api/tournaments/:id` em N requests.
> 5. **Caps:** sem cap "series pendentes" (nao existe mais). Cap 50 confirmacoes por batch no modal/endpoint preservado.
>
> **Aprovada para system-architect.**

---

## 15. Proximo Passo Recomendado

```
Use o agente system-architect para criar:
- 2 ADRs novos:
  (a) "Single source of truth = tournament_series" + plano de migracao + remocao das flags ADR-031
  (b) "Stack mode enum: single vs combined (best excluido)"
- Atualizacao em Docs/architecture/data-model.mermaid (tournament_series + FKs + bagged_at + sem 4 campos legados na fase final)
- Diagramas de sequencia:
  (a) upload CSV com flight detection + modal inline + cancelamento
  (b) mark-bagged → planned auto-criado
  (c) reports modo agregar vs expandir
  (d) migration de dados flags → series (script idempotente)
  (e) wizard manual refatorado (criar tournament + linkar serie inline)
- Atualizacao em Docs/architecture/data-model-index.md
- Definicao de numero das migrations (proximo livre apos HEAD da main):
  - Migration A: criar tournament_series + colunas series_id + bagged_at
  - Migration B (manual, pos-sign-off): drop das 4 colunas legadas
- baseado na spec em Docs/specs/sprint-flight-1.md
```
