/**
 * Tests for shared/tournament-type-detector.ts
 *
 * Sprint 2026-05-07 — extensao do parser para garantir que CSV upload
 * popula `type` ortogonal corretamente em vez de cair no default DB.
 */

import { describe, it, expect } from 'vitest';
import {
  detectSatelliteFromName,
  detectIsFlightFromName,
  enrichTournamentTypeFields,
} from '../../../shared/tournament-type-detector';

describe('detectSatelliteFromName', () => {
  it('detecta nomes Satellite explicitos', () => {
    expect(detectSatelliteFromName('Sunday Million Sat to ME')).toBe(true);
    expect(detectSatelliteFromName('$11 Satellite to Sunday Million')).toBe(true);
    expect(detectSatelliteFromName('Sub-sat to BSOP')).toBe(true);
    expect(detectSatelliteFromName('Step to High Roller')).toBe(true);
    expect(detectSatelliteFromName('Satelite WCOOP $109')).toBe(true);
  });

  it('NAO detecta palavras parecidas (false positives)', () => {
    expect(detectSatelliteFromName('Saturday Special')).toBe(false);
    expect(detectSatelliteFromName('Sample Tournament')).toBe(false);
    expect(detectSatelliteFromName('Sunday Million')).toBe(false);
  });

  it('tolera null/undefined/empty', () => {
    expect(detectSatelliteFromName(null)).toBe(false);
    expect(detectSatelliteFromName(undefined)).toBe(false);
    expect(detectSatelliteFromName('')).toBe(false);
  });
});

describe('detectIsFlightFromName', () => {
  it('detecta padroes Day 1/2/Final', () => {
    expect(detectIsFlightFromName('Big Game Day 1A')).toBe(true);
    expect(detectIsFlightFromName('Big Game Day 1B')).toBe(true);
    expect(detectIsFlightFromName('Big Game Day 2')).toBe(true);
    expect(detectIsFlightFromName('Big Game Final')).toBe(true);
    expect(detectIsFlightFromName('WCOOP Main Event - Day 1')).toBe(true);
    expect(detectIsFlightFromName('Sunday Storm 1A')).toBe(true);
  });

  it('detecta keywords Flight/Phase/Multi-day', () => {
    expect(detectIsFlightFromName('PSPC Flight 1')).toBe(true);
    expect(detectIsFlightFromName('Phase Tournament')).toBe(true);
    expect(detectIsFlightFromName('Multi-day Bounty')).toBe(true);
  });

  it('NAO detecta torneios single-day', () => {
    expect(detectIsFlightFromName('Sunday Million')).toBe(false);
    expect(detectIsFlightFromName('Hot 11 Turbo')).toBe(false);
    expect(detectIsFlightFromName('Bigger $33')).toBe(false);
  });

  it('tolera null/undefined/empty', () => {
    expect(detectIsFlightFromName(null)).toBe(false);
    expect(detectIsFlightFromName(undefined)).toBe(false);
    expect(detectIsFlightFromName('')).toBe(false);
  });
});

describe('enrichTournamentTypeFields', () => {
  it('preserva category SSoT explicito', () => {
    const r = enrichTournamentTypeFields({ name: 'Hot 11 PKO', category: 'PKO' });
    expect(r.type).toBe('PKO');
    expect(r.allowsAddOn).toBe(false);
    expect(r.isFlight).toBe(false);
  });

  it('Bounty legacy alias -> PKO', () => {
    const r = enrichTournamentTypeFields({ name: 'Bounty Builder', category: 'Bounty' });
    expect(r.type).toBe('PKO');
  });

  it('detecta Add-on quando category=Vanilla mas nome bate Plus', () => {
    const r = enrichTournamentTypeFields({ name: 'Hot 11 Plus', category: 'Vanilla' });
    expect(r.type).toBe('Add-on');
    expect(r.allowsAddOn).toBe(true);
  });

  it('detecta Satellite quando category=Vanilla mas nome bate Sat', () => {
    const r = enrichTournamentTypeFields({ name: 'Sat to Sunday Million', category: 'Vanilla' });
    expect(r.type).toBe('Satellite');
  });

  it('isFlight ortogonal — coexiste com qualquer tipo', () => {
    const pkoFlight = enrichTournamentTypeFields({ name: 'Big Game PKO Day 1A', category: 'PKO' });
    expect(pkoFlight.type).toBe('PKO');
    expect(pkoFlight.isFlight).toBe(true);

    const satFlight = enrichTournamentTypeFields({ name: 'Sat to ME Day 1B', category: 'Vanilla' });
    expect(satFlight.type).toBe('Satellite');
    expect(satFlight.isFlight).toBe(true);
  });

  it('coerencia: type=Add-on implica allowsAddOn=true', () => {
    const r = enrichTournamentTypeFields({ name: 'Whatever', category: 'Add-on' });
    expect(r.type).toBe('Add-on');
    expect(r.allowsAddOn).toBe(true);
  });

  it('default Vanilla quando categoria/nome neutros', () => {
    const r = enrichTournamentTypeFields({ name: 'Sunday Special', category: 'Vanilla' });
    expect(r.type).toBe('Vanilla');
    expect(r.allowsAddOn).toBe(false);
    expect(r.isFlight).toBe(false);
  });

  it('detecta ReA via nome', () => {
    const r = enrichTournamentTypeFields({ name: 'Daily Bigger Re-Entry', category: 'Vanilla' });
    expect(r.allowsReentry).toBe(true);
  });

  it('preserva null/undefined inputs sem crash', () => {
    const r = enrichTournamentTypeFields({ name: null, category: null });
    expect(r.type).toBe('Vanilla');
    expect(r.allowsAddOn).toBe(false);
  });

  it('Mystery > PKO > Satellite > Add-on prioridade', () => {
    // Quando category=Mystery, ignora qualquer hint de nome.
    const m = enrichTournamentTypeFields({ name: 'Mystery Plus', category: 'Mystery' });
    expect(m.type).toBe('Mystery');
    // allowsAddOn ainda derivado do nome
    expect(m.allowsAddOn).toBe(true);
  });
});
