# ADR-138 — Relax `starred_hands.session_id` + `session_tournament_id` para NULLABLE

- Status: Aprovado
- Data: 2026-05-08
- Sprint: spot-anki-reentry-3 (RF-2.3 cron drill spots orfaos)
- Decision owner: system-architect
- Related: spec `Docs/specs/spot-anki-reentry-3.md` §RF-2.3 + §Riscos R6, ADR-057 (`starred_hands` infra), ADR-126 (`study_sessions_v2`)
- Diagramas: `Docs/architecture/data-model-spot-anki-reentry-3.mermaid`

---

## 1. Contexto

`starred_hands` (criado em Sprint Cooldown-1, estendido em Sprint Spot-Screenshots ADR-057) modela spots criticos capturados durante:

1. Cool-down (Sprint Cooldown-1 — `captured_during='cooldown'`).
2. /grind-live paste (Sprint Spot-Screenshots — `captured_during='grind-live'`).

Schema atual (`shared/schema.ts:3277-3320`):

```ts
sessionId: varchar("session_id").notNull()
  .references(() => grindSessions.id, { onDelete: "cascade" }),
sessionTournamentId: varchar("session_tournament_id").notNull()
  .references(() => sessionTournaments.id, { onDelete: "cascade" }),
```

Ambas FKs sao **NOT NULL** porque toda criacao historica vem de `grind_sessions` (sessao real com tournaments).

**Problema Sprint 3:** Cron `materializeDrillDifficultSpotsCron` (RF-2.3) precisa criar `starred_hands` orfaos a partir de `study_sessions_v2.difficult_spots` (drill GTO, **sem grind session associada**). Drill GTO e atividade de estudo, nao tournament real — nunca teve `session_id`.

Spec propos relaxar para NULLABLE (opcao A). Alternativa explorada: tabela separada `drill_spots` (opcao B).

### Opcoes consideradas

#### Opcao A: Relax FKs para NULLABLE em `starred_hands` (ESCOLHIDO)

Drop NOT NULL em `session_id` + `session_tournament_id`. CASCADE on delete continua. Drill spots tem session_id=NULL.

- **Pros:** menos invasivo. Reusa toda infra existente: PATCH endpoints, paste flow, `SpotsView`, `SpotInsightDialog` (Sprint 3 RF-1), filtros (`?withInsight`, `?tag`). Reentry cards apontam para 1 tabela apenas.
- **Contras:** queries existentes que assumiam NOT NULL podem quebrar (grep audit obrigatorio em `storage.ts`). Defesa em profundidade exige WHERE filters em queries que ainda pressupoem session — maioria pega via JOIN naturalmente.

#### Opcao B: Tabela separada `drill_spots`

Nova tabela com mesma forma de `starred_hands` mas sem FK obrigatoria session.

- **Pros:** isolation. NOT NULL preservado em `starred_hands`.
- **Contras:** **duplicacao de codigo**. PATCH endpoints duplicados, SpotsView duplicado, `SpotInsightDialog` duplicado, reentry cards apontariam para 2 tabelas (UNION queries). Alto custo de manutencao. ADR-057 storage abstraction tambem teria que duplicar.

#### Opcao C: Synthetic "drill" `grind_session` + `session_tournament`

Cron cria fake grind_session com flag `is_synthetic=true` para satisfazer FK.

- **Pros:** zero schema change.
- **Contras:** poluir `grind_sessions` com rows fakes contaminando dashboards/analytics. Filtros `WHERE is_synthetic=false` espalhados pela base. Pior dos mundos.

---

## 2. Decisao

**Opcao A: Relax FKs para NULLABLE.**

### 2.1 Schema delta

```sql
ALTER TABLE starred_hands
  ALTER COLUMN session_id DROP NOT NULL,
  ALTER COLUMN session_tournament_id DROP NOT NULL;
```

CASCADE on delete continua (rows com NULL nao serao afetados por DELETE de session).

Drizzle:

```ts
sessionId: varchar("session_id")
  .references(() => grindSessions.id, { onDelete: "cascade" }),
  // sem .notNull() — drill spots permitidos sem sessao
sessionTournamentId: varchar("session_tournament_id")
  .references(() => sessionTournaments.id, { onDelete: "cascade" }),
```

### 2.2 Audit obrigatorio (R6 mitigation)

