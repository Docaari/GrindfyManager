# Spec: Warm-up Sprint W-1 — Fundação Cronometrada + Gate Go/No-Go

**Versão:** 1.0
**Data:** 2026-04-25
**Autor:** PM-Spec
**Status:** Proposta
**Pré-requisito:** `Docs/specs/warm-up-refactor-plan.md` (plano estratégico aprovado)
**Próximo agente sugerido:** System-Architect (criar diagramas C4 + ADRs) → Test-Writer

---

## 1. Sumário Executivo

A página `/mental` hoje é um warm-up genérico (checklist solto + 4 sliders + score 60/40 decorativo) que cobre apenas ~25% do método C8 do fundador e, crucialmente, **não bloqueia o jogador de iniciar grind em estado emocional ruim**. Esta sprint substitui essa implementação pelo **WarmUpRunner** — componente fullscreen, cronometrado, com 5 blocos sequenciais de ~2 minutos cada (10 min totais) — e introduz um **soft-gate Go/No-Go** baseado em check emocional 0-10 que protege o jogador de sessões -EV em dias ruins.

A spec entrega duas features do plano (F-01 WarmUpRunner e F-02 Gate Go/No-Go) com escopo deliberadamente reduzido: **cool-down está deferido** (será sprint futura). Cria a tabela `warmup_rituals` (substitui semanticamente `preparation_logs` mas convive com ela por 60 dias para compat), três endpoints REST (`POST /api/warmup-rituals`, `GET /api/warmup-rituals/latest`, `GET /api/warmup-rituals`), e sete componentes React novos. Mantém rota `/mental` (rename para `/rituals` ficou para futuro). Mantém permission `mental_prep_access`.

O gate é **soft**: se o check emocional < 6, abre modal "Não jogar hoje" com sugestões alternativas; o jogador pode sobrescrever com confirmação dupla, mas o override é registrado em telemetria para análise posterior. O botão "Iniciar Grind" no `/mental` só habilita se houve warm-up completo nos últimos 30 minutos E (score ≥ 6 OU override registrado).

UX é **mobile-first** — o jogador faz warm-up no celular antes de abrir o cliente de poker no PC. Áudio de respiração 4-4-4-4 é animação visual nesta sprint (áudios curados ficam para W-4). Drill PFC do Bloco 3 é cronômetro 4 min + link externo opcional + checkbox de conclusão (integração com Trainer interno fica para sprint posterior).

Esforço estimado: 3-4 sprints-dev. Esta spec decompõe em 14 tarefas atômicas para o Test-Writer/Implementer consumirem.

---

## 2. Escopo

### 2.1 In-Scope (entra nesta sprint)

- **WarmUpRunner** fullscreen com timer, navegação next/prev entre blocos, pause/resume, abort com confirmação.
- **Bloco 1** — Check-in emocional + respiração caixa 4-4-4-4 com animação visual (5 ciclos), pergunta "Estou OK pra jogar agora? (0-10)".
- **Bloco 2** — Foco da semana: 3 heurísticas editáveis manualmente nesta sprint (em W-2 virá de Sunday Review). Persistidas em `user_settings.weeklyHeuristics`.
- **Bloco 3** — Drill de ativação PFC: timer 4 min + link externo opcional configurável (default GTO Wizard) + checkbox "completei drill".
- **Bloco 4** — Setup físico: 6 toggles (água 1L · snacks · celular avião · notificações off · fone · luz).
- **Bloco 5** — Intenção da sessão: 3 campos textuais (Foco / Plano anti-tilt / Critério de encerramento), os três obrigatórios para concluir.
- **Soft-gate Go/No-Go** — se score < 6, modal "Não jogar hoje" com sugestões; override possível com confirmação dupla, registrado em telemetria.
- **Botão "Iniciar Grind"** no hub `/mental` — habilitado apenas se há warm-up completo nos últimos 30 min E (score ≥ 6 OU override).
- **Tabela `warmup_rituals`** — schema novo, separada de `preparation_logs`.
- **Endpoints**: `POST /api/warmup-rituals`, `GET /api/warmup-rituals/latest`, `GET /api/warmup-rituals` (histórico).
- **Hub `/mental`** redesenhado: header "Warm-up", card primário "Iniciar warm-up (10min)", card secundário "Histórico", subseção rebaixada "Ferramentas de Apoio" com Meditation/Visualization/AudioLibrary mantidos como dialogs.
- **Telemetria** de eventos: `warmup_started`, `block_completed`, `emotional_check_submitted`, `gate_triggered`, `override_used`, `warmup_completed`, `warmup_aborted`.

### 2.2 Out-of-Scope (NÃO entra nesta sprint)

- **Cool-down** (CoolDownRunner, captura de mãos starradas, ABC journal, 4-7-8 breathing, Sleep Gate) — deferido por decisão do fundador (2026-04-25).
- **Versão mínima 3 min** — fica para Sprint W-3 (ex-W-4).
- **Sunday Review** (planejamento dominical, push notification, definição automática das 3 heurísticas) — fica para Sprint W-2 (ex-W-3).
- **IZOF tracker** (zona ótima individual baseada em ROI × score) — fica para W-2.
- **Mapa de leak emocional (C3)** — W-2.
- **Coach AI Weekly Protocol Review** — W-2.
- **Implementation Intentions library** (picker de plano anti-tilt no Bloco 5) — campo continua texto livre nesta sprint; library vem em W-2.
- **Áudios curados de respiração** (versão BR) — apenas animação visual nesta sprint; áudio fica para W-4.
- **Caffeine Tracker, Pre-Bullet Ritual, Sleep Gate, Compliance Dashboard rico** — todos para W-3.
- **Voice Journal, Biometria, Export PDF, Share link** — W-4.
- **Renomear rota `/mental` → `/rituals`** — mantém `/mental` por compat de muscle memory.
- **Gate hard (bloqueio sem override)** — esta sprint usa soft-gate; decisão validada pelo fundador.
- **Migração definitiva de `preparation_logs`** — tabela legada permanece em uso por `MentalPrep` legado durante 60 dias; após validação, deprecada em sprint futura.

---

## 3. User Stories

**US-01 — Iniciar warm-up rapidamente do hub `/mental`**
Como jogador profissional de MTT, quero abrir `/mental` e iniciar o warm-up de 10 min com 1 clique, para não perder tempo decidindo "o que fazer" antes da sessão.
- **Given** o usuário está autenticado com `mental_prep_access` na rota `/mental`
- **When** clica no botão "Iniciar warm-up (10min)" no card primário
- **Then** o WarmUpRunner abre em fullscreen no Bloco 1, com timer começando em 02:00 e respiração 4-4-4-4 animada
- **And** evento `warmup_started` é registrado com `userId, startedAt, sessionId`

**US-02 — Bloco 1: respirar e fazer check emocional honesto**
Como jogador, quero ser guiado por 5 ciclos de respiração caixa antes de responder "estou OK pra jogar?", para que minha resposta reflita estado calibrado, não reativo.
- **Given** estou no Bloco 1 do WarmUpRunner
- **When** os 5 ciclos de respiração 4-4-4-4 terminam (animação completa, ~80s) ou clico em "Pular animação"
- **Then** aparece o input de check emocional 0-10 (slider ou stepper)
- **And** preciso submeter o score para avançar ao Bloco 2

**US-03 — Gate Go/No-Go quando score < 6**
Como jogador em dia ruim, quero ser confrontado com a decisão de jogar ou não quando reporto score < 6, para evitar sessões -EV por inércia.
- **Given** submeti score < 6 no Bloco 1
- **When** o sistema detecta score abaixo do threshold
- **Then** modal "Não jogar hoje" abre com 3 sugestões (estudo, descanso, conversa) e dois botões: "Não vou jogar" e "Ainda quero jogar"
- **And** evento `gate_triggered` é registrado com o score

