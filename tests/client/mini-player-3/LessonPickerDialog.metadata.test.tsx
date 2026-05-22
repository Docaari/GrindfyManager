// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 3 / RF-04 - LessonPickerDialog metadata enrichment
//
// Spec: Docs/specs/sprint-mini-player-3.md RF-04 + D6 + D7 + D8 + Q-I
//
// Target: client/src/components/audio-player/LessonPickerDialog.tsx (estendido)
//
// Cobertura:
//   - Skeleton loading (data-testid="lesson-picker-skeleton") quando isLoading.
//   - Lesson com coverUrl -> <img src=...> (sanitizada via MP1.1 helper).
//   - Lesson sem coverUrl -> placeholder cinza com 1a letra do titulo.
//   - Duracao formatted via formatDuration(lesson.durationSeconds). null -> "--:--".
//   - Transcription preview (line-clamp-1) renderizado; null -> "—".
//   - Sort dropdown data-testid="lesson-picker-sort" com 3 options.
//   - Sort change persiste em localStorage key "lessonPicker.sortBy".
//   - Reload -> sort restaurado.
//   - Sort = "duracao" -> reordena ascending; nulls vao pro fim (Number.MAX_SAFE_INTEGER fallback).
//   - Sort = "alfabetico" -> ordem A-Z case-insensitive.
//   - Sort value invalido em localStorage -> fallback "recente".
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Mock TanStack Query (mesma estrategia do LessonPickerDialog.test.tsx MP1).
vi.mock('@tanstack/react-query', async () => {
  const actual: any = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: vi.fn(),
  };
});
import { useQuery } from '@tanstack/react-query';

import { AudioPlayerProvider } from '@/contexts/AudioPlayerContext';
import { LessonPickerDialog } from '@/components/audio-player/LessonPickerDialog';

const coursesPayload = [
  {
    slug: 'curso-mtt',
    title: 'Curso MTT',
    modules: [
      {
        id: 'm1',
        title: 'Modulo 1',
        lessons: [
          {
            lessonId: 'L1',
            title: 'Bravo Mindset',
            durationSeconds: 720, // 12:00
            hasAccess: true,
            formats: ['podcast'],
            audioUrl: '/audio/L1',
            coverUrl: 'https://cdn.example.com/L1.jpg',
            transcriptionPreview: 'Neste video, vamos cobrir 3-bet OOP na BB vs CO em zoom 100bb e mais.',
          },
          {
            lessonId: 'L2',
            title: 'Alfa Tilt control',
            durationSeconds: 1080, // 18:00
            hasAccess: true,
            formats: ['podcast'],
            audioUrl: '/audio/L2',
            coverUrl: null,
            transcriptionPreview: null,
          },
          {
            lessonId: 'L3',
            title: 'Charlie Variance',
            durationSeconds: null,
            hasAccess: true,
            formats: ['podcast'],
            audioUrl: '/audio/L3',
            coverUrl: 'https://cdn.example.com/L3.jpg',
            transcriptionPreview: 'Variance e a coisa mais importante no longo prazo do MTT.',
          },
        ],
      },
    ],
  },
];

function setupQueryMock({ isLoading = false, data = coursesPayload, isError = false } = {}) {
  (useQuery as any).mockReturnValue({
    data: isLoading ? undefined : data,
    isLoading,
    isError,
    error: isError ? new Error('boom') : null,
  });
}

