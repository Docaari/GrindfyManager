# Spec: Cool-down Pos-Sessao — Plano de Implementacao

**Autor:** PM-Spec
**Data:** 2026-04-25
**Status:** Proposta
**Spec irma:** `B:\grindfy\Docs\specs\warm-up-refactor-plan.md` (Sprint W-1 ATIVO — warm-up cronometrado)
**Fonte primaria do metodo:** *A Anatomia de um Spot — Bloco C, Aula C.8 — Warm-up e Cool-down de Sessao*
**Fontes secundarias:** Tendler Vol 1/2 (tilt + cool-down), Weil 4-7-8 (respiracao), Zeigarnik (efeito de tarefas inacabadas), Hanin (IZOF), Stoyan Bres (cool-down review framework).

---

## Resumo

Cool-down e o ritual estruturado **pos-sessao** que fecha o ciclo de grind: extrai aprendizados das maos jogadas, faz catarse emocional dos tilts/erros, fixa licoes para a proxima sessao e prepara transicao para sono/descanso. Hoje o sistema **nao tem cool-down implementado** — apenas 3 campos orfaos em `preparation_logs` (`postSessionReview`, `goalsAchieved`, `lessonsLearned`) que jamais foram preenchidos pela UI.

Esta spec define a feature dedicada de Cool-down em fases, complementando a spec de warm-up que ja existe e esta em execucao (Sprint W-1). O cool-down se conecta ao `GrindSessionLive` no momento do encerramento da sessao, e e **opcional, skipavel, e adaptive** — sugerido com destaque quando a sessao apresenta red flags (profit muito negativo, IE baixa, sessao muito longa).

---

## Contexto

### Estado atual mapeado (2026-04-25)
- **Warm-up** existe parcialmente (~25% C8 implementado) e tem spec ativa em Sprint W-1.
- **Cool-down NAO existe.** Os 3 campos em `preparation_logs` sao orfaos.
- Spec de warm-up **formalmente defere** as features F-03 (CoolDownRunner), F-04 (captura de maos), F-05 (A/B/C Game Journal), F-14 (Sleep Gate), F-16 (Voice Journal). Esta spec **assume essas features**.
- Encerramento atual de sessao: `handleEndSession()` em `B:\grindfy\client\src\pages\GrindSessionLive.tsx` (linhas 522-556) calcula medias mentais, faz `PUT /api/grind-sessions/{id}` com `status='completed'`, abre `SessionSummaryModal` que mostra estatisticas + 1 textarea livre.

### Por que cool-down e prioritario agora
1. **Fechamento do ciclo C8:** sem cool-down, jogador acumula tilt residual → degradacao composta entre sessoes (Tendler).
2. **Captura de aprendizado:** maos criticas estreladas viram dataset estruturado para coaching/review.
3. **Higiene mental:** Zeigarnik closure + 4-7-8 + sleep transition → melhor recuperacao → proxima sessao melhor.
4. **Dados para Coach AI:** A/B/C journal + starred hands alimentam memory do coach com contexto altamente acionavel.

### Como o cool-down se conecta ao fluxo

**ATUALIZADO 2026-04-26:** spec irma `Docs/specs/session-end-wallet-reconciliation.md` (ADR-040) introduz passo intermediario de reconciliacao de banca antes do `SessionSummaryModal`. Cool-down agora ocorre APOS reconciliacao, e red flags sao calculadas com profit pos-reconciliation (sessao pode ficar mais negativa que estimativa intra-sessao).

```
[Encerrar Sessao] -> PUT /api/grind-sessions {status:completed}
                  -> [NOVO em ADR-040] WalletReconciliationDialog (skipavel)
                       -> GET /reconcilable-wallets
                       -> POST /reconcile-wallets {adjustments[]}
                       -> ajustes geram wallet_transactions
                          reason='session_result' source='auto_session'
                  -> SessionSummaryModal (recalcula profit/ROI pos-reconciliation)
                       -> NOVO: CTA "Iniciar Cool-down (~5min)"
                            (destacado se red flags detectadas)
                  -> CoolDownRunner (modal full-screen)
                       -> Bloco 1: starred hands + 4-7-8
                       -> Bloco 2: A/B/C Journal
                       -> [Sprint 2] Bloco 3: tilt review
                       -> [Sprint 2] Bloco 4: sleep gate
                  -> Resumo + persist + redirect
```

**Dependencia bloqueante:** Sprint Reconciliation deve mergear ANTES de Sprint Cooldown-1. Caso reconciliation seja skipada pelo usuario, fluxo segue normalmente — cooldown nao depende de ajustes terem sido feitos.

---

## Usuarios

- **Jogador profissional/semi-profissional de MTT** que encerrou sessao e quer fechar o ciclo mental + extrair aprendizado.
- **Jogador em downswing/tilt** (UX adaptive direciona com mais forca).
- **Jogador casual** que quer ferramenta minima (Quick Cool-down ~3min).

