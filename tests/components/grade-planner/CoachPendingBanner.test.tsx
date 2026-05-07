/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint coach-page-reform-1 — RF-04: CoachPendingBanner.
 * Spec: Docs/specs/sprint-coach-page-reform-1.md §RF-04.
 *
 * Comportamento:
 *   - Renderiza ALERT amber com 8 itens (lidos de coach-pending-items.ts).
 *   - Default: expandido na primeira render.
 *   - Toggle persiste estado em localStorage('coach_pending_banner_collapsed').
 *   - Item tem botao "Ir →" que invoca onJump(targetTab).
 *   - Checkboxes sao DECORATIVOS (sem onChange persistente).
 *   - pendingItems = [] -> early return null (banner nao renderiza).
 *
 * Lessons aplicaveis:
 *   #2 — data-testid estaveis (lista canonica em §11.4 da spec).
 *   #11 — checkbox decorativo: sem default action.
 *   #12 — localStorage banner colapsado sobrevive a re-mount.
 *   #14 — usar await import() em test .tsx.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// Importacao dinamica do componente — RED phase tolerante.
async function loadBanner() {
  // @ts-expect-error - red phase: arquivo ainda nao implementado
  const mod: any = await import('@/components/grade-planner/CoachPendingBanner');
  return mod.CoachPendingBanner as React.FC<{
    pendingItems?: any[];
    onJump?: (targetTab: string, anchor?: string) => void;
  }>;
}

beforeEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    // ok
  }
});

describe('CoachPendingBanner — render basico', () => {
  it('renderiza container com data-testid coach-pending-banner', async () => {
    const Banner = await loadBanner();
    render(<Banner />);
    expect(screen.getByTestId('coach-pending-banner')).toBeInTheDocument();
  });

  it('renderiza expandido por default (1a render, sem localStorage)', async () => {
    const Banner = await loadBanner();
    render(<Banner />);
    // Lista deve estar visivel (expanded).
    expect(screen.getByTestId('coach-pending-banner-list')).toBeInTheDocument();
  });

  it('renderiza os 8 itens de pendencias na ordem da spec', async () => {
    const Banner = await loadBanner();
    render(<Banner />);
    // 8 itens conforme spec §RF-04 (linhas 257-264).
    const ids = [
      'biblioteca-quick-filters',
      'grade-hover-delete',
      'variance-add-remove',
      'variance-extras',
      'selector-review',
      'flights-review',
      'biblioteca-review',
      'grade-review',
    ];
    for (const id of ids) {
      expect(screen.getByTestId(`coach-pending-banner-item-${id}`)).toBeInTheDocument();
    }
  });

  it('renderiza um botao "Ir →" para cada item', async () => {
    const Banner = await loadBanner();
    render(<Banner />);
    const ids = [
      'biblioteca-quick-filters',
      'grade-hover-delete',
      'variance-add-remove',
      'variance-extras',
      'selector-review',
      'flights-review',
      'biblioteca-review',
      'grade-review',
    ];
    for (const id of ids) {
      expect(screen.getByTestId(`coach-pending-banner-jump-${id}`)).toBeInTheDocument();
    }
  });
});

