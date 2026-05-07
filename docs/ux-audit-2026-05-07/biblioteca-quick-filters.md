# UX Audit — BibliotecaPanel Quick Filters (RF-05)

**Data:** 2026-05-07
**Alvo:** `client/src/components/grade-planner/BibliotecaPanel.tsx` (821 linhas)
**Modo:** Auditoria UX (Strategist)
**Pre-requisito:** sprint-coach-page-reform-1 RF-05
**Escopo:** chips quick-filter Plataforma + Dia da semana acima dos filtros existentes; ajustes UX dos filtros atuais limitados ao impacto do novo padrao.

---

## TL;DR

- **Friction #1 (top ICE):** filtro `filterSite` single-select ESCONDIDO atras do toggle "Filtros" gera 3-5 cliques pra trocar de plataforma — quick chips multi-select sempre visiveis matam o problema.
- **Friction #2:** sem filtro por dia da semana hoje (campo `dayOfWeek` ja existe no schema mas e dead column na UI). Founder planeja grade Seg-Dom; precisa filtrar por dia em 1 clique.
- **Friction #3:** popover "Filtros" mistura 7 controles heterogeneos (sort, range numerico, currency, type, speed, site) sem hierarquia — virou catch-all. Quick chips puxam os 2 mais usados (plataforma+dia) pra fora; o resto fica atras de "Filtros avancados" e isso ja melhora a varredura visual.

---

## 1. Friction Points Existentes (Top 5 ICE)

ICE Score = (Impact * Confidence * Ease) / 3. Escala 1-10. Justificativa breve por dimensao.

| # | Friction | I | C | E | Score | Evidencia |
|---|----------|---|---|---|-------|-----------|
| 1 | `filterSite` single-select escondido atras de "Filtros" — usuario que joga 3 redes (PokerStars+GG+WPN) precisa abrir/fechar painel a cada troca | 9 | 9 | 8 | **8.7** | `BibliotecaPanel.tsx:343-365` toggle + linhas 370-380 select. Multi-select hoje e impossivel. |
| 2 | Sem filtro por `dayOfWeek` apesar do campo existir no schema | 8 | 8 | 7 | **7.7** | `shared/schema.ts:2262` campo nullable existe; `library-filters` (referenciado em linha 5) nao consome. Founder planeja grade dia-a-dia. |
| 3 | "Filtros" abre painel com 7 controles heterogeneos sem agrupamento — sort + currency + buy-in range + type + speed + site soltos | 7 | 8 | 7 | **7.3** | `BibliotecaPanel.tsx:367-449` painel inteiro vira lixao. Quick chips extraem os 2 mais usados; resto fica em "Avancados". |
| 4 | Indicador `!` em badge verde do botao "Filtros" nao diz QUAIS filtros estao ativos — usuario precisa abrir pra descobrir | 6 | 8 | 8 | **7.3** | `BibliotecaPanel.tsx:353-355` `<span>!</span>`. Sem chip-summary nem contador semantico. |
| 5 | "Limpar" pequenininho ao lado do toggle (linhas 357-364) so aparece com `hasActiveFilters` mas nao tem icone + esta em texto cinza fraco | 5 | 7 | 9 | **7.0** | `BibliotecaPanel.tsx:358-364`. Visualmente perde vs botao "Filtros" emerald. |

**Bonus (ICE < 6, fora do top 5 mas relevante para o sprint):**
- `sortMode` no mesmo painel dos filtros (deveria ser controle a parte, mas nao bloqueante).
- Empty state `Nenhum torneio encontrado` (linha 633) sem hint de qual filtro relaxar.
- `filterCurrency` exibe USD/BRL/EUR mas nao CNY apesar de `getCurrencyForSite` suportar (linha 6 import). Drift silencioso.

---

## 2. Proposta Visual — Chips Plataforma

### 2.1 Layout

