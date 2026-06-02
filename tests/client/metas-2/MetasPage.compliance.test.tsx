import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// METAS-2 fatia-2 (ADR-234 / RF-05) — MetasPage renderiza campos novos
// (compliancePct, dataSufficiency, adherence.skipped). RED phase, jsdom.
//
// Componente alvo: client/src/pages/metas/MetasPage.tsx (EXISTE da fatia-1;
//   fatia-2 ADICIONA data-testids estaveis — lesson #2):
//     measure-compliance-<id>      : "50%" | "—" (null nunca "0%")
//     measure-datasufficiency-<id> : badge "amostra fraca" quando 'low'
//     measure-adherence-<id>       : "pulado conscientemente" quando skipped
//
// RF-06 da fatia-1 MANTIDA: guard de ausencia de P&L diario / ROI semanal.
// Back-compat (lesson #7): medida sem campos novos (fatia-1) renderiza identica.
//
// Lessons aplicadas:
//   #14/#26/#38 — await import (NUNCA require); path em variavel (RED-safe).
//   #13 — apiRequest mockado retorna JSON parseado direto.
//   #2  — data-testid estaveis (NAO heuristica DOM).
//   #11 — null NUNCA vira "0%" (nao fabrica).
// =============================================================================

const apiRequestMock = vi.fn();

vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueryData: vi.fn() },
}));

const PAGE_PATH = '../../../client/src/pages/metas/MetasPage';
async function loadPage() {
  const mod: any = await import(/* @vite-ignore */ PAGE_PATH);
  return mod.MetasPage ?? mod.default;
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

async function renderPage() {
  const MetasPage = await loadPage();
  return render(
    <QueryClientProvider client={makeClient()}>
      <MetasPage />
    </QueryClientProvider>,
  );
}

function scoreboard(measures: any[], wigs: any[] = []) {
  return { wigs, measures, snapshotsWeek: '2026-06-01' };
}

function mockScoreboard(payload: any) {
  apiRequestMock.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && /\/api\/goals\/scoreboard$/.test(url)) return payload;
    return null;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// RF-05 — compliancePct
// =============================================================================
describe('<MetasPage> — compliancePct (RF-05)', () => {
  it('compliancePct=50 -> measure-compliance-<id> mostra "50%"', async () => {
    mockScoreboard(
      scoreboard([
        {
          id: 'g_1',
          title: 'Sessões por semana',
          sourceMetric: 'sessions_per_week',
          current: 2,
          target: 5,
          expectedNow: 3,
          status: 'behind',
          compliancePct: 50,
          dataSufficiency: 'ok',
          adherence: { planned: 4, actual: 2, skipped: false, shortfall: 2, overachieved: false, note: null },
        },
      ]),
    );
    await renderPage();
    const el = await screen.findByTestId('measure-compliance-g_1');
    expect(el.textContent).toMatch(/50\s*%/);
  });

  it('compliancePct=null -> mostra "—", NUNCA "0%"', async () => {
    mockScoreboard(
      scoreboard([
        {
          id: 'g_roi',
          title: 'ROI',
          sourceMetric: 'roi_pct',
          current: 18.5,
          target: 20,
          expectedNow: 19,
          status: 'on_track',
          compliancePct: null,
          dataSufficiency: 'ok',
          adherence: null,
        },
      ]),
    );
    await renderPage();
    const el = await screen.findByTestId('measure-compliance-g_roi');
    expect(el.textContent).toContain('—');
    expect(el.textContent, 'null NUNCA renderiza como 0% (lesson #11)').not.toMatch(/0\s*%/);
  });
});

// =============================================================================
// RF-05 — dataSufficiency badge
// =============================================================================
describe('<MetasPage> — dataSufficiency (RF-05)', () => {
  it('dataSufficiency=low -> badge measure-datasufficiency-<id> presente', async () => {
    mockScoreboard(
      scoreboard([
        {
          id: 'g_low',
          title: 'Estudo',
          sourceMetric: 'study_minutes_week',
          current: 0,
          target: 300,
          expectedNow: 100,
          status: 'at_risk',
          compliancePct: null,
          dataSufficiency: 'low',
          adherence: null,
        },
      ]),
    );
    await renderPage();
    expect(await screen.findByTestId('measure-datasufficiency-g_low')).toBeInTheDocument();
  });

  it('dataSufficiency=ok -> badge de amostra fraca AUSENTE', async () => {
    mockScoreboard(
      scoreboard([
        {
          id: 'g_ok',
          title: 'Estudo',
          sourceMetric: 'study_minutes_week',
          current: 300,
          target: 300,
          expectedNow: 280,
          status: 'ahead',
          compliancePct: 100,
          dataSufficiency: 'ok',
          adherence: { planned: 300, actual: 300, skipped: false, shortfall: null, overachieved: false, note: null },
        },
      ]),
    );
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('metas-page')).toBeInTheDocument());
    expect(screen.queryByTestId('measure-datasufficiency-g_ok')).toBeNull();
  });
});

