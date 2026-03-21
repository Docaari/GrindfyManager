import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Testes TDD: Logica de alertas de late registration (timer, deduplicacao, hierarquia)
//
// A classe/funcao LateRegAlertManager AINDA NAO EXISTE.
// O Implementer vai cria-la em:
//   client/src/lib/lateRegAlerts.ts (ou hook useLateRegAlerts.ts)
//
// Responsabilidades:
//   - Verificar torneios upcoming e detectar deadlines proximos
//   - Resolver hierarquia de threshold (override torneio vs. default global)
//   - Deduplicar alertas (cada torneio alerta 1 vez)
//   - Resetar deduplicacao quando lateRegMinutes e editado
//   - Respeitar master switch (lateRegAlertEnabled)
//   - Ignorar torneios com status != "upcoming"
//   - Ignorar torneios sem lateRegMinutes
//   - Ignorar torneios com late reg ja encerrado
//
// Todos os testes devem FALHAR (red phase).
// =============================================================================

// ---------------------------------------------------------------------------
// Import da classe/funcao que AINDA NAO EXISTE
// ---------------------------------------------------------------------------
import { LateRegAlertManager } from '../../../client/src/lib/lateRegAlerts';

// ---------------------------------------------------------------------------
// Tipos para os testes
// ---------------------------------------------------------------------------
interface SessionTournamentForAlert {
  id: string;
  name: string;
  time: string;
  lateRegMinutes: number | null;
  alertMinutesBefore: number | null;
  status: string;
  startTime: Date;
}

