# ADR-031: Modelo ortogonal de tipos de torneio (type primario + modificadores booleanos)

## Status
Aceito

## Data
2026-04-25

## Contexto

A spec `Docs/specs/tournament-types-extension-and-manual-add-fix.md` (revisao 2) ataca tres problemas correlatos no Grindfy:

1. **Bug P0 — "Erro ao adicionar torneio":** o frontend submete payload com shape divergente do `insertPlannedTournamentSchema`, e o backend devolve toast generico "Não foi possível adicionar". Causa raiz: o `EditDialog` nao envia `category` em alguns paths e o backend nao aplica enum estrito em `type`/`category`. Drizzle preenche `category: "Vanilla"` (default) e o torneio "some" dos analytics agrupados por `category`.
2. **Divida estrutural P0 — Tipos hardcoded:** `["PKO", "Vanilla", "Mystery"]` aparece em 8+ arquivos (ver tabela em RF-02 da spec). Sem fonte unica de verdade. Backend nao valida enum.
3. **Feature P0 — Suportar Satelite, Flight (multi-dia) e Live (presencial):** hoje sao registrados como "Vanilla" perdendo informacao economica essencial. Founder confirmou em 2026-04-25 que precisa cobrir 16 combinacoes reais (PKO+Flight+Live = Main Event do BSOP, Satellite+Live = satelite ao vivo para WSOP, etc.).

A spec original (revisao 1, 2026-04-24) propunha enum primario com 5 valores: `Vanilla | PKO | Mystery | Satellite | Flight`. Founder rejeitou em 2026-04-25 porque:

- **Flight nao e estrutura de prize** — e formato temporal (multi-dia). Combinavel com qualquer tipo (PKO+Flight, Vanilla+Flight, Satellite+Flight).
- **Live nao e estrutura de prize** — e modalidade fisica. Combinavel com qualquer tipo.
- **Limitar a 5 valores no enum** forca usuario a escolher "PKO ou Flight" quando o torneio e PKO E Flight.

A **pergunta central:** como modelar tipo + modificadores de tal forma que (a) o tipo de prize seja mutex (nao da pra ser PKO e Mystery ao mesmo tempo), (b) os modificadores sejam livremente combinaveis, (c) o schema seja indexavel para queries de analytics, (d) refinements Zod possam validar coerencia cross-field?

### Restricoes

- **Postgres + Drizzle:** as tabelas `tournaments` e `planned_tournaments` ja tem ~30 colunas. Nao e factivel adicionar uma coluna por combinacao (4×2×2 = 16 booleanos derivados — over-engineering).
- **Indexabilidade:** queries de analytics (`/api/analytics/by-modifier`, `getSatelliteROI`) precisam de WHERE + GROUP BY rapidos em type, isFlight e isLive isoladamente.
- **Backwards-compat:** torneios pre-existentes (sem campos novos) precisam continuar funcionando sem alteracao.
- **Coluna `category` legada:** queries de analytics atuais agrupam por `tournaments.category`. Nao podemos quebrar essa coluna no Sprint 1 — drop programado para Sprint 5 (ver ADR-032).
- **Refinements Zod cross-field:** quando `type === 'Satellite'`, certos campos `satellite*` sao obrigatorios. Quando `isFlight === false`, todos os campos `flight*` devem ser null. Validacao precisa cobrir 16 combinacoes coerentemente.

## Opcoes Consideradas

### Opcao A: Modelo ortogonal — `type` (enum mutex de 4) + `isFlight` boolean + `isLive` boolean (ESCOLHIDA)

```ts
// shared/tournamentTypes.ts
export const TOURNAMENT_PRIMARY_TYPES = ['Vanilla', 'PKO', 'Mystery', 'Satellite'] as const;
export const TournamentPrimaryTypeSchema = z.enum(TOURNAMENT_PRIMARY_TYPES);

// Schema (Drizzle)
type: varchar('type').notNull(),               // Vanilla | PKO | Mystery | Satellite
isFlight: boolean('is_flight').default(false).notNull(),
isLive: boolean('is_live').default(false).notNull(),
```

Validacao via `superRefine` que cobre 16 combinacoes (4 types × 2 isFlight × 2 isLive).

