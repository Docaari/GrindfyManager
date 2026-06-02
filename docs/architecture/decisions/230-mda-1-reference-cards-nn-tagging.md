# ADR-230: MDA (Tendências da População) como Tabela Dedicada + Junction N:N

## Status
Aceito

## Data
2026-06-01

> **Nota de numeração:** a spec MDA-1 e o plano pediam **ADR-229**, partindo do
> pressuposto "último ADR é 228". Durante esta sessão, uma sprint paralela (Metas-1
> / 4DX) commitou `229-metas-1-fatia-1-goals-4dx-core.md`. Para evitar colisão, este
> ADR usa o **próximo número livre confirmado = 230** (`ls Docs/architecture/decisions/`
> → último é 229-metas-1). Todas as referências de pipeline a "ADR-229" do MDA-1 devem
> ler **ADR-230**.

## Contexto

O Sprint MDA-1 (spec `Docs/specs/sprint-mda-1-2026-06-01.md`) introduz um artefato de
estudo novo: o **MDA** (Mass Data Analysis / *Tendências da População*). É a leitura de
**como o pool joga um spot** (exploit do field), capturada de análise em massa do banco
de mãos (Hand2Note / GTOW AI etc), com prints das stats da população, filtros aplicados e
o texto da tendência + como explorá-la.

O MDA é **irmão** do `stat_analysis` (EST-3 / ADR-222, migration 0087), mas semanticamente
distinto — diferença travada com o founder:

| Eixo | `stat_analysis` (EST-3) | **MDA** (este ADR) |
|---|---|---|
| Foco | minha jogada vs solução GTO | exploit da **população** |
| Forma | **sessão cronometrada** (tempo + XP) | **card de referência** (sem tempo/XP) |
| Vínculo a tema | **1 tema** (eixo `theme × stat`) | **N temas (N:N)** |
| Consumo | revisão "por stat dentro do tema" | **consultável enquanto estudo** qualquer tema tagueado |
| Persistência | row em `study_sessions_v2` (soft delete 24h gate) | tabela própria, soft delete |

O valor central é: registrar um MDA **uma vez** (spot + filtros + tendência + prints + stat
opcional), tagueá-lo a **N temas**, e ver os MDAs relevantes da população ao estudar
**qualquer** desses temas (na `ThemeDetailView` e no painel durante a sessão de estudo).

Decisões já travadas que **não reabro** (input founder / spec §"Decisões Travadas"):
- **Tagging N:N** — tabela dedicada + junction.
- **Card de referência** — sem duração/XP; **não** é `mode` em `study_sessions_v2`.
- **Tier gate OFF** — MDA é estudo core (paridade com `stat_analysis`, que não gateia).
- Reuso da máquina de imagem privada do EST-3 (ADR-057 / `createSpotImageStorage`).

A questão estrutural central deste ADR é: **onde modelar o MDA e seus N temas?** O EST-3
resolveu seu eixo `theme × stat` *estendendo* uma tabela existente (ADR-222 Opção B). O MDA
tem requisitos diferentes (cardinalidade N:N, sem tempo, consultável fora de sessão) que
empurram a decisão para o lado oposto.

---

## Opções Consideradas

### Opção A — Tabela dedicada `mda_reads` + junction `mda_read_themes` (N:N) **[ESCOLHIDA]**
- **Prós:**
  - Modela a cardinalidade **N:N** corretamente: 1 MDA → N temas é o requisito-raiz. A
    junction (espelhando `study_theme_spot_links`, ADR-068) é o padrão N:N já provado no
    projeto.
  - Query "por tema" (a **quente**, chamada por `ThemeDetailView` + painel de estudo) vira
    um `JOIN` simples com índice `(user_id, theme_id)` na junction — sem flatten cross-row
    no app-layer (o calcanhar de Aquiles do EST-3, que aceitou flatten por cap baixo).
  - Semântica honesta: um MDA **não** é sessão (sem `duration_minutes`, sem `mode`, sem
    `started_at`, sem XP) — colocá-lo em `study_sessions_v2` exigiria que todas as colunas
    de sessão fossem `NULL` e que toda query/CHECK de sessão aprendesse a ignorar um modo
    "que não é sessão". Tabela própria mantém `study_sessions_v2` coeso.
  - Soft delete + cap 8 imagens jsonb na própria row; re-tagueio é diff na junction
    (idempotente via UNIQUE).
