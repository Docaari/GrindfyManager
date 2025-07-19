import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import { db } from './db';
import { users, permissions, userPermissions, accessLogs } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const JWT_SECRET = process.env.JWT_SECRET || 'grindfy-secret-key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'grindfy-refresh-secret-key';

export interface AuthUser {
  id: string;
  userPlatformId: string;
  email: string;
  username: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  status: string;
  permissions: string[];
}

export interface JWTPayload {
  userId: string;
  userPlatformId: string;
  email: string;
  type: 'access' | 'refresh';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export class AuthService {
  // Hash password
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  // Verify password
  static async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    if (!password || !hashedPassword) {
      return false;
    }
    try {
      return await bcrypt.compare(password, hashedPassword);
    } catch (error) {
      console.error('Password verification error:', error);
      return false;
    }
  }

  // Generate tokens with extended refresh token for persistent sessions
  static generateTokens(userId: string, userPlatformId: string, email: string) {
    const accessToken = jwt.sign(
      { userId, userPlatformId, email, type: 'access' },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
      { userId, userPlatformId, email, type: 'refresh' },
      JWT_REFRESH_SECRET,
      { expiresIn: '30d' } // Extended to 30 days for persistent sessions
    );

    return { accessToken, refreshToken };
  }

  // Verify access token
  static verifyAccessToken(token: string): JWTPayload | null {
    try {
      return jwt.verify(token, JWT_SECRET) as JWTPayload;
    } catch {
      return null;
    }
  }

  // Verify refresh token
  static verifyRefreshToken(token: string): JWTPayload | null {
    try {
      return jwt.verify(token, JWT_REFRESH_SECRET) as JWTPayload;
    } catch {
      return null;
    }
  }

  // Generate next sequential user platform ID
  static async generateNextUserPlatformId(): Promise<string> {
    try {
      // Get the highest existing user platform ID
      const result = await db.select({ userPlatformId: users.userPlatformId })
        .from(users)
        .where(sql`${users.userPlatformId} LIKE 'USER-%'`)
        .orderBy(sql`CAST(SUBSTRING(${users.userPlatformId}, 6) AS INTEGER) DESC`)
        .limit(1);

      if (result.length === 0) {
        return 'USER-0001';
      }

      // Extract number from the highest ID and increment
      const highestId = result[0].userPlatformId;
      const numPart = parseInt(highestId.split('-')[1]);
      const nextNum = numPart + 1;
      
      return `USER-${nextNum.toString().padStart(4, '0')}`;
    } catch (error) {
      console.error('Error generating user platform ID:', error);
      // Fallback to timestamp-based ID
      return `USER-${Date.now().toString().slice(-4)}`;
    }
  }

  // Get user with permissions
  static async getUserWithPermissions(userId: string): Promise<AuthUser | null> {
    try {
      console.log('🚨 getUserWithPermissions called with userId:', userId);
      
      // Try to find user by id first, then by userPlatformId
      let user = await db
        .select()
        .from(users)
        .where(eq(users.id, userId));
      
      if (!user || user.length === 0) {
        user = await db
          .select()
          .from(users)
          .where(eq(users.userPlatformId, userId));
      }
      
      const foundUser = user[0];

      console.log('🚨 getUserWithPermissions found user:', foundUser ? {
        id: foundUser.id,
        email: foundUser.email,
        username: foundUser.username,
        name: foundUser.name,
        firstName: foundUser.firstName,
        lastName: foundUser.lastName,
        status: foundUser.status,
        userPlatformId: foundUser.userPlatformId
      } : null);

      if (!foundUser || foundUser.status !== 'active') {
        return null;
      }

      // 🚨 ETAPA 2.5 FIX - Usar userPlatformId em vez de userId para buscar permissões
      console.log('🚨 ETAPA 2.5 DEBUG - Buscando permissões para userPlatformId:', foundUser.userPlatformId);
      
      // Get user permissions usando userPlatformId
      const userPermissionsList = await db
        .select({
          permissionName: permissions.name,
        })
        .from(userPermissions)
        .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
        .where(and(
          eq(userPermissions.userId, foundUser.userPlatformId), // FIX: usar userPlatformId
          eq(userPermissions.granted, true)
        ));

      console.log('🚨 ETAPA 2.5 DEBUG - Permissões encontradas:', userPermissionsList);

      // CRITICAL FIX: Proper display name fallback logic
      const displayName = foundUser.name && foundUser.name.trim() 
        ? foundUser.name.trim() 
        : foundUser.firstName && foundUser.firstName.trim()
        ? foundUser.firstName.trim()
        : foundUser.username && foundUser.username.trim()
        ? foundUser.username.trim()
        : undefined;

      const result = {
        id: foundUser.id,
        userPlatformId: foundUser.userPlatformId || '',
        email: foundUser.email || '',
        username: foundUser.username || '',
        name: displayName,
        firstName: foundUser.firstName || undefined,
        lastName: foundUser.lastName || undefined,
        status: foundUser.status || 'active',
        subscriptionPlan: foundUser.subscriptionPlan || 'admin',
        permissions: userPermissionsList.map(p => p.permissionName),
      };

      console.log('🚨 getUserWithPermissions returning:', result);
      console.log('🚨 DEBUG ESPECÍFICO - Campo name do result:', result.name);
      console.log('🚨 DEBUG ESPECÍFICO - foundUser.name original:', foundUser.name);
      return result;
    } catch (error) {
      console.error('Error getting user with permissions:', error);
      return null;
    }
  }

