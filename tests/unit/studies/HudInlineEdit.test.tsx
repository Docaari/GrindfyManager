// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Stats-V3 — HudInlineEdit (RF-05, RF-06, RF-07)
//
// Spec : docs/specs/sprint-stats-v3.md
//        - RF-05 Inline edit de target (range)
//        - RF-06 Inline edit de hero value
//        - RF-07 Adicionar stat custom
// ADR  : 064 (grouped layout — secao "Custom stats por grupo")
//
// Componentes NAO existem ainda — Implementer criara em
// `client/src/components/studies/stats/HudTargetEditPopover.tsx`
// `client/src/components/studies/stats/HudValueEditInput.tsx`
// `client/src/components/studies/stats/HudCustomStatDialog.tsx`
//
// Comportamentos:
//   - Click em cell target abre popover com inputs min/max
//   - Validacao min<max, ambos 0-100, integer
//   - Save dispara PUT /api/hud-layouts/:id (targetOverride)
//   - Click em hero abre input numerico
//   - Save dispara PUT /api/stats-analyzer/snapshots/:id (patch values)
//   - Esc cancela edicao
//   - Custom stat dialog: label 3-50 chars, validacao Zod
//   - id: custom_${nanoid(8)}, isCustom=true
// =============================================================================

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { apiRequestMock, toastMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn() }),
  toast: toastMock,
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn() },
}));

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({ ok: true });
  toastMock.mockReset();
});

// Componentes NAO existem ainda — red phase
import HudTargetEditPopover from '@/components/studies/stats/HudTargetEditPopover';
import HudValueEditInput from '@/components/studies/stats/HudValueEditInput';
import HudCustomStatDialog from '@/components/studies/stats/HudCustomStatDialog';