**Pre-merge implementer DEVE rodar** (lessons learned #19 path-confirm):

```bash
grep -rn "starredHands.sessionId" server/storage.ts server/routes/
grep -rn "starred_hands.session_id" server/ migrations/
grep -rn "starredHands\.\.session" server/coach*/
```

Cada match deve cair em UMA das categorias:

1. **JOIN com `grind_sessions`**: ja filtrado naturalmente por presenca de session.
2. **WHERE session_id = X**: query intencional, drill spots nao apareceriam (correto).
3. **`.where(... session_id IS NOT NULL ...)`**: explicit filter — manter.
4. **Assumes NOT NULL e quebra com NULL**: fix forçado — adicionar filter ou tratar NULL.

Lista de queries a validar (auditoria pre-implementer):

- `getStarredHandsBySession` — ok (filtrar por session_id explicito).
- `getCooldownStarredHands` — ok (cooldown_log_id JOIN).
- `getStarredHandsForCoachContext` — auditar: pode contaminar com drill spots.
- `getSpotImageStats` — auditar: agregacao por session pode quebrar com NULL.
- Endpoint `GET /api/starred-hands` — adicionar filter `?includeDrill=false` (default false para nao quebrar UI atual de spots).

### 2.3 Filtro defensivo no endpoint default

Endpoint `GET /api/starred-hands`:

```
Default: WHERE captured_during IN ('cooldown', 'grind-live') -- drill EXCLUIDO
?includeDrill=true: remove o filtro
```

Isto protege:
- `SpotsView` (Sprint Cooldown/Spot-Screenshots) NAO contamina com drill spots — UX de "spots de sessao" preservada.
- /estudos/reentry queue traz drill spots via JOIN com `spot_reentry_cards` (rota dedicada, sem assumir filtro).

Adicionar coluna `captured_during='drill_gto'` no schema CHECK (delta no migration 0058):

```sql
ALTER TABLE starred_hands
  DROP CONSTRAINT chk_starred_captured_during,
  ADD CONSTRAINT chk_starred_captured_during
    CHECK (captured_during IN ('grind-live', 'cooldown', 'drill_gto'));
```

### 2.4 Cron behavior

Quando criar drill starred_hand:

```ts
INSERT INTO starred_hands (
  id, user_id,
  session_id, session_tournament_id,    -- NULL
  cooldown_log_id,                       -- NULL
  type='drill',                          -- novo type? ou usar 'other'?
  spot='other',
  notes,                                 -- '[hash:<md5>] context: <ctx> | note: <note>'
  source='drill_gto_difficult_spot',
  captured_during='drill_gto',           -- novo enum value
  status='pending',
  pasted_at=NOW()
);
```

**Decisao type='drill' vs 'other':** spec usa 'drill'. Adicionar 'drill' ao enum `type` (atualmente 8 valores: tilt/leak/soulread/hero-call/cooler/mistake/sick/other). Validar em `shared/schema.ts` Zod schema.

---

## 3. Consequencias

### Positivas

- **Reuso total** de infra `starred_hands` para drill — zero code duplication.
- **PATCH endpoint funciona automaticamente** para drill spots: user pode adicionar insight + tags + reentry como qualquer outro spot.
- **`SpotInsightDialog` (Sprint 3 RF-1) zero-effort** para drill spots.
- **Migration trivial**: 2 ALTER COLUMN, sem back-fill (rows existentes ja tem session_id NOT NULL).

### Negativas

- **Audit obrigatorio**: 4-6 queries em `storage.ts` precisam revisao manual. Estimativa: 30-60min implementer.
- **Dual-meaning de `starred_hands`**: tabela agora carrega 3 contextos (cooldown, grind-live, drill_gto). Mais cognitive load para devs — mitigar via doc clara em `data-model-index.md`.
- **`captured_during='drill_gto'` enum** quebra UI de Sprint Spot-Screenshots se nao tratar (ex: `captured_during` mapping label). Audit obrigatorio.

### Neutras

- Type='drill' adicionado ao enum existente — extensao backward-compat (rows antigas continuam validas).
- ON DELETE CASCADE para session_id continua: se grind_session for deletada, drill spots (com session_id=NULL) NAO sao afetados (correto comportamento — drill orfaos).

---

## 4. Risco residual

- **Query oculta em coach context** que junta starred_hands com session sem JOIN explicito → drill spots aparecem em contexto Coach errado. **Mitigacao:** audit + filter `WHERE captured_during != 'drill_gto'` em queries de session-specific Coach context.
- **API consumer externo** (mobile futuro?) que pressupoe `session_id` NOT NULL → 4xx ao receber NULL. **Mitigacao:** defer (sem mobile MVP).

---

## 5. Confianca

**Media-Alta.** Schema change e baixo risco (NULLABLE relaxa, nao quebra constraint). Audit em 4-6 queries e tractable em 1h. Defer paths futuros (mobile API) nao afetam decisao MVP.
