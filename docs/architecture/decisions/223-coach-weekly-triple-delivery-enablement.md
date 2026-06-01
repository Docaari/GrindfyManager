# ADR-223: Entrega tripla idempotente + enablement default-ON dos relatórios do Coach (EST-1)

## Status
Aceito

## Data
2026-06-01

## Contexto

Os geradores Weekly/Daily/Monthly do Coach já estão shipped (AI-1B/AI-1C) e os crons
rodam (`server/jobs/reportJobRunner.ts` → `processReportJobsTick`), persistindo linhas em
`reports`. Porém **nada chega ao jogador**:

1. **Bloqueador silencioso (schema drift):** a migração 0071 (AI-2B) criou 5 colunas no DB
   (`report_quarterly_enabled`, `email_weekly_enabled`, `email_monthly_enabled`,
   `email_quarterly_enabled`, `disclaimer_accepted_at`) mas elas **não foram adicionadas** ao
   drizzle table `userCoachPreferences` em `shared/schema.ts`. Como `getCoachPreferences` faz
   `db.select().from(userCoachPreferences)`, o objeto retornado nunca mapeia essas colunas →
   `prefs.emailWeeklyEnabled` chega `undefined` → `sendReportEmail` cai no ramo `skipped`.
   Qualquer entrega de email é no-op até isso ser corrigido.

2. **Opt-ins default `false`:** `report_weekly_enabled` / `report_daily_enabled` /
   `report_monthly_enabled` + os de email têm default `false`. Decisão de produto (D2/D6):
   default ON para elegíveis (Trial/Pro/Premium/admin) + back-fill das prefs existentes.

3. **Entrega inexistente:** o relatório só aparece na aba escondida `/coach-ai` "Relatórios e
   avisos". Não há notificação in-app, post no chat, nem email efetivo.

4. **Idempotência:** `persistOrFetchReportId` retorna o mesmo `reportId` num reprocessamento
   (retry, fail-soft, dois ticks). Sem um ledger, a entrega in-app + chat pode duplicar.

Este ADR fecha as 6 decisões de arquitetura do sprint EST-1 (enablement layer). **Não** muda
o conteúdo do relatório (EST-2) nem o ritual interativo (EST-5).

### Forças em jogo
- Drizzle table desincronizado do DB físico (risco recorrente — já causou o bug latente).
- Idempotência sob reprocessamento concorrente (advisory lock cobre o tick, mas não dois
  runners distintos).
