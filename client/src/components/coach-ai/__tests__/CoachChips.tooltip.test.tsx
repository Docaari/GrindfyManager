/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint UX-QW-2 — RF-07
 * Spec: Docs/specs/sprint-ux-qw-2.md
 *
 * Em /coach-ai (aba Chat) os chips Mental/Selecao/Tecnico ja existem em
 * CoachAI.tsx (linhas 391-411). Spec RF-07 manda:
 *   1. Wrapper <Tooltip> em cada chip — texto: "Foco desta conversa — voce
 *      pode mudar a qualquer momento. Nao sao agentes diferentes."
 *   2. Linha de status abaixo dos chips: "Foco da conversa: {lenteAtual}"
 *   3. Acessibilidade: aria-describedby ligando ao conteudo do tooltip.
 *
 * Decisao TDD: implementer extrai os chips para componente standalone
 * `<CoachLensChips>` em `client/src/components/coach-ai/CoachLensChips.tsx`
 * (motivos: testavel, reusavel, segue lesson #11). Importa e usa em
 * CoachAI.tsx no lugar do bloco inline.
 *
 * Lessons aplicadas:
 *   #2  data-testid estavel (coach-lens-chip-{value}, coach-lens-tooltip-{value},
 *       coach-lens-status).
 *   #14 import estatico (await import).
 *   #27 Radix Tooltip reage a onMouseEnter/onFocus — usar userEvent.hover
 *       (NAO fireEvent.mouseEnter).
 *   #28 mock por path: paths exatos.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Radix Tooltip precisa de TooltipProvider — wrap se necessario.
import { TooltipProvider } from '@/components/ui/tooltip';

function wrap(ui: React.ReactElement) {
  return <TooltipProvider>{ui}</TooltipProvider>;
}

// Path como variavel — Vite NAO resolve estatico em RED phase.
const CHIPS_PATH = '@/components/coach-ai/CoachLensChips';