**US-04 — Override do gate com confirmação dupla**
Como jogador adulto, quero poder ignorar o gate se decidir jogar mesmo assim, mas com fricção suficiente para garantir que é decisão consciente.
- **Given** estou no modal "Não jogar hoje" após score < 6
- **When** clico em "Ainda quero jogar"
- **Then** aparece confirmação dupla "Tem certeza? Sessões em estado mental abaixo de 6 são estatisticamente -EV. [Sim, registrar override] [Cancelar]"
- **And** ao confirmar, override é registrado em telemetria (`override_used` + `decisionToPlay=true`) e o ritual continua para Bloco 2

**US-05 — Concluir warm-up completo e iniciar grind**
Como jogador com ritual completo, quero ter o botão "Iniciar Grind" habilitado imediatamente ao terminar o warm-up, para fluir direto para a sessão.
- **Given** completei os 5 blocos do warm-up nos últimos 30 min com score ≥ 6 (ou override)
- **When** retorno ao hub `/mental` (auto-redirect ao terminar Bloco 5) ou navego para `/grind`
- **Then** o botão "Iniciar Grind" está habilitado E exibe selo "Warm-up completo"
- **And** evento `warmup_completed` é registrado com `durationMinutes, blocksCompleted, sessionIntention`

**US-06 — Tentar iniciar grind sem warm-up recente**
Como jogador disciplinado que esqueceu, quero ser lembrado de fazer warm-up se tentar iniciar grind sem ritual recente, para não pular o protocolo por inércia.
- **Given** não fiz warm-up nos últimos 30 min (ou último warm-up foi abortado)
- **When** estou em `/mental` ou `/grind` e tento clicar em "Iniciar Grind"
- **Then** o botão exibe estado disabled com tooltip "Faça warm-up nos últimos 30 min para iniciar grind" (ou banner equivalente)
- **And** clicar redireciona para `/mental` com card "Iniciar warm-up" em destaque visual

**US-07 — Pausar warm-up se interrompido**
Como jogador interrompido por chamada/recado, quero pausar o warm-up e retomar do mesmo ponto sem perder progresso.
- **Given** estou no meio do Bloco 3 (drill PFC, 02:34 restantes)
- **When** clico em "Pausar"
- **Then** o timer congela, o estado de blocos é preservado, e botão muda para "Retomar"
- **And** se eu fechar a aba e reabrir em até 30 min, o ritual é restaurado do localStorage

**US-08 — Ver histórico de warm-ups recentes**
Como jogador querendo entender padrão, quero ver lista dos últimos 14 warm-ups com decisão go/no-go visível, para perceber tendências.
- **Given** completei pelo menos 1 warm-up
- **When** abro a aba/seção "Histórico" no hub `/mental`
- **Then** vejo lista paginada com: data/hora, score emocional, decisão (jogou / não jogou / override), duração, blocos completos
- **And** cada item é clicável para ver detalhe da intenção registrada

**US-09 — Mobile: completar warm-up no celular**
Como jogador que abre o cliente de poker no PC mas faz warm-up sentado no sofá, quero rodar o protocolo no celular sem fricção.
- **Given** estou em smartphone (viewport ≤ 768px)
- **When** abro `/mental` e inicio o warm-up
- **Then** layout responde: timer ocupa topo, prompts em fonte legível, controles touch-friendly (min 44px), animação de respiração escala apropriadamente
- **And** todos os 5 blocos são navegáveis e completáveis sem scroll horizontal

---

## 4. Requisitos Funcionais

| ID | Nome | Descrição | Prioridade | Dependências |
|----|------|-----------|------------|--------------|
| **RF-01** | Hub `/mental` redesenhado | Página `/mental` exibe card primário "Iniciar warm-up (10min)" com botão CTA, card "Histórico", e subseção rebaixada "Ferramentas de Apoio". Header "Warm-up". Remove score 60/40, sliders, MentalStateCard, WarmUpChecklist, CustomizationDialog, StatisticsDialog, CorrelationDialog. | P0 | — |
| **RF-02** | WarmUpRunner fullscreen | Componente modal fullscreen com: header (timer geral 10:00 ↓ + indicador de bloco "1/5"), área central de prompt do bloco, footer com botões "Voltar / Pausar / Próximo / Abortar". Não-dismissível por click fora ou ESC sem confirmação. | P0 | RF-01 |
| **RF-03** | Bloco 1 — Respiração + check emocional | Animação círculo expand/contract sincronizada com 4-4-4-4 (5 ciclos = ~80s); botão "Pular animação" disponível. Após animação: input de score 0-10 (slider com labels "Péssimo" / "Ótimo"). Submissão do score é obrigatória para avançar. | P0 | RF-02 |
| **RF-04** | Gate Go/No-Go (soft) | Score < 6 dispara modal "Não jogar hoje" com 3 sugestões (Estudar / Descansar / Conversar com alguém) e botões "Não vou jogar" (sai do ritual + grava `decisionToPlay=false`) e "Ainda quero jogar" (abre confirmação dupla). | P0 | RF-03 |
| **RF-05** | Override com confirmação dupla | "Ainda quero jogar" abre AlertDialog: "Tem certeza? Sessões em estado mental < 6 são estatisticamente -EV. [Sim, registrar override] [Cancelar]". Confirmação registra `override_used` e setta `decisionToPlay=true` mesmo com score < 6. | P0 | RF-04 |
| **RF-06** | Bloco 2 — Foco da semana | Exibe as 3 heurísticas armazenadas em `user_settings.weeklyHeuristics`. Se vazio, exibe inputs editáveis inline + botão "Salvar heurísticas da semana". Inclui toggle "Li em voz alta" (não obrigatório, mas registrado em `blocksCompleted`). Timer 02:00; pode avançar antes se toggle marcado. | P0 | RF-02 |
| **RF-07** | Bloco 3 — Drill PFC | Timer 04:00 cronometrado. Exibe link externo configurável (default `https://app.gtowizard.com/`, lido de `user_settings.drillUrl` ou default). Checkbox "Completei o drill" (não obrigatório — pode avançar sem marcar mas registra `completedDrill=false`). Timer não pausável (4 min é o ponto). | P1 | RF-02 |
| **RF-08** | Bloco 4 — Setup físico | 6 toggles checkbox: Água 1L · Snacks · Celular avião · Notificações off · Fone · Luz. Cada toggle persiste em `blocksCompleted[3].setupItems`. Timer 01:00; pode avançar antes se ≥ 4 toggles marcados (regra: 4/6 mínimo). | P1 | RF-02 |
| **RF-09** | Bloco 5 — Intenção da sessão | 3 textareas obrigatórias: "Foco desta sessão" (max 200 chars), "Se sentir tilt, vou" (max 200 chars), "Vou encerrar quando" (max 200 chars). Timer 01:00 mas botão "Concluir warm-up" exige os 3 campos preenchidos (não-vazios após trim). | P0 | RF-02 |
| **RF-10** | Persistência do ritual | Ao concluir Bloco 5: `POST /api/warmup-rituals` com payload completo. Server retorna o `Ritual` com `id`, `completedAt`, `durationMinutes`. Em sucesso: redireciona para `/mental` com toast "Warm-up registrado" + selo visível. Em erro: toast de erro + opção de retry. | P0 | RF-09, RF-15 |
| **RF-11** | Pausa e abort | Botão "Pausar" congela timer atual e permite retomar. Botão "Abortar" abre AlertDialog "Cancelar warm-up? O progresso será perdido." Se confirmado: `POST /api/warmup-rituals` com `version='aborted'`, `completedAt=now`, `decisionToPlay=null`. Telemetria `warmup_aborted`. | P1 | RF-02 |
| **RF-12** | Recuperação de sessão (localStorage) | Estado do ritual em andamento (bloco atual, timer restante, dados parciais) é persistido em `localStorage` chave `warmup-ritual-draft` a cada transição de bloco. Ao retornar a `/mental` em até 30 min com draft válido: prompt "Retomar warm-up em andamento?" com opção "Retomar" / "Descartar". | P2 | RF-02 |
| **RF-13** | Gate de "Iniciar Grind" no hub `/mental` | Botão "Iniciar Grind" no hub é habilitado se: existe `warmup_rituals` do usuário com `version='full'`, `completedAt > now() - 30min`, e `decisionToPlay=true`. Caso contrário disabled com tooltip apropriado. | P0 | RF-15 |
| **RF-14** | Gate de "Iniciar Grind" em `/grind` | Mesma regra da RF-13 deve ser aplicada na página `/grind` ao tentar iniciar nova sessão. Se gate falha: dialog "Faça warm-up antes" com botão "Ir para warm-up" → redireciona `/mental`. | P0 | RF-13 |
| **RF-15** | Endpoint POST `/api/warmup-rituals` | Cria registro de ritual (full ou aborted). Validação via Zod schema. `requireAuth`. Rate limit: 30/h por usuário (proteção contra spam). | P0 | — |
| **RF-16** | Endpoint GET `/api/warmup-rituals/latest` | Retorna o último ritual do usuário onde `version='full'` E `completedAt > now() - 30min`. Retorna `null` se não existe. Usado pelo gate. | P0 | RF-15 |
| **RF-17** | Endpoint GET `/api/warmup-rituals` | Lista paginada de rituais do usuário, ordenado por `startedAt DESC`. Query params: `from`, `to` (ISO date), `limit` (default 14, max 100), `offset` (default 0). | P1 | RF-15 |
| **RF-18** | Card "Histórico" no hub `/mental` | Exibe os últimos 14 rituais via `GET /api/warmup-rituals?limit=14`. Cada item: data/hora, score, badge de decisão (verde "jogou" / amarelo "override" / vermelho "não jogou" / cinza "abortou"), duração, expand para ver intenção. | P1 | RF-17 |
| **RF-19** | Telemetria de eventos | Cada evento (warmup_started, block_completed, emotional_check_submitted, gate_triggered, override_used, warmup_completed, warmup_aborted) é logado via console.log estruturado nesta sprint (instrumentação completa em ferramenta de analytics fica para sprint posterior). | P1 | — |
| **RF-20** | Permission gate | Acesso à página `/mental` e endpoints requer permission `mental_prep_access` (já existe no sistema). Sem permission: AccessDenied component. | P0 | — |
| **RF-21** | Convivência com `preparation_logs` | Tabela `preparation_logs` permanece intacta nesta sprint. Endpoints legados `/api/preparation-logs*` continuam funcionando (não removê-los). Nenhum código novo desta sprint escreve em `preparation_logs`. | P0 | — |
| **RF-22** | Heurísticas semanais editáveis | `user_settings` ganha campo `weeklyHeuristics` (array de 3 strings, max 280 chars cada). Endpoint `PUT /api/user-settings/weekly-heuristics` (auth) atualiza. Bloco 2 lê e permite editar inline. | P1 | RF-06 |

