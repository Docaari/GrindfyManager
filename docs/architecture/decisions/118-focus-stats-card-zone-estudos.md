# ADR-118 — `FocusStatsCard` na Home: nova zona "Estudos" entre Acao Imediata e Sinal Externo

- Status: Aceito
- Data: 2026-05-03
- Sprint: home-reform-4 (Item 7 — Focus Stats)
- Decision owner: system-architect (formaliza decisao founder confirmada — RF-06 spec + linha 374-379 spec mae)
- Related: ADR-099 (cockpit pattern Home), ADR-101 (sidebar IA), ADR-107 (home zoning), ADR-116 (`user_focus_stats` schema), ADR-117 (`study_sessions.theme_id`)
- Spec: `Docs/specs/home-reform-4-item-7-focus-stats.md` §RF-06, §Riscos
- Spec mae: `Docs/specs/home-reform-4.md` linhas 240-269 (Item 7) + linhas 374-379 (zona Estudos)

---

## 1. Contexto

### 1.1. Diagnostico

Spec mae `home-reform-4.md` (linhas 374-379) propoe uma **nova zona "Estudos"** no Home, posicionada entre "Acao Imediata" e "Sinal Externo". Hoje a Home tem 4 zonas (ADR-107):

1. **Zona 1 — Hoje**: `DailyInsight`, `TodayCard`, `NextTournamentCountdown`.
2. **Zona 2 — Acao Imediata**: `PendingHandsList`, `LibraryResume`, `TournamentRecommendations`, `HeuristicsCard`.
3. **Zona 3 — Performance**: `PerformanceMini`, `StatsTopDeltas`, `VarianceCard`, `LifetimeStats`, `RecentSessionsList`.
4. **Zona 4 — Sinal Externo**: `NewsFeed`, refresh badge, filter chips.

Item 7 introduz `FocusStatsCard` — componente que mostra 3 stats foco com tema linkado + tempo de estudo dedicado. **Pergunta arquitetural:** onde inserir?

Spec considerou:

- **Opcao 1:** Inserir no fim de Zona 2 "Acao Imediata" (junto com `LibraryResume`).
- **Opcao 2:** Criar **nova Zona "Estudos"** (entre Acao Imediata e Performance? Entre Performance e Sinal Externo?).

Founder confirmou (decisoes pre-aprovadas para esta arquitetura):

> "Card frontend: nova zona 'Estudos' no Home.tsx (entre Acao Imediata e Sinal Externo, conforme spec mae linha 374-379)"

### 1.2. Forcas em jogo

- **Information Architecture (ADR-101):** zonas devem agrupar componentes com **proposito unificado** (Acao Imediata = "o que faco agora?"; Performance = "como eu estou?"; Sinal Externo = "o que ta acontecendo?").
- **Future expansion:** Zona "Estudos" pode crescer (mover `LibraryResume` para la em onda futura, adicionar "Coach Recommendations" futuro). Criar a zona agora deixa o slot pronto.
- **Coerencia visual:** zonas tem `<h2>` titulo uppercase tracking-wide (padrao ADR-107). Nova zona segue.
- **Ordem semantica:** "Estudos" depois de "Performance" faz sentido — primeiro vejo como estou (Performance), depois decido o que estudar (Estudos), depois consumo conteudo externo (Sinal). Mas spec mae diz **entre Acao Imediata e Sinal Externo** (ou seja, entre Z2 e Z4). Founder aprovou explicitamente; respeitar.
- **Coexistencia com Performance:** Zona "Estudos" **nao substitui** Zona Performance. Performance continua existindo entre Acao Imediata e Estudos.

### 1.3. Re-leitura da spec mae

Spec mae linha 374-379 indica **zona Estudos entre Acao Imediata e Sinal Externo**. Como Performance continua existindo no meio, a ordem fica:

```
Z1 Hoje → Z2 Acao Imediata → Z3 Performance → Z4 ESTUDOS (NOVA) → Z5 Sinal Externo
```

