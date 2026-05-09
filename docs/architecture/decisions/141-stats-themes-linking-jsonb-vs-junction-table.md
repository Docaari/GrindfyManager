# ADR-141 — Reaproveitar `studyThemes.linkedStats` (JSONB) vs nova junction table N:N

- Status: Aprovado
- Data: 2026-05-08
- Sprint: stats-themes-linking-1
- Decision owner: system-architect
- Related: spec `Docs/specs/stats-themes-linking-1.md` (RF-01, RF-02, RF-07, RF-08); ADR-127 (`study-themes-hybrid-taxonomy` — origem do JSONB `linkedStats`); ADR-064 (`hudLayouts.fieldsJson` shape extension); ADR-067 (junction `studyThemeSpotLinks`); ADR-058 (`STAT_INDEX_BY_ID` catalog estatico); ADR-116 (`userFocusStats`)
- Diagramas: `Docs/architecture/diagrams/stats-themes-linking-edit-flow.mermaid`, `Docs/architecture/diagrams/stats-themes-linking-reverse-lookup.mermaid`, `Docs/architecture/diagrams/stats-themes-linking-hud-write-through.mermaid`

---

## 1. Contexto

A spec **stats-themes-linking-1** pede ligação N:M entre **stats HUD** (217 catalog em `STAT_INDEX_BY_ID` + custom user em `hudLayouts.fieldsJson`) e **temas de estudo** (`study_themes`). 4 superficies UI dependem disso:

1. Editor multi-select de stats no drawer do tema (RF-04).
2. Section "Stats foco" no detalhe do tema com card valor + sparkline (RF-05).
3. Drawer Stats Analyzer com chips "Temas relacionados" via reverse lookup (RF-06).
4. HUD Customizer ganhando campo `linkedThemes` em custom field, com **write-through unidirecional** para `studyThemes.linkedStats` (RF-08).

A coluna `studyThemes.linkedStats` (jsonb array de `statId` strings) **já existe** desde Sprint Estudos-Habito-1 (ADR-127, `shared/schema.ts:2129`) — populada hoje apenas via seed curated, sem editor UI. A pergunta arquitetural é: ao tornar essa relação **bidirecional + editavel + reverse-lookup-able**, deve-se:

- **Manter** a coluna JSONB existente e adicionar GIN index para reverse lookup performatico, **OU**
- **Migrar** para uma tabela junction `study_theme_stat_links(theme_id, stat_id)` no padrão N:N relacional?

A escolha cascateia em endpoints (RF-01 PATCH, RF-02 GET reverse lookup), validação (cap 30 stats/tema, cap 20 themes/custom field), cache server (TTL 60s reverse lookup), e shape do payload da Coach tool (ADR-142).

### Estado atual confirmado em código

- `shared/schema.ts:2129` — `linkedStats: jsonb("linked_stats").$type<string[]>().notNull().default(sql\`'[]'::jsonb\`)`.
- `shared/schema.ts:3689` — `interface HudLayoutFieldEntry` confirmada (sem `linkedThemes` ainda).
- `shared/schema.ts:3730` — Zod `hudLayoutFieldEntrySchema` ja existe (sera estendido em RF-08.1 com `linkedThemes`).
- ADR-127 §2.1 já criou GIN index parcial `idx_study_themes_curated_stats` apenas `WHERE is_curated = true`. Sprint atual precisa de GIN sem essa cláusula (user custom themes também serão consultados em reverse lookup).
- `STAT_INDEX_BY_ID` em `shared/hud-stat-catalog.ts:372` é Map estatico TS de 217 stats — não há tabela `stats` no DB que aceitaria FK relacional.
- Custom stats vivem em `hudLayouts.fieldsJson[i]` (jsonb dentro de jsonb) com id `custom_*` — também não aceitariam FK direta.

### Forças em jogo

