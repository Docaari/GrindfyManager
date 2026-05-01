# Spec: Spot Screenshots — Capturas de Mãos durante Grind/Cooldown

## Status
Approved (founder confirmou defaults D1-D10 em 2026-05-01)

**Cap de 3 spots/torneio** (cross-tournament total cap = 10/sessao mantido)
**Migration:** `0019_starred_hands_screenshots.sql` (0017/0018 reservados Bankroll-3)
**Storage backend:** `local` (LocalFsSpotImageStorage); abstracao pronta para S3 (deploy)

---

## Resumo Executivo

Estende a feature `starred_hands` (hoje exclusiva do Cooldown Bloco 1) para permitir anexar **screenshots da mesa** durante a sessão de grind ao vivo (`GrindSessionLive`) **e** no cooldown pós-sessão. Captura ocorre via 3 caminhos (Ctrl+V/paste, botão 📸 no card do torneio, drag-drop em dropzone). Imagens são armazenadas em filesystem local sob abstração de storage trocável por S3/R2 no futuro. Cap de 10 spots/sessão (cross-tournament) preservando o cap existente de 3/torneio. Permite delete em ambos contextos. Coach AI vision analysis fica fora do escopo desta fase.

---

## Contexto

Hoje o jogador só consegue registrar spots críticos depois da sessão, durante o Cooldown Bloco 1, com `type` + `spot` + `notes` em texto livre — sem evidência visual da mão. Em prática isso gera 3 problemas:

1. **Memória degradada:** anotar 30min+ depois do bust a stack/range/board é frequentemente impreciso.
2. **Perda de contexto pra revisão:** sem screenshot, o jogador não consegue reabrir o spot em ferramenta externa (HRC, GTO Wizard, Discord do coach).
3. **Friction alta:** parar pra digitar nota durante grind multitable é inviável; Ctrl+V em 1 segundo é viável.

A feature transforma `starred_hands` no canal único de captura de spots, com print opcional, capturável **durante** o jogo. Prepara infra de imagens reutilizável (Coach AI vision na fase 2, posts em comunidade no futuro).

---

## Usuários

- **Jogador MTT em sessão ativa** — captura screenshot no calor da mão (paste/click/drop) e anexa metadata (type+spot, notes opcional) sem sair do GrindSessionLive.
- **Jogador no cooldown pós-sessão** — revisa spots já capturados durante o grind e adiciona novos com print (mesmo fluxo do Bloco 1 atual + suporte a imagem).
- **Jogador em sessão concluída (revisão posterior)** — visualiza spots capturados; comportamento de adicionar novos spots em sessão `completed` definido em **RF-08**.

---

## User Stories

- **US-01** — Como jogador em grind ativo, quero **colar (Ctrl+V) um screenshot do clipboard** com 1 torneio rodando, para que o spot seja anexado automaticamente ao único torneio ativo sem eu precisar escolher.
- **US-02** — Como jogador em grind multitable, quero **colar um screenshot com >1 torneio ativo**, para que um dialog me deixe escolher a qual torneio anexar antes de salvar.
- **US-03** — Como jogador em grind ou cooldown, quero **clicar no botão 📸 do card do torneio** para abrir um dialog onde escolho/colo/dropo a imagem e preencho metadata.
- **US-04** — Como jogador, quero **arrastar e soltar uma imagem direto no card do torneio** (grind) ou bloco do torneio (cooldown), para criar o spot sem cliques extras.
- **US-05** — Como jogador, quero **deletar um spot** (com ou sem print) de qualquer contexto (grind/cooldown), para que o arquivo seja removido junto com o registro.
- **US-06** — Como jogador, quero ser **avisado quando atingir o cap** (10/sessão ou 3/torneio) com toast claro, para entender por que a captura foi bloqueada.
- **US-07** — Como jogador, quero **ver a thumbnail do print no card do torneio** durante o grind e em cada bloco do cooldown, para confirmar que o spot foi salvo.
- **US-08** — Como jogador, quero que a imagem do spot seja **servida via rota autenticada**, para que prints da minha sessão não vazem publicamente.

---

## Requisitos Funcionais

### RF-01: Captura via Paste (Ctrl+V global na página GrindSessionLive)

