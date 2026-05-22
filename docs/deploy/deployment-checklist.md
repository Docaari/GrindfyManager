# Deployment Checklist — Grindfy Manager

> **Quem executa:** founder.
> **Quem nao executa:** Claude (sem creds, sem provisionamento, sem deploy automatico).
> **Pre-requisito:** ler `sprint-deploy-readiness.md` primeiro.
> **Branch:** `main` @ commit `6150a716` (ou mais recente).
> **Cap:** 12h MVP. Marca cada item com [x] conforme avanca.

---

## Fase 0 — Pre-Deploy Local (30min)

- [ ] Confirmar branch atual: `git status` deve estar limpa em `main` ou em branch pronta pra merge.
- [ ] Rodar typecheck: `npm run check` → exit 0.
- [ ] Rodar testes criticos: `npx vitest run tests/coach tests/audio tests/client/mini-player tests/server/upload-history.test.ts` → todos verde (ignorar flakies conhecidos: ver `memory/MEMORY.md` recent sessions).
- [ ] Rodar build local: `npm run build` → exit 0, gera `dist/index.js` + `dist/public/`.
- [ ] Testar smoke do build: `NODE_ENV=production node dist/index.js` + `curl http://localhost:3000/api/health` → `{status:"ok"}`. Matar processo.
- [ ] Arquivar docs Replit-era stale:
  ```
  mkdir Docs/deploy/_archived
  git mv Docs/deploy/RENDER_DEPLOYMENT_INSTRUCTIONS.md Docs/deploy/_archived/
  git mv Docs/deploy/RENDER_QUICK_DEPLOYMENT.md Docs/deploy/_archived/
  git commit -m "chore(deploy): archive Replit-era reconstruction docs"
  ```

---

## Fase 1 — Provisionar Neon Postgres (15min)

- [ ] Criar conta em https://neon.tech (signup Google).
- [ ] Criar projeto "grindfy-prod" na regiao `us-east-2` (Oregon — proximo do Render Oregon).
- [ ] Branch default: `main`. Compute size: `0.25 vCPU` (free tier inicial).
- [ ] **Habilitar PITR**: Settings → "History retention" → setar 24h (free) ou 7d (Launch $19/mes).
- [ ] Copiar a **connection string pooled** (formato `postgresql://user:pass@host-pooler.region.aws.neon.tech/grindfy?sslmode=require`).
- [ ] Guardar em local seguro (1Password / arquivo `.env.prod` no disco do founder, **NUNCA commitar**).

---

## Fase 2 — Gerar Secrets (5min)

Rodar localmente (Windows PowerShell ou Git Bash):

```bash
# JWT
openssl rand -hex 32  # → JWT_SECRET
openssl rand -hex 32  # → JWT_REFRESH_SECRET

# Spotify token encryption (32 bytes hex = 64 chars)
openssl rand -hex 32  # → SPOTIFY_TOKEN_ENCRYPTION_KEY

# Mux webhook signing
openssl rand -hex 32  # → MUX_WEBHOOK_SECRET

# Email unsubscribe HMAC
openssl rand -hex 32  # → UNSUBSCRIBE_SECRET
```

- [ ] Salvar todos os 5 valores no gerenciador de senhas. **NUNCA commitar**.

---

## Fase 3 — Provisionar Render Web Service (30min)

- [ ] Criar conta em https://render.com.
- [ ] Conectar GitHub: autorizar acesso ao repo `Docaari/GrindfyManager`.
- [ ] Dashboard → New → "Blueprint" → escolher repo → branch `main`.
- [ ] Render detecta `render.yaml` automaticamente. **NAO** clicar "Apply" ainda.
- [ ] Atualizar `render.yaml` **primeiro** (Fase 4) — senao Render cria service sem todas as envVars necessarias.

---

## Fase 4 — Atualizar `render.yaml` (10min)

Editar `render.yaml` localmente e adicionar todas as envVars que faltam (lista canonica em `env-vars-prod.md`). Pattern: chaves que precisam input manual = `sync: false`; chaves estaticas/geradas = valor inline.

- [ ] Adicionar:
  - `ANTHROPIC_API_KEY` (sync: false)
  - `COACH_MODEL` (sync: false, opcional)
  - `COACH_LLM_TIMEOUT_MS` value: `"60000"`
  - `COACH_NUDGES_ENABLED` value: `"true"`
  - `SPOTIFY_CLIENT_ID` (sync: false)
  - `SPOTIFY_CLIENT_SECRET` (sync: false)
  - `SPOTIFY_REDIRECT_URI` (sync: false)
  - `SPOTIFY_TOKEN_ENCRYPTION_KEY` (sync: false)
  - `MUX_TOKEN_ID` (sync: false)
  - `MUX_TOKEN_SECRET` (sync: false)
  - `MUX_WEBHOOK_SECRET` (sync: false)
  - `TRANSCRIPTION_INGEST_ENABLED` value: `"true"`
  - `NEWS_FEED_ENABLED` value: `"false"`
  - `UNSUBSCRIBE_SECRET` (sync: false)
  - `STRIPE_SECRET_KEY` (sync: false, opcional — defer)
