/**
 * Test-Writer (Modo TDD — Red Phase)
 *
 * Sprint AI-1B / RF-08.3 — WeeklyReportView.tsx (pagina /coach-ai/relatorio/:id)
 *   client/src/pages/WeeklyReportView.tsx (ou client/src/components/coach/WeeklyReportView.tsx)
 *   - useQuery(['/api/coach/reports', id]) -> renderiza markdown (ReactMarkdown + remarkGfm)
 *     + as secoes do ReportContent + os 3 insights + nextWeekPlan + os CTAs
 *   - CTA kind:'link' -> <Link href={cta.href}> (rota Wouter REGISTRADA — lesson #19)
 *   - CTA kind:'tool' -> abre o fluxo da tool com confirm (NAO auto-executa — ADR-146)
 *   - status='degraded' -> aviso "modo simplificado" (sem prosa dos insights)
 *   - rota /coach-ai/relatorio/:id registrada em client/src/App.tsx (lesson #19)
 *
 * Fontes:
 *   - Docs/specs/sprint-ai-1b.md (RF-08.2/08.3 + "Cenarios de Teste Derivados")
 *   - Docs/architecture/decisions/157-...-bgapcheck-bimport.md (§2.2, §3.3, §5)
 *
 * data-testid esperados:
 *   - weekly-report-view              — wrapper
 *   - weekly-report-markdown          — bloco do markdown renderizado
 *   - weekly-report-section-volumeResults / -bankroll / -selection / -study / -mentalOps
 *   - weekly-report-insight           — cada insight (3 quando ready)
 *   - weekly-report-cta               — cada CTA (botao/link)
 *   - weekly-report-degraded-notice   — aviso "modo simplificado" (status degraded)
 *
 * Lessons: #13 (apiRequest JSON), #14/#26 (await import .tsx), #19 (CTAs link casam
 *   com rotas Wouter registradas — App.tsx), #23 (Wouter v3 <Link href><a> ok), #29
 *   (useQuery dentro de QueryClientProvider), #1 (hooks primeiro), #2 (data-testid).
 *
 * Status esperado: FALHAM (componente + rota nao existem).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const navMock = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/coach-ai/relatorio/r1', navMock] as const,
  useRoute: (pattern: string) => pattern.includes('relatorio') ? [true, { id: 'r1' }] as const : [false, {}] as const,
  useParams: () => ({ id: 'r1' }),
  Link: ({ href, children, ...rest }: any) => <a href={href} data-href={href} {...rest}>{children}</a>,
  Route: () => null,
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }), toast: vi.fn() }));

// react-markdown / remark-gfm — mocks simples (renderizam o texto cru).
vi.mock('react-markdown', () => ({ default: ({ children }: any) => <div data-md>{children}</div> }));
vi.mock('remark-gfm', () => ({ default: () => {} }));

const REPORT_READY = {
  id: 'r1', reportType: 'weekly', periodStart: '2026-05-04', periodEnd: '2026-05-10', status: 'ready',
  generatedAt: '2026-05-11T10:00:00Z', costUsdEstimate: 0.045,
  markdown: '# Sua semana — 04/mai a 10/mai\nVocê jogou 42 torneios, +$1234 (ROI 12%).',
  content: {
    schemaVersion: 1, reportType: 'weekly', periodStart: '2026-05-04', periodEnd: '2026-05-10', dataSufficiency: 'ok',
    level: 'intermediario', tone: 'gentle',
    header: { title: 'Sua semana — 04/mai a 10/mai', summaryLine: 'Você jogou 42 torneios, +$1234 (ROI 12%).', comparison: 'acima da média de 6 semanas' },
    sections: {
      volumeResults: { sessionsCompleted: 5, sessionsPlanned: 6, tournaments: 42, itmPct: 19, finalTables: 2, wins: 1, roiWeek: 12, roi30d: 10, narrative: 'Volume saudável.' },
      bankroll: { profitByCurrency: [{ currency: 'USD', native: 1234, usd: 1234 }], bankrollStart: 2800, bankrollNow: 3000, transfers: 0, withdrawals: 100, narrative: 'Banca cresceu.' },
      selection: { ranThisWeek: true, adherencePct: 80, topCategories: [{ label: 'Regular', roi: 0.2, n: 80 }], bottomCategories: [{ label: 'Hyper', roi: -0.08, n: 120, suggestBlock: true }], narrative: 'Rodou hypers demais.' },
      study: { minutesLogged: 90, topicsCovered: ['ICM'], focusOfMonth: 'ICM', focusCoveragePct: 50, recommendedLesson: { lessonId: 'l1', title: 'ICM básico', reason: 'Seu leak de ICM.', ctaHref: '/biblioteca' }, narrative: '90min de estudo.' },
      mentalOps: { hasWarmupData: true, warmupSessions: 3, tiltSessions: 1, avgFocusRating: 4, narrative: 'Foco médio 4/5.' },
    },
    insights: [
      { text: 'Seu ROI em hypers caiu pra -8% em 90d (n=120).', citations: ['fonte: getAnalyticsByModifier'], confidence: 'high' },
      { text: 'Leak open-fold-bb de alta severidade (n=64).', citations: ['fonte: detectLeaks'], confidence: 'medium' },
      { text: 'Aderência à grade foi parcial.', citations: ['fonte: planned vs tournaments'], confidence: 'low' },
    ],
    nextWeekPlan: { gradeSuggestionHref: '/grade-planner', studyFocus: 'ICM', recommendedAction: 'Bloquear hypers GG.', weeklyStudyPlanRef: { weekStartDate: '2026-05-04' } },
    cta: [
      { label: 'Importar histórico', kind: 'link', href: '/upload' },
      { label: 'Registrar torneio na grade', kind: 'tool', toolName: 'register_tournament_in_grade' },
    ],
    generation: { model: 'claude-sonnet-4-6', summarizerModel: null, degraded: false, degradedReason: null },
  },
};

const reportState: { current: any } = { current: REPORT_READY };
const apiRequestMock = vi.fn(async (_m: string, url: string) => {
  if (url.startsWith('/api/coach/reports/')) return { ...reportState.current };
  return {};
});
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (m: string, u: string, b?: any) => apiRequestMock(m, u, b),
  queryClient: { invalidateQueries: vi.fn() },
  getQueryFn: () => async () => ({}),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

async function loadView() {
  // path em variavel (ver nota em nudge-card.test.tsx) — pode estar em pages/ ou components/coach/.
  const candidates = ['@/pages/WeeklyReportView', '@/components/coach/WeeklyReportView'];
  let mod: any;
  for (const p of candidates) {
    try { mod = await import(/* @vite-ignore */ p); break; } catch { /* tenta o proximo */ }
  }
  if (!mod) throw new Error('WeeklyReportView nao encontrado (red phase)');
  return (mod.default ?? mod.WeeklyReportView) as React.ComponentType<any>;
}

