import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: RF-01 — Profile switch com Dialog styled (FP-04)
//
// Funcoes puras que determinam quando o dialog de confirmacao deve aparecer,
// quais torneios sao afetados, e qual acao executar apos confirmacao.
//
// O modulo `shared/grade-off-toggle.ts` ja exporta `checkOffToggleWarning`.
// Este sprint extrai logica adicional para:
//   - `getAffectedTournaments`: retorna lista de torneios afetados ao trocar para OFF
//   - `shouldShowOffDialog`: decide se o dialog deve ser mostrado (vs acao direta)
//   - `isProfileSwitchToOff`: verifica se a troca e especificamente para OFF
//
// Modulo esperado: `shared/grade-off-toggle.ts` (funcoes novas exportadas)
//
// Todos devem FALHAR (red phase) — funcoes ainda nao existem.
// =============================================================================

import { checkOffToggleWarning } from '../../../shared/grade-off-toggle';

// Estas funcoes AINDA NAO EXISTEM — o Implementer vai cria-las
// O import vai falhar ate serem criadas, o que e esperado em TDD
// import {
//   getAffectedTournaments,
//   shouldShowOffDialog,
//   isProfileSwitchToOff,
// } from '../../shared/grade-off-toggle';

// Enquanto os imports reais nao existem, declaramos stubs para os testes compilarem
// O Implementer substituira estes stubs pelas implementacoes reais
let getAffectedTournaments: (dayOfWeek: number, tournaments: any[]) => any[];
let shouldShowOffDialog: (targetProfile: string, dayOfWeek: number, tournaments: any[]) => boolean;
let isProfileSwitchToOff: (targetProfile: string) => boolean;

// Tentar importar as funcoes reais (falha esperada em red phase)
try {
  const mod = require('../../../shared/grade-off-toggle');
  if (mod.getAffectedTournaments) getAffectedTournaments = mod.getAffectedTournaments;
  if (mod.shouldShowOffDialog) shouldShowOffDialog = mod.shouldShowOffDialog;
  if (mod.isProfileSwitchToOff) isProfileSwitchToOff = mod.isProfileSwitchToOff;
} catch {
  // Esperado em red phase — funcoes nao existem ainda
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mondayTournaments = [
  { id: 't1', dayOfWeek: 1, isActive: true, name: 'Monday Starter', time: '18:00', buyIn: '22', site: 'PokerStars' },
  { id: 't2', dayOfWeek: 1, isActive: true, name: 'Monday Grind', time: '19:30', buyIn: '55', site: 'GGPoker' },
  { id: 't3', dayOfWeek: 1, isActive: true, name: 'Monday Main', time: '21:00', buyIn: '109', site: 'PokerStars' },
];

const tuesdayTournaments = [
  { id: 't4', dayOfWeek: 2, isActive: true, name: 'Tuesday Turbo', time: '20:00', buyIn: '33', site: '888poker' },
];

const mixedTournaments = [...mondayTournaments, ...tuesdayTournaments];

// ---------------------------------------------------------------------------
// isProfileSwitchToOff — identifica se a troca e para OFF
// ---------------------------------------------------------------------------

describe('isProfileSwitchToOff', () => {
  it('deve retornar true quando target e "OFF"', () => {
    expect(isProfileSwitchToOff('OFF')).toBe(true);
  });

  it('deve retornar false quando target e "A"', () => {
    expect(isProfileSwitchToOff('A')).toBe(false);
  });

  it('deve retornar false quando target e "B"', () => {
    expect(isProfileSwitchToOff('B')).toBe(false);
  });

  it('deve retornar false quando target e "C"', () => {
    expect(isProfileSwitchToOff('C')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getAffectedTournaments — lista torneios afetados ao desativar um dia
// ---------------------------------------------------------------------------

describe('getAffectedTournaments', () => {
  it('deve retornar torneios ativos do dia especificado', () => {
    const result = getAffectedTournaments(1, mixedTournaments);
    expect(result).toHaveLength(3);
    expect(result.every((t: any) => t.dayOfWeek === 1)).toBe(true);
  });

  it('deve retornar array vazio quando dia nao tem torneios', () => {
    const result = getAffectedTournaments(5, mixedTournaments); // sexta-feira
    expect(result).toHaveLength(0);
  });

  it('deve ignorar torneios inativos', () => {
    const withInactive = [
      ...mondayTournaments,
      { id: 't-inactive', dayOfWeek: 1, isActive: false, name: 'Inactive', time: '22:00', buyIn: '10', site: 'WPN' },
    ];
    const result = getAffectedTournaments(1, withInactive);
    expect(result).toHaveLength(3); // apenas os ativos
    expect(result.find((t: any) => t.id === 't-inactive')).toBeUndefined();
  });

  it('deve retornar array vazio quando lista de torneios e vazia', () => {
    const result = getAffectedTournaments(1, []);
    expect(result).toHaveLength(0);
  });

  it('deve conter dados necessarios para exibicao no dialog (nome, horario, buyIn, site)', () => {
    const result = getAffectedTournaments(1, mixedTournaments);
    for (const t of result) {
      expect(t).toHaveProperty('name');
      expect(t).toHaveProperty('time');
      expect(t).toHaveProperty('buyIn');
      expect(t).toHaveProperty('site');
    }
  });
});

// ---------------------------------------------------------------------------
// shouldShowOffDialog — decide se o dialog deve ser exibido
// ---------------------------------------------------------------------------

describe('shouldShowOffDialog', () => {
  it('deve retornar true ao trocar para OFF com torneios no dia', () => {
    expect(shouldShowOffDialog('OFF', 1, mixedTournaments)).toBe(true);
  });

  it('deve retornar false ao trocar para OFF sem torneios no dia', () => {
    expect(shouldShowOffDialog('OFF', 5, mixedTournaments)).toBe(false);
  });

  it('deve retornar false ao trocar para OFF em dia sem torneios (lista vazia)', () => {
    expect(shouldShowOffDialog('OFF', 1, [])).toBe(false);
  });

  it('deve retornar false ao trocar para perfil A (nao OFF)', () => {
    expect(shouldShowOffDialog('A', 1, mixedTournaments)).toBe(false);
  });

  it('deve retornar false ao trocar para perfil B (nao OFF)', () => {
    expect(shouldShowOffDialog('B', 1, mixedTournaments)).toBe(false);
  });

  it('deve retornar false ao trocar para perfil C (nao OFF)', () => {
    expect(shouldShowOffDialog('C', 1, mixedTournaments)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkOffToggleWarning — funcao existente, testes de regressao
// (estes passam com codigo atual — baseline de seguranca)
// ---------------------------------------------------------------------------

describe('checkOffToggleWarning (regressao)', () => {
  it('deve retornar needsWarning=true com contagem correta para dia com torneios', () => {
    const result = checkOffToggleWarning(1, mixedTournaments);
    expect(result.needsWarning).toBe(true);
    expect(result.tournamentCount).toBe(3);
  });

  it('deve retornar needsWarning=false para dia sem torneios', () => {
    const result = checkOffToggleWarning(5, mixedTournaments);
    expect(result.needsWarning).toBe(false);
    expect(result.tournamentCount).toBe(0);
  });

  it('deve retornar needsWarning=false para lista vazia', () => {
    const result = checkOffToggleWarning(1, []);
    expect(result.needsWarning).toBe(false);
    expect(result.tournamentCount).toBe(0);
  });
});
