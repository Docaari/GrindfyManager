# Sprint Deploy-Readiness — Production Launch Spec

> **Status:** SPEC ONLY — sem deploy executado. Founder executa o checklist (`deployment-checklist.md`) quando decidir subir.
> **Owner:** founder (single dev).
> **Cap:** 12h MVP de deploy. Sem over-engineering.
> **Branch:** `main` @ `6150a716`.
> **Memory canonica anterior:** `memory/deploy_strategy_2026-04-24.md` (28d, defer-until-mature — agora superada por este spec).

---

## 1. Objetivo

Subir Grindfy Manager em producao acessivel via `https://app.grindfy.com` (ou `https://grindfy.net` — founder decide DNS):
- SPA React + API Express servida pelo mesmo processo Node (single-tier).
- Postgres serverless gerenciado (Neon).
- Webhooks externos (Mux + Stripe) chegando em endpoints HTTPS validos.
- Crons in-process com advisory lock (single-instance ok no MVP).
- Observabilidade minima (logs estruturados via stdout do provider + `/api/ready`).

Nao-objetivo MVP: multi-region, CDN dedicado pra assets (Mux ja CDN-nativo), Redis dedicado, blue/green, canary, autoscaling > 1 replica.

---

## 2. Arquitetura Alvo

```
┌────────────────────────────────────────────────────────────────┐
│                  Cloudflare DNS (proxied opcional)             │
│             app.grindfy.com  ─────►  Render web service        │
└────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┴───────────────┐
                ▼                               ▼
   ┌────────────────────────┐    ┌──────────────────────────────┐
   │ Render Web Service     │    │ Neon Postgres Serverless     │
   │ (Docker, 1 instance)   │◄──►│ branch: main, region: us-east│
   │ Node 20 + Express      │    │ PITR habilitado              │
   │ serve SPA + API + cron │    └──────────────────────────────┘
   │ /api/health (liveness) │
   │ /api/ready  (DB check) │           ┌─────────────────────┐
   │ /api/mux/webhooks      │◄──────────│ Mux (video + VTT)   │
   │ /api/webhooks/stripe   │◄──────────│ Stripe (pagamentos) │
   │ /api/audio/spotify/... │◄──────────│ Spotify OAuth       │
   └────────────────────────┘           └─────────────────────┘
```

**Single-tier:** o mesmo processo Node serve:
1. SPA estatico (Vite build → `dist/public/`).
2. API REST (`/api/*`).
3. Crons in-process (coach nudges, report job runner, transcription, FX, news, advisory-lock-guarded).
4. Webhook receivers (Mux + Stripe).

**Por que single-tier no MVP:**
- Founder e o unico dev. Cap 12h. Reduz superficie operacional.
- Crons com `pg_try_advisory_lock` (ver `server/lib/advisoryLock.ts` + ADR-144) ja sao seguros pra escalar pra 2+ replicas no futuro sem refator.
- Mux/Spotify webhooks ja idempotentes (HMAC + estado em DB).

---

## 3. Provedores Recomendados

| Componente            | Provedor       | Plano sugerido        | Por que                                                              |
| --------------------- | -------------- | --------------------- | -------------------------------------------------------------------- |
| Web app (Node)        | **Render**     | Starter ($7/mes)      | Dockerfile + render.yaml ja prontos; healthcheck nativo; autoDeploy. |
| Postgres              | **Neon**       | Free ou Launch ($19)  | Serverless, branching, PITR no plano pago; ja documentado CLAUDE.md. |
| DNS + SSL             | **Cloudflare** | Free                  | Proxied opcional (DDoS + cache); SSL "Flexible" basta apontar.       |
| Object storage spots  | Local disk     | (defer S3)            | `SPOT_IMAGE_STORAGE_BACKEND=local`; volume Render persistente.       |
| Video assets          | **Mux**        | Pay-as-you-go         | Ja integrado (`@mux/mux-node`); CDN/transcoding gerenciado.          |
| Email transacional    | **Gmail SMTP** | App Password gratis   | Suficiente <500 emails/dia; Mailgun/SendGrid se escalar.             |
| Pagamentos            | Stripe         | (defer ate cobrar)    | Codigo preparado; ativar so quando founder quiser cobrar.            |

