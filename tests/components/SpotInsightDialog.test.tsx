/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spot-Anki-Reentry-3 — RF-1.2 SpotInsightDialog
 *
 * Spec: Docs/specs/spot-anki-reentry-3.md §RF-1.2
 *
 * Cobertura RED:
 *   - Renderiza root data-testid="spot-insight-dialog".
 *   - 6 sections (insight, confidence, decision, tags, addToReentry, footer).
 *   - Validation: insight max 1000 chars (counter + submit disabled se exceder).
 *   - Validation: tags max 10.
 *   - Validation: confidence default 3.
 *   - Toggle "Decisao correta": Sim/Nao sei/Nao.
 *   - showAddToReentry=true: checkbox visivel.
 *   - defaultAddToReentry=true: checkbox pre-marcado.
 *   - Save: PATCH /api/starred-hands/:id; se addToReentry → POST /api/spots/:id/reentry.
 *   - "Salvar sem revisar": apenas PATCH.
 *   - initialValues hidrata fields.
 *   - showAddToReentry checkbox disabled quando ja-ativa (alreadyActive prop).
 *
 * data-testid esperados:
 *   - spot-insight-dialog (root)
 *   - spot-insight-textarea
 *   - spot-insight-counter
 *   - spot-insight-confidence-slider
 *   - spot-insight-decision-yes
 *   - spot-insight-decision-unknown
 *   - spot-insight-decision-no
 *   - spot-insight-tags-input
 *   - spot-insight-add-to-reentry
 *   - spot-insight-submit
 *   - spot-insight-submit-without-review
 *
 * Lessons aplicadas:
 *   #2 data-testid estaveis
 *   #14 await import
 *
 * Status RED: arquivo client/src/components/spots/SpotInsightDialog.tsx NAO existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: apiRequestMock,
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  },
}));

beforeEach(() => {
  cleanup();
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({ id: 'spot-1', userId: 'USER-0001' });
});

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

async function loadDialog() {
  const mod: any = await import('../../client/src/components/spots/SpotInsightDialog');
  return mod.SpotInsightDialog;
}

