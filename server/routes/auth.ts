import type { Express } from "express";
import { AuthService, requireAuth, requirePermission } from "../auth";
import OAuthService from "../oauth";
import EmailService from "../emailService";
import { storage } from "../storage";
import { db } from "../db";
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  users,
  permissions,
  userPermissions,
} from "@shared/schema";
import { nanoid } from "nanoid";
import { eq, and } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { recordRefreshToken, rotateRefreshToken, revokeAllForUser } from "../refreshTokenStore";

// Best-effort metadata for refresh-token audit rows.
function reqMeta(req: any): { userAgent: string | null; ip: string | null } {
  return { userAgent: (req?.headers?.["user-agent"] as string) ?? null, ip: req?.ip ?? null };
}
// Record a freshly issued refresh token; a DB hiccup here must not block auth
// (the worst case is the next /refresh taking the "unrecorded legacy" path).
async function recordRefreshTokenSafe(userId: string, rawToken: string, req: any): Promise<void> {
  try {
    await recordRefreshToken({ userId, rawToken, ...reqMeta(req) });
  } catch (e: any) {
    console.error("auth.refresh_token.record_failed", { userId, err: e?.message ?? String(e) });
  }
}

// Constant-time dummy hash: when login is attempted against a non-existent email
// we still run one bcrypt.compare so the response time doesn't reveal whether the
// account exists. Computed once at module load (cost 12, matching real hashes).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("grindfy-login-timing-equalizer", 12);

// Auth cookie helpers.
// sameSite is 'lax' (not 'strict'): 'strict' drops the cookie on the
// cross-site-initiated navigation back from the Google OAuth callback in some
// browsers (Safari/Brave), breaking OAuth login. 'lax' still blocks CSRF on
// state-changing POSTs (which the double-submit CSRF token also covers).
function setAuthCookies(res: any, accessToken: string, refreshToken: string) {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('grindfy_access_token', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60 * 1000, // 15 minutes
  });
  res.cookie('grindfy_refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
}

function clearAuthCookies(res: any) {
  res.clearCookie('grindfy_access_token', { path: '/' });
  res.clearCookie('grindfy_refresh_token', { path: '/' });
}