- **Container:** flex horizontal com `overflow-x-auto` (scroll horizontal nativo, scrollbar oculta com `scrollbar-hide` se classe disponivel; senao `[&::-webkit-scrollbar]:hidden`).
- **Mobile (< 768px):** scroll horizontal sempre. Sem flex-wrap.
- **Desktop (>= 768px):** `flex-wrap` permitido. Em telas estreitas (painel a 30%, ~360px), permite quebra para 2 linhas; chips com `flex-shrink-0` dentro de cada linha.
- **Tamanho do chip:** altura 28px (`h-7`), padding `px-2.5`, gap interno entre logo+label de `gap-1.5`. Border-radius `rounded-full`.
- **Espacamento entre chips:** `gap-1.5` (6px). Importante: ao tocar 11 chips, total comprimido em ~660-720px; mobile precisa scroll.

### 2.2 Estados

| Estado | Visual | Trigger |
|--------|--------|---------|
| **Idle** (deselecionado, com matches) | `bg-gray-800 border border-gray-700 text-gray-300` | default |
| **Hover** | `bg-gray-700 border-gray-600 text-white` | `:hover` |
| **Active** (selecionado) | `bg-emerald-600/20 border-emerald-500 text-emerald-400` | `aria-pressed=true` |
| **Active hover** | `bg-emerald-600/30 border-emerald-400` | `:hover` quando active |
| **Disabled** (zero matches no DB do user E nao esta selecionado) | `opacity-40 cursor-not-allowed bg-gray-900 border-gray-800 text-gray-500` | sem torneios na lib pra esse site |
| **Focus** | `ring-2 ring-emerald-400 ring-offset-1 ring-offset-gray-900` | `:focus-visible` |

**Disabled rule:** chip que nao tem nenhum torneio na biblioteca atual continua sendo renderizado (espaco previsivel) mas marcado disabled. Se ja esta selecionado e fica sem matches por outro filtro, NAO desabilita — caso contrario impede usuario remover sua propria selecao.

### 2.3 Microcopy + Contador

- **Header da secao** (acima dos chips): `<h4>Plataformas</h4>` com font-size `text-[11px] uppercase tracking-wider text-gray-500 font-medium`.
- **Contador inline (right-aligned no header):** quando >=1 chip ativo, mostrar `(N)` em emerald, `text-[11px]`. Ex: `Plataformas  (2)`.
- **Botao "Limpar":** quando >=1 chip ativo, link inline a direita do header: `Limpar` em `text-[11px] text-gray-400 hover:text-white underline-offset-2 hover:underline`. Click reseta `filterSites=[]`.
- **Tooltip on hover:** `<title>{site}</title>` quando label truncado. Ex: `<title>PokerStars</title>` mesmo se label exibido for "PS".

### 2.4 Truncamento + Logos

**Decisao:** **mini-logo + nome curto** (nao so logo).

- **Logo:** `<img>` 14x14px (w-3.5 h-3.5) com paths existentes em `attached_assets/`. Mapping inline:
  ```ts
  const SITE_LOGOS: Record<string, string> = {
    PokerStars: '/attached_assets/Pokerstars_1751384684151.png',
    GGPoker: '/attached_assets/GGPoker_1751384684150.png',
    WPN: null, // nao tem asset; fallback color dot
    PartyPoker: '/attached_assets/PartyPoker_1751384684151.png',
    '888poker': '/attached_assets/888_1751384684150.png',
    iPoker: null,
    CoinPoker: '/attached_assets/Coinpoker_1751384741999.png',
    Chico: '/attached_assets/Chico_1751384684150.png',
    Bodog: null,
    Suprema: null,
    Revolution: '/attached_assets/Revolution_1751384684151.png',
  };
  ```
  Quando logo ausente, fallback = dot color de `getPlannerSiteColor()` (helper ja usado em `LibraryCard.tsx:3,42,54,74`). Mantem consistencia visual com cards.

