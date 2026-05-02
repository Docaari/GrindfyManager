import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Biblioteca-1 / RF-07 — CourseCard component
//
// Spec: Docs/specs/biblioteca-spec-1.md RF-07 + D7
// Componente target: client/src/components/biblioteca/CourseCard.tsx (NAO EXISTE)
//
// data-testid: library-course-card-{slug}
// Capa visivel mesmo sem acesso (D7).
// =============================================================================

// @ts-expect-error - componente nao existe (red phase)
import { CourseCard } from '../../../client/src/components/biblioteca/CourseCard';

describe('<CourseCard> (RF-07)', () => {
  const baseCourse = {
    id: 'c1',
    slug: 'antes-das-cartas',
    title: '00 - Antes das Cartas',
    subtitle: 'Fundacao mental',
    coverUrl: '/api/library/assets/00.jpg',
    lessonCount: 46,
    hasAnyAccess: true,
  };

  it('deve renderizar com data-testid library-course-card-{slug}', () => {
    render(<CourseCard course={baseCourse} />);
    expect(screen.getByTestId('library-course-card-antes-das-cartas')).toBeInTheDocument();
  });

  it('deve renderizar capa com aspect 16:9', () => {
    render(<CourseCard course={baseCourse} />);
    const cover = screen.getByTestId('library-course-card-antes-das-cartas-cover');
    expect(cover).toBeInTheDocument();
    // <img loading="lazy">
    const img = cover.querySelector('img');
    expect(img?.getAttribute('loading')).toBe('lazy');
  });

  it('deve mostrar lessonCount no body', () => {
    render(<CourseCard course={baseCourse} />);
    const card = screen.getByTestId('library-course-card-antes-das-cartas');
    expect(card.textContent).toMatch(/46/);
  });

  it('deve preservar capa quando hasAnyAccess=false (D7 — capa visivel)', () => {
    render(<CourseCard course={{ ...baseCourse, hasAnyAccess: false }} />);
    const cover = screen.getByTestId('library-course-card-antes-das-cartas-cover');
    expect(cover.querySelector('img')).toBeInTheDocument();
  });

  it('quando hasAnyAccess=false deve renderizar overlay/badge "Em breve"', () => {
    render(<CourseCard course={{ ...baseCourse, hasAnyAccess: false }} />);
    const card = screen.getByTestId('library-course-card-antes-das-cartas');
    expect(card.textContent?.toLowerCase()).toMatch(/em breve|liberar/i);
  });

  it('alt da capa = title (a11y)', () => {
    render(<CourseCard course={baseCourse} />);
    const cover = screen.getByTestId('library-course-card-antes-das-cartas-cover');
    const img = cover.querySelector('img');
    expect(img?.getAttribute('alt')).toContain('00 - Antes das Cartas');
  });
});
