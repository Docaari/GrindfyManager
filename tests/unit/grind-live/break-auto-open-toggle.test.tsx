import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Testes TDD (red phase) — BreakAutoOpenToggle component.
//
// Spec: Docs/specs/grind-live-break-auto-open.md (RF-01)
// ADR: Docs/architecture/decisions/124-break-auto-open-clock-aligned-brt.md
//
// Implementer DEVE criar:
//   client/src/components/grind-session/BreakAutoOpenToggle.tsx
//
// Contrato:
//   <BreakAutoOpenToggle
//     hasActiveSession: boolean    // se false, retorna null
//     enabled: boolean             // estado inicial (do user_settings)
//     onToggle?: (next: boolean) => void  // callback opcional para parent
//   />
//
// Internamente:
//   - Switch shadcn com data-testid="toggle-break-auto-open"
//   - Click dispara apiRequest("PATCH", "/api/user-settings", { breakAutoOpenEnabled: next })
//   - Otimista: setQueryData('userAlertSettings', { breakAutoOpenEnabled: next })
//   - Rollback + toast erro se PATCH falha
//
// Estrategia (lesson #13): mockar `apiRequest` retornando JSON parseado direto
// (NAO `{ ok, json: () => ... }`).
//
// Estrategia (lesson #14): Vite faz analise estatica de await import('literal-path')
// e quebra red phase. Construimos a string em runtime + /* @vite-ignore */.
// =============================================================================

vi.mock('../../../client/src/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueryData: vi.fn() },
}));

// Toast mock — qualquer chamada de useToast retorna o mock dummy.
vi.mock('../../../client/src/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));

import { apiRequest } from '../../../client/src/lib/queryClient';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const TOGGLE_PATH = '../../../client/src/components/grind-session/BreakAutoOpenToggle';
async function loadToggle(): Promise<any> {
  return await import(/* @vite-ignore */ TOGGLE_PATH);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BreakAutoOpenToggle - render conditional', () => {
  it('hasActiveSession=false -> nao renderiza nada', async () => {
    const { BreakAutoOpenToggle } = await loadToggle();
    const { container } = render(
      withClient(<BreakAutoOpenToggle hasActiveSession={false} enabled />)
    );
    expect(container.firstChild).toBeNull();
  });

  it('hasActiveSession=true -> renderiza toggle', async () => {
    const { BreakAutoOpenToggle } = await loadToggle();
    render(withClient(<BreakAutoOpenToggle hasActiveSession enabled />));
    expect(screen.getByTestId('toggle-break-auto-open')).toBeTruthy();
  });
});

describe('BreakAutoOpenToggle - estado inicial', () => {
  it('enabled=true -> aria-checked="true"', async () => {
    const { BreakAutoOpenToggle } = await loadToggle();
    render(withClient(<BreakAutoOpenToggle hasActiveSession enabled />));
    const sw = screen.getByTestId('toggle-break-auto-open');
    expect(sw.getAttribute('aria-checked')).toBe('true');
  });

  it('enabled=false -> aria-checked="false"', async () => {
    const { BreakAutoOpenToggle } = await loadToggle();
    render(withClient(<BreakAutoOpenToggle hasActiveSession enabled={false} />));
    const sw = screen.getByTestId('toggle-break-auto-open');
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });
});

