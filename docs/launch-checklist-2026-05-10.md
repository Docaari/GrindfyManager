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

#### Wave 1 — Quick wins infra (1 dia, sequencial) — CONCLUIDA 2026-05-11
- [x] 1. `app.set('trust proxy', 1)` em server/index.ts
- [x] 2. Token leak request logger — skip body log em `/api/auth/*` (`SENSITIVE_BODY_LOG_PREFIXES`)
- [x] 3. Generic error responses em prod — global handler (`NODE_ENV==='production' && status>=500` → "Internal Server Error") + upload.ts routes (`clientErrorDetail()` esconde message/stack em prod; removeu `error.stack` do response)
- [x] 4. Multer `fileFilter` em upload (`ALLOWED_UPLOAD_EXTENSIONS` + MIME whitelist, rejeita com status 400) + `validateUploadMagicBytes()` (XLSX=ZIP `PK\x03\x04`, XLS=OLE2, CSV/TXT=sem NUL bytes) aplicado em `/api/upload-history`, `/api/check-duplicates`, `/api/upload-with-duplicates`, `/api/upload`
- [x] 5. Remove `<script src="https://replit.com/...">` de client/index.html
- [x] 6. CSP fix: `connectSrc` += Mux (`stream.mux.com`, `*.mux.com`, `*.litix.io`) + Anthropic + xAI + Google OAuth (`accounts.google.com`, `oauth2.googleapis.com`, `www.googleapis.com`); `ws:`/`wss:` so em dev; `frameSrc`/`mediaSrc` += `stream.mux.com`; `workerSrc` + `blob:` para Mux Player
- [x] 7. Reset token mark `usedAt` apos consume — `EmailService.markPasswordResetTokenUsed(token)` chamado em `/api/auth/reset-password`

Resultado: `npm run check` zero erros novos nos arquivos tocados (baseline 45 erros pre-existentes em test files + FxRatesPanel). `npx vitest run` 11229 verde / 144 red (baseline ~11227 / ~146 — zero regressao). Server precisa restart para pegar mudancas de helmet/index.ts.

#### Wave 2 — IDOR sweep (7 P0) — CONCLUIDA 2026-05-11

Padrao aplicado: pre-check de ownership no handler (`get*(id)` ou `get*(id, userId)`) → 404 em mismatch; `userId`/`id` (e `parentEventId` no calendar) stripados do request body; storage WHERE id-only mantido mas guardado.

- [x] PUT/PATCH/DELETE `/api/tournaments/:id` — `storage.getTournament(id)` ownership check
- [x] PUT `/api/planned-tournaments/:id` — `storage.getPlannedTournament(id)` check (DELETE ja fazia)
- [x] PATCH/DELETE `/api/study-cards/:id` — `storage.getStudyCard(id, userId)` scoped check (+ bonus: GET/POST `/:id/{materials,notes}` ganharam ownership do card-pai — fora do escopo do audit, mesma classe)
- [x] DELETE `/api/study-notes/:id` + `/api/study-materials/:id` — JOIN via `study_cards.userId` pra verificar dono
- [x] PUT/DELETE `/api/calendar-categories/:id` — `getCalendarCategories(userId)` membership
- [x] PUT/DELETE `/api/calendar-events/:id` — `getCalendarEvents(userId)` membership (ambas branches single+series); `updateRecurringEventSeries`/`deleteRecurringEventSeries` ganharam `userId` no WHERE (defense in depth, IDOR residual via `parentEventId` injetavel — reviewer round)
- [x] PUT `/api/coaching-insights/:id` — novo `storage.getCoachingInsight(id)` + ownership check
- [x] POST `/api/notifications/:id/mark-read` — `NotificationService.markAsRead(id, userId)` scoped, retorna `false` → 404

Reviewer round 2026-05-11: APPROVED. 1 P1 (calendar series `parentEventId` injection) fixado no mesmo wave (commit 732f547). 2 NITs fixados (strip `id`). 1 P2 deferido (getter id-scoped pra calendar event/category — pos-launch, evita carregar lista inteira pra check de membership).