---

## 5. Requisitos Não-Funcionais

### 5.1 Performance

- **RNF-01**: Transições entre blocos (Próximo / Voltar) devem completar em < 100ms (sem chamada de rede no caminho síncrono).
- **RNF-02**: `GET /api/warmup-rituals/latest` deve responder em < 150ms p95 (filtro `userId + completedAt > now-30min` deve usar index).
- **RNF-03**: `POST /api/warmup-rituals` deve responder em < 300ms p95.
- **RNF-04**: Animação de respiração (Bloco 1) deve rodar a 60fps em smartphones de gama média (testar em Moto G ou similar).
- **RNF-05**: Bundle JS adicional do WarmUpRunner não deve exceder +60KB gzipped (lazy-load com `React.lazy` se necessário).

### 5.2 Acessibilidade (a11y)

- **RNF-06**: Timer deve ter `role="timer"` + `aria-live="polite"` para leitores de tela.
- **RNF-07**: Navegação por teclado completa: `Tab` percorre controles, `Enter` ativa botão primário, `Esc` abre confirmação de abort.
- **RNF-08**: Contraste de cores ≥ WCAG AA (4.5:1 para texto normal, 3:1 para texto grande).
- **RNF-09**: Animação de respiração respeita `prefers-reduced-motion`: se ativo, mostra texto "Inspire 4s · Segure 4s · Expire 4s · Segure 4s" sem animação.
- **RNF-10**: Slider de score 0-10 acessível via teclado (setas) e tem `aria-valuenow`.

### 5.3 Mobile-First

- **RNF-11**: Layout funciona em viewports de 360px a 1920px sem scroll horizontal.
- **RNF-12**: Controles interativos têm hitbox mínimo de 44x44px (touch-friendly).
- **RNF-13**: WarmUpRunner em mobile usa fullscreen real (`100vh`, header com timer fixo no topo).
- **RNF-14**: Inputs do Bloco 5 (textareas) usam `inputMode="text"` e desabilitam autocorreção em campos curtos para fluxo rápido.

### 5.4 Resiliência e Segurança

- **RNF-15**: Falha de rede ao concluir Bloco 5 não deve descartar dados — mostrar retry com payload preservado em estado local.
- **RNF-16**: Endpoint `POST /api/warmup-rituals` valida `userId` server-side (do JWT), nunca confia em campo `userId` do body.
- **RNF-17**: Rate limit 30 req/h em `POST /api/warmup-rituals` por `userId` para evitar abuso.
- **RNF-18**: localStorage não armazena dados sensíveis (apenas estado de UI: bloco atual, timer, drafts de texto).

---

## 6. Modelo de Dados

### 6.1 Nova tabela `warmup_rituals`

Schema Drizzle pronto para colar em `shared/schema.ts` (após `preparationLogs`):