---

## User Stories (Given/When/Then)

### US-01: Encerramento normal com sugestao neutra
**Given** estou em `/grind/live` com sessao ativa, sem red flags (profit positivo, IE > 6, duracao < 6h),
**When** clico em "Encerrar Sessao",
**Then** o `SessionSummaryModal` abre com dois CTAs lado a lado: "Iniciar Cool-down (~5min)" (estilo neutro) e "Finalizar Sessao" (botao secundario), permitindo skip imediato sem fricao.

### US-02: Encerramento apos sessao problematica
**Given** estou em `/grind/live` com sessao ativa que teve `profit < -2*ABI` OU `focoMedio < 4` OU `interferenciasMedia > 7` OU `duration > 6h`,
**When** clico em "Encerrar Sessao",
**Then** o `SessionSummaryModal` mostra o CTA "Iniciar Cool-down (~5min)" destacado em amarelo + mensagem "Sua sessao teve sinais de fadiga/tilt. Recomendamos cool-down."

### US-03: Cool-down full path (Bloco 1 + 2)
**Given** cliquei em "Iniciar Cool-down" no resumo da sessao,
**When** o `CoolDownRunner` abre em modal full-screen,
**Then** o Bloco 1 (starred hands) e renderizado com cronometro visual de 5min nao-bloqueante e guia opcional de respiracao 4-7-8; ao avancar para Bloco 2 (A/B/C journal), 4 textareas estruturadas aparecem com cronometro de 5min e validacao soft (min 10 chars cada — pode pular).

### US-04: Quick Cool-down (~3min)
**Given** estou no `SessionSummaryModal` apos sessao normal e quero ritual minimo,
**When** clico em "Cool-down Rapido (~3min)",
**Then** abre `QuickCoolDownDialog` com (a) campo livre para 3 maos criticas (notas curtas) e (b) duas perguntas: "O que voce fez bem?" e "O que faria diferente?". Ao salvar, persiste em `cooldown_logs` com `mode='quick'`.

### US-05: Skip cool-down
**Given** estou no `SessionSummaryModal`,
**When** clico em "Finalizar Sessao",
**Then** o fluxo atual e preservado (redireciona para `/grind`, nada de cool-down e criado).

### US-06: Resumir cool-down apos abandono
**Given** iniciei o cool-down (POST /api/cooldown-logs criou um log com `completedAt=null`),
**When** fecho o modal sem completar,
**Then** ao reabrir a sessao no historico, o sistema mostra badge "Cool-down em rascunho" e oferece retomar de onde parei (PATCH atualiza `blocksCompleted`).

### US-07: Cool-down vira input do Coach AI (Sprint 3)
**Given** completei cool-down de sessao recente com starred hands tipo `tilt`,
**When** abro Coach AI tab `/grade`,
**Then** o coach tem acesso (via tool `coach.read_cooldown_history`) ao agregado das ultimas 5 sessoes e usa contexto para sugerir trabalho em tilt management.

---

## Requisitos Funcionais

### RF-01: Trigger e Gate Suave no SessionSummaryModal

**Descricao:** Apos encerrar sessao, oferecer cool-down como caminho opcional, com sugestao adaptive baseada em red flags.

**Regras de negocio:**
- Encerramento de sessao agora segue: PUT /api/grind-sessions {status:completed} -> WalletReconciliationDialog (skipavel, ADR-040) -> `SessionSummaryModal`.
- `summary` recebido por `detectRedFlags` deve usar profit/ROI **pos-reconciliation**. Se reconciliation skipou, summary fica como antes (sem ajustes adicionais).
- `SessionSummaryModal` ganha 3 CTAs no rodape (substitui os 2 atuais):
  1. **"Continuar Sessao"** (existente, inalterado)
  2. **"Cool-down Rapido (~3min)"** (novo, secundario)
  3. **"Iniciar Cool-down (~5min)"** (novo, primario; destacado AMARELO se red flags presentes)
  4. **"Finalizar Sessao"** (existente — agora com label "Pular cool-down e fechar")
- Red flags = qualquer uma das condicoes:
  - `profit < -2 * abiMed` (sessao perdedora pesada)
  - `focoMedio < 4` OU `inteligenciaEmocionalMedia < 4`
  - `interferenciasMedia > 7`
  - `duration > 360` (>6h em minutos)
- Se red flags: mensagem "Sua sessao teve sinais de fadiga/tilt. Recomendamos cool-down." aparece acima dos CTAs.
- Se sem red flags: mensagem neutra ausente, CTA primario nao tem destaque amarelo.