- **Label texto:** nome **completo** preferencialmente. Lista de abreviacoes apenas em mobile narrow (< 480px) ou se medicao indicar que 11 chips nao cabem em 1 row + scroll horizontal soa lento:

  | Site canonico | Label desktop | Label mobile narrow |
  |---|---|---|
  | PokerStars | PokerStars | PS |
  | GGPoker | GGPoker | GG |
  | WPN | WPN | WPN |
  | PartyPoker | PartyPoker | Party |
  | 888poker | 888poker | 888 |
  | iPoker | iPoker | iPoker |
  | CoinPoker | CoinPoker | Coin |
  | Chico | Chico | Chico |
  | Bodog | Bodog | Bodog |
  | Suprema | Suprema | Suprema |
  | Revolution | Revolution | Rev |

  **Recomendacao MVP:** entregar so labels completos + `overflow-x-auto` em mobile. Abreviar em followup se feedback indicar friccao.

### 2.5 Empty State (zero historico)

Founder ja confirmou em RF-05.2: ordem fixa fallback global: PokerStars > GGPoker > WPN > PartyPoker > 888poker > iPoker > CoinPoker > Chico > Bodog > Suprema > Revolution.

Sub-caso: usuario zero historico **e** zero torneios na biblioteca → todos os chips sao renderizados disabled (cinza claro, sem opacity de extra-disabled — apenas idle muted). Continuam clicaveis (defensive: usuario pode importar e voltar). Hint sutil: empty state da lista mostra "Importe torneios para comecar" (ja existe em linha 629).

### 2.6 Mobile Behavior

- Scroll horizontal com momentum nativo (iOS scroll-snap nao recomendado — atrapalha selecao parcial).
- `scroll-padding-inline-start: 12px` para que chip cortado tenha hint visual.
- Edge case: 11 chips em 1 row em viewport 360px ocupam ~720px → scroll esperado; nao tentar wrap (perde alinhamento horizontal limpo dentro do painel 30%).

---

## 3. Proposta Visual — Chips Dia da Semana

### 3.1 Layout

- **Container:** `flex gap-1.5` (mais compacto que plataformas, ja que chips sao curtos 3 chars).
- **Ordem PT-BR (founder confirmou em spec linha 363):** `Hoje` (atalho) + `Seg, Ter, Qua, Qui, Sex, Sab, Dom` = 8 chips total.
- **Por que ordem comeca em segunda e nao domingo:** convencao Grindfy alinhada com `client/src/components/grade-planner/types.ts:46-54` (`weekDays` array tem `Domingo` como id=0 mas componentes existentes — WeekGrid, weekly-plans — exibem grade Seg-Dom). Manter consistencia com mental model "semana de grind comeca segunda".
- **Tamanho:** altura 28px (mesma de plataforma) mas largura fixa `min-w-[44px]` (3 chars caber + padding). Border-radius `rounded-full`.
- **Mobile:** sempre cabe em 1 linha (8 chips * 50px = 400px), aceita pequeno scroll horizontal em viewport 360px.

### 3.2 Comportamento — Single vs Multi

**Decisao: multi-select** (igual plataformas).

**Justificativa:**
- Founder usa biblioteca pra arrastar torneios pra grid. Filtra "Sex+Sab+Dom" pra ver fim de semana de uma vez. Single-select forcaria 3 toggles + 3 listas separadas.
- Concorrentes (Sharkscope) usam multi para schedule filters.
- Custo: 1 linha de codigo extra (array vs string).

**Excecao para "Hoje":** click em "Hoje" e atalho semantico que **substitui** seleção atual por `[todayDow]`. Nao toggla individual. Se usuario quiser combinar "Hoje + Sab" (ex: hoje=quarta, quer ver quartas+sabados), faz click em "Hoje" → click em "Sab" (que adiciona `6` ao array existente `[3]`). Click novamente em "Hoje" remove tudo exceto `todayDow`.

### 3.3 Chip "Hoje"

