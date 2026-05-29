import type { Express } from "express";
import { ZodError } from "zod";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import {
  insertTournamentSchema,
  insertTournamentSchemaBase,
  insertTournamentTemplateSchema,
} from "@shared/schema";
import { parseFiltersParam, mapFiltersToBackendFormat } from "./helpers";
import { invalidateUserTournamentCaches } from "../services/playerBundle";
import { zodErrorResponse } from "../lib/zodErrorResponse";

export function registerTournamentRoutes(app: Express): void {
  // Tournament routes
  app.get("/api/tournaments", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const limit = parseInt(req.query.limit as string) || 50;
      const period = req.query.period as string;
      const sortBy = req.query.sortBy as string; // New sorting parameter
      const rawFilters = parseFiltersParam(req.query.filters);
      const filters = mapFiltersToBackendFormat(rawFilters);

      const tournaments = await storage.getTournaments(userId, limit, undefined, period, filters, sortBy);
      res.json(tournaments);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Bulk delete tournaments with granular filtering
  app.post('/api/tournaments/bulk-delete', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const { sites, dateFrom, dateTo, confirmation } = req.body;

      // Validate confirmation
      if (confirmation !== 'CONFIRMAR') {
        return res.status(400).json({ error: 'Confirmation required. Type "CONFIRMAR" to proceed.' });
      }

      // Validate at least one filter is provided
      if (!sites?.length && !dateFrom && !dateTo) {
        return res.status(400).json({ error: 'At least one filter (site or date range) is required.' });
      }

      // Get preview count first
      const previewCount = await storage.getFilteredTournamentsCount(userId, {
        sites: sites || [],
        dateFrom: dateFrom ? new Date(dateFrom) : null,
        dateTo: dateTo ? new Date(dateTo) : null
      });

      // Safety limit
      const MAX_DELETE_LIMIT = 5000;
      if (previewCount > MAX_DELETE_LIMIT) {
        return res.status(400).json({
          error: `Cannot delete more than ${MAX_DELETE_LIMIT} tournaments at once. Found ${previewCount} tournaments matching criteria.`
        });
      }

      // Perform bulk deletion
      const deletedCount = await storage.bulkDeleteTournaments(userId, {
        sites: sites || [],
        dateFrom: dateFrom ? new Date(dateFrom) : null,
        dateTo: dateTo ? new Date(dateTo) : null
      });

      // Log the operation

      res.json({
        message: `Successfully deleted ${deletedCount} tournaments`,
        deletedCount,
        filters: {
          sites: sites || [],
          dateFrom,
          dateTo
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error during bulk deletion' });
    }
  });

  // Get preview count for bulk delete
  app.post('/api/tournaments/bulk-delete/preview', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const { sites, dateFrom, dateTo } = req.body;

      const count = await storage.getFilteredTournamentsCount(userId, {
        sites: sites || [],
        dateFrom: dateFrom ? new Date(dateFrom) : null,
        dateTo: dateTo ? new Date(dateTo) : null
      });

      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get unique sites for bulk delete dropdown
  app.get('/api/tournaments/sites', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const sites = await storage.getUniqueSites(userId);
      res.json(sites);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Clear all tournaments for user
  app.delete('/api/tournaments/clear', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      await storage.clearAllTournaments(userId);
      res.json({ message: "All tournaments cleared successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to clear tournaments" });
    }
  });

  app.post('/api/tournaments', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const tournamentData = insertTournamentSchema.parse({ ...req.body, userId });
      const tournament = await storage.createTournament(tournamentData);
      // MEDIUM #8: invalidar caches do Tournament Selector apos mutacao
      invalidateUserTournamentCaches(userId);
      res.json(tournament);
    } catch (error) {
      // Sprint 1 RF-01 + RF-10: erros Zod estruturados
      if (error instanceof ZodError) {
        const isProd = process.env.NODE_ENV === 'production';
        const out = zodErrorResponse(error, isProd);
        if (out) return res.status(out.status).json(out.body);
      }
      res.status(500).json({ message: "Failed to create tournament" });
    }
  });

  // Sprint Flight-1 H4 fix (Reviewer R1): handler shared para PUT + PATCH.
  // PATCH e o verb REST-correto pra partial update (usado pelo BackfillSeriesDialog).
  // PUT mantido pra compat com clients existentes.
  const updateTournamentHandler = async (req: any, res: any) => {
    try {
      const userId = req.user.userPlatformId;
      const { id } = req.params;
      // IDOR fix (Wave 2): verify ownership before mutating — storage.updateTournament
      // does WHERE id-only. Also drop any caller-supplied userId so the row can't be
      // reassigned to another account.
      const existing = await storage.getTournament(id);
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ message: "Tournament not found" });
      }
      const { userId: _ignoreUserId, id: _ignoreId, ...body } = req.body ?? {};
      const tournamentData = insertTournamentSchemaBase.partial().parse(body);
      const tournament = await storage.updateTournament(id, tournamentData);
      invalidateUserTournamentCaches(userId);
      res.json(tournament);
    } catch (error) {
      if (error instanceof ZodError) {
        const isProd = process.env.NODE_ENV === 'production';
        const out = zodErrorResponse(error, isProd);
        if (out) return res.status(out.status).json(out.body);
      }
      res.status(500).json({ message: "Failed to update tournament" });
    }
  };
  app.put('/api/tournaments/:id', requireAuth, updateTournamentHandler);
  app.patch('/api/tournaments/:id', requireAuth, updateTournamentHandler);

  app.delete('/api/tournaments/:id', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const { id } = req.params;
      // IDOR fix (Wave 2): verify ownership before delete.
      const existing = await storage.getTournament(id);
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ message: "Tournament not found" });
      }
      await storage.deleteTournament(id);
      invalidateUserTournamentCaches(userId);
      res.json({ message: "Tournament deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete tournament" });
    }
  });

  // Tournament Library - Agrupamento Inteligente (aggregated view for /library page)
  app.get('/api/tournament-library-grouped', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const period = req.query.period as string || "all";
      const filters = parseFiltersParam(req.query.filters);

      const library = await storage.getTournamentLibrary(userId, period, filters);
      res.json(library);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tournament library" });
    }
  });

  // Fase 2 (library-evolution): insights "Destaques e Vazamentos" — dimensoes
  // (site/buyIn/type/speed/fieldSize/dia + conjuncoes) vs baseline do jogador.
  app.get('/api/tournament-library-insights', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const period = req.query.period as string || "all";
      const filters = parseFiltersParam(req.query.filters);

      const result = await storage.getTournamentLibraryInsights(userId, period, filters);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tournament library insights" });
    }
  });

  // Tournament template routes
  app.get('/api/tournament-templates', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const templates = await storage.getTournamentTemplates(userId);
      res.json(templates);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tournament templates" });
    }
  });

  app.post('/api/tournament-templates', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const templateData = insertTournamentTemplateSchema.parse({ ...req.body, userId });
      const template = await storage.createTournamentTemplate(templateData);
      res.json(template);
    } catch (error) {
      res.status(400).json({ message: "Failed to create tournament template" });
    }
  });
}