export function registerAuthRoutes(app: Express): void {
  // Rate limiting for authentication endpoints
  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per 15-minute window per IP+email
    message: {
      message: 'Muitas tentativas de login. Tente novamente em 15 minutos.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Rate limit by IP + email if available
      const email = req.body?.email || '';
      return `${req.ip}:${email}`;
    }
  });

  // Normalize an email for rate-limit bucketing: lowercase, trim, and collapse
  // plus-addressing (victim+1@x.com / victim+anything@x.com → victim@x.com) so an
  // attacker can't sidestep the per-email cap by varying the +tag.
  const emailRateLimitKey = (raw: unknown): string => {
    const email = String(raw ?? '').trim().toLowerCase();
    const at = email.lastIndexOf('@');
    if (at <= 0) return ''; // no usable email — caller falls back to IP key
    const local = email.slice(0, at).split('+')[0];
    const domain = email.slice(at + 1);
    return `${local}@${domain}`;
  };

  // Dedicated, email-scoped limiter for password-reset requests. Combine with
  // authRateLimit (IP+email): this one caps how many resets a *victim's mailbox*
  // can receive regardless of the attacker's IP rotation. 3 per rolling hour.
  const forgotPasswordRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
    message: { message: 'Muitas solicitações de recuperação para este email. Tente novamente em 1 hora.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const k = emailRateLimitKey(req.body?.email);
      return k ? `fp:${k}` : `fp-ip:${req.ip}`;
    },
  });

  // Generate CSRF token endpoint
  app.get('/api/csrf-token', (_req: any, res: any) => {
    const token = crypto.randomBytes(32).toString('hex');
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('grindfy_csrf_token', token, {
      httpOnly: false, // Must be readable by JavaScript
      secure: isProd,
      sameSite: 'strict',
      path: '/',
    });
    res.json({ csrfToken: token });
  });

  // Auth routes
  app.get('/api/auth/user', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Manual authentication routes (for custom auth system)
  app.post('/api/auth/register', authRateLimit, async (req, res) => {
    try {
      const userData = registerSchema.parse(req.body);

      // Check if user exists
      const existingUser = await db.select()
        .from(users)
        .where(eq(users.email, userData.email));

      if (existingUser.length > 0) {
        return res.status(400).json({
          message: 'E-mail já está em uso'
        });
      }

      // Hash password
      const hashedPassword = await AuthService.hashPassword(userData.password);

      // Generate user platform ID
      const userPlatformId = await AuthService.generateNextUserPlatformId();

      // Create user with pending verification status
      const [newUser] = await db.insert(users).values({
        id: nanoid(),
        userPlatformId,
        email: userData.email,
        name: userData.name,
        firstName: (userData.name || '').split(' ')[0] || userData.name || '',
        lastName: (userData.name || '').split(' ').slice(1).join(' ') || '',
        username: userData.email.split('@')[0] + '_' + nanoid(4), // Generate unique username
        password: hashedPassword,
        status: 'pending_verification',
        emailVerified: false,
        role: 'user',
        subscriptionPlan: 'trial',
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14-day trial
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      // Generate email verification token
      const verificationToken = await EmailService.generateEmailVerificationToken(newUser.id, newUser.email!);

      // Send verification email
      await EmailService.sendEmailVerification(newUser.email!, verificationToken);

      // Log registration
      await AuthService.logAccess(newUser.id, 'user_registered', undefined, req);

      res.status(201).json({
        success: true,
        message: 'Conta criada com sucesso! Verifique seu email para confirmar sua conta.',
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          status: newUser.status,
          emailVerified: newUser.emailVerified,
        },
        requiresVerification: true
      });
    } catch (error) {
      if ((error as any).issues) {
        return res.status(400).json({
          message: 'Dados inválidos',
          errors: (error as any).issues
        });
      }
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  // TEST: Login route without ANY middleware
  app.post('/api/auth/login', authRateLimit, async (req, res) => {

    try {
      const loginData = loginSchema.parse(req.body);

      // Check if account is locked
      const lockStatus = await AuthService.isAccountLocked(loginData.email);
      if (lockStatus.locked) {
        await AuthService.logAccess(null, 'login_blocked', undefined, req);
        return res.status(423).json({
          message: `Conta temporariamente bloqueada. Tente novamente em ${lockStatus.remainingTime} minutos.`,
          locked: true,
          remainingTime: lockStatus.remainingTime
        });
      }

      // Find user
      const [user] = await db.select()
        .from(users)
        .where(eq(users.email, loginData.email));

      if (!user) {
        // FIX (auth-launch P1.9 + Wave 5): generic message AND a dummy bcrypt
        // compare so neither the response body nor the timing reveals whether
        // the email is registered (email enumeration leak).
        await bcrypt.compare(loginData.password, DUMMY_PASSWORD_HASH);
        await AuthService.logAccess(null, 'login_failed', undefined, req);

        return res.status(401).json({
          message: 'Credenciais inválidas. Verifique e tente novamente.'
        });
      }

      // Check password
      const isPasswordValid = await AuthService.verifyPassword(
        loginData.password,
        user.password!
      );

      if (!isPasswordValid) {
        // Handle failed login attempt
        const failResult = await AuthService.handleFailedLogin(loginData.email);
        await AuthService.logAccess(user.userPlatformId, 'login_failed', undefined, req);

        if (failResult.locked) {
          return res.status(423).json({
            message: `Conta temporariamente bloqueada após muitas tentativas inválidas. Tente novamente em ${failResult.lockTime} minutos.`,
            locked: true,
            remainingTime: failResult.lockTime
          });
        }

        return res.status(401).json({
          message: `Senha incorreta. Restam ${failResult.attemptsRemaining} tentativas.`
        });
      }

      // Check user status
      if (user.status === 'blocked') {
        await AuthService.logAccess(user.userPlatformId, 'login_blocked', undefined, req);
        return res.status(403).json({
          message: 'Conta bloqueada. Entre em contato com o suporte.'
        });
      }

      // Check email verification
      if (!user.emailVerified) {
        await AuthService.logAccess(user.userPlatformId, 'login_unverified', undefined, req);
        return res.status(403).json({
          message: 'Sua conta ainda não foi confirmada. Verifique seu email (incluindo a pasta de spam) e clique no link de confirmação para ativar sua conta.',
          requiresVerification: true,
          email: user.email
        });
      }

      // Get user permissions
      const userPermissionsList = await db.select({
        permissionName: permissions.name
      })
      .from(userPermissions)
      .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
      .where(and(
        eq(userPermissions.userId, user.userPlatformId),
        eq(userPermissions.granted, true)
      ));

      // Reset failed login attempts on successful login
      await AuthService.resetFailedAttempts(loginData.email);

      // Check and update expired trial/subscription
      const now = new Date();
      let currentPlan = user.subscriptionPlan || 'trial';
      if (currentPlan === 'trial' && user.trialEndsAt && new Date(user.trialEndsAt) <= now) {
        currentPlan = 'expired';
        await db.update(users).set({ subscriptionPlan: 'expired', updatedAt: now }).where(eq(users.userPlatformId, user.userPlatformId));
      } else if (currentPlan === 'active' && user.subscriptionEndsAt && new Date(user.subscriptionEndsAt) <= now) {
        currentPlan = 'expired';
        await db.update(users).set({ subscriptionPlan: 'expired', updatedAt: now }).where(eq(users.userPlatformId, user.userPlatformId));
      }

      // Update last login
      await db.update(users)
        .set({ lastLogin: new Date() })
        .where(eq(users.userPlatformId, user.userPlatformId));

      // Generate tokens
      const tokens = AuthService.generateTokens(user.userPlatformId, user.userPlatformId!, user.email!);

      // Set httpOnly cookies + record the refresh token for rotation (ADR-143).
      setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
      await recordRefreshTokenSafe(user.userPlatformId, tokens.refreshToken, req);

      // Log successful login
      await AuthService.logAccess(user.userPlatformId, 'login_success', undefined, req);

      // Still include tokens in response body for backward compatibility
      res.json({
        message: 'Login realizado com sucesso',
        success: true,
        user: {
          id: user.userPlatformId,
          email: user.email,
          name: user.name,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          status: user.status,
          emailVerified: user.emailVerified,
          subscriptionPlan: currentPlan,
          trialEndsAt: user.trialEndsAt ? user.trialEndsAt.toISOString() : null,
          subscriptionEndsAt: user.subscriptionEndsAt ? user.subscriptionEndsAt.toISOString() : null,
          permissions: userPermissionsList.map(p => p.permissionName)
        },
        ...tokens
      });
    } catch (error) {
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  app.post('/api/auth/refresh', async (req: any, res) => {
    try {
      // Accept refresh token from cookie or request body (backward compatibility)
      const refreshToken = req.cookies?.grindfy_refresh_token || req.body?.refreshToken;

      if (!refreshToken) {
        return res.status(401).json({ message: 'Token de atualização necessário' });
      }

      const payload = AuthService.verifyRefreshToken(refreshToken);
      if (!payload) {
        return res.status(401).json({ message: 'Token de atualização inválido' });
      }

      // Check and update expired trial/subscription on refresh
      const [refreshUser] = await db.select({
        userPlatformId: users.userPlatformId,
        subscriptionPlan: users.subscriptionPlan,
        trialEndsAt: users.trialEndsAt,
        subscriptionEndsAt: users.subscriptionEndsAt,
      }).from(users).where(eq(users.userPlatformId, payload.userPlatformId));

      if (refreshUser) {
        const now = new Date();
        const plan = refreshUser.subscriptionPlan || 'trial';
        if (plan === 'trial' && refreshUser.trialEndsAt && new Date(refreshUser.trialEndsAt) <= now) {
          await db.update(users).set({ subscriptionPlan: 'expired', updatedAt: now }).where(eq(users.userPlatformId, refreshUser.userPlatformId));
        } else if (plan === 'active' && refreshUser.subscriptionEndsAt && new Date(refreshUser.subscriptionEndsAt) <= now) {
          await db.update(users).set({ subscriptionPlan: 'expired', updatedAt: now }).where(eq(users.userPlatformId, refreshUser.userPlatformId));
        }
      }

      // Rotate the refresh token (ADR-143): consumes the presented token, issues a
      // new pair, and revokes the whole family if a consumed token is replayed.
      const rotated = await rotateRefreshToken(
        refreshToken,
        payload.userPlatformId,
        () => AuthService.generateTokens(payload.userId, payload.userPlatformId, payload.email),
        reqMeta(req),
      );
      if (!rotated) {
        clearAuthCookies(res);
        return res.status(401).json({ message: 'Sessão expirada. Faça login novamente.' });
      }

      // Set new httpOnly cookies
      setAuthCookies(res, rotated.accessToken, rotated.refreshToken);

      // Still include tokens in response body for backward compatibility
      res.json(rotated);
    } catch (error) {
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  app.post('/api/auth/logout', requireAuth, async (req, res) => {
    try {
      // Log logout
      await AuthService.logAccess(req.user!.userPlatformId, 'logout', undefined, req);

      // Revoke this user's refresh tokens server-side (ADR-143) then clear cookies.
      try { await revokeAllForUser(req.user!.userPlatformId, 'logout'); }
      catch (e: any) { console.error('auth.refresh_token.revoke_logout_failed', { err: e?.message ?? String(e) }); }
      clearAuthCookies(res);

      res.json({ message: 'Logout realizado com sucesso' });
    } catch (error) {
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  app.get('/api/auth/me', requireAuth, async (req, res) => {
    try {
      res.json(req.user);
    } catch (error) {
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/users/me — Sprint Cooldown-2 (Sleep Gate suave)
  //
  // Ownership: usa req.user.userPlatformId (NAO confia em body.userId).
  // Sprint 2 escopo: aceita apenas { dashboardSnoozedUntil: null } para limpar
  // o snooze do splash. Qualquer outra chave eh ignorada (forward-compat).
  // ---------------------------------------------------------------------------
  app.patch('/api/users/me', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.userPlatformId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }
      const body = req.body ?? {};

      let updated: any = null;
      if ('dashboardSnoozedUntil' in body) {
        const v = body.dashboardSnoozedUntil;
        if (v === null) {
          updated = await storage.clearUserDashboardSnoozedUntil(userId);
        } else if (typeof v === 'string') {
          const d = new Date(v);
          if (Number.isNaN(d.getTime())) {
            res.status(400).json({ message: 'dashboardSnoozedUntil invalido' });
            return;
          }
          updated = await storage.setUserDashboardSnoozedUntil(userId, d);
        } else {
          res.status(400).json({ message: 'dashboardSnoozedUntil invalido' });
          return;
        }
      }

      res.status(200).json(updated ?? { userPlatformId: userId });
    } catch (err: any) {
      console.error('PATCH /api/users/me failed:', err);
      res.status(500).json({ message: err?.message ?? 'Erro interno do servidor' });
    }
  });

  // Email verification routes
  app.post('/api/auth/verify-email', async (req, res) => {
    try {
      const { token } = verifyEmailSchema.parse(req.body);

      const userEmail = await EmailService.verifyUserEmailWithData(token);

      if (userEmail) {
        // Find user to generate auto-login tokens
        const [user] = await db.select()
          .from(users)
          .where(eq(users.email, userEmail));

        if (user) {
          // Auto-login: set the session via httpOnly cookies only. SECURITY
          // (auth-launch Wave 3): do NOT return the JWTs in the JSON body — the
          // frontend used to persist them in localStorage, defeating the httpOnly
          // model and exposing the 30d refresh token to any XSS.
          const tokens = AuthService.generateTokens(user.userPlatformId, user.userPlatformId!, user.email!);
          setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
          await recordRefreshTokenSafe(user.userPlatformId, tokens.refreshToken, req);

          // Log successful verification and auto-login
          await AuthService.logAccess(user.userPlatformId, 'email_verified_auto_login', undefined, req);

          res.json({
            message: 'Email verificado com sucesso',
            autoLogin: true,
            user: {
              id: user.userPlatformId,
              email: user.email,
              name: user.name,
              username: user.username,
              firstName: user.firstName,
              lastName: user.lastName,
              status: user.status,
              subscriptionPlan: user.subscriptionPlan || 'trial',
              trialEndsAt: user.trialEndsAt ? user.trialEndsAt.toISOString() : null,
              subscriptionEndsAt: user.subscriptionEndsAt ? user.subscriptionEndsAt.toISOString() : null
            }
          });
        } else {
          res.json({ message: 'Email verificado com sucesso' });
        }
      } else {
        res.status(400).json({ message: 'Token inválido ou expirado' });
      }
    } catch (error) {
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  app.post('/api/auth/resend-verification', async (req, res) => {
    try {
      const { email } = forgotPasswordSchema.parse(req.body);

      const success = await EmailService.resendEmailVerification(email);

      if (success) {
        res.json({ message: 'Email de verificação reenviado com sucesso' });
      } else {
        res.status(400).json({ message: 'Email não encontrado ou já verificado' });
      }
    } catch (error) {
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  // Password reset routes
  // FIX (auth-launch P1.7 + Wave 3): authRateLimit (IP+email, 5/15min) caps the
  // attacker's IP; forgotPasswordRateLimit (normalized email, 3/hour) caps how
  // many reset emails a victim's mailbox can be flooded with regardless of IP.
  app.post('/api/auth/forgot-password', authRateLimit, forgotPasswordRateLimit, async (req, res) => {
    try {
      const { email } = forgotPasswordSchema.parse(req.body);

      // Find user
      const [user] = await db.select()
        .from(users)
        .where(eq(users.email, email));

      if (!user) {
        // Don't reveal if email exists for security, but provide proper success response format
        return res.json({
          success: true,
          message: 'Link de recuperação enviado! Verifique seu email para redefinir sua senha.'
        });
      }

      // Generate password reset token
      const resetToken = await EmailService.generatePasswordResetToken(user.id, email);

      // Send password reset email
      await EmailService.sendPasswordReset(email, resetToken);

      res.json({
        success: true,
        message: 'Link de recuperação enviado! Verifique seu email para redefinir sua senha.'
      });
    } catch (error) {
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      // FIX (auth-launch P0.2): validar com resetPasswordSchema (importado mas
      // nao usado). Antes aceitava senha vazia, qualquer length, sem confirm.
      let parsed;
      try {
        parsed = resetPasswordSchema.parse(req.body);
      } catch (zodErr: any) {
        return res.status(400).json({
          success: false,
          message: zodErr?.issues?.[0]?.message ?? 'Dados invalidos',
          errors: zodErr?.issues,
        });
      }

      const { token, password } = parsed;

      // Verify reset token
      const tokenData = await EmailService.verifyPasswordResetToken(token);
      if (!tokenData) {
        return res.status(400).json({ success: false, message: 'Token inválido ou expirado' });
      }

      // Hash new password
      const hashedPassword = await AuthService.hashPassword(password);

      // Update user password
      const [updatedUserRow] = await db.update(users)
        .set({
          password: hashedPassword,
          updatedAt: new Date(),
        })
        .where(eq(users.id, tokenData.userId))
        .returning({ userPlatformId: users.userPlatformId });

      // Wave-1 launch-fix #7: mark the reset token consumed (single-use). Without
      // this the link is replayable for the rest of its 1h TTL.
      await EmailService.markPasswordResetTokenUsed(token);

      // ADR-143: a password change must invalidate every existing session.
      if (updatedUserRow?.userPlatformId) {
        try { await revokeAllForUser(updatedUserRow.userPlatformId, 'password_change'); }
        catch (e: any) { console.error('auth.refresh_token.revoke_pwdchange_failed', { err: e?.message ?? String(e) }); }
      }

      // Clean up old expired tokens
      EmailService.cleanupExpiredTokens();

      // Log password reset
      await AuthService.logAccess(tokenData.userId, 'password_reset', undefined, req);

      res.json({ success: true, message: 'Senha redefinida com sucesso' });
    } catch (error) {
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  // Update user profile route
  app.patch('/api/auth/update-profile', requireAuth, async (req, res) => {
    try {
      const { name, firstName, lastName } = req.body;
      const userPlatformId = req.user!.userPlatformId;

      // Prepare update data
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;

      // Update user in database
      await db.update(users)
        .set(updateData)
        .where(eq(users.userPlatformId, userPlatformId));

      res.json({
        message: 'Perfil atualizado com sucesso',
        success: true
      });
    } catch (error) {
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  // OAuth providers availability (public)
  app.get('/api/auth/providers', (_req, res) => {
    res.json({
      google: !!process.env.GOOGLE_CLIENT_ID,
    });
  });

  // OAuth Google authentication
  app.get('/api/auth/google', async (req, res) => {
    try {
      const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
      const authUrl = OAuthService.generateAuthUrl('google', redirectUri);

      res.redirect(authUrl);
    } catch (error) {
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    try {
      const { code, state } = req.query;

      if (!code || !state) {
        return res.redirect('/login?error=missing_params');
      }

      if (!OAuthService.validateState(state as string)) {
        return res.redirect('/login?error=oauth_failed');
      }

      const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;

      // Exchange code for token
      const tokenData = await OAuthService.exchangeCodeForToken('google', code as string, redirectUri);

      // Get user info
      const userInfo = await OAuthService.getUserInfo('google', tokenData.accessToken);

      // SECURITY (auth-launch Wave 3): require provider-verified email. Cross-check
      // the OIDC id_token's `email_verified` claim (authoritative) against the
      // userinfo `verified_email` flag, and ensure the email matches. Any mismatch
      // ⇒ refuse to provision/login. createOrUpdateOAuthUser throws as a backstop.
      const idClaims = OAuthService.decodeIdToken(tokenData.idToken);
      const idTokenEmailOk = !idClaims || !idClaims.email || idClaims.email.toLowerCase() === String(userInfo.email).toLowerCase();
      const emailVerified =
        userInfo.verified === true &&
        (idClaims ? idClaims.email_verified === true : true) &&
        idTokenEmailOk;
      if (!emailVerified) {
        return res.redirect('/login?error=oauth_account_unverified');
      }

      // FIX (auth-launch P1.11): pre-check account takeover via email.
      // Se ja existe user com mesmo email + senha local + sem googleId,
      // bloqueamos o link automatico — senao um attacker que registrou Google
      // com o email da vitima poderia tomar conta.
      // O usuario tem que fazer login com senha primeiro pra linkar Google
      // (link sera implementado em fluxo de Settings em sprint futura).
      const [conflictUser] = await db.select()
        .from(users)
        .where(eq(users.email, userInfo.email));

      if (conflictUser && conflictUser.password && !conflictUser.googleId) {
        await AuthService.logAccess(conflictUser.userPlatformId, 'oauth_account_conflict', undefined, req);
        return res.redirect('/login?error=oauth_account_conflict');
      }

      // Create or update user (pass the cross-checked verified flag — the storage
      // layer refuses to provision when it isn't strictly true).
      const user = await OAuthService.createOrUpdateOAuthUser('google', { ...userInfo, verified: emailVerified });

      // FIX (auth-launch P1.12): replicar checks status do login local.
      // Se user.status !== 'active' (blocked/pending_verification/inactive),
      // OAuth NAO deve emitir tokens — antes deixava qualquer status entrar.
      if (user.status === 'blocked') {
        await AuthService.logAccess(user.userPlatformId, 'oauth_login_blocked', undefined, req);
        return res.redirect('/login?error=oauth_account_blocked');
      }

      if (user.status === 'pending_verification' || !user.emailVerified) {
        // OAuth do Google deveria vir com emailVerified=true (oauthData.verified).
        // Se mesmo assim cair aqui, bloqueamos pra forcar fluxo de verificacao.
        await AuthService.logAccess(user.userPlatformId, 'oauth_login_unverified', undefined, req);
        return res.redirect('/login?error=oauth_account_unverified');
      }

      // Generate JWT tokens
      const tokens = AuthService.generateTokens(user.userPlatformId, user.userPlatformId!, user.email!);

      // Set httpOnly cookies + record the refresh token for rotation (ADR-143).
      setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
      await recordRefreshTokenSafe(user.userPlatformId, tokens.refreshToken, req);

      // Log successful OAuth login
      await AuthService.logAccess(user.userPlatformId, 'oauth_login_success', undefined, req);

      res.redirect('/home');
    } catch (error) {
      res.redirect('/login?error=oauth_failed');
    }
  });

  // Email verification endpoints
  app.post('/api/auth/send-verification', async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: 'E-mail é obrigatório' });
      }

      const sent = await EmailService.resendEmailVerification(email);

      if (sent) {
        res.json({ message: 'E-mail de verificação enviado' });
      } else {
        res.status(400).json({ message: 'Usuário não encontrado ou e-mail já verificado' });
      }
    } catch (error) {
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  // Verify reset token endpoint
  app.post('/api/auth/verify-reset-token', async (req, res) => {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({ valid: false, message: 'Token é obrigatório' });
      }

      const tokenData = await EmailService.verifyPasswordResetToken(token);

      if (tokenData) {
        res.json({ valid: true, message: 'Token válido' });
      } else {
        res.json({ valid: false, message: 'Token inválido ou expirado' });
      }
    } catch (error) {
      res.status(500).json({ valid: false, message: 'Erro interno do servidor' });
    }
  });

  // Sprint Bankroll-3 RF-6 — stops
  app.get('/api/user-settings/stops', requireAuth, handleGetUserSettingsStops);
  app.put('/api/user-settings/stops', requireAuth, handlePutUserSettingsStops);
  app.post('/api/user-settings/stops/release', requireAuth, handlePostUserSettingsStopsRelease);
}

// =============================================================================
// Sprint Bankroll-3 RF-6 — User settings stops handlers (exportados para teste).
// =============================================================================

import { z } from "zod";

const updateStopsBody = z.object({
  stopLossUsd: z.union([z.number(), z.string(), z.null()]).optional(),
  stopWinUsd: z.union([z.number(), z.string(), z.null()]).optional(),
  stopLockDurationHours: z.number().int().min(1).max(72).optional(),
});

function userIdOfReq(req: any): string | null {
  return req?.user?.userPlatformId ?? null;
}

function isPositiveOrNull(v: any): boolean {
  if (v === null || v === undefined) return true;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) && n > 0;
}

export async function handleGetUserSettingsStops(req: any, res: any): Promise<void> {
  const userId = userIdOfReq(req);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  try {
    const settings: any = (await storage.getUserSettings(userId)) ?? {};
    let currentDayDeltaUsd = 0;
    try {
      const { stopService } = await import("../services/stopService");
      currentDayDeltaUsd = await stopService.getCurrentDayDeltaUsd(userId);
    } catch (err) {
      console.warn("[handleGetUserSettingsStops] getCurrentDayDeltaUsd failed:", (err as any)?.message);
    }
    // ABI (USD) p/ sugestão do stop-loss a frio no warm-up (Fase D #5 / ADR-235 D-2).
    // FX já resolvido server-side (lesson #6) — invested USD / nº torneios do histórico.
    // null degrada graciosamente (esconde a sugestão BI no IntentionBlock).
    let abiUsd: number | null = null;
    try {
      const { getDashboardAllTimeSummary } = await import("../services/dashboardAllTime");
      const summary = await getDashboardAllTimeSummary(userId);
      if (summary && summary.tournaments > 0 && Number.isFinite(summary.invested)) {
        const abi = summary.invested / summary.tournaments;
        abiUsd = abi > 0 ? Number(abi.toFixed(2)) : null;
      }
    } catch (err) {
      console.warn("[handleGetUserSettingsStops] abiUsd resolution failed:", (err as any)?.message);
    }
    res.status(200).json({
      stopLossUsd: settings.stopLossUsd ?? null,
      stopWinUsd: settings.stopWinUsd ?? null,
      stopLockUntil: settings.stopLockUntil ?? null,
      stopLockDurationHours: settings.stopLockDurationHours ?? 12,
      currentDayDeltaUsd,
      abiUsd,
    });
  } catch (err) {
    console.error("[handleGetUserSettingsStops] failed:", err);
    res.status(500).json({ message: "Erro ao buscar stops" });
  }
}

export async function handlePutUserSettingsStops(req: any, res: any): Promise<void> {
  const userId = userIdOfReq(req);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const parsed = updateStopsBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Body invalido", issues: parsed.error.issues });
    return;
  }
  const { stopLossUsd, stopWinUsd, stopLockDurationHours } = parsed.data;
  if (!isPositiveOrNull(stopLossUsd)) {
    res.status(400).json({ message: "stopLossUsd deve ser > 0 ou null" });
    return;
  }
  if (!isPositiveOrNull(stopWinUsd)) {
    res.status(400).json({ message: "stopWinUsd deve ser > 0 ou null" });
    return;
  }
  try {
    // Fase D #5 (RF-04, ADR-235 D-1): trava de edição quente do stop-LOSS.
    // Só aplica quando stopLossUsd está presente no body (mexe no loss).
    if (stopLossUsd !== undefined) {
      const current = (await storage.getUserSettings(userId)) as any;
      const currentLoss =
        current?.stopLossUsd == null ? null : parseFloat(String(current.stopLossUsd));
      const nextLoss =
        stopLossUsd == null
          ? null
          : typeof stopLossUsd === "number"
          ? stopLossUsd
          : parseFloat(String(stopLossUsd));
      // Re-consulta no momento do write (anti-race do edge case).
      // Guard defensivo (lesson #32): se listGrindSessionsByUser não está disponível
      // (ambiente sem essa dependência), trata como "a frio" (sem sessão ativa) —
      // edição livre, comportamento back-compat.
      let hasActiveSession = false;
      if (typeof (storage as any).listGrindSessionsByUser === "function") {
        const sessions = (await storage.listGrindSessionsByUser(userId)) ?? [];
        hasActiveSession = sessions.some((s: any) => s?.status === "active");
      }
      const { canLoosenStopLoss } = await import("../coach/stops/canLoosenStopLoss");
      const decision = canLoosenStopLoss(
        Number.isFinite(currentLoss as any) ? (currentLoss as number) : null,
        Number.isFinite(nextLoss as any) ? (nextLoss as number) : null,
        hasActiveSession,
      );
      if (!decision.allowed) {
        res.status(409).json({
          code: "STOP_LOOSEN_BLOCKED",
          message:
            "Stop-loss comitado a frio é inegociável durante a sessão. Você pode apertar, mas não afrouxar enquanto joga.",
        });
        return;
      }
    }
    await storage.upsertUserSettings({
      userId,
      stopLossUsd: stopLossUsd === undefined ? undefined : stopLossUsd,
      stopWinUsd: stopWinUsd === undefined ? undefined : stopWinUsd,
      stopLockDurationHours: stopLockDurationHours === undefined ? undefined : stopLockDurationHours,
    } as any);
    res.status(200).json({
      stopLossUsd: stopLossUsd ?? null,
      stopWinUsd: stopWinUsd ?? null,
      stopLockDurationHours: stopLockDurationHours ?? 12,
    });
  } catch (err) {
    console.error("[handlePutUserSettingsStops] failed:", err);
    res.status(500).json({ message: "Erro ao atualizar stops" });
  }
}

export async function handlePostUserSettingsStopsRelease(req: any, res: any): Promise<void> {
  // ADR-060: endpoint release manual default OFF.
  // Habilitar via env ALLOW_STOP_LOCK_RELEASE=true (admin/debug ou tests).
  if (process.env.ALLOW_STOP_LOCK_RELEASE !== "true") {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  const userId = userIdOfReq(req);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  try {
    const { stopService } = await import("../services/stopService");
    await stopService.releaseLock(userId);
    res.status(200).json({ released: true });
  } catch (err) {
    console.error("[handlePostUserSettingsStopsRelease] failed:", err);
    res.status(500).json({ message: "Erro ao limpar lock" });
  }
}