**Alternativas descartadas:**
- Railway / Fly.io: equivalentes mas Render ja tem `render.yaml`.
- Vercel: SPA-friendly mas crons in-process + webhooks raw body + persistente disk forcam workaround.
- AWS/GCP: over-engineering pra MVP single-dev.

---

## 4. DNS + SSL

**Setup recomendado (Cloudflare proxy = DNS-only no MVP, pra evitar duplo SSL):**

1. Founder compra `grindfy.com` (ou usa `grindfy.net` ja registrado).
2. Em Cloudflare: criar zona, mover NS do registrar.
3. Adicionar `A`/`CNAME` para `app.grindfy.com` apontando pra `<servico>.onrender.com` (CNAME).
4. **Proxied = OFF** (DNS-only) no MVP — deixa Render gerenciar SSL nativamente.
5. Render auto-emite Lets Encrypt em ~5min apos DNS propagar.

**Por que DNS-only inicial:**
- Render webhook handlers leem raw body (Mux HMAC). Cloudflare proxy pode injetar overhead de transform. Evitar dor inicial.
- Quando founder quiser DDoS protection / cache estatico, ligar Proxied + configurar "Page Rules" pra bypass em `/api/*`.

**Validar:** `curl https://app.grindfy.com/api/health` retorna `{status:"ok"}`.

---

## 5. Cron Jobs em Producao

**Single instance + advisory lock** (`server/lib/advisoryLock.ts`):

Todos crons rodam in-process em `server/index.ts` via `node-cron`, envolvidos em `withAdvisoryLock("cron:<nome>", fn)`. Quando founder eventualmente escalar pra 2+ replicas Render, **zero refactor** necessario — `pg_try_advisory_lock` garante mutex cross-instance.

| Cron                              | Schedule (UTC)         | Lock key                   |
| --------------------------------- | ---------------------- | -------------------------- |
| FX PTAX refresh                   | `0 * * * *`            | `cron:fx-rates`            |
| Report job enqueuer (W/M/Q)       | `0 * * * *`            | `cron:report-enqueuer`     |
| Report job processor              | `*/15 * * * *`         | `cron:report-processor`    |
| Coach B-SNAPSHOT/B-STUDY/B-GAPCHK | varios (CLAUDE.md §4)  | `cron:coach-*`             |
| Coach B-IMPORT                    | hourly                 | `cron:coach-b-import`      |
| Transcription poll (Mux fallback) | `*/10 * * * *`         | `cron:transcription-poll`  |
| News refresh (kill-switch)        | `*/30 * * * *`         | `cron:news-refresh`        |
| Tickets expire                    | `0 3 * * *`            | `cron:expire-tickets`      |
| Suprema autosync                  | varios                 | `cron:suprema-*`           |

**Kill switch global:** `COACH_NUDGES_ENABLED=false` desliga toda a proatividade do Coach (nudges + reports + gap-check + B-IMPORT + Daily Debrief event-driven). Ver CLAUDE.md §4.

**Pendencia: nada.** Codigo ja roda local com mesma config.

---

## 6. Webhook Endpoints Expostos

| Endpoint                       | Metodo | Origin externa | Auth                                       | Body parsing       |
| ------------------------------ | ------ | -------------- | ------------------------------------------ | ------------------ |
| `/api/health`                  | GET    | (probe)        | publico                                    | -                  |
| `/api/ready`                   | GET    | (probe)        | publico                                    | -                  |
| `/api/mux/webhooks`            | POST   | Mux            | HMAC SHA-256 via `MUX_WEBHOOK_SECRET`      | `express.raw`      |
| `/api/webhooks/stripe`         | POST   | Stripe         | Signature via `stripe.webhooks.constructEvent` | `express.raw` |
| `/api/audio/spotify/oauth-callback` | GET | usuario (browser) | state nonce + PKCE                         | query string       |

**Replay protection Mux:** 5min window (ver `server/routes/muxWebhooks.ts`).
**Stripe:** ainda nao ativo em prod (cobranca defer). Endpoint existe, secret a configurar quando ativar.
**Spotify callback URL:** o **server** lida em `/api/audio/spotify/oauth-callback` (RF-01.1 ADR-190). O path `/spotify-callback` (SPA) e fallback historico. Registrar **ambos** no Spotify Developer Dashboard pra cobrir ambas formas.

---

