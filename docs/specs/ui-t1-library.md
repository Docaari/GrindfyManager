# Spec — UI-T1-Library Tier 1 Polish (TournamentLibraryNew)

> Sprint: UI-T1-Library (Fase 2 — Tier 1 polish do plano UX 2026-05-02)
> Data: 2026-05-02
> Input:
> - `Docs/ux-audit-2026-05-02/implementation-plan.md` (secao "Sprint UI-T1-Library")
> - `Docs/ux-audit-2026-05-02/audit-tier1-library-upload.md` (achados L1-L12)
> - `client/src/pages/TournamentLibraryNew.tsx` (estado atual pos UI-QW-1)
> - `Docs/conventions/ui-patterns.md` (Foundation UI-FND-1)
> - `Docs/specs/ui-fnd-1-foundation.md` + `Docs/specs/ui-qw-1-quick-wins.md` (sprints anteriores)
> - Memory `session_2026-05-02-ui-qw-1.md` (tickets deferidos absorvidos)
> Output: este documento — fonte de verdade operacional para `system-architect` (se necessario), `test-writer`, `implementer`, `reviewer`
> Status: Proposta (aguardando aprovacao do dev)
> Idioma: PT-BR (codigo em ingles, conteudo/UI em PT-BR)

---

## 1. Sumario Executivo

**Objetivo.** Polir a pagina `/library` (TournamentLibraryNew) consumindo Foundation UI-FND-1 + Quick Wins UI-QW-1 ja em main. Eliminar inconsistencia visual (7 gradientes ad-hoc nos filtros) + reduzir densidade do card (15 datapoints -> 3+expand) + persistencia de estado (sort em URL) + virtualizacao opcional + improvements deferidos do UI-QW-1 (EmptyState area granularidade, tone semantico ROI, token `accent` para purple).

**Escopo.** 13 RFs em ~5 dias dev. Pipeline TDD completo (test-writer -> implementer -> reviewer). Risco contido: pagina independente das outras Tier 1 (Dashboard/Studies sao dominio paralelo do stats analyzer).

**13 RFs em 1 linha:**
- **RF-01** (L1) — Filtros uniformes (substituir 7 gradientes por estilo neutro + cor so no chip ativo via `tokens.color`)
- **RF-02** (L3) — Card compacto (3 stats) + density toggle (compact/detail) + persistencia localStorage
- **RF-03** (L5) — Persistir `sortBy` + `sortOrder` em URL query params (`?sort=roi&order=desc`)
- **RF-04** (L6) — Virtualizacao com `@tanstack/react-virtual` quando `filteredAndSortedGroups.length > 50`
- **RF-05** (L7) — Botao "Exportar CSV" no header do modal de detalhe (lista de torneios do grupo)
- **RF-06** (L8) — Sortable headers na tabela do modal (clique-pra-ordenar + indicador ↑/↓)
- **RF-07** (L9) — Tooltip de confidence grade no modal de detalhe (consistencia com card)
- **RF-08** (L10) — Default periodo = `90d` ("Ultimos 3M") em vez de `all` ("Tudo")
- **RF-09** (L11) — Loading skeleton matching layout final (4 KPIs + filtros expandidos + grid 4col)
- **RF-10** (L12) — Botao toggle filtros mais visivel (header com label "Mostrar/Ocultar" ou X visivel)
- **RF-11** (deferido UI-QW-1 M3) — EmptyState area granular (`library-filters-empty` vs `library-no-groups`) — atualizar `EMPTY_STATE_AREAS` em `client/src/components/ui/EmptyState.tsx`
- **RF-12** (deferido UI-QW-1) — Tone semantico no chip ROI: `tone: filters.roiFilter === 'negative' ? 'danger' : 'success'`
- **RF-13** (deferido UI-QW-1 INFO-02) — Adicionar token `accent` em `tokens.color` (purple-based) para categorias do Library + atualizar testes ui-tokens

**Fora de escopo:** veja secao 11.

---

## 2. Contexto e Motivacao

### 2.1. Problema documentado pelo audit

A auditoria UX (`audit-tier1-library-upload.md` secao 3) identificou 12 achados (L1-L12) na biblioteca de torneios:

| Achado | Severidade | Resolvido por | Justificativa |
|---|---|---|---|
| L1 Filtros 7 gradientes | P1 | RF-01 | Anti-pattern 2.7 (cores semanticas sem padrao). 7 cores lutam entre si. |
| L3 Card 15 datapoints | P1 | RF-02 | Anti-pattern 2.6 (cards aninhados). Card vira muro de numeros em grid 4col. |
| L5 Sort sem persistencia | P2 | RF-03 | Power user reset toda vez que da refresh. Paridade Dashboard FP-11. |
| L6 Sem virtualizacao | P2 | RF-04 | Anti-pattern 1.7. Grinder com 200+ grupos = DOM trava. |
| L7 Modal sem export | P2 | RF-05 | Power user precisa de CSV. Falta paridade com Dashboard. |
| L8 Tabela modal sem sort | P2 | RF-06 | 8 colunas + ordenacao fixa por data. Dificulta analise. |
| L9 Tooltip confidence inconsistente | P2 | RF-07 | Card tem tooltip, modal nao. Inconsistencia. |
| L10 Periodo "all" default | P3 (alto impacto) | RF-08 | Usuario novo ve 2 anos atras misturado com agora. Mascara performance recente. |
| L11 Skeleton mismatch | P3 | RF-09 | Layout shift garantido (sidebar 1col vs grid 4col). |
| L12 Toggle filtros invisivel | P3 | RF-10 | Botao 16x8px chevron isolado. Founder testou e nao acha. |

### 2.2. Tickets deferidos do UI-QW-1 absorvidos

Memory `session_2026-05-02-ui-qw-1.md` lista 4 tickets deferidos para UI-T1-Library:
- M3 EmptyState area granularidade (`library-filters-empty` vs `library-no-groups`) -> RF-11
- 7 cores ad-hoc -> 6 tones semantic, purple perdido (INFO-02 reviewer) -> RF-13 (token `accent`)
- Tone ROI "Prejuizo" deveria ser danger -> RF-12
- Test a11y region FilterChipGroup (INFO-04) -> NAO entra (escopo Foundation, valido em smoke test apenas)

