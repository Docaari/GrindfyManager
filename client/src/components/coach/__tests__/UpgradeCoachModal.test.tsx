import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// =============================================================================
// Sprint Coach-1 Frontend UX / RF-10 — UpgradeCoachModal
//
// Modal com matriz 3x3 (planos x coaches) + CTA de upgrade.
//
// Spec: Docs/specs/coach-sprint-1-frontend-ux.md (RF-10)
// Arquivo sob teste: client/src/components/coach/UpgradeCoachModal.tsx (AINDA NAO EXISTE)
// =============================================================================

import { UpgradeCoachModal } from '../UpgradeCoachModal';

const mockSetLocation = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/coach', mockSetLocation],
}));

beforeEach(() => {
  mockSetLocation.mockClear();
});

describe('<UpgradeCoachModal> (RF-10)', () => {
  it('aberto renderiza dialog com matriz 3x3 (planos x coaches)', () => {
    render(
      <UpgradeCoachModal
        open={true}
        onClose={() => {}}
        currentPlan="free"
        targetPlan="pro"
        blockedCoach="tournament"
      />
    );

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();

    const body = document.body.textContent || '';
    // Menciona os 3 planos
    expect(body).toMatch(/Free/i);
    expect(body).toMatch(/Pro/i);
    expect(body).toMatch(/Premium/i);
    // Menciona os 3 coaches
    expect(body).toMatch(/Mental/i);
    expect(body).toMatch(/Torneios|Tournament/i);
    expect(body).toMatch(/Tecnico|Technical/i);
  });

  it('plano atual destacado visualmente', () => {
    render(
      <UpgradeCoachModal
        open={true}
        onClose={() => {}}
        currentPlan="free"
        targetPlan="pro"
        blockedCoach="tournament"
      />
    );

    // INFO: Dialog usa portal — buscamos em document.body, nao no container.
    const highlighted =
      document.body.querySelector('[data-current="true"]') ||
      document.body.querySelector('[aria-current="true"]') ||
      document.body.querySelector('.bg-gray-800\\/50') ||
      document.body.querySelector('[data-plan="free"]');
    expect(highlighted).toBeTruthy();
  });

  it('mostra check e lock icons na matriz', () => {
    render(
      <UpgradeCoachModal
        open={true}
        onClose={() => {}}
        currentPlan="free"
        targetPlan="pro"
        blockedCoach="tournament"
      />
    );

    // INFO: Dialog usa portal — buscamos em document.body, nao no container.
    const svgs = document.body.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThanOrEqual(2);
  });

  it('CTA "Fazer upgrade" com pricing estatico', () => {
    render(
      <UpgradeCoachModal
        open={true}
        onClose={() => {}}
        currentPlan="free"
        targetPlan="pro"
        blockedCoach="tournament"
      />
    );

    const body = document.body.textContent || '';
    expect(body).toMatch(/upgrade/i);
    // Pricing hardcoded — aceita R$ 49 ou R\$49 etc.
    expect(body).toMatch(/R\$\s*\d|mes|Gratis/i);
  });

  it('botao Fechar (ou Voltar) fecha modal (chama onClose)', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <UpgradeCoachModal
        open={true}
        onClose={onClose}
        currentPlan="free"
        targetPlan="pro"
        blockedCoach="tournament"
      />
    );

    const closeBtn =
      screen.queryByRole('button', { name: /fechar|voltar|cancelar/i }) ||
      screen.queryByLabelText(/close|fechar/i);
    expect(closeBtn).toBeTruthy();

    await user.click(closeBtn as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it('Esc fecha modal', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <UpgradeCoachModal
        open={true}
        onClose={onClose}
        currentPlan="free"
        targetPlan="pro"
        blockedCoach="tournament"
      />
    );

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('click fora fecha modal (overlay click)', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <UpgradeCoachModal
        open={true}
        onClose={onClose}
        currentPlan="free"
        targetPlan="pro"
        blockedCoach="tournament"
      />
    );

    // Radix Dialog usa um overlay
    const overlay =
      document.querySelector('[data-state="open"][data-radix-dialog-overlay]') ||
      document.querySelector('[data-radix-dialog-overlay]') ||
      document.querySelector('.fixed.inset-0');
    if (overlay) {
      await user.click(overlay as HTMLElement);
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    } else {
      // Se overlay nao encontrado, pelo menos dialog tem aria-modal
      const dialog = document.querySelector('[role="dialog"]');
      expect(dialog?.getAttribute('aria-modal')).toBe('true');
    }
  });

  it('tem aria-modal=true no dialog', () => {
    render(
      <UpgradeCoachModal
        open={true}
        onClose={() => {}}
        currentPlan="free"
        targetPlan="pro"
        blockedCoach="tournament"
      />
    );

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog!.getAttribute('aria-modal')).toBe('true');
  });
});
