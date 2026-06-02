/**
 * Test-Writer (Modo TDD — Red Phase) — Sprint Fase D #5 (Stop-loss cold-commit)
 *
 * Spec: Docs/specs/sprint-fase-d-stop-loss-2026-06-02.md (RF-04)
 * ADR:  Docs/architecture/decisions/235-fase-d-stop-loss-cold-commit.md (D-1)
 *
 * Helper PURO: server/coach/stops/canLoosenStopLoss.ts
 *   canLoosenStopLoss(current: number|null, next: number|null, hasActiveSession: boolean)
 *     -> { allowed: true } | { allowed: false; code: "STOP_LOOSEN_BLOCKED" }
 *
 * Regra (ADR-235 D-1):
 *   - hasActiveSession === false  -> SEMPRE allowed (a frio: sobe, desce, null).
 *   - next === current (ou ambos null) -> allowed (no-op).
 *   - current == null && next != null  -> allowed (criar proteção é sempre OK).
 *   - current != null && next == null  -> blocked (remover stop quente = afrouxar ao máximo).
 *   - current != null && next != null && next > current -> blocked (aumentar = afrouxar).
 *   - next < current -> allowed (apertar é sempre OK).
 *
 * Helper PURO: zero mock, literais. Falha em RED por import inexistente.
 */

import { describe, it, expect } from 'vitest';

// Módulo AINDA NÃO EXISTE — o implementer vai criá-lo (red phase).
import { canLoosenStopLoss } from '../../../server/coach/stops/canLoosenStopLoss';

describe('canLoosenStopLoss — SEM sessão ativa (frio): edição sempre livre', () => {
  it('afrouxar (aumentar) a frio -> allowed', () => {
    expect(canLoosenStopLoss(100, 200, false)).toEqual({ allowed: true });
  });

  it('apertar (diminuir) a frio -> allowed', () => {
    expect(canLoosenStopLoss(200, 100, false)).toEqual({ allowed: true });
  });

  it('remover (valor -> null) a frio -> allowed', () => {
    expect(canLoosenStopLoss(200, null, false)).toEqual({ allowed: true });
  });

  it('criar (null -> valor) a frio -> allowed', () => {
    expect(canLoosenStopLoss(null, 200, false)).toEqual({ allowed: true });
  });

  it('null -> null a frio -> allowed (no-op)', () => {
    expect(canLoosenStopLoss(null, null, false)).toEqual({ allowed: true });
  });
});

describe('canLoosenStopLoss — COM sessão ativa (quente)', () => {
  it('criar proteção (current=null -> next valor) -> allowed', () => {
    expect(canLoosenStopLoss(null, 200, true)).toEqual({ allowed: true });
  });

  it('apertar (next < current) -> allowed', () => {
    expect(canLoosenStopLoss(300, 150, true)).toEqual({ allowed: true });
  });

  it('afrouxar (next > current) -> blocked STOP_LOOSEN_BLOCKED', () => {
    expect(canLoosenStopLoss(150, 300, true)).toEqual({
      allowed: false,
      code: 'STOP_LOOSEN_BLOCKED',
    });
  });

  it('remover (next=null, current valor) -> blocked STOP_LOOSEN_BLOCKED', () => {
    expect(canLoosenStopLoss(300, null, true)).toEqual({
      allowed: false,
      code: 'STOP_LOOSEN_BLOCKED',
    });
  });

  it('igual (next === current) -> allowed (no-op)', () => {
    expect(canLoosenStopLoss(300, 300, true)).toEqual({ allowed: true });
  });

  it('ambos null -> allowed (no-op)', () => {
    expect(canLoosenStopLoss(null, null, true)).toEqual({ allowed: true });
  });
});

describe('canLoosenStopLoss — pureza (sem efeitos colaterais)', () => {
  it('mesma entrada produz mesma saída (determinístico)', () => {
    const a = canLoosenStopLoss(150, 300, true);
    const b = canLoosenStopLoss(150, 300, true);
    expect(a).toEqual(b);
    expect(a).toEqual({ allowed: false, code: 'STOP_LOOSEN_BLOCKED' });
  });
});
