# ADR-222: Estender `study_sessions_v2` para Stat Analysis + Registro Enriquecido (EST-3 / D7)

## Status
Aceito

## Data
2026-06-01

## Contexto

O Sprint EST-3 (master-plan `Docs/specs/estudo-ia-overhaul-2026-06-01/`) combina, por
decisão travada do founder (D7), duas features de estudo numa única migration e num único
form de registro:

- **Parte A (NET-NEW):** o jogador analisa **uma stat HUD específica dentro de um tema**,
  filtra suas jogadas por essa stat e, por jogada, salva print da jogada + print da solução
  GTO + texto de erro + texto de aprendizado, tudo revisável depois sob `tema → stat`.
- **Parte B (polish):** registro de sessão enriquecido com nº de mãos solucionadas, nº de
  filtros analisados e insights da aula.

Decisões já travadas que **não reabro** (input do founder/master-plan):

- **D4:** estender `study_sessions_v2`, **não** criar tabela nova.
- **D7:** EST-3 + EST-4 juntos → **1 migration** (`0086`) + **1 form unificado**.
- Imagens **PRIVADAS** em `private-uploads/stat-analysis/` (copyright GTO), MIME por magic
  bytes, cap 5MB.
- Lesson #7: colunas novas `optional + default + back-fill`, **nunca** `required` puro.
- Lesson #34: handlers novos aceitam `injectedStorage` como 3º arg.

O conflito central (Q-OPEN-1) é estrutural: `study_sessions_v2` é **session-level**, mas a
revisão pedida é **"por stat dentro do tema"** — i.e., um eixo de leitura (`themeId × statId`)
que atravessa N sessões. Estender a tabela (D4) economiza uma tabela nova e mantém o form
unificado, mas exige um índice dedicado e um método de storage que desnormaliza as entries.

Este ADR resolve as 7 questões abertas da spec.

---

## Opções Consideradas

### Opção A — Tabela dedicada `stat_analysis_entries` (entry-level, FK p/ sessão)
- **Prós:** índice natural `(user_id, theme_id, stat_id)` por linha; query de revisão é
  `SELECT ... WHERE` simples sem flatten no app-layer; cap de 10 vira `COUNT`.
- **Contras:** **viola D4** (founder travou "estender, não criar tabela"); duplica a noção de
  sessão; o form unificado precisaria de 2 writes transacionais (sessão + entries); mais
  superfície de migration/rollback. Rejeitada por contrato.

### Opção B — Estender `study_sessions_v2` com `stat_analysis_entries jsonb` + índice parcial
- **Prós:** cumpre D4/D7; 1 write por sessão; entries viajam junto com a sessão (GET detalhe
  trivial); cap 10 = `array.length` no Zod/serviço; reusa todo o handler/PATCH existente.
- **Contras:** a revisão "por stat" exige **flatten cross-session no app-layer**
  (desnormalizar entries de N sessões); índice em jsonb não filtra entries individuais — só
  acelera o recorte de sessões por `(user, theme, stat, mode)`. Aceito: o volume é pequeno
  (cap 10 entries/sessão, poucas sessões `stat_analysis` por tema).

### Opção C — Estender + coluna gerada / GIN em jsonb p/ buscar entries
- **Prós:** poderia indexar dentro do array.
- **Contras:** over-engineering para o volume real; GIN em jsonb encarece writes e não há
  query que filtre por campo interno da entry (o recorte é sempre por `statId` da sessão, que
  é coluna escalar). Rejeitada por custo/benefício.

**Decisão: Opção B.**

---

## Decisão

Estender `study_sessions_v2` com 5 colunas novas (`stat_id`, `stat_analysis_entries`,
`hands_solved_count`, `filters_analyzed_count`, `lesson_insights`), adicionar o modo
`stat_analysis` ao enum Zod, criar **um índice parcial** `WHERE mode = 'stat_analysis' AND
deleted_at IS NULL`, e um método `getStatAnalysisEntries(userId, themeId, statId?)` que
recorta as sessões `stat_analysis` do tema (via o índice) e **achata as entries no app-layer**
(flatten cross-session), substituindo as keys cruas por URLs servíveis (RF-05).

As 7 decisões abaixo são normativas para o test-writer e o implementer.

