/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-3 — RF-3: Auto-bind torneio → wallet (suggestedBindings)
 *
 * Spec: Docs/specs/sprint-bankroll-3.md (RF-3)
 *
 * API esperada:
 *   buildSuggestedBindings(missingPlatforms: string[]):
 *     Array<{ platform: string; suggestedCurrency: string; confidence: 'site_map' | 'alias_group' | 'fallback_usd' }>
 *
 * Casos cobertos:
 *   1. Plataforma com SITE_DEFAULT_CURRENCY (Suprema → BRL, site_map)
 *   2. Plataforma sem mapeamento (GenericUnknown → USD, fallback_usd)
 *   3. iPoker → EUR (site_map)
 *   4. GG → USD (site_map)
 *   5. Multiplas plataformas: cada uma vira entry
 *   6. Mesma currency em duplicatas: nao deduplica (cada entry aparece)
 *   7. Array vazio retorna array vazio
 *   8. Aceita aliases (SupremaPoker como Suprema)
 *
 * Helper deve viver em shared/wallet-reconciliation.ts ou
 * server/services/walletReconciliation.ts (implementer escolhe).
 */

import { describe, it, expect } from 'vitest';

async function loadHelper() {
  // Tentar shared first; fallback para server.
  try {
    const mod: any = await import('../../../shared/wallet-reconciliation');
    if (typeof mod.buildSuggestedBindings === 'function') return mod.buildSuggestedBindings;
  } catch {
    // ignore
  }
  const mod: any = await import('../../../server/services/walletReconciliation');
  return mod.buildSuggestedBindings;
}

describe('buildSuggestedBindings — RF-3', () => {
  it('retorna BRL para Suprema (site_map)', async () => {
    const fn = await loadHelper();
    const result = fn(['Suprema']);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      platform: 'Suprema',
      suggestedCurrency: 'BRL',
    });
    expect(['site_map', 'alias_group']).toContain(result[0].confidence);
  });

  it('retorna BRL para PPoker (site_map)', async () => {
    const fn = await loadHelper();
    const result = fn(['PPoker']);
    expect(result[0].suggestedCurrency).toBe('BRL');
  });

  it('retorna USD para GGNetwork (site_map)', async () => {
    const fn = await loadHelper();
    const result = fn(['GGNetwork']);
    expect(result[0].suggestedCurrency).toBe('USD');
    expect(result[0].confidence).toBe('site_map');
  });

  it('retorna EUR para iPoker (site_map)', async () => {
    const fn = await loadHelper();
    const result = fn(['iPoker']);
    expect(result[0].suggestedCurrency).toBe('EUR');
  });

  it('retorna USD com confidence=fallback_usd para plataforma desconhecida', async () => {
    const fn = await loadHelper();
    const result = fn(['ZzzMysteryPokerSite']);
    expect(result[0].suggestedCurrency).toBe('USD');
    expect(result[0].confidence).toBe('fallback_usd');
  });

  it('multiplas plataformas: cada uma vira entry separada', async () => {
    const fn = await loadHelper();
    const result = fn(['Suprema', 'GGNetwork', 'iPoker']);
    expect(result).toHaveLength(3);
    const platforms = result.map((r: any) => r.platform).sort();
    expect(platforms).toEqual(['GGNetwork', 'Suprema', 'iPoker'].sort());
  });

  it('duas plataformas com mesma currency: nao deduplica', async () => {
    const fn = await loadHelper();
    const result = fn(['Suprema', 'PPoker']); // ambas BRL
    expect(result).toHaveLength(2);
  });

  it('array vazio retorna array vazio', async () => {
    const fn = await loadHelper();
    const result = fn([]);
    expect(result).toEqual([]);
  });

  it('alias SupremaPoker tambem retorna BRL', async () => {
    const fn = await loadHelper();
    const result = fn(['SupremaPoker']);
    expect(result[0].suggestedCurrency).toBe('BRL');
  });

  it('Bodog → USD (site_map)', async () => {
    const fn = await loadHelper();
    const result = fn(['Bodog']);
    expect(result[0].suggestedCurrency).toBe('USD');
    expect(result[0].confidence).toBe('site_map');
  });

  it('PokerStars → USD (site_map)', async () => {
    const fn = await loadHelper();
    const result = fn(['PokerStars']);
    expect(result[0].suggestedCurrency).toBe('USD');
  });

  it('cada entry tem shape { platform, suggestedCurrency, confidence }', async () => {
    const fn = await loadHelper();
    const result = fn(['Suprema']);
    expect(result[0]).toHaveProperty('platform');
    expect(result[0]).toHaveProperty('suggestedCurrency');
    expect(result[0]).toHaveProperty('confidence');
  });
});
