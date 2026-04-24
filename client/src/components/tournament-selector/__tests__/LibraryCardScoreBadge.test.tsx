import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LibraryCardScoreBadge } from '../LibraryCardScoreBadge';

describe('LibraryCardScoreBadge (RF-05)', () => {
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

  it('infere grade quando nao informada (score 70 -> A)', () => {
    render(<LibraryCardScoreBadge selectorScore={70} />);
    const badge = screen.getByTestId('library-card-score-badge');
    expect(badge.textContent).toContain('A');
  });

  it('infere grade S para score >= 85', () => {
    render(<LibraryCardScoreBadge selectorScore={85} />);
    expect(screen.getByTestId('library-card-score-badge').textContent).toContain('S');
  });

  it('infere grade D para score < 40', () => {
    render(<LibraryCardScoreBadge selectorScore={20} />);
    expect(screen.getByTestId('library-card-score-badge').textContent).toContain('D');
  });
});
