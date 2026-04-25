# ADR-032: Deprecation gradual da coluna `tournaments.category` em 5 sprints

## Status
Aceito

## Data
2026-04-25

## Contexto

ADR-031 estabelece o modelo ortogonal `type` (mutex de 4) + `isFlight` + `isLive`. Como consequencia, **a coluna `category` torna-se redundante** com `type`:

- `category` foi introduzida no schema inicial do projeto antes da SSoT existir. Sem enum, qualquer string passava (`"vanilla"`, `"Vanilla"`, `"PKO"`, etc.).
- Frontend ora enviava `type`, ora `category`, criando inconsistencias (bug raiz P0-1 da spec).
- Analytics atuais (`GET /api/analytics/by-category`, queries em `server/routes/analytics.ts`) usam `groupBy(tournaments.category)`. Mudar para `groupBy(tournaments.type)` exige auditoria das queries existentes.

A pergunta central: **como remover a coluna `category` sem quebrar producao?**

Opcao agressiva — drop imediato no Sprint 1 — quebra todas as queries analiticas existentes simultaneamente. Risco alto de regressoes em dashboards. Opcao oposta — manter `category` para sempre — perpetua a redundancia e o risco de divergencia entre `type` e `category`.

A escolha e **deprecation gradual em 5 sprints**, com espelhamento automatico no storage layer (Sprint 1) ate o drop final (Sprint 5).

### Restricoes

- **Backwards-compat operacional:** users nao podem perder acesso a dashboards ou library durante a transicao.
- **Risco de divergencia:** se `type` e `category` divergirem por bug, a fonte de verdade tem que ser determinista. ADR-031 estabelece `type` como autoritativa.
- **Auditoria das queries existentes:** ha ~12 queries no projeto que referenciam `tournaments.category`. Precisam ser migradas em ordem antes do drop.
- **Migration via `db:push`** (Drizzle Kit) e o padrao do projeto. Drop de coluna exige confirmacao destrutiva ou migration manual. Sprint 5 fara via SQL explicito.

## Opcoes Consideradas

### Opcao A: Deprecation gradual em 5 sprints (ESCOLHIDA)

| Sprint | Acao | Estado de `category` |
|---|---|---|
| 1 | Storage layer espelha `category = type` em todos os INSERT/UPDATE de `tournaments` e `planned_tournaments`. SSoT cria enum estrito em `type`. Frontend so envia `type`. | Coluna existe, valor sempre sincronizado com `type`. |
| 2 | Migrar todas as queries analiticas de `groupBy(category)` para `groupBy(type)`. Tournament Library agrega por `type`. Dashboard cards usam `type`. | Coluna existe, espelhada, mas codigo novo nao le. |
| 3 | Library agrega Flights por `type + isFlight`. Coach Tournament Selector adapta-se. UI manual em TournamentLibraryNew usa `type`. | Coluna existe, espelhada, codigo novo continua sem ler. |
| 4 | CSV parser migrado, script de migracao `migrate-tournament-types.ts` re-detecta tipos. Endpoint `/api/analytics/by-modifier` usa `type` + `is_flight` + `is_live`. Audit completo: `grep -r "tournaments.category" server/` deve retornar APENAS o helper de espelhamento. | Coluna existe, espelhada, ZERO leituras fora do helper. |
| 5 | Migration final: `ALTER TABLE tournaments DROP COLUMN category`. Mesmo para `planned_tournaments`. Helper de espelhamento removido. | **Coluna deletada.** Schema limpo. |

- **Pros:**
  - **Zero downtime.** Cada sprint testa a transicao incrementalmente. Se Sprint 2 quebra alguma query, reverter so a parte da query — `category` ainda esta no banco como fallback ate Sprint 5.
  - **Risco de divergencia eliminado.** Storage espelha em writes. Se algum write antigo escapar do helper, a divergencia e detectavel via `WHERE category != type` em SQL.
  - **Audit incremental.** Cada sprint reduz o numero de queries que leem `category`. Sprint 4 termina com 0 queries fora do helper.
  - **Compatibilidade com codigo legado.** Bibliotecas/scripts antigos que ainda usem `category` continuam funcionando ate Sprint 5.
  - **Decisao reversivel.** Se em Sprint 4 descobrirmos uma query de telemetria externa que usa `category`, adiamos o drop e migramos primeiro.

- **Contras:**
  - **Periodo de transicao ~4 semanas** (~5 sprints × ~4 dias cada). Aceito — dor curta vs risco de quebrar producao.
  - **Storage layer carrega helper de espelhamento** que precisa ser auditado em PR de Sprint 5 para garantir que nao e removido antes do drop.
  - **Schema final tem 1 coluna a menos** — schema cleaner so apos 5 sprints.

