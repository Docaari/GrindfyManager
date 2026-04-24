import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectorFilters } from '../SelectorFilters';

describe('SelectorFilters - controlled component', () => {
  it('mudanca de date dispara onChange com a nova date', async () => {
    const onChange = vi.fn();
    render(
      <SelectorFilters
        filters={{ date: '2026-04-23' }}
        onChange={onChange}
        bankrollConfigured={true}
      />,
    );
    const input = screen.getByTestId('selector-filter-date') as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, '2026-04-24');
    expect(onChange).toHaveBeenCalled();
  });

  it('bankrollConfigured=false: switch desabilitado', () => {
    const onChange = vi.fn();
    render(
      <SelectorFilters
        filters={{ bankrollFilter: false }}
        onChange={onChange}
        bankrollConfigured={false}
      />,
    );
    const sw = screen.getByTestId('selector-filter-bankroll') as HTMLButtonElement;
    expect(sw.hasAttribute('disabled')).toBe(true);
  });

  it('bankrollConfigured=true: switch habilitado', () => {
    const onChange = vi.fn();
    render(
      <SelectorFilters
        filters={{ bankrollFilter: false }}
        onChange={onChange}
        bankrollConfigured={true}
      />,
    );
    const sw = screen.getByTestId('selector-filter-bankroll') as HTMLButtonElement;
    expect(sw.hasAttribute('disabled')).toBe(false);
  });
});