Confirmado: 5 zonas pos-Item 7. Z4 vira "Estudos"; Z5 (antiga Z4) "Sinal Externo".

---

## 2. Decisao

### 2.1. Nova Zona 4 "Estudos" introduzida

**Posicionamento final:**

```
Header
Banners globais
StatusStrip (sticky)
├── Zona 1 — Hoje
├── Zona 2 — Acao Imediata
├── Zona 3 — Performance
├── Zona 4 — ESTUDOS (NOVA)         ← ADR-118
└── Zona 5 — Sinal Externo (renomeada de Zona 4 ADR-107)
Footer
```

Header da zona: `<h2>Estudos</h2>` com classes `text-xs uppercase tracking-wide text-muted-foreground` (padrao ADR-107).

### 2.2. Componentes da Zona 4 "Estudos" no MVP Item 7

**MVP entrega apenas 1 componente:**

- `<FocusStatsCard />` — card unico com 3 sub-blocos verticais (1 por focus stat), conforme RF-06 da spec.

**Pos-MVP (proximas ondas):**

- **Onda 4.1:** mover `<LibraryResume />` de Z2 "Acao Imediata" para Z4 "Estudos" (consolidar). Decisao adiada para quando Z2 ficar muito densa.
- **Onda 4.2:** adicionar `<CoachStudyRecommendations />` se Coach AI gerar sugestoes especificas de estudo.
- **Onda 4.3:** adicionar `<StudyStreakBadge />` se streak gamification expandir.

Esta ADR documenta a estrutura; expansoes futuras nao requerem nova ADR (apenas atualizar este §2.2 + ADR-107).

### 2.3. Layout do `FocusStatsCard`

**Estrutura visual** (cf. RF-06 spec):

```
┌──────────────────────────────────────────────────────────┐
│ Foco do Mes                                              │
│ ┌────────────────────────────────────────────────────┐   │
│ │ C-Bet Flop IP                          Foco · 1    │   │
│ │ 62.4%   ▲ +4.3pp        (vs 58.1% mes anterior)    │   │
│ │ ──────────────────────────────────────────────────  │   │
│ │ ♣ C-Bet em Heads-Up        78min este mes          │   │
│ │                              [Estudar agora →]      │   │
│ └────────────────────────────────────────────────────┘   │
│ ┌────────────────────────────────────────────────────┐   │
│ │ ... (item 2)                                       │   │
│ └────────────────────────────────────────────────────┘   │
│ ┌────────────────────────────────────────────────────┐   │
│ │ ... (item 3)                                       │   │
│ └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

**Estados do card:**

| Estado | items.length | Render |
|---|---|---|
| Loading | n/a | Skeleton 3 rows |
| Empty | 0 | `EmptyFocusStatsState` com CTA "Ir para Stats Analyzer" |
| Parcial 1 | 1 | 1 item + 2 `EmptyFocusStatSlot` (opacity 50%) |
| Parcial 2 | 2 | 2 items + 1 `EmptyFocusStatSlot` |
| Completo | 3 | 3 items |
| Erro fetch | n/a | "Falha ao carregar stats foco. [Tentar novamente]" |

**CTAs:**

- **Empty state:** `<Link href="/estudos/stats">` "Ir para Stats Analyzer".
- **Estudar agora (item):** `<Link href={`/estudos/temas/${theme.id}`}>` (Wouter, sem reload).
- **Slot vazio:** `<Link href="/estudos/stats">` "Adicionar stat".
- **Stat removida do catalog:** botao "Remover marcacao" → `DELETE /api/focus-stats/:id`.

### 2.4. Componentes derivados

**Novos arquivos:**

```
client/src/components/home/
  FocusStatsCard.tsx         ← container principal Z4
  FocusStatsCardItem.tsx     ← 1 dos 3 sub-blocos
  EmptyFocusStatsState.tsx   ← empty state quando items.length === 0
  EmptyFocusStatSlot.tsx     ← slot vazio em estado parcial
