import type { Express } from "express";
import { requireAuth, requirePermission } from "../auth";
import { storage } from "../storage";
import { insertBugReportSchema } from "@shared/schema";

export function registerBugReportRoutes(app: Express): void {
  // Create bug report
  app.post('/api/bug-reports', requireAuth, async (req, res) => {
    try {
      const bugReportData = insertBugReportSchema.parse({
        ...req.body,
        userId: req.user!.userPlatformId
      });

      const bugReport = await storage.createBugReport(bugReportData);
      res.status(201).json(bugReport);
    } catch (error) {
      res.status(500).json({ message: 'Falha ao criar relatório de bug' });
    }
  });

  // Get all bug reports (admin only)
  app.get('/api/bug-reports', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const bugReports = await storage.getBugReports();
      res.json(bugReports);
    } catch (error) {
      res.status(500).json({ message: 'Falha ao buscar relatórios de bug' });
    }
  });

  // Get user's bug reports
  app.get('/api/bug-reports/my', requireAuth, async (req, res) => {
    try {
      const bugReports = await storage.getBugReportsByUser(req.user!.userPlatformId);
      res.json(bugReports);
    } catch (error) {
      res.status(500).json({ message: 'Falha ao buscar seus relatórios de bug' });
    }
  });

  // Get bug report statistics (admin only) - MUST come before /:id route
  app.get('/api/bug-reports/stats', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const stats = await storage.getBugReportStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: 'Falha ao buscar estatísticas de bug reports' });
    }
  });

  // Get bug report by ID
  app.get('/api/bug-reports/:id', requireAuth, async (req, res) => {
    try {
      const bugReport = await storage.getBugReportById(req.params.id);
      if (!bugReport) {
        return res.status(404).json({ message: 'Relatório de bug não encontrado' });
      }

      // Users can only see their own reports, admins can see all
      const hasPermission = req.user!.permissions.includes('admin_full') ||
                           bugReport.userId === req.user!.userPlatformId;

      if (!hasPermission) {
        return res.status(403).json({ message: 'Acesso negado' });
      }

      res.json(bugReport);
    } catch (error) {
      res.status(500).json({ message: 'Falha ao buscar relatório de bug' });
    }
  });

  // Update bug report (admin only)
  app.put('/api/bug-reports/:id', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      const updates = req.body;
      const bugReport = await storage.updateBugReport(req.params.id, updates);
      res.json(bugReport);
    } catch (error) {
      res.status(500).json({ message: 'Falha ao atualizar relatório de bug' });
    }
  });

  // Delete bug report (admin only)
  app.delete('/api/bug-reports/:id', requireAuth, requirePermission('admin_full'), async (req, res) => {
    try {
      await storage.deleteBugReport(req.params.id);
      res.json({ message: 'Relatório de bug excluído com sucesso' });
    } catch (error) {
      res.status(500).json({ message: 'Falha ao excluir relatório de bug' });
    }
  });
}
