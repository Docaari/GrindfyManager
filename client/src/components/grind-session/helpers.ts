import { FilterState } from "@/components/FilterPopupSimple";
import { SessionHistoryData } from "./types";

export const formatImprovedDate = (dateString: string) => {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const isToday = date.toDateString() === today.toDateString();
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) {
    return "Hoje";
  } else if (isYesterday) {
    return "Ontem";
  } else {
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }
};

export const formatTime = (dateString: string) => {
  return new Date(dateString).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const localFormatCurrency = (amount: number) => {
  return `$${Math.round(amount).toLocaleString()}`;
};

export const getPreparationColor = (percentage: number) => {
  if (percentage < 33) return 'text-red-400 bg-red-900/20 border-red-600/30';
  if (percentage < 67) return 'text-yellow-400 bg-yellow-900/20 border-yellow-600/30';
  return 'text-green-400 bg-green-900/20 border-green-600/30';
};

export const countActiveFilters = (filterState: FilterState) => {
  let count = 0;

  if (filterState.period === 'custom' && (filterState.customStartDate || filterState.customEndDate)) {
    count++;
  }

  if (filterState.abiRange[0] !== 0 || filterState.abiRange[1] !== 500) count++;
  if (filterState.preparationRange[0] !== 0 || filterState.preparationRange[1] !== 10) count++;
  if (filterState.interferenceRange[0] !== 0 || filterState.interferenceRange[1] !== 10) count++;
  if (filterState.energyRange[0] !== 0 || filterState.energyRange[1] !== 10) count++;
  if (filterState.confidenceRange[0] !== 0 || filterState.confidenceRange[1] !== 10) count++;
  if (filterState.emotionalRange[0] !== 0 || filterState.emotionalRange[1] !== 10) count++;
  if (filterState.focusRange[0] !== 0 || filterState.focusRange[1] !== 10) count++;

  if (filterState.tournamentTypes.length > 0) count++;
  if (filterState.tournamentSpeeds.length > 0) count++;

  return count;
};

export const applyFiltersToSessions = (sessions: SessionHistoryData[], filterState: FilterState) => {
  return sessions.filter(session => {
    const sessionDate = new Date(session.date);
    const now = new Date();

    let dateFilter = true;
    switch (filterState.period) {
      case '7d':
        dateFilter = sessionDate >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '14d':
        dateFilter = sessionDate >= new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        dateFilter = sessionDate >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        dateFilter = sessionDate >= new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        dateFilter = sessionDate >= new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case 'custom':
        if (filterState.customStartDate) {
          dateFilter = dateFilter && sessionDate >= new Date(filterState.customStartDate);
        }
        if (filterState.customEndDate) {
          dateFilter = dateFilter && sessionDate <= new Date(filterState.customEndDate);
        }
        break;
    }

    if (!dateFilter) return false;

    if (session.preparationPercentage !== undefined) {
      const prepValue = session.preparationPercentage / 10;
      if (prepValue < filterState.preparationRange[0] || prepValue > filterState.preparationRange[1]) {
        return false;
      }
    }

    if (session.energiaMedia !== undefined) {
      if (session.energiaMedia < filterState.energyRange[0] || session.energiaMedia > filterState.energyRange[1]) {
        return false;
      }
    }

    if (session.focoMedio !== undefined) {
      if (session.focoMedio < filterState.focusRange[0] || session.focoMedio > filterState.focusRange[1]) {
        return false;
      }
    }

    if (session.confiancaMedia !== undefined) {
      if (session.confiancaMedia < filterState.confidenceRange[0] || session.confiancaMedia > filterState.confidenceRange[1]) {
        return false;
      }
    }

    if (session.inteligenciaEmocionalMedia !== undefined) {
      if (session.inteligenciaEmocionalMedia < filterState.emotionalRange[0] || session.inteligenciaEmocionalMedia > filterState.emotionalRange[1]) {
        return false;
      }
    }

    if (session.interferenciasMedia !== undefined) {
      if (session.interferenciasMedia < filterState.interferenceRange[0] || session.interferenciasMedia > filterState.interferenceRange[1]) {
        return false;
      }
    }

    if (session.abiMed !== undefined) {
      if (session.abiMed < filterState.abiRange[0] || session.abiMed > filterState.abiRange[1]) {
        return false;
      }
    }

    return true;
  });
};

export const createSessionValidator = () => {
  const schema = {
    volume: {
      required: false,
      min: 0,
      max: 100,
      message: "Volume deve estar entre 0 e 100"
    },
    profit: {
      required: false,
      message: "Profit deve ser um número válido"
    },
    abiMed: {
      required: false,
      min: 0,
      message: "ABI médio não pode ser negativo"
    },
    fts: {
      required: false,
      min: 0,
      validate: (value: number, data: any) =>
        value <= data.volume || "FTs não pode ser maior que volume",
      message: "FTs inválido"
    },
    cravadas: {
      required: false,
      min: 0,
      validate: (value: number, data: any) =>
        value <= data.fts || "Cravadas não pode ser maior que FTs",
      message: "Cravadas inválido"
    }
  };

  const validate = (data: any): { isValid: boolean; errors: Record<string, string> } => {
    const errors: Record<string, string> = {};

    Object.entries(schema).forEach(([field, rules]) => {
      const value = data[field as keyof typeof data];
      const r = rules as any;

      if (r.min !== undefined && typeof value === 'number' && value < r.min) {
        errors[field] = r.message;
      }

      if (r.max !== undefined && typeof value === 'number' && value > r.max) {
        errors[field] = r.message;
      }

      if (r.validate && typeof r.validate === 'function') {
        const customValidation = r.validate(value as number, data);
        if (customValidation !== true) {
          errors[field] = customValidation as string;
        }
      }
    });

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  };

  return { validate };
};

export const SmartPlaceholders = {
  preparationNotes: () => {
    const hour = new Date().getHours();
    if (hour < 12) {
      return "Como está se sentindo esta manhã? Energia, foco, motivação...";
    }
    if (hour < 18) {
      return "Estado mental atual? Energia da tarde, concentração...";
    }
    return "Como terminou o dia? Energia restante, foco para a sessão...";
  },

  dailyGoals: () => {
    const dayOfWeek = new Date().getDay();
    if (dayOfWeek === 1) {
      return "Ex: Começar a semana forte, foco total, sem tilt...";
    }
    if (dayOfWeek === 5) {
      return "Ex: Finalizar a semana bem, manter disciplina...";
    }
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return "Ex: Aproveitar o fim de semana, jogar relaxado mas focado...";
    }
    return "Ex: Manter consistência, foco nos fundamentos...";
  }
};
