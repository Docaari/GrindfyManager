# ADR-177 — Pagina dedicada de sessao de estudo + linkagem dual de notes (card legacy / sessao)

**Data:** 2026-05-21
**Status:** Aceito
**Sprint:** Estudos-Sessao-1 (`Docs/specs/sprint-estudos-sessao-1.md`)

## Contexto

O botao "Iniciar sessao de estudo" em `/estudos/temas/:id` (ThemeDetailView, predecessor home-reform-4 MEDIUM-6) hoje faz POST `/api/study-sessions` mudo + toast e deixa o user na mesma tela. Sem destino visual, sem bloco de anotacoes, sem timer. Founder explicitou: queria entrar num "modo estudo" focado.

Tres tabelas existentes entram em jogo:

- `study_themes` — taxonomia de estudo (ADR-127, hibrida 30 seed + custom).
- `study_sessions` — registro temporal de estudo (legacy, sem `status`; ja sobrevive ao deprecation parcial do `study_cards` — ADR-117 ja nullable `study_card_id`).
- `study_notes` — texto + `study_card_id NOT NULL` (legacy pre-Studies-Reform).

Notes hoje so existem em contexto de `StudyCard` (componentes orfaos `StudyCardDetail`/`AddNoteForm`/`NoteCard` ja sem imports). Para a UX nova ("anotei DURANTE a sessao X do tema Y"), notes precisam vincular a `study_sessions` — mantendo back-compat com notes legacy de card.

Restricoes:

