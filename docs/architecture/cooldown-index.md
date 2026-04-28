# Cool-down — Indice de Arquitetura

## Status

Arquitetura aprovada para Sprint Cooldown-1 (MVP) — ADR proposto + sequence diagram + spec
referenciada. Sprint Cooldown-2 e Cooldown-3 listadas para roadmap; ADRs futuros sinalizados.

## Posicao no Pipeline

```
PM-Spec (Docs/specs/cooldown-refactor-plan.md)            -> APROVADO (2026-04-25/26)
   |
   |  Dependencia bloqueante: Sprint Reconciliation (ADR-040) -> MERGED commit 1e61dfd
   |
System-Architect (este indice)                            -> APROVADO (2026-04-26)
   |
Test-Writer                                               -> PROXIMO (Sprint Cooldown-1)
   |
Implementer
   |
Reviewer
   |
Deployer (deferido — manter local)
```

## Sumario da Feature

Cool-down eh o ritual estruturado pos-sessao que fecha o ciclo de grind: extrai aprendizados,
faz catarse emocional, fixa licoes para a proxima sessao e prepara transicao para sono.

Hoje o sistema **nao tem cool-down implementado** — apenas 3 campos orfaos em `preparation_logs`
(`postSessionReview`, `goalsAchieved`, `lessonsLearned`) que jamais foram preenchidos pela UI.

Cool-down ocorre apos `WalletReconciliationDialog` (ADR-040) no fluxo de encerramento de sessao.
O `SessionSummaryModal` ganha 3 CTAs (Quick, Full, Skip) com destaque visual quando
`detectRedFlags()` identifica sinais de fadiga/tilt na sessao pos-reconciliation.

**Spec:** [`Docs/specs/cooldown-refactor-plan.md`](../specs/cooldown-refactor-plan.md) — 10 RFs.

**Phasing (~12 dias total):**

| Sprint | Escopo | Esforco est. |
|---|---|---|
| **Cooldown-1** (P0, MVP — atual) | Schema + RF-01 (gate) + RF-02 Blocos 1+2 + Quick + RF-03 + RF-04 (CRUD) + RF-09 testes core + RF-10 ADR-041 + sequence diagram + RF-08 (update warm-up spec) | ~5 dias |
| **Cooldown-2** (P1) | RF-02 Blocos 3+4 + Sleep Gate (`planClosed`, `dashboardSnoozedUntil`) + `BreathingGuide` integrado + RF-06 (analytics) + testes | ~4 dias |
| **Cooldown-3** (P2) | RF-07 (Coach AI tool + page context + ADR-042) + deprecation `preparation_logs.*` orfaos + correlacao cool-down x performance | ~3 dias |

---

## Decisoes do Founder Incorporadas

| # | Decisao | Onde foi tratada |
|---|---------|------------------|
| F1 | Cool-down skipavel (gate suave, nao bloqueante) | spec RF-01 + sequence diagram Branch SKIP |
| F2 | Schema novo dedicado (NAO estender preparation_logs) | ADR-041 (Opcao A vs B) |
| F3 | PATCH incremental ao avancar bloco (autosave) | sequence diagram Bloco 1 -> Bloco 2 |
| F4 | Cronometro nao-bloqueante (botao "Avancar" sempre habilitado) | spec RF-02 + sequence diagram |
| F5 | Quick variant ~3min para usuarios casuais | spec RF-02 + sequence diagram Branch QUICK |
| F6 | Sleep Gate + Tilt Review deferidos para Sprint 2 | spec RF-02 Sprint 2 + ADR-041 (schema ja contempla) |
| F7 | Coach AI integration deferida para Sprint 3 | spec RF-07 + ADR-042 (futuro) |

---

## Artefatos

### Diagramas

