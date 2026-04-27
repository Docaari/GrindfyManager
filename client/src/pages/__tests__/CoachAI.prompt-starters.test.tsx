import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Sprint Coach-1 Frontend UX / RF-12 — Prompt starters
//
// Empty state mostra 3-4 chips clicaveis com perguntas iniciais por coach.
// Click no chip preenche o textarea e da foco.
// Apos 1a mensagem, chips nao aparecem mais.
//
// Spec: Docs/specs/coach-sprint-1-frontend-ux.md (RF-12)
//
// MEDIUM-12 fix: testes validam chips reais (role="button" + name) com a copy
// EXATA da spec (nao apenas palavras-chave em paragrafos descritivos).
// =============================================================================

const fetchMock = vi.fn();

function setupEmptyState() {
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).includes('/api/coach/limits')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          tier: 'premium',
          limits: {
            mental: { dailyLimit: 50, used: 0, remaining: 50, resetAt: '2026-04-25T03:00:00Z' },
            tournament: {
              dailyLimit: 50,
              used: 0,
              remaining: 50,
              resetAt: '2026-04-25T03:00:00Z',
            },
            technical: { dailyLimit: 50, used: 0, remaining: 50, resetAt: '2026-04-25T03:00:00Z' },
          },
          coachAccess: { mental: true, tournament: true, technical: true },
        }),
        text: async () => 'ok',
      } as any;
    }
    if (String(url).includes('/api/coach/sessions') && !String(url).includes('/messages')) {
      return {
        ok: true,
        status: 200,
        json: async () => [],
        text: async () => '[]',
      } as any;
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' } as any;
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as any;
});

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
  toast: vi.fn(),
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/coach', vi.fn()],
}));

