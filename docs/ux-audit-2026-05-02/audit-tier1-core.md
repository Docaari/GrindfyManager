# UX Audit — Tier 1 Core (Home, Dashboard)

Data: 2026-05-02. Base: `ux-research-reference.md`.

Severidade: **P0** (quebra usuario) | **P1** (impacta diariamente) | **P2** (polimento) | **P3** (nice-to-have)
Esforco: L (low <2h) / M (med <1d) / H (high >1d)

---

## 1. Home (`/` ou `/home`) — `Home.tsx`

### Contexto
Hub pos-login. Mostra greeting + 3 stats + grid 4 ferramentas + onboarding 4-passos + "em desenvolvimento" + footer CTAs + cards Discord/Email.

### Achados

#### P1 — Hierarquia visual plana e diluida
- **Problema**: 5 secoes empilhadas com mesmo peso visual (Welcome / Main Tools / Onboarding / Coming Soon / Footer / Contato). Total ~512 linhas, scroll longo. Usuario nao sabe onde olhar primeiro.
- **Anti-pattern**: 2.6 (hierarquia plana).
- **Fix**: 1 hero + 1 acao primaria. Ferramentas vira sidebar acessivel (ja existe). Manter so:
  1. Greeting + stats (compacto)
  2. **Card unico de "Proxima acao recomendada"** (decidida via state do user — ex: "Voce tem 3 sessoes pendentes pra reconciliar")
  3. Grid de 4 tools (ja ok, mas reduzir padding)
  4. Onboarding so se nao completo (esconder se completed === 4)
  5. Discord/Email no footer compacto (1 linha, nao 2 cards grandes)

#### P1 — Onboarding mostra mesmo apos completo
- **Problema**: Secao "Como Comecar" sempre renderiza, mesmo apos usuario ter 100+ torneios + sessoes + grade. Vira lixo permanente.
- **Linha**: `121-158`, sem condicional global.
- **Fix**: Hide se todos `step.completed === true`. Adicionar checklist progress bar no topo (`3/4 passos`). Quando completo, esconder secao com microinteraction de "Onboarding completo!".

#### P2 — Stats nao tem contexto temporal nem variacao
- **Problema**: "47 Torneios Upados" e "12 Sessoes Registradas" sao numeros mortos, sem comparacao (ex: vs semana passada) nem trend (sparkline).
- **Anti-pattern**: 1.9 (graficos sem comparacao).
- **Fix**: Stat cards com sparkline 7d + delta `+12 essa semana`. Reusar `Sparkline` component (ja existe).

#### P2 — "Em Desenvolvimento" mostra coisas que nao existem
- **Problema**: Cards "Calendario" + "Relatorios Avancados" com `cursor-not-allowed` opacity-60 sao ruido. Promessa vazia. Linhas 108-119, 350-385.
- **Anti-pattern**: 2.10 (genericos).
- **Fix**: REMOVER secao OU substituir por **changelog** ("Novidades de abril: Bankroll v2, Coach IA, Biblioteca"). Promete o que existe, nao o que nao existe.

#### P2 — CTA footer duplica navegacao
- **Problema**: 3 botoes "Importar Dados / Ver Dashboard / Iniciar Grind" no footer (linhas 387-414) sao identicos aos cards de cima e a sidebar. Triplica o mesmo destino.
- **Fix**: Remover secao footer ou substituir por **shortcut bar** (atalhos teclado: `K` busca, `G H` home, etc).

#### P2 — Cards principais com hover inflado (scale 1.02)
- **Problema**: `hover:scale-[1.02]` em todos cards principais. Em pagina com 6+ cards, sensacao de instabilidade. Mobile = sem hover, perde affordance.
- **Linha**: 263, 305, 435, 471.
- **Fix**: Remover scale. Usar so border + shadow change. Mais sutil = mais profissional.

#### P2 — Greeting com emoji + tipografia inconsistente
- **Problema**: `🎯` no h1 quebra hierarquia tipografica. Emoji em h2 ferramentas (`📈🌐💰🏷️⚡📅👥🥇`) idem.
- **Anti-pattern**: 2.10 (sem personalidade) + inconsistencia.
- **Fix**: Usar emoji deliberadamente OU nunca. Definir regra. Sugest: emoji so em onboarding e empty state, NAO em h1/h2.