  // Log access attempt
  static async logAccess(
    userId: string | null,
    action: string,
    permissionName?: string,
    req?: Request
  ) {
    try {
      await db.insert(accessLogs).values({
        id: nanoid(),
        userId,
        permissionName,
        action,
        ipAddress: req?.ip || req?.connection?.remoteAddress,
        userAgent: req?.headers['user-agent'],
        metadata: req ? {
          url: req.url,
          method: req.method,
        } : null,
      });
    } catch (error) {
      console.error('Error logging access:', error);
    }
  }

  // Check if account is locked
  static async isAccountLocked(email: string): Promise<{ locked: boolean; remainingTime?: number }> {
    try {
      const [user] = await db.select({
        failedLoginAttempts: users.failedLoginAttempts,
        lockedUntil: users.lockedUntil
      })
      .from(users)
      .where(eq(users.email, email));

      if (!user) {
        return { locked: false };
      }

      // If account has a lock time set
      if (user.lockedUntil) {
        const now = new Date();
        const lockUntil = new Date(user.lockedUntil);
        
        if (now < lockUntil) {
          const remainingMs = lockUntil.getTime() - now.getTime();
          const remainingMinutes = Math.ceil(remainingMs / (1000 * 60));
          return { locked: true, remainingTime: remainingMinutes };
        } else {
          // Lock expired, reset the fields
          await this.resetFailedAttempts(email);
          return { locked: false };
        }
      }

      return { locked: false };
    } catch (error) {
      console.error('Error checking account lock:', error);
      return { locked: false };
    }
  }

  // Increment failed login attempts and lock account if necessary
  static async handleFailedLogin(email: string): Promise<{ attemptsRemaining: number; locked: boolean; lockTime?: number }> {
    try {
      const [user] = await db.select({
        failedLoginAttempts: users.failedLoginAttempts
      })
      .from(users)
      .where(eq(users.email, email));

      if (!user) {
        return { attemptsRemaining: 4, locked: false };
      }

      const currentAttempts = (user.failedLoginAttempts || 0) + 1;
      const maxAttempts = 5;
      const lockDurationMinutes = 5;

      if (currentAttempts >= maxAttempts) {
        // Lock the account
        const lockUntil = new Date();
        lockUntil.setMinutes(lockUntil.getMinutes() + lockDurationMinutes);

        await db.update(users)
          .set({
            failedLoginAttempts: currentAttempts,
            lockedUntil: lockUntil,
            updatedAt: new Date()
          })
          .where(eq(users.email, email));

        return { attemptsRemaining: 0, locked: true, lockTime: lockDurationMinutes };
      } else {
        // Just increment attempts
        await db.update(users)
          .set({
            failedLoginAttempts: currentAttempts,
            updatedAt: new Date()
          })
          .where(eq(users.email, email));

        return { attemptsRemaining: maxAttempts - currentAttempts, locked: false };
      }
    } catch (error) {
      console.error('Error handling failed login:', error);
      return { attemptsRemaining: 4, locked: false };
    }
  }