### 2.3. Por que 13 RFs em 1 sprint

- Pagina autocontida (`/library`). Stats analyzer paralelo NAO toca esses arquivos.
- Foundation UI-FND-1 + Quick Wins UI-QW-1 ja entregaram componentes canonicos (`tokens`, `EmptyState`, `FilterChip`).
- Card compact + density toggle eh refactor visual significativo (~1 dia). Outros RFs sao polish.
- Virtualizacao (RF-04) eh dep nova mas isolada (so essa pagina por enquanto).
- Reviewer pode revisar tudo em 1 round (RFs independentes, commits atomicos).

### 2.4. Estado atual pos UI-QW-1

Arquivo `client/src/pages/TournamentLibraryNew.tsx` (1063 linhas) ja consome:
- `<EmptyState>` canonico (linhas 762-779) com `area="library"` (a refinar — RF-11)
- `<FilterChipGroup>` canonico (linhas 712-716) com 7 chips canonicos (linhas 242-315)
- `tokens.color` parcialmente (chips ativos), mas filtros base ainda usam gradientes ad-hoc (RF-01)

Arquivo NAO toca:
- `client/src/lib/poker-colors.ts` (helpers `getLibrarySiteColor` etc — preservar como esta)
- `client/src/components/tournament-library/*` (helpers tooltip + filter — preservar)

---

## 3. Defaults Ativos D1-D14

Decisoes ja tomadas pelo PM. Implementer assume sem requestionar.

