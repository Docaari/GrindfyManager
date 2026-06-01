# Spec: EST-1 — Coach Weekly Delivery & Enablement

## Status
Proposta

## Resumo
Faz o relatório semanal do Coach chegar ao jogador na segunda de manhã por 3 canais
(notificação in-app + banner, email, e mensagem no chat do Coach), com opt-in
default ON para usuários elegíveis e discoverability explícita. Entrega idempotente.

## Contexto
Os geradores Weekly/Daily/Monthly do Coach já estão shipped (AI-1B/AI-1C) e os crons
rodam (`reportJobRunner.ts` → `processReportJobsTick`), gerando linhas em `reports`.
Porém **nada chega ao jogador**: os opt-ins (`reportWeeklyEnabled` / `reportDailyEnabled`
/ `reportMonthlyEnabled` + os de email AI-2B) têm default `false`, não há discoverability,
e relatórios só aparecem na aba escondida `/coach-ai` "Relatórios e avisos".

Pior: existe um **bloqueador silencioso** — a migração 0071 (AI-2B) criou 5 colunas no DB
(`report_quarterly_enabled`, `email_weekly_enabled`, `email_monthly_enabled`,
`email_quarterly_enabled`, `disclaimer_accepted_at`) que **não foram adicionadas** ao
drizzle table `userCoachPreferences` em `shared/schema.ts` nem ao
`updateCoachPreferencesSchema`. Como `getCoachPreferences` faz `db.select().from(userCoachPreferences)`,
essas colunas nunca são mapeadas → `prefs.emailWeeklyEnabled` chega `undefined` →
`sendReportEmail` (linha 84-86 de `server/services/reportEmailSender.ts`) cai no `skipped`.
Sem corrigir isso, qualquer entrega de email é no-op.

Este sprint é o "enablement layer": não muda o conteúdo do relatório (EST-2) nem o
ritual interativo (EST-5). Apenas garante que o que já é gerado **seja entregue e
descoberto**.

## Usuários
- **Jogador elegível** (Trial / Pro / Premium / admin): recebe o relatório semanal pelos
  3 canais na segunda de manhã; pode opt-out por canal nas preferências.
- **Jogador free / expired**: nunca recebe (gating preexistente em `reportEligibility.ts`);
  vê o banner de upsell apenas se aplicável (fora de escopo aqui — não introduzir upsell).
- **Sistema (cron / processor)**: o `reportJobRunner` dispara a entrega tripla após
  persistir o `reportId`, de forma best-effort e idempotente.

## Decisões Travadas (input — não re-decidir)
- **D1** — Entrega tripla: in-app notif + banner + email + post no chat do Coach.
- **D2/D6** — Opt-in default ON para elegíveis (Trial/Pro/Premium/admin) + back-fill de
  TODAS as prefs existentes de elegíveis para `true`. SEM coluna sentinel. Opt-out normal
  daqui pra frente.
- **D5** — Email TAMBÉM default ON (`email_weekly_enabled` / `email_monthly_enabled`).
  Reusa o HMAC unsubscribe do AI-2B (`reportEmailSender.ts`).
- **Idempotência** — não entregar 2x se o processor reprocessar o mesmo job/relatório.

## Requisitos Funcionais

### RF-01: Sincronizar drizzle table + zod com as 5 colunas AI-2B (desbloqueador)
**Descrição:** Adicionar ao drizzle table `userCoachPreferences` (`shared/schema.ts`,
~linha 4628, logo após `reportMonthlyEnabled`) e ao `updateCoachPreferencesSchema`
(~linha 4703) as 5 colunas que a migração 0071 já criou no DB mas que estão ausentes do
schema TypeScript.

**Regras de negócio:**
- Colunas a adicionar ao drizzle table (nomes DB já existentes na 0071):
  - `report_quarterly_enabled` boolean NOT NULL default `false` → `reportQuarterlyEnabled`
  - `email_weekly_enabled` boolean NOT NULL default `false` → `emailWeeklyEnabled`
  - `email_monthly_enabled` boolean NOT NULL default `false` → `emailMonthlyEnabled`
  - `email_quarterly_enabled` boolean NOT NULL default `false` → `emailQuarterlyEnabled`
  - `disclaimer_accepted_at` timestamp (nullable) → `disclaimerAcceptedAt`
