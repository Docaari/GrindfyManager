# Spec: Coach Sprint 0 — Pre-requisitos transversais (Anti-fadiga + Auditoria)

## Status
Proposta

## Resumo
Entrega 4 fundacoes obrigatorias antes de qualquer nudge proativo do Coach IA ir live:
opt-out granular por categoria + quiet hours + frequency cap, audit page persistente,
citations inline e confidence tags. Sem isso, Sprint Coach-2B vira "nudge bombing"
e quebra confianca do user (R1 + R4 do research).

Esta spec eh quick-win: 4 itens que somam 3-5 dias de esforco. Cada item tem dor especifica
mapeada e resultado mensuravel.

## Contexto
- Coach v1 (Sprint Coach-1) + v2 (Sprint Coach-2A + F3) entregues — chat reativo + 6 read tools.
- Sprint Coach-2B (write tools + 3 nudges proativos) bloqueado ate as fundacoes anti-fadiga
  estarem ativas. Pesquisa externa confirma: "limit frequency, ensure each nudge adds value,
  honor preferences" como minimo viavel para evitar churn.
- Schemas atuais NAO possuem tabelas `user_coach_preferences` nem `coach_actions` (apesar
  de coach_actions estar documentada nos ADRs 023 + 026 do Coach-2A — implementacao foi
  adiada). Sprint 0 cria ambas.
- Citations + confidence tags existem como ideia em ADR-022 mas NUNCA foram aplicadas
  consistentemente em outputs do Coach. Hoje numbers vem soltos sem fonte e sem N.

## Usuarios
- **Jogador (free / pro / premium / admin):** consome nudges + relatorios. Configura
  preferencias. Ve audit dos proprios coach_actions.
- **Founder/admin:** observa metricas de dismissal/engagement por categoria via admin
  dashboard (Coach-2B+).

## Requisitos Funcionais

### RF-01: Tabela `user_coach_preferences` + defaults

**Descricao:** Cria tabela nova que centraliza preferencias do user para Coach proativo.
Toda checagem de "posso disparar nudge X agora?" passa por essa tabela. Sem registro
explicito, defaults documentados sao aplicados. Nao usar `user_settings` para nao poluir
schema legado.

**Regras de negocio:**
- 1 row por usuario. PK = `id` (nanoid). UNIQUE em `user_id`.
- Lazy-create: row eh criada na primeira escrita (PUT /api/coach/preferences) ou na primeira
  vez que `getCoachPreferences(userId)` precisa fallback para defaults — armazenamento
  preguica.
- ON DELETE CASCADE em users.userPlatformId.
- Drizzle-Zod com `optional + default` em TODAS as colunas novas (lesson #7 — schema
  deprecation gradual). Nunca `required` puro. Storage layer faz back-fill via
  `normalizeCoachPreferences()` (analogo a `normalizeTournamentTypePayload`).

**Schema (proposta — system-architect refina):**
```ts
export const userCoachPreferences = pgTable("user_coach_preferences", {
  id: varchar("id").primaryKey().notNull(),                 // nanoid
  userId: varchar("user_id")
    .notNull()
    .unique()
    .references(() => users.userPlatformId, { onDelete: "cascade" }),

  // 8 toggles por categoria de nudge (default ON exceto mental + life)
  nudgeBSnapshot: boolean("nudge_b_snapshot").default(true),
  nudgeBLeak: boolean("nudge_b_leak").default(true),
  nudgeBStudy: boolean("nudge_b_study").default(true),
  nudgeBVolume: boolean("nudge_b_volume").default(true),    // Coach-3
  nudgeBGrade: boolean("nudge_b_grade").default(true),      // Coach-3
  nudgeBDownswing: boolean("nudge_b_downswing").default(true), // Coach-3+
  nudgeBLife: boolean("nudge_b_life").default(false),       // Coach-4 — opt-in
  nudgeBMental: boolean("nudge_b_mental").default(false),   // Coach-4 — opt-in

  // Quiet hours (timezone do user — vem de users.timezone)
  quietHoursStart: integer("quiet_hours_start").default(21),   // hora local 0-23
  quietHoursEnd: integer("quiet_hours_end").default(9),        // hora local 0-23

  // Frequency cap
  maxNudgesPerDay: integer("max_nudges_per_day").default(3),
  maxNudgesPerHour: integer("max_nudges_per_hour").default(1),

  // Channel preferences (default in-app + email; push = opt-in)
  channelInApp: boolean("channel_in_app").default(true),
  channelEmail: boolean("channel_email").default(true),
  channelPush: boolean("channel_push").default(false),

  // Tom do Coach (Sprint Coach-4 valida; ja deixar coluna)
  coachTone: varchar("coach_tone", { length: 20 }).default("balanced"), // 'gentle' | 'balanced' | 'direct'

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("uniq_user_coach_preferences_user").on(table.userId),
]);
```

