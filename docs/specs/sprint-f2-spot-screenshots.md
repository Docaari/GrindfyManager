# Spec: Sprint F2 — Print de Spots durante Grind + Cooldown

## Status
Proposta

## Resumo
Permite que o jogador cole screenshots (Ctrl+V) de spots interessantes durante uma sessao live de grind, anexa cada print a um `session_tournament` com expiracao em 14 dias, e expoe esses prints em duas surfaces: drag-to-review no Bloco 1 do Cooldown e aba "Spots Pendentes" em `/studies` para revisao posterior.

## Contexto
Sprint F2 estende o fluxo de cooldown ja entregue na Sprint Cooldown-1 e o pipeline de starring de maos. Hoje, o jogador estrela uma mao no cooldown via formulario (`type` + `spot` + `notes`), mas nao tem como anexar evidencia visual durante a sessao live, quando o spot esta fresco. Cole um print no momento da decisao critica eh o caminho de menor friccao.

A spec F2 reaproveita a tabela `starred_hands` existente (em vez de criar `spot_screenshots` paralela) para nao duplicar conceitos: um `starred_hand` agora pode ter um print associado via `imageUrl`, e o ciclo de revisao adiciona `conclusion`, `reviewedAt`, `expiresAt` e `status`.

Pre-requisitos confirmados:
- `starred_hands` em `shared/schema.ts:2747-2767` — todos os campos novos serao nullable para back-compat (lesson #7).
- Endpoints CRUD de `starredHand` em `server/routes/cooldown.ts` permanecem intactos. Endpoints novos vao em arquivo dedicado `server/routes/starred-hands.ts`.
- Pattern Multer disk em `server/routes/studies-v2.ts:38-71` reaproveitado.
- Migration livre = **0012**.
- Branch atual: `feature/spot-screenshots`.

## Usuarios
- **Jogador MTT em sessao live**: cola Ctrl+V dentro de GrindSession.tsx, ve contador "X/10 prints", precisa de feedback instantaneo.
- **Jogador em cooldown**: arrasta thumbnail do print pra cima do torneio correspondente em BlockOneStarredHands; abre modal de conclusion (texto livre + tags) ou clica "Revisar Depois".
- **Jogador em estudo posterior**: abre aba "Spots Pendentes" em `/studies`, ve grid de prints nao revisados, conclui ou descarta.

## Goals
- Capturar evidencia visual do spot **no momento** da decisao (Ctrl+V global no GrindSession).
- Reaproveitar fluxo de cooldown existente sem quebrar Sprint Cooldown-1.
- Auto-purge de prints orfaos (nao revisados, sem flag `reviewLater`) em 14 dias para conter storage.
- Telemetria minima para iterar (paste/review/expire counts).

## Non-Goals
- OCR / parsing automatico do print (futuro).
- Anotacao sobre o print (canvas, setas) — fora de F2.
- Compartilhar print externamente (Discord, Twitter) — fora.
- Multi-foto por spot (1 print = 1 starred_hand row).
- Mover prints entre sessoes — print fica preso ao `session_id` original.
- Editar print apos colado (sem rotate, crop, redaction).

## User Stories

**US-1 — Captura no live grind**  
Como jogador multitabling, quero colar Ctrl+V um print enquanto jogo, para nao perder o contexto visual de um all-in critico. O print deve ser anexado automaticamente ao torneio em foco, sem abrir modal nem interromper meu fluxo.

**US-2 — Limite explicito por sessao**  
Como jogador, ao colar o 11o print na mesma sessao, quero ver um toast "limite 10 prints/sessao atingido" sem quebrar o foco e sem perder o conteudo do clipboard.

**US-3 — Drag-to-review no cooldown**  
Como jogador no Bloco 1 do cooldown, quero ver minha lista lateral de prints pendentes, arrastar um print sobre o card de um torneio, e abrir um modal pra escrever conclusion (texto livre, max 500 chars). Ao salvar, o print sai da lista lateral e aparece estrelado dentro do torneio.

**US-4 — Adiar revisao**  
Como jogador cansado, quero clicar "Revisar Depois" em um print pendente, para que ele apareca na aba "Spots Pendentes" em `/studies` e nao seja purgado em 14d.

**US-5 — Revisao em estudos**  
Como jogador estudando depois, quero abrir `/studies > Spots Pendentes`, ver thumbnails 64x64 com data/torneio, clicar em qualquer um para abrir lightbox + textarea de conclusion, salvar e mover para meu archive.

## Requisitos Funcionais

### RF-01: Paste global em GrindSession
**Descricao:** Listener `paste` no escopo `GrindSession.tsx` captura imagens do clipboard (image/*) e dispara upload via `POST /api/starred-hands/screenshot`.

**Regras de negocio:**
- Listener inativo quando `document.activeElement` for `<input>`, `<textarea>` ou `[contenteditable=true]`. Se o usuario esta digitando notas, paste preserva o texto, nao captura imagem.
- Filtro: apenas `event.clipboardData.items` com kind=`file` e `type` iniciando em `image/`. Texto puro = ignore silencioso (sem toast).
- Tamanho max: 5 MB (mesmo limite do `studies-v2`). Acima = toast "imagem maior que 5MB".
- MIME aceitos: png, jpg, jpeg, webp. gif eh **rejeitado** em F2 (nao queremos animado consumindo storage).
- Counter visivel "X/10 prints colados" em algum canto do header da sessao live.
- Na captura 11+, paste eh ignorado, toast "limite 10/10 atingido — finalize a sessao para liberar".
- Auto-tag de torneio em foco: o backend recebe `sessionId` obrigatorio + `sessionTournamentId` opcional. Cliente envia o primeiro `session_tournament` com `status='playing'` (ou o mais recentemente atualizado). Se nao houver, usa o mais recente da sessao (ordenado por `updatedAt DESC`).
- Fallback button: botao "Adicionar print" abre file picker padrao (mesmo endpoint, source='upload').

**Criterio de aceitacao:**
- [ ] Ctrl+V em area neutra (nao input) cola imagem, exibe thumbnail otimista, contador incrementa.
- [ ] Ctrl+V dentro de input ou textarea NAO captura imagem (texto eh colado normalmente).
- [ ] Ctrl+V de texto puro nao gera nada (nao toast, nao request).
- [ ] 11o paste exibe toast e NAO faz request.
- [ ] Toast de erro se backend retornar 4xx/5xx, com retry manual via botao.
- [ ] Print >5MB exibe toast e nao faz request.
- [ ] GIF rejeitado com toast claro.

### RF-02: Endpoint de upload
**Descricao:** `POST /api/starred-hands/screenshot` aceita multipart/form-data, salva imagem em disco, cria row em `starred_hands` com `source='paste'` (ou `'upload'` quando vier do file picker), `status='pending'`.

**Regras de negocio:**
- Auth: `requireAuth` JWT.
- Rate limit: 30 req / 5 min por usuario (paste burst razoavel).
- Body fields (multipart): `screenshot` (file, obrigatorio), `sessionId` (string, obrigatorio), `sessionTournamentId` (string, opcional), `source` (enum, opcional, default 'paste').
- Validacao Zod ANTES da gravacao (lesson #generic).
- Path no disco: `uploads/spot-screenshots/<nanoid>.<ext>` (criar dir se nao existir).
- `imageUrl` retornado eh path relativo: `/uploads/spot-screenshots/<file>`. Servidor expoe via `express.static`.
- Validacao de ownership: `sessionId` deve pertencer ao userId. Caso contrario, 404.
- Validacao por sessao: contar `starred_hands` com `sessionId=X AND source IN ('paste','upload') AND status != 'discarded'`. Se >= 10, retorna 409 `{ code: 'spot_limit_reached', limit: 10 }`.
- Default fields da row criada:
  - `id` = nanoid()
  - `userId` = autenticado
  - `sessionId` = body
  - `sessionTournamentId` = body OR (resolvido server-side: primeiro tournament status=playing, fallback para mais recente updatedAt — IMPORTANTE: se nao existir nenhum, retorna 422 `{ code: 'no_tournament_in_session' }`)
  - `type` = `'spot_screenshot'` (novo enum value, ver schema)
  - `spot` = `'screenshot_pending'` (novo enum value, ver schema)
  - `notes` = null
  - `imageUrl` = path
  - `pastedAt` = now()
  - `expiresAt` = now() + 14d
  - `status` = `'pending'`
  - `source` = `'paste'`/`'upload'`

**Criterio de aceitacao:**
- [ ] Upload valido retorna 201 com `{ id, imageUrl, expiresAt }`.
- [ ] Upload sem sessionId retorna 400.
- [ ] Upload com sessionId de outro user retorna 404.
- [ ] 11o upload na mesma sessao retorna 409 `spot_limit_reached`.
- [ ] Sessao sem nenhum tournament retorna 422 `no_tournament_in_session`.
- [ ] MIME nao permitido retorna 400.
- [ ] Arquivo > 5MB retorna 413 (multer limit).
- [ ] Row criada esta com `source='paste'`, `status='pending'`, `expiresAt` configurado.

**Concorrencia + rollback (architect-flagged):**
- Counter de 10/sessao deve usar `SELECT count(*) ... FOR UPDATE` dentro da transacao do INSERT. Sem o lock, dois pastes concorrentes em count=9 podem ambos passar e gerar 11 rows.
- Em qualquer erro **pos-Multer** (404 ownership, 409 limit, 422 no_tournament, 422 mismatch, falha INSERT), o handler deve chamar `spotStorage.delete(key)` para evitar arquivo orfao no disco. Multer ja gravou antes da validacao Zod/ownership/counter rodar.
- [ ] **Cenario teste novo (concorrencia):** 2 requests `Promise.all` ao 10o paste -> exatamente 1 retorna 201, outra retorna 409, count final = 10.
- [ ] **Cenario teste novo (rollback):** Upload com counter cheio (10 ja existem) -> arquivo gravado pelo Multer NAO permanece no disco apos resposta 409. Confirmar via `fs.existsSync(path) === false`.
- [ ] **Cenario teste novo (rollback ownership):** Upload com `sessionId` de outro user -> arquivo Multer removido apos 404.

### RF-03: Endpoint de revisao
**Descricao:** `PATCH /api/starred-hands/:id/review` marca print como revisado, persiste conclusion e (opcionalmente) reattacha ao `sessionTournamentId` correto se o jogador arrastou pra outro torneio.

**Regras de negocio:**
- Auth: `requireAuth`.
- Body Zod: `{ conclusion?: string max 500, reviewLater?: boolean, sessionTournamentId?: string, type?: enum, spot?: enum, notes?: string max 500 }`.
- Ownership: row deve ter `userId` igual ao auth, caso contrario 404.
- Se `reviewLater=true`: seta `reviewLater=true`, NAO seta `reviewedAt`. Print fica disponivel em "Spots Pendentes". `expiresAt` permanece, mas cron NAO purga rows com `reviewLater=true` (ver RF-06).
- Se `reviewLater=false` (ou ausente) E `conclusion` informado: seta `reviewedAt=now()`, `status='reviewed'`, `conclusion=body.conclusion`. Persiste `type`, `spot`, `notes` se vierem (jogador pode classificar agora).
- `sessionTournamentId` novo: valida que pertence a mesma `sessionId` da row. Se nao, 422 `tournament_session_mismatch`.

**Criterio de aceitacao:**
- [ ] PATCH com `conclusion` marca `reviewedAt`, `status='reviewed'`, retorna row atualizada.
- [ ] PATCH com `reviewLater=true` seta flag, nao marca `reviewedAt`.
- [ ] PATCH com `sessionTournamentId` de outra sessao retorna 422.
- [ ] PATCH em row de outro user retorna 404.
- [ ] PATCH em row ja `status='reviewed'` permite re-edicao de conclusion (idempotente).

### RF-04: Endpoint de listagem pendente
**Descricao:** `GET /api/starred-hands/pending?reviewLater=true|false|all` lista prints do user.

**Regras de negocio:**
- Auth: `requireAuth`.
- Default (sem query): retorna `status='pending' AND reviewLater=false` (apenas prints recem-colados, ainda na fila do cooldown atual ou aguardando).
- `?reviewLater=true`: retorna apenas `reviewLater=true`.
- `?reviewLater=all`: union dos dois (para Spots Pendentes em /studies).
- Ordenacao: `pastedAt DESC`.
- Inclui join com `session_tournaments` para retornar `tournamentName`, `site`, `buyIn` na response.
- Paginacao: `?limit=50&offset=0` (default 50, max 200).
- NAO retorna `status='reviewed'` ou `'discarded'`.

**Criterio de aceitacao:**
- [ ] GET sem params lista pendentes "ativos" do user.
- [ ] `?reviewLater=true` filtra corretamente.
- [ ] Ordenacao mais novo primeiro.
- [ ] Response inclui dados do torneio (join).
- [ ] Pagina respeita limit/offset.

### RF-05: Endpoint de descarte
**Descricao:** `DELETE /api/starred-hands/:id` faz **soft delete** (status='discarded'), nao remove arquivo de disco imediatamente (cron decide).

**Regras de negocio:**
- Auth + ownership.
- `status` vai para `'discarded'`. `reviewLater=false`. Cron RF-06 aplicara hard delete + remocao de arquivo no proximo ciclo.
- Idempotente: re-DELETE em row ja descartada retorna 204.

**Criterio de aceitacao:**
- [ ] DELETE marca como discarded, retorna 204.
- [ ] DELETE em row de outro user retorna 404.
- [ ] DELETE idempotente.

### RF-06: Cron de purge
**Descricao:** Job diario `purgeSpotScreenshots` em `server/jobs/purgeSpotScreenshots.ts` remove rows + arquivos.

**Regras de negocio:**
- Frequencia: 1x por dia (configuravel via env, default 03:00 UTC).
- Criterios de purge:
  - `status='discarded'` (qualquer idade) → hard delete row + unlink arquivo.
  - `expiresAt < NOW() AND reviewedAt IS NULL AND reviewLater=false AND status='pending'` → hard delete row + unlink arquivo + emit `spot.expired_purged`.
- NAO purga: `reviewLater=true` OU `reviewedAt IS NOT NULL`.
- Erro de unlink (arquivo ja sumiu) eh logado mas nao bloqueia delete da row.
- Idempotente: re-execucao no mesmo dia eh segura.
- Telemetria: incrementa contador agregado `{ purgedCount, errorCount, durationMs }`.

**Criterio de aceitacao:**
- [ ] Row com `expiresAt` no passado e nao revisada eh purgada (row + file).
- [ ] Row `reviewLater=true` sobrevive ao cron mesmo apos `expiresAt`.
- [ ] Row `reviewedAt IS NOT NULL` sobrevive.
- [ ] Falha de unlink nao trava o cron.
- [ ] Job loga summary ao fim.

### RF-07: Componente SpotScreenshotPaster (frontend)
**Descricao:** Componente novo em `client/src/components/grind-session-live/SpotScreenshotPaster.tsx` integrado ao GrindSession.tsx.

**Regras de negocio:**
- Hook: `useEffect` registra `window.addEventListener('paste', handler)` e remove no cleanup.
- Handler verifica `document.activeElement` antes de capturar.
- Mostra contador no header: `<Badge>{usedCount}/10 prints</Badge>` (estilo shadcn existente).
- Toast via lib existente (sonner ou sistema vigente em GrindSession.tsx).
- Botao fallback file-picker.
- Lista lateral (mini-thumbnails) opcional em F2 — pode ser apenas o counter; full list aparece no cooldown.

**Criterio de aceitacao:**
- [ ] Componente nao renderiza nada visivel se `usedCount=0` exceto o badge counter.
- [ ] Cleanup remove listener no unmount.
- [ ] Não captura paste quando focus em input.

### RF-08: Componente SessionSpotsList (cooldown lateral)
**Descricao:** Lista lateral renderizada em CooldownPage (proximo ao Bloco 1) com prints da sessao atual, suporta drag.

**Regras de negocio:**
- Query: `GET /api/starred-hands/pending?sessionId={id}` (filtrar client-side por sessao se endpoint nao suportar query param em F2 — ver perguntas abertas).
- Cada item: thumbnail 64x64, label do torneio atual atribuido, badge "Drag para revisar".
- HTML5 drag native (`draggable=true`, `onDragStart` set dataTransfer com `starredHandId`).
- Click solo (sem drag) abre lightbox preview + botoes "Revisar agora" (modal de conclusion) e "Revisar Depois".

**Criterio de aceitacao:**
- [ ] Lista mostra apenas prints da sessao do cooldown corrente.
- [ ] Drag funciona em desktop (mouse).
- [ ] Click abre lightbox.
- [ ] Empty state quando sem prints.

### RF-09: Drop target em BlockOneStarredHands
**Descricao:** Cards de torneio em `BlockOneStarredHands.tsx` aceitam drop de print, abrem `SpotReviewCard` modal.

**Regras de negocio:**
- `onDragOver` previne default. `onDrop` extrai `starredHandId` e o `sessionTournamentId` do card alvo.
- Abre modal `SpotReviewCard` com:
  - Preview da imagem.
  - Select de `type` (reusa STARRED_HAND_TYPES).
  - Select de `spot` (reusa STARRED_HAND_SPOTS).
  - Textarea conclusion (max 500).
  - Botoes "Salvar revisao" (chama PATCH com tudo) / "Revisar Depois" (chama PATCH com `reviewLater=true`).
- Apos sucesso: print desaparece da lista lateral, aparece estrelado no torneio (mesma UI ja existente do BlockOneStarredHands).
- Drag pra torneio errado: o jogador pode escolher PATCH novamente (nao ha undo dedicado em F2; cobre o caso re-arrastando ou editando manualmente). Documentar em "Edge cases".
- Limite de 3 stars/torneio do BlockOne **inclui** prints colados que viraram revisados (mesmo balde). Se torneio ja tem 3, dropping abre modal mas botao "Salvar" fica disabled com tooltip "Maximo 3 maos/torneio. Remova uma para revisar este print.".

**Criterio de aceitacao:**
- [ ] Drag e drop funciona em desktop.
- [ ] Modal abre com preview e selects.
- [ ] Salvar PATCH chama endpoint, refetch da lista do bloco.
- [ ] Print revisado aparece como starredHand normal no torneio.
- [ ] Tooltip de limite quando torneio ja saturado.

### RF-10: Aba "Spots Pendentes" em Studies.tsx
**Descricao:** Adiciona nova tab em `client/src/pages/Studies.tsx`. Tabs existentes nao podem ser alteradas alem da insercao da nova entry.

**Regras de negocio:**
- Tab id: `pending-spots`. Label: "Spots Pendentes". Posicionada apos as tabs default existentes.
- Conteudo: `PendingSpotsTab.tsx` (componente novo).
- Lista paginada de prints com `reviewLater=true` OR (status='pending' E session ja terminou).
- Cada item: thumbnail, info (data, torneio, sessionTournament), botao "Revisar agora" (abre modal igual SpotReviewCard) e "Descartar".
- Empty state amigavel.
- Badge sidebar /studies com count de pending (reuso pattern existente).

**Criterio de aceitacao:**
- [ ] Tab nova nao quebra tabs existentes.
- [ ] Lista carrega prints pendentes corretamente.
- [ ] Revisar abre modal e atualiza tab.
- [ ] Descartar move pra status discarded e some da lista.
- [ ] Badge count atualiza em tempo real (TanStack Query invalidation).

### RF-11: Integracao com sessao terminada
**Descricao:** Quando sessao termina (jogador encerra no GrindSession), prints com `status='pending'` e que nao foram revisados no cooldown daquela sessao continuam pendentes mas sao automaticamente "promovidos" para aparecerem na aba Spots Pendentes.

**Regras de negocio:**
- Promocao logica: prints com `status='pending'` que pertencem a sessao com `endedAt IS NOT NULL` aparecem na query `/pending?reviewLater=all` mesmo sem `reviewLater=true`.
- Server-side: query OR (`reviewLater=true` OR (`status='pending'` AND session.endedAt IS NOT NULL)).
- Nao toca em `expiresAt`. Print continua sujeito ao auto-purge se nao for revisado em 14d e nao tiver flag `reviewLater`.

**Criterio de aceitacao:**
- [ ] Print colado, sessao encerrada sem cooldown ou sem revisao, aparece em /studies > Spots Pendentes.
- [ ] Print com `reviewedAt` nao aparece.
- [ ] Print descartado nao aparece.

## Requisitos Nao-Funcionais

- **Performance:** upload de print (5MB) deve responder em < 500ms p95. GET /pending com 100 prints < 200ms.
- **Storage:** budget inicial 1GB para `uploads/spot-screenshots/`. Cron purge eh o que mantem isso bounded; alertar via log se diretorio > 80% do budget.
- **Seguranca:** path traversal — usar `path.basename` ou `nanoid` puro como filename, nunca `originalname`. Servir com `express.static` que ja eh seguro.
- **Privacidade:** prints sao privados ao user. Endpoint `GET /uploads/spot-screenshots/:file` deve verificar ownership via JWT antes de servir (ou usar URLs com tokens curtos). Decidir em ADR — ver pergunta aberta.
- **Concorrencia:** counter de 10/sessao deve ser checado em transacao para evitar race no 10o paste simultaneo (10 abas).
- **Resiliencia:** falha de upload nao perde clipboard — toast com botao "tentar de novo" mantendo a imagem em memoria do componente.

## Endpoints Previstos

| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| POST | /api/starred-hands/screenshot | Upload de print colado/file-picker | JWT |
| PATCH | /api/starred-hands/:id/review | Marcar revisado / reviewLater / re-tag torneio | JWT |
| GET | /api/starred-hands/pending | Listar pendentes (filtros: reviewLater, sessionId) | JWT |
| DELETE | /api/starred-hands/:id/discard | Soft delete F2 (status=discarded) | JWT |
| GET | /api/starred-hands/:id/image | Servir imagem com ownership check | JWT |

NOTA: endpoints existentes em `cooldown.ts` (`POST /api/starred-hands`, `GET /api/starred-hands`, `DELETE /api/starred-hands/:id`) **nao serao alterados**. Os novos vivem em arquivo dedicado `server/routes/starred-hands.ts`.

**Resolucao de conflito DELETE (architect-flagged):** Cooldown-1 ja monta `DELETE /api/starred-hands/:id` com hard delete. F2 usa rota distinta `DELETE /api/starred-hands/:id/discard` (soft delete) para evitar override por ordem de `app.use`. Comportamento determinista, zero regressao em testes Cooldown-1.

**Servir imagem (architect-flagged):** abandona `/uploads/spot-screenshots/:file` (path direto = leak de filename). Usa `GET /api/starred-hands/:id/image` com `requireAuth` + valida `userId === req.user.userPlatformId` antes de `res.sendFile`. F3 troca `sendFile` por `redirect(s3.getSignedUrl)` sem alterar ownership check.

## Modelos de Dados Afetados

### starred_hands (extensao)

| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| imageUrl | text | nullable | Path relativo: `/uploads/spot-screenshots/<file>` |
| conclusion | text | nullable, max 500 | Texto livre da revisao |
| reviewedAt | timestamp | nullable | null = nao revisado |
| reviewLater | boolean | default false, not null | Flag "revisar depois" |
| expiresAt | timestamp | nullable | pastedAt + 14d (cron purge usa) |
| pastedAt | timestamp | nullable | quando o print foi colado |
| source | varchar(20) | default 'manual', not null | enum: 'paste' \| 'upload' \| 'manual' |
| status | varchar(20) | default 'pending', not null | enum: 'pending' \| 'reviewed' \| 'discarded' |

**Indices novos:**
- `idx_starred_user_status` em (`userId`, `status`)
- `idx_starred_expires` em (`expiresAt`) WHERE `status='pending'` (para cron eficiente)
- `idx_starred_session_source` em (`sessionId`, `source`) (para counter de 10/sessao)

**Enums Zod novos:**
- `STARRED_HAND_TYPES` adicionar `'spot_screenshot'`.
- `STARRED_HAND_SPOTS` adicionar `'screenshot_pending'` (placeholder ate jogador classificar).
- novo `STARRED_HAND_SOURCES = ['paste', 'upload', 'manual'] as const`.
- novo `STARRED_HAND_STATUSES = ['pending', 'reviewed', 'discarded'] as const`.

### Migration 0012 (DDL preview)

```sql
-- 0014_spot_screenshots.sql (renomeado de 0012 pos-merge para evitar colisao com 0012_bankroll_management_enabled)

ALTER TABLE starred_hands
  ADD COLUMN image_url     text,
  ADD COLUMN conclusion    text,
  ADD COLUMN reviewed_at   timestamp,
  ADD COLUMN review_later  boolean DEFAULT false NOT NULL,
  ADD COLUMN expires_at    timestamp,
  ADD COLUMN pasted_at     timestamp,
  ADD COLUMN source        varchar(20) DEFAULT 'manual' NOT NULL,
  ADD COLUMN status        varchar(20) DEFAULT 'pending' NOT NULL;

CREATE INDEX idx_starred_user_status   ON starred_hands (user_id, status);
CREATE INDEX idx_starred_expires       ON starred_hands (expires_at)
  WHERE status = 'pending';
CREATE INDEX idx_starred_session_source ON starred_hands (session_id, source);

-- Back-fill rows existentes (criadas pelo cooldown, sem print)
UPDATE starred_hands
   SET status   = 'reviewed',
       source   = 'manual',
       pasted_at = created_at
 WHERE pasted_at IS NULL;
```

NOTA back-fill (lesson #7): rows criadas no cooldown classico ja tem `notes` e foram explicitamente starradas pelo jogador — sao consideradas `'reviewed'` retroativamente. Isso garante que `pending` so cobre prints novos da Sprint F2.

## API Contract (request/response)

### POST /api/starred-hands/screenshot

Request:
```
multipart/form-data
- screenshot: <File>
- sessionId: <string>
- sessionTournamentId: <string?>
- source: 'paste' | 'upload'
```

Response 201:
```json
{
  "id": "abc123",
  "imageUrl": "/uploads/spot-screenshots/abc123.png",
  "expiresAt": "2026-05-11T12:34:00.000Z",
  "sessionTournamentId": "st-xyz",
  "pastedAt": "2026-04-27T12:34:00.000Z"
}
```

Erros:
- 400 `{ message, issues }` (Zod fail)
- 404 `{ message: 'Sessao nao encontrada' }`
- 409 `{ code: 'spot_limit_reached', limit: 10 }`
- 413 `{ message: 'Imagem maior que 5MB' }`
- 422 `{ code: 'no_tournament_in_session' }`

### PATCH /api/starred-hands/:id/review

Request:
```json
{
  "conclusion": "Bluff catcher correto, oponente fold-prone post-river",
  "type": "decision_error",
  "spot": "river_call",
  "notes": "vs reg tight",
  "reviewLater": false,
  "sessionTournamentId": "st-xyz"
}
```

Response 200:
```json
{
  "id": "abc123",
  "status": "reviewed",
  "reviewedAt": "2026-04-27T13:00:00.000Z",
  "conclusion": "...",
  "type": "decision_error",
  "spot": "river_call",
  "notes": "vs reg tight",
  "sessionTournamentId": "st-xyz"
}
```

Erros:
- 400 (Zod)
- 404 (ownership)
- 422 `{ code: 'tournament_session_mismatch' }`

### GET /api/starred-hands/pending?reviewLater=all&limit=50&offset=0

Response 200:
```json
{
  "items": [
    {
      "id": "abc123",
      "imageUrl": "/uploads/spot-screenshots/abc123.png",
      "pastedAt": "...",
      "expiresAt": "...",
      "reviewLater": false,
      "status": "pending",
      "sessionId": "sess-1",
      "sessionTournamentId": "st-xyz",
      "tournament": {
        "name": "Sunday Million",
        "site": "PokerStars",
        "buyIn": "215.00"
      }
    }
  ],
  "total": 7,
  "limit": 50,
  "offset": 0
}
```

### DELETE /api/starred-hands/:id

Response 204 (no body).

## Cenarios de Teste Derivados

### Happy Path
- [ ] Paste de PNG em area neutra do GrindSession → upload OK → counter 1/10 → row criada com `source='paste'` `status='pending'`.
- [ ] Drag print sobre torneio no Bloco 1 → modal abre → preencher conclusion → salvar → row vira `status='reviewed'`, aparece estrelada no torneio.
- [ ] Click "Revisar Depois" → row vira `reviewLater=true`, sobrevive a cron purge.
- [ ] Aba Spots Pendentes lista pending+reviewLater corretamente.

### Validacao de Input
- [ ] Upload sem `sessionId` → 400.
- [ ] Upload com MIME `image/gif` → 400.
- [ ] Upload com arquivo > 5MB → 413.
- [ ] PATCH com `conclusion` > 500 chars → 400.
- [ ] PATCH com `sessionTournamentId` de sessao alheia → 422.

### Regras de Negocio
- [ ] 10 prints na sessao + 1 paste → 11o retorna 409, toast no front.
- [ ] Paste em `<input>` ativo → texto colado, request NAO disparado.
- [ ] Paste de texto puro → silencioso, sem toast.
- [ ] Sessao sem nenhum tournament → upload retorna 422.
- [ ] Tournament alvo ja com 3 stars → drop abre modal mas Salvar disabled com tooltip.
- [ ] Sessao terminada → print pending aparece em /studies > Spots Pendentes (mesmo sem `reviewLater=true`).

### Edge Cases
- [ ] Cron job: print expirado (>14d) sem reviewLater → purgado (row + file).
- [ ] Cron job: print com reviewLater=true e expirado → sobrevive.
- [ ] Cron job: arquivo no disco ja sumiu (race) → log error, row deletada mesmo assim.
- [ ] Race: 2 abas colando o 10o paste simultaneo → apenas 1 cria, outra recebe 409.
- [ ] Reload da pagina apos paste → toast/state perdido eh aceitavel; print ja foi salvo no backend (paste eh fire-and-forget post-success).
- [ ] Drag pra torneio errado → jogador re-arrasta ou edita via /studies. Sem undo dedicado em F2.
- [ ] PATCH idempotente: re-revisar print ja revisado eh permitido (atualiza conclusion).
- [ ] DELETE idempotente: re-DELETE em discarded retorna 204.
- [ ] Print sem `sessionTournamentId` no upload (sessao com 1 torneio so) → server resolve sozinho.
- [ ] Browser lento, paste demora 800ms → spinner no botao counter ate retorno.

### Integracao obrigatoria (lesson session_2026-04-27-tts-wiring)
- [ ] **integration test E2E**: GrindSession monta com sessao mock + tournament; simular `paste` event com Blob image/png; aguardar request stub retornar 201; abrir Cooldown; arrastar print; preencher modal; salvar; navegar para Studies; ver print revisado **fora** da aba Pendentes. Cobre wiring: paster → API → cooldown → studies.

## Telemetria

Eventos emitidos via tracking lib existente (verificar com architect qual eh a usada — provavel custom logger em `server`):

| Evento | Quando | Props |
|---|---|---|
| `spot.pasted` | Upload retorna 201 | `{ sessionId, sessionTournamentId, source, sizeBytes }` |
| `spot.upload_rejected` | 4xx no upload | `{ reason, code }` |
| `spot.reviewed` | PATCH com conclusion | `{ id, sessionTournamentId, hadConclusion, source }` |
| `spot.review_later` | PATCH com reviewLater=true | `{ id, sessionId }` |
| `spot.discarded` | DELETE soft | `{ id, fromSurface: 'studies'\|'cooldown' }` |
| `spot.expired_purged` | Cron remove row expirada | `{ count, durationMs, errorCount }` |
| `spot.drag_dropped` | Drop em torneio (frontend) | `{ targetTournamentId, success }` |

Dashboards: count de prints/sessao, taxa revisao no cooldown vs studies, tempo medio paste→review, % expirados (sinal de UX ruim).

## Risk Register

| Risco | Probabilidade | Impacto | Mitigacao |
|---|---|---|---|
| Storage growth descontrolado | Media | Alto | Cron 14d + limite 10/sessao + alerta a 80% budget |
| Cron falha silenciosa | Media | Alto | Health check + log summary + alerta se 0 purge em 7d (suspeito) |
| Paste lost on reload (UX) | Media | Baixo | Toast claro + retry button; ja salva no backend antes de mostrar |
| Path traversal upload | Baixa | Critico | nanoid filename + multer validacao; nunca usar originalname |
| Servir imagem sem auth (privacidade) | Media | Critico | ADR W0 decide: `express.static` com middleware ownership OU URLs assinadas |
| Race no contador 10/sessao | Baixa | Medio | Conta em transacao; OK 11 prints raros |
| Drag-drop quebra mobile | Alta | Baixo | F2 = desktop only; ja tem `data-testid` para evolucao mobile (touch events em F3) |
| Migration 0012 quebra Sprint Cooldown-1 | Baixa | Critico | Todas colunas nullable + default; back-fill conservador (status=reviewed) |
| Endpoint cooldown.ts colide com starred-hands.ts | Baixa | Medio | Routes diferentes: `/api/starred-hands` vs `/api/starred-hands/screenshot` e `/pending`; testar em integration |
| GIF rejeitado frusta usuarios | Baixa | Baixo | Toast claro; reabrir em F3 se feedback |

## Acceptance Criteria por Wave

**W0 — ADR + planejamento (system-architect)**
- [ ] ADR-0XX criado decidindo: storage local disco vs S3/cloud (recomendar disco para F2, S3 para F3 production-ready).
- [ ] ADR define estrategia de servir imagem privada (static + middleware ownership vs signed URL).
- [ ] Diagrama Mermaid do fluxo paste → upload → cooldown drag → review → studies.

**W1 — Backend + Schema**
- [ ] Migration 0012 aplicada com back-fill validado.
- [ ] `server/routes/starred-hands.ts` novo arquivo, todos endpoints RF-02 a RF-05.
- [ ] `server/jobs/purgeSpotScreenshots.ts` novo + scheduling (node-cron ou similar).
- [ ] Storage helpers em `storage.ts` para counter, ownership, list pending.
- [ ] Static route `/uploads/spot-screenshots/*` com middleware ownership.
- [ ] Testes unitarios + integration backend com >85% coverage nas funcoes novas.

**W2 — Frontend grind live**
- [ ] `SpotScreenshotPaster.tsx` integrado em GrindSession.tsx.
- [ ] Counter visivel.
- [ ] File picker fallback.
- [ ] Auto-tag torneio em foco.
- [ ] Testes unitarios componente + 1 integration GrindSession + paste.

**W3 — Frontend cooldown + studies**
- [ ] `SessionSpotsList.tsx` lateral no Cooldown.
- [ ] Drag/drop em `BlockOneStarredHands.tsx` (sem alterar comportamento ja existente do bloco).
- [ ] `SpotReviewCard.tsx` modal.
- [ ] `PendingSpotsTab.tsx` em Studies.
- [ ] Sidebar badge count.
- [ ] Testes unitarios + 1 integration E2E (paste→cooldown→studies).

**W4 — Polish + telemetria**
- [ ] Eventos emitidos.
- [ ] Toast handling todos os erros.
- [ ] Empty states amigaveis.
- [ ] Performance check (upload <500ms p95).
- [ ] QA founder real (mesma licao tts-wiring) antes de merge.

## Fora de Escopo
- Anotacao no print (canvas, setas, blur de cards) — futuro.
- OCR / parse automatico do print.
- Mobile touch drag.
- Print video (gif, mp4).
- Compartilhamento externo.
- Versionamento de print (re-edit imagem).
- Multi-print por starred_hand (1:1 em F2).
- Editar imagem apos colada.
- Coach AI consumir print como contexto (sera Sprint Coach-3 com vision).

## Dependencias
- Sprint Cooldown-1 (ja entregue) — schema `starred_hands` base.
- Sprint B2 (1dca493) — flag `bankrollManagementEnabled` nao impacta diretamente, mas o pattern de toggle pode ser reusado para "Spots Pendentes badge" se desejado.
- Multer + disk pattern de `studies-v2.ts`.

## Notas de Implementacao (sugestoes para Implementer)
- Usar `nanoid(16)` para filename (mesmo charset do id) garante unicidade.
- `node-cron` ja esta no projeto? Se nao, prefer `setInterval` com guard de leader-election simples; ou enfileirar via tabela `jobs` se existir. Deixar a decisao pro architect (W0 ADR).
- Toast: usar a lib ja vigente em GrindSession.tsx (provavelmente sonner ou Radix Toast — verificar).
- `event.clipboardData.getData('text')` para detectar texto puro vs `items` para arquivos — ver MDN clipboard API.
- HTML5 drag native eh suficiente para F2; nao puxar dnd-kit.
- Limite de 3 stars do BlockOne ja existe (`MAX_STARS_PER_TOURNAMENT`); apenas reusar a constante.

---

## Verificacao Final

- [x] Cada requisito tem criterios de aceitacao verificaveis
- [x] Cenarios de teste cobrem happy path, erros e edge cases
- [x] Secao "Fora de Escopo" preenchida
- [x] Sem ambiguidade em regras-chave (limite 10, gif rejeitado, drag = 1 modal, etc)
- [x] Test-Writer pode gerar testes sem perguntar — endpoints documentados com request/response
- [x] Endpoints listados (metodo, rota, descricao, auth)
- [x] Modelos de dados com campos, constraints, indices, migration preview
