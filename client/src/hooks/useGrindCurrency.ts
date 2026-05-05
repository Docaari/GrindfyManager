/**
 * Currency formatter contextual a moeda base preferida do usuario para /grind e
 * /grind-live. Combina useGrindPreferences (localStorage) com taxas FX do
 * endpoint /api/settings/exchange-rates (cache 5 min).
 *
 * Convencao: valores de entrada SEMPRE em USD (mesma assumida pelo dashboard
 * existente). A formatacao converte para a moeda base e aplica locale apropriado.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import {
  formatBaseCurrency,
  useGrindPreferences,
  GrindBaseCurrency,
} from '@/lib/grindPagePreferences';

export interface UseGrindCurrencyResult {
  baseCurrency: GrindBaseCurrency;
  ratesUsdToOther: Record<string, number>;
  format: (amountUsd: number) => string;
  convert: (amountUsd: number) => number;
}

export function useGrindCurrency(): UseGrindCurrencyResult {
  const [prefs] = useGrindPreferences();

  const { data: exchangeRatesData } = useQuery<any>({
    queryKey: ['/api/settings/exchange-rates'],
    queryFn: async () => {
      try {
        return await apiRequest('GET', '/api/settings/exchange-rates');
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const ratesUsdToOther = useMemo<Record<string, number>>(() => {
    const fromSettings = (exchangeRatesData ?? {}) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [code, val] of Object.entries(fromSettings)) {
      const n = typeof val === 'number' ? val : parseFloat(String(val));
      if (Number.isFinite(n) && n > 0) out[code] = n;
    }
    if (out.BRL == null) out.BRL = 5.0;
    return out;
  }, [exchangeRatesData]);

  return {
    baseCurrency: prefs.baseCurrency,
    ratesUsdToOther,
    format: (amountUsd: number) => formatBaseCurrency(amountUsd, prefs.baseCurrency, ratesUsdToOther),
    convert: (amountUsd: number) => {
      if (prefs.baseCurrency === 'USD') return amountUsd;
      const rate = ratesUsdToOther[prefs.baseCurrency];
      return Number.isFinite(rate) && rate > 0 ? amountUsd * rate : amountUsd;
    },
  };
}