- [ ] Commitar e push: `git add render.yaml && git commit -m "chore(deploy): expand render.yaml envVars" && git push`.

---

## Fase 5 — Aplicar Blueprint no Render (10min)

- [ ] Voltar pro Render Dashboard → Blueprint → "Apply".
- [ ] Render cria o web service "grindfy". Vai falhar no primeiro build (envVars `sync: false` vazias). Isso e esperado.
- [ ] Dashboard → Service "grindfy" → Environment → preencher cada `sync: false` com o valor real:
  - `DATABASE_URL` = connection string Neon (Fase 1).
  - `BASE_URL` = `https://app.grindfy.com` (ou dominio escolhido).
  - `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_ADDRESS` (ver `env-vars-prod.md` §SMTP).
  - `ANTHROPIC_API_KEY` (de console.anthropic.com).
  - `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` (de developer.spotify.com).
  - `SPOTIFY_REDIRECT_URI` = `https://app.grindfy.com/api/audio/spotify/oauth-callback`.
  - `SPOTIFY_TOKEN_ENCRYPTION_KEY` (gerado Fase 2).
  - `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET` (de dashboard.mux.com → Settings → Access Tokens).
  - `MUX_WEBHOOK_SECRET` (gerado Fase 2).
  - `UNSUBSCRIBE_SECRET` (gerado Fase 2).
  - `STRIPE_SECRET_KEY` (defer; deixar vazio se nao for cobrar agora).
- [ ] Trigger manual deploy: Dashboard → Service → "Manual Deploy" → "Deploy latest commit".

---

## Fase 6 — Aplicar Migrations Pendentes (20min)

⚠️ **Ordem importa.** Aplicar 0075 → 0076 → 0077 → 0078 → 0079 → 0080.

⚠️ **ANTES** de cada migration, fazer snapshot defensivo (Neon Console → Branches → "Create branch from current" — barato, instantaneo). Backup vivo em caso de erro.

```bash
# Set DATABASE_URL local pra apontar pro Neon prod
export DATABASE_URL="postgresql://user:pass@host-pooler.region.aws.neon.tech/grindfy?sslmode=require"

# Aplicar em ordem
psql "$DATABASE_URL" -f migrations/0075_notifications_deep_link.sql
psql "$DATABASE_URL" -f migrations/0076_user_coach_preferences_sleep_timer.sql
psql "$DATABASE_URL" -f migrations/0077_spotify_tokens.sql
psql "$DATABASE_URL" -f migrations/0078_audio_queue_snapshots_and_transcription_preview.sql
psql "$DATABASE_URL" -f migrations/0079_ellipsis_unicode_backfill.sql
psql "$DATABASE_URL" -f migrations/0080_transcription_previews_jsonb.sql
```

- [ ] Verificar cada uma com `\d <tabela_alterada>` ou query especifica. Ex: `SELECT column_name FROM information_schema.columns WHERE table_name='notifications' AND column_name='deep_link';`.
- [ ] Se alguma falhar: rodar `_rollback.sql` correspondente + investigar antes de prosseguir.

---

## Fase 7 — Smoke Test API (interna) (10min)

Render ainda nao expos dominio publico; usar o subdominio default `grindfy.onrender.com`.

- [ ] `curl https://grindfy.onrender.com/api/health` → `{status:"ok"}`.
- [ ] `curl https://grindfy.onrender.com/api/ready` → 200 (DB conectado).
- [ ] Render Dashboard → Logs → conferir crons inicializaram sem erro (`Started cron: cron:fx-rates`, etc).
- [ ] Render Dashboard → Logs → conferir migration NAO redisparou ao subir (Drizzle nao tem auto-migrate em prod — sempre manual).

---

## Fase 8 — Configurar Webhooks Externos (15min)

### 8.1 Mux Webhook
- [ ] dashboard.mux.com → Settings → Webhooks → "Create new endpoint".
- [ ] URL: `https://app.grindfy.com/api/mux/webhooks` (usar dominio final aqui — atualizar quando DNS estiver pronto).
- [ ] Signing secret: colar o `MUX_WEBHOOK_SECRET` gerado Fase 2.
- [ ] Events: marcar `video.asset.ready`, `video.asset.track.ready`, `video.asset.errored`.
- [ ] Save.

### 8.2 Stripe Webhook (defer ate cobranca)
- [ ] **SKIP** se nao for cobrar agora.
- [ ] Quando ativar: dashboard.stripe.com → Developers → Webhooks → "Add endpoint" → URL `https://app.grindfy.com/api/webhooks/stripe`. Eventos: `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed`.

---

## Fase 9 — Configurar Spotify Redirect URI (10min)

- [ ] developer.spotify.com → My App → Edit Settings.
- [ ] Redirect URIs: adicionar **AMBOS**:
  - `https://app.grindfy.com/api/audio/spotify/oauth-callback` (canonico server-side)
  - `https://app.grindfy.com/spotify-callback` (fallback SPA)
