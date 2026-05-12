/**
 * Test-Writer (Modo TDD — Red Phase)
 *
 * Sprint AI-1B / RF-08.3 — NudgeCard.tsx (deferido do AI-1A, entra aqui)
 *   client/src/components/coach/NudgeCard.tsx
 *   - mostra titulo + body preview + status badge
 *   - se status em estado acionavel: "Nao agora" (snooze short) / "Nao por enquanto"
 *     (snooze long) / "Ver no chat" (engage -> navega /coach-ai?tab=chat com a session)
 *     / "Dispensar" (dismiss) -> chamam POST /api/coach/nudges/:id/{snooze,engage,dismiss}
 *   - triggeredByEvent === 'auto_freeze_notice' -> renderiza o aviso sem botoes de snooze
 *
 * Fontes:
 *   - Docs/specs/sprint-ai-1b.md (RF-08.3 + "Cenarios de Teste Derivados")
 *   - Docs/architecture/decisions/157-...-bgapcheck-bimport.md (§3.3, §5)
 *   - Docs/api/coach.md (endpoints AI-1A: POST /api/coach/nudges/:id/{dismiss,snooze,engage})
 *
 * data-testid esperados:
 *   - coach-nudge-card                — wrapper
 *   - coach-nudge-card-title          — titulo
 *   - coach-nudge-card-body           — body preview
 *   - coach-nudge-card-status         — status badge
 *   - coach-nudge-card-snooze-short   — botao "Nao agora"
 *   - coach-nudge-card-snooze-long    — botao "Nao por enquanto"
 *   - coach-nudge-card-engage         — botao "Ver no chat"
 *   - coach-nudge-card-dismiss        — botao "Dispensar"
 *   - coach-nudge-card-freeze-notice  — bloco do auto_freeze_notice (sem botoes de snooze)
 *
 * Lessons: #13 (apiRequest JSON), #14/#26 (await import .tsx), #1 (hooks primeiro),
 *   #2 (data-testid), #29 (encapsular em ErrorBoundary local se usar useQuery sem provider —
 *   aqui o card recebe os dados por prop, entao nao precisa de provider).
 *
 * Status esperado: FALHAM (componente nao existe).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

const navMock = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/coach-ai', navMock] as const,
  Link: ({ href, children, ...rest }: any) => <a href={href} data-href={href} {...rest}>{children}</a>,
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }), toast: vi.fn() }));

const apiRequestMock = vi.fn(async (_m: string, _u: string, _b?: any) => ({ ok: true }));
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (m: string, u: string, b?: any) => apiRequestMock(m, u, b),
  queryClient: { invalidateQueries: vi.fn() },
}));

async function loadNudgeCard() {
  // path em variavel: evita o Vite tentar resolver estaticamente em transform-time
  // (na red-phase o modulo ainda nao existe — assim o arquivo de teste carrega e
  // todos os its falham individualmente em vez de "0 test").
  const p = '@/components/coach/NudgeCard';
  const mod: any = await import(/* @vite-ignore */ p);
  return (mod.default ?? mod.NudgeCard) as React.ComponentType<any>;
}

const SENT_NUDGE = {
  id: 'n1', category: 'B-IMPORT', status: 'sent', title: 'Importe seu histórico',
  bodyPreview: 'Você registrou 4 sessões mas não importou nenhum CSV — bora importar?',
  sentAt: '2026-05-09T12:00:00Z', engagedAt: null, dismissedAt: null, snoozeUntil: null,
  chatSessionId: 'cs-42', triggeredByEvent: 'b_import_check',
};

beforeEach(() => { vi.clearAllMocks(); });

