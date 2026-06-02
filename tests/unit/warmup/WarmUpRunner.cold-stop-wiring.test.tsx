/**
 * Test-Writer (Modo TDD — Red/Fix Phase) — Sprint Fase D #5 (Stop-loss cold-commit)
 *
 * Spec: Docs/specs/sprint-fase-d-stop-loss-2026-06-02.md (RF-01)
 * ADR:  Docs/architecture/decisions/235-fase-d-stop-loss-cold-commit.md (D-2, D-3, D-6)
 * Review: HIGH-1 — o caminho de captura do cold-commit está MORTO. A UI existe em
 *         IntentionBlock (props abiUsd?/onCommitColdStop? já presentes) MAS o container
 *         WarmUpRunner renderiza `<IntentionBlock onSubmit={...} />` SEM passar abiUsd
 *         nem onCommitColdStop (WarmUpRunner.tsx:259). O hook useWarmupRitual também não
 *         carrega coldStopCommit no payload do POST final.
 *
 * Estes testes EXERCITAM O FIO REAL: renderizam o CONTAINER `WarmUpRunner` (NÃO o
 * IntentionBlock isolado — lesson #19/#20), navegam até o bloco 4 (Intenção) e asseram
 * que o wiring existe. Como o fio está morto, ficam RED até a green phase wirar:
 *   1. WarmUpRunner resolve abiUsd (USD) e PASSA ao IntentionBlock -> sugestão BI aparece.
 *   2. Comitar dispara PUT /api/user-settings/stops com { stopLossUsd: <USD final> }.
 *   3. Ao finalizar o ritual (version:'full'), o POST /api/warmup-rituals inclui
 *      sessionIntention.coldStopCommit { committedUsd, basis, committedAt(ISO), ... }.
 *   4. Sem comitar -> POST sem coldStopCommit (back-compat).
 *
 * --- CONTRATO ESCOLHIDO PELO TEST-WRITER (documentado p/ implementer) ----------
 * O ABI em USD chega ao WarmUpRunner por uma QUERY (apiRequest GET). A fonte natural
 * (ADR D-2 "FX resolvido no caller/server" + D-5 "reusa GET /api/user-settings/stops")
 * é o GET /api/user-settings/stops, que JÁ é server-resolvido-a-USD (currentDayDeltaUsd)
 * — bastando expor `abiUsd` na resposta. Os testes NÃO amarram a URL exata: o mock de
 * apiRequest responde a QUALQUER GET com a shape { abiUsd, stopLossUsd, currentDayDeltaUsd },
 * então o implementer tem liberdade sobre o endpoint desde que o abiUsd resolvido chegue
 * ao IntentionBlock (sugestão BI visível) e o commit dispare o PUT.
 * O valor comitado (USD) é gravado IMEDIATAMENTE via PUT (RF-01) e o sub-objeto
 * coldStopCommit é montado no client e incluído no sessionIntention do POST final.
 * -------------------------------------------------------------------------------
 *
 * Lessons: #3 mock shape real (apiRequest retorna JSON parseado #13; PUT/POST bodies reais);
 *          #19/#20 renderiza o CONTAINER real (pega o wiring morto); #2 data-testid estável.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// apiRequest retorna JSON parseado direto (lesson #13). Diferenciamos por (method, url).
vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { userPlatformId: 'USER-0001' } }),
}));

import { WarmUpRunner } from '@/components/warmup/WarmUpRunner';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

/**
 * Configura o mock de apiRequest (lesson #13 — retorna JSON parseado direto):
 *   - GET /api/user-settings (EXATO) -> shape de settings que destrava a navegação:
 *       heurísticas (bloco 3) + setup items (bloco 1). NÃO carrega ABI aqui.
 *   - GET (qualquer OUTRA url)        -> stops/ABI shape { abiUsd, stopLossUsd, currentDayDeltaUsd }.
 *       (não amarra o endpoint exato do ABI — o implementer pode usar
 *        /api/user-settings/stops ou outro; o que importa é o abiUsd resolvido chegar.)
 *   - PUT /api/user-settings/stops    -> { ok: true } (cold-commit, RF-01).
 *   - PUT (outras)                    -> { ok: true } (save heurísticas/setup items).
 *   - POST /api/warmup-rituals        -> { id: 'WR-1', version: 'full' }.
 * Retorna o mock p/ inspeção das calls.
 */
