import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: FP-15 — Logica de persistencia do warm-up (DB vs localStorage)
//
// Funcoes puras que decidem de onde ler/escrever dados de warm-up:
//   - `shouldUseDBWarmup(dbData, localData)` — true se DB mais recente
//   - `isWarmupRecent(warmupDate, maxHours)` — true se dentro do periodo
//   - `mergeWarmupSources(dbData, localData)` — merge priorizando DB
//
// Modulo esperado: `client/src/lib/warmup-persistence-helpers.ts`
//
// Fonte de verdade: spec RF-15, RF-16, RF-17
// Schema: preparation_logs (mentalState, focusLevel, confidenceLevel,
//         exercisesCompleted, warmupCompleted, sessionGoals, createdAt)
//
// Todos devem FALHAR (red phase) — funcoes ainda nao existem.
// =============================================================================

// Tipos esperados
interface WarmupData {
  mentalState: number;
  focusLevel: number;
  confidenceLevel: number;
  exercisesCompleted: string[];
  warmupCompleted: boolean;
  sessionGoals?: string;
  createdAt?: string; // ISO date
}

// Stubs para compilacao — Implementer substituira
let shouldUseDBWarmup: (dbData: WarmupData | null, localData: WarmupData | null) => boolean;
let isWarmupRecent: (warmupDate: string, maxHours?: number) => boolean;
let mergeWarmupSources: (dbData: WarmupData | null, localData: WarmupData | null) => WarmupData | null;

try {
  const mod = require('../../../client/src/lib/warmup-persistence-helpers');
  if (mod.shouldUseDBWarmup) shouldUseDBWarmup = mod.shouldUseDBWarmup;
  if (mod.isWarmupRecent) isWarmupRecent = mod.isWarmupRecent;
  if (mod.mergeWarmupSources) mergeWarmupSources = mod.mergeWarmupSources;
} catch {
  // Esperado em red phase
}

// ---------------------------------------------------------------------------
// shouldUseDBWarmup — decide se deve usar dados do banco
// ---------------------------------------------------------------------------

