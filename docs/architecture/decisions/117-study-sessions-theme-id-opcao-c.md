# ADR-117 — `study_sessions.theme_id`: Opcao C aprovada (nullable + sem back-fill + accountability futura)

- Status: Aceito
- Data: 2026-05-03
- Sprint: home-reform-4 (Item 7 — Focus Stats)
- Decision owner: system-architect (formaliza decisao founder Opcao C aprovada — RF-08 spec)
- Related: ADR-067 (Studies-Reform IA), ADR-068 (cross-feature recommendations), ADR-116 (`user_focus_stats` schema), ADR-118 (zona "Estudos" Home)
- Spec: `Docs/specs/home-reform-4-item-7-focus-stats.md` §RF-02 §8, §RF-08, §Riscos

---

## 1. Contexto

### 1.1. Diagnostico

O card `FocusStatsCard` na Home precisa exibir, para cada uma das 3 stats foco do mes:

- Tema de estudo linkado.
- **Tempo de estudo dedicado ao tema no mes corrente** (`studyMinutesMonth`).

A pergunta tecnica eh: **como derivar `studyMinutesMonth` por tema?**

A tabela `study_sessions` hoje tem:

```ts
export const studySessions = pgTable("study_sessions", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(...),
  studyCardId: varchar("study_card_id"),  // FK soft → study_cards.id
  date: timestamp("date").notNull(),
  duration: integer("duration").notNull(), // minutos
  ...
});
```

Nao existe coluna `theme_id`. Nao existe FK formal `study_cards.theme_id` (cards e temas hoje sao independentes; agrupamento eh ad-hoc via `study_themes` que aponta para emojis/cores apenas).

Para somar `study_sessions.duration` por tema no mes, precisamos de **alguma forma de associar a sessao a um tema**.

### 1.2. Forcas em jogo

- **MVP imediato:** Sprint Item 7 nao pode bloquear esperando refactor de `study_cards`/`study_themes`. Solucao precisa ser entregavel em 1 sprint.
- **Compatibilidade retroativa:** sessoes antigas (`study_sessions` ja populadas) nao tem `theme_id`. Back-fill seria caro e arbitrario (sem signal para inferir tema).
- **Accountability futura:** founder explicitamente quer expandir essa coluna em features futuras (recommendations engine, leak focus enrichment, dashboards de "tempo investido por tema").
- **Risco de divergencia silenciosa:** se `theme_id` for opcional e front nao popular, card vai sempre mostrar `0min` — confusing UX. Spec contempla degradacao explicita (badge "comece agora").
- **Footprint DB:** ADD COLUMN nullable em tabela existente eh barato (sem rewrite, sem lock longo).

---

## 2. Decisao

**Opcao C aprovada pelo founder:** adicionar coluna `theme_id` em `study_sessions` como `nullable` + FK `ON DELETE SET NULL` + **sem back-fill historico**.

### 2.1. Migration

Arquivo: `migrations/0044_study_sessions_theme_id.sql`

```sql
-- 0044_study_sessions_theme_id.sql
-- Sprint: home-reform-4 Item 7 — Focus Stats accountability
-- ADR-117

ALTER TABLE study_sessions
    ADD COLUMN IF NOT EXISTS theme_id VARCHAR(21)
        REFERENCES study_themes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_study_sessions_user_theme_date
    ON study_sessions (user_id, theme_id, date)
    WHERE theme_id IS NOT NULL;
```

**Observacoes:**

- **Sem back-fill UPDATE.** Sessoes pre-existentes ficam com `theme_id = NULL`. Card calcula `studyMinutesMonth` somando apenas rows com `theme_id = ?` — sessoes antigas nao contribuem. UX accept: empty/"comece agora" se sessoes do tema nao foram criadas no novo formato.
- **`ON DELETE SET NULL`** (NAO CASCADE): deletar tema NAO apaga sessoes (preserva tempo investido como audit). Apenas zera o `theme_id`. Sessoes "orfas" continuam aparecendo em totais por user, apenas perdem a categorizacao por tema.
- **Indice parcial** `WHERE theme_id IS NOT NULL`: query agregadora `SELECT SUM(duration) WHERE user_id=? AND theme_id=? AND date BETWEEN ?..?` usa esse indice. Sem o partial, indice cobriria milhares de rows nullable desperdicando espaco.
- **`varchar(21)`**: alinhado com `study_themes.id` (nanoid 21).

### 2.2. Drizzle schema (em `shared/schema.ts`)

Atualizar `studySessions` table:

```ts
export const studySessions = pgTable("study_sessions", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  studyCardId: varchar("study_card_id"),
  themeId: varchar("theme_id", { length: 21 })
    .references(() => studyThemes.id, { onDelete: "set null" }),  // <-- NEW
  date: timestamp("date").notNull(),
  duration: integer("duration").notNull(),
  activities: jsonb("activities").$type<string[]>().default([]),
  focusScore: integer("focus_score"),
  productivityScore: integer("productivity_score"),
  insights: text("insights"),
  createdAt: timestamp("created_at").defaultNow(),
});
```

Atualizar `studySessionsRelations`:

