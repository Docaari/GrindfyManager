# ADR-028: Criar nova tabela `warmup_rituals` em vez de estender `preparation_logs`

## Status
Aceito

## Data
2026-04-25

## Contexto

A Sprint W-1 do warm-up substitui a pagina `/mental` atual (checklist solto + 4 sliders + score 60/40 decorativo) por um protocolo cronometrado de 5 blocos com gate Go/No-Go. A persistencia precisa capturar:

- Estado temporal por bloco (`startedAt`, `completedAt`, `durationSeconds`).
- Dados ricos por bloco em `jsonb` (heuristicas snapshot, drill completion, setup items, etc).
- Score emocional 0-10 com semantica de gate.
- Decisao go/no-go (`decisionToPlay`) e marca de override (`overrideUsed`).
- Intencao estruturada da sessao (`focus`, `tiltPlan`, `stopCriteria`).
- Versao do ritual (`full` | `aborted`; futura W-3 adiciona `minimal`).
- FK opcional para `grind_sessions` (correlacao com performance).

A tabela existente `preparation_logs` (`shared/schema.ts`) tem schema raso desenhado para a UI antiga:

```sql
preparation_logs (
  id varchar PK, userId FK, sessionId FK nullable,
  mentalState integer NOT NULL,        -- numero unico (sliders agregados)
  focusLevel integer NOT NULL,
  confidenceLevel integer NOT NULL,
  exercisesCompleted jsonb,            -- string[]
  warmupCompleted boolean default false,
  sessionGoals text nullable,
  postSessionReview text nullable,
  goalsAchieved boolean nullable
)
```

Quatro campos `integer` representando sliders 1-10 (mentalState, focusLevel, confidenceLevel) nao mapeiam para o novo modelo de blocos cronometrados. `exercisesCompleted` e array de strings - nao tem estrutura por bloco. Faltam: `startedAt`, `durationMinutes`, `version`, `decisionToPlay`, `overrideUsed`, `blocksCompleted` (jsonb por bloco), `sessionIntention` (jsonb estruturado).

A pergunta arquitetural: **estender `preparation_logs` ou criar `warmup_rituals` separada?**

### Restricoes

- **Roadmap:** sprints futuras (W-2 deferida - cool-down) virao com 4 blocos diferentes (4-7-8 breathing, captura de maos, ABC journal, transicao fisica). Provavelmente como tabela propria (ex: `cooldown_rituals`) ou tabela unificada com discriminator (`session_rituals.type`). Plano original sugeria a unificada; PM-Spec decidiu por tabelas dedicadas para nao prematuramente abstrair.
- **Compat:** `preparation_logs` tem dados historicos de usuarios atuais. Nao podemos perder.
- **Convencao do projeto:** todas as tabelas usam `varchar id` com nanoid (ja seguido por `warmup_rituals`).
- **Drizzle ORM:** schema migrations gerenciadas via `npm run db:push`. Adicionar tabela e baixo risco; adicionar 8+ colunas nullable em tabela existente e tambem baixo risco mas confunde semantica.
- **Janela de 60 dias:** combinada com ADR-029 (no dual-write), garantimos que dados antigos permanecam acessiveis mesmo sem dual-write.

## Opcoes Consideradas

### Opcao A: Nova tabela `warmup_rituals` separada de `preparation_logs` (ESCOLHIDA)

```sql
warmup_rituals (
  id varchar PK, userId FK,
  startedAt timestamp NOT NULL, completedAt timestamp,
  durationMinutes integer, version varchar(16) NOT NULL,
  emotionalCheckScore integer (0-10),
  decisionToPlay boolean, overrideUsed boolean DEFAULT false,
  blocksCompleted jsonb DEFAULT [],
  sessionIntention jsonb,
  linkedGrindSessionId varchar FK NULL,
  createdAt timestamp DEFAULT now()
)
preparation_logs - permanece intacta, deprecada (ADR-029)
```

