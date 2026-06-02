import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
//
// Sprint Fase C #4 — RF-04/RF-05: widget "Seu tilt mais frequente" na aba Mental
//
// Spec: Docs/specs/sprint-fase-c-4-tilt-tipado-2026-06-02.md (RF-04/05)
// ADR : Docs/architecture/decisions/232-fase-c-4-tilt-tipado-7-tipos-antidoto.md (D-6)
//
// Componente REAL: client/src/components/profile/MentalAnalyticsTab.tsx
//   - consome GET /api/analytics/tilt-type-distribution via useQuery
//     (queryFn: apiRequest('GET', ...)) — mesmo padrao dos 6 widgets existentes
//   - novo widget testid: mental-tilt-dominant
//
// Comportamento esperado (do diagrama flow.mermaid subgraph "mental"):
//   - typedCount>0 + dominant -> dominante + sharePct + antidoto do dominante
//   - dataSufficiency 'low' -> "amostra pequena, continue registrando"
//   - dominant null / typedCount 0 -> empty state (sem antidoto decorativo, lesson #11)
//
// Status RED: o widget mental-tilt-dominant ainda nao existe.
//
// Lessons: #2 (data-testid), #11 (sem decorativo), #13 (apiRequest retorna JSON
//   parseado direto), #30 (.test.tsx = jsdom).
// =============================================================================

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '@/lib/queryClient';

async function loadTab() {
  const mod = await import('@/components/profile/MentalAnalyticsTab');
  return mod.MentalAnalyticsTab ?? (mod as any).default;
}

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

// apiRequest('GET', url) -> JSON parseado direto (lesson #13). Roteia por endpoint.
function routeApiRequest(byEndpoint: Record<string, any>) {
  (apiRequest as any).mockImplementation((_method: string, url: string) => {
    for (const [needle, payload] of Object.entries(byEndpoint)) {
      if (url.includes(needle)) return Promise.resolve(payload);
    }
    // fallback: shapes vazios coerentes para os outros widgets nao quebrarem
    return Promise.resolve({});
  });
}

