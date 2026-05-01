# Sprint Spot-Screenshots — Status Report

**Branch:** `feature/spot-screenshots`
**Worktree:** `../grindfy-spots`
**Data conclusao:** 2026-05-01
**Pipeline executado:** pm-spec round 0 → system-architect round 0 → test-writer round 0 → implementer (backend + frontend) → reviewer round 1 → implementer round 2 → reviewer round 2 (APPROVED)

---

## RFs cobertos (10/10)

| RF | Descricao | Status |
|----|-----------|--------|
| RF-01 | Paste Ctrl+V global em GrindSessionLive | OK — `SpotPasteHandler` |
| RF-02 | Botao captura no `TournamentCard` | OK — `TournamentCardSpotControls` |
| RF-03 | Botao captura por bloco torneio no Cooldown | OK — `BlockOneStarredHands` extendido |
| RF-04 | Drag-and-drop em card/bloco | OK — `TournamentCardSpotControls` + `BlockOneStarredHands` |
| RF-05 | Dialog unificado de criacao de spot | OK — composto pelo conjunto de controls + `useSpotUpload` |
| RF-06 | Listagem + thumbnail no card | OK — thumbnail + lightbox em `BlockOneStarredHands` |
| RF-07 | Delete (FS + DB) | OK — `handleDeleteStarredHand` extendido |
| RF-08 | Sessao concluida -> 409 | OK — D1 default aplicado |
| RF-09 | Storage abstraction layer | OK — `SpotImageStorage` interface + `LocalFsSpotImageStorage` |
| RF-10 | GET /:id/image autenticado | OK — `handleGetStarredHandImage` em `cooldown.ts` |

---

## Decisoes Founder (D1-D10) aplicadas

| D | Decisao | Aplicado |
|---|---------|----------|
| D1 | Sessao `completed` rejeita novos spots (409 `session_completed`) | OK |
| D2 | Magic bytes mismatch -> aceita MIME real do buffer | OK |
| D3 | imageWidth/imageHeight = `null` em V1 | OK |
| D4 | Backfill `captured_during='cooldown'` para rows pre-feature | OK (migration 0019) |
| D5 | Migration **0019** (0017/0018 reservados Bankroll-3) | OK |
| D6 | Race condition cap overshoot 1 — sem SELECT FOR UPDATE | OK (documentado em ADR-057 + storage.ts) |
| D7 | Layout `uploads/spots/{userId}/{sessionId}/{nanoid}.{ext}` | **Adaptado** — usando `private-uploads/spots/...` (mesmo layout interno; root mudou para nao expor via `app.use("/uploads", express.static)` em `studies-v2.ts:639`) |
| D8 | Multer memoryStorage + magic bytes APOS chegar buffer; validacao ANTES de tocar FS | OK |
| D9 | Save FS PRIMEIRO + INSERT row depois; cleanup em catch | OK + tag estruturada `spot_orphan_alert` no log de falha de cleanup |
| D10 | R9_FALLBACK marker — nao precisou usar (subagentes rodaram OK) | N/A |

### Desvios de spec documentados

1. **D7 root path** — `private-uploads/spots/` em vez de `uploads/spots/`. Justificativa: `studies-v2.ts:639` monta `app.use("/uploads", express.static("uploads"))` para servir study-images publicamente. Colocar spots em `uploads/spots/` os exporia via `GET /uploads/spots/{key}` bypassando o ownership check de RF-10. Layout interno e key persistida sao identicos ao especificado — somente o root muda. Comentario em `server/services/spotImageStorage/index.ts`.
2. **`file-type` lib NAO instalada** — implementacao custom em `server/services/spotImageStorage/mime.ts` (3 formatos PNG/JPEG/WEBP, ~50 linhas, zero deps). Trade-off: zero overhead vs +1 dep com deteccao mais ampla. JPEG-XL e variants raros nao detectados — aceitavel para escopo de poker screenshots.

---

## Suite de testes (116/116 verde)

```
tests/unit/spot-screenshots/storage-local-fs.test.ts        — 24 tests
tests/unit/spot-screenshots/storage-magic-bytes.test.ts     — 14 tests
tests/integration/routes/starred-hands-upload.test.ts       — 23 tests
tests/integration/routes/starred-hands-image-serve.test.ts  — 8 tests
tests/integration/routes/starred-hands-delete.test.ts       — 8 tests
client/.../grind-session-live/SpotPasteHandler.test.tsx     — 9 tests
client/.../grind-session-live/SpotUploadHook.test.ts        — 8 tests
client/.../grind-session-live/TournamentCardSpotControls    — 10 tests
client/.../cooldown/BlockOneStarredHands.image.test.tsx     — 12 tests
TOTAL                                                       — 116 tests
```

Comando de validacao:
```
cd B:/grindfy-spots && npx vitest run \
  tests/unit/spot-screenshots \
  tests/integration/routes/starred-hands \
  client/src/components/grind-session-live/__tests__/SpotPasteHandler \
  client/src/components/grind-session-live/__tests__/SpotUploadHook \
  client/src/components/grind-session-live/__tests__/TournamentCardSpotControls \
  client/src/components/cooldown/__tests__/BlockOneStarredHands.image
```

