# ADR-056: Onboarding educativo dismiss via `localStorage` vs coluna `users.preferences` JSONB

## Status

Aceito (interim — divida tecnica registrada para sprint futuro)

## Data

2026-04-28

## Contexto

A spec Sprint F4 (`Docs/specs/sprint-f4-primedope-grade-detail.md`, secao B.0 +
RF-16 — Onboarding Educativo) introduz **3 cards educativos dismissiveis** no
`PrimedopePanel` que explicam variance simulation, RoR e ROI vs EV antes do user tocar
no wizard.

Cards renderizam **apenas se** ambas condicoes:
1. User nunca rodou simulacao (`primedope_runs WHERE userId=?` retorna 0 rows).
2. Onboarding nao foi dismissido.

User pode dismissar:
- Cards individuais via X icon (3 cards independentes).
- Bloco inteiro via CTA "Comece sua primeira simulacao" (que tambem scrolla para
  selector + foca dropdown).

Estado dismiss precisa **persistir entre sessoes** (re-login, refresh, etc.) — nao pode
ressurgir cada visita.

### Restricoes

- **Coluna `users.preferences` JSONB nao existe.** Confirmacao via grep em
  `shared/schema.ts` (~1300 linhas): `users` table tem id, userPlatformId, email,
  password, role, status, subscriptionPlan, emailVerified, etc. — mas **nao tem
  `preferences` JSONB**.
- **`user_settings` existe mas tem propósito especifico.** Tabela
  `user_settings` (linha ~890 do schema) tem: `defaultCurrency`, `notificationsEnabled`,
  `exchangeRates` (jsonb FX freezes ADR-033), `bankrollManagementEnabled` (Sprint B2).
  Nao usada para dismiss-flags de UI.
- **Adicionar `users.preferences` ou estender `user_settings`** exige migration nova,
  Drizzle schema update, Zod schema, GET/PATCH endpoint para read/write, e queries em
  `server/storage.ts`. Estimativa: 4-6h de overhead.
- **F4 escopo total ~105h.** Onboarding e 1 dos 26 RFs; dismiss e 1 detalhe dentro do
  RF-16. Adicionar schema + endpoint para dismiss-flag e desproporcional ao escopo.
- **Sync cross-device nao e criterio de aceitacao.** Spec RF-16 nao exige que dismiss em
  device A reflita em device B. Aceitavel re-mostrar onboarding em novo browser/device.
- **Zero custo se usuario limpar `localStorage`.** User que limpa cache ve onboarding
  novamente. Aceitavel para MVP.

### Forcas em jogo

- **Velocidade > completude** em sprint focado em PrimeDope integration. Adiar schema
  para sprint dedicado a user preferences (quando 3+ features pedirem flags persistidas)
  evita scope creep.
- **Reversibilidade alta.** Migrar de `localStorage` → `users.preferences` no futuro:
  apenas ler ambos com prioridade DB > localStorage. Zero perda de UX para users
  existentes.
- **Padrao ja usado no projeto.** `localStorage` ja eh usado para `primedope-panel-expanded`
  (state do panel collapse), `last-grind-session`, etc. Consistencia.
- **Dismiss-flags sao UI state, nao business state.** Um user que limpa browser perde
  tema preference, position de panel collapse, dismiss-flags — esperado.

## Opcoes Consideradas

### Opcao A: `localStorage` keys especificos (ESCOLHIDA)

Keys:
- `primedope_onboarding_dismissed` — master flag (`'1'` ou ausente).
- `primedope_onboarding_dismissed_card_1`, `..._2`, `..._3` — flags individuais.

Logica:
1. Mount `PrimedopePanel`:
   ```ts
   const masterDismissed = localStorage.getItem('primedope_onboarding_dismissed') === '1';
   const card1Dismissed = localStorage.getItem('primedope_onboarding_dismissed_card_1') === '1';
   // ...
   ```
2. Render condicional dos 3 cards baseado em flags individuais.
3. Click X em um card: `localStorage.setItem('primedope_onboarding_dismissed_card_X', '1')`.
4. Quando todos 3 dismissados (ou click no CTA "Comece sua primeira simulacao"):
   ```ts
   localStorage.setItem('primedope_onboarding_dismissed', '1');
   ```