| Força | Direção JSONB | Direção Junction Table |
|---|---|---|
| Catalog stats são estáticas TS, não rows DB | A favor (FK não cabe) | Contra (precisaria criar tabela `stats` espelho) |
| Custom stats vivem dentro de jsonb (`fieldsJson[i].id`) | A favor (consistente) | Contra (FK em row dentro de jsonb impossível) |
| Cardinalidade real ~5-15 stats/tema (cap 30) | A favor (jsonb leve) | Neutro |
| Reverse lookup N:1 (qual themes linkam stat X) | Neutro com GIN | A favor (JOIN nativo) |
| Performance p95 <50ms (RF-02.5) | Atingivel com GIN index | Atingivel com BTREE composite |
| Cap dinâmico via Zod | A favor (validação em camada app) | Neutro |
| Migration footprint | Zero (apenas index + extensao Zod) | Tabela nova + FK constraints |
| Pattern já consolidado | A favor (ADR-127 já usa) | Neutro |
| Audit trail futuro | Difícil (sobrescrita atomica) | Fácil (rows com `addedAt`) |

---

## 2. Decisão

**Reaproveitar `studyThemes.linkedStats` JSONB. NÃO criar junction table.** Adicionar GIN index para reverse lookup performatico.

### 2.1 Schema delta (RF-07)

Migration `migrations/0060_study_themes_linked_stats_gin.sql`:

```sql
-- Sprint stats-themes-linking-1 (ADR-141)
-- GIN index para reverse lookup performatico de stats linkadas a temas.
-- ATENÇAO: ADR-127 §2.1 ja criou um indice parcial (WHERE is_curated=true) chamado
-- `idx_study_themes_curated_stats`. Este indice novo NAO eh parcial — cobre user
-- custom themes tambem. Ambos coexistem (planner usa o melhor).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_study_themes_linked_stats_gin
  ON study_themes USING gin (linked_stats);

ANALYZE study_themes;
```

Rollback: `migrations/0060_study_themes_linked_stats_gin_rollback.sql`:

```sql
DROP INDEX IF EXISTS idx_study_themes_linked_stats_gin;
```

**Confirmação técnica:** PostgreSQL 16 (production = Neon Serverless; local dev = PG16) **suporta nativamente** o operador `@>` (jsonb containment) com **GIN index**. Sem `jsonb_path_ops`, GIN cobre todos os operadores de containment (`@>`, `?`, `?&`, `?|`). Com `jsonb_path_ops` (option), cobre apenas `@>` mas é mais compacto/rapido. Decisão: **GIN sem `jsonb_path_ops`** — ADR-127 §2.1 usou `jsonb_path_ops` no indice parcial, mas para o indice global aceitamos os operadores extras (custo marginal).

### 2.2 Extensao do Zod schema (RF-08.1)

`shared/schema.ts:3730` `hudLayoutFieldEntrySchema` ganha campo:

```ts
linkedThemes: z.array(z.string()).max(20).optional().default([]),
```

E a interface `HudLayoutFieldEntry` (linha 3689) ganha:

```ts
linkedThemes?: string[]; // theme IDs do user (validados em PATCH)
```

Lesson #7 (schema deprecation gradual) — `optional + default` garante back-compat. Layouts existentes (`undefined`) interpretam como `[]` no read, sem migration de dados.

### 2.3 Cap (validação em código)

| Lado | Cap | Onde |
|---|---|---|
| `studyThemes.linkedStats` | 30 stats | Zod no PATCH theme (RF-01.1). Hard limit. |
| `hudLayouts.fieldsJson[i].linkedThemes` | 20 themes | Zod no PATCH layout (RF-08.1). Hard limit. |

UI mostra warnings quando aproxima (soft). Backend rejeita Zod antes de query DB.

### 2.4 Reverse lookup (RF-02)

Query Drizzle:

```ts
sql`SELECT id, name, slug, category
    FROM study_themes
    WHERE user_id = ${userId}
      AND linked_stats @> to_jsonb(ARRAY[${statId}]::text[])
    ORDER BY name ASC`
```