```ts
export const studySessionsRelations = relations(studySessions, ({ one }) => ({
  user: one(users, {
    fields: [studySessions.userId],
    references: [users.userPlatformId],
  }),
  studyCard: one(studyCards, {
    fields: [studySessions.studyCardId],
    references: [studyCards.id],
  }),
  theme: one(studyThemes, {                       // <-- NEW
    fields: [studySessions.themeId],
    references: [studyThemes.id],
  }),
}));
```

Atualizar `insertStudySessionSchema` (Zod): `themeId` ja vira opcional naturalmente via `createInsertSchema`. Reforcar com `.optional()` para clarity.

```ts
export const insertStudySessionSchema = createInsertSchema(studySessions, {
  themeId: z.string().length(21).optional().nullable(),
}).omit({ id: true, createdAt: true });
```

### 2.3. Query `studyMinutesMonth` em `storage.ts`

```ts
async getStudyMinutesByThemeMonth(
  userId: string,
  themeId: string,
  monthStart: Date,
  monthEnd: Date
): Promise<number> {
  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(${studySessions.duration}), 0)` })
    .from(studySessions)
    .where(
      and(
        eq(studySessions.userId, userId),
        eq(studySessions.themeId, themeId),
        gte(studySessions.date, monthStart),
        lt(studySessions.date, monthEnd),
      ),
    );
  return Number(result[0]?.total ?? 0);
}
```

Resposta `0` se nenhuma sessao matcheia. Spec aceita `0min` como estado valido (UI mostra "0min — comece agora").

### 2.4. Wiring no `StudySessionTimer` (frontend)

**MVP:** quando user inicia sessao a partir do `FocusStatsCard` "Estudar agora", navega para `/estudos/temas/:id`. Tela do tema deve passar `themeId` para `StudySessionTimer` ao iniciar timer. Ao finalizar, POST `/api/study-sessions` com body `{ ..., themeId }`.

**Caminho explicito:**

1. Click "Estudar agora" no `FocusStatsCard` → `<Link href="/estudos/temas/${theme.id}">` (Wouter).
2. Tela `/estudos/temas/:id` (componente existente) carrega tema e mostra botao "Iniciar sessao de estudo".
3. Botao instancia `<StudySessionTimer themeId={theme.id} />` (prop adicional).
4. Ao parar, POST com `themeId` setado.

**Trade-off MVP:** se mexer em `StudySessionTimer` for muito invasivo, **Item 7 entrega com `studyMinutesMonth = 0` para todos os temas inicialmente**, e abre issue de follow-up "wire StudySessionTimer ao themeId". Spec §RF-08 aceita explicitamente esse trade-off:

> "Decisao opcional para MVP: se mexer em StudySessionTimer.tsx for muito grande, pode-se entregar Item 7 com studyMinutesMonth = 0 sempre, e abrir issue de follow-up 'wire StudySessionTimer ao themeId'."

**Recomendacao do architect:** wire imediato (eh ~1h de trabalho — adicionar 1 prop opcional + passar no payload). Sem wire, feature fica obviamente quebrada na primeira sessao do user pos-marcacao.

### 2.5. Sem migracao retroativa de `study_cards.theme_id`

Spec considerou alternativa: criar `study_cards.theme_id` (FK em `study_themes`) e derivar `study_sessions.theme_id` via JOIN com `study_cards`. **Rejeitada** porque:

- `study_cards` hoje **nao tem associacao formal com `study_themes`**. Adicionar FK exigiria tomada de decisao "qual card pertence a qual tema" — caso ambiguo (1 card pode ter sentido em N temas).
- Quebra principio de menor cirurgia: muda 2 tabelas para resolver 1 feature.
- Confunde semantica: tema agrupa sessoes (atividade), nao cards (material). Card pode ser referenciado por sessoes de varios temas distintos.

A coluna `theme_id` em `study_sessions` eh **categorizacao da atividade**, nao do material consumido.

### 2.6. Backwards compatibility

- Endpoints existentes que CRIAM `study_sessions` continuam funcionando sem mudanca (campo opcional). Default `theme_id = NULL` em todas as inserts pre-existentes.
- Endpoints que LEEM `study_sessions` continuam funcionando — campo extra ignorado pelo client.
- Apenas o novo fluxo (`POST` a partir do `FocusStatsCard` flow → `/estudos/temas/:id` → timer) seta `theme_id`.

---

## 3. Opcoes Consideradas

### 3.1. Opcao A — Heuristica de divisao igual entre themes ativos
- `studyMinutesMonth = SUM(duration_user_mes) / count(focus_stats_ativas)`.
- **Pros:** zero mudanca em `study_sessions`. Sem migration.
- **Contras:**
  - Numero **fake**. Se user tem 60min total no mes e 3 focus stats, cada uma mostra "20min" mesmo se user nao estudou nada relacionado ao tema.
  - Quebra trust: badge "estimado" nao convence.
  - Impossivel evoluir para reporting confiavel.
- **Rejeitada** mesmo como fallback. Falsa precisao eh pior que zero.

### 3.2. Opcao B — Adicionar `theme_id` em `study_sessions` + back-fill via inferencia
- Migration adiciona coluna + tenta inferir tema das sessoes antigas via heuristica (ex: matchear `study_card.title` com `study_theme.name`).
- **Pros:** historico ganha categorizacao retroativa.
- **Contras:**
  - Heuristica de matching eh fragil (1-N possiveis matches por sessao).
  - Risco alto de mis-categorizacao silenciosa (user ve "60min em ICM" quando estudou Push/Fold).
  - Custo de validacao alto (precisa UI de "confirme inferencia" ou simplesmente aceita inferencia fraca).
- **Rejeitada.** Risco > beneficio.

### 3.3. Opcao C — Adicionar `theme_id` nullable, sem back-fill (ESCOLHIDA)
- Detalhada em §2. **Aprovada pelo founder.**

### 3.4. Opcao D — Coluna calculada via JOIN com `study_cards.theme_id`
- Exige criar `study_cards.theme_id` primeiro.
- **Rejeitada** — ver §2.5.

### 3.5. Opcao E — Tabela junction `study_session_themes` (N:N sessao ↔ tema)
- 1 sessao pode contar para multiplos temas.
- **Pros:** flexibilidade max.
- **Contras:** overengineered MVP. Quase 100% das sessoes terao 1 tema. Junction adiciona JOIN + complexity sem ganho.
- **Rejeitada.** Pode evoluir no futuro se demanda real aparecer.

---

## 4. Consequencias

### 4.1. Positivas

- **Migration trivial**: ADD COLUMN nullable, sem lock longo, sem back-fill.
- **Truthful data**: sessoes novas categorizam corretamente; sessoes antigas honestamente sem categorizacao.
- **Indice parcial** otimiza queries agregadoras.
- **CASCADE-safe**: SET NULL preserva audit trail de duracao mesmo se tema deletado.
- **Acoplamento minimo**: `studySessions` ganha 1 ref opcional, sem refactor.

### 4.2. Negativas

- **`studyMinutesMonth = 0` na primeira sessao** apos marcar focus stat (ate user iniciar sessao via `/estudos/temas/:id` no novo flow). Spec contempla (UX: "0min — comece agora").
- **Sessoes pre-Item 7** nunca contribuem para `studyMinutesMonth` (ate ressessar manualmente — fora de escopo). Aceitavel: feature foca em **futuro**, nao retro-relatorio.
- **Wiring obrigatorio** em `StudySessionTimer`: nao basta migration, frontend precisa setar `themeId` para feature funcionar.
- **Indice extra** em `study_sessions`: leve impacto de write (insert/update propaga). Footprint pequeno graças ao partial WHERE.

### 4.3. Neutras

- **Tabela `study_cards`** permanece intocada. Decisao isolada.
- **Cooldown classico** continua criando `study_sessions` sem `theme_id` setado (comportamento legado preservado).
- **Onda futura "tempo por tema agregado"** ja tem base: query simples `GROUP BY theme_id` agora eh barata.

---

## 5. Confianca

**Alta.** Padrao "ADD COLUMN nullable + FK SET NULL + sem back-fill" ja precedido em outras adicoes do projeto (e.g. `tournaments.bagged_at` Sprint Flight-1). Risco principal (UX `0min` inicial) eh expectativa documentada na spec, nao bug.

---

## 6. Notas de Implementacao

- **`StudySessionTimer.tsx`**: adicionar `themeId?: string` na interface de props. Repassar no payload do POST `/api/study-sessions`.
- **Tela `/estudos/temas/:id`**: passar `themeId={params.id}` ao instanciar timer.
- **Storage method**: `getStudyMinutesByThemeMonth` cobre o caso (§2.3).
- **Indice parcial**: garantir migration cria com `WHERE theme_id IS NOT NULL` (PG so usa o partial em queries que matcheiam o predicate).
- **Reviewer checklist:**
  - [ ] Migration 0044 idempotente.
  - [ ] FK SET NULL (NAO CASCADE).
  - [ ] Indice parcial criado.
  - [ ] Drizzle schema atualizado em `shared/schema.ts`.
  - [ ] Relations atualizadas.
  - [ ] `insertStudySessionSchema` aceita `themeId` opcional.
  - [ ] `StudySessionTimer.tsx` recebe e propaga `themeId`.
  - [ ] Tela `/estudos/temas/:id` passa `themeId` ao timer.
  - [ ] `getStudyMinutesByThemeMonth` retorna 0 para tema sem sessoes.
  - [ ] Test integration: deletar tema → `theme_id` vira null nas sessoes (NAO apaga as sessoes).

---

## 7. Referencias

- `Docs/specs/home-reform-4-item-7-focus-stats.md` §RF-02 §8, §RF-08
- ADR-116 — `user_focus_stats` schema
- ADR-118 — Card zona "Estudos" no Home
- ADR-067 — Studies-Reform IA (sub-paths /estudos)
- ADR-068 — Cross-feature recommendations engine
- `shared/schema.ts` linhas 833-844 — `studySessions` table existente
- `migrations/0029_add_tournament_series.sql` — precedente de "ADD COLUMN nullable + FK SET NULL"
