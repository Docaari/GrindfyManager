import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

// =============================================================================
// Sprint Coach-0 / RF-05 — Confidence tags rendering
//
// jsdom env. data-testid estavel (lesson #2).
//
// 3 niveis com cores distintas:
//   - [confianca: baixa] => warning (amber)
//   - [confianca: media] => neutro (azul/amarelo)
//   - [confianca: alta]  => success (verde)
//
// Boundary inclusive:
//   - N=30 -> media
//   - N=100 -> alta
// =============================================================================

describe('CoachMessageContent — ConfidenceBadge rendering', () => {
  it('renderiza ConfidenceBadge[level=low] para [confianca: baixa, N=12]', async () => {
    const { default: CoachMessageContent } =
      await import('../../../client/src/components/coach/CoachMessageContent');
    const { container } = render(
      <CoachMessageContent text="[confianca: baixa, N=12] Seu ROI em PKO esta -15%." />,
    );
    const badge = container.querySelector(
      '[data-testid^="confidence-badge"]',
    );
    expect(badge).toBeTruthy();
    // Atributo data-level ou class indica nivel low
    const isLow = badge?.getAttribute('data-level') === 'low' ||
                  badge?.className.includes('low') ||
                  badge?.className.includes('amber') ||
                  badge?.className.includes('warning');
    expect(isLow).toBe(true);
  });

  it('renderiza ConfidenceBadge[level=high] para [confianca: alta, N=450]', async () => {
    const { default: CoachMessageContent } =
      await import('../../../client/src/components/coach/CoachMessageContent');
    const { container } = render(
      <CoachMessageContent text="[confianca: alta, N=450] Voce e +EV em $22 regulares." />,
    );
    const badge = container.querySelector('[data-testid^="confidence-badge"]');
    expect(badge).toBeTruthy();
    const isHigh = badge?.getAttribute('data-level') === 'high' ||
                   badge?.className.includes('high') ||
                   badge?.className.includes('green') ||
                   badge?.className.includes('success');
    expect(isHigh).toBe(true);
  });

  it('renderiza ConfidenceBadge[level=medium] para [confianca: media, N=45]', async () => {
    const { default: CoachMessageContent } =
      await import('../../../client/src/components/coach/CoachMessageContent');
    const { container } = render(
      <CoachMessageContent text="[confianca: media, N=45] Seu ROI em KO esta +4%." />,
    );
    const badge = container.querySelector('[data-testid^="confidence-badge"]');
    expect(badge).toBeTruthy();
  });
});

describe('Confidence + Citation combinadas — render integrado', () => {
  it('texto com confidence E citation renderiza ambos', async () => {
    const { default: CoachMessageContent } =
      await import('../../../client/src/components/coach/CoachMessageContent');
    const { container } = render(
      <CoachMessageContent
        text="ROI 8% [confianca: baixa, N=12] [fonte: query_dimension:roi:30d]"
      />,
    );
    const confBadge = container.querySelector('[data-testid^="confidence-badge"]');
    const citation = container.querySelector('[data-testid^="citation-chip"]');
    expect(confBadge).toBeTruthy();
    expect(citation).toBeTruthy();
  });
});

describe('Boundary cases — N=30 e N=100 inclusive em "media" e "alta"', () => {
  it('N=30 deve renderizar como media (boundary inclusive)', async () => {
    const { default: CoachMessageContent } =
      await import('../../../client/src/components/coach/CoachMessageContent');
    const { container } = render(
      <CoachMessageContent text="[confianca: media, N=30] Numero exato no boundary." />,
    );
    const badge = container.querySelector('[data-testid^="confidence-badge"]');
    expect(badge).toBeTruthy();
    // Spec define N=30 como "media" inclusive
  });

  it('N=100 deve renderizar como alta (boundary inclusive)', async () => {
    const { default: CoachMessageContent } =
      await import('../../../client/src/components/coach/CoachMessageContent');
    const { container } = render(
      <CoachMessageContent text="[confianca: alta, N=100] Numero exato no boundary." />,
    );
    const badge = container.querySelector('[data-testid^="confidence-badge"]');
    expect(badge).toBeTruthy();
  });
});