#### P3 — `WelcomeNameModal` so pede nome
- **Problema**: Onboarding inicial pede so nome. Perde chance de coletar: rede preferida, ABI medio, objetivo (ROI vs volume).
- **Fix**: Wizard 3 passos (nome -> rede principal -> ABI). Esses dados alimentam recomendacao do Coach desde dia 1.

#### P3 — Erro state generico
- **Problema**: Linha 160-174. So mostra "Erro ao carregar dados" + retry. Nao distingue: rede caiu vs server 500 vs nao-autorizado. Sem fallback offline.
- **Fix**: Mensagem por status code. Adicionar link "Sugerir bug" inline.

#### P3 — Loading skeleton nao bate com layout final
- **Problema**: Skeleton (linhas 176-209) mostra 4 cards 48h cada, mas layout real tem 4 cards de altura variavel + secoes abaixo. CLS vai acontecer.
- **Fix**: Skeleton matchando layout exato (incluindo onboarding + coming soon).

### Recomendacoes Acionaveis Home

| # | Acao | Severidade | Esforco | Impacto |
|---|------|------------|---------|---------|
| H1 | Esconder onboarding apos completo + add progress bar | P1 | L | High |
| H2 | Substituir "Em Desenvolvimento" por changelog ou remover | P2 | L | Med |
| H3 | Remover secao footer CTAs duplicada | P2 | L | Med |
| H4 | Adicionar sparkline + delta nos 3 stats | P2 | M | High |
| H5 | Card "Proxima acao recomendada" baseado em state | P1 | M | High |
| H6 | Remover hover:scale-[1.02] | P2 | L | Low |
| H7 | Padronizar uso de emoji (banir h1/h2) | P2 | L | Med |
| H8 | Onboarding wizard expandido (nome + rede + ABI) | P3 | M | Med |
| H9 | Skeleton match layout final | P3 | L | Low |
| H10 | Erro state com mensagem por status | P3 | L | Low |

---

## 2. Dashboard (`/dashboard`) — `Dashboard.tsx`

### Contexto
Pagina analitica core. 580 linhas. 8 tabs (`Geral, Site, ABI, Tipo, Velocidade, Periodo, Participantes, Posicao`). 11 useQueries. Filters globais (date range, sites, categorias, speeds, keyword, participantes). Bankroll widget + ROI por plataforma + Tickets widget no topo. Insight Mental + Splash "Bom dia" gating.

### Achados

#### P1 — Densidade visual extrema sem hierarquia
- **Problema**: Topo carrega: title + filters + bankroll widget + ROI plataforma + tickets widget + dashboard metrics + mental insight + tabs + tab content. 9 secoes em sequencia. Sem visual grouping nem dividers significativos.
- **Anti-pattern**: 2.6 (cards aninhados implicitos), 2.11 (densidade errada).
- **Fix**: 
  - Mover Bankroll/ROI/Tickets pra **sidebar de widgets a direita** (collapsible) OU agrupar em "Resumo Financeiro" expandivel.
  - Topo focado: titulo + filtros + metricas core + tabs (so isso).

#### P1 — Filtros sem indicacao de "filtros ativos"
- **Problema**: `DashboardFilters` controla muito (period, sites[], categories[], speeds[], keyword, dateFrom, dateTo, participantMin/Max). Nao vejo no codigo principal um chip/badge mostrando "3 filtros ativos" nem reset rapido.
- **Anti-pattern**: 1.7 (filter pill UI ausente).
- **Fix**: Acima das tabs, mostrar chips removiveis: `[WPN x] [ABI $5-$20 x] [Maio 2026 x]` + botao "Limpar todos".

#### P1 — 8 tabs sem prioridade visual
- **Problema**: Tab list horizontal com 8 itens (linha 115-124). Mobile = scroll horizontal sem indicador. Cada tab tem icone + emoji + nome — visualmente carregado.
- **Anti-pattern**: 2.6 + saturacao.
- **Fix**:
  - Reduzir tabs primarios pra 4 (Geral, Site, ABI, Periodo). Resto vira dropdown "Mais analises".
  - Remover emoji das tabs. Manter so icone + texto.
  - Persistir tab ativa em URL (ja faz, ok). Adicionar atalhos teclado `1-8`.

#### P1 — Splash "Bom dia" pode esconder dashboard sem affordance de override
- **Problema**: Linha 64-73. Se `dashboardSnoozedUntil > now`, retorna SO splash. Sem botao "Ver dashboard mesmo assim" / "Cancelar snooze".
- **Anti-pattern**: 2.13 (estados intermediarios) + falta de escape.
- **Fix**: Splash deve ter CTA secundario "Ver dashboard hoje" que cancela snooze.