// ---------------------------------------------------------------------------
// Configuracao do usuario
// ---------------------------------------------------------------------------
interface LateRegUserSettings {
  lateRegAlertMinutes: number;
  lateRegAlertEnabled: boolean;
  lateRegAlertSound: boolean;
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------
function makeTournament(overrides: Partial<SessionTournamentForAlert> = {}): SessionTournamentForAlert {
  return {
    id: 'tour-001',
    name: 'Daily $22 PKO',
    time: '19:00',
    lateRegMinutes: 60,
    alertMinutesBefore: null,
    status: 'upcoming',
    startTime: new Date('2026-03-19T19:00:00'),
    ...overrides,
  };
}

function makeSettings(overrides: Partial<LateRegUserSettings> = {}): LateRegUserSettings {
  return {
    lateRegAlertMinutes: 10,
    lateRegAlertEnabled: true,
    lateRegAlertSound: true,
    ...overrides,
  };
}

// =============================================================================
// TESTES
// =============================================================================

describe('LateRegAlertManager', () => {
  let manager: InstanceType<typeof LateRegAlertManager>;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new LateRegAlertManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // Grupo 1: Deteccao de alerta (RF-10)
  // =========================================================================
  describe('deteccao de alerta — shouldAlert()', () => {

    it('deve alertar quando minutesRemaining <= threshold (default global)', () => {
      const settings = makeSettings({ lateRegAlertMinutes: 10 });
      // Torneio comeca 19:00, late=60, deadline=20:00
      // Se "agora" e 19:51, faltam 9min <= 10 => alerta
      const tournament = makeTournament({
        startTime: new Date('2026-03-19T19:00:00'),
        lateRegMinutes: 60,
        alertMinutesBefore: null,
      });

      vi.setSystemTime(new Date('2026-03-19T19:51:00'));

      const result = manager.shouldAlert(tournament, settings);
      expect(result).toBe(true);
    });

    it('deve NAO alertar quando minutesRemaining > threshold', () => {
      const settings = makeSettings({ lateRegAlertMinutes: 10 });
      // Deadline 20:00, agora 19:30 => faltam 30min > 10 => sem alerta
      const tournament = makeTournament({
        startTime: new Date('2026-03-19T19:00:00'),
        lateRegMinutes: 60,
        alertMinutesBefore: null,
      });

      vi.setSystemTime(new Date('2026-03-19T19:30:00'));

      const result = manager.shouldAlert(tournament, settings);
      expect(result).toBe(false);
    });

    it('deve usar override do torneio quando alertMinutesBefore != null', () => {
      const settings = makeSettings({ lateRegAlertMinutes: 10 });
      // Torneio override=20, deadline=20:00, agora 19:42 => faltam 18min <= 20 => alerta
      const tournament = makeTournament({
        startTime: new Date('2026-03-19T19:00:00'),
        lateRegMinutes: 60,
        alertMinutesBefore: 20,
      });

      vi.setSystemTime(new Date('2026-03-19T19:42:00'));

      const result = manager.shouldAlert(tournament, settings);
      expect(result).toBe(true);
    });

    it('deve usar default global quando alertMinutesBefore == null', () => {
      const settings = makeSettings({ lateRegAlertMinutes: 10 });
      // Override=null => usa default=10, deadline=20:00, agora 19:52 => faltam 8min <= 10 => alerta
      const tournament = makeTournament({
        startTime: new Date('2026-03-19T19:00:00'),
        lateRegMinutes: 60,
        alertMinutesBefore: null,
      });

      vi.setSystemTime(new Date('2026-03-19T19:52:00'));

      const result = manager.shouldAlert(tournament, settings);
      expect(result).toBe(true);
    });
  });

  // =========================================================================
  // Grupo 2: Master switch (RF-09)
  // =========================================================================
  describe('master switch — lateRegAlertEnabled', () => {

    it('deve NUNCA alertar quando lateRegAlertEnabled=false', () => {
      const settings = makeSettings({ lateRegAlertEnabled: false });
      const tournament = makeTournament({
        startTime: new Date('2026-03-19T19:00:00'),
        lateRegMinutes: 60,
        alertMinutesBefore: null,
      });

      vi.setSystemTime(new Date('2026-03-19T19:55:00')); // 5min restantes

      const result = manager.shouldAlert(tournament, settings);
      expect(result).toBe(false);
    });

    it('deve NUNCA alertar quando lateRegAlertEnabled=false mesmo com override por torneio', () => {
      const settings = makeSettings({ lateRegAlertEnabled: false });
      const tournament = makeTournament({
        startTime: new Date('2026-03-19T19:00:00'),
        lateRegMinutes: 60,
        alertMinutesBefore: 30, // override generoso
      });

      vi.setSystemTime(new Date('2026-03-19T19:35:00')); // 25min restantes, dentro do override

      const result = manager.shouldAlert(tournament, settings);
      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // Grupo 3: Deduplicacao por ID (RF-10)
  // =========================================================================
  describe('deduplicacao — cada torneio alerta UMA vez', () => {

    it('deve alertar na primeira verificacao quando dentro do threshold', () => {
      const settings = makeSettings({ lateRegAlertMinutes: 10 });
      const tournament = makeTournament({
        id: 'tour-001',
        startTime: new Date('2026-03-19T19:00:00'),
        lateRegMinutes: 60,
      });

      vi.setSystemTime(new Date('2026-03-19T19:52:00'));

      const result = manager.shouldAlert(tournament, settings);
      expect(result).toBe(true);
    });

    it('deve NAO alertar segunda vez para mesmo torneio (deduplicacao)', () => {
      const settings = makeSettings({ lateRegAlertMinutes: 10 });
      const tournament = makeTournament({
        id: 'tour-001',
        startTime: new Date('2026-03-19T19:00:00'),
        lateRegMinutes: 60,
      });

      vi.setSystemTime(new Date('2026-03-19T19:52:00'));

      // Primeiro alerta — marca como alertado
      manager.shouldAlert(tournament, settings);
      manager.markAlerted(tournament.id);

      // Segunda verificacao — deve ser bloqueada pela deduplicacao
      const result = manager.shouldAlert(tournament, settings);
      expect(result).toBe(false);
    });

    it('deve alertar torneios diferentes independentemente', () => {
      const settings = makeSettings({ lateRegAlertMinutes: 10 });
      const tour1 = makeTournament({
        id: 'tour-001',
        startTime: new Date('2026-03-19T19:00:00'),
        lateRegMinutes: 60,
      });
      const tour2 = makeTournament({
        id: 'tour-002',
        name: 'Daily $55',
        startTime: new Date('2026-03-19T19:00:00'),
        lateRegMinutes: 60,
      });

      vi.setSystemTime(new Date('2026-03-19T19:52:00'));

      // Marca tour1 como alertado
      manager.shouldAlert(tour1, settings);
      manager.markAlerted(tour1.id);

      // tour2 deve alertar normalmente
      const result = manager.shouldAlert(tour2, settings);
      expect(result).toBe(true);
    });
  });

  // =========================================================================
  // Grupo 4: Reset de deduplicacao ao editar lateRegMinutes (RF-08 + RF-10)
  // =========================================================================
  describe('reset de deduplicacao ao editar lateRegMinutes', () => {

    it('deve permitir novo alerta apos resetar ID do torneio', () => {
      const settings = makeSettings({ lateRegAlertMinutes: 10 });
      const tournament = makeTournament({
        id: 'tour-001',
        startTime: new Date('2026-03-19T19:00:00'),
        lateRegMinutes: 60,
      });

      vi.setSystemTime(new Date('2026-03-19T19:52:00'));

      // Primeiro alerta
      manager.shouldAlert(tournament, settings);
      manager.markAlerted(tournament.id);

      // Verifica que esta bloqueado
      expect(manager.shouldAlert(tournament, settings)).toBe(false);

      // Usuario editou lateRegMinutes — reseta deduplicacao
      manager.resetAlerted(tournament.id);

      // Deve poder alertar novamente (se deadline ainda valido)
      const result = manager.shouldAlert(tournament, settings);
      expect(result).toBe(true);
    });

    it('deve NAO alertar apos reset se late reg ja encerrou', () => {
      const settings = makeSettings({ lateRegAlertMinutes: 10 });
      const tournament = makeTournament({
        id: 'tour-001',
        startTime: new Date('2026-03-19T19:00:00'),
        lateRegMinutes: 30, // deadline 19:30
      });

      vi.setSystemTime(new Date('2026-03-19T20:00:00')); // ja encerrou

      manager.resetAlerted(tournament.id);
      const result = manager.shouldAlert(tournament, settings);
      expect(result).toBe(false); // late reg ja encerrou
    });
  });

  // =========================================================================
  // Grupo 5: Filtros — torneios que NAO devem alertar
  // =========================================================================
  describe('filtros — torneios excluidos de alerta', () => {

    it('deve NAO alertar torneio com status "registered"', () => {
      const settings = makeSettings({ lateRegAlertMinutes: 10 });
      const tournament = makeTournament({
        status: 'registered',
        startTime: new Date('2026-03-19T19:00:00'),
        lateRegMinutes: 60,
      });

      vi.setSystemTime(new Date('2026-03-19T19:55:00'));

      const result = manager.shouldAlert(tournament, settings);
      expect(result).toBe(false);
    });

    it('deve NAO alertar torneio com status "active"', () => {
      const settings = makeSettings({ lateRegAlertMinutes: 10 });
      const tournament = makeTournament({
        status: 'active',
        startTime: new Date('2026-03-19T19:00:00'),
        lateRegMinutes: 60,
      });

      vi.setSystemTime(new Date('2026-03-19T19:55:00'));

      const result = manager.shouldAlert(tournament, settings);
      expect(result).toBe(false);
    });

    it('deve NAO alertar torneio com status "finished"', () => {
      const settings = makeSettings({ lateRegAlertMinutes: 10 });
      const tournament = makeTournament({
        status: 'finished',
        startTime: new Date('2026-03-19T19:00:00'),
        lateRegMinutes: 60,
      });

      vi.setSystemTime(new Date('2026-03-19T19:55:00'));

      const result = manager.shouldAlert(tournament, settings);
      expect(result).toBe(false);
    });

    it('deve NAO alertar torneio sem lateRegMinutes (null)', () => {
      const settings = makeSettings({ lateRegAlertMinutes: 10 });
      const tournament = makeTournament({
        lateRegMinutes: null,
        startTime: new Date('2026-03-19T19:00:00'),
      });

      vi.setSystemTime(new Date('2026-03-19T19:55:00'));

      const result = manager.shouldAlert(tournament, settings);
      expect(result).toBe(false);
    });

    it('deve NAO alertar quando late reg ja encerrou (minutesRemaining <= 0)', () => {
      const settings = makeSettings({ lateRegAlertMinutes: 10 });
      const tournament = makeTournament({
        startTime: new Date('2026-03-19T19:00:00'),
        lateRegMinutes: 30, // deadline 19:30
      });

      vi.setSystemTime(new Date('2026-03-19T19:35:00')); // 5 min apos encerramento

      const result = manager.shouldAlert(tournament, settings);
      expect(result).toBe(false);
    });

    it('deve alertar APENAS torneios com status "upcoming"', () => {
      const settings = makeSettings({ lateRegAlertMinutes: 10 });
      const tournament = makeTournament({
        status: 'upcoming',
        startTime: new Date('2026-03-19T19:00:00'),
        lateRegMinutes: 60,
      });

      vi.setSystemTime(new Date('2026-03-19T19:52:00'));

      const result = manager.shouldAlert(tournament, settings);
      expect(result).toBe(true);
    });
  });

  // =========================================================================
  // Grupo 6: Processamento de lista de torneios (checkTournaments)
  // =========================================================================
  describe('checkTournaments — processa lista de torneios', () => {

    it('deve retornar lista de torneios que precisam alertar', () => {
      const settings = makeSettings({ lateRegAlertMinutes: 10 });
      const tournaments = [
        makeTournament({
          id: 'tour-001',
          startTime: new Date('2026-03-19T19:00:00'),
          lateRegMinutes: 60, // deadline 20:00
        }),
        makeTournament({
          id: 'tour-002',
          name: 'Daily $55',
          startTime: new Date('2026-03-19T20:00:00'),
          lateRegMinutes: 60, // deadline 21:00
        }),
        makeTournament({
          id: 'tour-003',
          name: 'Nightly $109',
          startTime: new Date('2026-03-19T21:00:00'),
          lateRegMinutes: 60, // deadline 22:00
        }),
      ];

      // 19:52 — apenas tour-001 dentro do threshold (8min restantes <= 10)
      vi.setSystemTime(new Date('2026-03-19T19:52:00'));

      const alerts = manager.checkTournaments(tournaments, settings);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].id).toBe('tour-001');
    });

    it('deve retornar lista vazia quando nenhum torneio precisa alertar', () => {
      const settings = makeSettings({ lateRegAlertMinutes: 10 });
      const tournaments = [
        makeTournament({
          id: 'tour-001',
          startTime: new Date('2026-03-19T19:00:00'),
          lateRegMinutes: 60, // deadline 20:00
        }),
      ];

      // 19:00 — 60min restantes > 10 => sem alerta
      vi.setSystemTime(new Date('2026-03-19T19:00:00'));

      const alerts = manager.checkTournaments(tournaments, settings);
      expect(alerts).toHaveLength(0);
    });

    it('deve retornar multiplos torneios quando varios estao dentro do threshold', () => {
      const settings = makeSettings({ lateRegAlertMinutes: 10 });
      const tournaments = [
        makeTournament({
          id: 'tour-001',
          startTime: new Date('2026-03-19T19:00:00'),
          lateRegMinutes: 60, // deadline 20:00
        }),
        makeTournament({
          id: 'tour-002',
          startTime: new Date('2026-03-19T19:00:00'),
          lateRegMinutes: 55, // deadline 19:55
        }),
      ];

      // 19:50 — tour-001: 10min restantes (<=10), tour-002: 5min restantes (<=10)
      vi.setSystemTime(new Date('2026-03-19T19:50:00'));

      const alerts = manager.checkTournaments(tournaments, settings);
      expect(alerts).toHaveLength(2);
    });

    it('deve excluir torneios ja alertados da lista', () => {
      const settings = makeSettings({ lateRegAlertMinutes: 10 });
      const tournaments = [
        makeTournament({
          id: 'tour-001',
          startTime: new Date('2026-03-19T19:00:00'),
          lateRegMinutes: 60,
        }),
        makeTournament({
          id: 'tour-002',
          startTime: new Date('2026-03-19T19:00:00'),
          lateRegMinutes: 55,
        }),
      ];

      vi.setSystemTime(new Date('2026-03-19T19:50:00'));

      // Marca tour-001 como ja alertado
      manager.markAlerted('tour-001');

      const alerts = manager.checkTournaments(tournaments, settings);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].id).toBe('tour-002');
    });

    it('deve ignorar torneios com status diferente de "upcoming"', () => {
      const settings = makeSettings({ lateRegAlertMinutes: 10 });
      const tournaments = [
        makeTournament({
          id: 'tour-001',
          status: 'upcoming',
          startTime: new Date('2026-03-19T19:00:00'),
          lateRegMinutes: 60,
        }),
        makeTournament({
          id: 'tour-002',
          status: 'registered',
          startTime: new Date('2026-03-19T19:00:00'),
          lateRegMinutes: 60,
        }),
        makeTournament({
          id: 'tour-003',
          status: 'active',
          startTime: new Date('2026-03-19T19:00:00'),
          lateRegMinutes: 60,
        }),
      ];

      vi.setSystemTime(new Date('2026-03-19T19:52:00'));

      const alerts = manager.checkTournaments(tournaments, settings);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].id).toBe('tour-001');
    });

    it('deve retornar lista vazia quando alertas estao desabilitados globalmente', () => {
      const settings = makeSettings({ lateRegAlertEnabled: false });
      const tournaments = [
        makeTournament({
          id: 'tour-001',
          startTime: new Date('2026-03-19T19:00:00'),
          lateRegMinutes: 60,
        }),
      ];

      vi.setSystemTime(new Date('2026-03-19T19:55:00'));

      const alerts = manager.checkTournaments(tournaments, settings);
      expect(alerts).toHaveLength(0);
    });
  });

