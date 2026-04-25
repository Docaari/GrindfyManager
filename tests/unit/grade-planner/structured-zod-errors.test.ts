import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Testes TDD - Sprint 1 - Erros Zod estruturados (RF-01 + RF-10)
// Fonte: Docs/specs/tournament-types-extension-and-manual-add-fix.md
//        D8 — "Erros Zod estruturados: dev retorna {field, code, message}[];
//             producao retorna estrutura mas filtra ctx.code para nao vazar".
//        RF-10 item 1 — helper `zodErrorResponse(error, isProd)`.
//
// Teste valida o helper em isolamento (sem rodar handler Express).
// Helper esperado em: server/lib/zodErrorResponse.ts
// Funcao: zodErrorResponse(error: unknown, isProd: boolean) -> {status, body} | null
// =============================================================================

import { ZodError, z } from 'zod';
import { zodErrorResponse } from '../../../server/lib/zodErrorResponse';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Fixtures: schemas usados nos testes
// ---------------------------------------------------------------------------

const sampleSchema = z.object({
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  buyIn: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6),
});

function makeZodError(payload: any): ZodError {
  const r = sampleSchema.safeParse(payload);
  if (r.success) throw new Error('Test fixture invalido — payload deveria falhar');
  return r.error;
}

// ---------------------------------------------------------------------------
// Helper retorna null para erros nao-Zod
// ---------------------------------------------------------------------------

describe('zodErrorResponse - errors nao-Zod', () => {
  it('retorna null para Error generico', () => {
    const r = zodErrorResponse(new Error('Random error'), false);
    expect(r).toBeNull();
  });

  it('retorna null para string', () => {
    const r = zodErrorResponse('not an error', false);
    expect(r).toBeNull();
  });

  it('retorna null para null/undefined', () => {
    expect(zodErrorResponse(null, false)).toBeNull();
    expect(zodErrorResponse(undefined, false)).toBeNull();
  });

  it('retorna null para objeto sem ZodError', () => {
    const r = zodErrorResponse({ code: 'something' }, false);
    expect(r).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Modo dev: retorna code interno do Zod
// ---------------------------------------------------------------------------

describe('zodErrorResponse - modo dev (isProd=false)', () => {
  it('retorna 400 + body com error="validation"', () => {
    const err = makeZodError({ time: '99:99', buyIn: '22', dayOfWeek: 1 });
    const r = zodErrorResponse(err, false);
    expect(r).toBeTruthy();
    expect(r!.status).toBe(400);
    expect(r!.body.error).toBe('validation');
  });

  it('issues e array nao-vazio', () => {
    const err = makeZodError({ time: '99:99', buyIn: '22', dayOfWeek: 1 });
    const r = zodErrorResponse(err, false);
    expect(Array.isArray(r!.body.issues)).toBe(true);
    expect(r!.body.issues.length).toBeGreaterThan(0);
  });

  it('cada issue tem field, message, code', () => {
    const err = makeZodError({ time: '99:99', buyIn: '', dayOfWeek: 1 });
    const r = zodErrorResponse(err, false);
    for (const issue of r!.body.issues) {
      expect(issue.field).toBeTruthy();
      expect(typeof issue.message).toBe('string');
      expect(issue.code).toBeTruthy();
    }
  });

  it('field e o path da issue Zod (joined com ".")', () => {
    const err = makeZodError({ time: '99:99', buyIn: '22', dayOfWeek: 1 });
    const r = zodErrorResponse(err, false);
    const fields = r!.body.issues.map((i) => i.field);
    expect(fields).toContain('time');
  });

  it('preserva o code do Zod em dev (ex: invalid_string, too_small, invalid_type)', () => {
    const err = makeZodError({ time: 'bad', buyIn: '', dayOfWeek: 1 });
    const r = zodErrorResponse(err, false);
    // Em dev, codes nao sao genericos
    const codes = r!.body.issues.map((i) => i.code);
    expect(codes.some((c) => c !== 'invalid')).toBe(true);
  });

  it('payload com varios erros retorna multiplas issues', () => {
    const err = makeZodError({ time: 'bad', buyIn: '', dayOfWeek: -1 });
    const r = zodErrorResponse(err, false);
    expect(r!.body.issues.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Modo producao: code generalizado (sanitizado)
// ---------------------------------------------------------------------------

describe('zodErrorResponse - modo producao (isProd=true)', () => {
  it('retorna 400 + body com error="validation"', () => {
    const err = makeZodError({ time: '99:99', buyIn: '22', dayOfWeek: 1 });
    const r = zodErrorResponse(err, true);
    expect(r!.status).toBe(400);
    expect(r!.body.error).toBe('validation');
  });

  it('issues sao retornadas mas code = "invalid" (generico)', () => {
    const err = makeZodError({ time: '99:99', buyIn: '', dayOfWeek: 1 });
    const r = zodErrorResponse(err, true);
    const codes = r!.body.issues.map((i) => i.code);
    expect(codes.every((c) => c === 'invalid')).toBe(true);
  });

  it('field e message ainda sao retornados (frontend precisa para inline errors)', () => {
    const err = makeZodError({ time: '99:99', buyIn: '22', dayOfWeek: 1 });
    const r = zodErrorResponse(err, true);
    expect(r!.body.issues[0].field).toBeTruthy();
    expect(r!.body.issues[0].message).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Path com nested fields
// ---------------------------------------------------------------------------

describe('zodErrorResponse - paths nested', () => {
  it('path com array (ex: "items.0.name") e joined com "."', () => {
    const nested = z.object({
      items: z.array(z.object({ name: z.string().min(1) })),
    });
    const r = nested.safeParse({ items: [{ name: '' }] });
    if (r.success) throw new Error('expected fail');
    const out = zodErrorResponse(r.error, false);
    const fields = out!.body.issues.map((i) => i.field);
    expect(fields.some((f) => f.startsWith('items.'))).toBe(true);
  });
});
