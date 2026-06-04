import type { Express } from "express";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import {
  tournamentLibrary,
  tournamentLibrarySettings,
  insertTournamentLibrarySchema,
  userSettings,
  sessionTournaments,
} from "@shared/schema";
import { validateGradeHours } from "@shared/grade-hours";
import { extractImportableTournaments } from "@shared/library-import";
import { processSupremaSync } from "@shared/library-suprema-sync";
import { calculateProfileComparison } from "@shared/profile-comparison";
import { z } from "zod";
import { nanoid } from "nanoid";
import { eq, and, isNull, isNotNull, lte, desc, inArray } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { playerBundleCache } from "../services/playerBundle";
import { computeTournamentScore } from "../scoring/tournamentScorer";
import {
  BUYIN_BUCKETS,
  FIELD_BUCKETS,
  SUPREMA_CATEGORY_MAP,
} from "../scoring/scoringConstants";
import { getTimeOfDayBucket } from "../scoring/timeOfDayBucket";
import type {
  ScoringInputTournament,
  TimeOfDayBucket,
  FieldBucket,
  SpeedBucket,
} from "../../shared/scoring";

// =============================================================================
// RF-05: Score na biblioteca (top 50 templates por totalPlayed)
// Decisao Q7: top 50 por totalPlayed via JOIN runtime
// =============================================================================

export interface TournamentLibraryRequest {
  userId: string;
}

const TOP_N = 50;
const SCORE_CACHE_TTL = 30 * 60 * 1000; // 30min
// Sprint 1 ressalva 2 fix (UX-2 2026-04-25): cache armazena tambem grade
// e rationale (computados pelo scorer no servidor). Antes, so armazenava
// score e o cliente inferia grade via thresholds locais — drift risk se
// thresholds do servidor mudassem. Server agora e fonte unica de verdade.
// RF-06 (TS-3): cache server-side de score+grade+rationale. Map por cacheKey
// (`userId:tpl.id:dow`). Em testes, a referencia do bundle muda a cada
// `beforeEach` (mockResolvedValue novo objeto), entao usamos WeakMap por
// bundle para evitar bleed cross-test (lesson #21). Em prod, bundle vem do
// mesmo cache 5min — multiplas requests no mesmo TTL reusam.
const scoreCacheByBundle = new WeakMap<
  object,
  Map<string, { score: number; grade: string; rationale: string; expiresAt: number }>
>();

function getScoreCache(bundle: any): Map<
  string,
  { score: number; grade: string; rationale: string; expiresAt: number }
> {
  if (!bundle || typeof bundle !== "object") {
    // fallback p/ chamadas sem bundle (improvavel) — Map novo, sem cache real.
    return new Map();
  }
  let m = scoreCacheByBundle.get(bundle);
  if (!m) {
    m = new Map();
    scoreCacheByBundle.set(bundle, m);
  }
  return m;
}

function bucketBuyIn(amount: number): string {
  for (const b of BUYIN_BUCKETS) {
    if (amount >= b.min && amount < b.max) return b.range;
  }
  return BUYIN_BUCKETS[BUYIN_BUCKETS.length - 1].range;
}

function bucketField(field: number | null | undefined): FieldBucket | null {
  if (field == null) return null;
  for (const b of FIELD_BUCKETS) {
    if (field >= b.min && field < b.max) return b.bucket as FieldBucket;
  }
  return null;
}

function mapCategory(input: string | null | undefined): string | null {
  if (!input) return null;
  return SUPREMA_CATEGORY_MAP[input] ?? null;
}

function mapSpeed(input: string | null | undefined): SpeedBucket {
  if (!input) return "Normal";
  if (input === "Normal" || input === "Turbo" || input === "Hyper") return input;
  return "Normal";
}

function safeTimeOfDayBucket(time: string): TimeOfDayBucket | null {
  try {
    return getTimeOfDayBucket(time);
  } catch {
    return null;
  }
}

/**
 * Sprint TS-3 RF-06 — alias exportado para testabilidade.
 * Mantem `handleTournamentLibrary` como nome original; testes consomem
 * via `buildLibraryPayload`.
 */
export async function buildLibraryPayload(
  req: TournamentLibraryRequest,
): Promise<any[]> {
  return handleTournamentLibrary(req);
}