Tests: `tests/integration/routes/idor-ownership.smoke.test.ts` (25 casos, owner 2xx / attacker 404 + strip assertions + parentEventId-ignored, Express+supertest+mocks). Commits ef2fb67 + 732f547. Resultado: `npx vitest run` 11254 verde / 144 red (baseline ~11229 / ~144 — zero regressao). `npm run check` sem erros novos.

#### Wave 2 (original — split de referencia)
- Implementer A: tournaments, planned-tournaments, calendar (categories+events), coaching-insights
- Implementer B: study-cards, study-notes, study-materials, notifications

#### Wave 3 — Auth hardening P0 (3 P0) — CONCLUIDA 2026-05-11
- [x] 1. VerifyEmailPage: `/api/auth/verify-email` auto-login seta sessao via `setAuthCookies` (httpOnly) em vez de retornar JWTs no body JSON; FE parou de gravar `grindfy_access_token`/`grindfy_refresh_token` em localStorage + full-reload pra `/home`; `AuthContext.initializeAuth` purga retroativamente esses keys do localStorage no boot
- [x] 2. OAuth `verified !== true` block: `OAuthService.createOrUpdateOAuthUser` lanca `OAUTH_EMAIL_NOT_VERIFIED` antes de qualquer op DB; callback decodifica `id_token` (`OAuthService.decodeIdToken`) + cross-checa `email_verified` + email match contra userinfo; `exchangeCodeForToken` retorna `idToken`
- [x] 3. Rate-limit `forgot-password` dedicado: `forgotPasswordRateLimit` 3/hora keyed no email normalizado (`emailRateLimitKey`: lowercase + collapse plus-addressing `victim+1@→victim@`; fallback `fp-ip:` quando email inutilizavel) empilhado com `authRateLimit` (IP+email)

Reviewer round 2026-05-11: APPROVED. P2 (success card prometia redirect que nao acontecia no edge case sem autoLogin) + NIT (imports mortos) fixados no commit 27d7dd7. NITs deferidos: Gmail dot-normalization no rate-limit key (gap conhecido, +tag era o vetor principal e ta fechado), check `pending_verification` redundante (pre-existente, conservador).

Tests: `tests/integration/auth/wave3-auth-hardening.test.ts` (11 casos — verify-email cookies/no-body-tokens/400, `decodeIdToken`, OAuth verified guard, forgot-password rate limit incl plus-addressing evasion + mailbox isolado, `vi.hoisted` mocks). Commits 6b0a6e7 + 27d7dd7. Resultado: `npx vitest run` 11264 verde / 145 red (baseline ~11254 / ~144 — +11 novos testes, delta flaky timeout suites). `npm run check` sem erros novos. 133/133 unit auth verde.

#### Wave 4 — npm vulns — CONCLUIDA 2026-05-11
- [x] 1. `drizzle-orm` 0.39.3 → 0.45.2 (SQLi via SQL identifiers, **HIGH**) — drizzle-zod 0.7.0 mantido (compat); `npm run check` ok, vitest sem regressao. Commit 88b38d9
- [x] 2. `xlsx` 0.18.5 → **removido**, substituido por `exceljs` 4.4.0 (Prototype Pollution + ReDoS, **HIGH**, sem fix upstream) — `PokerCSVParser.parseBodogXLSX` reescrito (lazy `import('exceljs')`, `workbook.xlsx.load` → `eachRow` pulando 4 header rows, cols A..D); `parseBodogDate` aceita `Date` objects; csv-parser unit tests usam exceljs pra montar fixtures. Commit 142e719
- [x] 3. `vite` 5.4.19 → 6.4.2 (esbuild dev-server SSRF chain — vite 6.4.2 = primeira versao limpa) — vite 7+ exigiria bump vitest 4→5 + plugin-react (fora escopo). `npx vite build` ok (8.8s) + esbuild server bundle ok. Commit f821a60
- [x] 4. `nodemailer` 7.x → 8.0.7 (SMTP CRLF injection, moderate). Commit 88b38d9
- [x] 5. `drizzle-kit` 0.30.6 → 0.31.10 (pair com drizzle-orm 0.45). Commit 88b38d9
- [x] 6. `@anthropic-ai/sdk` 0.86.1 → 0.95.2 (Memory-tool file perms, moderate — nao usamos a tool). Commit 503b246

