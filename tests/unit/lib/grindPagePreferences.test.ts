/**
 * Tests for `grindPagePreferences` migration.
 *
 * Sprint Grind-Cards-Reform v2 — CA-16 + §4.4 (post-QA founder revisao 2026-05-07).
 *
 * Espera-se que `client/src/lib/grindPagePreferences.ts`:
 * 1. Adicione 3 chaves novas em `GrindPageVisibility`: `kpisTypes`, `kpisSpeeds`, `kpisPlatforms`.
 * 2. Defaults dessas 3 = true.
 * 3. Chave legada `tournaments` IGNORADA (nao migrada). Defaults v2 sempre vencem
 *    para chaves ausentes — garante que founder com toggle antigo desativado veja
 *    blocos novos. Decisao 2026-05-07 pos-QA founder.
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

  it('DEFAULT_GRIND_PREFERENCES.visibility tem kpisSession=true (v1 spec §3)', () => {
    expect((DEFAULT_GRIND_PREFERENCES.visibility as any).kpisSession).toBe(true);
  });

  it('loadGrindPreferences sem nada no storage retorna defaults com 3 keys novas = true', () => {
    const prefs = loadGrindPreferences();
    expect((prefs.visibility as any).kpisTypes).toBe(true);
    expect((prefs.visibility as any).kpisSpeeds).toBe(true);
    expect((prefs.visibility as any).kpisPlatforms).toBe(true);
  });
});

describe('grindPagePreferences — chave legada tournaments IGNORADA (default vence)', () => {
  it('chave antiga tournaments=false NAO afeta kpisTypes (default true vence)', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        visibility: {
          kpisVolume: true,
          kpisProfit: true,
          kpisItm: true,
          tournaments: false, // chave antiga ignorada
          history: true,
        },
        mentalEnabled: true,
        baseCurrency: 'USD',
      }),
    );
    const prefs = loadGrindPreferences();
    expect((prefs.visibility as any).kpisTypes).toBe(true);
    expect((prefs.visibility as any).kpisSpeeds).toBe(true);
    expect((prefs.visibility as any).kpisPlatforms).toBe(true);
  });

  it('chave antiga tournaments=true tambem ignorada -> kpisTypes default true', () => {
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

  it('chave nova kpisTypes=false explicita -> retorna false (override default)', () => {
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

  it('ambas presentes (tournaments=false + kpisTypes=true) -> kpisTypes vence', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        visibility: {
          kpisVolume: true,
          kpisProfit: true,
          kpisItm: true,
          tournaments: false,
          kpisTypes: true,
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
    expect(parsed.visibility.tournaments).toBeUndefined();
    // Defaults v2 (true) preservados pois localStorage antigo nao tinha as chaves novas.
    expect(parsed.visibility.kpisTypes).toBe(true);
    expect(parsed.visibility.kpisSpeeds).toBe(true);
    expect(parsed.visibility.kpisPlatforms).toBe(true);
  });
});
