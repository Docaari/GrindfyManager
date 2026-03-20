import type { Express } from "express";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import {
  insertPlannedTournamentSchema,
} from "@shared/schema";

export function registerGradePlannerRoutes(app: Express): void {
  // Planned tournament routes com suporte para integração com Grade Planner
  app.get('/api/planned-tournaments', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const dayOfWeek = req.query.dayOfWeek;


      let tournaments;

      if (dayOfWeek !== undefined) {
        // Buscar torneios específicos para o dia da semana
        const dayNumber = parseInt(dayOfWeek);

        tournaments = await storage.getSessionTournamentsByDay(userId, dayNumber);
      } else {
        // Buscar todos os torneios se não especificar dia
        tournaments = await storage.getPlannedTournaments(userId);
      }

      // Validação adicional de segurança: garantir que todos os torneios pertencem ao usuário
      const validTournaments = tournaments.filter(t => t.userId === userId);

      if (validTournaments.length !== tournaments.length) {
      }

      res.json(validTournaments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch planned tournaments" });
    }
  });

  // Endpoint separado para sugestões globais (pool comum)
  app.get('/api/tournament-suggestions', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;

      const allTournaments = await storage.getAllPlannedTournaments(); // Pool global

      // Filtrar apenas torneios de outros usuários para sugestões
      const suggestions = allTournaments.filter(t => t.userId !== userId);

      res.json(suggestions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tournament suggestions" });
    }
  });

  app.post('/api/planned-tournaments', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;

      const tournamentData = insertPlannedTournamentSchema.parse({ ...req.body, userId });

      const tournament = await storage.createPlannedTournament(tournamentData);

      res.json(tournament);
    } catch (error) {
      res.status(400).json({
        message: "Failed to create planned tournament",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.put('/api/planned-tournaments/:id', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;

      // Parse the request body manually to handle all field types correctly
      const updates: any = {};
      for (const [key, value] of Object.entries(req.body)) {
        if (key === 'dayOfWeek') {
          updates[key] = typeof value === 'number' ? value : parseInt(String(value)) || 0;
        } else if (key === 'position') {
          updates[key] = value === null || value === undefined ? null : parseInt(String(value));
        } else if (key === 'rebuys') {
          updates[key] = parseInt(String(value)) || 0;
        } else if (key === 'prioridade') {
          updates[key] = parseInt(String(value)) || 2; // Default to 2 (Média) if invalid
        } else if (key === 'result' || key === 'bounty') {
          // Handle comma decimal separator for result and bounty fields
          if (value === null || value === undefined) {
            updates[key] = '0';
          } else {
            // Convert comma decimal separator to dot
            const normalizedValue = String(value).replace(',', '.');
            updates[key] = normalizedValue;
          }
        } else if (key === 'buyIn' || key === 'guaranteed') {
          updates[key] = String(value || '0');
        } else if (key === 'startTime' || key === 'endTime') {
          updates[key] = value === null || value === undefined ? null : (value ? new Date(String(value)) : null);
        } else if (key === 'site' || key === 'time' || key === 'type' || key === 'speed' || key === 'name') {
          updates[key] = String(value || '');
        } else {
          updates[key] = value;
        }
      }

      const tournament = await storage.updatePlannedTournament(id, updates);
      res.json(tournament);
    } catch (error) {
      res.status(400).json({
        message: "Failed to update planned tournament",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.delete('/api/planned-tournaments/:id', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userPlatformId = req.user.userPlatformId;


      // Verificar se o torneio pertence ao usuário antes de deletar
      const tournament = await storage.getPlannedTournament(id);
      if (!tournament) {
        return res.status(404).json({ message: "Tournament not found" });
      }


      if (tournament.userId !== userPlatformId) {
        return res.status(403).json({ message: "Unauthorized to delete this tournament" });
      }

      await storage.deletePlannedTournament(id);
      res.json({ message: "Planned tournament deleted successfully", id });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete planned tournament" });
    }
  });

  // Grade Coach route
  app.get('/api/coaching/recommendations', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const recommendations = await storage.getCoachingRecommendations(userId);
      res.json(recommendations);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch coaching recommendations" });
    }
  });
}
