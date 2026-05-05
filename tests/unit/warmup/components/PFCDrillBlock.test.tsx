import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// =============================================================================
// Testes TDD (Sprint W-1): PFCDrillBlock (RF-07, T-10)
//
// Contrato:
//   <PFCDrillBlock
//     drillUrl?: string  // default 'https://app.gtowizard.com/'
//     onAdvance={(payload) => void}
//   />
//
// Comportamento:
//   - Timer 4:00 cronometrado, NAO pausavel (4 min e o ponto - spec 7.7).
//   - Link externo "Abrir Trainer (GTO Wizard)" abre em nova aba (target=_blank).
//   - Checkbox "Completei o drill" (nao obrigatoria - pode avancar sem marcar).
//   - Hint do rodape (spec 9.3).
//
// Status: red phase.
// =============================================================================

import { PFCDrillBlock } from '@/components/warmup/PFCDrillBlock';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PFCDrillBlock - render', () => {
  it('exibe titulo "Drills GTO / Estudo"', () => {
    render(<PFCDrillBlock onAdvance={() => {}} />);
    expect(document.body.textContent).toMatch(/drills.*GTO|GTO.*estudo/i);
  });

  it('exibe instrucao de drill (spec 9.3 menciona "Close Decisions")', () => {
    render(<PFCDrillBlock onAdvance={() => {}} />);
    expect(document.body.textContent).toMatch(/close decisions|drill|GTO/i);
  });

  it('expoe link com texto "Abrir Trainer"', () => {
    render(<PFCDrillBlock onAdvance={() => {}} />);
    expect(document.body.textContent).toMatch(/abrir trainer/i);
  });

  it('link tem target=_blank (nova aba)', () => {
    render(<PFCDrillBlock onAdvance={() => {}} />);
    const link = screen.getByRole('link', { name: /abrir trainer/i });
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('default drillUrl aponta para GTO Wizard', () => {
    render(<PFCDrillBlock onAdvance={() => {}} />);
    const link = screen.getByRole('link', { name: /abrir trainer/i });
    expect(link.getAttribute('href')).toMatch(/gtowizard/i);
  });

  it('aceita drillUrl custom via prop', () => {
    render(<PFCDrillBlock drillUrl="https://example.com/drill" onAdvance={() => {}} />);
    const link = screen.getByRole('link', { name: /abrir trainer/i });
    expect(link.getAttribute('href')).toBe('https://example.com/drill');
  });
});

describe('PFCDrillBlock - timer 4 min', () => {
  it('exibe contador 04:00 no inicio', () => {
    render(<PFCDrillBlock onAdvance={() => {}} />);
    expect(document.body.textContent).toMatch(/04:00/);
  });

  it('decrementa timer apos alguns segundos', async () => {
    const { act } = await import('@testing-library/react');
    render(<PFCDrillBlock onAdvance={() => {}} />);
    await act(async () => {
      vi.advanceTimersByTime(2500);
    });
    expect(document.body.textContent).toMatch(/03:5/);
  });
});

describe('PFCDrillBlock - checkbox completou', () => {
  it('checkbox "Completei o drill" presente', () => {
    render(<PFCDrillBlock onAdvance={() => {}} />);
    expect(screen.getByTestId('pfc-drill-completed')).toBeTruthy();
  });

  it('avancar com checkbox marcado envia drillCompleted=true', () => {
    const onAdvance = vi.fn();
    render(<PFCDrillBlock onAdvance={onAdvance} />);

    fireEvent.click(screen.getByTestId('pfc-drill-completed'));
    fireEvent.click(screen.getByTestId('pfc-drill-advance'));

    expect(onAdvance).toHaveBeenCalled();
    const payload = onAdvance.mock.calls[0][0];
    expect(payload.drillCompleted).toBe(true);
  });

  it('avancar sem marcar envia drillCompleted=false (nao-bloqueante)', () => {
    const onAdvance = vi.fn();
    render(<PFCDrillBlock onAdvance={onAdvance} />);

    fireEvent.click(screen.getByTestId('pfc-drill-advance'));

    expect(onAdvance).toHaveBeenCalled();
    const payload = onAdvance.mock.calls[0][0];
    expect(payload.drillCompleted).toBe(false);
  });
});

// Reform 2026-05-05 (round 2 follow-up): valida que pause global do ritual
// suspende ticker do drill PFC.
describe('PFCDrillBlock - prop paused', () => {
  it('paused=true congela contador (nao decrementa)', async () => {
    const { act } = await import('@testing-library/react');
    render(<PFCDrillBlock paused onAdvance={() => {}} />);
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    // Continua mostrando 04:00 (nao decrementou)
    expect(document.body.textContent).toMatch(/04:00/);
  });

  it('paused=false (default) decrementa normalmente', async () => {
    const { act } = await import('@testing-library/react');
    render(<PFCDrillBlock onAdvance={() => {}} />);
    await act(async () => {
      vi.advanceTimersByTime(2500);
    });
    expect(document.body.textContent).toMatch(/03:5/);
  });
});
