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
  static validateState(state: string): boolean {
    const stateData = oauthStateStore.get(state);
    if (!stateData) return false;

    const now = Date.now();
    if (now - stateData.timestamp > this.STATE_EXPIRY) {
      oauthStateStore.delete(state);
      return false;
    }

    return true;
  }

  // Exchange authorization code for access token
  static async exchangeCodeForToken(
    provider: keyof typeof OAUTH_PROVIDERS,
    code: string,
    redirectUri: string
  ): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
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
            emailVerified: oauthData.verified || existingUser.emailVerified,
            updatedAt: new Date(),
          } as any) // TODO: type properly
          .where(eq(users.id, existingUser.id))
          .returning();

        return updatedUser;
      } else {
        // Create new user with OAuth data
        const [newUser] = await db.insert(users).values({
          id: nanoid(),
          email: oauthData.email,
          username: oauthData.name.toLowerCase().replace(/\s+/g, '_'),
          firstName: oauthData.firstName,
          lastName: oauthData.lastName,
          googleId: oauthData.id,
          profileImageUrl: oauthData.picture,
          emailVerified: oauthData.verified || false,
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any).returning();

        return newUser;
      }
    } catch (error) {
      console.error('Error creating/updating OAuth user:', error);
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