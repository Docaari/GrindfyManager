import type { Express } from "express";
import { requireAuth } from "../auth";
import { NotificationService } from "../notificationService";

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
      await NotificationService.markAsRead(id);
      res.json({ message: 'Notificação marcada como lida' });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao marcar notificação como lida' });
    }
  });

  app.post('/api/notifications', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const notificationData = {
        userId,
        type: req.body.type,
        title: req.body.title,
        message: req.body.message,
        priority: req.body.priority,
        daysUntilExpiration: req.body.daysUntilExpiration,
        scheduledFor: req.body.scheduledFor ? new Date(req.body.scheduledFor) : undefined
      };

      const notification = await NotificationService.createNotification(notificationData);
      res.json(notification);
    } catch (error) {
      res.status(500).json({ message: 'Erro ao criar notificação' });
    }
  });
}