## 7. Static Assets Serving

`vite build` gera:
- `dist/public/` — SPA estatica (HTML + JS chunks + CSS).
- `dist/index.js` — bundle do servidor (esbuild ESM).

Em prod (`NODE_ENV=production`), `server/index.ts` serve `dist/public/` via `express.static` antes do middleware 404. SPA fallback rewrites `/*` → `index.html` (excluindo `/api/*`).

**Cache headers:** assets com hash longo (Vite default) ja imutaveis; HTML servido sem cache forte (`Cache-Control: no-cache`).

**Pendencia:** se HTML voltar cacheado em browser stale apos deploy, conferir middleware em `server/vite.ts` (modo prod).

---

## 8. SSR vs SPA

**SPA-only.** Sem SSR/SSG. Wouter no client. SEO nao e prioridade MVP (produto e SaaS logado).

---

## 9. Observability

**Logs:** stdout/stderr capturado nativamente pelo Render. Acessivel via Render Dashboard → Service → Logs. Format atual e linha-por-linha plana — suficiente pro MVP. Se escalar, migrar pra `pino` + JSON estruturado.

**Health probes:**
- Liveness: `GET /api/health` → `{status:"ok"}` (sem DB).
- Readiness: `GET /api/ready` → 200 se DB respondeu < 2s, senao 503.

**Render config (`render.yaml`):** `healthCheckPath: /api/health`. Render usa pra deploy gating + restart loop. Setar UptimeRobot/Better Uptime em `/api/ready` pra alertar quando DB cair.

**Error tracking:** **defer pos-MVP.** Pode usar Sentry free tier futuramente — sem urgencia.

**Metrics:** **defer.** Coach ja tem `coach_token_telemetry` + admin endpoint de cost metrics (`/api/admin/coach/report-cost-metrics`).

---

## 10. Backup Strategy

**Neon PITR (Point-In-Time Recovery):**
- Free tier: 24h retention.
- Launch tier ($19): 7 dias.
- Habilitar **explicitamente** no Neon Console (Project → Settings → History retention). Default Free ja inclui 24h.

**Backup manual periodico (opcional):**
- `pg_dump` semanal via cron externo (GitHub Action scheduled) salvando em S3 ou Backblaze B2.
- **Defer pos-MVP** — PITR Neon ja cobre 99% dos cenarios.

---

## 11. Rollback Strategy

**Deploy ruim (codigo):**
1. Render Dashboard → Service → Deploys → escolher deploy anterior verde → "Redeploy".
2. Render mantem ~10 deploys recentes por padrao.
3. Tempo: ~3min ate trafico voltar pra versao boa.

**Migration ruim (schema):**
1. Cada migration `0075..0080` tem `_rollback.sql` correspondente.
2. Ordem inversa via psql: `0080_rollback → 0079_rollback → ...`.
3. **Avisar founder:** rollback de schema **NUNCA** e seguro se houve INSERT/UPDATE na coluna nova. Sempre snapshot via `pg_dump` (`pg_dump --schema-only` + `pg_dump --data-only -t <tabela>`) ANTES de rodar migration.

**Disaster recovery (banco corrompido):**
1. Neon Console → Branches → "Reset from time" (PITR) → escolher timestamp pre-incidente.
2. Atualizar `DATABASE_URL` no Render se Neon mudar o branch endpoint.

---

## 12. Bloqueadores Identificados (pre-deploy)