5. Master flag `=== '1'` → cards somem permanente.

Tambem checa server-side (RF-16): `GET /api/primedope/runs?limit=1` — se retorna >= 1
run, user ja rodou simulacao alguma vez, cards somem mesmo sem dismiss explicito.

- **Pros:**
  - **Zero schema delta.** Sem migration, sem coluna nova, sem endpoint.
  - **Zero backend.** Read/write puro client-side.
  - **Padrao do projeto.** Outras flags UI ja usam `localStorage` (panel-expanded).
  - **Performance.** Sync read; sem network roundtrip no mount.
  - **Reversivel.** Migrar para DB no futuro: ler ambos com prioridade DB > localStorage.
  - **MVP-friendly.** Onboarding eh feature low-stakes; perda de dismiss em novo device
    eh aceitavel (user ve cards novamente, click X, segue).
  - **Compatible com lessons learned #12** (estado persistente — `localStorage`
    sobrevive a re-mount/refresh; `useState` local nao).

- **Contras:**
  - **Sem sync cross-device.** User dismissa em desktop, ve onboarding de novo em mobile.
    Aceitavel para MVP.
  - **User que limpa browser/cache perde state.** Aceitavel — mesma classe de UX que
    tema, position de panel, etc.
  - **Sem auditoria.** Nao podemos saber "% de users que dismissaram cada card" sem
    telemetria explicita. Mitigavel via `tracker.emit('primedope_onboarding_dismissed',
    {cardId})` se precisar.
  - **Privacy mode (ex: Safari) limita localStorage.** User em Private Window ve cards
    a cada visita. Aceitavel — Private Window e contexto opt-in.

### Opcao B: Coluna `users.preferences` JSONB nova (full-featured)

Migration:

```sql
ALTER TABLE users
  ADD COLUMN preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX idx_users_preferences_gin ON users USING gin (preferences);
```

Drizzle:

```ts
preferences: jsonb('preferences').notNull().default({}),
```

Endpoints:
```
GET /api/users/me/preferences → { primedopeOnboardingDismissed?, ... }
PATCH /api/users/me/preferences → merge body into preferences JSONB
```

Frontend hook:
```ts
const { data: prefs } = useQuery(['userPreferences'], fetchPreferences);
const mutate = useMutation((updates) => patchPreferences(updates));
mutate({ primedopeOnboardingDismissed: true });
```

- **Pros:**
  - **Sync cross-device** automatica.
  - **Persistencia robusta.** User pode limpar browser, dismiss persiste.
  - **Auditoria via SQL** — fácil contar `% users com primedopeOnboardingDismissed=true`.
  - **Padrao para futuras flags** (ex: dismissed-banners, theme, language, dashboard
    preferences).
  - **GDPR-friendly.** Preferences ficam no DB do user, deleta em cascade ON DELETE.

- **Contras:**
  - **+1 migration + indice.** ~1h.
  - **+2 endpoints (GET, PATCH).** ~2h (rota + storage queries + Zod schema).
  - **+1 hook frontend.** ~1h.
  - **+ tests** (backend + frontend). ~2h.
  - **Total:** ~6h overhead em F4 para 1 flag de onboarding low-stakes.
  - **Schema bloat.** `users.preferences` jsonb pode virar dump-everything sem governança
    — anti-pattern (hash bag).
  - **Race conditions.** PATCH sem optimistic concurrency em multi-tab pode perder
    updates. Aceitavel para flags simples mas anti-pattern em geral.
  - **Rejeitada por: ROI negativo em F4; aceitavel em sprint dedicado a user preferences
    quando 3+ features pedirem.**

### Opcao C: Estender `user_settings` table

Adicionar coluna em `user_settings`:

```sql
ALTER TABLE user_settings
  ADD COLUMN ui_dismiss_flags jsonb NOT NULL DEFAULT '{}'::jsonb;
```

```ts
uiDismissFlags: jsonb('ui_dismiss_flags').notNull().default({}),
```

Acessada via:
```ts
const settings = await storage.getUserSettings(userId);
if (!settings.uiDismissFlags?.primedopeOnboardingDismissed) { /* mostrar cards */ }
```

- **Pros:**
  - Reusa tabela existente (`user_settings`), sem nova tabela.
  - Endpoints `GET/PATCH /api/user-settings` ja existem (verificavel em
    `server/routes/`).

