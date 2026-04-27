/**
 * Settings TTS Section — Fix 4 wiring.
 *
 * Verifica que a secao "Alertas e Voz" foi adicionada com 6 controles
 * obrigatorios da spec RF-07/RF-08 (Sprint Alarmes 2.0).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Settings from '../Settings';

const apiRequestMock = vi.fn();
const invalidateQueriesMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: {
    invalidateQueries: (...a: any[]) => invalidateQueriesMock(...a),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
    fetchQuery: vi.fn(),
  },
  getCsrfToken: () => null,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
}));

vi.mock('@/contexts/SidebarContext', () => ({
  useSidebar: () => ({ autoCollapseForGrind: false, setAutoCollapseForGrind: vi.fn() }),
}));

vi.mock('@/hooks/useBankroll', () => ({
  useBankroll: () => ({ data: { configured: false, amount: null, rule: '1pct' } }),
}));

vi.mock('@/components/bankroll/BankrollMovementDialog', () => ({
  BankrollMovementDialog: () => null,
}));

beforeEach(() => {
  apiRequestMock.mockReset();
  // Default: queries retornam vazio
  apiRequestMock.mockResolvedValue({});
});

function renderSettings() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <Settings />
    </QueryClientProvider>
  );
}

describe('Settings — secao "Alertas e Voz" (Fix 4 RF-07/RF-08)', () => {
  it('renderiza secao com data-testid settings-tts-section', () => {
    renderSettings();
    expect(screen.getByTestId('settings-tts-section')).toBeInTheDocument();
  });

  it('renderiza os 6 controles obrigatorios da spec', () => {
    renderSettings();
    // 1. Modo de som (radio TTS/Beep/Mudo)
    expect(screen.getByTestId('tts-sound-mode')).toBeInTheDocument();
    // 2. Voz (select)
    expect(screen.getByTestId('tts-voice-select')).toBeInTheDocument();
    // 3. Volume (slider)
    expect(screen.getByTestId('tts-volume-slider')).toBeInTheDocument();
    // 4. Repeticao (select)
    expect(screen.getByTestId('tts-repeat-count')).toBeInTheDocument();
    // 5. Intervalo entre repeticoes (input segundos)
    expect(screen.getByTestId('tts-repeat-gap')).toBeInTheDocument();
    // 6. Redatar buy-in (switch)
    expect(screen.getByTestId('tts-redact-buyin')).toBeInTheDocument();
  });

  it('renderiza botao Salvar Voz', () => {
    renderSettings();
    expect(screen.getByTestId('tts-save-btn')).toBeInTheDocument();
  });

  it('renderiza botao testar voz', () => {
    renderSettings();
    expect(screen.getByTestId('tts-test-voice-btn')).toBeInTheDocument();
  });
});
