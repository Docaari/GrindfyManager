/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spot-Anki-Reentry-3 — RF-3.2 + RF-3.3 ReentryCard component
 *
 * Spec: Docs/specs/spot-anki-reentry-3.md §RF-3.2, §RF-3.3
 *
 * Cobertura RED:
 *   - Renderiza imagem + insight + tags + confidence + decision badge.
 *   - 4 botoes grade (again, hard, good, easy) + skip.
 *   - Click grade chama prop onGrade(grade).
 *   - Click skip chama prop onSkip().
 *   - Counter "Card N de M" no header.
 *   - ARIA labels nos botoes.
 *
 * data-testid esperados:
 *   - reentry-card (root)
 *   - reentry-card-image
 *   - reentry-card-insight
 *   - reentry-card-tag-{i}
 *   - reentry-card-confidence
 *   - reentry-card-decision-badge
 *   - reentry-card-counter
 *   - reentry-card-grade-again
 *   - reentry-card-grade-hard
 *   - reentry-card-grade-good
 *   - reentry-card-grade-easy
 *   - reentry-card-skip
 *
 * Status RED: arquivo client/src/components/study/ReentryCard.tsx NAO existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

beforeEach(() => {
  cleanup();
});

async function loadCard() {
  const mod: any = await import('../../client/src/components/study/ReentryCard');
  return mod.ReentryCard;
}

const sampleCard = {
  card: {
    id: 'card-1',
    spotId: 'spot-1',
    intervalDays: '2.50',
    easeFactor: '2.50',
    reviewCount: 2,
    correctCount: 1,
    createdAt: new Date('2026-05-03T12:00:00Z'),
    nextReviewAt: new Date('2026-05-08T12:00:00Z'),
  },
  spot: {
    id: 'spot-1',
    insight: 'Bluff river OOP em pot grande',
    tags: ['ICM', 'river', 'GTO'],
    decisionCorrect: false,
    confidenceLevel: 3,
    imageUrl: '/uploads/spots/spot-1.png',
  },
};