| Arquivo | Tipo | Descricao |
|---------|------|-----------|
| [`flows/grind/sequence-cooldown-flow.mermaid`](flows/grind/sequence-cooldown-flow.mermaid) | Sequence | Fluxo completo: SessionSummaryModal CTAs (apos reconciliation) -> 4 branches (FULL, QUICK, SKIP, DRAFT). Cobre POST/PATCH/GET de cooldown_logs + POST/DELETE de starred_hands com idempotencia, ownership, FK validation, autosave debounce 1s, retomada de rascunho |
| [`flows/grind/sequence-session-end-reconciliation.mermaid`](flows/grind/sequence-session-end-reconciliation.mermaid) | Sequence (ADR-040, contexto) | Passo anterior obrigatorio — reconciliation antes do summary que feeds cool-down |

### Decisoes (ADRs)

| ADR | Titulo | Status |
|-----|--------|--------|
| [ADR-041](decisions/041-cooldown-dedicated-spec-and-schema.md) | Cool-down em spec dedicada com schema novo (`cooldown_logs` + `starred_hands`) | Proposto (2026-04-26) |
| ADR-042 (futuro) | Coach AI tool registry para `read_cooldown_history` (Sprint Cooldown-3) | Pendente |

ADRs companheiros referenciados:

| ADR | Por que importa |
|-----|-----------------|
| [ADR-014](decisions/014-addon-rea-modelagem.md) | `starred_hands.sessionTournamentId` referencia nivel **entry** — modelo ortogonal preservado |
| [ADR-028](decisions/028-warmup-rituals-vs-preparation-logs.md) | Padrao espelhado para cool-down — `cooldown_logs` segue o desenho de `warmup_rituals` |
| [ADR-031](decisions/031-tournament-types-orthogonal-model.md) | Tipos ortogonais nao impactam cool-down (sem coluna nova) |
| [ADR-040](decisions/040-session-end-wallet-reconciliation.md) | Reconciliation acontece ANTES do cool-down; summary alimentado eh pos-ajuste |

### Modelo de Dados

| Arquivo | Mudanca |
|---------|---------|
| [`data-model-index.md`](data-model-index.md) | **+2 tabelas** em "Core": `cooldown_logs` (1:1 com grind_sessions), `starred_hands` (N:1 com session_tournaments). Indices descritos. |
| `data-model.mermaid` | Atualizar com 2 entidades novas + FKs (Sprint Cooldown-1, atualizacao opcional ate o Implementer mexer no schema) |

### Spec de Origem

- [`Docs/specs/cooldown-refactor-plan.md`](../specs/cooldown-refactor-plan.md) — 10 RFs + 7 user
  stories + cenarios de teste + phasing.
- [`Docs/specs/warm-up-refactor-plan.md`](../specs/warm-up-refactor-plan.md) — spec irma; cool-down
  defere W-2 do plano original (ja incorporado).
- [`Docs/specs/session-end-wallet-reconciliation.md`](../specs/session-end-wallet-reconciliation.md)
  — dependencia bloqueante (ADR-040), MERGED commit 1e61dfd.

---

## Resumo Tecnico para Test-Writer

### Modulos backend a serem criados

| Caminho | Tipo | Funcao |
|---------|------|--------|
| `server/routes/cooldown.ts` | Modulo de rotas | `POST /api/cooldown-logs`, `PATCH /api/cooldown-logs/:id`, `GET /api/cooldown-logs/:sessionId`, `GET /api/cooldown-logs`, `POST /api/starred-hands`, `GET /api/starred-hands`, `DELETE /api/starred-hands/:id` + rate limits 10/min em POST cooldown e 30/min em PATCH/POST starred |
| `server/storage.ts` (modificar) | Camada de dados | `createCooldownLog`, `updateCooldownLog`, `getCooldownLogBySession`, `listCooldownLogs`, `createStarredHand`, `listStarredHands`, `deleteStarredHand` — tudo com check de ownership |
| `shared/schema.ts` (modificar) | Drizzle | Tabelas `cooldown_logs` + `starred_hands` + Zod `insertCooldownLogSchema`, `updateCooldownLogSchema`, `insertStarredHandSchema` (enum type 8 valores, enum spot 8 valores, notes max 500) |

### Modulos frontend a serem criados