**Criterios de aceitacao:**
- [ ] Modal renderiza 3 CTAs novos sem quebrar testes existentes.
- [ ] Helper `detectRedFlags(summary): { hasFlags: boolean, reasons: string[] }` exportado e testavel.
- [ ] Quando `hasFlags=true`, CTA "Iniciar Cool-down" tem classe CSS `cooldown-cta-warning` (amarelo).
- [ ] Quando `hasFlags=false`, CTA tem classe `cooldown-cta-neutral`.
- [ ] Mensagem de aviso renderizada apenas quando `hasFlags=true`.
- [ ] Skip preserva fluxo atual (redirect `/grind`).

---

### RF-02: CoolDownRunner — Protocolo Cronometrado

**Descricao:** Modal full-screen orquestrador que executa blocos sequenciais com cronometro nao-bloqueante.

**MVP (Sprint Cooldown-1) — Blocos 1 + 2 apenas (~10min):**

#### Bloco 1 (5min) — Analise de Maos Criticas
- Lista torneios da sessao (vem de `session_tournaments` filtrado por `sessionId`), ordenados por `buyIn DESC`.
- Para cada torneio, usuario pode "estrelar" ate 3 maos com:
  - **Type:** `tilt | leak | soulread | hero-call | cooler | mistake | sick | other`
  - **Spot:** `preflop | flop | turn | river | icm | final-table | bubble | other`
  - **Notes:** texto livre, max 500 chars
- Cronometro visual countdown 5min (nao bloqueia avanco).
- `BreathingGuide` componente opcional (toggle): animacao 4s inhale / 7s hold / 8s exhale x3.

#### Bloco 2 (5min) — A/B/C Game Journal
- 4 perguntas estruturadas em sequencia:
  - **A-Game (1min):** "O que voce fez de bom hoje?" — array de 1 a 3 itens (textareas dinamicas).
  - **B-Game (1min):** "O que ficou no meio do caminho? (decisoes boas mas nao otimas)" — array 1 a 3 itens.
  - **C-Game (2min):** "Quais foram seus erros conscientes? Que padrao voce reconhece?" — textarea unica multiline.
  - **Licao (1min):** "Uma licao pratica para a proxima sessao (1 frase)" — textarea single line, max 200 chars.
- Validacao soft: min 10 chars por campo. Pode pular avancando, mas warning visual.
- Ao concluir Bloco 2 no MVP: salva log e fecha modal.

**Sprint Cooldown-2 — Blocos 3 + 4 (+~5min):**

#### Bloco 3 (3min) — Revisao de Tilt Triggers
- 3 sliders 0-10:
  - "Senti tilt durante a sessao?"
  - "Continuei jogando em tilt?"
  - "Quao presente eu estava? (mindfulness)"
- Checklist de gatilhos de tilt (multi-select): `cooler | slowroll | big-bluff-fail | downswing | distracao | fome | sono | brigha-interpessoal | outro`.
- Texto livre opcional: "Como agir diferente da proxima vez?"

#### Bloco 4 (2min) — Sleep Transition (Zeigarnik Closure)
- Toggle: "Vou dormir agora?" (sim/nao)
- Se SIM:
  - Sugestao: "Apague seu plano" — botao "Marcar plano de hoje como fechado" (atualiza `weeklyPlans` ou flag em `grindSession.planClosed=true`).
  - `BreathingGuide` 4-7-8 final destacado.
  - Audio opcional (reusa `AudioLibraryDialog` filtrando categoria `sleep-transition`).
  - Gate suave: ao salvar, seta `cooldown_logs.sleepIntent=true` e `users.dashboardSnoozedUntil = nextMorning(8h)`. Dashboard mostra splash "Bom dia! Pronto para a proxima?" antes desse horario.
- Se NAO:
  - Sugestao de atividade neutra (pick aleatorio de pool: "Ler livro 20min", "Caminhar 10min", "Banho quente", "Conversar com alguem", "Cozinhar", "Tarefa domestica leve").
  - Lembra "Cool-down completo na proxima sessao".

**Versao minima — Quick Cool-down (~3min, MVP):**
- Botao alternativo no `SessionSummaryModal`: "Cool-down Rapido (~3min)".
- Renderiza apenas:
  - 3 maos criticas (textareas curtas, sem campos type/spot detalhados — opcionais).
  - 2 perguntas: "O que voce fez bem?" + "O que faria diferente?"
- Ao salvar: persiste `cooldown_logs` com `mode='quick'` e `blocksCompleted=['quick']`.

**Criterios de aceitacao:**
- [ ] `CoolDownRunner` renderiza Bloco 1 e Bloco 2 sequencialmente (next/back navegacao).
- [ ] PATCH incremental para `/api/cooldown-logs/:id` ao avancar bloco (autosave).
- [ ] Cronometro visual nao bloqueia avanco (botao "Avancar" sempre habilitado).
- [ ] `BreathingGuide` toggle on/off, animacao roda em loop 3x quando ativo.
- [ ] Validacao soft no Bloco 2: campos vazios mostram warning amarelo, mas avanco e permitido.
- [ ] `QuickCoolDownDialog` renderiza apenas 5 campos (3 hands + 2 perguntas), salva como `mode='quick'`.

