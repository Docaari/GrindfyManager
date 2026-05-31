/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spotify E2E — RF-01.1 (CSP allowlist do Web Playback SDK + runtime) +
 * RF-05 (Google Fonts).
 *
 * ADR-220 §"Diretivas CSP finais" — lista EXATA de hosts a adicionar em
 * `server/routes/index.ts`. Este teste monta o app Express com `registerRoutes`,
 * faz um GET real e inspeciona o header `content-security-policy` gerado pelo
 * Helmet. O fix central do sprint e PRECISAMENTE este header — sem ele o
 * `<script src="sdk.scdn.co/...">` e bloqueado e `window.Spotify` nunca existe.
 *
 * Estrategia: Express real + supertest + `registerRoutes(app)`. Os jobs/DB
 * health-check rodam best-effort (graceful degradation no proprio routes/index.ts),
 * entao o mount nao crasha sem DB. Mockamos `registerAllJobs` + `spotStorage`
 * health-check + `pool` para evitar timers/IO pendurados no teste.
 *
 * RED esperado: a CSP atual NAO contem nenhum host Spotify/SCDN nem Google Fonts.
 * Cada assert de presenca falha ate o implementer estender os arrays do Helmet.
 *
 * NAO testa visual — testa o header (ADR-220 Implementation Notes).
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

// Evita IO/timers reais no mount: jobs no-op, health-check ok, pool query stub.
vi.mock('../../../server/jobs', () => ({
  registerAllJobs: vi.fn(async () => {}),
}));
vi.mock('../../../server/lib/spotStorage', () => ({
  spotStorage: { healthCheck: vi.fn(async () => ({ ok: true })) },
}));
vi.mock('../../../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [{ '?column?': 1 }] })) },
}));

let app: Express;
let cspHeader: string;

// Helper: extrai os tokens (source-list) de uma diretiva especifica do header CSP.
function directiveSources(header: string, directive: string): string[] {
  const parts = header.split(';').map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const [name, ...rest] = part.split(/\s+/);
    if (name.toLowerCase() === directive.toLowerCase()) {
      return rest;
    }
  }
  return [];
}

