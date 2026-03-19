import { describe, it, expect } from 'vitest';
import {
  insertTournamentSchema,
  insertTournamentTemplateSchema,
  insertUploadHistorySchema,
} from '../../../shared/schema';

// =============================================================================
// Testes de Caracterizacao: Schemas Zod de Upload/Tournaments
// Documentam o comportamento ATUAL das validacoes.
// Todos devem PASSAR com o codigo existente.
// =============================================================================

// ---------------------------------------------------------------------------
// insertTournamentSchema
// ---------------------------------------------------------------------------

describe('insertTournamentSchema', () => {
  const validTournament = {
    userId: 'USER-0001',
    name: '$22 Bounty Hunters',
    buyIn: '22.00',
    prize: '150.00',
    position: 5,
    datePlayed: new Date('2025-01-20T19:00:00'),
    site: 'GGPoker',
    format: 'MTT',
    category: 'PKO',
    speed: 'Normal',
    fieldSize: 500,
  };

  it('deve aceitar torneio com todos os campos obrigatorios', () => {
    const result = insertTournamentSchema.safeParse(validTournament);
    expect(result.success).toBe(true);
  });

  it('deve aceitar torneio com campos opcionais preenchidos', () => {
    const data = {
      ...validTournament,
      tournamentId: 'EXT-12345',
      prizePool: '50000.00',
      reentries: 2,
      finalTable: true,
      bigHit: true,
      earlyFinish: false,
      lateFinish: false,
      currency: 'USD',
      rake: '2.00',
      convertedToUSD: false,
      templateId: 'tmpl-001',
      grindSessionId: 'gs-001',
    };

    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar torneio sem userId', () => {
    const { userId, ...data } = validTournament;
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio sem name', () => {
    const { name, ...data } = validTournament;
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio sem buyIn', () => {
    const { buyIn, ...data } = validTournament;
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio sem datePlayed', () => {
    const { datePlayed, ...data } = validTournament;
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio sem site', () => {
    const { site, ...data } = validTournament;
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio sem format', () => {
    const { format, ...data } = validTournament;
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio sem category', () => {
    const { category, ...data } = validTournament;
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio sem speed', () => {
    const { speed, ...data } = validTournament;
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve aceitar buyIn como string decimal', () => {
    const data = { ...validTournament, buyIn: '55.50' };
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar prize como string decimal', () => {
    const data = { ...validTournament, prize: '1234.56' };
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar reentries como integer', () => {
    const data = { ...validTournament, reentries: 3 };
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar finalTable como boolean', () => {
    const data = { ...validTournament, finalTable: true };
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar fieldSize como integer', () => {
    const data = { ...validTournament, fieldSize: 2500 };
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// insertTournamentTemplateSchema
// ---------------------------------------------------------------------------

describe('insertTournamentTemplateSchema', () => {
  const validTemplate = {
    userId: 'USER-0001',
    name: '$22 Bounty Hunters',
    site: 'GGPoker',
    format: 'MTT',
    category: 'PKO',
    speed: 'Normal',
  };

  it('deve aceitar template com campos obrigatorios', () => {
    const result = insertTournamentTemplateSchema.safeParse(validTemplate);
    expect(result.success).toBe(true);
  });

  it('deve aceitar template com campos opcionais', () => {
    const data = {
      ...validTemplate,
      avgBuyIn: '22.00',
      avgRoi: '15.5',
      totalPlayed: 50,
      totalProfit: '1100.00',
      finalTables: 3,
      bigHits: 1,
      avgFieldSize: 500,
      dayOfWeek: [0, 1, 3],
      startTime: ['19:00', '20:00'],
      lastPlayed: new Date('2025-01-20'),
    };

    const result = insertTournamentTemplateSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar template sem userId', () => {
    const { userId, ...data } = validTemplate;
    const result = insertTournamentTemplateSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar template sem name', () => {
    const { name, ...data } = validTemplate;
    const result = insertTournamentTemplateSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar template sem site', () => {
    const { site, ...data } = validTemplate;
    const result = insertTournamentTemplateSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar template sem format', () => {
    const { format, ...data } = validTemplate;
    const result = insertTournamentTemplateSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve aceitar dayOfWeek como array de numeros', () => {
    const data = { ...validTemplate, dayOfWeek: [0, 2, 4, 6] };
    const result = insertTournamentTemplateSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar startTime como array de strings', () => {
    const data = { ...validTemplate, startTime: ['18:00', '19:30', '21:00'] };
    const result = insertTournamentTemplateSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// insertUploadHistorySchema
// ---------------------------------------------------------------------------

describe('insertUploadHistorySchema', () => {
  const validUpload = {
    userId: 'user-uuid-001',
    filename: 'pokerstars_2025.csv',
    status: 'success',
  };

  it('deve aceitar upload com campos obrigatorios', () => {
    const result = insertUploadHistorySchema.safeParse(validUpload);
    expect(result.success).toBe(true);
  });

  it('deve aceitar upload com campos opcionais', () => {
    const data = {
      ...validUpload,
      tournamentsCount: 50,
      errorMessage: null,
      duplicatesFound: 3,
      duplicateAction: 'import_new_only',
    };

    const result = insertUploadHistorySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar upload sem userId', () => {
    const { userId, ...data } = validUpload;
    const result = insertUploadHistorySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar upload sem filename', () => {
    const { filename, ...data } = validUpload;
    const result = insertUploadHistorySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar upload sem status', () => {
    const { status, ...data } = validUpload;
    const result = insertUploadHistorySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve aceitar status "error"', () => {
    const data = { ...validUpload, status: 'error', errorMessage: 'Failed to parse' };
    const result = insertUploadHistorySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar status "processing"', () => {
    const data = { ...validUpload, status: 'processing' };
    const result = insertUploadHistorySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar tournamentsCount como integer', () => {
    const data = { ...validUpload, tournamentsCount: 100 };
    const result = insertUploadHistorySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar duplicatesFound como integer', () => {
    const data = { ...validUpload, duplicatesFound: 5 };
    const result = insertUploadHistorySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar duplicateAction como string livre', () => {
    const data = { ...validUpload, duplicateAction: 'import_all' };
    const result = insertUploadHistorySchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});
