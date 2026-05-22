# ADR-202 — Audio Player Logout Cleanup Contract

**Status:** Accepted
**Date:** 2026-05-22
**Sprint:** Mini Player 3.2 / Wave B / W-B2
**Supersedes / Relates:** ADR-188 (FSM + z-index), ADR-193 (queue UI persistence), ADR-197 (resume cross-session)

---

## Context

Wave B reviewer R1 (commit `8bb6b4c5`) marcou MEDIUM-3:

> `localStorage.audio.resume.v1` persiste apos logout. Outro user no mesmo dispositivo (caso shared device) ve last track do anterior. Sec/Privacy nit, nao critico.

Adicionalmente, `window.__audioPlayerLastResumeSnapshot` (DEV debug surface) esta exposto em **toda build** — incluindo PROD. Risco minimo (ja sem credenciais), mas expoe shape interno desnecessariamente.

A spec MP3.2 (§ W-B2) coloca uma decisao em aberto: **logout deve limpar TAMBEM `audio.queue.v1` e `audio.onboarding.seen.v1`?**

Founder decidiu (registrado na convocacao desta sprint):

> **W-B2 logout scope:** SOMENTE resume snapshot (`audio.resume.v1`). Queue + onboarding.seen.v1 persistem entre logouts.

Razao por tras (inferida + confirmada pela founder direction):
- **Queue:** se mesmo dispositivo + mesmo user volta a logar, faz sentido restaurar fila planejada (UX positivo). Privacidade NAO e issue critico — queue contem `lessonId`s publicos, nao dados sensiveis. Caso shared device com user diferente → user novo construira sua fila. Edge case minoritario nao justifica perda de UX para caso comum.
- **Onboarding `seen.v1`:** preferencia de UX device-scoped, nao user-scoped. Se shared device, segundo user ja viu o tooltip (e/ou nao quer ver de novo). Persistir poupa repeticao.

Esta ADR formaliza o contrato.

---

## Decision

### Cleanup scope no logout

| Key localStorage | Limpa no logout? | Justificativa |
|---|---|---|
| `audio.resume.v1` | **SIM** | Resume snapshot contem `lessonId` + `position` do **user logado**. Privacy + clean state. |
| `audio.queue.v1` | **NAO** | Fila planejada e UX preference; lesson IDs sao publicos. Restaurar no relogin = positivo. |
| `audio.onboarding.seen.v1` | **NAO** | Preferencia de UX device-scoped. Pular tooltip repetido = positivo. |
| `audio.volume.v1` (futuro, se vier) | **NAO** | Preferencia device-scoped. |
| `audio.spotify.oauth.snapshot.v1` | **SIM** | Tokens OAuth sao credenciais. Limpar OBRIGATORIO no logout (ja coberto por handler existente — manter). |

### Implementation contract

#### 1. `clearAudioOnLogout()` em `client/src/lib/audio-engine/logoutCleanup.ts` (modulo NOVO)

Funcao unica chamada por **todos os entry points de logout**. Idempotente.

```ts
// client/src/lib/audio-engine/logoutCleanup.ts

import { clearResumeSnapshot } from './resumeSession';
// NOT importing clearQueue / clearOnboarding — by design.

/**
 * Cleanup hook chamado em qualquer fluxo de logout.
 *
 * Por decisao explicita (ADR-202 / founder MP3.2):
 * - Limpa: audio.resume.v1 + audio.spotify.oauth.snapshot.v1
 * - Persiste: audio.queue.v1 + audio.onboarding.seen.v1
 *
 * NAO adicionar limpezas novas sem revisar ADR-202.
 */
export function clearAudioOnLogout(): void {
  clearResumeSnapshot();
  // Spotify token cleanup ja roda via spotifyDriver disconnect — confirmar via Grep.
}
```

#### 2. Logout entry points

Implementer faz `grep -r "clearAuth\|signOut\|logout" client/src/` para descobrir. Esperado:
- `useAuth().logout()` button click.
- 401 handler em `apiRequest.ts` (refresh token failure).
- Admin force-logout (se existir).

Cada um chama `clearAudioOnLogout()` antes de redirect/navigate.

#### 3. DEV-only window flag

```ts
// AudioPlayerContext.tsx
useEffect(() => {
  if (import.meta.env.DEV) {
    (window as any).__audioPlayerLastResumeSnapshot = lastSnapshot;
  }
  // PROD: nao expor.
}, [lastSnapshot]);
```

