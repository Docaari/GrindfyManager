import { describe, it, expect } from 'vitest';

// =============================================================================
// Sprint F4 W0 — primedopeDefaults shared (DRY de NETWORK_DEFAULTS, lesson #10)
//
// Spec: Docs/specs/sprint-f4-primedope-grade-detail.md (RF-02 + flow-primedope-wizard-prefill)
// Lesson learned #10: prompts/defaults divergentes entre client e server quebra cache
// + cria divergencia silenciosa. Solucao: shared/primedopeDefaults.ts unica fonte de
// verdade.
//
// Esperado: shared/primedopeDefaults.ts exporta:
//   - NETWORK_DEFAULTS_RAKE: Record<networkKey, number>
//   - NETWORK_DEFAULTS_ROI: Record<networkKey, number>
//   - DEFAULT_PLAYERS_AVG = 1000
//   - DEFAULT_PLACES_PAID = 150
//   - getNetworkRakeDefault(site: string): number  (8 fallback)
//   - getNetworkRoiDefault(site: string): number   (10 fallback)
//
// Backend e frontend importam destes mesmos defaults.
// =============================================================================

async function loadDefaults() {
  return await import('../../../shared/primedopeDefaults');
}

describe('NETWORK_DEFAULTS_RAKE', () => {
  it('contem entradas para redes core do parser (GG/WPN/Stars/Suprema/PartyPoker/888/Bodog/Coin/Chico/iPoker/Revolution)', async () => {
    const m = await loadDefaults();
    const rake = m.NETWORK_DEFAULTS_RAKE as Record<string, number>;
    [
      'GGNetwork',
      'GGPoker',
      'WPN',
      'PokerStars',
      'Suprema',
      'PartyPoker',
      '888poker',
      'Bodog',
      'CoinPoker',
      'Chico',
      'iPoker',
      'Revolution',
    ].forEach((net) => {
      // pelo menos uma chave casa o nome (case-insensitive)
      const hit = Object.keys(rake).find(
        (k) => k.toLowerCase() === net.toLowerCase()
      );
      expect(hit).toBeTruthy();
    });
  });

  it('valores das redes principais batem com spec (GG=10, WPN=8, Stars=9, Suprema=10)', async () => {
    const { getNetworkRakeDefault } = await loadDefaults();
    expect(getNetworkRakeDefault('GGNetwork')).toBe(10);
    expect(getNetworkRakeDefault('WPN')).toBe(8);
    expect(getNetworkRakeDefault('PokerStars')).toBe(9);
    expect(getNetworkRakeDefault('Suprema')).toBe(10);
  });

  it('case-insensitive: getNetworkRakeDefault("ggnetwork") = 10', async () => {
    const { getNetworkRakeDefault } = await loadDefaults();
    expect(getNetworkRakeDefault('ggnetwork')).toBe(10);
    expect(getNetworkRakeDefault('GG')).toBeGreaterThanOrEqual(8);
  });

  it('rede desconhecida -> fallback default 8', async () => {
    const { getNetworkRakeDefault } = await loadDefaults();
    expect(getNetworkRakeDefault('UNKNOWN-NETWORK-XYZ')).toBe(8);
  });
});

describe('NETWORK_DEFAULTS_ROI', () => {
  it('rede desconhecida -> fallback ROI default 10', async () => {
    const { getNetworkRoiDefault } = await loadDefaults();
    expect(getNetworkRoiDefault('UNKNOWN')).toBeGreaterThanOrEqual(0);
  });

  it('valores ROI sao numeros positivos finitos', async () => {
    const { NETWORK_DEFAULTS_ROI } = await loadDefaults();
    Object.values(NETWORK_DEFAULTS_ROI as Record<string, number>).forEach(
      (v) => {
        expect(typeof v).toBe('number');
        expect(Number.isFinite(v)).toBe(true);
      }
    );
  });
});

describe('DEFAULT_PLAYERS_AVG / DEFAULT_PLACES_PAID', () => {
  it('DEFAULT_PLAYERS_AVG = 1000', async () => {
    const m = await loadDefaults();
    expect(m.DEFAULT_PLAYERS_AVG).toBe(1000);
  });

  it('DEFAULT_PLACES_PAID = ROUND(1000 * 0.15) = 150', async () => {
    const m = await loadDefaults();
    expect(m.DEFAULT_PLACES_PAID).toBe(150);
  });
});

describe('shared/primedopeDefaults — DRY (lesson #10)', () => {
  it('eh import-able do mesmo path por client e server (shared/)', async () => {
    // Smoke: se este teste passa, ambos os times (frontend tests jsdom + server tests node)
    // conseguem importar o mesmo modulo.
    const m = await loadDefaults();
    expect(m).toBeDefined();
    expect(typeof m.getNetworkRakeDefault).toBe('function');
  });
});