### D-1 — Q-OPEN-1: índice + assinatura `getStatAnalysisEntries` (RISCO CRÍTICO)

**Índice (parcial):**
```sql
CREATE INDEX IF NOT EXISTS idx_ssv2_stat_analysis_theme_stat
  ON study_sessions_v2 (user_id, theme_id, stat_id)
  WHERE mode = 'stat_analysis' AND deleted_at IS NULL;
```
- **Parcial, não total** — `stat_analysis` é uma fração mínima das sessões (a maioria é
  `drill_gto`/`lesson`); índice total inflaria writes de todos os modos sem ganho. O predicado
  parcial mantém o índice pequeno e cobre exatamente a query de revisão.
- **`deleted_at IS NULL` ENTRA na cláusula** — a revisão nunca lista sessões soft-deleted
  (paridade com `getStudySessionsV2`, que sempre filtra `isNull(deletedAt)`). Manter o filtro
  no índice torna-o um índice-coberto para o caminho quente.
- `mode = 'stat_analysis'` no predicado (não nas colunas indexadas) porque o recorte já é
  garantido pela cláusula; indexar `mode` seria redundante.

**Assinatura:**
```ts
getStatAnalysisEntries(
  userId: string,
  themeId: string,
  statId?: string,
): Promise<StatAnalysisReviewGroup[]>
```
onde:
```ts
interface StatAnalysisReviewEntry {
  id: string;
  filters: string;
  errorText: string;
  learnedText: string;
  createdAt: string;
  // keys NÃO expostas; URLs servíveis (RF-05) montadas no handler, não no storage.
  playImageKey: string | null;
  solutionImageKey: string | null;
}
interface StatAnalysisReviewGroup {
  statId: string;
  sessions: Array<{
    sessionId: string;
    registeredAt: string;
    durationMinutes: number;
    entries: StatAnalysisReviewEntry[];
  }>;
  entryCount: number; // total de entries somadas (achatado), por stat
}
```

**Query + agregação (documentada):**
1. `SELECT` em `study_sessions_v2` com `WHERE user_id = $1 AND theme_id = $2 AND
   mode = 'stat_analysis' AND deleted_at IS NULL` `[ AND stat_id = $3 ]` `ORDER BY
   registered_at DESC` — usa o índice parcial.
2. **Agregação por-stat com sessões aninhadas + counts achatados (flatten no app-layer):**
   o storage agrupa as linhas por `stat_id`, dentro de cada grupo mantém a lista de sessões
   (cada uma com seu array `stat_analysis_entries`), e calcula `entryCount` somando o
   `length` de todas as entries do grupo. A desnormalização (flatten) acontece no app-layer
   — o jsonb não é "explodido" no SQL. **O storage NÃO monta URLs** (não conhece o path do
   endpoint); devolve keys, e o **handler RF-07** mapeia `playImageKey/solutionImageKey` →
   URLs servíveis (`GET .../entries/:entryId/image/:slot`) antes de responder, conforme
   RF-07 critério "URLs de imagem servidas, não keys cruas".
3. Ownership: o método filtra por `userId`; o **handler** valida adicionalmente que o tema
   pertence ao user (404/403 — RF-07) antes de chamar o storage.

### D-2 — Q-OPEN-2: `filters` = **string livre** (não objeto)

Decisão: **string livre, max 500 chars.** Justificativa:
- O master-plan permite ambos (`{...}|string`); a spec assume string por simplicidade.
- EST-2 (consumidor) vai **contar** entradas/filtros (`filtersAnalyzedCount` é um inteiro
  separado), **não parsear** o conteúdo de `filters`. Não há query que filtre por
  `position`/`potType`/`spr` — logo estruturar não compra nada hoje e adiciona um schema
  aninhado para validar/migrar.
- A UI renderiza o campo como texto livre ("BTN vs BB, 3bet pot, SPR<3"). Se no futuro o
  Coach quiser estruturar, isso é uma migration aditiva (string → objeto opcional) sem
  quebrar o que já existe. **YAGNI hoje.**

### D-3 — Q-OPEN-7 + ciclo upload/criação: fluxo **(a) cria sessão draft → upload por entry → DB**