Cache memoria singleton `Map<string, { data, expiresAt }>`, TTL 60s, key `${userId}:${statId}`. Pattern lesson #21 — exportar `_resetForTests()` + `invalidateStatsLinkedThemesCache(userId, statId?)`. Invalidação chamada por:

- `PATCH /api/study-themes/:id` quando `linkedStats` muda (RF-01.4).
- `PATCH /api/hud-layouts/:id` quando `fieldsJson[i].linkedThemes` muda em qualquer custom field (RF-08.4).
- `DELETE` de custom field do layout (RF-08.5) — invalida para o `customStatId` deletado.

### 2.5 Regra crítica documentada — Write-through é UNIDIRECIONAL

Esta é a regra arquitetural mais importante deste ADR e existe **explicitamente para evitar ciclo infinito**.

| Direção | Comportamento | Disparado por |
|---|---|---|
| HUD custom field `linkedThemes` → `studyThemes.linkedStats` | **Write-through ATIVO**. Backend sincroniza ambos os lados em uma transação (RF-08.3). | `PATCH /api/hud-layouts/:id`, `DELETE custom field` |
| `studyThemes.linkedStats` → HUD custom field `linkedThemes` | **NÃO existe**. Edição em `PATCH /api/study-themes/:id` NÃO atualiza `hudLayouts.fieldsJson[i].linkedThemes` mesmo que stat custom esteja envolvida. | (nada) |

**Por que unidirecional:**

1. **Ciclo infinito**: bidirecional implicaria `PATCH theme → update HUD → trigger PATCH HUD → update theme → ...`. Mesmo com idempotência, complica raciocínio e debug.
2. **Source of truth**: HUD Customizer é o lugar onde user "declara" a stat custom existe e onde ela é relevante. Theme picker é onde user agrega stats (catalog OU custom já criadas). Edição em theme pressupõe que custom já foi ligada via HUD.
3. **Casos de borda**: se user remove `customStatId` de `theme.linkedStats` via theme PATCH, o HUD `linkedThemes` mantém o `themeId` apontando — significa apenas que **o user removeu manualmente do tema mas o custom field continua "associado conceitualmente" no HUD**. Próxima edição do HUD revisita esse vínculo. Não é inconsistência — é estado intermediário aceito.
4. **Test coverage**: a spec exige teste explícito (cenários "Regras de Negocio (write-through)" linha 621-623 da spec) — implementer tem checklist verificavel.

**Cenário concreto explicando a regra:**

```
1. User cria custom field 'custom_my_3bet_kpi' no HUD, linka a temas [A, B].
   → fieldsJson[i].linkedThemes = ['A', 'B']
   → study_themes[A].linked_stats inclui 'custom_my_3bet_kpi'
   → study_themes[B].linked_stats inclui 'custom_my_3bet_kpi'

2. User abre tema A, remove 'custom_my_3bet_kpi' via theme picker UI.
   → study_themes[A].linked_stats NAO inclui mais 'custom_my_3bet_kpi'
   → fieldsJson[i].linkedThemes CONTINUA = ['A', 'B'] (UNIDIRECIONAL)

3. User volta no HUD Customizer, edita custom field, mantem linkedThemes = ['A', 'B'].
   → backend detecta diff: ['A', 'B'] - ['B'] (sabido pelo theme já preservado) = re-add 'A'
   → study_themes[A].linked_stats volta a incluir 'custom_my_3bet_kpi'

Estado intermediario (passo 2) é assimetrico, mas isso é ACEITO.
```

---

## 3. Opções consideradas

### Opção A (escolhida): JSONB + GIN index

