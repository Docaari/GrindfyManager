# CLAUDE.md — Grindfy Manager

## 1. Visao Geral

**Grindfy** = SaaS de gestao e analise de performance para jogadores profissionais de poker MTT. Importa historicos de multiplas redes, dashboard analitico, planeja grade semanal, sessoes de grind em tempo real, estudos, coaching baseado em dados.

- **Publico:** jogadores profissionais/semi-profissionais de poker online (MTT)
- **Repositorio:** https://github.com/Docaari/GrindfyManager.git
- **Origem:** importado do Replit, em organizacao para deploy independente
- **Idioma codigo:** ingles | **Idioma UI:** PT-BR

### Modulos

| Setor | Nome | Descricao |
|-------|------|-----------|
| 1 | Analise de Dados | Upload, Dashboard de performance, Biblioteca de torneios |
| 2 | Assistente de Grind | Grade, Warm-up, Grind em tempo real |
| 3 | Coach AI | Chat com Claude, tools, page context, persona tiered |
| 4 | Bankroll | Multi-wallet (USD/BRL/EUR/CNY), snapshots, rakeback, rules |
| 5 | Tournament Selector | Scoring 0-100 + grade S/A/B/C/D para sugestoes |

---

## 2. Stack Tecnologica (resumo)

**Frontend:** React 18 + TypeScript 5.6 + Vite + Wouter + TanStack Query + Tailwind + Radix/shadcn + Recharts + Framer Motion + React Hook Form + Zod.

**Backend:** Node 20 + Express + TypeScript + Drizzle ORM + pg/Neon + JWT (jsonwebtoken/bcryptjs) + Multer + Nodemailer + helmet + express-rate-limit + Stripe (preparado).

**DB:** PostgreSQL 16 (local dev) / Neon Serverless (producao).

**Build/Test:** esbuild (bundle servidor) + tsx (dev) + Vitest 4 (testes, com `test.projects` para node + jsdom) + drizzle-kit (migrations).

Dependencias completas em `package.json`. Versoes especificas em `Docs/architecture/decisions/` (ADRs).

---

## 3. Estrutura de Diretorios (top-level)

```
grindfy/
├── client/src/         # React frontend (pages, components, contexts, hooks, lib, types)
├── server/             # Express backend
│   ├── index.ts        # Entry (porta 3000)
│   ├── routes/         # 17 modulos (modularizado de routes.ts em 2026-03-20)
│   ├── storage.ts      # Camada de acesso a dados (Drizzle queries)
│   ├── auth.ts         # JWT + middleware
│   ├── csvParser.ts    # Parser multi-rede (WPN, GG, Stars, Party, 888, Bodog, Coin, Chico, Revolution, iPoker)
│   ├── coach*.ts       # Coach AI (prompts, system builder, tools, access)
│   ├── scoring/        # Tournament Selector + currency normalizer
│   └── services/       # walletService, etc.
├── shared/
│   ├── schema.ts       # Drizzle ORM + Zod (~1300 linhas)
│   ├── permissions.ts  # Permissoes
│   └── wallet-reasons.ts
├── migrations/         # drizzle-kit
├── tests/              # Vitest unit + integration
├── Docs/               # Documentacao (ADRs, specs, api, architecture, prd, strategy)
├── client/src/         # ja listado acima
├── attached_assets/    # logos das redes (limpo de prompts Replit)
└── package.json
```

Detalhes especificos via Glob: `client/src/pages/**`, `client/src/components/**`, `server/routes/**`.

---

## 4. Variaveis de Ambiente

Arquivo `.env` na raiz (no `.gitignore`).

**Obrigatorias:**
- `DATABASE_URL` — connection string PostgreSQL
- `JWT_SECRET`, `JWT_REFRESH_SECRET` — chaves JWT
- `PORT` (default 3000)
- `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_NAME`, `SMTP_FROM_ADDRESS`

**Opcionais/producao:**
- `BASE_URL` — URL base para links em emails (ex: `https://app.grindfy.com`)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — OAuth Google
- `STRIPE_SECRET_KEY` — pagamentos
- `ANTHROPIC_API_KEY` — Coach AI
- `COACH_MODEL` — override do modelo Claude (ADR-021)
- `COACH_NUDGES_ENABLED` — kill switch global da proatividade do Coach. Default `true`/ausente (proatividade ON — a infra de nudge ja roda em prod via cronRunner). `=false` desliga **toda** a proatividade: `shouldSendNudge` retorna `nudges_globally_disabled` (check 0, absoluto — nem `isCritical` bypassa) + o `cronRunner` nao registra os schedules de B-SNAPSHOT, B-STUDY (`generateCoachRecommendations` foi aposentado — ADR-156) + **tambem desliga o report job runner** (enqueuer hourly = Weekly + Monthly + processor 15min) e os ticks de gap-check (`B-GAPCHECK`) / B-IMPORT (`B-IMPORT`) + **o enqueue event-driven do Daily Debrief** em `handleUpdateGrindSession` (RF-03 AI-1C — `enqueueDailyDebriefForSession` vira no-op) — relatorios (weekly/daily/monthly) contam como "proatividade" (sem flag nova; o user ja controla via os opt-ins `report_weekly_enabled` / `report_daily_enabled` / `report_monthly_enabled`). Jobs ja enfileirados ficam parados enquanto a flag esta off; quando volta, o processor pega os atrasados. O cleanup de pending coach_actions continua sempre. Ver ADR-152 + ADR-155/157 + ADR-159.
- `COACH_BIMPORT_DAYS` — (opcional) threshold de dias do nudge `B-IMPORT` ("nao importou ha N dias + tem sessoes registradas → cobra import"). Default `5`. Ver ADR-157.
- `COACH_REPORT_SUMMARIZER_MODEL` — (opcional) override do modelo Haiku usado na sumarizacao hierarquica do bundle dos relatorios (Monthly, e Weekly se grande). Default = `COACH_MEMORY_MODEL ?? 'claude-haiku-4-5-20251001'` (mesma fonte de `coachMemory.ts`). Ver ADR-159 (RF-07).
- `COACH_REPORT_SUMMARIZE_THRESHOLD_CHARS` — (opcional) threshold de tamanho (em chars de `JSON.stringify(bundle)`) que aciona a sumarizacao hierarquica do bundle. Default `~20000`. Abaixo do threshold a sumarizacao e no-op (`summarizer_model_used = null`); o Daily Debrief nunca aciona (bundle sempre pequeno). Ver ADR-159 (RF-07).
- `SPOT_IMAGE_STORAGE_BACKEND` — backend de armazenamento de spots (default `local`; `s3` reservado para deploy futuro). Ver ADR-057.
- `NEWS_FEED_ENABLED` — master kill-switch do news feed (default `false`). Quando `true`, ativa endpoints `/api/news` e cron `refreshNews`. Ver ADR-100 + ADR-106.
- `XAI_API_KEY` — chave xAI Grok (obtida em console.x.ai). Obrigatoria se `NEWS_FEED_ENABLED=true`. Ver ADR-106.
- `XAI_MODEL` — override do modelo xAI (default `grok-3-latest`).