  // =========================================================================
  // Grupo 7: Hierarquia de threshold por torneio (RF-09)
  // =========================================================================
  describe('hierarquia de threshold — override vs. default', () => {

    it('deve usar alertMinutesBefore=5 do torneio (ignora default=10)', () => {
      const settings = makeSettings({ lateRegAlertMinutes: 10 });
      const tournament = makeTournament({
        startTime: new Date('2026-03-19T19:00:00'),
        lateRegMinutes: 60, // deadline 20:00
        alertMinutesBefore: 5,
      });

      // 19:53 — faltam 7min. Override=5 => 7>5 => sem alerta
      vi.setSystemTime(new Date('2026-03-19T19:53:00'));
      expect(manager.shouldAlert(tournament, settings)).toBe(false);

      // 19:56 — faltam 4min. Override=5 => 4<=5 => alerta
      vi.setSystemTime(new Date('2026-03-19T19:56:00'));
      expect(manager.shouldAlert(tournament, settings)).toBe(true);
    });

    it('deve usar alertMinutesBefore=20 do torneio (mais generoso que default=10)', () => {
      const settings = makeSettings({ lateRegAlertMinutes: 10 });
      const tournament = makeTournament({
        startTime: new Date('2026-03-19T19:00:00'),
        lateRegMinutes: 60, // deadline 20:00
        alertMinutesBefore: 20,
      });

      // 19:42 — faltam 18min. Override=20 => 18<=20 => alerta
      vi.setSystemTime(new Date('2026-03-19T19:42:00'));
      expect(manager.shouldAlert(tournament, settings)).toBe(true);
    });

    it('deve usar default global=10 quando alertMinutesBefore=null', () => {
      const settings = makeSettings({ lateRegAlertMinutes: 10 });
      const tournament = makeTournament({
        startTime: new Date('2026-03-19T19:00:00'),
        lateRegMinutes: 60, // deadline 20:00
        alertMinutesBefore: null,
      });

      // 19:48 — faltam 12min. Default=10 => 12>10 => sem alerta
      vi.setSystemTime(new Date('2026-03-19T19:48:00'));
      expect(manager.shouldAlert(tournament, settings)).toBe(false);

      // 19:51 — faltam 9min. Default=10 => 9<=10 => alerta
      vi.setSystemTime(new Date('2026-03-19T19:51:00'));
      expect(manager.shouldAlert(tournament, settings)).toBe(true);
    });
  });