export async function handleTournamentLibrary(req: TournamentLibraryRequest): Promise<any[]> {
  // CRITICAL #3: usar getTournamentLibraryEntries (entries reais da tabela tournament_library)
  // em vez de getTournamentLibrary (que agrupa o historico de tournaments para o dashboard).
  const list: any[] = await storage.getTournamentLibraryEntries(req.userId);
  if (!list || list.length === 0) return [];

  // Sort by totalPlayed DESC; top 50 receive selectorScore
  // Note: totalPlayed e calculado via JOIN runtime (Q7/A4) — quando ausente, default 0.
  const sorted = [...list].sort((a, b) => (b.totalPlayed ?? 0) - (a.totalPlayed ?? 0));
  const topIds = new Set(sorted.slice(0, TOP_N).map((t) => t.id));

  const bundle = await playerBundleCache.getOrLoad(req.userId, 180);

  return sorted.map((tpl) => {
    const isInTop = topIds.has(tpl.id);
    const hasDayOfWeek = tpl.dayOfWeek != null;
    let selectorScore: number | null = null;
    let selectorGrade: string | null = null;
    let selectorRationale: string | null = null;

    if (isInTop && hasDayOfWeek) {
      const cacheKey = `${req.userId}:${tpl.id}:${tpl.dayOfWeek}`;
      const now = Date.now();
      const scoreCache = getScoreCache(bundle);
      const hit = scoreCache.get(cacheKey);
      if (hit && hit.expiresAt > now) {
        selectorScore = hit.score;
        selectorGrade = hit.grade;
        selectorRationale = hit.rationale;
      } else {
        const buyInNum = typeof tpl.buyIn === "number" ? tpl.buyIn : parseFloat(tpl.buyIn ?? "0");
        const fieldSize = tpl.fieldSize ?? null;
        const sct: ScoringInputTournament = {
          id: tpl.id,
          source: "library",
          name: tpl.name ?? "",
          site: tpl.site ?? "",
          buyIn: buyInNum,
          buyInBucket: bucketBuyIn(buyInNum),
          category: mapCategory(tpl.type),
          speed: mapSpeed(tpl.speed),
          dayOfWeek: tpl.dayOfWeek,
          time: tpl.time ?? "00:00",
          timeOfDayBucket: safeTimeOfDayBucket(tpl.time ?? "00:00"),
          fieldBucket: bucketField(fieldSize),
          fieldSizeEstimate: fieldSize,
        };
        const result = computeTournamentScore(sct, bundle, { lookbackDays: 180 });
        selectorScore = result.score;
        selectorGrade = result.grade;
        selectorRationale = result.rationale;
        scoreCache.set(cacheKey, {
          score: selectorScore,
          grade: selectorGrade,
          rationale: selectorRationale,
          expiresAt: now + SCORE_CACHE_TTL,
        });
      }
    }

    return {
      ...tpl,
      selectorScore,
      // Sprint 1 ressalva 2 fix: server e fonte unica para grade/rationale,
      // eliminando drift entre thresholds servidor e inferencia client.
      selectorGrade,
      selectorRationale,
    };
  });
}

const supremaSyncRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  // Sprint 1 ressalva 5 fix (UX-2 2026-04-25): usar userPlatformId em vez de
  // req.user?.id. O resto do codebase rate-limita por userPlatformId (ex:
  // bankrollLimiter); manter consistencia evita bypass via shared NAT/IP.
  // Fallback para IP apenas se nao houver auth (defensivo, requireAuth ja
  // bloqueia antes).
  keyGenerator: (req: any) => req.user?.userPlatformId || req.ip,
  message: { message: "Limite de requisições atingido. Tente novamente em 1 minuto." },
});

/** Fetch all library tournaments (active + trashed) for dedup checks */
async function getAllLibraryForDedup(userId: string) {
  return db
    .select()
    .from(tournamentLibrary)
    .where(eq(tournamentLibrary.userId, userId));
}