| Caminho | Funcao |
|---------|--------|
| `client/src/components/cooldown/CoolDownRunner.tsx` | Modal full-screen orquestrador (useReducer state local + autosave debounce 1s) |
| `client/src/components/cooldown/BlockOneStarredHands.tsx` | Bloco 1 (5min) — lista torneios + UI de estrela + cronometro nao-bloqueante |
| `client/src/components/cooldown/BlockTwoABCJournal.tsx` | Bloco 2 (5min) — 4 textareas estruturadas com validacao soft |
| `client/src/components/cooldown/BreathingGuide.tsx` | Animacao 4-7-8 toggle on/off (reusavel em warm-up via prop) |
| `client/src/components/cooldown/BlockTimer.tsx` | Cronometro visual nao-bloqueante (label "X min sugeridos") |
| `client/src/components/cooldown/QuickCoolDownDialog.tsx` | Versao 3min — 5 campos (3 hands curtas + 2 perguntas) |
| `client/src/components/cooldown/StarredHandPicker.tsx` | Sub-componente do Bloco 1 |
| `client/src/components/grind/SessionSummaryModal.tsx` (modificar) | Adicionar 3 CTAs novos + helper `detectRedFlags(summary)` exportado de `client/src/lib/cooldownHelpers.ts` |
| `client/src/lib/cooldownHelpers.ts` | `detectRedFlags(summary): {hasFlags, reasons[]}` puro, sem React |

### Endpoints

| Metodo | Rota | Auth | Rate | Sprint | Descricao |
|--------|------|------|------|--------|-----------|
| POST | `/api/cooldown-logs` | JWT | 10/min | 1 | Criar log (start). Body: `{sessionId, mode}`. 409 em duplicata `(userId, sessionId)` |
| PATCH | `/api/cooldown-logs/:id` | JWT | 30/min | 1 | Update incremental (autosave). Body parcial |
| GET | `/api/cooldown-logs/:sessionId` | JWT | — | 1 | Buscar log por session (1:1) |
| GET | `/api/cooldown-logs` | JWT | — | 1 | Historico paginado (`?page=1&pageSize=20`) |
| POST | `/api/starred-hands` | JWT | 30/min | 1 | Estrelar mao. Valida FK `sessionTournamentId.sessionId === body.sessionId` (400 mismatch) e limite 3 por torneio (400) |
| GET | `/api/starred-hands` | JWT | — | 1 | Listar (`?sessionId=X` ou `?type=tilt&period=30d`) |
| DELETE | `/api/starred-hands/:id` | JWT | — | 1 | Desfazer star (ownership 404 se outro user) |
| GET | `/api/analytics/cooldown-compliance` | JWT | — | 2 | `{total, completed, complianceRate}` |
| GET | `/api/analytics/starred-hands-distribution` | JWT | — | 2 | Distribuicao por type |
| GET | `/api/analytics/cooldown-impact` | JWT | — | 2 | ROI com vs sem cool-down |
| GET | `/api/analytics/top-lessons` | JWT | — | 2 | Word cloud de lessons |

### Performance Targets

| Operacao | Alvo p95 |
|----------|----------|
| `POST /api/cooldown-logs` | < 100ms |
| `PATCH /api/cooldown-logs/:id` (autosave) | < 150ms |
| `POST /api/starred-hands` | < 150ms |
| `GET /api/cooldown-logs/:sessionId` | < 50ms |

### Invariantes a serem testadas (do ADR-041)

1. UNIQUE `(userId, sessionId)` em `cooldown_logs` — 2o POST mesmo userId+sessionId retorna 409.
2. `starred_hands.sessionTournamentId` deve pertencer a `starred_hands.sessionId` (validado em
   rota POST, nao no DB).
3. `starred_hands.cooldownLogId` eh **nullable**; ON DELETE SET NULL — starred hand sobrevive
   se log for deletado.
4. CASCADE em `cooldown_logs.userId` e `cooldown_logs.sessionId` — DELETE user remove logs +
   starred hands; DELETE grind_session remove logs + starred hands.
5. `completedAt=null` -> log eh rascunho. PATCH preserva rascunho ate completedAt ser setado.
6. `mode='quick'` + `blocksCompleted=['quick']` em Quick path; `mode='full'` +
   `blocksCompleted=['hands','abc']` em Full path.
