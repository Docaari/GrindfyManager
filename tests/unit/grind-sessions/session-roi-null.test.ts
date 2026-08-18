import { describe, it, expect } from 'vitest';

// =============================================================================
// Red phase — ROI ausente e "—", nunca 0.
//
// Spec: Docs/specs/grind-live-manual-session-result.md (RF-03)
// ADR:  Docs/architecture/decisions/244-grind-live-manual-session-result.md (D4)
//
// MODULO SOB TESTE (ainda NAO existe — o implementer cria):
//   shared/session-roi.ts
//
//   export function parseSessionRoi(raw: unknown): number | null;
//   export function formatSessionRoi(roi: number | null): string;
//
// Por que helper puro em shared/: o mapeamento vive hoje inline em
// server/routes/grind-sessions.ts:845 —
//     const roi = parseFloat(session.roi || '0') || 0;
// — que converte NULL em 0 e faz o historico afirmar "0.0%" para uma sessao que
// nunca teve ROI. Regra do projeto (.claude/rules/03-padrao-codigo.md):
// ausencia devolve null, nunca zero inventado.
//
// O mesmo helper serve as 4 telas de sessao que exibem ROI
// (SessionHistory.tsx, GrindSession.tsx, SessionHistoryList.tsx,
// EditSessionDialog.tsx) — formatSessionRoi centraliza o "—".
//
// shared/ nao importa server/ nem client/ (.claude/rules/02-estrutura.md), por
// isso o modulo mora la e nao dentro da rota.
//
// Red esperado: modulo inexistente -> falha de resolucao de import.
// =============================================================================

import { parseSessionRoi, formatSessionRoi } from '../../../shared/session-roi';

// =============================================================================
// parseSessionRoi — leitura da coluna grind_sessions.roi (pg numeric)
// =============================================================================

describe('parseSessionRoi - ausencia vira null, nunca 0', () => {
  it('null (coluna nula no banco) -> null', () => {
    expect(parseSessionRoi(null)).toBeNull();
  });

  it('undefined (campo ausente na row) -> null', () => {
    expect(parseSessionRoi(undefined)).toBeNull();
  });

  it('string vazia -> null (nao e ROI zero)', () => {
    expect(parseSessionRoi('')).toBeNull();
  });

  it('string so com espaco -> null', () => {
    expect(parseSessionRoi('   ')).toBeNull();
  });

  it('texto nao numerico -> null (nunca 0 silencioso)', () => {
    expect(parseSessionRoi('abc')).toBeNull();
  });

  it('NaN -> null', () => {
    expect(parseSessionRoi(NaN)).toBeNull();
  });

  it('Infinity -> null (nao finito nao e ROI)', () => {
    expect(parseSessionRoi(Infinity)).toBeNull();
  });

  it('-Infinity -> null', () => {
    expect(parseSessionRoi(-Infinity)).toBeNull();
  });
});

describe('parseSessionRoi - valores reais sao preservados', () => {
  it('decimal-string do pg ("25") -> 25', () => {
    // pg numeric chega como STRING no driver (.claude/rules/01-tecnologia.md).
    expect(parseSessionRoi('25')).toBe(25);
  });

  it('decimal-string negativa ("-40.5") -> -40.5', () => {
    expect(parseSessionRoi('-40.5')).toBe(-40.5);
  });

  it('string "0" -> 0 (ROI zero REAL, distinto de ausencia)', () => {
    expect(parseSessionRoi('0')).toBe(0);
  });

  it('numero 0 -> 0 (nao vira null)', () => {
    expect(parseSessionRoi(0)).toBe(0);
  });

  it('numero negativo -> preserva o sinal', () => {
    expect(parseSessionRoi(-12.05)).toBe(-12.05);
  });

  it('decimal-string com muitas casas -> nao arredonda na leitura', () => {
    expect(parseSessionRoi('3333.3333333')).toBeCloseTo(3333.3333333, 6);
  });

  it('ROI acima de 100 -> sem cap', () => {
    expect(parseSessionRoi('300')).toBe(300);
  });
});

// =============================================================================
// formatSessionRoi — exibicao nas 4 telas de sessao
// =============================================================================

describe('formatSessionRoi - null vira travessao', () => {
  it('null -> "—" (nunca "0.0%")', () => {
    expect(formatSessionRoi(null)).toBe('—');
  });

  it('resultado de parseSessionRoi(null) encadeado -> "—"', () => {
    expect(formatSessionRoi(parseSessionRoi(null))).toBe('—');
  });
});

describe('formatSessionRoi - numeros exibidos com 1 casa e sinal', () => {
  it('25 -> "+25.0%"', () => {
    expect(formatSessionRoi(25)).toBe('+25.0%');
  });

  it('-40 -> "-40.0%"', () => {
    expect(formatSessionRoi(-40)).toBe('-40.0%');
  });

  it('0 -> "+0.0%" (zero real e exibido, nao escondido)', () => {
    expect(formatSessionRoi(0)).toBe('+0.0%');
  });

  it('-12.05 -> "-12.1%" (arredonda so na exibicao)', () => {
    expect(formatSessionRoi(-12.05)).toBe('-12.1%');
  });

  it('3333.3333 -> "+3333.3%"', () => {
    expect(formatSessionRoi(3333.3333)).toBe('+3333.3%');
  });
});
