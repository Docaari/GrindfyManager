import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth';
import { db } from './db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

// OAuth configuration types
interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

// OAuth provider configurations
const OAUTH_PROVIDERS = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scopes: ['openid', 'profile', 'email'],
  },
  // Future providers can be added here
} as const;

// OAuth state storage (in production, use Redis or database)
const oauthStateStore = new Map<string, { provider: string; timestamp: number }>();

export class OAuthService {
  private static readonly STATE_EXPIRY = 10 * 60 * 1000; // 10 minutes

  // Generate OAuth authorization URL
  static generateAuthUrl(provider: keyof typeof OAUTH_PROVIDERS, redirectUri: string): string {
    const config = OAUTH_PROVIDERS[provider];
    if (!config) {
      throw new Error(`Unsupported OAuth provider: ${provider}`);
    }

    const state = nanoid();
    const timestamp = Date.now();
    
    // Store state for validation
    oauthStateStore.set(state, { provider, timestamp });

    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: config.scopes.join(' '),
      state,
      access_type: 'offline',
      prompt: 'consent',
    });

    return `${config.authUrl}?${params.toString()}`;
  }

  // Validate OAuth state
  // FIX (auth-launch P0.6): consume state on validation. Sem isso, mesmo state
  // pode ser reutilizado por 10min — janela de replay attack.
  static validateState(state: string): boolean {
    const stateData = oauthStateStore.get(state);
    if (!stateData) return false;

    const now = Date.now();
    if (now - stateData.timestamp > this.STATE_EXPIRY) {
      oauthStateStore.delete(state);
      return false;
    }

    // Consume state on successful validation (one-shot use).
    oauthStateStore.delete(state);
    return true;
  }

  // Decode a Google id_token (JWT) payload WITHOUT verifying the signature. The
  // token arrives over a direct server-to-server TLS response from Google's token
  // endpoint, so signature verification is belt-and-suspenders — we only read the
  // `email` / `email_verified` claims as a second source of truth alongside userinfo.
  static decodeIdToken(idToken: string | undefined | null): { email?: string; email_verified?: boolean } | null {
    if (!idToken || typeof idToken !== 'string') return null;
    try {
      const parts = idToken.split('.');
      if (parts.length !== 3) return null;
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '==='.slice((b64.length + 3) % 4);
      const json = Buffer.from(padded, 'base64').toString('utf-8');
      const claims = JSON.parse(json);
      return {
        email: typeof claims.email === 'string' ? claims.email : undefined,
        // Google sends email_verified as boolean true/false or string "true"/"false".
        email_verified: claims.email_verified === true || claims.email_verified === 'true',
      };
    } catch {
      return null;
    }
  }

  // Exchange authorization code for access token
  static async exchangeCodeForToken(
    provider: keyof typeof OAUTH_PROVIDERS,
    code: string,
    redirectUri: string
  ): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number; idToken?: string }> {
    const config = OAUTH_PROVIDERS[provider];
    if (!config) {
      throw new Error(`Unsupported OAuth provider: ${provider}`);
    }

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      throw new Error(`OAuth token exchange failed: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      idToken: data.id_token,
    };
  }

  // Get user info from OAuth provider
  static async getUserInfo(
    provider: keyof typeof OAUTH_PROVIDERS,
    accessToken: string
  ): Promise<{
    id: string;
    email: string;
    name: string;
    firstName?: string;
    lastName?: string;
    picture?: string;
    verified?: boolean;
  }> {
    const config = OAUTH_PROVIDERS[provider];
    if (!config) {
      throw new Error(`Unsupported OAuth provider: ${provider}`);
    }

    const response = await fetch(config.userInfoUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      id: data.id,
      email: data.email,
      name: data.name,
      firstName: data.given_name,
      lastName: data.family_name,
      picture: data.picture,
      verified: data.verified_email,
    };
  }

  // Create or update user from OAuth data
  static async createOrUpdateOAuthUser(
    provider: string,
    oauthData: {
      id: string;
      email: string;
      name: string;
      firstName?: string;
      lastName?: string;
      picture?: string;
      verified?: boolean;
    }
  ) {
    // SECURITY (auth-launch Wave 3): never provision / link an account from an
    // OAuth identity whose email is not verified by the provider. Without this an
    // attacker controlling an unverified-email Google account could create a row
    // for someone else's address (account pre-provisioning / takeover surface).
    // Callers must surface this as an auth error — do NOT fall through to a row.
    if (oauthData.verified !== true) {
      const err: any = new Error('OAUTH_EMAIL_NOT_VERIFIED');
      err.code = 'OAUTH_EMAIL_NOT_VERIFIED';
      throw err;
    }
    try {
      // Check if user exists by email
      const [existingUser] = await db.select()
        .from(users)
        .where(eq(users.email, oauthData.email));

      if (existingUser) {
        // Update existing user with OAuth data
        const [updatedUser] = await db.update(users)
          .set({
            firstName: oauthData.firstName || existingUser.firstName,
            lastName: oauthData.lastName || existingUser.lastName,
            googleId: oauthData.id,
            profileImageUrl: oauthData.picture || existingUser.profileImageUrl,
            emailVerified: true, // reached here ⇒ provider-verified
            updatedAt: new Date(),
          })
          .where(eq(users.id, existingUser.id))
          .returning();

        return updatedUser;
      } else {
        // Create new user with OAuth data
        // FIX (auth-launch P0.1): adicionar userPlatformId + defaults trial/role/status.
        // Sem userPlatformId, requireAuth nao consegue resolver req.user (login OAuth quebrado).
        const userPlatformId = await AuthService.generateNextUserPlatformId();
        const now = new Date();
        const trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14d

        // Username unico: derivado do nome + sufixo nanoid (evita colisao em
        // emails com mesmo nome humano "Joao Silva" registrando 2x).
        const baseUsername = (oauthData.name || oauthData.email.split('@')[0])
          .toLowerCase()
          .replace(/\s+/g, '_')
          .replace(/[^a-z0-9_]/g, '');

        const [newUser] = await db.insert(users).values({
          id: nanoid(),
          userPlatformId,
          email: oauthData.email,
          name: oauthData.name,
          username: `${baseUsername}_${nanoid(4)}`,
          firstName: oauthData.firstName,
          lastName: oauthData.lastName,
          googleId: oauthData.id,
          profileImageUrl: oauthData.picture,
          emailVerified: true, // reached here ⇒ provider-verified (see guard above)
          status: 'active',
          role: 'user',
          subscriptionPlan: 'trial',
          trialEndsAt,
          createdAt: now,
          updatedAt: now,
        } as any).returning();

        return newUser;
      }
    } catch (error) {
      throw error;
    }
  }

  // Clean up expired OAuth states
  static cleanupExpiredStates() {
    const now = Date.now();
    for (const [state, data] of Array.from(oauthStateStore.entries())) {
      if (now - data.timestamp > this.STATE_EXPIRY) {
        oauthStateStore.delete(state);
      }
    }
  }
}

// Cleanup expired states every 5 minutes
setInterval(() => {
  OAuthService.cleanupExpiredStates();
}, 5 * 60 * 1000);

export default OAuthService;