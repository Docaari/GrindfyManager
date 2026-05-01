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
  preparationLogs,
  breakFeedbacks,
} from "@shared/schema";
import { eq, and, desc, gte, sql, count, avg } from "drizzle-orm";
import { clampBreakFeedback } from "@shared/utils";
import { ReconcileWalletsBodySchema } from "@shared/reconcile-schemas";
import { runReconciliation } from "../services/sessionReconciliation";
import { walletLimiter } from "./wallets";
import { mapSiteToWallet, buildSuggestedBindings } from "@shared/wallet-reconciliation";

// Track users who already had their duplicate sessions cleaned up (resets on server restart)
const cleanedUpUsers = new Set<string>();

// =============================================================================
// Sprint Bankroll-3 RF-6 — handlers extraidos para teste unitario
// =============================================================================

function userIdOfReq(req: any): string | null {
  return req?.user?.userPlatformId ?? null;
}

/**
 * POST /api/grind-sessions com gate stop_lock_until.
 * Mantemos o handler legado registrado em registerGrindSessionRoutes para nao
 * quebrar fluxos existentes; este handler exportado eh um wrapper minimo
 * usado pelo route e pelos tests para validar o gate RF-6.
 */
export async function handleCreateGrindSession(req: any, res: any): Promise<void> {
  const userId = userIdOfReq(req);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  // Stop-lock gate (RF-6) — rodar ANTES de qualquer DB write.
  try {
    const { stopService } = await import("../services/stopService");
    await stopService.assertNotStopLocked(userId);
  } catch (err: any) {
    if (err?.code === "STOP_LOCKED" || err?.httpStatus === 423) {
      res.status(423).json({
        code: "STOP_LOCKED",
        message: err?.message ?? "Sessao bloqueada por stop-loss",
        lockedUntil: err?.lockedUntil ?? err?.body?.lockedUntil,
        remainingMs: err?.remainingMs ?? err?.body?.remainingMs,
        reason: err?.body?.reason ?? "stop_loss",
      });
      return;
    }
    console.error("[handleCreateGrindSession] assertNotStopLocked unexpected error:", err);
  }
  try {
    const session = await storage.createGrindSession({
      userId,
      ...((req.body ?? {}) as any),
    } as any);
    res.status(201).json(session);
  } catch (err: any) {
    console.error("[handleCreateGrindSession] failed:", err);
    res.status(400).json({ message: err?.message ?? "Failed to create grind session" });
  }
}

/**
 * PUT /api/grind-sessions/:id com avaliacao de stops quando status=completed.
 */
export async function handleUpdateGrindSession(req: any, res: any): Promise<void> {
  const userId = userIdOfReq(req);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const id = req?.params?.id;
  if (!id) {
    res.status(400).json({ message: "id obrigatorio" });
    return;
  }
  try {
    const updated = await storage.updateGrindSession(id, (req.body ?? {}) as any);
    let extra: { stopReached?: string | null; lockedUntil?: string } = {};
    if (req.body?.status === "completed") {
      try {
        const { stopService } = await import("../services/stopService");
        const result = await stopService.evaluateStops(userId, id);
        if (result?.stopReached) {
          extra.stopReached = result.stopReached;
          if (result.lockedUntil) extra.lockedUntil = result.lockedUntil;
        }
      } catch (err: any) {
        console.error("[handleUpdateGrindSession] evaluateStops failed:", err?.message);
      }
    }
    res.status(200).json({ ...(updated as any), ...extra });
  } catch (err: any) {
    console.error("[handleUpdateGrindSession] failed:", err);
    res.status(400).json({ message: err?.message ?? "Failed to update grind session" });
  }
}

// =============================================================================
// ADR-040 — Reconciliacao de banca ao fim da sessao
// =============================================================================

/**
 * GET /api/grind-sessions/:id/reconcilable-wallets
 *
 * V2 (RF-04): wallets DERIVADAS de session_tournaments + mapSiteToWallet.
 * Idempotencia primaria via session_wallet_snapshots (P5/ADR-046);
 * fallback secundario via wallet_transactions auto_session marker.
 *
 * Resposta 200: { sessionId, alreadyReconciled, wallets, orphanContribution }
 *  Quando alreadyReconciled=true, wallets=[] e orphanContribution=[].
 */
