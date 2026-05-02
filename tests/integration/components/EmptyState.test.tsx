/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint UI-FND-1 — RF-02: `client/src/components/ui/EmptyState.tsx`
 *
 * Spec: Docs/specs/ui-fnd-1-foundation.md (RF-02 + D8)
 * ADR:  Docs/architecture/decisions/078-design-tokens-ui-patterns.md (secao 2.2)
 *
 * API esperada (D8):
 *   <EmptyState
 *     icon?           ReactNode
 *     title:          string                          // OBRIGATORIO
 *     description:    string                          // OBRIGATORIO
 *     ctaLabel:       string                          // OBRIGATORIO
 *     ctaAction:      () => void                      // OBRIGATORIO (lesson #11)
 *     secondaryLink?: { label: string; href: string }
 *     variant?:       'default' | 'compact'           (default 'default')
 *     iconSize?:      'sm' | 'md' | 'lg'              (default 'md' = 64px)
 *     area?:          string                          (default 'generic')
 *   />
 *
 * data-testid (D8):
 *   - empty-state               (wrapper, com data-area)
 *   - empty-state-cta           (botao primario)
 *   - empty-state-secondary-link  (apenas quando secondaryLink definido)
 *
 * Acessibilidade: role="status" no wrapper, aria-label no CTA = ctaLabel.
 *
 * Lessons aplicadas:
 *   #11 — ctaAction obrigatorio (sem default decorativo).
 *   #2  — data-testid estavel.
 *   #9  — telemetria silenciosa nao quebra render.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// @ts-expect-error - red phase, modulo sera criado pelo implementer.
import { EmptyState } from '../../../client/src/components/ui/EmptyState';