- **Contras:**
  - `user_settings` tem semantica de "configuracoes que afetam comportamento de feature
    (currency, notifications, FX, bankroll mode)" — misturar com "UI dismiss flags"
    polui semantica.
  - Ainda paga: migration, Drizzle update, Zod update, queries.
  - **Rejeitada por: confunde semantica + custo similar a Opcao B sem ganho.**

### Opcao D: Cookies HTTP-only

Server seta cookie `primedope_onboarding_dismissed=1; Max-Age=31536000;` apos dismiss.

- **Pros:**
  - Sync entre tabs do mesmo browser.
  - Server pode ler em SSR (Grindfy nao usa SSR, mas conceitualmente).

- **Contras:**
  - **Cookie privacy regulamentado.** Banner de cookie consent vira mandatorio em UE.
  - **Sem sync cross-device.** Mesmo problema da Opcao A.
  - **Round-trip server.** Set cookie via endpoint dedicado.
  - **Anti-pattern moderno.** SPAs preferem `localStorage` para state UI.
  - **Rejeitada por: complexidade regulatoria + zero ganho vs Opcao A.**

### Opcao E: Apenas server-side check (`primedope_runs WHERE userId=?` count)

Se user ja rodou >= 1 simulacao, onboarding some — sem dismiss explicito necessario.

- **Pros:**
  - Zero state armazenado.
  - Determinístico.

- **Contras:**
  - **User que NAO quer rodar mas quer fechar onboarding nao tem como.** Cards permanecem
    para sempre ate user simular. UX ruim.
  - **Spec RF-16 explicita dismiss individual** dos 3 cards + master.
  - **Rejeitada por: nao atende RF-16.**

## Decisao

**Adotar Opcao A: `localStorage` keys especificos
(`primedope_onboarding_dismissed_card_<n>` + master `primedope_onboarding_dismissed`).
Migracao para `users.preferences` JSONB ou `user_settings` extension eh divida tecnica
registrada, escopo de sprint dedicado a user preferences.**

### Detalhes-chave do design

1. **Keys:**
   - `primedope_onboarding_dismissed` — master (`'1'` quando dismissado totalmente).
   - `primedope_onboarding_dismissed_card_1` — card "O que e variance simulation?".
   - `primedope_onboarding_dismissed_card_2` — card "Como ler RoR (Risk of Ruin)?".
   - `primedope_onboarding_dismissed_card_3` — card "Diferenca ROI vs EV?".
2. **Read no mount:**
   ```ts
   const onboardingDismissed = localStorage.getItem('primedope_onboarding_dismissed') === '1';
   const card1Dismissed = localStorage.getItem('primedope_onboarding_dismissed_card_1') === '1';
   const card2Dismissed = localStorage.getItem('primedope_onboarding_dismissed_card_2') === '1';
   const card3Dismissed = localStorage.getItem('primedope_onboarding_dismissed_card_3') === '1';
   ```
3. **Combinada com server check:**
   ```ts
   const { data: runs } = useQuery(['primedope-runs-count', userId], () =>
     fetch('/api/primedope/runs?limit=1').then(r => r.json())
   );
   const showOnboarding = !onboardingDismissed && (runs?.length ?? 0) === 0;
   ```
4. **Click X em card individual:**
   ```ts
   localStorage.setItem(`primedope_onboarding_dismissed_card_${n}`, '1');
   // se todos 3 dismissados, set master
   if (allCardsDismissed) {
     localStorage.setItem('primedope_onboarding_dismissed', '1');
   }
   ```
5. **Click CTA "Comece sua primeira simulacao":**
   ```ts
   localStorage.setItem('primedope_onboarding_dismissed', '1');
   scrollToSelector();
   focusProfileDropdown();
   ```
6. **Componente owner:** `PrimedopeOnboardingCards.tsx` (Parte E da spec). Reusa
   `useState` para reactive re-render (lendo `localStorage` sync no useState init,
   atualizando via `setState` apos `localStorage.setItem`).

### Migracao futura (sprint dedicado a user preferences)

Quando founder pedir sync cross-device ou >= 3 features tiverem dismiss-flags:

1. **ADR novo** registrando swap.
2. **Migration:**
   ```sql
   ALTER TABLE users ADD COLUMN preferences jsonb NOT NULL DEFAULT '{}'::jsonb;
   ```
3. **Drizzle + Zod** updates em `shared/schema.ts`.
4. **Endpoints:**
   - `GET /api/users/me/preferences` → retorna `users.preferences`.
   - `PATCH /api/users/me/preferences` → merge body em JSONB.
5. **Hook frontend:** `useUserPreferences()` com TanStack Query.
6. **Backfill from localStorage:**
   ```ts
   useEffect(() => {
     const localDismissed = localStorage.getItem('primedope_onboarding_dismissed') === '1';
     const dbDismissed = preferences?.primedopeOnboardingDismissed;
     if (localDismissed && !dbDismissed) {
       mutatePatchPreferences({ primedopeOnboardingDismissed: true });
       localStorage.removeItem('primedope_onboarding_dismissed');
     }
   }, [preferences]);
   ```
7. **Zero perda de UX.** Users existentes que dismissaram localStorage tem state migrado
   para DB no proximo mount.

### Tradeoffs aceitos

| Tradeoff | Aceito por que |
|---|---|
| **Sem sync cross-device** | Aceitavel para feature low-stakes (onboarding educativo). |
| **User que limpa localStorage perde state** | Aceitavel — mesma classe de UX que tema, panel state. |
| **Sem auditoria SQL nativa** | Mitigavel via `tracker.emit` se relevante. |
| **Privacy Window perde state** | Contexto opt-in pelo user; aceitavel. |
| **Migracao futura paga schema + endpoint** | Reversivel; backfill from localStorage zero perda. |

### Quando rever esta decisao

- **Founder pede sync cross-device.** ADR novo registra swap.
- **>= 3 features tem dismiss-flags** (banners pos-update, tutorial intro, etc.):
  centralizar em `users.preferences` faz sentido.
- **Auditoria de adoption** vira critica (CMO quer saber `% users que dismiss
  onboarding`): forca persistencia DB ou telemetria explicita via `tracker.emit`.
- **GDPR compliance review** sinaliza preferences locais como problema (provavel nao —
  localStorage e fora de escopo GDPR strict).

## Consequencias

### Positivas

- **Zero schema delta em F4.** Sem migration, sem endpoint, sem hook backend.
- **Padrao consistente** com outras flags UI do projeto.
- **MVP-friendly.** Onboarding low-stakes; perda em novo device aceitavel.
- **Reversivel.** Migracao para DB e cheap (backfill from localStorage).
- **Performance.** Sync read no mount, sem network roundtrip.

### Negativas

- **Sem sync cross-device.** User ve onboarding novamente em mobile depois de dismiss
  desktop.
- **User que limpa cache perde state.** Re-mostra onboarding.
- **Sem auditoria SQL** de adoption rate sem telemetria explicita.
- **Divida tecnica registrada.** Sprint futuro paga migracao se relevante.

### Neutras

- **Decisao revisitavel.** ADR novo + migracao trivial quando relevante.
- **`tracker.emit('primedope_onboarding_dismissed_card_<n>')`** opcional para telemetria
  basica (decidir em W2 se vale).

## Confianca

**Alta.** Tradeoffs explicitos. Reversibilidade alta. Padrao do projeto. Sem riscos
identificados em F4.

## Referencias

- **Spec:** `Docs/specs/sprint-f4-primedope-grade-detail.md` (secao B.0 — Onboarding
  Educativo + RF-16).
- **Lessons learned:** `Docs/architecture/lessons-learned.md#12` (estado persistente —
  `localStorage` sobrevive a re-mount; `useState` local nao).
- **ADR-054:** `054-primedope-external-provider-vs-native-engine.md` — contexto F4.
- **ADR-055:** `055-tracker-stub-vs-analytics-events-table.md` — telemetria opcional
  pode emitir `primedope_onboarding_dismissed_card_<n>` se relevante.
- **Diagramas Mermaid:**
  - `Docs/architecture/c4-context-primedope.mermaid` — `PrimedopeOnboardingCards`
    componente em `PrimedopePanel`.
- **Out of scope F4:** "Migracao do dismiss-onboarding para `users.preferences` JSONB
  (atualmente localStorage; ADR futuro pra sync cross-device)" (linha 1182 da spec).
