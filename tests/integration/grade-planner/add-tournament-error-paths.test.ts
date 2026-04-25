import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Testes TDD - Sprint 1 - POST /api/planned-tournaments
// Erros estruturados RF-01 + RF-10
//
// Validamos que o handler:
//   1. Em dev (NODE_ENV=development): retorna 400 com
//      {error:'validation', issues:[{field, message, code}]}.
//   2. Em prod (NODE_ENV=production): retorna 400 com mesma forma mas
//      sem expor `code` interno do Zod (substituido por 'invalid').
//   3. Erros nao-Zod (ex: storage falhou) caem para 500 com formato
//      diferente — nao confundir com validacao.
//   4. Mantem backward compat: requests validas continuam retornando 200.
//
// Esses testes invocam handleCreatePlannedTournament diretamente (como ja
// faz tests/integration/api/planned-tournaments-selector-log.test.ts) E
// tambem testam o fluxo completo via mock de res.
// =============================================================================

import { handleCreatePlannedTournament } from '../../../server/routes/grade-planner';
import { storage } from '../../../server/storage';
import { selectorCache } from '../../../server/services/selectorCache';

vi.mock('../../../server/storage', () => ({
  storage: {
    createPlannedTournament: vi.fn(),
    insertSelectorLog: vi.fn(),
  },
}));

vi.mock('../../../server/services/selectorCache', () => ({
  selectorCache: {
    invalidateAllForUser: vi.fn(),
  },
}));

// O Express handler real esta em server/routes/grade-planner.ts:126
// Para testar a resposta HTTP completa, importamos o registrador de rotas
// e simulamos req/res. Mas o handleCreatePlannedTournament cobre o caminho
// principal — para o caminho de erro, precisamos simular o express handler.
//
// Aproveitamos que o handler chama insertPlannedTournamentSchema.parse(...) e
// no catch deve usar zodErrorResponse helper.
//
// Para evitar montar Express completo, vamos chamar a logica de parsing e
// asseguar que o catch produz o shape esperado via simulacao:

import { ZodError } from 'zod';
import { zodErrorResponse } from '../../../server/lib/zodErrorResponse';
import { insertPlannedTournamentSchema } from '../../../shared/schema';

let originalNodeEnv: string | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  originalNodeEnv = process.env.NODE_ENV;
  (storage.createPlannedTournament as any).mockResolvedValue({
    id: 'pt-001',
    userId: 'USER-0001',
    dayOfWeek: 1,
    site: 'PokerStars',
    time: '19:00',
    type: 'PKO',
    speed: 'Normal',
    name: 'Daily $22',
    buyIn: '22.00',
  });
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

const validBase = {
  userId: 'USER-0001',
  dayOfWeek: 1,
  profile: 'A',
  site: 'PokerStars',
  time: '19:00',
  type: 'Vanilla',
  speed: 'Normal',
  name: 'Daily $22',
  buyIn: '22.00',
};

// ---------------------------------------------------------------------------
// Caminho feliz nao deve regredir
// ---------------------------------------------------------------------------

describe('POST /api/planned-tournaments - happy path', () => {
  it('payload valido: handler retorna torneio criado (sem erro)', async () => {
    const r = await handleCreatePlannedTournament({
      userId: 'USER-0001',
      body: { ...validBase },
    });
    expect(r.id).toBeTruthy();
    expect(storage.createPlannedTournament).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Erros estruturados em DEV
// ---------------------------------------------------------------------------

describe('POST /api/planned-tournaments - erros em DEV (NODE_ENV=development)', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'development';
  });

  it('payload sem time -> 400 com issue field=time', () => {
    const payload: any = { ...validBase };
    delete payload.time;
    const parsed = insertPlannedTournamentSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const out = zodErrorResponse(parsed.error, false);
      expect(out!.status).toBe(400);
      expect(out!.body.error).toBe('validation');
      const fields = out!.body.issues.map((i: any) => i.field);
      expect(fields.some((f: string) => f === 'time' || f.endsWith('.time'))).toBe(true);
    }
  });

  it("payload com time='25:00' (regex invalido) -> 400 com path correto", () => {
    const payload: any = { ...validBase, time: '25:00' };
    const parsed = insertPlannedTournamentSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const out = zodErrorResponse(parsed.error, false);
      const fields = out!.body.issues.map((i: any) => i.field);
      expect(fields).toContain('time');
    }
  });

  it("payload com time='99:99' -> 400 com field=time", () => {
    const payload: any = { ...validBase, time: '99:99' };
    const parsed = insertPlannedTournamentSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const out = zodErrorResponse(parsed.error, false);
      const fields = out!.body.issues.map((i: any) => i.field);
      expect(fields).toContain('time');
    }
  });

  it('payload sem buyIn -> 400 com field=buyIn', () => {
    const payload: any = { ...validBase };
    delete payload.buyIn;
    const parsed = insertPlannedTournamentSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const out = zodErrorResponse(parsed.error, false);
      const fields = out!.body.issues.map((i: any) => i.field);
      expect(fields.some((f: string) => f === 'buyIn' || f.endsWith('.buyIn'))).toBe(true);
    }
  });

  it('payload sem dayOfWeek -> 400 com field=dayOfWeek', () => {
    const payload: any = { ...validBase };
    delete payload.dayOfWeek;
    const parsed = insertPlannedTournamentSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const out = zodErrorResponse(parsed.error, false);
      const fields = out!.body.issues.map((i: any) => i.field);
      expect(fields).toContain('dayOfWeek');
    }
  });

  it('payload com type=Flight (nao mais permitido) -> 400 estruturado', () => {
    const payload: any = { ...validBase, type: 'Flight' };
    const parsed = insertPlannedTournamentSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const out = zodErrorResponse(parsed.error, false);
      const fields = out!.body.issues.map((i: any) => i.field);
      expect(fields).toContain('type');
    }
  });

  it('refinement add-on/re-entry violado retorna issue estruturada com path', () => {
    const payload: any = {
      ...validBase,
      allowsReentry: false,
      maxReentries: -5,
    };
    const parsed = insertPlannedTournamentSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const out = zodErrorResponse(parsed.error, false);
      const fields = out!.body.issues.map((i: any) => i.field);
      expect(fields.some((f: string) => f.includes('maxReentries'))).toBe(true);
    }
  });

  it('multiplos campos invalidos -> multiplas issues no array', () => {
    const payload: any = { ...validBase, time: 'bad', dayOfWeek: 99 };
    const parsed = insertPlannedTournamentSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const out = zodErrorResponse(parsed.error, false);
      expect(out!.body.issues.length).toBeGreaterThanOrEqual(2);
    }
  });
});

