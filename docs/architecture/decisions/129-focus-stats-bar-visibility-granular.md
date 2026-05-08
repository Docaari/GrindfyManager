# ADR-129 — FocusStatsBar visibility granular per-placement em homeLayoutSettings

- Status: Aprovado
- Data: 2026-05-08
- Sprint: estudos-habito-1
- Decision owner: system-architect
- Related: spec `Docs/specs/estudos-habito-1.md` §RF-4, ADR-119 (homeLayoutSettings JSONB), ADR-118 (FocusStatsCard zona Estudos)

---

## 1. Contexto

Sprint home-reform-5 Item 11 (ADR-119) entregou `users.home_layout_settings` JSONB com 9 toggles + flags. Shape em `shared/types/homeSettings.ts` inclui `showFocusStatsBar: boolean` (single toggle global).

A spec RF-4 da Sprint Estudos-Habito-1 quer:
- `<FocusStatsBar />` instalada em **3-5 paginas** do produto (`/grind-live`, `/coach`, `/estudos`, e tecnicamente `/home` + `/stats-analyzer` mas estes ja usam variantes especializadas).
- User pode desligar **per-placement** (ex: "quero ver no /grind-live mas nao no /coach").
- Toggle "Esconder em todo lugar" como atalho que seta tudo `false`.

Founder pediu granularidade explicita. Single boolean nao acomoda essa UX.

---

## 2. Decisao

**Estender `homeLayoutSettings` shape com objeto `focusStatsVisibility: { home, grindLive, coach, estudos, statsAnalyzer }`. Migrar `showFocusStatsBar` legado para `focusStatsVisibility.home`. Sem migration SQL — back-fill lazy via storage layer ao GET/PATCH.**

### 2.1 Shape novo

```ts
// shared/types/homeSettings.ts (extensao)
export interface FocusStatsVisibility {
  home: boolean;          // default true (replaces showFocusStatsBar)
  grindLive: boolean;     // default true
  coach: boolean;         // default true
  estudos: boolean;       // default true
  statsAnalyzer: boolean; // default true
}

export interface HomeLayoutSettings {
  // ... 9 toggles existentes (RF-11 home-reform-5)
  showFocusStatsBar?: boolean;          // DEPRECATED — kept for back-compat read
  focusStatsVisibility?: FocusStatsVisibility;  // NOVO
  // ...
}
```

### 2.2 Migration lazy via storage

`storage.getHomeLayoutSettings(userId)` faz back-fill:

```ts
async function getHomeLayoutSettings(userId: string): Promise<HomeLayoutSettings> {
  const raw = await db.select({ s: users.homeLayoutSettings })
    .from(users).where(eq(users.userPlatformId, userId)).then(r => r[0]?.s ?? {});

  const settings = raw as Partial<HomeLayoutSettings>;

  // Lazy migration: showFocusStatsBar legado → focusStatsVisibility
  if (!settings.focusStatsVisibility) {
    const legacyValue = settings.showFocusStatsBar ?? true;
    settings.focusStatsVisibility = {
      home: legacyValue,
      grindLive: legacyValue,
      coach: legacyValue,
      estudos: legacyValue,
      statsAnalyzer: legacyValue,
    };
  } else {
    // Defaults para campos novos se shape parcialmente populado
    settings.focusStatsVisibility = {
      home: settings.focusStatsVisibility.home ?? true,
      grindLive: settings.focusStatsVisibility.grindLive ?? true,
      coach: settings.focusStatsVisibility.coach ?? true,
      estudos: settings.focusStatsVisibility.estudos ?? true,
      statsAnalyzer: settings.focusStatsVisibility.statsAnalyzer ?? true,
    };
  }

  return settings as HomeLayoutSettings;
}
```

### 2.3 PATCH endpoint

`PATCH /api/users/me/home-layout-settings` aceita:

```ts
const homeLayoutSettingsPatchSchema = z.object({
  // ... outros campos existentes
  focusStatsVisibility: z.object({
    home: z.boolean().optional(),
    grindLive: z.boolean().optional(),
    coach: z.boolean().optional(),
    estudos: z.boolean().optional(),
    statsAnalyzer: z.boolean().optional(),
  }).optional(),
}).strict();
```

Storage faz merge (deep merge para nested objects):

```ts
async function updateHomeLayoutSettings(userId: string, patch: Partial<HomeLayoutSettings>) {
  const current = await getHomeLayoutSettings(userId);
  const merged = {
    ...current,
    ...patch,
    focusStatsVisibility: {
      ...current.focusStatsVisibility,
      ...(patch.focusStatsVisibility ?? {}),
    },
  };
  await db.update(users)
    .set({ homeLayoutSettings: merged })
    .where(eq(users.userPlatformId, userId));
  return merged;
}
```

