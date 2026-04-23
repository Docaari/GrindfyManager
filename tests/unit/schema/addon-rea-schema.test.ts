import { describe, it, expect } from 'vitest';
import {
  insertSessionTournamentSchema,
  insertPlannedTournamentSchema,
  insertTournamentLibrarySchema,
  insertTournamentSchema,
} from '../../../shared/schema';

// =============================================================================
// Testes TDD: Add-on + Re-entry schema (ADR-014 / Spec 1)
//
// Novos campos esperados (sera criado pelo implementer em shared/schema.ts):
//
//   tournament_library      <- allowsAddOn, addOnCost, allowsReentry, maxReentries
//   planned_tournaments     <- allowsAddOn, addOnCost, allowsReentry, maxReentries
//   session_tournaments     <- allowsAddOn, addOnCost, addOnTaken, allowsReentry,
//                              maxReentries, reentries
//   tournaments (historico) <- allowsAddOn, addOnCost, addOnTaken, allowsReentry,
//                              maxReentries (reentries ja existia)
//
// Refinements cruzados (Zod):
//   - addOnTaken=true exige allowsAddOn=true
//   - addOnTaken=true exige addOnCost > 0 (nao null, nao zero)
//   - reentries>0 exige allowsReentry=true
//   - maxReentries != null => reentries <= maxReentries
//   - maxReentries >= 0 (nao negativo)
//
// Modo: TDD - todos os testes devem FALHAR ate o implementer aplicar Spec 1.
// =============================================================================

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const baseSessionTournament = {
  userId: 'USER-0001',
  sessionId: 'session-001',
  site: 'PokerStars',
  buyIn: '22.00',
};

const basePlannedTournament = {
  userId: 'USER-0001',
  dayOfWeek: 2,
  site: 'PokerStars',
  time: '19:00',
  type: 'PKO',
  speed: 'Normal',
  name: 'Big $22',
  buyIn: '22.00',
};

const baseTournamentLibrary = {
  userId: 'USER-0001',
  name: 'Big $22',
  site: 'PokerStars',
  buyIn: '22.00',
};

const baseTournament = {
  userId: 'USER-0001',
  name: 'Super Tuesday $109',
  buyIn: '109.00',
  datePlayed: new Date('2026-03-15T19:00:00Z'),
  site: 'PokerStars',
  format: 'MTT',
  category: 'Vanilla',
  speed: 'Normal',
};

// ===========================================================================
// insertSessionTournamentSchema - novos campos
// ===========================================================================

describe('insertSessionTournamentSchema - Add-on fields', () => {
  it('deve aceitar allowsAddOn=true', () => {
    const data = { ...baseSessionTournament, allowsAddOn: true, addOnCost: '22.00' };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar allowsAddOn=false explicito', () => {
    const data = { ...baseSessionTournament, allowsAddOn: false };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar addOnCost como string decimal', () => {
    const data = { ...baseSessionTournament, allowsAddOn: true, addOnCost: '15.50' };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar addOnCost como number e serializar como string', () => {
    const data = { ...baseSessionTournament, allowsAddOn: true, addOnCost: 22 };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar addOnCost como null', () => {
    const data = { ...baseSessionTournament, allowsAddOn: true, addOnCost: null };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar addOnTaken=true quando allowsAddOn=true e addOnCost>0', () => {
    const data = {
      ...baseSessionTournament,
      allowsAddOn: true,
      addOnCost: '22.00',
      addOnTaken: true,
    };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar defaults: allowsAddOn=false, addOnTaken=false quando omitidos', () => {
    const result = insertSessionTournamentSchema.safeParse(baseSessionTournament);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.allowsAddOn ?? false).toBe(false);
      expect(result.data.addOnTaken ?? false).toBe(false);
    }
  });
});

