import { describe, it, expect } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase) — Sprint MDA-1 / RF-01
//
// Spec: Docs/specs/sprint-mda-1-2026-06-01.md (RF-01, §"Cenarios de Teste Derivados")
// ADR : Docs/architecture/decisions/230-mda-1-reference-cards-nn-tagging.md (D-5)
//
// Contratos a testar (Zod em shared/mda.ts — ARQUIVO NOVO, red phase):
//   - MdaImage interface { id, key, caption } + mdaImageSchema (caption max 120).
//   - insertMdaReadSchema: title (max 120, req), spotContext (max 200, opt),
//     filters (max 500, opt), tendencyText (max 2000, opt), statId (max 64,
//     custom_* ou catalog, opt), themeIds string[] (min 1 / max 20), images cap 8.
//   - patchMdaReadSchema (.strict()): mesmos campos opcionais; campo desconhecido
//     rejeita; themeIds substitui o conjunto de tags.
//
// NOTA red phase: o arquivo shared/mda.ts ainda nao existe — estes testes DEVEM
// falhar ao importar ate o implementer cria-lo.
// =============================================================================

import {
  // @ts-expect-error - shared/mda.ts ainda nao existe (red phase)
  insertMdaReadSchema,
  // @ts-expect-error - shared/mda.ts ainda nao existe (red phase)
  patchMdaReadSchema,
  // @ts-expect-error - shared/mda.ts ainda nao existe (red phase)
  mdaImageSchema,
} from '@shared/mda';

function baseInsert(overrides: Record<string, any> = {}) {
  return {
    title: 'BTN vs BB SRP — pop overfolda turn',
    spotContext: 'BTN abre, BB defende, flop check-check',
    filters: 'BTN vs BB, SRP, flop 2-tone',
    tendencyText: 'A populacao da fold demais no turn — sobre-bluff barrel.',
    statId: 'vpip',
    themeIds: ['theme_1', 'theme_2'],
    ...overrides,
  };
}

function makeImage(overrides: Record<string, any> = {}) {
  return { id: 'img_1', key: 'USER-0001/read_1/abc.png', caption: 'turn fold%', ...overrides };
}

// =============================================================================
// RF-01 — mdaImageSchema
// =============================================================================

describe('MDA-1 RF-01 — mdaImageSchema', () => {
  it('aceita uma imagem valida { id, key, caption }', () => {
    expect(mdaImageSchema.safeParse(makeImage()).success).toBe(true);
  });

  it('rejeita caption > 120 chars', () => {
    expect(mdaImageSchema.safeParse(makeImage({ caption: 'x'.repeat(121) })).success).toBe(false);
  });
});

// =============================================================================
// RF-01 — insertMdaReadSchema: campos + limites
// =============================================================================

describe('MDA-1 RF-01 — insertMdaReadSchema campos + limites', () => {
  it('aceita um insert minimo valido (title + themeIds[1])', () => {
    const parsed = insertMdaReadSchema.safeParse({ title: 'x', themeIds: ['t1'] });
    expect(parsed.success).toBe(true);
  });

  it('aceita um insert completo valido', () => {
    expect(insertMdaReadSchema.safeParse(baseInsert()).success).toBe(true);
  });

  it('rejeita title ausente', () => {
    const parsed = insertMdaReadSchema.safeParse(baseInsert({ title: undefined }));
    expect(parsed.success).toBe(false);
  });

  it('rejeita title > 120 chars', () => {
    expect(insertMdaReadSchema.safeParse(baseInsert({ title: 'x'.repeat(121) })).success).toBe(false);
  });

  it('rejeita spotContext > 200 chars', () => {
    expect(insertMdaReadSchema.safeParse(baseInsert({ spotContext: 'x'.repeat(201) })).success).toBe(false);
  });

  it('rejeita filters > 500 chars', () => {
    expect(insertMdaReadSchema.safeParse(baseInsert({ filters: 'x'.repeat(501) })).success).toBe(false);
  });

  it('rejeita tendencyText > 2000 chars', () => {
    expect(insertMdaReadSchema.safeParse(baseInsert({ tendencyText: 'x'.repeat(2001) })).success).toBe(false);
  });

  it('rejeita statId > 64 chars', () => {
    expect(insertMdaReadSchema.safeParse(baseInsert({ statId: 'x'.repeat(65) })).success).toBe(false);
  });
});

