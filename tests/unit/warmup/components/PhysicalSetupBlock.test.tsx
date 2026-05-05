import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// =============================================================================
// PhysicalSetupBlock — Reform 2026-05-05
//
// Contrato:
//   <PhysicalSetupBlock onAdvance={(payload) => void} />
//
// - Items dinamicos via localStorage (default 7 itens, ver setupItemsStore).
// - testIds: setup-item-{idx} para cada checkbox.
// - Min 3 marcados para avancar (era 4/6).
// - "Editar lista" abre modal add/edit/remove items.
// - Payload onAdvance: { setupItems: Record<string, boolean>, setupItemsList: string[] }
// =============================================================================

import { PhysicalSetupBlock } from '@/components/warmup/PhysicalSetupBlock';
import { resetSetupItems } from '@/components/warmup/setupItemsStore';

beforeEach(() => {
  vi.clearAllMocks();
  resetSetupItems();
});

describe('PhysicalSetupBlock - render', () => {
  it('exibe titulo "Setup físico"', () => {
    render(<PhysicalSetupBlock onAdvance={() => {}} />);
    expect(document.body.textContent).toMatch(/setup f[ií]sico/i);
  });

  it('renderiza 7 items default (inclui "Bancas das plataformas verificadas")', () => {
    render(<PhysicalSetupBlock onAdvance={() => {}} />);
    for (let i = 0; i < 7; i++) {
      expect(screen.getByTestId(`setup-item-${i}`)).toBeTruthy();
    }
    expect(document.body.textContent).toMatch(/bancas das plataformas verificadas/i);
  });

  it('exibe hint "Mínimo 3"', () => {
    render(<PhysicalSetupBlock onAdvance={() => {}} />);
    expect(document.body.textContent).toMatch(/m[ií]nimo 3/i);
  });

  it('exibe item "Garrafa de 1L de água"', () => {
    render(<PhysicalSetupBlock onAdvance={() => {}} />);
    expect(document.body.textContent).toMatch(/1L.*[áa]gua|[áa]gua.*1L/i);
  });

  it('exibe botao "Editar lista"', () => {
    render(<PhysicalSetupBlock onAdvance={() => {}} />);
    expect(screen.getByTestId('setup-edit-list')).toBeTruthy();
  });
});

describe('PhysicalSetupBlock - regra minimo 3', () => {
  it('botao avancar disabled com 0 marcados', () => {
    render(<PhysicalSetupBlock onAdvance={() => {}} />);
    const advance = screen.getByTestId('setup-advance') as HTMLButtonElement;
    expect(advance.disabled).toBe(true);
  });

  it('botao avancar disabled com 2 marcados', () => {
    render(<PhysicalSetupBlock onAdvance={() => {}} />);
    fireEvent.click(screen.getByTestId('setup-item-0'));
    fireEvent.click(screen.getByTestId('setup-item-1'));
    const advance = screen.getByTestId('setup-advance') as HTMLButtonElement;
    expect(advance.disabled).toBe(true);
  });

  it('botao avancar habilita com 3 marcados', () => {
    render(<PhysicalSetupBlock onAdvance={() => {}} />);
    fireEvent.click(screen.getByTestId('setup-item-0'));
    fireEvent.click(screen.getByTestId('setup-item-1'));
    fireEvent.click(screen.getByTestId('setup-item-2'));
    const advance = screen.getByTestId('setup-advance') as HTMLButtonElement;
    expect(advance.disabled).toBe(false);
  });

  it('advance envia setupItems Record + setupItemsList', () => {
    const onAdvance = vi.fn();
    render(<PhysicalSetupBlock onAdvance={onAdvance} />);

    fireEvent.click(screen.getByTestId('setup-item-0'));
    fireEvent.click(screen.getByTestId('setup-item-1'));
    fireEvent.click(screen.getByTestId('setup-item-2'));
    fireEvent.click(screen.getByTestId('setup-item-3'));

    fireEvent.click(screen.getByTestId('setup-advance'));

    expect(onAdvance).toHaveBeenCalled();
    const payload = onAdvance.mock.calls[0][0];
    expect(payload.setupItems).toBeDefined();
    expect(typeof payload.setupItems).toBe('object');
    expect(Object.values(payload.setupItems).filter(Boolean).length).toBe(4);
    expect(Array.isArray(payload.setupItemsList)).toBe(true);
    expect(payload.setupItemsList.length).toBe(7);
  });
});

describe('PhysicalSetupBlock - editor', () => {
  it('clicar em Editar abre dialog com inputs editaveis', () => {
    render(<PhysicalSetupBlock onAdvance={() => {}} />);
    fireEvent.click(screen.getByTestId('setup-edit-list'));
    expect(screen.getByTestId('setup-edit-input-0')).toBeTruthy();
    expect(screen.getByTestId('setup-edit-new-input')).toBeTruthy();
  });

  it('add novo item via "Adicionar" + Salvar persiste e mostra na lista', () => {
    render(<PhysicalSetupBlock onAdvance={() => {}} />);
    fireEvent.click(screen.getByTestId('setup-edit-list'));
    const newInput = screen.getByTestId('setup-edit-new-input') as HTMLInputElement;
    fireEvent.change(newInput, { target: { value: 'Hidratacao extra' } });
    fireEvent.click(screen.getByTestId('setup-edit-add'));
    fireEvent.click(screen.getByTestId('setup-edit-save'));
    expect(document.body.textContent).toMatch(/hidratacao extra/i);
  });
});
