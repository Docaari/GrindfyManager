# Environment Variables — Production

> **Status:** spec ate o primeiro deploy. Apos prod ativa, atualizar comentarios "Onde gerar" se algo mudar.
> **Source of truth runtime:** `CLAUDE.md` §4 (descricoes detalhadas das opcionais).
> **Render config:** `render.yaml` — manter sincronizado com esta tabela.

---

## Convencoes

- **Sensivel** = NUNCA logar nem commitar. Gerar/rotar com `openssl rand -hex 32` quando for secret interno.
- **Onde guardar:** Render Dashboard → Service → Environment (sync: false no `render.yaml`).
- **Onde NAO guardar:** `.env` versionado, repo public, screenshots em chat.
- **Quando mudar valor sensivel:** rotacionar imediatamente e rodar smoke test publico.

---

## 1. CORE (obrigatorias — sem isso o servidor nao sobe)

### `NODE_ENV`
- **Valor:** `production`
- **Obrigatorio:** sim
- **Onde gerar:** estatico no `render.yaml`.
- **Por que:** habilita serve estatico de `dist/public/`, desliga Vite HMR, ativa `helmet` em modo full.

### `PORT`
- **Valor:** `3000`
- **Obrigatorio:** sim
- **Onde gerar:** estatico no `render.yaml`.
- **Por que:** Render injeta porta automaticamente, mas o codigo le `process.env.PORT`. Default 3000 funciona; Render mapeia 443/80 → 3000 internamente.

### `DATABASE_URL`
- **Valor exemplo:** `postgresql://user:pass@host-pooler.region.aws.neon.tech/grindfy?sslmode=require`
- **Obrigatorio:** sim
- **Sensivel:** SIM.
- **Onde gerar:** Neon Console → Project → Connection Details → copiar **Pooled connection**.
- **Por que pooled:** Neon serverless precisa de pooler pra conexoes serverless eficientes; o nao-pooled e so pra clientes que mantem conexao longa.

---

## 2. AUTH (obrigatorias)

### `JWT_SECRET`
- **Valor:** 64 chars hex (`openssl rand -hex 32`).
- **Obrigatorio:** sim
- **Sensivel:** SIM.
- **Onde gerar:** local: `openssl rand -hex 32`. Render: `generateValue: true` ja no `render.yaml` (Render auto-gera no apply).
- **Rotacao:** trocar = forca todos users a relogar.

### `JWT_REFRESH_SECRET`
- **Valor:** 64 chars hex.
- **Obrigatorio:** sim
- **Sensivel:** SIM.
- **Onde gerar:** idem JWT_SECRET.
- **Diferente de JWT_SECRET:** sim, **sempre** valor distinto.

---

## 3. URL BASE (obrigatoria pra emails)

### `BASE_URL`
- **Valor:** `https://app.grindfy.com` (ou `https://grindfy.onrender.com` se nao tem dominio custom).
- **Obrigatorio:** sim (links de email saem quebrados sem ela).
- **Onde gerar:** founder decide na Fase 10 do checklist.
- **Por que:** usado em links de reset password, verificacao email, unsubscribe, Coach reports email.

---

## 4. SMTP (obrigatorias pra envio de email)

### `SMTP_HOST`
- **Valor:** `smtp.gmail.com` (Gmail App Password) ou `smtp.mailgun.org` etc.
- **Obrigatorio:** sim
- **Sensivel:** nao (host publico).
- **Por que Gmail:** suficiente <500 emails/dia. Habilitar 2FA + criar App Password em https://myaccount.google.com/apppasswords.

### `SMTP_PORT`
- **Valor:** `587`
- **Obrigatorio:** sim
- **Onde gerar:** estatico.

### `SMTP_USER`
- **Valor:** email do remetente (ex: `noreply@grindfy.com` ou gmail completo).
- **Obrigatorio:** sim
- **Sensivel:** parcialmente (publico se vazar mas e identidade).

### `SMTP_PASS`
- **Valor:** App Password Gmail (16 chars sem espacos) OU senha SMTP do provedor.
- **Obrigatorio:** sim
- **Sensivel:** SIM.
- **Onde gerar:** Gmail: https://myaccount.google.com/apppasswords → "Mail" → device "Other (Grindfy Prod)" → copiar.

### `SMTP_FROM_NAME`
- **Valor:** `Grindfy`
- **Obrigatorio:** sim
- **Onde gerar:** estatico no `render.yaml`.

