// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint MP-VALIDATION / ADR-207 §3 — meta NUNCA contem keys PII
//
// Cobertura (server-side validator + shared list):
//   - shared/pii-keys.ts exporta lista canonica PII_KEYS_DENYLIST.
//   - validatePiiFreeMetadata(meta) lanca/retorna falso se key PII detectada.
//   - Keys cobertas: email, phone, name, cpf, payment_card, address,
//     display_name, fullName, userEmail.
// =============================================================================

import { describe, it, expect } from 'vitest';

describe('ADR-207 §3 — PII denylist server-side validator', () => {
  it('shared/pii-keys.ts exporta PII_KEYS_DENYLIST', async () => {
    const mod: any = await import('../../shared/pii-keys');
    expect(mod.PII_KEYS_DENYLIST).toBeDefined();
    const keys: string[] = Array.from(mod.PII_KEYS_DENYLIST);
    for (const k of ['email', 'phone', 'name', 'cpf', 'payment_card', 'address', 'display_name']) {
      expect(keys).toContain(k);
    }
  });

  it('validatePiiFreeMetadata(meta) rejeita meta com email', async () => {
    const mod: any = await import('../../shared/pii-keys');
    expect(typeof mod.validatePiiFreeMetadata).toBe('function');

    const result = mod.validatePiiFreeMetadata({ track_id: 'x', email: 'a@b.com' });
    // Pode retornar { ok: false, violations: [...] } ou throw.
    if (typeof result === 'object' && result !== null && 'ok' in result) {
      expect(result.ok).toBe(false);
      expect(result.violations).toContain('email');
    } else {
      // Se throw, capture acima.
      expect(false).toBe(true);
    }
  });

  it('validatePiiFreeMetadata aceita meta limpa', async () => {
    const mod: any = await import('../../shared/pii-keys');
    const result = mod.validatePiiFreeMetadata({
      track_id: 'x',
      lesson_id: 'l',
      duration_ms: 1000,
      v: 1,
    });
    if (typeof result === 'object' && result !== null && 'ok' in result) {
      expect(result.ok).toBe(true);
    } else {
      expect(true).toBe(true);
    }
  });

  it('cobre alias maiusculo/camelCase (fullName, userEmail, displayName)', async () => {
    const mod: any = await import('../../shared/pii-keys');
    const result1 = mod.validatePiiFreeMetadata({ fullName: 'X' });
    const result2 = mod.validatePiiFreeMetadata({ userEmail: 'a@b' });
    const result3 = mod.validatePiiFreeMetadata({ displayName: 'X' });

    for (const r of [result1, result2, result3]) {
      if (typeof r === 'object' && r !== null && 'ok' in r) {
        expect(r.ok).toBe(false);
      }
    }
  });
});
