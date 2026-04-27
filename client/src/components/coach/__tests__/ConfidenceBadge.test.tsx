import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

// =============================================================================
// Sprint Coach-1 / RF-03 — ConfidenceBadge (client component)
//
// Componente: client/src/components/coach/ConfidenceBadge.tsx (NAO EXISTE)
// Spec: docs/specs/coach-sprint-1-fundacao-economica.md (RF-03.2)
// ADR: Docs/architecture/decisions/022-coach-confidence-tags-inline-vs-structured.md
//
// Requisitos:
//   - <ConfidenceBadge level="alta"|"media"|"baixa" n={N} />
//   - Amarelo para baixa, azul para media, verde para alta
//   - <UnknownBadge reason={string} />: cinza discreto + icone + texto
//   - Acessibilidade: role="status" + aria-label descritivo
// =============================================================================

import { ConfidenceBadge, UnknownBadge } from '../ConfidenceBadge';

describe('<ConfidenceBadge>', () => {
  it('renderiza nivel "alta" com classe verde e texto descritivo', () => {
    const { container } = render(<ConfidenceBadge level="alta" n={145} />);
    const badge = container.querySelector('[role="status"]');
    expect(badge).not.toBeNull();
    expect(badge!.className).toMatch(/green/);
    // Texto contem N=145 ou 145 mencionado
    expect(badge!.textContent).toMatch(/Alta|alta/);
    expect(badge!.textContent).toMatch(/145/);
  });

  it('renderiza nivel "media" com classe azul ou amarela e texto descritivo', () => {
    // O ADR-022 define: baixa=amarelo, media=azul, alta=verde.
    const { container } = render(<ConfidenceBadge level="media" n={45} />);
    const badge = container.querySelector('[role="status"]');
    expect(badge).not.toBeNull();
    expect(badge!.className).toMatch(/blue|yellow/);
    expect(badge!.textContent).toMatch(/M[eé]dia|media/i);
    expect(badge!.textContent).toMatch(/45/);
  });

  it('renderiza nivel "baixa" com classe amarela (cor de alerta) e N', () => {
    const { container } = render(<ConfidenceBadge level="baixa" n={12} />);
    const badge = container.querySelector('[role="status"]');
    expect(badge).not.toBeNull();
    expect(badge!.className).toMatch(/yellow|amber|gray/);
    expect(badge!.textContent).toMatch(/Baixa|baixa/);
    expect(badge!.textContent).toMatch(/12/);
  });

  it('possui aria-label descritivo incluindo o nivel e N', () => {
    render(<ConfidenceBadge level="alta" n={200} />);
    const el = screen.getByRole('status');
    const ariaLabel = el.getAttribute('aria-label') || '';
    expect(ariaLabel.toLowerCase()).toMatch(/alta|confian[cç]a/);
    expect(ariaLabel).toMatch(/200/);
  });
});

describe('<UnknownBadge>', () => {
  it('renderiza com classe cinza e mostra o motivo', () => {
    const { container } = render(<UnknownBadge reason="dado hand-level indisponivel" />);
    const badge = container.querySelector('[role="status"]');
    expect(badge).not.toBeNull();
    expect(badge!.className).toMatch(/gray|slate/);
    expect(badge!.textContent).toMatch(/N[aã]o sei|nao sei/i);
    expect(badge!.textContent).toMatch(/dado hand-level indisponivel/);
  });

  it('possui aria-label indicando que o dado nao esta disponivel', () => {
    render(<UnknownBadge reason="sem Hand History" />);
    const el = screen.getByRole('status');
    const ariaLabel = el.getAttribute('aria-label') || '';
    expect(ariaLabel.toLowerCase()).toMatch(/n[aã]o sei|unknown|indispon|sem dados/);
  });

  it('exibe algum indicador visual (icone ou marcador) de interrogacao/aviso', () => {
    const { container } = render(<UnknownBadge reason="fora de contexto" />);
    // Esperamos um <svg> ou algum <span> com ?
    const hasIcon = container.querySelector('svg') !== null ||
                    /[?]/.test(container.textContent || '');
    expect(hasIcon).toBe(true);
  });
});
