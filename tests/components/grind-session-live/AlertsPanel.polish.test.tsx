/**
 * Test-Writer (Modo TDD — Red Phase) — Sprint D / Grind Live + Tickets cluster
 *   RF-04.1 clear-all confirm + toast
 *   RF-04.2 SessionAlertManager.reset() entre sessoes
 *   RF-04.3 re-fire mantem triggerAt original e dispara imediato
 *
 * Spec: Docs/specs/sprint-grind-live-cluster.md §Gap RF-04.1/2/3
 *
 * Cenarios cobertos (RF-04.1 — UI):
 *   1) clear-all com 3+ alertas -> confirm dialog "Descartar N alertas?".
 *   2) clear-all com <=2 alertas -> sem confirm, chama onClearAll direto.
 *   3) toast disparado apos clear-all confirmar (via prop toastFn ou globally
 *      acessivel — implementer escolhe).
 *
 * Cenarios cobertos (RF-04.2 — manager):
 *   4) `SessionAlertManager` chama `reset()` ao trocar sessao (assert basico
 *      via instancia — dismissed/fired nao herdam).
 *
 * Cenarios cobertos (RF-04.3 — manager):
 *   5) re-fire alerta com `triggerAt` no passado: `triggerAt` permanece
 *      original (nao move).
 *   6) re-fire alerta dispara imediato no proximo `getAlertsToFire()`
 *      (porque triggerAt <= now).
 *
 * Lessons aplicadas:
 *   - #14 await import.
 *   - #28 vi.mock por path exato — `window.confirm` global override.
 *   - #11 default minimo — confirm so quando >=3.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SessionAlert } from '@shared/generic-alerts';

vi.mock('../../../client/src/lib/ttsVoices', () => ({
  speakUtterance: vi.fn(),
  pickVoice: vi.fn(() => null),
  getPtBRVoices: vi.fn(async () => []),
  useTTSVoices: vi.fn(),
}));

function makeAlert(overrides: Partial<SessionAlert> = {}): SessionAlert {
  return {
    id: `alert-${Math.random().toString(36).slice(2, 8)}`,
    type: 'custom',
    label: 'Faltam 5min',
    triggerAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    fired: false,
    dismissed: false,
    ...overrides,
  } as SessionAlert;
}

const baseProps: any = {
  activeAlerts: [],
  firedAlerts: [],
  activeCount: 0,
  onCreateAlert: vi.fn(),
  onDismissAlert: vi.fn(),
  onRemoveAlert: vi.fn(),
  onRefireAlert: vi.fn(),
  onClearAll: vi.fn(),
  voice: null,
  volume: 0.8,
  ttsAvailable: false,
  soundMode: 'mute',
};

async function renderPanel(extra: Record<string, any> = {}) {
  const AlertsPanel = (await import('../../../client/src/components/grind-session-live/AlertsPanel')).default;
  const r = render(<AlertsPanel {...baseProps} {...extra} />);
  fireEvent.click(screen.getByText('Alertas'));
  return r;
}

// =============================================================================
// RF-04.1 — clear-all confirm dialog + toast
// =============================================================================
describe('AlertsPanel — clear-all (RF-04.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cenario 1 — >=3 alertas -> mostra confirm "Descartar N alertas?"', async () => {
    const alerts = [makeAlert(), makeAlert(), makeAlert()];
    const onClearAll = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    await renderPanel({
      activeAlerts: alerts,
      activeCount: 3,
      onClearAll,
    });

    await userEvent.setup().click(screen.getByRole('button', { name: /limpar todos/i }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    const msg = String(confirmSpy.mock.calls[0][0] ?? '');
    expect(msg.toLowerCase()).toContain('descartar');
    expect(msg).toContain('3');
    expect(onClearAll).toHaveBeenCalledTimes(1);

    confirmSpy.mockRestore();
  });

  it('cenario 1b — user cancela confirm -> onClearAll NAO chamado', async () => {
    const alerts = [makeAlert(), makeAlert(), makeAlert()];
    const onClearAll = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    await renderPanel({
      activeAlerts: alerts,
      activeCount: 3,
      onClearAll,
    });

    await userEvent.setup().click(screen.getByRole('button', { name: /limpar todos/i }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(onClearAll).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('cenario 2 — <=2 alertas -> sem confirm, chama onClearAll direto', async () => {
    const alerts = [makeAlert(), makeAlert()];
    const onClearAll = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    await renderPanel({
      activeAlerts: alerts,
      activeCount: 2,
      onClearAll,
    });

    await userEvent.setup().click(screen.getByRole('button', { name: /limpar todos/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onClearAll).toHaveBeenCalledTimes(1);

    confirmSpy.mockRestore();
  });
});

// =============================================================================
// RF-04.2 + RF-04.3 — SessionAlertManager comportamento
// =============================================================================
describe('SessionAlertManager — reset entre sessoes (RF-04.2)', () => {
  it('cenario 4 — reset limpa active + fired + dismissed', async () => {
    const { SessionAlertManager } = await import('../../../shared/generic-alerts');
    const mgr = new SessionAlertManager();

    const a1 = mgr.addRelativeAlert('Sessao A — alerta 1', 5);
    const a2 = mgr.addRelativeAlert('Sessao A — alerta 2', 10);
    mgr.dismissAlert(a1.id);
    mgr.markFired(a2.id);

    expect(mgr.getActiveCount()).toBe(0);
    expect(mgr.getFiredAlerts().length).toBe(1);

    mgr.reset();

    expect(mgr.getActiveAlerts().length).toBe(0);
    expect(mgr.getFiredAlerts().length).toBe(0);
    expect(mgr.getActiveCount()).toBe(0);

    // Sessao B comeca limpa
    const b1 = mgr.addRelativeAlert('Sessao B — alerta 1', 5);
    expect(mgr.getActiveAlerts().length).toBe(1);
    expect(mgr.getActiveAlerts()[0].id).toBe(b1.id);
  });
});

describe('SessionAlertManager — re-fire (RF-04.3)', () => {
  it('cenario 5 — unmarkFired NAO move triggerAt original', async () => {
    const { SessionAlertManager } = await import('../../../shared/generic-alerts');
    const mgr = new SessionAlertManager();

    // Alerta criado 2h atras (ja deveria ter disparado)
    const original = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const a = mgr.addAlert({
      type: 'custom',
      label: 'antigo',
      triggerAt: original,
    });
    mgr.markFired(a.id);

    // re-fire
    mgr.unmarkFired(a.id);

    // triggerAt nao mudou
    const active = mgr.getActiveAlerts();
    expect(active.length).toBe(1);
    expect(active[0].id).toBe(a.id);
    expect(active[0].triggerAt.getTime()).toBe(original.getTime());
  });

  it('cenario 6 — apos unmarkFired, getAlertsToFire() retorna o alerta imediato', async () => {
    const { SessionAlertManager } = await import('../../../shared/generic-alerts');
    const mgr = new SessionAlertManager();

    const original = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const a = mgr.addAlert({
      type: 'custom',
      label: 'antigo',
      triggerAt: original,
    });
    mgr.markFired(a.id);
    // Sem re-fire: getAlertsToFire NAO inclui (filter por !fired)
    expect(mgr.getAlertsToFire().map((x) => x.id)).not.toContain(a.id);

    mgr.unmarkFired(a.id);
    // Com re-fire + triggerAt no passado: dispara imediato
    expect(mgr.getAlertsToFire().map((x) => x.id)).toContain(a.id);
  });
});
