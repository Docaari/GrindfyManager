# ADR-143: Rotação de refresh tokens com tabela DB + detecção de família

## Status

**Accepted** — Launch Fase 2 (security hardening, Wave 5).

## Data

2026-05-11

## Contexto

Hoje o refresh token é um JWT de 30 dias assinado com `JWT_REFRESH_SECRET`. `/api/auth/refresh` apenas valida a assinatura e emite um novo par — **sem estado server-side**. Consequências, levantadas no audit de 2026-05-11:

- **Sem revogação.** Logout só limpa cookies do browser; o JWT continua válido por 30d. Troca de senha não invalida sessões antigas. Não há "deslogar de todos os dispositivos".
- **Sem rotação real.** Cada refresh emite um token novo mas o antigo continua válido até expirar — um token vazado tem 30d de vida útil garantida, mesmo que o dono continue usando a conta.
- **Sem detecção de reuso.** Se um atacante rouba um refresh token e o usa, e depois o dono usa o seu (já rotacionado), não há sinal nenhum — ambos funcionam.
- **Plaintext na app.** (Mitigado em Wave 3 — não vai mais para `localStorage` — mas o JWT ainda trafega no body de algumas respostas e no cookie.)

OWASP/IETF (BCP draft "OAuth 2.0 Security Best Current Practice") recomendam **refresh token rotation com replay/reuse detection**: cada refresh consome o token atual e emite um novo na mesma "família"; se um token já consumido for apresentado de novo, a família inteira é revogada (assume-se vazamento).

## Decisão

Manter o **JWT** como formato do refresh token (compat: o cookie/transport não muda), mas adicionar uma **tabela de estado server-side** que torna cada refresh token rastreável, rotacionável e revogável.

### Tabela `auth_refresh_tokens`

| coluna | tipo | nota |
|---|---|---|
| `id` | varchar PK | nanoid |
| `user_id` | varchar notNull | FK → `users.user_platform_id`, cascade delete |
| `token_hash` | varchar notNull **unique** | `sha256(rawRefreshJwt)` em hex — o JWT cru nunca é persistido |
| `family_id` | varchar notNull | nanoid; compartilhado por toda a cadeia de rotação iniciada num login |
| `expires_at` | timestamp notNull | = `iat + 30d` do JWT |
| `revoked_at` | timestamp nullable | preenchido em rotação, logout, troca de senha ou reuse |
| `revoked_reason` | varchar nullable | `rotated` \| `logout` \| `password_change` \| `reuse_detected` \| `expired` |
| `replaced_by_hash` | varchar nullable | `token_hash` do token que rotacionou este |
| `user_agent` | varchar nullable | audit |
| `ip` | varchar nullable | audit |
| `created_at` | timestamp defaultNow | |

Índices: unique em `token_hash`, comuns em `user_id`, `family_id`, `expires_at`.

### Fluxo

- **Login / OAuth login / verify-email auto-login** → após `generateTokens`, insere uma linha com `family_id` novo e `token_hash = sha256(refreshToken)`.
- **`POST /api/auth/refresh`**:
  1. Valida a assinatura do JWT (como hoje). Inválido → 401.
  2. `hash = sha256(raw)`; busca a linha por `token_hash`.
  3. **Linha não existe** (JWT válido mas nunca registrado) → token legado da janela de migração. Aceita, emite par novo, registra com `family_id` novo. Não revoga nada (não há o que revogar).
  4. **Linha existe e `revoked_at != null`** → **reuse detectado**. Revoga toda a família (`revoked_reason='reuse_detected'`). 401.
  5. **Linha existe e `expires_at < now`** → 401 (`revoked_reason='expired'` best-effort).
  6. **Linha existe e válida** → rotaciona: emite par novo; marca a linha velha (`revoked_at=now`, `revoked_reason='rotated'`, `replaced_by_hash`); insere linha nova com a **mesma** `family_id`.
- **Logout** → revoga todas as linhas ativas do usuário (`revoked_reason='logout'`).
- **Troca de senha** (reset-password) → idem (`revoked_reason='password_change'`).
- **Cleanup** → cron/lazy: deletar linhas com `expires_at` há mais de 30d (audit window curto).

### Hash dos tokens de reset/verify (`auth_tokens`)

No mesmo espírito: `EmailService.generatePasswordResetToken` / `generateEmailVerificationToken` passam a gravar `sha256(token)` na coluna `token` (que continua `varchar`); o token cru só vai no email. `verify*` / `markPasswordResetTokenUsed` aplicam `sha256` antes do lookup. Efeito colateral: links de reset/verify em trânsito no momento do deploy ficam inválidos — aceitável (TTL ≤ 1h). Nenhuma migration de schema necessária.

## Alternativas consideradas

- **Trocar JWT por token opaco no DB** — mais "puro" mas quebra o transport atual (cookie name, body back-compat, refresh scheduling JWT-aware do FE). Custo alto, benefício marginal sobre "JWT + tabela espelho".
- **Denylist em Redis** — não temos Redis no stack; a tabela PG resolve com índice em `token_hash`. Volume baixo (1 linha por refresh, cleanup periódico).
- **Não fazer nada** — deixa logout/password-change sem efeito sobre sessões e sem detecção de reuso. Inaceitável pro launch (era P1 no audit).

## Consequências

- `/api/auth/refresh` ganha 1 SELECT + 1-2 UPDATE/INSERT por chamada. Trivial (índice unique em `token_hash`).
- Logout e reset-password ganham 1 UPDATE em massa por usuário. Trivial.
- Janela de migração: tokens emitidos antes do deploy não têm linha → tratados como legado (caminho 3). Auto-resolvido no primeiro refresh de cada um.
- Tokens de reset/verify em trânsito no deploy ficam inválidos (usuário pede outro).
- Pequena janela TOCTOU no caminho de reuse (dois refreshes concorrentes com o mesmo token velho): o segundo verá `revoked_at` já preenchido → trata como reuse e mata a família. Falso positivo possível em multi-tab agressivo; aceitável (usuário só re-loga).

## Migration

`migrations/0063_auth_refresh_token_rotation.sql` — cria `auth_refresh_tokens` + índices.