- Os defaults no drizzle table devem refletir o estado **pré-RF-02** (`false`); o flip de
  default ON é responsabilidade da migração RF-02, não do mapeamento drizzle. (Os defaults
  do drizzle só são usados em `db.push`/inserts novos via Drizzle — RF-02 altera o default
  real do Postgres.)
- Adicionar ao `updateCoachPreferencesSchema` (que é `.strict()`): `reportQuarterlyEnabled`,
  `emailWeeklyEnabled`, `emailMonthlyEnabled`, `emailQuarterlyEnabled` como
  `z.boolean().optional()`. **NÃO** adicionar `disclaimerAcceptedAt` ao schema de update
  (é setado só pelo endpoint de onboarding accept do AI-2B; expor via PUT seria spoofável).
- Não alterar `getCoachPreferences` além de garantir que o select passe a trazer as colunas
  (o `db.select().from(userCoachPreferences)` já traz tudo do table — basta o table mapear).
  Confirmar que o `normalize`/default da função preserva os valores vindos do DB (não força
  `false` quando o valor é `true`).

**Critério de aceitação:**
- [ ] **Given** uma pref existente no DB com `email_weekly_enabled = true`, **When**
  `getCoachPreferences(userId)` é chamado, **Then** o objeto retornado tem
  `emailWeeklyEnabled === true` (hoje vem `undefined`).
- [ ] **Given** um PUT `/api/coach/preferences` com body `{ emailWeeklyEnabled: false }`,
  **When** validado pelo `updateCoachPreferencesSchema`, **Then** passa (não é rejeitado
  pelo `.strict()`) e persiste `email_weekly_enabled = false`.
- [ ] **Given** um PUT com `{ disclaimerAcceptedAt: "2026-01-01" }`, **When** validado,
  **Then** é rejeitado (campo não permitido em `.strict()`).
- [ ] **Then** `tsc` passa sem erro (`$inferSelect` de `userCoachPreferences` inclui os 5
  novos campos).

### RF-02: Migração — flip default ON + back-fill de elegíveis
**Descrição:** Migração drizzle-kit numerada `0086` (próximo livre — 0085 já existe) que
muda o default de `false`→`true` nas 5 colunas de delivery e faz back-fill das prefs
existentes de usuários elegíveis. Com `_rollback.sql`.

**Regras de negócio:**
- Colunas que recebem `ALTER COLUMN ... SET DEFAULT true`:
  `report_weekly_enabled`, `report_daily_enabled`, `report_monthly_enabled`,
  `email_weekly_enabled`, `email_monthly_enabled`.
  (NÃO mexer em `report_quarterly_enabled` / `email_quarterly_enabled` — quarterly é AI-2B,
  fora do escopo de entrega deste sprint; permanecem default `false`.)
- Back-fill: `UPDATE user_coach_preferences SET report_weekly_enabled = true,
  report_daily_enabled = true, report_monthly_enabled = true, email_weekly_enabled = true,
  email_monthly_enabled = true WHERE user_id IN (SELECT user_platform_id FROM users WHERE
  subscription_plan IN ('trial','active','admin'))`.
  - **Atenção à fonte de verdade de elegibilidade:** `users.subscription_plan` é
    `'trial' | 'active' | 'expired' | 'admin'`. A noção "Pro/Premium" vive em
    `resolveUserTier`, NÃO numa coluna direta. Por isso o WHERE do back-fill usa
    `subscription_plan IN ('trial','active','admin')` (mesma lista de
    `LIST_USERS_FOR_CRON_PRO_PLUS` / `planEligibility.ts`). `'expired'` e `'free'` ficam de fora.
  - O architect deve confirmar com `getReportTier`/`isReportEligible` se "eligible" no
    runtime cobre exatamente esse conjunto; a entrega em runtime (RF-03/04/07) gateia por
    `isReportEligible` de qualquer forma, então o back-fill é "best-effort de UX", não a
    única barreira.
