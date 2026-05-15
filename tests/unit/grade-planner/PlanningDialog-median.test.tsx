// Test-Writer (Modo TDD - Red Phase)
// Spec: Docs/specs/grade-planner-mediana-participantes.md (RF-07)
// Cobre header agregado "Mediana de Participantes" + tooltip + regression check
// das linhas "Field Medio" por torneio individual.
//
// Componente: client/src/components/grade-planner/PlanningDialog.tsx
// Em red phase: header agregado nao existe + tooltip ausente. As linhas
// "Field Medio" por torneio (lines 431-435 e 660-664) JA existem e precisam
// permanecer apos implementacao.
//
// Lessons aplicadas:
//   #14: await import() em testes .tsx que carregam componente React.
//   #27: Tooltip Radix abre via hover/focus — usar userEvent.hover (mousedown N/A).
//   #30: .test.tsx roda em projeto client (jsdom).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { useForm } from 'react-hook-form';

// Helper para construir torneio com estimatedFieldSize especifico
function mkTournament(opts: {
  estimate?: number | null;
  buyIn?: string;
  guaranteed?: string;
  site?: string;
  type?: string;
  speed?: string;
  time?: string;
  name?: string;
}) {
  const buyIn = opts.buyIn ?? '100';
  let guaranteed: string | undefined;
  if (opts.guaranteed !== undefined) {
    guaranteed = opts.guaranteed;
  } else if (opts.estimate != null) {
    guaranteed = String(opts.estimate * parseFloat(buyIn));
  }
  return {
    id: `t-${Math.random().toString(36).slice(2, 9)}`,
    site: opts.site ?? 'PokerStars',
    type: opts.type ?? 'Vanilla',
    speed: opts.speed ?? 'Normal',
    time: opts.time ?? '19:00',
    name: opts.name ?? 'Test Tourney',
    buyIn,
    guaranteed,
    prioridade: 2,
  };
}

// Harness com useForm pra prover form prop ao Dialog
function Harness({ tournaments }: { tournaments: any[] }) {
  const form = useForm({
    defaultValues: {
      site: '',
      time: '',
      type: '',
      speed: '',
      name: '',
      buyIn: '',
      guaranteed: '',
      prioridade: 2,
    },
  });

  const [Dialog, setDialog] = React.useState<any>(null);
  React.useEffect(() => {
    let alive = true;
    import('@/components/grade-planner/PlanningDialog').then((mod) => {
      if (alive) setDialog(() => mod.PlanningDialog);
    });
    return () => { alive = false; };
  }, []);

  if (!Dialog) return null;

  const props = {
    open: true,
    onOpenChange: vi.fn(),
    selectedDay: 1,
    selectedProfile: 'A' as const,
    form,
    onSubmit: vi.fn(),
    getDayStats: vi.fn(() => ({
      count: tournaments.length,
      avgBuyIn: 100,
      totalBuyIn: 100 * tournaments.length,
      vanillaPercentage: 100,
      pkoPercentage: 0,
      mysteryPercentage: 0,
      normalPercentage: 100,
      turboPercentage: 0,
      hyperPercentage: 0,
      medianFieldSize: null,
      startTime: '19:00',
      endTime: '22:00',
      durationHours: 3,
    })),
    getTournamentsForModalProfile: vi.fn(() => tournaments),
    generateTournamentName: vi.fn(() => 'Generated Name'),
    suggestions: [],
    onSelectSuggestion: vi.fn(),
    onEditTournament: vi.fn(),
    onDeleteTournament: vi.fn(),
    saveStatus: 'idle' as const,
    onProfileChange: vi.fn(),
    isPending: false,
    favorites: [],
  };

  return React.createElement(Dialog, props as any);
}

