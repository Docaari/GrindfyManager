import { describe, it } from 'vitest';

// =============================================================================
// Testes TDD: SelectorCard, SelectorPanel, LibraryCardScoreBadge
//
// O projeto Grindfy NAO tem setup de @testing-library/react + jsdom no
// vitest.config.ts (verificado em vitest.config.ts: environment: 'node').
//
// Estes testes ficam como it.todo() ate o Implementer:
//   1. Adicionar dep dev: @testing-library/react, @testing-library/user-event,
//      jsdom (ou happy-dom).
//   2. Adicionar config "test.environment: 'jsdom'" para os arquivos *.test.tsx.
//   3. Implementar os componentes do widget.
//
// Convencao do projeto: testes que dependem de infra ainda nao montada usam
// it.todo() — ver tests/integration/services/getAnalyticsByTimeOfDay.test.ts
// e tests/integration/grind-session/addon-rea-endpoints.test.ts (linha 17).
// =============================================================================

describe('SelectorCard - render basico', () => {
  it.todo('renderiza badge de grade colorida (S verde, D vermelho)');
  it.todo('renderiza score grande no topo (numero)');
  it.todo('renderiza nome, horario, site (logo), buy-in');
  it.todo('renderiza rationale (texto cinza italico)');
  it.todo('renderiza mini-grafico horizontal de barras com 7 sinais');
  it.todo('renderiza badge de confidence: Alta/Media/Baixa confianca');
});

describe('SelectorCard - warnings', () => {
  it.todo('warning bankrollOk=false renderiza badge "Fora do bankroll"');
  it.todo('warning unfamiliar_site renderiza badge "Site novo"');
  it.todo('warning never_played_category renderiza badge "Categoria nunca jogada"');
  it.todo('warning low_sample renderiza badge "Baixa amostra"');
});

describe('SelectorCard - botoes', () => {
  it.todo('botao "Adicionar a grade" dispara mutation com metadata.fromSelector=true');
  it.todo('alreadyInGrid=true: botao desabilitado, texto "Ja na grade"');
  it.todo('botao "Detalhes" abre SelectorDetailsModal');
  it.todo('apos add com sucesso: toast verde "Adicionado a grade — Score X (Grade)"');
  it.todo('apos add com erro 403 subscription_limit: toast vermelho com mensagem clara');
});

describe('SelectorCard - acessibilidade', () => {
  it.todo('grade tem texto + cor + icone (nao depende so da cor)');
  it.todo('botoes tem aria-label adequado');
});

describe('SelectorPanel - estados', () => {
  it.todo('loading: mostra spinner com texto "Calculando ranking..."');
  it.todo('erro: mostra mensagem + botao "Tentar novamente" que refaz fetch');
  it.todo('vazio: mostra mensagem "Nenhum torneio disponivel"');
  it.todo('vazio apos filtros: mensagem "Nenhum torneio combina com seus filtros"');
});

describe('SelectorPanel - cold start', () => {
  it.todo('coldStart="pure": banner laranja "Importe mais historico"');
  it.todo('coldStart="partial": banner amarelo "Personalizando recomendacoes"');
  it.todo('coldStart=false: nao renderiza banner');
});

describe('SelectorPanel - filtros', () => {
  it.todo('chip "Fonte: Suprema" muda queryKey e refaz fetch com sources=suprema');
  it.todo('chip "Score: A+ (>=70)" aplica filtro minScore=70');
  it.todo('chip "Score: S (>=85)" aplica filtro minScore=85');
  it.todo('chip "Sample: Alta confianca" aplica filtro minSample=30');
  it.todo('bankrollConfigured=false: chip Bankroll desabilitado, tooltip "Configure em /settings"');
  it.todo('bankrollConfigured=true: chip Bankroll funcional');
  it.todo('mudanca de data: refaz fetch com nova date');
  it.todo('botao "Atualizar": invalida cache TanStack e refaz fetch');
});

describe('SelectorDetailsModal', () => {
  it.todo('renderiza tabela com 7 linhas (signals) + linha total');
  it.todo('coluna: Sinal | ROI bruto | Sample | bucketScore | shrunkScore | Peso | Contribuicao');
  it.todo('total na ultima linha bate com score do card');
  it.todo('botao "Adicionar a grade" replicado funciona igual ao do card');
  it.todo('texto explicativo visivel: "Score = soma ponderada..."');
});

describe('LibraryCardScoreBadge (RF-05)', () => {
  it.todo('selectorScore=87 grade=S: renderiza badge "S 87" verde no topo direito');
  it.todo('selectorScore=null: NAO renderiza badge (omitido)');
  it.todo('hover: tooltip mostra primeira sentenca do rationale');
  it.todo('template SEM dayOfWeek: nao mostra badge');
});

describe('useTournamentSelector hook', () => {
  it.todo('queryKey inclui [selector, date, sources, minScore, minSample, bankrollFilter, lookbackDays]');
  it.todo('staleTime configurado para 5min');
  it.todo('apos add_to_grid bem-sucedido: invalida queryKey ["selector", date]');
});

describe('usePlayerBundle hook', () => {
  it.todo('queryKey inclui [analytics, player-bundle, lookbackDays]');
  it.todo('staleTime configurado para 5min (matching servidor)');
  it.todo('apos upload bem-sucedido: TanStack invalida o cache do bundle');
});
