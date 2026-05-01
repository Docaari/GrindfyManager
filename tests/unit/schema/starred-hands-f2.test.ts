import { describe, it, expect } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint F2 — Print de Spots durante Grind
//
// Spec: Docs/specs/sprint-f2-spot-screenshots.md (RF-02 a RF-06)
// ADRs: 051 (storage), 052 (ownership), 053 (cron)
//
// Modulos NAO devem existir/conter os campos novos ainda — Implementer cria em
// shared/schema.ts:
//   - extensoes em starredHands (Drizzle: imageUrl, conclusion, reviewedAt,
//     reviewLater, expiresAt, pastedAt, source, status)
//   - STARRED_HAND_TYPES += 'spot_screenshot'
//   - STARRED_HAND_SPOTS += 'screenshot_pending'
//   - STARRED_HAND_SOURCES = ['paste','upload','manual']
//   - STARRED_HAND_STATUSES = ['pending','reviewed','discarded']
//   - starredHandSourceSchema, starredHandStatusSchema (Zod enums)
//   - updateSpotReviewSchema (Zod novo: review handler body)
//   - insertStarredHandSchema EXTENDIDO para aceitar campos novos opcionais
//     (back-compat: lesson #7 — schema deprecation gradual)
//
// IMPORTANTE: Lesson #8 — NAO testar length absoluta do enum. Validar presenca
// individual de cada valor — proxima sprint que adicionar 'foo' nao deve quebrar.
// =============================================================================

import {
  starredHands,
  insertStarredHandSchema,
  starredHandTypeSchema,
  starredHandSpotSchema,
  STARRED_HAND_TYPES,
  STARRED_HAND_SPOTS,
} from '../../../shared/schema';

// Imports que AINDA NAO EXISTEM — Implementer adiciona em shared/schema.ts
import {
  STARRED_HAND_SOURCES,
  STARRED_HAND_STATUSES,
  starredHandSourceSchema,
  starredHandStatusSchema,
  updateSpotReviewSchema,
} from '../../../shared/schema';

// ---------------------------------------------------------------------------
// starred_hands — colunas novas (Migration 0012)
// ---------------------------------------------------------------------------