describe('RF-02 EmptyState — happy path', () => {
  it('renderiza wrapper com data-testid="empty-state"', () => {
    render(
      <EmptyState
        title="Nenhum torneio importado"
        description="Importe seu primeiro CSV para comecar"
        ctaLabel="Importar CSV"
        ctaAction={() => {}}
      />,
    );
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('renderiza title com texto exato passado via prop', () => {
    render(
      <EmptyState
        title="Sem torneios na biblioteca"
        description="x"
        ctaLabel="x"
        ctaAction={() => {}}
      />,
    );
    expect(screen.getByText('Sem torneios na biblioteca')).toBeInTheDocument();
  });

  it('renderiza description com texto exato passado via prop', () => {
    render(
      <EmptyState
        title="x"
        description="Comece adicionando torneios manualmente ou via importacao"
        ctaLabel="x"
        ctaAction={() => {}}
      />,
    );
    expect(
      screen.getByText('Comece adicionando torneios manualmente ou via importacao'),
    ).toBeInTheDocument();
  });

  it('renderiza CTA com data-testid="empty-state-cta" e label exato', () => {
    render(
      <EmptyState
        title="x"
        description="y"
        ctaLabel="Importar agora"
        ctaAction={() => {}}
      />,
    );
    const cta = screen.getByTestId('empty-state-cta');
    expect(cta).toBeInTheDocument();
    expect(cta.textContent).toBe('Importar agora');
  });

  it('click no CTA chama ctaAction (com vi.fn)', async () => {
    const ctaAction = vi.fn();
    render(
      <EmptyState
        title="x"
        description="y"
        ctaLabel="Go"
        ctaAction={ctaAction}
      />,
    );
    await userEvent.click(screen.getByTestId('empty-state-cta'));
    expect(ctaAction).toHaveBeenCalledTimes(1);
  });
});

describe('RF-02 EmptyState — icon (opcional)', () => {
  it('renderiza icon quando passado', () => {
    const Icon = () => <svg data-testid="custom-icon" />;
    render(
      <EmptyState
        icon={<Icon />}
        title="x"
        description="y"
        ctaLabel="z"
        ctaAction={() => {}}
      />,
    );
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('NAO renderiza wrapper de icon quando icon e undefined', () => {
    render(
      <EmptyState
        title="x"
        description="y"
        ctaLabel="z"
        ctaAction={() => {}}
      />,
    );
    // Heuristica: se houver `data-testid="empty-state-icon-wrapper"` (convencao do legacy),
    // deve estar AUSENTE quando sem icon. Implementer pode usar testid diferente — neste teste
    // validamos que nenhum SVG arbitrario aparece.
    const wrapper = screen.getByTestId('empty-state');
    expect(wrapper.querySelector('svg')).toBeNull();
  });
});

describe('RF-02 EmptyState — secondaryLink (opcional)', () => {
  it('NAO renderiza secondaryLink quando undefined', () => {
    render(
      <EmptyState
        title="x"
        description="y"
        ctaLabel="z"
        ctaAction={() => {}}
      />,
    );
    expect(screen.queryByTestId('empty-state-secondary-link')).toBeNull();
  });

  it('renderiza secondaryLink com href correto quando definido', () => {
    render(
      <EmptyState
        title="x"
        description="y"
        ctaLabel="z"
        ctaAction={() => {}}
        secondaryLink={{ label: 'Saber mais', href: '/docs/import' }}
      />,
    );
    const link = screen.getByTestId('empty-state-secondary-link');
    expect(link).toBeInTheDocument();
    expect(link.textContent).toBe('Saber mais');
    // Aceita <a> ou wrapper Wouter <Link> — ambos renderizam <a> no DOM.
    const anchor = link.tagName === 'A' ? link : link.querySelector('a');
    expect(anchor).not.toBeNull();
    expect(anchor!.getAttribute('href')).toBe('/docs/import');
  });
});

describe('RF-02 EmptyState — variants (D8)', () => {
  it('variant default eh aplicado quando nao especificado', () => {
    render(
      <EmptyState
        title="x"
        description="y"
        ctaLabel="z"
        ctaAction={() => {}}
      />,
    );
    const wrapper = screen.getByTestId('empty-state');
    // Implementer deve refletir variant via classname OU data-variant.
    const variantAttr = wrapper.getAttribute('data-variant');
    if (variantAttr !== null) {
      expect(variantAttr).toBe('default');
    } else {
      // Fallback: verificar que nao ha marker de compact.
      expect(wrapper.className).not.toMatch(/compact/);
    }
  });

  it('variant compact aplica marker distinto (classname OU data-variant)', () => {
    render(
      <EmptyState
        title="x"
        description="y"
        ctaLabel="z"
        ctaAction={() => {}}
        variant="compact"
      />,
    );
    const wrapper = screen.getByTestId('empty-state');
    const variantAttr = wrapper.getAttribute('data-variant');
    if (variantAttr !== null) {
      expect(variantAttr).toBe('compact');
    } else {
      // Fallback: classname deve indicar compact.
      expect(wrapper.className).toMatch(/compact/);
    }
  });
});

describe('RF-02 EmptyState — area (telemetria)', () => {
  it('area eh refletido em data-area quando passado', () => {
    render(
      <EmptyState
        title="x"
        description="y"
        ctaLabel="z"
        ctaAction={() => {}}
        area="library"
      />,
    );
    expect(screen.getByTestId('empty-state').getAttribute('data-area')).toBe('library');
  });

  it('area default eh "generic" quando nao passado', () => {
    render(
      <EmptyState
        title="x"
        description="y"
        ctaLabel="z"
        ctaAction={() => {}}
      />,
    );
    expect(screen.getByTestId('empty-state').getAttribute('data-area')).toBe('generic');
  });
});

describe('RF-02 EmptyState — telemetria (lesson #9)', () => {
  beforeEach(() => {
    delete (window as any).__telemetry;
  });

  afterEach(() => {
    delete (window as any).__telemetry;
  });

  it('NAO quebra render quando window.__telemetry ausente', () => {
    expect(() => {
      render(
        <EmptyState
          title="x"
          description="y"
          ctaLabel="z"
          ctaAction={() => {}}
          area="bankroll"
        />,
      );
    }).not.toThrow();
  });

  it('NAO quebra ao clicar CTA quando window.__telemetry ausente', async () => {
    const ctaAction = vi.fn();
    render(
      <EmptyState
        title="x"
        description="y"
        ctaLabel="z"
        ctaAction={ctaAction}
        area="bankroll"
      />,
    );
    await expect(userEvent.click(screen.getByTestId('empty-state-cta'))).resolves.toBeUndefined();
    expect(ctaAction).toHaveBeenCalledTimes(1);
  });

  it('NAO propaga erro quando window.__telemetry.track lanca (try/catch silencioso)', async () => {
    const ctaAction = vi.fn();
    (window as any).__telemetry = {
      track: () => {
        throw new Error('telemetria broke');
      },
    };
    render(
      <EmptyState
        title="x"
        description="y"
        ctaLabel="z"
        ctaAction={ctaAction}
        area="dashboard"
      />,
    );
    await userEvent.click(screen.getByTestId('empty-state-cta'));
    expect(ctaAction).toHaveBeenCalledTimes(1);
  });

  it('chama window.__telemetry.track com area no payload quando definido', async () => {
    const trackMock = vi.fn();
    (window as any).__telemetry = { track: trackMock };
    render(
      <EmptyState
        title="x"
        description="y"
        ctaLabel="z"
        ctaAction={() => {}}
        area="library"
      />,
    );
    await userEvent.click(screen.getByTestId('empty-state-cta'));
    expect(trackMock).toHaveBeenCalled();
    // Convencao ADR-078: evento contem area como payload key.
    const callArgs = trackMock.mock.calls[0];
    const payload = callArgs[1];
    expect(payload).toMatchObject({ area: 'library' });
  });
});

describe('RF-02 EmptyState — acessibilidade', () => {
  it('wrapper tem role="status"', () => {
    render(
      <EmptyState
        title="x"
        description="y"
        ctaLabel="z"
        ctaAction={() => {}}
      />,
    );
    const wrapper = screen.getByTestId('empty-state');
    expect(wrapper.getAttribute('role')).toBe('status');
  });

  it('CTA tem aria-label igual ao ctaLabel', () => {
    render(
      <EmptyState
        title="x"
        description="y"
        ctaLabel="Importar 47 torneios"
        ctaAction={() => {}}
      />,
    );
    const cta = screen.getByTestId('empty-state-cta');
    expect(cta.getAttribute('aria-label')).toBe('Importar 47 torneios');
  });

  it('title eh um heading semantico (h2 ou h3)', () => {
    render(
      <EmptyState
        title="Sem torneios"
        description="y"
        ctaLabel="z"
        ctaAction={() => {}}
      />,
    );
    // Aceita h2 OU h3 (spec D8 + RF-02 nao prescreve nivel exato — mas h3 eh padrao do legacy).
    const heading = screen.getByRole('heading', { name: 'Sem torneios' });
    expect(['H2', 'H3']).toContain(heading.tagName);
  });

  it('CTA eh um <button> nativo (interacao via teclado garantida)', () => {
    render(
      <EmptyState
        title="x"
        description="y"
        ctaLabel="Acao"
        ctaAction={() => {}}
      />,
    );
    const cta = screen.getByTestId('empty-state-cta');
    expect(cta.tagName).toBe('BUTTON');
  });
});

describe('RF-02 EmptyState — edge cases', () => {
  it('aceita title muito longo (300 chars) sem quebrar render', () => {
    const longTitle = 'x'.repeat(300);
    expect(() =>
      render(
        <EmptyState
          title={longTitle}
          description="y"
          ctaLabel="z"
          ctaAction={() => {}}
        />,
      ),
    ).not.toThrow();
    expect(screen.getByTestId('empty-state').textContent).toContain(longTitle);
  });

  it('renderiza icone com tamanho controlado por iconSize prop (sm)', () => {
    const Icon = () => <svg data-testid="sized-icon" />;
    render(
      <EmptyState
        icon={<Icon />}
        title="x"
        description="y"
        ctaLabel="z"
        ctaAction={() => {}}
        iconSize="sm"
      />,
    );
    // Apenas valida que render aceita prop sem throw — implementer aplica via classname.
    expect(screen.getByTestId('sized-icon')).toBeInTheDocument();
  });

  it('renderiza icone com tamanho lg sem throw', () => {
    const Icon = () => <svg data-testid="sized-icon" />;
    expect(() =>
      render(
        <EmptyState
          icon={<Icon />}
          title="x"
          description="y"
          ctaLabel="z"
          ctaAction={() => {}}
          iconSize="lg"
        />,
      ),
    ).not.toThrow();
  });
});
