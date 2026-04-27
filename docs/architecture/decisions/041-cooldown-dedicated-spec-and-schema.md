# ADR-041: Cool-down em spec dedicada com schema novo (`cooldown_logs` + `starred_hands`)

## Status

Proposto

## Data

2026-04-26

> **Nota de numeracao:** A spec `cooldown-refactor-plan.md` (RF-10) referencia este ADR como
> "ADR-029". Quando a spec foi redigida, `029-warmup-no-dual-write-legacy-logs.md` ainda estava
> em proposta e o numero parecia livre. ADR-029 ja foi aceito (2026-04-25) com outro tema, entao
> esta decisao recebe o proximo numero disponivel (**041**). O ADR Sprint Cooldown-3 sobre o
> tool registry do Coach (originalmente "ADR-030" na spec) recebera o numero seguinte **042**
> quando criado.

## Contexto

A pagina de mental hoje persiste warm-up via `warmup_rituals` (ADR-028). Cool-down nunca foi
implementado. A tabela `preparation_logs` carrega tres campos orfaos que **nunca foram populados
pela UI**:

```sql
preparation_logs (
  ...,
  postSessionReview text,    -- orfao desde criacao
  goalsAchieved boolean,      -- orfao desde criacao
  lessonsLearned text         -- orfao desde criacao
)
```

A spec `Docs/specs/cooldown-refactor-plan.md` formaliza um cool-down completo (~10min full,
~3min quick) com 4 blocos sequenciais (Sprint 1: 2 blocos; Sprint 2: 4 blocos), captura de maos
estreladas, A/B/C journal, tilt review, sleep gate. Os requisitos de schema sao:

- 1:1 com `grind_sessions` (uma sessao tem no maximo um cool-down).
- Idempotencia por `(userId, sessionId)`.
- Modos `'full'` e `'quick'` distintos no mesmo schema.
- Estado parcial (`completedAt=null` durante rascunho), com PATCH incremental para autosave.
- `blocksCompleted: jsonb` array para suportar evolucao Sprint 2 sem ALTER TABLE.
- `abGameAnswers: jsonb` estruturado (4 sub-campos).
- `tiltSelfAssessment: jsonb` (Sprint 2) com sliders + triggers.
- `sleepIntent: boolean` (Sprint 2).
- Captura granular: `starred_hands` 1:N com `session_tournaments` (especifica torneio).

Cool-down acontece **apos** o passo de Wallet Reconciliation (ADR-040): summary recebido pelo
modal pos-encerramento usa profit/ROI ja ajustado, ou seja, `detectRedFlags()` opera sobre dados
finais (sessao pode ficar mais negativa que estimativa intra-sessao). Cool-down nao depende
funcionalmente da reconciliacao ter ocorrido — se usuario skipou reconciliation, fluxo segue
normal.

**Pergunta arquitetural:** estender `preparation_logs` (que ja tem 3 campos pos-sessao orfaos)
ou criar tabela dedicada `cooldown_logs` + tabela auxiliar `starred_hands`?

### Restricoes

- **Convencao do projeto:** `varchar` PK via `nanoid`, FK em `userPlatformId`.
- **Drizzle ORM:** migrations via `npm run db:push`. CREATE TABLE e baixo risco; ALTER TABLE com
  8+ colunas em tabela existente eh medio risco.
- **Coexistencia com ADR-028:** warm-up ja escolheu schema dedicado. Manter simetria reduz carga
  cognitiva (warm-up -> `warmup_rituals`; cool-down -> `cooldown_logs`).
- **Coupling com ADR-014 (add-on/reentry):** `starred_hands.sessionTournamentId` referencia
  `session_tournaments.id`. Modelo ortogonal de ADR-014/031 nao impacta cool-down — starred hand
  e nivel **entry**, nao nivel torneio. FK direta resolve.
- **Coupling com ADR-040 (reconciliation):** spec depende explicitamente de reconciliation ter
  rodado antes (skipavel). Schema de `cooldown_logs` nao precisa armazenar dados de
  reconciliation — `grind_sessions.profitLoss` ja contem o valor pos-ajuste.

## Opcoes Consideradas

### Opcao A: Spec dedicada + tabelas novas `cooldown_logs` + `starred_hands` (ESCOLHIDA)

Criar 2 tabelas novas em `shared/schema.ts`:

```sql
cooldown_logs (
  id varchar PK,
  userId FK -> users.userPlatformId,
  sessionId FK -> grind_sessions.id (1:1, unique),
  startedAt timestamp NOT NULL DEFAULT now(),
  completedAt timestamp NULL,                 -- null = rascunho
  durationMinutes integer NULL,
  mode varchar NOT NULL DEFAULT 'full',       -- 'full' | 'quick'
  blocksCompleted jsonb DEFAULT '[]',         -- ['hands','abc','tilt','sleep'] | ['quick']
  abGameAnswers jsonb NULL,                   -- {aGame[], bGame[], cGame, lesson}
  tiltSelfAssessment jsonb NULL,              -- Sprint 2: {feltTilt, keptTilting, presence, triggers[], action}
  sleepIntent boolean NULL,                   -- Sprint 2
  notes text NULL,
  createdAt timestamp DEFAULT now(),
  updatedAt timestamp DEFAULT now(),
  UNIQUE INDEX uq_cooldown_user_session ON (userId, sessionId),
  INDEX idx_cooldown_user_completed ON (userId, completedAt)
)

starred_hands (
  id varchar PK,
  userId FK -> users.userPlatformId,
  sessionId FK -> grind_sessions.id,
  sessionTournamentId FK -> session_tournaments.id,   -- ADR-014 entry-level
  cooldownLogId FK NULL -> cooldown_logs.id (ON DELETE SET NULL),
  type varchar NOT NULL,                              -- enum 8 valores
  spot varchar NOT NULL,                              -- enum 8 valores
  notes text NULL (max 500 chars validado por Zod),
  createdAt timestamp DEFAULT now(),
  INDEX idx_starred_user_session ON (userId, sessionId),
  INDEX idx_starred_user_type ON (userId, type)
)
```

`preparation_logs.{postSessionReview, goalsAchieved, lessonsLearned}` permanecem read-only ate
Sprint Cooldown-3 deprecar formalmente.

- **Pros:**
  - **Schema modela cool-down propriamente.** `mode`, `blocksCompleted`, `completedAt=null`
    para rascunho, `abGameAnswers` jsonb estruturado — todos os requisitos da spec mapeiam direto.
    Sem nullables herdados de era anterior.
  - **Sem coupling com warm-up.** `warmup_rituals` (ADR-028) e `cooldown_logs` sao independentes;
    sessao tem zero, um, ou ambos. Indices dedicados otimizam queries por dominio.
  - **Idempotencia limpa.** UNIQUE `(userId, sessionId)` previne duplicatas no DB. POST retorna
    409 explicito em conflito.
  - **Elastico para Sprint 2 e Sprint 3.** `blocksCompleted` jsonb suporta novos blocos sem ALTER.
    `tiltSelfAssessment` ja tem coluna mas eh nullable (sprint atual nao popula). Coach tool
    (Sprint 3) le agregados de starred_hands + lessons sem novas tabelas.
  - **Migration trivial.** 2 CREATE TABLE + indices via `npm run db:push`. Zero ALTER em tabela
    existente com dados.
  - **Reverter eh seguro.** DROP TABLE cooldown_logs + DROP TABLE starred_hands; preparation_logs
    intacto.
  - **Simetria com warm-up (ADR-028).** Padrao "tabela dedicada por feature" ja eh o default no
    projeto (warmup_rituals, bankroll_snapshots, satellite_tickets, ticket_uses, coach_*).
    Codigo do Implementer espelha o que ja foi feito em warm-up — menos chance de bug.
  - **starred_hands eh primeira-classe.** Tabela auxiliar permite queries cross-session sem
    inflar `cooldown_logs.starred jsonb`. Coach tool (Sprint 3) faz GROUP BY type/spot por
    periodo trivialmente. Indice `(userId, type)` resolve "ultimas maos com tilt" em < 50ms.
  - **Tipagem TypeScript precisa.** `CooldownLog`, `StarredHand` (Drizzle inferSelect) tem
    semantica clara. Zod schemas `insertCooldownLogSchema`, `updateCooldownLogSchema`,
    `insertStarredHandSchema` exportados em `shared/schema.ts` por `drizzle-zod`.

- **Contras:**
  - **3 colunas orfaos em `preparation_logs` ate Sprint Cooldown-3.** `postSessionReview`,
    `goalsAchieved`, `lessonsLearned` permanecem definidas no schema mas nao populadas. Mitigado
    por: (a) ja sao orfaos hoje — situacao nao piora; (b) Sprint Cooldown-3 deprecia formalmente
    com `@deprecated` no schema + remocao final.
  - **+2 tabelas no diagrama.** Compensado pela clareza do schema e simetria com warm-up.

