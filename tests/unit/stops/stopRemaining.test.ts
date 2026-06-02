/**
 * Test-Writer (Modo TDD — Red Phase) — Sprint Fase D #5 (Stop-loss cold-commit)
 *
 * Spec: Docs/specs/sprint-fase-d-stop-loss-2026-06-02.md (RF-03)
 * ADR:  Docs/architecture/decisions/235-fase-d-stop-loss-cold-commit.md (D-5)
 *
 * Helper PURO: client/src/lib/stopRemaining.ts
 *   computeStopRemaining(stopLossUsd: number|null, currentDayDeltaUsd: number)
 *
 * Sinal (ADR-235 D-5, fonte de verdade):
 *   quantoFaltaUsd = stopLossUsd != null
 *     ? stopLossUsd + currentDayDeltaUsd   // delta é NEGATIVO quando perdendo
 *     : null
 *   - Ex.: stop $300, delta -$120 -> remaining = 180 (faltam $180 para o stop).
 *   - delta >= 0 (no lucro/zerado): remaining = stopLossUsd + delta (>= stopLossUsd).
 *   - stopLossUsd null -> null (sem limite/indicador).
 *
 * --- CONTRATO ATUALIZADO (FIX-WAVE, review MEDIUM-1) ---------------------------
 * computeStopRemaining retorna um OBJETO descritivo (testável sem render) com a
 * fórmula pura do ADR D-5 + flags de estado que o UI consome:
 *   {
 *     remainingUsd: number | null;   // stopLossUsd + currentDayDeltaUsd (null se stop null)
 *     state: 'no_limit' | 'losing' | 'safe' | 'breached';
 *   }
 *   - 'no_limit': stopLossUsd == null;
 *   - 'breached': stopLossUsd != null && delta < 0 && remainingUsd <= 0 (stop ATINGIDO/estourado);
 *   - 'losing'  : delta < 0 && remainingUsd > 0 (ainda há folga — "faltam $X");
 *   - 'safe'    : delta >= 0.
 * Racional (reviewer MEDIUM-1): quando o delta já passou do stop, "faltam $-X" é
 * absurdo; o estado vira 'breached'. A UI distingue "faltam $X" (losing) de "stop
 * atingido" (breached) e "no lucro/zero" (safe); some quando 'no_limit' (RF-03 AC).
 *
 * NOTA do test-writer (lesson #25): o caso-limite -$300/stop $300 ANTES afirmava
 * state 'losing' (remaining 0). Sob o novo contrato (remaining <= 0 && delta < 0 ->
 * 'breached') esse caso é 'breached'. Atualizei a assertion (este helper é o alvo do
 * mesmo fix; manter 'losing' tornaria o contrato 'breached' inimplementável).
 * -------------------------------------------------------------------------------
 *
 * PURO: zero mock. RED até o helper ganhar o estado 'breached'.
 */

import { describe, it, expect } from 'vitest';

// Módulo AINDA NÃO EXISTE — implementer cria (red phase).
import { computeStopRemaining } from '../../../client/src/lib/stopRemaining';

describe('computeStopRemaining — perdendo (delta negativo)', () => {
  it('stop $300, delta -$120 -> remaining $180, losing', () => {
    const r = computeStopRemaining(300, -120);
    expect(r.remainingUsd).toBe(180);
    expect(r.state).toBe('losing');
  });

  it('stop $150, delta -$60 -> remaining $90, losing', () => {
    const r = computeStopRemaining(150, -60);
    expect(r.remainingUsd).toBe(90);
    expect(r.state).toBe('losing');
  });

  it('delta no exato limite (stop $300, delta -$300) -> remaining $0, breached', () => {
    // FIX-WAVE (MEDIUM-1): remaining <= 0 com delta < 0 = stop ATINGIDO.
    const r = computeStopRemaining(300, -300);
    expect(r.remainingUsd).toBe(0);
    expect(r.state).toBe('breached');
  });
});

describe('computeStopRemaining — stop atingido / estourado (breached, MEDIUM-1)', () => {
  it('stop $150, delta -$200 -> remaining -$50, breached (NÃO losing)', () => {
    const r = computeStopRemaining(150, -200);
    expect(r.remainingUsd).toBe(-50);
    expect(r.state).toBe('breached');
  });

  it('stop $150, delta -$150 (boundary) -> remaining $0, breached', () => {
    const r = computeStopRemaining(150, -150);
    expect(r.remainingUsd).toBe(0);
    expect(r.state).toBe('breached');
  });

  it('delta < 0 mas ainda com folga (remaining > 0) continua losing', () => {
    const r = computeStopRemaining(150, -149.99);
    expect(r.state).toBe('losing');
  });
});

describe('computeStopRemaining — ganhando / zerado (delta >= 0)', () => {
  it('stop $300, delta +$50 -> remaining $350, safe (não "faltam -$X")', () => {
    const r = computeStopRemaining(300, 50);
    expect(r.remainingUsd).toBe(350);
    expect(r.state).toBe('safe');
  });

  it('stop $300, delta 0 (no zero) -> remaining $300, safe', () => {
    const r = computeStopRemaining(300, 0);
    expect(r.remainingUsd).toBe(300);
    expect(r.state).toBe('safe');
  });
});

describe('computeStopRemaining — sem stop-loss configurado', () => {
  it('stopLossUsd null -> remaining null, no_limit', () => {
    const r = computeStopRemaining(null, -120);
    expect(r.remainingUsd).toBeNull();
    expect(r.state).toBe('no_limit');
  });

  it('stopLossUsd null + delta 0 -> remaining null, no_limit', () => {
    const r = computeStopRemaining(null, 0);
    expect(r.remainingUsd).toBeNull();
    expect(r.state).toBe('no_limit');
  });
});