- **Contras:**
  - +2 tabelas novas (migration/rollback). Aceito: superfície pequena, isolada, sem FK.
  - Cleanup de tags órfãs no delete do tema é **app-level** (sem FK) — uma linha em
    `deleteTheme`. Aceito: é o padrão das migrations recentes (0088/0089 não usam FK rígida).

### Opção B — `mode='mda'` em `study_sessions_v2` com `theme_id` único
- **Prós:** reusa todo o handler/PATCH de sessão; zero tabela nova; herda o storage de imagem
  e o gate de soft delete.
- **Contras (decisivos):**
  - **Quebra a cardinalidade N:N** — `study_sessions_v2.theme_id` é **1 tema**. Forçar N
    temas exigiria *também* uma junction sobre `study_sessions_v2`, acumulando o pior dos
    dois mundos (row de sessão falsa + junction).
  - **Polui o domínio de sessão**: um MDA não tem duração/XP/cronômetro. As CHECK
    discriminator-based de `study_sessions_v2` (ADR-126: `mode='drill_gto'` exige theme,
    `status='running'` exige `started_at`, etc.) teriam de ganhar um caso "modo que não é
    sessão", e todas as agregações de tempo de estudo (`studyMinutesByThemeAndMonth`,
    streak) precisariam excluir `mode='mda'` explicitamente — risco de inflar métricas de
    estudo com cards de referência. **Viola a separação que o próprio EST-3 preservou.**
  - O consumo do MDA é **fora de sessão** (referência consultável), oposto do consumo de
    `study_sessions_v2` (log de evento temporal). Semânticas conflitantes na mesma tabela.
  - **Rejeitada** por contrato (founder travou "tabela própria, não mode") e por mérito
    técnico (cardinalidade + poluição de domínio).

### Opção C — Tabela dedicada `mda_reads` com `theme_ids jsonb` (array) em vez de junction
- **Prós:** 1 tabela só; o array viaja junto com a row (GET detalhe trivial); re-tagueio é
  read-modify-write do array.
