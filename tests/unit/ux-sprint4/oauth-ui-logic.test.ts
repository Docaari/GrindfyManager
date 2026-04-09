import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: RF-08/RF-09/RF-12 — Logica do OAuth na UI (FP-03)
//
// Funcoes puras que controlam a logica de exibicao e comportamento OAuth:
//   - `getOAuthProviders`: parseia resposta do endpoint /api/auth/providers
//   - `isGoogleEnabled`: verifica se Google esta configurado
//   - `getGoogleAuthURL`: retorna URL para iniciar fluxo OAuth
//   - `getOAuthButtonLabel`: retorna label do botao por provider e contexto
//   - `shouldShowOAuthDivider`: verifica se deve exibir divisor "ou"
//   - `parseOAuthError`: parseia query params de erro OAuth
//
// Modulo esperado: `client/src/lib/oauth-ui-helpers.ts`
//
// Backend de referencia: `server/oauth.ts` (OAuthService)
// Endpoint de providers: `GET /api/auth/providers` → { google: boolean }
// Endpoint de auth: `GET /api/auth/google` → { authUrl: string }
//
// Todos devem FALHAR (red phase) — funcoes ainda nao existem.
// =============================================================================

// Tipos esperados
interface OAuthProviders {
  google: boolean;
  [key: string]: boolean;
}

type OAuthContext = 'login' | 'register';

// Stubs para compilacao — Implementer substituira
let getOAuthProviders: (response: unknown) => OAuthProviders;
let isGoogleEnabled: (providers: OAuthProviders) => boolean;
let getGoogleAuthURL: (baseUrl?: string) => string;
let getOAuthButtonLabel: (provider: string, context: OAuthContext) => string;
let shouldShowOAuthDivider: (providers: OAuthProviders) => boolean;
let parseOAuthError: (searchParams: string) => string | null;

try {
  const mod = require('../../../client/src/lib/oauth-ui-helpers');
  if (mod.getOAuthProviders) getOAuthProviders = mod.getOAuthProviders;
  if (mod.isGoogleEnabled) isGoogleEnabled = mod.isGoogleEnabled;
  if (mod.getGoogleAuthURL) getGoogleAuthURL = mod.getGoogleAuthURL;
  if (mod.getOAuthButtonLabel) getOAuthButtonLabel = mod.getOAuthButtonLabel;
  if (mod.shouldShowOAuthDivider) shouldShowOAuthDivider = mod.shouldShowOAuthDivider;
  if (mod.parseOAuthError) parseOAuthError = mod.parseOAuthError;
} catch {
  // Esperado em red phase
}

// ---------------------------------------------------------------------------
// getOAuthProviders — parseia resposta do endpoint /api/auth/providers
// ---------------------------------------------------------------------------

describe('getOAuthProviders', () => {
  it('deve parsear resposta com google habilitado', () => {
    const result = getOAuthProviders({ google: true });
    expect(result).toEqual({ google: true });
  });

  it('deve parsear resposta com google desabilitado', () => {
    const result = getOAuthProviders({ google: false });
    expect(result).toEqual({ google: false });
  });

  it('deve retornar google=false para resposta vazia', () => {
    const result = getOAuthProviders({});
    expect(result.google).toBe(false);
  });

  it('deve retornar google=false para resposta null', () => {
    const result = getOAuthProviders(null);
    expect(result.google).toBe(false);
  });

  it('deve retornar google=false para resposta undefined', () => {
    const result = getOAuthProviders(undefined);
    expect(result.google).toBe(false);
  });

  it('deve retornar google=false para resposta invalida (string)', () => {
    const result = getOAuthProviders('invalid');
    expect(result.google).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isGoogleEnabled — verifica se Google OAuth esta disponivel
// ---------------------------------------------------------------------------

describe('isGoogleEnabled', () => {
  it('deve retornar true quando google esta habilitado', () => {
    expect(isGoogleEnabled({ google: true })).toBe(true);
  });

  it('deve retornar false quando google esta desabilitado', () => {
    expect(isGoogleEnabled({ google: false })).toBe(false);
  });

  it('deve retornar false para objeto vazio', () => {
    expect(isGoogleEnabled({} as OAuthProviders)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getGoogleAuthURL — retorna URL para iniciar fluxo OAuth
// ---------------------------------------------------------------------------

describe('getGoogleAuthURL', () => {
  it('deve retornar /api/auth/google como URL padrao', () => {
    const url = getGoogleAuthURL();
    expect(url).toBe('/api/auth/google');
  });

  it('deve usar baseUrl quando fornecida', () => {
    const url = getGoogleAuthURL('https://app.grindfy.com');
    expect(url).toBe('https://app.grindfy.com/api/auth/google');
  });

  it('deve remover barra final da baseUrl', () => {
    const url = getGoogleAuthURL('https://app.grindfy.com/');
    expect(url).toBe('https://app.grindfy.com/api/auth/google');
  });
});

// ---------------------------------------------------------------------------
// getOAuthButtonLabel — retorna label do botao por provider e contexto
// ---------------------------------------------------------------------------

describe('getOAuthButtonLabel', () => {
  it('deve retornar "Continuar com Google" para login com google', () => {
    expect(getOAuthButtonLabel('google', 'login')).toBe('Continuar com Google');
  });

  it('deve retornar "Registrar com Google" para registro com google', () => {
    expect(getOAuthButtonLabel('google', 'register')).toBe('Registrar com Google');
  });

  it('deve capitalizar nome do provider desconhecido no login', () => {
    const label = getOAuthButtonLabel('github', 'login');
    expect(label).toMatch(/continuar com github/i);
  });

  it('deve capitalizar nome do provider desconhecido no registro', () => {
    const label = getOAuthButtonLabel('github', 'register');
    expect(label).toMatch(/registrar com github/i);
  });
});

// ---------------------------------------------------------------------------
// shouldShowOAuthDivider — verifica se deve exibir divisor "ou"
// ---------------------------------------------------------------------------

describe('shouldShowOAuthDivider', () => {
  it('deve retornar true quando ao menos 1 provider esta ativo', () => {
    expect(shouldShowOAuthDivider({ google: true })).toBe(true);
  });

  it('deve retornar false quando nenhum provider esta ativo', () => {
    expect(shouldShowOAuthDivider({ google: false })).toBe(false);
  });

  it('deve retornar false para objeto vazio', () => {
    expect(shouldShowOAuthDivider({} as OAuthProviders)).toBe(false);
  });

  it('deve retornar true se qualquer provider estiver ativo (futuro)', () => {
    expect(shouldShowOAuthDivider({ google: false, github: true } as OAuthProviders)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseOAuthError — parseia query params de erro OAuth
// ---------------------------------------------------------------------------

describe('parseOAuthError', () => {
  it('deve retornar mensagem para erro oauth_failed', () => {
    const msg = parseOAuthError('?error=oauth_failed');
    expect(msg).toBeTruthy();
    expect(typeof msg).toBe('string');
  });

  it('deve retornar mensagem em portugues para oauth_failed', () => {
    const msg = parseOAuthError('?error=oauth_failed');
    expect(msg).toMatch(/falh|erro|tente/i);
  });

  it('deve retornar null quando nao ha erro', () => {
    expect(parseOAuthError('')).toBeNull();
  });

  it('deve retornar null quando query nao contem error', () => {
    expect(parseOAuthError('?foo=bar')).toBeNull();
  });

  it('deve retornar mensagem generica para erro desconhecido', () => {
    const msg = parseOAuthError('?error=unknown_error');
    expect(msg).toBeTruthy();
    expect(typeof msg).toBe('string');
  });
});
