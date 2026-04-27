import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Cooldown-1 (MVP) — Storage methods cooldown
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-04)
// ADR : Docs/architecture/decisions/041-cooldown-dedicated-spec-and-schema.md
//
// Modulos NAO existem ainda — Implementer cria em server/storage.ts:
//   - createCooldownLog(input): CooldownLog
//   - updateCooldownLog(id, userId, patch): CooldownLog | null
//   - getCooldownLog(id, userId): CooldownLog | null
//   - getCooldownLogBySession(sessionId, userId): CooldownLog | null
//   - listCooldownLogs(userId, {page, pageSize}): {items, total, page, pageSize}
//   - createStarredHand(input): StarredHand
//   - getStarredHand(id, userId): StarredHand | null
//   - listStarredHands(userId, filter): StarredHand[]
//   - deleteStarredHand(id, userId): void
//   - countStarredHandsByTournament(sessionTournamentId, userId): number
//
// Estes testes sao SHAPE TESTS — verificam que os metodos existem com a
// assinatura esperada. Implementer implementa via Drizzle queries.
// =============================================================================

// Mock do db Drizzle nao impede o import do storage modulo (que ainda nao existe).
// Uma vez que storage.ts nao esta criado para cooldown, o import falha por
// metodo inexistente — exatamente o que queremos para red phase.

import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// CooldownLog methods
// ============================================================================

describe('storage.createCooldownLog - shape', () => {
  it('eh uma funcao exportada', () => {
    expect(typeof storage.createCooldownLog).toBe('function');
  });
});

describe('storage.updateCooldownLog - shape', () => {
  it('eh uma funcao exportada', () => {
    expect(typeof storage.updateCooldownLog).toBe('function');
  });

  it('aceita signature (id, userId, patch)', () => {
    // Smoke test — apenas chamada com 3 args nao deve crashear no parse
    const fn = storage.updateCooldownLog;
    expect(fn.length).toBeGreaterThanOrEqual(2); // pelo menos 2 args nomeados
  });
});

describe('storage.getCooldownLog - shape', () => {
  it('eh uma funcao exportada', () => {
    expect(typeof storage.getCooldownLog).toBe('function');
  });
});

describe('storage.getCooldownLogBySession - shape', () => {
  it('eh uma funcao exportada', () => {
    expect(typeof storage.getCooldownLogBySession).toBe('function');
  });
});

describe('storage.listCooldownLogs - shape', () => {
  it('eh uma funcao exportada', () => {
    expect(typeof storage.listCooldownLogs).toBe('function');
  });
});

// ============================================================================
// StarredHand methods
// ============================================================================

describe('storage.createStarredHand - shape', () => {
  it('eh uma funcao exportada', () => {
    expect(typeof storage.createStarredHand).toBe('function');
  });
});

describe('storage.getStarredHand - shape', () => {
  it('eh uma funcao exportada', () => {
    expect(typeof storage.getStarredHand).toBe('function');
  });
});

describe('storage.listStarredHands - shape', () => {
  it('eh uma funcao exportada', () => {
    expect(typeof storage.listStarredHands).toBe('function');
  });
});

describe('storage.deleteStarredHand - shape', () => {
  it('eh uma funcao exportada', () => {
    expect(typeof storage.deleteStarredHand).toBe('function');
  });
});

describe('storage.countStarredHandsByTournament - shape', () => {
  it('eh uma funcao exportada', () => {
    expect(typeof storage.countStarredHandsByTournament).toBe('function');
  });
});

// ============================================================================
// NOTA SOBRE COBERTURA DE COMPORTAMENTO
//
// Smoke tests com try/catch foram removidos para nao mascarar red-phase
// (try/catch sempre passa, dando falsa sensação de implementação completa).
//
// Comportamento concreto de cada metodo (ownership, paginacao, contagem,
// filtros) eh validado nos integration tests:
//
//   tests/integration/api/cooldown-logs.test.ts
//   tests/integration/api/starred-hands.test.ts
//
// onde os handlers de rota mockam o storage e exercitam shape esperada.
// Quando Implementer escreve as queries Drizzle reais, integration tests
// validarão comportamento end-to-end via spy do storage.
// ============================================================================
