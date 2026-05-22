// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 1.2 / RF-01 - safeUseQuery refactor via ErrorBoundary local
//
// Spec: Docs/specs/sprint-mini-player-1.2.md RF-01 (HIGH-1 latente)
//
// Target: client/src/components/audio-player/LessonPickerDialog.tsx
//
// Background (lesson #29 CLAUDE.md): hoje LessonPickerDialog usa `safeUseQuery`
// wrapper try/catch em volta de useQuery — viola Rules-of-Hooks se provider
// mount status mudar entre renders. Refactor:
//   1. Extrair fetcher pra sub-componente (`LessonPickerDialogFetcher`).
//   2. Sub-componente chama useQuery direto (sem try/catch).
//   3. ErrorBoundary local (classe) envolve sub-componente.
//   4. Boundary captura "No QueryClient set" -> fallback role="alert" +
//      mensagem "Erro ao carregar — tente novamente." + lista vazia.
//   5. Remover wrapper safeUseQuery + JSDoc warn.
//
// Cobertura:
//   - render SEM QueryClientProvider + sem mock de useQuery -> useQuery throw
//     hard error "No QueryClient set, use QueryClientProvider to set one" ->
//     ErrorBoundary local captura -> fallback role="alert" + lista vazia.
//   - render COM useQuery mockado (provider presente) -> render normal,
//     lista carrega, boundary NAO ativa (sem role="alert").
//   - hooks na mesma ordem entre renders (ja que extraidos pra sub-componente
//     que so monta quando dialog open + boundary nao quebra entre re-renders).
//
// Notas tecnicas:
//   - Mensagem literal TanStack v5: "No QueryClient set, use QueryClientProvider
//     to set one".
//   - ErrorBoundary deve ser classe (function components nao podem ser
//     boundaries em React).
//   - vi.spyOn(console, 'error').mockImplementation(() => {}) pra suprimir
//     noise de React quando boundary captura.
//   - NAO usar vi.unmock nested (lesson #15) — todos os mocks no top-level.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Mock useAuth pra simular logged-in (evita auth guard atalhar render).
vi.mock('@/contexts/AuthContext', async () => {
  const actual: any = await vi.importActual('@/contexts/AuthContext');
  return {
    ...actual,
    useAuth: vi.fn(() => ({
      user: { id: 'u1', email: 'u@t.com' },
      isAuthenticated: true,
      isLoading: false,
    })),
  };
});

// NOTA: mocks de @tanstack/react-query ficam locais por describe — alguns testes
// querem useQuery real (pra throw "No QueryClient set"), outros mockam.

import { AudioPlayerProvider } from '@/contexts/AudioPlayerContext';
import { LessonPickerDialog } from '@/components/audio-player/LessonPickerDialog';

// Spy console.error pra suprimir React noise quando boundary captura.
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  vi.resetModules();
});