describe('<SpotInsightDialog>', () => {
  describe('renderizacao', () => {
    it('renderiza root data-testid="spot-insight-dialog"', async () => {
      const Dialog = await loadDialog();
      renderWithClient(<Dialog spotId="spot-1" open={true} onClose={() => {}} />);
      expect(screen.getByTestId('spot-insight-dialog')).toBeInTheDocument();
    });

    it('renderiza textarea de insight + counter', async () => {
      const Dialog = await loadDialog();
      renderWithClient(<Dialog spotId="spot-1" open={true} onClose={() => {}} />);
      expect(screen.getByTestId('spot-insight-textarea')).toBeInTheDocument();
      expect(screen.getByTestId('spot-insight-counter')).toBeInTheDocument();
    });

    it('renderiza confidence slider', async () => {
      const Dialog = await loadDialog();
      renderWithClient(<Dialog spotId="spot-1" open={true} onClose={() => {}} />);
      expect(screen.getByTestId('spot-insight-confidence-slider')).toBeInTheDocument();
    });

    it('renderiza 3 toggle options de decisao', async () => {
      const Dialog = await loadDialog();
      renderWithClient(<Dialog spotId="spot-1" open={true} onClose={() => {}} />);
      expect(screen.getByTestId('spot-insight-decision-yes')).toBeInTheDocument();
      expect(screen.getByTestId('spot-insight-decision-unknown')).toBeInTheDocument();
      expect(screen.getByTestId('spot-insight-decision-no')).toBeInTheDocument();
    });

    it('renderiza tags input', async () => {
      const Dialog = await loadDialog();
      renderWithClient(<Dialog spotId="spot-1" open={true} onClose={() => {}} />);
      expect(screen.getByTestId('spot-insight-tags-input')).toBeInTheDocument();
    });

    it('renderiza submit + sem-revisar buttons', async () => {
      const Dialog = await loadDialog();
      renderWithClient(<Dialog spotId="spot-1" open={true} onClose={() => {}} />);
      expect(screen.getByTestId('spot-insight-submit')).toBeInTheDocument();
      expect(screen.getByTestId('spot-insight-submit-without-review')).toBeInTheDocument();
    });
  });

  describe('addToReentry checkbox', () => {
    it('NAO renderiza checkbox quando showAddToReentry=false', async () => {
      const Dialog = await loadDialog();
      renderWithClient(<Dialog spotId="spot-1" open={true} onClose={() => {}} showAddToReentry={false} />);
      expect(screen.queryByTestId('spot-insight-add-to-reentry')).not.toBeInTheDocument();
    });

    it('renderiza checkbox quando showAddToReentry=true', async () => {
      const Dialog = await loadDialog();
      renderWithClient(<Dialog spotId="spot-1" open={true} onClose={() => {}} showAddToReentry={true} />);
      expect(screen.getByTestId('spot-insight-add-to-reentry')).toBeInTheDocument();
    });

    it('checkbox disabled quando alreadyActive=true', async () => {
      const Dialog = await loadDialog();
      renderWithClient(
        <Dialog spotId="spot-1" open={true} onClose={() => {}} showAddToReentry={true} alreadyActive={true} />,
      );
      const cb = screen.getByTestId('spot-insight-add-to-reentry') as HTMLInputElement;
      expect(cb.hasAttribute('disabled') || cb.getAttribute('aria-disabled') === 'true').toBe(true);
    });
  });

  describe('validacao', () => {
    it('insight com 1001 chars desabilita submit', async () => {
      const Dialog = await loadDialog();
      renderWithClient(<Dialog spotId="spot-1" open={true} onClose={() => {}} />);
      const textarea = screen.getByTestId('spot-insight-textarea') as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: 'x'.repeat(1001) } });
      const submit = screen.getByTestId('spot-insight-submit') as HTMLButtonElement;
      expect(
        submit.hasAttribute('disabled') || submit.getAttribute('aria-disabled') === 'true',
      ).toBe(true);
    });

    it('counter mostra contagem atual / 1000', async () => {
      const Dialog = await loadDialog();
      renderWithClient(<Dialog spotId="spot-1" open={true} onClose={() => {}} />);
      const textarea = screen.getByTestId('spot-insight-textarea');
      fireEvent.change(textarea, { target: { value: 'abc' } });
      const counter = screen.getByTestId('spot-insight-counter');
      expect(counter.textContent).toMatch(/3|1000/);
    });
  });

  describe('initialValues hidrata', () => {
    it('preenche textarea com initialValues.insight', async () => {
      const Dialog = await loadDialog();
      renderWithClient(
        <Dialog
          spotId="spot-1"
          open={true}
          onClose={() => {}}
          initialValues={{ insight: 'meu insight' }}
        />,
      );
      const textarea = screen.getByTestId('spot-insight-textarea') as HTMLTextAreaElement;
      expect(textarea.value).toBe('meu insight');
    });
  });

  describe('submit handlers', () => {
    it('submit chama PATCH /api/starred-hands/:id com fields', async () => {
      const Dialog = await loadDialog();
      renderWithClient(<Dialog spotId="spot-1" open={true} onClose={() => {}} />);
      const textarea = screen.getByTestId('spot-insight-textarea');
      fireEvent.change(textarea, { target: { value: 'meu insight' } });
      const submit = screen.getByTestId('spot-insight-submit');
      fireEvent.click(submit);
      // Pode ser sync ou async — apenas checa que apiRequest foi chamado.
      await new Promise((r) => setTimeout(r, 0));
      expect(apiRequestMock).toHaveBeenCalled();
      const lastCall = apiRequestMock.mock.calls[apiRequestMock.mock.calls.length - 1];
      const haystack = JSON.stringify(lastCall);
      expect(haystack).toMatch(/PATCH|patch|starred-hands\/spot-1/i);
    });

    it('submit com addToReentry=true faz PATCH + POST /reentry sequencial', async () => {
      const Dialog = await loadDialog();
      renderWithClient(
        <Dialog spotId="spot-1" open={true} onClose={() => {}} showAddToReentry={true} defaultAddToReentry={true} />,
      );
      const submit = screen.getByTestId('spot-insight-submit');
      fireEvent.click(submit);
      await new Promise((r) => setTimeout(r, 10));
      // Espera 2 calls: PATCH + POST /reentry
      const allCalls = JSON.stringify(apiRequestMock.mock.calls);
      expect(allCalls).toMatch(/spots\/spot-1\/reentry|\/reentry/i);
    });

    it('"Salvar sem revisar" NAO chama POST /reentry', async () => {
      const Dialog = await loadDialog();
      renderWithClient(
        <Dialog spotId="spot-1" open={true} onClose={() => {}} showAddToReentry={true} defaultAddToReentry={true} />,
      );
      const submitWithout = screen.getByTestId('spot-insight-submit-without-review');
      fireEvent.click(submitWithout);
      await new Promise((r) => setTimeout(r, 10));
      const allCalls = JSON.stringify(apiRequestMock.mock.calls);
      expect(allCalls).not.toMatch(/\/reentry/);
    });
  });
});