- **Pros:**
  - **Schema limpo, alinhado com a feature.** Cada coluna tem proposito direto no fluxo da Sprint W-1. Sem nullables herdados de era antiga.
  - **Sem perda de dados.** `preparation_logs` permanece read-only para codigo legado; nenhum row e tocado.
  - **Migration trivial.** Adicionar tabela nova via `npm run db:push` - sem risco para tabela existente.
  - **Indices dedicados.** `idx_warmup_rituals_user_completed` (gate query) e `idx_warmup_rituals_user_started` (historico) sao otimos para os 2 caminhos quentes. Em tabela compartilhada, indices teriam que considerar coluna de tipo, agregando custo.
  - **Tipagem TypeScript precisa.** `WarmupRitual` (Drizzle inferSelect) tem todos campos obrigatorios na semantica certa. Em tabela estendida, todos campos novos seriam nullable - validacao server-side teria que fazer cross-field check em todo lugar.
  - **Audit/admin separados.** Dashboards admin de warm-up nao misturam dados antigos confusamente.
  - **Cool-down futuro pode espelhar padrao.** Quando cool-down voltar (deferido), criar `cooldown_rituals` em paralelo segue mesmo padrao - simetria.
  - **Reverter e seguro.** Se a Sprint W-1 falhar e for revertida, `DROP TABLE warmup_rituals` e dropar feature flag - zero impacto em legado.

- **Contras:**
  - **Coexistencia 60d.** Dois lugares de "dado de warm-up" no banco. Mitigado pelo ADR-029 (no dual-write) e pela documentacao explicita em CLAUDE.md.
  - **Eventual migracao de historico** se quisermos unificar sera trabalho extra. Aceito - dados de sliders nao mapeiam limpo para o novo modelo, entao migracao seria perda de informacao mesmo.
  - **Codigo de leitura precisa saber qual tabela consultar.** Codigo novo so le `warmup_rituals`. Codigo legado (achievements ja existentes) tem que migrar ou seguir lendo a antiga. Spec marca `AchievementsDialog` como refactor minimo (trocar query).

### Opcao B: Estender `preparation_logs` com colunas novas (8+ nullable)

Adicionar em `preparation_logs`:
```sql
ALTER TABLE preparation_logs
  ADD COLUMN started_at timestamp,
  ADD COLUMN duration_minutes integer,
  ADD COLUMN version varchar(16),
  ADD COLUMN emotional_check_score integer,
  ADD COLUMN decision_to_play boolean,
  ADD COLUMN override_used boolean DEFAULT false,
  ADD COLUMN blocks_completed jsonb DEFAULT '[]',
  ADD COLUMN session_intention jsonb,
  ADD COLUMN linked_grind_session_id varchar;
```

- **Pros:**
  - Uma tabela so - "fonte unica" superficialmente.
  - Aproveita FKs e indices ja existentes.
  - Permite consultas que misturam logs antigos e novos.

- **Contras:**
  - **Schema bagunca: 16+ colunas, metade nullable, semantica conflitante.** `mentalState` (slider 1-10) coexiste com `emotionalCheckScore` (0-10) - mesmo dominio, semantica diferente. Foco de bug futuro.
  - **Validacao server-side complexa.** Cada query precisa de `WHERE version IS NOT NULL` para excluir rows antigos. Esquecer um filtro = bug.
  - **Indices comprometidos.** Indice `(user_id, completed_at)` para gate funciona, mas tem que cobrir rows antigos com `completed_at NULL` ou implicitos. Ou criar com `WHERE version IS NOT NULL` (partial index) - complexidade extra.
  - **Migration arriscada.** ALTER TABLE em prod com lock pode atrasar deploy. Adicionar 8 colunas nullable + 1 com default em tabela com N rows tem comportamento bom no Postgres mas exige cuidado.
  - **Tipagem TypeScript ruim.** `PreparationLog` teria 16 campos, todos nullable exceto IDs - tipo perde valor de documentacao.
  - **Reverter e dificil.** DROP COLUMNs em prod com codigo ja deployado precisa de coordenacao - feature flag + migration backwards.
  - **Cool-down futuro mata o argumento "uma tabela so".** Se cool-down nao couber em `preparation_logs` (e nao cabe; schema tambem diferente), criamos `cooldown_rituals` separada - voltamos para 2 tabelas mas com `preparation_logs` ainda obesa de fields warm-up.
  - **Rejeitada por: schema poluido, validacao fragil, ROI da unificacao nao se sustenta.**

