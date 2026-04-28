/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint F2 — W3: SpotReviewCard (modal de revisao de print)
 *
 * Spec:    Docs/specs/sprint-f2-spot-screenshots.md (RF-09)
 * Flow:    Docs/architecture/feature-flows/spot-screenshots-flow.mermaid (FLUXO 2A — REVIEW)
 * C4:      Docs/architecture/feature-flows/spot-screenshots-components.mermaid
 *
 * Lessons aplicadas (Docs/architecture/lessons-learned.md):
 *   #1  hooks primeiro (early return based em open=false vai depois dos hooks)
 *   #2  data-testid estavel — todos os queries usam getByTestId, sem heuristica DOM
 *   #4  stub red-phase em SpotReviewCard.tsx (export default null) para Vite resolver
 *   #11 default minimo — modal so faz a acao quando user clica explicitamente;
 *       Save NAO dispara automaticamente
 *   #12 estado persistente via initialType/Spot/Notes vindo de prop (form state local
 *       mas pre-populado por props, sobrevive a unmount/remount via parent)
 *
 * data-testids contratados (componente AINDA NAO existe — stub null):
 *   spot-review-card             container do modal (root)
 *   spot-review-image            <img> com preview da imagem (apontando /api/starred-hands/:id/image)
 *   spot-review-type             select de StarredHandType
 *   spot-review-spot             select de StarredHandSpot
 *   spot-review-conclusion       <textarea> conclusion
 *   spot-review-conclusion-error mensagem de erro inline (>500 chars)
 *   spot-review-notes            <input/textarea> notes opcional
 *   spot-review-save             button "Salvar revisao"
 *   spot-review-later            button "Revisar Depois"
 *   spot-review-close            button "X" (fechar)
 *
 * Pattern de mocks: importa STARRED_HAND_TYPES/SPOTS direto do shared/schema
 * (single source of truth — lesson #10 nao duplicar enums em testes).
 *
 * NOTA: import do componente que existe como stub (retorna null) —
 *   - render nao gera erro de import, mas
 *   - testes que esperam testid render falharao porque stub renderiza null.
 * Implementer (W3 green) substitui pelo corpo real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import {
  STARRED_HAND_TYPES,
  STARRED_HAND_SPOTS,
} from '@shared/schema';

// =============================================================================
// Mocks
// =============================================================================

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  },
  getCsrfToken: () => null,
}));

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn() }),
  toast: (a: any) => toastMock(a),
}));

// =============================================================================
// Component under test
// Red-phase: SpotReviewCard.tsx existe como stub (export default null) para
// Vite resolver. Implementer (green) substitui.
// =============================================================================
import SpotReviewCard from '../SpotReviewCard';

// =============================================================================
// Helpers
// =============================================================================

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

// Filtra STARRED_HAND_TYPES/SPOTS para excluir placeholders F2 (spot_screenshot
// + screenshot_pending). O modal so deve oferecer valores classificaveis pelo
// jogador, conforme RF-09.
const SELECTABLE_TYPES = STARRED_HAND_TYPES.filter(
  (t) => t !== 'spot_screenshot',
);
const SELECTABLE_SPOTS = STARRED_HAND_SPOTS.filter(
  (s) => s !== 'screenshot_pending',
);

const baseProps = {
  open: true,
  spotId: 'sh-abc',
  imageUrl: '/uploads/spot-screenshots/sh-abc.png',
  sessionTournamentId: 'st-xyz',
  onSave: vi.fn(),
  onReviewLater: vi.fn(),
  onClose: vi.fn(),
};

beforeEach(() => {
  apiRequestMock.mockReset();
  toastMock.mockClear();
  baseProps.onSave = vi.fn();
  baseProps.onReviewLater = vi.fn();
  baseProps.onClose = vi.fn();
});

// =============================================================================
// Cenario B1: open=false NAO renderiza nada visivel
// Cobre RF-09 AC: modal so renderiza quando open=true
// =============================================================================

describe('SpotReviewCard — render fechado', () => {
  it('quando open=false, NAO renderiza spot-review-card', () => {
    render(wrap(<SpotReviewCard {...baseProps} open={false} />));
    expect(screen.queryByTestId('spot-review-card')).not.toBeInTheDocument();
  });
});

// =============================================================================
// Cenario B2: open=true renderiza modal completo
// Cobre RF-09 AC: "Modal abre com preview e selects"
// =============================================================================

