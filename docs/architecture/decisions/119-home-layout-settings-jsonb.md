# ADR-119 — Home customization persistida em JSONB unico (`users.home_layout_settings`)

- Status: Aceito
- Data: 2026-05-04
- Sprint: home-reform-5 (Item 11 — engrenagem habilita/desabilita sessoes da Home; absorve flag funcional do Item 8)
- Decision owner: system-architect / implementer
- Related: ADR-099 (cockpit Home), ADR-107 (home zoning), ADR-118 (Estudos como zona)
- Spec: `Docs/specs/home-reform-5.md` Itens 8 + 11
- Migration: `migrations/0047_home_layout_settings.sql`
- Tipo compartilhado: `shared/types/homeSettings.ts`

---

## 1. Contexto

Founder pediu controle de visibilidade dos cards/sessoes da Home (engrenagem) + uma flag funcional (`performanceFromGrind`) que reroutea o card "Sessoes Registradas" entre `session_tournaments` (default) e `tournaments WHERE grind_session_id IS NULL` (futuro toggle).

Spec original do Item 8 dizia: "Schema: adicionar coluna em `users` ou tabela `user_home_settings` (a decidir, ver item 11)". Item 11 absorveu a decisao para evitar reshape duplo.

## 2. Decisao

**Persistir customization da Home em coluna JSONB unica `users.home_layout_settings`.**

### 2.1. Shape

Definido em `shared/types/homeSettings.ts`:

```ts
type HomeLayoutSettings = {
  visibility: {
    headerStrip: boolean;        // strip Banca/Hoje/ROI/Pendencias
    coach: boolean;              // zona Hoje (TodayCard + NextTournamentCountdown)
    immediateAction: boolean;    // ImmediateAction + PendingHandsList + CoachRecommendationCard
    gradeToday: boolean;         // GradeTodayCard
    sessionsRegistered: boolean; // SessionsRegisteredCard + SessionsMonth + RecentSessions
    dashboard: boolean;          // DashboardAllTimeCard + AllTimeEvolutionChart
    performance: boolean;        // PerformanceMini + StatsTopDeltas + VarianceCard
    studies: boolean;            // FocusStatsCard
    news: boolean;               // NewsFeed
  };
  performanceFromGrind: boolean; // default true
};
```

### 2.2. Defaults em runtime

Coluna pode ser `NULL`. `resolveHomeLayoutSettings(stored)` em `server/services/homeSettings.ts` aplica defaults (todos toggles ON, `performanceFromGrind=true`) quando a coluna nao tem valor ou ele esta corrompido. Evita back-fill caro de 1 row por user.

### 2.3. Endpoints

- `GET /api/home/settings` — retorna o objeto resolvido (sempre shape completo).
- `PATCH /api/home/settings` — valida via Zod `.strict()` (rejeita chave desconhecida), faz merge shallow no nivel `visibility` + sobrescreve `performanceFromGrind` quando presente. Persiste resultado completo (fica idempotente em re-leitura).

PATCH invalida cache `/api/home/overview` (`clearHomeOverviewCache(userId)`) para que o re-render reflita a flag imediatamente.

## 3. Alternativas consideradas

### A. Tabela dedicada `user_home_settings`

Pro: nome semantico, permite indices/triggers em campos individuais.
Contra: 1 row por user x 1 row x 0 joins. Tabela 1:1 vira pro-forma. Migrations futuras (adicionar/remover toggle) precisam ALTER TABLE em vez de simples mudanca de shape JSONB.

### B. Coluna por toggle em `users`

Pro: tipos garantidos.
Contra: 9 toggles + 1 flag = 10 colunas. Cada nova zona da Home (item futuro) exige ALTER. JSONB elimina overhead.

### C. Hibrido (`users.home_settings_v` jsonb + colunas para flags criticas)

Pro: queries SQL diretas em flags hot-path.
Contra: nenhum dos campos atuais eh hot-path. Otimizacao prematura.

**Escolhido (B na origem, A na decisao final): JSONB unico.** Single read no payload do `/api/home/settings`, defaults aplicados em runtime, evolucao do shape sem migration.

## 4. Consequencias

### Positivas

- **Zero migration** ao adicionar/remover toggle. So edita `shared/types/homeSettings.ts` + componente.
- **Defaults centralizados** (`DEFAULT_HOME_LAYOUT_SETTINGS`). Frontend usa o mesmo arquivo (alias `@shared/types/homeSettings`).
- **Validacao strict** rejeita chave desconhecida — protege contra typos do client.
- **Cache invalidation barata**: PATCH chama `clearHomeOverviewCache(userId)` (TTL 30s vai pular).

### Riscos / mitigacoes

- **JSONB nao tem schema enforcement no DB.** Mitigado pelo Zod no PATCH + `resolveHomeLayoutSettings` defensivo no GET.
- **Row update reescreve coluna inteira.** Nao eh problema com 9 toggles + 1 flag (~200 bytes JSONB); merge feito no service.
- **Concorrencia (2 abas patcheando simultaneamente):** ultima escrita ganha. Engrenagem eh single-user low-frequency, sem conflict realistico — sem optimistic locking.

## 5. Implementacao

### 5.1. Files

- `shared/types/homeSettings.ts` — shape + defaults + labels PT-BR.
- `server/services/homeSettings.ts` — resolve/merge/parse (Zod strict).
- `server/routes/home-settings.ts` — handlers GET/PATCH.
- `server/storage.ts` — `getHomeLayoutSettings(userId)` + `setHomeLayoutSettings(userId, settings)`.
- `client/src/components/home/HomeSettingsGear.tsx` — engrenagem header Home.
- `client/src/components/home/HomeHeader.tsx` — wire engrenagem ao final da linha.
- `client/src/pages/Home.tsx` — useQuery `/api/home/settings` + render condicional zonas.

### 5.2. Migration `0047_home_layout_settings.sql`

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS home_layout_settings jsonb;
```

Idempotente. Coluna `NULL` -> defaults aplicados em runtime. Sem back-fill.

### 5.3. Tests (TDD obrigatorio item 11)

- `tests/services/homeSettings.test.ts` — 16 casos (resolve/merge/parse/Zod errors).
- `tests/integration/home/home-settings.test.ts` — 10 casos (GET/PATCH 401/400/200/500 + cache invalidation).
- `client/src/components/home/__tests__/HomeSettingsGear.test.tsx` — 3 casos (botao + painel 9 toggles + PATCH diff).

**Total: 29/29 verde**, +0 regressao home (5 fails pre-existentes News-3 sprint mantidos sem alteracao).

## 6. Item 8 absorvido

`performanceFromGrind: boolean` faz parte do mesmo `HomeLayoutSettings`. Quando UI futura ou backend rotear `SessionsRegisteredCard` baseado nessa flag, basta ler `settings.performanceFromGrind` no route handler `/api/home/overview` antes de invocar `getSessionsRegisteredSummary` (default ja esta correto: usa /grind = `performanceFromGrind=true`). Sem migration extra necessaria.
