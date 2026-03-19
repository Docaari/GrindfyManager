# Fluxo: Dashboard de Performance e Analytics

## Trigger
Usuario acessa a pagina de Dashboard (`/dashboard`) para visualizar metricas de performance dos seus torneios.

## Atores
- Usuario autenticado (jogador)
- Express API (dashboard + analytics endpoints)
- PostgreSQL (Neon)

## Pre-condicoes
- Usuario autenticado com JWT valido
- Torneios importados no sistema (via upload CSV/XLSX)

## Caminho Principal (Happy Path)
1. Usuario acessa `/dashboard`
2. Frontend carrega stats gerais: GET `/api/dashboard/stats` com filtros de periodo
3. Backend consulta tournaments do usuario com filtros aplicados
4. Backend calcula metricas agregadas: profit total, ROI, volume, ABI medio, ITM%, final tables
5. Frontend renderiza cards de metricas (MetricsCard) e graficos (DynamicCharts via Recharts)
6. Usuario aplica filtros avancados:
   a. Periodo (7d, 30d, 90d, all-time, custom range)
   b. Site (PokerStars, GGPoker, etc)
   c. Categoria (Vanilla, PKO, Mystery)
   d. Faixa de buy-in
   e. Velocidade (Normal, Turbo, Hyper)
   f. Keyword (busca por nome de torneio)
7. Frontend recarrega dados com filtros: GET `/api/analytics/dashboard-stats`
8. Graficos atualizam em tempo real (React Query refetch)
9. Usuario navega entre abas de analytics:
   - Por site: GET `/api/analytics/by-site`
   - Por buy-in: GET `/api/analytics/by-buyin`
   - Por categoria: GET `/api/analytics/by-category`
   - Por dia da semana: GET `/api/analytics/by-day`
   - Por velocidade: GET `/api/analytics/by-speed`
   - Por mes: GET `/api/analytics/by-month`
   - Por tamanho de field: GET `/api/analytics/by-field`
   - Final tables: GET `/api/analytics/final-table`
10. Dashboard exibe graficos: evolucao de profit, distribuicao por categoria, ROI por stake, etc.

## Caminhos de Erro
- Nenhum torneio importado -> dashboard vazio com mensagem orientando upload
- Filtro retorna 0 resultados -> graficos vazios, metricas zeradas
- Falha na query (periodo invalido) -> 500 ou fallback para periodo padrao
- Token expirado -> refresh automatico pelo frontend

## Regras de Negocio
- Todas as queries filtram por `userId` (userPlatformId do JWT)
- Metricas calculadas:
  - Profit = soma(prize - buyIn) de todos os torneios
  - ROI = (profit / totalBuyIn) * 100
  - ABI = media dos buyIns
  - ITM% = (torneios com prize > 0) / total * 100
  - Volume = contagem de torneios
  - Final Tables = contagem de torneios com finalTable = true
  - Big Hits = contagem de torneios com bigHit = true
- Periodo padrao: 30 dias
- Filtros sao cumulativos (site + categoria + periodo)
- Analytics por perfil (A/B/C) disponivel via `/api/analytics/profile-dashboard-stats`
- Graficos renderizados com Recharts usando paleta de cores definida em `chartColors.ts`
- DashboardFilters componente gerencia estado dos filtros no frontend

## Endpoints Envolvidos
- GET `/api/dashboard/stats` — Stats gerais com filtro de periodo
- GET `/api/dashboard/quick-stats` — Stats rapidas (metricas-chave)
- GET `/api/dashboard/performance` — Performance detalhada
- GET `/api/analytics/dashboard-stats` — Stats do dashboard com filtros completos
- GET `/api/analytics/profile-dashboard-stats` — Stats por perfil A/B/C
- GET `/api/analytics/by-site` — Breakdown por rede de poker
- GET `/api/analytics/by-buyin` — Breakdown por faixa de buy-in
- GET `/api/analytics/by-category` — Breakdown por categoria (Vanilla/PKO/Mystery)
- GET `/api/analytics/by-day` — Breakdown por dia da semana
- GET `/api/analytics/by-speed` — Breakdown por velocidade
- GET `/api/analytics/by-month` — Evolucao mensal
- GET `/api/analytics/by-field` — Breakdown por tamanho de field
- GET `/api/analytics/final-table` — Analise de mesas finais

## Cenarios de Teste Derivados
- [ ] Happy path: Dashboard com torneios importados -> metricas calculadas e exibidas
- [ ] Happy path: Filtro por periodo 30d -> apenas torneios dos ultimos 30 dias
- [ ] Happy path: Filtro por site PokerStars -> apenas torneios do PokerStars
- [ ] Happy path: Analytics by-category -> breakdown Vanilla vs PKO vs Mystery correto
- [ ] Erro: Dashboard sem torneios -> metricas zeradas, mensagem de orientacao
- [ ] Erro: Filtro retorna 0 resultados -> graficos vazios sem crash
- [ ] Calculo: ROI = (sumPrize - sumBuyIn) / sumBuyIn * 100
- [ ] Calculo: ITM% = count(prize > 0) / count(total) * 100
- [ ] Calculo: ABI = avg(buyIn) corretamente com valores decimais
- [ ] Edge case: Torneio com buyIn 0 (freeroll) -> nao causa divisao por zero no ROI
- [ ] Edge case: Filtros cumulativos (site + categoria + periodo) -> interseccao correta
- [ ] Edge case: Analytics by-day -> todos os 7 dias representados mesmo sem dados
- [ ] Edge case: Analytics by-month -> meses sem torneios aparecem com zero
- [ ] Performance: Dashboard com 10000+ torneios -> query completa em tempo aceitavel
- [ ] Perfil: Analytics por perfil A/B/C -> filtra corretamente por perfil ativo do dia