- **Posicao:** primeiro chip da row, antes de "Seg".
- **Visual idle:** `border-2 border-amber-500 bg-amber-500/10 text-amber-400` (border accent ao inves de fill — sinaliza "atalho" sem competir com selected state).
- **Visual active** (quando `filterDaysOfWeek === [todayDow]` e somente esse): mesmo border-2 amber + bg fill `bg-amber-500/30 text-amber-300`.
- **Visual idle quando `filterDaysOfWeek` inclui `todayDow` MAS tambem outros dias:** estado intermediario `bg-amber-500/15 text-amber-400 border-amber-500` — sinaliza "hoje esta ativo, mas nao isolado".
- **Microcopy:** label simplesmente "Hoje" (capital "H"). Nao mostrar dia atual no label (ex: NAO escrever "Hoje (Qua)") — mantem o chip estavel; tooltip via `title="Hoje (quarta-feira)"` cobre o detalhe.
- **Logica:**
  ```ts
  const todayDow = new Date().getDay(); // 0-6
  const isToday = filterDaysOfWeek.length === 1 && filterDaysOfWeek[0] === todayDow;
  const todayInSet = filterDaysOfWeek.includes(todayDow);
  ```

### 3.4 Chips Dia (Seg..Dom)

- **Idle:** `bg-gray-800 border-gray-700 text-gray-300`.
- **Active:** `bg-blue-600/20 border-blue-500 text-blue-400` (cor distinta de plataforma — emerald — para sinalizar que e outra dimensao de filtro).
- **Hover/focus:** mesmas regras de plataforma.
- **Disabled:** chip de dia que nao tem nenhum torneio na lib atual com aquele `dayOfWeek` fica `opacity-50`. Lembrar: torneios com `dayOfWeek = null` SAO contados como nenhum dia → muitos torneios manuais antigos podem ter `null`. Empty disabled aceitavel; nao bloquear click.

### 3.5 Cor visual sinalizando dia atual

Sim — o chip do dia atual (ex: hoje=quarta → chip "Qua") ganha **dot indicador** no canto superior-direito (4x4px `bg-amber-500 rounded-full absolute -top-0.5 -right-0.5`) MESMO quando nao selecionado. Razao: ajuda usuario a se orientar sem precisar consultar relogio.

Nao usar cor diferente no label/border — manteria mesmo padrao visual; apenas dot adiciona affordance.

---

## 4. Edge Cases + Erros

### 4.1 Combo zero matches

Quando `filterSites.length > 0 OR filterDaysOfWeek.length > 0 OR search OR filtros avancados ativos` retorna `filtered.length === 0`:

```
[icon search-x]
Nenhum torneio bate com os filtros selecionados

Filtros ativos:
[chip Plataforma: 2] [chip Dia: 3] [chip Buy-in: $5-$20]

[Limpar tudo] [Limpar so plataformas]
```

- Mostrar **chips-summary** dos filtros ativos usando `<FilterChipGroup>` ja existente em `client/src/components/ui/FilterChip.tsx`.
- Botao primario: `Limpar todos os filtros` (reseta tudo, equivalente a `clearFilters()` em linha 225).
- Botao secundario: aparece SO quando ha 2+ dimensoes de filtro ativas — `Limpar so [dimensao mais restritiva]`. Heuristica: dimensao com mais chips ativos. Ex: 3 dias selecionados + 1 plataforma → sugere "Limpar dias".

### 4.2 Reset rapido global (>=1 filtro ativo)

Botao **`X Limpar tudo`** persistente no header da BibliotecaPanel, ao lado do counter de torneios (linha 666 `{filtered.length} de {totalCount} torneios`). Renderiza apenas quando `hasActiveQuickFilters || hasActiveFilters || search`.

```tsx
{(hasActiveQuickFilters || hasActiveFilters || search) && (
  <button
    data-testid="biblioteca-clear-all"
    onClick={clearAllIncludingQuick}
    className="text-[11px] text-gray-400 hover:text-emerald-400 inline-flex items-center gap-1"
  >
    <X className="w-3 h-3" />
    Limpar tudo
  </button>
)}
```