- **Contras (decisivos):**
  - A query **quente** ("MDAs do tema X") vira `WHERE theme_ids @> '["X"]'` — exige **índice
    GIN** em jsonb, mais caro em write e menos previsível que um B-tree `(user_id, theme_id)`
    na junction. O projeto já tem precedente de junction N:N performática
    (`study_theme_spot_links`); reusar o padrão é a escolha de menor risco.
  - **Idempotência de tag** num array jsonb depende de lógica app-level (`@>` antes de
    append, lesson #33) sem a garantia de um `UNIQUE` DB-level — a junction dá idempotência
    *estrutural* (`UNIQUE (mda_read_id, theme_id)`), o array não.
  - Cleanup no delete do tema vira um `jsonb_agg` filtrando o array em **todas** as rows que
    contêm o tema (read-modify-write em massa, lesson #33 caso `jsonb_array - text` que não
    funciona em PG16), contra um `DELETE ... WHERE theme_id=?` direto na junction.
  - **Rejeitada** por custo de query/idempotência/cleanup vs. o benefício marginal de "1
    tabela a menos".

**Decisão: Opção A.**

---

## Decisão

Modelar o MDA como **tabela dedicada `mda_reads`** (o card de referência) + **junction N:N
`mda_read_themes`** (o tagueio a N temas), **não** como `mode` em `study_sessions_v2` e
**não** como array jsonb de `themeIds`. Reusar a infra de imagem privada do EST-3
(ADR-057 / `createSpotImageStorage`) num root dedicado, e fazer o cleanup de tags órfãs
**app-level** no delete do tema (sem FK, padrão 0088/0089).

As decisões abaixo são normativas para o test-writer e o implementer.

### D-1 — Modelagem: tabela dedicada + junction (cardinalidade N:N)

`mda_reads` carrega o artefato; `mda_read_themes` carrega o N:N. A junction **espelha
`study_theme_spot_links`** (ADR-068): `(mda_read_id, theme_id, user_id, created_at)` com
**`UNIQUE (mda_read_id, theme_id)`** para idempotência da tag e índice **`(user_id,
theme_id)`** para a query quente "MDAs do tema".

`user_id` é **denormalizado** na junction (também presente em `mda_reads`) — deliberado:
a query "por tema" filtra por `(user_id, theme_id)` sem precisar de JOIN extra com
`mda_reads` só para checar ownership. Mesma escolha de `study_theme_spot_links`.

### D-2 — Reuso da infra de imagem EST-3 (ADR-057), root dedicado

Reusar `createSpotImageStorage(rootSubdir)` (`server/services/spotImageStorage/index.ts`),
instanciando um storage **dedicado** com root `private-uploads/mda` — paridade exata com
`statAnalysisImageStorage` (root `private-uploads/stat-analysis`). Justificativa: isolamento
de domínio + segregação física do copyright (stats da população) dos spots de grind + cleanup
por path próprio. Layout da key: **`private-uploads/mda/<userId>/<readId>/<nanoid>.<ext>`**
(`<readId>` no lugar de `<sessionId>`; o `imageId` e o `caption` ficam no jsonb, **não** na
key — re-upload grava key nova e deleta a antiga, padrão EST-3 D-3).

- Storage **privado**, nunca público (copyright). Serve só com `requireAuth` + ownership via
  `getMdaReadImageKey(id, userId, imageId)`; cross-user → **404** (não vaza existência).
- `rollbackMdaImage(key)` espelha `rollbackStatImage`/`rollbackSpotImage` (idempotente em
  ENOENT) — se o `put()` grava mas o `addMdaReadImage` falha no DB, o handler reverte a órfã.
- Validação **magic-bytes** (`detectMimeFromBuffer`) PNG/JPEG/WebP, cap **5MB** (multer mem),
  rate limit — reusar o padrão de `server/routes/study-sessions.ts`. **Extrair**
  `server/routes/_imageUpload.ts` (multer + `detectMimeFromBuffer` + limiter + error handler)
  se ficar DRY entre MDA e study-sessions.
- **Cap 8 prints/MDA** enforced em profundidade: Zod (`images.max(8)` no insert) +
  re-checagem no upload (rejeita o 9º com 400/409).

### D-3 — Tagueio: diff idempotente na junction (lesson #33)

`updateMdaRead` reconcilia tags por **diff**: `themeIds` no PATCH **substitui** o conjunto.
Append de tag nova é idempotente (`UNIQUE` absorve duplicata; espelha `appendStatToThemes`
com guard `@>`); remoção de tag ausente é `DELETE FROM mda_read_themes WHERE mda_read_id=?
AND theme_id IN (...) AND user_id=?`. Transação se `db.transaction` disponível, **fallback
gentil** quando indisponível (lesson #32 — detection `typeof db.transaction === 'function'`,
não passar `tx` quando undefined para preservar aridade que os testes inspecionam).

### D-4 — Cleanup de tags órfãs: app-level no delete do tema (sem FK)

Sem FK rígida (padrão 0088/0089). Quando um tema é deletado, `storage.deleteTheme` (método
**existente**, alterado) executa, após deletar o tema:
```
DELETE FROM mda_read_themes WHERE theme_id = ? AND user_id = ?;
```
O **read sobrevive** se ainda tagueado a outro tema (a row de `mda_reads` não é tocada). Um
MDA que perdeu **todas** as tags fica órfão de tema mas legível pela biblioteca opcional
(`/estudos/mda`, fase 2) — aceito; não há "1 tag mínima" *pós-criação* (o `min 1` do Zod vale
só no create/patch via API, não numa cascata de delete de tema).

### D-5 — Validações Zod-only (sem CHECK DB), nullable+sem-default (lesson #7)

- **Enums / `mode` / `statId`**: validação **Zod-only**, **sem CHECK DB** (§6/§10). `statId`
  aceita catalog id (via `getStatById`) **ou** `custom_*` (via `CUSTOM_STAT_RE`). **Extrair**
  `server/coach/statId.ts` (`isValidStatId` / `CUSTOM_STAT_RE` / `getStatById`) e reusar em
  MDA + study-sessions para evitar divergência. Herdar o TODO grepável `TODO(EST-3 MEDIUM-1)`
  para ownership de `statId custom_*` (validado só por shape agora).
- **Colunas opcionais nullable SEM default** (lesson #7): `spot_context`, `filters`,
  `tendency_text`, `stat_id`, `images`, `deleted_at`. NULL distingue "não informado" de
  vazio; tabelas nascem vazias, sem back-fill.
- **Limites Zod** (em `shared/mda.ts`, novo arquivo padrão `coach-planning.ts` p/ manter
  `schema.ts` enxuto): `title` max 120 (req), `spotContext` max 200, `filters` max 500,
  `tendencyText` max 2000, `statId` max 64, `caption` (em `MdaImage`) max 120, `themeIds`
  **min 1 / max 20**, `images` cap 8. `patchMdaReadSchema` é **`.strict()`** (campo
  desconhecido rejeita; `themeIds` substitui o conjunto de tags).

### D-6 — Sem tier gate (paridade `stat_analysis`)

MDA é estudo core → **sem gate** nesta sprint. `stat_analysis` (registro de estudo) hoje não
gateia; MDA segue o mesmo. (Diferente do Coach / relatórios, que usam `getReportTier`.)

---

## Consequências

**Positivas:**
- Cardinalidade N:N modelada corretamente; query "por tema" (a quente) é JOIN com índice
  B-tree, sem flatten no app-layer (melhora sobre o EST-3, que aceitou flatten por cap baixo).
- `study_sessions_v2` permanece coeso (só sessões temporais) — nenhuma agregação de tempo de
  estudo/streak precisa aprender a excluir "cards de referência".
- Idempotência de tag é **estrutural** (`UNIQUE` DB-level), não só app-level.
- Imagens da população fisicamente segregadas em `private-uploads/mda/` + servidas só com
  ownership (paridade ADR-057) — copyright protegido; cross-user → 404 sem vazar existência.
- Reuso direto de `createSpotImageStorage`, `detectMimeFromBuffer`, padrão de junction N:N,
  diff idempotente (lesson #33), `injectedStorage` (lesson #34): baixo risco, alta paridade
  com código já em produção.

**Negativas / dívida:**
- +2 tabelas novas (vs. 0 do EST-3). Aceito: superfície pequena, isolada, sem FK.
- Cleanup de tags órfãs é **app-level** (uma linha em `deleteTheme`) — se um caminho futuro
  deletar tema sem passar por `deleteTheme`, tags ficam órfãs (legíveis, mas apontando para
  tema inexistente). Mitigação: a query "por tema" filtra por `theme_id`, então tag órfã
  simplesmente nunca aparece; biblioteca fase 2 ignora `theme_id` e lista por `mda_read_id`.
- `statId custom_*` validado só por shape (sem ownership check) — herda a dívida MEDIUM-1 do
  EST-3 (TODO grepável), não introduz dívida nova.
- Migration 0090 **PENDENTE PROD** (Neon) — documentar em CLAUDE.md §6 junto às 0086–0089.

**Neutras:**
- `spot_context`/`filters` como texto livre fecham a porta a queries estruturadas hoje
  (posição/SPR/pot type), mas a migração para objeto é aditiva no futuro (paridade EST-3 D-2).
- Biblioteca global `/estudos/mda` + busca + ligar MDA a `starred_hands` + surfacing no Coach
  são **fase 2** (fora de escopo MVP).

## Confiança
Alta — reusa padrões em produção: junction N:N (`study_theme_spot_links`, ADR-068), storage
privado + ownership (ADR-057), diff jsonb/junction idempotente (lesson #33), `injectedStorage`
(lesson #34), nullable+default (lesson #7), enums Zod-only sem CHECK DB (§6/§10). O único
desvio do plano é a numeração (230 em vez de 229, por colisão com Metas-1 paralelo) —
documentado no topo.

## Resolução das Decisões Travadas (sumário)
| Decisão | Resposta |
|---|---|
| Onde modelar? | Tabela dedicada `mda_reads` + junction `mda_read_themes` (D-1). NÃO mode em `study_sessions_v2` (Opção B rejeitada); NÃO array jsonb de themeIds (Opção C rejeitada). |
| Imagem | Reuso ADR-057 `createSpotImageStorage("private-uploads/mda")`, root dedicado, magic-bytes, cap 5MB, cap 8 prints, ownership 404 cross-user (D-2). |
| Tagueio | Diff idempotente na junction, `UNIQUE (mda_read_id, theme_id)`, transação com fallback gentil lesson #32 (D-3). |
| Cleanup de tema | App-level em `deleteTheme` (`DELETE FROM mda_read_themes WHERE theme_id=?`), sem FK, padrão 0088/0089; read sobrevive se tagueado a outro tema (D-4). |
| Validação | Zod-only sem CHECK DB; nullable+sem-default (lesson #7); `themeIds` min 1/max 20; `patch` `.strict()`; `statId` catalog ou `custom_*` (D-5). |
| Tier gate | Sem gate (paridade `stat_analysis`) (D-6). |
