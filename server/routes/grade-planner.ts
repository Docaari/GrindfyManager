import type { Express } from "express";
import { ZodError } from "zod";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import {
  insertPlannedTournamentSchema,
} from "@shared/schema";
import { detectAddonReaFromName } from "@shared/addon-rea-detector";
import { TOURNAMENT_PRIMARY_TYPES, type TournamentPrimaryType } from "@shared/tournamentTypes";
import { selectorCache } from "../services/selectorCache";
import { zodErrorResponse } from "../lib/zodErrorResponse";

// Auto-detect Plus / ReA flags from name when caller did not explicitly set
// them. Mutates only fields that are undefined/null so explicit `false` from
// the form is respected. Default addOnCost to buyIn when allowsAddOn flips on
// without an explicit cost.
export function applyAddonReaAutoDetect(payload: any): void {
  if (!payload || typeof payload.name !== 'string' || !payload.name.trim()) return;
  const detected = detectAddonReaFromName(payload.name);
  if (detected.allowsAddOn && (payload.allowsAddOn === undefined || payload.allowsAddOn === null)) {
    payload.allowsAddOn = true;
    if ((payload.addOnCost === undefined || payload.addOnCost === null || payload.addOnCost === '') && payload.buyIn) {
      payload.addOnCost = String(payload.buyIn);
    }
  }
  if (detected.allowsReentry && (payload.allowsReentry === undefined || payload.allowsReentry === null)) {
    payload.allowsReentry = true;
  }
}

// =============================================================================
// Selector Logging (RF-07) — Q9 + Q10
// Aceita metadata.fromSelector=true em POST /api/planned-tournaments e:
//   1. Cria o planned_tournament normalmente
//   2. Loga em tournament_selector_logs com snapshot completo (signals)
//   3. Invalida selectorCache para o usuario (refletir alreadyInGrid=true)
// =============================================================================

export interface CreatePlannedTournamentRequest {
  userId: string;
  body: any;
}