  // Reset failed login attempts on successful login
  static async resetFailedAttempts(email: string): Promise<void> {
    try {
      await db.update(users)
        .set({
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLogin: new Date(),
          updatedAt: new Date()
        })
        .where(eq(users.email, email));
    } catch (error) {
      console.error('Error resetting failed attempts:', error);
    }
  }
}

// Authentication middleware
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  console.log('🔐 MIDDLEWARE DEBUG:', {
    url: req.url,
    method: req.method,
    hasAuthHeader: !!authHeader,
    tokenStart: token ? token.substring(0, 20) + '...' : 'none',
    fullHeaders: req.headers
  });

  if (!token) {
    console.log('🔐 MIDDLEWARE: Token não encontrado');
    AuthService.logAccess(null, 'access_denied', undefined, req);
    return res.status(401).json({ message: 'Token de acesso necessário' });
  }

  const payload = AuthService.verifyAccessToken(token);
  if (!payload) {
    console.log('🔐 MIDDLEWARE: Token inválido ou expirado');
    AuthService.logAccess(null, 'access_denied', undefined, req);
    return res.status(401).json({ message: 'Token inválido ou expirado' });
  }

  console.log('🔐 MIDDLEWARE: Token válido, payload:', payload);

  // 🚨 DEBUG CRÍTICO: LOG DETALHADO DO TOKEN DECODIFICADO
  console.log('🚨 TOKEN DEBUG - Dados completos do token:', {
    userId: payload.userId,
    userPlatformId: payload.userPlatformId,
    email: payload.email,
    type: payload.type
  });

  // 🚨 DEBUG CRÍTICO: VALIDAR CONSISTÊNCIA DOS DADOS
  if (payload.userPlatformId !== payload.userId) {
    console.log('🚨 TOKEN WARNING - userId e userPlatformId diferentes:', {
      userId: payload.userId,
      userPlatformId: payload.userPlatformId,
      email: payload.email
    });
  }

  // Get user with permissions and attach to request
  AuthService.getUserWithPermissions(payload.userId)
    .then(user => {
      if (!user) {
        AuthService.logAccess(payload.userPlatformId, 'access_denied', undefined, req);
        return res.status(401).json({ message: 'Usuário não encontrado ou inativo' });
      }

      req.user = user;
      
      // 🚨 DEBUG CRÍTICO: LOG DO req.user FINAL
      console.log('🚨 REQ.USER DEBUG - Dados finais no req.user:', {
        id: req.user.id,
        userPlatformId: req.user.userPlatformId,
        email: req.user.email,
        username: req.user.username,
        name: req.user.name
      });
      
      AuthService.logAccess(user.userPlatformId, 'access_granted', undefined, req);
      next();
    })
    .catch(error => {
      console.error('Auth middleware error:', error);
      AuthService.logAccess(payload.userPlatformId, 'access_denied', undefined, req);
      res.status(500).json({ message: 'Erro interno do servidor' });
    });
}

// Permission check middleware
export function requirePermission(permissionName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    console.log('🔒 ETAPA 2.5 AUDIT - requirePermission called:', {
      permissionName,
      url: req.url,
      method: req.method,
      hasUser: !!req.user,
      userPlatformId: req.user?.userPlatformId,
      userPermissions: req.user?.permissions?.length || 0
    });

    if (!req.user) {
      console.log('🚨 ETAPA 2.5 AUDIT - Permission denied: user not authenticated');
      AuthService.logAccess(null, 'permission_denied', permissionName, req);
      return res.status(401).json({ message: 'Usuário não autenticado' });
    }

    if (!req.user.permissions.includes(permissionName)) {
      console.log('🚨 ETAPA 2.5 AUDIT - Permission denied:', {
        user: req.user.email,
        userPlatformId: req.user.userPlatformId,
        requiredPermission: permissionName,
        userPermissions: req.user.permissions
      });
      AuthService.logAccess(req.user.userPlatformId, 'permission_denied', permissionName, req);
      return res.status(403).json({ 
        message: 'Você não tem acesso a essa funcionalidade',
        requiredPermission: permissionName,
        contactSupport: true
      });
    }

    console.log('✅ ETAPA 2.5 AUDIT - Permission granted:', {
      user: req.user.email,
      userPlatformId: req.user.userPlatformId,
      permission: permissionName
    });
    AuthService.logAccess(req.user.userPlatformId, 'permission_granted', permissionName, req);
    next();
  };
}