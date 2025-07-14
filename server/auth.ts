import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import { db } from './db';
import { users, permissions, userPermissions, accessLogs } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const JWT_SECRET = process.env.JWT_SECRET || 'grindfy-secret-key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'grindfy-refresh-secret-key';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  status: string;
  permissions: string[];
}

export interface JWTPayload {
  userId: string;
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
  static generateTokens(userId: string, email: string) {
    const accessToken = jwt.sign(
      { userId, email, type: 'access' },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
      { userId, email, type: 'refresh' },
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

  // Get user with permissions
  static async getUserWithPermissions(userId: string): Promise<AuthUser | null> {
    try {
      console.log('🚨 getUserWithPermissions called with userId:', userId);
      
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId));

      console.log('🚨 getUserWithPermissions found user:', user ? {
        id: user.id,
        email: user.email,
        username: user.username,
        status: user.status
      } : null);

      if (!user || user.status !== 'active') {
        return null;
      }

      // Get user permissions
      const userPermissionsList = await db
        .select({
          permissionName: permissions.name,
        })
        .from(userPermissions)
        .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
        .where(and(
          eq(userPermissions.userId, userId),
          eq(userPermissions.granted, true)
        ));

      const result = {
        id: user.id,
        email: user.email || '',
        username: user.username || '',
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
        status: user.status || 'active',
        permissions: userPermissionsList.map(p => p.permissionName),
      };

      console.log('🚨 getUserWithPermissions returning:', result);
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

  // Get user with permissions and attach to request
  AuthService.getUserWithPermissions(payload.userId)
    .then(user => {
      if (!user) {
        AuthService.logAccess(payload.userId, 'access_denied', undefined, req);
        return res.status(401).json({ message: 'Usuário não encontrado ou inativo' });
      }

      req.user = user;
      AuthService.logAccess(user.id, 'access_granted', undefined, req);
      next();
    })
    .catch(error => {
      console.error('Auth middleware error:', error);
      AuthService.logAccess(payload.userId, 'access_denied', undefined, req);
      res.status(500).json({ message: 'Erro interno do servidor' });
    });
}

// Permission check middleware
export function requirePermission(permissionName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      AuthService.logAccess(null, 'permission_denied', permissionName, req);
      return res.status(401).json({ message: 'Usuário não autenticado' });
    }

    if (!req.user.permissions.includes(permissionName)) {
      AuthService.logAccess(req.user.id, 'permission_denied', permissionName, req);
      return res.status(403).json({ 
        message: 'Você não tem acesso a essa funcionalidade',
        requiredPermission: permissionName,
        contactSupport: true
      });
    }

    AuthService.logAccess(req.user.id, 'permission_granted', permissionName, req);
    next();
  };
}