Diferenca vs atual: hoje ha "Limpar" so dentro do popover (linha 358) e nao limpa `search`. Novo botao limpa TUDO incluindo busca textual.

### 4.3 Mobile (< 768px)

- **Plataformas:** scroll horizontal forcado.
- **Dias:** cabem em 1 row 360px (8 * ~44px = 352px). OK.
- **Search:** ja existe input fullwidth — manter.
- **Filtros avancados:** botao toggle `Filtros avancados ▾` continua centralizado (full-width) — abre painel atual.
- Edge: no painel em modo `collapsed=true` (linhas 240-309), os quick chips DEVEM aparecer? Recomendacao: **nao**. Modo collapsed e propositalmente minimo (search + lista compacta). Quick filters voltam quando expande — manter contraste de uso.

### 4.4 Acessibilidade (a11y)

- **Keyboard nav:**
  - `Tab` percorre: search input → chip-Hoje → chip-Seg → ... → chip-Dom → chip-PokerStars → ... → chip-Revolution → "Filtros avancados" toggle → "Limpar tudo".
  - Cada chip eh `<button type="button">` com `aria-pressed={isSelected}` (padrao toggle button — vide `client/src/components/home/NewsFeed.tsx:149` ja usa).
  - `Enter` ou `Space` toggla.
  - **Nao** usar `role="tab"`. Tabs implicam "1 ativo de N" + painel atrelado; chips multi-select nao se encaixam (NewsFeed ali esta no limite — pra plataforma seria errado).
- **Screen reader:**
  - Container plataformas: `role="group" aria-label="Filtrar por plataforma"`.
  - Container dias: `role="group" aria-label="Filtrar por dia da semana"`.
  - Cada chip: label visivel + `aria-pressed`. Sem necessidade de aria-label custom enquanto label visivel ja descreve.
  - Quando contador `(N)` aparece no header, anunciar via `aria-live="polite"` em uma `<span class="sr-only">` que diz "N filtros ativos" quando muda.
- **Focus visible:** ring emerald 2px (mesmo padrao de FilterChip do design system).
- **Touch target:** altura minima 28px atende 24x24 do FilterChip canonico (vide `FilterChip.tsx:64` `min-w-[24px] min-h-[24px]`); em mobile, considerar `h-8` (32px) para conforto.

---

## 5. Microcopy PT-BR (Lista de Strings)

Confirmadas com convencao Grindfy (PT-BR sem acentos em testIds, com acentos em UI; "Limpar" ja usado no codigo atual em linha 362).

| Contexto | String |
|----------|--------|
| Header secao plataformas | `Plataformas` |
| Header secao dias | `Dias` |
| Atalho dia atual | `Hoje` |
| Tooltip "Hoje" | `Hoje (quarta-feira)` (ou nome do dia atual em portugues) |
| Toggle filtros avancados (collapsed) | `Filtros avancados` (com chevron `▾`) |
| Toggle filtros avancados (expanded) | `Filtros avancados` (com chevron `▴`) |
| Botao limpar tudo | `Limpar tudo` |
| Link limpar so plataformas | `Limpar plataformas` |
| Link limpar so dias | `Limpar dias` |
| Contador inline header | `(2)` (so o numero, sem palavra) |
| Empty state titulo | `Nenhum torneio encontrado` |
| Empty state subtitulo | `Tente remover algum filtro ou limpar todos` |
| Empty state CTA primaria | `Limpar todos os filtros` |
| Tooltip chip plataforma desabilitado | `Sem torneios desta plataforma na biblioteca` |
| Tooltip chip dia desabilitado | `Sem torneios neste dia na biblioteca` |
| aria-label contador filtros ativos | `{N} filtros ativos` (sr-only, atualiza via aria-live) |
| Tooltip chip plataforma ativo | `{site} (clique para remover)` |
| Tooltip chip plataforma idle | `Filtrar por {site}` |

