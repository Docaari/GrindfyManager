import type { Express } from "express";
import { AuthService, requireAuth, requirePermission } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import {
  users,
  permissions,
  userPermissions,
  accessLogs,
  tournaments,
  grindSessions,
  sessionTournaments,
  userSubscriptions,
  subscriptionPlans,
  uploadHistory,
  bugReports,
  engagementMetrics,
  analyticsDaily,
  userActivity,
} from "@shared/schema";
import { z } from "zod";
import { nanoid } from "nanoid";
import { eq, and, inArray, desc, gte, sql, count, max } from "drizzle-orm";
import { removeUserPermissions } from "./helpers";

export function registerAdminRoutes(app: Express): void {
  // Admin schemas (defined locally as in original)
  const createUserSchema = z.object({
    email: z.string().email(),
    username: z.string().min(3),
    password: z.string().min(6),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    permissions: z.array(z.string()).default([]),
    status: z.enum(['active', 'inactive', 'blocked']).default('active'),
    subscriptionPlan: z.enum(['basico', 'premium', 'pro', 'admin']).default('basico')
  });

  const updateUserSchema = z.object({
    email: z.string().email().optional(),
    username: z.string().min(3).optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    permissions: z.array(z.string()).optional(),
    status: z.enum(['active', 'inactive', 'blocked']).optional(),
    subscriptionPlan: z.enum(['basico', 'premium', 'pro', 'admin']).optional()
  });

  // Get all users (admin only)
  app.get('/api/admin/users', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {

      const allUsers = await db.select({
        id: users.userPlatformId,
        userPlatformId: users.userPlatformId,
        email: users.email,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        status: users.status,
        subscriptionPlan: users.subscriptionPlan,
        createdAt: users.createdAt
      }).from(users);


      // Get permissions for each user
      const usersWithPermissions = await Promise.all(
        allUsers.map(async (user) => {
          const userPermissionsResult = await db.select({
            permissionName: permissions.name
          })
          .from(userPermissions)
          .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
          .where(eq(userPermissions.userId, user.userPlatformId));

          const permissionNames = userPermissionsResult.map(p => p.permissionName);

          return {
            ...user,
            permissions: permissionNames
          };
        })
      );

      res.json(usersWithPermissions);
    } catch (error) {
      res.status(500).json({ message: 'Erro ao buscar usuários' });
    }
  });

  // Create user (admin only)
  app.post('/api/admin/users', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const userData = createUserSchema.parse(req.body);

      // Check if user already exists
      const existingUser = await db.select()
        .from(users)
        .where(eq(users.email, userData.email));

      if (existingUser.length > 0) {
        return res.status(400).json({
          message: 'Usuário já existe'
        });
      }

      // Hash password
      const hashedPassword = await AuthService.hashPassword(userData.password);

      // Generate userPlatformId
      const userPlatformId = await AuthService.generateNextUserPlatformId();

      // Create user
      const [newUser] = await db.insert(users)
        .values({
          id: nanoid(),
          userPlatformId: userPlatformId,
          email: userData.email,
          username: userData.username,
          firstName: userData.firstName,
          lastName: userData.lastName,
          password: hashedPassword,
          status: userData.status,
          subscriptionPlan: userData.subscriptionPlan
        })
        .returning();

      // Add permissions
      if (userData.permissions.length > 0) {
        // Get permission IDs
        const permissionRecords = await db.select()
          .from(permissions)
          .where(inArray(permissions.name, userData.permissions));

        if (permissionRecords.length > 0) {
          const userPermissionData = permissionRecords.map(perm => ({
            id: nanoid(),
            userId: newUser.userPlatformId, // CORREÇÃO: usar userPlatformId
            permissionId: perm.id
          }));

          await db.insert(userPermissions).values(userPermissionData);
        }
      }

      res.status(201).json({
        message: 'Usuário criado com sucesso',
        user: {
          id: newUser.id,
          email: newUser.email,
          username: newUser.username,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          status: newUser.status,
          permissions: userData.permissions
        }
      });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao criar usuário' });
    }
  });

  // Update user (admin only)
  app.put('/api/admin/users/:id', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const userId = req.params.id;
      const userData = updateUserSchema.parse(req.body);


      // Get current user to check for email changes
      const [currentUser] = await db.select()
        .from(users)
        .where(eq(users.userPlatformId, userId));


      if (!currentUser) {
        return res.status(404).json({ message: 'Usuário não encontrado' });
      }

      // Build update object with only changed fields
      const updateData: any = {};

      // Only update email if it's different from current email
      if (userData.email && userData.email !== currentUser.email) {
        updateData.email = userData.email;
      }

      if (userData.username) updateData.username = userData.username;
      if (userData.firstName !== undefined) updateData.firstName = userData.firstName;
      if (userData.lastName !== undefined) updateData.lastName = userData.lastName;
      if (userData.status) updateData.status = userData.status;
      if (userData.subscriptionPlan) updateData.subscriptionPlan = userData.subscriptionPlan;

      // Update user only if there are changes
      let updatedUser = currentUser;
      if (Object.keys(updateData).length > 0) {
        [updatedUser] = await db.update(users)
          .set(updateData)
          .where(eq(users.userPlatformId, userId))
          .returning();
      }

      // Update permissions if provided
      if (userData.permissions) {
        // CORREÇÃO: usar userPlatformId em vez de id interno
        const userPlatformId = currentUser.userPlatformId;


        // Use SQL transaction to ensure atomicity
        await db.transaction(async (trx) => {
          // Remove existing permissions
          await trx.delete(userPermissions).where(eq(userPermissions.userId, userPlatformId));

          // Add new permissions
          if (userData.permissions && userData.permissions.length > 0) {
            const permissionRecords = await trx.select()
              .from(permissions)
              .where(inArray(permissions.name, userData.permissions!));


            if (permissionRecords.length > 0) {
              const userPermissionData = permissionRecords.map(perm => ({
                id: nanoid(),
                userId: userPlatformId, // CORREÇÃO: usar userPlatformId
                permissionId: perm.id
              }));


              await trx.insert(userPermissions).values(userPermissionData);
            }
          }
        });
      }


      res.json({
        message: 'Usuário atualizado com sucesso',
        user: {
          ...updatedUser,
          permissions: userData.permissions || []
        }
      });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao atualizar usuário' });
    }
  });

  // Delete user (admin only) - Sistema de exclusão segura
  app.delete('/api/admin/users/:id', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const userId = req.params.id;
      const currentUserPlatformId = req.user!.userPlatformId;



      // VALIDATION 1: Protect super-admin from deletion
      const SUPER_ADMIN_EMAIL = 'ricardo.agnolo@hotmail.com';

      // Get user to be deleted
      const userToDelete = await db.select()
        .from(users)
        .where(eq(users.userPlatformId, userId))
        .limit(1);

      if (userToDelete.length === 0) {
        return res.status(404).json({ message: 'Usuário não encontrado' });
      }

      const targetUser = userToDelete[0];

      // VALIDATION 2: Cannot delete super-admin
      if (targetUser.email === SUPER_ADMIN_EMAIL) {
        return res.status(403).json({
          message: 'Não é possível excluir o super-administrador do sistema'
        });
      }

      // VALIDATION 3: Cannot delete yourself
      if (targetUser.userPlatformId === currentUserPlatformId) {
        return res.status(403).json({
          message: 'Não é possível excluir sua própria conta'
        });
      }

      // CRITICAL: Delete access logs first (outside transaction to avoid FK constraint issues)
      await db.delete(accessLogs)
        .where(eq(accessLogs.userId, targetUser.userPlatformId));

      // TRANSACTIONAL DELETION - Ensure atomicity
      await db.transaction(async (trx) => {
        // Delete user permissions
        await trx.delete(userPermissions)
          .where(eq(userPermissions.userId, targetUser.userPlatformId));

        // Delete user tournaments
        await trx.delete(tournaments)
          .where(eq(tournaments.userId, targetUser.userPlatformId));

        // Delete upload history
        await trx.delete(uploadHistory)
          .where(eq(uploadHistory.userId, targetUser.userPlatformId));

        // Delete grind sessions
        await trx.delete(grindSessions)
          .where(eq(grindSessions.userId, targetUser.userPlatformId));

        // Delete user subscriptions
        await trx.delete(userSubscriptions)
          .where(eq(userSubscriptions.userId, targetUser.userPlatformId));

        // Delete user activities
        await trx.delete(userActivity)
          .where(eq(userActivity.userId, targetUser.userPlatformId));

        // Delete engagement metrics
        await trx.delete(engagementMetrics)
          .where(eq(engagementMetrics.userId, targetUser.userPlatformId));

        // Delete analytics daily
        await trx.delete(analyticsDaily)
          .where(eq(analyticsDaily.userId, targetUser.userPlatformId));

        // Delete bug reports
        await trx.delete(bugReports)
          .where(eq(bugReports.userId, targetUser.userPlatformId));

        // Finally, delete the user
        await trx.delete(users)
          .where(eq(users.userPlatformId, targetUser.userPlatformId));
      });

      // AUDIT LOG - Log the deletion
      await AuthService.logAccess(
        currentUserPlatformId,
        'user_deletion_success',
        JSON.stringify({
          deletedUser: targetUser.userPlatformId,
          deletedEmail: targetUser.email,
          deletedUsername: targetUser.username
        }),
        req
      );



      res.json({
        message: 'Usuário excluído com sucesso',
        deletedUser: {
          userPlatformId: targetUser.userPlatformId,
          email: targetUser.email,
          username: targetUser.username
        }
      });
    } catch (error) {

      // AUDIT LOG - Log the failed deletion
      await AuthService.logAccess(
        req.user!.userPlatformId,
        'user_deletion_failed',
        (error as Error).message,
        req
      );

      res.status(500).json({ message: 'Erro ao excluir usuário' });
    }
  });

  // Toggle user status (admin only)
  app.patch('/api/admin/users/:id/status', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const userId = req.params.id;
      const { status } = req.body;

      const [updatedUser] = await db.update(users)
        .set({ status })
        .where(eq(users.userPlatformId, userId))
        .returning();

      res.json({
        message: 'Status do usuário atualizado',
        user: updatedUser
      });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao atualizar status' });
    }
  });

  // Get access logs (admin only)
  app.get('/api/admin/access-logs', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const logs = await db.select({
        id: accessLogs.id,
        userId: accessLogs.userId,
        action: accessLogs.action,
        ipAddress: accessLogs.ipAddress,
        userAgent: accessLogs.userAgent,
        metadata: accessLogs.metadata,
        createdAt: accessLogs.createdAt,
        userPlatformId: users.userPlatformId
      })
        .from(accessLogs)
        .leftJoin(users, eq(accessLogs.userId, users.id))
        .orderBy(desc(accessLogs.createdAt))
        .limit(100);

      // Format logs to match frontend interface
      const formattedLogs = logs.map(log => ({
        id: log.id,
        userId: log.userId,
        userPlatformId: log.userPlatformId,
        action: log.action,
        status: log.action?.includes('success') ? 'success' : 'failed',
        ipAddress: log.ipAddress,
        timestamp: log.createdAt,
        userAgent: log.userAgent,
        details: log.metadata ? JSON.stringify(log.metadata) : null
      }));

      res.json(formattedLogs);
    } catch (error) {
      res.status(500).json({ message: 'Erro ao buscar logs de acesso' });
    }
  });

  // Dashboard Admin Intuitivo
  app.get('/api/admin/dashboard-stats', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Estatísticas básicas de usuários
      const [totalUsers, activeUsers, inactiveUsers, blockedUsers] = await Promise.all([
        db.select({ count: count() }).from(users),
        db.select({ count: count() }).from(users).where(eq(users.status, 'active')),
        db.select({ count: count() }).from(users).where(eq(users.status, 'inactive')),
        db.select({ count: count() }).from(users).where(eq(users.status, 'blocked'))
      ]);

      // Usuários criados nas últimas 24h e 7 dias
      const [newUsers24h, newUsers7d] = await Promise.all([
        db.select({ count: count() }).from(users).where(gte(users.createdAt, last24h)),
        db.select({ count: count() }).from(users).where(gte(users.createdAt, last7d))
      ]);

      // Usuários online agora (atividade nos últimos 5 minutos)
      const last5min = new Date(now.getTime() - 5 * 60 * 1000);
      const onlineUsers = await db.select({
        userId: sql<string>`DISTINCT ${userActivity.userId}`,
        count: count()
      }).from(userActivity)
        .where(gte(userActivity.createdAt, last5min))
        .groupBy(userActivity.userId);

      // Atividade por hora nas últimas 24h
      const hourlyActivity = await db.select({
        hour: sql<number>`EXTRACT(HOUR FROM ${userActivity.createdAt})`,
        activity: count()
      }).from(userActivity)
        .where(gte(userActivity.createdAt, last24h))
        .groupBy(sql`EXTRACT(HOUR FROM ${userActivity.createdAt})`)
        .orderBy(sql`EXTRACT(HOUR FROM ${userActivity.createdAt})`);

      // Top usuários mais ativos
      const topActiveUsers = await db.select({
        userId: userActivity.userId,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        activityCount: count(userActivity.id)
      }).from(userActivity)
        .leftJoin(users, eq(userActivity.userId, users.id))
        .where(gte(userActivity.createdAt, last7d))
        .groupBy(userActivity.userId, users.email, users.firstName, users.lastName)
        .orderBy(desc(count(userActivity.id)))
        .limit(10);

      res.json({
        totalUsers: Number(totalUsers[0]?.count || 0),
        activeUsers: Number(activeUsers[0]?.count || 0),
        inactiveUsers: Number(inactiveUsers[0]?.count || 0),
        blockedUsers: Number(blockedUsers[0]?.count || 0),
        newUsers24h: Number(newUsers24h[0]?.count || 0),
        newUsers7d: Number(newUsers7d[0]?.count || 0),
        onlineUsers: onlineUsers.length,
        onlineUsersList: onlineUsers,
        hourlyActivity: hourlyActivity.map(item => ({
          hour: Number(item.hour),
          activity: Number(item.activity)
        })),
        topActiveUsers: topActiveUsers.map(user => ({
          userId: user.userId,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          activityCount: Number(user.activityCount)
        }))
      });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao buscar estatísticas do painel admin' });
    }
  });

  // Gestão Rápida de Permissões - Profiles predefinidos
  app.get('/api/admin/permission-profiles', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const profiles = {
        'basico': {
          name: 'Básico',
          description: 'Funcionalidades essenciais para usuários iniciantes',
          permissions: ['dashboard_access', 'upload_access', 'performance_access'],
          color: '#10B981'
        },
        'premium': {
          name: 'Premium',
          description: 'Acesso completo a ferramentas de análise e estudos',
          permissions: [
            'dashboard_access', 'upload_access', 'performance_access',
            'studies_access', 'grind_access', 'warm_up_access',
            'grade_planner_access', 'weekly_planner_access',
            'mental_prep_access', 'grind_session_access'
          ],
          color: '#3B82F6'
        },
        'pro': {
          name: 'Pro',
          description: 'Todas as funcionalidades incluindo analytics avançados',
          permissions: [
            'dashboard_access', 'upload_access', 'performance_access',
            'studies_access', 'grind_access', 'warm_up_access',
            'grade_planner_access', 'weekly_planner_access',
            'mental_prep_access', 'grind_session_access',
            'analytics_access', 'user_analytics'
          ],
          color: '#8B5CF6'
        },
        'admin': {
          name: 'Admin',
          description: 'Acesso administrativo completo ao sistema',
          permissions: [
            'admin_full', 'user_management', 'system_config',
            'dashboard_access', 'analytics_access', 'user_analytics',
            'executive_reports', 'studies_access', 'grind_access',
            'warm_up_access', 'upload_access', 'grade_planner_access',
            'weekly_planner_access', 'performance_access',
            'mental_prep_access', 'grind_session_access'
          ],
          color: '#EF4444'
        }
      };

      res.json(profiles);
    } catch (error) {
      res.status(500).json({ message: 'Erro ao buscar perfis de permissões' });
    }
  });

  // Aplicar perfil de permissões em lote
  app.post('/api/admin/apply-permissions-batch', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const { userIds, profileName, permissions: permissionsList } = req.body;


      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ message: 'Lista de usuários é obrigatória' });
      }

      if (!permissionsList || !Array.isArray(permissionsList)) {
        return res.status(400).json({ message: 'Lista de permissões é obrigatória' });
      }

      // ETAPA 1: Filtrar permissões válidas
      const validPermissions = permissionsList.filter((p: any) => p !== null && p !== undefined && p !== '');

      if (validPermissions.length === 0) {
        return res.status(400).json({ message: 'Nenhuma permissão válida fornecida' });
      }

      // ETAPA 2: Buscar IDs das permissões na tabela permissions usando SQL raw

      // Solução definitiva: usar SQL raw para contornar problemas do Drizzle ORM
      const permissionNames = validPermissions.map((name: string) => `'${name}'`).join(', ');
      const query = `SELECT id, name, description, created_at FROM permissions WHERE name IN (${permissionNames})`;

      const permissionResult = await db.execute(sql.raw(query));
      const permissionRows = permissionResult.rows || permissionResult;


      if (permissionRows.length !== validPermissions.length) {
        const foundNames = permissionRows.map((p: any) => p.name);
        const missingNames = validPermissions.filter((name: string) => !foundNames.includes(name));
        return res.status(400).json({
          message: 'Algumas permissões não foram encontradas no sistema',
          missing: missingNames
        });
      }

      // ETAPA 3: Remover permissões existentes dos usuários usando SQL raw

      for (const userId of userIds) {
        const deleteQuery = `DELETE FROM user_permissions WHERE user_id = '${userId}'`;
        await db.execute(sql.raw(deleteQuery));
      }

      // ETAPA 4: Inserir novas permissões usando SQL raw

      let insertedCount = 0;
      for (const userId of userIds) {
        for (const permissionRecord of permissionRows) {
          const insertQuery = `
            INSERT INTO user_permissions (id, user_id, permission_id, granted, created_at, updated_at)
            VALUES ('${nanoid()}', '${userId}', '${permissionRecord.id}', true, NOW(), NOW())
          `;
          await db.execute(sql.raw(insertQuery));
          insertedCount++;
        }
      }


      // ETAPA 6: Log da ação
      await db.insert(accessLogs).values({
        id: nanoid(),
        userId: req.user!.userPlatformId,
        action: 'batch_permission_update',
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent'),
        metadata: { status: 'success', details: `Aplicou perfil ${profileName} para ${userIds.length} usuários` },
        createdAt: new Date(),
      });

      res.json({
        message: `Permissões aplicadas com sucesso para ${userIds.length} usuários`,
        updatedUsers: userIds.length,
        profile: profileName,
        appliedPermissions: validPermissions
      });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao aplicar permissões em lote' });
    }
  });

  // Painel de Monitoramento
  app.get('/api/admin/monitoring', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const now = new Date();
      const last5min = new Date(now.getTime() - 5 * 60 * 1000);
      const last1h = new Date(now.getTime() - 60 * 60 * 1000);
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Usuários online agora
      const onlineUsers = await db.select({
        userId: userActivity.userId,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        lastActivity: max(userActivity.createdAt)
      }).from(userActivity)
        .leftJoin(users, eq(userActivity.userId, users.id))
        .where(gte(userActivity.createdAt, last5min))
        .groupBy(userActivity.userId, users.email, users.firstName, users.lastName)
        .orderBy(desc(max(userActivity.createdAt)));

      // Atividade em tempo real (últimos 5 minutos)
      const realtimeActivity = await db.select({
        id: userActivity.id,
        userId: userActivity.userId,
        email: users.email,
        page: userActivity.page,
        action: userActivity.action,
        feature: userActivity.feature,
        createdAt: userActivity.createdAt
      }).from(userActivity)
        .leftJoin(users, eq(userActivity.userId, users.id))
        .where(gte(userActivity.createdAt, last5min))
        .orderBy(desc(userActivity.createdAt))
        .limit(20);

      // Detecção de problemas/alerts
      const alerts = [];

      // Alert: Muitos usuários inativos
      const inactiveCount = await db.select({ count: count() }).from(users)
        .where(eq(users.status, 'inactive'));
      if (Number(inactiveCount[0]?.count || 0) > 10) {
        alerts.push({
          type: 'warning',
          title: 'Muitos usuários inativos',
          message: `${inactiveCount[0]?.count} usuários estão com status inativo`,
          timestamp: now
        });
      }

      // Alert: Baixa atividade nas últimas 24h
      const activityLast24h = await db.select({ count: count() }).from(userActivity)
        .where(gte(userActivity.createdAt, last24h));
      if (Number(activityLast24h[0]?.count || 0) < 50) {
        alerts.push({
          type: 'info',
          title: 'Baixa atividade detectada',
          message: `Apenas ${activityLast24h[0]?.count} ações nas últimas 24h`,
          timestamp: now
        });
      }

      // Performance do sistema - contagem de erros
      const errorLogs = await db.select({ count: count() }).from(accessLogs)
        .where(and(
          eq(accessLogs.action, 'failed'),
          gte(accessLogs.createdAt, last1h)
        ));

      if (Number(errorLogs[0]?.count || 0) > 10) {
        alerts.push({
          type: 'error',
          title: 'Muitos erros detectados',
          message: `${errorLogs[0]?.count} erros na última hora`,
          timestamp: now
        });
      }

      // Métricas do sistema
      const totalUsersResult = await db.select({ count: count() }).from(users);
      const activeUsersResult = await db.select({ count: count() }).from(users).where(eq(users.status, 'active'));
      const activityLast1hResult = await db.select({ count: count() }).from(userActivity).where(gte(userActivity.createdAt, last1h));

      res.json({
        onlineUsers: onlineUsers.map(user => ({
          userId: user.userId,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          lastActivity: user.lastActivity
        })),
        realtimeActivity: realtimeActivity.map(activity => ({
          id: activity.id,
          userId: activity.userId,
          email: activity.email,
          page: activity.page,
          action: activity.action,
          feature: activity.feature,
          createdAt: activity.createdAt
        })),
        alerts,
        systemHealth: {
          totalUsers: totalUsersResult,
          activeUsers: activeUsersResult,
          activityLast1h: activityLast1hResult,
          errorRate: Number(errorLogs[0]?.count || 0)
        }
      });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao buscar dados de monitoramento' });
    }
  });

  // Admin: Get all subscriptions
  app.get('/api/admin/subscriptions', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const subscriptions = await db.select({
        id: userSubscriptions.id,
        userId: userSubscriptions.userId,
        userEmail: users.email,
        planId: userSubscriptions.planId,
        planName: subscriptionPlans.name,
        status: userSubscriptions.status,
        startDate: userSubscriptions.startDate,
        endDate: userSubscriptions.endDate,
        autoRenew: userSubscriptions.autoRenew,
        paymentMethod: userSubscriptions.paymentMethod,
        createdAt: userSubscriptions.createdAt
      })
      .from(userSubscriptions)
      .leftJoin(users, eq(userSubscriptions.userId, users.userPlatformId))
      .leftJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
      .orderBy(desc(userSubscriptions.createdAt));

      res.json(subscriptions);
    } catch (error) {
      res.status(500).json({ message: 'Erro ao buscar assinaturas' });
    }
  });

  // Get subscription statistics for admin dashboard
  app.get('/api/admin/subscription-stats', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const now = new Date();
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      // Get basic subscription stats
      const [totalUsersR, activeUsersR, expiredUsersR] = await Promise.all([
        db.select({ count: count() }).from(users),
        db.select({ count: count() }).from(users).where(eq(users.status, 'active')),
        db.select({ count: count() }).from(users).where(eq(users.status, 'blocked'))
      ]);

      // Mock data for demonstration (will be replaced with real subscription data)
      const stats = {
        totalSubscriptions: Number(totalUsersR[0]?.count || 0),
        activeSubscriptions: Number(activeUsersR[0]?.count || 0),
        expiredSubscriptions: Number(expiredUsersR[0]?.count || 0),
        expiringThisWeek: 5, // Mock data
        monthlyRevenue: 4850, // Mock data
        planDistribution: {
          basico: Number(totalUsersR[0]?.count || 0) > 0 ? Math.floor(Number(totalUsersR[0]?.count || 0) * 0.4) : 0,
          premium: Number(totalUsersR[0]?.count || 0) > 0 ? Math.floor(Number(totalUsersR[0]?.count || 0) * 0.35) : 0,
          pro: Number(totalUsersR[0]?.count || 0) > 0 ? Math.floor(Number(totalUsersR[0]?.count || 0) * 0.25) : 0
        }
      };

      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: 'Erro ao buscar estatísticas de assinaturas' });
    }
  });

  // Get subscription details for all users
  app.get('/api/admin/subscription-details', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const allUsers = await db.select().from(users);

      // Get user permissions for each user
      const userPermissionsData = await Promise.all(
        allUsers.map(async (user) => {
          const userPerms = await db.select({ permissionName: permissions.name })
            .from(userPermissions)
            .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
            .where(eq(userPermissions.userId, user.userPlatformId));

          return {
            ...user,
            permissions: userPerms.map(p => p.permissionName)
          };
        })
      );

      res.json(userPermissionsData);
    } catch (error) {
      res.status(500).json({ message: 'Erro ao buscar detalhes das assinaturas' });
    }
  });

  // Extend user subscription
  app.post('/api/admin/extend-subscription', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const { userId, days } = req.body;

      if (!userId || !days) {
        return res.status(400).json({ message: 'ID do usuário e número de dias são obrigatórios' });
      }

      await db.update(users)
        .set({
          status: 'active',
          updatedAt: new Date()
        })
        .where(eq(users.userPlatformId, userId));

      // Log the action
      await db.insert(accessLogs).values({
        id: nanoid(),
        userId: req.user!.userPlatformId,
        action: `Extended subscription for user ${userId} by ${days} days`,
        ipAddress: req.ip || undefined,
        userAgent: req.get('User-Agent'),
        metadata: { status: 'success', details: `Admin extended subscription by ${days} days` },
        createdAt: new Date(),
      });

      res.json({ message: 'Assinatura estendida com sucesso' });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao estender assinatura' });
    }
  });

  // Update user subscription plan
  app.post('/api/admin/update-subscription-plan', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const { userId, planId } = req.body;

      if (!userId || !planId) {
        return res.status(400).json({ message: 'ID do usuário e plano são obrigatórios' });
      }

      // Apply new plan permissions
      await applyPlanPermissions(userId, planId);

      // Log the action
      await db.insert(accessLogs).values({
        id: nanoid(),
        userId: req.user!.userPlatformId,
        action: `Updated subscription plan for user ${userId} to ${planId}`,
        ipAddress: req.ip || undefined,
        userAgent: req.get('User-Agent'),
        metadata: { status: 'success', details: `Admin changed subscription plan to ${planId}` },
        createdAt: new Date(),
      });

      res.json({ message: 'Plano de assinatura atualizado com sucesso' });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao atualizar plano de assinatura' });
    }
  });

  // Get subscription renewal history
  app.get('/api/admin/subscription-history', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const { userId } = req.query;

      let query = db.select({
        id: accessLogs.id,
        userId: accessLogs.userId,
        action: accessLogs.action,
        metadata: accessLogs.metadata,
        createdAt: accessLogs.createdAt,
        userEmail: users.email,
        userFirstName: users.firstName,
        userLastName: users.lastName
      }).from(accessLogs)
        .leftJoin(users, eq(accessLogs.userId, users.id))
        .where(
          sql`${accessLogs.action} LIKE '%subscription%' OR ${accessLogs.action} LIKE '%plan%' OR ${accessLogs.action} LIKE '%Extended%'`
        );

      if (userId) {
        query = (query as any).where(eq(accessLogs.userId, userId as string));
      }

      const history = await (query as any).orderBy(desc(accessLogs.createdAt)).limit(100);

      res.json(history);
    } catch (error) {
      res.status(500).json({ message: 'Erro ao buscar histórico de assinaturas' });
    }
  });

  // Create subscription renewal
  app.post('/api/admin/renew-subscription', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const { userId, planId, paymentMethod } = req.body;

      if (!userId || !planId) {
        return res.status(400).json({ message: 'ID do usuário e plano são obrigatórios' });
      }

      // Apply plan permissions
      await applyPlanPermissions(userId, planId);

      // Update user status to active
      await db.update(users)
        .set({
          status: 'active',
          updatedAt: new Date()
        })
        .where(eq(users.userPlatformId, userId));

      // Log the renewal
      await db.insert(accessLogs).values({
        id: nanoid(),
        userId: req.user!.userPlatformId,
        action: `Manual subscription renewal for user ${userId}`,
        ipAddress: req.ip || undefined,
        userAgent: req.get('User-Agent'),
        metadata: { status: 'success', details: `Admin renewed subscription: Plan ${planId}, Payment: ${paymentMethod || 'Manual'}` },
        createdAt: new Date(),
      });

      res.json({ message: 'Assinatura renovada com sucesso' });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao renovar assinatura' });
    }
  });

  // Get billing reports
  app.get('/api/admin/billing-reports', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const { period = '30d' } = req.query;

      let dateFilter = new Date();
      switch (period) {
        case '7d':
          dateFilter.setDate(dateFilter.getDate() - 7);
          break;
        case '30d':
          dateFilter.setDate(dateFilter.getDate() - 30);
          break;
        case '90d':
          dateFilter.setDate(dateFilter.getDate() - 90);
          break;
        case '1y':
          dateFilter.setFullYear(dateFilter.getFullYear() - 1);
          break;
        default:
          dateFilter.setDate(dateFilter.getDate() - 30);
      }

      // Get user creation stats for the period
      const newSubscriptions = await db.select({ count: count() })
        .from(users)
        .where(gte(users.createdAt, dateFilter));

      // Get activity stats
      const activityStats = await db.select({
        month: sql<string>`DATE_TRUNC('month', ${users.createdAt})`,
        count: count()
      }).from(users)
        .where(gte(users.createdAt, dateFilter))
        .groupBy(sql`DATE_TRUNC('month', ${users.createdAt})`)
        .orderBy(sql`DATE_TRUNC('month', ${users.createdAt})`);

      // Mock revenue data (will be replaced with real payment data)
      const mockRevenue = {
        total: 4850,
        byPlan: {
          basico: 1470,
          premium: 1940,
          pro: 1440
        },
        growth: 12.5
      };

      res.json({
        newSubscriptions: Number(newSubscriptions[0]?.count || 0),
        activityStats: activityStats.map(stat => ({
          month: stat.month,
          count: Number(stat.count)
        })),
        revenue: mockRevenue,
        period
      });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao buscar relatórios de billing' });
    }
  });

  // Admin data metrics endpoint with robust error handling
  app.get('/api/admin/data-metrics', requireAuth, requirePermission('admin_full'), async (req: any, res) => {
    try {

      // Get all users with their basic info
      const allUsers = await db.select({
        userPlatformId: users.userPlatformId,
        email: users.email,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        status: users.status
      }).from(users);

      const userMetrics = [];

      for (const user of allUsers) {

        try {
          let sessionCount = 0;
          let tournamentCount = 0;
          let otherCount = 0;

          try {
            // Count sessions safely
            const sessions = await db.select({ count: sql<number>`cast(count(*) as integer)` })
              .from(grindSessions)
              .where(eq(grindSessions.userId, user.userPlatformId));
            sessionCount = Number(sessions[0]?.count || 0);

            // Count tournaments safely
            const tournamentsData = await db.select({ count: sql<number>`cast(count(*) as integer)` })
              .from(tournaments)
              .where(eq(tournaments.userId, user.userPlatformId));
            tournamentCount = Number(tournamentsData[0]?.count || 0);

            // Count other data with error handling
            let activityCount = 0;
            let bugReportCount = 0;
            let uploadCount = 0;

            try {
              const activities = await db.select({ count: sql<number>`cast(count(*) as integer)` })
                .from(userActivity)
                .where(eq(userActivity.userId, user.userPlatformId));
              activityCount = Number(activities[0]?.count || 0);
            } catch (e) {
            }

            try {
              const bugs = await db.select({ count: sql<number>`cast(count(*) as integer)` })
                .from(bugReports)
                .where(eq(bugReports.userId, user.userPlatformId));
              bugReportCount = Number(bugs[0]?.count || 0);
            } catch (e) {
            }

            try {
              const uploads = await db.select({ count: sql<number>`cast(count(*) as integer)` })
                .from(uploadHistory)
                .where(eq(uploadHistory.userId, user.userPlatformId));
              uploadCount = Number(uploads[0]?.count || 0);
            } catch (e) {
            }

            otherCount = activityCount + bugReportCount + uploadCount;

          } catch (userError) {
          }

          // Calculate estimated sizes
          const sessionSize = sessionCount * 2048;
          const tournamentSize = tournamentCount * 1024;
          const otherSize = otherCount * 512;

          userMetrics.push({
            userPlatformId: user.userPlatformId,
            email: user.email,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            sessionHistory: {
              count: sessionCount,
              size: sessionSize
            },
            tournaments: {
              count: tournamentCount,
              size: tournamentSize
            },
            other: {
              count: otherCount,
              size: otherSize
            },
            total: {
              count: sessionCount + tournamentCount + otherCount,
              size: sessionSize + tournamentSize + otherSize
            }
          });
        } catch (userError) {
          // Continue with next user
          userMetrics.push({
            userPlatformId: user.userPlatformId,
            email: user.email,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            sessionHistory: { count: 0, size: 0 },
            tournaments: { count: 0, size: 0 },
            other: { count: 0, size: 0 },
            total: { count: 0, size: 0 }
          });
        }
      }

      res.json(userMetrics);
    } catch (error) {
      res.status(500).json({ message: 'Erro ao obter métricas de dados' });
    }
  });

  // Endpoint to delete specific data categories by user
  app.delete('/api/admin/data-cleanup/:userPlatformId/:category', requireAuth, requirePermission('admin_full'), async (req: any, res) => {
    try {
      const { userPlatformId, category } = req.params;
      const currentUserPlatformId = req.user.userPlatformId;


      // Prevent self-deletion and super-admin deletion
      if (userPlatformId === currentUserPlatformId) {
        return res.status(400).json({ message: 'Não é possível excluir seus próprios dados' });
      }

      const targetUser = await db
        .select()
        .from(users)
        .where(eq(users.userPlatformId, userPlatformId))
        .limit(1);

      if (!targetUser.length) {
        return res.status(404).json({ message: 'Usuário não encontrado' });
      }

      // Check if target user is super-admin
      if (targetUser[0].email === 'ricardo.agnolo@hotmail.com') {
        return res.status(400).json({ message: 'Não é possível excluir dados do super-admin' });
      }

      let deletedCount = 0;

      await db.transaction(async (tx) => {
        switch (category) {
          case 'sessions':
            // Delete session tournaments first (foreign key constraint)
            await tx.delete(sessionTournaments).where(eq(sessionTournaments.userId, userPlatformId));
            // Delete grind sessions
            const sessionsResult = await tx.delete(grindSessions).where(eq(grindSessions.userId, userPlatformId));
            deletedCount = sessionsResult.rowCount || 0;
            break;

          case 'tournaments':
            // Delete tournaments and upload history
            await tx.delete(tournaments).where(eq(tournaments.userId, userPlatformId));
            const uploadsResult = await tx.delete(uploadHistory).where(eq(uploadHistory.userId, userPlatformId));
            deletedCount = uploadsResult.rowCount || 0;
            break;

          case 'other':
            // Delete permissions and logs (except basic ones)
            await tx.delete(userPermissions).where(eq(userPermissions.userId, userPlatformId));
            const logsResult = await tx.delete(accessLogs).where(eq(accessLogs.userId, userPlatformId));
            deletedCount = logsResult.rowCount || 0;
            break;

          case 'all':
            // Delete everything (cascading)
            await tx.delete(sessionTournaments).where(eq(sessionTournaments.userId, userPlatformId));
            await tx.delete(grindSessions).where(eq(grindSessions.userId, userPlatformId));
            await tx.delete(tournaments).where(eq(tournaments.userId, userPlatformId));
            await tx.delete(uploadHistory).where(eq(uploadHistory.userId, userPlatformId));
            await tx.delete(userPermissions).where(eq(userPermissions.userId, userPlatformId));
            const allLogsResult = await tx.delete(accessLogs).where(eq(accessLogs.userId, userPlatformId));
            deletedCount = allLogsResult.rowCount || 0;
            break;

          default:
            throw new Error('Categoria inválida');
        }
      });

      res.json({
        message: `Dados da categoria ${category} excluídos com sucesso`,
        deletedCount,
        userPlatformId,
        category
      });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao excluir dados' });
    }
  });
}

// Helper function to apply plan permissions (used by admin endpoints)
async function applyPlanPermissions(userId: string, planId: string) {
  try {
    // Get plan permissions
    const plan = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId));
    if (plan.length === 0) return;

    const planPermissions = plan[0].permissions;
    if (!planPermissions || planPermissions.length === 0) return;

    // Remove existing permissions
    await db.delete(userPermissions).where(eq(userPermissions.userId, userId));

    // Get permission IDs from names
    const permissionRecords = await db.select()
      .from(permissions)
      .where(inArray(permissions.name, planPermissions));

    // Calculate expiration date
    const startDate = new Date();
    const expirationDate = new Date(startDate);
    expirationDate.setDate(expirationDate.getDate() + (plan[0].durationDays || 30));

    // Add new permissions
    const permissionsToInsert = permissionRecords.map(permission => ({
      id: nanoid(),
      userId,
      permissionId: permission.id,
      granted: true,
      status: 'active',
      expirationDate,
      subscriptionPlan: planId,
      autoRenew: false,
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    if (permissionsToInsert.length > 0) {
      await db.insert(userPermissions).values(permissionsToInsert);
    }

  } catch (error) {
    throw error;
  }
}