#### P2 — Mental insight card sem acao
- **Problema**: Linha 506-517. Card mostra insight ("ROI 18% com foco >=7 vs 3% com foco <5"). So tem botao X (dismiss). Sem CTA pra "Ver detalhes" / "Comecar warm-up".
- **Anti-pattern**: 2.3 (CTA fraco).
- **Fix**: Adicionar `[Ver no Warm-Up]` ou `[Ver historico mental]` link inline.

#### P2 — Export dropdown enterrado
- **Problema**: Linha 526-547. Botao "Exportar" aparece SO ao lado das tabs, nao tem destaque. Posicao margin-bottom-12 mb-12 sugere hack.
- **Anti-pattern**: 2.1 (espacamento inconsistente, mb-12 magic).
- **Fix**: Mover pra header da pagina (top-right). Padrao: `[Periodo dropdown] [Filters] [Exportar]`.

#### P2 — Empty state em iframe-like card
- **Problema**: Linha 452-470. Quando `count === 0`, mostra card centrado com CTA "Importar Torneios". OK, mas roda no MEIO da pagina apos filters/widgets. Confusing.
- **Fix**: Quando `hasNoData`, esconder TUDO abaixo (filters, tabs, widgets) e mostrar SO empty state hero. Bankroll widget pode ficar.

#### P2 — Loading state inconsistente
- **Problema**: Algumas queries tem `isLoading` controlando skeletons (DashboardMetrics), outras nao (BankrollWidget, RoiByPlatformCard, TicketsWidget). Cada widget carrega no proprio tempo, layout shifts.
- **Fix**: Container suspenseboundary OU skeleton harmonizado.

#### P2 — Filtros + URL state sem deep-link friendly UI
- **Problema**: URL guarda state (FP-11), mas usuario nao tem botao "Compartilhar este dashboard" / "Copiar link". Sub-utiliza feature.
- **Fix**: Botao share que copia URL atual com filtros.

#### P3 — Sem `period` no titulo
- **Problema**: H1 "Performance Dashboard" e estatico. Nao reflete filtros aplicados. Usuario perde contexto: "estou vendo qual periodo?"
- **Fix**: Subtitulo dinamico: `"Maio 2026 • WPN, GG • $5-$20 ABI"`.

#### P3 — `tabTypeMap` e `tabNameMap` duplicados
- **Problema**: Linha 265-285. Dois maps com mesmas keys. Cheiro de DRY violado.
- **Fix**: Consolidar em `tabConfig: Record<tab, {type, displayName}>`.

#### P3 — Sem atalho keyboard pra filtros
- **Problema**: Power users repetem mesma sequencia de filtros toda manha (ex: WPN + Maio).
- **Fix**: Atalho `F` abre filters, `R` reseta, `1-8` troca tab. Persistir filtros frequentes como "Saved views".

#### P3 — Insight cooldown 7 dias pode ser surdez
- **Problema**: Linha 240-258. Dismiss = 7 dias mute. Se insight muda (ex: agora correlacao energia, antes era foco), cooldown cobre todos.
- **Fix**: Cooldown por TIPO de insight, nao global.

### Recomendacoes Acionaveis Dashboard

| # | Acao | Severidade | Esforco | Impacto |
|---|------|------------|---------|---------|
| D1 | Filter chips ativos + reset rapido | P1 | M | High |
| D2 | Reagrupar widgets topo (Bankroll/ROI/Tickets) | P1 | M | High |
| D3 | Reduzir tabs visiveis pra 4 + dropdown | P1 | M | Med |
| D4 | Splash com CTA "Ver dashboard hoje" | P1 | L | High |
| D5 | Empty state oculta widgets abaixo | P2 | L | Med |
| D6 | Mover Exportar pra header | P2 | L | Low |
| D7 | Mental insight com CTA acao | P2 | L | Med |
| D8 | Subtitulo dinamico com filtros aplicados | P3 | L | Med |
| D9 | Botao share/copy URL com filtros | P3 | L | Med |
| D10 | Atalhos teclado F/R/1-8 + Saved views | P3 | M | High |
| D11 | Skeleton harmonizado containers | P2 | M | Low |
| D12 | Consolidar tabTypeMap+tabNameMap | P3 | L | Low |
| D13 | Cooldown insight por tipo | P3 | L | Low |
