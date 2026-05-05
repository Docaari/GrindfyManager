/**
 * Grind page personalization preferences.
 *
 * Persistido em localStorage (sem migration de schema). Pode ser promovido para
 * `users.home_layout_settings` ou tabela propria no futuro caso precise sync
 * cross-device. Hoje so afeta UI local de /grind e /grind-live.
 *
 * Chaves:
 *   visibility.kpisVolume      | Linha 1 (Contagem/Reentradas/Participantes/ABI)
 *   visibility.kpisProfit      | Linha 2 (Lucro/ROI/Lucro Dia/Lucro Torneio)
 *   visibility.kpisItm         | Linha 3 (ITM/FT/Cravadas/Maior Resultado)
 *   visibility.tournaments     | Toggle 1 expansivel (tipos)
 *   visibility.history         | Cards de historico
 *   mentalEnabled              | Liga/desliga toda performance mental (toggle 2 + baloes historico)
 *   baseCurrency               | 'USD' | 'BRL' — afeta exibicao em /grind e /grind-live
 */

import { useCallback, useEffect, useState } from 'react';

export type GrindBaseCurrency = 'USD' | 'BRL';

export interface GrindPageVisibility {
  kpisVolume: boolean;
  kpisProfit: boolean;
  kpisItm: boolean;
  tournaments: boolean;
  history: boolean;
}

export interface GrindPagePreferences {
  visibility: GrindPageVisibility;
  mentalEnabled: boolean;
  baseCurrency: GrindBaseCurrency;
}

export const DEFAULT_GRIND_PREFERENCES: GrindPagePreferences = {
  visibility: {
    kpisVolume: true,
    kpisProfit: true,
    kpisItm: true,
    tournaments: true,
    history: true,
  },
  mentalEnabled: true,
  baseCurrency: 'USD',
};

const STORAGE_KEY = 'grindPagePreferences';
const CHANGE_EVENT = 'grindPagePreferences:change';

export function loadGrindPreferences(): GrindPagePreferences {
  if (typeof window === 'undefined') return DEFAULT_GRIND_PREFERENCES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_GRIND_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<GrindPagePreferences>;
    return {
      visibility: {
        ...DEFAULT_GRIND_PREFERENCES.visibility,
        ...(parsed.visibility ?? {}),
      },
      mentalEnabled:
        typeof parsed.mentalEnabled === 'boolean'
          ? parsed.mentalEnabled
          : DEFAULT_GRIND_PREFERENCES.mentalEnabled,
      baseCurrency:
        parsed.baseCurrency === 'BRL' || parsed.baseCurrency === 'USD'
          ? parsed.baseCurrency
          : DEFAULT_GRIND_PREFERENCES.baseCurrency,
    };
  } catch {
    return DEFAULT_GRIND_PREFERENCES;
  }
}

export function saveGrindPreferences(prefs: GrindPagePreferences): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: prefs }));
  } catch {
    // ignora storage quota
  }
}

export function useGrindPreferences(): [
  GrindPagePreferences,
  (next: GrindPagePreferences) => void,
] {
  const [prefs, setPrefs] = useState<GrindPagePreferences>(() => loadGrindPreferences());

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<GrindPagePreferences>).detail;
      if (detail) setPrefs(detail);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setPrefs(loadGrindPreferences());
      }
    };
    window.addEventListener(CHANGE_EVENT, onChange as EventListener);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const update = useCallback((next: GrindPagePreferences) => {
    setPrefs(next);
    saveGrindPreferences(next);
  }, []);

  return [prefs, update];
}

/**
 * Converte valor em USD para a moeda base preferida do usuario.
 * Espera ratesUsdToOther = mapa "1 USD = N moeda" (mesma convencao do /grind-live).
 */
export function convertFromUsd(
  amountUsd: number,
  base: GrindBaseCurrency,
  ratesUsdToOther: Record<string, number>,
): number {
  if (!Number.isFinite(amountUsd)) return 0;
  if (base === 'USD') return amountUsd;
  const rate = ratesUsdToOther[base];
  if (!Number.isFinite(rate) || (rate as number) <= 0) return amountUsd;
  return amountUsd * (rate as number);
}

export function formatBaseCurrency(
  amountUsd: number,
  base: GrindBaseCurrency,
  ratesUsdToOther: Record<string, number>,
): string {
  const v = convertFromUsd(amountUsd, base, ratesUsdToOther);
  if (base === 'BRL') {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
