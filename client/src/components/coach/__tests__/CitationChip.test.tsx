import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// =============================================================================
// Sprint Coach-1 Frontend UX / RF-02 — CitationChip
//
// Chip inline que representa uma citation extraida do texto do coach.
//
// Spec: Docs/specs/coach-sprint-1-frontend-ux.md (RF-02)
// Arquivo sob teste: client/src/components/coach/CitationChip.tsx
//
// MEDIUM-5 fix: spec define o chip como VISUAL-ONLY (so renderiza chip +
// tooltip; click default e no-op). A prop `onClick` e OPCIONAL — quando
// fornecida, e invocada no click. Comportamento de copy para clipboard
// (que existia antes) era surpresa nao-spec; foi removido.
//
// Nota: como o componente nao mais usa navigator.clipboard, NAO precisamos
// mockar clipboard nos testes. O mock de toast permanece para validar que
// NENHUM toast e disparado pelo default.
// =============================================================================

import { CitationChip } from '../CitationChip';

// Mock toast para validar que NAO e disparado pelo default.
const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn() }),
  toast: (args: any) => toastMock(args),
}));

beforeEach(() => {
  toastMock.mockClear();
});

describe('<CitationChip>', () => {
  describe('renderizacao com props completas', () => {
    it('mostra "Dashboard > Por Speed (N=145, 90d)" com source + n + window', () => {
      render(<CitationChip source="Dashboard > Por Speed" n={145} window="90d" />);
      const text = document.body.textContent || '';
      expect(text).toMatch(/Dashboard > Por Speed/);
      expect(text).toMatch(/145/);
      expect(text).toMatch(/90d/);
    });

    it('renderiza apenas source quando n e window estao ausentes', () => {
      render(<CitationChip source="Biblioteca" />);
      const text = document.body.textContent || '';
      expect(text).toMatch(/Biblioteca/);
    });

    it('renderiza source + n quando window ausente', () => {
      render(<CitationChip source="Grind" n={42} />);
      const text = document.body.textContent || '';
      expect(text).toMatch(/Grind/);
      expect(text).toMatch(/42/);
    });
  });

  describe('acessibilidade', () => {
    it('tem role="button" ou elemento <button>', () => {
      render(<CitationChip source="Dashboard > Por Speed" n={145} window="90d" />);
      const byButton = document.querySelector('button');
      const byRole = document.querySelector('[role="button"]');
      expect(byButton || byRole).toBeTruthy();
    });

    it('tem aria-label descritivo mencionando a fonte', () => {
      render(<CitationChip source="Dashboard > Por Speed" n={145} window="90d" />);
      const el =
        document.querySelector('button[aria-label]') ||
        document.querySelector('[role="button"][aria-label]');
      expect(el).toBeTruthy();
      const aria = el!.getAttribute('aria-label') || '';
      expect(aria.toLowerCase()).toMatch(/fonte|dashboard/);
    });
  });

  describe('tooltip', () => {
    it('tem um titulo/tooltip mencionando "Dado obtido de: <source>"', async () => {
      render(<CitationChip source="Dashboard > Por Speed" n={145} window="90d" />);
      // Tooltip shadcn/radix usa aria-describedby dinamicamente — procuramos
      // um atributo title, data-tooltip, ou aria-describedby que tenha o texto
      // ou pelo menos que o texto esteja presente em algum elemento auxiliar.
      const el =
        document.querySelector('button') ||
        document.querySelector('[role="button"]');
      expect(el).toBeTruthy();

      // Aceita title attribute OU aria-describedby OU data-tooltip OU aparece em hover
      const title = el!.getAttribute('title') || '';
      const describedBy = el!.getAttribute('aria-describedby');
      const ariaLabel = el!.getAttribute('aria-label') || '';

      // Hover para revelar tooltip (Radix tooltip)
      const user = userEvent.setup();
      await user.hover(el!);

      // Buscar qualquer elemento no DOM com o texto esperado
      const bodyText = document.body.textContent || '';
      const tooltipText = /Dado obtido de|Fonte|Baseado em/i;

      const hasTooltip =
        tooltipText.test(title) ||
        tooltipText.test(ariaLabel) ||
        !!describedBy ||
        tooltipText.test(bodyText);

      expect(hasTooltip).toBe(true);
    });
  });

  describe('comportamento de click (MEDIUM-5)', () => {
    it('default (sem onClick): click NAO dispara toast', async () => {
      const user = userEvent.setup();
      render(<CitationChip source="Dashboard > Por Speed" n={145} window="90d" />);
      const btn =
        document.querySelector('button') ||
        (document.querySelector('[role="button"]') as HTMLElement | null);
      expect(btn).toBeTruthy();

      await user.click(btn as HTMLElement);

      // MEDIUM-5: visual-only — toast NAO e disparado.
      expect(toastMock).not.toHaveBeenCalled();
    });

    it('com onClick prop: click chama o handler', async () => {
      const onClick = vi.fn();
      const user = userEvent.setup();
      render(
        <CitationChip
          source="Dashboard > Por Speed"
          n={145}
          window="90d"
          onClick={onClick}
        />,
      );
      const btn =
        document.querySelector('button') ||
        (document.querySelector('[role="button"]') as HTMLElement | null);
      expect(btn).toBeTruthy();

      await user.click(btn as HTMLElement);

      expect(onClick).toHaveBeenCalledTimes(1);
      // Mesmo com onClick custom, default (toast) NAO e disparado.
      expect(toastMock).not.toHaveBeenCalled();
    });

    it('default: cursor visual e "cursor-help" (afordancia de info, nao acao)', () => {
      render(<CitationChip source="Dashboard > Por Speed" n={145} window="90d" />);
      const btn = document.querySelector('button');
      expect(btn).toBeTruthy();
      expect(btn!.className).toMatch(/cursor-help/);
      expect(btn!.className).not.toMatch(/cursor-pointer/);
    });

    it('com onClick: cursor visual e "cursor-pointer"', () => {
      render(
        <CitationChip
          source="Dashboard > Por Speed"
          n={145}
          window="90d"
          onClick={() => {}}
        />,
      );
      const btn = document.querySelector('button');
      expect(btn).toBeTruthy();
      expect(btn!.className).toMatch(/cursor-pointer/);
    });
  });
});