7. Limite 3 stars por `sessionTournamentId` validado em rota (count + reject 400).
8. PATCH eh idempotente — chamar 2x com mesmo body produz mesma row.

---

## Questoes Tecnicas em Aberto

### Q-Arch-1. Reuso de `BreathingGuide` e `BlockTimer` com Sprint W-1

Sprint W-1 (warm-up cronometrado) provavelmente ja tem versoes embriao desses componentes.
Decisao: Implementer extrai para `client/src/components/rituals-shared/` se duplicacao for
material. **Nao bloqueia Sprint Cooldown-1** — pode comecar duplicado e refatorar depois.

### Q-Arch-2. `cooldownLogId` nullable em `starred_hands`

Spec RF-02 Bloco 1 diz starred eh dentro de cool-down. Mas:
- Coluna eh nullable **intencionalmente** para Sprint 2/3 permitir starred hand sem cool-down
  ativo (ex: usuario estrela mao de uma sessao antiga via UI futura).
- ON DELETE SET NULL preserva dado historico se log for removido.
- Em Sprint Cooldown-1, **toda inserção via UI passa cooldownLogId** (Bloco 1 ou Quick).
  Test-Writer deve assertar que `cooldownLogId` eh non-null para criacoes via runner/dialog.

### Q-Arch-3. Concorrencia em PATCH simultaneo

Dois requests simultaneos de `PATCH /api/cooldown-logs/:id` do mesmo usuario podem causar
last-write-wins. Para Sprint 1, aceitavel — autosave cliente eh debounced (1s) e usuario tem 1
runner aberto por vez.

Se Sprint 2 introduzir multi-aba, Test-Writer deve adicionar suite de concorrencia. Por
enquanto fora de escopo.

### Q-Arch-4. Storage method idempotente vs erro 409

`storage.createCooldownLog` deve **detectar conflito antes de inserir** (SELECT preflight) ou
**deixar UNIQUE constraint disparar e capturar erro do DB**? Spec RF-04 critério: "POST rejeita
409 se ja existe log para `(userId, sessionId)`".

Recomendacao Test-Writer: storage faz SELECT preflight (simetria com outros services); rota
expoe 409 com payload `{code:'cooldown_already_exists', logId}`. Sequence diagram ja modela
esse caminho.

### Q-Arch-5. Cleanup de rascunhos abandonados

Spec nao trata — log com `completedAt=null` permanece indefinidamente. Aceitavel em Sprint 1
(volume baixo). Sprint 2 pode adicionar background job que apaga rascunhos > 30 dias. Fora de
escopo.

---

## Proximo Passo Recomendado

```
Arquitetura aprovada (este indice + ADR-041 + sequence diagram + data-model-index updated +
spec warm-up RF-08 atualizado)
   -> Test-Writer escreve testes baseados em:
      - sequence-cooldown-flow.mermaid (4 branches: FULL, QUICK, SKIP, DRAFT)
      - ADR-041 (invariantes de schema, FK behavior, idempotencia)
      - spec RF-09 (lista explicita de testes unit + component + integration + e2e)
      - cenarios de teste derivados na spec (happy/validacao/regras/edge cases/ownership)
```

**Foco do Test-Writer:**

1. Schemas Zod (`tests/unit/cooldown/schemas.test.ts`) — positive + negative.
2. Helper puro `detectRedFlags` (`tests/unit/cooldown/redFlags.test.ts`) — 4 condicoes + edge
   cases (NaN, abiMed=0, sessao 0min).
3. Component tests com `data-testid` estavel (`SessionSummaryModalCTAs`, `CoolDownRunner`,
   `BlockOneStarredHands`, `BlockTwoABCJournal`, `QuickCoolDownDialog`).
4. Integration de rotas com DB real (`tests/integration/cooldown/cooldown-routes.test.ts`,
   `starred-hands-routes.test.ts`) — 409 em duplicata, 400 em FK mismatch, ownership 404,
   limite 3 stars por torneio.
5. E2E smoke (`tests/e2e/cooldown-flow.test.ts`) — encerrar sessao -> CTA destacado (red flags
   simuladas) -> abrir runner -> estrelar 2 maos -> A/B/C -> concluir -> verificar DB.