### Opcao B: Estender `preparation_logs` com 8+ colunas novas

`ALTER TABLE preparation_logs ADD COLUMN started_at, completed_at, mode, blocks_completed,
ab_game_answers, tilt_self_assessment, sleep_intent, ...`. Reusar `postSessionReview` como
`notes`. Reusar `goalsAchieved` como uma das respostas A-Game. Migrar `lessonsLearned` para
`abGameAnswers.lesson`.

- **Pros:**
  - Uma tabela so, "fonte unica" superficialmente.
  - Aproveita FKs existentes.

- **Contras:**
  - **Coupling forte com warm-up legado.** `preparation_logs` mistura dados pre-sessao (sliders
    1-10, focusLevel, confidenceLevel, exercisesCompleted, sessionGoals) com dados pos-sessao.
    Ja era confuso quando os 3 campos eram orfaos; vira inviavel se cool-down injetar 8+ campos
    novos.
  - **Coexistencia semantica esquisita.** Uma sessao **planejada** cria preparation_log com
    foco/confianca/goals (caminho legado); a mesma sessao **encerrada** atualizaria a mesma row
    com cool-down — mas cool-down e warm-up sao eventos temporais distintos com auditoria
    independente. Compartilhar PK eh mistura de niveis.
  - **`warmupCompleted` flag colide com `mode='quick' | 'full'`.** Schema teria 2 dimensoes
    similares.
  - **Validacao server-side complexa.** Cada query precisa de `WHERE mode IS NOT NULL` para
    excluir rows de warm-up legado. Esquecer um filtro = bug.
  - **Indices comprometidos.** `idx_preparation_user_completed` para gate query de cool-down
    teria que filtrar `WHERE mode IS NOT NULL` (partial index) ou retornar rows de warm-up
    legado tambem.
  - **starred_hands ainda precisa ser tabela separada.** Opcao B nao resolve a parte de
    starred_hands (1:N com session_tournaments) — entao acaba criando 1 tabela nova **e**
    bagunca preparation_logs. Pior dos dois mundos.
  - **Quebra simetria com ADR-028.** Warm-up escolheu schema dedicado. Cool-down divergir
    aumenta carga cognitiva.
  - **Rejeitada por: schema poluido + coupling temporal pre/pos sessao + nao resolve
    starred_hands.**

### Opcao C: Tabela unica `cooldown_logs` com `starred jsonb` em vez de tabela auxiliar

`cooldown_logs` ganha coluna `starredHands jsonb` array de objetos `{type, spot, notes,
sessionTournamentId}`. Sem `starred_hands` separada.

- **Pros:**
  - Uma tabela so para cool-down.
  - Read trivial: GET cooldown by session ja traz starred embutido.