- Best-effort por canal: falha de um canal não pode derrubar o job nem bloquear os outros
  (lesson #9 — log antes de qualquer fallback).
- Testabilidade: handlers de entrega precisam aceitar `injectedStorage` (lesson #34).
- `coachType` canônico das chat sessions é `mental | tournament | technical` — não existe
  `'main'`. Get-or-create precisa de um método storage novo (`getChatSessions`/
  `getLatestChatSession` **não existem** hoje).

---

## Decisão 1 — Schema drift (RF-01): mapear as 5 colunas AI-2B no drizzle

Adicionar as 5 colunas da migração 0071 ao drizzle table `userCoachPreferences`
(`shared/schema.ts`, logo após `reportMonthlyEnabled`, ~linha 4628), com os **mesmos defaults
do DB físico** (`false` para os 4 booleanos, nullable para o timestamp):

```ts
// Sprint AI-2B (migração 0071) — colunas físicas que faltavam no drizzle table (EST-1 RF-01).
// Defaults aqui = estado PRÉ-RF-02 (false). O flip default-ON é responsabilidade da
// migração 0086 no Postgres; o `.default(false)` do drizzle só governa inserts via Drizzle.
reportQuarterlyEnabled: boolean("report_quarterly_enabled").notNull().default(false),
emailWeeklyEnabled: boolean("email_weekly_enabled").notNull().default(false),
emailMonthlyEnabled: boolean("email_monthly_enabled").notNull().default(false),
emailQuarterlyEnabled: boolean("email_quarterly_enabled").notNull().default(false),
disclaimerAcceptedAt: timestamp("disclaimer_accepted_at"),
```

E ao `updateCoachPreferencesSchema` (que é `.strict()`, ~linha 4703) os 4 booleanos como
opcionais — **`disclaimerAcceptedAt` NÃO entra** (é setado só pelo endpoint de onboarding
accept do AI-2B; expor via PUT seria spoofável):

```ts
reportQuarterlyEnabled: z.boolean().optional(),
emailWeeklyEnabled: z.boolean().optional(),
emailMonthlyEnabled: z.boolean().optional(),
emailQuarterlyEnabled: z.boolean().optional(),
```

**Por quê drizzle default `false` e não `true`:** o `.default(...)` do drizzle só afeta inserts
feitos via Drizzle ORM; o estado real do DB é governado pela migração 0086. Manter consistência
"drizzle default = default DB **pré-migração**" evita que um `db.push` futuro contradiga a
migração. Após a 0086 rodar, o default real do Postgres para os 5 campos de delivery passa a ser
`true`, e o drizzle `.default(false)` torna-se irrelevante para esses inserts (o INSERT do
drizzle sempre lista as colunas explicitamente quando há valor; quando omite, o DB default
ganha). **Nota de consistência:** os campos `report_weekly/daily/monthly` continuam com
`.default(false)` no drizzle mesmo após a 0086 flipar o DB — isso é aceito porque o caminho de
criação de pref real usa upsert com valores explícitos; documentado como dívida cosmética
(seguir a 0086 como fonte de verdade).

`getCoachPreferences` **não muda** além de o table passar a mapear as colunas — confirmar que o
`normalize`/default da função preserva o valor do DB (não força `false` quando o DB diz `true`).

---

## Decisão 2 — Migração 0086 (RF-02): flip default ON + back-fill de elegíveis

**Migration number confirmado:** maior arquivo atual = `0085_tournament_library_speed_fieldsize.sql`.
Próximo livre = **0086** (contagem direta dos arquivos `migrations/*.sql`).

A migração `0086_coach_report_delivery_defaults_and_ledger.sql` (additive-only) faz:

1. `ALTER COLUMN ... SET DEFAULT true` em **5 colunas** (não 7 — quarterly fora):
   `report_weekly_enabled`, `report_daily_enabled`, `report_monthly_enabled`,
   `email_weekly_enabled`, `email_monthly_enabled`.
   (`report_quarterly_enabled` / `email_quarterly_enabled` permanecem `false` — quarterly é
   AI-2B, fora do escopo de entrega de EST-1.)

2. Back-fill `UPDATE user_coach_preferences SET ...=true WHERE user_id IN (SELECT
   user_platform_id FROM users WHERE subscription_plan IN ('trial','active','admin'))`.

3. Adiciona a coluna `delivered_channels` jsonb em `reports` (ledger — ver Decisão 3).

**Elegibilidade do back-fill:** `users.subscription_plan` é `'trial' | 'active' | 'expired' |
'admin'`. A noção "Pro/Premium" vive em `resolveUserTier`, não numa coluna direta. O WHERE usa
`subscription_plan IN ('trial','active','admin')` — **mesma lista** de
`LIST_USERS_FOR_CRON_PRO_PLUS` / `planEligibility.ts` (`resolveEligiblePlanTier`). `'expired'` e
`'free'` ficam de fora. O back-fill é "best-effort de UX": a barreira final em runtime é sempre
`isReportEligible(user, reportType)` (RF-03/04/07), então mesmo que o back-fill seja generoso, a
entrega só ocorre para quem passa o gate runtime.

**Rollback (`0086_..._rollback.sql`):** reverte os 5 defaults para `false` e **dropa**
`delivered_channels`. **NÃO desfaz o back-fill de dados** — é irreversível por design: o opt-in
default-ON é a decisão de produto (D2/D6); restaurar `false` em massa apagaria opt-outs legítimos
feitos pelo usuário após o back-fill. O rollback restaura apenas o **comportamento de default** +
remove a coluna de ledger (lesson C3 do hub: additive-only + rollback que reverte estrutura, não
dados de produto). Documentado em comentário no `_rollback.sql`.

---

## Decisão 3 — Ledger de idempotência (RF-05): Opção A — `reports.delivered_channels` jsonb

**Escolhida: Opção A** (coluna `delivered_channels` jsonb em `reports`), sobre a Opção B (tabela
`report_deliveries` com UNIQUE).

| | Opção A — jsonb em `reports` | Opção B — tabela `report_deliveries` |
|---|---|---|
| Custo migration | 1 coluna additive | tabela + UNIQUE + FK + índice |
| Query de checagem | sem JOIN (linha já carregada por reportId) | JOIN / SELECT extra |
| Anti-race | update condicional `WHERE NOT (delivered_channels ? 'inApp')` + `RETURNING` | UNIQUE constraint (INSERT falha por conflito) |
| Auditabilidade | timestamp por canal no jsonb | linha por (report, canal) — mais granular |
| Escopo (3 canais/relatório) | suficiente | over-engineering p/ 3 canais |

Opção A é mais barata e suficiente para 3 canais por relatório. A auditoria extra da Opção B não
justifica o custo de uma tabela nova no volume atual.

**Cobertura do ledger:** o ledger cobre **os 3 canais de forma uniforme** (`inApp`, `chat`,
`email`), MAS o **email permanece com sua idempotência própria** (`email_log` UNIQUE
`(report_id, kind)` da 0071) como barreira primária. O `delivered_channels.email` é
**informativo/observabilidade** (timestamp de quando a entrega de email foi disparada) — a
garantia anti-duplicata do email continua sendo o UNIQUE de `email_log`, não tocado por este
sprint. Para in-app + chat, o `delivered_channels` é a **única** barreira anti-duplicata.

**Shape:** `{ "inApp": "<ISO>", "chat": "<ISO>", "email": "<ISO>" }` (chaves presentes = já
entregue). Default `'{}'::jsonb` NOT NULL.

**Método storage anti-race (lesson #33 — CRUD atômico em jsonb):**

```ts
// retorna true sse ESTA chamada marcou o canal agora (claim atômico); false se já estava marcado.
async markReportDelivered(reportId: string, channel: 'inApp'|'chat'|'email', tx?): Promise<boolean> {
  const runner = tx ?? db;
  const iso = new Date().toISOString();
  // UPDATE condicional: só seta se a chave AINDA não existe. RETURNING revela quem ganhou.
  const rows = await runner.execute(sql`
    UPDATE reports
       SET delivered_channels = delivered_channels || ${JSON.stringify({ [channel]: iso })}::jsonb
     WHERE id = ${reportId}
       AND NOT (delivered_channels ? ${channel})
    RETURNING id
  `);
  return rows.rowCount > 0; // true = ganhou o claim; false = outro tick/run já tinha marcado
}
```

O `WHERE NOT (delivered_channels ? channel)` torna o claim atômico no nível de linha do
Postgres: dois ticks simultâneos competem pelo mesmo UPDATE; só um afeta a linha (`rowCount>0`),
o outro vê `0`. O caller **só entrega se `markReportDelivered` retornou `true`** — claim-then-act,
o que pode raramente perder uma entrega se o efeito colateral falhar **após** o claim. Para
mitigar isso sem reintroduzir duplicatas, a ordem é: `claim → efeito → (em erro) liberar o claim`
(unset da chave) para permitir re-tentativa no próximo reprocessamento. Ver `unmarkReportDelivered`
abaixo (compensação só no caminho de erro).

```ts
async unmarkReportDelivered(reportId: string, channel, tx?): Promise<void> {
  const runner = tx ?? db;
  await runner.execute(sql`
    UPDATE reports SET delivered_channels = delivered_channels - ${channel} WHERE id = ${reportId}
  `);
}
```

Isso satisfaz o critério "in-app ok, chat falhou → reprocess: in-app não repete, chat re-tenta":
chat fez claim, falhou no efeito, liberou o claim → próximo reprocess re-claim e re-tenta; in-app
manteve o claim → não repete.

---

## Decisão 4 — Chat post (RF-04): get-or-create em `coachType='technical'`

**`coachType` canônico confirmado** (grep em `server/`): o enum é `mental | tournament |
technical`. **Não existe `'main'`.** Os nudges que falam de relatórios/estudo/import usam
`coachType: "technical"` (`gapCheck.ts`, `bImport.ts`, `processCoachLeakDetection.ts`,
`processBStudy.ts`). Para coerência com a família "relatórios/diagnóstico", o post do relatório
usa **`coachType: 'technical'`**.

**Get-or-create:** `getChatSessions` / `getLatestChatSession` **não existem** hoje (confirmado por
grep). É necessário um método storage novo:

```ts
// reusa a sessão 'technical' ativa mais recente; cria uma dedicada se não houver nenhuma.
async getOrCreateReportChatSession(userId: string, tx?): Promise<{ id: string }> {
  const runner = tx ?? db;
  const [existing] = await runner.select().from(chatSessions)
    .where(and(eq(chatSessions.userId, userId), eq(chatSessions.coachType, 'technical'),
               eq(chatSessions.status, 'active')))
    .orderBy(desc(chatSessions.updatedAt)).limit(1);
  if (existing) return { id: existing.id };
  return this.createChatSession({ userId, coachType: 'technical', title: 'Relatórios' });
}
```

**Decisão: reusar a sessão `technical` ativa mais recente**, criando uma dedicada
(`title='Relatórios'`) só na ausência total. Isso evita poluir o histórico com uma sessão nova a
cada relatório e mantém o anúncio na thread onde o jogador já conversa sobre diagnóstico. (Os
nudges B já postam em sessões `technical` ad-hoc; reusar a mais recente concentra os anúncios.)

**Conteúdo do post (determinístico, SEM LLM — EST-1 não muda conteúdo):** mensagem
`role='assistant'` com template PT-BR por tipo:

| reportType | content |
|---|---|
| weekly | `Terminei seu relatório semanal — veja seus números da semana e os próximos passos em /coach-ai/relatorio/<id>` |
| daily | `Fechei seu debrief de hoje — confira o resumo da sessão em /coach-ai/relatorio/<id>` |
| monthly | `Seu relatório mensal está pronto — abra a retrospectiva do mês em /coach-ai/relatorio/<id>` |

Nenhuma chamada ao Anthropic no caminho do chat post (critério RF-04 + RNF "sem custo de tokens").

---

## Decisão 5 — Ponto de integração: módulo dedicado `server/services/reportDelivery.ts`

A entrega tripla roda em `processOneJob` (`server/jobs/reportJobRunner.ts`), **ao lado do
`sendReportEmail` existente** (~linha 610-622, dentro de `if (reportId) { ... }`). Para
testabilidade (lesson #34), cria-se um módulo dedicado:

```ts
// server/services/reportDelivery.ts
export async function deliverReport(
  args: { reportId: string; userId: string; reportType: 'weekly'|'daily'|'monthly' },
  injectedStorage?: any,
): Promise<void> {
  const storage = injectedStorage ?? (await import("../storage")).storage;
  // ... gating + 3 canais, cada um em try/catch isolado, nunca lança.
}
```

**Ponto de chamada em `processOneJob`** (paralelo ao email, padrão `void ...catch(log)`):

```ts
if (reportId) {
  if (reportType === 'weekly' || reportType === 'daily' || reportType === 'monthly') {
    void deliverReport({ reportId, userId, reportType }, storage).catch((err) =>
      console.error("report.job.delivery.error", { reportId, userId, reportType,
        err: err instanceof Error ? err.message : String(err) }));
  }
  // sendReportEmail permanece como está (já idempotente via email_log); pode migrar
  // para dentro de deliverReport como canal 'email' OU permanecer fora — ver nota abaixo.
}
```

**Nota sobre o email:** `deliverReport` orquestra os 3 canais. Para minimizar regressão, o canal
email **chama o `sendReportEmail` existente** (não reescreve — RF-07 só valida). A ordem dos
canais dentro de `deliverReport`: **in-app → chat → email** (in-app primeiro porque é o mais
barato e visível; email por último porque tem o env `EMAIL_UNSUBSCRIBE_SECRET` que pode lançar). O
`sendReportEmail` mapeia `weekly|monthly|quarterly`; **`daily` não tem email** (Q-G locked no AI-2B),
então para `reportType='daily'` o canal email é pulado (só in-app + chat). Mapa de `kind`:
`weekly→report_weekly`, `monthly→report_monthly`, `daily→(sem email)`.

**Assinatura + ordem + responsabilidade de cada canal:**

1. `deliverInApp` — `markReportDelivered(reportId,'inApp')` → se `true`: `createNotification({
   userId, type:'coach_report', title, message, priority:'medium', deepLink:'/coach-ai/relatorio/'+reportId })`;
   em erro → log + `unmarkReportDelivered`. (priority `'medium'` = "normal" no enum
   `low|medium|high` real do storage; spec dizia "normal").
2. `deliverChat` — `markReportDelivered(reportId,'chat')` → se `true`:
   `getOrCreateReportChatSession(userId)` + `insertChatMessage({ chatSessionId, role:'assistant',
   content })`; em erro → log + `unmarkReportDelivered`.
3. `deliverEmail` — só `weekly|monthly`: `void sendReportEmail({ reportId, userId, kind }, storage)`
   (idempotência própria via `email_log`; o `delivered_channels.email` é só observabilidade,
   marcado best-effort sem unmark — o `email_log` é a barreira real).

Cada canal em seu próprio try/catch; nenhum derruba o job nem os outros (RNF isolamento de falha;
lesson #9 — `console.error` antes de qualquer fallback).

---

## Decisão 6 — Daily/Monthly: entrega tripla **uniforme** para weekly/daily/monthly

O processor é genérico por `reportType`. A entrega tripla cobre os **3 reportTypes**
(`weekly`/`daily`/`monthly`) de forma uniforme — todos ganham **in-app + chat**; **email** cobre
`weekly`/`monthly` (daily não tem email, Q-G locked). Justificativa: o deep link
(`/coach-ai/relatorio/:id`) e o `ReportView` já se adaptam a qualquer tipo (AI-1C), e os
templates de notif/chat parametrizam por `reportType` (Decisão 4). Não há razão para daily/monthly
chegarem só por email — seria inconsistente e perderia a discoverability in-app.

**Quarterly fica de fora de EST-1**: continua só email via AI-2B (`report_quarterly_enabled` /
`email_quarterly_enabled` não flipados, `deliverReport` não dispara para `quarterly`).

**Gating runtime (todos os 3):** `isReportEligible(user, reportType)` (`reportEligibility.ts`) E o
opt-in do relatório do tipo (`reportWeeklyEnabled`/`reportDailyEnabled`/`reportMonthlyEnabled`).
Para in-app, gate adicional `prefs.channelInApp` (default `true`); para chat, o opt-in do
relatório basta (não há toggle de chat por tipo). Recomendação de gate:
`isReportEligible(user, type) && reportPref[type] && (channel === 'inApp' ? prefs.channelInApp : true)`.

---

## Consequências

### Positivas
- O relatório finalmente chega ao jogador pelos 3 canais; bug latente de schema drift resolvido.
- Idempotência atômica (lesson #33) à prova de reprocessamento e de dois ticks concorrentes.
- `deliverReport` testável por composição (lesson #34) — `injectedStorage`.
- Additive-only + rollback estrutural (lesson C3 do hub) — sem drop de dados de produto.
- Uniformidade por `reportType` — daily/monthly herdam a entrega sem código novo por tipo.

### Negativas
- Back-fill de email default-ON pode gerar pico de envio Gmail SMTP no primeiro domingo/segunda
  pós-deploy (Risco documentado na spec). Mitigação: processor espaça jobs (15min); confirmar
  contagem de elegíveis antes do deploy; throttle adicional provavelmente desnecessário no volume
  atual.
- Rollback irreversível em dados (opt-ins back-filled). Aceito por D2/D6.
- `getOrCreateReportChatSession` reusa a sessão `technical` mais recente — se o jogador apagou
  todas, cria uma nova "Relatórios"; ambiguidade residual baixa, mas fixada no ADR.
- Drizzle `.default(false)` nos campos report_* diverge do DB pós-0086 (`true`) — dívida cosmética
  documentada (0086 é a fonte de verdade).

### Neutras
- Nenhum endpoint HTTP novo; `GET/PUT /api/coach/preferences` apenas estendem o contrato.
- Novos métodos storage: `markReportDelivered`, `unmarkReportDelivered`,
  `getOrCreateReportChatSession` (itens de implementação — test-writer/implementer).
- Teste de drift schema (DB vs `$inferSelect`) recomendado, espelhando
  `tests/migrations/migration-0071.test.ts`.

## Confiança
Alta. As 6 decisões reusam infraestrutura existente (`reportJobRunner`, `email_log`,
`createNotification`, `insertChatMessage`, `reportEligibility`), respeitam lessons #9/#33/#34, e o
único ponto novo de risco (ledger anti-race) usa o padrão canônico de UPDATE condicional jsonb já
validado na lesson #33.

## Adendo pós-review (reviewer APPROVED-WITH-NITS, 2026-06-01)

Fixes aplicados antes do merge: **MEDIUM-1** (`getOrCreateReportChatSession` agora filtra
`status='active'` + ordena por `desc(updatedAt)` — evita post-fantasma em sessão archived/deleted),
**LOW-1** (`markReportDelivered` parametriza o jsonb via `${JSON.stringify({[channel]:iso})}::jsonb`,
sem `sql.raw`), **LOW-2** (canal `email` marcado best-effort no ledger pós-`status='sent'`, para
observabilidade — `email_log` continua a barreira real).

Decisões/follow-ups conscientes (não-bloqueantes):
- **MEDIUM-2 — `channelInApp` NÃO gateia a entrega in-app do relatório.** O opt-in do relatório
  (`reportWeeklyEnabled` etc.) é o controle. `channelInApp`/`channelEmail` são toggles da era-nudge
  (proatividade B-*); relatórios são uma superfície de opt-in própria. Decisão consciente — não há
  gate de canal individual para relatórios.
- **MEDIUM-3 — loop best-effort em erro determinístico.** Se um efeito de canal falhar sempre
  (ex.: dado corrompido), o ledger faz claim→falha→unmark a cada reprocessamento, sem progresso.
  Blast radius limitado (job marca `done`; reprocessamento só em retry/idempotency-check). Dívida
  aceita; cap de tentativas por canal no ledger = follow-up se virar ruído.
- **INFO-2 — default-ON para NOVOS usuários elegíveis.** A migration 0086 faz back-fill das prefs
  EXISTENTES de elegíveis (conforme D6 literal) + flipa o DEFAULT do DB para `true`. Mas
  `upsertCoachPreferences` insere as colunas explicitamente a partir de `COACH_PREFS_DEFAULTS`
  (`false`), então uma row criada via app para um novo usuário nasceria `false` (o DEFAULT do DB
  só vale para INSERT que omite a coluna). Gating de runtime (`getReportTier`) continua protegendo
  free/expired. Flipar `COACH_PREFS_DEFAULTS` (5 campos de delivery → `true`) honraria D2/D6 para
  novos usuários, mas exige atualizar testes legados que assertam default `false` (CLAUDE.md §13 —
  requer aval do founder). **Follow-up EST-1.1: decidir COACH_PREFS_DEFAULTS com o founder.**
- **INFO-1 — atalho `/inicio` para relatório não lido (RF-06):** DEFERRED-verify-manual (sem teste
  jsdom estável; `Home.tsx` fora do hunk EST-1).