describe('<LessonPickerDialog> RF-01 — ErrorBoundary local (HIGH-1)', () => {
  describe('SEM QueryClientProvider (useQuery throw)', () => {
    // Reset modules pra garantir que mocks anteriores nao vazam.
    beforeEach(() => {
      vi.doUnmock('@tanstack/react-query');
      vi.resetModules();
    });

    it('useQuery throw "No QueryClient set" -> ErrorBoundary local captura, renderiza fallback role="alert"', async () => {
      // Re-import depois de unmock pra pegar useQuery real.
      const { LessonPickerDialog: Dlg } = await import(
        '@/components/audio-player/LessonPickerDialog'
      );
      render(
        <AudioPlayerProvider>
          <Dlg open={true} onOpenChange={() => {}} />
        </AudioPlayerProvider>,
      );

      // ErrorBoundary local captura + renderiza fallback role="alert".
      await waitFor(() => {
        const alerts = screen.queryAllByRole('alert');
        // Pelo menos 1 alert com mensagem de erro de carregamento.
        const matched = alerts.find((el) =>
          /erro ao carregar/i.test(el.textContent ?? ''),
        );
        expect(matched).toBeDefined();
      });
    });

    it('useQuery throw -> dialog NAO crasha (root ainda monta com data-testid)', async () => {
      const { LessonPickerDialog: Dlg } = await import(
        '@/components/audio-player/LessonPickerDialog'
      );
      render(
        <AudioPlayerProvider>
          <Dlg open={true} onOpenChange={() => {}} />
        </AudioPlayerProvider>,
      );

      // Dialog root ainda renderiza (sem crashar a app inteira).
      await waitFor(() => {
        const dialog = screen.queryByTestId('lesson-picker-dialog');
        expect(dialog).not.toBeNull();
      });
    });

    it('useQuery throw -> lista de aulas vazia (sem buttons lesson-picker-item-*)', async () => {
      const { LessonPickerDialog: Dlg } = await import(
        '@/components/audio-player/LessonPickerDialog'
      );
      render(
        <AudioPlayerProvider>
          <Dlg open={true} onOpenChange={() => {}} />
        </AudioPlayerProvider>,
      );

      // Aguarda boundary terminar a captura + render fallback.
      await waitFor(() => {
        const alerts = screen.queryAllByRole('alert');
        expect(alerts.length).toBeGreaterThan(0);
      });

      // Garante que nenhum botao lesson-picker-item-* foi renderizado.
      const lessonButtons = screen.queryAllByTestId(/^lesson-picker-item-/);
      expect(lessonButtons.length).toBe(0);
    });
  });

  describe('COM QueryClientProvider mockado (useQuery retorna dados)', () => {
    beforeEach(() => {
      vi.resetModules();
      vi.doMock('@tanstack/react-query', async () => {
        const actual: any = await vi.importActual('@tanstack/react-query');
        return {
          ...actual,
          useQuery: vi.fn(() => ({
            data: [
              {
                id: 'c1',
                slug: 'curso-mtt',
                title: 'Curso MTT',
                lessonCount: 1,
              },
            ],
            isLoading: false,
            error: null,
          })),
        };
      });
    });

    it('useQuery retorna dados -> render normal, ErrorBoundary NAO ativa (sem role="alert" de boundary)', async () => {
      const { LessonPickerDialog: Dlg } = await import(
        '@/components/audio-player/LessonPickerDialog'
      );
      render(
        <AudioPlayerProvider>
          <Dlg open={true} onOpenChange={() => {}} />
        </AudioPlayerProvider>,
      );

      await waitFor(() => {
        const dialog = screen.queryByTestId('lesson-picker-dialog');
        expect(dialog).not.toBeNull();
      });

      // NAO deve aparecer mensagem de fallback do boundary.
      const errors = screen.queryAllByText(/erro ao carregar — tente novamente/i);
      expect(errors.length).toBe(0);
    });
  });

  describe('safeUseQuery wrapper removido', () => {
    it('LessonPickerDialog.tsx NAO contem mais a funcao safeUseQuery', async () => {
      // Le o source code direto pra confirmar remocao.
      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.resolve(
        process.cwd(),
        'client/src/components/audio-player/LessonPickerDialog.tsx',
      );
      const src = fs.readFileSync(filePath, 'utf8');

      // Refactor RF-01 deve ter removido a funcao helper.
      // Aceita marker em comentario indicando que foi removido, mas a funcao
      // function safeUseQuery deve sumir do code.
      expect(src).not.toMatch(/function\s+safeUseQuery\s*\(/);
    });

    it('LessonPickerDialog.tsx contem ErrorBoundary local (classe) — marker', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.resolve(
        process.cwd(),
        'client/src/components/audio-player/LessonPickerDialog.tsx',
      );
      const src = fs.readFileSync(filePath, 'utf8');

      // Espera classe local — qualquer nome com Boundary OU extends React.Component
      // OU extends Component (lesson #29 ErrorBoundary pattern).
      const hasBoundaryMarker =
        /class\s+\w*(?:ErrorBoundary|Boundary)\w*/.test(src) ||
        /extends\s+(?:React\.)?Component/.test(src);
      expect(hasBoundaryMarker).toBe(true);
    });
  });
});
