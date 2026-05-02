import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Biblioteca-1 / RF-07 — LessonRow
//
// Spec: Docs/specs/biblioteca-spec-1.md RF-07 + D7
// Componente target: client/src/components/biblioteca/LessonRow.tsx (NAO EXISTE)
// =============================================================================

// @ts-expect-error - componente nao existe (red phase)
import { LessonRow } from '../../../client/src/components/biblioteca/LessonRow';

describe('<LessonRow> (RF-07)', () => {
  const baseLesson = {
    id: 'l1',
    slug: 'a1-mentalidade',
    title: 'A1 - Mentalidade',
    subtitle: 'sub',
    coverUrl: '/api/library/assets/l1.jpg',
    durationMinutes: 12,
    formats: ['video', 'podcast', 'article'] as ('video' | 'podcast' | 'article')[],
    hasAccess: true,
  };

  it('deve renderizar com data-testid library-lesson-row-{slug}', () => {
    render(<LessonRow lesson={baseLesson} courseSlug="antes-das-cartas" />);
    expect(screen.getByTestId('library-lesson-row-a1-mentalidade')).toBeInTheDocument();
  });

  it('deve mostrar titulo + duracao + badge formatos', () => {
    render(<LessonRow lesson={baseLesson} courseSlug="antes-das-cartas" />);
    const row = screen.getByTestId('library-lesson-row-a1-mentalidade');
    expect(row.textContent).toMatch(/A1 - Mentalidade/);
    expect(row.textContent).toMatch(/12/);
  });

  it('deve ser clicavel quando hasAccess=true (link para viewer)', () => {
    render(<LessonRow lesson={baseLesson} courseSlug="antes-das-cartas" />);
    const link = screen.getByTestId('library-lesson-row-a1-mentalidade-link');
    expect(link.getAttribute('href')).toBe('/biblioteca/curso/antes-das-cartas/a1-mentalidade');
  });

  it('quando hasAccess=false NAO deve navegar (cursor not-allowed + sem href)', async () => {
    render(
      <LessonRow lesson={{ ...baseLesson, hasAccess: false }} courseSlug="antes-das-cartas" />
    );
    const row = screen.getByTestId('library-lesson-row-a1-mentalidade');
    const link = screen.queryByTestId('library-lesson-row-a1-mentalidade-link');
    expect(link).toBeNull();
    // Mostra "Em breve"
    expect(row.textContent?.toLowerCase()).toMatch(/em breve/);
  });
});