export async function handleGetReconcilableWallets(req: any, res: any): Promise<void> {
  const user = req.user;
  if (!user || !user.userPlatformId) {
    res.status(401).json({ message: "Nao autenticado" });
    return;
  }

  const sessionId = req.params.id;
  try {
    const session = await storage.getGrindSession(sessionId);
    if (!session || session.userId !== user.userPlatformId) {
      res.status(404).json({ message: "Sessao nao encontrada" });
      return;
    }

    // V2 (RF-04, P5/ADR-046): snapshot eh fonte PRIMARIA de idempotencia.
    const snapshotMarker = await (storage as any).findSessionWalletSnapshot?.(
      sessionId,
      user.userPlatformId,
    );
    if (snapshotMarker) {
      res.status(200).json({
        sessionId,
        alreadyReconciled: true,
        wallets: [],
        orphanContribution: [],
        playedPlatforms: [],
        missingPlatforms: [],
        suggestedBindings: [],
      });
      return;
    }

    // Fallback secundario: wallet_transactions auto_session marker.
    const marker = await storage.findReconciliationMarker(sessionId, user.userPlatformId);
    if ((marker?.count ?? 0) > 0) {
      res.status(200).json({
        sessionId,
        alreadyReconciled: true,
        wallets: [],
        orphanContribution: [],
        playedPlatforms: [],
        missingPlatforms: [],
        suggestedBindings: [],
      });
      return;
    }

    const includeAll = String(req.query?.includeAll ?? "").toLowerCase() === "true";
    const result = await storage.listReconcilableWallets(sessionId, user.userPlatformId, {
      includeAll,
    });

    // V2: storage retorna { wallets, orphanContribution } OU array (compat v1).
    let wallets: any[] = [];
    let orphanContribution: any[] = [];
    if (Array.isArray(result)) {
      wallets = result;
    } else if (result && typeof result === "object") {
      wallets = Array.isArray(result.wallets) ? result.wallets : [];
      orphanContribution = Array.isArray(result.orphanContribution)
        ? result.orphanContribution
        : [];
    }

    // Sprint B2 (M3): playedPlatforms + missingPlatforms. Skip compute quando
    // bankrollManagementEnabled=false — economiza 2 queries no path session-end
    // pra usuarios com setting off.
    let playedPlatforms: string[] = [];
    let missingPlatforms: string[] = [];
    try {
      const settings = await storage.getUserSettings(user.userPlatformId);
      const bankrollManagementEnabled =
        settings && typeof (settings as any).bankrollManagementEnabled === "boolean"
          ? (settings as any).bankrollManagementEnabled
          : true;

      if (bankrollManagementEnabled) {
        const [sessionTournaments, userWallets] = await Promise.all([
          storage.listSessionTournaments(sessionId, user.userPlatformId),
          storage.listWalletsByUser(user.userPlatformId, { includeArchived: false }),
        ]);
        const playedSet = new Set<string>();
        for (const st of sessionTournaments ?? []) {
          const outcome = (st as any).outcome;
          const status = (st as any).status;
          // ADR-048: torneio "jogado" = outcome != 'not_played' OU status terminal.
          // outcome=null + status=registered/upcoming nao conta (ainda nao rolou).
          const hasOutcome = outcome != null && outcome !== "not_played";
          const finishedByStatus =
            (status === "finished" || status === "completed") && outcome !== "not_played";
          if (!hasOutcome && !finishedByStatus) continue;
          const site = (st as any).site;
          if (typeof site === "string" && site.length > 0) playedSet.add(site);
        }
        playedPlatforms = Array.from(playedSet);

        if (playedPlatforms.length > 0) {
          const activeWallets = (userWallets ?? []).map((w: any) => ({
            id: w.id,
            platform: w.platform,
            nativeCurrency: w.nativeCurrency,
            balance: Number(w.balance ?? 0),
            status: w.status ?? "active",
          }));
          for (const site of playedPlatforms) {
            const matched = mapSiteToWallet(site, activeWallets);
            if (matched.length === 0) missingPlatforms.push(site);
          }
        }
      }
    } catch (err: any) {
      console.error("playedPlatforms/missingPlatforms compute failed:", err);
      playedPlatforms = [];
      missingPlatforms = [];
    }

    // Sprint Bankroll-3 RF-3: suggestedBindings (auto-bind torneio -> wallet).
    const suggestedBindings = buildSuggestedBindings(missingPlatforms);

    res.status(200).json({
      sessionId,
      alreadyReconciled: false,
      wallets,
      orphanContribution,
      playedPlatforms,
      missingPlatforms,
      suggestedBindings,
    });
  } catch (error: any) {
    console.error("GET /api/grind-sessions/:id/reconcilable-wallets failed:", error);
    res.status(500).json({ message: "Erro ao listar carteiras elegiveis" });
  }
}