Test: `import.meta.env.DEV=false` mock → `window.__audio...` undefined.

---

## Options Considered

### Opcao 1: Limpar TUDO no logout (resume + queue + onboarding)

- **Pros:** Privacy maximizada. Sem ambiguidade.
- **Cons:** UX pior para o caso comum (mesmo user, mesmo device, login frequente). Forca user a reconstruir fila e ver onboarding novamente. **Founder vetou explicitamente.**

### Opcao 2: Limpar NADA (so OAuth tokens)

- **Pros:** UX maxima.
- **Cons:** Resume snapshot mantem `lessonId` + posicao do user anterior em shared device. Privacy nit deixado em aberto.

### Opcao 3 (escolhida): Limpar so resume + OAuth (decisao founder)

- **Pros:** Balanco — privacy onde importa (resume = "ultima lesson, momento exato"), UX onde importa (queue = preferencia, onboarding = device).
- **Cons:** Contrato precisa ser explicito (esta ADR) para nao ser revertido por acidente em sprint futura. **Mitigacao = esta ADR.**

### Opcao 4: User opt-in toggle "limpar tudo no logout"

- **Pros:** Choice ao user.
- **Cons:** Toggle UI extra, complica state, ROI baixo. Defer ate demanda emergir.

---

## Consequences

### Positivas

- Contrato claro e versionado — proximo dev que abrir issue "porque resume some mas queue nao?" tem documento canonico.
- Modulo `logoutCleanup.ts` centraliza — futuras additions (ex: limpar Spotify cache cliente-side) tem 1 lugar para entrar e ADR para revisar.
- DEV-only `window` flag elimina superficie debug em PROD (lesson #11 — "default minimo em componentes" generalizada: minimal exposure also applies to runtime debug surfaces).

### Negativas

- Edge case shared device: user A loga, depois user B loga, B ve fila do A (lessonId). Mitigacao: fila contem so IDs publicos (qualquer user pode listar lessons via API). Quando B inicia playback, novo flow user-scoped sobrescreve.
- Contrato require manutencao — se localStorage key nova for adicionada, ADR precisa ser revisitada.

### Neutras

- Onboarding `seen.v1` persiste entre logins do mesmo browser → user que limpar localStorage manualmente reve onboarding (expected).

---

## Anti-Patterns to Avoid

Lesson #11 ("default minimo componentes — spec eh fonte de verdade") generalizada para este contrato:

> **NAO adicionar limpezas "preventivas" no logout sem update desta ADR.**
> Adicionar limpeza em logout pode causar regressao silenciosa de UX. Spec = fonte de verdade. Toda mudanca passa por ADR addendum.

---

## Implementation Notes

### Test coverage minimo (informativo — test-writer escreve)

- Logout via button → `localStorage.getItem('audio.resume.v1')` === null.
- Logout via button → `localStorage.getItem('audio.queue.v1')` !== null (mantem).
- Logout via button → `localStorage.getItem('audio.onboarding.seen.v1')` !== null (mantem).
- Logout via 401 handler → mesmo comportamento.
- `clearAudioOnLogout()` chamado 2x consecutivos → no-op no 2o (idempotente).
- `import.meta.env.DEV=true` → `window.__audioPlayerLastResumeSnapshot` defined.
- `import.meta.env.DEV=false` → `window.__audioPlayerLastResumeSnapshot` undefined.

### Future migration

Se MP3.3+ adicionar campo `userId` ao snapshot resume (multi-user device support), reconsider: comparar `snapshot.userId === currentUser.userPlatformId` no load → discard se mismatch, sem precisar limpar no logout. Mas isso e refactor futuro fora MP3.2.

---

## Confianca

**Alta.** Decisao founder-driven (explicit input). Contrato claro, modulo isolado, testes simples. Reverter custa 1 edit em 1 modulo + 1 update de ADR.

## References

- ADR-197 (resume cross-session) — define `clearResumeSnapshot` consumido aqui.
- ADR-193 (queue UI persistence) — define `audio.queue.v1` que NAO se limpa.
- Spec MP3.2 W-B2.
- Founder decision registrada em convocacao desta sprint (memory `session_2026-05-22-mp3.1-wave-b-ux-tier3.md`).