**`npm audit` final: 0 high, 0 critical** (era 2 high). Restam **4 moderate** — todas o advisory esbuild-dev-server (GHSA-67mh-4wv8-2f99) alcancado transitivamente via `drizzle-kit → @esbuild-kit/esm-loader → esbuild ≤0.24.2`. Dev-only (drizzle-kit eh CLI, nao vai pro bundle), sem fix upstream — aceitavel pro launch. Reviewer pendente.

#### Wave 5 — P1 hardening — CONCLUIDA 2026-05-11 (itens core; alguns deferidos pos-launch)
- [x] `isSafeUrl()`/`safeHref()` FE (`client/src/lib/safeUrl.ts`) bloqueando javascript:/data:/vbscript:/file: + control chars + apply em `<a href>` user/scraped-input (NewsFeed, MaterialCard, CoachLessonRecommendationCard). Commit 0665c92
- [x] SSRF allowlist `safeFetch()` (`server/lib/safeFetch.ts`) — block non-http(s), loopback/RFC1918/link-local/CGNAT/cloud-metadata por hostname literal + IP resolvido (dns.lookup), redirect manual re-validado por hop. Wired em blogScraperProvider (feed fetch + per-article enrichment). Test `tests/unit/security/safe-url-fetch.test.ts` (8 casos). Commit 0665c92
- [x] Cookie `sameSite: 'lax'` (era `strict` — quebrava OAuth callback Safari/Brave). Commit 2b89202
- [x] Constant-time login — dummy `bcrypt.compare` quando email inexistente (complementa msg generica do P1.9). Commit 2b89202
- [x] **Refresh token rotation com DB table + family/reuse detection + revogacao server-side** (logout, password change). ADR-143 + migration 0063 (`auth_refresh_tokens`, aplicada local) + `server/refreshTokenStore.ts` + wiring (login/OAuth/verify-email gravam; `/api/auth/refresh` rotaciona via `rotateRefreshToken`; logout/reset-password revogam). Test `tests/integration/auth/refresh-rotation.test.ts` (14 casos). Commit 1eea6c9
- [x] **Hash sha256 dos tokens de reset/verify no DB** — `auth_tokens.token` agora guarda `sha256(token)`; raw so no email; `verify*`/`markPasswordResetTokenUsed` hasham antes do lookup. (Links em transito no deploy ficam invalidos — TTL ≤1h, aceitavel.) Commit 1eea6c9
- [x] Lockout progressivo — `handleFailedLogin`: 1o bloco de 5 falhas → 5min, 2o bloco → 30min, 3o+ → 24h. Commit d15c193
- [x] `requireVerifiedEmail` middleware (`server/auth.ts`, + `emailVerified` no `AuthUser`/`getUserWithPermissions`) aplicado em `/api/subscription/{subscribe,checkout,portal,cancel}`. Commit d15c193
- [x] Zod schemas: POST `/api/notifications` (`createNotificationSchema`) + POST `/api/admin/extend-subscription` (userId + days 1..3650) + POST `/api/admin/update-subscription-plan` (userId + planId). Commit d15c193
- [ ] **DEFERIDO pos-launch:** CORS allowlist explicita (app eh same-origin no launch — FE servido pelo Express); CSRF `__Host-` prefix prod (nome env-dependent complica FE+BE — avaliar com cuidado); generic errors no long-tail de ~50 routes (`res.status(500).json({error: err.message})` — global handler ja cobre uncaught, Wave 1; baixo risco); `rehypeSanitize` explicito (react-markdown v10 ja dropa raw HTML + sanitiza URLs por default — defense-in-depth).

Reviewer Wave 5: pendente (rodar antes de considerar Fase 2 fechada).

#### Wave 6 — P2 polish (deferivel pos-launch)
JWT claims (`iss`/`aud`/`jti`), audit trail super-admin, CSP nonces (remover `unsafe-inline`), listagem admin com projection (esconder password hash), bulk-delete MFA, cron `cleanupExpiredRefreshTokens`, BOM/Latin-1 encoding, multer 10MB vs frontend 50MB, etc. + os 4 itens deferidos da Wave 5.