export function registerTournamentLibraryRoutes(app: Express): void {

  // =========================================================================
  // GET /api/tournament-library — List active library tournaments + selector score (RF-05)
  //
  // HIGH #4: rota agora delega ao handler para enriquecer com selectorScore
  // nos top 50 templates por totalPlayed (decisao Q7).
  // =========================================================================
  app.get('/api/tournament-library', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const result = await handleTournamentLibrary({ userId });
      res.json(result);
    } catch (error) {
      console.error('GET /api/tournament-library failed:', error);
      res.status(500).json({ message: "Failed to load tournament library" });
    }
  });

  // =========================================================================
  // GET /api/tournament-library/trash — List trashed tournaments
  // =========================================================================
  app.get('/api/tournament-library/trash', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const tournaments = await db
        .select()
        .from(tournamentLibrary)
        .where(
          and(
            eq(tournamentLibrary.userId, userId),
            isNotNull(tournamentLibrary.deletedAt)
          )
        )
        .orderBy(desc(tournamentLibrary.deletedAt));

      res.json(tournaments);
    } catch (error) {
      console.error('Error fetching tournament library trash:', error);
      res.status(500).json({ message: "Failed to fetch library trash" });
    }
  });

  // =========================================================================
  // GET /api/tournament-library/import/grind-live/available — Importable tournaments
  // =========================================================================
  app.get('/api/tournament-library/import/grind-live/available', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;

      // Get last 7 grind sessions
      const sessions = await storage.getGrindSessions(userId);
      const recentSessions = sessions.slice(0, 7);

      if (recentSessions.length === 0) {
        return res.json([]);
      }

      // Get session tournaments from all recent sessions in a single query
      const sessionIds = recentSessions.map(s => s.id);
      const allSessionTournaments = await db
        .select()
        .from(sessionTournaments)
        .where(
          and(
            eq(sessionTournaments.userId, userId),
            inArray(sessionTournaments.sessionId, sessionIds)
          )
        );

      if (allSessionTournaments.length === 0) {
        return res.json([]);
      }

      // Get existing library (active + trashed) for dedup
      const existingLibrary = await getAllLibraryForDedup(userId);

      const importable = extractImportableTournaments(allSessionTournaments, existingLibrary);
      res.json(importable);
    } catch (error) {
      console.error('Error fetching importable tournaments:', error);
      res.status(500).json({ message: "Failed to fetch importable tournaments" });
    }
  });

  // =========================================================================
  // POST /api/tournament-library/import/grind-live — Import selected tournaments
  // =========================================================================
  app.post('/api/tournament-library/import/grind-live', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const { tournaments: tournamentsToImport } = req.body;

      if (!Array.isArray(tournamentsToImport) || tournamentsToImport.length === 0) {
        return res.status(400).json({ message: "Nenhum torneio selecionado para importar" });
      }

      // Wave B (Fase 3 perf): batch insert. Antes: for-await issued N RTTs;
      // agora valida cada item via Zod + single INSERT VALUES (..) RETURNING.
      const rowsToInsert = tournamentsToImport.map((t: any) => {
        const data = insertTournamentLibrarySchema.parse({
          userId,
          name: t.name,
          site: t.site,
          buyIn: t.buyIn,
          guaranteed: t.guaranteed || null,
          time: t.time || null,
          type: t.type || null,
          speed: t.speed || null,
          source: 'grind-live',
        });
        return { ...data, id: nanoid() };
      });

      const imported = await db
        .insert(tournamentLibrary)
        .values(rowsToInsert)
        .returning();

      res.json({ imported: imported.length, tournaments: imported });
    } catch (error) {
      console.error('Error importing grind-live tournaments:', error);
      res.status(500).json({ message: "Failed to import tournaments" });
    }
  });

  // =========================================================================
  // GET /api/tournament-library/settings — Get library settings
  // =========================================================================
  app.get('/api/tournament-library/settings', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const [settings] = await db
        .select()
        .from(tournamentLibrarySettings)
        .where(eq(tournamentLibrarySettings.userId, userId));

      if (!settings) {
        // Return defaults
        return res.json({
          autoImportSuprema: false,
          lastSupremaSync: null,
          lastSupremaSyncStatus: null,
        });
      }

      res.json(settings);
    } catch (error) {
      console.error('Error fetching library settings:', error);
      res.status(500).json({ message: "Failed to fetch library settings" });
    }
  });

  // =========================================================================
  // PUT /api/tournament-library/settings — Update library settings
  // =========================================================================
  app.put('/api/tournament-library/settings', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const { autoImportSuprema } = req.body;

      const [existing] = await db
        .select()
        .from(tournamentLibrarySettings)
        .where(eq(tournamentLibrarySettings.userId, userId));

      let result;
      if (existing) {
        [result] = await db
          .update(tournamentLibrarySettings)
          .set({ autoImportSuprema: autoImportSuprema ?? existing.autoImportSuprema })
          .where(eq(tournamentLibrarySettings.userId, userId))
          .returning();
      } else {
        [result] = await db
          .insert(tournamentLibrarySettings)
          .values({
            id: nanoid(),
            userId,
            autoImportSuprema: autoImportSuprema ?? false,
          })
          .returning();
      }

      res.json(result);
    } catch (error) {
      console.error('Error updating library settings:', error);
      res.status(500).json({ message: "Failed to update library settings" });
    }
  });

  // =========================================================================
  // POST /api/tournament-library/sync/suprema — Sync Suprema tournaments
  // =========================================================================
  app.post('/api/tournament-library/sync/suprema', requireAuth, supremaSyncRateLimit, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;

      // Fetch today's Suprema tournaments
      const today = new Date().toISOString().split('T')[0];
      const { fetchSupremaTournaments } = await import("../supremaService");
      const supremaTournaments = await fetchSupremaTournaments(today);

      // Get existing library (active + trashed) for dedup
      const existingLibrary = await getAllLibraryForDedup(userId);

      // Process sync
      const newTournaments = processSupremaSync(supremaTournaments, existingLibrary);

      // Insert new tournaments
      const inserted = [];
      for (const t of newTournaments) {
        const [created] = await db
          .insert(tournamentLibrary)
          .values({
            id: nanoid(),
            userId,
            name: t.name,
            site: t.site,
            buyIn: t.buyIn,
            guaranteed: t.guaranteed,
            time: t.time,
            type: t.type,
            speed: t.speed,
            source: t.source,
            externalId: t.externalId,
          })
          .returning();
        inserted.push(created);
      }

      // Update settings with sync status
      const [existingSettings] = await db
        .select()
        .from(tournamentLibrarySettings)
        .where(eq(tournamentLibrarySettings.userId, userId));

      if (existingSettings) {
        await db
          .update(tournamentLibrarySettings)
          .set({
            lastSupremaSync: new Date(),
            lastSupremaSyncStatus: 'success',
          })
          .where(eq(tournamentLibrarySettings.userId, userId));
      } else {
        await db
          .insert(tournamentLibrarySettings)
          .values({
            id: nanoid(),
            userId,
            lastSupremaSync: new Date(),
            lastSupremaSyncStatus: 'success',
          });
      }

      res.json({ synced: inserted.length, tournaments: inserted });
    } catch (error: any) {
      console.error('Error syncing Suprema tournaments:', error);

      // Update settings with error status
      const userId = req.user.userPlatformId;
      try {
        const [existingSettings] = await db
          .select()
          .from(tournamentLibrarySettings)
          .where(eq(tournamentLibrarySettings.userId, userId));

        if (existingSettings) {
          await db
            .update(tournamentLibrarySettings)
            .set({
              lastSupremaSync: new Date(),
              lastSupremaSyncStatus: 'error',
            })
            .where(eq(tournamentLibrarySettings.userId, userId));
        }
      } catch {
        // Ignore settings update error
      }

      res.status(502).json({ message: error.message || "Erro ao sincronizar com Suprema Poker" });
    }
  });

  // =========================================================================
  // POST /api/tournament-library — Add tournament manually
  // =========================================================================
  app.post('/api/tournament-library', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const data = insertTournamentLibrarySchema.parse({ ...req.body, userId });

      const [created] = await db
        .insert(tournamentLibrary)
        .values({ ...data, id: nanoid() })
        .returning();

      res.json(created);
    } catch (error) {
      console.error('Error creating library tournament:', error);
      res.status(400).json({
        message: "Failed to create library tournament",
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // =========================================================================
  // PUT /api/tournament-library/:id — Edit tournament
  // =========================================================================
  app.put('/api/tournament-library/:id', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.userPlatformId;

      // Verify ownership
      const [existing] = await db
        .select()
        .from(tournamentLibrary)
        .where(
          and(
            eq(tournamentLibrary.id, id),
            eq(tournamentLibrary.userId, userId)
          )
        );

      if (!existing) {
        return res.status(404).json({ message: "Tournament not found" });
      }

      const updates: any = {};
      for (const [key, value] of Object.entries(req.body)) {
        if (['name', 'site', 'time', 'type', 'speed'].includes(key)) {
          updates[key] = String(value || '');
        } else if (['buyIn', 'guaranteed'].includes(key)) {
          updates[key] = String(value || '0');
        } else if (key === 'fieldSize') {
          updates[key] = value === null || value === undefined ? null : parseInt(String(value));
        } else if (key === 'registrationTime') {
          updates[key] = value === null || value === undefined || value === '' ? null : String(value);
        }
      }

      const [updated] = await db
        .update(tournamentLibrary)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(tournamentLibrary.id, id), eq(tournamentLibrary.userId, userId)))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error('Error updating library tournament:', error);
      res.status(400).json({
        message: "Failed to update library tournament",
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // =========================================================================
  // PATCH /api/tournament-library/:id/trash — Move to trash
  // =========================================================================
  app.patch('/api/tournament-library/:id/trash', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.userPlatformId;

      // Verify ownership
      const [existing] = await db
        .select()
        .from(tournamentLibrary)
        .where(
          and(
            eq(tournamentLibrary.id, id),
            eq(tournamentLibrary.userId, userId)
          )
        );

      if (!existing) {
        return res.status(404).json({ message: "Tournament not found" });
      }

      const [updated] = await db
        .update(tournamentLibrary)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(tournamentLibrary.id, id), eq(tournamentLibrary.userId, userId)))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error('Error trashing library tournament:', error);
      res.status(500).json({ message: "Failed to move tournament to trash" });
    }
  });

  // =========================================================================
  // POST /api/tournament-library/:id/restore — Restore from trash
  // =========================================================================
  app.post('/api/tournament-library/:id/restore', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.userPlatformId;

      // Verify ownership
      const [existing] = await db
        .select()
        .from(tournamentLibrary)
        .where(
          and(
            eq(tournamentLibrary.id, id),
            eq(tournamentLibrary.userId, userId)
          )
        );

      if (!existing) {
        return res.status(404).json({ message: "Tournament not found" });
      }

      const [updated] = await db
        .update(tournamentLibrary)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(and(eq(tournamentLibrary.id, id), eq(tournamentLibrary.userId, userId)))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error('Error restoring library tournament:', error);
      res.status(500).json({ message: "Failed to restore tournament" });
    }
  });

  // =========================================================================
  // DELETE /api/tournament-library/:id — Permanent delete
  // =========================================================================
  app.delete('/api/tournament-library/:id', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.userPlatformId;

      // Verify ownership
      const [existing] = await db
        .select()
        .from(tournamentLibrary)
        .where(
          and(
            eq(tournamentLibrary.id, id),
            eq(tournamentLibrary.userId, userId)
          )
        );

      if (!existing) {
        return res.status(404).json({ message: "Tournament not found" });
      }

      if (!existing.deletedAt) {
        return res.status(400).json({ message: "Torneio deve estar na lixeira para exclusão permanente" });
      }

      await db
        .delete(tournamentLibrary)
        .where(and(eq(tournamentLibrary.id, id), eq(tournamentLibrary.userId, userId)));

      res.json({ message: "Tournament deleted permanently", id });
    } catch (error) {
      console.error('Error deleting library tournament:', error);
      res.status(500).json({ message: "Failed to delete tournament" });
    }
  });

  // =========================================================================
  // Grade Planner — Hours configuration
  // =========================================================================

  // GET /api/grade-planner/hours — Get user's grade hour range
  app.get('/api/grade-planner/hours', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const settings = await storage.getUserSettings(userId);

      res.json({
        gradeStartHour: settings?.gradeStartHour ?? 12,
        gradeEndHour: settings?.gradeEndHour ?? 3,
      });
    } catch (error) {
      console.error('Error fetching grade hours:', error);
      res.status(500).json({ message: "Failed to fetch grade hours" });
    }
  });

  // PUT /api/grade-planner/hours — Update grade hour range
  app.put('/api/grade-planner/hours', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const { gradeStartHour, gradeEndHour } = req.body;

      // Validate types
      const startHour = z.number().int().min(0).max(23).parse(gradeStartHour);
      const endHour = z.number().int().min(0).max(23).parse(gradeEndHour);

      // Validate range
      const validation = validateGradeHours(startHour, endHour);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.error });
      }

      const result = await storage.upsertUserSettings({
        userId,
        gradeStartHour: startHour,
        gradeEndHour: endHour,
      });

      res.json({
        gradeStartHour: result.gradeStartHour,
        gradeEndHour: result.gradeEndHour,
      });
    } catch (error) {
      console.error('Error updating grade hours:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid hour values" });
      }
      res.status(500).json({ message: "Failed to update grade hours" });
    }
  });

  // GET /api/grade-planner/profile-comparison — Compare profiles A vs B vs C
  app.get('/api/grade-planner/profile-comparison', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;

      const tournaments = await storage.getPlannedTournaments(userId);

      const { profileStates } = await import("@shared/schema");
      const rawStates = await db
        .select({
          dayOfWeek: profileStates.dayOfWeek,
          activeProfile: profileStates.activeProfile,
        })
        .from(profileStates)
        .where(eq(profileStates.userId, userId));

      // Filter out null profiles and cast to expected type
      const states = rawStates
        .filter((s): s is { dayOfWeek: number; activeProfile: string } => s.activeProfile !== null);

      const comparison = calculateProfileComparison(tournaments, states);
      res.json(comparison);
    } catch (error) {
      console.error('Error calculating profile comparison:', error);
      res.status(500).json({ message: "Failed to calculate profile comparison" });
    }
  });
}