async function loadChips() {
  // @ts-expect-error — RED: componente ainda nao existe
  const mod: any = await import(/* @vite-ignore */ CHIPS_PATH);
  return (mod.default ?? mod.CoachLensChips) as React.ComponentType<any>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// Render basico — 3 chips
// ===========================================================================

describe('RF-07 CoachLensChips — render', () => {
  it('renderiza 3 chips (mental, tournament, technical)', async () => {
    const Chips = await loadChips();
    render(
      wrap(<Chips coachType="technical" onChangeCoachType={vi.fn()} />),
    );
    expect(screen.getByTestId('coach-lens-chip-mental')).toBeInTheDocument();
    expect(
      screen.getByTestId('coach-lens-chip-tournament'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('coach-lens-chip-technical'),
    ).toBeInTheDocument();
  });

  it('chip ativo (coachType) tem aria-pressed=true', async () => {
    const Chips = await loadChips();
    render(wrap(<Chips coachType="mental" onChangeCoachType={vi.fn()} />));
    expect(
      screen.getByTestId('coach-lens-chip-mental').getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen
        .getByTestId('coach-lens-chip-technical')
        .getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('click em chip chama onChangeCoachType com o value', async () => {
    const onChangeCoachType = vi.fn();
    const Chips = await loadChips();
    render(
      wrap(<Chips coachType="technical" onChangeCoachType={onChangeCoachType} />),
    );
    await userEvent.click(screen.getByTestId('coach-lens-chip-mental'));
    expect(onChangeCoachType).toHaveBeenCalledWith('mental');
  });
});

// ===========================================================================
// Tooltips (lesson #27 — Radix reage a hover/focus)
// ===========================================================================

describe('RF-07 CoachLensChips — tooltip no hover/focus', () => {
  it('hover em chip Mental mostra tooltip com texto explicativo', async () => {
    const Chips = await loadChips();
    render(
      wrap(<Chips coachType="technical" onChangeCoachType={vi.fn()} />),
    );
    const chip = screen.getByTestId('coach-lens-chip-mental');
    await userEvent.hover(chip);
    await waitFor(() => {
      const tooltips = screen.queryAllByTestId('coach-lens-tooltip-mental');
      expect(tooltips.length).toBeGreaterThanOrEqual(1);
      // Texto canonico do spec RF-07.
      const text = tooltips.map((n) => n.textContent ?? '').join(' ');
      expect(text).toMatch(/Foco desta conversa/i);
      expect(text).toMatch(/nao sao agentes diferentes/i);
    });
  });

  it('focus em chip via keyboard tambem dispara tooltip', async () => {
    const Chips = await loadChips();
    render(
      wrap(<Chips coachType="technical" onChangeCoachType={vi.fn()} />),
    );
    const chip = screen.getByTestId('coach-lens-chip-tournament');
    chip.focus();
    await waitFor(() => {
      const tooltips = screen.queryAllByTestId('coach-lens-tooltip-tournament');
      expect(tooltips.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// ===========================================================================
// Linha de status "Foco da conversa: X"
// ===========================================================================

describe('RF-07 CoachLensChips — linha de status', () => {
  it('exibe "Foco da conversa: Mental" quando coachType=mental', async () => {
    const Chips = await loadChips();
    render(wrap(<Chips coachType="mental" onChangeCoachType={vi.fn()} />));
    const status = screen.getByTestId('coach-lens-status');
    expect(status.textContent).toMatch(/Foco da conversa/i);
    expect(status.textContent).toMatch(/Mental/i);
  });

  it('exibe "Foco da conversa: Selecao" quando coachType=tournament', async () => {
    const Chips = await loadChips();
    render(
      wrap(<Chips coachType="tournament" onChangeCoachType={vi.fn()} />),
    );
    const status = screen.getByTestId('coach-lens-status');
    expect(status.textContent).toMatch(/Selecao|Selec[ãa]o/);
  });

  it('exibe "Foco da conversa: Tecnico" quando coachType=technical', async () => {
    const Chips = await loadChips();
    render(
      wrap(<Chips coachType="technical" onChangeCoachType={vi.fn()} />),
    );
    const status = screen.getByTestId('coach-lens-status');
    expect(status.textContent).toMatch(/Tecnico|T[ée]cnico/);
  });

  it('status atualiza quando coachType muda (re-render)', async () => {
    const Chips = await loadChips();
    const { rerender } = render(
      wrap(<Chips coachType="mental" onChangeCoachType={vi.fn()} />),
    );
    expect(screen.getByTestId('coach-lens-status').textContent).toMatch(
      /Mental/i,
    );
    rerender(
      wrap(<Chips coachType="technical" onChangeCoachType={vi.fn()} />),
    );
    expect(screen.getByTestId('coach-lens-status').textContent).toMatch(
      /Tecnico|T[ée]cnico/,
    );
  });
});

// ===========================================================================
// Sem regressao em comportamento de click + acessibilidade
// ===========================================================================

describe('RF-07 CoachLensChips — sem regressao', () => {
  it('cada chip eh <button> (interacao via teclado)', async () => {
    const Chips = await loadChips();
    render(wrap(<Chips coachType="technical" onChangeCoachType={vi.fn()} />));
    expect(screen.getByTestId('coach-lens-chip-mental').tagName).toBe('BUTTON');
    expect(screen.getByTestId('coach-lens-chip-tournament').tagName).toBe(
      'BUTTON',
    );
    expect(screen.getByTestId('coach-lens-chip-technical').tagName).toBe(
      'BUTTON',
    );
  });

  it('click em chip ja ativo NAO quebra (idempotente)', async () => {
    const onChangeCoachType = vi.fn();
    const Chips = await loadChips();
    render(
      wrap(<Chips coachType="mental" onChangeCoachType={onChangeCoachType} />),
    );
    await userEvent.click(screen.getByTestId('coach-lens-chip-mental'));
    expect(onChangeCoachType).toHaveBeenCalledWith('mental');
  });
});