### Opcao C: Tabela unificada `session_rituals` com `type` discriminator (`warmup` | `cooldown`)

```sql
session_rituals (
  id varchar PK, userId FK,
  type varchar(16) NOT NULL,  -- 'warmup' | 'cooldown'
  startedAt timestamp NOT NULL,
  completedAt timestamp,
  ... campos comuns ...
  warmupData jsonb NULL,    -- so para type='warmup'
  cooldownData jsonb NULL,  -- so para type='cooldown'
)
preparation_logs - migrada e dropada
```

- **Pros:**
  - Unifica warm-up e cool-down sob um teto.
  - Plano original sugeriu este nome (`session_rituals`).

- **Contras:**
  - **Cool-down esta DEFERIDO** (decisao do fundador, 2026-04-25). Criar tabela com `type` discriminator agora pre-otimiza para feature que nao foi spec'ada.
  - **Schema sem consumidor real.** Colunas como `warmupData jsonb` ficariam vazias se cool-down for cortado permanentemente. Pre-otimizacao classica.
  - **Discriminator complica queries.** `WHERE type='warmup'` em todos os caminhos quentes. Indices precisam incluir type.
  - **Tipagem TypeScript precisa de discriminated union manual.** Drizzle nao gera isso automatico - todo consumidor precisa narrar `type === 'warmup'`.
  - **Cool-down quando voltar tem schema diferente.** 4 blocos vs 5, captura de maos, ABC journal - jsonb generico nao protege estrutura. Acabaria precisando de tabelas dedicadas mesmo dentro do "warmupData/cooldownData".
  - **Rejeitada por pre-otimizacao + discriminator overhead.**

### Opcao D: Manter `preparation_logs` como esta + criar `warmup_rituals` + dual-write

Combinar Opcoes A e B - codigo novo escreve em `warmup_rituals`, mas tambem populates `preparation_logs` por compat.

- **Pros:**
  - Mantem dashboards/queries antigas funcionando "automaticamente".
  - Migracao final pode ser cancelada sem trauma.

- **Contras:**
  - **Dual-write tem patologias bem conhecidas:** dois codigos verdade, divergencia silenciosa em falhas parciais (succeed em A, fail em B), latencia dobrada.
  - **Mapeamento perde informacao.** `mentalState` (slider 1-10) so cobre uma dimensao do `emotionalCheckScore` + `blocksCompleted[0]` - dual-write exigiria heuristicas inventadas.
  - **Manutencao dobra.** Toda mudanca futura em warm-up precisa pensar em ambos os schemas.
  - **CLAUDE.md ja documenta erro recorrente** com dual-write em outras features (Coach Sprint Coach-1 saveMessage + recordUsage). Padrao a evitar.
  - **Coberta pelo ADR-029** que decide explicitamente nao fazer dual-write. Esta opcao foi descartada antes mesmo da Opcao A ser proposta.
  - **Rejeitada por overhead + risco de divergencia.**

## Decisao

**Adotar Opcao A: criar tabela `warmup_rituals` nova, separada de `preparation_logs`.**

### Detalhes-chave do design

1. **Schema completo** em `shared/schema.ts` apos `preparationLogs`:
   - Indice `idx_warmup_rituals_user_completed` (gate query).
   - Indice `idx_warmup_rituals_user_started` (historico DESC).
   - Tipos `WarmupBlockSnapshot` e `SessionIntention` exportados de `shared/schema.ts` (ou `shared/warmup-types.ts` - ambos OK; spec deixou em aberto).
   - `insertWarmupRitualSchema` via `drizzle-zod` com transformers para datas ISO + enums.
   - `version: enum(['full', 'aborted'])` nesta sprint; W-3 adiciona `'minimal'`.
