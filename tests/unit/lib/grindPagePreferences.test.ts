/**
 * Tests for `grindPagePreferences` migration.
 *
 * Sprint Grind-Cards-Reform v2 — CA-16 + §4.4.
 *
 * Espera-se que `client/src/lib/grindPagePreferences.ts`:
 * 1. Adicione 3 chaves novas em `GrindPageVisibility`: `kpisTypes`, `kpisSpeeds`, `kpisPlatforms`.
 * 2. Defaults dessas 3 = true.
 * 3. Migracao silenciosa: ler chave antiga `tournaments` (se existir) e mapear pra `kpisTypes`.
 * 4. Apos primeiro save (saveGrindPreferences), chave antiga `tournaments` removida do payload.
 *
 * Testes rodam em ambiente node — `localStorage` polyfill ja existe em
 * `tests/setup.ts` (MemoryStorage). Limpamos entre testes via `localStorage.clear()`.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadGrindPreferences,
  saveGrindPreferences,
  DEFAULT_GRIND_PREFERENCES,
} from '../../../client/src/lib/grindPagePreferences';

const STORAGE_KEY = 'grindPagePreferences';

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* ok */
  }
});

describe('grindPagePreferences — defaults novos (kpisTypes/kpisSpeeds/kpisPlatforms)', () => {
  it('DEFAULT_GRIND_PREFERENCES.visibility tem kpisTypes=true', () => {
    expect((DEFAULT_GRIND_PREFERENCES.visibility as any).kpisTypes).toBe(true);
  });

  it('DEFAULT_GRIND_PREFERENCES.visibility tem kpisSpeeds=true', () => {
    expect((DEFAULT_GRIND_PREFERENCES.visibility as any).kpisSpeeds).toBe(true);
  });

  it('DEFAULT_GRIND_PREFERENCES.visibility tem kpisPlatforms=true', () => {
    expect((DEFAULT_GRIND_PREFERENCES.visibility as any).kpisPlatforms).toBe(true);
  });

  it('loadGrindPreferences sem nada no storage retorna defaults com 3 keys novas = true', () => {
    const prefs = loadGrindPreferences();
    expect((prefs.visibility as any).kpisTypes).toBe(true);
    expect((prefs.visibility as any).kpisSpeeds).toBe(true);
    expect((prefs.visibility as any).kpisPlatforms).toBe(true);
  });
});

describe('grindPagePreferences — migracao silenciosa tournaments -> kpisTypes', () => {
  it('chave antiga tournaments=false e ainda nao tem kpisTypes -> retorna kpisTypes=false', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        visibility: {
          kpisVolume: true,
          kpisProfit: true,
          kpisItm: true,
          tournaments: false, // chave antiga
          history: true,
        },
        mentalEnabled: true,
        baseCurrency: 'USD',
      }),
    );
    const prefs = loadGrindPreferences();
    expect((prefs.visibility as any).kpisTypes).toBe(false);
    // Speeds e Platforms novas mantem default=true.
    expect((prefs.visibility as any).kpisSpeeds).toBe(true);
    expect((prefs.visibility as any).kpisPlatforms).toBe(true);
  });

  it('chave antiga tournaments=true -> retorna kpisTypes=true', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        visibility: {
          kpisVolume: true,
          kpisProfit: true,
          kpisItm: true,
          tournaments: true,
          history: true,
        },
        mentalEnabled: true,
        baseCurrency: 'USD',
      }),
    );
    const prefs = loadGrindPreferences();
    expect((prefs.visibility as any).kpisTypes).toBe(true);
  });

  it('chave antiga ausente + chave nova kpisTypes=false -> retorna kpisTypes=false', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        visibility: {
          kpisVolume: true,
          kpisProfit: true,
          kpisItm: true,
          kpisTypes: false,
          history: true,
        },
        mentalEnabled: true,
        baseCurrency: 'USD',
      }),
    );
    const prefs = loadGrindPreferences();
    expect((prefs.visibility as any).kpisTypes).toBe(false);
  });

  it('quando ambas existem (tournaments antigo + kpisTypes novo) -> kpisTypes vence', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        visibility: {
          kpisVolume: true,
          kpisProfit: true,
          kpisItm: true,
          tournaments: false, // antiga
          kpisTypes: true, // nova — fonte preferida
          history: true,
        },
        mentalEnabled: true,
        baseCurrency: 'USD',
      }),
    );
    const prefs = loadGrindPreferences();
    expect((prefs.visibility as any).kpisTypes).toBe(true);
  });

  it('apos saveGrindPreferences, chave antiga tournaments NAO persiste', () => {
    // Setup pre-existente com tournaments=false.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        visibility: {
          kpisVolume: true,
          kpisProfit: true,
          kpisItm: true,
          tournaments: false,
          history: true,
        },
        mentalEnabled: true,
        baseCurrency: 'USD',
      }),
    );
    const prefs = loadGrindPreferences();
    saveGrindPreferences(prefs);

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    // Chave antiga deve sumir no segundo save.
    expect(parsed.visibility.tournaments).toBeUndefined();
    // Chave nova deve estar presente.
    expect(parsed.visibility.kpisTypes).toBe(false);
    expect(parsed.visibility.kpisSpeeds).toBe(true);
    expect(parsed.visibility.kpisPlatforms).toBe(true);
  });
});