### Opcao B: Drop imediato no Sprint 1 (deletar `category` junto com a SSoT)

- **Pros:**
  - Schema limpo desde o primeiro dia.
  - Sem helper de espelhamento.

- **Contras:**
  - **Quebra TODAS as queries analiticas no mesmo PR.** Sprint 1 ja tem ~80% do escopo (bug fix + SSoT + schema delta + 18 colunas novas). Adicionar drop + migracao de 12 queries no mesmo sprint = PR gigante, dificil de revisar, alto risco de regressao.
  - **Sem fallback.** Se algum analytics quebrar em prod, nao da pra rodar `WHERE category = 'PKO'` para mitigar — coluna nao existe mais.
  - **Frontend de dashboard pode estar com cache de queries antigas.** Drop imediato forca invalidacao + redeploy sincronos.
  - **Rejeitada por risco operacional.**

### Opcao C: Manter `category` para sempre como sinonimia

- **Pros:**
  - Nada quebra.
  - Codigo legado continua funcionando.

- **Contras:**
  - **Divida tecnica perpetua.** Toda nova query analitica fica com duvida: usar `type` ou `category`? Decisao adiada eternamente.
  - **Risco de divergencia se algum INSERT escapar do helper.** Sem drop, nao ha garantia de que `category` esteja sincronizada — apenas convencao.
  - **Schema sempre engordado.** 2 colunas com mesma informacao. Insert paga 2× o storage cost.
  - **Documentacao confusa para devs novos.** "Use `type`. Mas `category` tambem existe. Mas voce nao deve usar `category`. Mas ela ainda esta no schema."
  - **Rejeitada por acumular debito.**

### Opcao D: Renomear `category` para `type` (DROP + RENAME na mesma migration)

- **Pros:**
  - Sem novo nome no schema.

- **Contras:**
  - **Drizzle Kit `push` nao suporta rename detection bem.** Renomear coluna gera prompt destrutivo "drop column `category`, add column `type`" — perde dados pre-existentes a menos que use SQL manual.
  - **Mesma classe de problema da Opcao B:** quebra queries que usam `category` sem ramp-up.
  - **Nao endereca a SSoT.** O problema raiz nao e o nome; e a falta de enum estrito. Renomear sem aplicar enum nao resolve.
  - **Rejeitada — solucao cosmetica que ignora o problema real.**

## Decisao

**Adotar Opcao A: deprecation gradual de `category` em 5 sprints, com espelhamento automatico no storage layer (Sprint 1) ate o drop final no Sprint 5.**

### Detalhes-chave do design

1. **Sprint 1 — Espelhamento automatico (storage layer).**
   - Helper `normalizeTournamentTypePayload(input)` em `server/storage/tournaments.ts`:
     ```ts
     export function normalizeTournamentTypePayload<T extends { type?: string; category?: string }>(input: T): T & { category: string } {
       if (input.type && !input.category) {
         return { ...input, category: input.type };
       }
       if (input.type && input.category && input.type !== input.category) {
         console.warn(`[storage] type-category divergence: type=${input.type} category=${input.category}; respecting type`);
         return { ...input, category: input.type };
       }
       return input as T & { category: string };
     }
     ```
   - Equivalente em `server/storage/plannedTournaments.ts`.
   - Aplicado em **todos os writes** (`createTournament`, `updateTournament`, `bulkInsertTournaments`, idem para planned).
   - Frontend nunca mais envia `category`.

2. **Sprint 2 — Migrar queries de leitura.**
   - `grep -r "tournaments.category" server/routes/analytics.ts server/routes/library.ts server/storage/` lista os pontos.
   - Substituir `groupBy(tournaments.category)` por `groupBy(tournaments.type)`.
   - Substituir `WHERE tournaments.category = X` por `WHERE tournaments.type = X`.
   - Atualizar Drizzle types se houver `category: TournamentCategory` em interfaces — passar para `type: TournamentPrimaryType`.
   - Tests de integracao validam que respostas de analytics tem mesmo shape.

3. **Sprint 3 — Library + UI.**
   - `server/storage/tournamentLibrary.ts` agrega por `(type, isFlight)` — Flights do mesmo evento agrupados.
   - `client/src/pages/TournamentLibraryNew.tsx` recebe `type` em vez de `category` no payload.