**Storage instance (Q-OPEN-7):** instanciar um `LocalFsSpotImageStorage` **dedicado** com
root `private-uploads/stat-analysis` (NÃO reusar o singleton `spotImageStorage` cujo root é
`private-uploads/spots`). Justificativa: isolamento de domínio + limpeza por cron específica
(D-6) + o root separado deixa o copyright GTO fisicamente segregado dos spots de grind. A
key segue o layout existente `<userId>/<sessionId>/<nanoid>.<ext>` — o `entryId` e o `slot`
**NÃO entram na key**; ficam no DB (na entry: `playImageKey`/`solutionImageKey`). Assim o
`put()` é reusado sem mudança e re-upload no mesmo slot grava uma key nova e deleta a antiga.

**Ciclo de upload vs criação (resolve o galinha-e-ovo):** fluxo **(a)** — a sessão é criada
**primeiro** (com as entries já tendo `id` server-side e `playImageKey/solutionImageKey =
null`); só então o cliente faz o upload referenciando `sessionId` (path) + `entryId` +
`slot`. Razões:
- O `put()` exige `sessionId` para a key — fluxo (b) (upload standalone keyed por temporário)
  exigiria um diretório de quarentena + um job de associação + GC de órfãos: mais superfície,
  mais bugs. Fluxo (a) reusa o padrão `starred-hands` (a sessão existe antes do print).
- **Rollback de imagem órfã** fica trivial: se o `put()` grava mas o `updateStatEntryImage`
  falha no DB, o handler chama `rollbackStatImage(key)` (espelha `rollbackSpotImage`,
  idempotente em ENOENT). Não há órfão "sem dono" porque a key sempre nasce sob um
  `sessionId` que já existe e pertence ao user.

**Endpoints exatos (Q-OPEN-5):** todos sob `/api/study-sessions/...` (NÃO sob
`/api/study-themes/...`) para (i) evitar a colisão de rota com `/api/study-themes/search` vs
`/:themeId/...` em `studies-v2.ts`, e (ii) manter coesão de domínio (a entry pertence à
sessão). Sub-paths fixos para não colidir com `/:id`:

| Método | Rota | Handler |
|---|---|---|
| POST | `/api/study-sessions` | `handleCreateStudySession` (estendido) |
| GET | `/api/study-sessions/:id` | `handleGetStudySession` (**NOVO**, D-7) |
| PATCH | `/api/study-sessions/:id` | `handleUpdateStudySession` (estendido) |
| POST | `/api/study-sessions/:id/stat-analysis/entries/:entryId/image` | `handleUploadStatEntryImage` (NOVO, multipart `file`, `slot` em body/query) |
| GET | `/api/study-sessions/:id/stat-analysis/entries/:entryId/image/:slot` | `handleServeStatEntryImage` (NOVO) |
| GET | `/api/study-sessions/stat-analysis?themeId=X[&statId=Y]` | `handleListStatAnalysisByTheme` (NOVO) |

> A rota de listagem usa o prefixo fixo `stat-analysis` **antes** de `:id` na ordem de
> registro? Não: `stat-analysis` colidiria com `:id`. Por isso a listagem fica em
> `/api/study-sessions/stat-analysis` e DEVE ser registrada **antes** de `GET
> /api/study-sessions/:id` (lição starred-hands `/:id/discard`). Caso contrário Express
> casaria `:id = "stat-analysis"`. Alternativa equivalente aceita pelo implementer: pendurar
> a listagem sob `/api/study-themes/:themeId/stat-analysis` (espec original) **se** registrada
> antes de `/:themeId/search`/`/:themeId/tabs` — mas a opção `/api/study-sessions/stat-analysis`
> é a recomendada por menor risco de colisão.

### D-4 — Q-OPEN: `statId` **IMUTÁVEL** no PATCH

**Sim, imutável.** O `statId` vincula a sessão a uma stat; é o eixo de revisão "por stat
dentro do tema" (D-1). Mudá-lo reescreveria silenciosamente o agrupamento de uma revisão já
salva (entries migrariam de stat). Tentar editar → `400 IMMUTABLE_FIELD`. Implementação:
adicionar `statId`/`stat_id` à lista `forbidden` já existente em `handleUpdateStudySession`
(junto com `mode`/`durationMinutes`/etc.), checada **antes** do parse strict.

### D-5 — Cap de entries (10): enforced em **Zod + storage** (defesa em profundidade)

