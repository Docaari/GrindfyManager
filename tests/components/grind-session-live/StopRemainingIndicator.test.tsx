/**
 * Test-Writer (Modo TDD — Red Phase) — Sprint Fase D #5 (Stop-loss cold-commit)
 *
 * Spec: Docs/specs/sprint-fase-d-stop-loss-2026-06-02.md (RF-03)
 * ADR:  Docs/architecture/decisions/235-fase-d-stop-loss-cold-commit.md (D-5, D-6)
 *
 * Indicador "quanto falta" para o grind-live (GrindSessionLive.tsx) + /grind.
 * O ADR D-6 manda um "indicador LEVE" (NÃO o StopBanner cheio), que some quando
 * stopLossUsd == null. Como GrindSessionLive.tsx é uma página pesada (Suspense +
 * dezenas de hooks/queries), o test-writer ISOLA o indicador num componente
 * apresentacional dedicado e testável (paridade lesson #29 — secundário isolado),
 * reusando computeStopRemaining (D-5, helper puro já testado).
 *
 * --- CONTRATO ESCOLHIDO PELO TEST-WRITER (documentado p/ implementer) ----------
 * NOVO componente: client/src/components/grind-session-live/StopRemainingIndicator.tsx
 *   props: { stopLossUsd: number | null; currentDayDeltaUsd: number }
 *   - usa computeStopRemaining(stopLossUsd, currentDayDeltaUsd) (D-5).
 *   - data-testid estável: `stop-remaining` (lesson #2).
 *   - stopLossUsd == null  -> renderiza null (não mostra indicador — RF-03 AC).
 *   - delta < 0 (losing)   -> "faltam $X para o stop" (X = remainingUsd, sem sinal negativo).
 *   - delta >= 0 (safe)    -> estado positivo/neutro (NÃO "faltam -$X").
 * O implementer monta este indicador dentro de GrindSessionLive (e /grind, que já
 * tem a query ["/api/user-settings/stops"]). NÃO toca o StopBanner (bloqueio 423/lock).
 * -------------------------------------------------------------------------------
 *
 * Lessons: #14/#26 await import; #2 data-testid estável; #6 valores já em USD (props).
 *
 * RED: componente ainda não existe -> import falha; testes de presença/texto falham.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

const MOD = '../../../client/src/components/grind-session-live/StopRemainingIndicator';

async function loadIndicator() {
  const m = await import(MOD);
  return (m.StopRemainingIndicator ?? m.default) as any;
}

describe('StopRemainingIndicator — perdendo (delta < 0)', () => {
  it('stop $150 + delta -$60 -> mostra "faltam $90 para o stop"', async () => {
    const StopRemainingIndicator = await loadIndicator();
    render(<StopRemainingIndicator stopLossUsd={150} currentDayDeltaUsd={-60} />);
    const el = screen.getByTestId('stop-remaining');
    expect(el).toBeTruthy();
    expect(el.textContent).toMatch(/90/);
    expect(el.textContent).toMatch(/falta/i);
    // Nunca exibir "-90" como "faltam".
    expect(el.textContent).not.toMatch(/-90/);
  });

  it('stop $300 + delta -$120 -> mostra 180', async () => {
    const StopRemainingIndicator = await loadIndicator();
    render(<StopRemainingIndicator stopLossUsd={300} currentDayDeltaUsd={-120} />);
    expect(screen.getByTestId('stop-remaining').textContent).toMatch(/180/);
  });
});

describe('StopRemainingIndicator — ganhando/zerado (delta >= 0)', () => {
  it('stop $300 + delta +$50 -> não mostra "faltam -$X"', async () => {
    const StopRemainingIndicator = await loadIndicator();
    render(<StopRemainingIndicator stopLossUsd={300} currentDayDeltaUsd={50} />);
    const el = screen.getByTestId('stop-remaining');
    expect(el).toBeTruthy();
    expect(el.textContent).not.toMatch(/faltam\s*-/i);
  });
});

describe('StopRemainingIndicator — sem stop configurado', () => {
  it('stopLossUsd null -> não renderiza o indicador', async () => {
    const StopRemainingIndicator = await loadIndicator();
    render(<StopRemainingIndicator stopLossUsd={null} currentDayDeltaUsd={-120} />);
    expect(screen.queryByTestId('stop-remaining')).toBeNull();
  });
});

// =============================================================================
// FIX-WAVE (red phase) — review do reviewer:
//   MEDIUM-1: boundary NEGATIVO. Quando o delta já ultrapassou o stop
//             (remaining <= 0 com delta < 0), o indicador atual renderiza
//             "Faltam $-50 para o stop" (absurdo). Deve mudar para um estado
//             dedicado 'breached' (stop atingido) — NÃO mostrar "faltam $-X".
//   MEDIUM-2: formatação. Valor fracionário deve sair com 2 casas decimais,
//             nunca float longo (ex.: 233.33333333 -> "233.33").
//
// Contrato atualizado de computeStopRemaining (D-5):
//   state: 'no_limit' | 'losing' | 'safe' | 'breached'
//     - 'breached' quando stopLossUsd != null && delta < 0 && remainingUsd <= 0.
//   (helper testado em tests/unit/stops/stopRemaining.test.ts; aqui validamos o
//    COMPONENTE — render/texto.)
//
// RED esperado: hoje o componente trata todo delta<0 como 'losing' e imprime
//   `${remainingUsd}` cru -> "Faltam $-50" + floats longos. Falha até implementar.
// =============================================================================

describe('StopRemainingIndicator — boundary negativo / stop atingido (MEDIUM-1)', () => {
  it('stop $150 + delta -$200 (remaining -50) -> NÃO mostra "faltam $-50"', async () => {
    const StopRemainingIndicator = await loadIndicator();
    render(<StopRemainingIndicator stopLossUsd={150} currentDayDeltaUsd={-200} />);
    const el = screen.queryByTestId('stop-remaining');
    // Se ainda renderiza, o texto NÃO pode conter o remaining negativo "-50"
    // nem "faltam ... -" (regra anti-absurdo do reviewer).
    if (el) {
      expect(el.textContent).not.toMatch(/-50/);
      expect(el.textContent).not.toMatch(/faltam\s*\$?\s*-/i);
    }
  });

  it('stop $150 + delta -$200 -> estado "stop atingido" (breached) explícito', async () => {
    const StopRemainingIndicator = await loadIndicator();
    render(<StopRemainingIndicator stopLossUsd={150} currentDayDeltaUsd={-200} />);
    // Comportamento escolhido (recomendado pelo reviewer): mostra um aviso de
    // stop ATINGIDO em vez de "faltam". Aceita-se qualquer cópia que sinalize
    // "stop atingido/estourado/passou".
    const el = screen.getByTestId('stop-remaining');
    expect(el.textContent).toMatch(/atingido|estourad|ultrapass|passou|excedid/i);
  });

  it('boundary exato: stop $150 + delta -$150 (remaining 0) -> também breached, sem "faltam $0"', async () => {
    const StopRemainingIndicator = await loadIndicator();
    render(<StopRemainingIndicator stopLossUsd={150} currentDayDeltaUsd={-150} />);
    const el = screen.getByTestId('stop-remaining');
    expect(el.textContent).not.toMatch(/faltam\s*\$?\s*0\b/i);
    expect(el.textContent).toMatch(/atingido|estourad|ultrapass|passou|excedid/i);
  });
});

describe('StopRemainingIndicator — formatação 2 casas decimais (MEDIUM-2)', () => {
  it('stop $300 + delta -$66.6667 (remaining ~233.33) -> mostra "233.33", não float longo', async () => {
    const StopRemainingIndicator = await loadIndicator();
    render(<StopRemainingIndicator stopLossUsd={300} currentDayDeltaUsd={-66.6667} />);
    const el = screen.getByTestId('stop-remaining');
    expect(el.textContent).toMatch(/233\.33/);
    // Não pode vazar a cauda do float (ex.: 233.3333000000001).
    expect(el.textContent).not.toMatch(/233\.333\d/);
  });

  it('valor inteiro continua sem casas decimais espúrias ($90)', async () => {
    const StopRemainingIndicator = await loadIndicator();
    render(<StopRemainingIndicator stopLossUsd={150} currentDayDeltaUsd={-60} />);
    const el = screen.getByTestId('stop-remaining');
    // Aceita "90" ou "90.00"; nunca um float longo.
    expect(el.textContent).toMatch(/\b90(\.00)?\b/);
  });
});