describe('SpotReviewCard — render aberto (estrutura)', () => {
  it('renderiza container spot-review-card', () => {
    render(wrap(<SpotReviewCard {...baseProps} />));
    expect(screen.getByTestId('spot-review-card')).toBeInTheDocument();
  });

  it('renderiza spot-review-image com src apontando /api/starred-hands/:id/image', () => {
    render(wrap(<SpotReviewCard {...baseProps} />));
    const img = screen.getByTestId('spot-review-image') as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.tagName.toLowerCase()).toBe('img');
    // Endpoint serve via id (ADR-052), nao via path direto da imagem.
    // Spec: "GET /api/starred-hands/:id/image"
    expect(img.getAttribute('src')).toContain(`/api/starred-hands/${baseProps.spotId}/image`);
  });

  it('renderiza select spot-review-type com opcoes selecionaveis (sem spot_screenshot)', () => {
    render(wrap(<SpotReviewCard {...baseProps} />));
    const sel = screen.getByTestId('spot-review-type') as HTMLSelectElement;
    expect(sel).toBeInTheDocument();
    expect(sel.tagName.toLowerCase()).toBe('select');
    // Cada valor selecionavel aparece como <option>
    for (const t of SELECTABLE_TYPES) {
      // Valida que existe ao menos uma option com esse value.
      const opt = Array.from(sel.options).find((o) => o.value === t);
      expect(opt, `option type=${t}`).toBeDefined();
    }
    // spot_screenshot eh placeholder F2 e NAO deve aparecer no select.
    const placeholder = Array.from(sel.options).find(
      (o) => o.value === 'spot_screenshot',
    );
    expect(placeholder).toBeUndefined();
  });

  it('renderiza select spot-review-spot com opcoes selecionaveis (sem screenshot_pending)', () => {
    render(wrap(<SpotReviewCard {...baseProps} />));
    const sel = screen.getByTestId('spot-review-spot') as HTMLSelectElement;
    expect(sel).toBeInTheDocument();
    for (const s of SELECTABLE_SPOTS) {
      const opt = Array.from(sel.options).find((o) => o.value === s);
      expect(opt, `option spot=${s}`).toBeDefined();
    }
    const placeholder = Array.from(sel.options).find(
      (o) => o.value === 'screenshot_pending',
    );
    expect(placeholder).toBeUndefined();
  });

  it('renderiza spot-review-conclusion com max 500 chars', () => {
    render(wrap(<SpotReviewCard {...baseProps} />));
    const ta = screen.getByTestId('spot-review-conclusion') as HTMLTextAreaElement;
    expect(ta).toBeInTheDocument();
    // tag pode ser textarea OU input com type=text — aceitamos textarea (spec).
    expect(['textarea', 'input']).toContain(ta.tagName.toLowerCase());
    // RF-09: max 500 chars conclusion.
    const max = ta.getAttribute('maxlength') ?? ta.getAttribute('maxLength');
    expect(max).toBe('500');
  });

  it('renderiza botoes spot-review-save, spot-review-later, spot-review-close', () => {
    render(wrap(<SpotReviewCard {...baseProps} />));
    expect(screen.getByTestId('spot-review-save')).toBeInTheDocument();
    expect(screen.getByTestId('spot-review-later')).toBeInTheDocument();
    expect(screen.getByTestId('spot-review-close')).toBeInTheDocument();
  });
});

// =============================================================================
// Cenario B3: Pre-populacao via initialType/Spot/Notes
// Cobre RF-09 AC: "InitialNotes/Type/Spot pre-populados quando passados como props"
// =============================================================================

describe('SpotReviewCard — pre-populacao', () => {
  it('initialType, initialSpot, initialNotes preenchem os campos do form', () => {
    render(
      wrap(
        <SpotReviewCard
          {...baseProps}
          initialType="leak"
          initialSpot="river"
          initialNotes="vs reg agressivo"
        />,
      ),
    );

    const typeSel = screen.getByTestId('spot-review-type') as HTMLSelectElement;
    const spotSel = screen.getByTestId('spot-review-spot') as HTMLSelectElement;
    expect(typeSel.value).toBe('leak');
    expect(spotSel.value).toBe('river');

    const notes = screen.queryByTestId('spot-review-notes') as HTMLInputElement | null;
    if (notes) {
      // notes pode ser input OU textarea — comparamos o valor.
      expect(notes.value).toBe('vs reg agressivo');
    }
  });
});

// =============================================================================
// Cenario B4: Click Save com valores validos chama onSave com patch correto
// Cobre RF-09 AC: "Salvar PATCH chama endpoint" (testado via callback aqui;
// integration test do CoolDownRunner cobre o PATCH real)
// =============================================================================

describe('SpotReviewCard — click Save com valores validos', () => {
  it('chama onSave com { conclusion, type, spot, notes, sessionTournamentId }', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      wrap(
        <SpotReviewCard
          {...baseProps}
          onSave={onSave}
          initialType="leak"
          initialSpot="river"
        />,
      ),
    );

    // Conclusion textarea
    const ta = screen.getByTestId('spot-review-conclusion');
    await user.type(ta, 'Bluff catcher correto');

    await user.click(screen.getByTestId('spot-review-save'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    const patch = onSave.mock.calls[0][0];
    expect(patch).toEqual(
      expect.objectContaining({
        conclusion: 'Bluff catcher correto',
        type: 'leak',
        spot: 'river',
        sessionTournamentId: 'st-xyz',
      }),
    );
  });
});