/**
 * GET /api/grind-sessions/:id/wallet-snapshots
 *
 * V2 (RF-09): retorna snapshots persistidos da sessao para a aba "Banca"
 * do edit modal de SessionHistory.
 */
export async function handleGetSessionWalletSnapshots(
  req: any,
  res: any,
): Promise<void> {
  const user = req.user;
  if (!user || !user.userPlatformId) {
    res.status(401).json({ message: "Nao autenticado" });
    return;
  }

  const sessionId = req.params.id;
  try {
    const session = await storage.getGrindSession(sessionId);
    if (!session || session.userId !== user.userPlatformId) {
      res.status(404).json({ message: "Sessao nao encontrada" });
      return;
    }

    const snapshots = await (storage as any).listSessionWalletSnapshots(
      sessionId,
      user.userPlatformId,
    );

    res.status(200).json({
      sessionId,
      snapshots: Array.isArray(snapshots) ? snapshots : [],
    });
  } catch (error: any) {
    console.error("GET /api/grind-sessions/:id/wallet-snapshots failed:", error);
    res.status(500).json({ message: "Erro ao listar snapshots da sessao" });
  }
}

/**
 * mapFailureCodeToStatus — HIGH-3 reviewer fix.
 *
 * Mapeia o `code` de `ReconciliationFailure` para HTTP status conforme spec
 * (Docs/specs/session-end-wallet-reconciliation.md, secao "API Delta").
 *
 *  - wallet_archived            -> 422 (semantic invalid: estado da wallet impede)
 *  - out_of_order               -> 422 (semantic invalid: ordem das tx invalida)
 *  - invalid_reported_balance   -> 422 (NaN/Infinity)
 *  - balance_mismatch           -> 409 (conflito de concurrency)
 *  - already_reconciled         -> 409 (idempotencia, conflito)
 *  - wallet_not_found           -> 404 (mascarado por seguranca: cross-user / inexistente)
 *  - duplicate_wallet           -> 400 (request invalido)
 *  - missing_expected_balance   -> 400 (request invalido)
 *  - default                    -> 500 (defesa em profundidade)
 */
function mapFailureCodeToStatus(code: string): number {
  switch (code) {
    case "wallet_archived":
    case "out_of_order":
    case "invalid_reported_balance":
      return 422;
    case "balance_mismatch":
    case "already_reconciled":
      return 409;
    case "wallet_not_found":
      return 404;
    case "duplicate_wallet":
    case "missing_expected_balance":
      return 400;
    default:
      console.error("[reconcile] unknown failure code", { code });
      return 500;
  }
}

/**
 * POST /api/grind-sessions/:id/reconcile-wallets
 *
 * Aplica batch de ajustes em loop fail-fast (RF-04).
 *  - Valida body via ReconcileWalletsBodySchema (RF-07).
 *  - Rejeita walletId duplicado (400 duplicate_wallet).
 *  - Verifica ownership da sessao (404).
 *  - Chama runReconciliation; trata respostas:
 *      alreadyReconciled -> 409 already_reconciled (RF-08)
 *      failed.code mapeado por mapFailureCodeToStatus (HIGH-3).
 */