describe('BreakAutoOpenToggle - PUT otimista', () => {
  it('click ON->OFF dispara apiRequest("PUT", "/api/user-settings", { breakAutoOpenEnabled: false })', async () => {
    (apiRequest as any).mockResolvedValue({ breakAutoOpenEnabled: false });
    const { BreakAutoOpenToggle } = await loadToggle();
    render(withClient(<BreakAutoOpenToggle hasActiveSession enabled />));

    fireEvent.click(screen.getByTestId('toggle-break-auto-open'));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalled();
    });
    const calls = (apiRequest as any).mock.calls;
    const match = calls.find(
      (c: any[]) =>
        c[0] === 'PUT' &&
        c[1] === '/api/user-settings' &&
        c[2] &&
        c[2].breakAutoOpenEnabled === false
    );
    expect(match).toBeTruthy();
  });

  it('click OFF->ON dispara apiRequest com breakAutoOpenEnabled: true', async () => {
    (apiRequest as any).mockResolvedValue({ breakAutoOpenEnabled: true });
    const { BreakAutoOpenToggle } = await loadToggle();
    render(withClient(<BreakAutoOpenToggle hasActiveSession enabled={false} />));

    fireEvent.click(screen.getByTestId('toggle-break-auto-open'));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalled();
    });
    const calls = (apiRequest as any).mock.calls;
    const match = calls.find(
      (c: any[]) =>
        c[0] === 'PUT' &&
        c[1] === '/api/user-settings' &&
        c[2] &&
        c[2].breakAutoOpenEnabled === true
    );
    expect(match).toBeTruthy();
  });

  it('click otimista -> aria-checked muda imediato (antes do PATCH resolver)', async () => {
    let resolvePatch: any;
    (apiRequest as any).mockImplementation(
      () => new Promise((res) => { resolvePatch = res; })
    );
    const { BreakAutoOpenToggle } = await loadToggle();
    render(withClient(<BreakAutoOpenToggle hasActiveSession enabled />));
    const sw = screen.getByTestId('toggle-break-auto-open');
    expect(sw.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(sw);

    await waitFor(() => {
      expect(screen.getByTestId('toggle-break-auto-open').getAttribute('aria-checked')).toBe('false');
    });
    // Resolver pra liberar cleanup do React Query
    resolvePatch?.({ breakAutoOpenEnabled: false });
  });

  it('PUT falha -> rollback (aria-checked volta ao estado original)', async () => {
    (apiRequest as any).mockRejectedValue(new Error('500 error'));
    const { BreakAutoOpenToggle } = await loadToggle();
    render(withClient(<BreakAutoOpenToggle hasActiveSession enabled />));
    const sw = screen.getByTestId('toggle-break-auto-open');

    fireEvent.click(sw);

    await waitFor(() => {
      expect(screen.getByTestId('toggle-break-auto-open').getAttribute('aria-checked')).toBe('true');
    });
  });
});

describe('BreakAutoOpenToggle - HIGH-1: cache hydration pos-PUT', () => {
  it('apos click ON->OFF, queryClient.setQueryData hidratado com payload merged', async () => {
    (apiRequest as any).mockResolvedValue({ breakAutoOpenEnabled: false, otherField: 'preserved' });
    const { BreakAutoOpenToggle } = await loadToggle();

    // Cria QueryClient real para inspecionar setQueryData via getQueryData.
    const qc = new (await import('@tanstack/react-query')).QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    qc.setQueryData(['/api/user-settings'], { breakAutoOpenEnabled: true, existingField: 'kept' });
    const QC = (await import('@tanstack/react-query')).QueryClientProvider;
    render(<QC client={qc}>{<BreakAutoOpenToggle hasActiveSession enabled />}</QC>);

    fireEvent.click(screen.getByTestId('toggle-break-auto-open'));

    await waitFor(() => {
      const cache = qc.getQueryData(['/api/user-settings']) as any;
      expect(cache?.breakAutoOpenEnabled).toBe(false);
    });
    // Merge defensivo: existingField permanece, novo otherField vem do PUT.
    const cache = qc.getQueryData(['/api/user-settings']) as any;
    expect(cache?.existingField).toBe('kept');
    expect(cache?.otherField).toBe('preserved');
  });
});

describe('BreakAutoOpenToggle - callback onToggle', () => {
  it('click chama onToggle com novo valor', async () => {
    (apiRequest as any).mockResolvedValue({ breakAutoOpenEnabled: false });
    const onToggle = vi.fn();
    const { BreakAutoOpenToggle } = await loadToggle();
    render(
      withClient(<BreakAutoOpenToggle hasActiveSession enabled onToggle={onToggle} />)
    );
    fireEvent.click(screen.getByTestId('toggle-break-auto-open'));

    await waitFor(() => {
      expect(onToggle).toHaveBeenCalledWith(false);
    });
  });
});

describe('BreakAutoOpenToggle - acessibilidade', () => {
  it('Switch tem role="switch"', async () => {
    const { BreakAutoOpenToggle } = await loadToggle();
    render(withClient(<BreakAutoOpenToggle hasActiveSession enabled />));
    const sw = screen.getByTestId('toggle-break-auto-open');
    expect(sw.getAttribute('role')).toBe('switch');
  });

  it('label visivel "Auto-Break" ou aria-label', async () => {
    const { BreakAutoOpenToggle } = await loadToggle();
    render(withClient(<BreakAutoOpenToggle hasActiveSession enabled />));
    const flat = (document.body.textContent ?? '').toLowerCase();
    const sw = screen.getByTestId('toggle-break-auto-open');
    const ariaLabel = (sw.getAttribute('aria-label') ?? '').toLowerCase();
    const hasLabel =
      flat.includes('auto-break') ||
      flat.includes('auto break') ||
      ariaLabel.includes('auto-break') ||
      ariaLabel.includes('break');
    expect(hasLabel).toBe(true);
  });
});