- **Pros:**
  - **Cobre 100% dos cenarios reais** confirmados pelo founder. PKO+Flight+Live, Satellite+Live, Vanilla puro, Mystery puro — todos modelaveis.
  - **3 colunas indexaveis isoladamente.** Index parcial em `(user_id, is_live)` WHERE `is_live = true` da query rapida para "Live vs Online" analytics. Mesmo padrao para `is_flight`.
  - **Mutex automatico do `type`:** enum no nivel da coluna garante que o jogador escolhe UMA estrutura de prize. Nao da pra um torneio ser PKO E Mystery ao mesmo tempo.
  - **Modificadores ortogonais:** `isFlight` e `isLive` sao booleanos independentes. Adicionar um quarto modificador no futuro (ex: `isPrivate` para freerolls fechados) e trivial — nova coluna boolean.
  - **Refinements Zod claros:** uma `superRefine` por dimensao (type, isFlight, isLive). Nenhum cross-product de regras. Codigo enxuto.
  - **Storage layer mantem `category` espelhada de `type`** durante Sprint 1-4 (ADR-032 detalha deprecation).
  - **UI wizard se mapeia direto:** Step 1 escolhe `type` (4 botoes radio), Step 2 toggla os 2 modificadores (2 checkboxes). Step 3 mostra apenas as secoes pertinentes (Satellite/Flight/Live).
  - **Analytics agregaveis em qualquer dimensao:** `GROUP BY type`, `GROUP BY is_live`, `GROUP BY (type, is_flight, is_live)` — tudo natural.
  - **Helper `getTypeBadges(t)` retorna 1-3 badges:** type sempre + Flight (se ativo) + Live (se ativo). UI consistente.

- **Contras:**
  - **3 colunas adicionadas** (uma por dimensao). Aceito — sem isso, a indexabilidade desmorona.
  - **Refinements Zod precisam cobrir 16 combinacoes** + 4 reward types do Satelite. Test matrix grande mas determinista (testEachCombination helper).
  - **Storage espelha `type → category`** ate Sprint 5 — sinonimia transitoria. Documentado em ADR-032.

### Opcao B: Array de tags (`varchar[]` ou jsonb) com todos os tipos e modificadores

```ts
type: jsonb('type'),  // ['PKO', 'Flight', 'Live']
```

- **Pros:**
  - Estende-se livremente — basta adicionar uma string no array.
  - Schema com 1 coluna so.

- **Contras:**
  - **Perde mutex de prize structure.** Nada impede `['PKO', 'Mystery']` no array — semantica quebra. Refinement Zod precisaria validar exatamente 1 tipo primario, transformando em logica de validacao acoplada ao formato.
  - **Indexabilidade ruim.** GIN em jsonb e mais lento que B-tree em varchar/boolean. Queries analiticas `WHERE type = 'PKO'` viram `WHERE type @> '["PKO"]'` — codigo verboso e indices maiores.
  - **GROUP BY complicado:** agregacoes precisam unnest em CTE, queries quadruplicam de tamanho. `GROUP BY type` puro deixa de funcionar.
  - **Filtro do scorer (Tournament Selector) dobra de complexidade:** "Vanilla puro" vira `array @> ['Vanilla'] AND NOT array @> ['Flight'] AND NOT array @> ['Live']` em vez de tres condicoes simples.
  - **Frontend perde tipagem forte.** Em vez de `type: TournamentPrimaryType`, vira `type: string[]` — TypeScript nao distingue mais "PKO+Flight" de "Mystery+Vanilla" (impossivel mas o tipo nao impede).
  - **Rejeitada por perda de mutex e indexabilidade.**

### Opcao C: Tabela `tournament_modifiers` separada (relacionamento 1-N)

```sql
CREATE TABLE tournament_modifiers (
  id varchar PK,
  tournament_id FK,
  modifier_type varchar  -- 'flight' | 'live' | 'rebuy_allowed' | ...
);
```

- **Pros:**
  - Maxima extensibilidade — novos modificadores sem `ALTER TABLE`.
  - Permite adicionar metadata por modificador (ex: data do flight day em uma row separada).

- **Contras:**
  - **Over-engineering para 2 modificadores.** Apenas `isFlight` e `isLive` no escopo. Adicionar uma tabela inteira para tornar 2 booleanos extensiveis e ROI ruim.
  - **JOIN obrigatorio em toda query analitica.** "Quantos torneios PKO Live ultimo mes?" vira 3-way JOIN (tournaments × modifiers × users). Comparado a `WHERE type='PKO' AND is_live=true` em uma so tabela, e drasticamente mais lento.
  - **Storage espelha mal.** `category = type` ja exige logica de espelhamento (ADR-032). Adicionar uma tabela de modificadores forca espelhamento triplo.
  - **Frontend precisa fetch separado** ou JOIN do lado do storage. Complica a serializacao.
  - **Nao agrega valor real para o que esta no escopo.** Se eventualmente precisarmos de 10+ modificadores com metadata, podemos refatorar entao.
  - **Rejeitada por over-engineering.**

### Opcao D: Coluna unica JSON `type_full` com estrutura aninhada

