# Spec: Sprint Grind-Live Spot Notes

## Status
Proposta

## Resumo
Captura de contexto textual no momento do paste de prints em `/grind-live` (Quick Note Dialog) e viewer de prints da sessao corrente acessivel pelo contador `X/10 prints`. Backend ja existe — feature eh exclusivamente frontend (`GrindSessionLive.tsx` + dialogs novos).

## Contexto
Hoje, `SpotScreenshotPaster` aceita Ctrl+V e botao "Adicionar print", faz upload e mostra toast. O jogador perde a janela de contexto quente: nada eh registrado sobre a mao naquele instante ("vilao agro", "fold ou jam?", "borda de call"). Para revisitar, precisa sair de `/grind-live` para `/cooldown` ou `/estudos/spots`. Isso quebra o fluxo de grind ao vivo e diminui a qualidade dos spots arquivados.

Backend ja pronto:
- `starredHands.notes` (text, max 500) persiste
- `PATCH /api/starred-hands/:id/review` aceita `{ notes }`
- `DELETE /api/starred-hands/:id/discard` (soft delete)
- `GET /api/starred-hands/:id/image` (owner-checked)
- `GET /api/starred-hands/pending?sessionId=<id>` lista da sessao

Tamanho: M.

## Usuarios
- **Jogador em sessao live**: cola/anexa prints durante grind, anota contexto rapido, revisita prints da sessao para refletir.

## Requisitos Funcionais

### RF-01: Quick Note Dialog pos-upload
**Descricao:** Apos `SpotScreenshotPaster.onUploaded(starredHand)` disparar, abrir Dialog modal pedindo nota textual antes de o jogador voltar a mesa.

**Regras de negocio:**
- Dialog abre imediatamente apos resposta 200/201 do upload (callback `onUploaded`).
- Conteudo do Dialog:
  - Thumbnail do print (200px de largura, lazy via `GET /api/starred-hands/:id/image`).
  - Textarea `autoFocus`, `maxLength=500`, contador `X / 500` visivel.
  - Placeholder: `"Qual a borda de call aqui?, Vilao agro, etc."`.
  - Botoes "Salvar nota" (primary) e "Pular" (ghost).