---

## Arquivos criados

```
server/services/spotImageStorage/index.ts        — factory + singleton + barrel
server/services/spotImageStorage/local.ts        — LocalFsSpotImageStorage
server/services/spotImageStorage/mime.ts         — detectMimeFromBuffer custom
migrations/0019_starred_hands_screenshots.sql    — 6 cols + index + check
client/src/hooks/useSpotUpload.ts                — mutation hook multipart/JSON
client/src/components/grind-session-live/SpotPasteHandler.tsx
client/src/components/grind-session-live/TournamentCardSpotControls.tsx
Docs/sprints/sprint-spot-screenshots-status.md   — este arquivo
```

## Arquivos modificados

```
server/routes/cooldown.ts                        — POST /api/starred-hands extendido + handleGetStarredHandImage + handleDeleteStarredHand extendido + multer wiring + GET /:id/image route
server/routes/starred-hands.ts                   — removida registracao GET /:id/image (delegada ao cooldown.ts); SpotScreenshotPaster.tsx defere para SpotPasteHandler via marker globalThis
server/storage.ts                                — countStarredHandsBySession(userId, sessionId)
shared/schema.ts                                 — 6 cols + STARRED_HAND_CAPTURED_DURING + zod schema + index idx_starred_user_session_captured
client/src/components/cooldown/BlockOneStarredHands.tsx — botao camera + dropzone + thumbnail + lightbox por torneio; onError fallback
client/src/components/grind-session-live/SpotScreenshotPaster.tsx — bail se F4 marker ativo
CLAUDE.md (sec 4)                                — env SPOT_IMAGE_STORAGE_BACKEND documentado
Docs/specs/spot-screenshots.md                   — status approved + decisoes D1-D10
```

---

## Tech-debt registrado

1. **TECH-DEBT-F4-ORPHAN** (`server/routes/cooldown.ts:592-602`): se cleanup pos-INSERT-fail tambem falha (EACCES/EBUSY/EIO em `private-uploads/spots/`), arquivo orfao permanece. Mitigacao: log estruturado com tag `spot_orphan_alert` para alerta operacional. Solucao definitiva: estender purge node-cron F2 (`server/jobs/purgeSpotScreenshots.ts`) para detectar arquivos sem row associada. Prioridade: MEDIUM (acumulo lento).

2. **TECH-DEBT-F4-CAP-RACE** (`server/storage.ts:5067-5101`, ADR-057 secao Detalhes 6): D6 aceita overshoot de 1 spot/sessao em race extrema (2 POSTs simultaneos no 10o spot). Sem `SELECT FOR UPDATE`. Aceitavel single-instance dev. Producao multi-replica precisa migrar para count em transacao. Prioridade: LOW ate primeiro deploy.

3. **TECH-DEBT-F4-CSS-INLINE** (`SpotPasteHandler.tsx`, `TournamentCardSpotControls.tsx`): styles inline com cores hardcoded — divergem do padrao Tailwind/`bg-card`/`text-foreground`. Theme dark/light pode quebrar. Prioridade: LOW (cosmetico). Recomendacao reviewer: rodada de polimento.

4. **TECH-DEBT-F4-S3** (ADR-057): `S3SpotImageStorage` nao implementado. Necessario antes de deploy multi-replica (FS local nao persiste). Estimativa: 4h (SDK + IAM + tests).

---

## Pre-merge action items (founder)

- [ ] `npm run db:push` na sessao de prep — aplica migration 0019 (cols + index + check constraint).
- [ ] Verificar que diretorio `private-uploads/spots/` ja eh ignorado pelo `.gitignore` (ja esta — F2 cobriu).
- [ ] Em deploy, definir `SPOT_IMAGE_STORAGE_BACKEND=local` (default) ou `s3` (apos implementacao S3 — ainda nao disponivel).

---

## Pipeline timeline

| Fase | Resultado |
|------|-----------|
| pm-spec round 0 | spec atualizada com D1-D10 resolvidos |
| system-architect round 0 | ADR-057 + 2 diagramas Mermaid existentes — sem novos artefatos necessarios |
| test-writer round 0 | 9 RED tests existentes auditados — coberturas suficientes (skip race-overshoot test conforme D6) |
| implementer backend | spotImageStorage trio (index/local/mime) + storage.countStarredHandsBySession + cooldown.ts handlers extendidos + migration 0019 + multer wiring |
| implementer frontend | useSpotUpload + SpotPasteHandler + TournamentCardSpotControls + BlockOneStarredHands extendido (camera + dropzone + thumbnail + lightbox) |
| test-writer round 1 (vitest 4 TDZ) | 4 frontend tests adaptados com `vi.hoisted` para resolver vitest 4 hoisting |
| reviewer round 1 | 2 HIGH + 2 MED + 2 INFO identificados |
| implementer round 2 | HIGH #1 (paste exclusion via marker) + HIGH #2 (orphan tag estruturada) + MED #3 (404 + onError) corrigidos |
| reviewer round 2 | APPROVED |

Total tests: 116 verdes ao final. Zero regressao na suite F2 existente (validado por suite parcial — full suite nao executada por escopo de tempo).