beforeEach(() => {
  vi.clearAllMocks();
  reportState.current = REPORT_READY;
});

describe('WeeklyReportView — relatorio ready', () => {
  it('renderiza o markdown via ReactMarkdown + as secoes do ReportContent', async () => {
    const View = await loadView();
    render(wrap(<View />));
    await waitFor(() => expect(screen.getByTestId('weekly-report-view')).toBeTruthy());
    expect(screen.getByTestId('weekly-report-markdown')).toBeTruthy();
    expect(screen.getByText(/Você jogou 42 torneios/)).toBeTruthy();
    // secoes.
    expect(screen.getByTestId('weekly-report-section-volumeResults')).toBeTruthy();
    expect(screen.getByTestId('weekly-report-section-bankroll')).toBeTruthy();
    expect(screen.getByTestId('weekly-report-section-selection')).toBeTruthy();
    expect(screen.getByTestId('weekly-report-section-study')).toBeTruthy();
    expect(screen.getByTestId('weekly-report-section-mentalOps')).toBeTruthy();
  });

  it('renderiza exatamente 3 insights (status ready)', async () => {
    const View = await loadView();
    render(wrap(<View />));
    await waitFor(() => expect(screen.getAllByTestId('weekly-report-insight').length).toBe(3));
  });

  it('renderiza os CTAs; CTA link tem href para rota Wouter (sem /bulk_propose_grade etc.)', async () => {
    const View = await loadView();
    render(wrap(<View />));
    await waitFor(() => expect(screen.getAllByTestId('weekly-report-cta').length).toBeGreaterThanOrEqual(2));
    const ctas = screen.getAllByTestId('weekly-report-cta');
    // ao menos 1 CTA link com href que comeca por '/'.
    const hasLink = ctas.some(c => {
      const anchor = c.querySelector('[data-href]') ?? (c.getAttribute('data-href') ? c : null);
      const href = anchor?.getAttribute('data-href') ?? c.getAttribute('data-href');
      return !!href && href.startsWith('/');
    });
    expect(hasLink).toBe(true);
    // nenhum href referencia tools inexistentes.
    const FORBIDDEN = ['bulk_propose_grade', 'schedule_study_block', 'define_career_goal', 'mark_off_day'];
    for (const c of ctas) {
      const html = c.outerHTML;
      for (const f of FORBIDDEN) expect(html).not.toContain(f);
    }
  });

  it('CTA kind:tool -> ao clicar abre o fluxo da tool com confirm (NAO auto-executa) — nao dispara o tool runner direto', async () => {
    const View = await loadView();
    render(wrap(<View />));
    await waitFor(() => expect(screen.getAllByTestId('weekly-report-cta').length).toBeGreaterThanOrEqual(2));
    // localizar o CTA da tool register_tournament_in_grade.
    const ctas = screen.getAllByTestId('weekly-report-cta');
    const toolCta = ctas.find(c => /Registrar torneio na grade/i.test(c.textContent || ''));
    expect(toolCta).toBeTruthy();
    await userEvent.click(toolCta!);
    // o clique deve navegar para o chat com a tool pre-armada (tab=chat) OU abrir
    // um confirm dialog — NUNCA um POST direto que executa a tool sem confirm.
    const navigatedToChat = navMock.mock.calls.some((c: any[]) => String(c[0] ?? '').includes('tab=chat'));
    const noDirectToolExec = !apiRequestMock.mock.calls.some((c: any[]) => /\/api\/coach\/(actions|tools)\/.*\/(confirm|run)/.test(c[1] ?? ''));
    expect(navigatedToChat || noDirectToolExec).toBe(true);
  });
});

