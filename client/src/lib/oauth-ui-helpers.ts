// OAuth UI helpers — pure functions for OAuth display logic

export interface OAuthProviders {
  google: boolean;
  [key: string]: boolean;
}

export type OAuthContext = 'login' | 'register';

export function getOAuthProviders(response: unknown): OAuthProviders {
  if (!response || typeof response !== 'object') {
    return { google: false };
  }
  const res = response as Record<string, unknown>;
  return {
    google: res.google === true,
  };
}

export function isGoogleEnabled(providers: OAuthProviders): boolean {
  return providers.google === true;
}

export function getGoogleAuthURL(baseUrl?: string): string {
  if (baseUrl) {
    const base = baseUrl.replace(/\/$/, '');
    return `${base}/api/auth/google`;
  }
  return '/api/auth/google';
}

export function getOAuthButtonLabel(provider: string, context: OAuthContext): string {
  const name = provider.charAt(0).toUpperCase() + provider.slice(1);
  if (context === 'login') {
    return `Continuar com ${name}`;
  }
  return `Registrar com ${name}`;
}

export function shouldShowOAuthDivider(providers: OAuthProviders): boolean {
  return Object.values(providers).some(v => v === true);
}

const errorMessages: Record<string, string> = {
  oauth_failed: 'Falha na autenticacao. Tente novamente.',
};

export function parseOAuthError(searchParams: string): string | null {
  if (!searchParams) return null;
  const params = new URLSearchParams(searchParams);
  const error = params.get('error');
  if (!error) return null;
  return errorMessages[error] ?? 'Ocorreu um erro na autenticacao. Tente novamente.';
}
