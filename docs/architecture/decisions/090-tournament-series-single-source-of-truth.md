# ADR-090 — Tournament Series como single source of truth (deprecar flags inline ADR-031)

- Status: Accepted
- Date: 2026-05-02
- Sprint: Flight-1
- Decision owner: system-architect (founder revisa post-pipeline)
- Substitui parcialmente: ADR-031 (modelo ortogonal `type` + `isFlight` + `isLive`) — secao multi-flight

## Contexto

ADR-031 (Sprint 1 Tournament Types) introduziu 4 colunas inline em `tournaments` e `planned_tournaments` para suportar flights:

- `is_flight` (boolean NOT NULL DEFAULT false)
- `flight_day` (varchar nullable, regex `^(Final|Day\s?\d+|\d+[A-Z]?)$`)
- `flight_parent_id` (FK soft self-reference em `tournaments.id`)
- `flight_advanced` (boolean nullable: true=passou, false=eliminado, null=Day Final)

Esses flags resolveram **rotulagem individual** mas nao **agrupamento**:

1. **Sem agregacao P&L** — N entries pagas do mesmo Sunday Million Phased ficam como N tournaments isolados; impossivel reportar "combined-stack: 3 buy-ins / 1 prize".
2. **Day 2 datetime espelhado em N rows** — rede define horario unico, mas com flags inline cada entry teria que ter o mesmo `day2DateTime` repetido.
3. **`stackMode` e propriedade da serie**, nao da entry — modelagem inline forca duplicacao.
4. **`totalDay1s` (ex: 17 pro Sunday Million Phased) e propriedade da serie** — sem coluna.
5. **`day2Status` (pending/completed/cancelled)** sem campo dedicado — `flight_advanced` so cobre "Day 1 passou", nao "Day 2 jogou".
6. **Sem auto-add Day 2 na grade** — marcar `flight_advanced=true` nao dispara nada.
7. **Back-fill manual retroativo** (founder tem ~30 torneios Phased historicos) precisaria popular flags um por um sem entidade-pai pra agrupar.
8. **Reports** continuam tratando cada entry individualmente — combined-stack inflate contagem e dilui ROI medio.

Sprint Flight-1 introduz a entidade `tournament_series` que substitui esse modelo de forma completa. Decisao crucial: **manter os flags como espelho** ou **remove-los completamente**?

## Decisao

**Single source of truth = `tournament_series` desde dia 1.** Os 4 flags legados ADR-031 serao **REMOVIDOS** do schema ate o final do sprint Flight-1. Migracao em 2 fases:

### Fase 1 (RF-01 + RF-17a, migration `0029_add_tournament_series.sql`)
1. Criar tabela `tournament_series` (id, userId, name, network, totalDay1s, day2DateTime, day2Status, stackMode, notes, createdAt, updatedAt).
2. Criar 2 ENUMs Postgres: `series_stack_mode` (`single`/`combined`) e `series_day2_status` (`pending`/`completed`/`cancelled`).
3. Adicionar `series_id` FK nullable (`ON DELETE SET NULL`) em `tournaments` e `planned_tournaments`.
4. Adicionar `bagged_at TIMESTAMP NULL` em `tournaments` (substitui semantica de `flight_advanced=true`).
5. Script de back-fill: para cada `tournament` com `is_flight=true`, agrupar por `flight_parent_id` (ou por nome+site quando parent eh null), criar `tournament_series` row, popular `series_id` em todas as entries do grupo, copiar `flight_advanced=true` para `bagged_at = created_at` (timestamp aproximado, melhor que NULL).
6. Refatorar wizard manual de torneio (frontend) para usar API `/api/tournament-series` em vez de marcar flags inline. Wizard pergunta "este torneio e parte de uma serie?" → sim → cria/linka serie.

### Fase 2 (RF-17b, migration `0030_drop_legacy_flight_flags.sql`)
**MANUAL pos sign-off do founder**, executada apenas apos validar Fase 1 em producao por pelo menos 7 dias:
1. `ALTER TABLE tournaments DROP COLUMN is_flight, flight_day, flight_parent_id, flight_advanced;`
2. `ALTER TABLE planned_tournaments DROP COLUMN is_flight, flight_day, flight_parent_id;`
3. Drop indices parciais relacionados (`idx_tournaments_user_flight_parent`, `idx_tournaments_user_is_flight`).
4. Atualizar `shared/schema.ts` removendo as colunas dos table objects.
5. Atualizar invariantes em comentarios do data-model.mermaid.

## Razoes

### Por que NAO manter flags como espelho

- **Lessons-learned #10 (DRY de prompts)** — divergencia silenciosa quebrou cache da Anthropic em sprints passados. Mesmo principio: 2 fontes de verdade para "este torneio e flight" geram bugs sutis quando uma e atualizada e outra nao.
- **`flight_advanced` boolean nao escala** — substituir por `bagged_at TIMESTAMP NULL` ja agrega informacao temporal (quando bagged) que `flight_advanced=true` nao tem.
- **Wizard refatorado fica mais simples** — 1 API call para criar serie + linkar entry, em vez de marcar 4 flags coordenados.
- **Schema fica clean** — `tournaments` ja tem 30+ colunas; remover 4 flags decremento de 13% na largura da tabela (relevante para queries com SELECT *).

