/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint UI-FND-1 — RF-03: `client/src/components/ui/FilterChip.tsx`
 *
 * Spec: Docs/specs/ui-fnd-1-foundation.md (RF-03 + D9)
 * ADR:  Docs/architecture/decisions/078-design-tokens-ui-patterns.md (secao 2.2)
 *
 * Componentes esperados:
 *
 * <FilterChip>
 *   props:
 *     label:    string                              // OBRIGATORIO
 *     onRemove: () => void                          // OBRIGATORIO
 *     variant?: 'default' | 'subtle'                (default 'default')
 *     tone?:    'neutral'|'success'|'danger'|       (default 'neutral')
 *               'warn'|'info'|'action'
 *     keyId?:   string                              // opcional para data-testid
 *
 *   Renderiza pill com label + botao "x".
 *   data-testid: `filter-chip` (standalone) OU `filter-chip-{key}` (via group)
 *
 * <FilterChipGroup>
 *   props:
 *     chips: Array<{
 *       key: string,
 *       label: string,
 *       onRemove: () => void,
 *       tone?: ColorKey,
 *       variant?: 'default' | 'subtle',
 *     }>
 *     onClearAll?: () => void
 *
 *   Regra D9: "Limpar tudo" SO renderiza quando chips.length > 1 E onClearAll definido.
 *   chips.length === 0 → retorna null (nao renderiza nada).
 *   data-testid: `filter-chip-group` + `filter-chip-clear-all` (no botao)
 *
 * Acessibilidade: botao X tem aria-label = "Remover filtro {label}". Focus visivel.
 *
 * Lessons aplicadas:
 *   #2 — data-testid estavel.
 *   #11 — onRemove obrigatorio (chip sempre removivel, sem default decorativo).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// @ts-expect-error - red phase, modulos serao criados pelo implementer.
import { FilterChip, FilterChipGroup } from '../../../client/src/components/ui/FilterChip';