```ts
// === WARMUP RITUALS (Sprint W-1) ===
// Substitui semanticamente preparation_logs para rituais de warm-up cronometrados.
// preparation_logs permanece em uso pelo MentalPrep legado por 60 dias.

export const warmupRituals = pgTable("warmup_rituals", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.userPlatformId, { onDelete: "cascade" }),
  startedAt: timestamp("started_at").notNull(),
  completedAt: timestamp("completed_at"),
  durationMinutes: integer("duration_minutes"),
  // version: 'full' = 5 blocos completos | 'aborted' = abandonado
  // (Sprint W-3 adicionará 'minimal' para versão mínima 3min)
  version: varchar("version", { length: 16 }).notNull(),
  emotionalCheckScore: integer("emotional_check_score"), // 0-10, nullable se aborted antes do bloco 1
  decisionToPlay: boolean("decision_to_play"), // null = aborted; true = jogou; false = não jogou
  overrideUsed: boolean("override_used").default(false), // true se score < 6 mas decidiu jogar
  blocksCompleted: jsonb("blocks_completed").$type<WarmupBlockSnapshot[]>().default([]),
  sessionIntention: jsonb("session_intention").$type<SessionIntention | null>(),
  linkedGrindSessionId: varchar("linked_grind_session_id")
    .references(() => grindSessions.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_warmup_rituals_user_completed").on(table.userId, table.completedAt),
  index("idx_warmup_rituals_user_started").on(table.userId, table.startedAt),
]);

// Tipos auxiliares (também em shared/schema.ts ou em shared/warmup-types.ts)
export type WarmupBlockSnapshot = {
  blockId: 1 | 2 | 3 | 4 | 5;
  startedAt: string; // ISO
  completedAt: string; // ISO
  durationSeconds: number;
  // Bloco 1
  emotionalCheckScore?: number;
  breathingCyclesCompleted?: number;
  // Bloco 2
  heuristicsRead?: boolean;
  heuristicsSnapshot?: [string, string, string];
  // Bloco 3
  drillCompleted?: boolean;
  drillUrl?: string;
  // Bloco 4
  setupItems?: {
    water: boolean; snacks: boolean; phoneAirplane: boolean;
    notificationsOff: boolean; headphones: boolean; light: boolean;
  };
  // Bloco 5: capturado em sessionIntention diretamente
};

export type SessionIntention = {
  focus: string;       // "Foco desta sessão"
  tiltPlan: string;    // "Se sentir tilt, vou"
  stopCriteria: string; // "Vou encerrar quando"
};

// Relations
export const warmupRitualsRelations = relations(warmupRituals, ({ one }) => ({
  user: one(users, {
    fields: [warmupRituals.userId],
    references: [users.userPlatformId],
  }),
  grindSession: one(grindSessions, {
    fields: [warmupRituals.linkedGrindSessionId],
    references: [grindSessions.id],
  }),
}));

// Adicionar à userRelations (no bloco existente):
//   warmupRituals: many(warmupRituals),

// Insert schema (Zod via drizzle-zod)
export const insertWarmupRitualSchema = createInsertSchema(warmupRituals)
  .omit({ id: true, createdAt: true })
  .extend({
    startedAt: z.string().transform((s) => new Date(s)),
    completedAt: z.string().nullable().optional()
      .transform((s) => s ? new Date(s) : null),
    version: z.enum(["full", "aborted"]),
    emotionalCheckScore: z.number().int().min(0).max(10).nullable().optional(),
    decisionToPlay: z.boolean().nullable().optional(),
    overrideUsed: z.boolean().default(false),
    blocksCompleted: z.array(z.any()).default([]),
    sessionIntention: z.object({
      focus: z.string().trim().min(1).max(200),
      tiltPlan: z.string().trim().min(1).max(200),
      stopCriteria: z.string().trim().min(1).max(200),
    }).nullable().optional(),
    linkedGrindSessionId: z.string().nullable().optional(),
  });

export type InsertWarmupRitual = z.infer<typeof insertWarmupRitualSchema>;
export type WarmupRitual = typeof warmupRituals.$inferSelect;
```

### 6.2 Mudança em `user_settings`

Adicionar coluna `weekly_heuristics`:

```ts
// Em userSettings table:
weeklyHeuristics: jsonb("weekly_heuristics").$type<[string, string, string] | null>().default(null),
drillUrl: varchar("drill_url", { length: 500 }).default("https://app.gtowizard.com/"),
```

Atualizar `insertUserSettingsSchema` (ou variante PUT específica).

### 6.3 Migration notes

- Não há migração de dados de `preparation_logs` para `warmup_rituals` nesta sprint. Os dois coexistem.
- Roda `npm run db:push` para aplicar schema. Drizzle vai criar tabela `warmup_rituals` e adicionar colunas em `user_settings`.
- Testar primeiro em ambiente dev. `preparation_logs` deve permanecer intacta.

---

## 7. Endpoints da API

Todos os endpoints sob `requireAuth` (JWT) e `requirePermission('mental_prep_access')` quando aplicável. Adicionar em novo arquivo `server/routes/warmup.ts` registrado no `server/routes/index.ts`.

### 7.1 `POST /api/warmup-rituals`

**Auth:** `requireAuth` + `requirePermission('mental_prep_access')`
**Rate limit:** 30 req/h por `userId`
**Request body (Zod):**

```ts
const postWarmupRitualBodySchema = z.object({
  startedAt: z.string().datetime(), // ISO
  completedAt: z.string().datetime().nullable().optional(),
  durationMinutes: z.number().int().min(0).max(60),
  version: z.enum(["full", "aborted"]),
  emotionalCheckScore: z.number().int().min(0).max(10).nullable().optional(),
  decisionToPlay: z.boolean().nullable().optional(),
  overrideUsed: z.boolean().default(false),
  blocksCompleted: z.array(z.object({
    blockId: z.number().int().min(1).max(5),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    durationSeconds: z.number().int().min(0),
    // Campos opcionais por bloco — server não valida estrutura interna além de tamanho
  }).passthrough()).max(5),
  sessionIntention: z.object({
    focus: z.string().trim().min(1).max(200),
    tiltPlan: z.string().trim().min(1).max(200),
    stopCriteria: z.string().trim().min(1).max(200),
  }).nullable().optional(),
});
```

**Validação adicional (server-side):**
- Se `version === 'full'`: `sessionIntention` obrigatório E `decisionToPlay !== null` E `emotionalCheckScore !== null`.
- Se `version === 'aborted'`: campos podem ser null.
- Se `overrideUsed === true`: deve ter `emotionalCheckScore < 6` E `decisionToPlay === true`.

**Response 201:**
```ts
{
  id: string;
  userId: string;
  startedAt: string; // ISO
  completedAt: string | null;
  durationMinutes: number;
  version: "full" | "aborted";
  emotionalCheckScore: number | null;
  decisionToPlay: boolean | null;
  overrideUsed: boolean;
  blocksCompleted: WarmupBlockSnapshot[];
  sessionIntention: SessionIntention | null;
  linkedGrindSessionId: null;
  createdAt: string;
}
```

**Status codes:**
- `201` — criado
- `400` — payload inválido (Zod error)
- `401` — não autenticado
- `403` — sem permission
- `429` — rate limit excedido
- `500` — erro server

### 7.2 `GET /api/warmup-rituals/latest`

**Auth:** `requireAuth` + `requirePermission('mental_prep_access')`
**Query params:** nenhum
**Comportamento:** Retorna o ritual mais recente do usuário onde `version='full'` E `completedAt > NOW() - INTERVAL '30 minutes'`. Se não existe, retorna `null`.

**Response 200:**
```ts
WarmupRitual | null
```

### 7.3 `GET /api/warmup-rituals`

**Auth:** `requireAuth` + `requirePermission('mental_prep_access')`
**Query params:**
- `from` (ISO date string, opcional)
- `to` (ISO date string, opcional)
- `limit` (int, default 14, max 100)
- `offset` (int, default 0)

**Response 200:**
```ts
{
  items: WarmupRitual[];
  total: number;
  limit: number;
  offset: number;
}
```

Ordenação: `startedAt DESC`.

### 7.4 `PUT /api/user-settings/weekly-heuristics`

**Auth:** `requireAuth` + `requirePermission('mental_prep_access')`
**Request body:**
```ts
{
  heuristics: [string, string, string]; // tuple de 3, cada string trim().min(1).max(280)
}
```
**Response 200:** `{ heuristics: [string, string, string] }`

(Pode ser implementado como extensão do endpoint existente de user-settings se for mais consistente — System-Architect decide.)

---

## 8. Componentes Frontend

### 8.1 Componentes novos a criar

Diretório: `client/src/components/warmup/` (novo).