```json
{
  "primary": "PKO",
  "modifiers": ["flight", "live"]
}
```

- **Pros:**
  - Schema com 1 coluna so.
  - Estrutura semantica clara.

- **Contras:**
  - **Perde indexabilidade total.** `WHERE type_full->>'primary' = 'PKO'` exige expression index ou GIN — funcional mas degrada vs B-tree em varchar.
  - **Refinements Zod precisam parsear JSON antes de validar** — o schema ja vira "campo com regras internas".
  - **Frontend perde tipagem em queries diretas:** `tournaments.type` ja nao e `'PKO'`, e `string` que parseado vira `{primary, modifiers[]}`. Nao serializa direto para boolean checkboxes.
  - **GROUP BY agregations exigem expressions complexas.** `GROUP BY type_full->>'primary', type_full->'modifiers'` — verboso e dificil de revisar.
  - **Sem ganho real sobre Opcao A.** Os mesmos 3 valores (type + 2 booleanos) ficam dentro de um JSON que precisa ser desempacotado em todo lugar.
  - **Rejeitada por perda de indexabilidade e tipagem.**

## Decisao

**Adotar Opcao A: modelo ortogonal com `type` (enum mutex de 4 valores) + `isFlight` (boolean) + `isLive` (boolean), com refinements Zod cobrindo cross-field e storage espelhando `category = type` ate Sprint 5.**

### Detalhes-chave do design

1. **Enum `type`** definido em `shared/tournamentTypes.ts` (SSoT) e usado em todos os 8 pontos hardcoded (frontend + backend + parser + schema).
2. **Booleanos `isFlight`, `isLive`** adicionados em `tournaments` e `planned_tournaments` com `default: false NOT NULL`. Backwards-compat: torneios pre-existentes ficam com `false`.
3. **Indexes parciais para queries quentes:**
   - `idx_tournaments_user_satellite_target` ON `(user_id, satellite_target_template_id)` partial WHERE `satellite_target_template_id IS NOT NULL`.
   - `idx_tournaments_user_flight_parent` ON `(user_id, flight_parent_id)` partial WHERE `flight_parent_id IS NOT NULL`.
   - `idx_tournaments_user_is_live` ON `(user_id, is_live)` partial WHERE `is_live = true`.
   - `idx_tournaments_user_is_flight` ON `(user_id, is_flight)` partial WHERE `is_flight = true`.
4. **Refinements Zod por dimensao** via `.superRefine((data, ctx) => {...})`:
   - `type === 'Satellite'` exige `satelliteRewardType` + (target template OU target name) + campos coerentes com o reward type.
   - `type !== 'Satellite'` exige todos campos `satellite*` null.
   - `isFlight === true` exige `flightDay` valido (regex `^(Final|Day\s?\d+|\d+[A-Z]?)$`); se Day 1 (`\d+[A-Z]`), exige `flightAdvanced` boolean E `prize=0` E `position=null`. Se Final ou Day 2+, exige `position` + `prize`.
   - `isFlight === false` exige todos campos `flight*` null.
   - `isLive === true` permite todos campos `package*` opcionais. `isLive === false` exige todos null.
   - **Mutual exclusion:** `type === 'Satellite' && satelliteRewardType === 'package' && isLive === true` falha (rewardType package implica satelite online dando pacote como premio; isLive=true nesse contexto seria semanticamente conflitante — se for satelite presencial ganhando pacote, o pacote e do TARGET, nao do satelite).
5. **Storage layer espelha `type → category`** em todos os writes (`server/storage/tournaments.ts` + `server/storage/plannedTournaments.ts`). Helper `normalizeTournamentTypePayload(input)` antes de `db.insert`. Garantia: cliente envia apenas `type`; storage preenche `category` para manter analytics legados funcionais ate Sprint 5 (ver ADR-032).
6. **Helper `getTypeBadges(tournament)`** retorna array de 1-3 badges para UI: type primario sempre + `Flight (Multi-dia)` se `isFlight` + `Live (Presencial)` se `isLive`. Cores fixas SSoT (D3 da spec).
7. **Wizard 4 steps** (RF-06):
   - Step 1: tipo primario (4 radios).
   - Step 2: modificadores (2 checkboxes).
   - Step 3: campos condicionais (Satellite/Flight/Live conforme selecao). Pulado quando type=Vanilla e ambos modifs false.
   - Step 4: campos comuns + (modo `historical=true`) datePlayed/position/prize.
8. **Cor SSoT:** Vanilla=zinc, PKO=violet, Mystery=fuchsia, Satellite=amber. Modificadores: Flight=cyan, Live=emerald.

### QUESTAO ABERTA: Cadeia de satelites (satelite que paga ticket para outro satelite)