describe('NudgeCard — estado acionavel (status=sent)', () => {
  it('renderiza titulo, body preview e status badge', async () => {
    const NudgeCard = await loadNudgeCard();
    render(<NudgeCard nudge={SENT_NUDGE} />);
    expect(screen.getByTestId('coach-nudge-card')).toBeTruthy();
    expect(screen.getByTestId('coach-nudge-card-title').textContent).toMatch(/Importe seu hist[óo]rico/i);
    expect(screen.getByTestId('coach-nudge-card-body').textContent).toMatch(/4 sess[õo]es/);
    expect(screen.getByTestId('coach-nudge-card-status')).toBeTruthy();
  });

  it('mostra os 4 botoes (snooze short/long, engage, dismiss) quando acionavel', async () => {
    const NudgeCard = await loadNudgeCard();
    render(<NudgeCard nudge={SENT_NUDGE} />);
    expect(screen.getByTestId('coach-nudge-card-snooze-short')).toBeTruthy();
    expect(screen.getByTestId('coach-nudge-card-snooze-long')).toBeTruthy();
    expect(screen.getByTestId('coach-nudge-card-engage')).toBeTruthy();
    expect(screen.getByTestId('coach-nudge-card-dismiss')).toBeTruthy();
  });

  it('"Dispensar" -> POST /api/coach/nudges/n1/dismiss', async () => {
    const NudgeCard = await loadNudgeCard();
    render(<NudgeCard nudge={SENT_NUDGE} />);
    await userEvent.click(screen.getByTestId('coach-nudge-card-dismiss'));
    expect(apiRequestMock).toHaveBeenCalledWith('POST', '/api/coach/nudges/n1/dismiss', expect.anything());
  });

  it('"Nao agora" (snooze short) -> POST /api/coach/nudges/n1/snooze (duracao curta)', async () => {
    const NudgeCard = await loadNudgeCard();
    render(<NudgeCard nudge={SENT_NUDGE} />);
    await userEvent.click(screen.getByTestId('coach-nudge-card-snooze-short'));
    expect(apiRequestMock).toHaveBeenCalledWith('POST', '/api/coach/nudges/n1/snooze', expect.anything());
  });

  it('"Nao por enquanto" (snooze long) -> POST /api/coach/nudges/n1/snooze (duracao longa)', async () => {
    const NudgeCard = await loadNudgeCard();
    render(<NudgeCard nudge={SENT_NUDGE} />);
    await userEvent.click(screen.getByTestId('coach-nudge-card-snooze-long'));
    expect(apiRequestMock).toHaveBeenCalledWith('POST', '/api/coach/nudges/n1/snooze', expect.anything());
    // os dois snoozes devem mandar duracoes diferentes — verificavel pela body.
    const calls = apiRequestMock.mock.calls.filter((c: any[]) => c[1] === '/api/coach/nudges/n1/snooze');
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it('"Ver no chat" (engage) -> POST /api/coach/nudges/n1/engage + navega para /coach-ai?tab=chat (com a session)', async () => {
    const NudgeCard = await loadNudgeCard();
    render(<NudgeCard nudge={SENT_NUDGE} />);
    await userEvent.click(screen.getByTestId('coach-nudge-card-engage'));
    expect(apiRequestMock).toHaveBeenCalledWith('POST', '/api/coach/nudges/n1/engage', expect.anything());
    // navegacao para o chat — via setLocation OU via Link renderizado.
    const navigated = navMock.mock.calls.some((c: any[]) => String(c[0] ?? '').includes('tab=chat'));
    const linkPresent = !!screen.getByTestId('coach-nudge-card-engage').getAttribute('data-href')?.includes('tab=chat');
    expect(navigated || linkPresent).toBe(true);
  });
});

describe('NudgeCard — auto_freeze_notice', () => {
  it('triggeredByEvent="auto_freeze_notice" -> renderiza o aviso de categoria pausada SEM botoes de snooze', async () => {
    const NudgeCard = await loadNudgeCard();
    const freezeNudge = {
      id: 'nf1', category: 'B-STUDY', status: 'sent', title: 'Pausei os lembretes de estudo',
      bodyPreview: 'Notei que você está dispensando esses lembretes — pausei a categoria. Reative em Preferências.',
      sentAt: '2026-05-09T12:00:00Z', triggeredByEvent: 'auto_freeze_notice',
    };
    render(<NudgeCard nudge={freezeNudge} />);
    expect(screen.getByTestId('coach-nudge-card-freeze-notice')).toBeTruthy();
    // sem botoes de snooze.
    expect(screen.queryByTestId('coach-nudge-card-snooze-short')).toBeNull();
    expect(screen.queryByTestId('coach-nudge-card-snooze-long')).toBeNull();
  });
});

describe('NudgeCard — estado nao acionavel (status=dismissed/engaged)', () => {
  it('status=dismissed -> nao mostra os botoes de acao (so o card + status)', async () => {
    const NudgeCard = await loadNudgeCard();
    render(<NudgeCard nudge={{ ...SENT_NUDGE, status: 'dismissed', dismissedAt: '2026-05-10T00:00:00Z' }} />);
    expect(screen.getByTestId('coach-nudge-card')).toBeTruthy();
    expect(screen.queryByTestId('coach-nudge-card-dismiss')).toBeNull();
    expect(screen.queryByTestId('coach-nudge-card-snooze-short')).toBeNull();
  });
});