6. Nao regredir: SessionSummaryModal existente (4138 testes verdes) — adicionar asserts, nao
   alterar antigos.

---

## Mudancas em Documentos Relacionados

- [`Docs/architecture/data-model-index.md`](data-model-index.md) — atualizado em "Core" com 2
  novas tabelas.
- [`Docs/specs/warm-up-refactor-plan.md`](../specs/warm-up-refactor-plan.md) — RF-08 do
  cool-down ja foi aplicado em update anterior (nota no topo + secoes apontando para spec
  dedicada).

CLAUDE.md (secao 6 modelos + secao 7 endpoints + secao 9 lessons-learned se necessario) sera
atualizado pelo Implementer ao concluir Sprint Cooldown-1.

---

## F2 — Spot Screenshots (Sprint F2, branch `feature/spot-screenshots`)

> **Apenso (2026-04-27).** Estende o fluxo de cool-down com captura visual durante o
> grind live. Reusa `starred_hands` (extensao de schema, sem tabela nova) e amplia o
> drop target em `BlockOneStarredHands.tsx` para aceitar prints colados pelo jogador.
> Sprint Cooldown-1 segue intacta — F2 eh **adicao**, nao alteracao.

### Sumario da Feature F2

Jogador cola Ctrl+V screenshot durante a sessao live; print eh anexado ao
`session_tournament` em foco com `expiresAt = pastedAt + 14d`. Revisao acontece em duas
surfaces:
- **Cooldown** — `SessionSpotsList` lateral + drag-to-review em `BlockOneStarredHands`.
- **Studies** — aba "Spots Pendentes" para revisao posterior.

Cron diario purga prints expirados sem `reviewLater=true`.

### Spec de origem

- [`Docs/specs/sprint-f2-spot-screenshots.md`](../specs/sprint-f2-spot-screenshots.md) —
  11 RFs + 5 user stories + cenarios de teste + risk register.

### Decisoes (ADRs novos)

| ADR | Titulo | Status | Numero corrigido |
|-----|--------|--------|------------------|
| [ADR-051](decisions/051-spot-screenshots-storage.md) | Disco local em F2; S3/R2 deferido para F3 (com interface `lib/spotStorage.ts` para troca incremental) | Proposto (2026-04-27) | A spec referenciava "ADR-039" mas 039 ja em uso (rakeback). 051 eh o proximo livre. |
| [ADR-052](decisions/052-spot-screenshots-ownership.md) | Middleware ownership custom em `GET /api/starred-hands/:id/image` (vs signed URLs) | Proposto (2026-04-27) | (spec referenciava "ADR-040") |
| [ADR-053](decisions/053-spot-screenshots-cron.md) | `node-cron` lib nova + funcao pura `purgeSpotScreenshots()`; multi-instance debt para F3 | Proposto (2026-04-27) | (spec referenciava "ADR-041") |

### Diagramas

| Arquivo | Tipo | Descricao |
|---------|------|-----------|
| [`feature-flows/spot-screenshots-flow.mermaid`](feature-flows/spot-screenshots-flow.mermaid) | Sequence | 3 fluxos: PASTE (RF-01/02), REVIEW (cooldown 2A + studies 2B; RF-03/09/10/11), PURGE (RF-06 cron). Cobre happy paths, ENOENT no unlink, FK mismatch, ownership 404, rate limit, MIME reject, 5MB limit, race do counter 10/sessao, sessao terminada -> studies. |
| [`feature-flows/spot-screenshots-components.mermaid`](feature-flows/spot-screenshots-components.mermaid) | C4 nivel 3 | Modulos novos vs modificados vs extension. Components UI (Paster, SpotsList, ReviewCard, PendingTab), drop target em BlockOneStarredHands (extension), rotas em `server/routes/starred-hands.ts`, abstracao `lib/spotStorage.ts`, cron `server/jobs/`, schema delta `starred_hands`. |

### Reuso da arquitetura Cooldown-1 (preservacao)

