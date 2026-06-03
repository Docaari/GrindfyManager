import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase) — Biblioteca Premium curada (ADR-240, RF-05)
//
// Spec : Docs/specs/premium-library.md (RF-05, NFR Seguranca)
// ADR  : Docs/architecture/decisions/240-premium-library-curated.md (Decisao 2)
//
// Middleware NOVO (AINDA NAO EXISTE em server/auth.ts):
//   requireGranularPermission(permissionName) =>
//     401 se !req.user
//     next() se isSuperAdmin(req.user.email)
//     next() se Array.isArray(req.user.permissions) && permissions.includes(name)
//     403 { message, requiredPermission } caso contrario (FAIL-CLOSED)
//
// Este e o CORACAO da seguranca (anti-IDOR / D1). Testado em ISOLAMENTO.
//
// Lesson #3: req.user mockado com o shape REAL (auth.ts:245-260):
//   { email, userPlatformId, permissions: string[] } (+ outros campos).
//   isSuperAdmin vem de @shared/permissions (SUPER_ADMIN_EMAILS).
//   Super-admin real: 'ricardo.agnolo@hotmail.com' (shared/permissions.ts:4).
//
// .test.ts roda no projeto "server" (node).
// =============================================================================

// O modulo server/auth.ts importa AuthService/db/etc no topo; para testar o
// middleware puro sem subir a stack de DB, mockamos as deps de borda que o
// import do auth dispara. NAO mockamos isSuperAdmin — queremos o comportamento
// REAL contra SUPER_ADMIN_EMAILS (lesson #3: nao idealizar).
vi.mock('../../../server/db', () => ({
  db: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(async () => []) })) })),
    insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
  },
}));

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  return res;
}

function makeReq(user: any) {
  return { user, ip: '127.0.0.1', headers: {}, url: '/api/library/premium', method: 'POST' } as any;
}

async function loadGuard() {
  const mod: any = await import('../../../server/auth');
  return mod.requireGranularPermission;
}

const PERM = 'premium_library_curate';
// Email comum (NAO super-admin). Super-admins: shared/permissions.ts SUPER_ADMIN_EMAILS.
const NORMAL_EMAIL = 'jogador@example.com';
const SUPER_ADMIN_EMAIL = 'ricardo.agnolo@hotmail.com';

beforeEach(() => { vi.clearAllMocks(); });

describe('requireGranularPermission — 401 sem usuario', () => {
  it('responde 401 quando req.user e undefined', async () => {
    const requireGranularPermission = await loadGuard();
    const res = makeRes();
    const next = vi.fn();
    requireGranularPermission(PERM)(makeReq(undefined), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireGranularPermission — 403 fail-closed', () => {
  it('nega (403) curador NAO concedido mesmo sendo trial/active (permissions: [])', async () => {
    const requireGranularPermission = await loadGuard();
    const res = makeRes();
    const next = vi.fn();
    requireGranularPermission(PERM)(
      makeReq({ email: NORMAL_EMAIL, userPlatformId: 'USER-0002', subscriptionPlan: 'active', permissions: [] }),
      res,
      next,
    );
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('o 403 inclui requiredPermission no corpo', async () => {
    const requireGranularPermission = await loadGuard();
    const res = makeRes();
    const next = vi.fn();
    requireGranularPermission(PERM)(
      makeReq({ email: NORMAL_EMAIL, userPlatformId: 'USER-0002', permissions: [] }),
      res,
      next,
    );
    expect(res.statusCode).toBe(403);
    expect(res.body?.requiredPermission).toBe(PERM);
    expect(typeof res.body?.message).toBe('string');
  });

  it('nega (403) quando permissions inclui OUTRA permissao, nao a exigida', async () => {
    const requireGranularPermission = await loadGuard();
    const res = makeRes();
    const next = vi.fn();
    requireGranularPermission(PERM)(
      makeReq({ email: NORMAL_EMAIL, userPlatformId: 'USER-0002', permissions: ['some_other_perm'] }),
      res,
      next,
    );
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('nega (403) quando permissions nao e array (shape defensivo)', async () => {
    const requireGranularPermission = await loadGuard();
    const res = makeRes();
    const next = vi.fn();
    requireGranularPermission(PERM)(
      makeReq({ email: NORMAL_EMAIL, userPlatformId: 'USER-0002', permissions: undefined }),
      res,
      next,
    );
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireGranularPermission — next() autorizado', () => {
  it('chama next() quando permissions inclui a permissao concedida', async () => {
    const requireGranularPermission = await loadGuard();
    const res = makeRes();
    const next = vi.fn();
    requireGranularPermission(PERM)(
      makeReq({ email: NORMAL_EMAIL, userPlatformId: 'USER-0003', permissions: [PERM] }),
      res,
      next,
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200); // status nao foi alterado
  });

  it('chama next() para super-admin mesmo SEM a permissao na lista (bypass)', async () => {
    const requireGranularPermission = await loadGuard();
    const res = makeRes();
    const next = vi.fn();
    requireGranularPermission(PERM)(
      makeReq({ email: SUPER_ADMIN_EMAIL, userPlatformId: 'USER-ADMIN', permissions: [] }),
      res,
      next,
    );
    expect(next).toHaveBeenCalledTimes(1);
  });
});
