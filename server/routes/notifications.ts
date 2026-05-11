import type { Express } from "express";
import { requireAuth } from "../auth";
import { NotificationService } from "../notificationService";
import { z } from "zod";

// Wave 5 hardening: validate the create-notification body (was built ad-hoc from
// req.body without any shape/length checks).
const createNotificationSchema = z.object({
  type: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
  priority: z.enum(["low", "medium", "high"]).optional().default("medium"),
  daysUntilExpiration: z.coerce.number().int().min(0).max(3650).optional(),
  scheduledFor: z.coerce.date().optional(),
});

export function registerNotificationRoutes(app: Express): void {
  app.get('/api/notifications', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const notifications = await NotificationService.getUserNotifications(userId);
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ message: 'Erro ao buscar notificações' });
    }
  });

  app.get('/api/notifications/unread-count', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const count = await NotificationService.getUnreadCount(userId);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao buscar contagem de notificações' });
    }
  });

  app.post('/api/notifications/:id/mark-read', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.userPlatformId;
      // IDOR fix (Wave 2): markAsRead now scopes by userId; false = not found / not owned.
      const ok = await NotificationService.markAsRead(id, userId);
      if (!ok) {
        return res.status(404).json({ message: 'Notificação não encontrada' });
      }
      res.json({ message: 'Notificação marcada como lida' });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao marcar notificação como lida' });
    }
  });

  app.post('/api/notifications', requireAuth, async (req: any, res) => {
    try {
      const parsed = createNotificationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: 'Dados de notificação inválidos', errors: parsed.error.flatten?.() ?? undefined });
      }
      const userId = req.user.userPlatformId;
      const notification = await NotificationService.createNotification({
        userId,
        // `type` is widened by NotificationService — keep the string as validated.
        type: parsed.data.type as any,
        title: parsed.data.title,
        message: parsed.data.message,
        priority: parsed.data.priority,
        daysUntilExpiration: parsed.data.daysUntilExpiration,
        scheduledFor: parsed.data.scheduledFor,
      });
      res.json(notification);
    } catch (error) {
      res.status(500).json({ message: 'Erro ao criar notificação' });
    }
  });
}