**Criterio de aceitacao:**
- [ ] Migration drizzle-kit cria tabela com colunas/indices acima.
- [ ] `storage.getCoachPreferences(userId)` retorna defaults documentados quando nao ha row.
- [ ] `storage.upsertCoachPreferences(userId, partialDelta)` faz UPSERT com merge — nao
  sobrescreve campos nao enviados.
- [ ] `quietHoursStart=21 + quietHoursEnd=9` interpreta janela cruzando meia-noite (21-23,
  0-9 ambos quiet). Documentado em comentario no storage.
- [ ] `quietHoursStart === quietHoursEnd` => quiet hours desabilitado (sem janela quiet,
  pode disparar nudge qualquer hora). Documentado.
- [ ] Free tier: ainda persiste preferencias (free pode ter Coach Mental ativo).
- [ ] User deletado => CASCADE remove row.
- [ ] Schema documentado em `Docs/architecture/data-model.mermaid` + indice
  `data-model-index.md`.

**Edge cases:**
- Timezone do user invalido (nao existe em IANA) — fallback `America/Sao_Paulo` (mesmo
  default de `users.timezone`).
- maxNudgesPerHour > maxNudgesPerDay — Zod schema rejeita com `validation_failed`.
- Migration em DB existente: row NAO eh criada para users existentes (lazy-create). Storage
  retorna defaults ate primeira escrita do user.

---

### RF-02: Endpoints REST `GET/PUT /api/coach/preferences`

**Descricao:** API HTTP para frontend ler/atualizar preferencias. Validacao Zod completa.
JSON sem wrapper (convencao Grindfy).

**Regras de negocio:**
- `GET /api/coach/preferences` — JWT obrigatorio. Retorna preferencias do `req.user.userPlatformId`.
  Se nao existe row, retorna defaults derivados de RF-01 (sem criar row).
- `PUT /api/coach/preferences` — JWT obrigatorio. Body validado por Zod (`updateCoachPreferencesSchema`
  = subset opcional de cada campo). Faz UPSERT. Retorna estado completo apos merge.
- Validacoes Zod especificas:
  - `quietHoursStart` / `quietHoursEnd`: integer 0..23.
  - `maxNudgesPerDay`: 0..10 (0 = desabilita TODOS os nudges).
  - `maxNudgesPerHour`: 0..maxNudgesPerDay (validado via `superRefine`).
  - `coachTone`: enum `'gentle'|'balanced'|'direct'`.
- Rate limit por IP: 30 req/min (mesma faixa de outros endpoints user — usa
  `express-rate-limit` ja configurado para `/api/coach/*`).

**Endpoints previstos:**

| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| GET | /api/coach/preferences | Le preferencias do user | JWT |
| PUT | /api/coach/preferences | Upsert parcial | JWT |

**Body PUT exemplo:**
```json
{
  "nudgeBLeak": false,
  "quietHoursStart": 22,
  "maxNudgesPerDay": 2
}
```

**Resposta GET/PUT (200) shape:**
```ts
{
  nudges: {
    bSnapshot: boolean, bLeak: boolean, bStudy: boolean, bVolume: boolean,
    bGrade: boolean, bDownswing: boolean, bLife: boolean, bMental: boolean
  },
  quietHours: { startHour: number, endHour: number, timezone: string }, // timezone vem de users
  frequencyCap: { perDay: number, perHour: number },
  channels: { inApp: boolean, email: boolean, push: boolean },
  coachTone: 'gentle' | 'balanced' | 'direct',
  updatedAt: string  // ISO
}
```

**Respostas:**

| Status | Quando | Body |
|---|---|---|
| 200 | OK | preferences shape |
| 400 | Zod validation_failed | `{ message: 'validation_failed', details: [...] }` |
| 401 | Sem JWT | `{ message: 'Nao autenticado' }` |