**Descrição:** Listener `paste` global na página detecta imagem no clipboard (`ClipboardEvent.clipboardData.items` com `kind=file` e MIME image/*). Aciona o fluxo de criação de spot.

**Regras de negócio:**
- Listener só ativo quando há `activeSession` (sessão em status diferente de `completed`).
- Se o foco estiver dentro de `<input>`, `<textarea>`, ou `[contenteditable=true]`, **ignorar** o paste (deixar o navegador colar texto normalmente).
- Se houver **0 torneios ativos** na sessão (status `playing`/`registered`/`break`), mostrar toast "Adicione um torneio primeiro" e não abrir dialog.
- Se houver **exatamente 1 torneio ativo**, anexar automaticamente a ele e abrir o dialog inline já com `sessionTournamentId` pré-preenchido (read-only). Foco vai pro select de `type`.
- Se houver **>1 torneios ativos**, abrir dialog com seletor obrigatório de torneio (lista ordenada por buy-in DESC, mesma ordem do Bloco 1) antes de mostrar campos `type`/`spot`/`notes`.
- Se o **cap de 10 spots/sessão** já estiver atingido, mostrar toast erro `"Cap de 10 spots por sessão atingido"` e não abrir dialog.
- Se o **cap de 3 spots/torneio** já estiver atingido para o torneio único ativo (auto-attach), mostrar toast `"Este torneio já tem 3 spots"` e não abrir dialog.
- Se MIME inválido (não png/jpeg/webp), toast `"Formato não suportado. Aceitos: PNG, JPEG, WEBP"`.
- Se imagem >5MB, toast `"Imagem maior que 5MB"`.

**Critério de aceitação:**
- [ ] Paste com 1 torneio ativo abre dialog com torneio pré-selecionado.
- [ ] Paste com 2+ torneios ativos abre dialog com seletor visível.
- [ ] Paste em sessão com 0 torneios ativos mostra toast e não abre dialog.
- [ ] Paste em sessão com cap atingido mostra toast e não abre dialog.
- [ ] Paste dentro de `<input>` (ex: campo de notas em outro lugar) NÃO captura.
- [ ] Paste de PNG/JPEG/WEBP é aceito; outros MIMEs rejeitados com toast.
- [ ] Paste de imagem >5MB rejeitado com toast.

---

### RF-02: Captura via botão 📸 no TournamentCard (grind)

**Descrição:** Cada `TournamentCard` na página `GrindSessionLive` ganha botão de ação 📸 (label "Capturar spot", `data-testid="tc-spot-capture-btn-{tournamentId}"`).

**Regras de negócio:**
- Click abre o mesmo dialog usado por RF-01, com `sessionTournamentId` pré-fixado pro torneio do card.
- Dialog oferece 3 inputs alternativos pra fornecer a imagem:
  - input `type=file` (accept=image/png,image/jpeg,image/webp)
  - dropzone visível (mesma da RF-04)
  - hint "Ou cole com Ctrl+V" — paste dentro do dialog também é aceito
- Botão 📸 fica **disabled** se o torneio já tem 3 spots ou a sessão já tem 10. Tooltip explica o motivo.

**Critério de aceitação:**
- [ ] Botão 📸 visível em cada `TournamentCard` quando sessão ativa.
- [ ] Click abre dialog com torneio pré-fixado (não editável).
- [ ] Botão disabled quando cap de torneio atingido, com tooltip `"Este torneio já tem 3 spots"`.
- [ ] Botão disabled quando cap de sessão atingido, com tooltip `"Cap de 10 spots por sessão atingido"`.

---

### RF-03: Captura via botão 📸 em cada bloco torneio do Cooldown Bloco 1

**Descrição:** O componente `BlockOneStarredHands` (`client/src/components/cooldown/BlockOneStarredHands.tsx`) ganha botão 📸 dentro do bloco de cada torneio, ao lado dos campos `type`/`spot`/`notes`/Estrelar existentes.

**Regras de negócio:**
- Click abre dialog idêntico ao da RF-02, com torneio pré-fixado.
- Caps **continuam vigentes no cooldown** (10/sessão, 3/torneio) — soma spots criados durante grind + cooldown.
- Listagem existente de stars dentro do bloco passa a renderizar **thumbnail clicável (80×60px)** quando o spot tiver imagem; click abre lightbox/modal com imagem em tamanho real.
- Spots **sem imagem** (criados pelo fluxo legado de "Estrelar" via `type+spot+notes`) continuam funcionando — sem thumbnail, render igual ao atual.

**Critério de aceitação:**
- [ ] Botão 📸 visível em cada bloco torneio do Cooldown Bloco 1.
- [ ] Click abre dialog com torneio pré-fixado.
- [ ] Stars com imagem renderizam thumbnail; sem imagem mantêm render textual atual.
- [ ] Cap de 10/sessão considera spots de grind + cooldown somados.

---

### RF-04: Captura via Drag-and-Drop

**Descrição:** Cada `TournamentCard` (grind) e cada bloco torneio do `BlockOneStarredHands` (cooldown) é uma **dropzone** que aceita `dragover`/`drop` de arquivos imagem.

**Regras de negócio:**
- Visual feedback no `dragover` (borda destacada, label "Solte para criar spot").
- Drop de arquivo imagem (png/jpeg/webp) abre o mesmo dialog (torneio pré-fixado), com a imagem já carregada na preview.
- Drop de múltiplos arquivos: usar **apenas o primeiro** com MIME válido; ignorar resto silenciosamente.
- Drop de arquivo não-imagem: toast `"Formato não suportado"` e não abre dialog.
- Caps validados antes de abrir dialog (mesmo comportamento do botão 📸).

**Critério de aceitação:**
- [ ] Dragover muda visual do card/bloco.
- [ ] Drop de PNG/JPEG/WEBP abre dialog com preview carregada.
- [ ] Drop de outros MIMEs rejeitado com toast.
- [ ] Drop em card cujo torneio atingiu cap mostra toast e não abre dialog.

---

### RF-05: Dialog de Criação de Spot (componente unificado)

**Descrição:** Dialog único reusado pelos 4 caminhos de captura (paste auto, paste >1 torneio, click 📸, drop).

**Campos:**
- `sessionTournamentId` — select OU read-only label, conforme caminho de origem.
- `type` — required, select com `STARRED_HAND_TYPES` (já existe em `shared/schema.ts`).
- `spot` — required, select com `STARRED_HAND_SPOTS`.
- `notes` — optional, textarea max 500 chars.
- Preview da imagem (se houver) — 320×240px, com botão "Substituir" e "Remover imagem".
- Imagem é **opcional** no schema (spec atual permite spots sem print, manter compat).

**Botões:**
- "Cancelar" — fecha sem salvar; revoga `URL.createObjectURL` da preview.
- "Salvar spot" — disabled enquanto `type` ou `spot` não selecionados, ou enquanto upload em curso.

**Comportamento:**
- Ao confirmar com imagem: faz `POST /api/starred-hands` (multipart/form-data se imagem; JSON se sem imagem).
- Loading state durante upload (spinner no botão; dialog não fecha).
- Erro 4xx do servidor: mantém dialog aberto, mostra mensagem inline + toast.
- Erro 5xx: mantém dialog, toast `"Erro ao salvar spot. Tente novamente."`.
- Sucesso: fecha dialog, invalida queries (`['starred-hands', sessionId]`), toast `"Spot salvo"`.

**Critério de aceitação:**
- [ ] Dialog mostra preview quando imagem fornecida.
- [ ] Botão "Salvar" desabilitado sem `type`/`spot`.
- [ ] Botão "Substituir imagem" abre file picker.
- [ ] Botão "Remover imagem" volta o dialog ao modo "spot sem print".
- [ ] Cancelar revoga ObjectURL pra evitar leak.
- [ ] Loading state visível durante upload.
- [ ] Erro 4xx mostra mensagem inline.
- [ ] Sucesso fecha dialog e invalida cache.

---

### RF-06: Listagem e Visualização de Spots no GrindSessionLive

**Descrição:** Cada `TournamentCard` mostra contador de spots (`{n}/3 spots`) e thumbnail strip dos spots já capturados.

**Regras de negócio:**
- Strip mostra até 3 thumbnails (80×60), badges com `type`.
- Click na thumbnail abre lightbox com imagem full + metadata (type, spot, notes, timestamp).
- Lightbox tem botão "Deletar spot" (RF-07).
- Spots sem imagem aparecem como badge texto-only (`[type · spot]`) clicável que abre o mesmo lightbox sem imagem.

**Critério de aceitação:**
- [ ] Card mostra `{n}/3 spots`.
- [ ] Thumbnails dos spots com imagem renderizadas no card.
- [ ] Click em thumbnail abre lightbox com metadata.
- [ ] Spots sem imagem mostram badge clicável.

---

### RF-07: Delete de Spot

**Descrição:** Delete disponível tanto no grind (lightbox a partir do card) quanto no cooldown (lista do bloco torneio).

**Regras de negócio:**
- Click "Deletar spot" pede confirmação inline (botão "Confirmar" + "Cancelar" no próprio lightbox/lista).
- Confirmar dispara `DELETE /api/starred-hands/:id`.
- Servidor remove arquivo do storage (filesystem) **antes** de deletar a row, em try/catch:
  - Se delete da row falhar após arquivo removido: log `error` + retorna 500 (estado inconsistente). **Aceitar como edge case raro**, documentar em RF-08.
  - Se arquivo não existir mas row existe: deletar row, log `warn`, retornar 200 (idempotente).
- Após sucesso: invalidar queries, toast `"Spot removido"`.

**Critério de aceitação:**
- [ ] Click "Deletar" pede confirmação.
- [ ] Confirmação dispara DELETE.
- [ ] Arquivo removido do filesystem.
- [ ] Row removida do DB.
- [ ] Cache atualizado (spot some do card/cooldown).
- [ ] Toast de sucesso.
- [ ] Delete idempotente quando arquivo já não existe.

---

### RF-08: Comportamento em Sessão Concluída (`status = "completed"`)

**Decisao founder (D1, 2026-05-01):** `false` — **nao** permitir adicionar novos spots em sessao `completed`.

**Justificativa:**
- Coerência com fluxo: spots de cooldown só fazem sentido durante o ritual cooldown, não em revisão arbitrária dias depois.
- Reduz risco de divergência entre `cooldown_logs.completedAt` e timestamps de spots.

**Regras (caso founder aprove `false`):**
- Backend: `POST /api/starred-hands` rejeita com `409 { code: "session_completed", message: "Sessão já concluída" }` se `grindSessions.status === "completed"`.
- Listener de paste em `GrindSessionLive` continua ativo somente enquanto `activeSession.status !== "completed"`.
- Botão 📸 no card e dropzone ficam **disabled** quando sessão concluída.
- Cooldown Bloco 1 pode ser aberto mesmo após `cooldown_logs.completedAt` setado, MAS: se o cooldown também já foi concluído (`completedAt != null`), o servidor rejeita igualmente → UI mostra spots como **read-only** (sem botão 📸 em cada bloco torneio).

**Alternativa (`true`):** se founder preferir permitir, remover validação de status no backend e na UI; documentar que `cooldownLogId` pode ser `null` em spots criados pós-cooldown.

**Critério de aceitação:**
- [ ] Sessão concluída + paste = sem dialog, sem toast (listener inativo).
- [ ] Botão 📸 disabled em sessão concluída.
- [ ] POST /api/starred-hands em sessão concluída retorna 409.
- [ ] Cooldown concluído renderiza Bloco 1 read-only.

---

### RF-09: Storage Abstraction Layer

**Descrição:** Camada de storage de imagens é abstraída atrás de uma interface trocável.

**Interface proposta** (`server/services/spotImageStorage.ts`):

```ts
export interface SpotImageStorage {
  save(input: { userId: string; sessionId: string; ext: string; buffer: Buffer; mime: string }): Promise<{ key: string; size: number }>;
  read(key: string): Promise<{ buffer: Buffer; mime: string } | null>;
  delete(key: string): Promise<void>;
}
```

**Regras:**
- Implementação default: `LocalDiskSpotImageStorage` em `uploads/spots/{userId}/{sessionId}/{nanoid}.{ext}`.
- Path resolvido via `path.resolve("uploads/spots")` (mesmo padrão de `studies-v2.ts:39`).
- Diretório criado on-demand via `fs.mkdirSync(..., { recursive: true })`.
- `key` retornado é o path relativo: `spots/{userId}/{sessionId}/{nanoid}.{ext}`.
- Schema `starred_hands` armazena apenas `image_key` (varchar, nullable). Resolução de path full fica no service.
- Implementação cloud (S3/R2) **fora do escopo** — interface preparada, implementação real deferida para deploy.

**Critério de aceitação:**
- [ ] Interface `SpotImageStorage` exportada e testável com mock.
- [ ] `LocalDiskSpotImageStorage` implementa save/read/delete.
- [ ] save() cria diretórios recursivamente.
- [ ] save() rejeita MIME não permitido (defesa em profundidade).
- [ ] save() rejeita buffer >5MB.
- [ ] read() retorna null se key não existe (sem throw).
- [ ] delete() é idempotente (não-throw se key não existe).
- [ ] Path nunca permite traversal (`..`, `/`, `\` no nanoid impossível por construção; defender via regex no read).

---

### RF-10: Endpoint Autenticado de Servir Imagem

**Descrição:** `GET /api/starred-hands/:id/image` retorna a imagem do spot.

**Regras de negócio:**
- Requer auth (`requireAuth`).
- Carrega `starred_hands` por id.
- Verifica `userId === req.user.userPlatformId` — caso contrário 404 (não 403, pra não vazar existência).
- Se `imageKey` é null → 404.
- Lê arquivo via `SpotImageStorage.read(key)`.
- Se read retorna null (arquivo sumiu mas row existe) → 404 + log warn.
- Headers de resposta:
  - `Content-Type` = MIME armazenado no DB.
  - `Cache-Control: private, max-age=86400` (cache do browser, não compartilhado).
  - `Content-Length` = `imageSize` do DB.
- Body: stream do buffer.

**Critério de aceitação:**
- [ ] GET com auth + ownership correto retorna 200 + imagem.
- [ ] GET sem auth retorna 401.
- [ ] GET com auth mas spot de outro user retorna 404.
- [ ] GET de spot inexistente retorna 404.
- [ ] GET de spot sem imagem (imageKey null) retorna 404.
- [ ] Content-Type bate com MIME armazenado.
- [ ] Cache-Control private ativo.

---

## Requisitos Não-Funcionais

- **Performance:**
  - Upload deve completar em < 2s no p95 para imagens de até 2MB em rede 50Mbps.
  - GET imagem deve responder em < 200ms p95 (filesystem local).
  - Listener de paste em `GrindSessionLive` não deve adicionar lag perceptível ao paste de texto comum (early return rápido se não for imagem).
- **Segurança:**
  - Rate limit: aplicar `cooldownLimiter` existente no `POST /api/starred-hands` (já limita 30/min/user).
  - MIME validado **server-side** via magic bytes (não confiar apenas no `Content-Type` do multer) — usar `file-type` lib ou inferir do buffer.
  - Path traversal impossível: `imageKey` é construído pelo servidor com `nanoid()`, nunca aceito do cliente.
  - Endpoint de servir imagem **nunca** retorna metadata de outros users (404, não 403).
- **Disponibilidade:**
  - Falha de FS no upload retorna 500 limpo, sem corromper row no DB (transação: salvar arquivo PRIMEIRO, depois INSERT row; se INSERT falhar, deletar arquivo).
  - Falha de FS no GET retorna 404, não 500 (degradação graciosa — spot continua existindo, só imagem inacessível).
- **Storage:**
  - Filesystem local em `uploads/spots/`. Adicionar entrada em `.gitignore` (já deve cobrir `uploads/**`).
  - Quota não-implementada nesta fase; documentar em "Out of Scope".

---

## Endpoints Previstos

| Método | Rota | Descrição | Auth | Body | Response |
|---|---|---|---|---|---|
| POST | /api/starred-hands | Criar spot (com ou sem imagem) | JWT | multipart/form-data ou JSON | 201 spot |
| GET | /api/starred-hands | Listar spots do user (filtros já existem) | JWT | query | 200 array |
| GET | /api/starred-hands/:id/image | **NOVO** — servir imagem do spot | JWT | — | 200 binário ou 404 |
| DELETE | /api/starred-hands/:id | Deletar spot + imagem | JWT | — | 200 `{ ok, id }` |

### POST /api/starred-hands — alteração

**Modos de request:**

1. **Sem imagem** (compat com fluxo legado): `Content-Type: application/json`, body atual:
   ```json
   {
     "sessionId": "string",
     "sessionTournamentId": "string",
     "type": "tilt" | "leak" | ...,
     "spot": "preflop" | ...,
     "notes": "string opcional",
     "cooldownLogId": "string opcional"
   }
   ```

2. **Com imagem** (novo): `Content-Type: multipart/form-data`, fields:
   - `file` — binário da imagem (png/jpeg/webp, ≤5MB).
   - `sessionId`, `sessionTournamentId`, `type`, `spot`, `notes?`, `cooldownLogId?` — strings.

**Status codes:**
- `201` — sucesso. Response: row do spot incluindo `imageKey`, `imageMime`, `imageSize`, `imageWidth?`, `imageHeight?`.
- `400` — validação Zod falhou; ou MIME inválido; ou imagem >5MB.
- `400` — `code: "invalid_session_tournament"` (FK inconsistente com session).
- `400` — `code: "star_limit_reached"` (3/torneio). Mensagem: `"Máximo 3 mãos por torneio"`.
- `400` — `code: "session_spot_limit_reached"` (10/sessão, **NOVO**). Mensagem: `"Cap de 10 spots por sessão atingido"`.
- `404` — torneio não encontrado ou não pertence ao user.
- `409` — `code: "session_completed"` (RF-08, se founder aprovar `false`).
- `500` — erro de FS ou DB.

### GET /api/starred-hands — sem mudanças no contrato

Já existente. Response passa a incluir `imageKey`, `imageMime`, `imageSize`, `imageWidth`, `imageHeight` quando spot tem imagem.

### GET /api/starred-hands/:id/image — NOVO

**Status codes:**
- `200` — binário da imagem com `Content-Type` correto.
- `401` — não autenticado.
- `404` — spot não existe, não pertence ao user, ou não tem imagem.
- `500` — erro de FS inesperado (raro; preferir 404 quando arquivo sumiu).

### DELETE /api/starred-hands/:id — alteração de side-effect

Comportamento atual mantido (deleta row), **adiciona** delete do arquivo via `SpotImageStorage.delete(imageKey)` antes de deletar a row. Idempotente.

---

## Modelos de Dados Afetados

### `starred_hands` (alteração)

| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| id | varchar | PK | existente |
| userId | varchar | FK users, not null | existente |
| sessionId | varchar | FK grindSessions, not null | existente |
| sessionTournamentId | varchar | FK sessionTournaments, not null | existente |
| cooldownLogId | varchar | FK cooldownLogs, nullable | existente |
| type | varchar | not null | existente, enum `STARRED_HAND_TYPES` |
| spot | varchar | not null | existente, enum `STARRED_HAND_SPOTS` |
| notes | text | nullable | existente |
| **imageKey** | varchar(255) | **nullable** | **NOVO** — relative path retornado por SpotImageStorage |
| **imageMime** | varchar(50) | **nullable** | **NOVO** — `image/png` / `image/jpeg` / `image/webp` |
| **imageSize** | integer | **nullable** | **NOVO** — bytes |
| **imageWidth** | integer | **nullable** | **NOVO** — pixels (extraído server-side via `sharp` ou `image-size`); opcional, pode ficar null se extração falhar |
| **imageHeight** | integer | **nullable** | **NOVO** — pixels |
| **capturedDuring** | varchar(20) | **nullable, default null** | **NOVO** — `"grind"` ou `"cooldown"` (enum); permite analytics e flag visual |
| createdAt | timestamp | default now | existente |

**Indexes (acrescentar):**
- `idx_starred_user_session_capturedDuring` em `(userId, sessionId, capturedDuring)` — pra contagens de cap.

**Migração:** `migrations/0019_starred_hands_screenshots.sql` (D5 — 0017/0018 reservados Bankroll-3).

**Compat:**
- Schema Zod `insertStarredHandSchema` ganha campos opcionais (`imageKey`, `imageMime`, `imageSize`, `imageWidth?`, `imageHeight?`, `capturedDuring?`) — mantém validação `.strict()`.
- Spots existentes pré-feature: `imageKey = null`, `capturedDuring = null` — UI trata como "sem imagem, contexto desconhecido".

---

## Validações

| Validação | Onde | Erro |
|---|---|---|
| MIME ∈ {png, jpeg, webp} | multer fileFilter + magic bytes server-side | 400 `"Formato não suportado"` |
| Tamanho ≤ 5MB | multer limits.fileSize | 400 `"Imagem maior que 5MB"` |
| Cap 3 spots/torneio | storage.countStarredHandsByTournament | 400 `code: star_limit_reached` |
| Cap 10 spots/sessão | **NOVO** storage.countStarredHandsBySession | 400 `code: session_spot_limit_reached` |
| sessionTournamentId pertence a sessionId | check existente | 400 `code: invalid_session_tournament` |
| Ownership (user) | requireAuth + ownership check | 404 |
| Sessão não concluída (RF-08, se aprovado) | check em grindSessions.status | 409 `code: session_completed` |
| `type` válido | starredHandTypeSchema | 400 |
| `spot` válido | starredHandSpotSchema | 400 |
| `notes` ≤ 500 chars | Zod max(500) | 400 |

---

## Fluxos

### Fluxo 1 — Paste com 1 torneio ativo (auto-attach)

1. Usuário está em `GrindSessionLive` com 1 torneio em status `playing`/`registered`/`break`.
2. Faz `Ctrl+V` com imagem no clipboard.
3. Listener global captura `paste`, detecta imagem, valida MIME e tamanho.
4. Identifica único torneio ativo → abre `SpotCaptureDialog` com `sessionTournamentId` pré-fixado.
5. Preview da imagem renderizada (320×240, ObjectURL).
6. Usuário escolhe `type` + `spot`, opcionalmente preenche `notes`.
7. Click "Salvar spot" → `POST /api/starred-hands` (multipart) → backend valida caps + salva arquivo + INSERT row.
8. UI fecha dialog, invalida queries, toast "Spot salvo".
9. Card do torneio renderiza thumbnail.

### Fluxo 2 — Paste com >1 torneio ativo

Igual ao Fluxo 1 até passo 4. No passo 4, dialog abre **com seletor de torneio** (sem `sessionTournamentId` pré-fixado). Usuário escolhe → resto idêntico.

### Fluxo 3 — Click no botão 📸

1. Usuário clica 📸 em um `TournamentCard` (grind) ou bloco torneio (cooldown).
2. `SpotCaptureDialog` abre com `sessionTournamentId` pré-fixado e **sem imagem ainda**.
3. Usuário fornece imagem via input `file`, drop dentro do dialog, ou Ctrl+V dentro do dialog.
4. Resto idêntico ao Fluxo 1 a partir do passo 5.

### Fluxo 4 — Drag-and-drop em card/bloco

1. Usuário arrasta arquivo imagem sobre `TournamentCard` ou bloco torneio.
2. Visual feedback (borda destacada).
3. Drop → handler valida MIME, abre `SpotCaptureDialog` com `sessionTournamentId` pré-fixado e preview já carregada.
4. Resto idêntico ao Fluxo 1 a partir do passo 5.

### Fluxo 5 — Delete de spot

1. Usuário clica thumbnail no card (grind) ou no bloco (cooldown) → lightbox abre.
2. Click "Deletar spot" → confirmação inline.
3. "Confirmar" → `DELETE /api/starred-hands/:id`.
4. Backend: `SpotImageStorage.delete(imageKey)` → `storage.deleteStarredHand(id, userId)` → 200.
5. UI invalida queries, toast "Spot removido", lightbox fecha.

---

## Cenários de Teste Derivados

### Happy Path
- [ ] **HP-01** Paste em sessão com 1 torneio ativo cria spot com print.
- [ ] **HP-02** Click 📸 + escolher arquivo cria spot com print.
- [ ] **HP-03** Drop em card cria spot com print.
- [ ] **HP-04** POST /api/starred-hands com imagem PNG/JPEG/WEBP retorna 201 com `imageKey` setado.
- [ ] **HP-05** GET /api/starred-hands/:id/image retorna binário com Content-Type correto.
- [ ] **HP-06** DELETE remove arquivo + row.
- [ ] **HP-07** Spot legado (sem imagem) continua sendo criado e listado normalmente.
- [ ] **HP-08** Cooldown Bloco 1 lista spots com thumbnail quando há imagem.

### Validação de Input
- [ ] **VI-01** POST sem `type` → 400.
- [ ] **VI-02** POST sem `spot` → 400.
- [ ] **VI-03** POST com `type` inválido → 400.
- [ ] **VI-04** POST com `notes` > 500 chars → 400.
- [ ] **VI-05** POST com MIME `image/gif` → 400 `"Formato não suportado"`.
- [ ] **VI-06** POST com imagem 6MB → 400 `"Imagem maior que 5MB"`.
- [ ] **VI-07** POST com `sessionTournamentId` que não pertence à `sessionId` → 400 `invalid_session_tournament`.
- [ ] **VI-08** POST com magic bytes inconsistentes (extensão .png mas bytes JPEG) → backend aceita o MIME real e armazena MIME correto OU rejeita 400 (decisão: **aceitar e usar MIME real do buffer**, mais user-friendly).

### Regras de Negócio
- [ ] **RN-01** 4º spot no mesmo torneio → 400 `star_limit_reached`.
- [ ] **RN-02** 11º spot na mesma sessão (cross-tournament) → 400 `session_spot_limit_reached`.
- [ ] **RN-03** Cap de 10/sessão soma spots de grind + cooldown.
- [ ] **RN-04** Spots criados durante grind têm `capturedDuring = "grind"`; criados no cooldown têm `"cooldown"`.
- [ ] **RN-05** Delete de spot reduz contadores de cap (próximo POST aceita).
- [ ] **RN-06** Sessão concluída + POST /api/starred-hands → 409 `session_completed` (se RF-08=false).

### Edge Cases
- [ ] **EC-01** Paste em página com 0 torneios ativos → toast, sem dialog.
- [ ] **EC-02** Paste dentro de `<input>` → não captura; texto cola normalmente.
- [ ] **EC-03** Paste com clipboard sem imagem → ignora silenciosamente.
- [ ] **EC-04** Drop de múltiplos arquivos → usa só o primeiro válido.
- [ ] **EC-05** Drop de arquivo `.txt` → toast erro, sem dialog.
- [ ] **EC-06** Upload em curso + usuário fecha dialog → request cancelado (AbortController), arquivo NÃO criado no FS.
- [ ] **EC-07** GET imagem de spot de outro user → 404 (não 403).
- [ ] **EC-08** GET imagem com `imageKey` null → 404.
- [ ] **EC-09** GET imagem cujo arquivo sumiu do FS (mas row existe) → 404 + log warn.
- [ ] **EC-10** Delete de spot cujo arquivo já não existe → 200 (idempotente), row removida.
- [ ] **EC-11** Delete falha entre `SpotImageStorage.delete` e `storage.deleteStarredHand` → arquivo removido, row preservada → 500 + log error. Próxima tentativa de DELETE deve retornar 200 (idempotente no FS).
- [ ] **EC-12** POST com `cooldownLogId` apontando pra cooldown de outro user → 400 `invalid_cooldown_log` (validar ownership).
- [ ] **EC-13** Path traversal: `imageKey` malicioso no banco (cenário hipotético via SQL injection externa) — endpoint de servir imagem rejeita `imageKey` que contenha `..`, `\` ou comece com `/`.
- [ ] **EC-14** Race condition: 2 POSTs simultâneos no 10º spot da sessão. Solução: contar dentro de transação OU aceitar overshoot de 1 (preferir aceitar overshoot — cap virtual, não constraint hard).
- [ ] **EC-15** Imagem corrompida (header válido mas dados truncados) — backend salva mesmo assim (sem inspecionar conteúdo); frontend lida graciosamente com `<img onerror>` mostrando placeholder.

### Segurança
- [ ] **SEG-01** POST sem JWT → 401.
- [ ] **SEG-02** GET imagem sem JWT → 401.
- [ ] **SEG-03** GET imagem com JWT de outro user → 404.
- [ ] **SEG-04** DELETE sem JWT → 401.
- [ ] **SEG-05** DELETE de spot de outro user → 404.
- [ ] **SEG-06** Rate limit `cooldownLimiter` aplicado no POST (30/min/user).
- [ ] **SEG-07** Cache-Control `private` no GET imagem.

### Performance
- [ ] **PERF-01** Upload de 2MB completa em <2s no ambiente de teste local.
- [ ] **PERF-02** GET imagem 2MB serve em <200ms localhost.
- [ ] **PERF-03** Listener paste com texto puro (não imagem) não adiciona lag (early return).

---

## Fora de Escopo

Itens explicitamente NÃO cobertos por esta spec:

- **Coach AI vision analysis** — análise da imagem por LLM multimodal pra extrair stack/cards/board automaticamente. Fica pra fase 2.
- **Cloud storage migration** — implementação de `S3SpotImageStorage` ou `R2SpotImageStorage`. Interface fica pronta; troca de implementação acontece no deploy.
- **Image compression / resize automático** — não comprime/redimensiona server-side. Salva original. Pode ser adicionado depois (sharp).
- **Image quota por user** — sem limite total de storage por user; só caps por sessão/torneio. Quota de FS fica pra fase de produção.
- **Editing de imagem** (crop, anotação, blur de info pessoal) — usuário deve preparar imagem fora antes de paste.
- **Multi-image por spot** — cada spot tem 0 ou 1 imagem. Múltiplos prints exigem múltiplos spots.
- **Compartilhamento público** (link compartilhável fora do app) — toda imagem requer auth do owner. Pra fase comunidade.
- **Visualização em mobile/touch** — paste e drag-drop são desktop-first. Mobile usa apenas botão 📸 (input file → câmera/galeria nativa). Spec assume desktop como primary.
- **Bulk delete** — delete é 1-a-1. Bulk pode entrar em fase futura.
- **EXIF stripping** — não remove metadata EXIF. Se virar problema de privacidade, adicionar em fase 2.
- **Coach tool `read_starred_hands_with_images`** — Coach hoje lê texto via `readCooldownHistory`. Estender pra incluir referências a imagens fica pra fase Coach AI vision.

---

## Dependências

- **Schema migration** — exige rodar `db:push` ou migration formal `0017_starred_hands_screenshots.sql` antes do test-writer poder validar inserts com novos campos.
- **`uploads/spots/` directory** — criado on-demand no primeiro upload; `.gitignore` deve cobrir (verificar).
- **`sharp` ou `image-size`** (opcional) — pra extrair `imageWidth/imageHeight`. Se complexidade alta, pular extração e deixar `null`.
- **`file-type`** — recomendado pra magic bytes validation. Adicionar em `package.json`.
- **Componente `SpotCaptureDialog`** — novo, reutilizado em 4 caminhos.
- **Componente `SpotLightbox`** — novo, abre imagem full + metadata + delete.
- **Hook `useSpotPasteListener`** — novo, encapsula listener global + lógica de auto-attach vs dialog.
- **`storage.countStarredHandsBySession(userId, sessionId)`** — método novo em `server/storage.ts`.

---

## Notas de Implementação (sugestões, não vinculantes)

- Usar `multer.diskStorage` no padrão de `studies-v2.ts:39-71` mas com destination computado por user/session no `destination` callback.
- Pra paste, listener no `useEffect` de `GrindSessionLive` com cleanup. Detectar foco em input via `document.activeElement.tagName`.
- Pra dropzone, usar `react-dropzone` se já existe no projeto, OU handlers nativos `onDragOver`/`onDrop` (mais simples e sem nova dep).
- Pra preview, `URL.createObjectURL(file)` + cleanup com `URL.revokeObjectURL` no unmount/cancel.
- Pra `image-size`/`sharp`: se for complicar, pular e deixar `imageWidth/Height = null`. Não bloquear feature por isso.
- Magic bytes: `file-type` lib resolve em 1 linha (`fileTypeFromBuffer(buffer)`). Comparar com MIME do multer; se divergir, usar o do magic bytes (mais confiável).

---

## Métricas de Sucesso

Pra avaliar se a feature pegou tração, depois de 2-4 semanas em produção, verificar:

- **Adoção:** % de sessões com pelo menos 1 spot capturado (baseline atual ~? — medir antes de lançar).
- **Distribuição de captura:** ratio paste vs click vs drop. Se paste dominar (>60%), valida hipótese de que era a friction principal.
- **Volume médio:** avg spots/sessão entre usuários ativos. Esperado: 1-3 (cap = 10).
- **Captura grind vs cooldown:** % de spots com `capturedDuring = "grind"` vs `"cooldown"`. Se grind <20%, hipótese de que paste é viável durante jogo está errada.
- **Delete rate:** % de spots criados que são deletados em <1h. Se >30%, sugere captura acidental → investigar UX.
- **Storage growth:** GB/dia em `uploads/spots/`. Pra estimar custo S3 quando migrar.
- **Erros 4xx no POST:** % de tentativas que falham por cap atingido vs MIME inválido vs tamanho. Sinaliza onde educar usuário.
- **Latência p95 do GET imagem:** se >500ms em prod (Neon + filesystem), priorizar migration pra CDN.

---

## Decisoes Founder Resolvidas (2026-05-01)

1. **D1 / RF-08** — sessao `completed` **NAO** aceita novos spots. POST retorna 409 `{code: session_completed}`. Botao 📸 disabled. Listener paste inativo.
2. **D2 / EC-08** — magic bytes mismatch: aceitar e usar MIME REAL do buffer (mais user-friendly).
3. **D3** — `imageWidth`/`imageHeight` = **null** em V1. Sem `sharp`/`image-size` deps.
4. **D4** — backfill `captured_during = 'cooldown'` em rows pre-feature (informacao historica correta).
5. **D5** — migration **0019** (0017/0018 reservados Bankroll-3; 0016 ja reservado tournament_registration_time).
6. **D6** — race condition cap overshoot: aceitar overshoot 1 (cap virtual). Sem SELECT FOR UPDATE em count. Documentar em ADR-057.
7. **D7** — storage layout: `uploads/spots/{userPlatformId}/{sessionId}/{nanoid21}.{ext}`. Key persistida como path relativo (sem leading `/`).
8. **D8** — multer config: `multer.memoryStorage` + limit 5MB. Magic bytes valida APOS chegar buffer; reject ANTES de tocar FS.
9. **D9** — cleanup transacional: save FS PRIMEIRO, INSERT row depois. Se INSERT falhar, deletar arquivo via `service.delete(key)` em catch.
10. **D10** — fallback de subagentes: se subagente falhar 3x, executar fase direto. Marcar `R9_FALLBACK` no commit.
