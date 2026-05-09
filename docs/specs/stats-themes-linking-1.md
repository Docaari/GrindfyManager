# Spec: Sprint Stats-Themes-Linking-1 — Catalogo de stats por tema de estudo

## Status
**Proposta** | Aprovada | Em Desenvolvimento | Concluida

## Resumo Executivo

Permitir que **stats HUD** (217 stats catalogo + custom user) sejam **linkadas a 1+ temas de estudo**. Linkagem fica em `studyThemes.linkedStats` (JSONB ja existente desde Sprint Estudos-Habito-1, ADR-127). UI nova em 4 superficies:

1. **Configuracoes do tema** — picker multi-select de stats (Combobox virtualizado).
2. **Tema aberto** — secao "Stats foco" com card por stat (valor + sparkline 30d + range alvo).
3. **Stats Analyzer drawer** — secao "Temas relacionados" via reverse lookup.
4. **HUD Customizer** — campo `linkedThemes` em custom fields (`hudLayouts.fieldsJson[i].linkedThemes`), com **write-through bidirecional** para `studyThemes.linkedStats`.

Pre-requisito para Tier 2 do roadmap Estudos: Coach AI consulta stats correntes do user contextualmente quando user pede ajuda em um tema, e Stats Analyzer vira porta de entrada para estudo dirigido.

**Sprint name:** `stats-themes-linking-1`
**Branch sugerida:** `feature/stats-themes-linking-1`
**Escopo:** P0 only (RF-01 a RF-08). P1/P2 ficam para sprints futuros.

---

## Contexto

### Estado atual confirmado em codebase

- **`studyThemes.linkedStats`** existe como JSONB array desde Sprint Estudos-Habito-1 (ADR-127, `shared/schema.ts:2129`). One-way hoje (set no seed da curated taxonomy, sem editor de UI). Reaproveitar — **NAO criar junction table**.
- **`STAT_INDEX_BY_ID`** em `shared/hud-stat-catalog.ts:372` — Map<string, StatField> com 217 stats catalogo, agrupadas em 16 grupos `HudGroupId`. Static, versionado em git (ADR-058).
- **`userFocusStats`** (ADR-116) eh feature DIFERENTE — escopo mensal, max 3 stats por user/mes. NAO confundir com `linkedStats` (catalogo de stats relacionadas ao tema, sem cap mensal, max 30).
- **`studyThemeSpotLinks`** (ADR-067) eh padrao N:N para spots-temas; aqui usamos JSONB pois stats sao IDs de catalogo estatico (nao linhas em tabela), entao N:N relational seria overkill.
- **`hudLayouts.fieldsJson`** (ADR-064, `shared/schema.ts:3689` interface `HudLayoutFieldEntry`) hospeda custom stats e overrides de target. Estender shape com `linkedThemes: string[]`.
- **`coachTools/readThemeWithLinkedSpots.ts`** ja existe — extender para incluir stats linkadas com valores correntes + sparkline.

### Problema que resolve

Hoje o jogador nao tem ponte entre **dados (stats)** e **estudo (temas)**. Quando o Stats Analyzer mostra "C-bet OOP em range alarme", nao ha CTA de "estudar isso" — fica como insight orfao. Quando user abre tema "C-bet OOP nas Squeezes 3-bet pots", o tema nao mostra **a stat real do user** com badge verde/vermelho.

Linkagem N:M cria essa ponte:
- Stats Analyzer → "estudar essa stat" (chip Tema relacionado).
- Tema aberto → "como estou nessa stat hoje?" (card valor + sparkline).
- Coach AI → respostas sobre tema citam stats correntes ("voce esta com C-bet OOP=58%, alvo 38-45%, leak claro").

---

## Usuarios

| Persona | O que faz nesta sprint |
|---|---|
| **Jogador profissional MTT (founder N=1, beta tier)** | Linka manualmente stats relevantes em temas curados ja existentes. Cria tema custom + linka stats. Cria custom field no HUD Customizer + linka aos temas onde a stat eh relevante. |
| **Casual user (free tier)** | Consome temas curados que ja vem com `linkedStats` populado. Pode linkar/deslinkar stats em temas proprios. Custom HUD fields disponiveis em Pro+. |
| **Pro grinder (premium tier)** | Tudo acima + Coach AI explorando o vinculo (tool extendida) para respostas data-driven. |

Sem distincao de role para CRUD de `linkedStats`/`linkedThemes`. Diferenciacao por tier vive em features adjacentes (HUD Customizer custom fields ja eh Pro+, Coach AI tool ja gateada Pro+).

---

## Objetivos

1. **Criar editor UI bilateral** para `studyThemes.linkedStats` (multi-select 217 catalog stats + custom user stats).
2. **Reverse lookup performatico** — `GET /api/stats/:statId/linked-themes` <50ms p95 com GIN index + cache memoria 60s.
3. **Coach AI tool unificada** — `read_theme_with_linked_stats_and_spots` substituindo (com alias) `read_theme_with_linked_spots`. Inclui valores correntes do user + sparkline 30d.
4. **HUD Customizer write-through** — quando user cria custom field no HUD e linka temas, atualizar tambem `studyThemes.linkedStats` para ID custom.
5. **Zero regressao** em testes existentes (731+ baseline pos-Sprint Spot-Anki-Reentry-3).

## Nao-Objetivos (Out of Scope)