// =============================================================================
// Cenario B5: saving=true desabilita Save e nao chama onSave
// Cobre RF-09 AC: "Save com saving=true: botao disabled"
// =============================================================================

describe('SpotReviewCard — saving=true', () => {
  it('botao Save fica disabled e click nao dispara onSave', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      wrap(
        <SpotReviewCard
          {...baseProps}
          onSave={onSave}
          saving={true}
          initialType="leak"
          initialSpot="river"
        />,
      ),
    );
    const btn = screen.getByTestId('spot-review-save') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);

    // user-event nao clica em disabled, mas garantimos onSave nao foi chamado.
    await user.click(btn).catch(() => {
      // fireEvent.click em disabled = noop (correto)
    });
    expect(onSave).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Cenario B6: saveDisabled=true desabilita Save com tooltip do reason
// Cobre RF-09 AC: "Tooltip de limite quando torneio ja saturado"
// =============================================================================

describe('SpotReviewCard — saveDisabled=true (limite 3 stars)', () => {
  it('botao Save fica disabled e exibe saveDisabledReason via title/aria', () => {
    render(
      wrap(
        <SpotReviewCard
          {...baseProps}
          saveDisabled={true}
          saveDisabledReason="Maximo 3 maos/torneio. Remova uma para revisar este print."
        />,
      ),
    );
    const btn = screen.getByTestId('spot-review-save') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);

    // tooltip pode ser title OR aria-label OR aria-describedby pointing
    // a element com texto. Aceitamos qualquer um.
    const title = btn.getAttribute('title') ?? '';
    const ariaLabel = btn.getAttribute('aria-label') ?? '';
    const ariaDescribed = btn.getAttribute('aria-describedby');
    let describedText = '';
    if (ariaDescribed) {
      const el = document.getElementById(ariaDescribed);
      describedText = el?.textContent ?? '';
    }
    const combined = `${title} ${ariaLabel} ${describedText}`.toLowerCase();
    expect(combined).toMatch(/maximo 3|3 maos|limite/);
  });
});

// =============================================================================
// Cenario B7: Click Review Later chama onReviewLater (sem requerer conclusion)
// Cobre RF-09 AC: "Click 'Revisar Depois': dispara PATCH com reviewLater=true"
// =============================================================================

describe('SpotReviewCard — click Revisar Depois', () => {
  it('chama onReviewLater() mesmo sem conclusion', async () => {
    const user = userEvent.setup();
    const onReviewLater = vi.fn().mockResolvedValue(undefined);
    render(
      wrap(
        <SpotReviewCard
          {...baseProps}
          onReviewLater={onReviewLater}
        />,
      ),
    );

    await user.click(screen.getByTestId('spot-review-later'));

    await waitFor(() => {
      expect(onReviewLater).toHaveBeenCalledTimes(1);
    });
  });
});

// =============================================================================
// Cenario B8: Click Close chama onClose
// Cobre RF-09 AC: "Click X / fechar: chama onClose"
// =============================================================================

describe('SpotReviewCard — click Close', () => {
  it('chama onClose ao clicar no botao spot-review-close', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      wrap(
        <SpotReviewCard
          {...baseProps}
          onClose={onClose}
        />,
      ),
    );

    await user.click(screen.getByTestId('spot-review-close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// Cenario B9: Conclusion > 500 chars mostra erro inline e desabilita Save
// Cobre RF-09 AC: "Conclusion >500 chars: erro inline, Save disabled"
// =============================================================================

describe('SpotReviewCard — conclusion > 500 chars', () => {
  it('mostra spot-review-conclusion-error e desabilita Save', async () => {
    // Render com conclusion enorme via initialNotes-like? O componente nao tem
    // initialConclusion, mas podemos digitar via fireEvent.change para
    // ultrapassar maxLength (alguns browsers permitem; jsdom nao bloqueia).
    render(wrap(<SpotReviewCard {...baseProps} initialType="leak" initialSpot="river" />));

    const ta = screen.getByTestId('spot-review-conclusion') as HTMLTextAreaElement;
    // Forca um valor 501 chars (jsdom nao trunca por maxLength via fireEvent.change).
    const longValue = 'x'.repeat(501);
    fireEvent.change(ta, { target: { value: longValue } });

    // Erro inline aparece
    await waitFor(() => {
      expect(screen.getByTestId('spot-review-conclusion-error')).toBeInTheDocument();
    });

    // Save fica disabled
    const btn = screen.getByTestId('spot-review-save') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
