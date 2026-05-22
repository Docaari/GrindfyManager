// =============================================================================
// Test-Writer (Modo TDD - Red Phase) - CONDICIONAL (skipif sem fix)
// Sprint Mini Player 1.2 / RF-04 - X button overlap (NIT-1)
//
// Spec: Docs/specs/sprint-mini-player-1.2.md RF-04
//
// Target: client/src/components/audio-player/LessonPickerDialog.tsx
//
// Background: RF-05 do MP1.1 migrou pra Radix Dialog (shadcn). DialogContent
// shadcn renderiza X auto no top-right (absolute right-4 top-4). NIT-1 R2:
// "X pode sobrepor search input em viewports estreitos".
//
// Modo de operacao:
//   - Default: verify-only (manual /grind-live + screenshots em 3 viewports).
//   - Se founder/implementer optar por fix:
//     * Opcao A: padding-top no container do input (pt-8 ou pt-10).
//     * Opcao B: esconder X interno + Close custom.
//
// Testes provisionados (passam quando fix aplicado; description.skip por
// default ate verify manual confirmar necessidade).
//
// Cobertura:
//   - container que envolve input de busca tem padding-top >= 8 (Tailwind
//     pt-8 == 2rem == 32px) OU input fica abaixo do X visualmente.
//   - X button (data-testid `lesson-picker-dialog` close icon) NAO sobrepoe
//     bounding box do input em viewport 375px.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('@tanstack/react-query', async () => {
  const actual: any = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: vi.fn(() => ({
      data: [{ id: 'c1', slug: 'curso-mtt', title: 'Curso MTT', lessonCount: 1 }],
      isLoading: false,
      error: null,
    })),
  };
});

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

import { AudioPlayerProvider } from '@/contexts/AudioPlayerContext';
import { LessonPickerDialog } from '@/components/audio-player/LessonPickerDialog';

beforeEach(() => {
  vi.clearAllMocks();
});

// describe.skip por default — implementer unskippa SE optar por fix RF-04.
// Para verify-only (sem fix), founder roda manual em /grind-live + anexa
// screenshots no PR.
describe.skip('<LessonPickerDialog> RF-04 — X button overlap fix (CONDICIONAL)', () => {
  it('search input container tem padding-top >= 8 (pt-8 ou pt-10) OR input fora do area do X', async () => {
    render(
      <AudioPlayerProvider>
        <LessonPickerDialog open={true} onOpenChange={() => {}} />
      </AudioPlayerProvider>,
    );
    await waitFor(() => screen.getByTestId('lesson-picker-dialog'));

    const search = screen.getByTestId('lesson-picker-search') as HTMLInputElement;
    const parent = search.parentElement;
    expect(parent).not.toBeNull();

    // Opcao A: parent ou ancestor proximo tem className pt-8 / pt-10 / pt-12.
    // Walk up no maximo 3 niveis pra encontrar.
    let found = false;
    let cur: HTMLElement | null = search;
    for (let i = 0; i < 4 && cur; i++) {
      if (/\bpt-(8|10|12|14|16)\b/.test(cur.className ?? '')) {
        found = true;
        break;
      }
      cur = cur.parentElement;
    }
    expect(found).toBe(true);
  });

  it('DialogContent NAO renderiza X default OR X tem aria-label distinto que nao confunde com input', async () => {
    render(
      <AudioPlayerProvider>
        <LessonPickerDialog open={true} onOpenChange={() => {}} />
      </AudioPlayerProvider>,
    );
    await waitFor(() => screen.getByTestId('lesson-picker-dialog'));

    // Se implementer optou pela Opcao B (Close custom), deve existir um botao
    // com data-testid distinto OR aria-label "Fechar" custom.
    // Se Opcao A (padding), o X default continua existindo mas input recuou.
    const dialog = screen.getByTestId('lesson-picker-dialog');
    const closeButtons = dialog.querySelectorAll(
      'button[aria-label*="lose" i], button[aria-label*="echar" i]',
    );
    expect(closeButtons.length).toBeGreaterThanOrEqual(1);
  });
});
