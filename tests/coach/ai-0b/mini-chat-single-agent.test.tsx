/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint AI-0B / RF-07 item 5 — MiniChat.tsx alinhado ao agente unico:
 *   - titulo/identidade "Grindfy AI" (nao "Coach Mental/etc")
 *   - chips de lente/foco em vez de 3 abas de coach
 *   - empty state e placeholder falam do "Grindfy AI"
 *   - page context da rota onde esta montado (via useCoachPageContext) entra no
 *     body do POST quando a rota for instrumentada; rota nao instrumentada -> sem
 *     pageContext.
 *
 * Spec: Docs/specs/sprint-ai-0b.md §RF-07; ADR-150 §2.5.
 *
 * data-testid esperados:
 *   - mini-chat-fab            (botao flutuante — pode ja existir)
 *   - mini-chat-title          (texto "Grindfy AI" quando aberto)
 *   - mini-chat-lens-mental / -tournament / -technical   (chips de lente)
 *
 * Lessons: #13 (apiRequest), #14/#26 (await import), #27 (Radix — userEvent.click).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

const wouterState = { location: '/dashboard' };
vi.mock('wouter', () => ({
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
  useLocation: () => [wouterState.location, vi.fn()] as const,
}));

vi.mock('@/lib/tracker', () => ({ emit: vi.fn() }));

// useCoachChat — captura coachType + sendMessage; nao faz fetch real.
const coachChatCalls: any[] = [];
vi.mock('@/hooks/useCoachChat', () => ({
  useCoachChat: (coachType: string) => {
    coachChatCalls.push(coachType);
    return { messages: [], isStreaming: false, streamedText: '', streamError: null, sendMessage: vi.fn() };
  },
}));

// useCoachPageContext (novo) — devolve { route, ...fields } ou undefined.
vi.mock('@/hooks/useCoachPageContext', () => ({
  useCoachPageContext: (route: string, fields?: Record<string, any>) => {
    const INSTRUMENTED = ['dashboard', 'grade-planner', 'grind-live', 'coach-ai', 'bankroll', 'estudos', 'stats', 'biblioteca', 'upload', 'cooldown-log'];
    if (!route || !INSTRUMENTED.includes(route)) return undefined;
    const out: any = { route };
    for (const [k, v] of Object.entries(fields ?? {})) if (v !== undefined) out[k] = v;
    return out;
  },
}));

async function loadMiniChat() {
  // @ts-expect-error - red phase
  const mod: any = await import('@/components/MiniChat');
  return (mod.default ?? mod.MiniChat) as React.ComponentType<any>;
}

beforeEach(() => {
  coachChatCalls.length = 0;
  wouterState.location = '/dashboard';
  if (typeof localStorage !== 'undefined') localStorage.clear();
});

describe('MiniChat — agente unico (RF-07)', () => {
  it('quando aberto, mostra "Grindfy AI" como identidade (nao "Coach Mental/etc")', async () => {
    const MiniChat = await loadMiniChat();
    const user = userEvent.setup();
    render(<MiniChat />);
    // abre o FAB
    const fab = await waitFor(() => screen.getByTestId('mini-chat-fab'));
    await user.click(fab);
    await waitFor(() => {
      const title = screen.getByTestId('mini-chat-title');
      expect(title.textContent || '').toMatch(/Grindfy\s*AI/i);
      expect(title.textContent || '').not.toMatch(/Coach\s+(Mental|T[eé]cnico|de\s+Torneios)/i);
    });
  });

  it('mostra chips de lente (Mental/Selecao/Tecnico) — NAO 3 abas de coach', async () => {
    const MiniChat = await loadMiniChat();
    const user = userEvent.setup();
    render(<MiniChat />);
    const fab = await waitFor(() => screen.getByTestId('mini-chat-fab'));
    await user.click(fab);
    await waitFor(() => screen.getByTestId('mini-chat-lens-mental'));
    expect(screen.getByTestId('mini-chat-lens-mental')).toBeTruthy();
    expect(screen.getByTestId('mini-chat-lens-tournament')).toBeTruthy();
    expect(screen.getByTestId('mini-chat-lens-technical')).toBeTruthy();
    // Nao deve haver role=tab com nome de "coach" Mental/Torneios.
    expect(screen.queryByRole('tab', { name: /^Mental$/i })).toBeNull();
  });

  it('clicar no chip Tecnico -> coachType passado ao useCoachChat vira "technical"', async () => {
    const MiniChat = await loadMiniChat();
    const user = userEvent.setup();
    render(<MiniChat />);
    const fab = await waitFor(() => screen.getByTestId('mini-chat-fab'));
    await user.click(fab);
    await waitFor(() => screen.getByTestId('mini-chat-lens-technical'));
    coachChatCalls.length = 0;
    await user.click(screen.getByTestId('mini-chat-lens-technical'));
    await waitFor(() => expect(coachChatCalls).toContain('technical'));
  });
});
