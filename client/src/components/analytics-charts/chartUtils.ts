import { formatCurrencyBR } from '@/lib/utils';

export { formatCurrencyBR };

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
    default: ['#24c25e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316', '#06b6d4', '#84cc16']
};

export interface AnalyticsChartsProps {
  type: string;
  data: any[];
  period?: string;
}

export const generateTimeLabels = (period: string): string[] => {
  const now = new Date();

  // MAPEAMENTO CORRETO DOS FILTROS DO DASHBOARD
  switch (period) {
    case 'last_7_days':
      // Últimos 7 dias
      return Array.from({ length: 7 }, (_, i) => {
        const date = new Date(now);
        date.setDate(date.getDate() - (6 - i));
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      });

    case 'last_30_days':
      // Últimas 4 semanas
      return Array.from({ length: 4 }, (_, i) => {
        const date = new Date(now);
        date.setDate(date.getDate() - (3 - i) * 7);
        return `Sem ${i + 1}`;
      });

    case 'last_3_months':
      // Últimos 3 meses - COMPORTAMENTO CORRETO
      return Array.from({ length: 3 }, (_, i) => {
        const date = new Date(now);
        date.setMonth(date.getMonth() - (2 - i));
        return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      });

    case 'last_6_months':
      // Últimos 6 meses - COMPORTAMENTO CORRETO
      return Array.from({ length: 6 }, (_, i) => {
        const date = new Date(now);
        date.setMonth(date.getMonth() - (5 - i));
        return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      });

    case 'current_year':
      // Ano atual - COMPORTAMENTO CORRETO
      const monthsInYear = now.getMonth() + 1; // Janeiro = 0, então +1
      return Array.from({ length: monthsInYear }, (_, i) => {
        const date = new Date(now.getFullYear(), i, 1);
        return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      });

    case 'all_time':
    default:
      // Todos os tempos - mostrar 12 meses para compatibilidade
      return Array.from({ length: 12 }, (_, i) => {
        const date = new Date(now);
        date.setMonth(date.getMonth() - (11 - i));
        return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      });
  }
};

export const generateDynamicTimeData = (period: string) => {
  const now = new Date();
  const timePoints: { label: string; value: string }[] = [];

  switch (period) {
    case '7':
      // Últimos 7 dias
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        timePoints.push({
          label: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          value: date.toISOString().split('T')[0]
        });
      }
      break;

    case '30':
      // Últimas 4 semanas
      for (let i = 3; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
        timePoints.push({
          label: `Sem ${4 - i}`,
          value: date.toISOString().split('T')[0]
        });
      }
      break;

    case '90':
      // Últimos 3 meses
      for (let i = 2; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        timePoints.push({
          label: date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
          value: date.toISOString().split('T')[0]
        });
      }
      break;

    case '365':
      // Últimos 6 meses
      for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        timePoints.push({
          label: date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
          value: date.toISOString().split('T')[0]
        });
      }
      break;

    default:
      // Para "all" ou outros períodos - últimos 6 meses
      for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        timePoints.push({
          label: date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
          value: date.toISOString().split('T')[0]
        });
      }
  }

  return timePoints;
};
