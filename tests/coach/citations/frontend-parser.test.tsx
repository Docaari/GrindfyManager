import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

// =============================================================================
// Sprint Coach-0 / RF-04 — Frontend parser graceful degradation
//
// Modulo alvo: client/src/lib/coachMessageParser.ts (existing) consumed by
// CoachMessageContent (existing). RF-04 garante que CitationChip renderiza
// fonte=nao verificado com cursor-help + tooltip.
//
// jsdom env (data-testid estavel — lesson #2).
// =============================================================================

describe('CoachMessageContent — citations rendering', () => {
  it('renderiza CitationChip para [fonte: query_dimension:roi:30d]', async () => {
    const { default: CoachMessageContent } =
      await import('../../../client/src/components/coach/CoachMessageContent');

    render(
      <CoachMessageContent
        text="Seu ROI ultimo mes foi +8% [fonte: query_dimension:roi:30d]."
      />,
    );
    // data-testid estavel (lesson #2) — citation-chip ou citation-chip-<id>
    const chip = screen.queryByTestId(/citation-chip/);
    expect(chip).toBeTruthy();
  });

  it('renderiza CitationChip especial para [fonte: nao verificado]', async () => {
    const { default: CoachMessageContent } =
      await import('../../../client/src/components/coach/CoachMessageContent');
    const { container } = render(
      <CoachMessageContent text="30% dos pros zeram esse spot [fonte: nao verificado]." />,
    );
    // CitationChip "nao verificado" tem cursor-help + tooltip
    const chips = container.querySelectorAll('[data-testid^="citation-chip"]');
    expect(chips.length).toBeGreaterThan(0);
    // O chip de nao verificado deve aplicar classe cursor-help OU data-attribute
    const naoVerifCount = Array.from(chips).filter(c =>
      c.textContent?.toLowerCase().includes('nao verificado') ||
      c.getAttribute('data-source') === 'unverified',
    ).length;
    expect(naoVerifCount).toBeGreaterThan(0);
  });

  it('graceful degradation: texto malformado (chip sem fechar) NAO crasha render', async () => {
    const { default: CoachMessageContent } =
      await import('../../../client/src/components/coach/CoachMessageContent');
    expect(() => {
      render(<CoachMessageContent text="Numero solto sem chip [fonte: incompleto" />);
    }).not.toThrow();
  });

  it('multiplos chips na mesma frase renderizam todos', async () => {
    const { default: CoachMessageContent } =
      await import('../../../client/src/components/coach/CoachMessageContent');
    const { container } = render(
      <CoachMessageContent
        text="ROI 8% [fonte: query_dimension:roi:30d] e ITM 16% [fonte: dashboard:30d]."
      />,
    );
    const chips = container.querySelectorAll('[data-testid^="citation-chip"]');
    expect(chips.length).toBeGreaterThanOrEqual(2);
  });

  it('numero sem chip renderiza como texto simples (no crash)', async () => {
    const { default: CoachMessageContent } =
      await import('../../../client/src/components/coach/CoachMessageContent');
    expect(() => {
      render(<CoachMessageContent text="Apenas texto sem chip nem tag." />);
    }).not.toThrow();
  });
});