| ID | Default |
|---|---|
| **D1** | **RF-01 (L1) escopo:** substituir as 7 secoes de filtros base (Periodo linha 488, Sites linha 520, Categorias linha 546, Velocidades linha 572, ROI linha 601, Volume linha 629, Buy-in linha 659) por estilo NEUTRO uniforme: `bg-gray-800/50 border border-gray-700 rounded-xl p-4`. Header de cada secao SEM bullet colorido — apenas `<h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">{label}</h4>`. Botoes/chips dentro de cada secao usam `tokens.color.{tone}` quando ATIVOS — `bg-poker-surface border-gray-600` quando inativos. Mapeamento de tone por filtro: Periodo=`info`, Sites=`success`, Categorias=`accent` (RF-13 novo), Velocidades=`warn`, ROI=`success` (positivo) ou `danger` (negativo) ou `info` (high/medium), Volume=`info`, Buy-in=`warn`. Heading dos filtros (linha 443) tambem perde o gradient `bg-gradient-to-br from-poker-surface/50 to-gray-900/50` — fica `bg-poker-surface border border-gray-700`. |
| **D2** | **RF-02 (L3) escopo + UX do toggle:** Adicionar state `densityMode: 'compact' \| 'detail'` (default `'compact'`). Persistir em `localStorage` chave `grindfy.library.density`. Toggle na barra de controles (proximo ao sort, linha 720) como `<Tabs>` ou 2 botoes lado a lado: `[Compacto] [Detalhado]`. Card compacto mostra: badge confidence + nome + site + ROI grande + Volume + Profit (3 stats no bloco principal — manter visual ROI=2xl + IC pequeno + Profit lateral). Resto (3 grids de 3 stats + tags + outlier alert) so renderiza em detail mode. Modal de detalhe (Dialog) mantem TUDO sempre — ja tem tudo. |
| **D3** | **RF-03 (L5) escopo:** usar `useLocation` (Wouter) para ler/escrever query params `?sort={confidence,roi,totalProfit,volume,avgProfit,sdBuyins,normalizedPosition,finalTableRate}&order={asc,desc}`. Hidratar state inicial dos query params no mount (`useState(() => urlParam ?? default)`). Atualizar URL via `setLocation('/library?sort=...&order=...')` quando user muda sort (use `replace: true` para nao poluir browser history). Default = sort=`confidence` order=`desc` (mantem comportamento atual). |
| **D4** | **RF-04 (L6) escopo + lib:** instalar `@tanstack/react-virtual` v3+ (mesmo namespace de `@tanstack/react-query` ja em uso). Aplicar APENAS quando `filteredAndSortedGroups.length > 50`. Senao render direto (sem overhead). Implementacao: hook `useVirtualizer` com `count`, `getScrollElement` (ref do container scrollable), `estimateSize: () => 320` (altura aproximada do card detail mode; em compact mode ajustar para 200). Para grid responsivo, usar `lanes` matching colunas (1/2/3/4 conforme breakpoint). Se complexidade for >2h, implementer pode fallback para virtualizacao 1-coluna (sem `lanes`) e documentar como tradeoff na PR. |
| **D5** | **RF-05 (L7) escopo:** botao no `<DialogHeader>` (linha 922-940) lado direito do title, usando `<Button variant="outline" size="sm">`. OnClick gera CSV usando `buildCSVContent` + `getExportFilename` de `@/lib/export-helpers`. Headers fixos: `['Data', 'Site', 'Nome', 'Tipo', 'Velocidade', 'Buy-in', 'Posicao/Total', 'Profit']`. Rows iteram `group.tournaments`. Filename: `getExportFilename(\`library-${group.groupName}\`, 'all', 'csv')`. Trigger download via `Blob` + `URL.createObjectURL` + `<a download>` programatico (mesmo padrao do Dashboard FP-10 export). NAO adicionar comparar grupo ainda (audit menciona mas escopo OUT). |
| **D6** | **RF-06 (L8) escopo:** state local `modalSortColumn: 'date' \| 'site' \| 'name' \| 'category' \| 'speed' \| 'buyIn' \| 'position' \| 'profit'` (default `'date'`) + `modalSortOrder: 'asc' \| 'desc'` (default `'desc'`). Cada `<TableHead>` vira `<TableHead onClick={...}>` com indicador `↑`/`↓` quando coluna ativa (use `<ChevronUp>`/`<ChevronDown>` 14px). Sort logica inline (sem helper externo) — torneios ja vem em memoria. NAO persistir sort do modal em URL (state efemero por dialog session). Reset para default ao fechar dialog (use `key={group.id}` no Dialog para reset state). |
| **D7** | **RF-07 (L9) escopo:** envolver o badge de confidence no modal (linha 961) com `<Tooltip>` + `<TooltipTrigger asChild>` + `<TooltipContent>` usando `getConfidenceTooltip(group.confidenceGrade)`. Mesmo padrao do card (linhas 799-810). Adicionar `<TooltipProvider>` no topo do `<DialogContent>` se ainda nao envolto (verificar — provider pode ja estar no app shell). |
| **D8** | **RF-08 (L10) escopo:** mudar default de `period: "all"` para `period: "90d"` (linha 125). Manter opcao "Tudo" disponivel no array da linha 494-500. Atualizar query param hidratacao (RF-03): se URL nao tem `?period=...` use `90d` como fallback. **Atencao**: testes que esperavam `period: "all"` no state inicial vao quebrar — atualizar mocks/snapshots em `tests/integration` se houver. |
| **D9** | **RF-09 (L11) escopo:** refatorar bloco `if (isLoading)` (linhas 336-386) para refletir layout final: header (skeleton h-8) + 4 KPIs (linhas 343-353 ja OK) + bloco filtros expandidos (skeleton ~3 rows x 6 itens) + grid 4col (em vez de sidebar+3col). Manter componente `<Skeleton>` do shadcn. Densidade dos placeholders no grid deve casar com cards reais em compact mode (default). |
| **D10** | **RF-10 (L12) escopo:** substituir botao chevron isolado (linhas 692-704) por header de filtros (linha 446) com botao toggle alinhado a direita do `<h3>Filtros</h3>`. Texto: `<button>{filtersExpanded ? 'Ocultar filtros' : 'Mostrar filtros'} <ChevronUp/Down /></button>`. Estilo: `text-sm text-gray-400 hover:text-white` + icon. Remover chevron isolado do final do bloco. |
| **D11** | **RF-11 escopo (M3 deferido UI-QW-1):** atualizar `EMPTY_STATE_AREAS` em `client/src/components/ui/EmptyState.tsx` adicionando 2 entradas: `'library-filters-empty'` e `'library-no-groups'`. Substituir as 2 chamadas de EmptyState em `TournamentLibraryNew.tsx` (linhas 762, 772) usando `area="library-filters-empty"` (caso filtros zerados) e `area="library-no-groups"` (caso sem grupos). NAO REMOVER `'library'` do array — manter retrocompatibilidade caso outro consumidor use (so adicionar entries novas). |
| **D12** | **RF-12 escopo:** mudar a linha 293 do `activeFilterChips` (chip `roi`) de `tone: 'success'` para `tone: filters.roiFilter === 'negative' ? 'danger' : 'success'`. Para variantes `'high'` (ROI > 20%) e `'medium'` (0-20%), manter `'success'` (sao positivos). Caso `'positive'` = success. Caso `'negative'` = danger. Edge: caso `'all'` chip nem renderiza (ja gated). |
| **D13** | **RF-13 escopo (token accent novo):** adicionar entry `accent` em `_color` dentro de `client/src/lib/ui-tokens.ts` apos `action`: `accent: { text: 'text-purple-300', bg: 'bg-purple-500/15', border: 'border-purple-500/40' }`. Atualizar `Docs/conventions/ui-patterns.md` secao 2.3 para listar `accent` como 7o tone (uso: categorizacao secundaria, ex: tags de categorias do Library). Atualizar `tests/unit/lib/ui-tokens.test.ts` linha 141 para incluir `'accent'` no array de keys esperadas + adicionar entry `['accent']` no `describe.each` (linha 144-150). Atualizar tipo `ColorKey` automaticamente (deriva de `tokens.color`). Atualizar chip `categories` (linha 273) para usar `tone: 'accent'` em vez de `'neutral'`. |
| **D14** | **Risco contrato Foundation:** RF-13 muda contrato de `tokens.color` (6 -> 7 tones). Nenhum consumidor existente quebra (apenas `ColorKey` ganha mais 1 literal valido). Reviewer da Foundation tem que aprovar adicao — flag para `system-architect` adicionar nota no ADR-078 (revision history) ou criar ADR-083 leve "Token accent — extensao para categorizacao secundaria". Implementer escolhe abordagem conservadora: ADR amendment em ADR-078 secao "Historico de revisoes". |

---

## 4. Usuarios e Personas

| Persona | O que ganha com este sprint | Trigger principal |
|---|---|---|
| **End-user (jogador poker MTT)** | Pagina mais limpa (sem 7 cores conflitantes) + card mais legivel + sort persistido + virtualizacao para grinders veteranos com 200+ grupos | Acessa `/library` apos importar torneios |
| **Power user (grinder pro)** | Export CSV do modal + sort em URL para bookmarkar visoes ("ROI desc dos meus torneios") + density toggle para visao geral rapida | Workflow de analise semanal |
| **Usuario novo (1a semana)** | Default 90d filtra ruido de dados antigos + card compacto = menos overwhelming | Primeira visita pos-onboarding |
| **Agentes pipeline (impl/reviewer)** | Tokens canonicos + helpers Foundation = padrao consistente | Sprints futuros que tocam tabelas/filtros |

---

## 5. Requisitos Funcionais

### RF-01 (L1): Filtros uniformes (sem 7 gradientes)

**Descricao:** substituir 7 secoes de filtro base por estilo neutro uniforme; cor semantica so no chip/botao ATIVO via `tokens.color`.