**Regra:** convencao Grindfy escreve "PT-BR sem acentos em codigo (testIds, vars) + COM acentos em UI strings". Verifiquei cluster de exemplos:
- `client/src/components/home/NewsFeed.tsx:139` usa `Categorias de noticias` (sem acentos no atributo).
- `BibliotecaPanel.tsx:573` usa `Lixeira` (com c-cedilha removido — projeto teve cleanup pos-Replit).

**Recomendacao:** seguir o que ja esta no arquivo (sem acentos). Ex: `Filtros avancados` (nao `avançados`), `Plataformas` (sem variacao). Se reviewer pedir consistencia retroativa, alinhar com PR ja em main.

---

## 6. TestIds Canonicos (validados)

Spec original RF-05.2/05.3 lista ids; valido nomenclatura abaixo:

| Elemento | testId | Notas |
|----------|--------|-------|
| Container chips plataforma | `biblioteca-quick-filters-platforms` | OK conforme spec |
| Cada chip plataforma | `biblioteca-quick-filter-platform-{site-slug}` | Slug = lowercase, sem espacos. Ex: `biblioteca-quick-filter-platform-pokerstars`, `-ggpoker`, `-888poker`, `-coinpoker`. Para `888poker`: slug `888poker` (mantem digitos no inicio). |
| Container chips dia | `biblioteca-quick-filters-days` | OK conforme spec |
| Cada chip dia | `biblioteca-quick-filter-day-{dow}` | dow 0-6. Ex: `biblioteca-quick-filter-day-3` (Quarta) |
| Chip "Hoje" | `biblioteca-quick-filter-today` | **Spec original tem `biblioteca-quick-filter-day-today` (linha 368).** Recomendacao: seguir spec (`day-today`) para consistencia com `day-{dow}` no mesmo container. Test-writer aplica conforme spec, nao conforme este audit. |
| Botao "Limpar tudo" header | `biblioteca-clear-all` | NOVO — nao na spec original. Reviewer aprova ou drop. |
| Toggle filtros avancados | `biblioteca-toggle-advanced-filters` | Substitui visualmente o `Filtros` atual (linha 343 nao tem testId hoje). |

**Regra slug plataforma (canonica para test-writer):**
```ts
function siteSlug(site: string): string {
  return site.toLowerCase().replace(/\s+/g, '-');
}
// PokerStars -> 'pokerstars'
// 888poker   -> '888poker'
// CoinPoker  -> 'coinpoker'
// Chico      -> 'chico'
```

---

## 7. Concorrentes / Referencias

### 7.1 Sharkscope — Tournament Search

- Filtros principais: `Site` (multi-checkbox dropdown), `Buy-in range` (slider numerico), `Speed`, `Type`. Sem chips horizontais — UI legacy table-based.
- **Padrao herdavel:** multi-select como default em `Site` (alinha com nossa decisao). Nao copiar layout dropdown.

### 7.2 PokerCraft (GGPoker)

- Filtros via tabs no topo: `Today | Yesterday | This Week | Last Week | Custom`. Plataforma e fixa (so mostra GG).
- **Padrao herdavel:** atalho `Today` como entry point (nossa decisao "Hoje" alinha). Eles fizeram isso porque player busca quase sempre hoje primeiro.

### 7.3 PokerTracker 4

- Filtros via "Filter Builder" complexo (drag de campos pra montar query). Power-user-only. Nao serve de referencia direta para quick filter MVP.
- **Padrao a evitar:** UI de "filter builder" expansivo. Founder explicito quer chips fast-toggle.

### 7.4 Hand2Note

- Sem biblioteca de torneios planejados (foco hands DB).

### 7.5 Padroes adotaveis