// =============================================================================
// RF-01 — themeIds min 1 / max 20 (criterios de aceitacao explicitos)
// =============================================================================

describe('MDA-1 RF-01 — themeIds min 1 / max 20', () => {
  it('rejeita themeIds vazio (min 1)', () => {
    const parsed = insertMdaReadSchema.safeParse({ title: 'x', themeIds: [] });
    expect(parsed.success).toBe(false);
  });

  it('rejeita themeIds ausente (min 1, required)', () => {
    const parsed = insertMdaReadSchema.safeParse({ title: 'x' });
    expect(parsed.success).toBe(false);
  });

  it('aceita exatamente 20 themeIds', () => {
    const parsed = insertMdaReadSchema.safeParse({
      title: 'x',
      themeIds: Array.from({ length: 20 }, (_v, i) => `t${i}`),
    });
    expect(parsed.success).toBe(true);
  });

  it('rejeita 21 themeIds (max 20)', () => {
    const parsed = insertMdaReadSchema.safeParse({
      title: 'x',
      themeIds: Array.from({ length: 21 }, (_v, i) => `t${i}`),
    });
    expect(parsed.success).toBe(false);
  });
});

// =============================================================================
// RF-01 — images cap 8
// =============================================================================

describe('MDA-1 RF-01 — images cap 8', () => {
  it('aceita exatamente 8 imagens', () => {
    const parsed = insertMdaReadSchema.safeParse(
      baseInsert({ images: Array.from({ length: 8 }, (_v, i) => makeImage({ id: `i${i}` })) }),
    );
    expect(parsed.success).toBe(true);
  });

  it('rejeita 9 imagens (cap 8)', () => {
    const parsed = insertMdaReadSchema.safeParse(
      baseInsert({ images: Array.from({ length: 9 }, (_v, i) => makeImage({ id: `i${i}` })) }),
    );
    expect(parsed.success).toBe(false);
  });

  it('images eh opcional (lesson #7) — insert sem images continua valido', () => {
    const parsed = insertMdaReadSchema.safeParse({ title: 'x', themeIds: ['t1'] });
    expect(parsed.success).toBe(true);
  });
});

// =============================================================================
// RF-01 — patchMdaReadSchema (.strict())
// =============================================================================

describe('MDA-1 RF-01 — patchMdaReadSchema .strict()', () => {
  it('aceita um patch parcial (so title)', () => {
    expect(patchMdaReadSchema.safeParse({ title: 'novo titulo' }).success).toBe(true);
  });

  it('aceita patch que re-tagueia (themeIds substitui o conjunto)', () => {
    expect(patchMdaReadSchema.safeParse({ themeIds: ['t2'] }).success).toBe(true);
  });

  it('eh .strict() — campo desconhecido rejeita', () => {
    const parsed = patchMdaReadSchema.safeParse({ title: 'x', campoDesconhecido: 1 });
    expect(parsed.success).toBe(false);
  });

  it('rejeita patch com themeIds vazio (min 1 quando presente)', () => {
    expect(patchMdaReadSchema.safeParse({ themeIds: [] }).success).toBe(false);
  });

  it('rejeita patch com themeIds 21 itens (max 20 quando presente)', () => {
    const parsed = patchMdaReadSchema.safeParse({
      themeIds: Array.from({ length: 21 }, (_v, i) => `t${i}`),
    });
    expect(parsed.success).toBe(false);
  });

  it('rejeita tendencyText > 2000 no patch', () => {
    expect(patchMdaReadSchema.safeParse({ tendencyText: 'x'.repeat(2001) }).success).toBe(false);
  });
});