- [ ] Save.

---

## Fase 10 — Configurar DNS (15min)

Cenario A — Cloudflare (recomendado, DNS-only):
- [ ] cloudflare.com → Add Site → `grindfy.com` (ou `.net`).
- [ ] Mover nameservers no registrar (ex: GoDaddy, Registro.br) pros NS do Cloudflare.
- [ ] Aguardar propagacao (~5min ate 24h; geralmente <30min).
- [ ] Cloudflare DNS → Add Record:
  - Tipo: `CNAME`
  - Name: `app`
  - Target: `grindfy.onrender.com` (ver dashboard Render pra valor exato)
  - Proxy status: **DNS only** (cinza, NAO laranja).
- [ ] Render Dashboard → Service "grindfy" → Settings → Custom Domain → "Add Custom Domain" → `app.grindfy.com`.
- [ ] Render auto-emite SSL Lets Encrypt em ~5min.

Cenario B — usar so subdominio Render:
- [ ] Pular DNS. Usar `https://grindfy.onrender.com` direto. Setar `BASE_URL=https://grindfy.onrender.com`.

---

## Fase 11 — Smoke Test Producao Publica (30min)

Acessar `https://app.grindfy.com` (ou onrender.com):

- [ ] Pagina inicial carrega sem erro de console.
- [ ] **Registro:** criar conta nova com email valido → email de verificacao chega → confirmar → login funciona.
- [ ] **Upload CSV:** /upload → enviar CSV WPN/GG/Stars de teste → dashboard atualiza com torneios.
- [ ] **Coach AI:** /coach-ai → enviar mensagem "oi" → resposta volta em <30s.
- [ ] **Grade Planner:** /grade-planner → drag torneio pra grade → persiste apos refresh.
- [ ] **Mini Player (se tem licoes):** /grind-live → tocar audio → controles funcionam.
- [ ] **Bankroll:** /bankroll → criar wallet → transferir → snapshot.
- [ ] **Stripe:** **SKIP** se nao ativou.
- [ ] **Spotify OAuth (Pro tier):** /audio → "Conectar Spotify" → login Spotify → callback OK → token persiste apos refresh.

---

## Fase 12 — Habilitar PITR Neon (5min)

⚠️ Se nao habilitou na Fase 1.

- [ ] Neon Console → Project → Settings → "History retention".
- [ ] Setar 24h (free) ou 7d (Launch).
- [ ] Salvar.

---

## Fase 13 — Pos-Deploy Sanity (10min)

- [ ] Render Dashboard → Logs → procurar `ERROR` ou stack trace nas ultimas 30min. Investigar qualquer um.
- [ ] Render Dashboard → Metrics → CPU < 50%, memoria < 60%. Se nao, escalar pra plano com mais recursos.
- [ ] Setar UptimeRobot (free) ou Better Uptime monitorando `https://app.grindfy.com/api/ready` a cada 5min. Notificar email founder em falha.
- [ ] Commitar **NADA** com creds. `git status` deve estar limpa.

---

## Rollback Playbook

### Cenario A — deploy quebrado (codigo)
1. Render Dashboard → Service → Deploys → escolher deploy verde anterior → "Redeploy".
2. Tempo: ~3min ate trafico voltar.
3. Investigar logs do deploy ruim ANTES de tentar de novo.

### Cenario B — migration quebrou prod
1. Identificar qual migration: ver logs do app (provavelmente erro `column "X" does not exist`).
2. **Antes** de rollback de migration: fazer `pg_dump` da tabela afetada:
   ```bash
   pg_dump "$DATABASE_URL" -t <tabela> > backup-pre-rollback.sql
   ```
3. Rodar `_rollback.sql` da migration problematica:
   ```bash
   psql "$DATABASE_URL" -f migrations/0078_audio_queue_snapshots_and_transcription_preview_rollback.sql
   ```
4. Voltar a versao do app que nao usa o schema novo (Render redeploy previous).

### Cenario C — banco corrompido / dados perdidos
1. Neon Console → Branches → "Create branch from time" → escolher timestamp pre-incidente.
2. Copiar nova connection string da branch restaurada.
3. Atualizar `DATABASE_URL` no Render → restart.
4. Validar dados → se OK, promover branch restaurada pra principal (Neon → "Set as primary").

### Cenario D — secret vazado
1. Render Dashboard → Environment → rotacionar a chave comprometida (regenerar + atualizar).
2. Para `JWT_SECRET`/`JWT_REFRESH_SECRET`: invalidar todos tokens ativos (todos users tem que relogar). Forcado automaticamente quando muda o secret.
3. Para `SPOTIFY_TOKEN_ENCRYPTION_KEY`: re-encrypt todos refresh tokens existentes — defer pos-MVP se nao tem volume.
4. Avisar usuarios se for vazamento publico.

---

## Pendencias Pos-Deploy (defer)

Documentadas em `sprint-deploy-readiness.md` §16. Founder revisita quando producao tiver carga real.