| Componente | Path | Responsabilidade |
|------------|------|------------------|
| `WarmUpRunner` | `client/src/components/warmup/WarmUpRunner.tsx` | Orquestra os 5 blocos. State machine: bloco atual, timer, ritualDraft. Recebe `onComplete(payload)` e `onAbort()`. |
| `WarmupTimer` | `client/src/components/warmup/WarmupTimer.tsx` | Exibe countdown grande. Props: `seconds`, `paused`, `onTick`, `onComplete`. |
| `BreathingBox4444` | `client/src/components/warmup/BreathingBox4444.tsx` | Animação de respiração caixa (5 ciclos = 80s). Props: `onComplete`, `onSkip`. Respeita `prefers-reduced-motion`. |
| `EmotionalCheckBlock` | `client/src/components/warmup/EmotionalCheckBlock.tsx` | Bloco 1: container do BreathingBox + slider 0-10 + submit. Props: `onSubmit(score)`. |
| `WeeklyFocusBlock` | `client/src/components/warmup/WeeklyFocusBlock.tsx` | Bloco 2: lê `weeklyHeuristics`, permite editar inline + persistir, toggle "li em voz alta". |
| `PFCDrillBlock` | `client/src/components/warmup/PFCDrillBlock.tsx` | Bloco 3: timer 4min + link externo + checkbox conclusão. |
| `PhysicalSetupBlock` | `client/src/components/warmup/PhysicalSetupBlock.tsx` | Bloco 4: 6 toggles checkbox + regra mínima 4/6. |
| `IntentionBlock` | `client/src/components/warmup/IntentionBlock.tsx` | Bloco 5: 3 textareas obrigatórias. Props: `onSubmit(intention)`. |
| `GoNoGoModal` | `client/src/components/warmup/GoNoGoModal.tsx` | Modal "Não jogar hoje" disparado quando score < 6. Props: `score`, `onCancel`, `onWantsToPlay`. |
| `OverrideConfirmDialog` | `client/src/components/warmup/OverrideConfirmDialog.tsx` | AlertDialog de confirmação dupla para override. |
| `WarmupHistoryCard` | `client/src/components/warmup/WarmupHistoryCard.tsx` | Card no hub `/mental` listando os últimos 14 rituais. |
| `ResumeRitualPrompt` | `client/src/components/warmup/ResumeRitualPrompt.tsx` | Prompt "Retomar warm-up em andamento?" se há draft válido em localStorage. |

### 8.2 Hooks novos

| Hook | Path | Responsabilidade |
|------|------|------------------|
| `useWarmupRitual` | `client/src/hooks/useWarmupRitual.ts` | State machine do ritual: bloco atual, timer, persistência localStorage, dispatch de telemetria. |
| `useWarmupGate` | `client/src/hooks/useWarmupGate.ts` | Wrapper de `GET /api/warmup-rituals/latest` com cache (React Query). Retorna `{ canStartGrind: boolean, latestRitual: WarmupRitual | null, reason: string }`. |
| `useWarmupTelemetry` | `client/src/hooks/useWarmupTelemetry.ts` | Função `track(eventName, props)` — instrumentação simples (console.log estruturado nesta sprint, integração com analytics em sprint futura). |

### 8.3 Componentes a remover/refatorar nesta sprint

| Componente atual | Decisão |
|------------------|---------|
| `MentalPrep.tsx` (página) | **Refatorar completamente.** Manter rota `/mental`. Remover sliders, score 60/40, lógica antiga. Compor: `<WarmupHubHeader />`, `<WarmupStartCard />`, `<WarmupHistoryCard />`, `<SupportToolsSection />`. |
| `WarmUpChecklist.tsx` | **Remover** (substituído por `WarmUpRunner` + blocos). Pode deletar arquivo. |
| `MentalStateCard.tsx` | **Remover.** Sliders Energia/Foco/Confiança/Equilíbrio caem nesta sprint. |
| `CustomizationDialog.tsx` | **Remover.** Customização de pesos não faz sentido com gate binário. |
| `StatisticsDialog.tsx` | **Remover.** Substituído pelo card de histórico simples nesta sprint (Compliance Dashboard rico vem em W-3). |
| `CorrelationDialog.tsx` | **Remover.** Volta refatorado em W-2. |
| `MeditationDialog.tsx` | **Manter** em "Ferramentas de Apoio" rebaixadas (não migrar conteúdo nesta sprint). |
| `VisualizationDialog.tsx` | **Manter** idem. |
| `AudioLibraryDialog.tsx` | **Manter** idem. |
| `PersonalNotesCard.tsx` | **Remover do hub.** O conteúdo migra para Bloco 5 (intenção). |
| `QuickHistoryCard.tsx` | **Substituir por `WarmupHistoryCard`** que lê `warmup_rituals`. |
| `GoalsCard.tsx` | **Remover.** Voltará em W-2 (Sunday Review). |
| `AchievementsDialog.tsx` | **Manter** mas zerar dependências de score 60/40 (achievements baseados apenas em count e streak). Refatoração mínima. |
| `client/src/components/mental-prep/data.ts` | **Remover defaults não usados** (defaultActivities, defaultStats baseados em sliders). Manter o que ainda for referenciado por componentes mantidos (Meditation/Visualization/AudioLibrary). |
| `client/src/lib/mentalPrepUtils.ts` | **Manter** mas marcar como legado (usado apenas para `preparation_logs`). |

---

## 9. Conteúdo dos Prompts dos 5 Blocos

**Fonte:** C8.html §04, transcrito literalmente para PT-BR. Esses textos vão direto para os componentes.

### 9.1 Bloco 1 — Check-in emocional (00:00 — 02:00)

**Título:** "Check-in emocional"

**Subtítulo:** "Respire. Olhe pra dentro. Decida com honestidade."

**Instrução exibida durante a respiração:**
> "Sente na cadeira. Nenhuma mesa aberta ainda. Faça 5 respirações com caixa: 4s inspira, 4s segura, 4s expira, 4s segura."

**Pergunta após respiração:**
> "Estou emocionalmente OK pra jogar agora? (0–10)"

**Hint sob o slider:**
> "0 = totalmente fora · 6 = aceitável pra jogar · 10 = ótimo estado"

**Mensagem se score < 6 (no GoNoGoModal):**
> "Score abaixo de 6. Por hoje, não jogar é a decisão -EV-positiva. Sugestões alternativas:"
> - Estudar mãos starradas anteriores
> - Descansar / dormir cedo
> - Conversar com alguém próximo

### 9.2 Bloco 2 — Foco da semana (02:00 — 04:00)

**Título:** "Foco da semana"

**Subtítulo:** "Carregar as 3 heurísticas-alvo na memória de trabalho"

**Instrução:**
> "Leia as 3 heurísticas que você está trabalhando essa semana. Em voz alta se ajudar a fixar."

**Placeholder se heurísticas vazias (modo edição):**
> "Defina suas 3 heurísticas para esta semana. Ex: 'BB vs BTN 25bb: defender 58% contra minraise; 3betar 11% polarizado; fold tudo abaixo de Q7o.'"

**Toggle (botão):**
> "Li em voz alta"

**Microcopy do botão Salvar (modo edição):**
> "Salvar heurísticas da semana"

### 9.3 Bloco 3 — Drill de ativação PFC (04:00 — 08:00)

**Título:** "Ativação do PFC"

**Subtítulo:** "4 minutos de drill no foco da semana"

**Instrução:**
> "Abra o GTO Wizard Trainer (ou seu drill preferido) em modo 'Close Decisions — Fast'. Foque no spot da semana. Objetivo NÃO é acertar — é pré-ativar os circuitos de decisão. Erros aqui são informativos."

**Botão de link externo:**
> "Abrir Trainer (GTO Wizard)" — abre em nova aba

**Checkbox de conclusão:**
> "Completei o drill"

**Hint (footer do bloco):**
> "Se você não tem acesso a um drill agora, use estes 4 minutos para revisar mentalmente as 3 heurísticas e simular spots típicos."

### 9.4 Bloco 4 — Setup físico (08:00 — 09:00)

**Título:** "Setup físico"

**Subtítulo:** "Cada fricção evitada agora é um glitch a menos daqui a 2 horas"

**Lista de toggles:**
1. Garrafa de 1L de água na mesa
2. Snacks preparados (nozes, banana, barra)
3. Celular em modo avião ou na gaveta
4. Notificações silenciadas no computador
5. Fone de ouvido (se for grindar com playlist)
6. Luz ambiente calibrada

**Hint (rodapé):**
> "Mínimo 4 de 6 para avançar. Os outros 2 anote como meta para a próxima sessão."