async function setupApiRequest(opts: { abiUsd: number | null }) {
  const { apiRequest } = await import('@/lib/queryClient');
  (apiRequest as any).mockImplementation(async (method: string, url: string) => {
    const u = String(url);
    if (method === 'GET') {
      // /api/user-settings (sem sub-path) alimenta useSetupItems + useWeeklyHeuristics.
      if (/\/api\/user-settings(\?|$)/.test(u)) {
        return {
          weeklyHeuristics: ['h1', 'h2', 'h3'],
          warmupSetupItems: null, // usa DEFAULT_SETUP_ITEMS client-side
          drillUrl: null,
        };
      }
      // Qualquer outro GET = fonte do ABI (em USD) + stops.
      return {
        abiUsd: opts.abiUsd,
        stopLossUsd: null,
        currentDayDeltaUsd: 0,
        stopLockUntil: null,
        stopLockDurationHours: 12,
      };
    }
    if (method === 'POST') return { id: 'WR-1', version: 'full' };
    // PUT (cold-commit stops + saves diversos).
    return { ok: true };
  });
  return apiRequest as any;
}

/** Navega Bloco 1 (Setup físico): marca 3 itens + Próximo. */
function advanceSetup() {
  fireEvent.click(screen.getByTestId('setup-item-0'));
  fireEvent.click(screen.getByTestId('setup-item-1'));
  fireEvent.click(screen.getByTestId('setup-item-2'));
  fireEvent.click(screen.getByTestId('setup-advance'));
}

/** Navega Bloco 2 (Respiração + check): score default 6 passa o gate. */
function advanceEmotionalCheck() {
  fireEvent.click(screen.getByTestId('emotional-check-submit'));
}

/** Navega Bloco 3 (Foco da semana): botão avançar. */
function advanceWeeklyFocus() {
  fireEvent.click(screen.getByTestId('weekly-focus-advance'));
}

/** Conduz o runner do Bloco 1 até o Bloco 4 (Intenção). */
async function gotoIntentionBlock() {
  advanceSetup();
  await waitFor(() => expect(screen.getByTestId('emotional-check-submit')).toBeTruthy());
  advanceEmotionalCheck();
  await waitFor(() => expect(screen.getByTestId('weekly-focus-advance')).toBeTruthy());
  advanceWeeklyFocus();
  await waitFor(() => expect(screen.getByTestId('intention-submit')).toBeTruthy());
}

/** Após o Bloco 4: avança Intenção, conclui Bloco 5 (PFC) -> dispara completeRitual. */
async function finishRitual() {
  fireEvent.click(screen.getByTestId('intention-submit'));
  await waitFor(() => expect(screen.getByTestId('pfc-drill-advance')).toBeTruthy());
  fireEvent.click(screen.getByTestId('pfc-drill-advance'));
}