**Criterio de aceitacao:**
- [ ] GET sem row criada retorna defaults (200, nao 404).
- [ ] PUT com body parcial faz merge (nao reseta campos nao enviados).
- [ ] PUT com `quietHoursStart=24` retorna 400 com `details` apontando o campo.
- [ ] PUT com `maxNudgesPerHour > maxNudgesPerDay` retorna 400.
- [ ] PUT como user A nao afeta preferencias do user B (ownership via JWT).
- [ ] Rate limit aplicado.

**Edge cases:**
- Body vazio `{}` em PUT — comportamento idempotente: retorna estado atual sem mudar nada
  (nao retorna 400).
- Campos extras nao reconhecidos no PUT — Zod com `.strict()` rejeita 400.

---

### RF-03: Engine `shouldSendNudge(userId, category, context?)` + tabela `coach_nudge_log`

**Descricao:** Funcao server-side, fonte unica de verdade para "posso disparar nudge X agora?".
Toda futura nudge (Coach-2B, Coach-3, Coach-4) consulta este engine. Sem ele, cada feature
implementaria sua propria checagem e divergencia silenciosa quebraria opt-out.

Tambem cria tabela `coach_nudge_log` (audit + frequency cap):
- Cada vez que engine APROVA disparo, INSERT em coach_nudge_log antes do envio.
- Engine usa `coach_nudge_log` para enforcar frequency cap (count de last 24h e last 1h).
- Tabela tambem alimenta a Audit page (RF-05) e telemetria `dismissed/engaged/unsubscribed_after`.

**Regras de negocio (ordem de checagem):**
1. **Categoria toggle:** se `prefs.nudges[category] === false` => DENY com motivo
   `category_disabled`.
2. **Quiet hours:** se hora local atual do user (com timezone de `users.timezone`) cai
   dentro de `[quietHoursStart, quietHoursEnd]` (com wrap-around se end < start) E
   `category !== 'critical'` => DENY com `quiet_hours`.
3. **Frequency cap diario:** count de coach_nudge_log do user nas ultimas 24h >=
   maxNudgesPerDay => DENY com `daily_cap_reached`.
4. **Frequency cap horario:** count nas ultimas 1h >= maxNudgesPerHour => DENY com
   `hourly_cap_reached`.
5. **One-shot per cycle (idempotencia — R5):** se `category` tem `cyclePeriod`
   (ex: 'B-SNAPSHOT' = mensal) e ja existe coach_nudge_log do user com mesmo `category` +
   `cycleKey` (ex: '2026-05' para mensal) com `status IN ('sent','engaged','dismissed')`
   => DENY com `already_sent_this_cycle`.
6. Se passou em todas: ALLOW. Caller deve INSERT em coach_nudge_log com
   `status='sent'` antes de entregar nudge.

**Schema `coach_nudge_log`:**
```ts
export const coachNudgeLog = pgTable("coach_nudge_log", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),

  category: varchar("category", { length: 32 }).notNull(),  // 'B-SNAPSHOT' | 'B-LEAK' | ...
  cycleKey: varchar("cycle_key", { length: 16 }),           // 'YYYY-MM' | 'YYYY-WW' | null
  status: varchar("status", { length: 16 }).notNull(),       // 'sent' | 'engaged' | 'dismissed' | 'snoozed' | 'unsubscribed'

  // Conteudo
  titleI18n: varchar("title_i18n", { length: 200 }),
  bodyPreview: text("body_preview"),                          // pt-BR; max 500 — nao guardar HTML
  channel: varchar("channel", { length: 16 }).default("in_app"),  // in_app | email | push

  // Liga ao chat criado pelo nudge (quando aplicavel)
  chatSessionId: varchar("chat_session_id"),                  // FK soft
  triggeredByEvent: varchar("triggered_by_event", { length: 64 }),  // 'cron_28th' | 'csv_upload' | etc.

  sentAt: timestamp("sent_at").defaultNow(),
  engagedAt: timestamp("engaged_at"),
  dismissedAt: timestamp("dismissed_at"),
  snoozeUntil: timestamp("snooze_until"),

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_coach_nudge_log_user_sent").on(table.userId, table.sentAt),
  index("idx_coach_nudge_log_user_category_cycle").on(table.userId, table.category, table.cycleKey),
  index("idx_coach_nudge_log_category_status_sent").on(table.category, table.status, table.sentAt),
]);
```