---

### RF-03: Schema Delta

**Tabela nova: `cooldown_logs`**
```typescript
export const cooldownLogs = pgTable("cooldown_logs", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  sessionId: varchar("session_id").notNull().references(() => grindSessions.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  durationMinutes: integer("duration_minutes"),
  mode: varchar("mode").notNull().default("full"), // 'full' | 'quick'
  blocksCompleted: jsonb("blocks_completed").$type<string[]>().default([]),
  abGameAnswers: jsonb("ab_game_answers").$type<{
    aGame: string[];
    bGame: string[];
    cGame: string;
    lesson: string;
  }>(),
  tiltSelfAssessment: jsonb("tilt_self_assessment").$type<{
    feltTilt: number;       // 0-10
    keptTilting: number;    // 0-10
    presence: number;       // 0-10
    triggers: string[];
    action: string;
  }>(),
  sleepIntent: boolean("sleep_intent"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("uq_cooldown_user_session").on(table.userId, table.sessionId),
  index("idx_cooldown_user_completed").on(table.userId, table.completedAt),
]);
```

**Tabela nova: `starred_hands`**
```typescript
export const starredHands = pgTable("starred_hands", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  sessionId: varchar("session_id").notNull().references(() => grindSessions.id, { onDelete: "cascade" }),
  sessionTournamentId: varchar("session_tournament_id").notNull().references(() => sessionTournaments.id, { onDelete: "cascade" }),
  cooldownLogId: varchar("cooldown_log_id").references(() => cooldownLogs.id, { onDelete: "set null" }),
  type: varchar("type").notNull(), // 'tilt' | 'leak' | 'soulread' | 'hero-call' | 'cooler' | 'mistake' | 'sick' | 'other'
  spot: varchar("spot").notNull(), // 'preflop' | 'flop' | 'turn' | 'river' | 'icm' | 'final-table' | 'bubble' | 'other'
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_starred_user_session").on(table.userId, table.sessionId),
  index("idx_starred_user_type").on(table.userId, table.type),
]);
```

**Coluna nova em `grind_sessions`** (Sprint Cooldown-2):
- `planClosed: boolean("plan_closed").default(false)` — usado pelo Sleep Gate (RF-02 Bloco 4).

**Coluna nova em `users`** (Sprint Cooldown-2):
- `dashboardSnoozedUntil: timestamp("dashboard_snoozed_until")` — usado pelo Sleep Gate suave.

**Campos depreciados (Sprint Cooldown-3):**
- `preparation_logs.postSessionReview`, `goalsAchieved`, `lessonsLearned` — marcar `@deprecated` em comentario, manter ate Cooldown-3 para backwards-compat.

**Criterios de aceitacao:**
- [ ] `db:push` aplica schema sem migrations manuais.
- [ ] Constraint unique `(userId, sessionId)` em `cooldown_logs` previne duplicatas.
- [ ] FK validation: `starred_hands.sessionTournamentId` deve pertencer a `starred_hands.sessionId` (validado em rota POST, nao no DB).
- [ ] Zod schemas `insertCooldownLogSchema`, `insertStarredHandSchema`, `updateCooldownLogSchema` exportados em `shared/schema.ts`.

---

### RF-04: Endpoints

| Metodo | Rota | Auth | Rate Limit | Descricao |
|---|---|---|---|---|
| POST | `/api/cooldown-logs` | JWT | 10/min | Criar log (start). Body: `{sessionId, mode}`. Retorna `{id}` |
| PATCH | `/api/cooldown-logs/:id` | JWT | 30/min | Atualizar incrementalmente (autosave). Body: parcial |
| GET | `/api/cooldown-logs/:sessionId` | JWT | — | Buscar log por session (1:1) |
| GET | `/api/cooldown-logs` | JWT | — | Historico paginado do usuario (`?page=1&pageSize=20`) |
| POST | `/api/starred-hands` | JWT | 30/min | Estrelar mao. Body: `{sessionId, sessionTournamentId, cooldownLogId?, type, spot, notes?}` |
| GET | `/api/starred-hands` | JWT | — | Listar (`?sessionId=X` ou `?type=tilt&period=30d`) |
| DELETE | `/api/starred-hands/:id` | JWT | — | Desfazer star |

**Criterios de aceitacao:**
- [ ] POST `/api/cooldown-logs` rejeita 409 se ja existe log para `(userId, sessionId)`.
- [ ] POST `/api/starred-hands` valida que `sessionTournamentId.sessionId === body.sessionId` (400 se mismatch).
- [ ] Rotas em arquivo dedicado: `B:\grindfy\server\routes\cooldown.ts` (montado em `server/routes/index.ts`).
- [ ] Storage layer ganha metodos: `storage.createCooldownLog`, `updateCooldownLog`, `getCooldownLogBySession`, `listCooldownLogs`, `createStarredHand`, `listStarredHands`, `deleteStarredHand`.
- [ ] Todos retornam JSON sem wrapper (padrao do projeto).