- **Cap dinamico por tier** em `linkedStats` — fixo em 30 (cap soft em UI, hard em backend). Custom field `linkedThemes` cap soft em 20. Sem variacao por plano.
- **UI batch link/unlink** — usuario linka stat a stat. Bulk ops (selecionar 5 stats e linkar a 3 temas) ficam para sprint futuro.
- **Search semantica** ("encontre stats que medem agressao") — busca por substring/grupo apenas no MVP. Search semantica = futuro.
- **Linkagem para stats user-defined fora do HUD Customizer** — no MVP, custom stats ficam restritas a `hudLayouts.fieldsJson`. Stats globais user (ex: tabela `userCustomStats`) nao existem e nao sao escopo.
- **Recomendacao automatica** ("este tema costuma vincular essas stats") — feature ML futura.
- **Migration de dados historicos** — temas curados ja vem populados no seed v2 (Sprint Themes-V2). Custom themes do user iniciam vazios; user popula via UI.
- **API publica externa** — endpoints ficam autenticados/scoped por user.
- **Versionamento de `linkedStats`** — sem audit trail. Mutations sobrescrevem array. (Audit pode entrar em sprint de governance futuro.)
- **Sparkline customizavel** — sempre 30 dias, sempre derivado de `hudStatSnapshots`. Outros perfis temporais = futuro.

---

## Pre-requisitos pre-implementacao

### ADRs a criar (system-architect)

- **ADR-141** — "Reaproveitar studyThemes.linkedStats (JSONB) vs nova junction table". Context, options (junction `study_theme_linked_stats` vs JSONB array), decision (JSONB), consequences (GIN index obrigatorio para reverse lookup performatico, sem JOIN nativo, schema migration zero).
- **ADR-142** — "Coach tool unificada read_theme_with_linked_stats_and_spots". Context (tool legado so com spots), decision (renomear + alias por 1 sprint, payload extendido com stats), consequences (prompt template change + fontes de dados = `hudStatSnapshots` para currentValue + sparkline 30d).

### Diagramas obrigatorios (system-architect)

- **Sequence: Edit theme linkedStats** — UI Combobox → PATCH /api/study-themes/:id → Zod validate IDs vs STAT_INDEX_BY_ID + ownership theme → dedup → persist → invalidate reverse lookup cache.
- **Sequence: Reverse lookup** — UI drawer → GET /api/stats/:statId/linked-themes → cache hit/miss → JSONB query `linked_stats @> [statId]::jsonb` → response.
- **Sequence: HUD custom field write-through** — UI HudCustomizer → PATCH /api/hud-layouts/:id (custom field with linkedThemes) → Zod validate themes ownership → persist `fieldsJson` → for each theme: append customStatId to `studyThemes.linkedStats` (idempotent, dedup) → invalidate cache.

---

## Requisitos Funcionais

### RF-01: PATCH /api/study-themes/:id aceita linkedStats

**Descricao:** Endpoint existente recebe novo campo opcional `linkedStats` no body para atualizar a lista de stats vinculadas a um tema.

#### Regras de negocio

##### RF-01.1: Schema Zod

```ts
linkedStats: z.array(z.string()).max(30).optional()
```

- Cap **30** (hard limit backend; UI mostra warning quando atinge).
- Cada string deve ser um `statId` valido — existente em `STAT_INDEX_BY_ID` (catalog) **OU** prefixo `custom_*` que case com `hudLayouts.fieldsJson[i].id` em pelo menos 1 layout do user.

##### RF-01.2: Validacao antes de persistir

1. Validar ownership do tema: `theme.userId === ctx.userId`. Se nao, **403** `{ message: 'Tema de outro usuario' }`.
2. Validar cada ID:
   - Se prefix `custom_*`: query `hudLayouts` do user para confirmar `fieldsJson[i].id === statId && fieldsJson[i].isCustom === true`.
   - Senao: confirmar `STAT_INDEX_BY_ID.has(statId) === true`.
3. Coletar IDs invalidos. Se array nao vazio, retornar **400** com payload `{ message: 'IDs invalidos', invalidIds: string[] }`.
4. Dedup automatico (`Array.from(new Set(linkedStats))`) preservando ordem de primeira ocorrencia.

##### RF-01.3: Persistencia

- Persistir array dedup-ado em `studyThemes.linkedStats`.
- Preservar todos os outros campos do tema — comportamento de PATCH classico.
- `updatedAt` atualizado automaticamente.

##### RF-01.4: Cache invalidation pos-commit

- Invalidar cache reverse lookup (`statsLinkedThemesCache`) para CADA `statId` em:
  - `previousLinkedStats` (estavam linkados, podem ter sido removidos).
  - `nextLinkedStats` (estao linkados agora, podem ter sido adicionados).
- Pattern segue lesson #21 (cache TTL com invalidator `_resetForTests`).

##### RF-01.5: Critérios de aceitação

- [ ] Body com `linkedStats: ['vpip', 'pfr', 'threebet_co']` persiste array em DB.
- [ ] Body com `linkedStats: ['custom_xyz']` valida que custom existe em algum layout HUD do user; persiste se valido.
- [ ] Body com `linkedStats: ['invalid_id_1', 'vpip', 'invalid_id_2']` retorna 400 `{ invalidIds: ['invalid_id_1', 'invalid_id_2'] }` SEM persistir.
- [ ] Body com 31 IDs validos retorna 400 (Zod rejection antes de query DB).
- [ ] Body com `['vpip', 'pfr', 'vpip']` persiste `['vpip', 'pfr']` (dedup, primeira ocorrencia ganha).
- [ ] PATCH em tema de outro user retorna 403.
- [ ] Outros campos do tema (name, color, briefing, etc) preservados quando body inclui apenas `linkedStats`.
- [ ] Cache reverse lookup invalida para IDs adicionados/removidos pos-commit (verificavel via spy em `invalidateStatsLinkedThemesCache`).

### RF-02: GET /api/stats/:statId/linked-themes

**Descricao:** Reverse lookup — quais temas do user atual linkam esta stat.

