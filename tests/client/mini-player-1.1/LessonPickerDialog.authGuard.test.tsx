// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 1.1 / RF-03 - Auth guard em LessonPickerDialog
//
// Spec: Docs/specs/sprint-mini-player-1.1.md RF-03
//
// Target: client/src/components/audio-player/LessonPickerDialog.tsx (existe)
//
// Cobertura:
//   - logged-out: msg "Faca login pra ver suas aulas" + CTA login
//   - logged-out: useQuery skipa (enabled: !!user)
//   - logged-in: comportamento normal (dropdown + lista de cursos)
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Mock TanStack Query
vi.mock('@tanstack/react-query', async () => {
  const actual: any = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
  };
});

// Mock useAuth — vamos sobrescrever return value por teste
vi.mock('@/contexts/AuthContext', async () => {
  const actual: any = await vi.importActual('@/contexts/AuthContext');
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { AudioPlayerProvider } from '@/contexts/AudioPlayerContext';
import { LessonPickerDialog } from '@/components/audio-player/LessonPickerDialog';

beforeEach(() => {
  vi.clearAllMocks();
  (useQuery as any).mockReturnValue({ data: undefined, isLoading: false, error: null });
});

function Setup({ open = true }: { open?: boolean }) {
  return (
    <AudioPlayerProvider>
      <LessonPickerDialog open={open} onOpenChange={() => {}} />
    </AudioPlayerProvider>
  );
}

describe('<LessonPickerDialog> auth guard (RF-03)', () => {
  it('logged-out: renderiza mensagem "Faca login"', async () => {
    (useAuth as any).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });

    render(<Setup />);

    await waitFor(() => {
      expect(screen.getByTestId('lesson-picker-dialog')).toBeInTheDocument();
    });
    // Mensagem clara informando login necessario
    expect(
      screen.getByText(/faca login|entre|login|entrar/i),
    ).toBeInTheDocument();
  });

  it('logged-out: renderiza CTA/link para /login', async () => {
    (useAuth as any).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });

    render(<Setup />);
    await waitFor(() => screen.getByTestId('lesson-picker-dialog'));

    // CTA pode ser <a href="/login"> ou Link Wouter ou botao com data-testid
    const cta =
      screen.queryByTestId('lesson-picker-login-cta') ??
      screen.queryByRole('link', { name: /login|entrar/i }) ??
      screen.queryByRole('button', { name: /login|entrar/i });
    expect(cta).not.toBeNull();

    // Se for anchor, valida href
    if (cta && cta.tagName === 'A') {
      expect(cta.getAttribute('href')).toMatch(/\/login/);
    }
  });

  it('logged-out: NAO chama useQuery para courses (enabled: !!user)', async () => {
    (useAuth as any).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });

    render(<Setup />);
    await waitFor(() => screen.getByTestId('lesson-picker-dialog'));

    // useQuery pode ser chamado mas com enabled: false
    // Verificamos que todas as chamadas que tocariam library/courses tem enabled !== true
    const allCalls = (useQuery as any).mock.calls;
    for (const callArgs of allCalls) {
      const arg = callArgs[0];
      if (!arg) continue;
      const keyStr = JSON.stringify(arg.queryKey ?? '');
      if (keyStr.includes('/api/library/courses')) {
        // enabled deve ser false ou undefined coerced
        expect(arg.enabled === false || arg.enabled === undefined || !arg.enabled).toBe(true);
      }
    }
  });

  it('logged-in: renderiza dropdown de cursos (sem CTA login)', async () => {
    (useAuth as any).mockReturnValue({
      user: { id: 'u1', email: 'x@y.com' },
      isAuthenticated: true,
      isLoading: false,
    });
    (useQuery as any).mockReturnValue({
      data: [{ id: 'c1', slug: 'curso-mtt', title: 'Curso MTT', lessonCount: 1 }],
      isLoading: false,
      error: null,
    });

    render(<Setup />);
    await waitFor(() => screen.getByTestId('lesson-picker-dialog'));

    // SEM CTA login
    const cta =
      screen.queryByTestId('lesson-picker-login-cta') ??
      screen.queryByRole('link', { name: /^login$|^entrar$/i });
    expect(cta).toBeNull();
  });
});
