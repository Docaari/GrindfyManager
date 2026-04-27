/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Spec: Docs/specs/session-end-reconciliation-v2.md
 *  - RF-03: mapeamento case-insensitive site -> wallets via SITE_ALIASES
 *  - ADR-045: tie-break com 2+ wallets candidatas
 *
 * Helper que sera exportado pelo implementer (NAO existe ainda):
 *   client/src/lib/session-end/mapSiteToWallet.ts
 *     - mapSiteToWallet(site: string, wallets: Wallet[]): Wallet[]
 *
 * Wallet shape (subset usado pelo helper):
 *   { id: string; platform: string; status: 'active'|'archived'; ... }
 *
 * SITE_ALIASES esperado (RF-03):
 *  WPN: BlackChip, BlackChipPoker, BCP, AmericasCardroom, ACR, WPN
 *  GG: GGPoker, GG, Natural8, GGNetwork, ClubGG
 *  PokerStars: PokerStars, Stars, PS
 *  PartyPoker: PartyPoker, Party
 *  888poker: 888poker, 888
 */

import { describe, it, expect } from 'vitest';
import { mapSiteToWallet } from '../mapSiteToWallet';

describe('mapSiteToWallet — match exato 1-1 (RF-03)', () => {
  it('1 wallet ativa com platform === site -> retorna ela', () => {
    const wallets = [
      { id: 'wA', platform: 'PokerStars', status: 'active' },
    ];
    const result = mapSiteToWallet('PokerStars', wallets as any);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('wA');
  });
});

describe('mapSiteToWallet — multiplas matches no mesmo grupo (RF-03 / ADR-045)', () => {
  it('2 wallets ativas mesmo platform -> ambas retornadas como candidates', () => {
    const wallets = [
      { id: 'wA', platform: 'WPN', status: 'active' },
      { id: 'wB', platform: 'WPN', status: 'active' },
    ];
    const result = mapSiteToWallet('BlackChip', wallets as any);
    expect(result).toHaveLength(2);
    const ids = result.map((w) => w.id).sort();
    expect(ids).toEqual(['wA', 'wB']);
  });
});

describe('mapSiteToWallet — wallet archived ignorada (RF-03)', () => {
  it('wallet archived com platform que bate -> ignorada', () => {
    const wallets = [
      { id: 'wA', platform: 'PokerStars', status: 'archived' },
      { id: 'wB', platform: 'PokerStars', status: 'active' },
    ];
    const result = mapSiteToWallet('PokerStars', wallets as any);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('wB');
  });

  it('todas wallets archived -> retorna [] (orfao)', () => {
    const wallets = [
      { id: 'wA', platform: 'PokerStars', status: 'archived' },
    ];
    const result = mapSiteToWallet('PokerStars', wallets as any);
    expect(result).toEqual([]);
  });
});

describe('mapSiteToWallet — sem match -> retorna [] (RF-03)', () => {
  it('site sem nenhuma wallet correspondente -> []', () => {
    const wallets = [
      { id: 'wA', platform: 'PokerStars', status: 'active' },
    ];
    const result = mapSiteToWallet('GGPoker', wallets as any);
    expect(result).toEqual([]);
  });

  it('site totalmente desconhecido (sem alias) -> []', () => {
    const wallets = [
      { id: 'wA', platform: 'PokerStars', status: 'active' },
    ];
    const result = mapSiteToWallet('SomeRandomSiteXYZ', wallets as any);
    expect(result).toEqual([]);
  });

  it('Bovada nao mapeado por default -> [] (RF-03 criterio aceitacao)', () => {
    const wallets = [
      { id: 'wA', platform: 'PokerStars', status: 'active' },
      { id: 'wB', platform: 'WPN', status: 'active' },
    ];
    const result = mapSiteToWallet('Bovada', wallets as any);
    expect(result).toEqual([]);
  });
});

describe('mapSiteToWallet — aliases case-insensitive (RF-03)', () => {
  it('site "BlackChip" mapeia para wallet platform "WPN"', () => {
    const wallets = [
      { id: 'wA', platform: 'WPN', status: 'active' },
    ];
    const result = mapSiteToWallet('BlackChip', wallets as any);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('wA');
  });

  it('site "blackchip" (lowercase) -> wallet platform "WPN"', () => {
    const wallets = [
      { id: 'wA', platform: 'WPN', status: 'active' },
    ];
    const result = mapSiteToWallet('blackchip', wallets as any);
    expect(result).toHaveLength(1);
  });

  it('site "AmericasCardroom" -> grupo WPN', () => {
    const wallets = [
      { id: 'wA', platform: 'WPN', status: 'active' },
    ];
    const result = mapSiteToWallet('AmericasCardroom', wallets as any);
    expect(result).toHaveLength(1);
  });

  it('site "ACR" -> grupo WPN', () => {
    const wallets = [
      { id: 'wA', platform: 'WPN', status: 'active' },
    ];
    const result = mapSiteToWallet('ACR', wallets as any);
    expect(result).toHaveLength(1);
  });

  it('site "ClubGG" -> grupo GG', () => {
    const wallets = [
      { id: 'wG', platform: 'GGNetwork', status: 'active' },
    ];
    const result = mapSiteToWallet('ClubGG', wallets as any);
    expect(result).toHaveLength(1);
  });

  it('site "Natural8" -> grupo GG', () => {
    const wallets = [
      { id: 'wG', platform: 'GGNetwork', status: 'active' },
    ];
    const result = mapSiteToWallet('Natural8', wallets as any);
    expect(result).toHaveLength(1);
  });

  it('site "Stars" -> grupo PokerStars', () => {
    const wallets = [
      { id: 'wPS', platform: 'PokerStars', status: 'active' },
    ];
    const result = mapSiteToWallet('Stars', wallets as any);
    expect(result).toHaveLength(1);
  });

  it('platform da wallet pode tambem usar alias (case-insensitive)', () => {
    // Wallet salva com platform "wpn" lowercase tambem deve matchear "BlackChip"
    const wallets = [
      { id: 'wA', platform: 'wpn', status: 'active' },
    ];
    const result = mapSiteToWallet('BlackChip', wallets as any);
    expect(result).toHaveLength(1);
  });

  // QA fix BUG 1: Suprema (rede argentina, popular no Brasil) — founder usa.
  it('site "Suprema" -> wallet Suprema (BRL)', () => {
    const wallets = [
      { id: 'wSup', platform: 'Suprema', nativeCurrency: 'BRL', status: 'active' },
    ];
    const result = mapSiteToWallet('Suprema', wallets as any);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('wSup');
  });

  it('site "SupremaPoker" alias -> wallet Suprema', () => {
    const wallets = [
      { id: 'wSup', platform: 'Suprema', nativeCurrency: 'BRL', status: 'active' },
    ];
    const result = mapSiteToWallet('SupremaPoker', wallets as any);
    expect(result).toHaveLength(1);
  });

  it('site "suprema" lowercase case-insensitive', () => {
    const wallets = [
      { id: 'wSup', platform: 'Suprema', nativeCurrency: 'BRL', status: 'active' },
    ];
    const result = mapSiteToWallet('suprema', wallets as any);
    expect(result).toHaveLength(1);
  });

  it('site "Liga Suprema" alias -> wallet Suprema', () => {
    const wallets = [
      { id: 'wSup', platform: 'Suprema', nativeCurrency: 'BRL', status: 'active' },
    ];
    const result = mapSiteToWallet('Liga Suprema', wallets as any);
    expect(result).toHaveLength(1);
  });
});
