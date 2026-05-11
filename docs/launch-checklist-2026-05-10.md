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

**Pre-requisito:** Fase 1 completa. **Status:** AUDIT COMPLETO 2026-05-11.

### 2.0 Resultado dos Audits — 2026-05-11

**Pipeline:** 4 reviewer agents paralelos + npm audit + secrets check.

**Cobertura:**
- Agent A (OWASP server-side): 173 endpoints / 17 modulos. 31 findings.
- Agent B (Frontend XSS/CSRF/bundle): ~25 files client/. 13 findings.
- Agent C (Auth pen-test): auth.ts + oauth.ts + routes/auth.ts + emailService.ts + AuthContext.tsx. 23 findings.
- Agent D (SSRF/IDOR/path traversal): 17 routes + 4 services + storage backends. 17 findings.

**Total raw:** 84 findings (overlap IDOR Agent A x D). **Deduplicado:** ~14 P0, ~25 P1, ~30 P2.

#### npm audit (A06 Vulnerable Components)

| Pkg | Versao | Severidade | Fix |
|-----|--------|------------|-----|
| drizzle-orm | 0.39.3 | **HIGH** (CVE: SQLi via SQL identifiers <0.45.2) | upgrade 0.45.2 (semver major) |
| xlsx | 0.18.5 | **HIGH** (Prototype Pollution + ReDoS) | sem fix — substituir por exceljs |
| vite | 5.4.21 | MODERATE (path traversal /.map) | upgrade 8.0.12 (major) |
| nodemailer | 7.0.13 | MODERATE (SMTP CRLF injection) | upgrade 8.0.7 (major) |
| @anthropic-ai/sdk | 0.86.1 | MODERATE (filesystem perms Memory tool — nao usamos) | upgrade 0.95.2 (major) — opcional |
| drizzle-kit | 0.30.6 | MODERATE chain (esbuild) | upgrade 0.31.10 (major) |

#### Secrets scan

- `.env*` files NUNCA commitados (git log full-history clean).
- `.env.example` sem valores reais (so placeholders).
- Git log grep secret/password/key/token — nenhum match de leak (so feature commits).

#### P0 — bloqueia launch (14 totais)

**IDOR sweep (7 — Agent A + D overlap):**
1. `server/routes/tournaments.ts:148-178` — PUT/DELETE `/api/tournaments/:id` sem ownership check. `storage.updateTournament(id)` / `deleteTournament(id)` fazem WHERE id-only.
2. `server/routes/grade-planner.ts:183-281` — PUT `/api/planned-tournaments/:id` sem ownership (DELETE da mesma rota faz check correto — copiar pattern).
3. `server/routes/studies.ts:74-90` — PATCH/DELETE `/api/study-cards/:id` sem ownership + nao stripa `req.body.userId`.
4. `server/routes/studies.ts:140-156` — DELETE `/api/study-notes/:id` + DELETE `/api/study-materials/:id` raw `db.delete().where(eq(id))` sem JOIN ownership.
5. `server/routes/calendar.ts:505-660` — PUT/DELETE `/api/calendar-categories/:id` + PUT `/api/calendar-events/:id` (branch single-edit) sem ownership.
6. `server/routes/misc.ts:89-98` — PUT `/api/coaching-insights/:id` sem ownership.
7. `server/routes/notifications.ts:26-34` — POST `/api/notifications/:id/mark-read` sem ownership.

**Auth (3 — Agent C):**
8. `server/routes/auth.ts:526-548` — Reset password token NAO marca `usedAt` apos consumido. Replay 1h window: atacante intercepta link, espera vitima resetar, faz POST reset-password de novo com mesma senha — sobrescreve. Padrao `emailService.ts:222-225` (verify email) faz correto.
9. `server/routes/auth.ts:48-61` — `authRateLimit` keyGen `${req.ip}:${email}` permite flood via plus-addressing (`victim+1@`, `victim+2@`). Sem `app.set('trust proxy')` quebra completamente atras de Coolify/Cloudflare (req.ip vira IP do proxy = compartilhado global).
10. `server/oauth.ts:148-218` — Cria user com `emailVerified: oauthData.verified || false`. Login bloqueia, mas conta criada permite atacante chamar forgot-password do email da vitima (account takeover via OAuth provisioning).

**Frontend (3 — Agent B):**
11. `client/src/pages/VerifyEmailPage.tsx:46-47` — Grava access+refresh token em `localStorage` no auto-login pos-verify. Anula modelo httpOnly do resto da app. Qualquer XSS exfila refresh 30d.
12. `client/index.html:14` — `<script src="https://replit.com/public/js/replit-dev-banner.js">` legado migracao Replit, carrega em PROD. Sem SRI.
13. `server/routes/index.ts:82-103` — CSP `scriptSrc 'unsafe-inline'` em prod (XSS via injection trivial). CSP `connectSrc` sem Mux/Anthropic/xAI/Google (vai quebrar streams quando endurecer policy).

