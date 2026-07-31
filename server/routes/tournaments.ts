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

/**
 * ADR-243 — `dateTo` chega como `YYYY-MM-DD` (input de data). `new Date()` disso
 * da meia-noite UTC, e o filtro `datePlayed <= dateTo` descartaria TODO o dia
 * escolhido (inclusive o dia corrente em "ultimos 30 dias"). Empurra para o fim
 * do dia. Data com hora explicita passa intacta.
 */
function endOfDayIfDateOnly(raw: string): Date {
  const d = new Date(raw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw).trim())) {
    d.setUTCHours(23, 59, 59, 999);
  }
  return d;
}

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
      const { sites, dateFrom, dateTo, confirmation, all } = req.body;

      // Validate confirmation
      if (confirmation !== 'CONFIRMAR') {
        return res.status(400).json({ message: 'Confirmação obrigatória: digite "CONFIRMAR" para prosseguir.' });
      }

      // ADR-243: `all: true` e o pedido EXPLICITO de apagar todo o historico
      // importado (o painel exige digitar CONFIRMAR nesse modo). Sem `all`, a
      // regra antiga continua: filtro vazio e recusado para evitar apagar tudo
      // por acidente.
      const deleteAll = all === true;
      if (!deleteAll && !sites?.length && !dateFrom && !dateTo) {
        return res.status(400).json({ message: 'Selecione ao menos um filtro (site ou período) — ou use "Remover tudo" para limpar o histórico inteiro.' });
      }

      // Get preview count first. Em `all` os filtros sao ignorados de proposito.
      const effectiveFilters = deleteAll
        ? { sites: [], dateFrom: null, dateTo: null }
        : {
            sites: sites || [],
            dateFrom: dateFrom ? new Date(dateFrom) : null,
            dateTo: dateTo ? endOfDayIfDateOnly(dateTo) : null,
          };
      const previewCount = await storage.getFilteredTournamentsCount(userId, effectiveFilters);

      // Safety limit. Subido de 5000 -> 100000: contas reais de grinder passam
      // de 30k torneios e o cap antigo travava qualquer limpeza ampla com 400
      // (founder reportou "Falha na limpeza" com 34k). DELETE unico aguenta —
      // todas as FKs que referenciam tournaments sao ON DELETE SET NULL.
      const MAX_DELETE_LIMIT = 100000;
      // O teto protege contra filtro amplo demais por engano. Em `all: true` o
      // jogador declarou que quer o historico inteiro (e digitou CONFIRMAR),
      // entao o teto nao se aplica — senao uma conta com 126k torneios nunca
      // conseguiria limpar.
      if (!deleteAll && previewCount > MAX_DELETE_LIMIT) {
        return res.status(400).json({
          message: `Não é possível apagar mais de ${MAX_DELETE_LIMIT} torneios de uma vez. Encontrados ${previewCount} no filtro.`
        });
      }

      // Perform bulk deletion
      const deletedCount = await storage.bulkDeleteTournaments(userId, effectiveFilters);

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
      console.error('bulk-delete failed:', error);
      res.status(500).json({ message: 'Erro interno ao remover torneios.' });
    }
  });

  // Get preview count for bulk delete
  app.post('/api/tournaments/bulk-delete/preview', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const { sites, dateFrom, dateTo, all } = req.body;

      // ADR-243: `all: true` -> contagem do historico inteiro (sem filtros).
      const count = await storage.getFilteredTournamentsCount(userId, all === true
        ? { sites: [], dateFrom: null, dateTo: null }
        : {
            sites: sites || [],
            dateFrom: dateFrom ? new Date(dateFrom) : null,
            dateTo: dateTo ? endOfDayIfDateOnly(dateTo) : null,
          });

      res.json({ count });
    } catch (error) {
      console.error('bulk-delete preview failed:', error);
      res.status(500).json({ message: 'Erro ao calcular a prévia.' });
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