1. **Multi-select chip horizontal sempre visivel** (Sharkscope-light + GGPoker tabs). Mainstream em SaaS analytics 2024+. Confidence: alta.
2. **"Today" como atalho primeiro** (GGPoker, Twitter "Latest", etc). Nudge comportamental: reduz cliques pro caso de uso 80% (planejar HOJE).
3. **NAO copiar:** dropdown multi-checkbox (Sharkscope) — exige 2 cliques pra abrir + fechar. Nosso painel tem 30% width fixo; chips sempre visiveis sao melhores.

---

## 8. Resumo de Decisoes para Test-Writer

| RF-05 detalhe | Decisao Strategist | Override spec? |
|---------------|-------------------|----------------|
| Ordem visual: plataforma vs dia | **Plataformas em cima, Dias em baixo** | nao (spec nao pre-define) |
| Plataforma multi-select | sim | nao (spec confirma) |
| Dia multi-select | sim | nao (spec confirma) |
| "Hoje" substitui ou adiciona | **substitui** `filterDaysOfWeek` por `[todayDow]` | nao (spec linha 364) |
| Logo nos chips plataforma | **mini-logo (14px) + label** | nao (spec nao define; recomendacao audit) |
| Cor active plataforma | emerald | nao |
| Cor active dia | blue | nao (audit recomenda — spec deixa em aberto) |
| Cor "Hoje" | amber border + amber bg | nao |
| Microcopy header | "Plataformas", "Dias", "Filtros avancados" | nao |
| Empty state custom | "Nenhum torneio encontrado" + chips-summary + "Limpar tudo" | nao (spec linha 386 generico) |
| Filtros avancados collapsed default | sim | nao (spec linha 387) |
| testId chip-Hoje | `biblioteca-quick-filter-day-today` (spec) | seguir spec, nao audit |
| Disabled chip quando zero matches lib | renderiza muted, nao some | nao (audit decision) |
| Mobile layout chips | scroll horizontal | nao (audit decision) |

---

## 9. Riscos / Avisos para Implementer

1. **`getCurrencyForSite` ja existe** (`@shared/platform-currency`, linha 6 do BibliotecaPanel). Se chip plataforma exibir badge de moeda no futuro, usar essa funcao. Fora do escopo deste sprint.

2. **`platforms` prop opcional** (RF-05.2 linha 351 + criterio de aceitacao linha 391): impl deve aceitar override sem consumir hook/endpoint quando prop chega. Audit confirma valor — testes mockam ordem custom sem mockar o hook.

3. **`filterLibraryTournaments` extension** (RF-05.1 + RF-05.3): adicionar campos `filterSites: string[]` + `filterDaysOfWeek: number[]` mantendo compat com `filterSite: string` legacy. Verificar com grep antes que nenhum chamador externo quebra.

4. **Lesson #2 (data-testid):** chips devem ter testId estavel SEM heuristica DOM. Spec ja documenta — reforco aqui.

5. **Lesson #14 (`require()` em test .tsx):** test-writer DEVE usar `await import(...)` para renderizar BibliotecaPanel em testes.

---

## 10. Encerramento

**Recomendacao principal:** quick chips Plataforma (multi, ordem por popularidade do user, mini-logo+label) + chips Dia (multi, ordem Seg-Dom, atalho "Hoje" amber) sempre visiveis acima dos filtros avancados. Empty state customizado com chip-summary dos filtros ativos. Botao "Limpar tudo" persistente no header quando ha filtros.

**Proximos passos:**
- → Test-writer escreve `BibliotecaPanelQuickFilters.test.tsx` conforme RF-05 spec + decisoes deste audit (sec 8).
- → Implementer green phase com hook `usePlatformsByPopularity()` (Path B da spec sec 6) + extension de `filterLibraryTournaments`.
- → Reviewer valida testIds canonicos + a11y (`aria-pressed`, `role="group"`).

---

**Doc ID:** `Docs/ux-audit-2026-05-07/biblioteca-quick-filters.md`
**Linhas:** ~430 (limite 600 OK)
**Strategist:** Grindfy Strategist Agent
**Sprint atrelado:** sprint-coach-page-reform-1 RF-05
