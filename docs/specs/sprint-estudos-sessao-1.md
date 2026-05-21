# Sprint Estudos-Sessao-1 — Pagina dedicada de sessao de estudo

**Data:** 2026-05-21
**Tipo:** Feature nova (frontend + backend + migration)
**Predecessor:** Studies-Reform (commit 6bc4e20, 2026-05-01) + home-reform-4 MEDIUM-6 (ThemeDetailView)
**Branch sugerida:** `feature/estudos-sessao-1` (worktree opcional)
**Proximo agente:** system-architect (ADR + diagrama de sequencia + ER patch)

---

## Status
Proposta

---

## Resumo

Hoje o botao "Iniciar sessao de estudo" em `/estudos/temas/:id` (ThemeDetailView) faz um POST `/api/study-sessions` mudo + toast — sem destino visual. Founder frustrado: queria entrar num "modo estudo" com bloco de anotacoes + timer. Esta sprint cria a **pagina dedicada `/estudos/sessao/:id`** que abre apos o POST com:
- Bloco de notes (CRUD inline) linkadas a sessao.
- Timer ao vivo (running clock + pause/finalizar).
- Header com tema + link voltar.

UI antiga ORFA (`StudyCardDetail` + `AddNoteForm` + `NoteCard`) NAO sera reusada — vamos criar componentes novos focados em sessao, e marcar a orfa para deprecation em follow-up.

---

## Contexto

**Fluxo atual quebrado:**
```
/estudos/temas/:id [ThemeDetailView]
  -> click "Iniciar sessao de estudo"
  -> POST /api/study-sessions { themeId, duration: 0, activities: ['theme'] }
  -> 200 OK + toast "Sessao de estudo iniciada"
  -> usuario continua na mesma tela, sem onde anotar nada
```

**Fluxo desejado (MVP):**
```
/estudos/temas/:id
  -> click "Iniciar sessao de estudo"
  -> POST /api/study-sessions retorna { id, ... }
  -> redirect /estudos/sessao/:id
  -> SessionPage: header (tema + voltar) + Timer + NotesBlock + btn Finalizar
  -> click Finalizar -> PATCH /api/study-sessions/:id { duration: <minutos>, status: 'finished' }
  -> redirect /estudos/temas/:id
```

UI orfa pos-Studies-Reform (`client/src/components/studies/StudyCardDetail.tsx`, `AddNoteForm.tsx`, `NoteCard.tsx`) tem padrao de notes-em-card, NAO de notes-em-sessao. Reaproveitamento aumentaria coupling com `studyCardId` (que vai morrer junto). MVP cria 2 componentes novos: `NotesBlock` + `SessionTimer`.

---

## Decisao arquitetural — Modelo de dados (RECOMENDACAO PM)

Founder ofereceu 3 opcoes:

**Opcao A (recomendada):** adicionar coluna `studySessionId varchar(21) REFERENCES study_sessions(id) ON DELETE CASCADE` em `study_notes`. Manter `studyCardId` NULLABLE (era NOT NULL). Notes podem pertencer a um card legacy OU a uma sessao.

**Opcao B:** linkar notes ao `themeId` direto. Sessao vira so timer wrapper. **Rejeitada:** perde granularidade ("anotei isso DURANTE a sessao X" vs "anotei sobre o tema em geral"). Quebra historico/auditoria de quanto se escreveu por sessao.

**Opcao C:** criar StudyCard virtual por sessao. **Rejeitada:** confusao semantica + dirty data (cards "fantasmas" no `/estudos/spots` query, em tabelas de SRS, etc).

**Justificativa Opcao A:**
- Migration pequena (1 ALTER TABLE + 1 alter NOT NULL -> NULL em `study_card_id`).
- Endpoints atuais (`GET/POST /api/study-cards/:id/notes`) continuam funcionando para cards legacy.
- Endpoints novos (`GET/POST /api/study-sessions/:id/notes`) servem o caso novo.
- Ownership: notes de sessao -> `JOIN study_sessions ON user_id`. Notes de card -> `JOIN study_cards ON user_id` (ja existe `ownsNote`).
- Storage tem que aceitar UM dos dois links (XOR). Validacao Zod + CHECK constraint opcional.