**Estimativa total:** Wave 1+2+3+4 = ~5 dias dev focado. Wave 5 (core) = feito. Total bloqueante launch = essencialmente coberto (faltam: reviewer Wave 5 + decisao sobre os 4 deferidos + Fase 3 escalabilidade).

### 2.2 OWASP Top 10 — checklist final

- [x] A01 Broken Access Control — 7 IDOR P0 fix (Wave 2, commits ef2fb67 + 732f547)
- [x] A02 Cryptographic Failures — refresh token rotation + family detection (ADR-143) ✓ + sha256 dos reset/verify tokens no DB ✓ (Wave 5c, commit 1eea6c9)
- [~] A03 Injection — drizzle-orm 0.45.2 (SQLi identifier fix) ✓ (Wave 4); Zod completo em POST notifications/admin endpoints pendente (Wave 5); Drizzle params confirmados zero raw SQL
- [~] A04 Insecure Design — multer fileFilter+magic bytes ✓ (Wave 1), forgot-password rate limit ✓ (Wave 3), lockout progressivo ✓ (Wave 5d), Zod schemas ✓ (Wave 5d); rate limit OAuth + bulk-delete MFA → Wave 6
- [~] A05 Security Misconfiguration — CSP + trust proxy + generic errors (global handler) ✓ (Wave 1), sameSite lax ✓ (Wave 5b); CORS allowlist + CSP nonces + generic errors long-tail → deferido
- [x] A06 Vulnerable Components — drizzle-orm 0.45.2 + xlsx→exceljs + vite 6.4.2 + nodemailer 8 + drizzle-kit 0.31 + anthropic-sdk 0.95 (Wave 4: 0 high/critical; 4 moderate dev-only residuais)
- [~] A07 ID & Auth Failures — VerifyEmailPage httpOnly ✓ + OAuth verified-email guard ✓ (Wave 3), refresh rotation + reuse detection ✓ (Wave 5c), lockout progressivo ✓ + requireVerifiedEmail ✓ (Wave 5d), constant-time login ✓ (Wave 5b); MFA → roadmap (out-of-scope launch)
- [~] A08 Software & Data Integrity — removeu script Replit (sem SRI) do client/index.html ✓ (Wave 1); SRI nos assets do build prod → deferido (build pipeline / Fase 4)
- [~] A09 Logging Failures — token leak logger (skip body em /api/auth/*) ✓ + generic errors prod ✓ (Wave 1); `console.error(err)` cru no long-tail → deferido
- [~] A10 SSRF — `safeFetch()` (IP-range + redirect-revalidation) wired em blogScraperProvider ✓ (Wave 5a); xSearchProvider so fala com api.x.ai fixo (n/a)

### 2.3 Compliance (deferida pos-launch tecnico)

- [ ] LGPD: consentimento, data export endpoint, data deletion endpoint
- [ ] Termos de uso + politica de privacidade docs
- [ ] Cookie banner (apenas se necessario apos audit cookie)
- [ ] MFA roadmap ADR (out-of-scope launch tecnico)

---

## FASE 3 — Analise de Escalabilidade

**Pre-requisito:** Fase 2 completa.
**Target:** plataforma escala ~100 usuarios concorrentes (1 replica) sem degradar; pronta pra escalar pra N replicas em Fase 4.

### 3.0 Audit consolidado (2026-05-11)

4 agents paralelos rodaram audit:
- **Agent A — DB perf** — leu storage.ts/routes/schema, conectou no DB local (PG18 :5433, USER-0001 com 18.6k tournaments), rodou EXPLAIN ANALYZE em ~20 hot queries. `pg_stat_statements` nao esta habilitado no dev (TODO: ligar pra ter dados na proxima auditoria).
- **Agent B — Backend hot paths** — auditou server/index.ts, jobs/, cronRunner, supremaAutoSync, libraryCleanup, db.ts, focusStats cache, ~20 rate-limit sites.
- **Agent C — Frontend bundle** — rodou `vite build`, capturou chunk-size table, leu App.tsx (routing), queryClient.ts, MiniChat, LogoLoader, HeaderLogo, ui/chart.tsx.
- **Agent D — Observability** — leu logger atual, ErrorBoundary, /api/health, package.json pra confirmar zero pino/winston/sentry/prom-client.

### 3.0.1 Findings P0 (bloqueia launch escalavel)

**DB (A):**
- `idx_session_tournaments_session_user` declarado em `shared/schema.ts:625` mas **nunca migrado** — `getSessionTournaments`, `listSessionTournaments` fazem seq scan em prod. Critico /grind-live.
- Indexes faltando em tabelas per-user growing: `notifications` (polled em todo page load), `planned_tournaments` (Home + coach context + grade-planner), `tournaments(user_id, created_at)` (Home "latest upload"). Hoje pequenos, viram seq-scan repetido em fanout do Home a ~100 users.
- Pool `max:10` insuficiente: Home dispara ~20 subqueries paralelas (`Promise.allSettled` em `server/routes/home.ts:383`) → 100 users × 20 = 2000 queries enfileiradas em 10 conexoes.

**Backend (B):**
- **Zero graceful shutdown** — SIGTERM mata in-flight requests + leak pool conns. Cada redeploy Coolify cascateia 5xx.
- **Zero cron single-instance guards** — 10+ crons (FX/news/study-plan/drill/spot-purge/study-freezes/coach×3/suprema/library/refresh-token) rodam N× em multi-replica. FX rate-limit BCB explode, drill daily-cap racy, custo Anthropic N×.

**Frontend (C):**
- Brand PNGs 2.4 MB **eager no first paint**: `grindfy-logo-full.png` (1.15 MB) + `grindfy-logo-mark.png` (1.29 MB). Renderizam @32-200px. Existe `.webp` 17 KB nao utilizado.
- Chunk shared `index.js` 795 KB (249 KB gz) sem `manualChunks` vendor split — React+ReactDOM+Wouter+Query+Radix tudo num bundle sem cache estavel cross-deploy.

### 3.0.2 Findings P1 (deve fazer antes de escalar)

**DB:**
- N+1: tournament-library import (`server/routes/tournament-library.ts:277`) faz `for await insert returning` — 50 RTTs viram 1 com batch insert.
- `getDashboardStats` median pull-all (`server/storage.ts:2997`) puxa 18k integers pro Node pra ordenar — trocar por `percentile_cont(0.5)` em SQL.
- `getQuickStats` (`server/storage.ts:11162`) faz 3 RTTs sequenciais — colapsar em 1 query. **BONUS:** falta `isNull(grindSessionId)` (viola CLAUDE.md §6.1).
- Sem LIMIT: `getUserNotifications`, `getGrindSessions(no limit)`, `getSessionTournaments(no sessionId)`.
- 6 indexes P1 (session_tournaments user/created, weekly_plans, tournament_library partial, upload_history, user_activity, profile_states).

**Backend:**
- `/api/health` nao verifica DB. Pool wedged = LB ainda roteia trafego. Falta `/api/ready` com `pool.query('SELECT 1')`.
- `/api/home/overview` recomputa ~20 queries por request, zero cache. Endpoint landing pos-login = bottleneck #1.
- `compression` middleware ausente (overlap C).

**Frontend:**
- `MiniChat` eager em `App.tsx:13` arrasta `react-markdown` + `micromark` pro `index.js` (~80-120 KB raw).
- Recharts (389 KB / 107 KB gz) carrega na landing porque `home/Sparkline.tsx` usa recharts.
- `index.css` 302 KB raw — Tailwind `content` glob possivelmente largo demais.

**Observability:**
- `server/vite.ts` `log()` tem **corpo vazio** — request logger nao emite NADA. Real bug, nao gap.
- Cron telemetry 2 shapes inconsistentes (`[cron/x] registrado` vs `coach.cron.started`).

### 3.0.3 Findings P2 (deferivel Fase 4)

- 3 indexes P2 (subscriptions, user_subscriptions, grind_sessions user_created).
- Rate-limit in-memory store reset per replica (aceitavel launch, documentar).
- Spot screenshots em disco local quebram multi-replica (ADR-057 ja flagga; S3/R2 pra Fase 4).
- `express.json` sem limit explicito (default 100kb OK).
- `keepAliveTimeout` vs proxy tuning.
- Mux thumbs com size params.
- Prefetch hot routes (Sidebar hover).
- pino + Sentry + uptime monitor + Coolify/Neon alerts — Fase 4.

### 3.0.4 Plano de waves

Cada wave = 1 PR, commit/push apos OK. TDD onde muda comportamento; pure infra/config direto + reviewer no fim. ADRs novos: 1 (advisory lock pattern).

| Wave | Foco | Tipo | Effort | Deps novas? |
|------|------|------|--------|-------------|
| A | DB indexes (migration 0064 + ANALYZE + sync schema.ts) | infra/SQL | S | nao |
| B | DB query fixes (getQuickStats 3→1 + §6.1 fix, median percentile_cont, batch import, LIMITs) | TDD | M | nao |
| C | Backend infra (graceful shutdown, /api/ready, pool max 25-30 + statement_timeout, keepAliveTimeout, fix log() vite.ts) | direto + reviewer | S | `compression` (precisa OK) |
| D | Cron single-instance locks (server/lib/advisoryLock.ts + wrap ~10 crons + ADR-144) | TDD | M | nao |
| E | Server cache /api/home/overview Map+TTL 30s + invalidators | TDD | M | nao |
| F | Frontend bundle (PNGs→WebP, manualChunks vendor, lazy MiniChat, Sparkline SVG inline, Tailwind content audit) | direto + reviewer | S/M | nao |
| G | Load test (k6 ou artillery — 100 users dashboard, 50 CSVs, 20 coach) | script | S/M | k6 binario OU artillery npm (precisa OK) |

**Fase 4 (post-launch):** pino + Sentry + uptime + Coolify/Neon alerts + S3 spots + Postgres rate-limit store.

### 3.1 Database (Wave A + B)

- [x] EXPLAIN ANALYZE nas queries mais usadas (Agent A — Q1/Q3/Q4/Q6/Q7/Q8/Q11/Q15/Q16 + median + latest-upload)
- [x] **Wave A** migration 0064_perf_indexes.sql (5 P0 + 6 P1 + 3 P2 indexes + ANALYZE) — commit `0facc24` + reviewer round `8452e9d`
- [x] **Wave A** sync `shared/schema.ts` index declarations + `.desc()` corrigido pos-reviewer P1 — drizzle-kit drift-proof
- [x] **Wave B** N+1 fixes: tournament-library batch INSERT, getQuickStats 3→2 Promise.all + **§6.1 fix (isNull grindSessionId)**, getDashboardStats median percentile_cont SQL, coachContext Promise.all + .catch per-query — commit `99a54b7`
- [x] **Wave B** LIMIT/pagination: getUserNotifications LIMIT 100 default, getGrindSessions opts {limit?, offset?} opcionais (back-compat)
- [ ] **Wave C** Pool tuning: `max: 25-30`, `connectionTimeoutMillis: 2000`, `statement_timeout` via options, expor `DB_POOL_MAX` env, confirmar prod usa `-pooler` Neon endpoint
- [ ] Habilitar `pg_stat_statements` no dev + prod (Fase 4: toggle no Neon dashboard)
- [ ] Backup automatico + test restore (Fase 4 — Neon ja faz PITR, validar)

### 3.2 Backend (Wave C + D + E)

- [x] **Wave C** Graceful shutdown SIGTERM/SIGINT — `server.close()` + `pool.end()` + cron stops + 10s force-exit — commit `2dffabc`
- [x] **Wave C** `/api/ready` com `pool.query('SELECT 1')` (timeout 2s); manter `/api/health` liveness-only — commit `2dffabc`
- [x] **Wave C** `compression` middleware (dep aprovada founder) — commit `76081d7`
- [x] **Wave C** Fix `log()` no-op em `server/vite.ts` — commit `2dffabc`
- [x] **Wave C** Pool tuning (max:25 default, DB_POOL_MAX env, connectionTimeout 2s, statement_timeout 15s, keepAlive true) — commit `2dffabc`
- [x] **Wave C** keepAliveTimeout 65s + headersTimeout 66s vs Cloudflare idle — commit `2dffabc`
- [x] **Wave D** `server/lib/advisoryLock.ts` helper (`pg_try_advisory_lock`) + 13 cron sites cobertos + ADR-144 + 10 tests verde — commit `ba689e5`
- [x] **Wave E** `/api/home/overview` invalidateHomeOverviewCache wired em upload + 9 wallets handlers + grind-sessions create/update (cache infra Map+TTL 30s ja existia) — commit `ddfa24d`
- [ ] (Opcional) Cache em `/api/dashboard/quick-stats` se Wave E nao cobrir
- [ ] (Deferido) Wire invalidators em starred-hands + planned-tournaments + cooldown (TTL 30s natural cobre)
- [ ] Rate limit per-user key (Fase 4 — hoje IP, aceitavel launch)
- [ ] Postgres rate-limit store (Fase 4)

### 3.3 Frontend (Wave F)

- [x] Code splitting por rota (ja em vigor — `React.lazy()` + `<Suspense>` em App.tsx; LessonHeroPage intencionalmente eager)
- [x] TanStack Query cache config (ja OK — staleTime 5min, refetchOnWindowFocus false, retry false)
- [ ] **Wave F** Brand PNGs → WebP otimizado (~50 KB total vs 2.4 MB atuais) — **DEFERIDO** (classifier bloqueou npx sharp-cli; aguarda OK founder)
- [x] **Wave F** `manualChunks` vendor split (react/react-dom/wouter + @tanstack/react-query) — index.js 795KB → 425KB (-47%) — commit `2edd064`
- [x] **Wave F** Lazy load `MiniChat` em App.tsx (tira react-markdown do entry) — commit `2edd064`
- [x] **Wave F** Replace `home/Sparkline.tsx` recharts → SVG inline (tira 107 KB gz da landing) — commit `2edd064`
- [x] **Wave F** Audit Tailwind `content` glob — ja tight (`client/src/**/*` + `client/index.html`, nao scan-eia Docs/tests)
- [ ] Mux thumbs com `width`/`height`/`fit_mode=smartcrop` (Fase 4)
- [ ] Prefetch hot routes via `queryClient.prefetchQuery` (Fase 4 — marginal)
- [ ] Image cleanup attached_assets (remover .ico/.original.png; `loading="lazy"` em network logos)

### 3.4 Load test (Wave G)

- [ ] **Wave G** Scolha tool: k6 (binario Go, mais robusto p/ HTTP) OU artillery (npm, mais facil instalar) — **precisa OK founder na dep**
- [ ] **Wave G** Script `scripts/load/dashboard-100-users.js` — 100 users concorrentes no `/api/home/overview` + `/api/dashboard/quick-stats`
- [ ] **Wave G** Stress upload: 50 CSVs simultaneos (`/api/upload`)
- [ ] **Wave G** Coach: 20 conversas paralelas (sem chamar Anthropic real — mock ou modo dry-run)
- [ ] **Wave G** Identificar bottleneck residual (DB pool? CPU? mem?) → fix + re-run

### 3.5 Observability (NOW + Fase 4)

- [x] **Wave C** Fix `log()` em vite.ts — commit `2dffabc`. Cron telemetry standardize deferido pra Fase 4 com pino.
- [ ] **Fase 4** pino + pino-http + pino-pretty (precisa OK founder na dep) — migrar request logger + error handler + crons + auth events (NAO sweep dos 682 sites)
- [ ] **Fase 4** Sentry (`@sentry/node` + `@sentry/react`, free tier OU GlitchTip self-hosted) — precisa OK founder na dep + scrub headers/cookies/body em `/api/auth/*`
- [ ] **Fase 4** Uptime monitor (UptimeRobot/Better Stack free) apontando `/api/ready`
- [ ] **Fase 4** Coolify alerts CPU/disk/mem + Neon connection alerts
- [ ] **Defer** prom-client `/metrics` + Grafana Cloud (Sentry Perf + Coolify + Neon dashboards cobrem ~80%)
- [ ] **Defer** Exato error-rate% SLO alerting (Sentry "N events / M min" suficiente launch)

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
