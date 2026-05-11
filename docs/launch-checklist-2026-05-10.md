# Launch Checklist — Grindfy SaaS

**Data inicio:** 2026-05-10
**Status global:** Fase 1 em execucao
**Owner:** Founder + Claude

---

## Visao Geral das Fases

| # | Fase | Status | Inicio | Fim | Notas |
|---|------|--------|--------|-----|-------|
| 1 | Revisao geral (bugs + integracao) | EM EXECUCAO | 2026-05-10 | — | Bug hunt + funcionalidade |
| 2 | Analise de seguranca | PENDENTE | — | — | OWASP Top 10 + auth + secrets |
| 3 | Analise de escalabilidade | PENDENTE | — | — | Load test + DB indexes + cache |
| 4 | Deploy producao + dominio | PENDENTE | — | — | Domain + SSL + CDN + monitoring |
| 5 | PWA desktop | PENDENTE | — | — | Service worker + manifest + offline |
| 6 | Marketing lancamento | PENDENTE | — | — | Landing + onboarding + analytics |

---

## FASE 1 — Revisao Geral (bugs + integracao)

**Objetivo:** plataforma 100% funcional, sem regressoes, sem erros de console, sem bugs P0/P1.

### 1.1 Baseline tecnico

- [ ] `npm run check` zero erros TypeScript
- [ ] `npm test` 100% verde (target: ~5000+ testes)
- [ ] Zero warnings de console no boot do dev server
- [ ] Zero warnings React (key, useEffect deps, hydration)
- [ ] Build de producao (`npm run build`) sem erros
- [ ] Bundle size dentro de target (frontend < 2MB gzipped)

### 1.2 Smoke test funcional (manual + automatizado)

Cobrir **golden path** + edge cases nas paginas principais:

- [ ] **Auth:** signup, login, logout, password reset, refresh token, OAuth Google
- [ ] **Onboarding:** novo user -> dashboard vazio -> primeiro upload CSV
- [ ] **Upload CSV:** todas as 10 redes (WPN, GG, Stars, Party, 888, Bodog, Coin, Chico, Revolution, iPoker)
- [ ] **Dashboard:** all-time + filtros por periodo + drill-down dia
- [ ] **Biblioteca:** entitlement gate, video Mux, watermark, progresso
- [ ] **Estudos:** spots, anki reentry, themes, stats linking
- [ ] **Coach:** chat, tools, page context, persona tier, rate limit
- [ ] **Bankroll:** multi-wallet, FX rates, snapshots, transfers, pending
- [ ] **Grade Planner:** weekly plan, tournament selector, manual add
- [ ] **Grind Live:** start session, register tournaments, late reg, day 2, finalize, spots
- [ ] **Tournament Selector:** scoring, sugestoes, S/A/B/C/D
- [ ] **Calendar:** sync, reminders, ICS export
- [ ] **Settings:** profile, FX, layout home, notifications
- [ ] **Subscription:** signup flow, billing, refund (preparado mas nao live)
- [ ] **Admin:** user list, impersonation, bug reports

### 1.3 Auditorias por modulo (reviewer agents)

- [ ] **Auth + JWT** — token expiry, refresh race, CSRF, session fixation
- [ ] **Bankroll + Wallets + FX** — currency mix, optimistic lock, double-spend
- [ ] **Grind Live + Sessions** — finalize race, spot upload, day 2 promotion, reentry
- [ ] **Coach AI** — prompt injection, tool param validation, rate limit
- [ ] **Biblioteca + Entitlements** — paywall bypass, Mux signing, watermark leak
- [ ] **CSV Parsers** — falso positivo, encoding, duplicate detection, malformed input

### 1.4 Integracao cross-modulo

- [ ] Bankroll mutations -> dashboard reflect (cache invalidation)
- [ ] Upload CSV -> tournament library -> dashboard -> stats coerentes
- [ ] Grind session finalize -> tournaments importadas -> dashboard sem dupes
- [ ] Coach context -> page state correto (filters, period, currency)
- [ ] Biblioteca lesson complete -> coach reconhece progresso

### 1.5 Performance basica

- [ ] Time to first byte < 500ms
- [ ] Dashboard load < 2s com 1000+ tournaments
- [ ] Coach response < 5s (excluindo LLM)
- [ ] Upload CSV 10MB < 30s

