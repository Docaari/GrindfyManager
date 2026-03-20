import type { Express } from "express";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import {
  insertGrindSessionSchema,
  insertPreparationLogSchema,
  insertBreakFeedbackSchema,
  insertSessionTournamentSchema,
  profileStates,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { clampBreakFeedback } from "@shared/utils";

export function registerGrindSessionRoutes(app: Express): void {
  // Grind session routes
  app.get('/api/grind-sessions', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const sessions = await storage.getGrindSessions(userId);

      // CLEANUP: Check for multiple active sessions and fix
      const activeSessions = sessions.filter(s => s.status === "active");
      if (activeSessions.length > 1) {

        // Keep only the most recent active session
        const mostRecentActive = activeSessions.sort((a, b) =>
          new Date(b.date).getTime() - new Date(a.date).getTime()
        )[0];


        // Mark all other active sessions as completed
        for (const session of activeSessions) {
          if (session.id !== mostRecentActive.id) {
            await storage.updateGrindSession(session.id, { status: "completed" });
          }
        }

        // Fetch updated sessions
        const updatedSessions = await storage.getGrindSessions(userId);
        res.json(updatedSessions);
      } else {
        res.json(sessions);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch grind sessions" });
    }
  });

  // Get grind session history with complete statistics
  app.get('/api/grind-sessions/history', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const sessions = await storage.getGrindSessions(userId);
      const completedSessions = sessions.filter(s => s.status === "completed");


      // Get statistics for each completed session
      const sessionsWithStats = await Promise.all(
        completedSessions.map(async (session) => {

          const sessionTournaments = await storage.getSessionTournaments(userId, session.id);

          // ALSO get tournaments from planned tournaments linked to this session
          const plannedTournaments = await storage.getPlannedTournamentsBySession(userId, session.id);


          // FILTER OUT tournaments that don't actually belong to this session
          // Only include tournaments that were actually played during this session
          const validPlannedTournaments = plannedTournaments.filter(t => {
            // Include only tournaments that have been completed/finished or registered during this session
            const isCompleted = t.status === 'completed' || t.status === 'finished';
            const isRegistered = t.status === 'registered';
            const hasResults = parseFloat(t.result || '0') > 0;
            const hasBounties = parseFloat(t.bounty || '0') > 0;

            // Tournament belongs to this session if it was actually played (has results, bounties, or was registered during session)
            return isCompleted || isRegistered || hasResults || hasBounties;
          });


          // Combine both types of tournaments
          const allTournaments = [...sessionTournaments, ...validPlannedTournaments];


          const sessionBreaks = await storage.getBreakFeedbacks(userId, session.id);

          // Use session data directly instead of recalculating
          const volume = session.volume || 0;
          const profit = parseFloat(session.profit || '0') || 0;
          const abiMed = parseFloat(session.abiMed || '0') || 0;
          const roi = parseFloat(session.roi || '0') || 0;
          const fts = session.fts || 0;
          const cravadas = session.cravadas || 0;


          // Use session data directly for mental averages
          const energiaMedia = parseFloat(session.energiaMedia || '0') || 0;
          const focoMedio = parseFloat(session.focoMedio || '0') || 0;
          const confiancaMedia = parseFloat(session.confiancaMedia || '0') || 0;
          const inteligenciaEmocionalMedia = parseFloat(session.inteligenciaEmocionalMedia || '0') || 0;
          const interferenciasMedia = parseFloat(session.interferenciasMedia || '0') || 0;


          // Calculate tournament type percentages
          const tournamentTypes = allTournaments.reduce((types, tournament) => {
            // Priority: type field first, then category field, then default to Vanilla
            const type = tournament.type || (tournament as any).category || 'Vanilla';
            types[type] = (types[type] || 0) + 1;
            return types;
          }, {} as Record<string, number>);


          const vanillaPercentage = volume > 0
            ? Number(Math.round(((tournamentTypes['Vanilla'] || 0) / volume) * 100))
            : 0;
          const pkoPercentage = volume > 0
            ? Number(Math.round(((tournamentTypes['PKO'] || 0) / volume) * 100))
            : 0;
          const mysteryPercentage = volume > 0
            ? Number(Math.round(((tournamentTypes['Mystery'] || 0) / volume) * 100))
            : 0;

          // Calculate tournament speed percentages
          const tournamentSpeeds = allTournaments.reduce((speeds, tournament) => {
            const speed = tournament.speed || 'Normal';
            speeds[speed] = (speeds[speed] || 0) + 1;
            return speeds;
          }, {} as Record<string, number>);


          const normalSpeedPercentage = volume > 0
            ? Number(Math.round(((tournamentSpeeds['Normal'] || 0) / volume) * 100))
            : 0;
          const turboSpeedPercentage = volume > 0
            ? Number(Math.round(((tournamentSpeeds['Turbo'] || 0) / volume) * 100))
            : 0;
          const hyperSpeedPercentage = volume > 0
            ? Number(Math.round(((tournamentSpeeds['Hyper'] || 0) / volume) * 100))
            : 0;



          // Store percentages in session data for verification
          const sessionPercentages = {
            vanillaPercentage,
            pkoPercentage,
            mysteryPercentage,
            normalSpeedPercentage,
            turboSpeedPercentage,
            hyperSpeedPercentage
          };


          // Calculate session duration
          let duration = undefined;
          if (session.startTime && session.endTime) {
            const start = new Date(session.startTime);
            const end = new Date(session.endTime);
            const durationMs = end.getTime() - start.getTime();
            const hours = Math.floor(durationMs / (1000 * 60 * 60));
            const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
            duration = `${hours}h ${minutes}m`;
          }

          return {
            ...session,
            duration,
            volume,
            profit,
            abiMed,
            roi,
            fts,
            cravadas,
            energiaMedia,
            focoMedio,
            confiancaMedia,
            inteligenciaEmocionalMedia,
            interferenciasMedia,
            breakCount: sessionBreaks.length,
            // Tournament type percentages
            vanillaPercentage,
            pkoPercentage,
            mysteryPercentage,
            // Tournament speed percentages
            normalSpeedPercentage,
            turboSpeedPercentage,
            hyperSpeedPercentage
          };
        })
      );

      res.json(sessionsWithStats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch session history" });
    }
  });

  // Get tournaments for a specific session
  app.get('/api/grind-sessions/:sessionId/tournaments', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const { sessionId } = req.params;


      // Get session tournaments
      const sessionTournaments = await storage.getSessionTournaments(userId, sessionId).catch(err => {
        return [];
      });


      // Also get regular tournaments for this session day
      const session = await storage.getGrindSession(sessionId).catch(err => {
        return null;
      });

      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }


      const sessionDate = new Date(session.date);
      const startOfDay = new Date(sessionDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(sessionDate);
      endOfDay.setHours(23, 59, 59, 999);


      // Get regular tournaments from the same day
      const regularTournaments = await storage.getTournaments(userId, startOfDay as any, endOfDay as any).catch((err: any) => {
        return [];
      });


      // CORREÇÃO: Filtrar apenas torneios concluídos
      // Filtrar sessionTournaments apenas concluídos (critério rigoroso)
      const completedSessionTournaments = sessionTournaments.filter(t => {
        // Torneio está concluído apenas se:
        // 1. Tem posição final válida (position > 0)
        // 2. OU tem resultado financeiro positivo (result > 0 ou prize > 0)
        // 3. OU status explicitamente completed/finished
        const hasValidPosition = t.position && t.position > 0;
        const hasPositiveResult = (t.result && parseFloat(t.result) > 0) || (t.prize && parseFloat(t.prize) > 0);
        const isExplicitlyCompleted = t.status === 'completed' || t.status === 'finished';

        return hasValidPosition || hasPositiveResult || isExplicitlyCompleted;
      });

      // Filtrar regularTournaments apenas concluídos (critério rigoroso)
      const completedRegularTournaments = regularTournaments.filter((t: any) => {
        // Para torneios regulares, consideramos concluído apenas se:
        // 1. Tem posição final válida (position > 0)
        // 2. OU tem resultado financeiro positivo (result > 0 ou prize > 0)
        const hasValidPosition = t.position && t.position > 0;
        const hasPositiveResult = (t.result && parseFloat(t.result) > 0) || (t.prize && parseFloat(t.prize) > 0);

        return hasValidPosition || hasPositiveResult;
      });


      // Combine and format only the completed tournaments
      const allTournaments = [
        ...completedSessionTournaments.map((t: any) => ({
          id: t.id,
          name: t.name || 'Torneio sem nome',
          buyIn: t.buyIn || 0,
          fieldSize: t.participants || 0,
          profit: (parseFloat(t.result || '0') || 0) + (parseFloat(t.bounty || '0') || 0) - (parseFloat(t.buyIn || '0') || 0),
          position: t.position || 0,
          itm: t.itm || false,
          result: t.result || 0,
          bounty: t.bounty || 0,
          rebuys: t.rebuys || 0,
          guaranteed: t.guaranteed || 0,
          source: 'session',
          site: t.site || 'N/A',
          type: t.type || 'Vanilla',
          speed: t.speed || 'Normal'
        })),
        ...completedRegularTournaments.map((t: any) => ({
          id: t.id,
          name: t.name || 'Torneio sem nome',
          buyIn: t.buyIn || 0,
          fieldSize: t.fieldSize || 0,
          profit: (parseFloat(t.result || '0') || 0) - (parseFloat(t.buyIn || '0') || 0),
          position: t.position || 0,
          itm: t.itm || false,
          result: t.result || 0,
          bounty: 0, // Regular tournaments don't have bounties in this context
          rebuys: t.rebuys || 0,
          guaranteed: t.guaranteed || 0,
          source: 'regular',
          site: t.site || 'N/A',
          type: t.type || 'Vanilla',
          speed: t.speed || 'Normal'
        }))
      ];


      res.json(allTournaments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch session tournaments" });
    }
  });

  // Reset all tournaments for new session
  app.post("/api/grind-sessions/reset-tournaments", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const currentDayOfWeek = new Date().getDay();


      await storage.resetPlannedTournamentsForSession(user.userPlatformId, currentDayOfWeek);

      res.json({ message: "Tournaments reset successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to reset tournaments" });
    }
  });

  // Enhanced grind session creation endpoint com integração completa com Grade Planner
  app.post('/api/grind-sessions', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const { resetTournaments, replaceExisting, dayOfWeek, loadFromGradePlanner, ...sessionDataRaw } = req.body;


      // Parse the session date to get the day
      const newSessionDate = new Date(sessionDataRaw.date).toISOString().split('T')[0];

      // CRITICAL FIX: Check for ACTIVE sessions first - never delete active sessions!
      const existingSessions = await storage.getGrindSessions(userId);
      const activeSession = existingSessions.find(session => session.status === "active");

      // If there's an active session, return it instead of creating a new one
      if (activeSession) {
        return res.json(activeSession);
      }

      // Only check for completed sessions on the same day
      const existingSessionsToday = existingSessions.filter(session => {
        const sessionDate = new Date(session.date).toISOString().split('T')[0];
        return sessionDate === newSessionDate && session.status === "completed";
      });

      // Delete only COMPLETED sessions for the same day (never delete active sessions)
      if (existingSessionsToday.length > 0) {

        for (const existingSession of existingSessionsToday) {
          await storage.deleteGrindSession(existingSession.id);
        }

      }

      const sessionData = insertGrindSessionSchema.parse({ ...sessionDataRaw, userId });
      const session = await storage.createGrindSession(sessionData);

      // Integração completa com Grade Planner
      const currentDayOfWeek = dayOfWeek || new Date().getDay() || 7; // Use provided day or current day


      // If resetTournaments flag is set, reset all planned tournaments for today first
      if (resetTournaments) {
        await storage.resetPlannedTournamentsForSession(userId, currentDayOfWeek);
      }

      // Carregar torneios do Grade Planner se solicitado
      if (loadFromGradePlanner) {

        // Get planned tournaments for today from Grade Planner WITH PROFILE FILTERING
        const allPlannedTournaments = await storage.getPlannedTournaments(userId, currentDayOfWeek);

        // FILTRO POR PERFIL ATIVO: Buscar perfil ativo para este dia
        const activeProfileState = await db
          .select({
            activeProfile: profileStates.activeProfile
          })
          .from(profileStates)
          .where(
            and(
              eq(profileStates.userId, userId),
              eq(profileStates.dayOfWeek, currentDayOfWeek)
            )
          )
          .limit(1);

        const activeProfile = activeProfileState[0]?.activeProfile; // Can be 'A', 'B', or null

        // Se activeProfile for null, retornar lista vazia (ambos perfis inativos)
        let plannedTournaments: any[] = [];
        if (activeProfile !== null) {
          // Filtrar apenas torneios do perfil ativo
          plannedTournaments = allPlannedTournaments.filter(t => t.profile === activeProfile);
        }



        // Create session tournaments from planned tournaments
        let createdTournaments = 0;
        for (const planned of plannedTournaments) {
          try {
            // Create session tournament from planned tournament
            const sessionTournament = {
              userId: userId,
              sessionId: session.id,
              site: planned.site,
              name: planned.name,
              buyIn: String(parseFloat(planned.buyIn) || 0),
              guaranteed: planned.guaranteed ? String(parseFloat(planned.guaranteed)) : null,
              rebuys: 0,
              result: "0",
              bounty: "0",
              status: "upcoming",
              fromPlannedTournament: true,
              plannedTournamentId: planned.id,
              fieldSize: null,
              position: null,
              startTime: null,
              endTime: null,
              time: planned.time,
              type: planned.type,
              speed: planned.speed
            };

            await storage.createSessionTournament(sessionTournament as any);
            createdTournaments++;
          } catch (error) {
          }
        }


        // Return session with tournament count info
        res.json({
          ...session,
          linkedTournaments: createdTournaments,
          dayOfWeek: currentDayOfWeek
        });
      } else {
        // Legacy behavior for backward compatibility
        const plannedTournaments = await storage.getSessionTournamentsByDay(userId, currentDayOfWeek);

        // Update each planned tournament to link it to this session
        for (const tournament of plannedTournaments) {
          if (tournament.id.startsWith('planned-')) {
            const actualId = tournament.id.replace('planned-', '');
            await storage.updatePlannedTournament(actualId, { sessionId: session.id });
          }
        }

        res.json(session);
      }
    } catch (error) {
      res.status(400).json({ message: "Failed to create grind session" });
    }
  });

  app.put('/api/grind-sessions/:id', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const sessionData = insertGrindSessionSchema.partial().parse(req.body);
      const session = await storage.updateGrindSession(id, sessionData);
      res.json(session);
    } catch (error) {
      res.status(400).json({ message: "Failed to update grind session" });
    }
  });

  app.delete('/api/grind-sessions/:id', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.userPlatformId;


      // First verify the session belongs to the user
      const session = await storage.getGrindSession(id);
      if (!session || session.userId !== userId) {
        return res.status(404).json({ message: "Session not found" });
      }


      // Delete related data first
      try {
        // Delete planned tournaments associated with this session (reset them back to no sessionId)
        const plannedTournaments = await storage.getPlannedTournamentsBySession(userId, id);

        for (const tournament of plannedTournaments) {
          await storage.updatePlannedTournament(tournament.id, {
            sessionId: null,
            status: 'upcoming',
            result: '0',
            bounty: '0',
            position: null,
            rebuys: 0,
            startTime: undefined
          });
        }

        // Delete session tournaments
        const sessionTournaments = await storage.getSessionTournaments(userId, id);

        for (const tournament of sessionTournaments) {
          await storage.deleteSessionTournament(tournament.id);
        }

        // Delete break feedbacks
        const breakFeedbackList = await storage.getBreakFeedbacks(userId, id);

        for (const feedback of breakFeedbackList) {
          // Use the storage method instead of direct db access
          await storage.deleteBreakFeedback(feedback.id);
        }


      } catch (cleanupError) {
        // Continue with session deletion even if cleanup fails partially
      }

      // Finally delete the session
      await storage.deleteGrindSession(id);

      res.json({ message: "Grind session deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete grind session" });
    }
  });

  // Preparation log routes
  app.get('/api/preparation-logs', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const logs = await storage.getPreparationLogs(userId);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch preparation logs" });
    }
  });

  app.post('/api/preparation-logs', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const logData = insertPreparationLogSchema.parse({ ...req.body, userId });
      const log = await storage.createPreparationLog(logData);
      res.json(log);
    } catch (error) {
      res.status(400).json({ message: "Failed to create preparation log" });
    }
  });

  // Break feedback routes
  app.get('/api/break-feedbacks', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const sessionId = req.query.sessionId;
      const feedbacks = await storage.getBreakFeedbacks(userId, sessionId);
      res.json(feedbacks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch break feedbacks" });
    }
  });

  app.post('/api/break-feedbacks', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const clamped = clampBreakFeedback(req.body);

      // Ensure all required fields are present and properly typed
      const processedData = {
        userId,
        sessionId: req.body.sessionId,
        breakTime: new Date(req.body.breakTime || new Date().toISOString()),
        ...clamped,
        notes: req.body.notes || null,
      };

      const feedbackData = insertBreakFeedbackSchema.parse(processedData);
      const feedback = await storage.createBreakFeedback(feedbackData);
      res.json(feedback);
    } catch (error) {
      console.error('Break feedback creation failed:', error);
      res.status(400).json({
        message: "Failed to create break feedback"
      });
    }
  });

  // Session tournament routes
  app.get('/api/session-tournaments', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const sessionId = req.query.sessionId;


      const tournaments = await storage.getSessionTournaments(userId, sessionId);


      res.json(tournaments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch session tournaments" });
    }
  });

  app.get('/api/session-tournaments/by-day/:dayOfWeek', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const dayOfWeek = parseInt(req.params.dayOfWeek);


      const tournaments = await storage.getSessionTournamentsByDay(userId, dayOfWeek);


      res.json(tournaments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch session tournaments" });
    }
  });

  app.post('/api/session-tournaments', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;


      // Validate required fields
      if (!req.body.site || !req.body.buyIn) {
        return res.status(400).json({
          message: "Site and buyIn are required fields"
        });
      }

      // Clean and prepare data
      const cleanData = {
        userId,
        sessionId: req.body.sessionId,
        site: req.body.site,
        name: req.body.name || `${req.body.site} Tournament`,
        buyIn: req.body.buyIn,
        status: req.body.status || 'upcoming',
        rebuys: req.body.rebuys || 0,
        result: req.body.result || '0',
        bounty: req.body.bounty || '0',
        fieldSize: req.body.fieldSize ? parseInt(req.body.fieldSize) : null,
        position: req.body.position ? parseInt(req.body.position) : null,
        fromPlannedTournament: req.body.fromPlannedTournament || false,
        startTime: req.body.startTime || null,
        endTime: req.body.endTime || null,
        time: req.body.time,
        type: req.body.type,
        speed: req.body.speed,
        guaranteed: req.body.guaranteed
      };


      const tournamentData = insertSessionTournamentSchema.parse(cleanData);
      const tournament = await storage.createSessionTournament(tournamentData);

      res.json(tournament);
    } catch (error) {
      res.status(400).json({
        message: "Failed to create session tournament",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.put('/api/session-tournaments/:id', requireAuth, async (req: any, res) => {
    const { id } = req.params;
    try {

      // Convert string numbers to actual numbers for validation
      const processedData = { ...req.body };
      if (processedData.buyIn && typeof processedData.buyIn === 'string') {
        processedData.buyIn = parseFloat(processedData.buyIn);
      }
      if (processedData.position && typeof processedData.position === 'string') {
        processedData.position = parseInt(processedData.position);
      }
      if (processedData.fieldSize && typeof processedData.fieldSize === 'string') {
        processedData.fieldSize = parseInt(processedData.fieldSize);
      }
      if (processedData.rebuys !== undefined) {
        processedData.rebuys = parseInt(String(processedData.rebuys)) || 0;
      }
      if (processedData.result !== undefined) {
        // Handle comma decimal separator for result field
        const resultStr = String(processedData.result || '0').replace(',', '.');
        processedData.result = resultStr;
      }
      if (processedData.bounty !== undefined) {
        // Handle comma decimal separator for bounty field
        const bountyStr = String(processedData.bounty || '0').replace(',', '.');
        processedData.bounty = bountyStr;
      }

      // Convert timestamp strings to Date objects
      if (processedData.startTime && typeof processedData.startTime === 'string') {
        processedData.startTime = new Date(processedData.startTime);
      }
      if (processedData.endTime && typeof processedData.endTime === 'string') {
        processedData.endTime = new Date(processedData.endTime);
      }

      // Remove validation for updates to avoid conflicts
      delete processedData.id;
      delete processedData.userId;
      delete processedData.createdAt;
      delete processedData.updatedAt;


      const tournament = await storage.updateSessionTournament(id, processedData);


      res.json(tournament);
    } catch (error) {
      res.status(400).json({
        message: "Failed to update session tournament",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.delete('/api/session-tournaments/:id', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.deleteSessionTournament(id);
      res.json({ message: "Session tournament deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete session tournament" });
    }
  });

  // Weekly suggestions
  app.get('/api/session-tournaments/weekly-suggestions', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;

      // Buscar todos os torneios planejados do usuário
      const allPlannedTournaments = await storage.getPlannedTournaments(userId);

      // Se não houver torneios planejados, retornar array vazio
      if (!allPlannedTournaments || allPlannedTournaments.length === 0) {
        return res.json([]);
      }

      // Agrupar por combinação site+type+speed+buyIn para calcular frequência
      const suggestionMap = new Map();

      allPlannedTournaments.forEach(tournament => {
        const key = `${tournament.site}-${tournament.type || (tournament as any).category}-${tournament.speed}-${tournament.buyIn}`;

        if (suggestionMap.has(key)) {
          suggestionMap.get(key).frequency += 1;
        } else {
          suggestionMap.set(key, {
            site: tournament.site,
            type: tournament.type || (tournament as any).category || 'Vanilla',
            speed: tournament.speed || 'Normal',
            buyIn: tournament.buyIn,
            guaranteed: tournament.guaranteed,
            time: tournament.time,
            frequency: 1,
            sampleName: tournament.name
          });
        }
      });

      // Converter para array e ordenar por frequência
      const suggestions = Array.from(suggestionMap.values())
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 10); // Top 10 sugestões

      res.json(suggestions);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch weekly suggestions' });
    }
  });
}