import CoachAI from '../CoachAI';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe('CoachAI — Prompt starters (RF-12)', () => {
  describe('Mental coach starters', () => {
    it('empty state mostra 4 chips Mental especificos da spec', async () => {
      setupEmptyState();
      render(wrap(<CoachAI />));

      // Spec RF-12 Mental copies (exatos):
      const expectedStarters = [
        /Estou tiltado depois de um bad beat\. Como recupero o foco\?/i,
        /Como manter disciplina quando a sessao esta longa\?/i,
        /Meu warm-up ideal antes de uma sessao de alta stakes/i,
        /Como lidar com downswing prolongado sem afetar o jogo\?/i,
      ];

      for (const re of expectedStarters) {
        await waitFor(() => {
          expect(screen.getByRole('button', { name: re })).toBeTruthy();
        });
      }
    });

    it('click em chip Mental preenche textarea e da foco', async () => {
      setupEmptyState();
      const user = userEvent.setup();
      render(wrap(<CoachAI />));

      const chip = await waitFor(() =>
        screen.getByRole('button', {
          name: /Estou tiltado depois de um bad beat\. Como recupero o foco\?/i,
        }),
      );
      const chipText = chip.textContent?.trim() || '';

      await user.click(chip);

      const ta = document.querySelector('textarea') as HTMLTextAreaElement;
      expect(ta).toBeTruthy();
      expect(ta.value.trim()).toBe(chipText);

      await waitFor(() => {
        expect(document.activeElement).toBe(ta);
      });
    });
  });

  describe('Tournament coach starters', () => {
    it('apos trocar para tab Torneios, mostra 4 chips de Tournament especificos da spec', async () => {
      setupEmptyState();
      const user = userEvent.setup();
      render(wrap(<CoachAI />));

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /Torneios|Tournament/i })).toBeTruthy();
      });

      const tournamentTab = screen.getByRole('tab', { name: /Torneios|Tournament/i });
      await user.click(tournamentTab);

      // Spec RF-12 Tournament copies (exatos):
      const expectedStarters = [
        /Analise minha grade desta semana e sugira ajustes/i,
        /Quais torneios ofertam melhor ROI para minha banca atual\?/i,
        /Estou pagando muito rake\? Como identificar\?/i,
        /Vale entrar neste torneio com field de X jogadores\?/i,
      ];

      for (const re of expectedStarters) {
        await waitFor(() => {
          expect(screen.getByRole('button', { name: re })).toBeTruthy();
        });
      }
    });

    it('click em chip Tournament preenche textarea', async () => {
      setupEmptyState();
      const user = userEvent.setup();
      render(wrap(<CoachAI />));

      const tournamentTab = await waitFor(() =>
        screen.getByRole('tab', { name: /Torneios|Tournament/i }),
      );
      await user.click(tournamentTab);

      const chip = await waitFor(() =>
        screen.getByRole('button', {
          name: /Analise minha grade desta semana e sugira ajustes/i,
        }),
      );
      const chipText = chip.textContent?.trim() || '';

      await user.click(chip);

      const ta = document.querySelector('textarea') as HTMLTextAreaElement;
      expect(ta).toBeTruthy();
      expect(ta.value.trim()).toBe(chipText);
    });
  });

  describe('Technical coach starters', () => {
    it('apos trocar para tab Tecnico, mostra 4 chips de Technical especificos da spec', async () => {
      setupEmptyState();
      const user = userEvent.setup();
      render(wrap(<CoachAI />));

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /Tecnico|Technical/i })).toBeTruthy();
      });

      const technicalTab = screen.getByRole('tab', { name: /Tecnico|Technical/i });
      await user.click(technicalTab);

      // Spec RF-12 Technical copies (exatos):
      const expectedStarters = [
        /Como jogar 3bet pot fora de posicao em stack medio\?/i,
        /ICM na bolha — como ajustar ranges pre-flop\?/i,
        /Revise minha mao: AK em 4bet pot/i,
        /Qual o range otimo para open de BTN em HU final\?/i,
      ];

      for (const re of expectedStarters) {
        await waitFor(() => {
          expect(screen.getByRole('button', { name: re })).toBeTruthy();
        });
      }
    });

    it('click em chip Technical preenche textarea', async () => {
      setupEmptyState();
      const user = userEvent.setup();
      render(wrap(<CoachAI />));

      const technicalTab = await waitFor(() =>
        screen.getByRole('tab', { name: /Tecnico|Technical/i }),
      );
      await user.click(technicalTab);

      const chip = await waitFor(() =>
        screen.getByRole('button', {
          name: /Como jogar 3bet pot fora de posicao em stack medio\?/i,
        }),
      );
      const chipText = chip.textContent?.trim() || '';

      await user.click(chip);

      const ta = document.querySelector('textarea') as HTMLTextAreaElement;
      expect(ta).toBeTruthy();
      expect(ta.value.trim()).toBe(chipText);
    });
  });

  describe('Comportamento geral', () => {
    it('sessao com mensagens: chips NAO aparecem', async () => {
      const sessions = [
        {
          id: 'sess-1',
          coachType: 'mental',
          title: 'Teste',
          status: 'active',
          messageCount: 2,
          tokenCount: 80,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      const messages = {
        messages: [
          { id: 'm1', role: 'user', content: 'Oi', tokenCount: 10, createdAt: new Date().toISOString() },
          { id: 'm2', role: 'assistant', content: 'Ola', tokenCount: 10, createdAt: new Date().toISOString() },
        ],
        total: 2,
        limit: 100,
        offset: 0,
      };

      fetchMock.mockImplementation(async (url: string) => {
        if (String(url).includes('/api/coach/limits')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              tier: 'premium',
              limits: {
                mental: { dailyLimit: 50, used: 2, remaining: 48, resetAt: '2026-04-25T03:00:00Z' },
                tournament: { dailyLimit: 50, used: 0, remaining: 50, resetAt: '2026-04-25T03:00:00Z' },
                technical: { dailyLimit: 50, used: 0, remaining: 50, resetAt: '2026-04-25T03:00:00Z' },
              },
              coachAccess: { mental: true, tournament: true, technical: true },
            }),
            text: async () => 'ok',
          } as any;
        }
        if (String(url).includes('/api/coach/sessions') && !String(url).includes('/messages')) {
          return { ok: true, status: 200, json: async () => sessions, text: async () => 'ok' } as any;
        }
        if (String(url).includes('/messages')) {
          return { ok: true, status: 200, json: async () => messages, text: async () => 'ok' } as any;
        }
        return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' } as any;
      });

      const user = userEvent.setup();
      render(wrap(<CoachAI />));

      await waitFor(() => {
        expect(screen.queryByText('Teste')).toBeTruthy();
      });

      await user.click(screen.getByText('Teste'));

      await waitFor(() => {
        const body = document.body.textContent || '';
        expect(body).toMatch(/Ola|Oi/);
      });

      // Chips NAO devem estar presentes — usamos a copy exata da spec.
      const chip = screen.queryByRole('button', {
        name: /Estou tiltado depois de um bad beat\. Como recupero o foco\?/i,
      });
      expect(chip).toBeNull();
    });
  });
});
