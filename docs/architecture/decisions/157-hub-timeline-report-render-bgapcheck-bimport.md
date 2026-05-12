# ADR-157: Hub timeline (`GET /api/coach/timeline` — merge reports + nudges) + render do relatório (`GET /api/coach/reports/:id` + `WeeklyReportView` em rota própria `/coach-ai/relatorio/:id`) + `ReportsPanel` reescrito + `NudgeCard` (deferido do AI-1A) + categorias de nudge `B-GAPCHECK` (gap-check D-3) e `B-IMPORT` (cobrança de import)

## Status
Aceito

## Data
2026-05-12

## Sprint
AI-1B (`Docs/specs/sprint-ai-1b.md`, RF-08/10/11)

## Decision owner
system-architect (UX da timeline/render refinável pelo strategist no sub-handoff; founder valida no marco)

## Related
- Depende de: ADR-150 (hub `/coach-ai` — 4 tabs URL-persisted; a aba `reports` é o ponto de plug da timeline; `data-testid="coach-ai-reports-empty"` no EmptyState atual), ADR-155 (tabelas `reports`/`report_jobs` — a timeline lê `reports`; o render usa `content` + `markdown`), ADR-152 (anti-fadiga — `shouldSendNudge` é o gate; `coach_nudge_log` telemetria; auto-freeze cobre as categorias novas; `triggered_by_event='auto_freeze_notice'`), ADR-085 (engine de nudge — `NudgeCategory` enum, `CATEGORY_TOGGLE_MAP`, `cycleKey`), ADR-146 (write tools confirm always — os CTAs do relatório que viram tool não auto-executam), ADR-125 (tabs URL-persisted via `useTabFromUrl`).
- Reusa: endpoints de nudge do AI-1A (`GET /api/coach/nudges`, `POST /api/coach/nudges/:id/{dismiss,snooze,engage,unsubscribe}`), `apiRequest` (retorna JSON parseado — lesson #13), `ReactMarkdown` + `remarkGfm` (igual ao chat), `getLocalHour` + `listUsersForCron` + `withAdvisoryLock` (pros ticks de gap-check/B-IMPORT), padrão de cron de `processBStudy`, `isWeeklyReportEligible` (ADR-155 — gap-check só pra quem recebe o report).
- Diagramas: `Docs/architecture/diagrams/coach-ai-1b/{hub-timeline-flow,gapcheck-bimport-flow,report-tables-er}.mermaid`.

---

## 1. Contexto

O AI-0B (ADR-150) montou o hub `/coach-ai` com 4 tabs URL-persisted (`?tab=chat|reports|audit|prefs`). A tab `reports` (`ReportsPanel` em `client/src/pages/CoachAI.tsx`) é hoje um EmptyState (`data-testid="coach-ai-reports-empty"`), desenhada pra a Fase 1 plugar a timeline sem mexer no layout. O AI-1A entregou o anti-fadiga e os endpoints de nudge, **mas deixou o `NudgeCard` deferido** (não há componente que renderize um nudge na UI ainda). O AI-1B (ADR-155) cria a tabela `reports`. Falta:

1. **A timeline** — a aba `reports` precisa virar uma timeline real unindo relatórios gerados (`reports` rows, clicáveis) + nudges in-app (`coach_nudge_log` rows). Não existe endpoint que faça esse merge.
2. **O render do relatório** — clicar num card de relatório precisa abrir o relatório renderizado (markdown + seções + insights + CTAs). Não existe componente nem rota.
3. **O `NudgeCard`** — deferido do AI-1A; entra aqui (mostra título/body/status + botões de snooze/dismiss/engage; aviso especial pra `auto_freeze_notice`).
4. **Duas categorias de nudge novas** — `B-GAPCHECK` (gap-check D-3 pré-Weekly, valida estado real, 1/ciclo) e `B-IMPORT` (cobrança de import standalone, ≥5d sem import + tem sessões, 1/semana). Ambas passam pelo `shouldSendNudge` do AI-1A; precisam de toggle novo em `userCoachPreferences`, entrada no `CATEGORY_TOGGLE_MAP`/`NudgeCategory`/`unfreezeCategory`, e um cron tick cada.

A pergunta central: **o `GET /api/coach/timeline` (merge reports + `coach_nudge_log`, paginação, ordenação); o `GET /api/coach/reports/:id`; o componente `ReportsPanel`; o `NudgeCard`; o `WeeklyReportView` (página vs modal — decida; rota `/coach-ai/relatorio/:id`?); o desenho do gap-check D-3 (como decide "faltam dados") e do B-IMPORT.**

### Restrições

- **Não regredir o hub** — as outras 3 tabs continuam funcionando; o layout do hub não muda (só o conteúdo da aba `reports`).
- **`shouldSendNudge` é o gate de proatividade** — `B-GAPCHECK` e `B-IMPORT` passam pela mesma cadeia de 8 checks (kill switch → toggle → frozen → snooze → quiet hours → daily/hourly cap → one-shot per cycle); o auto-freeze do AI-1A cobre as categorias novas automaticamente.
- **Gap-check valida estado REAL** — nunca confia em flag pré-computada que poderia estar stale (lesson #9 + risco R5 do plano: não cobrar quem está OK). Faz as queries no momento.
- **Gap-check só pra quem recebe o report** — `isWeeklyReportEligible` (Pro+ opt-in); gap-check é o "pré-aviso do relatório de segunda" — não faz sentido pra quem não vai receber o relatório.
- **B-IMPORT mínimo Pro+** — consistente com B-STUDY (Pro+); cobrar import de quem não paga é menos prioritário (embora F6 do plano não restrinja por tier — system-architect pode incluir Free depois).
- **Lessons aplicáveis** — #13 (`apiRequest` retorna JSON parseado — mocks retornam o JSON, não `{ ok, json }`), #14/#26 (testes de componente React usam `await import`, não `require`), #19 (CTAs com `href` casam com rotas Wouter **registradas** — `grep "Route path" client/src/App.tsx`; 404 silencioso é um perigo), #23 (Wouter v3 — `<Link href="/x"><a>...</a></Link>` NÃO duplica anchor; o projeto está em `wouter ^3.3.5` → o padrão de anchor child está correto), #27 (Radix Tabs reage a `onMouseDown` — o hub já tem `onClick` redundante), #29 (`useQuery` sem provider → ErrorBoundary local pra fetchers secundários; o `ReportsPanel` está dentro do `QueryClientProvider` do app — ok), #30 (hook test `.test.ts` → projeto jsdom, config-level), #34 (handlers de route com `injectedStorage?`), #21 (cache server-side com `_resetForTests` exportado).

---

## 2. Opções consideradas

### 2.1 `GET /api/coach/timeline` — merge no servidor vs no frontend

**Opção A — merge no servidor: o endpoint retorna uma lista única ordenada de `TimelineItem` (union discriminada por `kind: 'report'|'nudge'`) (ESCOLHIDA).** Query: `SELECT` de `reports` (`generated_at`) + `SELECT` de `coach_nudge_log` (`sent_at`) do user, merge in-memory ordenado por timestamp desc, paginado por `cursor` (timestamp). `?limit=` default 30 max 100.
- **Prós:** o frontend recebe a lista pronta — sem 2 queries + merge no cliente; paginação consistente (cursor único); a UI é dumb (render do que vier).
- **Contras:** o merge in-memory de 2 SELECTs precisa de cuidado com o cursor (pegar `LIMIT+1` de cada, merge, cortar no `limit`, derivar `nextCursor` do último). Aceito — padrão conhecido de "merge de feeds".

**Opção B — o frontend chama `GET /api/coach/reports` + `GET /api/coach/nudges` e faz o merge no cliente.**
- **Contras:** 2 queries; merge + ordenação + paginação no cliente (complicado fazer cursor consistente entre 2 fontes); o `GET /api/coach/reports` (lista) nem existe ainda — teria que criar. **Rejeitada** — o servidor é o lugar certo pra montar o feed.

### 2.2 Render do relatório — página própria vs modal

**Opção A — página própria, rota `/coach-ai/relatorio/:id` (ESCOLHIDA).** Componente `WeeklyReportView.tsx`. Reusa o padrão de roteamento do hub (já existe `/coach-ai/onboarding` — outra subrota; ADR-153). A rota é registrada em `client/src/App.tsx` (lesson #19 — confirmar que a rota existe pra os CTAs/links não caírem em 404 silencioso).
- **Prós:** URL compartilhável (o user pode mandar o link do relatório); o relatório é "longo" (8 seções + 3 insights + plano + CTAs) — uma página inteira respira melhor que um modal; consistente com `/coach-ai/onboarding`; o back do browser volta pra timeline naturalmente; testável standalone.
- **Contras:** mais uma rota registrada. Aceito — trivial.

**Opção B — modal/`Dialog` sobre a timeline.**
- **Prós:** não sai da timeline; menos uma rota.
- **Contras:** sem URL compartilhável; modal grande com scroll interno é pior UX pra conteúdo longo; o estado de "qual relatório está aberto" não persiste no refresh. **Rejeitada.**

### 2.3 Aritmética do gap-check D-3

**Decisão:** o Weekly Report é entregue **segunda 7h** (fuso do user) e cobre a **semana que acabou** (a segunda da semana de jogo até o domingo). "D-3 antes da entrega" = **sexta-feira** dessa mesma semana de jogo (segunda menos 3 dias = sexta da semana anterior à entrega, que é a semana de jogo). Critério: "≈3 dias antes do relatório, ainda dentro da semana de jogo, dá tempo de o user agir". O `gapCheckTick` roda `0 * * * *` filtrando `getLocalHour(now, tz) === hora útil` (ex 10h ou 18h — evitar quiet hours, embora o engine já filtre) **e** "hoje é sexta no fuso do user". O `cycleKey` = `YYYY-WW` (ISO week da semana do report) → `shouldSendNudge` garante 1×/ciclo. (O implementer confirma a aritmética exata na red phase; o critério está fixado.)

### 2.4 Como o gap-check decide "faltam dados"

**Decisão:** o `gapCheckTick`, pra cada user elegível no dia D-3, faz um **check de estado real** (queries no momento — nunca flag stale). Faltam dados se **algum** for verdade:
- **Não importou histórico essa semana E tem sessões registradas** — `upload_history` sem row na semana de jogo + `grind_sessions` com row(s) na semana ("jogando no escuro").
- **Sessões `grind_sessions` da semana sem reconciliação / sem report manual** — sessão concluída mas sem dados de resultado conciliados.
- **Snapshot de bankroll pendente** — sem `bankroll_snapshots` recente (se o user usa bankroll).
- **0min de estudo registrado essa semana E tem foco ativo** — `study_sessions` vazio + `findActiveLeakFocusList` não-vazio.
- **Escolheu um foco mas não atualizou stats (HUD)** — foco ativo mas sem update de stats recente.

Se **nenhum** item faltante → não manda nada (não cobra quem está OK — risco R5). Se algum → monta 1 nudge gentil listando os itens faltantes ("Vi que talvez esteja faltando alguns dados pro seu relatório de segunda: [...] — se você já fez por outro caminho, ignora.") com links (`/upload`, `/grind`, `/bankroll`, `/estudos`, `/stats`); `createNudgeLog({ category: 'B-GAPCHECK', status: 'sent', triggeredByEvent: 'gap_check_d3', cycleKey, bodyPreview, chatSessionId? })`. (Os helpers de check exatos — `hasImportThisWeek`, `hasUnreconciledSessions`, etc. — o implementer materializa na red phase; podem reusar métodos de storage existentes ou ser novos.)

### 2.5 B-IMPORT — threshold e elegibilidade

**Decisão:** `bImportTick` roda `0 * * * *` filtrando `getLocalHour(now, tz) === targetLocalHour` (padrão `processBStudy`), Pro+ (mínimo — consistente com B-STUDY). `lastImportAt = storage.getLastUploadAt(userId)` (max de `upload_history`); `N = COACH_BIMPORT_DAYS` env (default 5). Se `now - lastImportAt < N dias` (ou nunca importou E sem sessões) → skip. `sessionsInPeriod = storage.countGrindSessionsSince(userId, lastImportAt ?? now-Ndias)`; se `=== 0` → skip (não está jogando). Se `lastImportAt` muito antigo (ou null) E `sessionsInPeriod > 0` → 1 nudge gentil ("Você registrou N sessões nas últimas semanas mas não importou nenhum CSV — estou meio cego sobre seus resultados reais. Bora importar?") com link `/upload`; `cycleKey = YYYY-WW` → 1×/semana; `createNudgeLog({ category: 'B-IMPORT', status: 'sent', triggeredByEvent: 'b_import_check', cycleKey, bodyPreview, chatSessionId? })`.

### 2.6 Lugar dos ticks de gap-check / B-IMPORT

**Decisão:** ficam em `server/coach/jobs/` (consistente com `processBSnapshot`/`processBStudy`) — `server/coach/jobs/gapCheck.ts` (`gapCheckTick`) e `server/coach/jobs/bImport.ts` (`bImportTick`); registrados no `server/coach/cronRunner.ts` (que já gateia os schedules de proatividade por `COACH_NUDGES_ENABLED`). Alternativa (junto do `reportJobRunner.ts` em `server/jobs/`) é aceitável — o implementer decide; o critério: passam pelo `shouldSendNudge`, gated por `COACH_NUDGES_ENABLED`, envoltos em `withAdvisoryLock`.

---

## 3. Decisão

### 3.1 `GET /api/coach/timeline`

- Query params: `?limit=` (default 30, max 100 — clampa, não 400), `?cursor=` (opcional, timestamp ISO — paginação por `generated_at`/`sent_at`).
- Response: `{ items: TimelineItem[], nextCursor?: string }`. `TimelineItem` = union discriminada por `kind`:
  - `{ kind: 'report', id, reportType, periodStart, periodEnd, status, summaryLine, generatedAt, readAt, dismissedAt }` — `summaryLine` = `content.header.summaryLine` (do `reports` row).
  - `{ kind: 'nudge', id, category, status, title, bodyPreview, sentAt, engagedAt, dismissedAt, snoozeUntil, chatSessionId, triggeredByEvent }` — do `coach_nudge_log`.
- Ordenado por timestamp desc (merge in-memory de `reports.generated_at` e `coach_nudge_log.sent_at`; pegar `LIMIT+1` de cada fonte, merge, cortar no `limit`, `nextCursor` = timestamp do último item retornado).
- `requireAuth`; só itens do user logado; handler com `injectedStorage?` (lesson #34).

### 3.2 `GET /api/coach/reports/:id`

- Response: `{ id, reportType, periodStart, periodEnd, status, content, markdown, generatedAt, costUsdEstimate? }`.
- Marca `read_at = now` na primeira leitura (idempotente — só se `read_at` for null).
- `404` se não existe; `403` se não é do user; handler com `injectedStorage?`.
- (Opcional, não obrigatório:) `POST /api/coach/reports/:id/dismiss` — seta `dismissed_at` (arquiva o card na timeline).

### 3.3 Frontend

- **`ReportsPanel`** (em `client/src/pages/CoachAI.tsx`, reescrito) — `useQuery(['/api/coach/timeline'])` (lesson #13 — `apiRequest` retorna JSON parseado; lesson #29 — dentro do `QueryClientProvider` do app). Timeline vazia → EmptyState (mantém o `data-testid="coach-ai-reports-empty"` como fallback ou troca por um novo — documentado; recomendação: manter pra não quebrar testes legados que checam o testid). Itens → lista; `report` item → card clicável (navega `/coach-ai/relatorio/:id`); `nudge` item → `<NudgeCard>`.
- **`NudgeCard.tsx`** (novo — `client/src/components/coach/NudgeCard.tsx`) — título + body preview + status badge; se `status` em estado acionável: "Não agora" (snooze short) / "Não por enquanto" (snooze long) / "Ver no chat" (engage → navega `/coach-ai?tab=chat` com a session) / "Dispensar" (dismiss) — chama os endpoints do AI-1A (`POST /api/coach/nudges/:id/{snooze,engage,dismiss}`); `triggeredByEvent === 'auto_freeze_notice'` → renderiza o aviso de categoria pausada sem botões de snooze. Reusa o padrão visual de cards do hub.
- **`WeeklyReportView.tsx`** (novo) — rota `/coach-ai/relatorio/:id` (registrada em `client/src/App.tsx` — lesson #19). `useQuery(['/api/coach/reports', id])`; renderiza o `markdown` via `ReactMarkdown` + `remarkGfm` (igual ao chat) com as 8 seções + os 3 insights + o plano da semana + os CTAs. CTAs: `kind: 'link'` → `<Link href={cta.href}>` (Wouter v3 — anchor child ok, lesson #23; rota registrada, lesson #19); `kind: 'tool'` → abre o fluxo da tool com confirm (não auto-executa — ADR-146; abre o chat com a tool pré-armada). `status='degraded'` → renderiza os números + aviso "este relatório foi gerado em modo simplificado" (sem a prosa dos insights). Testes de componente com `await import` (lesson #14/#26), não `require`.
- **`CoachAI.prompt-starters.test.tsx`** (já `describe.skip`) — pode ser substituído por testes do `ReportsPanel`/`NudgeCard`/`WeeklyReportView` ou ficar skip.

### 3.4 Categorias de nudge `B-GAPCHECK` e `B-IMPORT`

Schema (migração `0067` — a mesma do ADR-155): `user_coach_preferences` ganha `nudge_b_gapcheck boolean NOT NULL DEFAULT true` e `nudge_b_import boolean NOT NULL DEFAULT true` (default `true` — ambas úteis e gentis; F6 do plano: B-IMPORT é ICE 8.3, alto valor). `updateCoachPreferencesSchema` ganha `nudgeBGapcheck: z.boolean().optional()` e `nudgeBImport: z.boolean().optional()` (mantém `.strict()`); `unfreezeCategory` enum ganha `'B-GAPCHECK'` e `'B-IMPORT'`. `server/coach/nudgeEngine.ts`: `NudgeCategory` ganha `'B-GAPCHECK' | 'B-IMPORT'`; `CATEGORY_TOGGLE_MAP` ganha `'B-GAPCHECK': 'nudgeBGapcheck'` e `'B-IMPORT': 'nudgeBImport'`. `buildPrefsResponse` inclui os 2 toggles novos. A aba Preferências do hub ganha os 2 toggles. `coach_nudge_log` aceita `triggered_by_event` `'gap_check_d3'` e `'b_import_check'` (sem coluna nova — o varchar existente comporta).

Ticks (ver §2.3-2.6): `gapCheckTick({ now })` (D-3 = sexta, hora útil, Pro+ opt-in, check de estado real, `cycleKey=YYYY-WW`) e `bImportTick({ now })` (Pro+, ≥`COACH_BIMPORT_DAYS` sem import + tem sessões, `cycleKey=YYYY-WW`) — ambos `withAdvisoryLock` (`cron:coach-gap-check` / `cron:coach-b-import`), gated por `COACH_NUDGES_ENABLED`, `try/catch` por user (lesson #9), passam por `shouldSendNudge`.

---

## 4. Consequências

### Positivas
- A aba `reports` do hub vira útil — timeline real de relatórios + nudges; o user vê o histórico de proatividade num lugar só.
- O `NudgeCard` (deferido do AI-1A) ganha casa — os nudges in-app finalmente têm UI; o `auto_freeze_notice` renderiza diferente.
- Render do relatório em página própria — URL compartilhável, conteúdo longo respira, consistente com `/coach-ai/onboarding`.
- Gap-check D-3 valida estado real — não cobra quem está OK (risco R5 mitigado); dá tempo de o user agir antes do relatório de segunda.
- B-IMPORT pega "jogando no escuro" — sinal claro (tem sessões, não importa) → cobrança gentil 1×/semana.
- Reusa toda a infra de nudge do AI-1A (`shouldSendNudge`, auto-freeze, `coach_nudge_log`, endpoints) — as 2 categorias novas só plugam.
- CTAs do relatório fecham o loop sem inventar tools — só dispara o que existe (AI-0A) ou navega.

### Negativas / trade-offs
- 2 endpoints novos + 1 rota nova + 3 componentes novos/reescritos (`ReportsPanel`, `NudgeCard`, `WeeklyReportView`) + 2 categorias de nudge + 2 ticks de cron + 2 colunas. Aceito — é o escopo do RF-08/10/11.
- O merge in-memory de 2 SELECTs no `GET /api/coach/timeline` precisa de cuidado com o cursor — risco de off-by-one na paginação. Mitigação: `LIMIT+1` de cada, testes de paginação.
- Gap-check D-3 = sexta — se o user joga só no fim de semana, "faltam dados" pode disparar antes de ele ter jogado a semana toda. Aceitável — o nudge é gentil ("se você já fez por outro caminho, ignora") e 1×/ciclo; o auto-freeze pega se o user dispensa muito.
- 2 noções de "semana" no gap-check/B-IMPORT (`cycleKey=YYYY-WW` ISO week) vs o report (`period_start` fuso do user) — mas o `cycleKey` é só o gate do `shouldSendNudge`, não afeta o conteúdo.

### Neutras
- O `cronRunner.ts` ganha 2 schedules (ou ficam no `reportJobRunner.ts` — implementer decide); ambos gated por `COACH_NUDGES_ENABLED` (igual aos outros de proatividade).
- `CoachAI.prompt-starters.test.tsx` (legado, `describe.skip`) pode ser substituído ou ficar skip.

---

## 5. Notas para o test-writer

- **`GET /api/coach/timeline`:** retorna `{ items, nextCursor? }`; items são union `report`|`nudge` ordenados por timestamp desc; só do user logado; `?limit=999` → clampa 100; `?cursor=` pagina; só nudges (sem relatório) → renderiza `NudgeCard`s; vazio → EmptyState. Mockar `storage` (lesson #34) — validar shape real de `reports`/`coach_nudge_log` (lesson #3).
- **`GET /api/coach/reports/:id`:** retorna `content` + `markdown`; marca `read_at` (idempotente — só se null); `404` id inexistente; `403` id de outro user.
- **`ReportsPanel`/`NudgeCard`/`WeeklyReportView`:** testes de componente com `await import` (lesson #14/#26), não `require`. `apiRequest` mock retorna JSON parseado (lesson #13). `ReportsPanel` dentro do `QueryClientProvider`; se algum fetcher secundário standalone — ErrorBoundary local (lesson #29). `NudgeCard`: estado acionável → botões + chama os endpoints AI-1A; `triggeredByEvent='auto_freeze_notice'` → aviso sem botões de snooze. `WeeklyReportView`: markdown via `ReactMarkdown`; CTAs `link` navegam pra rotas **registradas** (lesson #19 — confirmar a rota `/coach-ai/relatorio/:id` em `App.tsx`); CTAs `tool` abrem o fluxo com confirm (não auto-executam — ADR-146); `status='degraded'` → aviso "modo simplificado". Wouter v3 — `<Link href><a>...</a></Link>` ok (lesson #23). Hook tests `.test.ts` → projeto jsdom (lesson #30).
- **`B-GAPCHECK`/`B-IMPORT`:** estão no `NudgeCategory` enum, `CATEGORY_TOGGLE_MAP`, `updateCoachPreferencesSchema` (`nudgeBGapcheck`/`nudgeBImport`), `unfreezeCategory` enum; migração adiciona `nudge_b_gapcheck`/`nudge_b_import` NOT NULL DEFAULT true. `gapCheckTick({ now })` — `now` = sexta no fuso de um user Pro+ opt-in **com dados faltantes** (ex: sessões registradas + sem import essa semana) → cria 1 `coach_nudge_log` `category='B-GAPCHECK'` `cycleKey=YYYY-WW`; de novo no mesmo ciclo → `already_sent_this_cycle`, não duplica; user **sem dados faltantes** (tudo OK) → não manda; Pro+ **sem opt-in** → não recebe; Free → não recebe; `nudgeBGapcheck=false` → `category_disabled`; congelada → `category_frozen`; check de estado é **real** (queries no momento — não usa flag pré-computada). `bImportTick({ now })` — user Pro+ que **não importou há ≥5d** E **tem ≥1 sessão** → cria 1 `coach_nudge_log` `category='B-IMPORT'` `cycleKey=YYYY-WW`; de novo na semana → `already_sent_this_cycle`; importou ontem (<N dias) → não manda; sem sessões → não manda; `nudgeBImport=false` → `category_disabled`; congelada → `category_frozen`; `COACH_BIMPORT_DAYS` env override altera o threshold (default 5). `COACH_NUDGES_ENABLED='false'` → nem `gapCheckTick` nem `bImportTick` fazem trabalho. B-GAPCHECK e B-IMPORT são categorias **distintas** — um user pode receber os dois na mesma semana (sujeito aos caps diário/horário do anti-fadiga). Tz-mocking: `now: Date` injetável; testar fusos extremos + vira de ano (semana 52→01 — o `cycleKey` não quebra). Mockar `shouldSendNudge` ou usar o real com mocks de `getCoachPreferences`/`countNudgeLog` (lesson #3).
- **Lessons:** #3, #9, #13, #14/#26, #19, #23, #27, #29, #30, #34, #21.

## 6. Referências

- Spec: `Docs/specs/sprint-ai-1b.md` (RF-08/10/11)
- Plano: `Docs/strategy/ai-agents-improvement-plan-2026-05-11.md` (Tema A — A2 hub timeline; Tema F — F5 gap-check, F6 B-IMPORT; Tema G — G3 anti-fadiga obrigatório)
- ADR-150 (hub tabs), ADR-155 (tabelas reports/report_jobs), ADR-152 (anti-fadiga), ADR-085 (engine de nudge), ADR-146 (write tools confirm), ADR-125 (tabs URL-persisted)
- Endpoints AI-1A: `Docs/api/coach.md` (`GET /api/coach/nudges`, `POST /api/coach/nudges/:id/{dismiss,snooze,engage,unsubscribe}`)
- Diagramas: `Docs/architecture/diagrams/coach-ai-1b/{hub-timeline-flow,gapcheck-bimport-flow,report-tables-er}.mermaid`
- CLAUDE.md §6.1, §9