Spec marca como "fora de escopo" (linha 1153). Tecnicamente o modelo suporta — `satelliteTargetTemplateId` aponta para outro template que tambem e Satellite. Analytics nao otimizado para essa cadeia. **Decisao:** documentado como edge case viavel sem suporte explicito. Se aparecer em prod (raro), adicionar test de integracao especifico em sprint futuro.

### QUESTAO ABERTA: Re-entry entre Day 1 e validacao de `flightParentId`

Spec confirma que re-entry entre 1A e 1B do mesmo evento e suportado (cada Flight = uma row separada em `tournaments`, com `flightParentId` apontando ao primeiro Day 1). **Decisao:** validacao em storage layer rejeita `flightParentId` que aponte para si mesmo, para um filho ja existente (ciclo), ou para tournament de outro `userId`. Refinement Zod NAO valida (precisa de query DB, fica em storage).

## Consequencias

### Positivas
- **Cobre 16 combinacoes ortogonais** com 3 colunas + refinements coerentes — modelo extensivel sem refactor amplo.
- **Bug raiz "torneio some dos analytics" resolvido** pelo storage espelhar `type → category` automaticamente. Frontend so envia `type`; backend nunca diverge.
- **Indexes parciais garantem performance < 100ms p95** em `getSatelliteROI`, `getFlightAggregateROI`, `/api/analytics/by-modifier`.
- **SSoT em `shared/tournamentTypes.ts`** elimina hardcode em 8 arquivos. `grep` confirma ZERO ocorrencias fora do SSoT, testes e migrations historicas.
- **UI wizard se mapeia naturalmente** ao modelo (4 steps -> 4 dimensoes do schema).
- **Tests sao deterministas:** matriz 4×2×2 = 16 + 4 reward types do Satelite = 20 cenarios principais cobertos por test helper `testEachCombination`.
- **Backwards-compat:** torneios pre-existentes nao quebram (campos novos sao nullable/false default).
- **Caminho aberto para modificador `#4`** (ex: `isPrivate` para freerolls) sem alterar Opcao A — basta nova coluna boolean.

### Negativas
- **Refinements Zod cross-field crescem em complexidade.** 5 superRefines (1 por dimensao + 1 mutual exclusion). Aceito — codigo agrupado em uma so funcao `tournamentRefine` em `shared/schema.ts`.
- **Sinonimia `type ≡ category` ate Sprint 5** (storage espelha). Risco de queries analiticas usarem `category` apos drop. Mitigado por ADR-032 que migra todas as queries em Sprint 2-4 antes do drop em Sprint 5.
- **+18 colunas em `tournaments`** + 7 em `planned_tournaments`. Tabela engorda. Aceito — alternativa (Opcao C, tabela separada) seria pior para JOIN performance.
- **Wizard adiciona complexidade visual.** Mitigado: Step 3 e pulado quando sem campos condicionais; animacao Framer Motion suaviza transicoes.

### Neutras
- **Type enum 4 valores nao cobre Heads-Up nem SnG.** Spec marca fora de escopo. Adicionar e trivial: nova string em `TOURNAMENT_PRIMARY_TYPES`.
- **Reward types do Satelite (4 valores)** sao um sub-enum interno — nao afetam ortogonalidade do modelo principal.

## Confianca

**Alta.** Padrao bem conhecido (mutex enum + booleanos independentes) usado em sistemas de classificacao com dimensoes ortogonais (ex: status + visibility + archived em sistemas de issue tracking). Risco principal — refinements Zod cobrirem mal alguma combinacao — mitigado pela matriz 16 de testes (vide RF-10 da spec). Storage espelhamento e operacao trivial (1 atribuicao no helper `normalizeTournamentTypePayload`).

## Referencias

- Spec: `Docs/specs/tournament-types-extension-and-manual-add-fix.md` (revisao 2, 2026-04-25)
- ADR-032: deprecation gradual da coluna `category` em 5 sprints (companion deste ADR).
- ADR-014: modelagem de add-on/re-entry (mesmo padrao "boolean independente + campos condicionais").
- ADR-009: `tournament_library` separada — referencia para estrategia de schema delta.
- Diagrama de ortogonalidade Mermaid: secao "Diagrama de Ortogonalidade" da spec (linhas 818-848).
- Sequence diagrams: `Docs/architecture/sequence-tournament-add-with-types.mermaid`, `Docs/architecture/sequence-satellite-package-roi.mermaid`, `Docs/architecture/sequence-flight-aggregate-roi.mermaid`, `Docs/architecture/sequence-live-tournament-roi.mermaid`.
- Flowchart wizard: `Docs/architecture/flowchart-tournament-add-wizard.mermaid`.
