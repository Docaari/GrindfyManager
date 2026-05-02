import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// =============================================================================
// Sprint Biblioteca-1 / Round 2 — CoachLessonRecommendationCard empty fallback
// (D4)
// =============================================================================

import { CoachLessonRecommendationCard } from '../../../client/src/components/coach/CoachLessonRecommendationCard';

describe('<CoachLessonRecommendationCard> Round 2 - empty fallback (D4)', () => {
  it('renderiza mensagem com testid coach-lesson-recommendation-empty quando lessons=[]', () => {
    render(<CoachLessonRecommendationCard lessons={[]} />);
    const msg = screen.getByTestId('coach-lesson-recommendation-empty');
    expect(msg.textContent?.toLowerCase()).toMatch(/nenhuma aula/);
  });

  it('NAO renderiza nenhum card prefix coach-lesson-recommendation-card- quando lessons=[]', () => {
    const { container } = render(<CoachLessonRecommendationCard lessons={[]} />);
    expect(
      container.querySelector('[data-testid^="coach-lesson-recommendation-card-"]'),
    ).toBeNull();
  });
});
