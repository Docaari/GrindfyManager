import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// =============================================================================
// Testes TDD (Sprint W-1): PhysicalSetupBlock (RF-08, T-10)
//
// Contrato:
//   <PhysicalSetupBlock onAdvance={(payload) => void} />
//
// 6 toggles checklist (spec 9.4):
//   1. Garrafa de 1L de agua na mesa (water)
//   2. Snacks preparados (snacks)
//   3. Celular em modo aviao (phoneAirplane)
//   4. Notificacoes silenciadas (notificationsOff)
//   5. Fone de ouvido (headphones)
//   6. Luz ambiente calibrada (light)
//
// Regra: minimo 4/6 marcados para avancar.
// Hint rodape: "Mínimo 4 de 6 para avançar."
// Timer 1:00 (mas nao bloqueia avancar).
//
// Status: red phase.
// =============================================================================

import { PhysicalSetupBlock } from '@/components/warmup/PhysicalSetupBlock';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PhysicalSetupBlock - render', () => {
  it('exibe titulo "Setup físico"', () => {
    render(<PhysicalSetupBlock onAdvance={() => {}} />);
    expect(document.body.textContent).toMatch(/setup f[ií]sico/i);
  });

  it('renderiza 6 toggles', () => {
    render(<PhysicalSetupBlock onAdvance={() => {}} />);
    expect(screen.getByTestId('setup-water')).toBeTruthy();
    expect(screen.getByTestId('setup-snacks')).toBeTruthy();
    expect(screen.getByTestId('setup-phone-airplane')).toBeTruthy();
    expect(screen.getByTestId('setup-notifications-off')).toBeTruthy();
    expect(screen.getByTestId('setup-headphones')).toBeTruthy();
    expect(screen.getByTestId('setup-light')).toBeTruthy();
  });

  it('exibe hint "Mínimo 4 de 6"', () => {
    render(<PhysicalSetupBlock onAdvance={() => {}} />);
    expect(document.body.textContent).toMatch(/m[ií]nimo 4 de 6/i);
  });

  it('exibe item "Garrafa de 1L de água"', () => {
    render(<PhysicalSetupBlock onAdvance={() => {}} />);
    expect(document.body.textContent).toMatch(/1L.*[áa]gua|[áa]gua.*1L/i);
  });

  it('exibe item "Snacks preparados"', () => {
    render(<PhysicalSetupBlock onAdvance={() => {}} />);
    expect(document.body.textContent).toMatch(/snacks/i);
  });

  it('exibe item "Celular em modo avião"', () => {
    render(<PhysicalSetupBlock onAdvance={() => {}} />);
    expect(document.body.textContent).toMatch(/avi[aã]o|gaveta/i);
  });
});

describe('PhysicalSetupBlock - regra minimo 4/6', () => {
  it('botao avancar disabled com 0 marcados', () => {
    render(<PhysicalSetupBlock onAdvance={() => {}} />);
    const advance = screen.getByTestId('setup-advance') as HTMLButtonElement;
    expect(advance.disabled).toBe(true);
  });

  it('botao avancar disabled com 3 marcados', () => {
    render(<PhysicalSetupBlock onAdvance={() => {}} />);
    fireEvent.click(screen.getByTestId('setup-water'));
    fireEvent.click(screen.getByTestId('setup-snacks'));
    fireEvent.click(screen.getByTestId('setup-light'));
    const advance = screen.getByTestId('setup-advance') as HTMLButtonElement;
    expect(advance.disabled).toBe(true);
  });

  it('botao avancar habilita com 4 marcados', () => {
    render(<PhysicalSetupBlock onAdvance={() => {}} />);
    fireEvent.click(screen.getByTestId('setup-water'));
    fireEvent.click(screen.getByTestId('setup-snacks'));
    fireEvent.click(screen.getByTestId('setup-light'));
    fireEvent.click(screen.getByTestId('setup-headphones'));
    const advance = screen.getByTestId('setup-advance') as HTMLButtonElement;
    expect(advance.disabled).toBe(false);
  });

  it('avancar com 5/6 marcados envia setupItems com 5 trues', () => {
    const onAdvance = vi.fn();
    render(<PhysicalSetupBlock onAdvance={onAdvance} />);

    fireEvent.click(screen.getByTestId('setup-water'));
    fireEvent.click(screen.getByTestId('setup-snacks'));
    fireEvent.click(screen.getByTestId('setup-phone-airplane'));
    fireEvent.click(screen.getByTestId('setup-notifications-off'));
    fireEvent.click(screen.getByTestId('setup-headphones'));

    fireEvent.click(screen.getByTestId('setup-advance'));

    expect(onAdvance).toHaveBeenCalled();
    const payload = onAdvance.mock.calls[0][0];
    expect(payload.setupItems).toEqual({
      water: true,
      snacks: true,
      phoneAirplane: true,
      notificationsOff: true,
      headphones: true,
      light: false,
    });
  });
});