- **Zod** (camada de request, create + patch): `z.array(statEntrySchema).max(10)` →
  `400 TOO_MANY_ENTRIES` (mensagem mapeada do issue). É a primeira linha.
- **Storage** (`createStudySessionV2` / `updateStudySessionV2`): re-checa
  `entries.length > 10` e lança erro tipado (`{ code: "TOO_MANY_ENTRIES" }`) que o handler
  converte em 400. Razão: o storage é chamado por outros caminhos (auto_*, futuros) e o array
  jsonb não tem constraint DB-level — o serviço é o guardião final do invariante. Igual ao
  padrão `difficultSpots.max(5)` (Zod) + cap de spots por sessão no storage.

### D-6 — Q-OPEN-6: limpeza de imagens (best-effort, espelha `rollbackSpotImage`)

Três gatilhos, todos **best-effort** (falha de delete de imagem nunca derruba a request DB):

1. **Re-upload no mesmo slot (RF-04):** ao gravar a nova key, deleta a key antiga do slot
   (`statImageStorage.delete(oldKey)` em try/catch, ignora ENOENT).
2. **Delete de entry via PATCH (Q-OPEN-3 / D-7 merge):** quando um PATCH remove uma entry do
   array (`id` não está no novo array), o handler deleta `playImageKey` + `solutionImageKey`
   dessa entry, best-effort, **após** o commit do DB (se o DB falhar, não se deletou nada).
3. **Hard-delete da sessão (pós soft-delete 24h):** o cron que faz o hard-delete de
   `study_sessions_v2` (ou um cron novo dedicado a `stat-analysis`, paridade com o cron de
   expiração de spots F2) varre as sessões `mode='stat_analysis'` a serem expurgadas e deleta
   `private-uploads/stat-analysis/<userId>/<sessionId>/*` antes/depois do hard-delete da row.
   **Escopo desta sprint:** implementar a função `cleanupStatAnalysisImages(session)` chamada
   no caminho de hard-delete existente; **não** criar um cron novo se o hard-delete de
   `study_sessions_v2` ainda não tem cron (nesse caso, documentar pendência — a função fica
   pronta para o cron de housekeeping). Soft-delete (24h gate) **não** apaga imagens (permite
   undelete dentro da janela).

### D-7 — Q-OPEN-4: `GET /api/study-sessions/:id` **NÃO existe** → criar

Confirmado por leitura de `server/routes/study-sessions.ts` (só há create/list/patch/delete/
finalize + habit/goal). **Criar** `handleGetStudySession` para a surface `/estudos/sessao/:id`
(RF-08 surface 3). Regras:
- Ownership via `getStudySessionV2ById(id, userId)` → 404 se não for do user (não confirma
  existência).
- Para sessões `mode='stat_analysis'`, mapeia `playImageKey/solutionImageKey` de cada entry
  em URLs servíveis (RF-05) antes de responder; entries sem imagem → URL `null`.
- Registrar **antes** da rota de listagem `stat-analysis`? Não há conflito entre `:id` e
  `:id/stat-analysis/...` (paths mais longos). O conflito é só `stat-analysis` (sem `:id`) vs
  `:id` — resolvido em D-3 pela ordem de registro.

### Q-OPEN-3 (semântica do PATCH de `statAnalysisEntries`) — **merge por `id`, nunca zera keys**

Lesson #43 (PATCH semantic: omitir ≠ sobrescrever). O PATCH faz **merge por `entry.id`**:
- Entries no array do PATCH **com `id` existente** → atualiza `filters`/`errorText`/
  `learnedText`; **preserva** `playImageKey`/`solutionImageKey` se a entry do PATCH **não as
  menciona** (campo ausente ≠ `null`). Enviar `null` explícito zera (e dispara cleanup D-6.2).
- Entries no array do PATCH **sem `id` (ou `id` novo)** → cria entry nova com `id`+`createdAt`
  server-side, keys `null`.
- Entries existentes **ausentes** do array do PATCH → **removidas** (o array é a fonte da
  ordem), e suas imagens limpas (D-6.2). Isso torna o PATCH de entries uma substituição-com-
  preservação-de-keys: o cliente envia o array completo desejado; o servidor reconcilia por
  `id` e nunca perde uma key de imagem de uma entry mantida que não a reenviou.

---