  // =========================================================================
  // Grupo 8: Edge cases
  // =========================================================================
  describe('edge cases', () => {

    it('deve lidar com late reg que cruza meia-noite', () => {
      const settings = makeSettings({ lateRegAlertMinutes: 10 });
      const tournament = makeTournament({
        startTime: new Date('2026-03-19T23:00:00'),
        lateRegMinutes: 120, // deadline 01:00 do dia 20
      });

      // 00:52 do dia 20 — faltam 8min. 8<=10 => alerta
      vi.setSystemTime(new Date('2026-03-20T00:52:00'));

      const result = manager.shouldAlert(tournament, settings);
      expect(result).toBe(true);
    });

    it('deve lidar com lista vazia de torneios', () => {
      const settings = makeSettings();
      const alerts = manager.checkTournaments([], settings);
      expect(alerts).toHaveLength(0);
    });

    it('deve lidar com 10+ torneios sem erro', () => {
      const settings = makeSettings({ lateRegAlertMinutes: 10 });
      const tournaments = Array.from({ length: 15 }, (_, i) =>
        makeTournament({
          id: `tour-${i}`,
          name: `Torneio ${i}`,
          startTime: new Date('2026-03-19T19:00:00'),
          lateRegMinutes: 60, // todos com deadline 20:00
        })
      );

      vi.setSystemTime(new Date('2026-03-19T19:52:00'));

      const alerts = manager.checkTournaments(tournaments, settings);
      expect(alerts).toHaveLength(15);
    });

    it('deve ignorar torneio com lateRegMinutes=0 (sem late reg)', () => {
      const settings = makeSettings({ lateRegAlertMinutes: 10 });
      const tournament = makeTournament({
        lateRegMinutes: 0,
        startTime: new Date('2026-03-19T19:00:00'),
      });

      vi.setSystemTime(new Date('2026-03-19T19:00:00'));

      const result = manager.shouldAlert(tournament, settings);
      expect(result).toBe(false);
    });

    it('deve limpar todo o estado ao chamar reset()', () => {
      const settings = makeSettings({ lateRegAlertMinutes: 10 });
      const tournament = makeTournament({
        id: 'tour-001',
        startTime: new Date('2026-03-19T19:00:00'),
        lateRegMinutes: 60,
      });

      vi.setSystemTime(new Date('2026-03-19T19:52:00'));

      manager.shouldAlert(tournament, settings);
      manager.markAlerted(tournament.id);

      // Verifica bloqueio
      expect(manager.shouldAlert(tournament, settings)).toBe(false);

      // Reset total (simula reload de pagina)
      manager.reset();

      // Deve poder alertar novamente
      expect(manager.shouldAlert(tournament, settings)).toBe(true);
    });
  });
});
