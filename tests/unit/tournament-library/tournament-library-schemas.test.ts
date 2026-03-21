import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: Schemas Zod da Biblioteca de Torneios v2
//
// As tabelas tournament_library e tournament_library_settings AINDA NAO EXISTEM
// no shared/schema.ts. O Implementer vai cria-las.
//
// Todos os testes devem FALHAR (red phase).
// =============================================================================

// ---------------------------------------------------------------------------
// Imports dos schemas que AINDA NAO EXISTEM — serao criados pelo Implementer
// ---------------------------------------------------------------------------
import {
  insertTournamentLibrarySchema,
  insertTournamentLibrarySettingsSchema,
} from '../../../shared/schema';

// =============================================================================
// Grupo 1: insertTournamentLibrarySchema
// =============================================================================

describe('insertTournamentLibrarySchema', () => {
  const validTournament = {
    userId: 'USER-0001',
    name: 'Daily $22 PKO',
    site: 'GGPoker',
    buyIn: '22.00',
  };

  // -------------------------------------------------------------------------
  // Happy path — campos obrigatorios
  // -------------------------------------------------------------------------

  it('deve aceitar torneio com campos obrigatorios (name, site, buyIn, userId)', () => {
    const result = insertTournamentLibrarySchema.safeParse(validTournament);
    expect(result.success).toBe(true);
  });

  it('deve aceitar torneio com todos os campos opcionais preenchidos', () => {
    const data = {
      ...validTournament,
      guaranteed: '50000.00',
      time: '20:00',
      type: 'PKO',
      speed: 'Normal',
      fieldSize: 1500,
      source: 'suprema',
      externalId: 'suprema-12345',
    };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar torneio sem campos opcionais (todos nullable/optional)', () => {
    const result = insertTournamentLibrarySchema.safeParse(validTournament);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.guaranteed).toBeUndefined();
      expect(result.data.time).toBeUndefined();
      expect(result.data.type).toBeUndefined();
      expect(result.data.speed).toBeUndefined();
      expect(result.data.fieldSize).toBeUndefined();
      expect(result.data.externalId).toBeUndefined();
    }
  });

  // -------------------------------------------------------------------------
  // Campos obrigatorios — rejeicao
  // -------------------------------------------------------------------------

  it('deve rejeitar torneio sem userId', () => {
    const { userId, ...data } = validTournament;
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio sem name', () => {
    const { name, ...data } = validTournament;
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio sem site', () => {
    const { site, ...data } = validTournament;
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio sem buyIn', () => {
    const { buyIn, ...data } = validTournament;
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // buyIn — validacao de valor
  // -------------------------------------------------------------------------

  it('deve rejeitar buyIn igual a 0', () => {
    const data = { ...validTournament, buyIn: '0' };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar buyIn negativo', () => {
    const data = { ...validTournament, buyIn: '-5.00' };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve aceitar buyIn positivo como decimal string', () => {
    const data = { ...validTournament, buyIn: '0.50' };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar buyIn alto', () => {
    const data = { ...validTournament, buyIn: '10000.00' };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // name — validacao
  // -------------------------------------------------------------------------

  it('deve rejeitar name vazio', () => {
    const data = { ...validTournament, name: '' };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve aceitar name com caracteres especiais', () => {
    const data = { ...validTournament, name: '$22 Daily PKO - R&A' };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // source — enum validation
  // -------------------------------------------------------------------------

  it('deve aceitar source "manual"', () => {
    const data = { ...validTournament, source: 'manual' };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar source "suprema"', () => {
    const data = { ...validTournament, source: 'suprema' };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar source "grind-live"', () => {
    const data = { ...validTournament, source: 'grind-live' };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar source invalido', () => {
    const data = { ...validTournament, source: 'csv-upload' };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar source vazio', () => {
    const data = { ...validTournament, source: '' };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // type — enum validation (nullable)
  // -------------------------------------------------------------------------

  it('deve aceitar type "PKO"', () => {
    const data = { ...validTournament, type: 'PKO' };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar type "Vanilla"', () => {
    const data = { ...validTournament, type: 'Vanilla' };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar type "Mystery"', () => {
    const data = { ...validTournament, type: 'Mystery' };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar type null', () => {
    const data = { ...validTournament, type: null };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar type invalido', () => {
    const data = { ...validTournament, type: 'Bounty' };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar type com string vazia', () => {
    const data = { ...validTournament, type: '' };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // speed — enum validation (nullable)
  // -------------------------------------------------------------------------

  it('deve aceitar speed "Normal"', () => {
    const data = { ...validTournament, speed: 'Normal' };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar speed "Turbo"', () => {
    const data = { ...validTournament, speed: 'Turbo' };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar speed "Hyper"', () => {
    const data = { ...validTournament, speed: 'Hyper' };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar speed null', () => {
    const data = { ...validTournament, speed: null };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar speed invalido', () => {
    const data = { ...validTournament, speed: 'Regular' };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar speed "Slow"', () => {
    const data = { ...validTournament, speed: 'Slow' };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // deletedAt — nullable (null = ativo, timestamp = lixeira)
  // -------------------------------------------------------------------------

  it('deve aceitar deletedAt como null (torneio ativo)', () => {
    const data = { ...validTournament, deletedAt: null };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar deletedAt como Date (torneio na lixeira)', () => {
    const data = { ...validTournament, deletedAt: new Date() };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Campos opcionais — aceitacao
  // -------------------------------------------------------------------------

  it('deve aceitar guaranteed como decimal string', () => {
    const data = { ...validTournament, guaranteed: '100000.00' };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar time como string HH:mm', () => {
    const data = { ...validTournament, time: '20:30' };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar fieldSize como integer positivo', () => {
    const data = { ...validTournament, fieldSize: 2500 };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar externalId como string (suprema-{id})', () => {
    const data = { ...validTournament, externalId: 'suprema-98765' };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar externalId como null (torneio manual)', () => {
    const data = { ...validTournament, externalId: null };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// Grupo 2: insertTournamentLibrarySettingsSchema
// =============================================================================

describe('insertTournamentLibrarySettingsSchema', () => {
  const validSettings = {
    userId: 'USER-0001',
  };

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('deve aceitar settings com apenas userId (campos opcionais tem defaults)', () => {
    const result = insertTournamentLibrarySettingsSchema.safeParse(validSettings);
    expect(result.success).toBe(true);
  });

  it('deve aceitar settings com todos os campos preenchidos', () => {
    const data = {
      ...validSettings,
      autoImportSuprema: true,
      lastSupremaSync: new Date(),
      lastSupremaSyncStatus: 'success',
    };
    const result = insertTournamentLibrarySettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Campos obrigatorios
  // -------------------------------------------------------------------------

  it('deve rejeitar settings sem userId', () => {
    const result = insertTournamentLibrarySettingsSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // autoImportSuprema — boolean com default false
  // -------------------------------------------------------------------------

  it('deve aceitar autoImportSuprema true', () => {
    const data = { ...validSettings, autoImportSuprema: true };
    const result = insertTournamentLibrarySettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar autoImportSuprema false', () => {
    const data = { ...validSettings, autoImportSuprema: false };
    const result = insertTournamentLibrarySettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve usar default false para autoImportSuprema quando nao informado', () => {
    const result = insertTournamentLibrarySettingsSchema.safeParse(validSettings);
    expect(result.success).toBe(true);
    // O Implementer deve garantir que o default e false no schema Drizzle
  });

  // -------------------------------------------------------------------------
  // lastSupremaSync — nullable timestamp
  // -------------------------------------------------------------------------

  it('deve aceitar lastSupremaSync como null', () => {
    const data = { ...validSettings, lastSupremaSync: null };
    const result = insertTournamentLibrarySettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar lastSupremaSync como Date', () => {
    const data = { ...validSettings, lastSupremaSync: new Date('2026-03-21T10:00:00Z') };
    const result = insertTournamentLibrarySettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // lastSupremaSyncStatus — enum nullable
  // -------------------------------------------------------------------------

  it('deve aceitar lastSupremaSyncStatus "success"', () => {
    const data = { ...validSettings, lastSupremaSyncStatus: 'success' };
    const result = insertTournamentLibrarySettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar lastSupremaSyncStatus "error"', () => {
    const data = { ...validSettings, lastSupremaSyncStatus: 'error' };
    const result = insertTournamentLibrarySettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar lastSupremaSyncStatus null', () => {
    const data = { ...validSettings, lastSupremaSyncStatus: null };
    const result = insertTournamentLibrarySettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});
