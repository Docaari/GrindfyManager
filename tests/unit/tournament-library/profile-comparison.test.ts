import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: Profile Comparison (A vs B vs C)
//
// O modulo shared/profile-comparison.ts AINDA NAO EXISTE.
// O Implementer vai cria-lo.
//
// calculateProfileComparison recebe torneios planejados e profile states,
// retornando metricas separadas por perfil (A, B, C). OFF nao aparece.
//
// Cada perfil tem:
// - totalBuyIn, tournamentCount, avgFieldSize
// - speedDistribution, typeDistribution, siteDistribution (percentuais)
// - timeRange { start, end }
// - hasData (boolean)
//
// Modo: TDD — todos os testes devem FALHAR (red phase).
// =============================================================================

// ---------------------------------------------------------------------------
// Import que AINDA NAO EXISTE — sera criado pelo Implementer
// ---------------------------------------------------------------------------
import { calculateProfileComparison } from '../../../shared/profile-comparison';

// ---------------------------------------------------------------------------
// Helpers de teste
// ---------------------------------------------------------------------------

interface PlannedTournament {
  id: string;
  name: string;
  site: string;
  buyIn: string;
  time: string | null;
  dayOfWeek: number;
  type: string | null;
  speed: string | null;
  fieldSize: number | null;
  [key: string]: any;
}

interface ProfileState {
  dayOfWeek: number;
  activeProfile: string;
}

function makeTournament(overrides: Partial<PlannedTournament> = {}): PlannedTournament {
  return {
    id: 'pt-1',
    name: 'Tournament',
    site: 'PokerStars',
    buyIn: '22',
    time: '19:00',
    dayOfWeek: 1,
    type: 'Vanilla',
    speed: 'Normal',
    fieldSize: null,
    ...overrides,
  };
}

function makeProfileState(dayOfWeek: number, activeProfile: string): ProfileState {
  return { dayOfWeek, activeProfile };
}

// =============================================================================
// Grupo 2: calculateProfileComparison — metricas basicas
// =============================================================================