## Plano de Migration — `0086_study_sessions_v2_stat_analysis.sql` (D7: EST-3 + EST-4 juntos)

> **Apenas o plano.** O implementer cria o `.sql` + `_rollback.sql`. Aplicar via psql local
> (localhost:5433) + documentar pendência prod (convenção master-plan §4 / CLAUDE.md §6).
> Próximo número confirmado: **0086** (0085 é o highest).

### Colunas novas (todas nullable — lesson #7)
```sql
ALTER TABLE study_sessions_v2
  ADD COLUMN IF NOT EXISTS stat_id varchar(64),                 -- catalog id OU custom_*; NÃO FK
  ADD COLUMN IF NOT EXISTS stat_analysis_entries jsonb,         -- array de entries (RF-02); cap 10 em serviço/Zod
  ADD COLUMN IF NOT EXISTS hands_solved_count integer,          -- RF-03; >=0, cap 1000 em Zod
  ADD COLUMN IF NOT EXISTS filters_analyzed_count integer,      -- RF-03; >=0, cap 1000 em Zod
  ADD COLUMN IF NOT EXISTS lesson_insights text;                -- RF-03; max 2000 em Zod
```
- **Sem `DEFAULT`** nas colunas: o back-fill (lesson #7) é o próprio `NULL` — sessões
  existentes ficam legíveis com os 5 campos `null`, zero quebra. `hands_solved_count`/
  `filters_analyzed_count` poderiam ser `DEFAULT 0`, mas `NULL` distingue "não informado" de
  "informou zero" (relevante para EST-2 não inflar média com zeros falsos). Storage faz
  back-fill `?? null` no insert (mesmo padrão dos outros campos opcionais).
- `stat_id` segue `user_focus_stats.stat_id`: `varchar(64)`, **não FK** (catálogo estático).

### Índice parcial (D-1)
```sql
CREATE INDEX IF NOT EXISTS idx_ssv2_stat_analysis_theme_stat
  ON study_sessions_v2 (user_id, theme_id, stat_id)
  WHERE mode = 'stat_analysis' AND deleted_at IS NULL;
```

### CHECK constraint (DB-level) — **NÃO adicionar**
`mode` é `varchar` livre hoje; o enum `STUDY_SESSION_MODES` é Zod-only (decisão pré-existente,
schema comment "CHECK constraints DB-level garantem alem do Zod" foi aspiracional — não há
CHECK em `mode` na tabela). Manter a convenção atual: **enum no Zod**, sem CHECK novo, para
não criar inconsistência com os modos legados já gravados. (Se o implementer constatar que
existe CHECK em `mode`, então o ALTER do CHECK para incluir `stat_analysis` entra na migration
— verificar no `_introspect`.)

### Rollback — `0086_study_sessions_v2_stat_analysis_rollback.sql`
```sql
DROP INDEX IF EXISTS idx_ssv2_stat_analysis_theme_stat;
ALTER TABLE study_sessions_v2
  DROP COLUMN IF EXISTS lesson_insights,
  DROP COLUMN IF EXISTS filters_analyzed_count,
  DROP COLUMN IF EXISTS hands_solved_count,
  DROP COLUMN IF EXISTS stat_analysis_entries,
  DROP COLUMN IF EXISTS stat_id;
-- Reversível em DDL. As imagens já gravadas em private-uploads/stat-analysis/ NÃO são
-- removidas pelo rollback (DDL não toca filesystem); limpar manualmente se necessário.
```

---

## Índice + Métodos de Storage (delta)

**`shared/schema.ts`:**
- `studySessionsV2`: +5 colunas (acima) + o `index(...)` parcial declarado via
  `.where(sql\`mode = 'stat_analysis' AND deleted_at IS NULL\`)` no array de índices da tabela.
- `STUDY_SESSION_MODES`: append `"stat_analysis"`.
- `insertStudySessionV2Schema`: + campos opcionais (`statId`, `statAnalysisEntries`,
  `handsSolvedCount`, `filtersAnalyzedCount`, `lessonInsights`).
- Novo `statAnalysisEntrySchema` (Zod) + tipo `StatAnalysisEntry`.

**`server/storage.ts` (assinaturas):**
| Método | Mudança |
|---|---|
| `createStudySessionV2(input)` | input ganha `statId?`, `statAnalysisEntries?`, `handsSolvedCount?`, `filtersAnalyzedCount?`, `lessonInsights?` (todos `?? null`); re-checa cap 10 (D-5) → lança `{ code: "TOO_MANY_ENTRIES" }` |
| `updateStudySessionV2(id, userId, patch)` | patch ganha os 4 campos editáveis + `statAnalysisEntries` (merge por `id`, D Q-OPEN-3); re-checa cap 10; **NUNCA** seta `statId` (D-4) |
| `getStatAnalysisEntries(userId, themeId, statId?)` | **NOVO** — recorte por índice parcial + flatten cross-session (D-1) |
| `updateStatEntryImage(sessionId, userId, entryId, slot, key)` | **NOVO** — atualiza `playImageKey`/`solutionImageKey` da entry `entryId` no jsonb (read-modify-write da row ou `jsonb_set`); retorna `{ oldKey }` para cleanup; 404 se entry inexistente |
| `getStatEntryImageKey(sessionId, userId, entryId, slot)` | **NOVO** — lê a key para RF-05 (serve) com ownership |

---

## Consequências

**Positivas:**
- Cumpre D4/D7 (1 migration, 1 form, sem tabela nova) e lesson #7 (zero quebra para sessões/
  modos existentes — todos os campos nullable).