describe('PlanningDialog — mediana agregada no header (RF-07)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('header exibe label "Mediana de Participantes" + valor numerico para conjunto valido', async () => {
    const tournaments = [
      mkTournament({ estimate: 300 }),
      mkTournament({ estimate: 400 }),
      mkTournament({ estimate: 500 }),
    ];

    render(React.createElement(Harness, { tournaments }));

    // Aguardar o dynamic import resolver
    expect(await screen.findByText(/Mediana de Participantes/i)).toBeInTheDocument();
  });

  it('outlier: lista com [150,200,250,300,400,500,10000] -> header mediana exibe 300 (NAO ~1714)', async () => {
    const tournaments = [
      mkTournament({ estimate: 150 }),
      mkTournament({ estimate: 200 }),
      mkTournament({ estimate: 250 }),
      mkTournament({ estimate: 300 }),
      mkTournament({ estimate: 400 }),
      mkTournament({ estimate: 500 }),
      mkTournament({ estimate: 10000 }),
    ];

    render(React.createElement(Harness, { tournaments }));

    // Aguarda o componente montar
    const label = await screen.findByText(/Mediana de Participantes/i);
    expect(label).toBeInTheDocument();

    // O valor da mediana (300) precisa aparecer em algum lugar perto do label.
    // Como o DOM exato depende da implementacao, usamos um parent container.
    const headerCard = label.closest('div');
    expect(headerCard).not.toBeNull();

    // Procuramos por "300" como valor agregado em algum descendente proximo.
    // Tolerante a formatacao pt-BR.
    const grandparent = label.parentElement?.parentElement ?? document.body;
    expect(grandparent.textContent).toMatch(/300/);
    // E NAO deve haver "1714"/"1.714" representando a media inflacionada
    expect(grandparent.textContent).not.toMatch(/1[.,]?714/);
  });

  it('tooltip presente com texto sobre outliers / distorcao (acessivel via hover)', async () => {
    const tournaments = [
      mkTournament({ estimate: 300 }),
      mkTournament({ estimate: 400 }),
      mkTournament({ estimate: 500 }),
    ];

    render(React.createElement(Harness, { tournaments }));

    // Encontra o trigger do tooltip — qualquer elemento ancestral/proximo do label
    // que tenha aria-label ou title contendo "outlier" OU um elemento texto explicito.
    await screen.findByText(/Mediana de Participantes/i);

    // Forma 1: procurar por texto direto (se sempre visivel)
    const directMatch = screen.queryByText(/outliers|distorcida|distorc/i);
    if (directMatch) {
      expect(directMatch).toBeInTheDocument();
      return;
    }

    // Forma 2: procurar por trigger com aria-label/title + hover para revelar
    const triggerByLabel = screen.queryByLabelText(/outliers|distorc/i);
    if (triggerByLabel) {
      const user = userEvent.setup();
      await user.hover(triggerByLabel);
      expect(await screen.findByText(/outliers|distorcida|distorc/i)).toBeInTheDocument();
      return;
    }

    // Forma 3: trigger com title attribute
    const triggerByTitle = document.querySelector('[title*="outlier" i], [title*="distorc" i]');
    expect(triggerByTitle, 'tooltip trigger nao encontrado (texto, aria-label ou title com "outliers"/"distorcida")').not.toBeNull();
  });

  it('regression guard: linhas "Field Medio" por torneio individual permanecem (NAO removidas)', async () => {
    const tournaments = [
      mkTournament({ estimate: 300, name: 'A' }),
      mkTournament({ estimate: 400, name: 'B' }),
    ];

    render(React.createElement(Harness, { tournaments }));

    await screen.findByText(/Mediana de Participantes/i);

    // Pelo menos uma linha "Field Medio" por torneio individual deve estar presente
    const fieldMedioMatches = screen.queryAllByText(/Field\s*M[eé]dio:\s*\+\/-/i);
    expect(fieldMedioMatches.length).toBeGreaterThan(0);
  });

  it('modal com 0 torneios validos (sem guaranteed) -> header mediana exibe N/A', async () => {
    const tournaments = [
      { site: 'PokerStars', type: 'Vanilla', speed: 'Normal', time: '19:00', buyIn: '100', prioridade: 2, id: 'x1' },
      { site: 'GGPoker', type: 'Vanilla', speed: 'Normal', time: '20:00', buyIn: '100', guaranteed: '0', prioridade: 2, id: 'x2' },
    ];

    render(React.createElement(Harness, { tournaments }));

    const label = await screen.findByText(/Mediana de Participantes/i);
    const parent = label.parentElement?.parentElement ?? document.body;
    expect(parent.textContent).toMatch(/N\/A/i);
  });
});