### 2.4 Componente `<FocusStatsBar />` consume

```tsx
function FocusStatsBar({ placement }: { placement: 'home' | 'grindLive' | 'coach' | 'estudos' | 'statsAnalyzer' }) {
  const { data: settings } = useQuery(['home-layout-settings'], fetchHomeLayoutSettings);
  const { data: focus } = useFocusStatsBar(placement);  // ja chama /api/home/focus-stats?month=YYYY-MM

  if (settings?.focusStatsVisibility?.[placement] === false) return null;
  if (!focus) return null;
  return <Bar items={focus.items} placement={placement} />;
}
```

### 2.5 UI Settings page

`/settings/home` mostra 4 toggles (excluindo `home` que continua governado por `showFocusStatsBar` via lazy mirror):

| Toggle | Default | Description |
|---|---|---|
| `focusStatsVisibility.grindLive` | true | "Mostrar foco no Grind Live" |
| `focusStatsVisibility.coach` | true | "Mostrar foco no Coach" |
| `focusStatsVisibility.estudos` | true | "Mostrar foco em Estudos" |
| `focusStatsVisibility.statsAnalyzer` | true | "Mostrar foco no Stats Analyzer" |

(Nota: `home` toggle ja existe via `showFocusStatsBar` — a flag legada se mantem como mirror — e `statsAnalyzer` placement na realidade NAO renderiza o `<FocusStatsBar />` no MVP porque a pagina ja tem `<FocusStatsHeader />` da RF-3. Mantemos a chave no shape para futuro.)

Botao "Esconder em todo lugar" → seta todos `false` em uma chamada PATCH:

```ts
await updateHomeLayoutSettings(userId, {
  focusStatsVisibility: {
    home: false, grindLive: false, coach: false, estudos: false, statsAnalyzer: false,
  },
});
```

---

## 3. Opcoes Consideradas

### Opcao A: Single boolean global (`showFocusStatsBar`)

- **Pros:** ja existe; zero migration.
- **Cons:** spec RF-4 exige granular; "quero ver no grind-live mas nao no coach" impossivel.

### Opcao B: 5 booleans flat no JSONB (`showFocusStatsBarHome`, `showFocusStatsBarGrindLive`, ...)

- **Pros:** simples; sem nested object.
- **Cons:** poluicao de namespace (5 chaves novas no shape `homeLayoutSettings`); rename eventual eh pior; nested object eh idiomatic para namespace.

### Opcao C (escolhida): Nested object `focusStatsVisibility` em homeLayoutSettings

- **Pros:** granular; namespace agrupado; deep merge logico; espaco para extensao futura (placement novo = chave nova sem migration).
- **Cons:** lazy back-fill exige codigo no storage (custo: 10 LOC). Single source of truth: shape + lazy merge.

### Opcao D: Tabela dedicada `user_focus_stats_visibility` (1 row por placement)

- **Pros:** queryable; audit; rich types.
- **Cons:** over-engineered para 5 booleans; +1 table; +1 endpoint; +1 storage method; +N test fixtures; sem ganho real (nenhum analytics planejado em cima de visibility settings).

---

## 4. Consequencias

**Positivas:**
- User experience granular per-placement.
- Sem migration SQL (lazy via storage layer).
- Back-compat com `showFocusStatsBar` legado preservada (lesson learned #7 deprecation gradual).
- Extensivel — adicionar placement novo = adicionar chave em `FocusStatsVisibility` interface + ler default.

**Negativas:**
- Lazy back-fill adiciona 10-15 LOC no storage layer.
- Settings page ganha 4-5 checkboxes em uma secao "Stats Foco" — UI mais densa.
- `showFocusStatsBar` legado vira "fonte de verdade" apenas para `home` placement. Documentar bem para evitar confusao.

**Neutras:**
- Drizzle types mantem `homeLayoutSettings: jsonb` sem refinar tipo (validacao Zod no boundary). Idiomatic com pattern existente.

---

## 5. Confianca

**Alta.** Padrao "nested object + lazy back-fill" replica ADR-119 (que ja faz isso para 9 toggles globais). Reverso: se granular for over-engineered, basta UI ocultar 3-4 toggles e expor apenas 1 (master) — shape continua flexivel. Lesson learned #7 (deprecation gradual via optional+default) explicitamente referenciada.

---

## 6. Anexos

- Spec: `Docs/specs/estudos-habito-1.md` §RF-4.2
- ADR-119 base: `Docs/architecture/decisions/119-home-layout-settings-jsonb.md`
- Type extension: `shared/types/homeSettings.ts`