**Decisao de lifecycle (`status` em `study_sessions`):**
- Adicionar coluna `status varchar(16) NOT NULL DEFAULT 'active'`. Valores: `'active' | 'finished' | 'abandoned'`.
- Default `'active'` mantem retro-compat das sessoes legacy (que ficam ativas mas sem finalizacao explicita).
- Index parcial `WHERE status='active'` para query "tenho sessao ativa pra este tema?".

---

## Usuarios

- **Jogador grindando estudos** — entra em `/estudos/temas/:id`, clica "Iniciar sessao", vai pra pagina dedicada, anota durante 30-60min, finaliza.
- **Jogador retomando sessao** (v2 — fora de escopo): ver pendencias.

---

## Requisitos Funcionais

### RF-01 — Migration: `study_sessions.status` + `study_notes.study_session_id` (S)

**Descricao:** schema update em duas tabelas existentes.

**Acao:**
1. Migration `0072_study_sessions_status_and_notes_link.sql`:
   ```sql
   ALTER TABLE study_sessions
     ADD COLUMN status varchar(16) NOT NULL DEFAULT 'active';

   CREATE INDEX idx_study_sessions_active
     ON study_sessions (user_id, theme_id)
     WHERE status = 'active';

   ALTER TABLE study_notes
     ADD COLUMN study_session_id varchar(21)
     REFERENCES study_sessions(id) ON DELETE CASCADE;

   ALTER TABLE study_notes
     ALTER COLUMN study_card_id DROP NOT NULL;

   -- CHECK: pelo menos um dos dois links presente.
   ALTER TABLE study_notes
     ADD CONSTRAINT study_notes_link_xor CHECK (
       (study_card_id IS NOT NULL) OR (study_session_id IS NOT NULL)
     );

   CREATE INDEX idx_study_notes_session
     ON study_notes (study_session_id)
     WHERE study_session_id IS NOT NULL;
   ```