- SEM coluna sentinel: não há marca de "foi back-fillado". Quem fizer opt-out manual depois
  fica `false` e o back-fill **não roda de novo** (migração roda uma vez).
- Idempotência da migração: usar `ALTER COLUMN ... SET DEFAULT` (idempotente) e o `UPDATE`
  (re-rodar reaplicaria `true`, mas migrações drizzle-kit não re-rodam — aceitável).
- `_rollback.sql`: reverte os defaults para `false` (NÃO desfaz o back-fill de dados —
  documentar que rollback de dados é manual e indesejável; rollback só restaura o default).

**Critério de aceitação:**
- [ ] **Given** o DB pós-migração, **When** uma nova linha em `user_coach_preferences` é
  inserida sem especificar os campos, **Then** `report_weekly_enabled`,
  `report_daily_enabled`, `report_monthly_enabled`, `email_weekly_enabled`,
  `email_monthly_enabled` valem `true`.
- [ ] **Given** um usuário `subscription_plan='trial'` com pref preexistente toda `false`,
  **When** a migração roda, **Then** os 5 campos viram `true`.
- [ ] **Given** um usuário `subscription_plan='expired'`, **When** a migração roda, **Then**
  os campos dele permanecem `false` (não recebe).
- [ ] **Then** existe `migrations/0086_*.sql` + `migrations/0086_*_rollback.sql`.

### RF-03: Entrega in-app (notification + deep link) no processor
**Descrição:** Após o `reportJobRunner.processOneJob` obter o `reportId` (linha ~608-622),
criar uma notificação in-app via `storage.createNotification`, com deep link para o
relatório. Best-effort, fire-and-forget, idempotente (ver RF-05).

**Regras de negócio:**
- Só dispara para `reportType ∈ {'weekly','daily','monthly'}` (mesma faixa do email atual;
  quarterly fora de escopo).
- Gating: só entrega se `isReportEligible(user, reportType)` (`reportEligibility.ts`) E se
  a pref de in-app do tipo está ON. Convenção de pref a usar: o opt-in do relatório
  (`reportWeeklyEnabled` etc.) governa **se o relatório foi gerado**; para o canal in-app,
  reusar o opt-in do relatório (não há toggle in-app por tipo separado hoje). O architect
  decide se o `channelInApp` (já existe em prefs, default `true`) entra como gate adicional
  — recomendação da spec: gate = `isReportEligible && reportPref[type] && prefs.channelInApp`.
- `createNotification({ userId, type, title, message, priority, deepLink })`:
  - `type`: `'coach_report'` (ou valor que o architect padronizar no enum de notification types).
  - `title` PT-BR: ex. "Seu relatório semanal está pronto".
  - `message` PT-BR curto: ex. "Veja seus números da semana e os próximos passos."
  - `deepLink`: `/coach-ai/relatorio/:id` (rota frontend `ReportView` já existe).
  - `priority`: normal (não crítico).