beforeAll(async () => {
  const prevNodeEnv = process.env.NODE_ENV;
  // Mantemos NODE_ENV != production para nao exigir JWT/secrets de prod no mount.
  if (prevNodeEnv === 'production') process.env.NODE_ENV = 'test';

  const { registerRoutes } = await import('../../../server/routes/index');
  app = express();
  await registerRoutes(app);

  // IMPORTANTE: /api/health e /api/ready sao registrados ANTES do
  // `app.use(helmet(...))` em routes/index.ts (short-circuit com res.json antes
  // do helmet). Para capturar o header CSP do Helmet, registramos uma rota
  // probe DEPOIS de registerRoutes — a request passa pelo helmet (use anterior
  // na stack) antes de chegar nela.
  app.get('/__csp_probe__', (_req, res) => res.status(200).send('ok'));
  const res = await request(app).get('/__csp_probe__');
  cspHeader = String(res.headers['content-security-policy'] ?? '');
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe('CSP header — RF-01.1 scriptSrc (Web Playback SDK)', () => {
  it('header content-security-policy existe', () => {
    expect(cspHeader.length).toBeGreaterThan(0);
  });

  it('scriptSrc inclui https://sdk.scdn.co (carrega spotify-player.js)', () => {
    const sources = directiveSources(cspHeader, 'script-src');
    expect(sources).toContain('https://sdk.scdn.co');
  });

  it('scriptSrc NAO ganha https: global (NFR seguranca ADR-220 A2)', () => {
    const sources = directiveSources(cspHeader, 'script-src');
    expect(sources).not.toContain('https:');
  });
});

describe('CSP header — RF-01.1 connectSrc (REST + WebSocket dealer)', () => {
  it('connectSrc inclui https://api.spotify.com (PUT /me/player/*)', () => {
    const sources = directiveSources(cspHeader, 'connect-src');
    expect(sources).toContain('https://api.spotify.com');
  });

  it('connectSrc inclui https://*.spotify.com (subdominios dinamicos)', () => {
    const sources = directiveSources(cspHeader, 'connect-src');
    expect(sources).toContain('https://*.spotify.com');
  });

  it('connectSrc inclui wss://dealer.spotify.com (WebSocket de estado)', () => {
    const sources = directiveSources(cspHeader, 'connect-src');
    expect(sources).toContain('wss://dealer.spotify.com');
  });

  it('connectSrc inclui wss://*.spotify.com', () => {
    const sources = directiveSources(cspHeader, 'connect-src');
    expect(sources).toContain('wss://*.spotify.com');
  });

  it('connectSrc inclui https://*.scdn.co (CDN metadados/segmentos)', () => {
    const sources = directiveSources(cspHeader, 'connect-src');
    expect(sources).toContain('https://*.scdn.co');
  });

  it('connectSrc NAO ganha https: global', () => {
    const sources = directiveSources(cspHeader, 'connect-src');
    expect(sources).not.toContain('https:');
  });
});

describe('CSP header — RF-01.1 frameSrc (iframe EME/Widevine)', () => {
  it('frameSrc inclui https://sdk.scdn.co', () => {
    const sources = directiveSources(cspHeader, 'frame-src');
    expect(sources).toContain('https://sdk.scdn.co');
  });

  it('frameSrc inclui https://*.spotify.com', () => {
    const sources = directiveSources(cspHeader, 'frame-src');
    expect(sources).toContain('https://*.spotify.com');
  });
});

describe('CSP header — RF-01.1 mediaSrc (stream/preview SDK + HTML5 30s)', () => {
  it('mediaSrc inclui https://*.scdn.co', () => {
    const sources = directiveSources(cspHeader, 'media-src');
    expect(sources).toContain('https://*.scdn.co');
  });

  it('mediaSrc inclui https://*.spotify.com', () => {
    const sources = directiveSources(cspHeader, 'media-src');
    expect(sources).toContain('https://*.spotify.com');
  });

  it('mediaSrc inclui https://sdk.scdn.co', () => {
    const sources = directiveSources(cspHeader, 'media-src');
    expect(sources).toContain('https://sdk.scdn.co');
  });

  it('mediaSrc mantem blob: (preview HTML5 ja existente — nao regredir)', () => {
    const sources = directiveSources(cspHeader, 'media-src');
    expect(sources).toContain('blob:');
  });
});

describe('CSP header — RF-05 Google Fonts', () => {
  it('styleSrc inclui https://fonts.googleapis.com', () => {
    const sources = directiveSources(cspHeader, 'style-src');
    expect(sources).toContain('https://fonts.googleapis.com');
  });

  it('fontSrc inclui https://fonts.gstatic.com', () => {
    const sources = directiveSources(cspHeader, 'font-src');
    expect(sources).toContain('https://fonts.gstatic.com');
  });
});

describe('CSP header — nao-regressao de hosts existentes', () => {
  it('scriptSrc mantem self + unsafe-inline (ADR-220: aditivo)', () => {
    const sources = directiveSources(cspHeader, 'script-src');
    expect(sources).toContain("'self'");
    expect(sources).toContain("'unsafe-inline'");
  });

  it('connectSrc mantem Stripe/Mux/Anthropic (nao remover hosts atuais)', () => {
    const sources = directiveSources(cspHeader, 'connect-src');
    expect(sources).toContain('https://api.stripe.com');
    expect(sources).toContain('https://stream.mux.com');
    expect(sources).toContain('https://api.anthropic.com');
  });

  it('frameSrc mantem Stripe + Mux', () => {
    const sources = directiveSources(cspHeader, 'frame-src');
    expect(sources).toContain('https://js.stripe.com');
    expect(sources).toContain('https://stream.mux.com');
  });

  it('imgSrc continua cobrindo https: (capas SCDN OK — nao regredir)', () => {
    const sources = directiveSources(cspHeader, 'img-src');
    expect(sources).toContain('https:');
  });

  it('mediaSrc mantem Mux (nao regredir)', () => {
    const sources = directiveSources(cspHeader, 'media-src');
    expect(sources).toContain('https://stream.mux.com');
  });
});

describe('CSP header — RF-01.2 Permissions-Policy ausente (EME/autoplay nao bloqueados)', () => {
  it('Helmet NAO seta permissions-policy restritiva', async () => {
    const res = await request(app).get('/__csp_probe__');
    // Helmet nao seta Permissions-Policy por default. RF-01.2: nao introduzir
    // uma policy restritiva que bloqueie encrypted-media/autoplay.
    const pp = res.headers['permissions-policy'];
    if (pp) {
      // Se existir, NAO pode negar encrypted-media nem autoplay.
      expect(pp).not.toMatch(/encrypted-media=\(\)/);
      expect(pp).not.toMatch(/autoplay=\(\)/);
    } else {
      expect(pp).toBeUndefined();
    }
  });
});
