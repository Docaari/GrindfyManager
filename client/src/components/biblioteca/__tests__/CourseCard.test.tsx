// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint UX-Biblioteca-1 / RF-01 (regression guard)
//
// Spec: Docs/specs/ux-biblioteca-1.md RF-01
//
// Componente target: client/src/components/biblioteca/CourseCard.tsx (existe)
//
// Confirmar consistencia: copy "Acesso restrito" + "Liberar via suporte" ja correta,
// nenhuma mudanca esperada no componente. Tests de regressao garantem que ninguem
// quebre essa propriedade durante implementacao do RF-01.
//
// Lessons aplicadas:
//   #2 data-testid estavel
// =============================================================================

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';

import { CourseCard } from '../CourseCard';

const baseCourse = {
  id: 'c-1',
  slug: 'antes-das-cartas',
  title: 'Antes das Cartas',
  subtitle: 'Mindset essencial',
  coverUrl: null,
  lessonCount: 9,
  hasAnyAccess: false,
  accessibleLessonsCount: 0,
  totalDurationMinutes: 120,
  primaryCategory: null,
};

afterEach(() => cleanup());

describe('<CourseCard> — locked badge consistency (RF-01 regression guard)', () => {
  it('quando hasAnyAccess=false deve renderizar locked-badge com texto "Acesso restrito"', () => {
    render(<CourseCard course={baseCourse} />);
    const badge = screen.getByTestId(
      'library-course-card-antes-das-cartas-locked-badge',
    );
    expect(badge).toBeInTheDocument();
    expect(badge.textContent ?? '').toMatch(/Acesso restrito/i);
  });

  it('quando hasAnyAccess=false deve incluir texto "Liberar via suporte"', () => {
    render(<CourseCard course={baseCourse} />);
    const badge = screen.getByTestId(
      'library-course-card-antes-das-cartas-locked-badge',
    );
    expect(badge.textContent ?? '').toMatch(/Liberar via suporte/i);
  });

  it('quando hasAnyAccess=false NAO deve mostrar texto "Em breve" (RF-01: copy unification)', () => {
    render(<CourseCard course={baseCourse} />);
    const badge = screen.getByTestId(
      'library-course-card-antes-das-cartas-locked-badge',
    );
    expect(badge.textContent ?? '').not.toMatch(/Em breve/i);
  });

  it('quando hasAnyAccess=true NAO deve renderizar locked-badge', () => {
    render(
      <CourseCard
        course={{ ...baseCourse, hasAnyAccess: true, accessibleLessonsCount: 9 }}
      />,
    );
    expect(
      screen.queryByTestId('library-course-card-antes-das-cartas-locked-badge'),
    ).toBeNull();
  });
});
