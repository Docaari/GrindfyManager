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

// Auth cookie helpers
function setAuthCookies(res: any, accessToken: string, refreshToken: string) {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('grindfy_access_token', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: 15 * 60 * 1000, // 15 minutes
  });
  res.cookie('grindfy_refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
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
        subscriptionPlan: 'basico', // Default subscription plan
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
        // Handle failed login even for non-existent users (security)
        const failResult = await AuthService.handleFailedLogin(loginData.email);
        await AuthService.logAccess(null, 'login_failed', undefined, req);

        if (failResult.locked) {
          return res.status(423).json({
            message: `Conta temporariamente bloqueada. Tente novamente em ${failResult.lockTime} minutos.`,
            locked: true,
            remainingTime: failResult.lockTime
          });
        }

        return res.status(401).json({
          message: `Credenciais inválidas. Restam ${failResult.attemptsRemaining} tentativas.`
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

      // Update last login
      await db.update(users)
        .set({ lastLogin: new Date() })
        .where(eq(users.userPlatformId, user.userPlatformId));

      // Generate tokens
      const tokens = AuthService.generateTokens(user.userPlatformId, user.userPlatformId!, user.email!);

      // Set httpOnly cookies
      setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

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
          subscriptionPlan: user.subscriptionPlan || 'basico',
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

      // Generate new tokens
      const tokens = AuthService.generateTokens(payload.userId, payload.userPlatformId, payload.email);

      // Set new httpOnly cookies
      setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

      // Still include tokens in response body for backward compatibility
      res.json(tokens);
    } catch (error) {
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  app.post('/api/auth/logout', requireAuth, async (req, res) => {
    try {
      // Log logout
      await AuthService.logAccess(req.user!.userPlatformId, 'logout', undefined, req);

      // Clear auth cookies
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
          // Generate tokens for auto-login
          const tokens = AuthService.generateTokens(user.userPlatformId, user.userPlatformId!, user.email!);

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
              subscriptionPlan: user.subscriptionPlan || 'basico'
            },
            ...tokens
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
  app.post('/api/auth/forgot-password', async (req, res) => {
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
      const { token, password } = req.body;

      if (!token || !password) {
        return res.status(400).json({ success: false, message: 'Token e senha são obrigatórios' });
      }

      // Verify reset token
      const tokenData = await EmailService.verifyPasswordResetToken(token);
      if (!tokenData) {
        return res.status(400).json({ success: false, message: 'Token inválido ou expirado' });
      }

      // Hash new password
      const hashedPassword = await AuthService.hashPassword(password);

      // Update user password
      await db.update(users)
        .set({
          password: hashedPassword,
          updatedAt: new Date(),
        })
        .where(eq(users.id, tokenData.userId));

      // Clean up used token
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

  // OAuth Google authentication
  app.get('/api/auth/google', async (req, res) => {
    try {
      const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
      const authUrl = OAuthService.generateAuthUrl('google', redirectUri);

      res.json({
        authUrl,
        message: 'Redirecione para esta URL para autenticação com Google'
      });
    } catch (error) {
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    try {
      const { code, state } = req.query;

      if (!code || !state) {
        return res.status(400).json({ message: 'Código ou estado ausente' });
      }

      if (!OAuthService.validateState(state as string)) {
        return res.status(400).json({ message: 'Estado inválido ou expirado' });
      }

      const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;

      // Exchange code for token
      const tokenData = await OAuthService.exchangeCodeForToken('google', code as string, redirectUri);

      // Get user info
      const userInfo = await OAuthService.getUserInfo('google', tokenData.accessToken);

      // Create or update user
      const user = await OAuthService.createOrUpdateOAuthUser('google', userInfo);

      // Generate JWT tokens
      const tokens = AuthService.generateTokens(user.userPlatformId, user.userPlatformId!, user.email!);

      // Set httpOnly cookies
      setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

      // Log successful OAuth login
      await AuthService.logAccess(user.userPlatformId, 'oauth_login_success', undefined, req);

      // Still include tokens in response body for backward compatibility
      res.json({
        message: 'Login OAuth realizado com sucesso',
        user: {
          id: user.userPlatformId,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        ...tokens
      });
    } catch (error) {
      res.status(500).json({ message: 'Erro interno do servidor' });
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
}