function findCall(apiRequest: any, method: string, urlMatch: RegExp) {
  return apiRequest.mock.calls.find(
    (args: any[]) => args[0] === method && urlMatch.test(String(args[1])),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1) WarmUpRunner resolve abiUsd e PASSA ao IntentionBlock -> sugestão BI aparece.
// ---------------------------------------------------------------------------
describe('WarmUpRunner cold-stop wiring — ABI -> IntentionBlock (HIGH-1)', () => {
  it('com abiUsd resolvido (50) a sugestão BI (cold-stop-suggest-bi) aparece no bloco 4', async () => {
    await setupApiRequest({ abiUsd: 50 });
    render(withClient(<WarmUpRunner onClose={() => {}} onComplete={() => {}} />));

    await gotoIntentionBlock();

    // Wiring morto hoje: WarmUpRunner renderiza <IntentionBlock onSubmit/> sem abiUsd,
    // então a sugestão fica escondida (hasAbi=false). RED até o fio existir.
    await waitFor(() => {
      expect(screen.getByTestId('cold-stop-suggest-bi')).toBeTruthy();
    });
    // O campo USD e o botão de comitar também devem estar presentes no container.
    expect(screen.getByTestId('cold-stop-input')).toBeTruthy();
    expect(screen.getByTestId('cold-stop-commit')).toBeTruthy();
  });

  it('ABI ausente (null) -> degrada: esconde sugestão BI mas mantém campo USD livre', async () => {
    await setupApiRequest({ abiUsd: null });
    render(withClient(<WarmUpRunner onClose={() => {}} onComplete={() => {}} />));

    await gotoIntentionBlock();

    // Degrade gracioso (DEC-4): sem ABI, sem sugestão; campo USD continua disponível.
    expect(screen.queryByTestId('cold-stop-suggest-bi')).toBeNull();
    expect(screen.getByTestId('cold-stop-input')).toBeTruthy();
    expect(screen.getByTestId('cold-stop-commit')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 2) Comitar dispara PUT /api/user-settings/stops com o USD final.
// ---------------------------------------------------------------------------
describe('WarmUpRunner cold-stop wiring — commit dispara PUT (RF-01)', () => {
  it('clicar "Comitar stop a frio" chama PUT /api/user-settings/stops com stopLossUsd=150 (3 BI × $50)', async () => {
    const apiRequest = await setupApiRequest({ abiUsd: 50 });
    render(withClient(<WarmUpRunner onClose={() => {}} onComplete={() => {}} />));

    await gotoIntentionBlock();
    await waitFor(() => expect(screen.getByTestId('cold-stop-commit')).toBeTruthy());

    fireEvent.click(screen.getByTestId('cold-stop-commit'));

    await waitFor(() => {
      const putCall = findCall(apiRequest, 'PUT', /\/api\/user-settings\/stops/);
      expect(putCall).toBeTruthy();
      // body é o 3º arg: { stopLossUsd: 150 } (3 BI default × abiUsd 50).
      expect(putCall![2]?.stopLossUsd).toBe(150);
    });
  });
});

// ---------------------------------------------------------------------------
// 3) Ao finalizar (version:'full'), o POST inclui sessionIntention.coldStopCommit.
// ---------------------------------------------------------------------------
describe('WarmUpRunner cold-stop wiring — POST final carrega coldStopCommit (D-3)', () => {
  it('comitar + finalizar -> POST /api/warmup-rituals com sessionIntention.coldStopCommit', async () => {
    const apiRequest = await setupApiRequest({ abiUsd: 50 });
    render(withClient(<WarmUpRunner onClose={() => {}} onComplete={() => {}} />));

    await gotoIntentionBlock();
    await waitFor(() => expect(screen.getByTestId('cold-stop-commit')).toBeTruthy());

    // Comita o stop a frio (basis bi, 3 BI × $50 = 150).
    fireEvent.click(screen.getByTestId('cold-stop-commit'));
    await waitFor(() => {
      expect(findCall(apiRequest, 'PUT', /\/api\/user-settings\/stops/)).toBeTruthy();
    });

    // Finaliza o ritual.
    await finishRitual();

    await waitFor(() => {
      const postCall = findCall(apiRequest, 'POST', /\/api\/warmup-rituals/);
      expect(postCall).toBeTruthy();
      const body = postCall![2];
      expect(body?.version).toBe('full');
      const commit = body?.sessionIntention?.coldStopCommit;
      expect(commit).toBeTruthy();
      expect(commit.committedUsd).toBe(150);
      expect(commit.basis).toBe('bi');
      // committedAt é ISO timestamp.
      expect(typeof commit.committedAt).toBe('string');
      expect(Number.isNaN(Date.parse(commit.committedAt))).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// 4) Sem comitar -> POST sem coldStopCommit (back-compat, não quebra).
// ---------------------------------------------------------------------------
describe('WarmUpRunner cold-stop wiring — sem commit não injeta coldStopCommit (back-compat)', () => {
  it('finalizar SEM comitar -> POST sem sessionIntention.coldStopCommit', async () => {
    const apiRequest = await setupApiRequest({ abiUsd: 50 });
    render(withClient(<WarmUpRunner onClose={() => {}} onComplete={() => {}} />));

    await gotoIntentionBlock();
    // NÃO comita o stop a frio.
    await finishRitual();

    await waitFor(() => {
      const postCall = findCall(apiRequest, 'POST', /\/api\/warmup-rituals/);
      expect(postCall).toBeTruthy();
    });
    const postCall = findCall(apiRequest, 'POST', /\/api\/warmup-rituals/);
    const body = postCall![2];
    // Não houve commit -> nenhum PUT de stops.
    expect(findCall(apiRequest, 'PUT', /\/api\/user-settings\/stops/)).toBeFalsy();
    // E o coldStopCommit NÃO foi injetado (back-compat: sessionIntention null ou sem o campo).
    const commit = body?.sessionIntention?.coldStopCommit;
    expect(commit == null).toBe(true);
  });
});