### `SMTP_FROM_ADDRESS`
- **Valor:** `noreply@grindfy.com` (precisa setar SPF/DKIM no DNS) ou o mesmo `SMTP_USER` Gmail.
- **Obrigatorio:** sim

---

## 5. ANTHROPIC (Coach AI — obrigatoria se Coach ativo)

### `ANTHROPIC_API_KEY`
- **Valor:** `sk-ant-api03-...`
- **Obrigatorio:** sim (Coach AI quebra sem isso — relatorios viram `degradedReason='no_anthropic_key'`).
- **Sensivel:** SIM.
- **Onde gerar:** https://console.anthropic.com → Settings → API Keys → "Create Key" → "Production".
- **Custo aproximado:** Pro+ users com Weekly+Monthly+Daily ≈ $0.50-$2/user/mes (varia por uso Coach).

### `COACH_MODEL`
- **Valor:** opcional, default `claude-sonnet-4-5-20250929` (atualizar quando 4.7 estabilizar — ver ADR-021).
- **Obrigatorio:** nao.
- **Por que mudar:** override pra testar modelo novo / fallback emergency.

### `COACH_LLM_TIMEOUT_MS`
- **Valor:** `60000` (60s)
- **Obrigatorio:** nao (default 60s no codigo).
- **Por que setar:** garantir reports nao penduram cron processor por mais tempo que o esperado.

### `COACH_NUDGES_ENABLED`
- **Valor:** `true` (default).
- **Obrigatorio:** nao.
- **Por que setar `false`:** kill switch global de proatividade Coach (nudges + reports + gap-check + B-IMPORT + Daily Debrief event-driven). Ver CLAUDE.md §4.

### `COACH_BIMPORT_DAYS`
- **Valor:** `5` (default).
- **Obrigatorio:** nao.

### `COACH_REPORT_SUMMARIZER_MODEL`
- **Valor:** opcional, default Haiku.

### `COACH_REPORT_SUMMARIZE_THRESHOLD_CHARS`
- **Valor:** `20000` (default).

### `COACH_MEMORY_MODEL`
- **Valor:** opcional, default Haiku.

---

## 6. SPOTIFY (Mini Player — obrigatorias se feature ativa pra Premium)

### `SPOTIFY_CLIENT_ID`
- **Valor:** ID publico da app Spotify (32 chars hex).
- **Obrigatorio:** sim (Mini Player OAuth quebra sem).
- **Sensivel:** nao (publico, visivel no browser).
- **Onde gerar:** https://developer.spotify.com/dashboard → "Create App" → settings.

### `SPOTIFY_CLIENT_SECRET`
- **Valor:** secret server-side (32 chars hex).
- **Obrigatorio:** sim.
- **Sensivel:** SIM. NUNCA expor no client.
- **Onde gerar:** mesmo dashboard, "View client secret".

### `SPOTIFY_REDIRECT_URI`
- **Valor:** `https://app.grindfy.com/api/audio/spotify/oauth-callback`
- **Obrigatorio:** sim.
- **Onde gerar:** depois de definir BASE_URL. **Registrar no Spotify Dashboard** ambos: o `/api/audio/spotify/oauth-callback` (canonico) E `/spotify-callback` (fallback SPA).

### `SPOTIFY_TOKEN_ENCRYPTION_KEY`
- **Valor:** 64 chars hex (`openssl rand -hex 32`).
- **Obrigatorio:** sim (boot fail se chamadas de encrypt/decrypt acontecem sem essa env — ver `server/services/spotifyTokenCrypto.ts`).
- **Sensivel:** SIM.
- **Rotacao:** rotacionar = invalida todos refresh_tokens persistidos (users tem que reconectar Spotify).

---

## 7. MUX (video + transcription — obrigatorias se feature ativa)

### `MUX_TOKEN_ID`
- **Valor:** ID publico do access token Mux.
- **Obrigatorio:** sim (video upload + asset retrieval + transcription ingest).
- **Sensivel:** parcialmente (pareado com secret).
- **Onde gerar:** https://dashboard.mux.com → Settings → Access Tokens → "Generate new token".

### `MUX_TOKEN_SECRET`
- **Valor:** secret server-side.
- **Obrigatorio:** sim.
- **Sensivel:** SIM.

### `MUX_WEBHOOK_SECRET`
- **Valor:** 64 chars hex (`openssl rand -hex 32`).
- **Obrigatorio:** sim (HMAC validation em `/api/mux/webhooks`).
- **Sensivel:** SIM.
- **Onde gerar:** local `openssl rand -hex 32` E **colar o MESMO valor** em Mux Dashboard → Webhooks → endpoint → "Signing Secret".