2. Atualizar `shared/schema.ts`:
   - `studySessions.status` enum-like varchar(16) com Zod refinement.
   - `studyNotes.studyCardId` -> `.nullable()` em insertSchema (gradual deprecation — lesson #7).
   - `studyNotes.studySessionId` nova coluna opcional.

3. Atualizar `insertStudyNoteSchema`: `studyCardId: z.string().optional(), studySessionId: z.string().optional()` + `.refine(d => !!d.studyCardId || !!d.studySessionId, 'at least one link required')`.

**Criterio de aceitacao:**
- [ ] `npm run db:push` aplica clean (sem manual SQL).
- [ ] `npm run check` exit 0.
- [ ] Tests existentes de `study_notes` (linkados a card) continuam passando.

**Lessons:** #7 (schema deprecation gradual — `studyCardId` vai de NOT NULL pra NULLABLE com back-fill via XOR check).

---

### RF-02 — Endpoint `POST /api/study-sessions` retorna sessao completa (S)

**Descricao:** endpoint atual ja retorna `session` do `storage.createStudySession`. Garantir que o JSON tem `id` (frontend precisa pra redirecionar).

**Acao:**
- Verificar `storage.createStudySession` retorna row completa com `id` (deve, ja eh padrao Drizzle `.returning()`).
- Adicionar default `status: 'active'` no insert se nao vier no body.
- Sem mudanca de assinatura.

**Criterio de aceitacao:**
- [ ] POST `/api/study-sessions` body `{ themeId, date, duration: 0, activities: ['theme'] }` retorna `{ id, userId, themeId, status: 'active', ... }`.
- [ ] Test integration garante shape.

---

### RF-03 — Endpoint `PATCH /api/study-sessions/:id` (S)

**Descricao:** novo endpoint para finalizar / atualizar sessao.

**Acao:**
- `app.patch('/api/study-sessions/:id', requireAuth, handler)`.
- Body Zod-validated: `{ duration?: number, status?: 'active'|'finished'|'abandoned', focusScore?: number, productivityScore?: number, insights?: string }`.
- Ownership: storage helper `getStudySession(id, userId)` retorna `null` se nao for do user — handler responde 404.
- Storage method novo: `updateStudySession(id, userId, patch)`.

**Criterio de aceitacao:**
- [ ] PATCH com `{ duration: 35, status: 'finished' }` atualiza row + retorna 200 com row atualizada.
- [ ] PATCH em sessao de outro user retorna 404.
- [ ] Body invalido retorna 400.
- [ ] Test integration cobre os 3 casos.

**Lessons:** #34 (handler aceita storage como 3o arg pra teste).

---

### RF-04 — Endpoints `GET/POST /api/study-sessions/:id/notes` (S)

**Descricao:** CRUD de notes linkadas a sessao.

**Acao:**
- `app.get('/api/study-sessions/:id/notes', requireAuth, ...)` — lista notes ordenadas por `createdAt ASC`.
- `app.post('/api/study-sessions/:id/notes', requireAuth, ...)` — cria note com `studySessionId = req.params.id`.
- `app.delete('/api/study-notes/:id', ...)` ja existe; estender `ownsNote` para aceitar tambem JOIN via `study_sessions` (XOR — checar qual coluna NOT NULL).
- Storage methods novos: `getStudyNotesBySession(sessionId)`, `createStudyNoteForSession(data)` (ou reuso de `createStudyNote` com payload que tem `studySessionId`).

**Criterio de aceitacao:**
- [ ] GET retorna array de notes da sessao (somente do user).
- [ ] POST cria note com `studyCardId: null, studySessionId: <id>` + retorna row.
- [ ] DELETE remove note de sessao do user; nega notes de outros users (404).
- [ ] Tests cobrem ownership cross-user.

**Lessons:** #34 (storage injection), #13 (apiRequest retorna JSON parseado).

---

### RF-05 — Rota frontend `/estudos/sessao/:id` (S)

**Descricao:** rota nova dentro do shell Studies (consistente com `/estudos/temas/:id`).

**Acao:**
1. `client/src/pages/Studies.tsx`:
   - Adicionar `'sessao-detail'` no union `StudiesView`.
   - Helper `extractSessionIdFromPath(pathname)` analogo a `extractThemeIdFromPath`.
   - `viewFromPath` reconhece `/estudos/sessao/:id` -> `'sessao-detail'`.
   - Renderiza `<StudySessionPage sessionId={id} />` quando view = `'sessao-detail'`.
2. NAO mexer em `App.tsx` — fallback `/estudos/:rest*` ja delega pra Studies.

**Criterio de aceitacao:**
- [ ] Navegar `/estudos/sessao/abc123` renderiza `<StudySessionPage>` (mesmo que vazio).
- [ ] `/estudos/sessao` (sem id) cai no Redirect default pra `/estudos/dashboard`.

---

### RF-06 — Componente `StudySessionPage` (M)

**Descricao:** novo componente em `client/src/components/studies/StudySessionPage.tsx`.

**Layout:**
```
+--------------------------------------------------+
| [<- voltar ao tema]  Tema: Jogando OOP PosFlop  |
+--------------------------------------------------+
| [SessionTimer] 00:23:45  [Pausar] [Finalizar]   |
+--------------------------------------------------+
| [NotesBlock]                                    |
|   [+ Nova nota]                                 |
|   - Note 1 (hh:mm) [excluir]                    |
|   - Note 2 (hh:mm) [excluir]                    |
+--------------------------------------------------+
```

**Acao:**
- Hook `useQuery(['/api/study-sessions', sessionId])` — busca sessao (precisa endpoint `GET /api/study-sessions/:id`).
  - **DECISAO:** criar GET single-session endpoint (RF-04.5 implicito) — handler simples reusando `getStudySession(id, userId)`.
- Estado local `<TimerState>` (ver RF-07).
- Render condicional:
  - `isLoading` -> skeleton com `data-testid="study-session-loading"`.
  - `session === null` (404) -> empty state com `data-testid="study-session-not-found"` + link `/estudos/temas`.
  - `session.status === 'finished'` -> read-only mode (timer fixo, notes read-only).
  - default -> modo ativo (timer rodando, notes editaveis).

**Criterio de aceitacao:**
- [ ] Renderiza header com nome do tema (busca via `/api/study-themes` + filter por `session.themeId`).
- [ ] Hooks declarados ANTES de qualquer early return (lesson #1).
- [ ] Todos elementos interativos tem `data-testid` estavel (lesson #2).
- [ ] Sessao finalizada renderiza timer parado + sem btn "Finalizar".

**Lessons:** #1 (hooks first), #2 (data-testid), #13 (apiRequest), #29 (ErrorBoundary se Sidebar quebrar — provavelmente nao aplica aqui mas vale checar).

---

### RF-07 — `SessionTimer` component + finalizar (M)

**Descricao:** timer ao vivo + acao de finalizar.

**Acao:**
- Arquivo novo `client/src/components/studies/SessionTimer.tsx`.
- Props: `{ startedAt: string | Date, status: 'active'|'finished', onFinish: (durationMinutes: number) => void }`.
- `useState<{startedAtMs: number, elapsedSec: number}>` + `useEffect` com `setInterval` 1s atualizando `elapsedSec`.
- Cleanup do interval no unmount.
- Quando `status === 'finished'`, NAO inicia o interval; mostra duration final.
- Btn "Finalizar":
  - Chama `onFinish(Math.round(elapsedSec / 60))`.
  - Parent (`StudySessionPage`) faz PATCH `/api/study-sessions/:id { duration, status: 'finished' }`.
  - Em onSuccess -> `navigate('/estudos/temas/' + session.themeId)` + toast "Sessao finalizada (Xmin)".
- Formato HH:MM:SS (ou MM:SS se < 1h).

**Acceptance:**
- [ ] Timer incrementa 1s/s enquanto ativo.
- [ ] `setInterval` limpo no unmount (sem leak).
- [ ] Finalizar -> PATCH -> redirect -> toast.
- [ ] PATCH falha -> toast erro + permanece na pagina (lesson #9 — log antes do fallback).

**Lessons:** #1 (hooks first), #9 (try/catch loga antes), #12 (estado em React Query vs useState — timer eh efemero, useState OK).

---

### RF-08 — `NotesBlock` component (M)

**Descricao:** CRUD inline de notes da sessao.

**Acao:**
- Arquivo novo `client/src/components/studies/NotesBlock.tsx`.
- Props: `{ sessionId: string, readOnly?: boolean }`.
- `useQuery(['/api/study-sessions', sessionId, 'notes'], ...)` -> lista de notes.
- Render: lista cronologica de notes (`<NoteRow>` interno — `content` + `createdAt` formatado + btn excluir).
- Form inline no topo: `<textarea>` + btn "Adicionar" (Enter+Ctrl ou click).
- `useMutation` POST + invalidateQueries da query key.
- `useMutation` DELETE + optimistic update opcional (v2 — MVP usa invalidate).
- ReadOnly -> esconde form + btns de excluir.

**Acceptance:**
- [ ] POST nova note -> aparece na lista (sem reload da pagina).
- [ ] DELETE note -> some da lista.
- [ ] readOnly=true -> form + delete buttons escondidos.
- [ ] Textarea com `data-testid="note-input"`, btn add `data-testid="note-add-btn"`, cada row `data-testid={`note-row-${id}`}`.

**Lessons:** #2 (data-testid), #13 (apiRequest), #6 (apiRequest retorna JSON, mocks devem fazer o mesmo).

---

### RF-09 — Redirect do `ThemeDetailView` apos POST (S)

**Descricao:** mudar onSuccess do `startSessionMutation`.

**Acao:**
- Em `client/src/components/studies/ThemeDetailView.tsx`:
  - `onSuccess: (created) => { navigate('/estudos/sessao/' + created.id); }`.
  - Manter `invalidateQueries(['/api/study-sessions'])` + `invalidateQueries(['/api/home/focus-stats'])`.
  - Trocar toast por toast mais discreto (opcional — pode remover, redirect ja eh feedback).
- `apiRequest` ja retorna JSON parseado (lesson #13), entao `created.id` funciona direto.

**Acceptance:**
- [ ] Click "Iniciar sessao" -> sessao criada -> redirect imediato pra `/estudos/sessao/:id`.
- [ ] Falha de POST -> permanece em ThemeDetailView + toast erro.

**Lessons:** #13 (apiRequest retorna JSON parseado).

---

### RF-10 — Telemetria (S)

**Descricao:** trackear eventos de sessao para futuras analises de retencao.

**Acao:**
- Em `StudySessionPage`/`NotesBlock`/timer finalizar, chamar `track()` de `client/src/lib/telemetry.ts`:
  - `study_session_started` (payload `{ sessionId, themeId }`) — disparado no mount de StudySessionPage.
  - `study_note_created` (payload `{ sessionId, length: content.length }`).
  - `study_session_finished` (payload `{ sessionId, durationMin, noteCount }`).
- Sem PII no payload (lesson interna: telemetry.ts so aceita IDs + flags).

**Acceptance:**
- [ ] 3 eventos disparados nos triggers corretos.
- [ ] Test unit usa spy em `track` para validar invocacao.

---

### RF-11 — Testes (M)

**Descricao:** suite TDD red-phase antes da implementacao.

**Cobertura minima:**

**Backend (`tests/integration/studies/`):**
- `study-session-patch.test.ts`: PATCH finalizar, PATCH 404, body invalido.
- `study-session-notes.test.ts`: POST cria + linka, GET lista, DELETE remove, ownership cross-user.

**Frontend (`tests/components/studies/`):**
- `StudySessionPage.test.tsx`: render loading, render not-found, render ativo, render finalizado.
- `SessionTimer.test.tsx`: incrementa com `vi.useFakeTimers`, finalizar dispara callback com duracao em min.
- `NotesBlock.test.tsx`: render lista, POST adiciona, DELETE remove, readOnly esconde controles.
- `ThemeDetailView.redirect.test.tsx`: success do start mutation chama `navigate('/estudos/sessao/...')`.

**Cuidados:**
- Lesson #14: usar `await import(...)` em vez de `require()` em test files `.tsx`.
- Lesson #15: `vi.doMock` em vez de `vi.unmock` em nested scope.
- Lesson #34: handlers aceitam storage injetado como 3o arg.

**Criterio de aceitacao:**
- [ ] Suite red-phase escrita ANTES do implementer.
- [ ] Apos implementacao, 100% verde.
- [ ] Zero regressao em suite estudos existente.

---

## Fora de Escopo (MVP)

- **Resumir/retomar sessao ativa** — ao entrar `/estudos/temas/:id` e ja ter `status='active'` deste user para o tema, NAO mostrar opcao "Retomar". V2.
- **Materiais (videos, links) dentro da sessao** — adiar.
- **Spots/screenshots dentro da sessao** — adiar (existe componente em `/estudos/spots` reutilizavel em v2).
- **Markdown/rich-text em notes** — MVP: textarea puro.
- **Auto-save de note enquanto digita** — MVP: explicit "Adicionar".
- **Edicao de note existente** — MVP: so create + delete.
- **Pause real do timer** — MVP: btn "Pausar" desativado/escondido. So "Finalizar". (V2 traz pause com tracking `pausedAt`.)
- **Score focus/productivity ao finalizar** — schema ja tem, MVP nao pede.
- **Insights/reflection ao finalizar** — campo existe (`insights text`), MVP nao pede.
- **Notificacao push de "sessao longa demais"** — adiar.

---

## Dependencias

- Tabela `study_themes` (existe).
- Tabela `study_sessions` (existe — vai ganhar `status`).
- Tabela `study_notes` (existe — vai ganhar `studySessionId` + `studyCardId` virar nullable).
- Hook `useToast` (existe).
- `apiRequest` helper (existe — lesson #13).
- `telemetry.track` (existe).
- Shell `Studies.tsx` (existe — vai ganhar nova view).

---

## Endpoints Previstos

| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| POST | `/api/study-sessions` | Cria sessao (ja existe; agora retorna `status='active'`) | JWT |
| GET | `/api/study-sessions/:id` | **NOVO** — busca sessao single (ownership user) | JWT |
| PATCH | `/api/study-sessions/:id` | **NOVO** — atualiza duration/status/scores | JWT |
| GET | `/api/study-sessions/:id/notes` | **NOVO** — lista notes da sessao | JWT |
| POST | `/api/study-sessions/:id/notes` | **NOVO** — cria note linkada a sessao | JWT |
| DELETE | `/api/study-notes/:id` | (existe) — estender ownership pra notes de sessao | JWT |

---

## Modelos de Dados Afetados

### `study_sessions` (alteracao)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| status | varchar(16) | NOT NULL DEFAULT 'active' | NOVO. Enum: active/finished/abandoned |

Index novo: `idx_study_sessions_active (user_id, theme_id) WHERE status='active'`.

### `study_notes` (alteracao)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| study_card_id | varchar | NULLABLE (era NOT NULL) | Deprecation gradual |
| study_session_id | varchar(21) | FK `study_sessions(id) ON DELETE CASCADE`, nullable | NOVO |

CHECK constraint: `(study_card_id IS NOT NULL) OR (study_session_id IS NOT NULL)` (XOR fraco — pelo menos um).
Index novo: `idx_study_notes_session (study_session_id) WHERE study_session_id IS NOT NULL`.

---

## Cenarios de Teste Derivados

### Happy Path
- [ ] User clica "Iniciar sessao" em `/estudos/temas/:id` -> redirecionado para `/estudos/sessao/:id` em < 500ms.
- [ ] Timer comeca em 00:00 e incrementa.
- [ ] User adiciona 3 notes -> aparecem na lista cronologica.
- [ ] User clica "Finalizar" -> redirect pra tema + toast "Sessao finalizada (Xmin)".
- [ ] Backend `study_sessions.duration` = minutos corretos, `status='finished'`.

### Validacao
- [ ] POST `/api/study-sessions/:id/notes` body sem `content` -> 400.
- [ ] PATCH `/api/study-sessions/:id` com `status` invalido -> 400.

### Ownership / Seguranca
- [ ] GET sessao de outro user -> 404.
- [ ] PATCH sessao de outro user -> 404.
- [ ] DELETE note de outro user -> 404.

### Edge Cases
- [ ] Sessao com 0 notes finalizada normalmente.
- [ ] Refresh F5 em `/estudos/sessao/:id` durante timer ativo -> timer reinicia do `session.date` (calcula elapsed = now - startedAt). NOTA: lesson #12 — useState efemero, em refresh recalcula via `session.date`.
- [ ] Sessao finalizada acessada via URL direta -> render read-only.
- [ ] Click "Finalizar" 2x rapido -> idempotente (segundo PATCH retorna estado finalizado).

### Telemetria
- [ ] 3 eventos disparados na ordem correta.

---

## Perguntas Abertas (Q-A..Q-D)

### Q-A — Sessao ativa unica por tema?
**Default escolhido:** NAO. Permitir multiplas sessoes ativas (user pode estar estudando 2 temas em paralelo em abas).
**Alternativa:** UNIQUE partial `(user_id, theme_id) WHERE status='active'` -> bloqueia. Founder confirmar se quer constraint.

### Q-B — Sessao ativa abandonada (browser fechado sem finalizar) — limpeza?
**Default escolhido:** sem limpeza automatica no MVP. V2: cron diario marca como `'abandoned'` sessoes `'active'` com mais de 8h sem nota nova.
**Alternativa:** marcar abandoned no proprio `unload` event (frequente fail em mobile — descartado).

### Q-C — Timer recomeca em refresh?
**Default escolhido:** NAO recomeca. Calculado via `session.date` (created_at funcional) = startedAt -> `elapsedSec = (now - startedAt) / 1000`. Time persiste em DB.
**Implicacao:** se user deixa aba aberta 5h, timer mostra 5h. Aceitavel.

### Q-D — Btn "Pausar" no MVP?
**Default escolhido:** ESCONDIDO no MVP. So "Finalizar". V2 adiciona pause real com coluna `paused_at` + accumulator.

---

## Notas de Implementacao (opcional)

- **Componente orfao deprecated:** `StudyCardDetail.tsx` + `AddNoteForm.tsx` + `NoteCard.tsx` permanecem no repo (zero imports). Follow-up sweep: deletar em sprint cleanup posterior (UX-QW-4?) apos confirmar zero referencia.
- **`Studies.tsx` shell pattern:** seguir mesmo padrao de `'tema-detail'` (path regex + sub-view + props). Sem rota nova em `App.tsx`.
- **Storage layer:** preferir helpers em `server/storage/studyStorage.ts` (modulo dedicado novo, se nao existir) em vez de adicionar em `server/storage.ts` monolitico — lesson #36 (modulos de storage com mock parcial precisam lazy import de schema).
- **Form de note simples:** Textarea Radix-styled + Button shadcn. Sem react-hook-form (overkill p/ 1 campo).

---

## ADR planejado

- **ADR-177** (numero sugerido — confirmar `Docs/architecture/decisions/`): "Pagina dedicada de sessao de estudo + linkagem dual de notes (card legacy / sessao)".
  - Decision: opcao A (coluna nova + CHECK XOR fraco).
  - Consequences: deprecation gradual de `study_card_id NOT NULL`; estudo per-sessao habilita analytics futuro de "media notes/sessao", "tempo medio por tema".

---

## Migration plano (Opcao A — escolhida)

1. **Pre-deploy local:** rodar migration via `npm run db:push` (autonomy_db_and_push liberada).
2. **Producao:** migration file commitado em `migrations/0072_*.sql` — aplica via drizzle-kit no boot do deployer (futuro).
3. **Back-fill:** **nao necessario** — colunas novas tem default ou aceitam NULL, CHECK constraint cobre rows novas. Rows historicas de `study_notes` ja tem `study_card_id NOT NULL` -> passa no CHECK.
4. **Rollback:** `ALTER TABLE study_notes DROP COLUMN study_session_id; ALTER TABLE study_notes ALTER COLUMN study_card_id SET NOT NULL; ALTER TABLE study_sessions DROP COLUMN status; DROP INDEX ...`. Sem perda de dados de notes legacy.

---

## Verificacao Final (pre-handoff system-architect)

- [x] Cada RF tem acceptance criteria.
- [x] Cenarios cobrem happy path + erros + edge cases.
- [x] Fora de escopo explicito.
- [x] Lessons aplicaveis mapeadas (#1, #2, #6, #7, #9, #12, #13, #14, #15, #34, #36).
- [x] Endpoints + modelos documentados.
- [x] Migration com rollback.
- [x] Q-A..Q-D com defaults sensatos (founder pode redirecionar).
