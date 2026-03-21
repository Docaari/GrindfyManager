// Parse Portuguese-formatted dates (e.g. "2 de mai. de 25")
export const parsePortugueseDate = (dateStr: string): Date | null => {
  if (!dateStr || typeof dateStr !== 'string') return null;

  const monthMap: { [key: string]: number } = {
    'jan': 0, 'fev': 1, 'mar': 2, 'abr': 3, 'mai': 4, 'jun': 5,
    'jul': 6, 'ago': 7, 'set': 8, 'out': 9, 'nov': 10, 'dez': 11
  };

  try {
    const portugueseMatch = dateStr.match(/(\d{1,2})\s*de\s*(\w{3})\.?(?:\s*de\s*(\d{2,4}))?/i) ||
                           dateStr.match(/(\w{3})\.?\s*de\s*(\d{2,4})/i);

    if (portugueseMatch) {
      let day = 1;
      let month = -1;
      let year = new Date().getFullYear();

      if (portugueseMatch[1] && !isNaN(parseInt(portugueseMatch[1]))) {
        day = parseInt(portugueseMatch[1]);
        month = monthMap[portugueseMatch[2].toLowerCase()];
        if (portugueseMatch[3]) {
          year = parseInt(portugueseMatch[3]);
          if (year < 100) year += 2000;
        }
      } else if (portugueseMatch[2]) {
        month = monthMap[portugueseMatch[1].toLowerCase()];
        year = parseInt(portugueseMatch[2]);
        if (year < 100) year += 2000;
      }

      if (month !== -1) {
        return new Date(year, month, day);
      }
    }

    const normalDate = new Date(dateStr);
    if (!isNaN(normalDate.getTime())) {
      return normalDate;
    }

    return null;
  } catch {
    return null;
  }
};

// Generate adaptive X-axis tick formatter based on period
export const generateAdaptiveXAxisTicks = (period: string, chartData: any[]) => {
  if (!chartData || chartData.length === 0) return () => '';

  const dataLength = chartData.length;
  const firstDataPoint = chartData[0];
  const lastDataPoint = chartData[dataLength - 1];

  if ((period === 'all' || period === 'all_time') && firstDataPoint?.fullDate && lastDataPoint?.fullDate) {
    const firstDate = new Date(firstDataPoint.fullDate);
    const lastDate = new Date(lastDataPoint.fullDate);

    const quarterLabels: string[] = [];
    const currentDate = new Date(firstDate);

    while (currentDate <= lastDate) {
      const quarter = Math.floor(currentDate.getMonth() / 3) + 1;
      const year = String(currentDate.getFullYear()).slice(-2);
      const quarterLabel = `T${quarter}/${year}`;
      if (!quarterLabels.includes(quarterLabel)) {
        quarterLabels.push(quarterLabel);
      }
      currentDate.setMonth(currentDate.getMonth() + 3);
    }

    return (tickItem: string, index: number) => {
      const showEvery = Math.max(1, Math.floor(dataLength / quarterLabels.length));
      const shouldShow = index % showEvery === 0 || index === 0 || index === dataLength - 1;
      if (!shouldShow) return '';
      if (index === 0) return quarterLabels[0];

      const actualDate = parsePortugueseDate(tickItem);
      if (actualDate === null) return tickItem;
      const quarter = Math.floor(actualDate.getMonth() / 3) + 1;
      const year = String(actualDate.getFullYear()).slice(-2);
      return `T${quarter}/${year}`;
    };
  }

  return (tickItem: string, index: number) => {
    let interval = 1;
    switch (period) {
      case 'current_month':
      case 'last_30_days':
        interval = Math.max(1, Math.floor(dataLength / 15));
        break;
      case 'last_3_months':
      case 'last_6_months':
      case 'current_year':
        interval = Math.max(1, Math.floor(dataLength / 12));
        break;
      default:
        interval = Math.max(1, Math.floor(dataLength / 10));
    }

    const isFirstTick = index === 0;
    const isLastTick = index === dataLength - 1;
    const shouldShow = isFirstTick || isLastTick || index % interval === 0;
    if (!shouldShow) return '';

    if (isFirstTick && firstDataPoint?.fullDate) {
      const firstRealDate = new Date(firstDataPoint.fullDate);
      switch (period) {
        case 'last_3_months':
        case 'last_6_months':
        case 'current_year':
          return firstRealDate.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        default:
          return `${String(firstRealDate.getDate()).padStart(2, '0')}/${String(firstRealDate.getMonth() + 1).padStart(2, '0')}`;
      }
    }

    const actualDate = parsePortugueseDate(tickItem);
    if (actualDate === null) return tickItem;

    switch (period) {
      case 'current_month':
      case 'last_30_days':
        return `${String(actualDate.getDate()).padStart(2, '0')}/${String(actualDate.getMonth() + 1).padStart(2, '0')}`;
      case 'last_3_months':
      case 'last_6_months':
      case 'current_year':
        return actualDate.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      default:
        return actualDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    }
  };
};

// Generate time labels for a given period
export const generateTimeLabels = (period: string): string[] => {
  const now = new Date();
  switch (period) {
    case 'last_7_days':
      return Array.from({ length: 7 }, (_, i) => {
        const date = new Date(now);
        date.setDate(date.getDate() - (6 - i));
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      });
    case 'last_30_days':
      return Array.from({ length: 4 }, (_, i) => {
        const date = new Date(now);
        date.setDate(date.getDate() - (3 - i) * 7);
        return `Sem ${i + 1}`;
      });
    case 'last_3_months':
      return Array.from({ length: 3 }, (_, i) => {
        const date = new Date(now);
        date.setMonth(date.getMonth() - (2 - i));
        return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      });
    case 'last_6_months':
      return Array.from({ length: 6 }, (_, i) => {
        const date = new Date(now);
        date.setMonth(date.getMonth() - (5 - i));
        return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      });
    case 'current_year': {
      const monthsInYear = now.getMonth() + 1;
      return Array.from({ length: monthsInYear }, (_, i) => {
        const date = new Date(now.getFullYear(), i, 1);
        return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      });
    }
    case 'all_time':
    default:
      return Array.from({ length: 12 }, (_, i) => {
        const date = new Date(now);
        date.setMonth(date.getMonth() - (11 - i));
        return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      });
  }
};