- **Contras:**
  - **Queryability ruim.** Coach tool (Sprint 3) precisa "agregar starred hands por type nos
    ultimos 30d". Em jsonb, query vira `SELECT jsonb_array_elements(starred) -> 'type', count(*)
    FROM cooldown_logs WHERE userId=... GROUP BY 1` — funciona em Postgres, mas:
    - Sem indice GIN (custo de manutencao alto), sequential scan.
    - Tipos mudam: `type` vira `text` extraido, perde enum check.
  - **FK validation em jsonb e fragil.** Validar que `sessionTournamentId` existe e pertence
    a `sessionId` precisa logica em rota (cada item do array). Em tabela auxiliar, FK + check
    validam por linha — mais robusto.
  - **Limite de 3 stars por torneio fica em jsonb logic.** Em tabela auxiliar, query
    `SELECT count(*) FROM starred_hands WHERE userId=:u AND sessionTournamentId=:st` resolve.
    Em jsonb, parse + count em memoria.
  - **DELETE de starred individual eh re-write de jsonb.** UPDATE com jsonb_array minus item
    — pesado e nao-atomico se varios usuarios fizerem simultaneo.
  - **Crescimento ilimitado.** Se Sprint 2 permitir mais de 3 stars por torneio, jsonb vira
    grande. Tabela auxiliar escala bem.
  - **Coach tool depende de queries cross-session.** "ultimas 50 starred hands tipo `tilt`"
    vira `SELECT ... FROM starred_hands WHERE userId=:u AND type='tilt' ORDER BY createdAt
    DESC LIMIT 50`. Trivial. Em jsonb, eh `jsonb_array_elements` sobre todos os logs.
  - **Rejeitada por queryability + integridade referencial fragil.**

### Opcao D: Reusar tabela `study_sessions` ou criar `session_rituals` polimorfica

`session_rituals (id, userId, sessionId, type='warmup'|'cooldown', payload jsonb)`. Unifica
warm-up + cool-down sob um teto polimorfico.

- **Pros:**
  - Uma tabela polimorfica para todos os rituais.
  - Plano original em `warm-up-refactor-plan.md` ate sugeria nome `session_rituals`.

- **Contras:**
  - **ADR-028 ja decidiu nao polimorfismo.** `warmup_rituals` esta em uso. Voltar atras agora
    exige migration de dados de warm-up — custo alto.
  - **Schema discriminator complica queries.** `WHERE type='cooldown'` em todo caminho quente.
  - **Tipagem perdida.** `payload jsonb` apaga `mode`, `blocksCompleted`, `abGameAnswers` da
    tipagem TypeScript — todo consumidor faz narrowing manual.
  - **starred_hands ainda precisa ser tabela separada** (mesma razao da Opcao C).
  - **Reuso de `study_sessions` eh categorialmente errado.** Dominios completamente distintos
    (estudos vs ritual pos-sessao); compartilhar tabela e acidente arquitetural.
  - **Rejeitada por: contradiz ADR-028 + nao resolve starred_hands.**

## Decisao

**Adotar Opcao A: spec dedicada `Docs/specs/cooldown-refactor-plan.md` + criar tabelas novas
`cooldown_logs` (1:1 com grind_sessions) e `starred_hands` (N:1 com session_tournaments).**

### Detalhes-chave do design

1. **Schema completo** em `shared/schema.ts` (2 novas tabelas, ver spec RF-03 para DDL exato):
   - `cooldown_logs` com UNIQUE `(userId, sessionId)` e index `(userId, completedAt)`.
   - `starred_hands` com indices `(userId, sessionId)` e `(userId, type)`.
   - FK behavior:
     - `cooldown_logs.userId` -> `users.userPlatformId` ON DELETE CASCADE.
     - `cooldown_logs.sessionId` -> `grind_sessions.id` ON DELETE CASCADE.
     - `starred_hands.userId` ON DELETE CASCADE.
     - `starred_hands.sessionId` ON DELETE CASCADE.
     - `starred_hands.sessionTournamentId` ON DELETE CASCADE.
     - `starred_hands.cooldownLogId` ON DELETE **SET NULL** (starred hand sobrevive se log for
       removido — preserva dado historico do usuario; FK eh **nullable** intencionalmente para
       permitir starred hand sem log ativo no futuro).
   - Zod schemas `insertCooldownLogSchema`, `updateCooldownLogSchema`, `insertStarredHandSchema`
     exportados via `drizzle-zod`.
2. **Coexistencia com `preparation_logs`:**
   - `preparation_logs` permanece intacta. Endpoints `/api/preparation-logs*` (warm-up legado)
     mantidos.
   - Os 3 campos orfaos (`postSessionReview`, `goalsAchieved`, `lessonsLearned`) recebem
     comentario `@deprecated since Cooldown-1; remove in Cooldown-3` em `shared/schema.ts`.
   - Sprint Cooldown-3 fara o DROP COLUMN final.
3. **Acoplamento com ADR-040 (reconciliation):**
   - Cool-down opera sobre summary pos-reconciliation. `grind_sessions.profitLoss` (ja
     atualizado por reconciliation se houve ajustes) eh fonte para `detectRedFlags`.
   - Se reconciliation foi skipada, profit nao mudou — `detectRedFlags` continua valido.
   - Cool-down nao escreve em `wallet_transactions`; nao ha conflito com snapshots de banca.
4. **Acoplamento com ADR-014 (add-on/reentry):**
   - `starred_hands.sessionTournamentId` referencia `session_tournaments.id` — entry-level, ja
     cobre Plus/ReA via flags ortogonais (ADR-031). Sem coluna nova.
   - Captura no Bloco 1 lista torneios via JOIN simples por `sessionId`; ordenacao por
     `buyIn DESC` usa coluna existente.
5. **Idempotencia:**
   - UNIQUE `(userId, sessionId)` no DB.
   - POST `/api/cooldown-logs` retorna 409 em conflito (storage layer detecta via select prior).
   - PATCH eh idempotente por design (atualiza row existente).
6. **Documentacao:**
   - `CLAUDE.md` (secao 6 modelos de dados + secao 7 endpoints) ganha entradas para `cooldown_logs`,
     `starred_hands`, e os 7 endpoints novos. Ver spec RF-10.
   - `Docs/architecture/data-model-index.md` ganha as 2 tabelas em "Core" (junto com warm-up).
   - `Docs/architecture/cooldown-index.md` (novo) eh o paralelo de `bankroll-index.md` para o
     dominio de cool-down.

## Consequencias

### Positivas

- **Schema limpo, com tipos TypeScript precisos** (`CooldownLog`, `StarredHand`, alem de jsonb
  types `AbGameAnswers`, `TiltSelfAssessment`).
- **Indices dedicados otimizam caminhos quentes:** lookup por sessao (1:1), historico paginado
  do usuario, agregacao starred por tipo (Coach Sprint 3).
- **Migration baixo risco:** 2 CREATE TABLE + indices. Zero ALTER em tabela existente com dados.
- **Reverter eh simples:** DROP TABLE cooldown_logs + DROP TABLE starred_hands. `preparation_logs`
  intacto.
- **Simetria com ADR-028 (warm-up).** Padrao "tabela dedicada por feature" reforcado. Onboarding
  de futuros agentes/devs eh mais simples.
- **Elastico para Sprint 2 e 3** sem ALTER TABLE: `blocksCompleted` jsonb absorve novos blocos;
  `tiltSelfAssessment` ja tem coluna; coach tool agrega via SQL puro sobre `starred_hands`.
- **Audit/admin separados.** Dashboards admin de cool-down nao misturam com dados de warm-up
  legado.
- **starred_hands como tabela primeira-classe** habilita queries cross-session triviais para
  Coach AI e analytics (Sprint 2 e Sprint 3) sem refactor.

### Negativas

- **3 colunas orfaos em `preparation_logs` ate Sprint Cooldown-3.** Aceito — situacao ja era
  essa antes da spec; documentado em CLAUDE.md e marcado `@deprecated` no schema. DROP COLUMN
  final em Sprint Cooldown-3.
- **+2 tabelas no diagrama de dados.** Compensado pela clareza e queryability.
- **Coordenacao com Sprint Reconciliation (ADR-040).** Cool-down depende do summary
  pos-reconciliation. Mitigado: spec ja documenta a dependencia explicitamente como bloqueante.
  Reconciliation ja mergeou (commit 1e61dfd).

### Neutras

- **`BreathingGuide` e `BlockTimer` reusaveis em warm-up.** Spec sugere extrair para
  `client/src/components/rituals-shared/` se duplicacao surgir com Sprint W-1. Nao impacta
  schema; e decisao do Implementer.
- **Decisao revisitavel** se Sprint Cooldown-2/3 revelarem padrao comum forte com warm-up que
  justifique unificar em `session_rituals`. Ate la, `cooldown_logs` cumpre seu papel.
- **Eventual migracao do dado orfao** em `preparation_logs.{postSessionReview, goalsAchieved,
  lessonsLearned}` provavelmente sera pulada (campos nunca foram populados; nao ha o que
  migrar). DROP COLUMN sem backfill em Sprint Cooldown-3.

## Confianca

**Alta.** Padrao "tabela dedicada por feature com schema novo" eh o default do projeto Grindfy
ja seguido para `warmup_rituals` (ADR-028), `bankroll_snapshots` (ADR-017), `satellite_tickets`/
`ticket_uses` (ADR-037), `coach_*`. Risco de migration zero. Risco de schema bagunca em
`preparation_logs` totalmente evitado. starred_hands como tabela auxiliar segue convencao do
projeto (ex: `ticket_uses` e tabela auxiliar de `satellite_tickets`).

## Referencias

- **Spec:** `Docs/specs/cooldown-refactor-plan.md` (RF-03 schema, RF-04 endpoints, RF-10 docs).
- **ADR-028:** `028-warmup-rituals-vs-preparation-logs.md` — padrao espelhado para cool-down.
- **ADR-014:** `014-addon-rea-modelagem.md` — `session_tournaments` entry-level que `starred_hands`
  referencia (sem coluna nova).
- **ADR-031:** `031-tournament-types-orthogonal-model.md` — modelo ortogonal preservado.
- **ADR-040:** `040-session-end-wallet-reconciliation.md` — reconciliation acontece **antes** do
  cool-down; cool-down opera sobre summary pos-reconciliation.
- **ADR-017:** `017-bankroll-snapshot-vs-derived.md` — convencao "tabela dedicada com snapshots"
  espelhada.
- **Sequence diagram:** `Docs/architecture/flows/grind/sequence-cooldown-flow.mermaid`.
- **Index:** `Docs/architecture/cooldown-index.md`.