export async function handlePostReconcileWallets(req: any, res: any): Promise<void> {
  const user = req.user;
  if (!user || !user.userPlatformId) {
    res.status(401).json({ message: "Nao autenticado" });
    return;
  }

  const sessionId = req.params.id;
  try {
    const session = await storage.getGrindSession(sessionId);
    if (!session || session.userId !== user.userPlatformId) {
      res.status(404).json({ message: "Sessao nao encontrada" });
      return;
    }

    // Validacao Zod (RF-07)
    const parsed = ReconcileWalletsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      res.status(400).json({
        message: firstIssue?.message ?? "Body invalido",
        code: "invalid_body",
      });
      return;
    }
    const adjustments = parsed.data.adjustments;
    const skipReconciliation = !!parsed.data.skipReconciliation;

    // HIGH-04 v2: adjustments=[] sem skipReconciliation eh erro semantico
    // (mesmo que o Zod aceite — RF-9 separou validacao schema vs. semantica de rota).
    if (adjustments.length === 0 && !skipReconciliation) {
      res.status(400).json({
        message: "adjustments vazio so eh permitido quando skipReconciliation=true",
        code: "empty_adjustments_without_skip",
      });
      return;
    }

    // expectedPreviousBalance ausente -> 400 (RF-06)
    for (const adj of adjustments) {
      if (
        typeof adj.expectedPreviousBalance !== "number" ||
        !Number.isFinite(adj.expectedPreviousBalance)
      ) {
        res.status(400).json({
          message: "expectedPreviousBalance ausente ou invalido",
          code: "missing_expected_balance",
          walletId: adj.walletId,
        });
        return;
      }
    }

    // Duplicate wallet check (RF-07)
    const seen = new Set<string>();
    for (const adj of adjustments) {
      if (seen.has(adj.walletId)) {
        res.status(400).json({
          message: "Mesma carteira aparece duas vezes",
          code: "duplicate_wallet",
          walletId: adj.walletId,
        });
        return;
      }
      seen.add(adj.walletId);
    }

    const result = await runReconciliation(
      user.userPlatformId,
      sessionId,
      adjustments,
      { skipReconciliation },
    );

    // Idempotencia (RF-08)
    if (result.alreadyReconciled) {
      res.status(409).json({
        message: "Esta sessao ja foi reconciliada anteriormente",
        code: "already_reconciled",
        existingCount: result.existingCount ?? 0,
      });
      return;
    }

    // Falha mid-batch (RF-04) — HIGH-3: mapeamento explicito por code
    if (result.failed) {
      const code = result.failed.code;
      const status = mapFailureCodeToStatus(code);
      const payload: any = {
        message: result.failed.message ?? code,
        code,
        txCreated: result.created,
        skipped: result.skipped,
        failedAt: {
          walletId: result.failed.walletId,
        },
      };
      if (typeof result.failed.currentBalance === "number") {
        payload.failedAt.currentBalance = result.failed.currentBalance;
      }
      res.status(status).json(payload);
      return;
    }

    // 200 OK — V2 (RF-06, RF-07): inclui snapshotsCreated.
    const responseBody: any = {
      txCreated: result.created,
      created: result.created,
      skipped: result.skipped,
      snapshotsCreated: result.snapshotsCreated ?? 0,
    };
    if (result.skippedByUser) {
      responseBody.skippedByUser = true;
    }
    res.status(200).json(responseBody);
  } catch (error: any) {
    console.error("POST /api/grind-sessions/:id/reconcile-wallets failed:", error);
    res.status(500).json({
      message: error?.message ?? "Erro ao reconciliar carteiras",
      code: "internal_error",
    });
  }
}