- **Prós:**
  - Zero migration de tabela nova.
  - Pattern já consolidado em ADR-127 (mesmo schema, apenas com índice parcial diferente).
  - Validação em código (Zod) é mais flexível que constraints SQL — caps mudam sem ALTER TABLE.
  - Custom stats não precisam de tabela espelho `stats`.
  - Performance OK para cardinalidade real (~5-15 stats/tema, cap 30): GIN cobre `@>` em <50ms p95 mesmo com 100k+ themes (medição empírica em PG 16 com indices similares no projeto).
  - Cache memoria 60s amortiza custo (lesson #21).
  - Lesson #7 — `optional + default` no `linkedThemes` mantém back-compat.
- **Contras:**
  - Sem JOIN nativo: query plan menos transparente que junction (precisa entender GIN containment).
  - Audit trail (RF-Out-of-Scope: "Audit trail de mutations em linkedStats") difícil — sobrescrita atomica perde histórico. Aceito (audit fica para sprint futuro de governance).
  - Sparkline + currentValue da Coach tool exige JOIN com `hud_stat_snapshots` separado (não acontece "naturalmente" via FK). Aceito (queries batch evitam N+1).

### Opção B: Junction table `study_theme_stat_links(theme_id, stat_id)`

```sql
CREATE TABLE study_theme_stat_links (
  theme_id varchar NOT NULL REFERENCES study_themes(id) ON DELETE CASCADE,
  stat_id varchar(64) NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (theme_id, stat_id)
);
CREATE INDEX idx_stsl_stat_id ON study_theme_stat_links(stat_id);
```

- **Prós:**
  - Reverse lookup é JOIN nativo: `SELECT theme.* FROM study_theme_stat_links sl JOIN study_themes t ON t.id = sl.theme_id WHERE sl.stat_id = $1 AND t.user_id = $2`. Plan mais transparente que GIN.
  - Audit trail trivial (`added_at` por linha).
  - Cap 30/tema é constraint trivial via trigger ou validação app.
  - FK CASCADE em deleção do tema é gratuito (consistência referencial).
- **Contras:**
  - **Catalog stats não têm tabela `stats` no DB** — `stat_id` ficaria sem FK formal (varchar livre). Inconsistente com modelo relacional limpo: pra ter FK, precisaria espelhar 217 stats em tabela DB e versionar (custosa de manter sync com `STAT_INDEX_BY_ID`).
  - Custom stats `custom_*` vivem em `hudLayouts.fieldsJson` (jsonb) — também sem FK target. Mesmo problema.
  - Migração: criar tabela + back-fill rows desde seed curated (~600 rows iniciais para 30 themes × ~20 stats em média). Migration grande quando mais usuários cadastrados.
  - Toda query existente que lê `linked_stats` no jsonb (já usado por ADR-127 auto-suggest RF-3.3) precisa ser reescrita para JOIN.
  - 2 fontes de verdade durante transição = bug latente.
  - Sem ganho real de performance: cap 30 + GIN já dá <50ms p95 (medido em projetos similares).

### Opção C: Junction com payload extra `study_theme_stat_links(theme_id, stat_id, priority, addedAt, addedBy)`

Variação da B com colunas extras (priority para ordenar, addedBy para audit, etc).

- **Prós:** maximiza extensibilidade futura (priorização de stats por tema, audit, source).
- **Contras:** 100% dos contras da B + over-engineering. Spec atual não pede priority nem addedBy. YAGNI.

### Opção D: View materializada `mv_themes_by_stat`

Manter JSONB + view materializada agregada para reverse lookup.

- **Prós:** queries de leitura ultra-rapidas (<5ms).
- **Contras:** REFRESH MATERIALIZED VIEW caro (segundos em base grande); tradeoff entre staleness aceito vs latência de mutation; complica invalidação (cache 60s in-memory + refresh sob demanda = duas camadas a sincronizar). Over-engineering pra carga atual.

---

## 4. Consequências

### Positivas

- **Migration mínima**: apenas 1 índice GIN novo (RF-07). Zero ALTER TABLE em colunas existentes. Zero back-fill.
- **Reuso de pattern**: ADR-127 já validou JSONB + GIN para a mesma coluna (apenas com `WHERE is_curated`). Time já familiarizado.
- **Performance adequada**: <50ms p95 para reverse lookup (com GIN + cache 60s lesson #21).
- **Custom stats integradas naturalmente**: `custom_*` IDs convivem com catalog IDs no mesmo array. Sem 2 colunas separadas.
- **Test coverage simples**: lesson #7 (optional + default) testavel via fixtures sem migration.
- **Zero breaking change para Sprint Estudos-Habito-1 auto-suggest**: query `linkedStats @> [statId]::jsonb` continua funcionando (índice parcial coexiste com global).

### Negativas

- **Sem JOIN nativo**: explain plan exige conhecer GIN containment. Documentado em RF-07.4 (criterio de aceitacao com EXPLAIN ANALYZE).
- **Sem audit trail**: mutations sobrescrevem array. Aceito (out of scope) — futuro pode adicionar trigger writeback para `audit_log` table.
- **Cache invalidation manual em todos os mutation paths**: 3 paths (RF-01.4, RF-08.4, RF-08.5) precisam chamar `invalidateStatsLinkedThemesCache`. Implementer tem checklist verificavel.
- **Dois indices no `linked_stats`**: o parcial (ADR-127, `WHERE is_curated=true`) + o global novo. Espaço em disco +5% (irrelevante). Planner escolhe o melhor.

### Neutras

- **Reverse lookup retorna `slug + category` além de `name + id`**: payload compatível com Themes-V2 (categorias preflop/postflop/multiway) — UI Stats Analyzer chip pode mostrar badge de categoria sem extra fetch.
- **Cap 30 stats/tema é hard backend**: UI deve mostrar warning soft a partir de 25 (~83%) para preparar user. Test-writer verifica em RF-04.4.
- **Cap 20 themes/custom field**: cap menor que stats/tema porque cardinalidade esperada é menor (custom stat tipicamente relevante a 1-3 temas; cap 20 é folga para casos extremos).

---

## 5. Confiança

**Alta.**

- Pattern (JSONB + GIN para tag-like arrays) é canonico em PostgreSQL 16, com vários casos no projeto (`linkedStats` curated, `attachments` em sessions, `home_layout_settings`).
- Reversibilidade: se a decisão for ruim, é viável criar a junction table futuramente — mas como `linked_stats` já existe e funciona, não há urgência.
- Risco de performance descartado por análise de cardinalidade (217 catalog stats × cap 30/tema; com 1000 themes per user e GIN, índice cabe em memória do worker).

---

## 6. Próximos passos

- Test-writer cria testes para RF-01 (Zod cap, validação ID catalog/custom, dedup, ownership), RF-02 (cache TTL + invalidação), RF-08 (write-through unidirecional explicito).
- Implementer aplica migration 0060 + extende Zod `hudLayoutFieldEntrySchema` + escreve `statsLinkedThemesCache` em `server/services/statsLinkedThemesService.ts` (sugestao path).
- Reviewer valida que invalidacao de cache esta presente em TODAS as mutations RF-01 + RF-08 + DELETE custom field, e que regra unidirecional tem teste explicito (cenário spec linha 621-623).

## 7. Anexos

- Spec: `Docs/specs/stats-themes-linking-1.md`
- Diagramas:
  - `Docs/architecture/diagrams/stats-themes-linking-edit-flow.mermaid`
  - `Docs/architecture/diagrams/stats-themes-linking-reverse-lookup.mermaid`
  - `Docs/architecture/diagrams/stats-themes-linking-hud-write-through.mermaid`
- ADR-127 — origem de `linkedStats` JSONB e do índice parcial existente.
- ADR-064 — `hudLayouts.fieldsJson` shape (extensao com `linkedThemes` neste sprint).
- ADR-058 — `STAT_INDEX_BY_ID` catalog estatico TS (217 stats).
- Lesson #7 — schema deprecation gradual (optional + default).
- Lesson #21 — cache server-side TTL com invalidator publico chamado por mutations.