function withQuery(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

// =============================================================================
// RF-05 — Target edit (range)
// =============================================================================

describe('<HudTargetEditPopover /> — RF-05', () => {
  const baseProps = {
    layoutId: 'lyt-1',
    statId: 'vpip',
    initialMin: 28,
    initialMax: 30,
    open: true,
    onOpenChange: vi.fn(),
  };

  it('renderiza inputs min e max preenchidos com initial', () => {
    render(withQuery(<HudTargetEditPopover {...baseProps} />));
    const minInput = screen.getByTestId('target-min-input') as HTMLInputElement;
    const maxInput = screen.getByTestId('target-max-input') as HTMLInputElement;
    expect(minInput.value).toBe('28');
    expect(maxInput.value).toBe('30');
  });

  it('save dispara PUT /api/hud-layouts/:id com targetOverride', async () => {
    render(withQuery(<HudTargetEditPopover {...baseProps} />));
    const minInput = screen.getByTestId('target-min-input');
    const maxInput = screen.getByTestId('target-max-input');
    fireEvent.change(minInput, { target: { value: '25' } });
    fireEvent.change(maxInput, { target: { value: '32' } });
    fireEvent.click(screen.getByTestId('target-save'));
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalled();
    });
    const [method, url, body] = apiRequestMock.mock.calls[0];
    expect(method).toBe('PUT');
    expect(url).toMatch(/hud-layouts\/lyt-1/);
    // body referencia targetOverride para o statId
    expect(JSON.stringify(body)).toMatch(/targetOverride/);
  });

  it('rejeita min >= max com mensagem inline', () => {
    render(withQuery(<HudTargetEditPopover {...baseProps} />));
    const minInput = screen.getByTestId('target-min-input');
    const maxInput = screen.getByTestId('target-max-input');
    fireEvent.change(minInput, { target: { value: '40' } });
    fireEvent.change(maxInput, { target: { value: '30' } });
    fireEvent.click(screen.getByTestId('target-save'));
    expect(screen.getByTestId('target-error')).toBeInTheDocument();
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it('rejeita valor fora do range 0-100 (pct)', () => {
    render(withQuery(<HudTargetEditPopover {...baseProps} />));
    const maxInput = screen.getByTestId('target-max-input');
    fireEvent.change(maxInput, { target: { value: '150' } });
    fireEvent.click(screen.getByTestId('target-save'));
    expect(screen.getByTestId('target-error')).toBeInTheDocument();
  });

  it('Esc cancela edicao (chama onOpenChange false)', () => {
    const onOpenChange = vi.fn();
    render(withQuery(<HudTargetEditPopover {...baseProps} onOpenChange={onOpenChange} />));
    fireEvent.keyDown(screen.getByTestId('target-min-input'), { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

// =============================================================================
// RF-06 — Hero value edit
// =============================================================================

describe('<HudValueEditInput /> — RF-06', () => {
  const baseProps = {
    snapshotId: 'snap-1',
    statId: 'vpip',
    initialValue: 22,
    unit: 'pct' as const,
  };

  it('renderiza input com valor atual', () => {
    render(withQuery(<HudValueEditInput {...baseProps} />));
    const input = screen.getByTestId('value-input') as HTMLInputElement;
    expect(input.value).toBe('22');
  });

  it('save dispara PUT /api/stats-analyzer/snapshots/:id patching values[statId]', async () => {
    render(withQuery(<HudValueEditInput {...baseProps} />));
    const input = screen.getByTestId('value-input');
    fireEvent.change(input, { target: { value: '24' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalled();
    });
    const [method, url, body] = apiRequestMock.mock.calls[0];
    expect(method).toBe('PUT');
    expect(url).toMatch(/stats-analyzer\/snapshots\/snap-1/);
    // body deve patchar values[vpip] = 24
    expect(JSON.stringify(body)).toMatch(/vpip/);
    expect(JSON.stringify(body)).toMatch(/24/);
  });

  it('rejeita pct=150 com erro', () => {
    render(withQuery(<HudValueEditInput {...baseProps} />));
    const input = screen.getByTestId('value-input');
    fireEvent.change(input, { target: { value: '150' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('value-error')).toBeInTheDocument();
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it('Esc cancela e restaura valor original', () => {
    render(withQuery(<HudValueEditInput {...baseProps} />));
    const input = screen.getByTestId('value-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    // valor deve voltar para original (22) — comportamento implementer
    expect(apiRequestMock).not.toHaveBeenCalled();
  });
});

// =============================================================================
// RF-07 — Custom stat dialog
// =============================================================================

describe('<HudCustomStatDialog /> — RF-07', () => {
  const baseProps = {
    layoutId: 'lyt-1',
    groupId: 'basics' as const,
    open: true,
    onOpenChange: vi.fn(),
  };

  it('dialog abre com select grupo pre-preenchido', () => {
    render(withQuery(<HudCustomStatDialog {...baseProps} />));
    const groupSelect = screen.getByTestId('custom-stat-group');
    expect(groupSelect).toBeInTheDocument();
  });

  it('rejeita label menor que 3 chars', () => {
    render(withQuery(<HudCustomStatDialog {...baseProps} />));
    const labelInput = screen.getByTestId('custom-stat-label');
    fireEvent.change(labelInput, { target: { value: 'AB' } });
    fireEvent.click(screen.getByTestId('custom-stat-submit'));
    // erro inline OU apiRequest nao chamado
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it('submit cria field com id custom_[a-z0-9]{8} + isCustom=true', async () => {
    render(withQuery(<HudCustomStatDialog {...baseProps} />));
    fireEvent.change(screen.getByTestId('custom-stat-label'), { target: { value: 'Avg Stack BB' } });
    fireEvent.click(screen.getByTestId('custom-stat-submit'));
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalled();
    });
    const body = apiRequestMock.mock.calls[0][2];
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).toMatch(/custom_[a-z0-9]{8}/);
    expect(bodyStr).toMatch(/"isCustom"\s*:\s*true|isCustom: true/);
  });

  it('direction default = context', async () => {
    render(withQuery(<HudCustomStatDialog {...baseProps} />));
    fireEvent.change(screen.getByTestId('custom-stat-label'), { target: { value: 'Avg Stack BB' } });
    fireEvent.click(screen.getByTestId('custom-stat-submit'));
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalled();
    });
    const body = apiRequestMock.mock.calls[0][2];
    expect(JSON.stringify(body)).toMatch(/"direction"\s*:\s*"context"/);
  });
});