describe('CoachPendingBanner — toggle e persistencia', () => {
  it('click no toggle colapsa o banner', async () => {
    const Banner = await loadBanner();
    render(<Banner />);

    expect(screen.getByTestId('coach-pending-banner-list')).toBeInTheDocument();

    const toggle = screen.getByTestId('coach-pending-banner-toggle');
    fireEvent.click(toggle);

    // Lista some quando colapsado.
    expect(screen.queryByTestId('coach-pending-banner-list')).not.toBeInTheDocument();
  });

  it('persiste estado colapsado em localStorage("coach_pending_banner_collapsed")', async () => {
    const Banner = await loadBanner();
    render(<Banner />);

    const toggle = screen.getByTestId('coach-pending-banner-toggle');
    fireEvent.click(toggle);

    // Apos click, key deve estar setada como '1' (truthy).
    const stored = localStorage.getItem('coach_pending_banner_collapsed');
    expect(stored).toBe('1');
  });

  it('respeita localStorage("coach_pending_banner_collapsed")=1 no mount', async () => {
    localStorage.setItem('coach_pending_banner_collapsed', '1');

    const Banner = await loadBanner();
    render(<Banner />);

    // Banner monta colapsado: container existe mas lista nao.
    expect(screen.getByTestId('coach-pending-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('coach-pending-banner-list')).not.toBeInTheDocument();
  });

  it('toggle de volta para expandido persiste "0" (ou remove key)', async () => {
    localStorage.setItem('coach_pending_banner_collapsed', '1');

    const Banner = await loadBanner();
    render(<Banner />);

    const toggle = screen.getByTestId('coach-pending-banner-toggle');
    fireEvent.click(toggle);

    // Lista volta a aparecer.
    expect(screen.getByTestId('coach-pending-banner-list')).toBeInTheDocument();

    // Key fica como '0' OU removida.
    const stored = localStorage.getItem('coach_pending_banner_collapsed');
    expect(stored === '0' || stored === null).toBe(true);
  });
});

describe('CoachPendingBanner — onJump callback', () => {
  it('click em "Ir →" do item planner chama onJump("planner")', async () => {
    const Banner = await loadBanner();
    const onJump = vi.fn();
    render(<Banner onJump={onJump} />);

    const jumpBtn = screen.getByTestId('coach-pending-banner-jump-biblioteca-quick-filters');
    fireEvent.click(jumpBtn);

    expect(onJump).toHaveBeenCalledWith('planner', expect.anything());
  });

  it('click em "Ir →" do item variance-extras chama onJump("variance")', async () => {
    const Banner = await loadBanner();
    const onJump = vi.fn();
    render(<Banner onJump={onJump} />);

    const jumpBtn = screen.getByTestId('coach-pending-banner-jump-variance-extras');
    fireEvent.click(jumpBtn);

    expect(onJump.mock.calls[0][0]).toBe('variance');
  });

  it('click em "Ir →" do item selector-review chama onJump("selector")', async () => {
    const Banner = await loadBanner();
    const onJump = vi.fn();
    render(<Banner onJump={onJump} />);

    const jumpBtn = screen.getByTestId('coach-pending-banner-jump-selector-review');
    fireEvent.click(jumpBtn);

    expect(onJump.mock.calls[0][0]).toBe('selector');
  });

  it('click em "Ir →" do item flights-review chama onJump("flights")', async () => {
    const Banner = await loadBanner();
    const onJump = vi.fn();
    render(<Banner onJump={onJump} />);

    const jumpBtn = screen.getByTestId('coach-pending-banner-jump-flights-review');
    fireEvent.click(jumpBtn);

    expect(onJump.mock.calls[0][0]).toBe('flights');
  });
});

describe('CoachPendingBanner — early return quando array vazio', () => {
  it('pendingItems prop = [] retorna null (banner nao renderiza)', async () => {
    const Banner = await loadBanner();
    const { container } = render(<Banner pendingItems={[]} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('coach-pending-banner')).not.toBeInTheDocument();
  });
});

describe('CoachPendingBanner — visual / classes / a11y', () => {
  it('container tem aplicada classe ou role indicando warning (amber)', async () => {
    const Banner = await loadBanner();
    render(<Banner />);
    const container = screen.getByTestId('coach-pending-banner');
    // Aceita variantes: classe contendo "amber"/"warning"/"yellow" ou role status.
    const className = container.className || '';
    const role = container.getAttribute('role') || '';
    const hasWarningSignal =
      /amber|warning|yellow|alert/i.test(className) ||
      /status|region|alert/i.test(role);
    expect(hasWarningSignal).toBe(true);
  });

  it('toggle tem aria-expanded sincronizado com estado', async () => {
    const Banner = await loadBanner();
    render(<Banner />);
    const toggle = screen.getByTestId('coach-pending-banner-toggle');

    // Default: expandido.
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});
