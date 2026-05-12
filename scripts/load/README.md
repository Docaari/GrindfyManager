# Load test — Fase 3 Wave G

Valida que a plataforma aguenta ~100 usuarios concorrentes sem degradar, depois das otimizacoes das Waves A-F (DB indexes, query fixes, pool tuning, cron locks, home-overview cache, frontend bundle split).

Ferramenta: [`autocannon`](https://github.com/mcollina/autocannon) (devDep, lightweight, zero CVE adicional — `artillery` foi rejeitado por trazer 12 vulns critical).

## Pre-requisito CRITICO

1. **Codigo novo** — o servidor precisa estar rodando Waves A-F merged. O dev server padrao (`npm run dev`) na porta 3000 pode estar rodando codigo velho — restart antes.
2. **Bypass do rate limit** — o `apiRateLimit` global eh 1000 req / 15 min por IP. Um load test de 30s a ~8000 req/s = 240k reqs, estoura na hora. Setar `LOADTEST_BYPASS_RATELIMIT=true` ao subir o server (gated por env, nunca ativo em prod).

```bash
# Opcao 1 — dev server (Vite HMR, mais pesado, OK pra smoke)
LOADTEST_BYPASS_RATELIMIT=true npm run dev          # porta 3000

# Opcao 2 — prod build (recomendado pra numero confiavel)
npx vite build
npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
LOADTEST_BYPASS_RATELIMIT=true NODE_ENV=production node dist/index.js
```

Sem o bypass, os cenarios autenticados vao mostrar ~263 respostas 2xx + resto 429 — nao eh degradacao real, eh o rate limiter funcionando.

## Rodar

```bash
# Todos os cenarios (health, ready, home, dashboard, library)
node scripts/load/run-loadtest.mjs

# Um cenario so
node scripts/load/run-loadtest.mjs --scenario=home

# Server em outra porta
BASE_URL=http://localhost:3001 node scripts/load/run-loadtest.mjs
```

### Auth

Cenarios `home`, `dashboard`, `library` precisam de JWT. O script gera um automaticamente: le `DATABASE_URL` + `JWT_SECRET` de `.env`, pega o primeiro usuario ativo do DB, assina um token `access` (30min). Override com `LOADTEST_TOKEN=<token>`.

Se `DATABASE_URL`/`JWT_SECRET` ausentes -> cenarios autenticados sao pulados (so `health` + `ready` rodam).

## Cenarios

| Cenario | Endpoint | Conexoes | Duracao | Auth |
|---|---|---|---|---|
| `health` | GET /api/health | 50 | 10s | nao |
| `ready` | GET /api/ready (DB ping) | 30 | 10s | nao |
| `home` | GET /api/home/overview (~20 subqueries fanout) | 100 | 30s | sim |
| `dashboard` | GET /api/dashboard/quick-stats | 100 | 20s | sim |
| `library` | GET /api/tournament-library | 50 | 20s | sim |

## Budget (pass/fail)

O script marca `[!]` e exit code 1 quando algum cenario:
- p95 latency > 2000ms
- qualquer resposta non-2xx
- qualquer erro de socket
- qualquer timeout

Senao: `[OK]` exit code 0.

## TODOs (cenarios pesados, fora do escopo deste script)

- **Upload stress** (50 CSVs simultaneos) — precisa fixtures de CSV multipart + multer; recomendado usar autocannon `requests` array com body customizado, ou um script dedicado.
- **Coach 20 conversas paralelas** — precisa mock do Anthropic SDK ou modo dry-run (`COACH_MODEL=` vazio?) pra nao queimar tokens reais.

## Tuning conhecido (DB_POOL_MAX)

Pool default `max:25` (server/db.ts, Wave C). Se o cenario `home` mostrar p95 alto + `timeouts`, aumentar:

```bash
DB_POOL_MAX=40 NODE_ENV=production node dist/index.js
```

Re-rodar e comparar. Em prod multi-replica, lembrar do caveat do endpoint Neon `-pooler` (ADR-144).