**Funcao TypeScript:**
```ts
type NudgeDecision =
  | { allow: true }
  | { allow: false; reason: 'category_disabled' | 'quiet_hours' | 'daily_cap_reached'
      | 'hourly_cap_reached' | 'already_sent_this_cycle' };

interface NudgeContext {
  category: 'B-SNAPSHOT'|'B-LEAK'|'B-STUDY'|'B-VOLUME'|'B-GRADE'|'B-DOWNSWING'|'B-LIFE'|'B-MENTAL';
  isCritical?: boolean;          // bypassa quiet hours mas NAO bypassa caps nem toggle
  cycleKey?: string;             // 'YYYY-MM' | 'YYYY-WW' | etc.
  now?: Date;                    // injetavel para testes
}

async function shouldSendNudge(userId: string, ctx: NudgeContext): Promise<NudgeDecision>;
```

**Criterio de aceitacao:**
- [ ] Engine retorna `category_disabled` quando toggle off.
- [ ] Engine retorna `quiet_hours` quando hora local cai na janela quiet (testado com
  janela 21-9 cruzando meia-noite + janela 9-21 mesma data).
- [ ] Engine retorna `quiet_hours` mesmo com `isCritical=true` se categoria nao for
  `'critical'` (decisao: critical reserva-se para downswing severo etc — nao pertence ao
  Sprint 0; ja documentar comportamento).
- [ ] Daily cap: 4o nudge no mesmo dia com `maxNudgesPerDay=3` => DENY.
- [ ] Hourly cap: 2o nudge na mesma hora com `maxNudgesPerHour=1` => DENY.
- [ ] One-shot per cycle: 2a tentativa de B-SNAPSHOT com `cycleKey='2026-05'` => DENY
  `already_sent_this_cycle` mesmo se 1a foi `dismissed` (so reseta no proximo ciclo).
- [ ] Counts ignoram entradas com `status='snoozed'` (snooze nao consome cap).
- [ ] User com `users.timezone='America/Los_Angeles'` em horario noturno LA mas comercial
  BRT => engine respeita LA.
- [ ] Performance: < 50ms P95 na chamada (1 query coach_nudge_log + 1 query
  user_coach_preferences cacheada em memoria com TTL 30s analogo a `resolveUserTier`).

**Edge cases:**
- User nao tem row em user_coach_preferences => usa defaults (NAO bloqueia engine).
- `users.timezone` NULL/invalido => fallback `America/Sao_Paulo`.
- Pull-time race condition (2 nudges disparam ao mesmo tempo): cap eh checado mas nao trava
  via lock — possivel "off-by-one" tolerado (max 4 em vez de 3 num corner case extremo).
  Documentar em comentario no codigo. NAO eh bug, eh tradeoff.
- `coach_nudge_log` cresce sem limite — Sprint 0 nao trata. Documentar follow-up:
  retencao 90d + archival a partir de Coach-3.

---

### RF-04: Citations inline (toda mencao de numero)

**Descricao:** Toda vez que Coach (chat ou relatorio futuro) mencionar numero quantitativo
sobre o user (ROI, profit, volume, ITM, etc), append marcador `[fonte: X]` ao final da
sentenca. X eh string curta indicando origem. Hoje ADR-022 ja estabelece o formato visual
(CitationChip), mas o conteudo eh inconsistente — system prompt nao instrui criacao
sistematica nem a UI tem fallback.

Esta RF formaliza:
1. **System prompt addendum** (consumindo `server/coachSafetyPrompts.ts` — fonte unica):
   instrucao explicita "para qualquer numero quantitativo derivado de tools ou contexto,
   incluir `[fonte: <descricao curta>]` ao final da frase. Se a fonte nao for derivada de
   tool, escrever `[fonte: nao verificado]`."
2. **Format string da fonte:** `[fonte: <Tool>:<dimension/key>:<period>]` quando vem de tool
   (ex: `[fonte: query_dimension:roi:30d]`). Quando vem de page context: `[fonte: dashboard:30d]`.
3. **Frontend CitationChip:** ja existe — sem mudancas alem de garantir que renderiza
   `[fonte: nao verificado]` com `cursor-help` + tooltip "esse numero NAO foi verificado
   contra dados reais. Cuidado.".

**Regras de negocio:**
- Coach NAO pode mencionar numero sem fonte. Se nao houver fonte segura, escrever "nao
  verificado".
- Aplica-se a 100% das menses de numero no output (LLM-generated). Eh diretiva de prompt,
  nao validacao server-side hard — mas tests de eval do Coach-2B+ devem cobrir.
- Numeros literais em frases qualitativas ("voce esta no top 30%") tambem entram na regra.