- "Salvar nota":
  - `PATCH /api/starred-hands/:id/review` com body `{ notes }` via `apiRequest('PATCH', ...)` (lesson #13: ja retorna JSON parseado).
  - Em sucesso: toast "Nota salva", fecha dialog, invalida query `['starred-hands', 'pending', sessionId]`.
  - Em erro: toast `destructive` com mensagem do erro, dialog permanece aberto (jogador pode tentar de novo ou pular).
- "Pular" (ou ESC, ou clique fora): fecha o dialog SEM PATCH; print continua persistido sem `notes`.
- Fila: se um novo `onUploaded` disparar enquanto o dialog estiver aberto, o spot novo entra em fila local. Ao fechar o dialog atual (Salvar ou Pular), o proximo da fila abre automaticamente (1 dialog por vez).
- Textarea vazia + "Salvar" eh tratado como "Pular" (nao envia PATCH com `notes: ""`).

**Criterio de aceitacao:**
- [ ] Paste/upload de print abre o Quick Note Dialog com textarea focada
- [ ] Salvar com texto envia PATCH e fecha
- [ ] Pular fecha sem PATCH
- [ ] ESC fecha (equivalente a Pular)
- [ ] Contador de caracteres atualiza em tempo real e bloqueia em 500
- [ ] Dois pastes consecutivos enfileiram (segundo dialog abre apos fechar o primeiro)
- [ ] Erro de PATCH mantem dialog aberto + toast destructive

### RF-02: Session Spots Viewer
**Descricao:** Tornar o contador `X/10 prints` clicavel e abrir um Dialog modal listando todos os prints da sessao atual com edicao inline de nota e exclusao.

**Regras de negocio:**
- O contador `X/10 prints` em `GrindSessionLive.tsx` vira `<button>` com `data-testid="spot-viewer-trigger"`.
- Click abre Dialog "Prints desta sessao":
  - Fonte de dados: `GET /api/starred-hands/pending?sessionId=<currentSessionId>`.
  - Empty state quando lista vazia: "Nenhum print nesta sessao. Cole (Ctrl+V) ou use Adicionar print."
  - Grid responsivo: 3 colunas em desktop (`md:grid-cols-3`), 1 coluna em mobile.
  - Cada card:
    - Thumbnail via `GET /api/starred-hands/:id/image` (lazy).
    - Nota truncada a 2 linhas (CSS `line-clamp-2`); placeholder "Sem nota" em estilo muted quando `notes` vazia/null.
    - `data-testid="spot-viewer-thumb-{id}"`.
- Click no thumbnail abre preview ampliado (modal nested OU painel inline; escolha do implementer):
  - Imagem em tamanho full (max 80vh, manter aspect ratio).
  - Textarea editavel (`maxLength=500`, contador) pre-preenchida com `notes` atual.
  - Botao "Salvar" -> `PATCH /api/starred-hands/:id/review` com `{ notes }` -> toast "Nota atualizada" -> permanece no preview.
  - Botao "Excluir" (vermelho/destructive) com confirmacao inline:
    - Primeiro click: vira "Confirmar exclusao?" (`data-testid="spot-viewer-confirm-delete"`).
    - Segundo click confirma: `DELETE /api/starred-hands/:id/discard` -> toast "Print excluido" -> fecha preview, remove card da grid, invalida query pending.
    - Click fora ou outro botao cancela o estado de confirmacao.
  - Botao "Voltar" / X fecha o preview e mantem o viewer aberto.
- Fechar viewer: ESC ou X ou click fora; nao deve afetar estado da sessao.
- Sem reordenacao, sem multi-select, sem edicao de outros campos (`type`, `spot`, `conclusion`).

**Criterio de aceitacao:**
- [ ] Contador `X/10 prints` eh clicavel (botao acessivel com `data-testid="spot-viewer-trigger"`)
- [ ] Viewer abre Dialog listando prints da sessao via `GET /api/starred-hands/pending?sessionId=<id>`
- [ ] Empty state aparece quando lista vazia
- [ ] Click no thumbnail abre preview ampliado com textarea pre-preenchida
- [ ] Salvar nota persiste via PATCH e atualiza UI
- [ ] Excluir requer confirmacao inline (2 cliques)
- [ ] Apos exclusao, card some da grid e contador `X/10` decrementa
- [ ] ESC fecha viewer (sem afetar sessao)

## Requisitos Nao-Funcionais
- **Performance:** thumbnails lazy (`loading="lazy"`); listas <=10 itens, sem virtualizacao.
- **Acessibilidade:** Dialog com `role="dialog"`, focus trap (ja vem do Radix Dialog), ESC fecha, autoFocus na textarea principal.
- **Offline/erro de rede:** erro de PATCH/DELETE mostra toast destructive e mantem UI consistente com estado anterior.

## Endpoints Previstos
Nenhum endpoint novo. Reutiliza:

| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| PATCH | /api/starred-hands/:id/review | Atualiza `notes` do spot | JWT |
| DELETE | /api/starred-hands/:id/discard | Soft delete do spot | JWT |
| GET | /api/starred-hands/:id/image | Serve imagem do print | JWT |
| GET | /api/starred-hands/pending?sessionId=:id | Lista prints da sessao | JWT |

## Modelos de Dados Afetados
Nenhuma mudanca de schema. Apenas leitura/atualizacao de:

### starred_hands (existente, sem alteracao)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| id | string | pk | nanoid |
| sessionId | string | fk -> grind_sessions | filtro principal do viewer |
| notes | text | nullable, max 500 | alvo do PATCH |
| imagePath | string | not null | usado pelo endpoint /image |
| status | enum | `pending` (vivo) / `discarded` (soft delete) | DELETE muda para `discarded` |

## Integracoes Externas
Nenhuma.

## Cenarios de Teste Derivados

### Happy Path
- [ ] Paste -> upload -> Quick Note Dialog abre -> digitar nota -> Salvar -> PATCH chamado com `{ notes }` -> dialog fecha -> toast "Nota salva"
- [ ] Click contador -> Viewer abre -> grid renderiza com 1 card -> click thumb -> preview abre com textarea pre-preenchida -> Salvar -> PATCH chamado -> toast "Nota atualizada"
- [ ] Click contador -> Viewer abre -> click thumb -> Excluir -> Confirmar -> DELETE chamado -> card removido -> contador decrementa

### Validacao de Input
- [ ] Textarea bloqueia digitacao apos 500 chars (Quick Note + Viewer edit)
- [ ] Salvar com textarea vazia no Quick Note Dialog NAO chama PATCH (trata como Pular)
- [ ] Contador exibe `X / 500` corretamente

### Regras de Negocio
- [ ] Pular no Quick Note Dialog NAO chama PATCH
- [ ] ESC no Quick Note Dialog equivale a Pular
- [ ] Dois `onUploaded` consecutivos: segundo dialog abre APOS fechar o primeiro (fila respeitada)
- [ ] Apos DELETE, query pending eh invalidada e contador `X/10` no header reflete novo total
- [ ] Confirmacao de delete: primeiro click muda label para "Confirmar exclusao?"; click fora cancela

### Edge Cases
- [ ] PATCH falha (500): dialog permanece aberto, toast destructive aparece, textarea preserva texto digitado
- [ ] DELETE falha: card permanece na grid, toast destructive
- [ ] GET pending retorna lista vazia: empty state correto no viewer
- [ ] GET image 404 / falha: placeholder visual no card (broken-image fallback)
- [ ] Viewer aberto + novo paste em background: nota nova aparece na grid sem precisar reabrir (invalidate query no Quick Note save propaga)
- [ ] sessionId muda (sessao encerrada e nova iniciada) mid-flight: viewer reflete a sessao corrente correta

## Fora de Escopo
- Edicao de outros campos do spot (`type`, `spot`, `conclusion`, `tags`) — fica para `/estudos/spots`
- Reordenacao, drag-and-drop, multi-select, bulk delete
- Vincular spot a tema/estudo (link com biblioteca)
- Compartilhamento publico de spot
- Anotacoes via voz (TTS/STT)
- Suporte a video/gif

## Dependencias
- `SpotScreenshotPaster` ja wired em `GrindSessionLive.tsx` (concluido em sessao `session_2026-05-03-spot-paster-wiring.md`).
- Backend `starred-hands` endpoints ja em producao local.
- Componente Dialog do shadcn/Radix ja disponivel (`client/src/components/ui/dialog.tsx`).
- Toast (`useToast`) ja disponivel.
- TanStack Query ja configurado para invalidacao de `['starred-hands', 'pending', sessionId]`.

## Notas de Implementacao (opcional)
- Criar `client/src/components/grind-session-live/QuickNoteDialog.tsx` e `client/src/components/grind-session-live/SessionSpotsViewerDialog.tsx`.
- `GrindSessionLive.tsx` mantem o estado da fila local (`useState<StarredHand[]>`) para enfileirar Quick Note Dialogs.
- Usar `apiRequest('PATCH', ...)` / `apiRequest('DELETE', ...)` (ja retornam JSON parseado — lesson #13). Nao usar `fetch().then(r => r.json())`.
- `data-testid` obrigatorios (lesson #2):
  - Quick Note Dialog: `spot-note-dialog`, `spot-note-input`, `spot-note-save`, `spot-note-skip`
  - Session Spots Viewer: `spot-viewer-trigger`, `spot-viewer-dialog`, `spot-viewer-thumb-{id}`, `spot-viewer-edit-textarea`, `spot-viewer-edit-save`, `spot-viewer-delete`, `spot-viewer-confirm-delete`
- Hooks-first (lesson #1): nada de early-return antes de declarar todos os `useQuery` / `useMutation` / `useState`.
- Default minimo (lesson #11): nao adicionar acoes alem das listadas (sem "Marcar como revisado", sem export, etc).
- Testes RTL (jsdom):
  - Dialog open/save/skip + queue de 2 spots
  - Viewer open/empty-state/edit/delete (com confirmacao 2-cliques)
  - Mocks de `apiRequest` retornando JSON ja parseado.

---

## Lessons Aplicaveis
- **#1 Hooks first** — todos os hooks antes de qualquer return condicional em `QuickNoteDialog` e `SessionSpotsViewerDialog`.
- **#2 data-testid estavel** — listados acima; nada de heuristica DOM.
- **#11 Default minimo** — somente note + delete; sem acoes extras.
- **#13 apiRequest retorna JSON parseado** — mocks em testes devem retornar o objeto direto, nao um wrapper Response.
