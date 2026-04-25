import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
// Modulo NAO EXISTE ainda (red phase).
import LiveFieldsBlock from '../../../../client/src/components/tournament-form/conditional/LiveFieldsBlock';

// =============================================================================
// Sprint 2 - RF-06 LiveFieldsBlock
//
// 5 campos package_* opcionais + packageNotes (textarea).
//
// data-testid:
//   - wizard-live-package-buyIn
//   - wizard-live-package-accommodation
//   - wizard-live-package-travel
//   - wizard-live-package-meals
//   - wizard-live-package-other
//   - wizard-live-package-notes
//   - wizard-live-package-total (sum visual)
//
// Todos opcionais (sem required).
//
// RED PHASE.
// =============================================================================

const baseValue: any = {
  packageBuyIn: '',
  packageAccommodation: '',
  packageTravel: '',
  packageMeals: '',
  packageOther: '',
  packageNotes: '',
};

describe('LiveFieldsBlock', () => {
  it('renderiza os 5 inputs de package_*', () => {
    render(<LiveFieldsBlock value={baseValue} onChange={() => {}} />);
    expect(screen.getByTestId('wizard-live-package-buyIn')).toBeTruthy();
    expect(screen.getByTestId('wizard-live-package-accommodation')).toBeTruthy();
    expect(screen.getByTestId('wizard-live-package-travel')).toBeTruthy();
    expect(screen.getByTestId('wizard-live-package-meals')).toBeTruthy();
    expect(screen.getByTestId('wizard-live-package-other')).toBeTruthy();
  });

  it('renderiza textarea packageNotes', () => {
    render(<LiveFieldsBlock value={baseValue} onChange={() => {}} />);
    const notes = screen.getByTestId('wizard-live-package-notes');
    expect(notes).toBeTruthy();
    expect(notes.tagName.toLowerCase()).toBe('textarea');
  });

  it('todos os campos numericos NAO sao required', () => {
    render(<LiveFieldsBlock value={baseValue} onChange={() => {}} />);
    const fields = [
      'wizard-live-package-buyIn',
      'wizard-live-package-accommodation',
      'wizard-live-package-travel',
      'wizard-live-package-meals',
      'wizard-live-package-other',
    ];
    for (const tid of fields) {
      const el = screen.getByTestId(tid) as HTMLInputElement;
      expect(el.required).toBe(false);
    }
  });

  it('alterar packageBuyIn dispara onChange', () => {
    const onChange = vi.fn();
    render(<LiveFieldsBlock value={baseValue} onChange={onChange} />);
    const input = screen.getByTestId('wizard-live-package-buyIn') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '550.00' } });
    const arg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(String(arg.packageBuyIn)).toBe('550.00');
  });

  it('alterar packageAccommodation dispara onChange', () => {
    const onChange = vi.fn();
    render(<LiveFieldsBlock value={baseValue} onChange={onChange} />);
    const input = screen.getByTestId('wizard-live-package-accommodation') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '300.00' } });
    const arg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(String(arg.packageAccommodation)).toBe('300.00');
  });

  it('alterar packageNotes dispara onChange', () => {
    const onChange = vi.fn();
    render(<LiveFieldsBlock value={baseValue} onChange={onChange} />);
    const ta = screen.getByTestId('wizard-live-package-notes') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'BSOP SP - hospedagem incluida' } });
    const arg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(arg.packageNotes).toContain('BSOP');
  });

  it('aceita decimais nos campos numericos (validacao em parse, nao required)', () => {
    const onChange = vi.fn();
    render(<LiveFieldsBlock value={baseValue} onChange={onChange} />);
    const fields = [
      ['wizard-live-package-travel', 'packageTravel', '99.99'],
      ['wizard-live-package-meals', 'packageMeals', '120.50'],
      ['wizard-live-package-other', 'packageOther', '50'],
    ] as const;
    for (const [tid, key, val] of fields) {
      const el = screen.getByTestId(tid) as HTMLInputElement;
      fireEvent.change(el, { target: { value: val } });
      const arg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
      expect(String((arg as any)[key])).toBe(val);
    }
  });

  it('mostra total agregado conforme user preenche (sum visual)', () => {
    render(
      <LiveFieldsBlock
        value={{
          ...baseValue,
          packageBuyIn: '500',
          packageAccommodation: '200',
          packageTravel: '100',
          packageMeals: '50',
          packageOther: '0',
        }}
        onChange={() => {}}
      />,
    );
    const total = screen.queryByTestId('wizard-live-package-total');
    if (total) {
      // 500+200+100+50 = 850
      expect(total.textContent).toMatch(/850/);
    } else {
      // Fallback: texto "850" presente no DOM.
      const html = document.body.outerHTML;
      expect(html).toMatch(/850/);
    }
  });

  it('total ignora valores vazios sem quebrar (NaN guard)', () => {
    render(
      <LiveFieldsBlock
        value={{
          ...baseValue,
          packageBuyIn: '500',
          // outros vazios
        }}
        onChange={() => {}}
      />,
    );
    const total = screen.queryByTestId('wizard-live-package-total');
    if (total) {
      expect(total.textContent).not.toMatch(/NaN/);
      expect(total.textContent).toMatch(/500/);
    }
  });
});