// =============================================================================
// RF-05 / DEC-6 — adherence.skipped = "pulado conscientemente" (sem culpa)
// =============================================================================
describe('<MetasPage> — adherence.skipped (DEC-6, A4)', () => {
  it('adherence.skipped=true -> measure-adherence-<id> rotula "pulado conscientemente"', async () => {
    mockScoreboard(
      scoreboard([
        {
          id: 'g_skip',
          title: 'Grind dias',
          sourceMetric: 'grind_days',
          current: 0,
          target: 4,
          expectedNow: 2,
          status: 'on_track',
          compliancePct: null,
          dataSufficiency: 'ok',
          adherence: { planned: 4, actual: 0, skipped: true, shortfall: null, overachieved: false, note: null },
        },
      ]),
    );
    await renderPage();
    const el = await screen.findByTestId('measure-adherence-g_skip');
    expect(el.textContent?.toLowerCase()).toContain('pulado');
  });

  it('adherence.shortfall>0 (sem skip) -> rotula "abaixo do plano", NAO culpabiliza', async () => {
    mockScoreboard(
      scoreboard([
        {
          id: 'g_short',
          title: 'Sessões',
          sourceMetric: 'sessions_per_week',
          current: 2,
          target: 5,
          expectedNow: 3,
          status: 'behind',
          compliancePct: 50,
          dataSufficiency: 'ok',
          adherence: { planned: 4, actual: 2, skipped: false, shortfall: 2, overachieved: false, note: null },
        },
      ]),
    );
    await renderPage();
    const el = await screen.findByTestId('measure-adherence-g_short');
    expect(el.textContent?.toLowerCase()).toContain('abaixo do plano');
  });
});

// =============================================================================
// RF-06 (fatia-1) — guard de ausencia continua passando
// =============================================================================
describe('<MetasPage> — RF-06 esconde P&L curto (guard de AUSENCIA, fatia-1)', () => {
  it('NAO renderiza widget de P&L diario nem ROI semanal', async () => {
    mockScoreboard(
      scoreboard([
        {
          id: 'g_1',
          title: 'Sessões',
          sourceMetric: 'sessions_per_week',
          current: 2,
          target: 5,
          expectedNow: 3,
          status: 'behind',
          compliancePct: 50,
          dataSufficiency: 'ok',
          adherence: { planned: 4, actual: 2, skipped: false, shortfall: 2, overachieved: false, note: null },
        },
      ]),
    );
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('metas-page')).toBeInTheDocument());
    expect(screen.queryByTestId('metas-pl-diario')).toBeNull();
    expect(screen.queryByTestId('daily-pl-widget')).toBeNull();
    expect(screen.queryByTestId('metas-roi-semanal')).toBeNull();
    expect(screen.queryByTestId('weekly-roi-widget')).toBeNull();
  });
});

// =============================================================================
// Back-compat (lesson #7) — medida da fatia-1 (sem campos novos) nao quebra
// =============================================================================
describe('<MetasPage> — back-compat fatia-1 (lesson #7)', () => {
  it('medida SEM campos novos (compliancePct/dataSufficiency/adherence ausentes) renderiza identica', async () => {
    mockScoreboard(
      scoreboard([
        {
          id: 'g_legacy',
          title: 'Meta legada',
          sourceMetric: 'study_minutes_week',
          current: 150,
          target: 300,
          expectedNow: 160,
          status: 'on_track',
          // SEM compliancePct / dataSufficiency / adherence (payload fatia-1)
        },
      ]),
    );
    await renderPage();
    // a linha base da fatia-1 continua presente (current/target/status).
    expect(await screen.findByTestId('measure-row-g_legacy')).toBeInTheDocument();
    expect(screen.getByTestId('measure-current-g_legacy').textContent).toContain('150');
    expect(screen.getByTestId('measure-status-g_legacy').textContent).toContain('on_track');
    // compliancePct ausente -> "—" (nao "0%"); badge de amostra fraca ausente.
    const compliance = screen.queryByTestId('measure-compliance-g_legacy');
    if (compliance) {
      expect(compliance.textContent).toContain('—');
      expect(compliance.textContent).not.toMatch(/0\s*%/);
    }
    expect(screen.queryByTestId('measure-datasufficiency-g_legacy')).toBeNull();
  });

  it('falha do fetch do placar NAO derruba a tela (ErrorBoundary local, lesson #29)', async () => {
    apiRequestMock.mockImplementation(async () => {
      throw new Error('boom scoreboard fetch');
    });
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('metas-page')).toBeInTheDocument());
  });
});