### 1.6 Resultado dos Audits — 2026-05-10

**Sumario:** 25 P0 + 33 P1 + 29 P2 (87 achados totais). 8 erros TypeScript (5 bugs reais). 212 testes vermelho em 56 files (2% do total).

#### Baseline tecnico

| Check | Status | Notas |
|-------|--------|-------|
| `npm run check` | RED | 8 erros: storage.ts (4), LessonViewer.tsx (1), test files (3 unused @ts-expect-error) |
| `npm test` | 11160/11530 (96.8%) | 212 fail, 56 files vermelho. Coach (14), grind-live (7), news (5), biblioteca (4) |
| Build prod | NAO TESTADO | Deps de Fase 1 fixes |

#### Erros TypeScript reais (bugs)

- **storage.ts:1818** — `upsertUserSettings`: warmupSetupItems Json vs string[] mismatch
- **storage.ts:3731** — Tournament return shape sem `isFlight/isLive/satellite*` (legacy code, schema evoluiu)
- **storage.ts:8743** — `articleHtml` ausente no map de lessons (Bloco A schema mismatch)
- **storage.ts:12332** — `tournaments.platform` NAO EXISTE (deve ser `site`); `detectUserPlatforms` query QUEBRADA — afeta news preferences
- **LessonViewer.tsx:582** — `concat("article")` quebra type (FormatTab union)

#### P0 — bloqueiam launch (25 totais)

**Auth (6):**
1. `server/oauth.ts:191-203` — OAuth cria user sem `userPlatformId` -> Google login NOVO USER quebrado 100% (cookie OK, req.user=null em todos requests)
2. `server/routes/auth.ts:512-547` — `/api/auth/reset-password` NAO valida com `resetPasswordSchema` (importado, nao usado). Aceita senha vazia
3. `client/src/lib/queryClient.ts:97-135` — Refresh race: N requests 401 paralelos -> N refresh requests -> tokens invalidados -> logout loop
4. `client/src/contexts/AuthContext.tsx:252-263` — `logout()` NAO chama `queryClient.clear()`. Outro user logando ve dados do anterior
5. `client/src/hooks/useAuth.tsx` — AuthContext duplicado fantasma (localStorage tokens). Risco de import errado
6. `server/oauth.ts:61-72` — OAuth state nao deletado pos validar (replayable 10min)

**CSV (3):**
7. `server/csvParser.ts:1882 + storage.ts:1419` — Dup check usa `eq(datePlayed)` exato; TZ shift entre re-imports gera dups fantasma
8. `server/csvParser.ts:179,268,...` — `parseFloatSafe` retorna 0 silencioso; tournaments com `buyIn=0` poluem ROI (NaN/infinito)
9. `server/csvParser.ts:191,1130-1132,451` — `new Date(string)` sem TZ explicito; mix UTC/local entre redes desalinha agregados por data

**Bankroll (3):**
10. `walletService.ts:482-484` — `recordWalletTransaction` snapshot mirror usa `exchangeRates` cru (sem fxResolver). BRL sem rate -> `?? 1` -> tratado como USD. Inflaciona consolidated
11. `bankrollService.ts:367-426` — `recordSnapshot` grava em `user_settings.bankroll_amount` (v1) ignorando wallets v2. Multi-wallet user: `/dashboard` history diverge de `/bankroll` consolidated
12. `walletService.ts:151-216` — `createWallet` initial deposit grava snapshot `previousAmount=0` ignorando outras wallets ja existentes

**Grind-Live (3):**
13. `server/routes/starred-hands.ts:200-216` — Spot upload nao verifica `session.status==='active'`; aceita prints em sessao completed
14. `client/src/pages/GrindSessionLive.tsx:743-801` — `handleEndSession` sem mutation guard; double-click finaliza 2x (2 snapshots)
15. `server/routes/grind-sessions.ts:1313-1374` — `POST /api/session-tournaments` aceita criar torneio em sessao completed

