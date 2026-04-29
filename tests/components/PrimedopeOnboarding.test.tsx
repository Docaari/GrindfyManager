import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// =============================================================================
// Sprint F4 W1 — PrimedopeOnboardingCards (RF-16, ADR-056)
//
// Spec: Docs/specs/sprint-f4-primedope-grade-detail.md (B.0 + RF-16)
// ADR-056: dismiss state em localStorage com keys especificas:
//   - primedope_onboarding_dismissed (master)
//   - primedope_onboarding_dismissed_card_1
//   - primedope_onboarding_dismissed_card_2
//   - primedope_onboarding_dismissed_card_3
//
// 3 cards educativos:
//   1. "O que e variance simulation?"
//   2. "Como ler RoR (Risk of Ruin)?"
//   3. "Diferenca ROI vs EV?"
//
// Render condicional:
//   - master=true -> NAO renderiza nenhum card
//   - card_N=true -> esconde card N (mas mantem outros)
//   - se hasRunsHistory=true (prop ou query) -> NAO renderiza
//
// data-testid esperado:
//   - primedope-onboarding (container)
//   - primedope-onboarding-card-0/1/2 (cada card)
//   - primedope-onboarding-card-N-dismiss (X icon)
//   - primedope-onboarding-cta (Comece sua primeira simulacao)
//   - primedope-onboarding-master-dismiss (Nao mostrar mais)
// =============================================================================

import { PrimedopeOnboardingCards } from '../../client/src/components/primedope/PrimedopeOnboardingCards';

beforeEach(() => {
  cleanup();
  localStorage.clear();
});

describe('<PrimedopeOnboardingCards>', () => {
  describe('renderizacao default (sem dismiss)', () => {
    it('renderiza container e os 3 cards educativos', () => {
      render(<PrimedopeOnboardingCards />);
      expect(screen.getByTestId('primedope-onboarding')).toBeInTheDocument();
      expect(screen.getByTestId('primedope-onboarding-card-0')).toBeInTheDocument();
      expect(screen.getByTestId('primedope-onboarding-card-1')).toBeInTheDocument();
      expect(screen.getByTestId('primedope-onboarding-card-2')).toBeInTheDocument();
    });

    it('cada card tem titulo descritivo e botao dismiss', () => {
      render(<PrimedopeOnboardingCards />);
      const text = document.body.textContent || '';
      expect(text).toMatch(/variance simulation|simula(c|ç)/i);
      expect(text).toMatch(/RoR|Risk of Ruin/i);
      expect(text).toMatch(/ROI.*EV|EV.*ROI/i);
    });

    it('contem CTA "Comece sua primeira simulacao"', () => {
      render(<PrimedopeOnboardingCards />);
      expect(screen.getByTestId('primedope-onboarding-cta')).toBeInTheDocument();
    });
  });

  describe('dismiss individual (RF-16)', () => {
    it('click no X do card 0 -> seta primedope_onboarding_dismissed_card_1 e oculta card 0', async () => {
      const user = userEvent.setup();
      render(<PrimedopeOnboardingCards />);

      await user.click(screen.getByTestId('primedope-onboarding-card-0-dismiss'));

      expect(localStorage.getItem('primedope_onboarding_dismissed_card_1')).toBe('1');
      expect(screen.queryByTestId('primedope-onboarding-card-0')).not.toBeInTheDocument();
      // outros 2 ainda renderizados
      expect(screen.getByTestId('primedope-onboarding-card-1')).toBeInTheDocument();
      expect(screen.getByTestId('primedope-onboarding-card-2')).toBeInTheDocument();
    });

    it('quando os 3 cards forem dismissados, master=1 e sai da arvore inteira', async () => {
      const user = userEvent.setup();
      render(<PrimedopeOnboardingCards />);
      await user.click(screen.getByTestId('primedope-onboarding-card-0-dismiss'));
      await user.click(screen.getByTestId('primedope-onboarding-card-1-dismiss'));
      await user.click(screen.getByTestId('primedope-onboarding-card-2-dismiss'));

      expect(localStorage.getItem('primedope_onboarding_dismissed')).toBe('1');
      expect(screen.queryByTestId('primedope-onboarding')).not.toBeInTheDocument();
    });
  });

  describe('master dismiss (CTA + Nao mostrar mais)', () => {
    it('click no CTA dismiss master + chama callback onCtaClick (scroll selector)', async () => {
      const onCta = vi.fn();
      const user = userEvent.setup();
      render(<PrimedopeOnboardingCards onCtaClick={onCta} />);

      await user.click(screen.getByTestId('primedope-onboarding-cta'));

      expect(localStorage.getItem('primedope_onboarding_dismissed')).toBe('1');
      expect(onCta).toHaveBeenCalledTimes(1);
    });

    it('master flag setada antes do mount -> nao renderiza nenhum card', () => {
      localStorage.setItem('primedope_onboarding_dismissed', '1');
      render(<PrimedopeOnboardingCards />);
      expect(screen.queryByTestId('primedope-onboarding')).not.toBeInTheDocument();
    });
  });

  describe('hasRunsHistory prop (server-side check)', () => {
    it('hasRunsHistory=true -> NAO renderiza cards (user ja simulou)', () => {
      render(<PrimedopeOnboardingCards hasRunsHistory />);
      expect(screen.queryByTestId('primedope-onboarding')).not.toBeInTheDocument();
    });
  });

  describe('persistencia entre re-mounts (lesson #12)', () => {
    it('dismiss em mount 1 + remount -> cards continuam ocultos (localStorage sobrevive)', async () => {
      const user = userEvent.setup();
      const { unmount } = render(<PrimedopeOnboardingCards />);
      await user.click(screen.getByTestId('primedope-onboarding-card-0-dismiss'));
      unmount();

      render(<PrimedopeOnboardingCards />);
      expect(screen.queryByTestId('primedope-onboarding-card-0')).not.toBeInTheDocument();
      expect(screen.getByTestId('primedope-onboarding-card-1')).toBeInTheDocument();
    });
  });
});