describe('<LessonPickerDialog> RF-04 - metadata enrichment', () => {
  beforeEach(() => {
    try {
      localStorage.removeItem('lessonPicker.sortBy');
    } catch {}
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // RF-04.4 — Skeleton loading
  // ---------------------------------------------------------------------------
  it('isLoading=true -> renderiza skeleton (data-testid="lesson-picker-skeleton")', () => {
    setupQueryMock({ isLoading: true, data: undefined });
    render(
      <AudioPlayerProvider>
        <LessonPickerDialog open={true} onOpenChange={() => {}} />
      </AudioPlayerProvider>,
    );
    const skel = screen.queryAllByTestId('lesson-picker-skeleton');
    expect(skel.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // RF-04.1 — Capa + placeholder
  // ---------------------------------------------------------------------------
  it('lesson com coverUrl -> <img src=...> sanitizada', () => {
    setupQueryMock();
    render(
      <AudioPlayerProvider>
        <LessonPickerDialog open={true} onOpenChange={() => {}} />
      </AudioPlayerProvider>,
    );
    const imgs = screen.queryAllByRole('img');
    const l1img = imgs.find((i) => (i as HTMLImageElement).src.includes('L1.jpg'));
    expect(l1img).toBeTruthy();
  });

  it('lesson sem coverUrl -> placeholder com primeira letra do titulo', () => {
    setupQueryMock();
    render(
      <AudioPlayerProvider>
        <LessonPickerDialog open={true} onOpenChange={() => {}} />
      </AudioPlayerProvider>,
    );
    // L2 (Alfa Tilt control) sem cover. Placeholder visual deve mostrar "A".
    const placeholders = screen.queryAllByTestId('lesson-picker-placeholder');
    // Pelo menos 1 placeholder com letra "A" (L2 alfa).
    const hasAlfa = placeholders.some((p) => (p.textContent ?? '').trim().toUpperCase().startsWith('A'));
    expect(hasAlfa).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // RF-04.1 — Duracao formatted
  // ---------------------------------------------------------------------------
  it('lesson com durationSeconds=720 -> "12:00" no DOM', () => {
    setupQueryMock();
    render(
      <AudioPlayerProvider>
        <LessonPickerDialog open={true} onOpenChange={() => {}} />
      </AudioPlayerProvider>,
    );
    const dur = screen.queryByText('12:00');
    expect(dur).toBeTruthy();
  });

  it('lesson com durationSeconds=null -> "--:--" no DOM', () => {
    setupQueryMock();
    render(
      <AudioPlayerProvider>
        <LessonPickerDialog open={true} onOpenChange={() => {}} />
      </AudioPlayerProvider>,
    );
    const dur = screen.queryAllByText('--:--');
    expect(dur.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // RF-04.2 — Transcription preview
  // ---------------------------------------------------------------------------
  it('lesson com transcriptionPreview -> texto preview presente', () => {
    setupQueryMock();
    render(
      <AudioPlayerProvider>
        <LessonPickerDialog open={true} onOpenChange={() => {}} />
      </AudioPlayerProvider>,
    );
    expect(screen.queryByText(/Neste video, vamos cobrir 3-bet/)).toBeTruthy();
  });

  it('lesson sem transcriptionPreview -> render fallback "—"', () => {
    setupQueryMock();
    render(
      <AudioPlayerProvider>
        <LessonPickerDialog open={true} onOpenChange={() => {}} />
      </AudioPlayerProvider>,
    );
    // L2 sem preview -> "—" deve aparecer.
    const dashEm = screen.queryAllByText('—');
    expect(dashEm.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // RF-04.3 — Sort dropdown
  // ---------------------------------------------------------------------------
  it('renderiza dropdown data-testid="lesson-picker-sort" com 3 opcoes', () => {
    setupQueryMock();
    render(
      <AudioPlayerProvider>
        <LessonPickerDialog open={true} onOpenChange={() => {}} />
      </AudioPlayerProvider>,
    );
    const sort = screen.getByTestId('lesson-picker-sort') as HTMLSelectElement;
    const values = Array.from(sort.options).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['recente', 'alfabetico', 'duracao']));
  });

  it('sort default = "recente" (D8)', () => {
    setupQueryMock();
    render(
      <AudioPlayerProvider>
        <LessonPickerDialog open={true} onOpenChange={() => {}} />
      </AudioPlayerProvider>,
    );
    const sort = screen.getByTestId('lesson-picker-sort') as HTMLSelectElement;
    expect(sort.value).toBe('recente');
  });

  it('sort change -> localStorage "lessonPicker.sortBy" atualizado', async () => {
    setupQueryMock();
    render(
      <AudioPlayerProvider>
        <LessonPickerDialog open={true} onOpenChange={() => {}} />
      </AudioPlayerProvider>,
    );
    const sort = screen.getByTestId('lesson-picker-sort') as HTMLSelectElement;
    fireEvent.change(sort, { target: { value: 'alfabetico' } });
    await waitFor(() => {
      expect(localStorage.getItem('lessonPicker.sortBy')).toBe('alfabetico');
    });
  });

  it('localStorage com sort persistido -> dropdown restaura valor no mount', () => {
    try {
      localStorage.setItem('lessonPicker.sortBy', 'duracao');
    } catch {}
    setupQueryMock();
    render(
      <AudioPlayerProvider>
        <LessonPickerDialog open={true} onOpenChange={() => {}} />
      </AudioPlayerProvider>,
    );
    const sort = screen.getByTestId('lesson-picker-sort') as HTMLSelectElement;
    expect(sort.value).toBe('duracao');
  });

  it('localStorage com sort invalido -> fallback "recente"', () => {
    try {
      localStorage.setItem('lessonPicker.sortBy', 'BOGUS_VALUE');
    } catch {}
    setupQueryMock();
    render(
      <AudioPlayerProvider>
        <LessonPickerDialog open={true} onOpenChange={() => {}} />
      </AudioPlayerProvider>,
    );
    const sort = screen.getByTestId('lesson-picker-sort') as HTMLSelectElement;
    expect(sort.value).toBe('recente');
  });

  it('sort = "duracao" -> lessons reordenam ascending; nulls vao pro fim', () => {
    setupQueryMock();
    render(
      <AudioPlayerProvider>
        <LessonPickerDialog open={true} onOpenChange={() => {}} />
      </AudioPlayerProvider>,
    );
    const sort = screen.getByTestId('lesson-picker-sort') as HTMLSelectElement;
    fireEvent.change(sort, { target: { value: 'duracao' } });

    // Reread DOM: ordem dos cards por durationSeconds ASC -> L1(720), L2(1080), L3(null fim).
    const rows = screen.queryAllByTestId(/lesson-picker-row-/);
    // Aceita data-testid "lesson-picker-row-<id>" OR aria-labelledby por titulo.
    const titles = rows.map((r) => (r.textContent ?? '').slice(0, 30));
    if (titles.length >= 3) {
      const firstIsBravo = /Bravo/i.test(titles[0]);
      const secondIsAlfa = /Alfa/i.test(titles[1]);
      const thirdIsCharlie = /Charlie/i.test(titles[2]);
      expect(firstIsBravo).toBe(true);
      expect(secondIsAlfa).toBe(true);
      expect(thirdIsCharlie).toBe(true);
    } else {
      // Aceita implementacao alternativa sem data-testid de row se titles unicos no DOM ordenam.
      const bodyText = document.body.textContent ?? '';
      const idxBravo = bodyText.indexOf('Bravo');
      const idxAlfa = bodyText.indexOf('Alfa');
      const idxCharlie = bodyText.indexOf('Charlie');
      expect(idxBravo).toBeLessThan(idxAlfa);
      expect(idxAlfa).toBeLessThan(idxCharlie);
    }
  });

  it('sort = "alfabetico" -> ordem A-Z (case-insensitive) Alfa < Bravo < Charlie', () => {
    setupQueryMock();
    render(
      <AudioPlayerProvider>
        <LessonPickerDialog open={true} onOpenChange={() => {}} />
      </AudioPlayerProvider>,
    );
    const sort = screen.getByTestId('lesson-picker-sort') as HTMLSelectElement;
    fireEvent.change(sort, { target: { value: 'alfabetico' } });

    const bodyText = document.body.textContent ?? '';
    const idxAlfa = bodyText.indexOf('Alfa');
    const idxBravo = bodyText.indexOf('Bravo');
    const idxCharlie = bodyText.indexOf('Charlie');
    expect(idxAlfa).toBeGreaterThan(-1);
    expect(idxAlfa).toBeLessThan(idxBravo);
    expect(idxBravo).toBeLessThan(idxCharlie);
  });
});
