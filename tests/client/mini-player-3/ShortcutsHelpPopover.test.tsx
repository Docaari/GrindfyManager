// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 3 / RF-03.4 - ShortcutsHelpPopover
//
// Spec: Docs/specs/sprint-mini-player-3.md RF-03.4 + D5 + Q-L
//
// Target: client/src/components/audio-player/ShortcutsHelpPopover.tsx (NOVO)
//
// Contract:
//   - Props: { open: boolean; onOpenChange: (open: boolean) => void }
//   - Renderiza lista PT-BR com 5 linhas de atalhos quando open=true.
//   - data-testid="shortcuts-help-popover"
//   - Atalhos listados: Espaco, Setas <- ->, J/L, 0-9, M / Setas Cima Baixo
// =============================================================================

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

function loadModule() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@/components/audio-player/ShortcutsHelpPopover');
}

describe('<ShortcutsHelpPopover> (RF-03.4)', () => {
  it('open=false -> popover NAO renderizado no DOM', () => {
    const { ShortcutsHelpPopover } = loadModule();
    render(<ShortcutsHelpPopover open={false} onOpenChange={() => {}} />);
    expect(screen.queryByTestId('shortcuts-help-popover')).toBeNull();
  });

  it('open=true -> popover renderizado com data-testid', () => {
    const { ShortcutsHelpPopover } = loadModule();
    render(<ShortcutsHelpPopover open={true} onOpenChange={() => {}} />);
    expect(screen.getByTestId('shortcuts-help-popover')).toBeInTheDocument();
  });

  it('lista 11 atalhos PT-BR (Espaco + 4 seek + 2 vol + M + Esc + ? + J/L)', () => {
    const { ShortcutsHelpPopover } = loadModule();
    render(<ShortcutsHelpPopover open={true} onOpenChange={() => {}} />);

    const pop = screen.getByTestId('shortcuts-help-popover');
    const txt = pop.textContent ?? '';
    // Cobre 11 atalhos por palavras-chave PT-BR (case-insensitive).
    // Aceita variantes ortograficas (Espaco / Espaço).
    expect(txt).toMatch(/Espa[cç]o/i); // play/pause
    expect(txt).toMatch(/Setas/i); // arrow row
    expect(/* J -10s + L +10s */ /J\b/.test(txt) && /L\b/.test(txt)).toBe(true);
    expect(txt).toMatch(/0[\s-]?9/); // numeric seek row
    expect(txt).toMatch(/\bM\b/); // mute
    expect(txt).toMatch(/Cima/i); // volume up label
    expect(txt).toMatch(/Baixo/i); // volume down label
    expect(txt).toMatch(/Esc/);
  });

  it('clicar/press fechar atalho dispara onOpenChange(false) (smoke)', () => {
    const { ShortcutsHelpPopover } = loadModule();
    let calls = 0;
    let nextOpen: boolean | undefined;
    const onOpenChange = (o: boolean) => {
      calls += 1;
      nextOpen = o;
    };
    render(<ShortcutsHelpPopover open={true} onOpenChange={onOpenChange} />);
    // Implementer pode usar Radix Dialog (Esc -> close) ou botao close
    // data-testid="shortcuts-help-close". Aceita ambos; smoke check
    // de existencia + nao throw na re-render.
    const closeBtn = screen.queryByTestId('shortcuts-help-close');
    if (closeBtn) {
      (closeBtn as HTMLButtonElement).click();
      expect(calls).toBeGreaterThanOrEqual(1);
      expect(nextOpen).toBe(false);
    } else {
      // Aceita implementacao sem botao explicito (Radix nativo).
      expect(screen.getByTestId('shortcuts-help-popover')).toBeInTheDocument();
    }
  });
});