**Regras de negocio:**
- Container de cada secao: `bg-gray-800/50 border border-gray-700 rounded-xl p-4` (sem `bg-gradient-*`).
- Header de secao: `<h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">{label}</h4>` SEM bullet colorido (`<div className="w-2 h-2 bg-{color}-500 rounded-full">`).
- Botoes inativos: `bg-poker-surface border border-gray-600 text-gray-300 hover:bg-gray-700`.
- Botoes ativos: aplicar classes de `tokens.color.{tone}.bg + tokens.color.{tone}.text + tokens.color.{tone}.border` conforme mapeamento D1.
- Mapeamento de tone: Periodo=`info`, Sites=`success`, Categorias=`accent` (RF-13), Velocidades=`warn`, ROI=`success`/`danger`/`info` conforme valor, Volume=`info`, Buy-in=`warn` (estilo do focus dos inputs).
- Heading geral dos filtros (linha 443) tambem perde gradient — vira `bg-poker-surface border border-gray-700`.

**Criterio de aceitacao:**
- [ ] Nenhuma classe `bg-gradient-*` permanece no bloco de filtros (linhas 443-705) — busca regex `bg-gradient` na pagina retorna 0 hits no bloco filtros (KPIs e card podem manter).
- [ ] Cada secao usa container `bg-gray-800/50 border border-gray-700 rounded-xl p-4`.
- [ ] Cada secao usa heading sem bullet colorido.
- [ ] Botao ativo aplica classes via `tokens.color.{tone}` (validavel via `data-tone` attribute em snapshot).
- [ ] Visual smoke test: bloco de filtros sem visual "carnaval".

### RF-02 (L3): Card compacto + density toggle

**Descricao:** card padrao mostra apenas 3 stats (ROI, Volume, Profit) + badge confidence + nome + site. Toggle global compact/detail persiste em localStorage. Detail mode mostra os 15 datapoints atuais.

**Regras de negocio:**
- State `densityMode: 'compact' | 'detail'` com default `'compact'`.
- Persistencia em `localStorage` chave `grindfy.library.density` (read no mount com fallback `'compact'`, write em toda mudanca).
- Toggle visivel na barra de controles (proximo ao sort dropdown na linha 720). Implementacao: 2 botoes lado a lado ou `<Tabs>` 2-options.
- Compact mode: renderiza apenas (a) header com badge+nome+site (linhas 796-820) + (b) bloco principal ROI/IC/Profit (linhas 822-839) + (c) grid Volume/ABI/Field SUBSTITUIDO por linha simples mostrando apenas Volume (em destaque) e Profit (linhas 841-855). Skip (d), (e) (f) tags e (g) outlier alert.
- Detail mode: renderiza tudo como hoje (manter linhas 822-916 inalteradas).
- Modal de detalhe (Dialog) mantem tudo sempre — independente de density mode.

**Criterio de aceitacao:**
- [ ] State inicial respeita `localStorage.getItem('grindfy.library.density')` ou `'compact'`.
- [ ] Toggle dispara `localStorage.setItem` na mudanca.
- [ ] Compact mode: card renderiza apenas badge confidence + nome + site + ROI + Profit + Volume (validavel via `data-testid="library-card-compact"` ou ausencia de elementos detail).
- [ ] Detail mode: card renderiza todos 15 datapoints (mesmo comportamento atual).
- [ ] Modal abre normalmente em ambos modes (click no card mantem trigger).
- [ ] Toggle tem `data-testid="library-density-toggle"`.

### RF-03 (L5): Persistir sort em URL

**Descricao:** `sortBy` e `sortOrder` viram query params da URL. Permite bookmark + share + back/forward.

**Regras de negocio:**
- Query params: `?sort={confidence,roi,totalProfit,volume,avgProfit,sdBuyins,normalizedPosition,finalTableRate}` + `&order={asc,desc}`.
- Hidratacao: ler URL no mount via `useLocation`; usar `URLSearchParams(location.search)` ou `useSearch` (Wouter).
- Default: `sort=confidence&order=desc` (mantem hoje). Quando params ausentes, NAO escreve URL (so renderiza com defaults).
- Atualizacao: `setLocation` com `replace: true` (nao polui browser history).
- Validacao: se URL tiver `sort` invalido, fallback para `confidence` silently.

**Criterio de aceitacao:**
- [ ] Mudar sort dropdown -> URL muda imediatamente (validavel via `window.location.search`).
- [ ] Refresh com `?sort=roi&order=asc` -> dropdown mostra ROI + arrow ↑.
- [ ] Sort invalido (`?sort=foo`) -> fallback para `confidence` sem erro.
- [ ] Back button do browser nao volta para state anterior do sort (replace evita historico).

### RF-04 (L6): Virtualizacao quando >50 grupos

**Descricao:** usar `@tanstack/react-virtual` para renderizar somente cards visiveis quando ha muitos grupos.

**Regras de negocio:**
- Dependencia nova: `@tanstack/react-virtual` v3.x. Adicionar em `package.json` (PERGUNTAR ao founder antes do commit conforme contrato — mas spec ja autoriza).
- Aplicar quando `filteredAndSortedGroups.length > 50`. Senao render direto (zero overhead).
- Implementacao: `useVirtualizer` com `count`, `getScrollElement` (ref do container scroll), `estimateSize` (320px detail, 200px compact).
- Suportar grid responsivo: usar `lanes` para 1/2/3/4 colunas (matching breakpoints `md`/`lg`/`xl`).
- Se complexidade for >2h em paralelo (lanes), implementer pode FALLBACK para virtualizacao 1-coluna (mais simples) e documentar tradeoff em comentario inline + PR. Founder aceita degradacao visual se ganho de perf for evidente.
- Container scroll: `<div ref={scrollRef} className="overflow-auto" style={{ height: 'calc(100vh - 400px)' }}>` ou similar — definir altura para virtualizer funcionar.

**Criterio de aceitacao:**
- [ ] Com <50 grupos: comportamento atual (sem virtualizer).
- [ ] Com >50 grupos: DOM renderiza apenas cards visiveis + buffer (validavel via `document.querySelectorAll('[data-testid^="library-card"]').length < total`).
- [ ] Scroll fluido (no smoke test manual com mock de 200 grupos).
- [ ] Sem layout shift entre rows.

### RF-05 (L7): Export CSV no modal de detalhe