export async function handleCreatePlannedTournament(req: CreatePlannedTournamentRequest): Promise<any> {
  if (!req.userId) {
    throw new Error("Unauthorized: missing userId");
  }
  const body = req.body || {};
  const metadata = body.metadata || null;

  // Strip metadata before passing to storage (it's not a column)
  const { metadata: _ignored, ...payload } = body;

  // Coerce common types if needed (mirror legacy behavior)
  if (typeof payload.dayOfWeek === "string") {
    payload.dayOfWeek = parseInt(payload.dayOfWeek, 10);
  }

  // MEDIUM #10: payload inclui libraryTemplateId quando o torneio veio da biblioteca
  // (necessario para alreadyInGrid funcionar). O spread preserva o campo automaticamente
  // pois insertPlannedTournamentSchema e criado a partir da tabela plannedTournaments.
  const created = await storage.createPlannedTournament({ ...payload, userId: req.userId });

  // RF-07: Log + invalidate caches when from Selector
  if (metadata && metadata.fromSelector === true) {
    // Async log (do not block response on log failure)
    Promise.resolve().then(async () => {
      try {
        await storage.insertSelectorLog({
          userId: req.userId,
          eventType: "add_to_grid",
          tournamentExternalId: payload.externalId ?? null,
          score: typeof metadata.selectorScore === "number" ? metadata.selectorScore : null,
          grade: metadata.selectorGrade ?? null,
          confidence: metadata.selectorConfidence ?? null,
          metadata: {
            signals: metadata.selectorSignals ?? null,
            filtersApplied: metadata.filtersApplied ?? null,
            bankrollOk: metadata.bankrollOk ?? null,
          },
        });
      } catch (err) {
        console.error('grade-planner: insertSelectorLog (add_to_grid) failed for user', req.userId, err);
      }
    });

    // Invalidate selector cache for this user (so alreadyInGrid reflects on next view)
    try {
      selectorCache.invalidateAllForUser(req.userId);
    } catch (err) {
      console.error('grade-planner: selectorCache.invalidateAllForUser failed for user', req.userId, err);
    }
  }

  return created;
}

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
      console.error("Failed to fetch planned tournaments:", error);
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
      console.error("Failed to fetch tournament suggestions:", error);
      res.status(500).json({ message: "Failed to fetch tournament suggestions" });
    }
  });

  app.post('/api/planned-tournaments', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;

      // Validate the payload (strip metadata before validation)
      const { metadata, ...rest } = req.body || {};
      // Sprint 1 RF-01 (backward compat): EditDialog as vezes envia gameType=""
      // (string vazia) quando user nao seleciona. Normalizamos para null antes
      // do schema para evitar 400 ruidoso. Mesmo principio para outros campos
      // que aceitam null.
      if (rest.gameType === '') rest.gameType = null;
      applyAddonReaAutoDetect(rest);
      const tournamentData = insertPlannedTournamentSchema.parse({ ...rest, userId });

      const tournament = await handleCreatePlannedTournament({
        userId,
        body: { ...tournamentData, metadata },
      });

      res.json(tournament);
    } catch (error) {
      // Sprint 1 RF-01 + RF-10: erros Zod estruturados (field, message, code).
      if (error instanceof ZodError) {
        const isProd = process.env.NODE_ENV === 'production';
        const out = zodErrorResponse(error, isProd);
        if (out) return res.status(out.status).json(out.body);
      }
      console.error("Failed to create planned tournament:", error);
      res.status(500).json({
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
          const p = parseInt(String(value), 10);
          updates[key] = (p >= 1 && p <= 3) ? p : 2; // Clamp to 1-3, default 2
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
        } else if (key === 'addOnCost') {
          // Decimal nullable
          updates[key] = value === null || value === undefined || value === '' ? null : String(value);
        } else if (key === 'startingStack' || key === 'maxPlayers' || key === 'blindLevelMinutes' || key === 'lateRegMinutes' || key === 'alertMinutesBefore' || key === 'maxReentries') {
          // Integer nullable fields from the advanced form
          if (value === null || value === undefined || value === '') {
            updates[key] = null;
          } else {
            const n = parseInt(String(value), 10);
            updates[key] = isNaN(n) ? null : n;
          }
        } else if (key === 'gameType') {
          updates[key] = value === 'NLH' || value === 'PLO' ? value : null;
        } else if (key === 'allowsAddOn' || key === 'allowsReentry') {
          updates[key] = Boolean(value);
        } else if (key === 'startTime' || key === 'endTime') {
          updates[key] = value === null || value === undefined ? null : (value ? new Date(String(value)) : null);
        } else if (key === 'type') {
          // Sprint 2026-05-07: gate type contra enum SSoT (5 valores ADR-031).
          const v = String(value || '');
          if ((TOURNAMENT_PRIMARY_TYPES as readonly string[]).includes(v)) {
            updates[key] = v as TournamentPrimaryType;
          } else {
            return res.status(400).json({ message: `type invalido: ${v}` });
          }
        } else if (key === 'site' || key === 'time' || key === 'speed' || key === 'name') {
          updates[key] = String(value || '');
        } else if (key === 'isFlight' || key === 'isLive') {
          updates[key] = Boolean(value);
        } else {
          updates[key] = value;
        }
      }

      // Auto-detect addon/reentry when caller updates name without
      // explicitly setting flags. Defaults addOnCost to buyIn (incoming or
      // existing row) when flag flips on without a cost.
      if (typeof updates.name === 'string' && updates.name.trim()) {
        const flagsAlreadySet = updates.allowsAddOn !== undefined || updates.allowsReentry !== undefined;
        if (!flagsAlreadySet) {
          const detected = detectAddonReaFromName(updates.name);
          if (detected.allowsAddOn || detected.allowsReentry) {
            const existing = await storage.getPlannedTournament(id);
            if (detected.allowsAddOn && existing?.allowsAddOn !== true) {
              updates.allowsAddOn = true;
              if (updates.addOnCost == null || updates.addOnCost === '') {
                const fallbackCost = updates.buyIn ?? existing?.buyIn;
                if (fallbackCost) updates.addOnCost = String(fallbackCost);
              }
            }
            if (detected.allowsReentry && existing?.allowsReentry !== true) {
              updates.allowsReentry = true;
            }
          }
        }
      }

      const tournament = await storage.updatePlannedTournament(id, updates);
      res.json(tournament);
    } catch (error) {
      if (error instanceof ZodError) {
        const isProd = process.env.NODE_ENV === 'production';
        const out = zodErrorResponse(error, isProd);
        if (out) return res.status(out.status).json(out.body);
      }
      console.error("Failed to update planned tournament:", error);
      res.status(500).json({
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
      console.error("Failed to delete planned tournament:", error);
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
      console.error("Failed to fetch coaching recommendations:", error);
      res.status(500).json({ message: "Failed to fetch coaching recommendations" });
    }
  });
}