// ============================================================================
// FilterChip — standalone
// ============================================================================
describe('RF-03 FilterChip — happy path', () => {
  it('renderiza label visivel', () => {
    render(<FilterChip label="Buy-in: $5-$20" onRemove={() => {}} />);
    expect(screen.getByText('Buy-in: $5-$20')).toBeInTheDocument();
  });

  it('renderiza data-testid="filter-chip" quando standalone (sem keyId)', () => {
    render(<FilterChip label="x" onRemove={() => {}} />);
    expect(screen.getByTestId('filter-chip')).toBeInTheDocument();
  });

  it('renderiza data-testid="filter-chip-{keyId}" quando keyId passado', () => {
    render(<FilterChip label="x" onRemove={() => {}} keyId="buyin" />);
    expect(screen.getByTestId('filter-chip-buyin')).toBeInTheDocument();
  });

  it('renderiza botao remove (X)', () => {
    render(<FilterChip label="Rede: WPN" onRemove={() => {}} />);
    const removeBtn = screen.getByRole('button', { name: /Remover filtro Rede: WPN/ });
    expect(removeBtn).toBeInTheDocument();
  });

  it('click no botao remove chama onRemove (1x)', async () => {
    const onRemove = vi.fn();
    render(<FilterChip label="Buy-in: $50" onRemove={onRemove} />);
    const removeBtn = screen.getByRole('button', { name: /Remover filtro Buy-in: \$50/ });
    await userEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});

describe('RF-03 FilterChip — acessibilidade', () => {
  it('botao X tem aria-label "Remover filtro {label}"', () => {
    render(<FilterChip label="Rede: GG" onRemove={() => {}} />);
    const btn = screen.getByLabelText('Remover filtro Rede: GG');
    expect(btn).toBeInTheDocument();
    expect(btn.tagName).toBe('BUTTON');
  });

  it('botao X aceita label vazio (aria-label = "Remover filtro ")', () => {
    render(<FilterChip label="" onRemove={() => {}} />);
    // Implementer note: testing-library normalizer trims trailing whitespace
    // do accessible name. Query sem trailing space ainda valida intencao do teste:
    // empty label produz aria-label "Remover filtro " no DOM (visivel via attribute getter).
    const btn = screen.getByLabelText('Remover filtro');
    expect(btn).toBeInTheDocument();
    expect(btn.getAttribute('aria-label')).toBe('Remover filtro ');
  });

  it('botao X eh focavel via teclado (tab navigation)', async () => {
    render(<FilterChip label="x" onRemove={() => {}} />);
    const btn = screen.getByRole('button', { name: /Remover filtro x/ });
    btn.focus();
    expect(document.activeElement).toBe(btn);
  });
});

describe('RF-03 FilterChip — tones (D9 + tokens)', () => {
  it('tone neutral (default) renderiza sem throw', () => {
    expect(() => render(<FilterChip label="x" onRemove={() => {}} />)).not.toThrow();
  });

  it.each([
    ['success'],
    ['danger'],
    ['warn'],
    ['info'],
    ['action'],
    ['neutral'],
  ])('tone %s renderiza pill sem throw', (tone) => {
    expect(() =>
      render(<FilterChip label="x" onRemove={() => {}} tone={tone as any} />),
    ).not.toThrow();
    expect(screen.getByTestId('filter-chip')).toBeInTheDocument();
  });

  it('tone aplicado eh refletido no DOM (data-tone OU classname com nome do tone)', () => {
    render(<FilterChip label="x" onRemove={() => {}} tone="success" />);
    const chip = screen.getByTestId('filter-chip');
    const dataTone = chip.getAttribute('data-tone');
    if (dataTone !== null) {
      expect(dataTone).toBe('success');
    } else {
      // Fallback: classname deve referenciar token de cor (ex: 'green' ou 'success').
      expect(chip.className).toMatch(/green|success/);
    }
  });
});

describe('RF-03 FilterChip — variants (D9)', () => {
  it('variant default eh aplicado quando nao especificado', () => {
    render(<FilterChip label="x" onRemove={() => {}} />);
    const chip = screen.getByTestId('filter-chip');
    const variantAttr = chip.getAttribute('data-variant');
    if (variantAttr !== null) {
      expect(variantAttr).toBe('default');
    } else {
      expect(chip.className).not.toMatch(/subtle/);
    }
  });

  it('variant subtle aplica marker distinto', () => {
    render(<FilterChip label="x" onRemove={() => {}} variant="subtle" />);
    const chip = screen.getByTestId('filter-chip');
    const variantAttr = chip.getAttribute('data-variant');
    if (variantAttr !== null) {
      expect(variantAttr).toBe('subtle');
    } else {
      expect(chip.className).toMatch(/subtle/);
    }
  });
});

// ============================================================================
// FilterChipGroup
// ============================================================================
describe('RF-03 FilterChipGroup — happy path', () => {
  it('renderiza wrapper com data-testid="filter-chip-group"', () => {
    render(
      <FilterChipGroup
        chips={[{ key: 'a', label: 'A', onRemove: () => {} }]}
      />,
    );
    expect(screen.getByTestId('filter-chip-group')).toBeInTheDocument();
  });

  it('renderiza N chips para array com N items', () => {
    render(
      <FilterChipGroup
        chips={[
          { key: 'buyin', label: 'Buy-in: $50', onRemove: () => {} },
          { key: 'rede', label: 'Rede: WPN', onRemove: () => {} },
          { key: 'periodo', label: 'Periodo: 7 dias', onRemove: () => {} },
        ]}
      />,
    );
    expect(screen.getByTestId('filter-chip-buyin')).toBeInTheDocument();
    expect(screen.getByTestId('filter-chip-rede')).toBeInTheDocument();
    expect(screen.getByTestId('filter-chip-periodo')).toBeInTheDocument();
  });

  it('cada chip dentro do group usa data-testid="filter-chip-{key}"', () => {
    render(
      <FilterChipGroup
        chips={[{ key: 'unique-key', label: 'X', onRemove: () => {} }]}
      />,
    );
    expect(screen.getByTestId('filter-chip-unique-key')).toBeInTheDocument();
  });

  it('click em remove de UM chip chama apenas o callback dele', async () => {
    const onRemoveA = vi.fn();
    const onRemoveB = vi.fn();
    render(
      <FilterChipGroup
        chips={[
          { key: 'a', label: 'A', onRemove: onRemoveA },
          { key: 'b', label: 'B', onRemove: onRemoveB },
        ]}
      />,
    );
    const chipA = screen.getByTestId('filter-chip-a');
    const removeBtnA = within(chipA).getByRole('button', { name: /Remover filtro A/ });
    await userEvent.click(removeBtnA);
    expect(onRemoveA).toHaveBeenCalledTimes(1);
    expect(onRemoveB).not.toHaveBeenCalled();
  });
});

describe('RF-03 FilterChipGroup — D8 regra Limpar tudo', () => {
  it('chips.length === 0 → retorna null (sem markup)', () => {
    const { container } = render(<FilterChipGroup chips={[]} onClearAll={() => {}} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('filter-chip-group')).toBeNull();
  });

  it('chips.length === 1 + onClearAll definido → NAO renderiza "Limpar tudo"', () => {
    render(
      <FilterChipGroup
        chips={[{ key: 'solo', label: 'X', onRemove: () => {} }]}
        onClearAll={() => {}}
      />,
    );
    expect(screen.queryByTestId('filter-chip-clear-all')).toBeNull();
  });

  it('chips.length === 2 + onClearAll definido → renderiza "Limpar tudo"', () => {
    render(
      <FilterChipGroup
        chips={[
          { key: 'a', label: 'A', onRemove: () => {} },
          { key: 'b', label: 'B', onRemove: () => {} },
        ]}
        onClearAll={() => {}}
      />,
    );
    expect(screen.getByTestId('filter-chip-clear-all')).toBeInTheDocument();
  });

  it('chips.length >= 2 + SEM onClearAll → NAO renderiza "Limpar tudo"', () => {
    render(
      <FilterChipGroup
        chips={[
          { key: 'a', label: 'A', onRemove: () => {} },
          { key: 'b', label: 'B', onRemove: () => {} },
        ]}
      />,
    );
    expect(screen.queryByTestId('filter-chip-clear-all')).toBeNull();
  });

  it('click em "Limpar tudo" chama onClearAll (1x)', async () => {
    const onClearAll = vi.fn();
    render(
      <FilterChipGroup
        chips={[
          { key: 'a', label: 'A', onRemove: () => {} },
          { key: 'b', label: 'B', onRemove: () => {} },
        ]}
        onClearAll={onClearAll}
      />,
    );
    await userEvent.click(screen.getByTestId('filter-chip-clear-all'));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('"Limpar tudo" eh um <button> nativo (a11y/teclado)', () => {
    render(
      <FilterChipGroup
        chips={[
          { key: 'a', label: 'A', onRemove: () => {} },
          { key: 'b', label: 'B', onRemove: () => {} },
        ]}
        onClearAll={() => {}}
      />,
    );
    const btn = screen.getByTestId('filter-chip-clear-all');
    expect(btn.tagName).toBe('BUTTON');
  });
});

describe('RF-03 FilterChipGroup — chips com tones e variants', () => {
  it('renderiza chips com tones diferentes sem throw', () => {
    expect(() =>
      render(
        <FilterChipGroup
          chips={[
            { key: 'a', label: 'A', onRemove: () => {}, tone: 'success' },
            { key: 'b', label: 'B', onRemove: () => {}, tone: 'danger' },
            { key: 'c', label: 'C', onRemove: () => {}, tone: 'info' },
          ]}
        />,
      ),
    ).not.toThrow();
    expect(screen.getByTestId('filter-chip-a')).toBeInTheDocument();
    expect(screen.getByTestId('filter-chip-b')).toBeInTheDocument();
    expect(screen.getByTestId('filter-chip-c')).toBeInTheDocument();
  });

  it('renderiza chips com variants diferentes sem throw', () => {
    expect(() =>
      render(
        <FilterChipGroup
          chips={[
            { key: 'a', label: 'A', onRemove: () => {}, variant: 'default' },
            { key: 'b', label: 'B', onRemove: () => {}, variant: 'subtle' },
          ]}
        />,
      ),
    ).not.toThrow();
  });
});