```

**Reuso:**

- `<Skeleton />` (shadcn) para loading.
- `<Link />` (Wouter) para CTAs de navegacao.
- `<Tooltip />` (Radix) para textos auxiliares.
- `<Card />` (shadcn) como container.

### 2.5. Wiring em `Home.tsx`

```tsx
// client/src/pages/Home.tsx
import { FocusStatsCard } from "@/components/home/FocusStatsCard";

// ... dentro do JSX, apos <Zona Performance> e antes de <Zona Sinal Externo>:

<section data-testid="home-zone-estudos" className="space-y-4">
  <h2 className="text-xs uppercase tracking-wide text-muted-foreground">
    Estudos
  </h2>
  <FocusStatsCard />
</section>
```

`<FocusStatsCard />` faz seu **proprio** `useQuery(['/api/home/focus-stats'])` (NAO consome do `data` do `/api/home/overview`). Cache independente, invalidacao isolada.

### 2.6. Invalidacao de cache

- `POST /api/focus-stats` ou `DELETE /api/focus-stats/:id` → frontend chama `queryClient.invalidateQueries({ queryKey: ['/api/home/focus-stats'] })`.
- **Backend:** mesmo padrao da spec — manter `Map<userId, { data, expiresAt }>` para `GET /api/home/focus-stats` (TTL 30s, igual ADR-102). Mutations server-side limpam entry do cache antes de responder.

### 2.7. Telemetria

Eventos emitidos via `emit()` em `@/lib/tracker`:

| Evento | Trigger | Payload |
|---|---|---|
| `home_focus_stats_view` | `useEffect` 1x por mount apos data carregar | `{ itemsCount: number }` |
| `focus_stats_cta_studynow_click` | Click em "Estudar agora" | `{ themeId, statId }` |
| `focus_stats_cta_define_click` | Click em CTA empty state | `{ source: 'empty' \| 'slot' }` |
| `focus_stat_marked` | POST 201 | `{ statId, themeId }` |
| `focus_stat_unmarked` | DELETE 200 | `{ statId }` |

### 2.8. Update no diagrama `home-zoning.mermaid`

Atualizar `Docs/architecture/home-zoning.mermaid` para incluir Zona 4 "Estudos" entre Performance e Sinal Externo. Conteudo da update fica fora desta ADR (responsabilidade do implementer ou separado em RF post-merge).

---

## 3. Opcoes Consideradas

### 3.1. Opcao 1 — Inserir no fim de Z2 "Acao Imediata"
- **Pros:** simples, sem nova zona.
- **Contras:**
  - Z2 ja esta densa (4 componentes: PendingHands, LibraryResume, TournamentRecommendations, Heuristics). Adicionar 5o piora a densidade visual.
  - Mistura semantica: "Acao Imediata" eh "agir AGORA" (recomendar torneio, revisar maos pendentes, ler livro). "Stats foco do mes" eh planejamento de estudo de longo prazo, nao acao do agora.
  - Bloqueia evolucao futura: nao deixa slot dedicado para outras features de estudo.
- **Rejeitada.**

### 3.2. Opcao 2 — Nova Zona "Estudos" entre Acao Imediata e Performance
- **Pros:** zona dedicada com expansao futura.
- **Contras:**
  - Quebra fluxo natural de leitura (Acao → Estudo → Performance pula sem sentido).
  - Spec mae explicitamente posiciona entre Acao Imediata e Sinal Externo (depois de Performance).
- **Rejeitada.**

### 3.3. Opcao 3 — Nova Zona "Estudos" entre Performance e Sinal Externo (ESCOLHIDA)
- Detalhada em §2. **Aprovada pelo founder.**

### 3.4. Opcao 4 — Inserir dentro da Z3 "Performance"
- **Pros:** stats sao dado de performance.
- **Contras:**
  - Performance hoje eh **observacao** (PerformanceMini, StatsTopDeltas, Variance, Lifetime, RecentSessions). FocusStatsCard eh **acao** (estudar). Mistura proposito.
  - Z3 ja esta densa (5 componentes).
- **Rejeitada.**

---

## 4. Consequencias

### 4.1. Positivas

- **Clareza de IA:** zona dedicada para "estudos" cria mental model claro.
- **Future-proof:** slot pronto para `LibraryResume` migrar (Onda 4.1) e novas features de estudo.
- **Coerente com spec mae:** posicionamento exato como linha 374-379.
- **Card focado:** `FocusStatsCard` nao compete com outros componentes da mesma zona — destaque visual completo.
- **Cache isolado:** mutations em focus-stats nao invalidam overview inteiro.

### 4.2. Negativas

- **Home cresce em altura:** mais 1 zona = mais scroll. Mitigacao: card `FocusStatsCard` colapsavel? **Nao no MVP.** Avaliar telemetria pos-launch (scroll depth).
- **Manutencao do `home-zoning.mermaid`:** diagrama precisa ser atualizado. Trabalho de docs.
- **Render cost:** mais 1 query (`/api/home/focus-stats`) em paralelo. Aceitavel: cache 30s + payload pequeno (3 items).

### 4.3. Neutras

- **Onda futura "estudos centralizados":** se mover `LibraryResume` para Z4, Z2 fica menor — bom (reduz densidade). ADR-107 pode ser revisado.
- **Mobile:** zona renderiza stack vertical normal. Sem ajuste especifico.

---

## 5. Confianca

**Alta.** Decisao alinhada com spec mae explicita + founder confirmou. Padrao "zona dedicada" ja precedido em ADR-107 (4 zonas atuais). Risco principal (scroll length) mitigavel pos-launch via telemetria.

---

## 6. Notas de Implementacao

- **`FocusStatsCard` nao consome `/api/home/overview`** — query separada para cache invalidation isolada.
- **TanStack Query config:** `staleTime: 30_000`, `refetchOnWindowFocus: true` (igual ao overview).
- **Empty state CTA usa Wouter `<Link />`** — NAO `<a href />`. Mantem SPA navigation.
- **Lesson #11 (sem actions decorativas)**: botao "Estudar agora" so aparece se `theme.id` existir. Stat sem tema (impossivel via UI normal mas defensivo) → sem CTA.
- **Lesson #1 (hooks first)**: `<FocusStatsCard />` deve fazer todos hooks ANTES de qualquer return condicional.
- **Lesson #13 (`apiRequest` retorna JSON)**: mutations consomem JSON direto, NAO chamar `.json()`.
- **Atualizar `home-zoning.mermaid`** para refletir 5 zonas pos-merge.
- **Reviewer checklist:**
  - [ ] Zona 4 "Estudos" inserida em `Home.tsx` entre Performance e Sinal Externo.
  - [ ] Header `<h2>Estudos</h2>` com classes corretas (uppercase tracking-wide).
  - [ ] `data-testid="home-zone-estudos"` no `<section>`.
  - [ ] `FocusStatsCard` renderiza 4 estados (loading/empty/parcial/completo).
  - [ ] CTAs usam Wouter `<Link />`.
  - [ ] Telemetria emit em mount + clicks.
  - [ ] Cache TTL 30s server-side + invalidation em mutations.
  - [ ] `home-zoning.mermaid` atualizado para 5 zonas.
  - [ ] Skeleton durante loading (sem layout shift).
  - [ ] Erro de fetch nao derruba a Home (fallback render).

---

## 7. Referencias

- `Docs/specs/home-reform-4-item-7-focus-stats.md` §RF-06
- `Docs/specs/home-reform-4.md` linhas 240-269 (Item 7) + 374-379 (zona Estudos)
- ADR-099 — Operations Cockpit pattern
- ADR-101 — Home sidebar IA
- ADR-107 — Home zoning (4 zonas atuais; sera atualizado para 5)
- ADR-116 — `user_focus_stats` schema
- ADR-117 — `study_sessions.theme_id`
- `Docs/architecture/home-zoning.mermaid` — atualizar pos-merge
- `client/src/pages/Home.tsx` — local de wiring