### 9.5 Bloco 5 — Intenção da sessão (09:00 — 10:00)

**Título:** "Intenção da sessão"

**Subtítulo:** "Três frases. Fixa intenção, prepara resposta a tilt, define critério de encerramento."

**Campo 1 — label:** "Foco desta sessão"
**Placeholder:** "Ex: 'Defender BB vs BTN open 25bb seguindo a range estudada'"

**Campo 2 — label:** "Se sentir tilt, vou"
**Placeholder:** "Ex: '5 respirações 4-4-4-4 + reler a intenção'"

**Campo 3 — label:** "Vou encerrar quando"
**Placeholder:** "Ex: 'Stop-loss: -3 buy-ins do dia OU 4h de sessão'"

**Botão final:**
> "Concluir warm-up e iniciar grind"

**Aviso se algum campo vazio:**
> "Os 3 campos são obrigatórios. Mesmo curtos."

---

## 10. Fluxos Críticos

### 10.1 Happy Path: warm-up completo → grind

1. Jogador abre `/mental`. Vê card primário "Iniciar warm-up (10min)" + card "Histórico" + "Ferramentas de Apoio" rebaixadas.
2. Clica em "Iniciar warm-up". `WarmUpRunner` abre fullscreen no Bloco 1.
3. Telemetria: `warmup_started` com `userId, startedAt`.
4. **Bloco 1 (00:00–02:00):** animação 4-4-4-4 roda 5 ciclos (80s). Botão "Pular animação" aparece após 1 ciclo. Após animação (ou skip), aparece slider 0-10.
5. Jogador seta score = 8. Clica "Próximo". Telemetria: `emotional_check_submitted` com `score=8`. Avança ao Bloco 2.
6. Telemetria: `block_completed` com `blockId=1, durationSeconds=...`.
7. **Bloco 2 (02:00–04:00):** vê suas 3 heurísticas. Toggle "Li em voz alta" marcado. Clica "Próximo".
8. **Bloco 3 (04:00–08:00):** clica "Abrir Trainer", faz drill em outra aba. Volta, marca "Completei o drill". Timer não pausa. Aos 4 min, botão "Próximo" habilita (ou marca antes para liberar).
9. **Bloco 4 (08:00–09:00):** marca 5 dos 6 toggles. Clica "Próximo".
10. **Bloco 5 (09:00–10:00):** preenche 3 campos. Clica "Concluir warm-up e iniciar grind".
11. Frontend faz `POST /api/warmup-rituals` com `version='full', decisionToPlay=true, sessionIntention={...}`.
12. Server valida, persiste, retorna 201.
13. Telemetria: `warmup_completed`.
14. Frontend redireciona para `/mental` com toast "Warm-up registrado!" + selo verde "Warm-up completo".
15. Botão "Iniciar Grind" no hub agora habilitado. Clica → vai para `/grind`.

### 10.2 Gate disparado, jogador aceita não jogar

1. Repete passos 1-4 do happy path.
2. Jogador seta score = 4 (briga com parceira). Clica "Próximo".
3. Frontend detecta score < 6. Telemetria: `gate_triggered` com `score=4`.
4. `GoNoGoModal` abre com mensagem "Score abaixo de 6..." e 3 sugestões.
5. Jogador clica em "Não vou jogar".
6. Frontend faz `POST /api/warmup-rituals` com `version='aborted', emotionalCheckScore=4, decisionToPlay=false, blocksCompleted=[bloco1]`.
7. Telemetria: `warmup_aborted` com `reason='gate_no_go'`.
8. WarmUpRunner fecha. Hub `/mental` exibe toast "Decisão registrada. Bom descanso." Botão "Iniciar Grind" continua disabled.

### 10.3 Gate disparado, jogador faz override

1. Repete passos 1-4 do gate.
2. Jogador clica em "Ainda quero jogar".
3. `OverrideConfirmDialog` abre: "Tem certeza? Sessões em estado mental abaixo de 6 são estatisticamente -EV. [Sim, registrar override] [Cancelar]".
4. Jogador clica "Sim, registrar override".
5. Telemetria: `override_used` com `score=4`.
6. WarmUpRunner avança ao Bloco 2 normalmente. Estado interno: `overrideUsed=true`, `decisionToPlay=true`.
7. Continua até Bloco 5 normalmente.
8. Ao concluir Bloco 5: `POST /api/warmup-rituals` com `version='full', emotionalCheckScore=4, decisionToPlay=true, overrideUsed=true`.
9. Server valida (regra: se `overrideUsed=true`, deve ter `score < 6` E `decisionToPlay=true`). Persiste.
10. Hub: badge no histórico mostra item com tag amarela "override".

### 10.4 Tentar `/grind` direto sem warm-up recente

1. Jogador navega direto para `/grind`.
2. Tenta clicar em "Iniciar nova sessão".
3. Frontend faz query `useWarmupGate()` → `GET /api/warmup-rituals/latest`. Server retorna `null` (não há ritual com `completedAt > now - 30min`).
4. Hook retorna `{ canStartGrind: false, reason: 'no_recent_warmup' }`.
5. Botão fica disabled OU dialog "Faça warm-up antes de iniciar a sessão" abre com botão "Ir para warm-up" (redireciona `/mental`).

### 10.5 Pausar e retomar

1. Jogador está no Bloco 3 com 02:34 restantes. Clica "Pausar".
2. Timer congela. Botão muda para "Retomar".
3. Jogador fecha aba.
4. Estado salvo em `localStorage['warmup-ritual-draft']` com `{ ritualStartedAt, currentBlock: 3, blockTimerRemainingSec: 154, partialData: {...} }`.
5. 10 min depois jogador reabre `/mental`.
6. `MentalPrep` page lê localStorage. Detecta draft válido (≤ 30 min do `ritualStartedAt`).
7. `ResumeRitualPrompt` aparece: "Retomar warm-up em andamento? [Retomar] [Descartar]".
8. Jogador clica "Retomar". WarmUpRunner abre no Bloco 3 com timer em 02:34.

### 10.6 Aborto manual pelo jogador

1. Jogador está no Bloco 3, decide cancelar. Clica botão "Abortar" (ou ESC).
2. AlertDialog: "Cancelar warm-up? O progresso será perdido."
3. Confirma.
4. Frontend: `POST /api/warmup-rituals` com `version='aborted', completedAt=now, blocksCompleted=[bloco1, bloco2, blocoParcial3]`.
5. Telemetria: `warmup_aborted` com `reason='user_cancel'`.
6. localStorage limpo. WarmUpRunner fecha. Hub mostra toast neutro.

---

## 11. Métricas e Telemetria

### 11.1 Eventos a logar

| Evento | Quando dispara | Props |
|--------|----------------|-------|
| `warmup_started` | Ao montar WarmUpRunner | `userId, ritualId (uuid local), startedAt, viewport (mobile/desktop)` |
| `block_completed` | Ao avançar de bloco | `userId, ritualId, blockId, durationSeconds, blockData` |
| `emotional_check_submitted` | Submit do score no Bloco 1 | `userId, ritualId, score (0-10)` |
| `gate_triggered` | Score < 6 dispara modal | `userId, ritualId, score` |
| `override_used` | Confirmação dupla aceita | `userId, ritualId, score` |
| `warmup_completed` | POST 201 com version=full | `userId, ritualId (server), durationMinutes, decisionToPlay, overrideUsed` |
| `warmup_aborted` | POST com version=aborted ou abandono | `userId, ritualId, reason ('user_cancel'\|'gate_no_go'\|'timeout'), lastBlockId` |
| `weekly_heuristics_saved` | Save heurísticas no Bloco 2 | `userId, source ('inline_edit')` |
| `grind_blocked_by_gate` | Tentou `/grind` sem warm-up | `userId, reason ('no_recent_warmup'\|'score_too_low_no_override')` |

