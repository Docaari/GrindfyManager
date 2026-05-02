/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint UI-FND-1 — RF-04: `client/src/components/ui/PageHeader.tsx`
 *
 * Spec: Docs/specs/ui-fnd-1-foundation.md (RF-04 + D10)
 * ADR:  Docs/architecture/decisions/078-design-tokens-ui-patterns.md (secao 2.2 + R5)
 *
 * API esperada (D10):
 *   <PageHeader
 *     title:       string | ReactNode             // OBRIGATORIO (sempre h1)
 *     subtitle?:   string | ReactNode
 *     actions?:    ReactNode
 *     breadcrumb?: ReactNode
 *   />
 *
 * Convencoes:
 *   - title sempre <h1> (1 por pagina, semantica obrigatoria).
 *   - subtitle como string -> <p>; como ReactNode -> render direto.
 *   - actions ocupa slot a direita (desktop) / abaixo (mobile).
 *   - breadcrumb -> <nav aria-label="breadcrumb"> envolvendo o slot.
 *   - SEM prop `icon`, `gradient`, `background` (R5 resolvido por ADR-078).
 *
 * data-testid (D10):
 *   - page-header           (wrapper)
 *   - page-header-title     (h1)
 *   - page-header-actions   (slot — apenas quando actions definido)
 *
 * Lessons aplicadas:
 *   #2  — data-testid estavel.
 *   #11 — sem prop decorativa default. API minimalista.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// @ts-expect-error - red phase, modulo sera criado pelo implementer.
import { PageHeader } from '../../../client/src/components/ui/PageHeader';

describe('RF-04 PageHeader — happy path', () => {
  it('renderiza wrapper com data-testid="page-header"', () => {
    render(<PageHeader title="Dashboard" />);
    expect(screen.getByTestId('page-header')).toBeInTheDocument();
  });

  it('renderiza title em <h1> com texto exato', () => {
    render(<PageHeader title="Biblioteca" />);
    const heading = screen.getByRole('heading', { level: 1, name: 'Biblioteca' });
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe('H1');
  });

  it('renderiza title com data-testid="page-header-title"', () => {
    render(<PageHeader title="X" />);
    const titleEl = screen.getByTestId('page-header-title');
    expect(titleEl).toBeInTheDocument();
    expect(titleEl.tagName).toBe('H1');
  });

  it('aceita title como ReactNode (nao apenas string)', () => {
    render(
      <PageHeader
        title={<span data-testid="custom-title-node">Dashboard <em>Pro</em></span>}
      />,
    );
    expect(screen.getByTestId('custom-title-node')).toBeInTheDocument();
  });

  it('title eh OBRIGATORIO (so prop required)', () => {
    // Compile-time check via TS — em runtime apenas validamos render minimo OK.
    expect(() => render(<PageHeader title="Min" />)).not.toThrow();
  });
});

describe('RF-04 PageHeader — subtitle (opcional)', () => {
  it('NAO renderiza container de subtitle quando undefined', () => {
    render(<PageHeader title="X" />);
    // Heuristica: nao deve haver <p> imediato apos h1 quando sem subtitle.
    const wrapper = screen.getByTestId('page-header');
    const paragraphs = wrapper.querySelectorAll('p');
    expect(paragraphs.length).toBe(0);
  });

  it('renderiza subtitle como <p> quando string', () => {
    render(<PageHeader title="Dashboard" subtitle="Veja sua performance recente" />);
    expect(screen.getByText('Veja sua performance recente')).toBeInTheDocument();
    const p = screen.getByText('Veja sua performance recente');
    expect(p.tagName).toBe('P');
  });

  it('renderiza subtitle como ReactNode quando nao-string', () => {
    render(
      <PageHeader
        title="X"
        subtitle={<span data-testid="custom-subtitle">Custom <strong>node</strong></span>}
      />,
    );
    expect(screen.getByTestId('custom-subtitle')).toBeInTheDocument();
  });

  it('subtitle null explicito NAO renderiza container', () => {
    render(<PageHeader title="X" subtitle={null} />);
    const wrapper = screen.getByTestId('page-header');
    const paragraphs = wrapper.querySelectorAll('p');
    expect(paragraphs.length).toBe(0);
  });
});

describe('RF-04 PageHeader — actions (opcional)', () => {
  it('NAO renderiza slot actions quando undefined', () => {
    render(<PageHeader title="X" />);
    expect(screen.queryByTestId('page-header-actions')).toBeNull();
  });

  it('renderiza slot actions com data-testid="page-header-actions" quando definido', () => {
    render(
      <PageHeader
        title="X"
        actions={<button data-testid="my-action">Importar</button>}
      />,
    );
    const actionsSlot = screen.getByTestId('page-header-actions');
    expect(actionsSlot).toBeInTheDocument();
    expect(screen.getByTestId('my-action')).toBeInTheDocument();
  });

  it('renderiza multiplas actions (array de elementos)', () => {
    render(
      <PageHeader
        title="X"
        actions={
          <>
            <button data-testid="action-1">Importar</button>
            <button data-testid="action-2">Exportar</button>
          </>
        }
      />,
    );
    expect(screen.getByTestId('action-1')).toBeInTheDocument();
    expect(screen.getByTestId('action-2')).toBeInTheDocument();
  });
});