**Coach (7):**
16. `server/routes/coach.ts:142-161` — `handleCoachChat` NUNCA chama `resolveUserTier`/`canAccessCoach`. Free user acessa qualquer coach
17. `server/routes/coach.ts:156-161` — Stream sem `tools:` param. Todo o registry/runner/confirm endpoints sao DEAD CODE
18. `server/routes/coach.ts:91,179` — Token count usa `len/4` em vez do `usage` real do SDK. Custo reportado fantasma
19. `server/routes/coach.ts:157` — Modelo `claude-sonnet-4-5-20250514` NAO EXISTE. Coach retorna erro generico TODA mensagem em prod
20. `server/routes/coach.ts:108-176` — Sem handler de abort/disconnect. Stream continua queimando tokens em socket morto
21. `server/routes/coach.ts:170-176` — Erro de stream salva mensagem fake como historico
22. `server/storage.ts:11462-11467` — `hasLibraryAccess` hardcoded `return true`. Entitlement gate desabilitado

**Biblioteca (3):**
23. `client/src/pages/biblioteca/LessonViewer.tsx:937-943` — `MuxPlayer` recebe playbackId raw; `/playback-token` signed URL NUNCA chamado. Bypass total se assets `policy=public`
24. `server/storage.ts:9082-9103` — `findLessonAccess`/`lessonAccessLookup` NAO checam `expiresAt`. Grant expirado libera acesso permanente
25. _(idem #22 acima — overlap entre coach + biblioteca)_

#### P1 — quebram fluxo (33 totais)

**Auth (6):** forgot-password sem rate limit, OAuth callback sem feedback UI, login vaza email enumeration via attemptsRemaining, refresh schedule fixo 15min ignora exp, OAuth account takeover via email conflict, OAuth bypassa status checks.

**CSV (5):** `originalCurrency` raw com whitespace, `addOnCost` inclui rake duplicado, `category` sobrescrita por enrich, dup check sem `site` no key, CoinTXT/CoinPoker enrich antes do dup check.

**Bankroll (5):** PUT `/api/user-settings` nao invalida fxResolver/walletCache, `runReconciliation` cache miss em snapshots-only, `settlePending` fxRate fallback 1:1 silencioso, `archiveWallet` arquiva com saldo, `createAutoSnapshot` sem dedup por dia.

**Grind-Live (5):** N+1 reaparecida em `/api/grind-sessions/history`, race nao-atomica em POST sessao, loop pendingList sem isPending guard, cleanup duplicatas sem endTime, `cleanedUpUsers` Set in-memory nao escala.

**Coach (7):** `assembleContext` legado quebra cache Anthropic (re-cobra KBs por msg), `executeConfirmed` nao re-valida via Zod, `readThemeWithLinkedStatsAndSpots` ownership falha aberto + leak de spots de outros users, content_preview sem scrub injection tokens, saveMessage fora do try/finally, archive+create sem transaction, rate limit hardcoded 30 ignorando tier.

**Biblioteca (5):** signed URL endpoint sem rate limit, auto-advance sem hasAccess check, `access_blocked` event spoofable, Mux token sem userId claim, watermark CSS removivel.

#### P2 — polish (29 totais)

29 itens cobrindo cache invalidation parcial UI (FX panel, transfer dialog), tokens response duplicado em login, requireAuth sem cache, BOM/Latin-1 encoding, multer 10MB vs frontend 50MB, ROI divergente cross-views, parsers de data sem TZ explicito, postMessage origin validation, progress sem cap, DOMPurify singleton contamination, ReactMarkdown sem rehypeSanitize, useTabFromUrl nao usado em CoachAI.

### 1.7 Recomendacao

**BLOQUEAR launch** ate fixar todos 25 P0 + minimo 18 P1 prioritarios.

**Estimativa de esforco:**
- Coach (7 P0): 2-3 dias (basicamente refazer endpoint chat com tools+tier+cache+abort+model)
- Auth (6 P0): 1-2 dias (OAuth fix + refresh race + reset Zod + AuthContext cleanup)
- Bankroll (3 P0): 1-2 dias (snapshot v2 unification + fxResolver wiring)
- CSV (3 P0): 1-2 dias (TZ normalization + buyIn validation)
- Biblioteca (3 P0): 1 dia (signed URL wiring + entitlement gate + expiresAt check)
- Grind-Live (3 P0): meio dia (3 status checks + mutation guard)
- Typecheck (5 bugs): meio dia
- 212 testes red: 1-2 dias triagem (boa parte reflete os P0 acima)

**Total: 8-12 dias dev focado.** Sem fix de coach, plataforma nao "lanca" — coach AI quebrado eh visivel pro user na primeira interacao.

**Proximo passo recomendado:** spawn implementer agents em paralelo por modulo (auth + bankroll + biblioteca + grind-live independentes; coach + csv sequenciais por overlap em storage.ts).

---

## FASE 2 — Analise de Seguranca

**Pre-requisito:** Fase 1 completa.

### 2.1 OWASP Top 10

- [ ] A01 Broken Access Control — verificar requirePermission em todos endpoints
- [ ] A02 Cryptographic Failures — JWT secrets rotation, bcrypt rounds, HTTPS only
- [ ] A03 Injection — Drizzle params, sanitizar HTML coach, escape no DOMPurify
- [ ] A04 Insecure Design — rate limit em todos endpoints sensiveis
- [ ] A05 Security Misconfiguration — helmet, CORS, headers prod
- [ ] A06 Vulnerable Components — `npm audit` zero high/critical
- [ ] A07 Identification & Auth Failures — password policy, session timeout, MFA roadmap
- [ ] A08 Software & Data Integrity — verificar SRI nos assets, signed cookies
- [ ] A09 Logging Failures — logs sem PII, sem secrets, retention
- [ ] A10 SSRF — fetch externos validados (xAI, Mux, Stripe)

### 2.2 Auth especifico

- [ ] Password reset token expiry + single-use
- [ ] Refresh token rotation
- [ ] OAuth state CSRF
- [ ] Brute force: rate limit login + account lockout
- [ ] Email verification obrigatorio antes de pagamento

### 2.3 Secrets + env

- [ ] Zero secret commitado no repo (`git log -p | grep -i "secret\|password\|key"`)
- [ ] `.env.example` atualizado sem valores reais
- [ ] Producao: secrets em vault (Coolify env / Doppler)
- [ ] Rotacao plano: JWT_SECRET, DB password, API keys

### 2.4 Pen test basico

- [ ] Tentativa de SQL injection em todos forms
- [ ] XSS em textareas (bug reports, coach messages, study notes)
- [ ] CSRF em mutations sem token
- [ ] IDOR: tentar acessar recurso de outro user via ID
- [ ] Path traversal em upload de imagens (spots)
- [ ] SSRF em coach tools que fazem fetch

### 2.5 Compliance

- [ ] LGPD: consentimento, data export, data deletion
- [ ] Termos de uso + politica de privacidade
- [ ] Cookie banner (se necessario)

---

## FASE 3 — Analise de Escalabilidade

**Pre-requisito:** Fase 2 completa.

### 3.1 Database

- [ ] EXPLAIN ANALYZE nas queries mais usadas (dashboard, library, sessions)
- [ ] Indexes faltando (ver `pg_stat_statements`)
- [ ] N+1 queries auditadas (lesson learned do grind audit)
- [ ] Connection pool tuning (Neon serverless)
- [ ] Backup automatico + test restore

### 3.2 Backend

- [ ] Rate limiting por user em todos endpoints
- [ ] Cache server-side (focusStats pattern) em queries pesadas
- [ ] Cron jobs (FX, news) com lock para single-instance
- [ ] Graceful shutdown
- [ ] Health check endpoint

### 3.3 Frontend

- [ ] Code splitting por rota
- [ ] Lazy load de componentes pesados (Recharts, MuxPlayer)
- [ ] Image optimization (logos redes, Mux thumbs)
- [ ] TanStack Query cache config (staleTime + gcTime)
- [ ] Prefetch nas rotas mais visitadas

### 3.4 Load test

- [ ] k6 / artillery: 100 users concorrentes no dashboard
- [ ] Stress upload: 50 CSVs simultaneos
- [ ] Coach: 20 conversas paralelas
- [ ] Identificar bottleneck (DB? CPU? memoria?)

### 3.5 Observability

- [ ] Logs estruturados (pino / winston)
- [ ] Metrics (Prometheus / Datadog / Grafana)
- [ ] APM (Sentry para errors + traces)
- [ ] Uptime monitoring (UptimeRobot / Better Stack)
- [ ] Alertas: CPU >80%, error rate >1%, latency p95 >2s

---

## FASE 4 — Deploy Producao + Dominio

**Pre-requisito:** Fases 1-3 completas. **NAO invocar deployer sem confirmacao founder.**

### 4.1 Infra

- [ ] Decisao: Coolify VPS / Vercel / Railway / fly.io
- [ ] DB: Neon prod project criado
- [ ] Storage: S3-compat para spot images (ADR-057)
- [ ] CDN: Cloudflare na frente
- [ ] SMTP: Resend / Postmark / SendGrid

### 4.2 Dominio

- [ ] Compra dominio (app.grindfy.com / grindfy.com)
- [ ] DNS: A/CNAME records
- [ ] SSL: Let's Encrypt auto-renew
- [ ] Subdominios: app, api, admin, docs

### 4.3 Pipeline CI/CD

- [ ] GitHub Actions: lint + typecheck + tests no PR
- [ ] Auto-deploy main -> staging
- [ ] Manual promote staging -> prod
- [ ] Rollback plan documentado

### 4.4 Smoke test producao

- [ ] Signup -> verify email -> login funciona
- [ ] Upload CSV real -> dashboard reflete
- [ ] Coach responde
- [ ] Biblioteca: video play
- [ ] Bankroll: criar wallet + transferir

### 4.5 Backup + DR

- [ ] DB backup diario automatizado
- [ ] Storage backup
- [ ] Test de restore documentado

---

## FASE 5 — PWA Desktop

**Pre-requisito:** Fase 4 completa + dominio HTTPS.

### 5.1 Manifest + Service Worker

- [ ] `manifest.json` com icons (192, 512, maskable)
- [ ] Theme color, background, display: standalone
- [ ] Service worker com Workbox
- [ ] Cache strategy: stale-while-revalidate para assets
- [ ] Offline fallback page

### 5.2 Install prompt

- [ ] `beforeinstallprompt` capturado + UI custom
- [ ] CTA "Instalar app" no header
- [ ] Onboarding pos-install

### 5.3 Desktop-specific

- [ ] Window controls overlay (custom titlebar opcional)
- [ ] Keyboard shortcuts global
- [ ] File system access (drag-drop CSV direto na janela)
- [ ] Notification permission flow

### 5.4 Test

- [ ] Lighthouse PWA score >= 90
- [ ] Install + uninstall em Win/Mac/Linux
- [ ] Offline: dashboard cache funciona
- [ ] Update: novo deploy notifica + skip waiting

---

## FASE 6 — Marketing Lancamento

**Pre-requisito:** Fase 5 completa.

### 6.1 Landing page

- [ ] Hero + value props
- [ ] Demo video / screenshots
- [ ] Pricing
- [ ] FAQ
- [ ] Testemunhos (beta users)

### 6.2 Onboarding

- [ ] Empty states com call to action
- [ ] Tour guiado primeiro acesso (intro.js / shepherd)
- [ ] Sample data para visualizar antes de upload
- [ ] Email sequence pos-signup (D0, D1, D7, D30)

### 6.3 Analytics

- [ ] PostHog / Plausible / Mixpanel
- [ ] Funil signup -> primeiro upload -> primeira sessao
- [ ] Heatmap (Hotjar / Microsoft Clarity)

### 6.4 SEO

- [ ] Meta tags + OG image
- [ ] Sitemap + robots.txt
- [ ] Blog: 3+ artigos sobre poker analytics

### 6.5 Comunicacao

- [ ] Discord / Telegram comunidade
- [ ] Suporte: Crisp / Intercom / email
- [ ] Roadmap publico (Productboard / Trello)
- [ ] Changelog publico

### 6.6 Beta -> GA

- [ ] Lista de beta testers convidados
- [ ] Feedback loop (forms + entrevistas)
- [ ] Pricing tier gratuito definido
- [ ] Anuncio publico (Twitter, Reddit /r/poker, fóruns)

---

## Notas

- Cada fase gera commits separados em branches `launch/fase-N-descricao`.
- Bugs P0 bloqueiam avanco entre fases.
- Documento atualizado a cada audit / merge.
