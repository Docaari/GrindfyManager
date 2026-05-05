import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// PhysicalSetupBlock — Reform 2026-05-05 (ADR-120)
//
// Persistencia migrou para useSetupItems (PUT /api/user-settings/warmup-setup-items).
// Mockamos apiRequest para retornar warmupSetupItems no shape do server.
// =============================================================================

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '@/lib/queryClient';
import { PhysicalSetupBlock } from '@/components/warmup/PhysicalSetupBlock';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: server retorna warmupSetupItems=null → fallback DEFAULT_SETUP_ITEMS
  (apiRequest as any).mockResolvedValue({ warmupSetupItems: null });
});

describe('PhysicalSetupBlock - render', () => {
  it('exibe titulo "Setup físico"', async () => {
    render(withClient(<PhysicalSetupBlock onAdvance={() => {}} />));
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/setup f[ií]sico/i);
    });
  });

  it('renderiza 7 items default (inclui "Bancas das plataformas verificadas")', async () => {
    render(withClient(<PhysicalSetupBlock onAdvance={() => {}} />));
    await waitFor(() => {
      for (let i = 0; i < 7; i++) {
        expect(screen.getByTestId(`setup-item-${i}`)).toBeTruthy();
      }
    });
    expect(document.body.textContent).toMatch(/bancas das plataformas verificadas/i);
  });

  it('exibe hint "Mínimo 3"', async () => {
    render(withClient(<PhysicalSetupBlock onAdvance={() => {}} />));
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/m[ií]nimo 3/i);
    });
  });

  it('exibe botao "Editar lista"', async () => {
    render(withClient(<PhysicalSetupBlock onAdvance={() => {}} />));
    await waitFor(() => {
      expect(screen.getByTestId('setup-edit-list')).toBeTruthy();
    });
  });
});

describe('PhysicalSetupBlock - regra minimo 3', () => {
  it('botao avancar disabled com 0 marcados', async () => {
    render(withClient(<PhysicalSetupBlock onAdvance={() => {}} />));
    await waitFor(() => {
      const advance = screen.getByTestId('setup-advance') as HTMLButtonElement;
      expect(advance.disabled).toBe(true);
    });
  });

  it('botao avancar disabled com 2 marcados', async () => {
    render(withClient(<PhysicalSetupBlock onAdvance={() => {}} />));
    await waitFor(() => screen.getByTestId('setup-item-0'));
    fireEvent.click(screen.getByTestId('setup-item-0'));
    fireEvent.click(screen.getByTestId('setup-item-1'));
    const advance = screen.getByTestId('setup-advance') as HTMLButtonElement;
    expect(advance.disabled).toBe(true);
  });

  it('botao avancar habilita com 3 marcados', async () => {
    render(withClient(<PhysicalSetupBlock onAdvance={() => {}} />));
    await waitFor(() => screen.getByTestId('setup-item-0'));
    fireEvent.click(screen.getByTestId('setup-item-0'));
    fireEvent.click(screen.getByTestId('setup-item-1'));
    fireEvent.click(screen.getByTestId('setup-item-2'));
    const advance = screen.getByTestId('setup-advance') as HTMLButtonElement;
    expect(advance.disabled).toBe(false);
  });

  it('advance envia setupItems Record + setupItemsList', async () => {
    const onAdvance = vi.fn();
    render(withClient(<PhysicalSetupBlock onAdvance={onAdvance} />));
    await waitFor(() => screen.getByTestId('setup-item-0'));

    fireEvent.click(screen.getByTestId('setup-item-0'));
    fireEvent.click(screen.getByTestId('setup-item-1'));
    fireEvent.click(screen.getByTestId('setup-item-2'));
    fireEvent.click(screen.getByTestId('setup-item-3'));
    fireEvent.click(screen.getByTestId('setup-advance'));

    expect(onAdvance).toHaveBeenCalled();
    const payload = onAdvance.mock.calls[0][0];
    expect(typeof payload.setupItems).toBe('object');
    expect(Object.values(payload.setupItems).filter(Boolean).length).toBe(4);
    expect(Array.isArray(payload.setupItemsList)).toBe(true);
    expect(payload.setupItemsList.length).toBe(7);
  });
});

describe('PhysicalSetupBlock - editor', () => {
  it('clicar em Editar abre dialog com inputs editaveis', async () => {
    render(withClient(<PhysicalSetupBlock onAdvance={() => {}} />));
    await waitFor(() => screen.getByTestId('setup-edit-list'));
    fireEvent.click(screen.getByTestId('setup-edit-list'));
    expect(screen.getByTestId('setup-edit-input-0')).toBeTruthy();
    expect(screen.getByTestId('setup-edit-new-input')).toBeTruthy();
  });

  it('add novo item + Salvar dispara PUT /api/user-settings/warmup-setup-items', async () => {
    (apiRequest as any).mockImplementation((method: any, urlArg?: any) => {
      const url = typeof urlArg === 'string' ? urlArg : method;
      if (typeof url === 'string' && url.includes('warmup-setup-items')) {
        return Promise.resolve({ items: ['x', 'Hidratacao extra'] });
      }
      return Promise.resolve({ warmupSetupItems: null });
    });

    render(withClient(<PhysicalSetupBlock onAdvance={() => {}} />));
    await waitFor(() => screen.getByTestId('setup-edit-list'));
    fireEvent.click(screen.getByTestId('setup-edit-list'));
    const newInput = screen.getByTestId('setup-edit-new-input') as HTMLInputElement;
    fireEvent.change(newInput, { target: { value: 'Hidratacao extra' } });
    fireEvent.click(screen.getByTestId('setup-edit-add'));
    fireEvent.click(screen.getByTestId('setup-edit-save'));

    await waitFor(() => {
      const calls = (apiRequest as any).mock.calls;
      const putCall = calls.find((args: any[]) =>
        JSON.stringify(args).includes('warmup-setup-items'),
      );
      expect(putCall).toBeTruthy();
    });
  });
});