#### Regras de negocio

##### RF-02.1: Validacao

- `statId` deve existir em `STAT_INDEX_BY_ID` (catalog) **OU** ser prefix `custom_*` que existe em algum `hudLayouts.fieldsJson[i].id` do user.
- Se invalido, retornar **404** `{ message: 'Stat nao encontrada' }`.

##### RF-02.2: Query

- JSONB containment: `WHERE study_themes.user_id = $userId AND linked_stats @> to_jsonb(ARRAY[$statId]::text[])`.
- Order: `name ASC` (estavel para UI).

##### RF-02.3: Cache memoria TTL 60s

- Key: `${userId}:${statId}`.
- Pattern de `focusStats service` (lesson #21):
  - Map<key, { data, expiresAt }>.
  - `_resetForTests()` exportado com prefixo underscore.
  - `invalidateStatsLinkedThemesCache(userId, statId?)` chamada pelas mutations RF-01 + RF-08.
  - TTL 60s (escolhido pelo founder anteriormente para focusStats; manter consistencia).

##### RF-02.4: Response shape

```json
[
  { "themeId": "th_abc123", "name": "C-bet OOP em 3-bet pots", "slug": "cbet-oop-3bp", "category": "postflop" }
]
```

- Array vazio se nenhum tema linka a stat.
- Apenas temas do user atual (cross-user isolation).

##### RF-02.5: Performance

- Target p95 <50ms com GIN index (RF-07).
- Cache hit deve ser <5ms.

##### RF-02.6: Critérios de aceitação

- [ ] GET `/api/stats/vpip/linked-themes` para user com 3 temas linkando vpip retorna array com 3 entries em ordem alfabetica.
- [ ] GET stat sem temas linkados retorna `[]`.
- [ ] GET stat invalida (`invalid_xyz`) retorna 404.
- [ ] GET custom stat valida (`custom_my_stat` que existe em fieldsJson do user) funciona como catalog.
- [ ] Stat de outro user em DB NAO aparece na resposta (filtro `user_id`).
- [ ] Segunda chamada em <60s vem do cache (verificavel via spy em DB query).
- [ ] Pos-RF-01 mutation, cache invalidado — proxima chamada bate DB de novo.

### RF-03: Coach tool extender — read_theme_with_linked_stats_and_spots

**Descricao:** Extender tool existente `read_theme_with_linked_spots` (em `server/coachTools/readThemeWithLinkedSpots.ts`) para incluir stats linkadas com valores correntes do user + sparkline 30d.

#### Regras de negocio

##### RF-03.1: Renomeacao + alias

- Tool nova: `read_theme_with_linked_stats_and_spots`.
- Alias antigo: `read_theme_with_linked_spots` continua aceito por **1 sprint** (Sprint Stats-Themes-Linking-2). Ambos os nomes resolvem para mesma logica handler.
- Deprecation log emitido quando chamado pelo nome antigo: `console.warn('[deprecation] read_theme_with_linked_spots — use read_theme_with_linked_stats_and_spots')`.

##### RF-03.2: Payload novo (stats)

```ts
{
  theme: { id, name, color, emoji, progress, lastVisitedAt },
  tabs: [...],         // existente, max 5
  linked_spots: [...], // existente, max 10
  stats: [
    {
      statId: string,
      label: string,           // pt-BR de STAT_INDEX_BY_ID
      groupId: HudGroupId,
      groupLabel: string,      // de HUD_GROUP_LABELS
      currentValue: number | null,  // ultimo hudStatSnapshots.value
      targetMin: number,
      targetMax: number,
      direction: StatDirection,
      unit: StatUnit,
      sparkline30d: number[],  // max 30 floats, ultimos 30 dias
      isCustom: boolean,        // true se vier de hudLayouts.fieldsJson
    }
  ],
  summary: {
    spots_count, tabs_count, last_activity_at,
    stats_count: number,
    stats_in_range: number,    // count com currentValue dentro de [min, max]
    stats_alarm: number,       // count com currentValue fora do range
  }
}
```

##### RF-03.3: Fonte de dados

- **catalog stats**: lookup `STAT_INDEX_BY_ID.get(statId)`.
- **custom stats**: lookup `hudLayouts.fieldsJson` do user, find by id.
- **currentValue**: `SELECT value FROM hud_stat_snapshots WHERE user_id=$userId AND stat_id=$statId ORDER BY snapshot_date DESC LIMIT 1`. Se nao existe, `null`.
- **sparkline30d**: `SELECT value FROM hud_stat_snapshots WHERE user_id=$userId AND stat_id=$statId AND snapshot_date >= NOW() - INTERVAL '30 days' ORDER BY snapshot_date ASC`. Array no maximo 30 elementos.

##### RF-03.4: Empty state graceful

- Se `theme.linkedStats === []` ou null → `stats: []`, `summary.stats_count = 0`. Tool nao falha.
- Se stat tem custom prefix mas custom field foi deletado do HUD (deleted in `fieldsJson`) → omitir dessa stat do payload (skip silenciosamente). Nao retornar 500.
- Se stat tem catalog ID mas catalog removeu (improvavel mas defensivo) → omitir. Log warning.

##### RF-03.5: Prompt template (DRY — lesson #10)

- Adicionar referencia a stats no template Coach (arquivo unico onde prompt vive). Exemplo de patch:
  > "Voce tem acesso a tool `read_theme_with_linked_stats_and_spots` que retorna o tema completo, spots vinculados E **stats linkadas com valores correntes do user e sparkline 30d**. Use stats para diagnosticar leaks especificos com numeros..."
- NAO duplicar prompt inline em tools registry.

##### RF-03.6: Critérios de aceitação

- [ ] Tool chamada com tema sem `linkedStats` retorna `stats: []` sem erro.
- [ ] Tool chamada com tema com 5 stats linkadas (3 catalog + 2 custom) retorna 5 entries shape correto.
- [ ] `currentValue` = ultimo snapshot do user; `null` se nenhum snapshot.
- [ ] `sparkline30d` ordem cronologica ascendente (mais antigo first), max 30 elementos.
- [ ] Stat custom deletada do HUD = omitida do payload sem 500.
- [ ] `summary.stats_in_range` correto contra `targetMin/targetMax` + `direction`.
- [ ] Alias `read_theme_with_linked_spots` continua funcional + emite warning.
- [ ] Cross-user: tema de outro user retorna 403 (preservado de implementacao atual).

### RF-04: Frontend StatLinkPicker (componente novo)

**Descricao:** Multi-select de stats para vincular a um tema. Usado em config drawer do tema.

#### Regras de negocio

##### RF-04.1: Path + props

- Path: `client/src/components/study-themes/StatLinkPicker.tsx`.
- Props:
  ```ts
  {
    themeId: string;
    initialStatIds: string[];       // controlled mode start state
    onSave: (ids: string[]) => Promise<void>;
    customStats?: HudLayoutFieldEntry[];  // user custom stats (de hudLayouts)
  }
  ```

##### RF-04.2: UI

- Combobox virtualizado (Radix/shadcn Command pattern + react-virtual ou similar). Lista de 217+ items pode crashar sem virtualizacao.
- Chips removiveis no topo (stats ja selecionadas). Cada chip:
  - Label PT-BR + grupo (badge pequeno).
  - Botao X com `aria-label='Remover stat {label}'`.
- Plus button "Adicionar stat" abre Combobox.
- Search input filtra por:
  - `label` (substring case-insensitive).
  - `groupLabel` (HUD_GROUP_LABELS).
  - `targetMin/targetMax` numerico ("alvo 35-45" matches stats com range proximo).
- Lista no Combobox agrupada por `HudGroupId` com headers PT-BR (`HUD_GROUP_LABELS`).

##### RF-04.3: Custom stats integradas

- Se `customStats` populado, prepender grupo "Customizadas" (label PT-BR) com entries do user.
- Indicador visual: badge "Custom" para diferenciar de catalog.

##### RF-04.4: Validacao client-side

- Cap soft 30: ao tentar adicionar 31a, mostrar toast `'Maximo de 30 stats por tema'` + bloquear adicao.
- Sem dedup explicito client-side (Combobox ja previne duplicatas via state).

##### RF-04.5: Save flow

- Save eh debounced (chamada apos user fechar drawer ou clica "Salvar").
- Loading state no botao "Salvar" (spinner + disable).
- Em erro de backend (400 invalidIds): toast com detalhe `'Stats invalidas: {ids}'` + reverter chips invalidos.
- Em sucesso: toast `'Stats vinculadas atualizadas'`.

##### RF-04.6: A11y

- Combobox navegavel por teclado (setas + Enter + Esc — Radix default).
- Chips removiveis com Backspace quando focados.
- `aria-label` nos chips ("Remover {statName}").
- `role='listbox'` em opcoes virtualizadas com `aria-selected`.

##### RF-04.7: Integracao em /estudos/:slug

- Insertar em config drawer do tema (component existente apos Sprint Estudos-Habito-1).
- Posicao: **apos Briefing, antes de Spots**.
- Section header: "Stats foco do tema".
- Subtext: "Stats que serao monitoradas neste tema. Aparecem com valor atual e sparkline."

##### RF-04.8: Critérios de aceitação

- [ ] Render com 217 catalog stats nao trava (virtualizacao).
- [ ] Search "vpip" filtra para stats que tem "vpip" no id ou label.
- [ ] Search "RFI" filtra para grupo "RFI por posicao" (case-insensitive).
- [ ] Adicionar stat append no chip area + remove de Combobox.
- [ ] Remover chip via X ou Backspace (com focus).
- [ ] Tentativa de adicionar 31 = toast erro + bloqueio.
- [ ] Save chama `onSave(ids)` com array atual.
- [ ] Backend 400 com invalidIds = toast com lista + chips invalidos removidos visualmente.
- [ ] Custom stats aparecem em grupo "Customizadas" com badge.

### RF-05: Tema aberto exibe Stats Foco

**Descricao:** Pagina do tema (`/estudos/:slug` ou rota equivalente) ganha secao "Stats foco" abaixo de Briefing.

#### Regras de negocio

##### RF-05.1: Path

- Modificar `client/src/pages/StudyThemeDetail.tsx` (ou file equivalente — confirmar com architect; reaproveitar pattern existente de Briefing).

##### RF-05.2: Layout

- Section header "Stats foco" + count badge `({count})`.
- Posicao: **abaixo de Briefing** (mas acima de Tabs do tema).
- Empty state se `linkedStats.length === 0`:
  - Texto: "Nenhuma stat linkada — voce pode linkar stats nas Configuracoes deste tema."
  - CTA "Configurar stats" abre config drawer scrollado para a section StatLinkPicker.

##### RF-05.3: Card por stat

Para cada stat linkada, card horizontal:

```
┌──────────────────────────────────────────────────────┐
│ [groupBadge] Label PT-BR                             │
│ Valor atual: 42.3% [badge verde]                     │
│ Alvo: 35.0% — 45.0%                                  │
│ ▁▃▅▇▅▃▁▃▅▇▅▃▁▃▅▇▅▃▁▃▅ (sparkline 30d)               │
└──────────────────────────────────────────────────────┘
```

- **Badge cor**: verde se `currentValue ∈ [targetMin, targetMax]`; amarelo se desvio <10% do range; vermelho se >10%. Direction-aware (`lower_better` inverte).
- **Sparkline**: Recharts mini line chart, height 32px, sem axes. Cor segue badge.
- **`currentValue null`**: mostrar "Sem dados" + sparkline placeholder (linha cinza).

##### RF-05.4: Click drill

- Click no card navega para `/stats?focusStatId={statId}` (Wouter).
- Lesson #19 — confirmar rota existe em `App.tsx`. Se nao, criar handler em StatsAnalyzer que aceita query param `focusStatId` e abre drawer correspondente.

##### RF-05.5: Data source

- API: chamar GET `/api/themes/:id/stats-summary` (endpoint novo se nao existe; ou inline no `GET /api/study-themes/:id` augmenting payload — escolha do architect).
- Response shape espelha `RF-03.2 stats[]` para reuso.

##### RF-05.6: Performance

- Lazy load: section "Stats foco" so renderiza data quando tema esta visivel (intersection observer ou useEffect na pagina).
- Sparkline data parallel fetch (todas as stats em batch, nao 1 chamada por stat).

##### RF-05.7: Critérios de aceitação

- [ ] Tema com 0 linkedStats mostra empty state com CTA.
- [ ] Tema com 3 linkedStats mostra 3 cards.
- [ ] Click no CTA "Configurar stats" abre drawer + scroll to StatLinkPicker.
- [ ] Click no card de stat navega para `/stats?focusStatId=X`.
- [ ] Badge verde quando valor ∈ range.
- [ ] Badge vermelho quando valor fora do range >10%.
- [ ] `currentValue null` mostra "Sem dados" sem crash.
- [ ] Sparkline renderiza com 30 pontos quando dados disponiveis.
- [ ] Sparkline renderiza placeholder cinza quando `sparkline30d.length === 0`.

### RF-06: Stats Analyzer drawer "Temas relacionados"

**Descricao:** Drawer de cada stat (Stats Analyzer) ganha secao mostrando temas que linkam aquela stat.

#### Regras de negocio

##### RF-06.1: Path

- Modificar drawer/sheet existente em `client/src/pages/StatsAnalyzer.tsx` (ou file equivalente). Confirmar component name com Glob no working directory.

##### RF-06.2: UI

- Nova secao "Temas relacionados" no drawer.
- Posicao: apos secoes existentes (target/range, breakdown), antes de footer.
- Para cada tema linkado: chip clicavel.
  - Label: `{name}` + badge pequeno `{category}` (preflop/postflop/multiway de Themes-V2).
  - Click navega `/estudos/:slug` (Wouter).
- Empty state: "Nenhum tema linka esta stat ainda."
  - CTA opcional: "Linkar a um tema..." abrindo um picker reverso (DEFER se complexo — aceitavel para Sprint 1 nao ter este CTA).

##### RF-06.3: Data source

- GET `/api/stats/:statId/linked-themes` (RF-02).
- Loading state: skeleton com 3 chips placeholder.
- Erro: "Erro ao carregar temas relacionados" (sem retry automatico no MVP).

##### RF-06.4: Critérios de aceitação

- [ ] Drawer abre para stat com 0 temas linkados → empty state.
- [ ] Drawer abre para stat com 3 temas linkados → 3 chips.
- [ ] Click em chip navega `/estudos/:slug`.
- [ ] Loading state aparece <100ms.
- [ ] Erro 500 mostra texto inline sem crash.

### RF-07: Migration GIN index linked_stats

**Descricao:** Index para reverse lookup performatico em `studyThemes.linkedStats`.

#### Regras de negocio

##### RF-07.1: Migration file

- Path: `migrations/0060_study_themes_linked_stats_gin.sql`.
- Conteudo:
  ```sql
  -- Sprint Stats-Themes-Linking-1 (ADR-141)
  -- GIN index para reverse lookup performatico de stats linkadas a temas.
  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_study_themes_linked_stats_gin
    ON study_themes USING gin (linked_stats);
  
  -- ANALYZE para refresh de stats do planner.
  ANALYZE study_themes;
  ```

##### RF-07.2: Rollback

- Documentar em comment + arquivo `migrations/0060_study_themes_linked_stats_gin_rollback.sql`:
  ```sql
  DROP INDEX IF EXISTS idx_study_themes_linked_stats_gin;
  ```

##### RF-07.3: Aplicacao

- Local dev: `npm run db:push` ou `psql ... -f migrations/0060_*.sql`.
- Producao (futuro): `CONCURRENTLY` evita lock; safe para deploy live.

##### RF-07.4: Critérios de aceitação

- [ ] Migration aplica sem erro em base local.
- [ ] `EXPLAIN ANALYZE SELECT * FROM study_themes WHERE linked_stats @> '["vpip"]'::jsonb` usa o index (Bitmap Index Scan on idx_study_themes_linked_stats_gin).
- [ ] Reverse lookup p95 <50ms com 100+ temas linkando a stat (load test sintetico).
- [ ] Rollback file existe + funciona.

### RF-08: HUD Customizer — link custom field a temas

**Descricao:** Custom fields no HUD Customizer ganham passo opcional "Linkar a temas". Persistido em `hudLayouts.fieldsJson[i].linkedThemes` + write-through bidirecional para `studyThemes.linkedStats`.

#### Regras de negocio

##### RF-08.1: Schema extension

- `HudLayoutFieldEntry` interface (em `shared/schema.ts:3689`) ganha campo opcional:
  ```ts
  linkedThemes?: string[]; // theme IDs do user
  ```
- `hudLayoutFieldEntrySchema` (Zod, `shared/schema.ts:3730`) ganha:
  ```ts
  linkedThemes: z.array(z.string()).max(20).optional().default([]),
  ```
- Cap soft **20** (UI warning, backend hard).
- Lesson #7 — `optional + default` para back-compat com layouts existentes.

##### RF-08.2: PATCH /api/hud-layouts/:id (validacao)

- Ao receber `fieldsJson` com `linkedThemes` em qualquer entry:
  1. Validar ownership do layout: `layout.userId === ctx.userId` (se nao, 403).
  2. Para cada `themeId` em `linkedThemes`: validar que existe em `studyThemes` do user. Coletar invalidIds.
  3. Se invalidIds nao vazio: 400 `{ message: 'Temas invalidos', invalidIds }`.
  4. Dedup automatico.

##### RF-08.3: Write-through bidirecional

- **Adicionar custom stat a tema**: para cada `themeId` em `field.linkedThemes` que NAO estava antes:
  - `UPDATE study_themes SET linked_stats = linked_stats || to_jsonb(ARRAY[$customStatId]::text[]) WHERE id = $themeId AND user_id = $userId`.
  - Idempotente: dedup com `linked_stats @> [customStatId]` antes de append (use Postgres `||` apenas se nao existe ja).
- **Remover custom stat de tema**: para cada `themeId` que estava antes mas NAO esta agora:
  - `UPDATE study_themes SET linked_stats = linked_stats - $customStatId WHERE id = $themeId AND user_id = $userId`.
  - Postgres operator `jsonb - text` remove key (works para arrays via `jsonb_array_elements` + filter — pode requerer subquery; architect decide query final).

##### RF-08.4: Cache invalidation

- Pos-commit: invalidar `statsLinkedThemesCache` para `customStatId` (igual RF-01.4).

##### RF-08.5: Delete de custom field

- Quando user deleta custom field do `fieldsJson`:
  - Backend deve remover `customStatId` de todos os `studyThemes.linkedStats` do user que o continham.
  - Coach tool (RF-03) ja trata stat orfa graciosamente (RF-03.4), mas cleanup proativo evita lixo no DB.

##### RF-08.6: UI HudCustomizer

- Path: `client/src/components/stats/HudCustomizer.tsx` (ou equivalente — confirmar via Glob).
- No editor de custom field, abaixo dos campos `label/group/unit/direction/targetMin/targetMax`, adicionar section opcional "Linkar a temas".
- Multi-select de temas do user (curated + custom). Reusa pattern do StatLinkPicker rebatizado como `ThemeMultiSelect` se util, OU novo componente dedicado `ThemeLinkPicker.tsx`.
- Cap soft 10 (toast quando atinge).

##### RF-08.7: Critérios de aceitação

- [ ] Criar custom field com `linkedThemes: ['th_a', 'th_b']` persiste em `fieldsJson` E em `study_themes.linked_stats` de ambos os temas (com customStatId).
- [ ] Editar custom field removendo `th_a` de `linkedThemes` remove customStatId de `study_themes.linked_stats` apenas de `th_a` (preserva `th_b`).
- [ ] Deletar custom field inteiro remove customStatId de todos os themes.linked_stats que continham.
- [ ] PATCH com `linkedThemes` invalido retorna 400 + invalidIds.
- [ ] PATCH com 11 themes retorna 400 (Zod cap).
- [ ] Custom field sem `linkedThemes` (back-compat layout existente) continua funcionando.
- [ ] Cache reverse lookup invalidado para customStatId pos-mutation.

---

## Acceptance criteria globais (cross-RF)

- 100% das stats validadas contra `STAT_INDEX_BY_ID` (catalog) ou `hudLayouts.fieldsJson` (custom) antes de persistir em `studyThemes.linkedStats`.
- 100% dos temas validados como pertencentes ao user (filtro `user_id` em todas queries; nao linkar tema de outro user).
- Coach tool nao quebra para temas sem `linkedStats` (retorna `stats: []`).
- Cache reverse lookup invalida em **todas** mutations: PATCH theme (RF-01), PATCH HUD layout custom field (RF-08), DELETE custom field (RF-08.5).
- Empty states claros em todas superficies (RF-05, RF-06).
- A11y: chips removiveis com `aria-label`, autocomplete navegavel teclado, `role` semantico em virtualized list.
- Performance: query reverse lookup <50ms p95 com GIN index. Cache hit <5ms.
- Zero regressao em testes existentes (731+ baseline pos-Sprint Spot-Anki-Reentry-3).

---

## Endpoints Previstos

| Método | Rota | Descrição | Auth | Novo? |
|---|---|---|---|---|
| PATCH | /api/study-themes/:id | Atualiza tema (agora aceita `linkedStats`) | JWT | Estende existente (RF-01) |
| GET | /api/stats/:statId/linked-themes | Reverse lookup themes do user que linkam stat | JWT | **Novo** (RF-02) |
| PATCH | /api/hud-layouts/:id | Atualiza layout (agora `fieldsJson[i].linkedThemes`) | JWT | Estende existente (RF-08) |
| GET | /api/themes/:id/stats-summary | Stats com currentValue + sparkline para detalhe do tema | JWT | **Novo opcional** (RF-05.5; pode ser augmenting de GET tema existente — architect decide) |

Coach tool (RF-03) nao eh endpoint REST — eh tool descriptor consumida via Coach API.

---

## Modelos de Dados Afetados

### studyThemes (existente — sem alteracao schema, apenas uso)

`linked_stats: jsonb array` ja existe (Sprint Estudos-Habito-1, ADR-127). Sprint atual:
- Adiciona GIN index (RF-07).
- Popula via UI (RF-04) e write-through (RF-08).
- Le via reverse lookup (RF-02) e Coach tool (RF-03).

### hudLayouts.fieldsJson (extensao schema)

| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| `linkedThemes` | `string[]` opcional | `max(20)`, default `[]` | IDs de `studyThemes` do user. Validado em PATCH. |

Lesson #7 — back-compat via `optional + default`. Layouts existentes nao precisam migration (`undefined` interpreta como `[]`).

### Tabela `hud_stat_snapshots` (existente — apenas leitura)

Coach tool (RF-03) e detalhe do tema (RF-05) consultam `value` mais recente + ultimos 30 dias por (user_id, stat_id). Schema ja existe (Sprint Stats-V2/V3).

---

## Integracoes Externas

Nenhuma. Sprint inteiramente interno (DB + UI + Coach tool).

---

## Cenarios de Teste Derivados

### Happy Path

- [ ] User abre `/estudos/cbet-oop`, abre config drawer, adiciona 3 stats via StatLinkPicker, save → cards aparecem na pagina do tema.
- [ ] User abre `/stats`, drawer de C-bet OOP, ve "Temas relacionados" com 1 chip → click navega para tema.
- [ ] User abre HudCustomizer, cria custom field `custom_my_stat`, linka a 2 temas → ambos temas mostram custom stat na secao Stats foco.
- [ ] Coach tool chamada com tema com 5 stats linkadas retorna shape correto + currentValue + sparkline.

### Validacao de Input (RF-01, RF-02, RF-08)

- [ ] PATCH theme `linkedStats: ['invalid_id']` → 400 + invalidIds.
- [ ] PATCH theme `linkedStats: []` (clear all) → persiste array vazio.
- [ ] PATCH theme com 31 stats → 400 (Zod cap).
- [ ] GET stats/invalid_id/linked-themes → 404.
- [ ] PATCH HUD layout `fieldsJson[i].linkedThemes: ['th_outro_user']` → 400 + invalidIds (cross-user check).
- [ ] PATCH HUD layout com 11 themes → 400.

### Regras de Negocio (write-through)

- [ ] Adicionar custom field linkedThemes=[A,B] → study_themes.linked_stats de A e B contem customStatId.
- [ ] Remover B de linkedThemes → study_themes.linked_stats de B nao contem mais (mas A preserva).
- [ ] Deletar custom field inteiro → study_themes.linked_stats de A e B nao contem mais.
- [ ] Edit theme PATCH com linkedStats que **omite** customStatId → custom field linkedThemes do HUD NAO eh atualizado (fluxo unidirecional theme → custom NAO existe; apenas custom → theme write-through eh bidirecional). Esta regra deve estar **explicita em ADR-141**.
- [ ] Dedup: linkedStats=[vpip, pfr, vpip] persiste [vpip, pfr].

### Edge Cases

- [ ] Coach tool: tema com linkedStats inclui customStatId que foi deletado → omite + log warning (sem 500).
- [ ] Coach tool: tema com linkedStats inclui catalog ID inexistente (improvavel) → omite + log warning.
- [ ] Sparkline: user sem snapshots → array vazio + placeholder visual.
- [ ] StatLinkPicker virtualizado renderiza 217 items sem trava (< 200ms initial render).
- [ ] Reverse lookup: stat linkada a 0 temas → cache armazena `[]` por 60s, hits subsequentes <5ms.
- [ ] Cache invalidation: pos-PATCH theme, proxima chamada GET reverse lookup bate DB (verificavel via spy).
- [ ] Cache TTL: simular Date avanco >60s → expira + bate DB.
- [ ] Migration: GIN index aplica em base com 1k+ themes sem timeout (use `CONCURRENTLY`).

### A11y

- [ ] Chips em StatLinkPicker tem `aria-label='Remover {label}'`.
- [ ] Combobox navegavel via teclado: Tab → setas → Enter (select) → Esc (close).
- [ ] Backspace remove ultimo chip quando input vazio.
- [ ] Lista virtualizada tem `role='listbox'` + `aria-selected`.

### Performance

- [ ] Reverse lookup p95 <50ms com 100+ temas linkando stat (carga sintetica).
- [ ] Cache hit p95 <5ms.
- [ ] StatLinkPicker initial render <200ms com 217 stats.
- [ ] Stats Foco section em tema detalhe: paralelo fetch de currentValue + sparkline para todas stats (nao serial).

### Cross-User Isolation

- [ ] User A nao ve themes de User B em GET /api/stats/:id/linked-themes.
- [ ] User A nao consegue PATCH theme de User B (403).
- [ ] User A nao consegue linkar tema de User B em custom field do HUD (400 invalidIds).
- [ ] Coach tool com tema de outro user → 403.

---

## Fora de Escopo

(Reforco do "Nao-Objetivos" para evitar scope creep do Implementer.)

- Bulk link/unlink (selecionar 5 stats e linkar a 3 temas em batch).
- Search semantica em stats ("encontre stats que medem agressao em multiway").
- Recomendacao automatica de stats para um tema (ML).
- Audit trail de mutations em linkedStats.
- API publica externa.
- Stats user-defined fora do HUD Customizer.
- Sparkline customizavel (sempre 30 dias).
- Migration de dados historicos para custom themes (user popula via UI).
- Cap dinamico por tier (fixo 30 stats / 20 themes em custom field).
- Coach AI **gera** sugestao de stats para tema (consome existente, nao gera).
- Visualizacao de evolucao de `currentValue` ao longo de meses no card (apenas sparkline 30d).
- Notificacao "stat saiu do range" — feature de alerts, futuro.

---

## Dependencias

### Sprints anteriores (ja entregues)

- **Sprint Estudos-Habito-1** (ADR-127) — `studyThemes.linkedStats` JSONB array existe.
- **Sprint Themes-V2** (commit 41b3349) — temas curados v2 (20 temas, 3 categorias) com `linkedStats` populado no seed.
- **Sprint Stats-V2/V3** (ADR-058+064) — `STAT_INDEX_BY_ID` catalogo + `hudLayouts.fieldsJson` shape custom.
- **Sprint home-reform-4 Item 7** (ADR-116) — `userFocusStats` (separado de linkedStats; convivem).
- **Sprint Studies-Reform** (ADR-067/068) — Coach tool `read_theme_with_linked_spots` existe.

### Pre-requisitos para este sprint

- ADR-141 (architect cria antes de test-writer).
- ADR-142 (architect cria antes de test-writer).
- 2 diagramas Mermaid sequence (architect cria antes de test-writer).

### Sprints futuros que dependem deste

- **Stats-Themes-Linking-2** (P1/P2 deferred): bulk ops, search semantica, audit trail, recomendacao ML.
- **Coach-Plano-Semanal-3**: Coach AI consome `read_theme_with_linked_stats_and_spots` para gerar plano semanal data-driven (currentValue + sparkline alimenta priorizacao).
- **Spot-Anki-Reentry-4**: SRS cards podem incluir stats correntes do user na pergunta.

---

## Riscos

| Risco | Mitigacao |
|---|---|
| GIN index demora minutos em base producao com 100k+ temas | `CREATE INDEX CONCURRENTLY` evita lock + deploy off-peak. |
| Custom stat deletada deixa lixo em `studyThemes.linked_stats` | RF-08.5 cleanup proativo + RF-03.4 graceful skip no Coach tool. |
| StatLinkPicker virtualizado com 217 stats trava browser | Virtualizacao via Radix Command + react-virtual. Test-writer deve testar render time. |
| Cache reverse lookup serve dado stale | Invalidacao em **todas** mutations (RF-01.4 + RF-08.4). Test-writer cobre via spy. |
| Coach tool alias quebra clients antigos sem aviso | Alias `read_theme_with_linked_spots` mantido por 1 sprint + log deprecation. |
| Write-through HUD → theme bidirecional cria ciclo infinito | Implementacao **unidirecional**: custom field → theme.linkedStats. Edicao em theme.linkedStats NAO atualiza HUD `linkedThemes`. Documentado em ADR-141 + teste explicito. |
| Migration GIN concurrente em PG <11 falha | Confirmar PG version antes (Grindfy usa PG 16 — ok). |
| Lesson #14 (require em .tsx) re-aparece em testes do StatLinkPicker | test-writer obrigatoriamente usa `await import(...)` em testes que carregam componentes React. |
| Lesson #28 (vi.mock por path) | Se test-writer mock `@/components/study-themes/StatLinkPicker`, garantir que paginas que importam usam mesmo path (sem aliases divergentes). |

---

## Notas de Implementacao (sugestoes para Implementer)

- **Reverse lookup query**: `SELECT id, name, slug, category FROM study_themes WHERE user_id = $1 AND linked_stats @> to_jsonb(ARRAY[$2]::text[])`. Drizzle equivalente usa `sql\`... @> ...\`` raw OU operator helper. Architect decide.
- **Cache pattern**: `Map<string, { data, expiresAt }>` em modulo singleton. Export `_resetForTests` + `invalidateStatsLinkedThemesCache(userId, statId?)`. TTL 60s. Lesson #21.
- **Write-through query**: usar transacao Drizzle para garantir atomicidade entre `hudLayouts` update e `studyThemes` updates. Se transacao falha, rollback inteiro.
- **Sparkline data**: query unica `SELECT stat_id, snapshot_date, value FROM hud_stat_snapshots WHERE user_id = $1 AND stat_id = ANY($2) AND snapshot_date >= NOW() - INTERVAL '30 days' ORDER BY stat_id, snapshot_date ASC` para batch fetch (evita N+1).
- **StatLinkPicker virtualization**: `cmdk` (Radix Command) ja tem virtualization built-in via `<Command.List>`. Confirmar.
- **Coach tool alias**: registry mapping `read_theme_with_linked_spots → readThemeWithLinkedStatsAndSpots` handler com flag `isAlias: true` para emitir warning.
- **Drizzle JSONB array operator**: `linked_stats - $1` (remove key) NAO funciona para arrays — precisa subquery `(SELECT jsonb_agg(elem) FROM jsonb_array_elements(linked_stats) elem WHERE elem != to_jsonb($1::text))`. Architect valida.

---

## Verificacao Final (PM-Spec checklist)

- [x] Cada RF tem critérios de aceitação verificáveis.
- [x] Cenários de teste cobrem happy path, validacao input, regras de negocio, edge cases, a11y, performance, cross-user.
- [x] Seção "Fora de Escopo" preenchida.
- [x] Endpoints listados com método, rota, descrição, auth, novo/existente.
- [x] Modelos de dados afetados documentados (extensao + uso).
- [x] Dependencias de sprints anteriores listadas com ADRs.
- [x] Riscos com mitigacao identificados.
- [x] ADRs e diagramas pre-requisito identificados para architect.
- [x] Lessons learned relevantes referenciadas (#7, #10, #14, #19, #21, #28).
- [x] Performance targets explicitos.
- [x] Cross-user isolation explicito em todos endpoints.

---

## Próximo passo

```
Spec aprovada e salva em B:\grindfy\Docs\specs\stats-themes-linking-1.md

→ Use o agente system-architect para criar:
  - ADR-141 "Reaproveitar studyThemes.linkedStats vs nova junction table"
  - ADR-142 "Coach tool unificada read_theme_with_linked_stats_and_spots"
  - 3 diagramas Mermaid sequence (edit theme flow, reverse lookup flow, HUD custom write-through flow)
```