### 11.2 Implementação

- Função `track(eventName, props)` em `client/src/hooks/useWarmupTelemetry.ts`.
- Nesta sprint: `console.log('[telemetry]', eventName, props)` — instrumentação completa em ferramenta de analytics fica para sprint futura.
- Backend não recebe eventos de telemetria nesta sprint (eles ficam apenas no client). Em sprints futuras pode ser endpoint `POST /api/telemetry/warmup` ou integração com PostHog.

---

## 12. Plano de Migração `preparation_logs`

**Decisão:** Esta sprint **NÃO faz dual-write** e **NÃO migra dados antigos**. As duas tabelas coexistem.

**Razões:**
- `preparation_logs` é fonte distinta semanticamente — dados de sliders + score 60/40 não mapeiam limpo para `warmup_rituals`.
- Dual-write adiciona complexidade e risco. O hub `/mental` é refatorado por completo nesta sprint, mas qualquer feature legada ainda usando `preparation_logs` (ex: relatórios admin) continua funcionando.
- Janela de 60 dias permite observar uso real antes de planejar deprecação.

**Estado das tabelas após esta sprint:**
- `warmup_rituals`: nova, ativa, fonte de verdade para warm-ups cronometrados a partir de agora.
- `preparation_logs`: legada, **read-only do ponto de vista do código novo**. Endpoints `/api/preparation-logs*` mantidos. Componentes legados ainda lendo (se houver) continuam.
- Achievements em `AchievementsDialog` (mantido) devem ser refatorados para contar `warmup_rituals` (novo) em vez de `preparation_logs` — se já consomem `derivedStats` calculado a partir de `preparationLogs`, a refatoração é trocar a query para `warmup_rituals` filtrando `version='full'`.

**Sprint futura (W-3 ou W-4):**
- Avaliar uso de `preparation_logs`. Se zero leitura por 30+ dias, deprecar endpoints e dropar tabela.
- Eventual migração de histórico antigo para `warmup_rituals` é opcional e pode ser pulada (dados de sliders não têm equivalente direto).

---

## 13. Critérios de Aceitação da Sprint

Checklist objetivo para considerar a sprint pronta:

- [ ] Tabela `warmup_rituals` criada com todos os campos especificados (RF + schema seção 6.1).
- [ ] `user_settings.weeklyHeuristics` e `user_settings.drillUrl` adicionados.
- [ ] Endpoints `POST /api/warmup-rituals`, `GET /api/warmup-rituals/latest`, `GET /api/warmup-rituals` implementados, validados via Zod e testados.
- [ ] Endpoint `PUT /api/user-settings/weekly-heuristics` (ou equivalente) implementado.
- [ ] `WarmUpRunner` renderiza fullscreen, navega entre os 5 blocos, timer funciona, pause/resume funciona, abort com confirmação funciona.
- [ ] Bloco 1 anima respiração 4-4-4-4 corretamente (5 ciclos = 80s ± 1s) E permite skip.
- [ ] Score < 6 dispara `GoNoGoModal` com 3 sugestões e botões "Não vou jogar" / "Ainda quero jogar".
- [ ] "Ainda quero jogar" exige confirmação dupla via `OverrideConfirmDialog`.
- [ ] Bloco 5 não permite avançar com qualquer um dos 3 campos vazios.
- [ ] `POST /api/warmup-rituals` com payload válido retorna 201 e persiste corretamente.
- [ ] `GET /api/warmup-rituals/latest` retorna `null` quando não há ritual recente E retorna o ritual quando há `version=full` em < 30 min.
- [ ] Botão "Iniciar Grind" no `/mental` está disabled sem ritual recente E habilitado quando há.
- [ ] Mesma regra aplicada em `/grind` (RF-14).
- [ ] Hub `/mental` redesenhado: header "Warm-up", card primário, card histórico, ferramentas rebaixadas. Sliders/score 60/40 removidos.
- [ ] `WarmupHistoryCard` lista os últimos 14 rituais com badge de decisão.
- [ ] `ResumeRitualPrompt` detecta draft válido em localStorage e oferece retomar.
- [ ] Telemetria: todos os 9 eventos disparam corretamente (verificável via console).
- [ ] Mobile (viewport 360px) funciona end-to-end sem scroll horizontal.
- [ ] Acessibilidade: timer tem `role="timer" aria-live="polite"`; navegação por teclado funcional; `prefers-reduced-motion` desliga animação.
- [ ] Permission `mental_prep_access` continua sendo gate da página e dos endpoints.
- [ ] `preparation_logs` permanece intacta — `/api/preparation-logs*` continuam funcionando.
- [ ] Componentes deprecados removidos: `WarmUpChecklist`, `MentalStateCard`, `CustomizationDialog`, `StatisticsDialog`, `CorrelationDialog`, `PersonalNotesCard`, `QuickHistoryCard`, `GoalsCard`.
- [ ] Testes (Vitest + RTL): cobertura mínima nos hooks (`useWarmupRitual`, `useWarmupGate`), em todos os blocos, no GoNoGoModal e nos endpoints novos. Alvo: ≥ 30 testes novos.
- [ ] Build (`npm run build`) sem erros TypeScript.
- [ ] `npm run check` (tsc) limpo.

---

## 14. Riscos e Mitigações

| # | Risco | Severidade | Mitigação |
|---|-------|------------|-----------|
| **R-1** | **Soft-gate é fácil demais — jogadores ignoram** | Alta | Telemetria de `override_used` permite observar % real. Se > 50% nas primeiras 2 semanas, refazer UX (mais fricção, ex: campo obrigatório de "por que vou jogar mesmo assim"). |
| **R-2** | **10 min de warm-up é muito — jogadores abortam** | Alta | Telemetria de `warmup_aborted reason='user_cancel'` mede. Versão mínima 3 min vem em W-3. Se aborto > 40%, antecipar versão mínima. |
| **R-3** | **Bloco 3 (drill 4 min) sem integração com Trainer interno fica vazio** | Média | Aceitar como limitação conhecida. Hint no rodapé sugere alternativas (revisão mental). Integração real fica para futuro. |
| **R-4** | **Script de respiração 4-4-4-4 com drift no timer (acumula erro)** | Média | Usar `requestAnimationFrame` + timestamp absoluto, não `setInterval`. Test E2E mede duração total dos 5 ciclos (esperado 80s ± 1s). |
| **R-5** | **localStorage stale: draft fica preso após bug ou crash** | Baixa | Validar TTL (`ritualStartedAt > now - 30min`) ao restaurar; se inválido, descartar silenciosamente. Garbage collection automática. |
| **R-6** | **Preparation_logs e warmup_rituals confundem usuários no admin** | Baixa | Documentar em CLAUDE.md que `preparation_logs` é legada. Admin dashboards não precisam mostrar ambas. |
| **R-7** | **Jogador faz warm-up no celular, abre grind no PC, gate falha porque LocalStorage é por dispositivo** | Média | Gate usa `GET /api/warmup-rituals/latest` (servidor — independente de dispositivo). LocalStorage só é usado para draft de retomada, não para gate. |
| **R-8** | **Animação de respiração trava em mobile gama baixa** | Média | Usar transform CSS (não animação JS por frame). Respeitar `prefers-reduced-motion`. Test em Moto G ou similar antes de release. |
| **R-9** | **Heurísticas vazias na primeira execução — jogador trava no Bloco 2** | Baixa | Exibir inputs editáveis inline + botão "Salvar e continuar" se `weeklyHeuristics` é null/empty. Spec do componente já cobre. |

---

## 15. Tarefas Decomponíveis (ordem sugerida)

Cada tarefa é PR-sized (≤ 500 LOC mudadas idealmente) e independente o suficiente para o Test-Writer escrever testes antes do Implementer entregar código.

