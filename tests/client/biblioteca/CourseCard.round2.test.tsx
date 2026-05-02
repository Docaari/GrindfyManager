import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// =============================================================================
// Sprint Biblioteca-1 / Round 2 — CourseCard hover overlay (F-A2.5)
// =============================================================================

import { CourseCard } from '../../../client/src/components/biblioteca/CourseCard';

describe('<CourseCard> Round 2 - hover overlay', () => {
  const baseCourse = {
    id: 'c1',
    slug: 'antes-das-cartas',
    title: '00 - Antes das Cartas',
    subtitle: 'Fundacao mental para mesa',
    coverUrl: '/api/library/assets/00.jpg',
    lessonCount: 46,
    hasAnyAccess: true,
    totalDurationMinutes: 360,
    primaryCategory: 'performance_mental',
  };

  it('renderiza overlay com subtitle quando subtitle existe', () => {
    render(<CourseCard course={baseCourse} />);
    const overlay = screen.getByTestId(
      'library-course-card-antes-das-cartas-hover-overlay',
    );
    expect(overlay).toBeInTheDocument();
    expect(overlay.textContent).toMatch(/Fundacao mental para mesa/);
  });

  it('overlay inclui duracao + categoria', () => {
    render(<CourseCard course={baseCourse} />);
    const overlay = screen.getByTestId(
      'library-course-card-antes-das-cartas-hover-overlay',
    );
    expect(overlay.textContent).toMatch(/6h/);
  });

  it('overlay com aria-hidden (decorativo)', () => {
    render(<CourseCard course={baseCourse} />);
    const overlay = screen.getByTestId(
      'library-course-card-antes-das-cartas-hover-overlay',
    );
    expect(overlay.getAttribute('aria-hidden')).toBe('true');
  });
});