**Logging (1 — Agent A):**
14. `server/index.ts:14-42` — Middleware stringifica `res.json()` body em logLine. Login/refresh/verify-email retornam tokens no body. Truncate 80 chars eh client-facing mas `capturedJsonResponse` em memoria pode vazar em log aggregator.

#### P1 — quebra fluxo (resumo, ~25 totais)

**Server (Agent A — 11):**
- `app.set('trust proxy')` ausente quebra rate limit + req.ip
- Zod validation ausente em POST `/api/notifications`, admin extend-subscription, update-subscription-plan
- `err.message` ecoado ao cliente em prod (schema leak)
- CORS nao configurado (vira problema quando frontend mudar de origem)
- `console.error(err)` cru em ~50 sites loga query SQL/conn string
- Multer upload-history sem `fileFilter`
- Refresh token TTL 30d sem rotation/denylist server-side
- Account lockout 5min curto + sem CAPTCHA + sem email warning vitima
- Email verification token cleanup em hot path (DoS via flood)
- POST `/api/notifications/:id/mark-read` IDOR (overlap)

**Frontend (Agent B — 6):**
- `<a href={lesson.url}>` sem `isSafeUrl()` em CoachLessonRecommendationCard, MaterialCard, NewsFeed — `javascript:` scheme XSS
- `<style dangerouslySetInnerHTML>` em chart.tsx config CSS injection latente
- CSRF cookie sem `__Host-` prefix (subdominio comprometido = cookie tossing)
- `process.env.APP_VERSION` em HomeFooter pattern fragil (anti-pattern bundle)
- ReactMarkdown SEM `rehypeSanitize` explicito em Coach/MiniChat/CoachAI
- EmailPreviewCard dangerouslySetInnerHTML XSS latente se template virar dynamic

**Auth (Agent C — 8):**
- Refresh token sem rotation real + sem family detection
- Cookie `sameSite: 'strict'` quebra OAuth callback em Safari/Brave
- OAuth state store in-memory (perde em restart, nao escala multi-instance)
- OAuth `/api/auth/google` + `/callback` sem rate limit
- Auth tokens em DB em plaintext (DB leak = todos tokens validos)
- Subscription endpoints sem `requireVerifiedEmail` gate
- MFA ausencia total (ADR roadmap)
- `/api/auth/refresh` fallback body sem CSRF + sem rate limit

**SSRF/Files (Agent D — 4):**
- News blogScraperProvider segue redirects sem allowlist (AWS metadata / localhost / interna)
- urlValidator + per-article enrichment idem
- CSV upload aceita ANY MIME ate 10MB (xlsx CVE chain via SheetJS)
- Spot screenshot allowlist tem `image/jpg` MIME nao-oficial (cosmetico)

#### P2 — polish (~30 totais)

Cobrindo: JWT sem `iss/aud/jti` claims, JWT sem verify `type` claim, logout em todos dispositivos, bcrypt cost 12 OK (considerar 13), lockout sem progressive backoff, lockout sem reset por janela deslizante, reset token TTL 1h longo (15-30min OWASP), verify-email auto-login 30d sessao, authTokens index unico (`user_id, type, used_at IS NULL`), trust proxy, OAuth state nanoid 126 bits ok mas inconsistente com randomBytes(32), JWT decode no client fragil, super-admin bypass sem audit trail dedicado, CSP `unsafe-inline` styles + scripts, CSP `connectSrc ws:` em prod, bulk-delete sem MFA confirmation, admin extend-subscription bug funcional (nao atualiza `subscriptionEndsAt`), listagem admin retorna password hash sem projection, accessLogs.metadata.url com query strings sensitivos, `parseInt(limit)` sem clamp em alguns handlers, library asset sem `X-Content-Type-Options: nosniff`, JWT_SECRET sem validacao de entropia, OAuth callback `req.protocol`+`req.get('host')` permite proxy injection, etc.

### 2.1 Recomendacao + Plano Waves

**BLOQUEAR launch** ate fixar 14 P0 + minimo 15 P1 prioritarios + 2 HIGH npm vulns.

**Plano implementer (5 waves, paralelizadas onde possivel):**

#### Wave 1 — Quick wins infra (1 dia, sequencial)
1. `app.set('trust proxy', 1)` em server/index.ts
2. Token leak request logger — whitelist skip body log em `/api/auth/*`
3. Generic error responses em prod (`NODE_ENV==='production'` gate em global handler + try/catch routes)
4. Multer `fileFilter` em upload-history (CSV/XLSX whitelist + magic byte check)
5. Remove `<script src="https://replit.com/...">` de client/index.html
6. CSP fix: `connectSrc` adicionar Mux + Anthropic + xAI + Google OAuth; `ws:` so em dev
7. Reset token mark `usedAt` apos consume (1-linha UPDATE)