2. **Mudancas em tabelas existentes:**
   - `user_settings`: + `weeklyHeuristics jsonb` (tuple de 3 strings) + `drillUrl varchar(500)`.
   - `users` relations: adicionar `warmupRituals: many(warmupRituals)`.
   - `grind_sessions`: nenhuma mudanca nesta sprint - FK e do lado de `warmup_rituals.linkedGrindSessionId`.
3. **Coexistencia com `preparation_logs`:**
   - `preparation_logs` continua intacta. Endpoints `/api/preparation-logs*` mantidos.
   - Nenhum codigo da Sprint W-1 escreve em `preparation_logs` (ADR-029).
   - Refactor minimo de `AchievementsDialog`: trocar query de `preparation_logs` para `warmup_rituals` filtrando `version='full'`.
4. **Janela 60 dias:**
   - Apos 60d, avaliar uso real de `preparation_logs`. Se zero leituras de codigo novo, deprecar e dropar.
   - Migracao de historico antigo e OPCIONAL e provavelmente sera pulada (sliders nao mapeiam para emotionalCheckScore + blocks - perda de informacao).
5. **Documentacao:**
   - CLAUDE.md (secao "Modelos de dados") ganha entrada "warmup_rituals (Sprint W-1)" e nota de deprecacao em `preparation_logs`.
   - data-model.mermaid atualizado (este ADR linkado).

## Consequencias

### Positivas
- **Schema limpo, com tipos TypeScript precisos** (`WarmupRitual`, `WarmupBlockSnapshot`, `SessionIntention`).
- **Indices dedicados otimizam os 2 caminhos quentes:** gate (latest 30min) e historico paginado.
- **Migration baixo risco:** apenas CREATE TABLE + 2 ALTER em `user_settings`. Zero ALTER em tabela existente com dados.
- **Reverter e simples:** drop `warmup_rituals`. `preparation_logs` ainda tem o que tinha.
- **Padrao replica para cool-down futuro:** quando cool-down voltar, `cooldown_rituals` em paralelo segue mesma forma.
- **Audit/dashboards admin separados:** queries de relatorio nao precisam filtrar `version IS NOT NULL` em tabela compartilhada.

### Negativas
- **Coexistencia de 60d entre 2 tabelas com dominios proximos.** Documentado em CLAUDE.md; ADR-029 garante que codigo novo nao escreve em `preparation_logs`.
- **Migracao final de dados antigos provavelmente pulada.** Aceitavel - dados de sliders nao mapeiam para o novo modelo de blocos.
- **+1 entidade no diagrama de dados.** Compensado pela clareza do schema.

### Neutras
- **Refactor de `AchievementsDialog`:** trocar query - ~10 LOC. Documentado na spec.
- **Decisao revisitavel** se cool-down e features futuras revelarem padrao comum forte que justifique unificacao em `session_rituals`. Ate la, `warmup_rituals` cumpre seu papel.

## Confianca

**Alta.** Padrao "tabela dedicada por feature com schema novo" e o default no projeto Grindfy ja seguido para `bankroll_snapshots`, `tournament_selector_logs`, `chat_sessions`, `coach_actions`. Risco de migration zero. Risco de schema bagunca em `preparation_logs` totalmente evitado.

## Referencias

- Spec: `Docs/specs/warm-up-sprint-w1-spec.md` (Secao 6, Schema completo)
- Plano: `Docs/specs/warm-up-refactor-plan.md` (Secao 7 + Apendice C8 - mapeamento)
- ADR-029: estrategia de no dual-write durante coexistencia.
- ADR-027: soft-gate (`overrideUsed` faz parte do schema).
- Patterns no projeto: `bankroll_snapshots` (ADR-017), `tournament_selector_logs` - tabelas dedicadas com schema novo.
