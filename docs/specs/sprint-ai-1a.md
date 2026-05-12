# Spec: Sprint AI-1A — Anti-fadiga completo + Onboarding conversacional + Re-onboarding leve + Detecção de nível + Memória estruturada + System prompt enriquecido

## Status
Proposta

## Resumo
Primeiro sprint da **Fase 1 — Ciclo de vida** do plano de melhoria dos agentes de IA. Constrói a fundação do "ciclo de vida" do Grindfy AI antes de qualquer relatório automático ou nudge novo:

1. **Anti-fadiga completo** — completa a infra de nudge (que já existe: 5 checks no `nudgeEngine.ts` + `user_coach_preferences` + `coach_nudge_log` + 2 crons) com: **snooze 1-clique** ("não agora" / "não por enquanto"), **telemetria** (`dismissed`/`engaged`/`unsubscribed`), **auto-congelamento** de categoria (>X% dismiss numa janela → congela + avisa), **kill switch global** (env var) e **kill switch por categoria** (admin). O `nudgeEngine` passa a consultar tudo isso; os 2 crons existentes (B-SNAPSHOT, B-STUDY) passam a respeitar snooze + registrar telemetria com idempotência (já fazem). É o **gate de tudo proativo** — AI-1B/1C dependem disto.
2. **Onboarding conversacional** — diagnóstico inicial guiado (3-5 min) quando o usuário entra pela primeira vez no Grindfy AI: perfil de jogador, status do import, metas, foco do mês, tom preferido, opt-in de nudges + quiet hours. **Decisão de design (esta spec):** **formulário guiado wizard com toque conversacional** (não conversa-LLM-real) — multi-step, cada step uma "pergunta" do Grindfy AI, respostas estruturadas; o último step apresenta as preferências de nudge. Mora numa **rota nova** `/coach-ai/onboarding` (full-page wizard). É **opcional mas fortemente incentivado** (banner persistente em `/coach-ai` e na Home até completar). Resultado alimenta o perfil estruturado (item 5).
3. **Re-onboarding leve** — quando o agente detecta perfil estruturado vazio/incompleto (usuário existente, perfil de IA vazio — caso da maioria hoje), oferece um diagnóstico abreviado (3 perguntas-chave: tom + 1 meta + foco do mês). Mesmo wizard, modo `light` (3 steps).
4. **Detecção de nível automática** — a partir dos dados que o jogador já importou (ABI, volume, ROI, número de redes, idade da conta), estima o nível (`iniciando` / `micro_ascensao` / `mid_consistente` / `high_stakes` / `recreativo_serio` / `sem_dados`) — **heurística rule-based, sem ML** — e **sempre confirma com o usuário** ("Pelos seus dados parece que você é X — confere?"). Calibra o tom dos relatórios futuros. Resultado vai pro perfil estruturado.
5. **Memória estruturada** — adicionar campos ESTRUTURADOS ao perfil de longo prazo do jogador: `{ nivel, nivelConfirmado, metas: [...], focoDoMes, tomPreferido, padroesConhecidos: [...], redesPrincipais: [...], onboardingCompletedAt, onboardingVersion, ... }` numa **coluna JSONB nova** (`users.ai_structured_profile`). A prosa em `user_ai_profile.content` continua (notas qualitativas via Haiku); o estruturado é o que o prompt usa de forma confiável. Lesson #7: optional + default + back-fill, **nunca required puro**.
6. **System prompt enriquecido** — o bloco STATIC cacheado (consolidado no AI-0B) passa a incluir o **perfil estruturado** (nível, metas, foco do mês, tom, padrões, redes) de forma legível pro LLM, ANTES da prosa do `aiProfile`. Mantém cacheável; a quebra única ao introduzir o bloco é aceitável (lesson #10).

**Não entra:** relatórios automáticos (Daily/Weekly/Monthly/Quarterly — AI-1B/1C); tabelas `report_jobs`/`reports` e job runner (AI-1B); nudge B-IMPORT e os crons novos (AI-1B); novas tools de carreira/diagnóstico (AI-2A); email como canal (AI-2B); quick suggestions contextuais ricas que mudam por página (AI-1B). O **cleanup de dead-code do `coachContext.ts`** (array `systemParts` + queries inline ~97-194) já foi flagueado como oportunidade no AI-0B — não foi feito; **incluímos como item de oportunidade RF-12 aqui** já que mexemos no `coachSystemBuilder.ts` + `coachContext.ts` para o RF-06.

## Contexto

### Estado atual (confirmado no código, 2026-05-12)

**Infra de nudge — quase tudo existe, falta a camada anti-fadiga "completa":**
- `server/coach/nudgeEngine.ts` — `shouldSendNudge(userId, ctx)` com 5 checks sequenciais: (1) categoria toggle off → `category_disabled`; (2) quiet hours timezone-aware wrap-around (bypassada se `isCritical`) → `quiet_hours`; (3) daily cap (24h rolling, `excludeStatus: ['snoozed']`) → `daily_cap_reached`; (4) hourly cap (1h rolling) → `hourly_cap_reached`; (5) one-shot per cycle (`cycleKey` + `statusIn: ['sent','engaged','dismissed']`) → `already_sent_this_cycle`. Safe-deny em erro (`engine_error`) com `console.error` logado (lesson #9). `DI now: Date` para testes.
- `shared/schema.ts` — `userCoachPreferences` (ADR-084): 8 toggles `nudgeB*` (Snapshot/Leak/Study/Volume/Grade/Downswing/Life/Mental — Life e Mental default `false`, resto `true`), `quietHoursStart/End` (default 21/9), `maxNudgesPerDay/Hour` (default 3/1), `channelInApp/Email/Push`, `coachTone` ('gentle'|'balanced'|'direct', default 'balanced'). `updateCoachPreferencesSchema` (Zod, `.strict()`, `maxPerHour <= maxPerDay`). `coachNudgeLog` (ADR-085): `category`, `cycleKey`, `status` ('sent'|'engaged'|'dismissed'|'snoozed'), `titleI18n`, `bodyPreview`, `channel`, `chatSessionId`, `triggeredByEvent`, `sentAt`, `engagedAt`, `dismissedAt`, **`snoozeUntil`** (já tem a coluna!), `createdAt`. 3 índices: `(user, sentAt)`, `(user, category, cycleKey)`, `(category, status, sentAt)`.
- `server/storage/coachPreferences.ts` — `getCoachPreferences(userId)` (TTL 30s + safe fallback default + invalidate em upsert — lesson #19), `upsertCoachPreferences(userId, delta)`, `normalizeCoachPreferences(row)` (back-fill defaults via `??` — lesson #7), `_resetPrefsCacheForTests()`.
- `server/storage.ts` — `createNudgeLog(input)`, `countNudgeLog(userId, {since, excludeStatus})`, `findNudgeLog(userId, category, cycleKey, {statusIn})`, `updateNudgeLogStatus(id, status, extra)` (já trata `dismissed`→`dismissedAt`, `engaged`→`engagedAt`, `snoozed`→`snoozeUntil`!). `getUserTimezone(userId)`, `listUsersForCron(filter)`, `hasSnapshotThisMonth(userId, cycleKey)`.
- `server/coach/cronRunner.ts` — node-cron in-process (ativa em `NODE_ENV=production` OU `COACH_CRON_ENABLED=true`), cada tick com `withAdvisoryLock` (ADR-144). 4 schedules: `* * * * *` cleanup pending coach_actions; `0 * 28 * *` B-SNAPSHOT (filtra `localHour==9`); `0 * * * *` B-STUDY (filtra `localHour==19`, foco ativo); `0 6 * * 1` BRT generateCoachRecommendations (ADR-112).
- `server/coach/jobs/processBSnapshot.ts` + `processBStudy.ts` — iteram users via `listUsersForCron`, checam `getLocalHour`, chamam `shouldSendNudge` com `cycleKey`, criam `chatSession` + `chatMessage` + `createNudgeLog({status:'sent'})`. **Não consultam snooze diretamente** — confiam no engine; mas o engine só exclui `'snoozed'` do COUNT do cap, não tem um check "essa categoria está em snooze ativo para esse user". **Falta:** um check de "snooze ativo" no engine.
- `server/routes/coach.ts` — `GET /api/coach/preferences` (`handleGetCoachPreferences` → `buildPrefsResponse(prefs, tz)` retorna `{ nudges:{bSnapshot,bLeak,...}, quietHours:{startHour,endHour,timezone}, frequencyCap:{perDay,perHour}, channels:{inApp,email,push}, coachTone, updatedAt }`), `PUT /api/coach/preferences` (`handlePutCoachPreferences` → valida `updateCoachPreferencesSchema`, `upsertCoachPreferences`). `GET /api/coach/audit` (`handleGetCoachAudit` — note: a rota está escrita com backslashes `'\api\coach\audit'` no código — provável bug pré-existente; **não escopo deste sprint** — flagueado).
- **Não existe endpoint de nudge in-app** (`GET /api/coach/nudges`, `POST /api/coach/nudges/:id/{dismiss,snooze,engage}`) — os nudges hoje viram `chatSession` + `chatMessage` (aparecem como conversas no hub). Para o anti-fadiga (snooze 1-clique, telemetria de dismiss/engage) precisamos de endpoints que mexem no `coach_nudge_log`.
- **`CoachPreferencesPanel`** já existe inline em `client/src/pages/CoachAI.tsx` (aba `prefs` do hub, `data-testid="coach-prefs-panel"`): 8 toggles + quiet hours (2 inputs) + caps (2 inputs) + botão salvar (`useQuery` no GET, `useMutation` no PUT). **Falta:** UI de snooze, telemetria visível, kill-switch.

**Memória de longo prazo — só prosa, sem estrutura:**
- `shared/schema.ts` — `userAiProfile` (`user_ai_profile`): `userId` (unique), `content` (text, default `''`, max 2000 no insert schema), `version` (int default 1), `tokenCount` (int default 0), `updatedAt`. `monthlyCoachSummaries` (`monthly_coach_summaries`): `userId`, `coachType`, `month` (YYYY-MM), `summary` (text), `sessionsCompacted`, `tokenCount`, `createdAt`.
- `server/coachMemory.ts` — `compactSession(sessionId)` (Haiku gera resumo da sessão → atualiza `chatSessions.summary` + status `archived` → Haiku merge no `userAiProfile.content`), `checkMonthlyCompaction(userId, coachType)` (lazy — Haiku consolida summaries arquivados do mês anterior → `monthlyCoachSummaries`), `getCoachProfile(userId)` (retorna row de `userAiProfile` ou default `{content:'',version:1,tokenCount:0}`), `updateCoachProfile(userId, content)` (max 2000 chars). Tudo prosa livre. Nenhum campo estruturado.
- `coachSystemBuilder.ts` `buildStaticSystemBlock` já injeta: `GRINDFY_AI_BASE` → `SAFETY_RULES` → `SAFETY_RULES_COMPETITOR_BLOCK` → `CITATIONS_RULES` → `CONFIDENCE_RULES` → `## Perfil do jogador:` (nome/plano/criado/total torneios — `inputs.userProfile`) → `## Perfil do Jogador (memoria de longo prazo):` (`inputs.aiProfile` — a prosa) → `## Stats Snapshot:` (`inputs.statsSnapshot`) → `## Resumo da sessao anterior:` (`inputs.lastSummary`). É array com `cache_control: ephemeral`. **Falta:** o bloco do perfil estruturado.

**Detecção de nível — não existe.** `getDashboardStats(userId, period, filters)` retorna `{count, totalProfit, totalBuyins, totalReentries, itmCount, finalTablesCount, firstPlaceCount, avgFieldSize, biggestPrize, minBuyin, maxBuyin, ...}` + ROI/ABI derivados (já filtra `grind_session_id IS NULL` — §6.1). `getAnalyticsBySite(userId, period, filters)` para contar redes. `users.createdAt` para idade da conta. Tudo o que a heurística precisa já está acessível.

**Onboarding — não existe** para o Coach. Existem wizards similares em outras features (`client/src/components/studies/onboarding/OnboardingWizard.tsx`, `client/src/components/home/EmptyHomeOnboarding.tsx`) — padrão de referência, não reuso direto. `users` tem `ttsFirstRunSeen` (precedente de flag "já viu onboarding X"). `users.timezone` (default `America/Sao_Paulo`).

**Kill switch — precedente.** `NEWS_FEED_ENABLED` (ADR-100/106) é um env master kill-switch que desliga endpoints + cron de uma feature inteira. Mesmo padrão para o anti-fadiga: `COACH_NUDGES_ENABLED` (default... ver RF-04).

**Pós AI-0A + AI-0B (mergeados):** 17 tools no registry (11 read + 6 write); citations/confidence com fonte única (`coachSafetyPrompts.ts`); agente único "Grindfy AI" (`GRINDFY_AI_BASE` em `coachSystemBuilder.ts`); `coachType` vira "lente inicial" (1 linha no bloco DYNAMIC); page context plugado no `/api/coach/chat` + 10 variantes (5 originais + 5 de `bankroll/estudos/stats/biblioteca/upload`); hub `/coach-ai` com 4 tabs URL-persisted (`?tab=chat|reports|audit|prefs`); tier gate só rate limit + tools. ADRs 145-150.

**Prioridade relativa:** G3 anti-fadiga (ICE 8.7, **P0 — gate de tudo proativo**) + B1 onboarding (7.3) + B2 re-onboarding (7.3) + B3 detecção de nível + C5 memória estruturada (7.0) + C1 system prompt enriquecido (7.7). Depende do AI-0B (agente único + builder consolidado) — entregue.

## Usuários

- **Jogador (qualquer tier):** ao entrar pela primeira vez no Grindfy AI vê um banner "Configure seu perfil com o Grindfy AI — 3 min" → pode fazer o onboarding (wizard guiado) ou pular (banner persiste). Após completar: o agente "sabe quem ele é" (nível, metas, foco, tom, redes) — os relatórios futuros (AI-1B+) usam isso. Pode receber nudges (in-app cards) — pode dar **snooze** ("não agora" = 1 dia; "não por enquanto" = 30 dias), **dismiss**, ou **engage** (abrir/clicar). Pode editar todas as preferências de nudge + ver quais categorias estão congeladas (e por quê) na aba "Preferências" do hub. Pode reativar uma categoria congelada manualmente.
- **Jogador existente com perfil de IA vazio (maioria hoje):** ao abrir o chat vê uma oferta de **re-onboarding leve** (3 perguntas) — pode aceitar ou recusar (não insiste se recusar).
- **Founder / Admin:** valida no marco M5 — passar pelo wizard de onboarding e ver o perfil estruturado populado (via DB ou via o system prompt montado); ver um nudge in-app, dar snooze, confirmar que a categoria fica silenciada pelo período; simular >X% dismiss numa categoria e ver o auto-congelamento. Tem acesso a um **kill switch global** (env `COACH_NUDGES_ENABLED=false`) e a um endpoint admin de kill por categoria.
- **Time de manutenção:** consome os ADRs (perfil estruturado JSONB; anti-fadiga snooze+telemetria+auto-congelamento+kill switch; onboarding conversacional opcional; detecção de nível rule-based) + a doc atualizada.

---

## Requisitos Funcionais

### RF-01: Schema — coluna JSONB do perfil estruturado (`users.ai_structured_profile`)
**Descrição:** Adicionar uma coluna JSONB **nullable, com default** ao `users` (NÃO criar tabela nova — o perfil é 1:1 com o user e pequeno; expandir `userAiProfile` foi considerado mas `users` é mais natural já que o onboarding e a detecção de nível tocam dados do user). Lesson #7: `jsonb("ai_structured_profile")` **nullable** (sem `.notNull()`), com `.default(sql\`'{}'::jsonb\`)` ou simplesmente nullable + normalização no storage. Migração nova — **0065** (próximo livre; 0064 é o último).

**Shape do JSONB (versionado):**
```ts
interface AiStructuredProfile {
  schemaVersion: number;                       // 1 (incrementa em migrações futuras de shape)
  nivel?: PlayerLevel | null;                  // estimado pela heurística (RF-08)
  nivelConfirmado?: boolean;                   // true se o usuário confirmou; false/undefined se só estimado
  nivelEstimadoEm?: string | null;             // ISO timestamp da última estimativa
  metas?: Array<{
    id: string;                                // nanoid
    texto: string;                             // max 200 chars — descrição SMART livre
    prazo?: 'mes' | 'trimestre' | null;
    criadaEm: string;                          // ISO
    origem: 'onboarding' | 'chat' | 'manual';
  }>;                                          // max 3
  focoDoMes?: string | null;                   // max 200 chars — 1 leak/área de foco
  focoDoMesDefinidoEm?: string | null;         // ISO
  tomPreferido?: 'gentle' | 'balanced' | 'direct';  // sincronizado com userCoachPreferences.coachTone (ver RF-09)
  padroesConhecidos?: string[];                // max 10, cada um max 120 chars — ex: "tende a tiltar após bad-beat"
  redesPrincipais?: string[];                  // max 10, cada um max 50 chars — ex: ["GGPoker", "Suprema"]
  stakesTipico?: string | null;                // max 50 — texto livre, ex: "$5-$22 ABI"
  volumeTipicoMes?: number | null;             // torneios/mês (declarado no onboarding)
  tempoJogaSerioMeses?: number | null;         // declarado no onboarding
  perfilDeclarado?: 'recreativo_serio' | 'semi_pro' | 'pro' | null;  // o que o usuário se chamou no onboarding
  onboardingCompletedAt?: string | null;       // ISO — null se nunca completou
  onboardingVersion?: number | null;           // versão do flow de onboarding completado (1)
  onboardingSkippedAt?: string | null;         // ISO — última vez que pulou (para o banner saber)
  reOnboardingOfferedAt?: string | null;       // ISO — última vez que ofereceu re-onboarding (não insistir)
  reOnboardingDeclinedAt?: string | null;      // ISO — usuário recusou re-onboarding
  updatedAt?: string;                          // ISO — toda escrita atualiza
}

type PlayerLevel =
  | 'sem_dados'           // amostra insuficiente
  | 'iniciando'           // conta nova / volume baixo
  | 'micro_ascensao'      // micro grinder em ascensão
  | 'mid_consistente'     // mid-stakes consistente
  | 'high_stakes'         // high-stakes
  | 'recreativo_serio';   // recreativo sério (volume baixo mas ROI ok / conta antiga)
```

**Storage layer (novo módulo `server/storage/aiStructuredProfile.ts`):**
- `getAiStructuredProfile(userId): Promise<AiStructuredProfile>` — lê `users.ai_structured_profile`; se `null` ou `{}` retorna `{ schemaVersion: 1 }` (default mínimo); aplica `normalizeAiStructuredProfile` (back-fill `schemaVersion`, garante arrays existem como `[]` quando o consumidor precisa, clampa tamanhos). Lesson #9: try/catch + log + retorna default safe. TTL cache opcional 30s + invalidate em escrita (lesson #19/#21 — se cachear, expor `_resetForTests()` e invalidar em todo write).
- `updateAiStructuredProfile(userId, delta: Partial<AiStructuredProfile>): Promise<AiStructuredProfile>` — merge raso com o atual (arrays substituem por completo, não fazem append automático), seta `updatedAt`, valida tamanhos (clampa metas a 3, padroes a 10, etc.), persiste via `UPDATE users SET ai_structured_profile = $1`. Invalida cache.
- `isStructuredProfileEmpty(profile): boolean` — true se não tem `nivel` confirmado E não tem `metas` E não tem `focoDoMes` E não tem `tomPreferido` E `onboardingCompletedAt` é null. Usado pelo RF-07.3 (gatilho de re-onboarding).

**Não-objetivo:** NÃO migrar o conteúdo de `user_ai_profile.content` (a prosa) para campos estruturados — a prosa continua intacta; o estruturado é aditivo. NÃO tocar `monthlyCoachSummaries`.

**Critério de aceitação:**
- [ ] Migração `0065_users_ai_structured_profile.sql` adiciona `ai_structured_profile jsonb` ao `users` — nullable, sem `NOT NULL`, com `DEFAULT '{}'::jsonb` (ou sem default — decisão do system-architect; o storage normaliza de qualquer forma).
- [ ] `shared/schema.ts` declara `aiStructuredProfile: jsonb("ai_structured_profile")` em `users` — sem `.notNull()`.
- [ ] `getAiStructuredProfile(userId)` para um user sem o campo populado retorna `{ schemaVersion: 1 }` (não throw, não null).
- [ ] `updateAiStructuredProfile(userId, { focoDoMes: 'defesa de 3bet' })` persiste e a próxima leitura retorna `focoDoMes: 'defesa de 3bet'` + `updatedAt` preenchido.
- [ ] `updateAiStructuredProfile` com `metas` de 5 elementos → clampado a 3 na persistência.
- [ ] `isStructuredProfileEmpty({ schemaVersion: 1 })` é `true`; `isStructuredProfileEmpty({ schemaVersion: 1, tomPreferido: 'direct' })` é `false`.
- [ ] Erro de DB na leitura → log estruturado + retorna `{ schemaVersion: 1 }` (lesson #9), não crasha.
- [ ] (Se cachear) `_resetAiStructuredProfileCacheForTests()` exportado e usado em `beforeEach` dos testes do módulo.

---

### RF-02: Schema — telemetria de nudge (colunas em `coach_nudge_log` + estado de auto-congelamento em `user_coach_preferences`)
**Descrição:** A telemetria por-nudge **já cabe em `coach_nudge_log`** (status `'sent'|'engaged'|'dismissed'|'snoozed'` + `engagedAt`/`dismissedAt`/`snoozeUntil` já existem). Falta: (a) um status `'unsubscribed'` (quando o usuário desliga a categoria a partir de um nudge — distinto de "dismissed"); (b) estado de **auto-congelamento por categoria** persistido — onde guardar quais categorias estão congeladas e desde quando. Decisão: adicionar a `user_coach_preferences` uma coluna JSONB `frozen_categories jsonb` (default `'{}'::jsonb`) com shape `{ [category: NudgeCategory]: { frozenAt: string; reason: 'auto_dismiss_rate' | 'admin' | 'manual'; dismissRate?: number; windowDays?: number } }`. Migração **0066** (ou consolidada com a 0065 — decisão do system-architect; preferir migrações separadas por concern).

**Mudanças em `coach_nudge_log`:** **nenhuma coluna nova obrigatória.** O status `'unsubscribed'` é só um novo valor permitido na coluna `status` (varchar 16 — cabe). Opcional: adicionar `engagementSource varchar(32)` (de onde veio o engage — `chat_open`, `cta_click`, etc.) — **não obrigatório neste sprint**, fica como nota.

**Mudanças em `user_coach_preferences`:**
- `frozenCategories: jsonb("frozen_categories").notNull().default(sql\`'{}'::jsonb\`)` — mapa categoria → estado de congelamento.
- `normalizeCoachPreferences` (em `server/storage/coachPreferences.ts`) back-fills `frozenCategories: row?.frozenCategories ?? {}`.
- `CoachPreferences` interface ganha `frozenCategories: Record<string, { frozenAt: string; reason: string; dismissRate?: number; windowDays?: number }>`.
- `updateCoachPreferencesSchema` ganha um campo opcional `frozenCategories` — **mas** a edição direta via `PUT /api/coach/preferences` é restrita: o handler aceita apenas **remover** uma entrada de `frozenCategories` (descongelar) ou setar `{}` (limpar tudo), nunca adicionar congelamento via PUT (congelamento só é setado pelo auto-congelamento ou pelo endpoint admin). System-architect decide a forma exata da validação (provável: um campo dedicado `unfreezeCategory?: NudgeCategory` no PUT, ou um endpoint separado `POST /api/coach/preferences/unfreeze`).

**Storage methods novos em `server/storage.ts`:**
- `getNudgeDismissRate(userId, category, sinceDays): Promise<{ sent: number; dismissed: number; rate: number }>` — conta `coach_nudge_log` rows da categoria nos últimos `sinceDays` dias (`sentAt >= since`); `sent` = total de rows (qualquer status que conta como "entregue": `sent|engaged|dismissed|unsubscribed`; **exclui `snoozed`** porque snooze não é "viu e ignorou"); `dismissed` = rows com `status IN ('dismissed', 'unsubscribed')`; `rate = dismissed / sent` (0 se `sent === 0`).
- `getActiveSnoozeForCategory(userId, category, now): Promise<Date | null>` — o `snoozeUntil` mais futuro entre os `coach_nudge_log` rows dessa categoria com `status = 'snoozed'` e `snoozeUntil > now`. Retorna `null` se nenhum snooze ativo.
- `listNudgeLog(userId, { category?, status?, since?, limit? }): Promise<CoachNudgeLog[]>` — para o RF-10 (UI de histórico) e telemetria. Ordenado por `sentAt desc`.
- `getNudgeLogById(id): Promise<CoachNudgeLog | undefined>` — para os endpoints de dismiss/snooze/engage validarem ownership.

**Critério de aceitação:**
- [ ] Migração `0066_coach_nudge_telemetry_freeze.sql` (ou na 0065): adiciona `frozen_categories jsonb NOT NULL DEFAULT '{}'::jsonb` a `user_coach_preferences`. Nenhuma coluna nova obrigatória em `coach_nudge_log`.
- [ ] `shared/schema.ts` `userCoachPreferences` declara `frozenCategories: jsonb("frozen_categories").notNull().default(sql\`'{}'::jsonb\`)`.
- [ ] `normalizeCoachPreferences` back-fills `frozenCategories` para `{}` quando ausente.
- [ ] `getNudgeDismissRate(userId, 'B-STUDY', 7)` com 10 rows `sent` (mistos: 4 `dismissed`, 1 `unsubscribed`, 5 `engaged`) retorna `{ sent: 10, dismissed: 5, rate: 0.5 }` (snoozed rows não entram no denominador).
- [ ] `getActiveSnoozeForCategory(userId, 'B-LEAK', now)` retorna o `snoozeUntil` mais futuro entre os rows `snoozed` dessa categoria com `snoozeUntil > now`; `null` se nenhum.
- [ ] `PUT /api/coach/preferences` **não** consegue adicionar uma entrada nova em `frozenCategories` (só descongelar ou limpar); tentativa de injetar congelamento via PUT → ignorada ou `400` (decisão do system-architect, documentar).

---

### RF-03: `nudgeEngine` — snooze ativo + categoria congelada vira check 1.5 e 1.6 (ordem do engine atualizada)
**Descrição:** O `shouldSendNudge` ganha **dois checks novos** entre o check de categoria-toggle e o de quiet-hours (ordem: barato/decisivo primeiro):
- **Check 1.5 — categoria congelada:** se `prefs.frozenCategories[ctx.category]` existir → `{ allow: false, reason: 'category_frozen' }`. Bypassada se `ctx.isCritical` (eventos críticos como downswing severo passam mesmo com categoria congelada — mas downswing é AI-2A; por ora nenhum nudge é `isCritical` na prática). Log: `console.info("coach.nudge.deny", { reason: "category_frozen", frozenSince })`.
- **Check 1.6 — snooze ativo:** `const snoozeUntil = await storage.getActiveSnoozeForCategory(userId, ctx.category, now)`; se `snoozeUntil && snoozeUntil > now` → `{ allow: false, reason: 'category_snoozed' }`. Bypassada se `ctx.isCritical`. Log: `console.info("coach.nudge.deny", { reason: "category_snoozed", snoozeUntil })`.

**`NudgeDenyReason`** ganha `'category_frozen' | 'category_snoozed'`.

**Ordem final do engine:**
1. Categoria toggle off → `category_disabled`
1.5. **Categoria congelada** → `category_frozen` (bypass se `isCritical`)
1.6. **Snooze ativo** → `category_snoozed` (bypass se `isCritical`)
2. Quiet hours → `quiet_hours` (bypass se `isCritical`)
3. Daily cap → `daily_cap_reached`
4. Hourly cap → `hourly_cap_reached`
5. One-shot per cycle → `already_sent_this_cycle`

**Kill switch global (RF-04) é o check 0** — ver RF-04.

**Não-objetivo:** NÃO mudar a semântica dos 5 checks existentes. NÃO mudar o shape de `NudgeDecision`. NÃO introduzir `isCritical: true` em nenhum nudge (downswing é AI-2A).

**Critério de aceitação:**
- [ ] `shouldSendNudge(userId, { category: 'B-STUDY' })` com `frozenCategories['B-STUDY']` setado → `{ allow: false, reason: 'category_frozen' }` (sem checar quiet hours / caps).
- [ ] `shouldSendNudge(userId, { category: 'B-LEAK' })` com um `coach_nudge_log` row `snoozed` e `snoozeUntil` no futuro → `{ allow: false, reason: 'category_snoozed' }`.
- [ ] Snooze expirado (`snoozeUntil < now`) → não bloqueia (o engine prossegue para os checks seguintes).
- [ ] `ctx.isCritical: true` bypassa `category_frozen` e `category_snoozed` (assim como já bypassa `quiet_hours`).
- [ ] A ordem dos checks é: toggle → frozen → snoozed → quiet hours → daily cap → hourly cap → cycle (testar que `category_frozen` vence `quiet_hours` quando ambos se aplicam).
- [ ] Erro ao consultar snooze/frozen → safe-deny (`engine_error`) com `console.error` logado (lesson #9) — não throw.
- [ ] Regressão: `tests/coach/nudge-engine/*.test.ts` (should-send-nudge, quiet-hours, cycle-key, frequency-cap) continuam passando; o test-writer adiciona casos para os 2 checks novos.

---

### RF-04: Kill switch global — `COACH_NUDGES_ENABLED` env var
**Descrição:** Um env var master que desliga **toda a proatividade** do Grindfy AI (nudges + os crons que disparam nudges) — análogo ao `NEWS_FEED_ENABLED` (ADR-100/106). Comportamento:
- **Default:** `COACH_NUDGES_ENABLED` ausente ou diferente de `'false'` → habilitado (proatividade ON). Para desligar: `COACH_NUDGES_ENABLED=false`. (Decisão: default ON — a infra de nudge já está em produção via `NODE_ENV=production` no cronRunner; mudar para default OFF quebraria comportamento. O kill switch é uma alavanca de emergência, não um opt-in.)
- **`shouldSendNudge` — check 0:** primeira coisa que o engine faz: `if (process.env.COACH_NUDGES_ENABLED === 'false') return { allow: false, reason: 'nudges_globally_disabled' }`. Resolvido a cada chamada (reflete mudança em runtime, padrão `getMemoryModel()`). **Não** bypassado por `isCritical` — o kill switch é absoluto.
- **`cronRunner.ts`:** os schedules de B-SNAPSHOT, B-STUDY (e o cleanup de coach_actions? — **não**, cleanup não é nudge, mantém) **não são registrados** se `COACH_NUDGES_ENABLED === 'false'`. O `generateCoachRecommendations` (segunda 6h BRT) — esse não é um nudge no sentido do `nudgeEngine`, mas é proatividade; decisão: **também gateado por `COACH_NUDGES_ENABLED`** (o plano §10 prevê aposentar esse cron no AI-1B de qualquer forma; por ora gatear junto). O cleanup de pending coach_actions (`* * * * *`) **continua sempre** (não é proatividade).
- **`NudgeDenyReason`** ganha `'nudges_globally_disabled'`.

**Não-objetivo:** NÃO criar um toggle de UI para isso (é env var, alavanca de ops). O toggle por-categoria do usuário já existe (`nudgeB*`); o kill-switch por-categoria do admin é RF-05.

**Critério de aceitação:**
- [ ] `COACH_NUDGES_ENABLED=false` → `shouldSendNudge(userId, { category: 'B-SNAPSHOT', isCritical: true })` retorna `{ allow: false, reason: 'nudges_globally_disabled' }` (nem `isCritical` bypassa).
- [ ] Sem o env var (ou `=true`, ou qualquer outro valor) → o engine prossegue normalmente (não bloqueia no check 0).
- [ ] `startCoachCrons()` com `COACH_NUDGES_ENABLED=false` (e `COACH_CRON_ENABLED=true`) → registra o schedule de cleanup de coach_actions mas **não** registra B-SNAPSHOT, B-STUDY nem generateCoachRecommendations; log `coach.cron.nudges_disabled`.
- [ ] `startCoachCrons()` sem `COACH_NUDGES_ENABLED` → registra os 4 schedules como hoje.
- [ ] O env var é resolvido a cada chamada de `shouldSendNudge` (mudar em runtime durante teste reflete imediatamente).
- [ ] CLAUDE.md §4 documenta `COACH_NUDGES_ENABLED` (default `true`/ausente; `false` desliga toda proatividade do Coach).

---

### RF-05: Auto-congelamento de categoria por taxa de dismiss + kill-switch admin por categoria
**Descrição:** Quando uma categoria de nudge acumula uma taxa de dismiss alta numa janela, ela é **congelada automaticamente** (some dos disparos) e o usuário é **avisado** (para que possa religar ou ajustar). Também um endpoint admin para congelar/descongelar manualmente.

**Auto-congelamento (service `server/coach/nudgeAutoFreeze.ts`):**
- `checkAndFreezeCategory(userId, category, opts?): Promise<{ frozen: boolean; rate?: number }>` — chamado **após** cada vez que um nudge dessa categoria é marcado `dismissed` ou `unsubscribed` (do endpoint de dismiss — RF-10; e do PUT de preferences quando o usuário desliga uma categoria que tinha dismiss recente — opcional). Lógica:
  - `const { sent, dismissed, rate } = await storage.getNudgeDismissRate(userId, category, WINDOW_DAYS)`.
  - **Thresholds (constantes, configuráveis via env opcional):** `WINDOW_DAYS = 7`, `MIN_SAMPLE = 3` (precisa ≥3 nudges entregues na janela para considerar — não congela com amostra minúscula), `DISMISS_RATE_THRESHOLD = 0.5` (>50% de dismiss → congela). Se `sent >= MIN_SAMPLE && rate > DISMISS_RATE_THRESHOLD` → congela: `updateAiStructuredProfile`? **não** — congelamento mora em `userCoachPreferences.frozenCategories` (RF-02): `upsertCoachPreferences(userId, { frozenCategories: { ...current, [category]: { frozenAt: now.toISOString(), reason: 'auto_dismiss_rate', dismissRate: rate, windowDays: WINDOW_DAYS } } })`.
  - Se congelou: cria um `coach_nudge_log` row (ou um `chatSession`/`chatMessage`?) de **aviso** ao usuário — decisão: cria um `coach_nudge_log` row da categoria especial `'B-SYSTEM'` (ou `triggeredByEvent: 'auto_freeze_notice'`) com `status: 'sent'`, `titleI18n: 'Avisos de X pausados'`, `bodyPreview: 'Notei que você dispensou a maioria dos avisos sobre X — pausei essa categoria. Você pode reativá-la em Preferências quando quiser.'` — esse aviso **não** passa pelo `shouldSendNudge` (é meta, sempre entregue). System-architect decide se cria categoria `'B-SYSTEM'` (precisa adicionar ao enum `NudgeCategory` + ao `CATEGORY_TOGGLE_MAP`? — **não**, `B-SYSTEM` não tem toggle, é sempre on; ou usar um campo `kind: 'notice'` na log row). Manter simples: criar a log row com `category: ctx.category` original + `triggeredByEvent: 'auto_freeze_notice'` + `status: 'sent'`, e o frontend (RF-10) renderiza diferente quando `triggeredByEvent === 'auto_freeze_notice'`.
- **Quando descongelar:** o congelamento **não** expira sozinho — o usuário descongela manualmente (RF-10: botão "reativar avisos de X" na aba Preferências → `POST /api/coach/preferences/unfreeze` ou o PUT especial) ou o admin descongela (endpoint admin). Decisão: **não** auto-descongelar — congelamento por dismiss alto deve ser uma ação consciente do usuário para reativar (evita ping-pong). System-architect pode decidir por um cooldown (ex: re-oferecer reativação após 30 dias) — **não obrigatório neste sprint**, fica como nota.

**Kill-switch admin por categoria (endpoint):**
- `POST /api/admin/coach/freeze-category` (auth `requirePermission('admin')` ou o padrão admin do projeto) — body `{ userId: string, category: NudgeCategory, action: 'freeze' | 'unfreeze' }` → seta/remove `frozenCategories[category]` com `reason: 'admin'`. Retorna `{ ok: true, frozenCategories }`.
- (Opcional, não obrigatório: um kill-switch admin **global por categoria** — congelar B-STUDY para todos os users. Fica como nota — a v1 é por-user.)

**Critério de aceitação:**
- [ ] `checkAndFreezeCategory(userId, 'B-STUDY')` com 4 nudges entregues na janela de 7d, 3 dismissed (rate 0.75 > 0.5, sample 4 ≥ 3) → congela: `userCoachPreferences.frozenCategories['B-STUDY']` setado com `reason: 'auto_dismiss_rate'`, `dismissRate: 0.75`; cria um `coach_nudge_log` row de aviso (`triggeredByEvent: 'auto_freeze_notice'`).
- [ ] `checkAndFreezeCategory(userId, 'B-LEAK')` com 2 nudges entregues, 2 dismissed (rate 1.0 mas sample 2 < 3) → **não congela** (amostra insuficiente).
- [ ] `checkAndFreezeCategory(userId, 'B-VOLUME')` com 10 entregues, 3 dismissed (rate 0.3 ≤ 0.5) → não congela.
- [ ] Após congelar, `shouldSendNudge(userId, { category: 'B-STUDY' })` → `{ allow: false, reason: 'category_frozen' }` (integração RF-03).
- [ ] Categoria já congelada → `checkAndFreezeCategory` não duplica (idempotente — se já tem entrada, não recria o aviso).
- [ ] `POST /api/admin/coach/freeze-category` com `{ userId, category: 'B-MENTAL', action: 'freeze' }` → `frozenCategories['B-MENTAL']` com `reason: 'admin'`. Com `action: 'unfreeze'` → remove a entrada.
- [ ] `POST /api/admin/coach/freeze-category` por usuário não-admin → `403`.

---

### RF-06: System prompt enriquecido — bloco do perfil estruturado no STATIC
**Descrição:** O `buildStaticSystemBlock` (em `server/coachSystemBuilder.ts`) ganha um novo bloco — `## Perfil Estruturado do Jogador:` — inserido **entre** o `## Perfil do jogador:` (nome/plano/total torneios) e o `## Perfil do Jogador (memoria de longo prazo):` (a prosa do `aiProfile`). O bloco renderiza, de forma legível pro LLM (linhas curtas, não JSON cru), os campos do perfil estruturado quando presentes:
- `Nivel estimado: <nivel humanizado>` (+ `(confirmado pelo jogador)` se `nivelConfirmado`, senão `(estimativa — confirme com o jogador antes de assumir)`).
- `Perfil declarado: <recreativo serio | semi-pro | pro>` (se `perfilDeclarado`).
- `Stakes tipico: <stakesTipico>` / `Volume tipico: ~<volumeTipicoMes> torneios/mes` / `Joga serio ha: <tempoJogaSerioMeses> meses` (se presentes).
- `Redes principais: <redesPrincipais.join(', ')>`.
- `Metas ativas: <metas.map(m => m.texto).join(' | ')>` (se houver).
- `Foco do mes: <focoDoMes>` (se houver).
- `Tom preferido: <gentle | balanced | direct>` + uma instrução curta de como aplicar (ex: `gentle` → "tom gentil, encorajador, sem cobrança dura"; `direct` → "tom direto, sem rodeio, vai ao ponto"; `balanced` → "tom equilibrado de par/companheiro de grind").
- `Padroes conhecidos: <padroesConhecidos.join('; ')>` (se houver).

**Se o perfil estruturado estiver vazio** (`isStructuredProfileEmpty` true): o bloco vira **uma linha** instruindo o agente a oferecer o re-onboarding: `O perfil estruturado do jogador ainda nao foi preenchido — em algum momento natural da conversa, ofereca um diagnostico rapido (3 perguntas: tom preferido, 1 meta do mes, 1 leak/foco) para te conhecer melhor. Nao seja insistente.` — **mas** essa linha só entra se o usuário não recusou o re-onboarding recentemente (`reOnboardingDeclinedAt` ausente ou >30 dias) — senão omite o bloco. (Decisão de onde checar: o `coachContext.ts`/route handler decide se passa esse "modo vazio" para o builder — o builder só renderiza o que recebe; ver loaders no RF abaixo.)

**Loaders (em `coachContext.ts` `assembleContext` + `routes/coach.ts` `handleCoachChat`):**
- O `assembleContext` ganha um loader opcional `getStructuredProfile: () => Promise<AiStructuredProfile | null>`. O route handler fornece via `getAiStructuredProfile(userId)`.
- O `StaticInputs` de `coachSystemBuilder.ts` ganha `structuredProfile?: AiStructuredProfile | null`.
- O `buildStaticSystemBlock` formata via uma função `formatStructuredProfile(profile)` (nova, em `coachSystemBuilder.ts` — testável isoladamente).
- `tomPreferido` no perfil estruturado deve estar **sincronizado** com `userCoachPreferences.coachTone` (ver RF-09 — o onboarding seta os dois; se divergirem, o perfil estruturado vence no prompt, mas a recomendação é mantê-los sincronizados). System-architect decide se o builder recebe `coachTone` separado ou só `structuredProfile.tomPreferido` — preferir o segundo (uma fonte).

**Restrição de cache (lesson #10 + ADR-019 + ADR-147 §3):** o bloco do perfil estruturado entra no **STATIC** (cacheado). Introduzir o bloco quebra o cache key da Anthropic **uma vez** quando este sprint for pra produção — **aceitável** (quebra única, planejada; o AI-0A e AI-0B já quebraram o cache; e o perfil estruturado é estável dentro de uma sessão). O bloco STATIC continua sendo um array com `cache_control: { type: 'ephemeral' }` (não vira string). **Importante:** o perfil estruturado muda raramente (só no onboarding ou quando o agente registra meta/foco — fora do escopo deste sprint via write tool, mas o RF-07 do onboarding escreve via endpoint REST, não no meio de uma conversa) — então não é fonte de cache-thrash dentro de uma sessão.

**Não-objetivo:** NÃO adicionar **pool intelligence BR** (metadata sobre Suprema/GG/Stars) ao prompt — isso é uma tool (`query_pool_intelligence`, AI-2A). NÃO adicionar `padroesConhecidos` que o agente "infere" automaticamente — só o que o usuário declarou no onboarding ou o que foi explicitamente registrado. NÃO mudar a ordem dos blocos existentes nem o texto deles.

**Critério de aceitação:**
- [ ] `buildStaticSystemBlock(coachType, { structuredProfile: { schemaVersion:1, nivel:'mid_consistente', nivelConfirmado:true, metas:[{id:'a',texto:'sair do breakeven',criadaEm:'...',origem:'onboarding'}], focoDoMes:'defesa de 3bet', tomPreferido:'direct', redesPrincipais:['GGPoker'] }, ... })` produz um texto contendo `## Perfil Estruturado do Jogador:` com linhas para nível, metas, foco, tom (com instrução de como aplicar o tom direto), redes.
- [ ] O bloco do perfil estruturado aparece **entre** `## Perfil do jogador:` e `## Perfil do Jogador (memoria de longo prazo):`.
- [ ] `buildStaticSystemBlock` com `structuredProfile` vazio (`{ schemaVersion: 1 }`) e sem `reOnboardingDeclinedAt` → o bloco vira a linha de "ofereça diagnóstico rápido" (não JSON, não bloco completo).
- [ ] `buildStaticSystemBlock` com `structuredProfile` vazio mas `reOnboardingDeclinedAt` recente (< 30 dias) → o bloco do perfil estruturado é omitido (nem a linha de oferta).
- [ ] `nivelConfirmado: false` → o texto diz "(estimativa — confirme com o jogador antes de assumir)".
- [ ] O bloco STATIC ainda é um array com `cache_control: { type: 'ephemeral' }` quando `COACH_PROMPT_CACHE_ENABLED !== 'false'`; string concatenada quando `=== 'false'`.
- [ ] `handleCoachChat` em `routes/coach.ts` passa `getStructuredProfile` para `assembleContext` e o resultado chega ao `buildStaticSystemBlock`.
- [ ] `tests/coach/citations/system-prompt-snapshot.test.ts` (ou o snapshot equivalente) é atualizado — mudança intencional do texto, não regressão.

---

### RF-07: Onboarding conversacional — wizard guiado em `/coach-ai/onboarding` (modo `full` e `light`) + endpoints
**Descrição:** Um wizard full-page (não modal — espaço para passos) que conduz o diagnóstico inicial. Cada step é uma "pergunta" do Grindfy AI (header com tom conversacional: "Pra te ajudar de verdade preciso te conhecer — bora?"), respostas estruturadas (selects, inputs, chips, textareas curtas). Dois modos:
- **`full` (onboarding inicial):** 6 steps. (1) **Boas-vindas + perfil de jogador:** quanto tempo joga sério (input meses, ou faixas), `perfilDeclarado` (recreativo sério / semi-pro / pro — chips), stakes típico (input texto curto, ex "$5-$22 ABI"), volume típico/mês (input number), redes principais (multi-select de redes conhecidas — WPN/ACR, GGPoker, Suprema/PokerStars BR, PartyPoker, 888, etc.; permitir "outra" texto livre). (2) **Status do import:** mostra se o usuário já importou histórico (`storage.getUploadHistory(userId)` — frontend já tem ou via um GET) — se sim: "Vi que você já tem N torneios de [rede]. Posso usar isso." → step de detecção de nível (RF-08); se não: "Você ainda não importou — quer importar agora?" com link pra `/upload` (não bloqueia o wizard — pode continuar). (3) **Detecção de nível (RF-08):** mostra o nível estimado + pede confirmação ("Pelos seus dados parece que você é X — confere?" — chips: "confere" / "não, sou mais [picker]" / "prefiro não dizer"). Se "sem dados" → pula a estimativa, pergunta direto o nível auto-declarado (opcional). (4) **Metas:** "O que você quer dos próximos 3 meses?" — até 3 metas (textareas curtas, max 200 chars cada) + prazo (mês/trimestre — chip por meta). Opcional (pode pular). (5) **Foco do mês:** "Tem algum leak que você já sabe que precisa trabalhar?" — input texto curto (max 200). Opcional. (6) **Tom + nudges:** "Como você quer que eu te cobre?" — chips gentle/balanced/direct (default balanced); + apresenta as **categorias de nudge** com defaults (relatório semanal ON, mensal ON, downswing ON, import ON, estudo ON, mental OFF, vida OFF — note: as categorias atuais são B-SNAPSHOT/B-LEAK/B-STUDY/B-VOLUME/B-GRADE/B-DOWNSWING/B-LIFE/B-MENTAL; mapear os rótulos UX para essas) com toggles + quiet hours (2 inputs). Botão "Concluir".
- **`light` (re-onboarding leve):** 3 steps: (1) Tom (chips gentle/balanced/direct); (2) 1 meta do mês (textarea curta, opcional); (3) Foco do mês (input curto, opcional). Botão "Concluir". Header: "Vi que já temos histórico aqui — deixa eu me apresentar direito e ajustar algumas coisas. Rapidinho."

**Persistência incremental (retoma se abandonar no meio):** o wizard salva o progresso a cada step via `PATCH /api/coach/onboarding` (body parcial — só os campos do step). O estado fica em `users.ai_structured_profile` (campos parciais) + um campo `onboardingDraft` opcional no JSONB (`{ step: number, mode: 'full'|'light', startedAt: string }`) para o wizard saber em que step retomar. Ao concluir (`POST /api/coach/onboarding/complete`): seta `onboardingCompletedAt` + `onboardingVersion: 1`, limpa `onboardingDraft`, sincroniza `tomPreferido` ↔ `userCoachPreferences.coachTone` + grava os toggles de nudge + quiet hours via `upsertCoachPreferences`. Se o usuário **pular** o wizard (botão "agora não" / fecha): `PATCH /api/coach/onboarding` com `{ skip: true }` → seta `onboardingSkippedAt` (o banner usa isso pra ainda mostrar, mas pode espaçar a insistência — não bloqueia).

**Endpoints novos:**
| Método | Rota | Descrição | Auth |
|---|---|---|---|
| GET | /api/coach/onboarding | Estado atual: `{ completed: boolean, mode: 'full'\|'light'\|null, draft: {step,mode,startedAt}\|null, structuredProfile: AiStructuredProfile, levelEstimate: {...}\|null, hasImport: boolean }` | JWT |
| PATCH | /api/coach/onboarding | Salva progresso parcial (body Zod parcial — campos do step atual; ou `{ skip: true }`) → persiste em `ai_structured_profile` + `onboardingDraft` | JWT |
| POST | /api/coach/onboarding/complete | Finaliza: seta `onboardingCompletedAt`/`onboardingVersion`, limpa draft, sincroniza tom + grava prefs de nudge/quiet hours | JWT |
| GET | /api/coach/level-estimate | Roda a heurística de detecção de nível (RF-08) on-demand e retorna `{ nivel, confidence, evidence: {abi,volume,roi,redes,contaIdadeMeses}, humanLabel }` (sem persistir) | JWT |

**Frontend:**
- Rota nova `/coach-ai/onboarding` em `App.tsx` (protegida) → componente `client/src/pages/CoachOnboarding.tsx`. Aceita query `?mode=full|light` (default: `full` se nunca completou, `light` se perfil vazio mas conta antiga — o GET decide; frontend pode passar o que o banner mandou).
- Componente `client/src/components/coach/onboarding/OnboardingWizard.tsx` (steps internos como sub-componentes). Cada step `data-testid` estável (lesson #2). React Hook Form + Zod resolvers por step. `useQuery` no GET inicial, `useMutation` no PATCH/complete (lesson #13 — `apiRequest` retorna JSON parseado).
- **Banner persistente** — componente `client/src/components/coach/OnboardingBanner.tsx`: aparece no topo de `/coach-ai` (aba chat) e na Home (`/inicio`) quando `!onboardingCompletedAt`. Texto: "Configure seu perfil com o Grindfy AI — 3 min" + botão "Começar" (→ `/coach-ai/onboarding`) + botão "agora não" (→ `PATCH {skip:true}`, esconde o banner por essa sessão; reaparece na próxima — não há "nunca mais"). Usa `useQuery(['/api/coach/onboarding'])`. Lesson #29/#30 se houver hooks/queries em sub-componentes sem provider em testes — encapsular em ErrorBoundary se necessário (a Home renderiza em vários testes).
- O banner **não** bloqueia nada (é dismissível por sessão); o onboarding é opcional.

**Não-objetivo:** NÃO fazer o onboarding ser uma conversa-LLM real (decisão: wizard guiado — mais barato, determinístico, testável; o "toque conversacional" é só no copy dos headers). NÃO bloquear o uso do app/chat até completar. NÃO criar o nudge "complete seu perfil" como cron (o banner basta). NÃO mexer no `MiniChat.tsx` (o banner não aparece lá). O wizard NÃO chama write tools — escreve direto via os endpoints REST.

**Critério de aceitação:**
- [ ] Rota `/coach-ai/onboarding` registrada em `App.tsx` (protegida); renderiza `CoachOnboarding`.
- [ ] `GET /api/coach/onboarding` retorna `{ completed, mode, draft, structuredProfile, levelEstimate, hasImport }`; `completed` reflete `onboardingCompletedAt != null`.
- [ ] `PATCH /api/coach/onboarding` com `{ tomPreferido: 'direct', step: 6 }` persiste em `ai_structured_profile.tomPreferido` + `onboardingDraft.step`.
- [ ] `PATCH /api/coach/onboarding` com `{ skip: true }` seta `onboardingSkippedAt`, não altera `onboardingCompletedAt`.
- [ ] `POST /api/coach/onboarding/complete` com payload completo: seta `onboardingCompletedAt` + `onboardingVersion: 1`, limpa `onboardingDraft`, e `userCoachPreferences.coachTone === structuredProfile.tomPreferido`, e os toggles `nudgeB*` + `quietHoursStart/End` foram gravados conforme o payload.
- [ ] `GET /api/coach/level-estimate` retorna a estimativa sem persistir (chamar 2x não muda nada no DB).
- [ ] Wizard `full` tem 6 steps com `data-testid` estáveis; wizard `light` tem 3 steps.
- [ ] Wizard retoma do `draft.step` quando o GET retorna um draft.
- [ ] Cada step de meta/foco é pulável (validação Zod aceita ausência).
- [ ] `OnboardingBanner` aparece em `/coach-ai` (aba chat) e em `/inicio` quando `!completed`; some quando `completed`; "agora não" esconde por sessão.
- [ ] Validação de input: `tomPreferido` fora de `['gentle','balanced','direct']` → `400`; meta > 200 chars → `400`; `step` fora de range → `400`.
- [ ] Lesson #2: testes usam `data-testid`, não heurística DOM. Lesson #1: hooks antes de qualquer early return nos componentes do wizard/banner.

---

### RF-08: Detecção de nível automática — heurística rule-based
**Descrição:** Uma função pura `estimatePlayerLevel(input): LevelEstimate` (em `server/coach/playerLevel.ts`) que, a partir de métricas agregadas do jogador, estima o nível. **Rule-based, sem ML.**

**Input (carregado pelo route handler de `GET /api/coach/level-estimate` e pelo wizard step 3):**
```ts
interface LevelEstimateInput {
  abiUSD: number | null;          // ABI all-time em USD (= totalBuyins/count do getDashboardStats period='all', normalizado USD se necessário — lesson #6)
  volumeAllTime: number;          // count de torneios all-time (getDashboardStats period='all')
  volumeLast90d: number;          // count últimos 90d
  roiAllTime: number | null;      // ROI % all-time (totalProfit/totalBuyins*100)
  roiLast90d: number | null;      // ROI % últimos 90d
  distinctNetworks: number;       // quantas redes distintas no histórico (getAnalyticsBySite)
  accountAgeMonths: number;       // (now - users.createdAt) em meses
  subscriptionPlan: string;       // 'free'|'pro'|'premium' — sinal fraco, só desempate
}
```

**Heurística (thresholds — system-architect pode calibrar, mas estes são o ponto de partida; em USD):**
- **`sem_dados`:** `volumeAllTime < 30` OU `abiUSD == null`. (Amostra insuficiente — confidence `low`.)
- Senão, com `abi = abiUSD`, `vol90 = volumeLast90d`:
  - **`high_stakes`:** `abi >= 215` (≈ $215+ ABI — mid-high/high) E `volumeAllTime >= 200`. Confidence `high` se `vol90 >= 100`, senão `medium`.
  - **`mid_consistente`:** `abi >= 33` E `abi < 215` E `vol90 >= 80` E (`roiLast90d != null && roiLast90d >= -5` — não está sangrando) E `accountAgeMonths >= 6`. Confidence `high` se `vol90 >= 150 && roiAllTime != null`, senão `medium`.
  - **`micro_ascensao`:** `abi < 33` E `vol90 >= 80` (volume alto em micro — está grindando pra subir). Confidence `medium`. (Sobrepõe `recreativo_serio` quando o volume é alto.)
  - **`recreativo_serio`:** (não bateu mid nem micro_ascensao por volume) E `accountAgeMonths >= 12` E `volumeAllTime >= 100` E (`roiAllTime != null && roiAllTime > 0` — recreativo mas com edge) — volume baixo, conta antiga, ROI positivo. Confidence `medium`.
  - **`iniciando`:** fallback — `accountAgeMonths < 6` OU `volumeAllTime < 100` (mas ≥30, senão seria `sem_dados`). Confidence `low`.
- **Tie-break:** se duas regras batem (ex: volume alto em micro = `micro_ascensao` vs conta antiga ROI+ = `recreativo_serio`), prioridade: `high_stakes` > `mid_consistente` > `micro_ascensao` > `recreativo_serio` > `iniciando`.

**Output:**
```ts
interface LevelEstimate {
  nivel: PlayerLevel;
  confidence: 'low' | 'medium' | 'high';
  humanLabel: string;            // pt-BR — ex: 'micro grinder em ascensão'
  evidence: {
    abiUSD: number | null;
    volumeAllTime: number;
    volumeLast90d: number;
    roiAllTime: number | null;
    distinctNetworks: number;
    accountAgeMonths: number;
  };
  note?: string;                 // 'amostra insuficiente — joga mais que importou os dados pra eu ter certeza' quando sem_dados
}
```

**`humanLabel` por nível:** `sem_dados` → "ainda sem dados suficientes"; `iniciando` → "começando a jornada"; `micro_ascensao` → "micro grinder em ascensão"; `mid_consistente` → "mid-stakes consistente"; `high_stakes` → "high-stakes"; `recreativo_serio` → "recreativo sério".

**Uso:**
- `GET /api/coach/level-estimate` (RF-07) — roda on-demand, retorna `LevelEstimate`, **não persiste**.
- O wizard step 3 (`full`) mostra a estimativa, o usuário confirma → `PATCH /api/coach/onboarding` com `{ nivel: <confirmado>, nivelConfirmado: true }` (ou `{ nivel: <estimado>, nivelConfirmado: false }` se "prefiro não dizer" e aceita o estimado, ou `{ nivelConfirmado: false }` mantendo o estimado se recusou sem dizer outro).
- O perfil estruturado guarda `nivel` + `nivelConfirmado` + `nivelEstimadoEm`.
- **Importante (risco):** o agente **nunca assume** o nível como verdade absoluta se `nivelConfirmado` for false — o prompt instrui isso (RF-06). A detecção é uma sugestão, não um veredito.

**Não-objetivo:** NÃO usar variância/std-dev (cálculo de variância é uma tool — `analyze_variance`, AI-2A). NÃO re-estimar automaticamente em background (só on-demand no onboarding ou se o usuário pedir). NÃO usar dados de `session_tournaments` (só `tournaments` com `grind_session_id IS NULL` — §6.1; os `getDashboardStats`/`getAnalyticsBySite` já filtram).

**Critério de aceitação:**
- [ ] `estimatePlayerLevel({ abiUSD: null, volumeAllTime: 12, ... })` → `nivel: 'sem_dados'`, `confidence: 'low'`, `note` preenchido.
- [ ] `estimatePlayerLevel({ abiUSD: 8, volumeAllTime: 500, volumeLast90d: 120, roiLast90d: 15, accountAgeMonths: 10, distinctNetworks: 2, ... })` → `nivel: 'micro_ascensao'`.
- [ ] `estimatePlayerLevel({ abiUSD: 55, volumeAllTime: 800, volumeLast90d: 200, roiLast90d: -2, roiAllTime: 8, accountAgeMonths: 24, ... })` → `nivel: 'mid_consistente'`, `confidence: 'high'`.
- [ ] `estimatePlayerLevel({ abiUSD: 320, volumeAllTime: 600, volumeLast90d: 150, ... })` → `nivel: 'high_stakes'`, `confidence: 'high'`.
- [ ] `estimatePlayerLevel({ abiUSD: 22, volumeAllTime: 150, volumeLast90d: 8, roiAllTime: 6, accountAgeMonths: 30, ... })` → `nivel: 'recreativo_serio'`.
- [ ] `estimatePlayerLevel({ abiUSD: 15, volumeAllTime: 45, volumeLast90d: 20, accountAgeMonths: 3, ... })` → `nivel: 'iniciando'`, `confidence: 'low'`.
- [ ] Tie-break: input que bate `micro_ascensao` E `recreativo_serio` → retorna `micro_ascensao` (prioridade maior).
- [ ] `humanLabel` corresponde ao nível (pt-BR).
- [ ] Função é pura (mesmo input → mesmo output; sem leitura de DB / env / Date direto — `accountAgeMonths` vem no input).
- [ ] `GET /api/coach/level-estimate` carrega os inputs via `getDashboardStats(userId,'all')` + `getDashboardStats(userId,'90d')` + `getAnalyticsBySite` + `users.createdAt`, monta o `LevelEstimateInput`, chama `estimatePlayerLevel`, retorna; não persiste; conversão USD aplicada antes de comparar com thresholds (lesson #6).
- [ ] Usuário sem nenhum torneio → `GET /api/coach/level-estimate` retorna `sem_dados` sem throw.

---

### RF-09: Sincronização `tomPreferido` ↔ `userCoachPreferences.coachTone`
**Descrição:** O tom preferido aparece em dois lugares: `userCoachPreferences.coachTone` (já existe — usado por nudges/relatórios futuros) e `ai_structured_profile.tomPreferido` (novo — usado pelo system prompt). Eles devem ficar **sincronizados**. Regra:
- Quando o onboarding (`POST /api/coach/onboarding/complete`) ou o re-onboarding seta o tom → grava nos **dois** (`updateAiStructuredProfile({ tomPreferido })` + `upsertCoachPreferences({ coachTone: tomPreferido })`).
- Quando o usuário muda o tom via `PUT /api/coach/preferences` (`coachTone`) → o handler **também** atualiza `ai_structured_profile.tomPreferido` (espelha). (Decisão: o `PUT /api/coach/preferences` é a fonte de verdade da edição manual; o espelhamento garante o prompt consistente.)
- Se por algum motivo divergirem (dado legado): o `buildStaticSystemBlock` usa `structuredProfile.tomPreferido` se presente, senão cai pra... nada (não recebe `coachTone` separado — uma fonte). O route handler, ao montar `StaticInputs`, pode preferir `structuredProfile.tomPreferido ?? null` e ignorar `coachTone` — ou, alternativamente, fazer um back-fill: se `structuredProfile.tomPreferido` ausente mas `coachTone` presente, copiar `coachTone` pro perfil estruturado na primeira leitura. System-architect decide; preferir o back-fill lazy (consistência eventual barata).
- **Não-objetivo:** NÃO criar um terceiro lugar pro tom. NÃO mudar o shape de `userCoachPreferences.coachTone` (continua `'gentle'|'balanced'|'direct'`).

**Critério de aceitação:**
- [ ] `POST /api/coach/onboarding/complete` com `tomPreferido: 'direct'` → `getAiStructuredProfile(userId).tomPreferido === 'direct'` E `getCoachPreferences(userId).coachTone === 'direct'`.
- [ ] `PUT /api/coach/preferences` com `coachTone: 'gentle'` → `getCoachPreferences(userId).coachTone === 'gentle'` E `getAiStructuredProfile(userId).tomPreferido === 'gentle'` (espelhado).
- [ ] Usuário com `coachTone: 'direct'` mas `ai_structured_profile.tomPreferido` ausente (legado) → primeira leitura via o caminho que monta `StaticInputs` resulta em o prompt usar `'direct'` (via back-fill lazy ou via o handler — qualquer das duas; documentar qual).

---

### RF-10: UI de anti-fadiga — snooze/dismiss/engage de nudges in-app + estado de congelamento na aba Preferências
**Descrição:** Hoje os nudges viram `chatSession`/`chatMessage` (aparecem como conversas no hub) — não há "card de nudge" com botões de snooze/dismiss. Este RF adiciona: (a) endpoints para o frontend marcar telemetria/snooze num nudge; (b) na aba **Preferências** do hub `/coach-ai`, uma seção mostrando categorias congeladas (com motivo + botão reativar). **Não** vamos reformar o feed de nudges/chat sessions inteiro neste sprint (isso é parte do "hub timeline" — AI-1B); o mínimo aqui é tornar a telemetria e o snooze **possíveis** via API e expor o estado de congelamento na UI de Preferências.

**Endpoints novos (nudge telemetry):**
| Método | Rota | Descrição | Auth |
|---|---|---|---|
| GET | /api/coach/nudges | Lista os `coach_nudge_log` do usuário (query `?status=&category=&limit=`) — para o frontend renderizar cards/histórico | JWT |
| POST | /api/coach/nudges/:id/dismiss | Marca o nudge `dismissed` (`status='dismissed'`, `dismissedAt=now`) + dispara `checkAndFreezeCategory(userId, category)` | JWT |
| POST | /api/coach/nudges/:id/snooze | Body `{ duration: 'short' \| 'long' }` → `short` = 1 dia, `long` = 30 dias → `status='snoozed'`, `snoozeUntil = now + duration` | JWT |
| POST | /api/coach/nudges/:id/engage | Marca `engaged` (`status='engaged'`, `engagedAt=now`) — chamado quando o usuário abre/clica o nudge | JWT |
| POST | /api/coach/nudges/:id/unsubscribe | Marca `unsubscribed` + desliga o toggle da categoria (`upsertCoachPreferences({ nudgeB<Cat>: false })`) + `checkAndFreezeCategory` (já vai estar desligada, mas registra o sinal) | JWT |
| POST | /api/coach/preferences/unfreeze | Body `{ category: NudgeCategory }` → remove `frozenCategories[category]` do `userCoachPreferences` | JWT |

Todos validam ownership (`getNudgeLogById(id)` → `row.userId === req.user.userPlatformId` senão `404`/`403`). Validação Zod do body. `dismiss`/`snooze`/`engage`/`unsubscribe` num nudge que não está `sent` → `409` (ou idempotente — decisão do system-architect; preferir idempotente: re-dismiss = no-op).

**Frontend — aba Preferências (`CoachPreferencesPanel` em `CoachAI.tsx`):**
- Adicionar uma seção "Categorias pausadas" que renderiza, para cada entrada de `frozenCategories` no GET `/api/coach/preferences` (o GET passa a incluir `frozenCategories` no response — ver RF-02; `buildPrefsResponse` ganha `frozenCategories`), uma linha: `<rótulo da categoria> — pausada (motivo: você dispensou a maioria dos avisos | admin) desde <data>` + botão "Reativar" → `POST /api/coach/preferences/unfreeze` → invalida o query.
- Quando não há categorias congeladas: a seção mostra "Nenhuma categoria pausada" (ou some).
- Os 8 toggles existentes continuam; **mas**: se uma categoria está congelada, o toggle dela aparece desabilitado/marcado especialmente (decisão de UX — preferir mostrar o toggle normal + a linha na seção "pausadas"; congelamento ≠ toggle off).
- `data-testid` estáveis: `coach-prefs-frozen-section`, `coach-prefs-frozen-item-<category>`, `coach-prefs-unfreeze-<category>`.

**Frontend — card de nudge (mínimo):** **opcional neste sprint** — se o test-writer/implementer julgar que cabe sem ampliar o escopo, criar um `client/src/components/coach/NudgeCard.tsx` reusável com botões "não agora" (snooze short), "não por enquanto" (snooze long), "ok" (dismiss) e o conteúdo do nudge — usado onde os nudges aparecem (a chat session do nudge, ou um futuro feed). **Se não couber:** documentar como follow-up para AI-1B (o "hub timeline"); o mínimo obrigatório é os endpoints + a seção de congelamento na aba Preferências.

**Critério de aceitação:**
- [ ] `GET /api/coach/nudges` retorna a lista de `coach_nudge_log` do usuário (não de outros), filtrável por `status`/`category`.
- [ ] `POST /api/coach/nudges/:id/snooze` com `{ duration: 'long' }` → `coach_nudge_log` row vira `status='snoozed'`, `snoozeUntil ≈ now + 30 dias`; e depois `shouldSendNudge(userId, { category })` → `{ allow: false, reason: 'category_snoozed' }`.
- [ ] `POST /api/coach/nudges/:id/snooze` com `{ duration: 'short' }` → `snoozeUntil ≈ now + 1 dia`.
- [ ] `POST /api/coach/nudges/:id/dismiss` → `status='dismissed'`, `dismissedAt` setado; e dispara `checkAndFreezeCategory` (se a taxa estourar o threshold, a categoria congela).
- [ ] `POST /api/coach/nudges/:id/engage` → `status='engaged'`, `engagedAt` setado.
- [ ] `POST /api/coach/nudges/:id/unsubscribe` → `status='unsubscribed'` + o toggle `nudgeB<Cat>` da categoria vira `false`.
- [ ] Endpoint de nudge num id de outro usuário → `404` (não vaza).
- [ ] `POST /api/coach/preferences/unfreeze` com `{ category: 'B-STUDY' }` quando `frozenCategories['B-STUDY']` existe → remove a entrada; `GET /api/coach/preferences` reflete.
- [ ] `GET /api/coach/preferences` response inclui `frozenCategories` (vazio `{}` ou com entradas).
- [ ] Aba Preferências mostra a seção "Categorias pausadas" com as entradas de `frozenCategories` + botão reativar; some/mostra "nenhuma" quando vazio.
- [ ] Lesson #2 (data-testid), #13 (apiRequest JSON), #27 (Radix Tabs onMouseDown — a aba prefs já trata) aplicáveis.

---

### RF-11: Os crons existentes (B-SNAPSHOT, B-STUDY) respeitam snooze/congelamento/kill-switch via o engine
**Descrição:** `processBSnapshotTick` e `processBStudyTick` **já chamam `shouldSendNudge`** antes de disparar — então os checks novos (kill-switch global, categoria congelada, snooze ativo — RF-03/04) **já são respeitados automaticamente** pelo fato de o engine ser o gate. Este RF é principalmente de **verificação** + ajustes pontuais:
- Confirmar (com teste) que `processBSnapshotTick` com `COACH_NUDGES_ENABLED=false` → não cria nenhum `chatSession`/`chatMessage`/`coach_nudge_log` (o `shouldSendNudge` retorna `nudges_globally_disabled` e o loop faz `continue`).
- Confirmar que `processBStudyTick` com a categoria `B-STUDY` congelada para o user → não dispara para esse user.
- Confirmar que com um snooze ativo de `B-SNAPSHOT` → `processBSnapshotTick` não dispara para esse user até o snooze expirar.
- **Telemetria:** os crons já criam o `coach_nudge_log` row com `status: 'sent'` quando disparam — isso já é a telemetria de "entregue". Nada novo aqui (o `dismissed`/`engaged` vem dos endpoints do RF-10 quando o usuário interage).
- **Ajuste pontual:** o `cronRunner.ts` não registra os schedules de nudge se `COACH_NUDGES_ENABLED=false` (RF-04) — então em prod com a flag off, os ticks nem rodam. Mas o `processB*Tick` exportado (chamado em testes/manual) ainda deve fazer a checagem via engine (o engine tem o check 0) — garantir que sim.

**Não-objetivo:** NÃO reescrever os crons. NÃO mudar os schedules (28th 9h, hourly 19h). NÃO adicionar o nudge B-IMPORT nem novos crons (AI-1B). NÃO migrar os crons de segunda (AI-1B/§10 do plano).

**Critério de aceitação:**
- [ ] `processBSnapshotTick({ now })` com `COACH_NUDGES_ENABLED=false` → não cria `coach_nudge_log` rows, não cria `chatSession`s (loop faz `continue` para todos os users).
- [ ] `processBStudyTick({ now })` com `B-STUDY` em `frozenCategories` para um user → esse user não recebe nudge; outros users (sem congelamento) recebem normalmente.
- [ ] `processBSnapshotTick({ now })` com um snooze ativo de `B-SNAPSHOT` para um user → esse user não recebe; após o snooze expirar (`now` avançado), recebe.
- [ ] Regressão: `tests/coach/nudges/b-snapshot.test.ts` e `b-study.test.ts` continuam passando (os casos novos são aditivos).
- [ ] `startCoachCrons()` com `COACH_NUDGES_ENABLED=false` + `COACH_CRON_ENABLED=true` → não loga `coach.nudge.b_snapshot.sent` em nenhum tick (os schedules de nudge não foram registrados).

---

### RF-12: (Oportunidade) Cleanup de dead-code em `coachContext.ts`
**Descrição:** O AI-0B identificou ~100 linhas de dead-code documentado em `server/coachContext.ts` (o array `systemParts` + ~8 queries inline ~97-194) que **não alimentam** o system prompt final (que vem de `buildSystemArray`). O AI-0B recomendou remover mas deixou como opcional; **não foi feito**. Como este sprint mexe em `coachContext.ts` (adiciona o loader `getStructuredProfile` no `assembleContext` — RF-06), é oportuno limpar. **Critério de baixo risco:** só remover se nenhum teste depende do array `systemParts` ou das variáveis intermediárias (provável — ele não alimenta o `system` final). Se a remoção ampliar o escopo de risco (algum teste ou caminho depende), deixar com um TODO atualizado e seguir. **Não obrigatório.**

**Critério de aceitação (se feito):**
- [ ] `coachContext.ts` não tem mais o array `systemParts` nem as queries inline que só o alimentavam; `assembleContext` continua montando o contexto via os loaders + `buildSystemArray`.
- [ ] Nenhum teste quebra por isso. `tsc` passa.
- [ ] (Se não feito) o TODO em `coachContext.ts` é atualizado para apontar este sprint como "ainda pendente — cleanup".

---

### RF-13: Atualizar documentação
**Descrição:** Atualizar:
- `CLAUDE.md` §4 — adicionar `COACH_NUDGES_ENABLED` (default `true`/ausente; `false` desliga toda proatividade do Coach — nudges + crons de nudge).
- `Docs/api/coach.md` — documentar os endpoints novos (`/api/coach/onboarding`, `/api/coach/onboarding/complete`, `/api/coach/level-estimate`, `/api/coach/nudges`, `/api/coach/nudges/:id/{dismiss,snooze,engage,unsubscribe}`, `/api/coach/preferences/unfreeze`, `/api/admin/coach/freeze-category`) + o response expandido de `GET /api/coach/preferences` (`frozenCategories`).
- `Docs/api/endpoints-index.md` — adicionar as rotas novas ao índice (grupo coach).
- `Docs/architecture/data-model-index.md` — documentar `users.ai_structured_profile` (JSONB, shape versionado) + `user_coach_preferences.frozen_categories` (JSONB).
- `Docs/architecture/ai-coach/` — atualizar o diagrama/doc da memória (perfil estruturado + prosa) e do anti-fadiga (engine com os 2 checks novos + kill-switch + auto-congelamento).
- `Docs/architecture/lessons-learned.md` — se o sprint produzir uma lição nova (provável: algo sobre JSONB profile + back-fill, ou sobre o wizard de onboarding multi-step com persistência incremental).

**Critério de aceitação:**
- [ ] `CLAUDE.md` §4 lista `COACH_NUDGES_ENABLED`.
- [ ] `Docs/api/coach.md` documenta os 8 endpoints novos + o response expandido de preferences.
- [ ] `Docs/architecture/data-model-index.md` documenta as 2 colunas JSONB novas.
- [ ] `Docs/api/endpoints-index.md` reflete as rotas novas.

---

## Requisitos Não-Funcionais
- **Anti-fadiga é o gate de tudo proativo:** nenhum nudge novo (AI-1B+) vai live antes deste sprint estar mergeado e testado. O `nudgeEngine` é a **fonte única** de "posso disparar?" — todo caminho de proatividade passa por `shouldSendNudge`. Os 8 checks finais (0: kill-switch; 1: toggle; 1.5: frozen; 1.6: snooze; 2: quiet hours; 3: daily cap; 4: hourly cap; 5: cycle) são sequenciais, baratos primeiro, decisivos primeiro.
- **Lesson #7 (deprecation gradual):** a coluna `ai_structured_profile` é `nullable` (ou com default `'{}'`), **nunca required puro**; o storage normaliza (back-fill `schemaVersion` + arrays). `frozenCategories` é `NOT NULL DEFAULT '{}'::jsonb` (mapa vazio é válido). Nenhuma migração faz `ALTER ... SET NOT NULL` sem default.
- **Lesson #9 (try/catch logado):** todo acesso a DB nos novos módulos (`aiStructuredProfile.ts`, `nudgeAutoFreeze.ts`, novos storage methods) loga estruturado antes do fallback safe; distingue "no rows" de "DB explodiu". O `nudgeEngine` continua safe-deny em erro.
- **Lesson #10 (DRY prompts):** o bloco do perfil estruturado vai em `coachSystemBuilder.ts` (fonte única, junto dos outros blocos). Quebra única do cache aceita. Não duplicar literal entre `coachPrompts.ts` legacy e `coachSystemBuilder.ts`.
- **Lesson #6 (conversão de moeda):** a detecção de nível compara ABI/buy-ins com thresholds em USD — sempre normalizar pra USD antes (o `getDashboardStats` retorna em USD para a maioria dos casos; confirmar e converter se necessário).
- **Lesson #19/#21 (cache server-side TTL):** se `getAiStructuredProfile` cachear (TTL 30s), expor `_resetForTests()` e invalidar em todo `updateAiStructuredProfile`. O `getCoachPreferences` já faz isso (invalidate em `upsert`).
- **Lesson #2 (data-testid):** todos os componentes novos (wizard steps, banner, seção de congelamento, card de nudge se feito) têm `data-testid` estáveis; testes não usam heurística DOM.
- **Lesson #1 (hooks primeiro):** componentes do wizard/banner colocam todos os hooks antes de qualquer early return.
- **Lesson #13 (apiRequest JSON):** mutations do frontend usam `apiRequest(method, url, body)` que retorna JSON parseado; mocks em testes retornam o JSON, não `{ ok, json: () => ... }`.
- **Lesson #29/#30 (useQuery sem provider / hook test jsdom):** o `OnboardingBanner` na Home usa `useQuery` — se algum teste da Home renderiza sem `QueryClientProvider`, encapsular o banner numa ErrorBoundary local (ou o teste fornece provider). Hook tests em `.test.ts` que usam `renderHook` precisam ir no projeto jsdom (config-level).
- **Onboarding curto e opcional:** `full` ≤ 6 steps, ≤ 5 min; `light` = 3 steps, ≤ 2 min. Nada bloqueia o uso do app. O banner é dismissível por sessão.
- **Detecção de nível nunca assumida como verdade:** `nivelConfirmado: false` → o prompt instrui o agente a confirmar antes de assumir; a estimativa é sugestão.
- **Zero regressão:** os ~8500 testes existentes continuam passando, exceto: `tests/coach/citations/system-prompt-snapshot.test.ts` (mudança intencional do snapshot — bloco do perfil estruturado adicionado); ajustes aditivos em `tests/coach/nudge-engine/*` e `tests/coach/nudges/*` (casos novos para os 2 checks + kill-switch); possível ajuste em testes que mockam `getCoachPreferences` (agora o shape tem `frozenCategories` — mocks idealizados quebram, lesson #3 — validar shape real).
- **Custo Anthropic:** o bloco do perfil estruturado adiciona ~100-300 tokens ao bloco STATIC cacheado — desprezível (e cacheado). O onboarding **não** chama o LLM (wizard guiado). A detecção de nível **não** chama o LLM (heurística). Sem mudança de custo esperada.

---

## Endpoints Previstos
| Método | Rota | Descrição | Auth |
|---|---|---|---|
| GET | /api/coach/onboarding | Estado do onboarding (`completed`, `mode`, `draft`, `structuredProfile`, `levelEstimate`, `hasImport`) | JWT |
| PATCH | /api/coach/onboarding | Salva progresso parcial (campos do step) ou `{ skip: true }` | JWT |
| POST | /api/coach/onboarding/complete | Finaliza: `onboardingCompletedAt`, limpa draft, sincroniza tom + grava prefs de nudge | JWT |
| GET | /api/coach/level-estimate | Roda a heurística de detecção de nível on-demand (não persiste) | JWT |
| GET | /api/coach/nudges | Lista `coach_nudge_log` do usuário (`?status=&category=&limit=`) | JWT |
| POST | /api/coach/nudges/:id/dismiss | Marca `dismissed` + `checkAndFreezeCategory` | JWT |
| POST | /api/coach/nudges/:id/snooze | `{ duration: 'short'\|'long' }` → snooze 1d / 30d | JWT |
| POST | /api/coach/nudges/:id/engage | Marca `engaged` | JWT |
| POST | /api/coach/nudges/:id/unsubscribe | Marca `unsubscribed` + desliga o toggle da categoria | JWT |
| POST | /api/coach/preferences/unfreeze | `{ category }` → remove `frozenCategories[category]` | JWT |
| POST | /api/admin/coach/freeze-category | `{ userId, category, action: 'freeze'\|'unfreeze' }` | JWT + admin |
| GET | /api/coach/preferences | (existente — response ganha `frozenCategories`) | JWT |
| PUT | /api/coach/preferences | (existente — passa a espelhar `coachTone` → `structuredProfile.tomPreferido`) | JWT |

## Modelos de Dados Afetados

### `users` — alteração (migração 0065)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| ai_structured_profile | jsonb | nullable (ou DEFAULT `'{}'::jsonb`) | Perfil estruturado versionado (`AiStructuredProfile`, shape no RF-01). Lesson #7 — back-fill `schemaVersion` no storage; nunca required. |

### `user_coach_preferences` — alteração (migração 0066, ou consolidada na 0065)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| frozen_categories | jsonb | NOT NULL DEFAULT `'{}'::jsonb` | Mapa `{ [category]: { frozenAt, reason, dismissRate?, windowDays? } }`. Edição via PUT só descongela; congelamento só por auto-congelamento ou admin. |

### `coach_nudge_log` — nenhuma coluna nova obrigatória
- Status `'unsubscribed'` é um novo valor permitido na coluna `status` (varchar 16 — cabe). `engagedAt`/`dismissedAt`/`snoozeUntil` já existem (ADR-085). (Opcional, não obrigatório: `engagement_source varchar(32)` — fica como nota.)

### `user_ai_profile`, `monthly_coach_summaries` — inalterados
A prosa em `user_ai_profile.content` continua intacta; o perfil estruturado é aditivo (em `users`). `monthly_coach_summaries` não é tocado.

## Integrações Externas
| Serviço | Propósito | Quando |
|---|---|---|
| Anthropic API (Claude Sonnet 4.6) | Chat do Coach — system prompt STATIC ganha o bloco do perfil estruturado (~100-300 tokens, cacheado) | A cada `/api/coach/chat` |
| Anthropic API (Claude Haiku 4.5) | Memória — `compactSession`/`checkMonthlyCompaction` (prosa) — **inalterado neste sprint** | Ao arquivar sessão / lazy mensal |
| (Nenhuma nova integração externa) | — | — |

---

## Cenários de Teste Derivados

### Happy Path
- [ ] Usuário novo abre `/coach-ai` → vê o banner "Configure seu perfil — 3 min" → clica "Começar" → wizard `full` 6 steps → preenche perfil, vê detecção de nível ("parece que você é micro grinder em ascensão"), confirma, define 1 meta + foco, escolhe tom "direto", deixa nudges nos defaults → "Concluir" → `onboardingCompletedAt` setado, `coachTone === 'direct'`, `ai_structured_profile` populado; banner some.
- [ ] Usuário existente com perfil de IA vazio abre o chat → o system prompt instrui o agente a oferecer diagnóstico rápido → o agente oferece → (fora do escopo automatizado: o usuário aceita) → vai pra `/coach-ai/onboarding?mode=light` → 3 steps → "Concluir" → perfil parcialmente populado.
- [ ] Usuário Pro recebe um nudge B-STUDY (cron) → vê o card (se RF-10 card feito) ou a chat session → clica "não agora" → `POST /api/coach/nudges/:id/snooze {duration:'short'}` → próximo tick (mesmo dia) não dispara B-STUDY pra ele; no dia seguinte volta a poder.
- [ ] Usuário dispensa 3 dos últimos 4 nudges B-VOLUME → `checkAndFreezeCategory` → categoria congela → aba Preferências mostra "Avisos de volume — pausados (você dispensou a maioria) desde hoje" + um `coach_nudge_log` de aviso foi criado → usuário clica "Reativar" → `POST /api/coach/preferences/unfreeze` → categoria volta.
- [ ] Founder seta `COACH_NUDGES_ENABLED=false` → próximo `processBSnapshotTick` não cria nada; `shouldSendNudge` retorna `nudges_globally_disabled` pra tudo.
- [ ] `buildStaticSystemBlock` com perfil estruturado populado → o system prompt tem `## Perfil Estruturado do Jogador:` com nível confirmado, metas, foco, tom (com instrução de aplicar tom direto), redes.

### Validação de Input
- [ ] `PATCH /api/coach/onboarding` com `tomPreferido: 'aggressive'` → `400`.
- [ ] `PATCH /api/coach/onboarding` com uma meta de 250 chars → `400`.
- [ ] `PATCH /api/coach/onboarding` com `step: 99` → `400` (fora de range).
- [ ] `POST /api/coach/nudges/:id/snooze` com `{ duration: 'forever' }` → `400`.
- [ ] `POST /api/coach/nudges/:id/dismiss` num id de outro usuário → `404`.
- [ ] `POST /api/coach/preferences/unfreeze` com `{ category: 'B-XYZ' }` (categoria inexistente) → `400`.
- [ ] `POST /api/admin/coach/freeze-category` por não-admin → `403`.
- [ ] `PUT /api/coach/preferences` tentando injetar `frozenCategories: { 'B-STUDY': {...} }` (adicionar congelamento) → ignorado ou `400` (não consegue congelar via PUT).
- [ ] `updateAiStructuredProfile` com `metas` de 5 elementos → persistido com 3 (clampado).

### Regras de Negócio
- [ ] `shouldSendNudge` ordem: `category_frozen` vence `quiet_hours` quando ambos se aplicam; `nudges_globally_disabled` (check 0) vence tudo, inclusive `isCritical`.
- [ ] `getActiveSnoozeForCategory` retorna o `snoozeUntil` mais futuro entre os rows `snoozed` da categoria; snooze expirado não bloqueia.
- [ ] `getNudgeDismissRate` exclui rows `snoozed` do denominador; inclui `dismissed` + `unsubscribed` no numerador.
- [ ] `checkAndFreezeCategory` não congela com `sent < 3` (amostra insuficiente) mesmo com rate 1.0.
- [ ] `checkAndFreezeCategory` é idempotente — categoria já congelada não recria o aviso.
- [ ] `estimatePlayerLevel` é pura e os 6 níveis + tie-break batem os thresholds (ver RF-08 critérios).
- [ ] `estimatePlayerLevel` com `volumeAllTime < 30` → `sem_dados` independente dos outros campos.
- [ ] Sincronização: `POST /onboarding/complete` com `tomPreferido` grava nos dois lugares; `PUT /preferences` com `coachTone` espelha pro perfil estruturado.
- [ ] Detecção de nível usa `getDashboardStats` (que filtra `grind_session_id IS NULL`) — nunca agrega `session_tournaments` (§6.1).
- [ ] Conversão de moeda: ABI em BRL convertido pra USD antes de comparar com thresholds USD na heurística.
- [ ] `isStructuredProfileEmpty` é `true` só se nenhum de {nível confirmado, metas, focoDoMes, tomPreferido, onboardingCompletedAt} está presente.

### Edge Cases
- [ ] Usuário sem nenhum torneio → `GET /api/coach/level-estimate` → `sem_dados`, `note` preenchido, sem throw; o wizard step 3 mostra "ainda sem dados — me conta o que você acha que é" (auto-declaração opcional).
- [ ] `getAiStructuredProfile` num user com a coluna `null` → `{ schemaVersion: 1 }`, sem throw.
- [ ] Erro de DB ao ler `ai_structured_profile` → log + retorna `{ schemaVersion: 1 }` (lesson #9).
- [ ] Erro de DB ao consultar snooze/frozen no `nudgeEngine` → safe-deny `engine_error` com `console.error` (lesson #9) — não throw.
- [ ] `buildStaticSystemBlock` com `structuredProfile` vazio + `reOnboardingDeclinedAt` recente → bloco omitido (nem a linha de oferta).
- [ ] Wizard abandonado no step 4 → reabrir `/coach-ai/onboarding` → GET retorna `draft.step=4` → wizard retoma do step 4 com os dados já salvos.
- [ ] Usuário pula o onboarding ("agora não") → `onboardingSkippedAt` setado → banner some por essa sessão → próxima sessão o banner reaparece (não há "nunca mais").
- [ ] `PUT /api/coach/preferences` com `nudgeBStudy: false` numa categoria que tinha 3 dismiss recentes → desliga o toggle (e opcionalmente dispara `checkAndFreezeCategory`, que pode ou não congelar — já está desligada, o efeito prático é o mesmo).
- [ ] `processBStudyTick` com um user que tem `B-STUDY` congelada E outro user sem congelamento → só o segundo recebe.
- [ ] Mock de `getCoachPreferences` em teste sem `frozenCategories` → o código que lê `prefs.frozenCategories` deve tolerar `undefined` (normalize back-fills `{}`) — lesson #3 (validar shape real; mocks idealizados quebram).
- [ ] `_resetPrefsCacheForTests()` + `_resetAiStructuredProfileCacheForTests()` em `beforeEach` — runs subsequentes não herdam estado cacheado.
- [ ] `tests/coach/citations/system-prompt-snapshot.test.ts` — snapshot atualizado pelo test-writer (mudança intencional, não regressão).
- [ ] Wizard step de redes principais com "outra rede" texto livre de 100 chars → clampado a 50 chars na persistência (ou `400` — decisão do system-architect).

---

## Fora de Escopo (não-objetivos explícitos)
- **Relatórios automáticos** (Daily Debrief, Weekly Report, Monthly Report, Quarterly Review), tabelas `report_jobs`/`reports`, job runner timezone-aware, idempotência de relatórios — isso é AI-1B/1C.
- **Nudge B-IMPORT** (cobrança de import) e os crons novos — AI-1B.
- **Aposentar os 2 crons de segunda** (coach recommendation 6h BRT + weekly study plan) → absorver no Weekly Report — AI-1B (§10 do plano). Por ora o `generateCoachRecommendations` só passa a ser gateado pelo `COACH_NUDGES_ENABLED` (RF-04).
- **Novas tools de carreira/diagnóstico** (`define_career_goal`, `analyze_variance`, `diagnose_plateau`, `bulk_propose_grade`, etc.) — AI-2A. O onboarding deste sprint **não** usa write tools — escreve via endpoints REST dedicados.
- **Email como canal** de relatórios/nudges — AI-2B (founder Q7: in-app primeiro). Os campos `channelEmail`/`channelPush` já existem em `userCoachPreferences` mas não são usados neste sprint.
- **Pool intelligence BR** (metadata sobre Suprema/GG/Stars) no system prompt — é uma tool (`query_pool_intelligence`, AI-2A), não vai no prompt.
- **Quick suggestions contextuais ricas** (que mudam por página/estado — anti-blank-page completo, C4 do plano) — AI-1B. (O `ReportsPanel`/`ChatPanel` do hub não ganha quick suggestions ricas aqui.)
- **`padroesConhecidos` inferidos automaticamente** pelo agente — só o que o usuário declarou no onboarding ou foi explicitamente registrado.
- **Mental tracking** (C-game tracker, Mental Hand History, wellbeing prompts) — AI-2B (founder Q6: só temas de poker, dados do warm-up).
- **Re-estimativa de nível em background** — só on-demand (onboarding ou se o usuário pedir).
- **Card de nudge in-app reusável (`NudgeCard.tsx`)** — opcional neste sprint; se não couber, follow-up para AI-1B (o "hub timeline"). O mínimo obrigatório do RF-10 são os endpoints + a seção de congelamento na aba Preferências.
- **Reformar o feed de nudges** (hoje viram `chatSession`/`chatMessage`) — AI-1B (hub timeline).
- **Auto-descongelar categorias** congeladas — congelamento por dismiss alto não expira sozinho; o usuário (ou admin) reativa manualmente. (Cooldown opcional de re-oferta fica como nota, não obrigatório.)
- **Kill-switch admin global por categoria** (congelar B-STUDY para todos os users) — a v1 é por-user. Fica como nota.
- **`confirmation_level` em `coach_actions`** — não tocado (era nota do AI-0A; continua só no tool descriptor em memória).
- **MSW para testes de integração do Coach** (CSRF, refresh, 401) — pendência conhecida, fora deste sprint.
- **Conversa-LLM real no onboarding** — decisão: wizard guiado. O onboarding como conversa de verdade (o LLM faz as perguntas) fica como possível evolução futura, fora da v1.
- **Corrigir o bug pré-existente da rota `GET '\api\coach\audit'`** (backslashes no path em `routes/coach.ts`) — flagueado, mas fora do escopo deste sprint (a menos que o test-writer/implementer note que quebra um teste deste sprint — improvável).

## Dependências
- **AI-0B** (agente único "Grindfy AI" + `coachSystemBuilder` consolidado + hub `/coach-ai` com tabs + page context plugado) — **entregue** (commit 5ffc95a). O bloco do perfil estruturado (RF-06) encaixa no `buildStaticSystemBlock` consolidado; a aba Preferências (RF-10) já existe no hub.
- **AI-0A** (tools religadas + citations/confidence fonte única) — entregue. (Não é dependência direta deste sprint, mas o contexto.)
- Infra de nudge (engine 5 checks, `user_coach_preferences`, `coach_nudge_log` com `snoozeUntil`, 2 crons, `coachPreferences` storage) — **já existe** (Sprint Coach Sprint 0, ADR-084/085 + Coach-2B ADR-087). Este sprint **completa** essa infra (snooze ativo + telemetria + auto-congelamento + kill-switch), não a recria.
- **Bloqueia:** AI-1B (Weekly Report + B-IMPORT + gap-check) — o anti-fadiga completo é pré-requisito obrigatório de qualquer nudge/relatório novo (risco R1 do plano: nag fatigue).

## Notas de Implementação (sugestões — system-architect refina, implementer executa)
- **Storage injetável (lesson #34):** os handlers novos de route (`handleGetOnboarding`, `handlePatchOnboarding`, `handleCompleteOnboarding`, `handleGetLevelEstimate`, `handleGetNudges`, `handleNudgeDismiss/Snooze/Engage/Unsubscribe`, `handleUnfreezeCategory`, `handleAdminFreezeCategory`) seguem o padrão `export async function handleX(req, res, injectedStorage?)` — em prod, lazy `await import('../storage')`; em teste, mock por composição. Aplicar também aos novos módulos (`aiStructuredProfile.ts`, `nudgeAutoFreeze.ts`, `playerLevel.ts`).
- **`playerLevel.ts` puro:** `estimatePlayerLevel` não lê DB/env/`new Date()` — recebe tudo no `LevelEstimateInput` (incluindo `accountAgeMonths` já calculado). O route handler é quem carrega os dados (`getDashboardStats` ×2 + `getAnalyticsBySite` + `users.createdAt`) e calcula `accountAgeMonths`. Isso torna a heurística trivialmente testável.
- **`nudgeEngine` — env resolvido a cada chamada:** `COACH_NUDGES_ENABLED` lido dentro de `shouldSendNudge` (não em module-load) — padrão `getMemoryModel()`/`getCoachPreferences` (reflete runtime em testes).
- **`coachPreferences.ts` — `frozenCategories` no normalize:** `normalizeCoachPreferences` ganha `frozenCategories: row?.frozenCategories ?? {}` — mocks de `getCoachPreferences` que não setam isso continuam funcionando (lesson #3 — mas o normalize protege).
- **Migrações:** 0065 (users.ai_structured_profile) + 0066 (user_coach_preferences.frozen_categories) — ou consolidar numa só `0065_ai_1a_structured_profile_and_nudge_freeze.sql`. System-architect decide; preferir separadas por concern (perfil ≠ anti-fadiga). Confirmar que 0064 é o último (é). `db:push` local + commit das migrations (autonomia liberada — `memory/autonomy_db_and_push_2026-05-03.md`).
- **`buildSystemArray` cache:** o bloco do perfil estruturado entra no STATIC; a quebra única do cache key é planejada e aceita (ADR-019 + lesson #10). Não introduzir variante "backticked".
- **Onboarding wizard — RHF + Zod por step:** cada step tem seu schema Zod; o `PATCH /api/coach/onboarding` valida o sub-schema do step. O `POST /complete` valida o agregado. Lesson #2 — `data-testid` por step e por campo.
- **Banner na Home — ErrorBoundary (lesson #29):** o `OnboardingBanner` usa `useQuery` — se a Home renderiza em testes sem `QueryClientProvider`, encapsular o banner numa ErrorBoundary local (badge fica null silenciosamente) OU os testes da Home fornecem provider. Verificar como os testes da Home estão estruturados antes.
- **Hook tests jsdom (lesson #30):** se criar um hook `useCoachOnboarding` testado via `renderHook`, o `.test.ts` precisa ir no projeto jsdom (config-level — exclude do projeto server, include no client).
- **`require()` vs `await import()` em testes .tsx (lessons #14/#26):** test-writer usa `await import(...)` para carregar `CoachOnboarding.tsx` / `OnboardingWizard.tsx` / `OnboardingBanner.tsx` — nunca `require()`.
- **Doc da rota audit com backslash:** notar (mas não corrigir) que `app.get('\api\coach\audit', ...)` em `routes/coach.ts` parece ter backslashes — provável bug pré-existente; se não impede compilação nem quebra um teste deste sprint, deixar (flagueado).
- **Branch:** trabalhar em `feature/sprint-ai-1a` (lesson #24 — `git status` periódico; auto-mode pode trocar branch silenciosamente).

## Sugestão de ADRs a criar (para o system-architect)
1. **ADR — "Perfil estruturado do jogador (JSONB em `users.ai_structured_profile`) — fonte confiável pro prompt + base do ciclo de vida":** decisão de usar JSONB em `users` (vs tabela nova vs expandir `user_ai_profile`); shape versionado (`schemaVersion`); a prosa em `user_ai_profile.content` continua (notas qualitativas); o estruturado é aditivo; lesson #7 (nullable + default + back-fill); sincronização `tomPreferido` ↔ `userCoachPreferences.coachTone`.
2. **ADR — "Anti-fadiga do Grindfy AI — snooze + telemetria + auto-congelamento + kill switch":** o engine ganha 2 checks (frozen, snooze) + check 0 (kill-switch `COACH_NUDGES_ENABLED`); ordem final dos 8 checks; auto-congelamento (thresholds: janela 7d, sample mínimo 3, dismiss rate >50%; congelamento mora em `user_coach_preferences.frozen_categories`; não auto-descongela; aviso ao usuário via `coach_nudge_log` row); kill-switch admin por-categoria; status `'unsubscribed'` na log. Estende ADR-085 (nudge engine).
3. **ADR — "Onboarding conversacional opcional do Grindfy AI — wizard guiado, persistência incremental, banner persistente":** decisão wizard guiado vs conversa-LLM; rota `/coach-ai/onboarding`; modos `full` (6 steps) / `light` (3 steps); persistência via `ai_structured_profile` + `onboardingDraft`; opcional mas incentivado (banner, dismissível por sessão, não bloqueia); endpoints REST (não write tools). Estende/relaciona ADR-148/150 (Grindfy AI + hub).
4. **ADR — "Detecção de nível do jogador — heurística rule-based":** decisão rule-based (sem ML); os 6 níveis + thresholds (ABI/volume/ROI/redes/idade da conta, em USD); tie-break; `confidence`; **sempre confirmar com o usuário** (`nivelConfirmado`); on-demand only; usa `getDashboardStats` (filtra §6.1). Os thresholds são calibráveis — documentar como ponto de partida.
5. **Atualização de docs** (não ADRs): `Docs/api/coach.md`, `Docs/api/endpoints-index.md`, `Docs/architecture/data-model-index.md`, `Docs/architecture/ai-coach/`, `CLAUDE.md` §4.

## Verificação Final (checklist pm-spec)
- [x] Cada RF tem critérios de aceitação verificáveis.
- [x] Cenários de teste cobrem happy path, validação de input, regras de negócio e edge cases.
- [x] Seção "Fora de Escopo" preenchida e detalhada.
- [x] Sem ambiguidade — cada regra tem uma interpretação única (shape do JSONB, ordem dos checks do engine, thresholds da heurística, modos do wizard, comportamento do kill-switch, sincronização do tom). Pontos onde o system-architect decide (migrações separadas vs consolidada; forma exata da validação do `frozenCategories` no PUT; ErrorBoundary vs provider nos testes da Home; back-fill lazy vs handler para o tom legado; cooldown de re-oferta; card de nudge opcional) estão sinalizados.
- [x] Spec é independente o suficiente para o test-writer gerar testes (shapes explícitos, endpoints com bodies, output shapes, thresholds nomeados, comportamentos de erro definidos, lessons aplicáveis listadas).
- [x] Endpoints listados (12 novos/alterados; método, rota, descrição, auth).
- [x] Modelos de dados: 2 colunas JSONB novas (migrações 0065/0066), 1 novo valor de enum em `status` — documentados com constraints e notas.