#### Wave 2 — IDOR sweep (2 dias, paralelo 2 implementers)
- Implementer A: tournaments, planned-tournaments, calendar (categories+events), coaching-insights
- Implementer B: study-cards, study-notes, study-materials, notifications

Padrao: mudar storage methods `update*(id, data)` → `update*(id, userId, data)` injetando `and(eq(id), eq(userId))` no WHERE. Pre-check `get*(id, userId)` no handler retorna 404.

#### Wave 3 — Auth hardening P0 (1.5 dias, sequencial)
1. VerifyEmailPage: server-side handler retornar Set-Cookie httpOnly + remover `localStorage.setItem` no frontend + `clearStoredAuth` retroativo
2. OAuth `verified !== true` block: throw em `createOrUpdateOAuthUser` se vier `false`; decodificar `id_token` JWT + checar `email_verified` claim
3. Rate-limit `forgot-password` dedicado: keyed APENAS no email normalizado (strip plus-addressing) + max 3/hora; combinar com IP-based atual

#### Wave 4 — npm vulns (0.5 dia, sequencial)
1. `drizzle-orm` 0.39.3 → 0.45.2 (SQLi fix HIGH) — semver major, testar migrations + queries
2. `xlsx` 0.18.5 → substituir por `exceljs` (sem fix disponivel, prototype pollution + ReDoS HIGH) — afeta upload-history WPN xlsx parser
3. `vite` 5.4.21 → 6.x (path traversal moderate, semver major)
4. `nodemailer` 7.0.13 → 8.0.7 (SMTP injection moderate, semver major)
5. `drizzle-kit` 0.30.6 → 0.31.10 (chain via esbuild)
6. Opcional: `@anthropic-ai/sdk` 0.86.1 → 0.95.2 (filesystem perms — nao usamos Memory tool, low risk)

#### Wave 5 — P1 hardening (3-4 dias, paralelo)
- Refresh token rotation com DB table + family detection + revogacao server-side (logout, password change, force-logout)
- Hash de reset/verify tokens no DB (sha256 storage; raw so no email)
- `isSafeUrl()` helper FE bloqueando javascript:/data:/vbscript:/file: + apply em href user-input
- ReactMarkdown `rehypeSanitize` explicito em Coach/MiniChat
- SSRF allowlist `safeFetch()` helper centralizado para news services (block 127.0.0.1, 169.254.169.254, RFC1918, IPv6 link-local)
- CORS allowlist explicita em `server/index.ts`
- CSRF cookie `__Host-` prefix em prod
- Cookie `sameSite: 'lax'` (`strict` quebra OAuth callback)
- Generic error responses em todas routes (em vez de `err.message`)
- Constant-time forgot-password (async SMTP dispatch + dummy bcrypt em login com user inexistente)
- Lockout progressivo (5min → 30min → 24h)
- `requireVerifiedEmail` middleware em subscription endpoints
- Zod schemas completos em POST notifications + admin extend-subscription + update-subscription-plan

#### Wave 6 — P2 polish (deferivel pos-launch)
JWT claims, audit trail super-admin, CSP nonces, listagem admin com projection, bulk-delete MFA, etc.

**Estimativa total:** Wave 1+2+3+4 = ~5 dias dev focado. Wave 5 = ~4 dias. Total bloqueante launch = ~9 dias.

### 2.2 OWASP Top 10 — checklist final

- [ ] A01 Broken Access Control — 7 IDOR P0 fix (Wave 2)
- [ ] A02 Cryptographic Failures — refresh rotation + hash tokens DB (Wave 5)
- [ ] A03 Injection — Zod completo + Drizzle params confirmados zero raw SQL (Wave 5)
- [ ] A04 Insecure Design — rate limit OAuth + bulk-delete + upload (Wave 1+5)
- [ ] A05 Security Misconfiguration — CSP + CORS + trust proxy + generic errors (Wave 1+5)
- [ ] A06 Vulnerable Components — drizzle-orm + xlsx + vite + nodemailer (Wave 4)
- [ ] A07 ID & Auth Failures — VerifyEmailPage + OAuth verified + lockout progressive (Wave 3+5)
- [ ] A08 Software & Data Integrity — SRI assets prod build (Wave 5)
- [ ] A09 Logging Failures — token leak logger + console.error sanitization (Wave 1+5)
- [ ] A10 SSRF — safeFetch helper news + urlValidator (Wave 5)

### 2.3 Compliance (deferida pos-launch tecnico)

- [ ] LGPD: consentimento, data export endpoint, data deletion endpoint
- [ ] Termos de uso + politica de privacidade docs
- [ ] Cookie banner (apenas se necessario apos audit cookie)
- [ ] MFA roadmap ADR (out-of-scope launch tecnico)

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