---

## 5. Scripts (package.json)

| Script | Comando | Descricao |
|--------|---------|-----------|
| `dev` | `cross-env NODE_ENV=development tsx --env-file=.env server/index.ts` | Dev server com Vite HMR (porta 3000) |
| `build` | `vite build && esbuild server/index.ts ...` | Build prod: frontend + backend |
| `start` | `NODE_ENV=production node dist/index.js` | Inicia prod |
| `check` | `tsc` | Type-check sem emitir |
| `db:push` | `drizzle-kit push` (com `--env-file=.env`) | Push schema sem migracao formal |

Servidor escuta em `0.0.0.0:3000` por padrao.

---

## 6. Modelos de Dados

Schema em `shared/schema.ts`. **Indice completo de tabelas + convencoes:** `Docs/architecture/data-model-index.md`.

**Tabelas core (memorize):** `users`, `tournaments`, `planned_tournaments`, `grind_sessions`, `session_tournaments`, `wallets`, `wallet_transactions`, `bankroll_snapshots`, `coach_conversations`, `coach_messages`.

**Coach AI — relatorios automaticos (AI-1B + AI-1C, migracoes 0067/0068):** `report_jobs` (fila de jobs de relatorio — status `pending`→`running`→`done`/`failed`/`skipped`, retry exponencial via `next_attempt_at`, snapshot de `timezone`/plano, `enqueued_by` varchar livre [`'cron_enqueuer'` weekly/monthly; `'session_completed'` daily], `report_type` varchar(16) **livre** [`'weekly'`/`'daily'`/`'monthly'` ativos; `'quarterly'` reservado p/ AI-2B — sem ALTER], UNIQUE `(user_id, report_type, period_start)`) + `reports` (relatorios gerados — `content` JSONB `ReportContent` v2 + `markdown` derivado + custo/tokens + `summarizer_model_used`, status `ready`/`degraded`, UNIQUE `(user_id, report_type, period_start)`). Colunas em `user_coach_preferences`: `report_weekly_enabled` (opt-in Weekly), **`report_daily_enabled`** (opt-in Daily Debrief — migracao 0068), **`report_monthly_enabled`** (opt-in Monthly Report — migracao 0068), `nudge_b_gapcheck` + `nudge_b_import`. **Tier gating estrito (AI-1C, ADR-159):** elegibilidade de relatorio = `getReportTier(user)` (`server/coach/reportEligibility.ts`) ∈ `{'free','eligible'}` — `eligible` p/ Trial (`subscription_plan='trial'`) OU `resolveUserTier ∈ {pro,premium,admin}`; Free **nunca** recebe; `resolveUserTier` em si NAO muda (gateia rate limit + tools, Trial→free la). Corrige o bug latente do AI-1B (`PRO_PLANS=['pro','premium','admin']` vs `users.subscription_plan` que e `'trial'|'active'|'expired'|'admin'`). **Daily Debrief:** event-driven em `handleUpdateGrindSession` (PUT `/api/grind-sessions/:id` quando `status='completed'`) — best-effort fire-and-forget, so enfileira `report_jobs` row `'daily'` (NAO gera sincrono — o processor 15min gera via `dailyDebriefGenerator`), `period_start` = data da sessao no fuso do user, cap 1/dia (UNIQUE — o gerador agrega as sessoes do dia), usa **`session_tournaments` da sessao** (NAO o historico — §6.1 nao aplica ao detalhe da sessao). **Monthly Report:** regra "dia 1 do mes 7h no fuso do user" no enqueuer hourly, `period_start` = 1o dia do mes anterior, gerador `monthlyReportGenerator` (sonnet 4.6 + sumarizacao Haiku se bundle grande), `content` v2 com comparativos (mes -1/6m/12m) + variancia heuristica + leaks resolvidos/novos + progresso das metas. Geradores: helpers compartilhados em `server/services/reportGeneratorShared.ts`; `processReportJobsTick` despacha por `job.reportType`. `coach_lesson_recommendations` e `study_weekly_plans` continuam preenchidas pelo gerador (weekly + monthly; NAO daily — ADR-156). Ver `Docs/architecture/data-model-index.md` + ADR-155/156/157 + ADR-159/160/161 + `Docs/architecture/diagrams/coach-ai-1c/`.