const EMPTY_OTHERS = {
  'cooldown-compliance': { total: 0, completed: 0, complianceRate: 0 },
  'starred-hands-distribution': [],
  'cooldown-impact': { withCooldown: { avgRoi: 0 }, withoutCooldown: { avgRoi: 0 }, delta: 0 },
  'top-lessons': [],
  'warmup-compliance': {
    total: 0, completed: 0, complianceRate: 0,
    abortedCount: 0, decisionNotToPlayCount: 0, overrideUsedCount: 0,
  },
  'abgame-distribution': {
    journaledSessions: 0, aGameItemCount: 0, bGameItemCount: 0, cGameEntryCount: 0,
    avgAGamePerSession: 0, avgBGamePerSession: 0,
    abShare: { aGamePct: 0, bGamePct: 0 }, cGameThemes: [],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Existencia do widget
// ---------------------------------------------------------------------------

describe('MentalAnalyticsTab — widget mental-tilt-dominant existe', () => {
  it('renderiza o widget mental-tilt-dominant', async () => {
    const MentalAnalyticsTab = await loadTab();
    routeApiRequest({
      ...EMPTY_OTHERS,
      'tilt-type-distribution': {
        period: '30d', totalAssessments: 0, typedCount: 0,
        dominant: null, distribution: [], dataSufficiency: 'low',
      },
    });

    render(withClient(<MentalAnalyticsTab />));

    await waitFor(() => {
      expect(screen.getByTestId('mental-tilt-dominant')).toBeTruthy();
    });
  });

  it('consulta o endpoint /api/analytics/tilt-type-distribution', async () => {
    const MentalAnalyticsTab = await loadTab();
    routeApiRequest({
      ...EMPTY_OTHERS,
      'tilt-type-distribution': {
        period: '30d', totalAssessments: 0, typedCount: 0,
        dominant: null, distribution: [], dataSufficiency: 'low',
      },
    });

    render(withClient(<MentalAnalyticsTab />));

    await waitFor(() => {
      const calls = (apiRequest as any).mock.calls as any[][];
      const urls = calls.map((c) => String(c[1] ?? ''));
      expect(urls.some((u) => u.includes('/api/analytics/tilt-type-distribution'))).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// dominante presente -> tipo + share + antidoto
// ---------------------------------------------------------------------------

describe('MentalAnalyticsTab — dominante presente', () => {
  it('mostra o tipo dominante e o share quando ha dados (dataSufficiency ok)', async () => {
    const MentalAnalyticsTab = await loadTab();
    routeApiRequest({
      ...EMPTY_OTHERS,
      'tilt-type-distribution': {
        period: '30d',
        totalAssessments: 7,
        typedCount: 7,
        dominant: 'injustice',
        distribution: [
          { tiltType: 'injustice', count: 5, sharePct: 0.714 },
          { tiltType: 'revenge', count: 2, sharePct: 0.286 },
        ],
        dataSufficiency: 'ok',
      },
    });

    render(withClient(<MentalAnalyticsTab />));

    const widget = await waitFor(() => screen.getByTestId('mental-tilt-dominant'));
    // share do dominante (71% / 0.714 — aceita formato pct inteiro ou fracao)
    expect(/71|0\.71/.test(widget.textContent ?? '')).toBe(true);
  });

  it('exibe o antidoto do dominante (texto do catalogo)', async () => {
    const MentalAnalyticsTab = await loadTab();
    const { getTiltType } = await import('@shared/tilt-types');
    routeApiRequest({
      ...EMPTY_OTHERS,
      'tilt-type-distribution': {
        period: '30d',
        totalAssessments: 5,
        typedCount: 5,
        dominant: 'revenge',
        distribution: [{ tiltType: 'revenge', count: 5, sharePct: 1 }],
        dataSufficiency: 'ok',
      },
    });

    render(withClient(<MentalAnalyticsTab />));

    const widget = await waitFor(() => screen.getByTestId('mental-tilt-dominant'));
    expect(widget.textContent ?? '').toContain(getTiltType('revenge')!.antidote);
  });
});

// ---------------------------------------------------------------------------
// dataSufficiency low -> mensagem de amostra pequena
// ---------------------------------------------------------------------------

describe('MentalAnalyticsTab — amostra pequena', () => {
  it('dataSufficiency low (com dominant) mostra mensagem de amostra pequena', async () => {
    const MentalAnalyticsTab = await loadTab();
    routeApiRequest({
      ...EMPTY_OTHERS,
      'tilt-type-distribution': {
        period: '30d',
        totalAssessments: 2,
        typedCount: 2,
        dominant: 'injustice',
        distribution: [{ tiltType: 'injustice', count: 2, sharePct: 1 }],
        dataSufficiency: 'low',
      },
    });

    render(withClient(<MentalAnalyticsTab />));

    const widget = await waitFor(() => screen.getByTestId('mental-tilt-dominant'));
    expect(/amostra pequena|continue registrando/i.test(widget.textContent ?? '')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// empty state -> sem antidoto decorativo (lesson #11)
// ---------------------------------------------------------------------------

describe('MentalAnalyticsTab — empty state', () => {
  it('typedCount 0 / dominant null -> empty state, sem antidoto decorativo', async () => {
    const MentalAnalyticsTab = await loadTab();
    const { TILT_TYPE_CATALOG } = await import('@shared/tilt-types');
    routeApiRequest({
      ...EMPTY_OTHERS,
      'tilt-type-distribution': {
        period: '30d', totalAssessments: 0, typedCount: 0,
        dominant: null, distribution: [], dataSufficiency: 'low',
      },
    });

    render(withClient(<MentalAnalyticsTab />));

    const widget = await waitFor(() => screen.getByTestId('mental-tilt-dominant'));
    const text = widget.textContent ?? '';
    // nenhum antidoto do catalogo deve aparecer no empty state (sem decorativo)
    for (const meta of TILT_TYPE_CATALOG) {
      expect(text).not.toContain(meta.antidote);
    }
  });
});
