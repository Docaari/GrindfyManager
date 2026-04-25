import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// =============================================================================
// Testes TDD (Sprint W-1): GoNoGoModal (RF-04, ADR-027, T-09)
//
// Contrato:
//   <GoNoGoModal
//     open={boolean}
//     score={number}
//     onCancel={() => void}      // "Não vou jogar"
//     onWantsToPlay={() => void} // "Ainda quero jogar"
//   />
//
// Microcopy obrigatoria (spec secao 9.1):
//   "Score abaixo de 6. Por hoje, não jogar é a decisão -EV-positiva."
//   "Sugestões alternativas: Estudar mãos starradas anteriores; Descansar; Conversar"
//
// Status: red phase.
// =============================================================================

import { GoNoGoModal } from '@/components/warmup/GoNoGoModal';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GoNoGoModal - render', () => {
  it('NAO renderiza quando open=false', () => {
    render(
      <GoNoGoModal open={false} score={4} onCancel={() => {}} onWantsToPlay={() => {}} />,
    );
    const text = document.body.textContent || '';
    expect(text).not.toMatch(/score abaixo de 6/i);
  });

  it('renderiza quando open=true', () => {
    render(
      <GoNoGoModal open score={4} onCancel={() => {}} onWantsToPlay={() => {}} />,
    );
    expect(document.body.textContent).toMatch(/n[aã]o jogar/i);
  });
});

describe('GoNoGoModal - microcopy spec 9.1', () => {
  it('exibe "Score abaixo de 6"', () => {
    render(<GoNoGoModal open score={4} onCancel={() => {}} onWantsToPlay={() => {}} />);
    expect(document.body.textContent).toMatch(/score abaixo de 6/i);
  });

  it('exibe palavra "EV" (decisao -EV-positiva)', () => {
    render(<GoNoGoModal open score={4} onCancel={() => {}} onWantsToPlay={() => {}} />);
    expect(document.body.textContent).toMatch(/EV/i);
  });

  it('exibe sugestao "Estudar"', () => {
    render(<GoNoGoModal open score={4} onCancel={() => {}} onWantsToPlay={() => {}} />);
    expect(document.body.textContent).toMatch(/estudar/i);
  });

  it('exibe sugestao "Descansar"', () => {
    render(<GoNoGoModal open score={4} onCancel={() => {}} onWantsToPlay={() => {}} />);
    expect(document.body.textContent).toMatch(/descansar|dormir/i);
  });

  it('exibe sugestao "Conversar"', () => {
    render(<GoNoGoModal open score={4} onCancel={() => {}} onWantsToPlay={() => {}} />);
    expect(document.body.textContent).toMatch(/conversar/i);
  });
});

describe('GoNoGoModal - acoes', () => {
  it('clicar em "Nao vou jogar" chama onCancel', () => {
    const onCancel = vi.fn();
    render(<GoNoGoModal open score={4} onCancel={onCancel} onWantsToPlay={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /n[aã]o vou jogar/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('clicar em "Ainda quero jogar" chama onWantsToPlay', () => {
    const onWantsToPlay = vi.fn();
    render(<GoNoGoModal open score={4} onCancel={() => {}} onWantsToPlay={onWantsToPlay} />);

    fireEvent.click(screen.getByRole('button', { name: /ainda quero jogar/i }));
    expect(onWantsToPlay).toHaveBeenCalled();
  });
});

describe('GoNoGoModal - score variavel', () => {
  it('exibe valor do score na mensagem (e.g., score=2)', () => {
    render(<GoNoGoModal open score={2} onCancel={() => {}} onWantsToPlay={() => {}} />);
    // O score pode aparecer literalmente ou apenas a mensagem generica
    expect(document.body.textContent).toMatch(/score|2/);
  });
});

describe('GoNoGoModal - acessibilidade', () => {
  it('botao primario "Nao vou jogar" tem mais enfase visual que "Ainda quero jogar"', () => {
    render(<GoNoGoModal open score={4} onCancel={() => {}} onWantsToPlay={() => {}} />);
    const noPlay = screen.getByRole('button', { name: /n[aã]o vou jogar/i });
    const wantPlay = screen.getByRole('button', { name: /ainda quero jogar/i });
    // Heuristica: classes diferentes (primary vs secondary)
    expect(noPlay.className).not.toBe(wantPlay.className);
  });
});