| Componente Cooldown-1 | Comportamento em F2 |
|---|---|
| `BlockOneStarredHands.tsx` | **Extension**, nao alteracao. Cards ganham `onDragOver`/`onDrop` para aceitar prints. Comportamento existente (selecao manual + form) **inalterado**. Limite `MAX_STARS_PER_TOURNAMENT=3` reusado — inclui prints revisados. |
| `STARRED_HAND_TYPES`, `STARRED_HAND_SPOTS` | **Estendidos** — `+'spot_screenshot'` em types, `+'screenshot_pending'` em spots. Valores existentes preservados (back-compat). |
| `cooldown.ts` rotas (`POST/GET/DELETE /api/starred-hands`) | **Inalteradas.** F2 cria arquivo novo `server/routes/starred-hands.ts` para os endpoints novos (`/screenshot`, `/review`, `/pending`, `/:id/image`). Path `/api/starred-hands/:id` (DELETE) eh override pelo arquivo novo apenas onde necessario — verificar ordem de mount em F2. |
| Schema `starred_hands` | **Extensao** com 8 colunas nullable + back-fill para rows existentes. Lessons learned #7 (deprecation gradual). |
| `data-model.mermaid` | Atualizar com colunas novas quando Implementer mexer em schema (Sprint W1 da spec F2). |

### Mudancas em documentos relacionados (esta sprint)

- [`Docs/architecture/data-model-index.md`](data-model-index.md) — secao "Core" recebe
  registro das colunas novas em `starred_hands` (apenso, nao reescrita).
- CLAUDE.md secao 4 (env vars) — `SPOT_PURGE_CRON` quando Implementer aplicar.
- CLAUDE.md secao 6 (modelos) + secao 7 (endpoints) — registro dos endpoints novos.

### Multi-instance debt (heranca de F2 para F3)

| Componente | Debt |
|---|---|
| Disco local (`uploads/spot-screenshots/`) | Em PaaS efemero (Vercel) ou multi-instance (Railway scale > 1), arquivo gravado em A nao aparece em B. Mitigacao F3: ADR novo escolhe S3/R2; script `migrate-spot-storage-to-s3.mjs` faz move incremental. |
| Cron in-process | Dois servers agendam mesmo schedule; ambos disparam 04:00 UTC. Idempotencia SQL evita duplicate delete, mas duplica DB query + tentativas de unlink. Mitigacao F3: ADR novo escolhe entre lock distribuido (Postgres advisory) / scheduler externo (Vercel/Railway cron) / designated worker. |
| `<img>` cookie httpOnly | Em mobile native app, cookie nao funciona como em browser. Reavaliar para signed URL S3 em F3. |

### Cenarios de teste derivados (resumo para Test-Writer)

A spec ja lista cenarios completos em "Cenarios de Teste Derivados" (linha 446+). Os
diagramas adicionam:

- **Race condition do counter 10/sessao** (FLUXO 1, count + insert em transacao SELECT
  ... FOR UPDATE) — testar via 2 chamadas concorrentes ao endpoint.
- **Rollback de arquivo em erro de validacao pos-multer** (FLUXO 1, branches
  session_not_found, spot_limit_reached, no_tournament_in_session) — assertar que
  `spotStorage.delete(key)` foi chamado para nao deixar orfao no disco.
- **ENOENT em cron purge** (FLUXO 3) — arquivo ja sumiu do disco, row ainda existe; cron
  deve completar a delete da row sem incrementar `errorCount`.
- **Idempotencia do cron** (FLUXO 3) — chamar `purgeSpotScreenshots()` 2x consecutivos;
  segunda execucao retorna `purgedCount=0`.

### Posicao no Pipeline F2

```
PM-Spec (Docs/specs/sprint-f2-spot-screenshots.md)        -> APROVADO
   |
System-Architect (este apenso + ADRs 051/052/053 + 2 mermaids) -> APROVADO (2026-04-27)
   |
Test-Writer                                               -> PROXIMO
   |
Implementer (W1 backend + schema 0012 -> W2 frontend live -> W3 cooldown/studies -> W4 polish)
   |
Reviewer
   |
Deployer (deferido — manter local; F3 trigger eh deploy)
```