---

### RF-05: Componentes UI Novos

**Diretorio:** `B:\grindfy\client\src\components\cooldown\`

```
cooldown/
├── CoolDownRunner.tsx          — modal full-screen orquestrador (state local + autosave)
├── BlockOneStarredHands.tsx    — Bloco 1 (Sprint 1)
├── BlockTwoABCJournal.tsx      — Bloco 2 (Sprint 1)
├── BlockThreeTiltReview.tsx    — Bloco 3 (Sprint 2)
├── BlockFourSleepGate.tsx      — Bloco 4 (Sprint 2)
├── BreathingGuide.tsx          — animacao 4-7-8 (Sprint 1; reusavel em warm-up via prop)
├── BlockTimer.tsx              — cronometro visual nao-bloqueante (Sprint 1)
├── QuickCoolDownDialog.tsx     — versao 3min (Sprint 1)
└── StarredHandPicker.tsx       — sub-componente (lista torneios + UI de estrela)
```

**Convencoes:**
- Cada Block recebe props `{value, onChange, onNext, onBack, blockIndex, totalBlocks}`.
- `CoolDownRunner` orquestra via React state local (sem Context — simplicidade).
- Reusar `MentalStateCard` e `PersonalNotesCard` quando aplicavel (Bloco 3).
- Estilizacao: Tailwind + shadcn/ui (`Dialog`, `Button`, `Slider`, `Textarea`, `Badge`).
- I18n: hardcoded pt-BR (consistente com resto do projeto).

**Criterios de aceitacao:**
- [ ] `CoolDownRunner` renderiza Bloco N apenas (nao todos juntos).
- [ ] Botao "Voltar" disponivel a partir do Bloco 2.
- [ ] Botao "Avancar" sempre habilitado (cronometro nao bloqueia).
- [ ] State persistido via PATCH apos cada `onNext` (debounce 1s para evitar spam).
- [ ] Fechar modal abruptamente preserva log com `completedAt=null` (rascunho).

---

### RF-06: Analytics e Correlacoes (Sprint Cooldown-2)

**Metricas novas no dashboard `/profile` aba "Mental":**
1. **Cool-down compliance** — gauge `% de sessoes com cool-down completo nos ultimos 30d`.
2. **Distribuicao de tipos de maos estrela** — donut chart (`tilt`, `leak`, `mistake`, etc).
3. **Licoes mais frequentes** — word cloud das respostas de `lesson` (tokenizacao simples por palavras > 3 chars, top 30).
4. **Correlacao cool-down x performance da proxima sessao** — comparar ROI/profit das sessoes que tiveram cool-down vs as que nao tiveram (media movel 7 sessoes).

**Endpoints novos:**
| Metodo | Rota | Descricao |
|---|---|---|
| GET | `/api/analytics/cooldown-compliance?period=30d` | `{total: 30, completed: 18, complianceRate: 0.6}` |
| GET | `/api/analytics/starred-hands-distribution?period=30d` | `[{type: 'tilt', count: 12}, ...]` |
| GET | `/api/analytics/cooldown-impact?period=30d` | `{withCooldown: {avgRoi}, withoutCooldown: {avgRoi}, delta}` |
| GET | `/api/analytics/top-lessons?period=30d` | `[{token: 'paciencia', count: 8}, ...]` |

**Criterios de aceitacao:**
- [ ] Analytics endpoints respeitam ownership (so retorna dados do `userId` autenticado).
- [ ] Cache TTL 5min nos 4 endpoints (consistente com bankroll).
- [ ] Componente `MentalAnalyticsTab.tsx` em `client/src/components/profile/` ou similar agrega os 4 widgets.

---

### RF-07: Integracao com Coach AI (Sprint Cooldown-3)

**Page context novo:**
- `pageContext.cooldownLog` — quando user esta visualizando cool-down passado em historico (futuro `/grind/history/:id` com tab "Cool-down").
- Schema Zod whitelist consistente com ADR-025.

**Tool novo:** `coach.read_cooldown_history`
- Input: `{userId, period: '7d' | '30d' | '90d'}`
- Output: `{
  totalSessions: number,
  cooldownCount: number,
  starredHands: {byType: Record<string, number>, total: number},
  recentLessons: string[] // top 10
}`
- Wrap pattern consistente com ADR-024 (tool result wrapping).

**Coach prompt block novo:**
- Bloco "rituais de cool-down recentes" no system prompt (last 5 sessions agregadas).
- Cacheable (entra no cache strategy de ADR-019).

**Criterios de aceitacao:**
- [ ] ADR-041 documentando a decisao + tool registry pattern (consistente com ADR-023).
- [ ] Tool e testado em `tests/unit/coach/tools/cooldown-history.test.ts`.
- [ ] Page context schema validado por Zod whitelist.
- [ ] Sanitizer remove campos sensiveis (notes pessoais detalhados — manter so contagem por tipo).

---

### RF-08: Atualizacao da Spec de Warm-up

**Arquivo:** `B:\grindfy\Docs\specs\warm-up-refactor-plan.md`

**Mudancas obrigatorias:**
1. **Topo do arquivo (apos linha 9):** adicionar nota:
   > **Cool-down agora tem spec dedicada — ver `cooldown-refactor-plan.md`. Esta spec mantem foco exclusivo em warm-up.**
2. **Linhas 11-13 (sub-titulo "AJUSTE DE ESCOPO"):** alterar texto de "Cool-down e DEFERIDO" para "Cool-down esta especificado em spec dedicada".
3. **Linhas 25-34 (features deferidas):** trocar marcador ❌ DEFERIDO por SETA APONTANDO PARA NOVA SPEC nas features F-03, F-04, F-05, F-14, F-16 e nas tabelas `starred_hands`, `abc_game_logs`, `voice_journals`. Exemplo: `**F-03** CoolDownRunner -> ver cooldown-refactor-plan.md`.

**NAO MEXER em mais nada.** Sprint W-1 continua valido para implementacao imediata; nenhum esforco de warm-up muda.

**Criterios de aceitacao:**
- [ ] Diff da spec de warm-up tem apenas adicoes/edicoes nas 3 secoes acima.
- [ ] `git diff` na warm-up spec eh menor que 30 linhas.

---

### RF-09: Testes (Red Phase pre-merge)

**Unit:**
- [ ] `tests/unit/cooldown/schemas.test.ts` — Zod positive + negative para `insertCooldownLogSchema`, `insertStarredHandSchema`, `updateCooldownLogSchema`.
- [ ] `tests/unit/cooldown/redFlags.test.ts` — helper `detectRedFlags()` cobrindo 4 condicoes + edge cases (NaN, zero ABI, sessao 0min).
- [ ] `tests/unit/cooldown/aggregations.test.ts` — agregacao starred hands por tipo + cooldown impact calc.

**Component:**
- [ ] `tests/unit/cooldown/CoolDownRunner.test.tsx` — renderiza Bloco 1 inicial, navega next/back, autosave PATCH, fecha modal preserva rascunho.
- [ ] `tests/unit/cooldown/BlockOneStarredHands.test.tsx` — adicionar/remover stars, max 3 por torneio, validacao type+spot obrigatorios.
- [ ] `tests/unit/cooldown/BlockTwoABCJournal.test.tsx` — 4 perguntas, validacao soft (warning sem bloqueio), avancar com vazio mostra warning.
- [ ] `tests/unit/cooldown/QuickCoolDownDialog.test.tsx` — 5 campos, salva com `mode='quick'`.
- [ ] `tests/unit/cooldown/SessionSummaryModalCTAs.test.tsx` — 3 CTAs renderizados; com red flags CTA tem classe `cooldown-cta-warning`; sem red flags classe `cooldown-cta-neutral`.

**Integration:**
- [ ] `tests/integration/cooldown/cooldown-routes.test.ts` — POST/PATCH/GET ciclo completo, 409 em duplicata, 400 em FK inconsistency, ownership enforced (404 se outro user).
- [ ] `tests/integration/cooldown/starred-hands-routes.test.ts` — POST cria, GET filtra por session/type, DELETE remove, ownership.

**E2E (smoke):**
- [ ] `tests/e2e/cooldown-flow.test.ts` — encerrar sessao -> CTA destacado (red flags simuladas) -> abrir runner -> estrelar 2 maos -> A/B/C -> fechar -> verificar `cooldown_logs` + `starred_hands` no DB.

**Nao regredir:**
- [ ] Suite atual (4138 testes verdes) deve permanecer green; alteracao em `SessionSummaryModal` nao quebra `tests/unit/grind-session-live/SessionSummaryModal.test.tsx` existente (adicionar novos asserts, nao alterar antigos).

---

### RF-10: Documentacao

- [ ] **ADR-041:** `B:\grindfy\Docs\architecture\decisions\041-cooldown-dedicated-spec-and-schema.md` — justifica por que cool-down e spec separada e schema novo (vs. estender `preparation_logs`).
- [ ] **ADR-042 (Sprint 3):** `042-cooldown-coach-tool-registry.md` — pattern do `read_cooldown_history` tool.
- [ ] **Sequence diagram:** `B:\grindfy\Docs\architecture\sequence-cooldown-flow.mermaid` — fluxo completo encerramento -> runner -> persist.
- [ ] **Atualizar `data-model.mermaid`:** adicionar `cooldown_logs` e `starred_hands` com FKs.
- [ ] **Atualizar `CLAUDE.md`:** secao 7 (endpoints) + secao 6 (modelos de dados); registrar erros conhecidos da IA quando aplicavel.

---

## Requisitos Nao-Funcionais

- **Performance:** PATCH `/api/cooldown-logs/:id` deve responder < 150ms p95 (autosave nao pode laggar UX).
- **Disponibilidade:** falha em endpoint de cool-down NAO bloqueia encerramento de sessao (try/catch + toast neutro). Cool-down e opcional por design.
- **Privacidade:** notas pessoais (`abGameAnswers.cGame`, etc) NAO sao expostas em endpoints de analytics ou coach tool — apenas tokenizacao agregada para `top-lessons`.
- **Acessibilidade:** modal full-screen tem trap focus + ESC fecha (com confirmacao se ha rascunho); cronometros tem aria-live polite.
- **Mobile:** Quick Cool-down deve funcionar em viewport 360px (testar com testing-library viewport simulation).

---

## Endpoints Previstos (resumo)

| Metodo | Rota | Auth | Sprint |
|---|---|---|---|
| POST | /api/cooldown-logs | JWT | 1 |
| PATCH | /api/cooldown-logs/:id | JWT | 1 |
| GET | /api/cooldown-logs/:sessionId | JWT | 1 |
| GET | /api/cooldown-logs | JWT | 1 |
| POST | /api/starred-hands | JWT | 1 |
| GET | /api/starred-hands | JWT | 1 |
| DELETE | /api/starred-hands/:id | JWT | 1 |
| GET | /api/analytics/cooldown-compliance | JWT | 2 |
| GET | /api/analytics/starred-hands-distribution | JWT | 2 |
| GET | /api/analytics/cooldown-impact | JWT | 2 |
| GET | /api/analytics/top-lessons | JWT | 2 |

---

## Modelos de Dados Afetados

### Novas tabelas
- `cooldown_logs` — 1:1 com `grind_sessions`
- `starred_hands` — N:1 com `grind_sessions`, N:1 com `session_tournaments`, N:1 opcional com `cooldown_logs`

### Colunas novas (Sprint 2)
- `grind_sessions.planClosed` — boolean default false
- `users.dashboardSnoozedUntil` — timestamp nullable

### Colunas depreciadas (Sprint 3)
- `preparation_logs.postSessionReview`
- `preparation_logs.goalsAchieved`
- `preparation_logs.lessonsLearned`

---

## Cenarios de Teste Derivados

### Happy Path
- [ ] Usuario sem red flags encerra sessao -> ve 3 CTAs neutros -> abre full cool-down -> completa Bloco 1 (2 hands) + Bloco 2 (4 respostas) -> log persiste com `completedAt!=null` e `blocksCompleted=['hands', 'abc']`.

### Validacao de Input
- [ ] POST `/api/cooldown-logs` sem `sessionId` -> 400.
- [ ] POST `/api/starred-hands` com `type` invalido -> 400.
- [ ] POST `/api/starred-hands` com `sessionTournamentId` que nao pertence ao `sessionId` -> 400.

### Regras de Negocio
- [ ] Tentar criar 2 cooldown_logs para mesma sessao -> 409.
- [ ] Estrelar 4a mao no mesmo torneio (limite 3) -> 400 ou UI bloqueia botao.
- [ ] Quick Cool-down salva com `mode='quick'`, blocosCompleted=['quick'].
- [ ] Red flag detection: profit=-100, abiMed=10 -> hasFlags=true (profit < -2*ABI).
- [ ] Red flag detection: profit=+100, foco=8, IE=8, duration=120min -> hasFlags=false.

### Edge Cases
- [ ] Sessao com 0 break feedbacks (medias = 0) -> red flags so trigger por `duration > 6h`.
- [ ] Sessao com `abiMed=0` -> usar `profit < -50` USD como fallback (evitar div/0).
- [ ] Modal fechado abruptamente -> `cooldown_logs.completedAt=null` preservado, reabrir sessao mostra "rascunho".
- [ ] Cool-down ja completado -> SessionSummaryModal NAO mostra CTAs de cool-down (apenas "Finalizar").
- [ ] Sleep Gate `dashboardSnoozedUntil` no passado -> nao bloqueia.

### Ownership
- [ ] User A nao consegue GET `/api/cooldown-logs/:idDoUserB` -> 404.
- [ ] User A nao consegue DELETE `/api/starred-hands/:idDoUserB` -> 404.

---

## Fora de Escopo

- **Voice Journal** (F-16 da spec de warm-up) — NAO faz parte desta spec; permanece deferido.
- **Captura automatica de hand history** — usuario digita notas manualmente; integracao com hand replayers e item futuro.
- **Compartilhamento social de cool-down** — sem export PDF, sem share link nesta spec.
- **Sleep tracking biometrico** — toggle "vou dormir" e self-report; integracao com wearables fora de escopo.
- **Edicao retroativa de cool-down** — apos `completedAt!=null`, log e read-only.
- **Cool-down de torneio individual** (vs. sessao inteira) — granularidade e sempre `grind_session`.
- **Notificacoes push lembrando de cool-down** — fora de escopo (Coach Sprint 3 pode sugerir, mas nao envia push).

---

## Dependencias

### Bloqueantes (devem estar mergeadas antes de Sprint Cooldown-1)
1. **Sprint W-1 (warm-up cronometrado)** — `BreathingGuide` e `BlockTimer` podem ser extraidos do warm-up se ja existirem; senao, criados aqui e reutilizados em warm-up depois.
2. **Refatoracao GradePlanner / tournament-types** — se houver mudancas pendentes em `session_tournaments`, mergear antes para evitar conflito FK em `starred_hands`.
3. **Sprint Reconciliation (`Docs/specs/session-end-wallet-reconciliation.md`, ADR-040)** — passo intermediario obrigatorio entre `handleEndSession` e `SessionSummaryModal`. Cool-down precisa do summary pos-reconciliation para calcular red flags com profit ja ajustado.

### Nao bloqueantes
- Sprint Coach-2a (page context) — pode ser paralelizado; integracao Coach (RF-07) so em Sprint Cooldown-3.

---

## Phasing

| Sprint | Escopo | Esforco est. |
|---|---|---|
| **Cooldown-1** (P0, MVP) | Schema + RF-01 (gate) + RF-02 Blocos 1+2 + Quick + RF-03 + RF-04 (CRUD) + RF-09 testes core + RF-10 ADR-041 + sequence diagram + RF-08 (update warm-up spec) | ~5 dias |
| **Cooldown-2** (P1) | RF-02 Blocos 3+4 + Sleep Gate (`planClosed`, `dashboardSnoozedUntil`) + `BreathingGuide` integrado + RF-06 (analytics) + testes | ~4 dias |
| **Cooldown-3** (P2) | RF-07 (Coach AI tool + page context + ADR-042) + deprecation `preparation_logs.*` orfaos + correlacao cool-down x performance | ~3 dias |

**Total ~12 dias.**

---

## Riscos

| Risco | Mitigacao |
|---|---|
| `SessionSummaryModal` ganha 3 CTAs e quebra testes existentes | RF-09 explicita: nao alterar asserts antigos, so adicionar novos. |
| `db:push` falha por FK em `starred_hands.sessionTournamentId` quando torneio e deletado | `onDelete: cascade` + teste de integracao cobrindo deletion. |
| Cronometro nao-bloqueante confunde usuario (parece que precisa esperar) | UX: label "X min sugeridos" em vez de "X min restantes"; botao "Avancar" sempre habilitado e visivel. |
| Autosave PATCH spam servidor durante typing | Debounce 1s no client + rate limit 30/min no server. |
| Coach tool expoe dados sensiveis (notas C-Game) | RF-07 sanitizer agrega so contagens por tipo, nao expoe texto livre. |
| Vitest 4 + jsdom quebra com Dialog Radix | Reusar polyfills ja instalados em `tests/setup.ts` (ResizeObserver, etc). |

---

## Notas de Implementacao (sugestoes ao Implementer)

- **Reuse over rewrite:** `BreathingGuide` e `BlockTimer` provavelmente ja existem em embriao no warm-up Sprint W-1. Coordenar com Implementer de warm-up para extrair em diretorio compartilhado (ex: `client/src/components/rituals-shared/`) se duplicacao surgir.
- **State machine simples:** `CoolDownRunner` usa `useReducer` com states `{currentBlock, draft, isSaving}`. Evitar Context API.
- **Optimistic UI no PATCH:** mostrar "salvando..." brevemente, mas nao bloquear navegacao.
- **shadcn/ui:** usar `Dialog` para modal, `Slider` para tilt assessment, `Textarea` para journal. NAO inventar primitives novos.
- **Storage methods:** seguir pattern existente — adicionar em `server/storage.ts`, exportar via interface, mockar em testes via `vi.spyOn(storage, 'createCooldownLog')`.
- **Erros conhecidos da IA aplicaveis:** evitar `try/catch generico` (vide CLAUDE.md secao 9 "Engolir erros transientes"); evitar `useState local em hook que precisa persistir` (usar React Query cache se cool-down draft precisar sobreviver re-mount); evitar `markdown splittado por tags inline` (no journal C-Game user pode escrever markdown — renderizar como texto plain por enquanto).

---

## Verificacao Final (PM-Spec checklist)

- [x] Cada requisito tem criterios de aceitacao verificaveis.
- [x] Cenarios de teste cobrem happy path, validacao, regras, edge cases, ownership.
- [x] Secao "Fora de Escopo" preenchida.
- [x] Endpoints listados com metodo, rota, auth, sprint.
- [x] Modelos de dados documentados com campos, FKs, constraints.
- [x] Phasing claro (3 sprints, ~12 dias).
- [x] Dependencias e riscos explicitados.
- [x] Spec independente o suficiente para `system-architect` desenhar ADRs/diagramas e `test-writer` escrever testes red-phase.