- Índice parcial mantém o custo de write baixo (só sessões `stat_analysis` o tocam) e cobre a
  query de revisão.
- Imagens de solução GTO fisicamente segregadas em root próprio + servidas só com ownership
  (paridade ADR-052/057) — copyright protegido.
- Fluxo (a) torna rollback de órfã trivial e reusa o padrão `starred-hands`.

**Negativas / dívida:**
- A revisão "por stat" depende de **flatten no app-layer**; se o volume crescer muito
  (improvável dado o cap 10/sessão), a query carregaria jsonb grande — mitigável depois com
  coluna entry-level (migration aditiva) sem quebrar o contrato de leitura.
- `getStatAnalysisEntries` devolve keys e o **handler** monta URLs — divisão de
  responsabilidade que o test-writer precisa respeitar (storage não conhece rotas).
- Cleanup de imagem no hard-delete depende de existir um cron de hard-delete de
  `study_sessions_v2`; se não existir, a função `cleanupStatAnalysisImages` fica pronta mas
  ociosa (pendência documentada em D-6.3).

**Neutras:**
- `filters` como string fecha a porta a queries estruturadas hoje, mas a migração para objeto
  é aditiva no futuro.

## Confiança
Alta — reusa padrões já em produção (ADR-052/057 storage privado + ownership, lesson #7
optional+default, lesson #34 injectedStorage, lesson #43 PATCH semantic). O único ponto de
risco residual (flatten cross-session) é coberto pelo cap de 10 entries e baixo volume de
sessões `stat_analysis` por tema.

## Resolução das Questões Abertas (sumário)
| Q | Resposta |
|---|---|
| Q-OPEN-1 | Índice **parcial** `(user_id, theme_id, stat_id) WHERE mode='stat_analysis' AND deleted_at IS NULL`; `getStatAnalysisEntries` recorta por índice + **flatten cross-session no app-layer**, agregado **por-stat** com sessões aninhadas; handler monta URLs (D-1). |
| Q-OPEN-2 | **string livre** (max 500); EST-2 conta, não parseia (D-2). |
| Q-OPEN-3 | PATCH faz **merge por `id`**, preserva keys de imagem não-mencionadas, remove entries ausentes + limpa imagens (D-6.2 / Q-OPEN-3). |
| Q-OPEN-4 | `GET /api/study-sessions/:id` **NÃO existe** → criar `handleGetStudySession` (D-7). |
| Q-OPEN-5 | Endpoints sob `/api/study-sessions/...`; listagem em `/api/study-sessions/stat-analysis` registrada **antes** de `/:id` (D-3). |
| Q-OPEN-6 | Limpeza best-effort: re-upload, delete de entry, hard-delete (função pronta; cron documentado) (D-6). |
| Q-OPEN-7 | `LocalFsSpotImageStorage` **dedicado** root `private-uploads/stat-analysis`; key `<userId>/<sessionId>/<nanoid>.<ext>`, `entryId`/`slot` no DB (D-3). |