- Sem perda de notes historicas (notes ligadas a card sao dados reais — alguns users alpha tem essas rows).
- Migration pequena (founder roda local via `db:push`; deploy prod via drizzle-kit boot).
- Sem dual-write — uma note tem UM dono (card OU sessao, XOR fraco).
- Status do lifecycle precisa ser query-friendly ("ja tem sessao ativa pra este tema?" — index parcial).
- Timer precisa sobreviver a refresh F5 (lesson #12: useState efemero perde estado, mas se for derivado de `session.date` = startedAt, recalcula).

## Decisao

Adotada **Opcao A** (entre 3 oferecidas pelo founder + system-architect):

### 1. Coluna nova `study_sessions.status varchar(16) NOT NULL DEFAULT 'active'`

Enum-like: `'active' | 'finished' | 'abandoned'`. Default `'active'` preserva back-compat das rows legacy (ficam ativas sem finalizacao explicita — aceitavel, nenhum consumer hoje filtra por status).

Index parcial `idx_study_sessions_active (user_id, theme_id) WHERE status='active'` habilita query "tem sessao ativa do user X para o tema Y?" (V2 — fora de escopo MVP, mas index ja criado para nao precisar de nova migration).

### 2. Coluna nova `study_notes.study_session_id varchar(21) REFERENCES study_sessions(id) ON DELETE CASCADE` (nullable)

CASCADE garante limpeza: deletar sessao deleta as notes daquela sessao (semantica "notes de sessao morrem com a sessao"; notes de card historicas permanecem intactas — `study_card_id` separado).

### 3. `study_notes.study_card_id` vira NULLABLE (era NOT NULL)

Deprecation gradual via lesson #7 — sem back-fill, sem dual-write. Notes novas escrevem em `study_session_id`; notes legacy continuam em `study_card_id`.

### 4. CHECK constraint XOR-fraco: `(study_card_id IS NOT NULL) OR (study_session_id IS NOT NULL)`

Pelo menos um link tem que existir. NAO eh XOR estrito (uma note podendo apontar para ambos seria semanticamente ruim mas nao quebra integridade; manter check mais simples = menos surpresa em ALTER posterior). Storage helpers validam Zod-side: payload de criacao via session-endpoint forca `studyCardId: null`.

### 5. Pagina nova `/estudos/sessao/:id` dentro do shell `Studies.tsx`

Mesma estrategia de `/estudos/temas/:id`: extender `StudiesView` union + `viewFromPath` regex, **sem rota nova em `App.tsx`** (fallback `/estudos/:rest*` ja delega).

### 6. Timer derivado de `session.date` (startedAt) — NAO de `useState` efemero

`elapsedSec = (now - session.date) / 1000` recomputado a cada tick (interval 1s). Refresh F5 mantem timer correto (lesson #12). Trade-off explicito: se user deixa aba aberta 5h, timer mostra 5h (aceitavel para MVP; V2 traz pause com `paused_at` accumulator).

### 7. Lifecycle status (semantica)

- `'active'` (default) — sessao em curso. Botao "Finalizar" visivel. Notes editaveis.
- `'finished'` — sessao concluida via PATCH `{ status: 'finished', duration: <minutos> }`. Pagina renderiza read-only (timer parado, notes sem form/delete).
- `'abandoned'` — V2, cron diario marca `active` sem nota nova ha >8h (fora de escopo MVP; coluna ja existe, valor nunca atribuido na sprint atual).

## Opcoes consideradas e descartadas

### Opcao B — Linkar notes ao `themeId` direto (sessao vira so timer wrapper)

**Pros:**
- Modelo mais simples (sem coluna `study_session_id`).
- Notes sobrevivem a delecao de sessao naturalmente.

**Contras (decisivos):**
- Perde granularidade: "anotei isso DURANTE a sessao X" vs "anotei sobre o tema em geral" colapsam.
- Quebra historico/auditoria de quanto se escreveu por sessao (futura analytics "media notes/sessao" fica impossivel).
- Sessao vira artefato puramente cronometrico — desincentiva instrumentacao futura (insights/focus score por sessao ja existem no schema).

**Veto:** founder confirmou no spec ("perde granularidade").

### Opcao C — Criar `StudyCard` virtual por sessao (1 card por sessao)

**Pros:**
- Zero ALTER em `study_notes` (continua `study_card_id NOT NULL`).
- Reusa toda infra existente de notes-em-card.

**Contras (decisivos):**
- Confusao semantica: "card" pre-Studies-Reform era unidade de conteudo de estudo (tipo flashcard). Sessao-como-card mistura conceitos.
- Dirty data: cards "fantasmas" aparecem em `/estudos/spots` query, tabelas SRS (ADR-136 spot-reentry), exports, dashboards — N pontos de filtro defensivo perpetuo.
- Forca manutencao do `study_cards` como ativo (contrario a deprecation gradual ja em curso — ADR-117 ja nullable em `study_sessions.study_card_id`).
- Aumenta acoplamento com a UI orfa que vai morrer (StudyCardDetail/AddNoteForm/NoteCard).

**Veto:** "confusao semantica + dirty data" no spec.

## Consequencias

### Positivas

- **Granularidade preservada** — analytics futura "media notes por sessao" / "tempo medio por tema" fica trivial via `JOIN study_sessions ON theme_id`.
- **Deprecation gradual de `study_cards`** continua sem dual-write (ADR-117 ja moveu primeira peca).
- **Index parcial `WHERE status='active'`** ja criado — query "tem sessao ativa?" para V2 sem nova migration.
- **Migration small** (1 ALTER tabela `study_sessions` + 3 ALTER em `study_notes`) — rollback trivial.
- **Timer DST-safe** — derivado de `session.date` (timestamp UTC), nao sofre off-by-one em transicao de fuso (mesma classe do ADR-175).

### Negativas

- **CHECK XOR-fraco aceita notes "duplas"** (com card_id E session_id != null). Storage Zod previne na criacao, mas DB nao garante. Trade-off: CHECK estrito (`XOR` real) seria `(study_card_id IS NULL) <> (study_session_id IS NULL)` mas exige duplo NOT NULL no insert — mais fricao para test fixtures e migracoes futuras. Mantido fraco; storage canoniza.
- **Timer "5h aberto na aba"** — sem pause real no MVP. User pode achar estranho ver `05:23:14`. Mitigacao: V2 inclui `paused_at`. Toast no finalizar mostra `duration` em min (Math.round), entao DB nao guarda valor absurdo.
- **Componentes orfaos permanecem no repo** — `StudyCardDetail.tsx`, `AddNoteForm.tsx`, `NoteCard.tsx` (zero imports). Cleanup sweep em UX-QW-4 (follow-up).

### Neutras

- **3 endpoints novos** (`GET /api/study-sessions/:id`, `PATCH /api/study-sessions/:id`, `GET/POST /api/study-sessions/:id/notes`) — padrao Express + Zod ja estabelecido; storage helpers em modulo dedicado `server/storage/studyStorage.ts` (lesson #36 — lazy import de schema).
- **`DELETE /api/study-notes/:id` estendido** — ownership check ganha caminho XOR (JOIN via card OU JOIN via session).
- **Telemetria nova** (`study_session_started`, `study_note_created`, `study_session_finished`) — alimenta retencao futura sem PII.

## Migracao

**Arquivo:** `migrations/0072_study_sessions_status_and_notes_link.sql`

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

ALTER TABLE study_notes
  ADD CONSTRAINT study_notes_link_xor CHECK (
    (study_card_id IS NOT NULL) OR (study_session_id IS NOT NULL)
  );

CREATE INDEX idx_study_notes_session
  ON study_notes (study_session_id)
  WHERE study_session_id IS NOT NULL;
```

**Back-fill:** nao necessario. Rows historicas de `study_notes` tem `study_card_id NOT NULL` -> passam no CHECK. Rows novas via endpoint de sessao escrevem `study_session_id` -> passam.

**Rollback:**

```sql
DROP INDEX idx_study_notes_session;
ALTER TABLE study_notes DROP CONSTRAINT study_notes_link_xor;
ALTER TABLE study_notes ALTER COLUMN study_card_id SET NOT NULL;
ALTER TABLE study_notes DROP COLUMN study_session_id;
DROP INDEX idx_study_sessions_active;
ALTER TABLE study_sessions DROP COLUMN status;
```

Sem perda de dados de notes legacy (todas ja tem `study_card_id`).

## Refs

- Sprint spec: `Docs/specs/sprint-estudos-sessao-1.md` (11 RFs, defaults Q-A..Q-D aceitos).
- Diagrama sequencia: `Docs/architecture/diagrams/estudos-sessao-1/start-session-flow.mermaid`.
- ER patch: `Docs/architecture/diagrams/estudos-sessao-1/er-patch.mermaid`.
- ADR-117 (study_sessions.theme_id nullable + sem back-fill) — precedente de deprecation gradual no mesmo dominio.
- ADR-126 (`study_sessions_v2` tabela nova) — confirma que `study_sessions` legacy continua viva e ganha melhorias (status). Sprint atual NAO migra para v2 (escopo: pagina + linkagem; v2 fica para futuro merge).
- Lesson #7 (schema deprecation gradual).
- Lesson #12 (useState efemero vs derivado).
- Lesson #34 (handler aceita storage injetado como 3o arg).
- Lesson #36 (storage modules com mock parcial precisam lazy import de schema).