describe('calculateProfileComparison', () => {

  // -------------------------------------------------------------------------
  // Estrutura de retorno — sempre tem chaves A, B, C
  // -------------------------------------------------------------------------

  it('deve retornar objeto com chaves A, B e C', () => {
    const result = calculateProfileComparison([], []);

    expect(result).toHaveProperty('A');
    expect(result).toHaveProperty('B');
    expect(result).toHaveProperty('C');
  });

  it('nao deve incluir OFF no resultado', () => {
    const profiles = [
      makeProfileState(0, 'OFF'),
      makeProfileState(1, 'A'),
    ];
    const result = calculateProfileComparison([], profiles);

    expect(result).not.toHaveProperty('OFF');
  });

  // -------------------------------------------------------------------------
  // Perfil sem torneios — hasData: false, metricas zeradas/null
  // -------------------------------------------------------------------------

  it('deve marcar hasData=false para perfil sem torneios', () => {
    const profiles = [
      makeProfileState(1, 'A'),
      makeProfileState(2, 'B'),
    ];
    const result = calculateProfileComparison([], profiles);

    expect(result.A.hasData).toBe(false);
    expect(result.B.hasData).toBe(false);
    expect(result.C.hasData).toBe(false);
  });

  it('deve retornar metricas zeradas/null para perfil sem torneios', () => {
    const result = calculateProfileComparison([], []);

    expect(result.A.totalBuyIn).toBe(0);
    expect(result.A.tournamentCount).toBe(0);
    expect(result.A.avgFieldSize).toBeNull();
    expect(result.A.timeRange).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Perfil com torneios — hasData: true, metricas calculadas
  // -------------------------------------------------------------------------

  it('deve marcar hasData=true para perfil com torneios', () => {
    const tournaments = [
      makeTournament({ id: '1', dayOfWeek: 1 }),
    ];
    const profiles = [makeProfileState(1, 'A')];
    const result = calculateProfileComparison(tournaments, profiles);

    expect(result.A.hasData).toBe(true);
    expect(result.B.hasData).toBe(false);
    expect(result.C.hasData).toBe(false);
  });

  // -------------------------------------------------------------------------
  // totalBuyIn e tournamentCount por perfil
  // -------------------------------------------------------------------------

  it('deve calcular totalBuyIn e tournamentCount por perfil', () => {
    const tournaments = [
      makeTournament({ id: '1', buyIn: '22', dayOfWeek: 1 }),
      makeTournament({ id: '2', buyIn: '33', dayOfWeek: 1 }),
      makeTournament({ id: '3', buyIn: '55', dayOfWeek: 2 }),
    ];
    const profiles = [
      makeProfileState(1, 'A'),
      makeProfileState(2, 'B'),
    ];
    const result = calculateProfileComparison(tournaments, profiles);

    expect(result.A.totalBuyIn).toBe(55);        // 22 + 33
    expect(result.A.tournamentCount).toBe(2);
    expect(result.B.totalBuyIn).toBe(55);
    expect(result.B.tournamentCount).toBe(1);
  });

  // -------------------------------------------------------------------------
  // avgFieldSize
  // -------------------------------------------------------------------------

  it('deve calcular avgFieldSize como media dos fieldSize nao-null', () => {
    const tournaments = [
      makeTournament({ id: '1', fieldSize: 100, dayOfWeek: 1 }),
      makeTournament({ id: '2', fieldSize: 200, dayOfWeek: 1 }),
      makeTournament({ id: '3', fieldSize: null, dayOfWeek: 1 }),
    ];
    const profiles = [makeProfileState(1, 'A')];
    const result = calculateProfileComparison(tournaments, profiles);

    expect(result.A.avgFieldSize).toBe(150);  // (100 + 200) / 2
  });

  it('deve retornar avgFieldSize null quando nenhum torneio tem fieldSize', () => {
    const tournaments = [
      makeTournament({ id: '1', fieldSize: null, dayOfWeek: 1 }),
      makeTournament({ id: '2', fieldSize: null, dayOfWeek: 1 }),
    ];
    const profiles = [makeProfileState(1, 'A')];
    const result = calculateProfileComparison(tournaments, profiles);

    expect(result.A.avgFieldSize).toBeNull();
  });

  // -------------------------------------------------------------------------
  // speedDistribution — percentuais arredondados
  // -------------------------------------------------------------------------

  it('deve calcular speedDistribution com percentuais arredondados', () => {
    const tournaments = [
      makeTournament({ id: '1', speed: 'Normal', dayOfWeek: 1 }),
      makeTournament({ id: '2', speed: 'Normal', dayOfWeek: 1 }),
      makeTournament({ id: '3', speed: 'Turbo', dayOfWeek: 1 }),
    ];
    const profiles = [makeProfileState(1, 'A')];
    const result = calculateProfileComparison(tournaments, profiles);

    expect(result.A.speedDistribution).toEqual({ Normal: 67, Turbo: 33 });
  });

  it('deve tratar speed=null como Normal na distribuicao', () => {
    const tournaments = [
      makeTournament({ id: '1', speed: null, dayOfWeek: 1 }),
      makeTournament({ id: '2', speed: 'Turbo', dayOfWeek: 1 }),
    ];
    const profiles = [makeProfileState(1, 'A')];
    const result = calculateProfileComparison(tournaments, profiles);

    expect(result.A.speedDistribution).toEqual({ Normal: 50, Turbo: 50 });
  });

  // -------------------------------------------------------------------------
  // typeDistribution — percentuais arredondados
  // -------------------------------------------------------------------------

  it('deve calcular typeDistribution com percentuais arredondados', () => {
    const tournaments = [
      makeTournament({ id: '1', type: 'PKO', dayOfWeek: 1 }),
      makeTournament({ id: '2', type: 'PKO', dayOfWeek: 1 }),
      makeTournament({ id: '3', type: 'Vanilla', dayOfWeek: 1 }),
      makeTournament({ id: '4', type: 'Mystery', dayOfWeek: 1 }),
    ];
    const profiles = [makeProfileState(1, 'A')];
    const result = calculateProfileComparison(tournaments, profiles);

    expect(result.A.typeDistribution).toEqual({ PKO: 50, Vanilla: 25, Mystery: 25 });
  });

  it('deve tratar type=null como Vanilla na distribuicao', () => {
    const tournaments = [
      makeTournament({ id: '1', type: null, dayOfWeek: 1 }),
      makeTournament({ id: '2', type: 'PKO', dayOfWeek: 1 }),
    ];
    const profiles = [makeProfileState(1, 'A')];
    const result = calculateProfileComparison(tournaments, profiles);

    expect(result.A.typeDistribution).toEqual({ Vanilla: 50, PKO: 50 });
  });

  // -------------------------------------------------------------------------
  // siteDistribution — percentuais arredondados
  // -------------------------------------------------------------------------

  it('deve calcular siteDistribution com percentuais arredondados', () => {
    const tournaments = [
      makeTournament({ id: '1', site: 'PokerStars', dayOfWeek: 1 }),
      makeTournament({ id: '2', site: 'PokerStars', dayOfWeek: 1 }),
      makeTournament({ id: '3', site: 'GGNetwork', dayOfWeek: 1 }),
    ];
    const profiles = [makeProfileState(1, 'A')];
    const result = calculateProfileComparison(tournaments, profiles);

    expect(result.A.siteDistribution).toEqual({ PokerStars: 67, GGNetwork: 33 });
  });

  // -------------------------------------------------------------------------
  // timeRange — primeiro e ultimo horario do perfil
  // -------------------------------------------------------------------------

  it('deve calcular timeRange com primeiro e ultimo horario do perfil', () => {
    const tournaments = [
      makeTournament({ id: '1', time: '20:00', dayOfWeek: 1 }),
      makeTournament({ id: '2', time: '18:00', dayOfWeek: 1 }),
      makeTournament({ id: '3', time: '22:30', dayOfWeek: 3 }),
    ];
    const profiles = [
      makeProfileState(1, 'A'),
      makeProfileState(3, 'A'),
    ];
    const result = calculateProfileComparison(tournaments, profiles);

    expect(result.A.timeRange).toEqual({ start: '18:00', end: '22:30' });
  });

  it('deve retornar timeRange null quando torneios nao tem horario', () => {
    const tournaments = [
      makeTournament({ id: '1', time: null, dayOfWeek: 1 }),
    ];
    const profiles = [makeProfileState(1, 'A')];
    const result = calculateProfileComparison(tournaments, profiles);

    expect(result.A.timeRange).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Torneios de dias OFF sao ignorados
  // -------------------------------------------------------------------------

  it('deve ignorar torneios de dias com perfil OFF', () => {
    const tournaments = [
      makeTournament({ id: '1', buyIn: '22', dayOfWeek: 1 }),  // dia A
      makeTournament({ id: '2', buyIn: '55', dayOfWeek: 2 }),  // dia OFF
    ];
    const profiles = [
      makeProfileState(1, 'A'),
      makeProfileState(2, 'OFF'),
    ];
    const result = calculateProfileComparison(tournaments, profiles);

    expect(result.A.totalBuyIn).toBe(22);
    expect(result.A.tournamentCount).toBe(1);
    // Torneio do dia OFF nao aparece em nenhum perfil
  });

  // =========================================================================
  // Grupo 3: Edge cases de profile comparison
  // =========================================================================

  describe('edge cases', () => {

    // -----------------------------------------------------------------------
    // Apenas 1 perfil usado
    // -----------------------------------------------------------------------

    it('deve marcar B e C como hasData=false quando apenas A e usado', () => {
      const tournaments = [
        makeTournament({ id: '1', buyIn: '22', dayOfWeek: 1 }),
        makeTournament({ id: '2', buyIn: '33', dayOfWeek: 2 }),
      ];
      const profiles = [
        makeProfileState(1, 'A'),
        makeProfileState(2, 'A'),
      ];
      const result = calculateProfileComparison(tournaments, profiles);

      expect(result.A.hasData).toBe(true);
      expect(result.A.totalBuyIn).toBe(55);
      expect(result.B.hasData).toBe(false);
      expect(result.C.hasData).toBe(false);
    });

    // -----------------------------------------------------------------------
    // Todos os 3 perfis usados
    // -----------------------------------------------------------------------

    it('deve calcular metricas para todos os 3 perfis quando todos sao usados', () => {
      const tournaments = [
        makeTournament({ id: '1', buyIn: '22', dayOfWeek: 1 }),
        makeTournament({ id: '2', buyIn: '55', dayOfWeek: 2 }),
        makeTournament({ id: '3', buyIn: '109', dayOfWeek: 3 }),
      ];
      const profiles = [
        makeProfileState(1, 'A'),
        makeProfileState(2, 'B'),
        makeProfileState(3, 'C'),
      ];
      const result = calculateProfileComparison(tournaments, profiles);

      expect(result.A.hasData).toBe(true);
      expect(result.A.totalBuyIn).toBe(22);
      expect(result.B.hasData).toBe(true);
      expect(result.B.totalBuyIn).toBe(55);
      expect(result.C.hasData).toBe(true);
      expect(result.C.totalBuyIn).toBe(109);
    });

    // -----------------------------------------------------------------------
    // Nenhum torneio — todos hasData=false
    // -----------------------------------------------------------------------

    it('deve retornar todos hasData=false quando nao ha torneios', () => {
      const profiles = [
        makeProfileState(1, 'A'),
        makeProfileState(2, 'B'),
        makeProfileState(3, 'C'),
      ];
      const result = calculateProfileComparison([], profiles);

      expect(result.A.hasData).toBe(false);
      expect(result.B.hasData).toBe(false);
      expect(result.C.hasData).toBe(false);
    });

    // -----------------------------------------------------------------------
    // Torneios de dia OFF nao aparecem em nenhum perfil
    // -----------------------------------------------------------------------

    it('deve ignorar torneios de dias OFF completamente', () => {
      const tournaments = [
        makeTournament({ id: '1', buyIn: '500', dayOfWeek: 6 }),
      ];
      const profiles = [
        makeProfileState(1, 'A'),
        makeProfileState(6, 'OFF'),
      ];
      const result = calculateProfileComparison(tournaments, profiles);

      expect(result.A.hasData).toBe(false);
      expect(result.B.hasData).toBe(false);
      expect(result.C.hasData).toBe(false);
    });

    // -----------------------------------------------------------------------
    // 1 torneio num perfil — distribuicoes sao 100%
    // -----------------------------------------------------------------------

    it('deve calcular distribuicoes como 100% quando perfil tem 1 unico torneio', () => {
      const tournaments = [
        makeTournament({
          id: '1',
          site: 'WPN',
          type: 'PKO',
          speed: 'Turbo',
          dayOfWeek: 1,
        }),
      ];
      const profiles = [makeProfileState(1, 'A')];
      const result = calculateProfileComparison(tournaments, profiles);

      expect(result.A.speedDistribution).toEqual({ Turbo: 100 });
      expect(result.A.typeDistribution).toEqual({ PKO: 100 });
      expect(result.A.siteDistribution).toEqual({ WPN: 100 });
    });

    // -----------------------------------------------------------------------
    // Multiplos sites — distribuicao proporcional correta
    // -----------------------------------------------------------------------

    it('deve calcular distribuicao proporcional para multiplos sites', () => {
      const tournaments = [
        makeTournament({ id: '1', site: 'PokerStars', dayOfWeek: 1 }),
        makeTournament({ id: '2', site: 'PokerStars', dayOfWeek: 1 }),
        makeTournament({ id: '3', site: 'PokerStars', dayOfWeek: 1 }),
        makeTournament({ id: '4', site: 'GGNetwork', dayOfWeek: 1 }),
        makeTournament({ id: '5', site: 'WPN', dayOfWeek: 1 }),
      ];
      const profiles = [makeProfileState(1, 'B')];
      const result = calculateProfileComparison(tournaments, profiles);

      expect(result.B.siteDistribution).toEqual({
        PokerStars: 60,
        GGNetwork: 20,
        WPN: 20,
      });
    });

    // -----------------------------------------------------------------------
    // Multiplos dias com mesmo perfil — torneios sao agregados
    // -----------------------------------------------------------------------

    it('deve agregar torneios de multiplos dias com mesmo perfil', () => {
      const tournaments = [
        makeTournament({ id: '1', buyIn: '22', site: 'PokerStars', dayOfWeek: 1 }),
        makeTournament({ id: '2', buyIn: '33', site: 'GGNetwork', dayOfWeek: 3 }),
        makeTournament({ id: '3', buyIn: '55', site: 'PokerStars', dayOfWeek: 5 }),
      ];
      const profiles = [
        makeProfileState(1, 'A'),
        makeProfileState(3, 'A'),
        makeProfileState(5, 'A'),
      ];
      const result = calculateProfileComparison(tournaments, profiles);

      expect(result.A.totalBuyIn).toBe(110);     // 22 + 33 + 55
      expect(result.A.tournamentCount).toBe(3);
      expect(result.A.siteDistribution).toEqual({ PokerStars: 67, GGNetwork: 33 });
    });

    // -----------------------------------------------------------------------
    // Torneio em dia sem profileState — ignorado
    // -----------------------------------------------------------------------

    it('deve ignorar torneio cujo dayOfWeek nao tem profileState', () => {
      const tournaments = [
        makeTournament({ id: '1', buyIn: '22', dayOfWeek: 1 }),
        makeTournament({ id: '2', buyIn: '55', dayOfWeek: 4 }),  // sem profile
      ];
      const profiles = [makeProfileState(1, 'A')];
      const result = calculateProfileComparison(tournaments, profiles);

      expect(result.A.totalBuyIn).toBe(22);
      expect(result.A.tournamentCount).toBe(1);
    });

    // -----------------------------------------------------------------------
    // Distribuicoes vazias para perfil sem dados
    // -----------------------------------------------------------------------

    it('deve retornar distribuicoes vazias para perfil sem dados', () => {
      const result = calculateProfileComparison([], []);

      expect(result.A.speedDistribution).toEqual({});
      expect(result.A.typeDistribution).toEqual({});
      expect(result.A.siteDistribution).toEqual({});
    });
  });
});