// ---------------------------------------------------------------------------
// Erros sanitizados em PROD
// ---------------------------------------------------------------------------

describe('POST /api/planned-tournaments - erros em PROD (NODE_ENV=production)', () => {
  it('payload com time=99:99 em prod -> 400 mas codes generalizados (invalid)', () => {
    const payload: any = { ...validBase, time: '99:99' };
    const parsed = insertPlannedTournamentSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const out = zodErrorResponse(parsed.error, true);
      expect(out!.status).toBe(400);
      // Codes em prod sao generalizados
      const codes = out!.body.issues.map((i: any) => i.code);
      expect(codes.every((c: string) => c === 'invalid')).toBe(true);
    }
  });

  it('em prod ainda retorna field e message (frontend precisa para inline)', () => {
    const payload: any = { ...validBase, time: '99:99' };
    const parsed = insertPlannedTournamentSchema.safeParse(payload);
    if (!parsed.success) {
      const out = zodErrorResponse(parsed.error, true);
      expect(out!.body.issues[0].field).toBeTruthy();
      expect(out!.body.issues[0].message).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Erros nao-Zod nao usam o helper
// ---------------------------------------------------------------------------

describe('POST /api/planned-tournaments - erros nao-Zod', () => {
  it('storage falhou (nao Zod) -> zodErrorResponse retorna null', () => {
    const out = zodErrorResponse(new Error('connection lost'), false);
    expect(out).toBeNull();
  });

  it('handler deve poder distinguir 400 (validacao) vs 500 (server)', async () => {
    // Configura mock para falhar
    (storage.createPlannedTournament as any).mockRejectedValueOnce(
      new Error('connection lost')
    );
    let caught: any = null;
    try {
      await handleCreatePlannedTournament({
        userId: 'USER-0001',
        body: { ...validBase },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeTruthy();
    // Verifica que NAO e ZodError (entao deve cair em 500, nao 400)
    expect(caught.constructor.name).not.toBe('ZodError');
  });
});

// ---------------------------------------------------------------------------
// Backward compat: payload com type=Vanilla minimo continua funcionando
// ---------------------------------------------------------------------------

describe('POST /api/planned-tournaments - backward compat', () => {
  it('payload minimo Vanilla: handler retorna 200 OK', async () => {
    const r = await handleCreatePlannedTournament({
      userId: 'USER-0001',
      body: { ...validBase, type: 'Vanilla' },
    });
    expect(r.id).toBeTruthy();
  });

  it("payload com gameType='' (string vazia) deve ser tratado/aceito (nao retorna 400)", () => {
    // Spec RF-01 item 4: se form retorna gameType='' deve ser normalizado para null
    // antes do parse — handler ou EditDialog faz a normalizacao.
    // Aqui validamos que o schema nao crasha com ''.
    const payload: any = { ...validBase, gameType: '' };
    const parsed = insertPlannedTournamentSchema.safeParse(payload);
    // Aceitavel: handler deve normalizar antes do parse OU schema deve aceitar.
    // Se falhar aqui, o implementer precisa adicionar normalizacao em
    // grade-planner.ts antes do parse.
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => i.path.join('.'));
      // Se alguma issue for em gameType, o teste falha (significa que a
      // normalizacao nao foi feita).
      expect(fields).not.toContain('gameType');
    } else {
      expect(parsed.success).toBe(true);
    }
  });
});
