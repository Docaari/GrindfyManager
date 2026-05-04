/**
 * Test — Sprint home-reform-5 item 11 (engrenagem).
 *
 * Spec: Docs/specs/home-reform-5.md item 11.
 *
 * Cobre service puro homeSettings:
 *   - mergeHomeLayoutSettings: aceita parcial, preenche com defaults.
 *   - validateHomeLayoutSettingsPatch: rejeita shape invalido (Zod).
 *   - resolveHomeLayoutSettings: hidrata payload do storage (NULL -> defaults).
 */

import { describe, it, expect } from 'vitest';
import {
  mergeHomeLayoutSettings,
  resolveHomeLayoutSettings,
  parseHomeLayoutSettingsPatch,
} from '../../server/services/homeSettings';
import { DEFAULT_HOME_LAYOUT_SETTINGS } from '../../shared/types/homeSettings';

describe('homeSettings — resolveHomeLayoutSettings', () => {
  it('null -> defaults', () => {
    expect(resolveHomeLayoutSettings(null)).toEqual(DEFAULT_HOME_LAYOUT_SETTINGS);
  });

  it('undefined -> defaults', () => {
    expect(resolveHomeLayoutSettings(undefined)).toEqual(DEFAULT_HOME_LAYOUT_SETTINGS);
  });

  it('valor stored com partial visibility -> merge com defaults', () => {
    const stored = { visibility: { news: false } };
    const result = resolveHomeLayoutSettings(stored);
    expect(result.visibility.news).toBe(false);
    expect(result.visibility.headerStrip).toBe(true);
    expect(result.visibility.dashboard).toBe(true);
    expect(result.performanceFromGrind).toBe(true);
  });

  it('performanceFromGrind=false respeitado', () => {
    const stored = { performanceFromGrind: false };
    const result = resolveHomeLayoutSettings(stored);
    expect(result.performanceFromGrind).toBe(false);
    expect(result.visibility.headerStrip).toBe(true);
  });

  it('valor garbled (string) -> defaults', () => {
    expect(resolveHomeLayoutSettings('lixo' as any)).toEqual(DEFAULT_HOME_LAYOUT_SETTINGS);
  });

  it('chave desconhecida -> ignorada', () => {
    const stored = { visibility: { news: false, foo: false } } as any;
    const result = resolveHomeLayoutSettings(stored);
    expect(result.visibility.news).toBe(false);
    expect((result.visibility as any).foo).toBeUndefined();
  });
});

describe('homeSettings — mergeHomeLayoutSettings', () => {
  it('current vazio + patch parcial -> defaults com patch aplicado', () => {
    const merged = mergeHomeLayoutSettings(null, { visibility: { news: false } });
    expect(merged.visibility.news).toBe(false);
    expect(merged.visibility.headerStrip).toBe(true);
    expect(merged.performanceFromGrind).toBe(true);
  });

  it('current existente + patch parcial -> mescla mantendo nao especificados', () => {
    const current = {
      ...DEFAULT_HOME_LAYOUT_SETTINGS,
      visibility: {
        ...DEFAULT_HOME_LAYOUT_SETTINGS.visibility,
        news: false,
        coach: false,
      },
    };
    const merged = mergeHomeLayoutSettings(current, {
      visibility: { news: true },
    });
    expect(merged.visibility.news).toBe(true); // patch
    expect(merged.visibility.coach).toBe(false); // preservado
    expect(merged.visibility.headerStrip).toBe(true);
  });

  it('patch performanceFromGrind=false sobrescreve', () => {
    const merged = mergeHomeLayoutSettings(null, { performanceFromGrind: false });
    expect(merged.performanceFromGrind).toBe(false);
  });

  it('patch vazio -> equivalente aos defaults quando current null', () => {
    expect(mergeHomeLayoutSettings(null, {})).toEqual(DEFAULT_HOME_LAYOUT_SETTINGS);
  });
});

describe('homeSettings — parseHomeLayoutSettingsPatch', () => {
  it('aceita patch parcial valido', () => {
    const parsed = parseHomeLayoutSettingsPatch({
      visibility: { news: false, dashboard: true },
      performanceFromGrind: false,
    });
    expect(parsed.visibility?.news).toBe(false);
    expect(parsed.visibility?.dashboard).toBe(true);
    expect(parsed.performanceFromGrind).toBe(false);
  });

  it('rejeita visibility com tipo errado', () => {
    expect(() =>
      parseHomeLayoutSettingsPatch({ visibility: { news: 'sim' as any } }),
    ).toThrow();
  });

  it('rejeita chave desconhecida em visibility', () => {
    expect(() =>
      parseHomeLayoutSettingsPatch({ visibility: { unknown: true } as any }),
    ).toThrow();
  });

  it('rejeita performanceFromGrind nao boolean', () => {
    expect(() =>
      parseHomeLayoutSettingsPatch({ performanceFromGrind: 1 as any }),
    ).toThrow();
  });

  it('aceita patch vazio (no-op)', () => {
    expect(parseHomeLayoutSettingsPatch({})).toEqual({});
  });

  it('rejeita payload nao objeto', () => {
    expect(() => parseHomeLayoutSettingsPatch(null)).toThrow();
    expect(() => parseHomeLayoutSettingsPatch('foo' as any)).toThrow();
    expect(() => parseHomeLayoutSettingsPatch([] as any)).toThrow();
  });
});
