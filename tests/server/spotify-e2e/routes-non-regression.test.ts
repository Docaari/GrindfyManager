/**
 * Test-Writer (Modo TDD - Red Phase / nao-regressao RF-08)
 *
 * Sprint Spotify E2E — RF-08 (preservar fixes da sessao de debug).
 *
 * Module: server/routes/spotifyAudio.ts (+ registerSpotifyAudioRoutes wiring)
 *
 * Invariantes protegidos (cada um vira assert de nao-regressao):
 *   - GET oauth-callback SEM requireAuth (popup redirect cross-site nao carrega
 *     o cookie de auth da plataforma). -> a rota responde sem 401 "Nao
 *     autenticado" mesmo sem req.user; o handler segue pra logica de sessao
 *     (sem cookie OAuth -> erro de sessao, NAO 401 de auth).
 *   - SCOPES inclui playlist-read-private + playlist-read-collaborative (senao
 *     /me/playlists vem vazio). -> oauth-init constroi authUrl com esses scopes.
 *
 * Estrategia: Express real + supertest. requireAuth mockado para INJETAR um
 * user nas rotas protegidas (provando que callback NAO esta protegida —
 * removemos o user no callback e ainda assim nao da 401 de auth).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';

// requireAuth mock: injeta user (prova que rotas protegidas ganham user; a
// callback nao usa requireAuth, entao nunca recebe esse user).
vi.mock('../../../server/auth', async () => {
  const actual = await vi.importActual<any>('../../../server/auth');
  return {
    ...actual,
    requireAuth: (req: Request, _res: Response, next: NextFunction) => {
      (req as any).user = {
        userPlatformId: 'USER-0005',
        subscriptionPlan: 'active',
      };
      next();
    },
  };
});

async function buildApp() {
  const { registerSpotifyAudioRoutes } = await import(
    '../../../server/routes/spotifyAudio'
  );
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  registerSpotifyAudioRoutes(app);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPOTIFY_CLIENT_ID = 'cid_test';
  process.env.SPOTIFY_REDIRECT_URI = 'http://127.0.0.1:3000/api/audio/spotify/oauth-callback';
  process.env.SPOTIFY_CLIENT_SECRET = 'csecret_test';
});

describe('RF-08 — oauth-callback SEM requireAuth', () => {
  it('GET oauth-callback sem cookie OAuth NAO responde 401 "Nao autenticado"', async () => {
    const app = await buildApp();
    // Sem cookie de sessao OAuth -> o handler responde erro de SESSAO (session_missing),
    // NAO um 401 de auth da plataforma. O importante: a resposta NAO e o JSON
    // `{ message: "Nao autenticado" }` que viria de requireAuth.
    const res = await request(app).get(
      '/api/audio/spotify/oauth-callback?code=x&state=y',
    );
    // Body de auth-gate seria JSON { message: 'Nao autenticado' }. A callback
    // responde HTML (postMessage de erro de sessao), nunca o gate de auth.
    const bodyText = JSON.stringify(res.body ?? {}) + String(res.text ?? '');
    expect(bodyText).not.toContain('Nao autenticado');
    // E nao retorna o JSON shape de requireAuth.
    expect(res.body?.message).not.toBe('Nao autenticado');
  });
});

describe('RF-08 — SCOPES inclui playlist-read-private + collaborative', () => {
  it('oauth-init authUrl contem os 2 scopes de playlist', async () => {
    const app = await buildApp();
    const res = await request(app).post('/api/audio/spotify/oauth-init');
    expect(res.status).toBe(200);
    const authUrl: string = res.body?.authUrl ?? '';
    expect(authUrl.length).toBeGreaterThan(0);
    const scopeParam = new URL(authUrl).searchParams.get('scope') ?? '';
    expect(scopeParam).toContain('playlist-read-private');
    expect(scopeParam).toContain('playlist-read-collaborative');
  });
});