describe('<ReentryCard>', () => {
  describe('renderizacao', () => {
    it('renderiza root data-testid="reentry-card"', async () => {
      const Card = await loadCard();
      render(<Card data={sampleCard} index={0} total={5} onGrade={() => {}} onSkip={() => {}} />);
      expect(screen.getByTestId('reentry-card')).toBeInTheDocument();
    });

    it('renderiza imagem do spot', async () => {
      const Card = await loadCard();
      render(<Card data={sampleCard} index={0} total={5} onGrade={() => {}} onSkip={() => {}} />);
      expect(screen.getByTestId('reentry-card-image')).toBeInTheDocument();
    });

    it('renderiza insight texto', async () => {
      const Card = await loadCard();
      render(<Card data={sampleCard} index={0} total={5} onGrade={() => {}} onSkip={() => {}} />);
      const insight = screen.getByTestId('reentry-card-insight');
      expect(insight.textContent).toMatch(/Bluff river/i);
    });

    it('renderiza tags como pills', async () => {
      const Card = await loadCard();
      render(<Card data={sampleCard} index={0} total={5} onGrade={() => {}} onSkip={() => {}} />);
      expect(screen.getByTestId('reentry-card-tag-0')).toBeInTheDocument();
      expect(screen.getByTestId('reentry-card-tag-1')).toBeInTheDocument();
      expect(screen.getByTestId('reentry-card-tag-2')).toBeInTheDocument();
    });

    it('renderiza confidence (valor 3 visivel via texto OR aria)', async () => {
      const Card = await loadCard();
      render(<Card data={sampleCard} index={0} total={5} onGrade={() => {}} onSkip={() => {}} />);
      const conf = screen.getByTestId('reentry-card-confidence');
      const text = conf.textContent || '';
      const aria = conf.getAttribute('aria-valuenow') || '';
      expect(text + aria).toMatch(/3/);
    });

    it('renderiza decision badge (errado, dado decisionCorrect=false)', async () => {
      const Card = await loadCard();
      render(<Card data={sampleCard} index={0} total={5} onGrade={() => {}} onSkip={() => {}} />);
      const badge = screen.getByTestId('reentry-card-decision-badge');
      expect(badge.textContent || badge.getAttribute('aria-label') || '').toMatch(/errado|errei|incorreto|wrong/i);
    });

    it('renderiza counter "Card 1 de 5"', async () => {
      const Card = await loadCard();
      render(<Card data={sampleCard} index={0} total={5} onGrade={() => {}} onSkip={() => {}} />);
      const counter = screen.getByTestId('reentry-card-counter');
      expect(counter.textContent).toMatch(/1.*5|5.*1/);
    });
  });

  describe('botoes grade', () => {
    it('renderiza 4 botoes grade', async () => {
      const Card = await loadCard();
      render(<Card data={sampleCard} index={0} total={5} onGrade={() => {}} onSkip={() => {}} />);
      expect(screen.getByTestId('reentry-card-grade-again')).toBeInTheDocument();
      expect(screen.getByTestId('reentry-card-grade-hard')).toBeInTheDocument();
      expect(screen.getByTestId('reentry-card-grade-good')).toBeInTheDocument();
      expect(screen.getByTestId('reentry-card-grade-easy')).toBeInTheDocument();
    });

    it('renderiza botao skip', async () => {
      const Card = await loadCard();
      render(<Card data={sampleCard} index={0} total={5} onGrade={() => {}} onSkip={() => {}} />);
      expect(screen.getByTestId('reentry-card-skip')).toBeInTheDocument();
    });

    it('click "good" chama onGrade("good")', async () => {
      const onGrade = vi.fn();
      const Card = await loadCard();
      render(<Card data={sampleCard} index={0} total={5} onGrade={onGrade} onSkip={() => {}} />);
      fireEvent.click(screen.getByTestId('reentry-card-grade-good'));
      expect(onGrade).toHaveBeenCalledWith('good');
    });

    it('click "again" chama onGrade("again")', async () => {
      const onGrade = vi.fn();
      const Card = await loadCard();
      render(<Card data={sampleCard} index={0} total={5} onGrade={onGrade} onSkip={() => {}} />);
      fireEvent.click(screen.getByTestId('reentry-card-grade-again'));
      expect(onGrade).toHaveBeenCalledWith('again');
    });

    it('click "hard" chama onGrade("hard")', async () => {
      const onGrade = vi.fn();
      const Card = await loadCard();
      render(<Card data={sampleCard} index={0} total={5} onGrade={onGrade} onSkip={() => {}} />);
      fireEvent.click(screen.getByTestId('reentry-card-grade-hard'));
      expect(onGrade).toHaveBeenCalledWith('hard');
    });

    it('click "easy" chama onGrade("easy")', async () => {
      const onGrade = vi.fn();
      const Card = await loadCard();
      render(<Card data={sampleCard} index={0} total={5} onGrade={onGrade} onSkip={() => {}} />);
      fireEvent.click(screen.getByTestId('reentry-card-grade-easy'));
      expect(onGrade).toHaveBeenCalledWith('easy');
    });

    it('click skip chama onSkip()', async () => {
      const onSkip = vi.fn();
      const Card = await loadCard();
      render(<Card data={sampleCard} index={0} total={5} onGrade={() => {}} onSkip={onSkip} />);
      fireEvent.click(screen.getByTestId('reentry-card-skip'));
      expect(onSkip).toHaveBeenCalled();
    });
  });

  describe('ARIA labels', () => {
    it('botoes grade tem aria-label descritivo (ou texto significativo)', async () => {
      const Card = await loadCard();
      render(<Card data={sampleCard} index={0} total={5} onGrade={() => {}} onSkip={() => {}} />);
      const again = screen.getByTestId('reentry-card-grade-again');
      const aria = again.getAttribute('aria-label') || again.textContent || '';
      expect(aria.length).toBeGreaterThan(2);
    });
  });
});