### T-01 — Schema + migrations
- Adicionar tabela `warmup_rituals` em `shared/schema.ts` (+ relations + insert schema + tipos).
- Adicionar `weeklyHeuristics` e `drillUrl` em `userSettings`.
- Atualizar `userRelations` para incluir `warmupRituals: many(...)`.
- Rodar `npm run db:push` em dev. Validar schema no banco.
- **Testes (Test-Writer):** zod schema (parse válido / inválido); types compilam.

### T-02 — Endpoint POST /api/warmup-rituals
- Criar `server/routes/warmup.ts`.
- Implementar `POST /api/warmup-rituals` com Zod + validação cross-field (full requer fields, override requer score<6+decisionToPlay=true).
- Rate limit 30/h por userId.
- Registrar em `server/routes/index.ts`.
- **Testes:** payload válido full (201), válido aborted (201), payload inválido (400), sem auth (401), sem permission (403), rate limit (429), `decisionToPlay=true` com `overrideUsed=true` mas score>=6 → 400.

### T-03 — Endpoint GET /api/warmup-rituals/latest
- Implementar query: filtro `userId + version='full' + completedAt > now-30min`, orderBy `completedAt DESC`, limit 1.
- **Testes:** retorna ritual recente; retorna null se não há; ignora aborted; ignora ritual >30min; retorna 401 sem auth.

### T-04 — Endpoint GET /api/warmup-rituals (histórico)
- Implementar paginação + filtros from/to.
- **Testes:** lista ordenada DESC; respeita limit/offset; filtra by date range.

### T-05 — Endpoint PUT /api/user-settings/weekly-heuristics
- Validar tuple de 3 strings. Persistir em `userSettings`.
- **Testes:** salva, lê de volta; rejeita arrays != 3; rejeita strings >280 chars.

### T-06 — Hook `useWarmupTelemetry`
- Função `track(eventName, props)` que loga estruturado.
- **Testes:** chama console.log com formato esperado; não lança em props undefined.

### T-07 — Componente `WarmupTimer`
- Countdown. Usa `requestAnimationFrame` + timestamp absoluto.
- **Testes:** decrementa corretamente; pausável; chama onComplete em 0.

### T-08 — Componente `BreathingBox4444`
- Animação CSS (transform scale) sincronizada com 4-4-4-4. 5 ciclos = 80s.
- Skip button. `prefers-reduced-motion` substitui animação por texto.
- **Testes:** dispara `onComplete` após 80s ± margem; skip dispara `onComplete` imediato; sem animação se reduced motion.

### T-09 — Componente `EmotionalCheckBlock` + `GoNoGoModal` + `OverrideConfirmDialog`
- Compõe BreathingBox + slider 0-10.
- Score < 6 → modal automático.
- Override → confirmação dupla.
- **Testes:** submit com score 8 chama `onSubmit(8, false)`; submit com 4 abre GoNoGoModal; "Não vou jogar" chama `onCancel`; "Ainda quero jogar" abre OverrideConfirmDialog; "Sim, registrar override" chama `onSubmit(4, true)` com `overrideUsed=true`.

### T-10 — Componentes blocos 2/3/4/5
- `WeeklyFocusBlock`: lê heurísticas (React Query do user-settings), modo edição inline se vazio, toggle "li em voz alta".
- `PFCDrillBlock`: timer 4min + link externo + checkbox.
- `PhysicalSetupBlock`: 6 toggles + regra mín. 4/6.
- `IntentionBlock`: 3 textareas obrigatórias.
- **Testes (cada um):** render; props onSubmit chamado com payload correto; validação local antes de avançar.

### T-11 — Hook `useWarmupRitual` + componente `WarmUpRunner`
- State machine dos 5 blocos. Persistência draft em localStorage.
- Pause/resume. Abort com confirmação.
- POST final em conclusão.
- **Testes:** fluxo completo (mock POST sucesso); aborto envia `version='aborted'`; gate dispara modal; override registra `overrideUsed=true`; localStorage atualiza a cada bloco; restore ao reabrir < 30min funciona.

### T-12 — Hook `useWarmupGate` + integração no hub `/mental`
- Wrapper de `GET /api/warmup-rituals/latest` com React Query.
- Retorna `{ canStartGrind, latestRitual, reason }`.
- Integra no botão "Iniciar Grind" do hub.
- **Testes:** retorna `canStartGrind=true` quando ritual válido; `false + reason='no_recent_warmup'` quando null.

### T-13 — Refatorar página `MentalPrep` + `WarmupHistoryCard` + `ResumeRitualPrompt`
- Remover componentes legados (sliders, checklist, customization, stats, correlation, notes, history old, goals).
- Compor: header + card start + history card + ferramentas rebaixadas.
- `WarmupHistoryCard`: 14 últimos rituais com badge de decisão.
- `ResumeRitualPrompt`: detect draft localStorage, oferece retomar.
- Manter `MeditationDialog`, `VisualizationDialog`, `AudioLibraryDialog`, `AchievementsDialog` (este último com query refatorada para `warmup_rituals`).
- **Testes:** página renderiza; botão "Iniciar Grind" disabled sem ritual recente; lista de histórico aparece; resume prompt aparece quando draft válido.

### T-14 — Aplicar gate em `/grind`
- Frontend: hook `useWarmupGate` na página `/grind`. Se `canStartGrind=false`, dialog "Faça warm-up antes" com redirect.
- **Testes:** dialog aparece; redirect funciona.

### T-15 (opcional, recomendada) — Limpeza e docs
- Atualizar `CLAUDE.md` seção 7 com novos endpoints.
- Atualizar `Docs/api/warmup.md` (criar) com tabela de endpoints.
- Atualizar `Docs/architecture/data-model.mermaid` adicionando `warmup_rituals`.
- Marcar `client/src/lib/mentalPrepUtils.ts` como `@deprecated`.

---

## Apêndice A — Mapeamento C8 → Implementação desta sprint

| C8 §04 Bloco | Spec RF | Componente |
|--------------|---------|------------|
| Bloco 1 (5 respirações + check 0-10) | RF-03, RF-04, RF-05 | `EmotionalCheckBlock` + `BreathingBox4444` + `GoNoGoModal` + `OverrideConfirmDialog` |
| Bloco 2 (3 heurísticas da semana) | RF-06, RF-22 | `WeeklyFocusBlock` |
| Bloco 3 (drill PFC 4min) | RF-07 | `PFCDrillBlock` |
| Bloco 4 (setup físico) | RF-08 | `PhysicalSetupBlock` |
| Bloco 5 (3 frases de intenção) | RF-09 | `IntentionBlock` |

| C8 §02 Função | Spec |
|---------------|------|
| Função 01 — Ativar PFC | RF-07 (Bloco 3) |
| Função 02 — Carregar memória trabalho | RF-06 (Bloco 2) |
| Função 03 — Calibrar estado emocional | RF-03, RF-04, RF-05 (Gate) |
| Função 04 — Transição cognitiva | RF-08 (Bloco 4) |

| C8 §09 Erro | Mitigação nesta sprint |
|-------------|------------------------|
| Erro 04 (warm-up sem check emocional) | Gate obrigatório (RF-04) |
| Erro 01 (pular em torneio pequeno) | Botão "Iniciar Grind" gated (RF-13, RF-14) — não bloqueia abertura de cliente PC, mas força registro |

C8 §05 (cool-down), §06 (caffeine), §07 (versão mínima), §11 (compliance dashboard) e demais erros ficam para sprints futuras.

---

**Fim da spec.** Próximo agente recomendado: **System-Architect** para criar diagramas C4 (componente do WarmUpRunner), diagrama de sequência (gate + override), atualização do data-model.mermaid e ADRs (decisão de soft-gate, decisão de não fazer dual-write com preparation_logs, decisão de telemetria client-only nesta sprint).