**Criterio de aceitacao:**
- [ ] `coachSafetyPrompts.ts` ganha export `CITATIONS_RULES` com texto da diretiva.
- [ ] `coachSystemBuilder.ts` (cached) e `coachPrompts.ts` (legacy) consomem `CITATIONS_RULES`
  do arquivo unico (lesson #10 — DRY de prompts).
- [ ] Test de regressao: snapshot do system prompt cacheado contem `CITATIONS_RULES`.
- [ ] Test E2E manual (founder QA): pedir ao Coach "qual meu ROI por site?" e verificar
  que cada numero da resposta vem com `[fonte: ...]`. Nao bloqueia merge — vai pra QA.

**Edge cases:**
- Cache key da Anthropic: o texto literal de CITATIONS_RULES MUDA o cache prefix. Ja
  esperado — cache miss na primeira execucao apos deploy. Mitigado por prompt caching
  tornar miss barato.
- Numero proveniente de tool com `note: 'sem dados suficientes'` => Coach orientado a NAO
  mencionar valor numerico (cite contagem `n=0` em vez de "ROI X%").
- LLM "hallucina" fonte falsa — tests de eval no Coach-2B+ tentam pegar; aqui nao temos
  forma 100% server-side.

---

### RF-05: Confidence tags (sample size aware)

**Descricao:** Quando Coach mencionar metrica que depende de sample size, anexar tag
visual `⚠️` (warning) se `n < 30` ou `✅` (high confidence) se `n > 100`. Sem tag se
30 <= n <= 100.

**Regras de negocio:**
- Adicionar `CONFIDENCE_RULES` em `coachSafetyPrompts.ts`:
  - `n < 30` => prefixar `[confianca: baixa, N=<n>]`.
  - `30 <= n <= 100` => prefixar `[confianca: media, N=<n>]`.
  - `n > 100` => prefixar `[confianca: alta, N=<n>]`.
- Frontend ja tem `ConfidenceBadge` (Coach-1 RF-02) que renderiza ⚠️ / 🟡 / ✅ a partir das
  tags. Sem mudancas frontend.
- Tools que retornam sample (`query_dimension.totalCount`, `find_top_leaks.evidence.n`,
  `read_user_hud_stats.latestSnapshot.sampleSize`) ja devolvem `n` — Coach precisa usa-lo
  no output.

**Criterio de aceitacao:**
- [ ] `coachSafetyPrompts.ts` exporta `CONFIDENCE_RULES`.
- [ ] System prompt cacheado + legacy importam.
- [ ] Cor `[confianca: baixa]` na UI = ⚠️ (icone warning) com classe `text-amber-500`.
- [ ] Cor `[confianca: alta]` = ✅ com `text-green-500`.
- [ ] Test snapshot: prompt builder contem `CONFIDENCE_RULES`.
- [ ] Test render: `<CoachMessageContent text="ROI 8% [confianca: baixa, N=12] [fonte: ...]" />`
  exibe `<ConfidenceBadge level="low">` + `<CitationChip>`.

**Edge cases:**
- Sample N=30 exato — pertence a "media" (boundary inclusive na regra). Documentar.
- Sample N nao informado pela tool — Coach orientado a omitir tag (nao inventar).

---

### RF-06: Audit page `/settings/coach-actions`

**Descricao:** Pagina React acessivel via /settings/coach-actions que lista cronologicamente
TODAS as acoes que Coach fez/registrou em nome do user — write tools (Coach-2B+), nudges
disparados (RF-03 deste sprint), feedback dado a mensagens, opt-out events. UI estilo
timeline com filtros + acao "revogar/desfazer" (quando aplicavel).

Sprint 0 entrega a UI base + endpoint backend lendo:
- `coach_nudge_log` (Sprint 0 — tudo)
- `coach_actions` (criado em Coach-2B; Sprint 0 deixa endpoint preparado para ler dessa
  tabela quando existir — feature-detect via `if storage.listCoachActions`).

**Regras de negocio:**
- `/settings/coach-actions` so acessivel para JWT autenticado.
- Lista cronologica reversa (mais recente primeiro). Paginacao 20 itens/pagina.
- Filtros (query params + UI):
  - `type`: `'nudge' | 'tool' | 'feedback' | 'preference_change' | 'all'` (default `all`).
  - `category`: filtra nudges por categoria.
  - `dateFrom` / `dateTo`: ISO date.
- Cada item tem:
  - Icone por tipo (nudge = sino, tool = ferramenta, feedback = polegar).
  - Timestamp local (timezone do user).
  - Titulo curto + descricao.
  - Acao contextual (somente se aplicavel):
    - Nudge `status='sent'` => botao "Marcar como descartado" (status='dismissed').
    - Tool `status='completed'` com `payload_before != null` (Coach-2B+) => botao "Desfazer".
    - Preference change => sem acao.
- Empty state: "Coach ainda nao fez nada por voce. Configure seus opt-ins em Preferencias."

**Endpoints previstos:**

| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| GET | /api/coach/audit | Lista acoes (timeline) | JWT |
| POST | /api/coach/audit/:id/dismiss | Marca nudge como descartado | JWT |
| POST | /api/coach/audit/export | Exporta JSON do historico (GDPR) | JWT |

**Body GET /api/coach/audit (query params):**
- `type`, `category`, `dateFrom`, `dateTo`, `limit` (default 20, max 100), `cursor` (id do
  ultimo item da pagina anterior).

**Resposta GET (200) shape:**
```ts
{
  items: Array<{
    id: string,
    type: 'nudge' | 'tool' | 'feedback' | 'preference_change',
    timestamp: string,         // ISO local
    title: string,             // pt-BR
    description: string,       // pt-BR
    category?: string,         // 'B-SNAPSHOT' etc.
    status?: string,           // 'sent' | 'dismissed' | 'completed' | 'undone' etc.
    canDismiss: boolean,
    canUndo: boolean,
    metadata?: object,         // payload bruto se relevante
  }>,
  nextCursor: string | null,
  totalCount: number,
}
```

**Criterio de aceitacao:**
- [ ] Pagina renderiza timeline com pelo menos 1 mock nudge sent (validacao via
  data-testid `coach-audit-item-<id>`).
- [ ] Filtro `type=nudge` exibe so nudges; `category=B-SNAPSHOT` filtra apenas dessa categoria.
- [ ] `POST /api/coach/audit/:id/dismiss` em nudge sent retorna 200 + atualiza
  `coach_nudge_log.status='dismissed'` + `dismissedAt=now()`.
- [ ] `POST /audit/:id/dismiss` em outro user => 403.
- [ ] Export JSON (GDPR-ready): `POST /audit/export` retorna `application/json` com array
  completo de itens do user (pode demorar — sem paginacao).
- [ ] Performance: GET com 1k itens, P95 < 300ms (indice `(user_id, sent_at)`).
- [ ] Vazio: empty state aparece com test-id `coach-audit-empty`.
- [ ] data-testid estavel em todos elementos (lesson #2).
- [ ] Sprint 0 NAO renderiza tools (Coach-2B+) mas endpoint ja faz feature-detect e UI
  esconde secao se nao houver dados.

**Edge cases:**
- Item com `metadata.bodyPreview` muito longo => UI trunca em 200 chars + botao "Ver mais"
  abre modal.
- User nunca teve nudge nem tool => empty state.
- Filtro `dateFrom > dateTo` => 400 validation_failed.
- Fuso horario do user mudou — timestamps salvos em UTC; renderizacao usa `users.timezone`
  atual (sem reescrever historico).

---

## Requisitos Nao-Funcionais

- **Performance:** `shouldSendNudge` < 50ms P95. GET /api/coach/audit (page size 20) <
  300ms P95.
- **Seguranca:** ownership rigoroso (req.user.userPlatformId). Rate limit 30 req/min
  default em todos /api/coach/* novos.
- **Privacidade:** export GDPR-ready em `/api/coach/audit/export` (RF-06).
- **Disponibilidade:** falha de DB em `shouldSendNudge` => DENY safe (nao dispara nudge),
  log `console.error` (lesson #9 — distinguir "no rows" de "DB explodiu").
- **Observabilidade:** Sprint 0 tracka via `console.log` estruturado:
  - `coach.nudge.allow` (level=info)
  - `coach.nudge.deny.<reason>` (level=info)
  - `coach.nudge.error` (level=error)
  Telemetria persistente vai em `coach_nudge_log.status` — admin dashboard fica para Coach-2B.

## Endpoints Previstos (resumo)

| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| GET | /api/coach/preferences | Le preferencias do user | JWT |
| PUT | /api/coach/preferences | Upsert parcial | JWT |
| GET | /api/coach/audit | Timeline de coach actions | JWT |
| POST | /api/coach/audit/:id/dismiss | Marca nudge como descartado | JWT |
| POST | /api/coach/audit/export | Export JSON GDPR | JWT |

## Modelos de Dados Afetados

### `user_coach_preferences` (NOVA)
Ver RF-01.

### `coach_nudge_log` (NOVA)
Ver RF-03.

### `users` (alteracao zero)
Reusa `users.timezone` (ja existe — default `America/Sao_Paulo`).

### Mudancas em `coach_actions` — NAO neste sprint
Sprint 0 NAO cria `coach_actions`. Coach-2B cria.

## Integracoes Externas
Nenhuma neste sprint.

## Cenarios de Teste Derivados

### Happy Path
- [ ] User free com defaults => GET /api/coach/preferences retorna defaults.
- [ ] PUT /api/coach/preferences com `nudgeBLeak=false` desativa categoria; GET subsequente
  reflete estado.
- [ ] `shouldSendNudge('USER-X', {category: 'B-SNAPSHOT', cycleKey: '2026-05'})` retorna
  `{allow: true}` em primeira chamada do mes; segunda chamada retorna
  `{allow: false, reason: 'already_sent_this_cycle'}`.
- [ ] Nudge `B-SNAPSHOT` insertado em coach_nudge_log com status=sent => aparece em
  /settings/coach-actions com timestamp local correto.

### Validacao de Input
- [ ] PUT com `quietHoursStart=24` => 400 + `details.path='quietHoursStart'`.
- [ ] PUT com `maxNudgesPerHour=10, maxNudgesPerDay=3` => 400 (cap horario > diario).
- [ ] PUT com campo desconhecido `randomKey: 'foo'` => 400 (`.strict()`).

### Regras de Negocio
- [ ] Quiet hours 21-9: nudge as 22h => DENY `quiet_hours`. As 14h => ALLOW.
- [ ] Quiet hours 21-9: nudge `category` configurada como `'critical'` em momento futuro
  bypassa quiet (Sprint 0 NAO entrega categoria critical, mas teste guard rail garante
  branch existe).
- [ ] Daily cap 3: 1o, 2o, 3o ALLOW; 4o DENY `daily_cap_reached`.
- [ ] Hourly cap 1: 1o ALLOW (16:30); 2o em 16:45 DENY `hourly_cap_reached`; 3o em 17:01
  ALLOW.

### Edge Cases
- [ ] User com `users.timezone='Asia/Tokyo'` recebe `shouldSendNudge` em horario que eh
  3am Tokyo mas 18h UTC => engine usa Tokyo, retorna `quiet_hours` se janela 21-9.
- [ ] `users.timezone=null` => fallback `America/Sao_Paulo`.
- [ ] DB explode em `getCoachPreferences` => engine retorna `{allow: false, reason: '...'}`
  e console.error logado. NAO crasha caller.
- [ ] User deletado entre `getCoachPreferences` e `INSERT coach_nudge_log` (race) => INSERT
  falha por FK; engine captura, log error, ignora silently. Nudge nao eh enviado.
- [ ] `shouldSendNudge` chamado com `cycleKey=undefined` quando categoria E mensal =>
  considera "sem cycle" e nao bloqueia por one-shot. Documentar — caller responsavel.
- [ ] Export GDPR com 10k+ items: timeout possivel; sprint 0 limita a 5000 items mais
  recentes. Documentar follow-up.

## Fora de Escopo
Estes itens NAO entram no Sprint 0 — vao para Coach-2B/3/4:
- Tabela `coach_actions` (write tools audit) — cria em Coach-2B.
- Disparo automatico de nudges via cron — entra em Coach-2B (B-SNAPSHOT cron dia 28) e
  Coach-3 (cron semanal/mensal).
- Telemetria admin dashboard `dismissed/engaged/unsubscribed` agregada — Coach-2B+.
- Tom configuravel por user (gentle/balanced/direct) tem coluna mas LLM nao consome ainda
  — Coach-4 valida.
- Push notifications channel — channel field existe mas nenhum nudge pusha; integracao
  com servico push (web push API ou similar) eh follow-up Coach-3+.
- Email channel render real — coluna existe; envio real de email com template HTML eh
  Coach-3.
- Snooze 1-click button na UI dos nudges — Coach-2B (precisa nudge live primeiro).

## Dependencias
- `users` table existente (timezone, userPlatformId).
- `chatSessions` / `chatMessages` (Coach-1).
- `messageFeedback` (Coach-1).
- Frontend: padroes shadcn + TanStack Query + Wouter ja em uso.

## Notas de Implementacao (sugestoes — nao prescricao)

- **Cache em memoria de prefs:** `getCoachPreferences` cacheado por user com TTL 30s
  (analogo a `resolveUserTier`). Evita N queries em hot path. Cache so de sucesso (lesson
  #9). Invalidar cache no `upsertCoachPreferences`.
- **Migration drizzle-kit:** criar 2 tabelas + indices em uma migration unica `0023_coach_sprint_0.sql`.
- **Audit page UI:** reusar `Card` + `ScrollArea` shadcn. Pagination via cursor-based para
  nao perder estabilidade quando insert acontece durante paginacao.
- **Frontend useQuery key:** `['coach-preferences']` invalidado em `onSuccess` do PUT.
- **Hooks first (lesson #1):** garantir que componentes de timeline chamam todos os hooks
  ANTES de qualquer early return baseado em `data?.items.length === 0`.

## Riscos Especificos do Sprint 0

| Risco | Probabilidade | Mitigacao |
|---|---|---|
| Engine `shouldSendNudge` mal modela timezone com wrap-around | Media | Tabela de teste cobrindo 4 cenarios (janela normal, janela cruzando meia-noite, igualdade end=start, fuso negativo) |
| Defaults polemicos (B-LEAK ON?) geram primeira reacao "demais" | Baixa | Founder define defaults na review da spec; se mudar, e flag boolean trivial |
| Audit page renderiza milhares de itens lentamente | Media | Paginacao cursor + indice `(user_id, sent_at)` + limite 100/pagina |
| Cache de prefs serve dado stale apos PUT em outra aba | Baixa | TTL 30s + invalidar na mutation no servidor; tolerar 30s stale |

## Pista para Test-Writer (cenarios criticos)

1. **Engine `shouldSendNudge` deve ser testado COM DI de `now: Date`** — nao confiar em
   `new Date()`. Mockar via param injetavel (lesson — tests deterministicos).
2. **Mock de storage: validar SHAPE REAL** (lesson #3). `getCoachPreferences` retorna
   exatamente colunas listadas em RF-01; `getCoachNudgeLog` retorna `{count, mostRecent}`
   nao apenas `count`.
3. **Quiet hours wrap-around:** test cobre janela `21..9`, `9..21`, `21..21` (igual = sem
   quiet), e `0..23` (quiet 24h = sempre DENY exceto critical).
4. **Frequency cap:** usar `vi.useFakeTimers` para simular 24h passando. Cuidado com
   `vi.spyOn(console, 'log')` (lesson #vi.spyOn — `clearMocks: true` ja na config).
5. **Timezones:** test deve cobrir pelo menos `America/Sao_Paulo` (UTC-3) e
   `Asia/Tokyo` (UTC+9). Validar que `13h UTC` cai em `10h Sao Paulo` e `22h Tokyo`.
6. **CASCADE delete:** test integration que delete user e valida coach_nudge_log +
   user_coach_preferences sumiram.
7. **Audit endpoint paginacao:** insere 25 itens, GET com `limit=10` retorna 10 + `nextCursor`;
   GET com cursor retorna proximos 10; total 3 paginas.
8. **Tests devem usar `data-testid` estaveis** (lesson #2 + #11).

## Telemetria

- `console.info('coach.nudge.allow', {userId, category, cycleKey})` em ALLOW.
- `console.info('coach.nudge.deny', {userId, category, reason})` em DENY.
- `coach_nudge_log.status` registra evolucao por nudge (sent → engaged | dismissed | snoozed).
- Aggregations admin (dashboard) ficam para Coach-2B; Sprint 0 nao monta UI admin.

## Risco Principal + Mitigacao

**Risco:** Sprint 0 vira "burocracia" sem entregar valor visivel ao user. Founder pode
querer pular pra Coach-2B direto.

**Mitigacao:** Cada item do Sprint 0 tem ROI claro:
- RF-01/02/03: SEM ESSAS, todo nudge proativo eh nag fatigue (R1 do research).
- RF-04/05: confianca = numero com fonte. Sem isso, qualquer alucinacao quebra.
- RF-06: audit = "controle". Founder ve em primeira pessoa o que Coach faz. Tambem cobre
  GDPR sem retrabalho.

Se founder quiser cortar, RF-04 + RF-05 sao mais "soft" — podem ir pra dentro do Coach-2B
se prazo apertar. RF-01/02/03 + RF-06 sao mandatorios para qualquer nudge live.
