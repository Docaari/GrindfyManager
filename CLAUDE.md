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

Diagramas: `Docs/architecture/data-model.mermaid`, `bankroll-index.md`, `addon-rea-index.md`, `ai-coach/`.

---

## 7. API Endpoints

173 endpoints em `server/routes/` (17 modulos).

**Indice rapido:** `Docs/api/endpoints-index.md`.
**Documentacao detalhada por endpoint:** `Docs/api/endpoints.md` + `coach.md`, `coach-tools.md`, `bankroll.md`, `wallets.md`.

**Principais grupos:** auth, dashboard/analytics, tournaments, tournament-library, planned-tournaments + weekly-plans, grind-sessions, upload-history, study-*, calendar-*, admin/*, subscription/*, notifications, bankroll/wallets, tournament-selector, coach, bug-reports.

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

---

## 10. Roadmap & Status

**Em foco (2026-04-24+):** Tournament Selector (Sprint 1+2) + Bankroll Management (Sprint 1, 2, 2.1, 3). Sprints 3 e 4 originais cancelados — ver `memory/roadmap_pivot_2026-04-24.md`.

**Pendencias tecnicas conhecidas:**
- `0.0.0.0` hardcoded no server (baixa prioridade).
- Endpoints `/api/test/*` pendentes de remocao em producao.
- Adicionar MSW para testes de integracao do Coach (CSRF, refresh, redirect 401).

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
