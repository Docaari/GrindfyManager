import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD (Sprint 2 - Bankroll): shared/schema.ts -> tabela bankroll_snapshots
//
// Fonte: docs/specs/bankroll-management.md (RF-05, RF-11)
//        docs/architecture/decisions/017-bankroll-snapshot-vs-derived.md
//        docs/architecture/data-model.mermaid (ja tem bankroll_snapshots)
//
// Spec da tabela:
//   id                varchar (nanoid) PK
//   userId            varchar FK users.userPlatformId ON DELETE CASCADE
//   occurredAt        timestamp not null default now()
//   delta             decimal not null (signed USD)
//   previousAmount    decimal not null
//   newAmount         decimal not null
//   reason            varchar not null  (enum app-level)
//   note              text nullable (max 500 chars, app-level)
//   source            varchar not null default 'manual'
//   sessionId         varchar nullable (FK grind_sessions, opcional)
//   createdAt         timestamp default now()
//
// Indices: (user_id, occurred_at DESC), (user_id, reason)
// =============================================================================

import {
  bankrollSnapshots,
  insertBankrollSnapshotSchema,
} from '../../../shared/schema';

describe('bankrollSnapshots - definicao de tabela Drizzle', () => {
  it('exportado de shared/schema.ts', () => {
    expect(bankrollSnapshots).toBeDefined();
  });

  it('tem coluna id (PK)', () => {
    expect((bankrollSnapshots as any).id).toBeDefined();
  });

  it('tem coluna userId (FK users.userPlatformId)', () => {
    expect((bankrollSnapshots as any).userId).toBeDefined();
  });

  it('tem coluna occurredAt (timestamp)', () => {
    expect((bankrollSnapshots as any).occurredAt).toBeDefined();
  });

  it('tem coluna delta (decimal)', () => {
    expect((bankrollSnapshots as any).delta).toBeDefined();
  });

  it('tem coluna previousAmount (decimal) - auditavel (ADR-017)', () => {
    expect((bankrollSnapshots as any).previousAmount).toBeDefined();
  });

  it('tem coluna newAmount (decimal) - auditavel (ADR-017)', () => {
    expect((bankrollSnapshots as any).newAmount).toBeDefined();
  });

  it('tem coluna reason (varchar)', () => {
    expect((bankrollSnapshots as any).reason).toBeDefined();
  });

  it('tem coluna note (text nullable)', () => {
    expect((bankrollSnapshots as any).note).toBeDefined();
  });

  it('tem coluna source (varchar com default "manual")', () => {
    expect((bankrollSnapshots as any).source).toBeDefined();
  });

  it('tem coluna sessionId (opcional FK grind_sessions - reservada p/ auto_session)', () => {
    expect((bankrollSnapshots as any).sessionId).toBeDefined();
  });

  it('tem coluna createdAt (timestamp default now)', () => {
    expect((bankrollSnapshots as any).createdAt).toBeDefined();
  });
});

