// Test-Writer (Modo TDD - Red Phase)
// Spec: Docs/specs/grade-planner-mediana-participantes.md (RF-06)
// Cobre exibicao da linha "Mediana: ~{X} participantes" no DayCard.
//
// Componente: client/src/components/grade-planner/DayCard.tsx (ja existe;
// linha nova sera adicionada conforme RF-06). Em red phase: DayStats nao
// tem medianFieldSize (RF-03 pendente) + DayCard nao renderiza a linha.
//
// Lessons aplicadas:
//   #14: usar `await import(...)` em vez de require() em testes .tsx React.
//   #27: TabsTrigger Radix reage a mousedown — N/A aqui (sem Radix Tabs).
//   #30: .test.tsx roda em projeto client (jsdom) por padrao.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

interface MockDayStats {
  count: number;
  avgBuyIn: number;
  totalBuyIn: number;
  vanillaPercentage: number;
  pkoPercentage: number;
  mysteryPercentage: number;
  normalPercentage: number;
  turboPercentage: number;
  hyperPercentage: number;
  medianFieldSize: number | null;
  startTime: string | null;
  endTime: string | null;
  durationHours: number;
}

const baseDay = { id: 1, name: 'Segunda', short: 'Seg' };

function buildStats(overrides: Partial<MockDayStats> = {}): MockDayStats {
  return {
    count: 3,
    avgBuyIn: 50,
    totalBuyIn: 150,
    vanillaPercentage: 33,
    pkoPercentage: 33,
    mysteryPercentage: 34,
    normalPercentage: 50,
    turboPercentage: 30,
    hyperPercentage: 20,
    medianFieldSize: 500,
    startTime: '19:00',
    endTime: '22:00',
    durationHours: 3,
    ...overrides,
  };
}

function makeProps(profileType: 'A' | 'B' | 'C', stats: MockDayStats) {
  return {
    day: baseDay,
    getActiveProfile: vi.fn(() => profileType),
    setActiveProfile: vi.fn(),
    getProfileStats: vi.fn(() => stats),
    getTournamentsForProfile: vi.fn(() => [
      { site: 'PokerStars', buyIn: '50' },
      { site: 'GGPoker', buyIn: '50' },
      { site: 'PokerStars', buyIn: '50' },
    ]),
    onOpenDialog: vi.fn(),
  };
}

describe('DayCard — linha de mediana de participantes (RF-06)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('medianFieldSize=500 (perfil A ativo) -> renderiza "Mediana: ~500 participantes"', async () => {
    const { DayCard } = await import('@/components/grade-planner/DayCard');
    const stats = buildStats({ medianFieldSize: 500 });
    render(React.createElement(DayCard, makeProps('A', stats) as any));

    // Match resistente a espacos extras e formatacao pt-BR
    expect(
      screen.getByText(/Mediana:\s*~?\s*500\s+participantes/i)
    ).toBeInTheDocument();
  });

  it('medianFieldSize=1234 -> renderiza com formato pt-BR "Mediana: ~1.234 participantes"', async () => {
    const { DayCard } = await import('@/components/grade-planner/DayCard');
    const stats = buildStats({ medianFieldSize: 1234 });
    render(React.createElement(DayCard, makeProps('A', stats) as any));

    expect(
      screen.getByText(/Mediana:\s*~?\s*1\.234\s+participantes/i)
    ).toBeInTheDocument();
  });

  it('medianFieldSize=null -> NAO renderiza linha "Mediana:" (elemento ausente)', async () => {
    const { DayCard } = await import('@/components/grade-planner/DayCard');
    const stats = buildStats({ medianFieldSize: null });
    render(React.createElement(DayCard, makeProps('A', stats) as any));

    expect(screen.queryByText(/Mediana:/i)).toBeNull();
  });

  it('profile=C (Dia OFF) -> nunca renderiza linha mediana (mesmo com medianFieldSize valido)', async () => {
    const { DayCard } = await import('@/components/grade-planner/DayCard');
    // Para perfil C o componente nao chama getProfileStats; passamos stats mock por seguranca
    const stats = buildStats({ medianFieldSize: 500 });
    render(React.createElement(DayCard, makeProps('C', stats) as any));

    expect(screen.queryByText(/Mediana:/i)).toBeNull();
  });

  it('profileStats.count=0 (empty state) -> nao renderiza linha mediana', async () => {
    const { DayCard } = await import('@/components/grade-planner/DayCard');
    const stats = buildStats({ count: 0, medianFieldSize: null });
    render(React.createElement(DayCard, makeProps('A', stats) as any));

    expect(screen.queryByText(/Mediana:/i)).toBeNull();
  });

  it('linha mediana aparece dentro do bloco "day-main-info" (apos linha de tipo/velocidade)', async () => {
    const { DayCard } = await import('@/components/grade-planner/DayCard');
    const stats = buildStats({ medianFieldSize: 300 });
    const { container } = render(React.createElement(DayCard, makeProps('A', stats) as any));

    const mainInfo = container.querySelector('.day-main-info');
    expect(mainInfo).not.toBeNull();
    expect(mainInfo?.textContent).toMatch(/Mediana:\s*~?\s*300\s+participantes/i);
  });
});