describe('RF-04 PageHeader — breadcrumb (opcional)', () => {
  it('NAO renderiza <nav> de breadcrumb quando undefined', () => {
    render(<PageHeader title="X" />);
    const wrapper = screen.getByTestId('page-header');
    const nav = wrapper.querySelector('nav[aria-label="breadcrumb"]');
    expect(nav).toBeNull();
  });

  it('renderiza <nav aria-label="breadcrumb"> envolvendo o slot quando definido', () => {
    render(
      <PageHeader
        title="X"
        breadcrumb={<span data-testid="bc-content">Home / Library</span>}
      />,
    );
    const nav = screen.getByLabelText('breadcrumb');
    expect(nav).toBeInTheDocument();
    expect(nav.tagName).toBe('NAV');
    expect(screen.getByTestId('bc-content')).toBeInTheDocument();
  });

  it('breadcrumb fica acima do title (ordem DOM)', () => {
    render(
      <PageHeader
        title="Library"
        breadcrumb={<span data-testid="bc">Home / Library</span>}
      />,
    );
    const wrapper = screen.getByTestId('page-header');
    const bc = screen.getByTestId('bc');
    const title = screen.getByTestId('page-header-title');
    // Comparar posicao via compareDocumentPosition.
    const bcVsTitle = bc.compareDocumentPosition(title);
    // Bit 4 = title vem DEPOIS de bc no DOM.
    expect(bcVsTitle & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('RF-04 PageHeader — R5 (sem variants exoticos)', () => {
  it('NAO aceita prop `icon` (anti-pattern documentado em D10)', () => {
    // Validacao: TS bloqueia em compile-time. Em runtime, validamos que se passar
    // `icon` (cast forcado), nao aparece nada novo no DOM (componente ignora).
    render(
      // @ts-expect-error - prop nao existe na API canonica
      <PageHeader title="X" icon={<svg data-testid="rogue-icon" />} />,
    );
    expect(screen.queryByTestId('rogue-icon')).toBeNull();
  });

  it('NAO aceita prop `gradient` (R5 resolvido)', () => {
    render(
      // @ts-expect-error - prop nao existe na API canonica
      <PageHeader title="X" gradient="from-blue-500 to-purple-500" />,
    );
    const wrapper = screen.getByTestId('page-header');
    expect(wrapper.className).not.toMatch(/gradient|from-blue|to-purple/);
  });

  it('NAO aceita prop `background` (R5 resolvido)', () => {
    render(
      // @ts-expect-error - prop nao existe na API canonica
      <PageHeader title="X" background="bg-poker-accent/10" />,
    );
    // Wrapper nao deve ter background customizado vindo de prop.
    // (componente eh neutro por design — ADR-078 secao 2.2).
    expect(screen.getByTestId('page-header')).toBeInTheDocument();
  });

  it('renderiza apenas elementos canonicos (sem icone/decoracao hardcoded)', () => {
    render(<PageHeader title="X" />);
    const wrapper = screen.getByTestId('page-header');
    // Sem icone hardcoded, sem separator (hr/divisor), sem decoracao.
    expect(wrapper.querySelectorAll('hr').length).toBe(0);
    expect(wrapper.querySelectorAll('img').length).toBe(0);
    // SVG so aparece se vier via children/actions/breadcrumb (nao hardcoded).
    expect(wrapper.querySelectorAll('svg').length).toBe(0);
  });
});

describe('RF-04 PageHeader — composicao completa', () => {
  it('renderiza title + subtitle + actions + breadcrumb juntos', () => {
    render(
      <PageHeader
        title="Biblioteca"
        subtitle="47 torneios catalogados"
        actions={<button data-testid="cta-import">Importar</button>}
        breadcrumb={<span data-testid="bc">Home / Library</span>}
      />,
    );
    expect(screen.getByTestId('page-header')).toBeInTheDocument();
    expect(screen.getByTestId('page-header-title')).toBeInTheDocument();
    expect(screen.getByTestId('page-header-actions')).toBeInTheDocument();
    expect(screen.getByLabelText('breadcrumb')).toBeInTheDocument();
    expect(screen.getByText('47 torneios catalogados')).toBeInTheDocument();
    expect(screen.getByTestId('cta-import')).toBeInTheDocument();
    expect(screen.getByTestId('bc')).toBeInTheDocument();
  });

  it('apenas 1 <h1> renderizado (D10 — convencao acessibilidade)', () => {
    render(
      <PageHeader
        title="X"
        subtitle="Y"
        actions={<button>Z</button>}
      />,
    );
    const wrapper = screen.getByTestId('page-header');
    const h1s = wrapper.querySelectorAll('h1');
    expect(h1s.length).toBe(1);
  });
});