1. **Migrations 0075..0080 nao aplicadas em prod.** Cron `expireTicketsTick` quebra runtime sem `notifications.deep_link` (CLAUDE.md §6). Aplicar em ordem (rollback files ja existem).
2. **`render.yaml` envVars incompletas.** Listar `ANTHROPIC_API_KEY`, `SPOTIFY_*`, `MUX_*`, `BASE_URL` etc. — ver `env-vars-prod.md` completo. Atualizar `render.yaml` antes do primeiro deploy.
3. **Disco persistente no Render.** Plano Starter Render **nao tem disco persistente** (filesystem reseta a cada deploy). Spots uploads (`SPOT_IMAGE_STORAGE_BACKEND=local`) **perdem-se** entre deploys. **Decisao founder:** ou migrar pra plano com disco ("Pro" $25/mes com 10GB persistent disk), ou implementar S3 backend (ADR-057), ou aceitar perda em deploy (spots viram historico volatil).
4. **`SPOTIFY_REDIRECT_URI` precisa registro duplo.** `/api/audio/spotify/oauth-callback` (server, canonico) + `/spotify-callback` (SPA, historico fallback). Registrar **ambos** no Spotify Dashboard senao login Spotify falha em prod.
5. **`BASE_URL` e usado em emails (links unsubscribe HMAC, reset password etc).** Tem que setar antes do primeiro envio de email senao links sairem `undefined`.
6. **CI nao roda testes filtrados.** Atual `npm test` roda **tudo** — incluindo flakies. Update sugerido em `.github/workflows/ci.yml` (ver §13).
7. **Docs/deploy/RENDER_DEPLOYMENT_INSTRUCTIONS.md + RENDER_QUICK_DEPLOYMENT.md sao Replit-era (38 tables, FK reconstruction).** **Stale.** Renomear pra `_archived/` antes de usar este novo spec como canonico — evita founder seguir o doc errado.

---

## 13. CI (`.github/workflows/ci.yml`) — Status

Existe basico (typecheck + test + security + build). Funciona como gate pre-merge mas:
- `npm test` roda **toda** a suite (~9000 testes); CI fica ~10min.
- Sem split entre unit/integration.
- Sem caching de Vite build artifact.

**Suficiente pro MVP.** Otimizar quando dor virar real.

---

## 14. Artefatos ja Existentes no Repo

| Path                                              | Status                                | Acao                                                  |
| ------------------------------------------------- | ------------------------------------- | ----------------------------------------------------- |
| `Dockerfile`                                      | OK (multi-stage, non-root, healthcheck) | Manter.                                             |
| `render.yaml`                                     | Incompleto (envVars faltam ~12 keys)  | Atualizar antes do deploy (ver `env-vars-prod.md`).   |
| `.github/workflows/ci.yml`                        | OK basico                             | Manter.                                               |
| `Docs/deploy/RENDER_DEPLOYMENT_INSTRUCTIONS.md`   | Stale (Replit-era, 38 tables)         | Mover pra `Docs/deploy/_archived/`.                   |
| `Docs/deploy/RENDER_QUICK_DEPLOYMENT.md`          | Stale (Replit-era)                    | Mover pra `Docs/deploy/_archived/`.                   |
| `server/lib/advisoryLock.ts` + ADR-144            | OK                                    | -                                                     |
| `migrations/0075..0080.sql` (+ `_rollback.sql`)   | OK no repo, PENDENTE em prod          | Aplicar via psql na ordem.                            |

---

## 15. Time to Deploy (estimado)

| Etapa                                                                     | Tempo |
| ------------------------------------------------------------------------- | ----- |
| Criar conta Neon + provisionar projeto + DATABASE_URL                     | 15min |
| Criar conta Render + conectar repo + auto-detect `render.yaml`            | 20min |
| Gerar secrets (`openssl rand -hex 32`) + popular envVars no Render        | 30min |
| Aplicar migrations 0075..0080 via psql                                    | 20min |
| Primeiro deploy (Render builda Docker + sobe)                             | 15min |
| Configurar webhooks Mux + Stripe externamente                             | 15min |
| Configurar redirect URI Spotify                                           | 10min |
| Configurar DNS Cloudflare (`app.grindfy.com` → onrender.com)              | 15min |
| Aguardar SSL Lets Encrypt propagar                                        | 10min |
| Smoke test (registro, login, upload CSV, Coach reply, audio play)         | 30min |
| Habilitar PITR Neon                                                       | 5min  |
| **TOTAL**                                                                 | **~3h 25min** |

Sobra folga dentro do cap de 12h pra debug de algum bloqueador imprevisto.

---

## 16. Pos-Deploy (pendencias pos-MVP)

Defer ate founder pedir explicitamente:
- Sentry / error tracking.
- Stripe activate (cobranca).
- S3 backend pra spots (`SPOT_IMAGE_STORAGE_BACKEND=s3`).
- `pino` JSON logs + log aggregator.
- 2+ replicas Render (advisory lock ja preparado).
- CDN Cloudflare proxied + Page Rules.
- Email pipeline migrar Gmail → Mailgun/SendGrid se >500 emails/dia.
- Backup `pg_dump` semanal externalizado.