- Best-effort: erro na criação da notif NÃO derruba o job nem bloqueia email/chat (cada
  canal em seu próprio try/catch, log antes do fallback — lesson #9).

**Critério de aceitação:**
- [ ] **Given** um job weekly concluído com `reportId` para usuário elegível com
  `reportWeeklyEnabled=true`, **When** `processOneJob` termina, **Then**
  `storage.createNotification` foi chamado 1x com `deepLink = '/coach-ai/relatorio/<reportId>'`.
- [ ] **Given** usuário com `reportWeeklyEnabled=false`, **When** o job roda, **Then**
  `createNotification` NÃO é chamado (skip silencioso).
- [ ] **Given** `createNotification` lança erro, **When** o job roda, **Then** o job ainda
  marca `done` e o email/chat continuam sendo tentados (erro logado, não propagado).

### RF-04: Entrega via post no chat do Coach (turno do mentor)
**Descrição:** Após obter o `reportId`, postar uma mensagem `role='assistant'` na sessão de
chat do Coach do usuário, anunciando o relatório com um link/CTA. Best-effort, idempotente.

**Regras de negócio:**
- Mesmo gating de RF-03 (elegibilidade + opt-in do relatório do tipo).
- Get-or-create da sessão de chat: usar uma sessão "principal" do Coach do usuário. Como
  `createChatSession({ userId, coachType, title? })` cria sempre uma nova, é necessário um
  **get-or-create** — o architect deve definir/confirmar: existe `getChatSessions(userId)`
  para reusar a mais recente do `coachType` principal? Senão, criar uma sessão dedicada
  (ex. `coachType='main'`, `title='Relatórios'`) uma única vez por usuário e reusar.
  Decisão de qual `coachType` é a "principal" cabe ao architect (provável `'main'`).
- `insertChatMessage({ chatSessionId, role: 'assistant', content })`:
  - `content` PT-BR: resumo de 1-2 frases + CTA textual apontando para o relatório
    (ex. "Terminei seu relatório semanal — abra em /coach-ai/relatorio/<id>"). O conteúdo
    do report em si (números, leaks) é EST-2; aqui apenas o "card de anúncio".
  - NÃO disparar uma chamada ao LLM (não é uma resposta gerada; é um post determinístico).
- Best-effort: falha no chat post não derruba o job nem os outros canais.

**Critério de aceitação:**
- [ ] **Given** job weekly concluído para usuário elegível opt-in, **When** `processOneJob`
  termina, **Then** existe exatamente 1 mensagem `role='assistant'` nova na sessão de chat
  do Coach do usuário contendo o link `/coach-ai/relatorio/<reportId>`.
- [ ] **Given** usuário sem nenhuma sessão de chat prévia, **When** o job roda, **Then** uma
  sessão é criada (get-or-create) e a mensagem é postada nela.
- [ ] **Given** o mesmo job reprocessado (mesmo `reportId`), **When** roda de novo, **Then**
  NÃO há segunda mensagem (idempotência via RF-05).
- [ ] **Then** nenhuma chamada ao LLM (Anthropic) é feita no caminho do chat post.

### RF-05: Ledger de idempotência da entrega tripla
**Descrição:** Garantir que cada canal (in-app, chat) seja entregue **no máximo uma vez** por
relatório, mesmo que o processor reprocesse o job (`persistOrFetchReportId` retorna o mesmo
`reportId` num reprocessamento, então o disparo de entrega pode acontecer 2x).

**Regras de negócio:**
- Email já é idempotente via `email_log` UNIQUE `(report_id, kind)` — não mexer.
- in-app + chat precisam de um ledger. **Decisão de design para o architect** (a spec
  recomenda a Opção A):
  - **Opção A (recomendada):** coluna `delivered_channels` jsonb em `reports`
    (default `'{}'::jsonb`), com chaves `{ inApp: <ISO>, chat: <ISO>, email: <ISO> }`.
    Antes de entregar cada canal, checar a chave; após sucesso, setar via update atômico
    (`jsonb || '{"inApp": "..."}'`). Migração para a coluna entra na 0086 (ou migração
    irmã — architect decide).
  - **Opção B:** tabela nova `report_deliveries (report_id, channel, delivered_at)` com
    UNIQUE `(report_id, channel)` — INSERT que falha por conflito = já entregue.
  - Critério de escolha: Opção A é mais barata (1 coluna, sem JOIN) e suficiente para 3
    canais por relatório; Opção B é mais auditável. Architect decide e documenta no ADR.
- A checagem deve ser **antes** do efeito colateral (criar notif / postar chat) para evitar
  janela de duplicata; aceitável uma race rara (dois ticks simultâneos) — mitigar com o
  update condicional `WHERE NOT (delivered_channels ? 'inApp')` se Opção A, ou UNIQUE se
  Opção B. Architect escolhe a estratégia anti-race.

**Critério de aceitação:**
- [ ] **Given** um relatório já entregue in-app, **When** o job é reprocessado, **Then**
  `createNotification` NÃO é chamado uma segunda vez.
- [ ] **Given** um relatório já postado no chat, **When** reprocessado, **Then** nenhuma
  segunda mensagem `assistant` é criada.
- [ ] **Given** o email já em `email_log`, **When** reprocessado, **Then** `sendReportEmail`
  retorna `skipped` (`already_sent_or_pending`) — comportamento atual, sem regressão.
- [ ] **Given** entrega in-app bem-sucedida mas chat falhou, **When** reprocessado, **Then**
  in-app NÃO repete e o chat é re-tentado.

### RF-06: Discoverability — banner + atalho explicando opt-in default ON
**Descrição:** Tornar o relatório descobrível: banner em `/coach-ai` (aba "Relatórios e
avisos") e atalho no `/inicio` explicando que os relatórios chegam por in-app/email/chat e
que o usuário pode ajustar nas preferências.

**Regras de negócio:**
- Banner em `client/src/pages/CoachAI.tsx` (aba "Relatórios e avisos"):
  - Texto PT-BR explicando: "Seu relatório semanal agora chega toda segunda por notificação,
    email e aqui no chat. Ajuste os canais em Preferências."
  - Link/CTA para a aba "Preferências" (onde já existem os toggles
    `coach-prefs-toggle-report-{weekly,daily,monthly}` do AI-1C; este sprint adiciona os
    toggles de email — ver abaixo).
  - Dismissable (persistir dismiss — localStorage ou pref; architect decide; recomendação:
    localStorage `coachReportBanner.dismissed.v1` para não criar coluna nova).
- Atalho no `/inicio`: card/linha apontando para o último relatório ou para `/coach-ai`
  quando há relatório não lido (`reports.read_at IS NULL`). Não duplicar lógica de
  notificação — pode reusar a notif in-app existente.
- Aba "Preferências" do `/coach-ai`: adicionar toggles para os canais de email
  (`emailWeeklyEnabled`, `emailMonthlyEnabled`) com `data-testid`
  `coach-prefs-toggle-email-{weekly,monthly}` (lesson #2 — testid estável). Os toggles de
  relatório (weekly/daily/monthly) já existem.
- Componentes "decorativos" não ganham ações default (lesson #11) — o banner só tem o CTA
  especificado, nada inferido.

**Critério de aceitação:**
- [ ] **Given** a aba "Relatórios e avisos" em `/coach-ai`, **When** renderizada para
  usuário elegível, **Then** o banner com o CTA para Preferências aparece.
- [ ] **Given** o banner dismissado, **When** o usuário recarrega, **Then** o banner não
  reaparece.
- [ ] **Given** a aba Preferências, **When** renderizada, **Then** existem os toggles
  `coach-prefs-toggle-email-weekly` e `coach-prefs-toggle-email-monthly`, refletindo o valor
  atual da pref.
- [ ] **Given** o toggle de email weekly está ON e o usuário clica para OFF, **When** salva,
  **Then** um PUT `/api/coach/preferences` `{ emailWeeklyEnabled: false }` é enviado e
  persiste (depende de RF-01 ter exposto o campo no zod `.strict()`).
- [ ] **Given** `/inicio` com um relatório não lido, **When** renderizado, **Then** há um
  atalho visível apontando para o relatório / `/coach-ai`.

### RF-07: Validar fluxo email end-to-end (gate já existe, destravar)
**Descrição:** Com RF-01 (schema) + RF-02 (default ON) aplicados, validar que
`sendReportEmail` entrega de fato (sai do `skipped`). Nenhuma reescrita do sender — apenas
garantir o caminho feliz e os guards.

**Regras de negócio:**
- O sender já lê `prefs[emailWeeklyEnabled]` (linha 84-86). Pós-RF-01, esse valor passa a
  vir do DB. Pós-RF-02, default `true` para elegíveis. Sem novas mudanças no sender.
- `EMAIL_UNSUBSCRIBE_SECRET ?? JWT_SECRET` deve estar setado, senão `buildUnsubscribeUrl`
  lança `UNSUBSCRIBE_SECRET_MISSING` (linha 44-47). Documentar como pré-requisito de
  ambiente (ver §Env). O sender chama isso só APÓS o opt-in/elegibilidade/email_log pending,
  então a falha não causa email duplicado, mas marca `failed` no `email_log` daquele job.
- Gating preexistente do sender (opt-in pref + `user.email` presente + `isEligiblePlan` +
  report existente) permanece a barreira final — entrega tripla NÃO deve burlar.

**Critério de aceitação:**
- [ ] **Given** usuário elegível com `emailWeeklyEnabled=true` (pós-RF-01/02) e
  `EMAIL_UNSUBSCRIBE_SECRET` setado, **When** o job weekly conclui, **Then**
  `sendReportEmail` retorna `sent` e há linha `email_log` `status='sent'`.
- [ ] **Given** o mesmo job reprocessado, **When** `sendReportEmail` roda de novo, **Then**
  retorna `skipped` (`already_sent_or_pending`) — sem segundo email (UNIQUE `report_id,kind`).
- [ ] **Given** `EMAIL_UNSUBSCRIBE_SECRET` e `JWT_SECRET` ausentes, **When** `sendReportEmail`
  chega a `buildUnsubscribeUrl`, **Then** lança/loga `UNSUBSCRIBE_SECRET_MISSING` e o
  `email_log` daquele job vira `failed` (in-app + chat NÃO são afetados).

## Requisitos Não-Funcionais
- **Idempotência:** entrega de cada canal no máximo 1x por relatório (RF-05). Reprocessamento
  do processor é cenário esperado (retry, fail-soft) — nunca duplicar notif/chat/email.
- **Isolamento de falha:** cada canal em seu try/catch independente; falha de um não bloqueia
  os outros nem derruba o job (best-effort, fire-and-forget — padrão já usado no email,
  linha 613-620). Log antes de qualquer fallback (lesson #9).
- **Kill switch:** entrega tripla herda `COACH_NUDGES_ENABLED=false` automaticamente — está
  dentro do `processReportJobsTick`, que o cronRunner não registra quando a flag está off.
  Nenhum código novo de kill switch.
- **Sem chamada LLM no caminho de entrega:** in-app + chat são posts determinísticos (o
  conteúdo do relatório já foi gerado pelo generator). Não adicionar custo de tokens.
- **Performance:** as 3 entregas devem ser disparadas sem bloquear o avanço do processor
  (já `void ...catch` no email; manter o padrão para notif + chat).

## Endpoints Previstos
| Método | Rota | Descrição | Auth |
|---|---|---|---|
| GET | /api/coach/preferences | Lê prefs (agora inclui os 5 campos AI-2B mapeados) | JWT |
| PUT | /api/coach/preferences | Atualiza prefs (agora aceita `emailWeeklyEnabled` etc.) | JWT |

> Nenhum endpoint HTTP novo. A entrega tripla é interna ao `reportJobRunner`. Os endpoints
> de preferences são preexistentes — RF-01 apenas estende o contrato (campos novos
> aceitos/retornados). `GET /api/coach/timeline`, `GET /api/coach/reports/:id` e a rota
> frontend `/coach-ai/relatorio/:id` já existem e são reusados.

## Modelos de Dados Afetados

### user_coach_preferences (alteração — RF-01 mapeia, RF-02 muda defaults/dados)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| report_quarterly_enabled | boolean | NOT NULL default false | Mapear no drizzle (já no DB via 0071). NÃO flipar default neste sprint. |
| email_weekly_enabled | boolean | NOT NULL default false→**true** (RF-02) | Mapear + flip default + back-fill elegíveis. |
| email_monthly_enabled | boolean | NOT NULL default false→**true** (RF-02) | idem. |
| email_quarterly_enabled | boolean | NOT NULL default false | Mapear no drizzle. NÃO flipar default. |
| disclaimer_accepted_at | timestamp | nullable | Mapear no drizzle. NÃO expor em update zod. |
| report_weekly_enabled | boolean | default false→**true** (RF-02) | Já mapeado; flip default + back-fill. |
| report_daily_enabled | boolean | default false→**true** (RF-02) | Já mapeado; flip default + back-fill. |
| report_monthly_enabled | boolean | default false→**true** (RF-02) | Já mapeado; flip default + back-fill. |

### reports (alteração — RF-05, se Opção A do ledger)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| delivered_channels | jsonb | NOT NULL default `'{}'::jsonb` | `{ inApp, chat, email }` timestamps de entrega. Só se architect escolher Opção A. |

> Alternativa (Opção B do ledger): tabela nova `report_deliveries(report_id, channel,
> delivered_at)` UNIQUE `(report_id, channel)`. Architect decide A vs B no ADR.

## Integrações Externas
| Serviço | Propósito | Quando |
|---|---|---|
| Gmail SMTP (EmailService) | Enviar email do relatório | Job concluído + opt-in + elegível (reusa AI-2B) |

> Nenhuma integração nova. Anthropic NÃO é chamado no caminho de entrega.

## Cenários de Teste Derivados

### Happy Path
- [ ] Job weekly concluído → in-app notif criada + chat post criado + email `sent`, todos
  com link `/coach-ai/relatorio/<id>`.
- [ ] Migração 0086 → novos inserts e prefs de elegíveis ficam com os 5 campos ON.

### Validação de Input
- [ ] PUT prefs `{ emailWeeklyEnabled: false }` → aceito (não rejeitado pelo `.strict()`).
- [ ] PUT prefs `{ disclaimerAcceptedAt: ... }` → rejeitado (campo fora do schema).
- [ ] `getCoachPreferences` retorna `emailWeeklyEnabled` do DB, não `undefined`.

### Regras de Negócio
- [ ] Usuário `expired`/`free` → nenhum canal entrega (gating `isReportEligible`).
- [ ] `reportWeeklyEnabled=false` → in-app e chat não disparam; `emailWeeklyEnabled=false` →
  email `skipped`.
- [ ] Back-fill cobre `trial`/`active`/`admin`, exclui `expired`.

### Edge Cases
- [ ] **Reprocessamento (idempotência):** mesmo `reportId` 2x → 1 notif, 1 chat msg, 1 email.
- [ ] **Kill switch off** (`COACH_NUDGES_ENABLED=false`): processor não roda → zero entrega.
- [ ] **Opt-out manual:** usuário que setou `emailWeeklyEnabled=false` após o back-fill →
  email `skipped` permanentemente (migração não re-roda).
- [ ] **Env unsubscribe ausente:** `EMAIL_UNSUBSCRIBE_SECRET` e `JWT_SECRET` ausentes →
  email `failed` com `UNSUBSCRIBE_SECRET_MISSING`; in-app + chat ainda entregam.
- [ ] **Usuário sem chat session prévia:** get-or-create cria sessão e posta lá.
- [ ] **Falha parcial:** in-app ok, chat lança → in-app não repete no reprocess, chat
  re-tenta; job marca `done`.
- [ ] **Banner dismissado** persiste entre reloads.

## Fora de Escopo
- **EST-2** — conteúdo do relatório (números, leaks, narrativa). Aqui só a entrega + anúncio.
- **EST-5** — ritual interativo / warm-up. Não tocar.
- **Quarterly delivery** — `report_quarterly_enabled` / `email_quarterly_enabled` são apenas
  mapeados no drizzle (RF-01); seus defaults NÃO são flipados e a entrega tripla NÃO cobre
  quarterly neste sprint.
- **Upsell para free/expired** — não introduzir CTA de upgrade no banner.
- **Push notifications** (`channelPush`) — fora; só in-app + email + chat.
- **Novos endpoints HTTP** — nenhum.
- **Reescrita de `sendReportEmail`** — RF-07 apenas valida; não refatora o sender.
- **Mudança em `resolveUserTier` / `reportEligibility`** — usar como está.

## Dependências
- Migração 0071 (AI-2B) já aplicada no DB (colunas físicas existem). **Pré-requisito
  confirmado** — RF-01 só sincroniza o TypeScript com o DB.
- Geradores Weekly/Daily/Monthly + `reportJobRunner` + `processReportJobsTick` shipped
  (AI-1B/AI-1C) — pré-requisito confirmado.
- `reportEmailSender.ts` (AI-2B) + `email_log` UNIQUE `(report_id, kind)` — pré-requisito
  confirmado.
- `storage.createNotification`, `storage.createChatSession`, `storage.insertChatMessage`,
  `storage.getReportById` — preexistentes.
- Rota frontend `/coach-ai/relatorio/:id` (ReportView) — preexistente.

## Env (pré-requisitos de ambiente)
- `EMAIL_UNSUBSCRIBE_SECRET` (ou fallback `JWT_SECRET`) — **obrigatório** para o email não
  cair em `UNSUBSCRIBE_SECRET_MISSING`. Documentar no `.env` / CLAUDE.md §4 se ainda não está.
- `SMTP_*` (host/port/user/pass/from) — já obrigatórios para o EmailService.
- `BASE_URL` — usado no link de unsubscribe e nos deep links de email (default
  `https://app.grindfy.com` no sender).
- `COACH_NUDGES_ENABLED` — se `false`, desliga toda a entrega (herdado).

## Riscos
- **Volume de email default ON:** flipar `email_weekly_enabled`/`email_monthly_enabled` para
  `true` em todos os elegíveis pode gerar pico de envio Gmail SMTP no primeiro domingo/segunda
  pós-deploy. Mitigação: confirmar limites do Gmail SMTP e/ou o processor já espaça os jobs
  (15min). Architect/founder avaliam se precisa throttle adicional (provavelmente não para
  o volume atual de usuários — confirmar contagem antes do deploy).
- **Idempotência (RF-05):** se o ledger não for atômico, dois ticks simultâneos podem
  duplicar notif/chat. Mitigação: update condicional / UNIQUE (architect define).
- **Schema drift (RF-01):** este é o risco que já causou o bug latente — manter o drizzle
  table sincronizado com migrações futuras. Considerar um teste de migração que compara
  colunas do DB vs `$inferSelect` (existe `tests/migrations/migration-0071.test.ts` como
  referência).
- **Back-fill irreversível:** o `UPDATE` de dados não é desfeito pelo rollback. Aceito por
  D2/D6 (opt-in default ON é a decisão de produto). Documentar no `_rollback.sql`.
- **Get-or-create de chat session ambíguo:** se a noção de "sessão principal do Coach" não
  estiver clara, o post pode ir para uma sessão errada/duplicada. Architect deve fixar o
  `coachType` canônico e a estratégia de get-or-create no ADR.

## Notas de Implementação (para o architect / implementer)
- Ponto de inserção da entrega tripla: `server/jobs/reportJobRunner.ts` `processOneJob`,
  bloco `if (reportId) { ... }` (linha ~610-622), ao lado do `sendReportEmail` existente.
  Manter o padrão `void fn().catch(log)` por canal.
- Gating runtime deve usar `isReportEligible(user, reportType)` de
  `server/coach/reportEligibility.ts` — não reimplementar a lista de planos.
- `createNotification` / `insertChatMessage` aceitam injeção via storage (lesson #34) — para
  testabilidade, os handlers de entrega devem aceitar `injectedStorage`.
- Ledger (RF-05): preferir Opção A (`reports.delivered_channels` jsonb) por custo; usar
  update atômico `delivered_channels || '{"inApp":"<iso>"}'` com guard `WHERE NOT
  (delivered_channels ? 'inApp')`. Ver lesson #33 (CRUD atômico em jsonb).
- Migração 0086: confirmar que 0085 é o maior número existente (confirmado:
  `0085_tournament_library_speed_fieldsize.sql`).
```

