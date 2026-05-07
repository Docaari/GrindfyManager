/**
 * Tests for `getNetworkForSite` helper.
 *
 * Sprint Grind-Cards-Reform v2 — CA-17.
 *
 * Espera-se que `shared/platform-currency.ts` exporte `getNetworkForSite(site)`
 * que mapeia variacoes de site (ACR, BlackChip, GGPoker, Natural8, etc) para
 * a network agregada (WPN, GGNetwork, PokerStars, etc). Sites desconhecidos
 * sao agregados em "Outras". Aceita null/undefined/string vazia/whitespace.
 */

import { describe, it, expect } from 'vitest';
import { getNetworkForSite } from '@shared/platform-currency';

describe('getNetworkForSite — WPN aliases', () => {
  it('returns WPN for ACR', () => {
    expect(getNetworkForSite('ACR')).toBe('WPN');
  });

  it('returns WPN for "Americas Cardroom"', () => {
    expect(getNetworkForSite('Americas Cardroom')).toBe('WPN');
  });

  it('returns WPN for BlackChip', () => {
    expect(getNetworkForSite('BlackChip')).toBe('WPN');
  });
});

describe('getNetworkForSite — GGNetwork aliases', () => {
  it('returns GGNetwork for GGPoker', () => {
    expect(getNetworkForSite('GGPoker')).toBe('GGNetwork');
  });

  it('returns GGNetwork for Natural8', () => {
    expect(getNetworkForSite('Natural8')).toBe('GGNetwork');
  });

  it('returns GGNetwork for "GG"', () => {
    expect(getNetworkForSite('GG')).toBe('GGNetwork');
  });
});

describe('getNetworkForSite — PokerStars aliases', () => {
  it('returns PokerStars for PokerStars', () => {
    expect(getNetworkForSite('PokerStars')).toBe('PokerStars');
  });

  it('returns PokerStars for PS.ES', () => {
    expect(getNetworkForSite('PS.ES')).toBe('PokerStars');
  });
});

describe('getNetworkForSite — outros networks', () => {
  it('returns PartyPoker for PartyPoker', () => {
    expect(getNetworkForSite('PartyPoker')).toBe('PartyPoker');
  });

  it('returns 888poker for 888poker', () => {
    expect(getNetworkForSite('888poker')).toBe('888poker');
  });

  it('returns Bodog for Bodog', () => {
    expect(getNetworkForSite('Bodog')).toBe('Bodog');
  });

  it('returns Suprema for Suprema', () => {
    expect(getNetworkForSite('Suprema')).toBe('Suprema');
  });

  it('returns Suprema for SupremaPoker', () => {
    expect(getNetworkForSite('SupremaPoker')).toBe('Suprema');
  });
});

describe('getNetworkForSite — fallback Outras', () => {
  it('returns Outras for unknown site (SuperPoker)', () => {
    expect(getNetworkForSite('SuperPoker')).toBe('Outras');
  });

  it('returns Outras for empty string', () => {
    expect(getNetworkForSite('')).toBe('Outras');
  });

  it('returns Outras for null', () => {
    expect(getNetworkForSite(null as any)).toBe('Outras');
  });

  it('returns Outras for undefined', () => {
    expect(getNetworkForSite(undefined as any)).toBe('Outras');
  });
});

describe('getNetworkForSite — case-insensitive + trim', () => {
  it('trims leading/trailing spaces and is case-insensitive', () => {
    expect(getNetworkForSite('  ACR  ')).toBe('WPN');
  });
});
