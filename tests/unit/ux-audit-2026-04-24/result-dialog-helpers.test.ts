import { describe, it, expect } from 'vitest';
import { shouldShowBountyField } from '../../../client/src/components/grind-session-live/result-dialog-helpers';

// =============================================================================
// UX Audit 2026-04-24 — GL-F: Result dialog adapta a PKO/Vanilla
// =============================================================================

describe('shouldShowBountyField', () => {
  it('retorna true para PKO', () => {
    expect(shouldShowBountyField('PKO')).toBe(true);
  });

  it('retorna true para Mystery', () => {
    expect(shouldShowBountyField('Mystery')).toBe(true);
  });

  it('retorna false para Vanilla', () => {
    expect(shouldShowBountyField('Vanilla')).toBe(false);
  });

  it('case-insensitive (pko / mystery / vanilla)', () => {
    expect(shouldShowBountyField('pko')).toBe(true);
    expect(shouldShowBountyField('mystery')).toBe(true);
    expect(shouldShowBountyField('MYSTERY')).toBe(true);
    expect(shouldShowBountyField('vanilla')).toBe(false);
  });

  it('retorna false para null/undefined/string vazia', () => {
    expect(shouldShowBountyField(null)).toBe(false);
    expect(shouldShowBountyField(undefined)).toBe(false);
    expect(shouldShowBountyField('')).toBe(false);
    expect(shouldShowBountyField('   ')).toBe(false);
  });

  it('retorna false para tipos desconhecidos', () => {
    expect(shouldShowBountyField('HighRoller')).toBe(false);
    expect(shouldShowBountyField('SnG')).toBe(false);
  });

  it('trim aplicado antes de comparar', () => {
    expect(shouldShowBountyField('  PKO  ')).toBe(true);
    expect(shouldShowBountyField('  Mystery ')).toBe(true);
  });
});