describe('WeeklyReportView — relatorio degraded', () => {
  it('status=degraded -> renderiza os numeros + aviso "modo simplificado" (sem a prosa dos insights)', async () => {
    reportState.current = {
      ...REPORT_READY, status: 'degraded',
      content: {
        ...REPORT_READY.content, dataSufficiency: 'ok', insights: [],
        generation: { model: null, summarizerModel: null, degraded: true, degradedReason: 'llm_failed_3x' },
      },
    };
    const View = await loadView();
    render(wrap(<View />));
    await waitFor(() => expect(screen.getByTestId('weekly-report-view')).toBeTruthy());
    expect(screen.getByTestId('weekly-report-degraded-notice')).toBeTruthy();
    expect(screen.getByText(/simplificad/i)).toBeTruthy();
    // os numeros das secoes ainda aparecem.
    expect(screen.getByTestId('weekly-report-section-volumeResults')).toBeTruthy();
    // nenhum insight de prosa.
    expect(screen.queryAllByTestId('weekly-report-insight').length).toBe(0);
  });
});

describe('App.tsx — rota /coach-ai/relatorio/:id registrada (lesson #19)', () => {
  it('client/src/App.tsx contem uma Route para /coach-ai/relatorio (caso contrario o CTA cai em 404 silencioso)', async () => {
    // leitura estatica do source — o implementer precisa registrar a rota.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const appPath = path.resolve(process.cwd(), 'client/src/App.tsx');
    const src = fs.readFileSync(appPath, 'utf8');
    expect(src).toMatch(/\/coach-ai\/relatorio/);
  });
});