export function registerGrindSessionRoutes(app: Express): void {
  // ADR-040: Reconciliacao de banca ao fim da sessao
  app.get(
    '/api/grind-sessions/:id/reconcilable-wallets',
    requireAuth,
    walletLimiter,
    (req: any, res) => handleGetReconcilableWallets(req, res),
  );
  app.post(
    '/api/grind-sessions/:id/reconcile-wallets',
    requireAuth,
    walletLimiter,
    (req: any, res) => handlePostReconcileWallets(req, res),
  );
  app.get(
    '/api/grind-sessions/:id/wallet-snapshots',
    requireAuth,
    walletLimiter,
    (req: any, res) => handleGetSessionWalletSnapshots(req, res),
  );

  // Grind session routes
  app.get('/api/grind-sessions', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const sessions = await storage.getGrindSessions(userId);

      // CLEANUP: Only check for duplicates once per user per server lifecycle
      if (!cleanedUpUsers.has(userId)) {
        const activeSessions = sessions.filter(s => s.status === "active");
        if (activeSessions.length > 1) {
          const mostRecentActive = activeSessions.sort((a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
          )[0];

          for (const session of activeSessions) {
            if (session.id !== mostRecentActive.id) {
              await storage.updateGrindSession(session.id, { status: "completed" });
            }
          }
          cleanedUpUsers.add(userId);
          const updatedSessions = await storage.getGrindSessions(userId);
          return res.json(updatedSessions);
        }
        cleanedUpUsers.add(userId);
      }

      res.json(sessions);
    } catch (error) {
      console.error("Failed to fetch grind sessions:", error);
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
      console.error("Failed to fetch session history:", error);
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
      console.error("Failed to fetch session tournaments:", error);
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
      console.error("Failed to reset tournaments:", error);
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

      const existingSessions = await storage.getGrindSessions(userId);
      const activeSession = existingSessions.find(session => session.status === "active");

      // If there's an active session and replaceExisting is not set, return the existing one
      if (activeSession && !replaceExisting) {
        return res.json(activeSession);
      }

      // If replaceExisting is set, complete the active session before creating a new one
      if (activeSession && replaceExisting) {
        await storage.updateGrindSession(activeSession.id, { status: "completed", endTime: new Date() });
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
              speed: planned.speed,
              // ADR-014: propaga add-on/re-entry do plano para a live session
              // para que TournamentCard consiga exibir o botao "+ Add-on"
              // sem que o user precise editar manualmente.
              allowsAddOn: planned.allowsAddOn ?? false,
              addOnCost: planned.addOnCost ?? null,
              allowsReentry: planned.allowsReentry ?? false,
              maxReentries: planned.maxReentries ?? null,
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
      console.error("Failed to create grind session:", error);
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
      console.error("Failed to update grind session:", error);
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
      console.error("Failed to delete grind session:", error);
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
      console.error("Failed to fetch preparation logs:", error);
      res.status(500).json({ message: "Failed to fetch preparation logs" });
    }
  });

  // FP-09 RF-06: Get latest warm-up (last 4 hours, warmupCompleted=true)
  app.get('/api/preparation-logs/latest', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

      // Single query: 1 row, filtered in DB
      const [log] = await db.select().from(preparationLogs)
        .where(and(
          eq(preparationLogs.userId, userId),
          eq(preparationLogs.warmupCompleted, true),
          gte(preparationLogs.createdAt, fourHoursAgo)
        ))
        .orderBy(desc(preparationLogs.createdAt))
        .limit(1);

      res.json(log ?? null);
    } catch (error) {
      console.error("Failed to fetch latest preparation log:", error);
      res.status(500).json({ message: "Failed to fetch latest preparation log" });
    }
  });

  app.post('/api/preparation-logs', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const logData = insertPreparationLogSchema.parse({ ...req.body, userId });
      const log = await storage.createPreparationLog(logData);
      res.json(log);
    } catch (error) {
      console.error("Failed to create preparation log:", error);
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
      console.error("Failed to fetch break feedbacks:", error);
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
      console.error("Failed to fetch session tournaments:", error);
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
      console.error("Failed to fetch session tournaments:", error);
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

      // Clean and prepare data (includes copy-on-promote fields for ADR-014)
      const cleanData: any = {
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
        guaranteed: req.body.guaranteed,
        // Add-on + Re-entry (ADR-014) — copy-on-promote from planned tournaments
        allowsAddOn: req.body.allowsAddOn ?? false,
        addOnCost: req.body.addOnCost ?? null,
        addOnTaken: req.body.addOnTaken ?? false,
        allowsReentry: req.body.allowsReentry ?? false,
        maxReentries: req.body.maxReentries ?? null,
        reentries: req.body.reentries ?? 0,
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
      // Add-on + Re-entry (ADR-014) — coerce reentries/addOnTaken before validation
      if (processedData.reentries !== undefined) {
        processedData.reentries = parseInt(String(processedData.reentries)) || 0;
      }
      if (processedData.addOnTaken !== undefined) {
        processedData.addOnTaken = Boolean(processedData.addOnTaken);
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

      // ADR-014 merge-before-validate: cross-refinements on partial updates
      // require merging with the existing row so that fields not sent in the
      // body (e.g. allowsAddOn when only addOnTaken is toggled) are still
      // present when Zod validates.
      const touchesAddonReaFields =
        processedData.addOnTaken !== undefined ||
        processedData.reentries !== undefined ||
        processedData.allowsAddOn !== undefined ||
        processedData.allowsReentry !== undefined ||
        processedData.maxReentries !== undefined ||
        processedData.addOnCost !== undefined ||
        processedData.status !== undefined;

      if (touchesAddonReaFields) {
        const existing = await storage.getSessionTournamentById(id);
        if (!existing) {
          return res.status(404).json({ message: "Session tournament not found" });
        }
        const merged = { ...existing, ...processedData };
        const parsed = insertSessionTournamentSchema.safeParse(merged);
        if (!parsed.success) {
          const firstIssue = parsed.error.issues[0];
          return res.status(400).json({
            message: firstIssue?.message || "Invalid session tournament payload",
            field: firstIssue?.path?.join('.') || null,
          });
        }

        // Extra guard: transition finished -> registered demands allowsReentry
        // and reentries must have incremented (covers reentries=N+1 + status flip).
        if (
          existing.status === 'finished' &&
          processedData.status === 'registered' &&
          typeof processedData.reentries === 'number' &&
          processedData.reentries > (existing.reentries ?? 0)
        ) {
          if (!existing.allowsReentry) {
            return res.status(400).json({ message: "Torneio nao permite re-entrada" });
          }
          const max = existing.maxReentries;
          if (max != null && processedData.reentries > max) {
            return res.status(400).json({
              message: `Excede limite de re-entradas (max ${max})`,
            });
          }
        }
      }

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

  // GET /api/mental-averages — Historical mental state averages (FP-14)
  app.get('/api/mental-averages', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;

      // Try break_feedbacks first (more granular data)
      const bfCount = await db
        .select({ count: count() })
        .from(breakFeedbacks)
        .where(eq(breakFeedbacks.userId, userId));

      const totalBF = bfCount[0]?.count ?? 0;

      if (totalBF >= 3) {
        const bfAvg = await db
          .select({
            energia: avg(breakFeedbacks.energia),
            foco: avg(breakFeedbacks.foco),
            confianca: avg(breakFeedbacks.confianca),
            equilibrio: avg(breakFeedbacks.inteligenciaEmocional),
          })
          .from(breakFeedbacks)
          .where(eq(breakFeedbacks.userId, userId));

        const row = bfAvg[0];
        return res.json({
          energia: row?.energia ? Math.round(parseFloat(String(row.energia)) * 10) / 10 : null,
          foco: row?.foco ? Math.round(parseFloat(String(row.foco)) * 10) / 10 : null,
          confianca: row?.confianca ? Math.round(parseFloat(String(row.confianca)) * 10) / 10 : null,
          equilibrio: row?.equilibrio ? Math.round(parseFloat(String(row.equilibrio)) * 10) / 10 : null,
          totalRecords: totalBF,
          source: 'break_feedbacks',
        });
      }

      // Fallback to preparation_logs
      const plCount = await db
        .select({ count: count() })
        .from(preparationLogs)
        .where(eq(preparationLogs.userId, userId));

      const totalPL = plCount[0]?.count ?? 0;

      if (totalPL >= 3) {
        const plAvg = await db
          .select({
            mentalState: avg(preparationLogs.mentalState),
            focusLevel: avg(preparationLogs.focusLevel),
            confidenceLevel: avg(preparationLogs.confidenceLevel),
          })
          .from(preparationLogs)
          .where(eq(preparationLogs.userId, userId));

        const row = plAvg[0];
        const ms = row?.mentalState ? parseFloat(String(row.mentalState)) : null;
        const fl = row?.focusLevel ? parseFloat(String(row.focusLevel)) : null;
        const cl = row?.confidenceLevel ? parseFloat(String(row.confidenceLevel)) : null;

        // equilibrio = average of all 3 fields
        let equilibrio: number | null = null;
        if (ms !== null && fl !== null && cl !== null) {
          equilibrio = Math.round(((ms + fl + cl) / 3) * 10) / 10;
        }

        return res.json({
          energia: ms !== null ? Math.round(ms * 10) / 10 : null,
          foco: fl !== null ? Math.round(fl * 10) / 10 : null,
          confianca: cl !== null ? Math.round(cl * 10) / 10 : null,
          equilibrio,
          totalRecords: totalPL,
          source: 'preparation_logs',
        });
      }

      // Not enough data
      return res.json({
        energia: null,
        foco: null,
        confianca: null,
        equilibrio: null,
        totalRecords: Math.max(totalBF, totalPL),
        source: null,
      });
    } catch (error) {
      console.error('Error fetching mental averages:', error);
      res.status(500).json({ message: 'Failed to fetch mental averages' });
    }
  });
}
