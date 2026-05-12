# ADR-152: Anti-fadiga do Grindfy AI — snooze ativo + telemetria + auto-congelamento de categoria + kill switch global (estende o engine de nudge — ADR-085)

## Status
Aceito

## Data
2026-05-12

## Contexto

O Sprint AI-1A (`Docs/specs/sprint-ai-1a.md`, RF-02/03/04/05/10/11) **completa** a infra de anti-fadiga de nudge. Hoje (pos-ADR-084/085/087) ja existe:
- `server/coach/nudgeEngine.ts` — `shouldSendNudge(userId, ctx)` com **5 checks sequenciais**: (1) categoria toggle off → `category_disabled`; (2) quiet hours timezone-aware (bypass se `isCritical`) → `quiet_hours`; (3) daily cap (24h rolling, exclui `snoozed`) → `daily_cap_reached`; (4) hourly cap → `hourly_cap_reached`; (5) one-shot per cycle (`cycleKey`) → `already_sent_this_cycle`. Safe-deny em erro (`engine_error`, lesson #9). `now: Date` injetavel.
- `userCoachPreferences` (ADR-084) — 8 toggles `nudgeB*`, `quietHoursStart/End`, `maxNudgesPerDay/Hour`, `channelInApp/Email/Push`, `coachTone`. `getCoachPreferences` com cache 30s + safe fallback + invalidate em upsert.
- `coachNudgeLog` (ADR-085) — `category`, `cycleKey`, `status` (`sent|engaged|dismissed|snoozed`), `titleI18n`, `bodyPreview`, `channel`, `chatSessionId`, `triggeredByEvent`, `sentAt`, `engagedAt`, `dismissedAt`, **`snoozeUntil`** (a coluna ja existe!), `createdAt`. 3 indices.
- `server/storage.ts` — `createNudgeLog`, `countNudgeLog`, `findNudgeLog`, `updateNudgeLogStatus` (ja trata `dismissed`→`dismissedAt`, `engaged`→`engagedAt`, `snoozed`→`snoozeUntil`).
- `server/coach/cronRunner.ts` — node-cron in-process (ativa em `NODE_ENV=production` OU `COACH_CRON_ENABLED=true`), `withAdvisoryLock` (ADR-144). 4 schedules: `* * * * *` cleanup pending coach_actions; `0 * 28 * *` B-SNAPSHOT (filtra `localHour==9`); `0 * * * *` B-STUDY (filtra `localHour==19`, foco ativo); `0 6 * * 1` BRT `generateCoachRecommendations` (ADR-112).
- `server/coach/jobs/processBSnapshot.ts` + `processBStudy.ts` — iteram users, chamam `shouldSendNudge` com `cycleKey`, criam `chatSession` + `chatMessage` + `createNudgeLog({status:'sent'})`.

**O que falta** (e o que este ADR resolve):
1. **Snooze ativo nao e um check** — o engine exclui `snoozed` do *count* do cap, mas nao tem um check "essa categoria esta em snooze ativo para esse user". Falta o check + o storage method `getActiveSnoozeForCategory`.
2. **Telemetria por-nudge** — `engaged`/`dismissed`/`snoozed` ja existem como status; falta o status `unsubscribed` (quando o user desliga a categoria a partir de um nudge — distinto de "dismissed") + endpoints REST para o frontend marcar (`POST /api/coach/nudges/:id/{dismiss,snooze,engage,unsubscribe}` + `GET /api/coach/nudges`).
3. **Auto-congelamento de categoria** — quando uma categoria acumula taxa de dismiss alta numa janela, congela (some dos disparos) + avisa o usuario. Falta: onde guardar o estado de congelamento + o service que calcula + integracao no engine.
4. **Kill switch global** — env var que desliga toda a proatividade (nudges + crons de nudge) — analogo a `NEWS_FEED_ENABLED` (ADR-100/106). Falta a env var + o check 0 no engine + o gating no `cronRunner`.

A pergunta central: **onde mora o estado de congelamento? Como o engine consome snooze e congelamento? Quais thresholds do auto-congelamento? Default do kill switch? O que acontece com nudges ja `sent` quando o kill switch aciona?**

### Restricoes

- **Anti-fadiga e o gate de tudo proativo** — `nudgeEngine` e a fonte unica de "posso disparar?". Nenhum nudge novo (AI-1B+) vai live antes deste sprint. Os checks sao sequenciais — barato/decisivo primeiro.
- **Lesson #9 (safe-deny):** erro ao consultar snooze/frozen → `engine_error` com `console.error` logado; nao throw.
- **Lesson #7:** a coluna `frozen_categories` e `NOT NULL DEFAULT '{}'::jsonb` (mapa vazio e valido — nao precisa back-fill nullable porque tem default); `normalizeCoachPreferences` back-fills `frozenCategories ?? {}` (mocks idealizados — lesson #3 — protegidos).
- **Default ON do kill switch:** a infra de nudge ja esta em producao via `NODE_ENV=production` no cronRunner; mudar para default OFF quebraria comportamento. O kill switch e uma alavanca de emergencia, nao um opt-in.
- **Nao auto-descongelar:** congelamento por dismiss alto deve ser uma acao consciente do usuario para reativar (evita ping-pong).
- **Nao mudar a semantica dos 5 checks existentes** nem o shape de `NudgeDecision` (so adiciona reasons novos).
- **Lesson #34:** os handlers novos de route recebem `injectedStorage?`.

## Opcoes Consideradas

### Onde guardar o estado de congelamento por categoria

**Opcao A: coluna JSONB `user_coach_preferences.frozen_categories` (ESCOLHIDA)** — mapa `{ [category: NudgeCategory]: { frozenAt: string; reason: 'auto_dismiss_rate' | 'admin' | 'manual'; dismissRate?: number; windowDays?: number } }`. Default `'{}'::jsonb`, `NOT NULL`. Migracao 0066.
- **Pros:** mora junto das outras preferencias de nudge (`getCoachPreferences` ja e lido no check 1 do engine — pega `frozenCategories` de gracinha, sem query extra); JSONB flexivel (motivo + metadados); pattern ja consolidado; o `PUT /api/coach/preferences` ja existe (so precisa de uma regra de validacao para nao deixar adicionar congelamento via PUT — so descongelar).
- **Contras:** edicao via PUT precisa de uma regra especial (ver §validacao abaixo). Aceito.

**Opcao B: tabela nova `coach_frozen_categories`** — `(user_id, category, frozen_at, reason, ...)`.
- **Pros:** colunas tipadas; query "todas as categorias congeladas no sistema" trivial (analytics).
- **Contras:** query extra no engine (hot path) para checar congelamento (ou JOIN); over-engineering para um mapa de ≤8 entradas por user. **Rejeitada.**

**Opcao C: derivar congelamento de `coach_nudge_log` on-the-fly** — nao persistir; o engine calcula a taxa de dismiss a cada chamada.
- **Pros:** zero estado novo.
- **Contras:** **query pesada no hot path** (count + agregacao a cada `shouldSendNudge`); nao da para "descongelar manualmente" (a taxa nao muda quando o user reativa); nao da para o admin congelar; o aviso ao usuario nao tem onde "lembrar" que ja avisou. **Rejeitada.**

### Default do kill switch global

**Opcao A: default ON, `COACH_NUDGES_ENABLED=false` para desligar (ESCOLHIDA)** — analogo a... na verdade o **oposto** de `NEWS_FEED_ENABLED` (que e default OFF / opt-in). A infra de nudge ja roda em prod; o kill switch e emergencia. Default OFF quebraria comportamento existente.
- **Pros:** nao quebra prod; alavanca de emergencia clara.
- **Contras:** assimetrico com `NEWS_FEED_ENABLED` (que e opt-in). Aceito — semanticas diferentes (news era feature nova; nudge ja esta vivo).

**Opcao B: default OFF, opt-in** — `COACH_NUDGES_ENABLED=true` para ligar.
- **Contras:** quebra a proatividade em prod no dia do deploy. **Rejeitada.**

### O que acontece com nudges ja `sent` quando o kill switch aciona

**Opcao A: o kill switch so para de emitir novos; nudges ja `sent` permanecem (ESCOLHIDA)** — `shouldSendNudge` retorna `nudges_globally_disabled` (check 0) para qualquer nova decisao; os `coach_nudge_log` rows `sent`/as `chatSession`s ja criadas ficam (o usuario ainda pode ve-las/interagir; os endpoints de dismiss/snooze/engage continuam funcionando — nao sao "proatividade", sao reacao do usuario).
- **Pros:** simples; nao destroi historico; o usuario nao perde nudges que ja recebeu.
- **Contras:** se o motivo do kill switch e "esses nudges estao quebrados", os ja enviados continuam visiveis. Aceito — o kill switch e para *parar de gerar mais*, nao para *retroativamente apagar*.

**Opcao B: o kill switch tambem marca os `sent` recentes como `dismissed`/oculta** — limpeza retroativa.
- **Contras:** destrutivo; perde telemetria; complica o que e uma alavanca de emergencia. **Rejeitada.**

## Decisao

**Adotar:** (a) congelamento em `user_coach_preferences.frozen_categories` (JSONB, `NOT NULL DEFAULT '{}'`, migracao **0066** — separada da 0065 do perfil estruturado, por concern); (b) o engine ganha **2 checks novos** (1.5 categoria congelada, 1.6 snooze ativo) + **check 0** (kill switch global `COACH_NUDGES_ENABLED`); (c) auto-congelamento em `server/coach/nudgeAutoFreeze.ts` (janela 7d, sample minimo 3, dismiss rate > 50%); (d) kill switch global default ON, `=false` desliga (engine check 0 absoluto + cronRunner nao registra os schedules de nudge); (e) status `unsubscribed` na log; (f) endpoints REST de telemetria/snooze + endpoint admin de congelamento.

### Ordem final do engine (8 checks)

```
0.   Kill switch global       → nudges_globally_disabled   (process.env.COACH_NUDGES_ENABLED === 'false') — ABSOLUTO, nem isCritical bypassa
1.   Categoria toggle off     → category_disabled          (prefs.nudgeB<Cat> === false)
1.5. Categoria congelada      → category_frozen            (prefs.frozenCategories[ctx.category] existe) — bypass se isCritical
1.6. Snooze ativo             → category_snoozed           (getActiveSnoozeForCategory(userId, category, now) > now) — bypass se isCritical
2.   Quiet hours              → quiet_hours                (bypass se isCritical) — inalterado
3.   Daily cap                → daily_cap_reached          (inalterado, exclui 'snoozed' do count)
4.   Hourly cap               → hourly_cap_reached         (inalterado)
5.   One-shot per cycle       → already_sent_this_cycle    (inalterado)
     ALLOW
```

`NudgeDecision` ganha os reasons: `'nudges_globally_disabled' | 'category_frozen' | 'category_snoozed'`. Shape do `NudgeDecision` inalterado (union discriminada por `allow`/`reason`).

### Detalhes-chave

1. **`COACH_NUDGES_ENABLED` (check 0):**
   - Resolvido **a cada chamada** de `shouldSendNudge` (`process.env.COACH_NUDGES_ENABLED === 'false'` — string `'false'` explicita; ausente / `'true'` / qualquer outro valor → habilitado). Padrao `getMemoryModel()` — reflete mudanca em runtime (testes).
   - **Absoluto:** nem `ctx.isCritical` bypassa (o kill switch para *tudo*).
   - **`cronRunner.ts`:** se `COACH_NUDGES_ENABLED === 'false'`, **nao registra** os schedules de B-SNAPSHOT, B-STUDY e `generateCoachRecommendations` (esse ultimo nao e um nudge no sentido do engine, mas e proatividade — gateado junto; o plano §10 preve aposenta-lo no AI-1B de qualquer forma). O cleanup de pending coach_actions (`* * * * *`) **continua sempre** (nao e proatividade). Log: `coach.cron.nudges_disabled` ao pular os schedules.
   - **CLAUDE.md §4:** documentar `COACH_NUDGES_ENABLED` (default `true`/ausente; `false` desliga toda a proatividade do Coach — nudges + crons de nudge).

2. **`frozen_categories` (JSONB em `user_coach_preferences`):**
   - Migracao 0066: `ALTER TABLE user_coach_preferences ADD COLUMN frozen_categories jsonb NOT NULL DEFAULT '{}'::jsonb;`
   - `shared/schema.ts`: `frozenCategories: jsonb("frozen_categories").notNull().default(sql\`'{}'::jsonb\`)`.
   - `CoachPreferences` interface: `frozenCategories: Record<string, { frozenAt: string; reason: 'auto_dismiss_rate' | 'admin' | 'manual'; dismissRate?: number; windowDays?: number }>`.
   - `normalizeCoachPreferences` (em `server/storage/coachPreferences.ts`): `frozenCategories: row?.frozenCategories ?? {}`.
   - `buildPrefsResponse` (em `routes/coach.ts`) ganha `frozenCategories` no response do `GET /api/coach/preferences`.

3. **Validacao do `frozenCategories` no `PUT /api/coach/preferences` (decisao resolvida):**
   - O `PUT` **nao consegue adicionar** uma entrada nova em `frozenCategories` (congelamento so via auto-congelamento ou endpoint admin). **Forma escolhida:** o `updateCoachPreferencesSchema` (Zod `.strict()`) **nao inclui** `frozenCategories` como campo aceito — em vez disso, ganha um campo dedicado opcional `unfreezeCategory?: NudgeCategory` (enum dos 8 valores `B-*`). Se presente, o handler remove `frozenCategories[unfreezeCategory]` (no-op se nao existe). Para limpar tudo: nao ha — `unfreeze` e por-categoria (mais previsivel). **Endpoint dedicado tambem disponivel:** `POST /api/coach/preferences/unfreeze` body `{ category: NudgeCategory }` — equivalente; o frontend usa esse (mais explicito que um campo no PUT). Tentar enviar `frozenCategories: {...}` no PUT → o Zod `.strict()` rejeita com `400` (campo desconhecido). **Resumo: descongelar via `POST /api/coach/preferences/unfreeze` (canonico) ou `PUT` com `unfreezeCategory` (alias conveniente); congelar via PUT e impossivel (`400`).**
   - O admin congela/descongela via `POST /api/admin/coach/freeze-category` body `{ userId, category, action: 'freeze' | 'unfreeze' }` (`requirePermission('admin')` — o padrao admin do projeto; `403` se nao-admin).

4. **`getActiveSnoozeForCategory(userId, category, now): Promise<Date | null>`** (novo em `server/storage.ts`) — o `snoozeUntil` mais futuro entre os `coach_nudge_log` rows dessa categoria com `status = 'snoozed'` e `snoozeUntil > now`. `null` se nenhum. Usado pelo check 1.6.

5. **Telemetria — `getNudgeDismissRate(userId, category, sinceDays): Promise<{ sent: number; dismissed: number; rate: number }>`** (novo em `server/storage.ts`) — conta `coach_nudge_log` rows da categoria com `sentAt >= now - sinceDays*24h`: `sent` = total de rows com `status IN ('sent','engaged','dismissed','unsubscribed')` (**exclui `snoozed`** — snooze nao e "viu e ignorou"); `dismissed` = rows com `status IN ('dismissed','unsubscribed')`; `rate = sent === 0 ? 0 : dismissed / sent`. Usado pelo auto-congelamento.

6. **Auto-congelamento (`server/coach/nudgeAutoFreeze.ts`):**
   - `checkAndFreezeCategory(userId, category, opts?): Promise<{ frozen: boolean; rate?: number }>` — chamado **apos** cada vez que um nudge dessa categoria e marcado `dismissed` ou `unsubscribed` (do endpoint de dismiss/unsubscribe — RF-10; opcionalmente do `PUT /preferences` quando o user desliga uma categoria com dismiss recente).
   - **Thresholds (constantes; env opcional para override):** `WINDOW_DAYS = 7`, `MIN_SAMPLE = 3` (precisa ≥3 nudges entregues na janela — nao congela com amostra minuscula), `DISMISS_RATE_THRESHOLD = 0.5` (> 50% de dismiss → congela). Se `sent >= MIN_SAMPLE && rate > DISMISS_RATE_THRESHOLD` → `upsertCoachPreferences(userId, { /* frozenCategories merge */ })` setando `frozenCategories[category] = { frozenAt: now.toISOString(), reason: 'auto_dismiss_rate', dismissRate: rate, windowDays: WINDOW_DAYS }`.
   - **Aviso ao usuario:** se congelou (e nao estava ja congelada — idempotente), cria um `coach_nudge_log` row com `category` = a categoria original, `triggeredByEvent: 'auto_freeze_notice'`, `status: 'sent'`, `titleI18n: 'Avisos de <X> pausados'`, `bodyPreview: 'Notei que voce dispensou a maioria dos avisos sobre <X> — pausei essa categoria. Voce pode reativa-la em Preferencias quando quiser.'`. Esse row **nao** passa pelo `shouldSendNudge` (e meta, sempre entregue). O frontend (RF-10) renderiza diferente quando `triggeredByEvent === 'auto_freeze_notice'`. (Decisao: nao criar uma categoria `B-SYSTEM` nem um `kind` novo — reusar `triggeredByEvent` como discriminador; mantem o schema intacto.)
   - **Nao auto-descongela** — o congelamento por dismiss alto nao expira sozinho; o usuario descongela (`POST /api/coach/preferences/unfreeze` — botao "Reativar" na aba Preferencias) ou o admin. **Nota (nao obrigatorio neste sprint):** um cooldown de re-oferta (ex: apos 30 dias, re-mostrar a oferta de reativar) pode entrar no AI-1B.

7. **Status `unsubscribed`:** novo valor permitido na coluna `status` (varchar 16 — cabe; ja documentado no ADR-085 §214 como reservado). Usado quando o usuario faz opt-out da categoria a partir de um nudge (`POST /api/coach/nudges/:id/unsubscribe`). **Nenhuma coluna nova em `coach_nudge_log`.** (Opcional, nao obrigatorio: `engagement_source varchar(32)` — fica como nota.)

8. **Endpoints REST novos** (todos `requireAuth`; handlers com `injectedStorage?` — lesson #34):
   | Metodo | Rota | Descricao |
   |---|---|---|
   | GET | `/api/coach/nudges` | Lista `coach_nudge_log` do usuario (`?status=&category=&limit=`), ordenado `sentAt desc` (storage: `listNudgeLog`) |
   | POST | `/api/coach/nudges/:id/dismiss` | `status='dismissed'`, `dismissedAt=now` + `checkAndFreezeCategory(userId, row.category)` |
   | POST | `/api/coach/nudges/:id/snooze` | body `{ duration: 'short' \| 'long' }` → `short`=1 dia, `long`=30 dias → `status='snoozed'`, `snoozeUntil=now+duration` |
   | POST | `/api/coach/nudges/:id/engage` | `status='engaged'`, `engagedAt=now` |
   | POST | `/api/coach/nudges/:id/unsubscribe` | `status='unsubscribed'` + `upsertCoachPreferences({ nudgeB<Cat>: false })` + `checkAndFreezeCategory` |
   | POST | `/api/coach/preferences/unfreeze` | body `{ category: NudgeCategory }` → remove `frozenCategories[category]` |
   | POST | `/api/admin/coach/freeze-category` | body `{ userId, category, action: 'freeze' \| 'unfreeze' }`, `requirePermission('admin')` → seta/remove `frozenCategories[category]` com `reason: 'admin'` |
   - Todos validam ownership: `getNudgeLogById(id)` (novo em `storage.ts`) → `row.userId === req.user.userPlatformId` senao `404` (nao vaza id de outro usuario). Validacao Zod do body.
   - **Idempotencia:** `dismiss`/`snooze`/`engage`/`unsubscribe` num nudge que nao esta `sent` (ja foi dismissed etc.) → **idempotente** (re-dismiss = no-op, retorna `200` com o estado atual). Decisao: idempotente > `409` — mais robusto para retries do frontend.

9. **Crons (RF-11) — verificacao, sem reescrita:** `processBSnapshotTick`/`processBStudyTick` ja chamam `shouldSendNudge` — os checks novos (0/1.5/1.6) sao respeitados automaticamente. Confirmar por teste: `COACH_NUDGES_ENABLED=false` → nenhum `chatSession`/`coach_nudge_log` criado (loop faz `continue`); categoria congelada → user pulado; snooze ativo → user pulado ate expirar. Nada novo nos crons — os `coach_nudge_log` rows `status: 'sent'` que eles ja criam *sao* a telemetria de "entregue"; `dismissed`/`engaged` vem dos endpoints do RF-10.

10. **`StaticInputs` / `coachContext` cleanup (RF-12, oportunidade):** como o RF-06 (perfil estruturado no prompt — ADR-151) ja toca `coachContext.ts` (adiciona o loader `getStructuredProfile`), e oportuno remover o array `systemParts` + as ~8 queries inline (~97-194) que **nao alimentam** o system prompt final (que vem de `buildSystemArray`). Criterio de baixo risco: so remover se nenhum teste depende delas (provavel); senao, atualizar o TODO. Resolve a MEDIUM de perf do reviewer AI-0B (~8 queries mortas/msg). Decisao: **fazer, se baixo risco** — se ampliar o escopo de risco, deixar com TODO atualizado. (`buildMentalContext`/`buildTournamentContext`/`buildTechnicalContext` dead-code e `UpgradeCoachModal.tsx` orfao — task #8 — **NAO** entram aqui; ficam follow-up — escopo controlado.)

## Consequencias

### Positivas
- **R1 (nag fatigue) fechado:** kill switch global + congelamento por categoria + snooze 1-clique + telemetria. O `nudgeEngine` continua a fonte unica; divergencia impossivel.
- **Gate de tudo proativo pronto:** AI-1B (Weekly Report + B-IMPORT) pode prosseguir.
- **Alavanca de emergencia:** `COACH_NUDGES_ENABLED=false` desliga tudo num env var (e o cronRunner nem registra os schedules).
- **Auto-congelamento conservador:** sample minimo 3 + rate > 50% — nao congela por acaso; e o usuario quem reativa (sem ping-pong).
- **Zero migracao destrutiva:** 0066 e `ADD COLUMN ... DEFAULT '{}'` (nao reescreve tabela); `unsubscribed` cabe no varchar existente.

### Negativas
- **Assimetria com `NEWS_FEED_ENABLED`** (kill switch default ON aqui vs default OFF la). Documentado; semanticas diferentes.
- **`PUT /api/coach/preferences` ganha um campo especial (`unfreezeCategory`)** + um endpoint dedicado (`/unfreeze`) — duas formas de fazer a mesma coisa. Aceito (o endpoint e o canonico; o campo e conveniencia).
- **`coach_nudge_log` cresce sem limite** (ja era assim — ADR-085 §271; archive 90d e pendencia conhecida). Inalterado.
- **Nudges ja `sent` permanecem** quando o kill switch aciona — se o motivo e "estavam quebrados", os ja enviados ficam visiveis. Aceito (alavanca para *parar de gerar*, nao para *apagar*).

### Neutras
- **`triggeredByEvent: 'auto_freeze_notice'`** como discriminador do aviso (vs criar `B-SYSTEM` ou `kind`) — mantem o schema intacto; o frontend trata.
- **Thresholds do auto-congelamento sao constantes** (7d / 3 / 0.5) — env override opcional; ponto de partida calibravel.
- **Cooldown de re-oferta de reativacao** — nota para AI-1B, nao obrigatorio aqui.

## Confianca

**Alta.** Estende um engine ja em producao (ADR-085) de forma aditiva (2 checks + 1 check 0 + 2 reasons; nao muda os 5 existentes). Pattern de kill switch ja usado (`NEWS_FEED_ENABLED`). Lessons #9/#7/#3/#34 honradas. Risco principal — auto-congelamento agressivo demais — mitigado pelo `MIN_SAMPLE` + a nao-auto-descongela ser uma decisao consciente do usuario (que sempre pode reativar).

## Code references

- `migrations/0066_coach_nudge_telemetry_freeze.sql` (NOVO) — `ALTER TABLE user_coach_preferences ADD COLUMN frozen_categories jsonb NOT NULL DEFAULT '{}'::jsonb;`
- `shared/schema.ts` — `userCoachPreferences.frozenCategories`; `updateCoachPreferencesSchema` ganha `unfreezeCategory?` (enum `B-*`); `status` aceita `'unsubscribed'`.
- `server/coach/nudgeEngine.ts` — check 0 (`COACH_NUDGES_ENABLED`), check 1.5 (`category_frozen`), check 1.6 (`category_snoozed`); `NudgeDenyReason` += 3 reasons.
- `server/coach/nudgeAutoFreeze.ts` (NOVO) — `checkAndFreezeCategory`; constantes `WINDOW_DAYS`/`MIN_SAMPLE`/`DISMISS_RATE_THRESHOLD`.
- `server/coach/cronRunner.ts` — gating dos 3 schedules de proatividade por `COACH_NUDGES_ENABLED`.
- `server/storage.ts` — `getActiveSnoozeForCategory`, `getNudgeDismissRate`, `listNudgeLog`, `getNudgeLogById`.
- `server/storage/coachPreferences.ts` — `normalizeCoachPreferences` += `frozenCategories ?? {}`.
- `server/routes/coach.ts` — handlers novos (`handleGetNudges`, `handleNudge{Dismiss,Snooze,Engage,Unsubscribe}`, `handleUnfreezeCategory`); `handlePutCoachPreferences` += `unfreezeCategory` + espelha `coachTone` → `tomPreferido` (ADR-151 §sincronizacao); `buildPrefsResponse` += `frozenCategories`.
- `server/routes/admin.ts` (ou onde mora o grupo admin) — `handleAdminFreezeCategory`.
- `client/src/pages/CoachAI.tsx` — `CoachPreferencesPanel` ganha a secao "Categorias pausadas" (`data-testid` `coach-prefs-frozen-section` / `coach-prefs-frozen-item-<cat>` / `coach-prefs-unfreeze-<cat>`).
- `client/src/components/coach/NudgeCard.tsx` — **NAO neste sprint** (ver §decisoes em aberto no resumo / spec RF-10 — opcional; follow-up AI-1B "hub timeline"). O minimo obrigatorio do RF-10 sao os endpoints + a secao de congelamento na aba Preferencias.

## Related ADRs

- [ADR-085](085-coach-nudge-engine.md) — Engine `shouldSendNudge` — **estendido** (2 checks novos + check 0 + 2 reasons + status `unsubscribed`).
- [ADR-084](084-user-coach-preferences.md) — User Coach Preferences — **estendido** (`frozen_categories` JSONB; `getCoachPreferences` cache reusado para pegar `frozenCategories`).
- [ADR-087](087-job-runner-timezone-aware.md) — Job runner — os crons B-SNAPSHOT/B-STUDY (callers do engine) respeitam os checks novos automaticamente; o `cronRunner` gateia os schedules por `COACH_NUDGES_ENABLED`.
- [ADR-100](100-news-feed-grok-integration.md) / [ADR-106](106-news-rss-x-search-refactor.md) — `NEWS_FEED_ENABLED` — precedente de env master kill-switch (semantica oposta — default OFF la, ON aqui).
- [ADR-144](144-cron-advisory-lock-pattern.md) — Advisory lock — os schedules gateados continuam usando `withAdvisoryLock` quando registrados.
- [ADR-151](151-ai-structured-profile-jsonb.md) — Perfil estruturado — sincronizacao `tomPreferido` ↔ `coachTone` (o `PUT /preferences` espelha).
- [ADR-153](153-onboarding-conversacional-wizard-guiado.md) — Onboarding — o step de tom/nudges grava os toggles + quiet hours via `upsertCoachPreferences`.

## Lessons learned aplicadas
- **#9** (try/catch logado / safe-deny) — erro ao consultar snooze/frozen no engine → `engine_error` com `console.error`; nao throw.
- **#7** (schema deprecation gradual) — `frozen_categories` `NOT NULL DEFAULT '{}'` (mapa vazio valido); `normalizeCoachPreferences` back-fills; `unsubscribed` cabe no varchar existente; nenhum `SET NOT NULL` sem default.
- **#3** (mocks idealizados) — `normalizeCoachPreferences` protege; mocks de `getCoachPreferences` sem `frozenCategories` continuam funcionando (le `prefs.frozenCategories` que vira `{}`).
- **#34** (storage injetavel) — todos os handlers novos recebem `injectedStorage?`.
- **#10** (DRY) — o cleanup do `systemParts`/queries mortas em `coachContext.ts` (RF-12) reduz divergencia silenciosa.
