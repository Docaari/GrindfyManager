import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Coach-2B / RF-04 — register_tournament_in_grade (write tool)
//
// Auto-fill de campos opcionais via templateId. XOR templateId/manualEntry
// (Zod superRefine).
// =============================================================================

const getLibraryTemplateMock = vi.fn();
const createPlannedTournamentMock = vi.fn();
const deletePlannedTournamentMock = vi.fn();

vi.mock('../../../server/storage', () => ({
  storage: {
    getLibraryTemplate: getLibraryTemplateMock,
    createPlannedTournament: createPlannedTournamentMock,
    deletePlannedTournament: deletePlannedTournamentMock,
  },
}));

const ctx = { userId: 'USER-0001', chatSessionId: 's', messageId: 'm', actionId: 'a' };

beforeEach(() => {
  getLibraryTemplateMock.mockReset();
  createPlannedTournamentMock.mockReset();
  deletePlannedTournamentMock.mockReset();
});

describe('register_tournament_in_grade — Zod XOR', () => {
  it('templateId E manualEntry simultaneos => rejeita (Zod superRefine)', async () => {
    const { registerTournamentInGradeTool } =
      await import('../../../server/coachTools/handlers/registerTournamentInGrade');
    const out = registerTournamentInGradeTool.inputSchema.safeParse({
      templateId: 't-1',
      manualEntry: { site: 'Stars', name: 'Big', time: '19:00', type: 'Vanilla', speed: 'Normal', buyIn: 22 },
      dayOfWeek: 1,
    });
    expect(out.success).toBe(false);
  });

  it('nem templateId nem manualEntry => rejeita', async () => {
    const { registerTournamentInGradeTool } =
      await import('../../../server/coachTools/handlers/registerTournamentInGrade');
    const out = registerTournamentInGradeTool.inputSchema.safeParse({ dayOfWeek: 1 });
    expect(out.success).toBe(false);
  });

  it('aceita templateId puro', async () => {
    const { registerTournamentInGradeTool } =
      await import('../../../server/coachTools/handlers/registerTournamentInGrade');
    const out = registerTournamentInGradeTool.inputSchema.safeParse({
      templateId: 't-1', dayOfWeek: 1, profile: 'A',
    });
    expect(out.success).toBe(true);
  });

  it('rejeita dayOfWeek > 6', async () => {
    const { registerTournamentInGradeTool } =
      await import('../../../server/coachTools/handlers/registerTournamentInGrade');
    const out = registerTournamentInGradeTool.inputSchema.safeParse({
      templateId: 't-1', dayOfWeek: 7,
    });
    expect(out.success).toBe(false);
  });

  it('rejeita time formato invalido', async () => {
    const { registerTournamentInGradeTool } =
      await import('../../../server/coachTools/handlers/registerTournamentInGrade');
    const out = registerTournamentInGradeTool.inputSchema.safeParse({
      manualEntry: {
        site: 'Stars', name: 'Big', time: '7pm',
        type: 'Vanilla', speed: 'Normal', buyIn: 22,
      },
      dayOfWeek: 1,
    });
    expect(out.success).toBe(false);
  });
});

describe('register_tournament_in_grade.executeConfirmed', () => {
  it('templateId valido => auto-fill de campos da library', async () => {
    getLibraryTemplateMock.mockResolvedValue({
      id: 't-1', name: 'Big $22', site: 'PokerStars', buyIn: 22,
      guaranteed: 50000, lateRegMinutes: 90, startingStack: 5000,
      gameType: 'NLH', allowsAddOn: false, allowsReentry: true,
      type: 'PKO', speed: 'Normal', userId: null, // public template
    });
    createPlannedTournamentMock.mockResolvedValue({
      id: 'pt-x', name: 'Big $22', site: 'PokerStars', dayOfWeek: 1, time: '19:00',
    });
    const { registerTournamentInGradeTool } =
      await import('../../../server/coachTools/handlers/registerTournamentInGrade');
    const tx = { query: vi.fn() };
    const out = await registerTournamentInGradeTool.executeConfirmed(
      { templateId: 't-1', dayOfWeek: 1, profile: 'A', prioridade: 2 },
      ctx as any, tx,
    );
    expect(out.affectedEntityType).toMatch(/planned_tournament/);
    expect(out.affectedEntityId).toBe('pt-x');
    expect(createPlannedTournamentMock).toHaveBeenCalled();
    const created = createPlannedTournamentMock.mock.calls[0][0];
    expect(created.name).toBe('Big $22');
    expect(created.libraryTemplateId).toBe('t-1');
  });

  it('templateId privado de outro user => template_not_accessible', async () => {
    getLibraryTemplateMock.mockResolvedValue({
      id: 't-2', name: 'Private', userId: 'USER-OTHER',
    });
    const { registerTournamentInGradeTool } =
      await import('../../../server/coachTools/handlers/registerTournamentInGrade');
    const tx = { query: vi.fn() };
    await expect(registerTournamentInGradeTool.executeConfirmed(
      { templateId: 't-2', dayOfWeek: 1, profile: 'A', prioridade: 2 },
      ctx as any, tx,
    )).rejects.toThrow(/template_not_accessible/);
  });

  it('templateId inexistente => template_not_accessible/not_found', async () => {
    getLibraryTemplateMock.mockResolvedValue(undefined);
    const { registerTournamentInGradeTool } =
      await import('../../../server/coachTools/handlers/registerTournamentInGrade');
    const tx = { query: vi.fn() };
    await expect(registerTournamentInGradeTool.executeConfirmed(
      { templateId: 't-NOPE', dayOfWeek: 1, profile: 'A', prioridade: 2 },
      ctx as any, tx,
    )).rejects.toThrow();
  });

  it('manualEntry sem templateId cria row sem libraryTemplateId', async () => {
    createPlannedTournamentMock.mockResolvedValue({
      id: 'pt-m', name: 'Custom', site: 'GG',
    });
    const { registerTournamentInGradeTool } =
      await import('../../../server/coachTools/handlers/registerTournamentInGrade');
    const tx = { query: vi.fn() };
    await registerTournamentInGradeTool.executeConfirmed(
      {
        manualEntry: {
          site: 'GG', name: 'Custom', time: '20:00',
          type: 'Vanilla', speed: 'Normal', buyIn: 11,
        },
        dayOfWeek: 2, profile: 'B', prioridade: 1,
      },
      ctx as any, tx,
    );
    const created = createPlannedTournamentMock.mock.calls[0][0];
    expect(created.libraryTemplateId).toBeFalsy();
    expect(created.name).toBe('Custom');
  });
});

describe('register_tournament_in_grade.undo', () => {
  it('DELETE row planned_tournaments', async () => {
    deletePlannedTournamentMock.mockResolvedValue({ deleted: 1 });
    const { registerTournamentInGradeTool } =
      await import('../../../server/coachTools/handlers/registerTournamentInGrade');
    const tx = { query: vi.fn() };
    await registerTournamentInGradeTool.undo(
      null,
      { id: 'pt-x', name: 'Big $22' },
      ctx as any, tx,
    );
    expect(deletePlannedTournamentMock).toHaveBeenCalled();
    const args = deletePlannedTournamentMock.mock.calls[0];
    expect(args[0]).toBe('pt-x');
  });
});
