import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Biblioteca-1 / RF-10 — CoachLessonRecommendationCard (UI embed Coach)
//
// Spec: Docs/specs/biblioteca-spec-1.md RF-10
// Componente target: client/src/components/coach/CoachLessonRecommendationCard.tsx
// (NAO EXISTE)
//
// Lessons aplicadas:
//   - #2 data-testid: coach-lesson-recommendation-card-{slug}
//   - #11 default minimo: CTA so renderiza se hasAccess definido
//
// Comportamento:
//   - hasAccess=true -> CTA "Assistir agora" abre new tab (target=_blank)
//   - hasAccess=false -> CTA "Em breve" nao clicavel (sem href)
//   - Carrossel se >1 lesson
// =============================================================================

import {
  CoachLessonRecommendationCard,
  // @ts-expect-error - componente nao existe (red phase)
} from '../../../client/src/components/coach/CoachLessonRecommendationCard';

describe('<CoachLessonRecommendationCard> (RF-10)', () => {
  const baseLesson = {
    id: 'l1',
    slug: 'm3-3bet',
    courseSlug: 'anatomia-spot',
    title: 'M3 - 3-bet OOP',
    courseTitle: '01 - Anatomia de um Spot',
    coverUrl: '/api/library/assets/l1.jpg',
    durationMinutes: 18,
    categoryId: 'postflop',
    hasAccess: true,
    url: '/biblioteca/curso/anatomia-spot/m3-3bet',
  };

  it('deve renderizar com testid coach-lesson-recommendation-card-{slug}', () => {
    render(<CoachLessonRecommendationCard lessons={[baseLesson]} />);
    expect(
      screen.getByTestId('coach-lesson-recommendation-card-m3-3bet')
    ).toBeInTheDocument();
  });

  it('deve mostrar titulo + curso + duracao', () => {
    render(<CoachLessonRecommendationCard lessons={[baseLesson]} />);
    const card = screen.getByTestId('coach-lesson-recommendation-card-m3-3bet');
    expect(card.textContent).toMatch(/M3 - 3-bet OOP/);
    expect(card.textContent).toMatch(/Anatomia/);
    expect(card.textContent).toMatch(/18/);
  });

  it('deve renderizar CTA "Assistir agora" com target=_blank quando hasAccess=true', () => {
    render(<CoachLessonRecommendationCard lessons={[baseLesson]} />);
    const cta = screen.getByTestId('coach-lesson-recommendation-card-m3-3bet-cta');
    expect(cta.getAttribute('href')).toBe('/biblioteca/curso/anatomia-spot/m3-3bet');
    expect(cta.getAttribute('target')).toBe('_blank');
    expect(cta.textContent?.toLowerCase()).toMatch(/assistir|abrir/);
  });

  it('deve renderizar CTA "Em breve" sem href quando hasAccess=false', () => {
    render(
      <CoachLessonRecommendationCard
        lessons={[{ ...baseLesson, hasAccess: false }]}
      />
    );
    const cta = screen.getByTestId('coach-lesson-recommendation-card-m3-3bet-cta');
    expect(cta.textContent?.toLowerCase()).toMatch(/em breve|breve/);
    expect(cta.getAttribute('href')).toBeNull();
  });

  it('deve renderizar carrossel quando >1 lesson', () => {
    render(
      <CoachLessonRecommendationCard
        lessons={[
          baseLesson,
          { ...baseLesson, id: 'l2', slug: 'm5-oop', title: 'M5 - OOP' },
          { ...baseLesson, id: 'l3', slug: 'm7-cbet', title: 'M7 - C-bet', hasAccess: false },
        ]}
      />
    );
    expect(screen.getByTestId('coach-lesson-recommendation-card-m3-3bet')).toBeInTheDocument();
    expect(screen.getByTestId('coach-lesson-recommendation-card-m5-oop')).toBeInTheDocument();
    expect(screen.getByTestId('coach-lesson-recommendation-card-m7-cbet')).toBeInTheDocument();
  });

  it('deve renderizar nada se lessons vazio (default minimo, lesson #11)', () => {
    const { container } = render(<CoachLessonRecommendationCard lessons={[]} />);
    // Nao renderiza nenhum card; ok se exporta wrapper vazio ou null
    expect(container.querySelector('[data-testid^="coach-lesson-recommendation-card-"]')).toBeNull();
  });

  it('CTA com hasAccess=undefined nao deve disparar acao default (lesson #11)', () => {
    const { hasAccess, ...partial } = baseLesson;
    // @ts-expect-error - testing missing prop
    render(<CoachLessonRecommendationCard lessons={[partial]} />);
    const cta = screen.queryByTestId('coach-lesson-recommendation-card-m3-3bet-cta');
    // Default minimo: sem hasAccess explicito, NAO renderiza CTA navegavel.
    if (cta) {
      expect(cta.getAttribute('href')).toBeNull();
    }
  });
});