describe('insertBankrollSnapshotSchema - Zod validation', () => {
  const validBase = {
    userId: 'USER-0001',
    delta: '500.00',
    previousAmount: '1000.00',
    newAmount: '1500.00',
    reason: 'deposit',
  };

  describe('reason enum (spec RF-05)', () => {
    it('aceita reason="initial"', () => {
      const r = insertBankrollSnapshotSchema.safeParse({ ...validBase, reason: 'initial' });
      expect(r.success).toBe(true);
    });

    it('aceita reason="deposit"', () => {
      const r = insertBankrollSnapshotSchema.safeParse({ ...validBase, reason: 'deposit' });
      expect(r.success).toBe(true);
    });

    it('aceita reason="withdrawal"', () => {
      const r = insertBankrollSnapshotSchema.safeParse({ ...validBase, reason: 'withdrawal' });
      expect(r.success).toBe(true);
    });

    it('aceita reason="session_result"', () => {
      const r = insertBankrollSnapshotSchema.safeParse({ ...validBase, reason: 'session_result' });
      expect(r.success).toBe(true);
    });

    it('aceita reason="manual_adjustment"', () => {
      const r = insertBankrollSnapshotSchema.safeParse({ ...validBase, reason: 'manual_adjustment' });
      expect(r.success).toBe(true);
    });

    it('rejeita reason="bogus" (nao e do enum)', () => {
      const r = insertBankrollSnapshotSchema.safeParse({ ...validBase, reason: 'bogus' });
      expect(r.success).toBe(false);
    });
  });

  describe('delta (USD signed)', () => {
    it('aceita delta positivo (aporte)', () => {
      const r = insertBankrollSnapshotSchema.safeParse({ ...validBase, delta: '500' });
      expect(r.success).toBe(true);
    });

    it('aceita delta negativo (saque)', () => {
      const r = insertBankrollSnapshotSchema.safeParse({ ...validBase, delta: '-300', newAmount: '700' });
      expect(r.success).toBe(true);
    });

    it('rejeita delta=0 (invariante spec RF-03 + ADR-017)', () => {
      const r = insertBankrollSnapshotSchema.safeParse({ ...validBase, delta: '0', newAmount: '1000' });
      expect(r.success).toBe(false);
    });

    it('rejeita delta=0 como number', () => {
      const r = insertBankrollSnapshotSchema.safeParse({ ...validBase, delta: 0, newAmount: 1000 });
      expect(r.success).toBe(false);
    });
  });

  describe('note (max 500 chars)', () => {
    it('aceita note null/ausente', () => {
      const r = insertBankrollSnapshotSchema.safeParse({ ...validBase });
      expect(r.success).toBe(true);
    });

    it('aceita note com 500 chars (limite exato)', () => {
      const note = 'x'.repeat(500);
      const r = insertBankrollSnapshotSchema.safeParse({ ...validBase, note });
      expect(r.success).toBe(true);
    });

    it('rejeita note com 501 chars (acima do limite)', () => {
      const note = 'x'.repeat(501);
      const r = insertBankrollSnapshotSchema.safeParse({ ...validBase, note });
      expect(r.success).toBe(false);
    });
  });

  describe('occurredAt', () => {
    it('aceita occurredAt ausente (default NOW() no DB)', () => {
      const r = insertBankrollSnapshotSchema.safeParse({ ...validBase });
      expect(r.success).toBe(true);
    });

    it('aceita occurredAt no passado (retroativo)', () => {
      const yesterday = new Date(Date.now() - 86400000);
      const r = insertBankrollSnapshotSchema.safeParse({ ...validBase, occurredAt: yesterday });
      expect(r.success).toBe(true);
    });

    it('rejeita occurredAt no futuro (invariante ADR-017 + spec RF-03)', () => {
      const tomorrow = new Date(Date.now() + 86400000);
      const r = insertBankrollSnapshotSchema.safeParse({ ...validBase, occurredAt: tomorrow });
      expect(r.success).toBe(false);
    });
  });

  describe('source', () => {
    it('aceita source="manual" (default)', () => {
      const r = insertBankrollSnapshotSchema.safeParse({ ...validBase, source: 'manual' });
      expect(r.success).toBe(true);
    });

    it('aceita source="auto_session" (reservado p/ futuro)', () => {
      const r = insertBankrollSnapshotSchema.safeParse({ ...validBase, source: 'auto_session' });
      expect(r.success).toBe(true);
    });

    it('aceita source="auto_import" (reservado p/ futuro)', () => {
      const r = insertBankrollSnapshotSchema.safeParse({ ...validBase, source: 'auto_import' });
      expect(r.success).toBe(true);
    });

    it('rejeita source invalida', () => {
      const r = insertBankrollSnapshotSchema.safeParse({ ...validBase, source: 'bogus' });
      expect(r.success).toBe(false);
    });
  });

  describe('sessionId (FK opcional)', () => {
    it('aceita sessionId null (MVP: sempre null)', () => {
      const r = insertBankrollSnapshotSchema.safeParse({ ...validBase, sessionId: null });
      expect(r.success).toBe(true);
    });

    it('aceita sessionId string (reservado p/ auto_session)', () => {
      const r = insertBankrollSnapshotSchema.safeParse({ ...validBase, sessionId: 'grind-session-abc' });
      expect(r.success).toBe(true);
    });
  });

  describe('userId', () => {
    it('exige userId (FK obrigatorio)', () => {
      const { userId: _u, ...withoutUser } = validBase;
      const r = insertBankrollSnapshotSchema.safeParse(withoutUser);
      expect(r.success).toBe(false);
    });
  });
});

describe('bankrollSnapshots - FK cascade e data-model invariants', () => {
  // Os testes reais de cascade rodam em integration (com DB real).
  // Aqui validamos apenas que o schema expressa as FKs.
  it.todo('FK user_id ON DELETE CASCADE remove snapshots do usuario (validado em integration/invariants)');
  it.todo('FK session_id nullable NAO cascade (delecao de session mantem snapshot com sessionId null)');
  it.todo('indice (user_id, occurred_at DESC) existe na migracao');
  it.todo('indice (user_id, reason) existe na migracao');
});