describe('insertSessionTournamentSchema - Re-entry fields', () => {
  it('deve aceitar allowsReentry=true', () => {
    const data = { ...baseSessionTournament, allowsReentry: true };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar allowsReentry=false explicito', () => {
    const data = { ...baseSessionTournament, allowsReentry: false };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar maxReentries como numero inteiro positivo', () => {
    const data = { ...baseSessionTournament, allowsReentry: true, maxReentries: 3 };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar maxReentries=null (ilimitado)', () => {
    const data = { ...baseSessionTournament, allowsReentry: true, maxReentries: null };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar reentries=0 default', () => {
    const data = { ...baseSessionTournament, reentries: 0 };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar reentries positivo quando allowsReentry=true', () => {
    const data = {
      ...baseSessionTournament,
      allowsReentry: true,
      maxReentries: 5,
      reentries: 2,
    };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar reentries=10 com maxReentries=null (ilimitado)', () => {
    const data = {
      ...baseSessionTournament,
      allowsReentry: true,
      maxReentries: null,
      reentries: 10,
    };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

describe('insertSessionTournamentSchema - Refinements cruzados (rejeicoes)', () => {
  it('deve rejeitar addOnTaken=true com allowsAddOn=false', () => {
    const data = {
      ...baseSessionTournament,
      allowsAddOn: false,
      addOnTaken: true,
      addOnCost: '22.00',
    };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('addOnTaken'))).toBe(true);
    }
  });

  it('deve rejeitar addOnTaken=true com addOnCost=null', () => {
    const data = {
      ...baseSessionTournament,
      allowsAddOn: true,
      addOnCost: null,
      addOnTaken: true,
    };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar addOnTaken=true com addOnCost=0', () => {
    const data = {
      ...baseSessionTournament,
      allowsAddOn: true,
      addOnCost: '0',
      addOnTaken: true,
    };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar addOnTaken=true com addOnCost="0.00"', () => {
    const data = {
      ...baseSessionTournament,
      allowsAddOn: true,
      addOnCost: '0.00',
      addOnTaken: true,
    };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar reentries>0 com allowsReentry=false', () => {
    const data = {
      ...baseSessionTournament,
      allowsReentry: false,
      reentries: 1,
    };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('reentries'))).toBe(true);
    }
  });

  it('deve rejeitar reentries=3 com maxReentries=2', () => {
    const data = {
      ...baseSessionTournament,
      allowsReentry: true,
      maxReentries: 2,
      reentries: 3,
    };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) =>
          String(i.message).toLowerCase().includes('max')
        )
      ).toBe(true);
    }
  });

  it('deve rejeitar reentries=5 com maxReentries=4', () => {
    const data = {
      ...baseSessionTournament,
      allowsReentry: true,
      maxReentries: 4,
      reentries: 5,
    };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve aceitar reentries=maxReentries no limite exato', () => {
    const data = {
      ...baseSessionTournament,
      allowsReentry: true,
      maxReentries: 3,
      reentries: 3,
    };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar maxReentries negativo', () => {
    const data = {
      ...baseSessionTournament,
      allowsReentry: true,
      maxReentries: -1,
    };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar reentries negativo', () => {
    const data = {
      ...baseSessionTournament,
      allowsReentry: true,
      reentries: -1,
    };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// ===========================================================================
// insertPlannedTournamentSchema - novos campos
// ===========================================================================

describe('insertPlannedTournamentSchema - Add-on/Re-entry config', () => {
  it('deve aceitar allowsAddOn e addOnCost', () => {
    const data = {
      ...basePlannedTournament,
      allowsAddOn: true,
      addOnCost: '22.00',
    };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar allowsReentry e maxReentries', () => {
    const data = {
      ...basePlannedTournament,
      allowsReentry: true,
      maxReentries: 3,
    };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar maxReentries=null (ilimitado)', () => {
    const data = {
      ...basePlannedTournament,
      allowsReentry: true,
      maxReentries: null,
    };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar as quatro flags simultaneas (Plus + ReA)', () => {
    const data = {
      ...basePlannedTournament,
      allowsAddOn: true,
      addOnCost: '22.00',
      allowsReentry: true,
      maxReentries: 5,
    };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar sem flags (defaults false/null)', () => {
    const result = insertPlannedTournamentSchema.safeParse(basePlannedTournament);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar maxReentries negativo', () => {
    const data = {
      ...basePlannedTournament,
      allowsReentry: true,
      maxReentries: -2,
    };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// ===========================================================================
// insertTournamentLibrarySchema - novos campos
// ===========================================================================

describe('insertTournamentLibrarySchema - Add-on/Re-entry config', () => {
  it('deve aceitar allowsAddOn e addOnCost', () => {
    const data = {
      ...baseTournamentLibrary,
      allowsAddOn: true,
      addOnCost: '22.00',
    };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar allowsReentry e maxReentries', () => {
    const data = {
      ...baseTournamentLibrary,
      allowsReentry: true,
      maxReentries: 4,
    };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar addOnCost=null explicito com allowsAddOn=true', () => {
    const data = {
      ...baseTournamentLibrary,
      allowsAddOn: true,
      addOnCost: null,
    };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar maxReentries=null (ilimitado)', () => {
    const data = {
      ...baseTournamentLibrary,
      allowsReentry: true,
      maxReentries: null,
    };
    const result = insertTournamentLibrarySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('NAO deve aceitar addOnTaken na library (apenas em instancias de jogo)', () => {
    // addOnTaken nao faz sentido em library (template, nao instancia).
    // A Spec 1 documenta que a library so tem caracteristicas, nao instancia.
    // Se o campo for enviado, deve ser ignorado pelo schema omit/strict
    // OU o schema deve rejeitar. Teste verifica que o parse nao explode e
    // nao retorna addOnTaken no output.
    const data = {
      ...baseTournamentLibrary,
      allowsAddOn: true,
      addOnTaken: true, // campo ilegal em library
    };
    const result = insertTournamentLibrarySchema.safeParse(data);
    // Seja rejeitado ou aceito strippando; o output NUNCA deve conter addOnTaken.
    if (result.success) {
      expect((result.data as any).addOnTaken).toBeUndefined();
    }
  });

  it('NAO deve aceitar reentries na library', () => {
    const data = {
      ...baseTournamentLibrary,
      allowsReentry: true,
      reentries: 2, // campo ilegal em library
    };
    const result = insertTournamentLibrarySchema.safeParse(data);
    if (result.success) {
      expect((result.data as any).reentries).toBeUndefined();
    }
  });
});

// ===========================================================================
// insertTournamentSchema (historico) - novos campos
// ===========================================================================

describe('insertTournamentSchema (historico) - Add-on/Re-entry', () => {
  it('deve aceitar allowsAddOn, addOnCost, addOnTaken', () => {
    const data = {
      ...baseTournament,
      allowsAddOn: true,
      addOnCost: '109.00',
      addOnTaken: true,
    };
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar allowsReentry e maxReentries', () => {
    const data = {
      ...baseTournament,
      allowsReentry: true,
      maxReentries: 3,
    };
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve usar campo reentries ja existente em tournaments', () => {
    const data = {
      ...baseTournament,
      allowsReentry: true,
      maxReentries: 3,
      reentries: 2,
    };
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar addOnTaken sem allowsAddOn no historico', () => {
    const data = {
      ...baseTournament,
      allowsAddOn: false,
      addOnTaken: true,
      addOnCost: '10.00',
    };
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar reentries>0 sem allowsReentry no historico', () => {
    const data = {
      ...baseTournament,
      allowsReentry: false,
      reentries: 2,
    };
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar reentries>maxReentries no historico', () => {
    const data = {
      ...baseTournament,
      allowsReentry: true,
      maxReentries: 2,
      reentries: 5,
    };
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// ===========================================================================
// Regressao: torneios sem flags novas sao numericamente equivalentes
// ===========================================================================

describe('Regressao: defaults sao retrocompativeis', () => {
  it('session_tournament sem flags novas e valido', () => {
    const result = insertSessionTournamentSchema.safeParse(baseSessionTournament);
    expect(result.success).toBe(true);
  });

  it('planned_tournament sem flags novas e valido', () => {
    const result = insertPlannedTournamentSchema.safeParse(basePlannedTournament);
    expect(result.success).toBe(true);
  });

  it('tournament_library sem flags novas e valido', () => {
    const result = insertTournamentLibrarySchema.safeParse(baseTournamentLibrary);
    expect(result.success).toBe(true);
  });

  it('tournament (historico) sem flags novas e valido', () => {
    const result = insertTournamentSchema.safeParse(baseTournament);
    expect(result.success).toBe(true);
  });
});

// ===========================================================================
// Edge cases adicionais (Spec 1 §7)
// ===========================================================================

describe('Edge cases da Spec 1', () => {
  it('addOnCost > buyIn * 3 (mega add-on) deve ser aceito', () => {
    const data = {
      ...baseSessionTournament,
      buyIn: '22.00',
      allowsAddOn: true,
      addOnCost: '100.00',
      addOnTaken: true,
    };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('maxReentries=0 e allowsReentry=true deve ser valido (sem re-entries permitidas)', () => {
    const data = {
      ...baseSessionTournament,
      allowsReentry: true,
      maxReentries: 0,
      reentries: 0,
    };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('maxReentries=0 com reentries=1 deve ser rejeitado', () => {
    const data = {
      ...baseSessionTournament,
      allowsReentry: true,
      maxReentries: 0,
      reentries: 1,
    };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('allowsAddOn=true sem addOnCost nem addOnTaken e valido (torneio Plus nao pago)', () => {
    const data = {
      ...baseSessionTournament,
      allowsAddOn: true,
    };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('allowsReentry=true sem maxReentries nem reentries e valido (ReA ilimitado nao usado)', () => {
    const data = {
      ...baseSessionTournament,
      allowsReentry: true,
    };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('combinacao Plus + ReA + PKO + Mystery - 4 flags + 2 types', () => {
    const data = {
      ...baseSessionTournament,
      type: 'PKO',
      allowsAddOn: true,
      addOnCost: '22.00',
      addOnTaken: true,
      allowsReentry: true,
      maxReentries: 3,
      reentries: 1,
    };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});