### `TRANSCRIPTION_INGEST_ENABLED`
- **Valor:** `true` (default).
- **Obrigatorio:** nao.
- **Por que setar `false`:** desliga cron poll + webhook ingestor (debug emergency).

---

## 8. NEWS (defer / opt-in)

### `NEWS_FEED_ENABLED`
- **Valor:** `false` (default).
- **Obrigatorio:** nao.
- **Por que setar `true`:** ativa endpoints `/api/news` + cron `refreshNews`. **Precisa** `XAI_API_KEY` se ativar.

### `XAI_API_KEY`
- **Valor:** chave xAI Grok.
- **Obrigatorio:** so se `NEWS_FEED_ENABLED=true`.
- **Onde gerar:** https://console.x.ai.

### `XAI_MODEL`
- **Valor:** opcional, default `grok-3-latest`.

---

## 9. GOOGLE OAUTH (opcional — login Google)

### `GOOGLE_CLIENT_ID`
- **Valor:** ID publico do OAuth client.
- **Obrigatorio:** nao (so se for habilitar login Google em prod).
- **Onde gerar:** https://console.cloud.google.com → APIs & Services → Credentials → "Create OAuth Client ID" → "Web application" → authorized redirect `https://app.grindfy.com/api/auth/google/callback`.

### `GOOGLE_CLIENT_SECRET`
- **Valor:** secret server-side.
- **Obrigatorio:** se GOOGLE_CLIENT_ID setado.
- **Sensivel:** SIM.

---

## 10. STRIPE (defer ate cobranca ativa)

### `STRIPE_SECRET_KEY`
- **Valor:** `sk_live_...` (NUNCA `sk_test_` em prod).
- **Obrigatorio:** nao no MVP (deixar vazio).
- **Sensivel:** SIM.
- **Onde gerar:** https://dashboard.stripe.com → Developers → API Keys → "Reveal live key".

### `STRIPE_WEBHOOK_SECRET`
- **Valor:** `whsec_...`
- **Obrigatorio:** se STRIPE_SECRET_KEY setado.
- **Sensivel:** SIM.
- **Onde gerar:** Stripe Dashboard → Webhooks → endpoint → "Signing secret".

---

## 11. EMAIL UNSUBSCRIBE (HMAC — obrigatoria se reports email ativo)

### `UNSUBSCRIBE_SECRET`
- **Valor:** 64 chars hex (`openssl rand -hex 32`).
- **Obrigatorio:** sim se Weekly/Monthly/Quarterly Report email enviado (senao throw `UNSUBSCRIBE_SECRET_MISSING` — ver AI-2B sprint).
- **Sensivel:** SIM.
- **Por que:** HMAC SHA-256 nos links unsubscribe pra impedir spam unsubscribe arbitrario.

---

## 12. SPOT STORAGE (opcional)

### `SPOT_IMAGE_STORAGE_BACKEND`
- **Valor:** `local` (default, MVP). Futuro `s3`.
- **Obrigatorio:** nao.
- **Atencao:** Render Starter **nao tem disco persistente** — spots locais perdem entre deploys. Decisao founder: upgrade pra plano com disco, migrar pra `s3`, ou aceitar volatilidade (ver `sprint-deploy-readiness.md` §12 bloqueador #3).

---

## 13. AUTH CACHE (opcional)

### `AUTH_CACHE_TTL_MS`
- **Valor:** `30000` (default 30s).
- **Obrigatorio:** nao.

---

## Sumario por categoria

| Categoria       | Obrigatorias                                                                                                        | Total |
| --------------- | ------------------------------------------------------------------------------------------------------------------- | ----- |
| Core            | `NODE_ENV`, `PORT`, `DATABASE_URL`                                                                                  | 3     |
| Auth            | `JWT_SECRET`, `JWT_REFRESH_SECRET`                                                                                  | 2     |
| URL             | `BASE_URL`                                                                                                          | 1     |
| SMTP            | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_NAME`, `SMTP_FROM_ADDRESS`                           | 6     |
| Anthropic       | `ANTHROPIC_API_KEY`                                                                                                 | 1     |
| Spotify         | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI`, `SPOTIFY_TOKEN_ENCRYPTION_KEY`                | 4     |
| Mux             | `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_WEBHOOK_SECRET`                                                            | 3     |
| Email reports   | `UNSUBSCRIBE_SECRET`                                                                                                | 1     |
| **TOTAL MIN**   |                                                                                                                     | **21** |

Outras 10-15 sao opcionais / defer.