describe('shouldUseDBWarmup', () => {
  it('deve retornar false quando DB nao tem dados (null)', () => {
    const localData: WarmupData = {
      mentalState: 7, focusLevel: 8, confidenceLevel: 6,
      exercisesCompleted: ['respiracao'], warmupCompleted: true,
      createdAt: '2026-04-08T10:00:00Z',
    };
    expect(shouldUseDBWarmup(null, localData)).toBe(false);
  });

  it('deve retornar true quando DB tem dados e local nao tem', () => {
    const dbData: WarmupData = {
      mentalState: 7, focusLevel: 8, confidenceLevel: 6,
      exercisesCompleted: ['respiracao'], warmupCompleted: true,
      createdAt: '2026-04-08T10:00:00Z',
    };
    expect(shouldUseDBWarmup(dbData, null)).toBe(true);
  });

  it('deve retornar true quando DB tem dados mais recentes que local', () => {
    const dbData: WarmupData = {
      mentalState: 7, focusLevel: 8, confidenceLevel: 6,
      exercisesCompleted: ['respiracao'], warmupCompleted: true,
      createdAt: '2026-04-08T14:00:00Z',
    };
    const localData: WarmupData = {
      mentalState: 5, focusLevel: 6, confidenceLevel: 4,
      exercisesCompleted: [], warmupCompleted: false,
      createdAt: '2026-04-08T10:00:00Z',
    };
    expect(shouldUseDBWarmup(dbData, localData)).toBe(true);
  });

  it('deve retornar false quando local tem dados mais recentes que DB', () => {
    const dbData: WarmupData = {
      mentalState: 7, focusLevel: 8, confidenceLevel: 6,
      exercisesCompleted: ['respiracao'], warmupCompleted: true,
      createdAt: '2026-04-08T08:00:00Z',
    };
    const localData: WarmupData = {
      mentalState: 9, focusLevel: 9, confidenceLevel: 8,
      exercisesCompleted: ['respiracao', 'visualizacao'], warmupCompleted: true,
      createdAt: '2026-04-08T14:00:00Z',
    };
    expect(shouldUseDBWarmup(dbData, localData)).toBe(false);
  });

  it('deve retornar false quando ambos sao null', () => {
    expect(shouldUseDBWarmup(null, null)).toBe(false);
  });

  it('deve retornar true quando DB tem dados e local nao tem createdAt', () => {
    const dbData: WarmupData = {
      mentalState: 7, focusLevel: 8, confidenceLevel: 6,
      exercisesCompleted: ['respiracao'], warmupCompleted: true,
      createdAt: '2026-04-08T10:00:00Z',
    };
    const localData: WarmupData = {
      mentalState: 5, focusLevel: 6, confidenceLevel: 4,
      exercisesCompleted: [], warmupCompleted: false,
      // sem createdAt
    };
    expect(shouldUseDBWarmup(dbData, localData)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isWarmupRecent — verifica se warm-up esta dentro do periodo maximo
// ---------------------------------------------------------------------------

describe('isWarmupRecent', () => {
  it('deve retornar true quando warmup foi feito ha menos de 4 horas (default)', () => {
    // Simula warmup feito 2 horas atras
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    expect(isWarmupRecent(twoHoursAgo.toISOString())).toBe(true);
  });

  it('deve retornar false quando warmup foi feito ha mais de 4 horas (default)', () => {
    const now = new Date();
    const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000);
    expect(isWarmupRecent(fiveHoursAgo.toISOString())).toBe(false);
  });

  it('deve respeitar maxHours customizado', () => {
    const now = new Date();
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    expect(isWarmupRecent(threeHoursAgo.toISOString(), 2)).toBe(false);
    expect(isWarmupRecent(threeHoursAgo.toISOString(), 4)).toBe(true);
  });

  it('deve retornar true quando warmup e exatamente agora', () => {
    expect(isWarmupRecent(new Date().toISOString())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// mergeWarmupSources — merge DB e localStorage priorizando DB
// ---------------------------------------------------------------------------

describe('mergeWarmupSources', () => {
  it('deve retornar null quando ambas as fontes sao null', () => {
    expect(mergeWarmupSources(null, null)).toBeNull();
  });

  it('deve retornar dbData quando local e null', () => {
    const dbData: WarmupData = {
      mentalState: 7, focusLevel: 8, confidenceLevel: 6,
      exercisesCompleted: ['respiracao'], warmupCompleted: true,
      createdAt: '2026-04-08T10:00:00Z',
    };
    const result = mergeWarmupSources(dbData, null);
    expect(result).toEqual(dbData);
  });

  it('deve retornar localData quando DB e null (fallback)', () => {
    const localData: WarmupData = {
      mentalState: 5, focusLevel: 6, confidenceLevel: 4,
      exercisesCompleted: [], warmupCompleted: false,
    };
    const result = mergeWarmupSources(null, localData);
    expect(result).toEqual(localData);
  });

  it('deve priorizar DB quando ambos tem dados', () => {
    const dbData: WarmupData = {
      mentalState: 8, focusLevel: 9, confidenceLevel: 7,
      exercisesCompleted: ['respiracao', 'visualizacao'], warmupCompleted: true,
      createdAt: '2026-04-08T14:00:00Z',
    };
    const localData: WarmupData = {
      mentalState: 5, focusLevel: 6, confidenceLevel: 4,
      exercisesCompleted: [], warmupCompleted: false,
      createdAt: '2026-04-08T10:00:00Z',
    };
    const result = mergeWarmupSources(dbData, localData);
    expect(result!.mentalState).toBe(8);
    expect(result!.focusLevel).toBe(9);
    expect(result!.warmupCompleted).toBe(true);
  });

  it('deve usar fallback de local para campos faltando no DB', () => {
    const dbData: WarmupData = {
      mentalState: 8, focusLevel: 9, confidenceLevel: 7,
      exercisesCompleted: ['respiracao'], warmupCompleted: true,
      createdAt: '2026-04-08T14:00:00Z',
      // sem sessionGoals
    };
    const localData: WarmupData = {
      mentalState: 5, focusLevel: 6, confidenceLevel: 4,
      exercisesCompleted: [], warmupCompleted: false,
      sessionGoals: 'Focar em ICM spots',
    };
    const result = mergeWarmupSources(dbData, localData);
    expect(result!.sessionGoals).toBe('Focar em ICM spots');
  });
});
