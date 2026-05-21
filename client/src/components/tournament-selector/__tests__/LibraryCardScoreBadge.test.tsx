import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LibraryCardScoreBadge } from '../LibraryCardScoreBadge';

/**
 * Sprint TS-3 RF-06 (atualizado): server e fonte unica de grade — NAO ha mais
 * `inferGradeFromScore` local. Testes legados que validavam inferencia foram
 * removidos; nova suite em tests/unit/tournament-selector/LibraryCardScoreBadge-rf06.test.tsx
 * cobre o defensive behavior (throw em dev / console.warn em prod).
 */
describe('LibraryCardScoreBadge (RF-05 + RF-06)', () => {
  it('selectorScore=87 grade=S renderiza badge com S e 87', () => {
    render(<LibraryCardScoreBadge selectorScore={87} selectorGrade="S" />);
    const badge = screen.getByTestId('library-card-score-badge');
    expect(badge.textContent).toContain('87');
    expect(badge.textContent).toContain('S');
  });

  it('selectorScore=null NAO renderiza badge', () => {
    const { container } = render(<LibraryCardScoreBadge selectorScore={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('selectorScore=undefined NAO renderiza badge', () => {
    const { container } = render(<LibraryCardScoreBadge selectorScore={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('respeita grade do prop (sem inferir do score)', () => {
    // score sugere D mas server mandou A
    render(<LibraryCardScoreBadge selectorScore={20} selectorGrade="A" />);
    const badge = screen.getByTestId('library-card-score-badge');
    expect(badge.textContent).toContain('A');
    expect(badge.textContent).not.toMatch(/^D/);
  });
});
