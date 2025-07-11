
export const CHART_COLORS = {
  // Sites de Poker
  sites: {
    'Chico': '#fca5a5',        // Vermelho Claro
    'WPN': '#166534',          // Verde Escuro  
    'Revolution': '#be185d',   // Rosa Escuro
    'CoinPoker': '#f8bbd9',    // Rosa Claro
    'iPoker': '#a16207',       // Amarelo Escuro
    'PartyPoker': '#fde047',   // Amarelo Claro
    'GGNetwork': '#dc2626',    // Vermelho Escuro
    'Bodog': '#7c3aed',        // Roxo
    '888Poker': '#2563eb',     // Azul
    'PokerStars': '#ef4444'    // Vermelho
  },
  
  // Buy-ins (frio → quente)
  buyins: [
    '#60a5fa', // Azul claro (baixo)
    '#34d399', // Verde 
    '#fbbf24', // Amarelo
    '#f97316', // Laranja
    '#ef4444'  // Vermelho (alto)
  ],
  
  // Categorias
  categories: {
    'Vanilla': '#3b82f6',  // Azul
    'PKO': '#ef4444',      // Vermelho
    'Mystery': '#ec4899'   // Rosa
  },
  
  // Velocidades
  speeds: {
    'Normal': '#22c55e',   // Verde
    'Turbo': '#eab308',    // Amarelo
    'Hyper': '#ef4444'     // Vermelho
  },

  // Cores padrão para outros gráficos
  default: ['#24c25e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316', '#06b6d4', '#84cc16'],
  
  // Cores para profit (positivo/negativo)
  profit: {
    positive: '#10b981',
    negative: '#ef4444'
  }
};

// Função helper para obter cor de site
export const getSiteColor = (siteName: string): string => {
  return CHART_COLORS.sites[siteName as keyof typeof CHART_COLORS.sites] || CHART_COLORS.default[0];
};

// Função helper para obter cor de categoria
export const getCategoryColor = (category: string): string => {
  return CHART_COLORS.categories[category as keyof typeof CHART_COLORS.categories] || CHART_COLORS.default[0];
};

// Função helper para obter cor de velocidade
export const getSpeedColor = (speed: string): string => {
  return CHART_COLORS.speeds[speed as keyof typeof CHART_COLORS.speeds] || CHART_COLORS.default[0];
};

// Função helper para obter cor de buy-in baseada no valor
export const getBuyinColor = (buyinRange: string): string => {
  const ranges = ['$0-$5', '$6-$10', '$11-$20', '$21-$50', '$51+'];
  const index = ranges.findIndex(range => range === buyinRange);
  return index !== -1 ? CHART_COLORS.buyins[index] : CHART_COLORS.default[0];
};

// Função helper para obter cor de profit
export const getProfitColor = (value: number): string => {
  return value >= 0 ? CHART_COLORS.profit.positive : CHART_COLORS.profit.negative;
};