**Descricao:** botao "Exportar CSV" no header do modal exporta lista de torneios do grupo.

**Regras de negocio:**
- Botao no `<DialogHeader>` linha 922-940, lado direito do `<DialogTitle>`. Estilo: `<Button variant="outline" size="sm">` com icone `<Download className="w-4 h-4 mr-2" />`.
- Headers fixos: `['Data', 'Site', 'Nome', 'Tipo', 'Velocidade', 'Buy-in', 'Posicao/Total', 'Profit']`.
- Rows iteram `group.tournaments`:
  - Data: `new Date(t.datePlayed).toLocaleDateString('pt-BR')`
  - Site: `t.site`
  - Nome: `t.name`
  - Tipo: `t.category`
  - Velocidade: `t.speed`
  - Buy-in: `formatCurrency(parseFloat(String(t.buyIn)))`
  - Posicao/Total: `${t.position || '-'}/${t.fieldSize || '-'}`
  - Profit: `formatCurrency(parseFloat(String(t.prize)))`
- Helpers: `buildCSVContent(headers, rows)` + `getExportFilename(\`library-${slug(group.groupName)}\`, 'all', 'csv')`.
- Trigger download: `Blob` + `URL.createObjectURL` + `<a download>` programatico.

**Criterio de aceitacao:**
- [ ] Botao com `data-testid="library-modal-export-csv"` visivel no header do modal.
- [ ] Click dispara download de arquivo `.csv` com nome `grindfy-library-{slug}-all.csv`.
- [ ] CSV contem headers corretos + linhas com dados sanitizados (use `sanitizeForCSV` de export-helpers).
- [ ] BOM UTF-8 incluido (Excel-compativel).

### RF-06 (L8): Sortable headers no modal

**Descricao:** tabela do modal (linha 992-1054) ganha sort por click em cada `<TableHead>`.

**Regras de negocio:**
- State local no Dialog: `modalSortColumn` (default `'date'`) + `modalSortOrder` (default `'desc'`).
- Cada `<TableHead>` vira clickable com `cursor-pointer hover:text-white` + indicador (`<ChevronUp>` ou `<ChevronDown>` 14px) quando coluna ativa.
- Click na mesma coluna: toggle order (desc -> asc -> desc).
- Click em outra coluna: muda coluna + reseta para `desc`.
- Logica de sort inline no `.sort()` (linha 1008): switch por coluna.
- NAO persistir em URL (state efemero por dialog).
- Reset state ao fechar dialog: usar `key={group.id}` no `<Dialog>` (forca re-mount).

**Criterio de aceitacao:**
- [ ] Cada coluna da tabela tem `data-testid="library-modal-sort-{column}"`.
- [ ] Click em coluna nova: ordena por aquela coluna desc.
- [ ] Click em coluna ativa: toggle desc/asc.
- [ ] Indicador visual ↑/↓ aparece apenas na coluna ativa.
- [ ] Fechar/reabrir dialog reseta para `date` desc.

### RF-07 (L9): Tooltip confidence no modal

**Descricao:** badge de confidence no modal (linha 961) ganha tooltip igual ao card.

**Regras de negocio:**
- Envolver o badge `<div className={confidenceGradeColors[group.confidenceGrade]}>{group.confidenceGrade}</div>` com `<Tooltip><TooltipTrigger asChild><div>...</div></TooltipTrigger><TooltipContent>{getConfidenceTooltip(group.confidenceGrade)}</TooltipContent></Tooltip>`.
- Garantir `<TooltipProvider>` no escopo (verificar app shell ou adicionar local).

**Criterio de aceitacao:**
- [ ] Hover no badge confidence do modal mostra tooltip com texto identico ao do card.
- [ ] Tooltip usa o mesmo helper `getConfidenceTooltip` que o card.

### RF-08 (L10): Default periodo = 90d

**Descricao:** state inicial de `period` muda de `"all"` para `"90d"`.

**Regras de negocio:**
- Linha 125: `period: "90d"` em vez de `period: "all"`.
- Manter opcao `"Tudo"` no array de filtros (usuario pode escolher manualmente).
- Hidratacao via URL (RF-03): se `?period=all` na URL, respeitar (nao forcar 90d).
- Testes existentes que esperavam `period: "all"` precisam ser ATUALIZADOS (ver Riscos).

**Criterio de aceitacao:**
- [ ] State inicial de `filters.period` = `"90d"` quando URL nao especifica.
- [ ] Botao "Ultimos 3M" aparece como ativo no mount inicial.
- [ ] Mudar para "Tudo" funciona normalmente.

### RF-09 (L11): Skeleton match layout

**Descricao:** loading skeleton reflete layout final (4 KPIs + filtros + grid 4col).