4. **Sprint 4 — Audit final.**
   - `grep -r "tournaments.category\|t.category\|.category" server/ client/ shared/ --include="*.ts" --include="*.tsx" | grep -v "_test\|fixtures\|migrations"` deve retornar APENAS `normalizeTournamentTypePayload` (helper) e logs.
   - Coach Tournament Selector adapta-se (RF-08).
   - Endpoint novo `/api/analytics/by-modifier` usa `type` + `is_flight` + `is_live`.
   - CSV parser usa `detectTournamentTypeV2` (4 valores) + `detectIsFlight` + `detectIsLive`.

5. **Sprint 5 — Drop final.**
   - Migration SQL: `ALTER TABLE tournaments DROP COLUMN category;` + `ALTER TABLE planned_tournaments DROP COLUMN category;`.
   - Remover helper `normalizeTournamentTypePayload` (storage layer ja nao precisa espelhar).
   - Schema Drizzle: deletar coluna `category` de `shared/schema.ts`.
   - `db:push` aplica drop. **Backup do DB obrigatorio antes** (politica de migrations destrutivas).
   - Tests existentes continuam green; fixtures historicas com campo `category` legado continuam funcionando enquanto sao apenas dados de fixture (nao escritos no banco).

6. **Detector de divergencia (Sprint 1-4).**
   - SQL diagnostico em qualquer momento: `SELECT COUNT(*) FROM tournaments WHERE type IS NOT NULL AND category IS NOT NULL AND type != category;`
   - Se >0, investigar qual write escapou do helper.

### QUESTAO ABERTA: Frontend cacheado em dashboards

Usuarios com browsers abertos durante o deploy de Sprint 5 podem ter cache de TanStack Query com `category` no payload. **Decisao:** invalidacao agressiva no deploy de Sprint 5 — bumping de versao em `queryKey` (ex: `['tournaments', 'v2']`) forca refetch. Documentar no PR de Sprint 5.

### QUESTAO ABERTA: Tournament templates ainda usam `category`

A tabela `tournament_templates` (separada — ver ADR-009) tem coluna `category` propria. **Decisao:** fora de escopo deste ADR. Templates seguem mesmo destino em sprint posterior (Sprint 6+, sem urgencia). Razao: templates sao dados derivados (agrupamento de torneios), e o impacto de manter `category` la e menor — menos queries dependem.

## Consequencias

### Positivas
- **Zero downtime durante transicao.** Cada sprint e seguro de reverter isoladamente.
- **Risco de divergencia mitigado pelo helper de espelhamento.** Detector SQL roda em qualquer momento (Sprint 1-4).
- **Schema final limpo no Sprint 5** — apenas `type` autoritativo.
- **PRs menores e revisaveis** — drop nao se mistura com SSoT/schema delta no Sprint 1.
- **Bibliotecas externas (scripts admin, integracoes futuras) tem 4 sprints para migrar.**
- **Auditoria explicita no Sprint 4** — `grep` confirma 0 leituras de `category` antes do drop.

### Negativas
- **Storage layer carrega helper de espelhamento por ~4 semanas.** Custo de manutencao trivial; helper e simples (~10 linhas).
- **2 colunas redundantes no schema durante a transicao.** Storage cost marginal.
- **Risco de algum query analitica usar `category` sem ser detectada pelo `grep` (ex: SQL inline em string)** — mitigado por audit explicito no Sprint 4 + tests de integracao validando shape de respostas analiticas.
- **Drop final exige backup do DB e janela de manutencao curta.** Politica padrao do projeto.

### Neutras
- **`tournament_templates.category` permanece** no schema apos Sprint 5. Tratado em sprint futuro.
- **Bibliotecas legadas (scripts admin, exportacoes) precisam de audit antes do drop.** Fazem parte do checklist de Sprint 4.

## Confianca

**Alta.** Padrao classico de deprecation em sistemas que nao podem ter downtime (ex: rename de coluna em PostgreSQL via shadow column + migration data + drop). Risco principal — alguma query usar `category` sem ser detectada — mitigado por audit `grep` no Sprint 4 + invariant SQL `WHERE category != type`. Reversibilidade: ate Sprint 4, drop pode ser adiado sem prejuizo. Apos Sprint 5, restore exige backup do DB (politica padrao).

## Referencias

- Spec: `Docs/specs/tournament-types-extension-and-manual-add-fix.md` (revisao 2, 2026-04-25) — D2, RF-02 item 4, secao Phasing.
- ADR-031: modelo ortogonal type+modificadores (companion deste ADR — decide o destino de `category`).
- Padrao paralelo: ADR-014 (modelagem add-on/re-entry com colunas booleanas independentes — mesma filosofia).
- Padrao paralelo: ADR-009 (`tournament_library` separada — exemplo de schema delta gradual).
- CLAUDE.md secao 10.2: historico de modularizacao gradual (`routes.ts` 6K linhas -> 17 arquivos) sem downtime.