describe('starredHands (Drizzle table) — extensoes Sprint F2', () => {
  // Cobre Modelo de Dados / Migration 0012 (DDL preview)
  it('expoe coluna imageUrl (text nullable)', () => {
    expect((starredHands as any).imageUrl).toBeDefined();
  });

  it('expoe coluna conclusion (text nullable, max 500 validado por Zod)', () => {
    expect((starredHands as any).conclusion).toBeDefined();
  });

  it('expoe coluna reviewedAt (timestamp nullable)', () => {
    expect((starredHands as any).reviewedAt).toBeDefined();
  });

  it('expoe coluna reviewLater (boolean default false NOT NULL)', () => {
    expect((starredHands as any).reviewLater).toBeDefined();
  });

  it('expoe coluna expiresAt (timestamp nullable)', () => {
    expect((starredHands as any).expiresAt).toBeDefined();
  });

  it('expoe coluna pastedAt (timestamp nullable)', () => {
    expect((starredHands as any).pastedAt).toBeDefined();
  });

  it('expoe coluna source (varchar(20) default "manual" NOT NULL)', () => {
    expect((starredHands as any).source).toBeDefined();
  });

  it('expoe coluna status (varchar(20) default "pending" NOT NULL)', () => {
    expect((starredHands as any).status).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// STARRED_HAND_TYPES — incluir 'spot_screenshot'
// ---------------------------------------------------------------------------

describe('STARRED_HAND_TYPES — Sprint F2 adicao', () => {
  // Cobre Spec: "STARRED_HAND_TYPES adicionar 'spot_screenshot'"
  it('inclui valor "spot_screenshot" para auto-tag de print colado', () => {
    expect(STARRED_HAND_TYPES).toContain('spot_screenshot');
  });

  it('preserva valores existentes (back-compat lesson #7)', () => {
    // Cooldown-1 valores devem continuar presentes
    for (const v of ['tilt', 'leak', 'soulread', 'hero-call', 'cooler', 'mistake', 'sick', 'other']) {
      expect(STARRED_HAND_TYPES).toContain(v);
    }
  });

  it('starredHandTypeSchema aceita "spot_screenshot"', () => {
    const r = starredHandTypeSchema.safeParse('spot_screenshot');
    expect(r.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// STARRED_HAND_SPOTS — incluir 'screenshot_pending'
// ---------------------------------------------------------------------------

describe('STARRED_HAND_SPOTS — Sprint F2 adicao', () => {
  // Cobre Spec: "STARRED_HAND_SPOTS adicionar 'screenshot_pending'"
  it('inclui valor "screenshot_pending" como placeholder ate jogador classificar', () => {
    expect(STARRED_HAND_SPOTS).toContain('screenshot_pending');
  });

  it('preserva valores existentes (back-compat lesson #7)', () => {
    for (const v of ['preflop', 'flop', 'turn', 'river', 'icm', 'final-table', 'bubble', 'other']) {
      expect(STARRED_HAND_SPOTS).toContain(v);
    }
  });

  it('starredHandSpotSchema aceita "screenshot_pending"', () => {
    const r = starredHandSpotSchema.safeParse('screenshot_pending');
    expect(r.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// STARRED_HAND_SOURCES — novo enum
// ---------------------------------------------------------------------------

describe('STARRED_HAND_SOURCES (novo enum) e starredHandSourceSchema', () => {
  // Cobre Spec: "novo STARRED_HAND_SOURCES = ['paste','upload','manual']"
  it('inclui "paste" (Ctrl+V no live grind)', () => {
    expect(STARRED_HAND_SOURCES).toContain('paste');
  });

  it('inclui "upload" (file picker fallback)', () => {
    expect(STARRED_HAND_SOURCES).toContain('upload');
  });

  it('inclui "manual" (default — cooldown classico Sprint Cooldown-1)', () => {
    expect(STARRED_HAND_SOURCES).toContain('manual');
  });

  it('starredHandSourceSchema aceita cada valor individualmente', () => {
    expect(starredHandSourceSchema.safeParse('paste').success).toBe(true);
    expect(starredHandSourceSchema.safeParse('upload').success).toBe(true);
    expect(starredHandSourceSchema.safeParse('manual').success).toBe(true);
  });

  it('starredHandSourceSchema rejeita valor desconhecido', () => {
    const r = starredHandSourceSchema.safeParse('drag');
    expect(r.success).toBe(false);
  });

  it('starredHandSourceSchema rejeita string vazia', () => {
    expect(starredHandSourceSchema.safeParse('').success).toBe(false);
  });

  it('starredHandSourceSchema rejeita case-sensitive variants', () => {
    expect(starredHandSourceSchema.safeParse('Paste').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// STARRED_HAND_STATUSES — novo enum
// ---------------------------------------------------------------------------

describe('STARRED_HAND_STATUSES (novo enum) e starredHandStatusSchema', () => {
  // Cobre Spec: "novo STARRED_HAND_STATUSES = ['pending','reviewed','discarded']"
  it('inclui "pending" (default — print recem-colado)', () => {
    expect(STARRED_HAND_STATUSES).toContain('pending');
  });

  it('inclui "reviewed" (jogador revisou via cooldown ou studies)', () => {
    expect(STARRED_HAND_STATUSES).toContain('reviewed');
  });

  it('inclui "discarded" (soft delete via DELETE /:id/discard)', () => {
    expect(STARRED_HAND_STATUSES).toContain('discarded');
  });

  it('starredHandStatusSchema aceita cada valor individualmente', () => {
    expect(starredHandStatusSchema.safeParse('pending').success).toBe(true);
    expect(starredHandStatusSchema.safeParse('reviewed').success).toBe(true);
    expect(starredHandStatusSchema.safeParse('discarded').success).toBe(true);
  });

  it('starredHandStatusSchema rejeita valor desconhecido', () => {
    expect(starredHandStatusSchema.safeParse('archived').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// insertStarredHandSchema — extensoes opcionais (back-compat lesson #7)
// ---------------------------------------------------------------------------

describe('insertStarredHandSchema — back-compat com Sprint Cooldown-1', () => {
  // Cobre lesson #7: schema deprecation gradual — campos novos sao OPCIONAIS,
  // permitindo que rows criadas pelo cooldown classico (POST /api/starred-hands)
  // continuem funcionando sem fornecer os novos campos.
  const validLegacy = {
    userId: 'USER-0001',
    sessionId: 'ses_1',
    sessionTournamentId: 'st_1',
    type: 'tilt' as const,
    spot: 'river' as const,
  };

  it('aceita payload legado SEM campos novos (Cooldown-1 sem print)', () => {
    const r = insertStarredHandSchema.safeParse(validLegacy);
    expect(r.success).toBe(true);
  });

  it('aceita type="spot_screenshot" + spot="screenshot_pending" (paste flow)', () => {
    const r = insertStarredHandSchema.safeParse({
      ...validLegacy,
      type: 'spot_screenshot',
      spot: 'screenshot_pending',
    });
    expect(r.success).toBe(true);
  });

  it('aceita campo imageUrl opcional', () => {
    const r = insertStarredHandSchema.safeParse({
      ...validLegacy,
      imageUrl: '/uploads/spot-screenshots/abc123.png',
    });
    expect(r.success).toBe(true);
  });

  it('aceita campo source opcional ("paste")', () => {
    const r = insertStarredHandSchema.safeParse({
      ...validLegacy,
      source: 'paste',
    });
    expect(r.success).toBe(true);
  });

  it('aceita campo status opcional ("pending")', () => {
    const r = insertStarredHandSchema.safeParse({
      ...validLegacy,
      status: 'pending',
    });
    expect(r.success).toBe(true);
  });

  it('aceita campo reviewLater opcional (boolean)', () => {
    const r = insertStarredHandSchema.safeParse({
      ...validLegacy,
      reviewLater: false,
    });
    expect(r.success).toBe(true);
  });

  it('aceita expiresAt e pastedAt opcionais (timestamps Date)', () => {
    const r = insertStarredHandSchema.safeParse({
      ...validLegacy,
      pastedAt: new Date(),
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });
    expect(r.success).toBe(true);
  });

  it('aceita conclusion opcional (max 500 chars)', () => {
    const r = insertStarredHandSchema.safeParse({
      ...validLegacy,
      conclusion: 'c'.repeat(500),
    });
    expect(r.success).toBe(true);
  });

  it('rejeita conclusion > 500 chars', () => {
    const r = insertStarredHandSchema.safeParse({
      ...validLegacy,
      conclusion: 'c'.repeat(501),
    });
    expect(r.success).toBe(false);
  });

  it('rejeita source invalido (enum guard)', () => {
    const r = insertStarredHandSchema.safeParse({
      ...validLegacy,
      source: 'drag',
    });
    expect(r.success).toBe(false);
  });

  it('rejeita status invalido (enum guard)', () => {
    const r = insertStarredHandSchema.safeParse({
      ...validLegacy,
      status: 'archived',
    });
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateSpotReviewSchema — handler PATCH /:id/review
// ---------------------------------------------------------------------------

describe('updateSpotReviewSchema — body do PATCH /api/starred-hands/:id/review', () => {
  // Cobre RF-03 — Endpoint de revisao
  // Body Zod: { conclusion?, reviewLater?, sessionTournamentId?, type?, spot?, notes? }
  // Tudo opcional. Conclusion max 500. Notes max 500.

  it('aceita body vazio {} (todos campos opcionais)', () => {
    const r = updateSpotReviewSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it('aceita { reviewLater: true } sozinho (Revisar Depois)', () => {
    const r = updateSpotReviewSchema.safeParse({ reviewLater: true });
    expect(r.success).toBe(true);
  });

  it('aceita { reviewLater: false } sozinho', () => {
    const r = updateSpotReviewSchema.safeParse({ reviewLater: false });
    expect(r.success).toBe(true);
  });

  it('aceita { conclusion } simples', () => {
    const r = updateSpotReviewSchema.safeParse({
      conclusion: 'Bluff catcher correto, oponente fold-prone post-river',
    });
    expect(r.success).toBe(true);
  });

  it('aceita conclusion exatamente 500 chars (boundary)', () => {
    const r = updateSpotReviewSchema.safeParse({ conclusion: 'c'.repeat(500) });
    expect(r.success).toBe(true);
  });

  it('rejeita conclusion > 500 chars', () => {
    const r = updateSpotReviewSchema.safeParse({ conclusion: 'c'.repeat(501) });
    expect(r.success).toBe(false);
  });

  it('aceita { type: "spot_screenshot" }', () => {
    const r = updateSpotReviewSchema.safeParse({ type: 'spot_screenshot' });
    expect(r.success).toBe(true);
  });

  it('aceita { type: "tilt" } (jogador re-classifica para enum legado)', () => {
    const r = updateSpotReviewSchema.safeParse({ type: 'tilt' });
    expect(r.success).toBe(true);
  });

  it('rejeita type invalido', () => {
    const r = updateSpotReviewSchema.safeParse({ type: 'amazing' });
    expect(r.success).toBe(false);
  });

  it('aceita { spot: "river" }', () => {
    const r = updateSpotReviewSchema.safeParse({ spot: 'river' });
    expect(r.success).toBe(true);
  });

  it('rejeita spot invalido', () => {
    const r = updateSpotReviewSchema.safeParse({ spot: 'deep-stack' });
    expect(r.success).toBe(false);
  });

  it('aceita { sessionTournamentId } (re-tag em torneio diferente)', () => {
    const r = updateSpotReviewSchema.safeParse({ sessionTournamentId: 'st_xyz' });
    expect(r.success).toBe(true);
  });

  it('aceita { notes } ate 500 chars', () => {
    const r = updateSpotReviewSchema.safeParse({ notes: 'n'.repeat(500) });
    expect(r.success).toBe(true);
  });

  it('rejeita notes > 500 chars', () => {
    const r = updateSpotReviewSchema.safeParse({ notes: 'n'.repeat(501) });
    expect(r.success).toBe(false);
  });

  it('aceita combo completo (Salvar revisao do modal SpotReviewCard)', () => {
    const r = updateSpotReviewSchema.safeParse({
      conclusion: 'Bluff catcher correto',
      type: 'mistake',
      spot: 'river',
      notes: 'vs reg tight',
      reviewLater: false,
      sessionTournamentId: 'st_xyz',
    });
    expect(r.success).toBe(true);
  });

  it('rejeita campos desconhecidos (strict)', () => {
    // Schema deve ser strict para nao aceitar fields exterior — protege contra
    // injecao acidental de userId/id/createdAt.
    const r = updateSpotReviewSchema.safeParse({
      conclusion: 'ok',
      userId: 'USER-EVIL',
    });
    expect(r.success).toBe(false);
  });
});