**Regras de negocio:**
- Bloco `if (isLoading)` linhas 336-386.
- Manter: header h-8 + 4 KPIs (linhas 343-353).
- Adicionar: bloco filtros expandido (skeleton de container + 6 secoes em grid 1x3 + 1x3) — match estrutura RF-01.
- Substituir: sidebar 1col + 6 cards 3col -> grid 4 colunas com 8-12 cards skeleton (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`).
- Card skeleton em compact mode (default): altura ~200px, com header + bloco principal.

**Criterio de aceitacao:**
- [ ] Sem layout shift visivel entre loading e content (smoke test).
- [ ] Skeleton render usa `<Skeleton>` shadcn (sem novos primitivos).
- [ ] Grid de cards skeleton matches `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` (igual ao real).

### RF-10 (L12): Botao toggle filtros mais visivel

**Descricao:** substituir chevron isolado por header com label.

**Regras de negocio:**
- Remover bloco linhas 692-704 (botao chevron isolado).
- Adicionar botao no header dos filtros (apos `<h3>Filtros</h3>` linha 451): `<button onClick={...} className="text-sm text-gray-400 hover:text-white flex items-center gap-1">{filtersExpanded ? 'Ocultar' : 'Mostrar'} <Chevron... /></button>`.
- Posicionar no flex right do header (alinhado com search/clear).

**Criterio de aceitacao:**
- [ ] Botao toggle visivel no header com texto "Mostrar filtros" / "Ocultar filtros".
- [ ] `data-testid="library-filters-toggle"`.
- [ ] Click expande/colapsa secao igual hoje.
- [ ] Bloco antigo (chevron isolado linha 692-704) removido.

### RF-11: EmptyState area granular

**Descricao:** expandir `EMPTY_STATE_AREAS` em `client/src/components/ui/EmptyState.tsx` para distinguir 2 cenarios do Library.

**Regras de negocio:**
- Adicionar `'library-filters-empty'` e `'library-no-groups'` ao array `EMPTY_STATE_AREAS` em `client/src/components/ui/EmptyState.tsx`.
- NAO REMOVER `'library'` do array (retrocompat).
- Atualizar 2 chamadas em `TournamentLibraryNew.tsx`:
  - Linha 762 (filtros zerados): `area="library-filters-empty"`.
  - Linha 772 (sem grupos): `area="library-no-groups"`.

**Criterio de aceitacao:**
- [ ] `EMPTY_STATE_AREAS` contem `'library-filters-empty'` e `'library-no-groups'`.
- [ ] `EMPTY_STATE_AREAS` ainda contem `'library'` (retrocompat).
- [ ] As 2 chamadas em TournamentLibraryNew usam areas granulares.
- [ ] Testes existentes de EmptyState continuam passando.

### RF-12: Tone semantico no chip ROI

**Descricao:** chip de filtro ROI usa `danger` quando filtro = "negative" ("Prejuizo"), senao `success`.

**Regras de negocio:**
- Linha 293 do array `activeFilterChips`: mudar `tone: 'success'` para `tone: filters.roiFilter === 'negative' ? 'danger' : 'success'`.
- Casos `'positive'`, `'high'`, `'medium'`: tone `success`.
- Caso `'negative'`: tone `danger`.
- Caso `'all'`: chip nem renderiza (ja gated linha 283).

**Criterio de aceitacao:**
- [ ] Filtro ROI = "Prejuizo" -> chip renderiza com `data-tone="danger"`.
- [ ] Filtro ROI = "Lucrativos" / "ROI > 20%" -> chip renderiza com `data-tone="success"`.

### RF-13: Token `accent` em ui-tokens

**Descricao:** adicionar 7o tone semantico `accent` (purple-based) para categorizacao secundaria.

**Regras de negocio:**
- Editar `client/src/lib/ui-tokens.ts` apos entry `action`:
  ```ts
  accent: {
    text: 'text-purple-300',
    bg: 'bg-purple-500/15',
    border: 'border-purple-500/40',
  },
  ```
- Atualizar `Docs/conventions/ui-patterns.md` secao 2.3 — tabela de tones semanticos: adicionar linha `accent` com descricao "Categorizacao secundaria, tags exoticas, destaque pontual sem semantica de sucesso/risco" + exemplo "Categorias do Library, badges de subgrupo".
- Atualizar `tests/unit/lib/ui-tokens.test.ts`:
  - Linha 141: `expect(keys).toEqual(['accent', 'action', 'danger', 'info', 'neutral', 'success', 'warn']);`.
  - Linha 144-150: adicionar `['accent']` no array do `describe.each`.
  - Linha 334: adicionar `'accent'` no array `keys: ColorKey[]`.
- Atualizar chip `categories` em TournamentLibraryNew (linha 273) para `tone: 'accent'`.
- Atualizar mapeamento RF-01 D1: Categorias usa tokens.color.accent quando ativo.
- ADR-078 amendment: adicionar entrada na "Historico de revisoes" mencionando expansao para 7 tones.

**Criterio de aceitacao:**
- [ ] `tokens.color.accent` existe com `{ text, bg, border }`.
- [ ] `ColorKey` inclui `'accent'` (typecheck).
- [ ] Testes ui-tokens passam com 7 tones.
- [ ] `tokens.color.accent` eh frozen (deep freeze test passa).
- [ ] `Docs/conventions/ui-patterns.md` documenta o novo tone.
- [ ] Chip `categories` no Library usa `tone: 'accent'`.

---

## 6. Requisitos Nao-Funcionais

- **Performance:** virtualizacao (RF-04) deve manter 60fps com 500+ grupos no smoke test (manual). Compact mode reduz nodes DOM por card em ~70% (15 stats -> 3).
- **Acessibilidade:** botoes toggle (RF-02 density, RF-10 filtros) tem `aria-label` descritivo e `data-testid` estavel. Sortable headers (RF-06) tem `aria-sort="ascending|descending|none"`.
- **Compatibilidade:** RF-13 nao quebra contrato (apenas adiciona). Consumidores que iteram `Object.keys(tokens.color)` ganham 1 entry adicional.
- **localStorage tolerance:** RF-02 deve tolerar `localStorage` indisponivel (SSR / private mode) — try/catch com fallback `'compact'`.
- **URL tolerance:** RF-03 deve tolerar `URLSearchParams` ausente (SSR) e params invalidos sem throw.
- **Dependencias novas:** apenas `@tanstack/react-virtual` (RF-04). Tamanho bundle ~5KB gzipped.

---

## 7. Endpoints Previstos

Nenhum endpoint backend novo. Pagina consome `GET /api/tournament-library-grouped` ja existente.

---

## 8. Modelos de Dados Afetados

Nenhuma migration. Mudanca apenas frontend.

**Localstorage:**
- `grindfy.library.density`: string `'compact'` | `'detail'` (RF-02).

**URL state:**
- `?sort={...}&order={asc,desc}` (RF-03).
- `?period={all,month,year,90d,180d,365d}` (RF-08 + RF-03 hidratacao).

---

## 9. Integracoes Externas

Nenhuma.

---

## 10. Cenarios de Teste Derivados

### Happy Path

- [ ] Pagina carrega com period=`90d` por default (RF-08).
- [ ] Filtros renderizam em estilo neutro uniforme (RF-01).
- [ ] Cards renderizam em compact mode default (RF-02).
- [ ] Toggle compact/detail muda visualmente (RF-02).
- [ ] Mudar sort dropdown atualiza URL (RF-03).
- [ ] Modal de detalhe abre com export CSV button (RF-05).
- [ ] Click em coluna do modal sorta tabela (RF-06).
- [ ] Tooltip aparece no badge confidence do modal (RF-07).

### Validacao de input

- [ ] URL `?sort=invalid` -> fallback para `confidence` sem erro (RF-03).
- [ ] localStorage corrompido (`grindfy.library.density='foo'`) -> fallback para `'compact'` (RF-02).
- [ ] `URLSearchParams` indisponivel (SSR) -> defaults aplicados sem throw (RF-03).

### Regras de negocio

- [ ] Chip ROI "Prejuizo" renderiza com `data-tone="danger"` (RF-12).
- [ ] Chip ROI "Lucrativos" renderiza com `data-tone="success"` (RF-12).
- [ ] Chip Categorias renderiza com `data-tone="accent"` (RF-13).
- [ ] EmptyState com filtros aplicados usa `area="library-filters-empty"` (RF-11).
- [ ] EmptyState sem grupos usa `area="library-no-groups"` (RF-11).
- [ ] CSV exportado contem 8 colunas + BOM UTF-8 (RF-05).
- [ ] Sort do modal reseta ao fechar/reabrir (RF-06).

### Edge Cases

- [ ] >50 grupos: virtualizer ativa, DOM renderiza so visiveis (RF-04).
- [ ] <=50 grupos: virtualizer inativo, render direto (RF-04).
- [ ] localStorage write falha (quota exceeded): nao crasha (RF-02).
- [ ] Refresh com `?sort=roi&order=asc` -> dropdown reflete (RF-03).
- [ ] Mudar density mode com modal aberto: modal continua mostrando tudo (RF-02).
- [ ] Dialog fechado e reaberto: sort do modal reseta para `date` desc (RF-06).
- [ ] `tokens.color.accent` mutavel? Nao (frozen test) (RF-13).

### Testes ui-tokens (RF-13)

- [ ] `Object.keys(tokens.color).sort()` retorna 7 entries incluindo `'accent'`.
- [ ] `tokens.color.accent.text` matches regex `/text-purple/`.
- [ ] `tokens.color.accent.bg` matches regex `/bg-purple/`.
- [ ] `tokens.color.accent.border` matches regex `/border-purple/`.
- [ ] `Object.isFrozen(tokens.color.accent)` retorna `true`.

### Regressao

- [ ] Foundation tests (75/75) continuam passando — incluindo ui-tokens com 7 tones.
- [ ] Suite global nao perde testes verdes.
- [ ] Chips canonicos do Library renderizam com tones corretos.
- [ ] EmptyState legacy `area="library"` continua funcionando.

---

## 11. Fora de Escopo

Para evitar scope creep, este sprint NAO faz:

- Comparar grupos (audit menciona "Comparar com outro grupo" no RF-05 — adiar para sprint futuro de analytics).
- Filter chips abaixo do filter panel duplicar (audit L2 menciona "manter so chips no topo" — ja resolvido pelo UI-QW-1 RF-07).
- Refatoracao do helper `tooltip-helpers.ts` ou `filter-helpers.ts` (manter como esta).
- Refatoracao de `getLibrarySiteColor` / `getLibraryCategoryColor` / `getLibrarySpeedColor` (preservar).
- Migrar empty states de Studies/Biblioteca (escopo Studies polish).
- Adicionar filtros novos (data range custom, search por nome de torneio, etc).
- Volatility label inline (audit P2 — manter so tooltip por enquanto, audience pro).
- Mudancas em backend (`/api/tournament-library-grouped` permanece como esta).
- Tutoriais ou onboarding inline (escopo Upload).
- E2E tests (Cypress/Playwright) — apenas unit + integration via Vitest.
- ADR formal para virtualizacao (decisao tatica, documentar inline em comentario).
- ADR formal novo para token `accent` — usa AMENDMENT em ADR-078.

---

## 12. Dependencias

**Pre-requisitos atendidos:**
- Sprint UI-FND-1 (Foundation) — `tokens`, `EmptyState`, `FilterChip` em main.
- Sprint UI-QW-1 (Quick Wins) — chips canonicos + EmptyState canonico ja aplicados em TournamentLibraryNew.

**Pre-requisitos novos:**
- `@tanstack/react-virtual` v3.x — instalar via `npm install` (PERGUNTAR ao founder antes de commit do package.json).

**Bloqueia:**
- Nada. Sprint independente. Stats analyzer (paralelo) NAO toca esses arquivos.

**Bloqueado por:**
- Nada.

---

## 13. Riscos e Mitigacoes

| Risco | Probabilidade | Impacto | Mitigacao |
|---|---|---|---|
| RF-04 virtualizacao introduz bug visual em grid responsivo (lanes) | Media | Medio | Implementer pode fallback para 1-coluna virtualizer se >2h. Documentar tradeoff. Reviewer revisa. |
| RF-13 mudanca de contrato `tokens.color` quebra outros consumidores | Baixa | Alto (tokens sao Foundation) | Apenas adicao (nao remocao). `ColorKey` ganha 1 literal valido. Test de Foundation passa antes/depois. ADR amendment em ADR-078. Reviewer faz double-check. |
| RF-08 mudanca de default `period` quebra testes existentes | Alta | Baixo | test-writer audita testes de integracao em `tests/integration` que mockem Library. Atualizar antes do implementer. |
| RF-04 dep `@tanstack/react-virtual` aumenta bundle | Baixa | Baixo | ~5KB gzipped. Aceito como tradeoff por performance. |
| RF-02 density mode cache localStorage corrompe entre updates | Baixa | Baixo | Validacao de valor lido (whitelist `'compact'|'detail'`), fallback `'compact'`. |
| Card compact rompe testes que checam datapoint visibilidade | Media | Medio | Tests devem usar `data-testid` por modo (`library-card-compact` vs `library-card-detail`). test-writer cria abstracao. |
| RF-03 URL update conflita com Wouter routing | Baixa | Medio | Usar `setLocation` com `replace: true` + `useSearch` ou direto `window.location.search`. Smoke test back/forward. |
| Modal sortable headers (RF-06) sort instavel se `tournaments` mutar | Baixa | Baixo | Sort eh client-side, dados estaticos no contexto do modal. Memoizar com `useMemo([modalSortColumn, modalSortOrder, group.tournaments])`. |
| Tone `accent` purple-300 conflita com Tailwind config existente | Baixa | Baixo | `purple-*` eh paleta default Tailwind, sem custom. Smoke check. |

---

## 14. Notas de Implementacao

### Ordem sugerida (TDD-friendly)

1. **RF-13** (token accent) — base para outras mudancas. Atualiza testes antes.
2. **RF-11** (EmptyState area) — Foundation extension simples.
3. **RF-12** (chip ROI tone) — 1 linha de codigo.
4. **RF-08** (default 90d) — 1 linha + atualizar testes.
5. **RF-01** (filtros uniformes) — refactor visual significativo.
6. **RF-02** (card compact + density) — feature nova, abstrair em sub-componente se card crescer.
7. **RF-09** (skeleton matching) — alinha com RF-01 e RF-02.
8. **RF-10** (toggle filtros visivel) — pequeno.
9. **RF-03** (sort em URL) — feature nova com estado.
10. **RF-05** (export CSV modal) — isolado.
11. **RF-06** (sortable headers modal) — isolado.
12. **RF-07** (tooltip confidence modal) — pequeno.
13. **RF-04** (virtualizacao) — POR ULTIMO (afeta performance, mais complexo).

### Sub-componentes sugeridos

Se TournamentLibraryNew crescer demais, extrair:
- `client/src/components/tournament-library/LibraryCard.tsx` — card (recebe `densityMode` prop).
- `client/src/components/tournament-library/LibraryFilters.tsx` — bloco de filtros (RF-01).
- `client/src/components/tournament-library/LibraryGroupModal.tsx` — modal de detalhe (RF-05/06/07).

NAO obrigatorio. Implementer decide se ficar acima de 1300 linhas.

### Testes prioritarios

- `tests/unit/lib/ui-tokens.test.ts` — atualizar para 7 tones (RF-13).
- `tests/integration/components/EmptyState.test.tsx` — validar areas novas (RF-11).
- `tests/integration/pages/TournamentLibraryNew.test.tsx` (criar se nao existir) — testes E2E light:
  - density toggle mudou DOM
  - sort URL persistencia
  - export CSV trigger
  - modal sortable headers
  - tooltip confidence modal

### Lessons aplicadas

- **#1 Hooks first:** todos `useState`/`useEffect`/`useMemo` ANTES de qualquer early return.
- **#2 data-testid estavel:** novos testids canonicos: `library-density-toggle`, `library-card-compact`, `library-card-detail`, `library-modal-export-csv`, `library-modal-sort-{column}`, `library-filters-toggle`.
- **#9 try/catch logue antes:** localStorage falhas devem `console.debug` em dev (gate `NODE_ENV !== 'production'`).
- **#11 sem default decorativo:** density toggle precisa onChange handler real, nao decorativo.
- **#12 estado persistente:** density mode em localStorage sobrevive a re-mount; sort em URL sobrevive a refresh.

---

## 15. Decisoes Pendentes do Founder

**Apenas 1 decisao critica antes de implementar:**

1. **Approve dep `@tanstack/react-virtual`** (RF-04) — instalar nova dep no package.json. Custo bundle: ~5KB gzipped. Alternativa: `react-window` (similar, mesma idade). Sugestao: `@tanstack/react-virtual` (mantenedor TanStack alinhado com `react-query` ja em uso).

**Decisoes ja tomadas via D1-D14 (PM autoriza implementer prosseguir sem perguntar):**

- D2: density default = `compact` + persistencia localStorage.
- D8: default periodo = `90d` (mudanca de comportamento documentada).
- D13: token `accent` purple-based + ADR amendment em ADR-078.
- D14: ADR amendment em vez de ADR novo.

---

## 16. Estimativa de Esforco

**Implementer:** ~5 dias (40h) total.

| Bloco | RFs | Estimativa |
|---|---|---|
| Foundation extension | RF-11, RF-12, RF-13 | 3h |
| Filtros uniformes + skeleton | RF-01, RF-09 | 6h |
| Card compact + density toggle | RF-02 | 8h |
| URL state + default 90d | RF-03, RF-08, RF-10 | 5h |
| Modal enhancements | RF-05, RF-06, RF-07 | 6h |
| Virtualizacao | RF-04 | 6h (pode esticar para 8h se grid responsivo complexo) |
| Tests novos / atualizacao mocks | todos | 4h |
| Smoke test + ajustes finais | - | 2h |

**Pipeline completo:** ~7 dias (test-writer 1d + implementer 5d + reviewer 1d).

---

## 17. Definition of Done

- [ ] 13 RFs implementados conforme criterios de aceitacao.
- [ ] Foundation tests (75/75) verde — incluindo 7 tones em ui-tokens.
- [ ] Tests do TournamentLibraryNew (novos + existentes adaptados) verde.
- [ ] Smoke test manual: pagina `/library` renderiza sem erro em compact e detail mode.
- [ ] Smoke test manual: 200+ grupos mockados scrolla suave.
- [ ] Smoke test manual: refresh com `?sort=roi&order=asc&period=all` hidrata UI.
- [ ] Smoke test manual: export CSV download arquivo valido em Excel.
- [ ] ADR-078 amendment em "Historico de revisoes" mencionando 7o tone `accent`.
- [ ] `Docs/conventions/ui-patterns.md` secao 2.3 atualizada (7 tones + decisao tree).
- [ ] Reviewer APPROVED.
- [ ] Founder QA visual aprovado.

---

**Fim da Spec UI-T1-Library v1.0.**