### Por que migration em 2 fases (criar + drop separados)

- **Janela de seguranca** — Fase 1 deixa flags ainda presentes (porem write-only no codigo refatorado), permitindo rollback rapido se bug aparecer em producao.
- **Validar back-fill** — 7 dias de uso permite founder verificar que dados historicos foram migrados corretamente antes de drop irreversivel.
- **Migration MANUAL para Fase 2** — `DROP COLUMN` em Postgres nao tem rollback simples; explicitar que founder precisa rodar protege contra acidentes em CI/CD automatizado.

### Compatibilidade backward

- Tournaments single-flight existentes (`is_flight=false`) continuam intactos — `series_id` defaulta NULL.
- Queries default em `getTournamentsByUserId`, dashboard, reports nao precisam mudar (flags removidos eram raramente lidos).
- Reports especificos que filtravam por `is_flight=true` (ex: `/api/analytics/by-modifier`) precisam migrar para `WHERE series_id IS NOT NULL` — refactor pequeno, ~3 endpoints afetados.

## Alternativas Consideradas

### 1. Manter flags como espelho da `tournament_series`
- **Pros:** Zero refactor de codigo legado que le `is_flight`. Rollback trivial.
- **Cons (REJEITADO):** Duplicacao de estado. Bug potencial: serie atualizada mas flag inline nao espelha. Quebra DRY (lesson #10). Schema fica mais largo permanentemente.

### 2. Migrar dados, manter flags por 60 dias com deprecation warning
- **Pros:** Maior janela de seguranca para migrar codigo cliente.
- **Cons (REJEITADO):** Founder priorizou clean schema explicitamente (Spec D8). Sem clientes externos consumindo API legacy. Janela de 7 dias pos-Fase 1 ja oferece seguranca operacional suficiente.

### 3. Drop colunas em uma migration unica (sem fase intermediaria)
- **Pros:** Simplifica deploy.
- **Cons (REJEITADO):** Sem janela de validacao em producao. Bug de back-fill descoberto post-deploy = perda de dados historicos. Migration manual para Fase 2 e seguro de baixo custo.

## Consequencias

### Positivas
- Schema clean (4 colunas a menos em `tournaments`, 3 a menos em `planned_tournaments`).
- Single source of truth = `tournament_series` (sem risco de divergencia).
- Auto-add Day 2 (RF-04) fica trivial: criar `planned_tournament` com `series_id` setado.
- Back-fill manual (RF-13) usa API de serie existente, sem codigo dedicado.
- Reports e P&L combined-stack ficam expressaveis em SQL via JOIN em `series_id`.
- Wizard manual mais simples: 1 API call cria serie + linka entry.

### Negativas
- **Refactor obrigatorio do wizard manual** (frontend), pois flags inline somem. Custo: ~1 dia dev (RF-17a).
- **Endpoints `/api/analytics/by-modifier`** (e similares que filtram por `is_flight=true`) precisam migrar query para `WHERE series_id IS NOT NULL`. ~3 endpoints afetados.
- **Drizzle schema declaration** (`shared/schema.ts`) precisa edicao em 2 momentos (Fase 1 + Fase 2).
- **Migration de back-fill** e operacao sensivel — heuristica de agrupamento (por `flight_parent_id` quando setado, por `name+site` quando null) pode errar em casos edge raros. Founder deve validar amostra de 5-10 series migradas antes de Fase 2.

### Neutras
- Tests existentes que assertam `tournament.isFlight === true` precisam ser portados para `tournament.seriesId !== null` — alteracao mecanica.
- Coach AI tools que leem `tournament.is_flight` precisam ser atualizadas — atualmente nenhuma tool faz isso.
- Documentacao `Docs/architecture/data-model.mermaid` ganha entidade nova + flags marcados como DEPRECATED (Fase 1) e depois removidos (Fase 2).

## Confianca

**Alta.** Decisao alinhada com:
- Lessons-learned #10 (DRY).
- Spec founder D8 explicito ("evitar divergencia silenciosa").
- Padrao Grindfy de FK opcional + entidade dedicada (mesmo padrao de `wallet_transfers`, `coach_actions`).
- Migracao em 2 fases minimiza risco operacional.

Riscos residuais:
- Heuristica de back-fill por `name+site` pode agrupar erradamente torneios que casualmente compartilham nome — mitigacao via dry-run + validacao manual antes de commit.
- Rollback de Fase 2 (re-adicionar colunas + popular) e custoso — por isso Fase 2 e MANUAL apos sign-off.

## Referencias

- ADR-031 — Tournament Types Orthogonal Model (introduziu flags legados)
- ADR-077 — Coach actions migration (mesmo padrao de migration cuidadosa)
- Sprint Flight-1 spec — `Docs/specs/sprint-flight-1.md` (RF-01, RF-17)
- Lessons-learned #10 — DRY de prompts
- Migrations: `0029_add_tournament_series.sql`, `0030_drop_legacy_flight_flags.sql`