### 6.1 Regra de fonte do historico (`tournaments` vs `session_tournaments`)

**`tournaments` = historico do jogador (dashboard / analytics / library).**
- Origens validas: importacao via `/upload` (CSV WPN/GG/Stars/Party/etc), ingest Sharkscope, planilhas, criacao manual via `/grade-planner` (AddTournamentWizard, sem `grindSessionId`).
- TODA query de dashboard, analytics, performance, library, ROI by platform, quick-stats DEVE filtrar `WHERE grind_session_id IS NULL`.
- Helpers `buildPeriodCondition` (storage.ts) ja injetam `isNull(tournaments.grindSessionId)` por padrao. Metodos com period inline (`getTournaments`, `getPerformanceByPeriod`, `getTournamentLibrary`, `getAnalyticsByModifier`) e queries inline em `routes/dashboard.ts` adicionam o filtro explicito.

**`session_tournaments` = registros de sessao /grind-live.**
- Visiveis APENAS dentro do detalhe da sessao (pagina /grind, GrindSessionLive, /api/session-tournaments, /api/grind-sessions/:id/tournaments) **+ no Daily Debrief** (AI-1C — o debrief pos-sessao usa `session_tournaments` da(s) sessao(oes) do dia para os numeros da sessao; a regra "§6.1 filtra `grind_session_id IS NULL`" aplica-se ao historico/dashboard/analytics, NAO ao detalhe da sessao). FX → USD antes de comparar (memory/feedback_grind_live_fx.md, lesson #6). O Monthly Report (AI-1C) usa o **historico** (`tournaments`, `grind_session_id IS NULL`), nao `session_tournaments`.
- NUNCA agregar em metricas de dashboard. Conversao para `tournaments` (com `grindSessionId` setado) so se / quando o jogador escolher "importar do historico" — e mesmo assim deve continuar excluido do dashboard porque a coluna `grind_session_id` permanece NOT NULL.

**Componentes obsoletos:** `client/src/components/SessionTracker.tsx` POSTa em `/api/tournaments` com `grindSessionId` setado. Esta morto (sem imports), mas existe — nao reutilizar sem revisitar a regra acima.

Diagramas: `Docs/architecture/data-model.mermaid`, `bankroll-index.md`, `addon-rea-index.md`, `ai-coach/`.

---

## 7. API Endpoints

173 endpoints em `server/routes/` (17 modulos).

**Indice rapido:** `Docs/api/endpoints-index.md`.
**Documentacao detalhada por endpoint:** `Docs/api/endpoints.md` + `coach.md`, `coach-tools.md`, `bankroll.md`, `wallets.md`.

**Principais grupos:** auth, dashboard/analytics, tournaments, tournament-library, planned-tournaments + weekly-plans, grind-sessions, upload-history, study-*, calendar-*, admin/*, subscription/*, notifications, bankroll/wallets, tournament-selector, coach, bug-reports.

**Coach AI — endpoints novos (AI-1B):** `GET /api/coach/timeline` (merge `reports` + `coach_nudge_log`, paginada — agora serve `reportType ∈ {'weekly','daily','monthly'}`), `GET /api/coach/reports/:id` (le um relatorio de **qualquer tipo** — `content` + `markdown`, marca `read_at`), `GET /api/coach/suggestions` (quick suggestions contextuais por rota — nao-LLM), `POST /api/coach/reports/:id/dismiss` (opcional). `GET/PUT /api/coach/preferences` estendidos (`reportWeeklyEnabled`, **`reportDailyEnabled`**, **`reportMonthlyEnabled`** [AI-1C — zod `.strict()` mantido], `nudgeBGapcheck`, `nudgeBImport`). Rota frontend `/coach-ai/relatorio/:id` (`ReportView` — generalizado de `WeeklyReportView`, renderiza weekly/daily/monthly). **AI-1C nao adiciona endpoint HTTP novo** — o Daily Debrief e enfileirado internamente via `handleUpdateGrindSession`; o Monthly via o enqueuer hourly. Tool nova p/ o LLM: **`bulk_query_dimensions`** (batching de `query_dimension` — ADR-160). Ver `Docs/api/coach.md` §"Sprint AI-1B" + §"Sprint AI-1C" e `Docs/api/coach-tools.md`.

---

## 8. Convencoes de Codigo

### Geral
- Nomes em ingles, UI em PT-BR.
- IDs via `nanoid()` (nunca auto-increment). User IDs: `USER-XXXX` (`userPlatformId`).
- Schemas Drizzle + `drizzle-zod` em `shared/schema.ts`.
- API responses: JSON direto, sem wrapper. Erros: `try/catch` com `console.error` + `res.status(4xx/5xx).json({ message })`.

### Frontend
- Functional components + hooks. Tailwind + `cn()` (clsx + tailwind-merge).
- Estado servidor: TanStack Query (`useQuery` / `useMutation`).
- Forms: React Hook Form + Zod resolvers.
- Roteamento: Wouter.
- Path aliases: `@/` = `client/src/`, `@shared/` = `shared/`, `@assets/` = `attached_assets/`.
- shadcn/ui pattern (Radix primitives + CVA).

### Backend
- Auth middleware: `requireAuth` (JWT), `requirePermission('name')`.
- Validacao Zod ANTES de operacoes (`schema.parse(req.body)`).
- Storage pattern: queries via `storage.ts`.
- Upload: Multer memory storage + `PokerCSVParser`.
- Rate limiting: `express-rate-limit` em auth/bankroll/coach.

### Redes de Poker no Parser (`server/csvParser.ts`)
WPN (Americas Cardroom, BlackChip), GGNetwork (GGPoker, Natural8), PokerStars, PartyPoker, 888poker, Bodog/Bovada, CoinPoker, Chico Network, Revolution Network, iPoker Network.

---

## 9. Erros Conhecidos da IA — Lessons Learned

Catalogo completo em `Docs/architecture/lessons-learned.md`. **Consultar antes de implementar feature similar.**

**TL;DR (top patterns que mais quebraram):**

1. **Hooks primeiro** — early return ANTES de hooks viola Rules of Hooks. Coloque return DEPOIS de todos os hooks.
2. **Tests com data-testid** — heuristicas DOM (`findByText` percorrendo) forcam workarounds em producao. Use `data-testid` estavel.
3. **Mocks idealizados** — sempre validar shape REAL do storage antes de mockar (Test Selector Sprint 1: 3 bugs CRITICAL passaram por mock idealizado).
4. **Vitest 4** — usar `test.projects` (nao `environmentMatchGlobs`) + `oxc.jsx` + polyfills Radix em `tests/setup.ts`.
5. **`vi.fn()` nao eh constructor** — para mockar SDK que usa `new`, env em try/catch com fallback.
6. **Conversao de moeda** — sempre normalizar para USD antes de comparar com thresholds USD.
7. **Schema deprecation gradual** — Zod `optional + default` + back-fill no storage (NAO required puro).
8. **Length de enum em test** — anti-pattern. Validar presenca individual, nao length absoluta.
9. **Try/catch generico engole erros** — logue antes de fallback. Distinga "no rows" de "DB explodiu".
10. **DRY de prompts** — divergencia silenciosa quebra cache da Anthropic. Extrair para arquivo unico.
11. **Default minimo em componentes** — spec eh fonte de verdade. Componentes "decorativos" NAO ganham acoes default.
12. **Estado persistente** — React Query cache (`setQueryData` + `enabled: false`) sobrevive a re-mount; `useState` local nao.
13. **`apiRequest` retorna JSON parseado, NAO Response** — ao migrar `fetch(url).then(r => r.json())` para `apiRequest(method, url)`, ja receba o objeto direto. Mocks de `apiRequest` em testes precisam retornar o JSON, nao um `{ ok, json: () => ... }`. Sprint UI-QW-1 RF-04: 2 testes Bankroll quebraram quando mock virou `vi.fn()` puro — fix: delegar ao `global.fetch` mock existente e chamar `.json()` no wrapper.
14. **`vi.mock` hoisting + TDZ em const spy** — `const x = vi.fn()` no top-level seguido de `vi.mock(mod, () => ({ key: x }))` quebra com "Cannot access 'x' before initialization" porque `vi.mock` eh hoisted antes do const init. Workaround canonico: `const { x } = vi.hoisted(() => ({ x: vi.fn() }))`. Diferente de `vi.mock(mod, () => ({ key: () => x() }))` que eh lazy (factory cria closure que so resolve em runtime). Sprint Bloco-A-Polish CompletionBridge fixou na red phase.
15. **Polyfill localStorage no setup.ts node env** — testes `.test.ts` rodam em `|server|` (node) que nao tem `localStorage`/`Storage.prototype`. Quando teste polish usa `vi.spyOn(Storage.prototype, ...)` ou `localStorage.setItem` precisa de polyfill in-memory. Sprint Bloco-A-Polish lessonHeroStorage: 11 testes quebraram ate adicionar `MemoryStorage` em `tests/setup.ts`.
14. **`require()` em testes `.tsx` nao funciona com deps ESM** — Sprint Biblioteca-2: TDD test files (.tsx) com `require('./Component')` em try/catch falham porque Node nao consegue `require()` ESM packages (`@tanstack/react-query`). Setup.ts adiciona resolver `.tsx` via esbuild transformSync, mas dependencias ESM ainda quebram. **Solucao:** test-writer deve usar `await import(...)` em vez de `require()` em testes que carregam componentes React. 32 testes Sprint Biblioteca-2 ficaram bloqueados por esse padrao (ArticleIframe, ArticleIframeWithWatermark, bloco-a-fullflow e2e).
15. **`vi.unmock` em escopo nested vira hoisted** — Sprint Biblioteca-2 e2e: `vi.unmock(...)` dentro de `it(...)` eh **hoisted** pelo Vitest e desfaz mock em **todos** os testes do arquivo (nao apenas o teste que escreveu). Vitest emite warning "will become an error in a future version". **Solucao:** mover pra top-level OU usar `vi.doUnmock(...)` (que NAO eh hoisted). Bloco-a-fullflow.test.ts: 6 testes falham por causa desse hoisting.
16. **DOMPurify `USE_PROFILES: { html: true }` sobrescreve `ALLOWED_TAGS`** — Sprint Biblioteca-2: profile vira **union**, nao restricao. Para allowlist custom rigorosa, NAO usar `USE_PROFILES`. Para tag `<style>` em allowlist, precisa `ADD_TAGS: ['style']` (nao basta `ALLOWED_TAGS`) porque DOMPurify v3 trata `<style>` como dangerous-by-default.
17. **Variavel `profile` colide em `home.ts`** — Sprint home-reform-1-5: declarei `const profile` apos ja existir `const profile = profileState as any` no mesmo escopo. oxc reporta "It can not be redeclared here" mas vitest nao captura ate run real. **Solucao:** renomeei para `playerProfile` + `playerProfileMeta` na nova adicao. Lesson generalizavel: ao estender route handlers grandes, `grep "const X"` antes de declarar variavel nova com nome generico.
18. **`git stash` em meio de implementacao perde test files novos** — Sprint home-reform-1-5: usei `git stash` para comparar baseline de testes que falham; ao popar, files novos dos testes (DailyInsight.test, LibraryResume.test) re-apareceram mas EmptyHomeOnboarding.test.tsx + NewsSlot.test.tsx (que tinham edits Onda 1.5) voltaram para versao Onda 1 (porque stash pop conflitou com TournamentCard.tsx). **Solucao:** evitar `git stash` durante TDD; usar branch separada OU rodar baseline de regressao em worktree. Custou ~20min de re-trabalho restaurando os tests.

19. **CTA targets devem casar com rotas Wouter registradas** — Sprint home-reform-4 Item 4: route handler gerou `/biblioteca/aulas/${lessonId}?...` mas Wouter so tem `/biblioteca/curso/:courseSlug/:lessonSlug[/play]`. Resultado: 404 silencioso quando user clica CTA (Wouter cai no <NotFound/>, sem erro de console). **Solucao:** ao construir target URL no backend, hidratar courseSlug+lessonSlug do storage (JOIN com tabela courses) + montar `/biblioteca/curso/${courseSlug}/${lessonSlug}/play?...`. Ao revisar handlers que constroem links, rodar `grep -n "Route path" client/src/App.tsx` pra confirmar a rota existe.

20. **Wirar hook em pagina certa: container vs componente real** — Sprint home-reform-4 Item 4 RF-07: hook `useCoachRecommendationConsume` precisa escutar `timeupdate` em `<video>`/`<audio>`, mas Mux Player encapsula video em web component (`<mux-player>`). Solucao: wrapper `useRef` no container `<div>` que envolve os panels + `useEffect` que faz `container.querySelector('video, audio, mux-player')` apos render e atribui ao mediaRef. Mux expoe `currentTime`/`duration`/`timeupdate` no nivel do custom element, entao tratar como HTMLMediaElement funciona. Lesson generalizavel: ao wirar hooks em players third-party, NAO assumir que o ref direto eh o media element; sempre query no container apos render.

21. **Cache server-side TTL precisa de invalidator publico chamado por mutations** — Sprint home-reform-4 Audit Round 2 (MEDIUM-8): adicionei `_cache: Map<key, {data, expiresAt}>` em focusStats service com TTL 30s. Mutations POST/DELETE precisam chamar `invalidateFocusStatsCache(userId)` apos commit do storage, senao UI fica vendo dado stale ate TTL expirar. Tambem expor `_resetForTests()` + chamar em `beforeEach` dos service tests senao runs subsequentes herdam mocks anteriores via cache. Para testes de tracker via `vi.fn()`, basta `vi.clearAllMocks()` mas para state interno (Map) precisa fn dedicada exportada com prefixo `_` (visivel pra test, sinaliza "nao use em runtime").

22. **`tokens.color.X` shape uniforme para swatches; `delta` precisa NS separado** — Sprint home-reform-4 Audit Round 2 (LOW-18 + MEDIUM-12 colateral): adicionei `tokens.color.delta = { positive, negative, neutral }` para KPIs verde/vermelho consistentes. Erro: `ColorKey = keyof Tokens['color']` automaticamente incluiu `'delta'`, quebrando `FilterChip` que faz `tokens.color[tone].bg/text/border` (delta nao tem bg/text/border). Solucao: declarar `ColorKey` literal (`'success' | 'danger' | ... | 'accent'` SEM `'delta'`) + export `DeltaTone = keyof Tokens['color']['delta']` separado. Lesson generalizavel: ao adicionar entries em record com shape heterogeneo, o type derivado nao reflete o subset esperado pelos consumers — restrict explicit literal type.

23. **Wouter v3 `<Link href><a>...</a></Link>` NAO duplica anchor** — Sprint home-reform-4 Audit Round 2 (HIGH-2): em Wouter v3, quando Link recebe um React element como child, ele transfere `href` + handlers para o child sem renderizar uma anchor extra. O padrao `<Link href="/x"><a className="...">label</a></Link>` esta CORRETO em v3. Em v2, Link renderiza sua propria anchor + child anchor → nested anchors invalidos. Verificar `package.json` antes de "fixar" — se >=3.0.0, deixar como esta. Apenas v2 precisa migrar pra `<Link href="/x">label</Link>` (sem anchor child).

24. **Branch switch implicito do harness durante long-running task** — Sprint News-3 implementer phase: estava implementando em `feature/news-3-rss-x-refactor` quando, pos-instalacao de deps via `npm install`, o harness automaticamente fez `git stash` e mudou pra `main` em algum momento (provavelmente checkout transparente entre comandos). Files novos viraram untracked + tests pararam de aparecer no Glob. Recovery: `git checkout feature/X` + `git stash pop`. Lesson: ao trabalhar em feature branch por muito tempo, `git status` periodicamente pra confirmar contexto. Auto-mode com tools paralelos pode trocar working dir/branch silenciosamente.

25. **Test-writer pode escrever exemplos com inconsistencia logica** — Sprint News-3 RF-03 titleFingerprint: teste "top 10 tokens — ignora tokens 11+" com `baseTokens` 10 tokens + adicao `lambda, mu, nu` esperando hash igual. Mas lambda/mu/nu sortam ANTES de theta/zeta alfabeticamente (l<m<n<t<z), entao top 10 muda — empurram theta/zeta pra fora. Test-writer comentou "tokens DEPOIS de kappa" (verdade tecnica isolada: l>k) mas ignorou que tambem sao < t, z. Implementer NAO pode modificar o teste; documentou no resumo + acceptable failure. Lesson generalizavel: quando teste falha por contradicao logica entre descricao e exemplo, documentar e seguir.

26. **Vitest 4 + `require()` em test .tsx para componente .tsx é impedimento técnico** — Sprint FX-1 RF-07: teste `FxRatesPanel.test.tsx` usa `require('../../components/settings/FxRatesPanel')` em `loadPanel()`. Vitest 4 com pool threads NAO passa `require()` síncrono pelo Vite transform pipeline; `Module._extensions['.tsx']` registrado em setup.ts NAO é invocado pelo runtime do Vitest. O componente é processado via vite/oxc internamente, mas para `require()` puro o resolver pega ESM resolution → erro `Cannot find package '@/lib'`. Reproduz lesson #14 (32 tests Biblioteca-2 idem). **Workaround tentado:** componente sem JSX (React.createElement) + alias resolver custom em setup.ts → ainda falha porque vitest resolver embebido tem precedência. **Solucao real:** test-writer deve usar `await import(...)` em vez de `require()` em testes de componentes React. Implementer NAO pode modificar testes — documentar como impedimento e seguir. FX-1: 86/86 testes server passam, 9 FxRatesPanel falham por essa limitação.

27. **Radix Tabs reage a `onMouseDown`, NAO `onClick` — RTL `fireEvent.click` nao alterna value** — Sprint coach-page-reform-1 RF-01: testes em `CoachTabs.test.tsx` fazem `fireEvent.click(tabTrigger)` esperando que o conteudo da aba alvo apareça. Radix `<TabsTrigger>` (v1) registra apenas `onMouseDown` + `onKeyDown(' '|Enter)` + `onFocus` para chamar `context.onValueChange`. RTL `fireEvent.click` dispara apenas o evento `click`, nao `mousedown`. **Solucao:** passar `onClick={() => setActiveTab(value)}` redundante em cada `<TabsTrigger>` quando o componente eh controlado (`value` + `onValueChange`). Mantem comportamento Radix nativo (mousedown) + cobre `fireEvent.click` em testes RTL. Para testes que querem disparar mousedown, usar `userEvent.click` (simula mousedown+mouseup+click).

28. **`vi.mock` por path: mock so intercepta o EXATO caminho do import** — Sprint coach-page-reform-1: teste `CoachTabs.test.tsx` faz `vi.mock('@/components/grade-planner/SelectorPanel', ...)` mas GradePlanner importava de `@/components/tournament-selector/SelectorPanel`. Mock NAO intercepta — paths diferentes resolvem para arquivos diferentes mesmo com aliases. **Solucao:** criar shim/re-export em `@/components/grade-planner/SelectorPanel.tsx` que re-exporta de `@/components/tournament-selector/SelectorPanel` + atualizar GradePlanner para importar do shim. Padrao generalizavel: quando teste mock-a um componente em path X mas codigo importa de path Y, criar re-export em X. Aplicavel tambem a `CellChip.tsx` (re-export de `WeekGrid.tsx`) quando test isola componente interno.

29. **Sub-arvore com `useQuery` sem `QueryClientProvider` ou-isolar via ErrorBoundary** — Sprint coach-page-reform-1 RF-07.2: teste `sidebar-flight-link.test.tsx` renderiza `<Sidebar />` sem `QueryClientProvider`; Sidebar usa `useQuery` internamente para badge de spots — TanStack v5 lança "No QueryClient set" hard error. Tentativa 1 (ler `QueryClientContext` no parent + render condicional do filho fetcher) quebra outros testes que mockam `@tanstack/react-query` parcialmente (sem export de `QueryClientContext`). **Solucao final:** extrair fetcher como sub-componente, encapsular numa `ErrorBoundary` minima local; quando ErrorBoundary captura, badge fica null silenciosamente. Padrao generalizavel: quando uma feature secundaria (badge, indicador, tracking) usa `useQuery` mas o componente parent precisa renderizar em testes standalone, isole via ErrorBoundary local. Lesson auxiliar: NAO importar contextos internos do TanStack (`QueryClientContext`) — facil quebrar mocks parciais que so exportam `useQuery`.

30. **Hook test em `.test.ts` precisa de jsdom — vitest config adicional** — Sprint coach-page-reform-1: `tests/hooks/useTabFromUrl.test.ts` usa `renderHook` de `@testing-library/react` que requer `document` (jsdom). Convencao default: `.test.ts` roda no projeto `server` (node). **Solucao:** ampliar config — exclude `tests/hooks/**/*.test.ts` do projeto server + include no projeto client (jsdom). Config-level fix, NAO mudanca em teste. Aplicavel sempre que hook test usa renderHook/RTL; arquivos `.test.ts` para puro `pg`/`node` continuam no projeto server.

31. **`*/` em comentario JSDoc fecha o bloco prematuramente** — Sprint coach-page-reform-1: comment em `tests/hooks/useTabFromUrl.test.ts` linha 24 tinha `tests/**/*.test.ts` que contem `*/` (em `**/`), fechando o JSDoc bloco. oxc parser reportou "Unexpected token" em `.test.ts no` apos. **Solucao:** evitar `*/` literal em comentarios — substituir por `tests glob` ou escapar. Lesson generalizavel: ao escrever comentarios JSDoc com path patterns, evitar sequencia `*/`. Implementer pode corrigir typo de sintaxe que impede compilacao (excecao a regra "nao modificar testes").

32. **`db.transaction` quebra em testes que mockam `storage` mas nao `db`** — Sprint stats-themes-linking-1 round 2: handler `handlePatchHudLayoutWithLinkedThemes` envolveu 3 ops (updateHudLayout + appendStatToThemes×N + removeStatFromThemes×N) em `db.transaction(...)` para HIGH-3 atomicity. Testes integration mockam `storage.*` por completo, mas NAO mockam `../../server/db`. Quando handler chama `db.transaction()`, o `db` real (importado mas sem DATABASE_URL no env de teste) eh `undefined` ou explode com `transaction is not a function`. **Solucao:** detection runtime — `const txAvailable = db && typeof db.transaction === "function"; if (txAvailable) { await db.transaction(runner) } else { await runner(undefined) }`. Storage helpers aceitam `tx` como ultimo arg opcional; quando `tx` undefined NAO eh passado pra preservar aridade que tests inspecionam via `mock.calls[i][last]`. Lesson generalizavel: handlers que ganharam `db.transaction` posterior precisam fallback gentil quando db nao esta inicializado (testes); aceitar `tx?: any` no storage e nao passar quando undefined.

33. **JSONB array element remove NAO usa `jsonb - text` (so funciona em jsonb objects)** — Sprint stats-themes-linking-1 HIGH-4: refactor `removeStatFromThemes` para batch atomico. `jsonb_object - 'key'` remove key, mas `jsonb_array - 'value'` NAO funciona em PG 16 (cast invalido). **Solucao:** `COALESCE((SELECT jsonb_agg(elem) FROM jsonb_array_elements_text(linked_stats) elem WHERE elem <> $1), '[]'::jsonb)`. Append idempotente eh mais simples: `CASE WHEN linked_stats @> ${[v]}::jsonb THEN linked_stats ELSE linked_stats || ${[v]}::jsonb END`. Pattern util sempre que mantiver array de strings/ids em jsonb com CRUD atomico.

34. **Storage abstraction injetado vs lazy import — handler de routes deve aceitar terceiro arg** — Sprint coach-launch-fix wave 2 RF-04.4 + RF-02 + RF-14: ao escrever handlers novos em routes/coach.ts (handleGetCoachLimits, handle*Feedback, handleGetCostMetrics) test-writer mocka storage e passa como 3o arg. Padrao: `export async function handleX(req, res, injectedStorage?)`. Em producao, se `injectedStorage` undefined, faz lazy `await import('../storage')`. Permite teste mockar storage por composicao sem precisar mockar o modulo inteiro. Aplicar tambem ao definir route registration: `app.get('/api/foo', requireAuth, async (req, res) => { await handleX(req, res); })` — handler sem 3o arg em prod usa fallback. Lesson generalizavel para qualquer endpoint novo testavel via vitest sem `vi.mock('../storage')`.

35. **`new vi.fn()` em strict mode quebra em mocks de SDK Anthropic** — Sprint coach-launch-fix wave 2: handler tem `const Anthropic = (await import('@anthropic-ai/sdk')).default; const client = new Anthropic(...)`. Mock `vi.fn().mockImplementation(() => ({...}))` retorna arrow function que NAO eh `new`-callable em strict ESM. Resultado: throw silencioso engolido pelo try/catch, stream nunca chamado, mockStreamInvocations vazio. **Solucao:** envolver `new Anthropic(...)` em try/catch com fallback para chamada direta como factory `Anthropic(...)`. Cobre producao (precisa `new`) + tests (mock retorna obj direto). Reproduz lesson #5 mas vale documentar especifico do Anthropic SDK pois eh recorrente.

36. **Modulo de storage que mocka `drizzle-orm` parcialmente NAO pode importar `@shared/schema` no topo** — Sprint AI-1A: `aiStructuredProfile.test.ts` faz `vi.mock('drizzle-orm', () => ({ eq, and, sql }))` (sem `relations`). Como `@shared/schema.ts` faz `import { relations, sql } from "drizzle-orm"`, qualquer modulo que `import { users } from "@shared/schema"` no topo quebra ("No 'relations' export") nesse contexto de teste — o modulo todo falha ao carregar. **Solucao:** o modulo de storage NAO importa `@shared/schema` no topo; carrega a tabela `users` lazy (`await import("@shared/schema")` dentro da funcao, com fallback para um placeholder `{ userPlatformId: {...} }` quando o import falha — o mock do `db` ignora os args de `.from()`/`.where()`, entao o placeholder basta). O tipo `AiStructuredProfile` foi re-declarado local (type-only, erased). Lesson generalizavel: storage modules unitariamente testados com `db` mockado + `drizzle-orm` mockado parcialmente precisam de `@shared/schema` lazy + fallback.

37. **`cronRunner` precisa de `import` estatico de `node-cron` (nao `require`) para `vi.doMock` funcionar em Vitest 4** — Sprint AI-1A: `cron-kill-switch.test.ts` faz `vi.doMock('node-cron', ...)` + `startCoachCrons()` sincrono. O codigo legado fazia `cron = require("node-cron")` dentro de `startCoachCrons` — em Vitest 4 (rolldown/oxc) esse `require` NAO passa pelo module runner mock-aware; pega o `node-cron` real, `scheduled` fica vazio. `await import("node-cron")` resolveria o mock mas tornaria a funcao async (o teste chama sync). **Solucao:** `import nodeCron from "node-cron"` estatico no topo (`node-cron` eh dep de producao, sempre presente — sem risco de quebra de import). Lesson generalizavel: para mockar um modulo CJS via `vi.doMock` em codigo que usa `require()` runtime, migrar para `import` estatico (se a dep eh garantida) ou `await import()` (se async eh aceitavel).

---

## 10. Roadmap & Status

**Em foco (2026-04-24+):** Tournament Selector (Sprint 1+2) + Bankroll Management (Sprint 1, 2, 2.1, 3). Sprints 3 e 4 originais cancelados — ver `memory/roadmap_pivot_2026-04-24.md`.

**Crons aposentados (AI-1B, ADR-156):** `generateCoachRecommendations` (segunda 6h BRT) e `generateWeeklyStudyPlan` (segunda 9h UTC) tiveram o **agendamento desligado** — absorvidos pelo Weekly Report. As tabelas `coach_lesson_recommendations` e `study_weekly_plans` continuam preenchidas pelo gerador do report (chaves de semana mantidas — BRT pra rec, UTC pro plano — back-compat com `/inicio` cards + `StudyWeeklyPlanCard`). Trade-off: Free perde a rec de lesson automatica semanal (rec via chat / tool `recommend_lesson` on-demand; follow-up "cron leve pra todos" documentado se inaceitavel).

**Pendencias tecnicas conhecidas:**
- `0.0.0.0` hardcoded no server (baixa prioridade).
- Endpoints `/api/test/*` pendentes de remocao em producao.
- Adicionar MSW para testes de integracao do Coach (CSRF, refresh, redirect 401).
- AI-1C: Daily Debrief + Monthly Report + tier gating estrito + sumarizacao hierarquica Haiku→Sonnet + tool batching + follow-ups — arquitetura+ADRs (159/160/161) prontos (`Docs/specs/sprint-ai-1c.md` + `Docs/architecture/diagrams/coach-ai-1c/`), migracao 0068; **proximo = test-writer → implementer**. Variancia mensal ainda heuristica (`getVarianceVsExpected` retorna `null` — TODO PrimeDope AI-2A).
- Plano de IA — Fase 1 (AI-1A/1B + AI-1C arquitetado): Fase 2 = AI-2A (write tools grade/estudo + tools diagnostico + nudges B-DOWNSWING/B-VOLUME/B-GRADE) → AI-2B (carreira + Quarterly Review + mental via warm-up + email). Ver `memory/ai_agents_improvement_plan_2026-05-11.md`.

**Issues resolvidas:** ver git log + `Docs/specs/` (specs por sprint). Cleanup historico de Replit em commits de 2026-03-19/20.

---

## 11. Workflow de Agentes

Pipeline TDD padronizado:

```
pm-spec → system-architect → test-writer → implementer → reviewer → (deployer opcional)
```

- **pm-spec** — gera spec estruturada antes de qualquer feature nova.
- **system-architect** — diagrama Mermaid + ADR antes de escrever testes.
- **test-writer** — testes TDD red-phase. Nunca implementa.
- **implementer** — green phase. Nunca modifica testes.
- **reviewer** — antes de merge. Identifica bugs/seguranca/performance.
- **deployer** — apenas quando founder pedir explicitamente (ver `memory/deploy_strategy_2026-04-24.md`).

Times configurados em `.claude/teams/` (5 times: feature cross-layer, review multi-perspectiva, refatoracao, debug paralelo, sprint documentacao).

---

## 12. Quando Carregar Cada Doc

| Tarefa | Carregar |
|--------|----------|
| Implementar feature do Coach | `Docs/api/coach.md` + `Docs/architecture/lessons-learned.md#coach` |
| Implementar feature do Bankroll | `Docs/architecture/bankroll-index.md` + `Docs/api/bankroll.md` + `wallets.md` |
| Tournament Selector / scoring | `Docs/specs/tournament-selector.md` + `Docs/architecture/decisions/015-scoring-linear-vs-ml.md` + `lessons-learned.md#bankroll-ts` |
| Escrever testes (vitest 4 / RTL) | `Docs/architecture/lessons-learned.md#testing` (sempre, antes de tocar em test config) |
| Schema novo / migracao | `data-model-index.md` + ADRs relevantes + `lessons-learned.md#schemas` |
| Endpoint novo | `endpoints-index.md` para descobrir grupo + `endpoints.md` para padrao de doc |
| Padronizacao UI / componente novo / decisao visual | `Docs/conventions/ui-patterns.md` (sempre) + `tokens` em `@/lib/ui-tokens` |
| Decisao arquitetural | criar ADR em `Docs/architecture/decisions/` (numerado, formato Michael Nygard) |

---

## 13. Contrato de Autonomia

Founder liberou autonomia para acoes reversiveis e baratas. Regra:

> **Reversivel + barato = faco. Visivel a outros + irreversivel + caro = pergunto.**

### Faco direto (sem perguntar)
- Invocar `/simplify` pos-implementer (antes de reviewer)
- Spawn de subagentes do pipeline TDD ja iniciado (test-writer → impl → reviewer)
- Invocar `claude-api` ao mexer SDK Anthropic / Coach
- `/session-report` ao fim de sessao >50k tokens
- Compactar memory files >5k apos sessao longa
- Atualizar `_shared/conventions.md` quando padrao repete
- Criar hook via `hookify` quando comportamento repete 3x (proponho + crio se ok simples)
- Read-only ops (Glob, Grep, Read, git status/log/diff)
- Edit/Write em codigo/docs (hooks ja gated)
- Bash de testes/build/typecheck (`npm run check`, `npx vitest`, etc)

### Sempre pergunto
- Deploy / `deployer` agent (memory rule + irreversivel)
- `git push` (compartilha estado)
- `db:push` em producao (irreversivel)
- Editar `package.json` deps (afeta build)
- `/claude-md-management:revise-claude-md` (mudanca grande no CLAUDE.md)
- `git rebase`, `reset --hard`, `branch -D` (ja no warn-destructive hook)
- ADR novo / decisao arquitetural significativa
- Schema migration grande
- Mudancas em tests legados (risco de quebra silenciosa)

### Auto-clarifico (caveman drop) em
- Confirmacoes de acoes destrutivas
- Avisos de seguranca
- Sequencias multi-step onde fragmento confunde
