import type { Express } from "express";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import { invalidateHomeOverviewCache } from "./home";
import { invalidateDashboardQuickStatsCache } from "./dashboard";
import { invalidateHistoricalStatsCache } from "./variance";
import {
  tournaments,
  uploadHistory,
} from "@shared/schema";
import multer from "multer";
import { PokerCSVParser } from "../csvParser";
import type { ParsedTournament } from "../csvParser";
import { detectFlightCandidate } from "../flightDetector";
import { enrichTournamentTypeFields } from "@shared/tournament-type-detector";
import { nanoid } from "nanoid";
import { eq, and, desc, sql, isNull } from "drizzle-orm";
import { z } from "zod";
import { playerBundleCache } from "../services/playerBundle";
import { selectorCache } from "../services/selectorCache";
// ADR-243 — mapeamento unico ParsedTournament -> row de INSERT (os 3 endpoints
// de upload usavam listas de campos divergentes; ver o modulo para o historico).
import { mapParsedToInsertRows } from "../services/tournamentInsertMapper";
import { buildImportSummary } from "../services/importReconciliation";
// ADR-243 — cambio pela DATA de cada torneio (antes: taxa flat das settings).
import { applyHistoricalFxToBatch } from "../services/fx/historicalFxResolver";

// Wave-1 launch-fix #4: restrict CSV/XLSX/TXT uploads to whitelisted extensions +
// MIME types. Magic-byte sniffing happens downstream in the parser (XLSX = PK zip
// header, CSV/TXT = text); here we reject obviously-wrong files before buffering 10MB.
const ALLOWED_UPLOAD_EXTENSIONS = new Set(['.csv', '.txt', '.xlsx', '.xls']);
const ALLOWED_UPLOAD_MIMES = new Set([
  'text/csv',
  'text/plain',
  'application/csv',
  'application/vnd.ms-excel',
  'application/octet-stream', // many browsers send this for .csv/.xlsx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

function rejectUpload(message: string): Error {
  const err: any = new Error(message);
  err.status = 400;
  return err;
}

function uploadFileFilter(_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  const name = (file.originalname || '').toLowerCase();
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot) : '';
  if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
    return cb(rejectUpload('Unsupported file type. Use a .csv, .txt, .xls or .xlsx export.'));
  }
  if (file.mimetype && !ALLOWED_UPLOAD_MIMES.has(file.mimetype)) {
    return cb(rejectUpload('Unsupported file MIME type.'));
  }
  cb(null, true);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: uploadFileFilter,
});

// In production, never echo raw error messages / stack traces to the client.
const isProdEnv = () => process.env.NODE_ENV === 'production';
function clientErrorDetail(err: unknown): string | undefined {
  if (isProdEnv()) return undefined;
  if (err instanceof Error) return err.message;
  return String(err);
}

// Magic-byte validation: XLSX/XLS must be a real ZIP (modern .xlsx) or OLE2 (legacy
// .xls) container; CSV/TXT must look like text (reject binary that snuck past the
// extension check). Returns an error message string when the file is rejected.
function validateUploadMagicBytes(file: { originalname: string; buffer: Buffer }): string | null {
  const name = (file.originalname || '').toLowerCase();
  const buf = file.buffer;
  if (!buf || buf.length === 0) return 'Empty file.';
  if (name.endsWith('.xlsx')) {
    // ZIP local file header: 50 4B 03 04
    if (!(buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04)) {
      return 'File is not a valid .xlsx workbook.';
    }
    return null;
  }
  if (name.endsWith('.xls')) {
    // OLE2 compound file: D0 CF 11 E0 A1 B1 1A E1  (also accept ZIP for misnamed .xlsx)
    const ole2 = buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
    const zip = buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
    if (!ole2 && !zip) return 'File is not a valid Excel workbook.';
    return null;
  }
  // .csv / .txt — sample the first 8KB; reject if it contains NUL bytes (binary).
  const sample = buf.subarray(0, Math.min(buf.length, 8192));
  if (sample.includes(0x00)) return 'File appears to be binary, not a text export.';
  return null;
}

// Backfill default FX rates (CNY/EUR/BRL) when user settings missing/invalid.
// Mirrors GET /api/settings/exchange-rates defaults so SharkScope/CSV multi-currency
// imports always convert to USD even before user opens Settings.
function withExchangeRateDefaults(stored: unknown): Record<string, number> {
  const src = (stored && typeof stored === 'object') ? stored as Record<string, unknown> : {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(src)) {
    if (typeof v === 'number' && v > 0) out[k] = v;
  }
  if (!out.BRL || out.BRL <= 0) out.BRL = 5.0;
  if (!out.CNY || out.CNY <= 0) out.CNY = 7.20;
  if (!out.EUR || out.EUR <= 0) out.EUR = 0.92;
  return out;
}

// Helper function to detect Coin network TXT format
function isCoinFormat(fileContent: string): boolean {
  // Coin format should contain these specific patterns
  return fileContent.includes('Withdrawal') &&
         fileContent.includes('Deposit') &&
         fileContent.includes('USDT') &&
         fileContent.includes('AccountAction') &&
         fileContent.includes('NL Hold\'em');
}

// Helper function to detect CoinPoker CSV format
function isCoinPokerFormat(fileContent: string): boolean {
  // CoinPoker CSV format should contain these specific patterns
  const lines = fileContent.split('\n');
  if (lines.length < 2) return false;

  // Check header contains expected columns
  const header = lines[0].toLowerCase();
  const hasExpectedColumns = header.includes('type') &&
                            header.includes('description') &&
                            header.includes('amount') &&
                            header.includes('date');

  // Check first few data lines contain NL Hold'em tournaments
  const hasNLHoldem = lines.slice(1, 5).some(line =>
    line.includes('NL Hold\'em') && line.includes('USDT')
  );

  return hasExpectedColumns && hasNLHoldem;
}

// Helper function to detect Bodog Excel format
function isBodogFormat(filename: string): boolean {
  return filename.toLowerCase().endsWith('.xlsx') || filename.toLowerCase().endsWith('.xls');
}

export function registerUploadRoutes(app: Express): void {
  // File upload route with intelligent CSV parsing
  app.post('/api/upload-history', requireAuth, upload.single('file'), async (req: any, res) => {
    try {
      // VALIDAÇÃO CRÍTICA DE SEGURANÇA - userPlatformId
      const userPlatformId = req.user?.userPlatformId;

      if (!userPlatformId || !userPlatformId.startsWith('USER-')) {
        return res.status(401).json({ message: 'Invalid user platform ID' });
      }

      // VALIDAÇÃO FINAL ANTES DO UPLOAD

      if (!req.user) {
        return res.status(401).json({ message: 'User not authenticated - req.user is null' });
      }

      if (!req.user.userPlatformId) {
        return res.status(401).json({ message: 'User not authenticated - missing userPlatformId' });
      }

      const userId = userPlatformId; // Use userPlatformId consistently
      const file = req.file;

      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const magicErr = validateUploadMagicBytes(file);
      if (magicErr) {
        return res.status(400).json({ message: magicErr });
      }

      // Fetch user settings to get exchange rates
      const userSettings = await storage.getUserSettings(userId);
      const exchangeRates = withExchangeRateDefaults(userSettings?.exchangeRates);

      try {
        // Detect file format and use appropriate parser
        let tournaments: ParsedTournament[];
        let duplicatesIgnored = 0;
        let duplicateIds: string[] = [];

        if (isBodogFormat(file.originalname)) {
          // Handle Excel files from Bodog
          const parsed = await PokerCSVParser.parseBodogXLSX(file.buffer, userPlatformId, exchangeRates);

          // Batch duplicate check
          const withId = parsed.filter(t => t.tournamentId && t.tournamentId.trim() !== '');
          const withoutId = parsed.filter(t => !t.tournamentId || t.tournamentId.trim() === '');

          const existingIds = await storage.findExistingTournamentIds(userPlatformId, withId.map((t: any) => t.tournamentId!));
          // P1 fix (2026-05-11) #4: include site in lookup so the same tournament name
          // played on different networks isn't collapsed as duplicate.
          const existingByFields = await storage.findExistingTournamentsByFields(userPlatformId, withoutId.map((t: any) => ({ name: t.name, datePlayed: t.datePlayed, buyIn: t.buyIn, site: t.site })));

          tournaments = [];
          for (const t of withId) {
            if (existingIds.has(t.tournamentId!)) {
              duplicatesIgnored++;
              duplicateIds.push(t.tournamentId!);
            } else {
              tournaments.push(t);
            }
          }
          for (const t of withoutId) {
            if (t.datePlayed) {
              // P1 fix (2026-05-11) #4: site-aware key (matches storage convention).
              const key = `${t.site}|${t.name.trim()}|${t.datePlayed.toISOString()}|${t.buyIn}`;
              if (existingByFields.has(key)) {
                duplicatesIgnored++;
                duplicateIds.push(`${t.name} (${t.datePlayed.toISOString().split('T')[0]})`);
              } else {
                tournaments.push(t);
              }
            } else {
              tournaments.push(t);
            }
          }
        } else {
          // Handle text-based files (CSV/TXT)
          const fileContent = file.buffer.toString('utf-8');

          if (isCoinFormat(fileContent)) {
            const parsed = await PokerCSVParser.parseCoinTXT(fileContent, userPlatformId, exchangeRates);

            // Batch duplicate check
            const withId = parsed.filter(t => t.tournamentId && t.tournamentId.trim() !== '');
            const withoutId = parsed.filter(t => !t.tournamentId || t.tournamentId.trim() === '');

            const existingIds = await storage.findExistingTournamentIds(userPlatformId, withId.map((t: any) => t.tournamentId!));
            // P1 fix (2026-05-11) #4: include site in lookup so the same tournament name
            // played on different networks isn't collapsed as duplicate.
            const existingByFields = await storage.findExistingTournamentsByFields(userPlatformId, withoutId.map((t: any) => ({ name: t.name, datePlayed: t.datePlayed, buyIn: t.buyIn, site: t.site })));

            tournaments = [];
            for (const t of withId) {
              if (existingIds.has(t.tournamentId!)) {
                duplicatesIgnored++;
                duplicateIds.push(t.tournamentId!);
              } else {
                tournaments.push(t);
              }
            }
            for (const t of withoutId) {
              if (t.datePlayed) {
                // P1 fix (2026-05-11) #4: site-aware key.
                const key = `${t.site}|${t.name.trim()}|${t.datePlayed.toISOString()}|${t.buyIn}`;
                if (existingByFields.has(key)) {
                  duplicatesIgnored++;
                  duplicateIds.push(`${t.name} (${t.datePlayed.toISOString().split('T')[0]})`);
                } else {
                  tournaments.push(t);
                }
              } else {
                tournaments.push(t);
              }
            }
          } else if (isCoinPokerFormat(fileContent)) {
            const parsed = await PokerCSVParser.parseCoinPokerCSV(fileContent, userPlatformId, exchangeRates);

            // Batch duplicate check
            const withId = parsed.filter(t => t.tournamentId && t.tournamentId.trim() !== '');
            const withoutId = parsed.filter(t => !t.tournamentId || t.tournamentId.trim() === '');

            const existingIds = await storage.findExistingTournamentIds(userPlatformId, withId.map((t: any) => t.tournamentId!));
            // P1 fix (2026-05-11) #4: include site in lookup so the same tournament name
            // played on different networks isn't collapsed as duplicate.
            const existingByFields = await storage.findExistingTournamentsByFields(userPlatformId, withoutId.map((t: any) => ({ name: t.name, datePlayed: t.datePlayed, buyIn: t.buyIn, site: t.site })));

            tournaments = [];
            for (const t of withId) {
              if (existingIds.has(t.tournamentId!)) {
                duplicatesIgnored++;
                duplicateIds.push(t.tournamentId!);
              } else {
                tournaments.push(t);
              }
            }
            for (const t of withoutId) {
              if (t.datePlayed) {
                // P1 fix (2026-05-11) #4: site-aware key.
                const key = `${t.site}|${t.name.trim()}|${t.datePlayed.toISOString()}|${t.buyIn}`;
                if (existingByFields.has(key)) {
                  duplicatesIgnored++;
                  duplicateIds.push(`${t.name} (${t.datePlayed.toISOString().split('T')[0]})`);
                } else {
                  tournaments.push(t);
                }
              } else {
                tournaments.push(t);
              }
            }
          } else {
            // Use optimized CSV parsing with batch duplicate checking
            const parseResult = await PokerCSVParser.parseCSVWithDuplicateCheck(fileContent, userPlatformId, exchangeRates, storage);

            // Check if there are duplicates
            if (parseResult.duplicateCount > 0) {
              // Return analysis with duplicates for user decision
              const duplicatesBySite = parseResult.duplicateTournaments.reduce((acc, tournament) => {
                acc[tournament.site] = (acc[tournament.site] || 0) + 1;
                return acc;
              }, {} as Record<string, number>);

              // Fase 3 (library-evolution): re-import com enriquecimento. Mesmo
              // sendo duplicatas, se a planilha agora traz duracao/stack-depth
              // que faltavam, enriquece as linhas existentes (COALESCE — nao
              // sobrescreve). Best-effort; nunca bloqueia o fluxo de dedup.
              let enrichedCount = 0;
              try {
                enrichedCount = await storage.enrichExistingTournaments(
                  userPlatformId,
                  parseResult.duplicateTournaments,
                );
              } catch (enrichErr) {
                console.error('upload.enrich_existing_failed', enrichErr);
              }

              return res.json({
                status: 'duplicates_found',
                validTournaments: parseResult.validTournaments,
                duplicateTournaments: parseResult.duplicateTournaments,
                duplicateCount: parseResult.duplicateCount,
                totalProcessed: parseResult.totalProcessed,
                duplicatesBySite,
                enrichedCount,
                message: enrichedCount > 0
                  ? `Encontrados ${parseResult.duplicateCount} torneios duplicados de ${parseResult.totalProcessed} processados. ${enrichedCount} atualizados com novos dados (duração/stack).`
                  : `Encontrados ${parseResult.duplicateCount} torneios duplicados de ${parseResult.totalProcessed} torneios processados`
              });
            }

            tournaments = parseResult.validTournaments;
            duplicatesIgnored = parseResult.duplicateCount;
            duplicateIds = parseResult.duplicateIds;
          }
        }

        if (tournaments.length === 0) {
          const debugInfo = isBodogFormat(file.originalname)
            ? `Excel file: ${file.originalname}`
            : `File content (first 500 chars): ${file.buffer.toString('utf-8').substring(0,500)}`;

          if (duplicatesIgnored > 0) {
            return res.status(400).json({
              message: `No new tournaments to import. Found ${duplicatesIgnored} duplicate tournaments that were already imported to your account. If you want to re-import, please delete the existing data first.`,
              duplicatesIgnored: duplicatesIgnored,
              duplicateIds: duplicateIds.slice(0, 10) // Show first 10 duplicate IDs
            });
          } else {
            return res.status(400).json({
              message: "No valid tournament data found in file. Please ensure the file is from a supported poker site and contains valid tournament data.",
            });
          }
        }

        // ADR-243: re-valoriza as linhas nao-USD com a cotacao da DATA do torneio
        // (cascata historical_exact -> historical_prev -> historical_nearest;
        // sem cobertura mantem a taxa flat que o parser aplicou).
        try {
          const fxResult = await applyHistoricalFxToBatch(tournaments as any[]);
          tournaments = fxResult.tournaments as any;
          if (fxResult.fx && fxResult.fx.applied > 0) {
            console.info('upload.fx.historical_applied', fxResult.fx);
          }
        } catch (fxErr) {
          console.error('upload.fx.historical_failed', fxErr);
        }

        // VERIFICAR SE TOURNAMENTS TÊM USERID CORRETO
        const invalidTournaments = tournaments.filter(t => t.userId !== userPlatformId);
        if (invalidTournaments.length > 0) {
          return res.status(500).json({ message: 'Internal error: Tournament data contains incorrect user identification' });
        }

        // ADR-243: mapeamento UNICO compartilhado pelos 3 endpoints de upload
        // (antes cada um gravava uma lista diferente de campos — rake/duracao/
        // players_per_table/converted_to_usd morriam dependendo do endpoint).
        const tournamentsToInsert = mapParsedToInsertRows(tournaments as any[], userPlatformId);

        // RF-02 (ADR-181): >ASYNC_THRESHOLD entra em background com polling.
        if (tournamentsToInsert.length > ASYNC_THRESHOLD) {
          let asyncHistoryId: string | undefined;
          try {
            const [created] = await db
              .insert(uploadHistory)
              .values({
                id: nanoid(),
                userId: userPlatformId,
                filename: file.originalname || 'upload.csv',
                status: 'processing',
                tournamentsCount: tournamentsToInsert.length,
                processedCount: 0,
                errorMessage: null,
                uploadDate: new Date(),
                duplicatesFound: duplicatesIgnored,
              })
              .returning();
            asyncHistoryId = created?.id;
          } catch (histErr) {
            console.error('upload_history.async.create_failed', histErr);
          }
          if (!asyncHistoryId) {
            return res.status(500).json({ message: 'Failed to enqueue async upload' });
          }
          void processAsyncBatches(storage, asyncHistoryId, userPlatformId, tournamentsToInsert).catch(async (err) => {
            console.error('upload_history.background_failed', {
              uploadHistoryId: asyncHistoryId,
              error: err instanceof Error ? err.message : String(err),
            });
            try {
              await storage.updateUploadHistory(asyncHistoryId!, {
                status: 'failed',
                errorMessage: err instanceof Error ? err.message : String(err),
              });
            } catch {
              // log capturado acima
            }
          });
          return res.status(202).json({
            uploadHistoryId: asyncHistoryId,
            estimatedTournaments: tournamentsToInsert.length,
            status: 'processing',
          });
        }

        const savedTournaments = await storage.createTournamentsBatch(tournamentsToInsert);
        const successCount = savedTournaments.length;
        const errorCount = tournamentsToInsert.length - successCount;
        const skippedCount = duplicatesIgnored;

        // Note: Tournament templates will be updated automatically by the analytics system

        // PERSISTÊNCIA DO UPLOAD HISTORY - Salvar no banco de dados
        try {

          // Limpar registros antigos primeiro - manter apenas os últimos 4
          const existingHistory = await db
            .select()
            .from(uploadHistory)
            .where(eq(uploadHistory.userId, userPlatformId))
            .orderBy(desc(uploadHistory.uploadDate));

          if (existingHistory.length >= 5) {
            const toDelete = existingHistory.slice(4);
            for (const record of toDelete) {
              await db
                .delete(uploadHistory)
                .where(eq(uploadHistory.id, record.id));
            }
          }

          // Criar novo registro
          const [newRecord] = await db
            .insert(uploadHistory)
            .values({
              id: nanoid(),
              userId: userPlatformId,
              filename: file.originalname,
              status: successCount > 0 ? 'success' : 'error',
              tournamentsCount: successCount,
              errorMessage: errorCount > 0 ? `${errorCount} erros de salvamento` : null,
              uploadDate: new Date(),
            })
            .returning();

        } catch (historyError) {
          // Não bloquear a resposta se houver erro no histórico
        }

        // Q3: invalidar caches do Tournament Selector apos upload bem-sucedido
        if (successCount > 0) {
          try {
            playerBundleCache.invalidate(userPlatformId);
            selectorCache.invalidateAllForUser(userPlatformId);
          } catch (cacheErr) {
            // never block response on cache invalidation failure
          }

          // Sprint Coach-2B / RF-08 — B-LEAK background detection
          // setImmediate nao bloqueia HTTP 200; falhas isoladas via try/catch.
          setImmediate(() => {
            void import('../coach/jobs/processCoachLeakDetection')
              .then(({ processCoachLeakDetection }) =>
                processCoachLeakDetection({ userId: userPlatformId, uploadId: undefined }))
              .catch((err) =>
                console.error('coach.b_leak.bg.error', { userId: userPlatformId, err }));
          });
        }

        invalidateHistoricalStatsCache(userPlatformId);

        res.json({
          message: `${successCount} tournaments uploaded successfully${skippedCount > 0 ? `, ${skippedCount} duplicates skipped` : ''}${errorCount > 0 ? `, ${errorCount} failed to save` : ''}`,
          count: successCount,
          parsed: tournaments.length,
          skipped: skippedCount,
          databaseErrors: errorCount,
          tournaments: savedTournaments.slice(0, 5), // Return first 5 for preview
          sites: Array.from(new Set(tournaments.map(t => t.site))), // Show detected sites
          formats: Array.from(new Set(tournaments.map(t => t.format))), // Show detected formats
        });
      } catch (parseError: any) {
        // Log file information for debugging
        const debugInfo = isBodogFormat(file.originalname)
          ? `Excel file: ${file.originalname}`
          : `File content (first 500 chars): ${file.buffer.toString('utf-8').substring(0,500)}`;

        // PERSISTÊNCIA DO UPLOAD HISTORY - Salvar erro no banco
        try {

          // Limpar registros antigos primeiro
          const existingHistory = await db
            .select()
            .from(uploadHistory)
            .where(eq(uploadHistory.userId, userPlatformId))
            .orderBy(desc(uploadHistory.uploadDate));

          if (existingHistory.length >= 5) {
            const toDelete = existingHistory.slice(4);
            for (const record of toDelete) {
              await db
                .delete(uploadHistory)
                .where(eq(uploadHistory.id, record.id));
            }
          }

          // Criar registro de erro
          await db
            .insert(uploadHistory)
            .values({
              id: nanoid(),
              userId: userPlatformId,
              filename: file.originalname,
              status: 'error',
              tournamentsCount: 0,
              errorMessage: parseError instanceof Error ? parseError.message : "Unknown parsing error",
              uploadDate: new Date(),
            });

        } catch (historyError) {
        }

        res.status(400).json({
          message: "Failed to parse CSV file. Please ensure it is a valid CSV and the format is supported.",
          error: clientErrorDetail(parseError) ?? "Unknown parsing error.",
          suggestion: "Verify encoding (UTF-8 preferred), delimiter (comma expected), and that all necessary columns are present."
        });
      }
    } catch (error: any) {
      res.status(500).json({
        message: "Failed to upload file due to a server error.",
        error: clientErrorDetail(error)
      });
    }
  });

  // New endpoint for checking duplicates before upload
  app.post('/api/check-duplicates', requireAuth, upload.single('file'), async (req: any, res) => {
    try {

      const userPlatformId = req.user?.userPlatformId;

      if (!userPlatformId || !userPlatformId.startsWith('USER-')) {
        return res.status(401).json({ message: 'Invalid user platform ID' });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      {
        const magicErr = validateUploadMagicBytes(file);
        if (magicErr) return res.status(400).json({ message: magicErr });
      }


      // CORREÇÃO CRÍTICA CNY - CARREGAR TAXAS DE CÂMBIO
      const userSettings = await storage.getUserSettings(userPlatformId);
      const exchangeRates = withExchangeRateDefaults(userSettings?.exchangeRates);


      // Parse the CSV file based on format
      const fileContent = file.buffer.toString('utf-8');
      let parsedData: ParsedTournament[] = [];
      // ADR-243: preview da reconciliacao ja nesta etapa (o jogador ve, ANTES de
      // confirmar, quantas linhas o arquivo tinha e quais nao seriam importadas).
      let parseReport: { rowsInFile: number; parsedCount: number; rejected: any[] } | null = null;

      try {
        if (isBodogFormat(file.originalname)) {
          parsedData = await PokerCSVParser.parseBodogXLSX(file.buffer, userPlatformId, exchangeRates);
        } else if (isCoinFormat(fileContent)) {
          parsedData = await PokerCSVParser.parseCoinTXT(fileContent, userPlatformId, exchangeRates);
        } else if (isCoinPokerFormat(fileContent)) {
          parsedData = await PokerCSVParser.parseCoinPokerCSV(fileContent, userPlatformId, exchangeRates);
        } else {
          const detailed = await PokerCSVParser.parseCSVDetailed(fileContent, userPlatformId, exchangeRates);
          parsedData = detailed.tournaments;
          parseReport = detailed.report;
        }

      } catch (parseError) {
        return res.status(400).json({
          message: 'Erro ao processar arquivo',
          error: clientErrorDetail(parseError) ?? 'Erro desconhecido',
        });
      }

      if (!parsedData || parsedData.length === 0) {
        return res.status(400).json({ message: 'Nenhum torneio válido encontrado no arquivo' });
      }

      // ADR-243: a previa usa a MESMA re-valorizacao do import, senao os numeros
      // mostrados antes de confirmar nao bateriam com os gravados.
      try {
        const fxResult = await applyHistoricalFxToBatch(parsedData as any[]);
        parsedData = fxResult.tournaments as any;
      } catch (fxErr) {
        console.error('check-duplicates.fx.historical_failed', fxErr);
      }

      // Batch check for duplicates
      const validTournaments: typeof parsedData = [];
      const duplicateTournaments: typeof parsedData = [];
      const duplicatesBySite: Record<string, number> = {};

      const withId = parsedData.filter(t => t.tournamentId && t.tournamentId.trim() !== '');
      const withoutId = parsedData.filter(t => !t.tournamentId || t.tournamentId.trim() === '');

      const existingIds = await storage.findExistingTournamentIds(userPlatformId, withId.map((t: any) => t.tournamentId!));
      // P1 fix (2026-05-11) #4: site-aware dup lookup.
      const existingByFields = await storage.findExistingTournamentsByFields(userPlatformId, withoutId.map((t: any) => ({ name: t.name, datePlayed: t.datePlayed, buyIn: t.buyIn, site: t.site })));

      for (const t of withId) {
        if (existingIds.has(t.tournamentId!)) {
          duplicateTournaments.push(t);
          const site = t.site || 'Unknown';
          duplicatesBySite[site] = (duplicatesBySite[site] || 0) + 1;
        } else {
          validTournaments.push(t);
        }
      }

      for (const t of withoutId) {
        if (t.datePlayed) {
          // P1 fix (2026-05-11) #4: site-aware key.
          const key = `${t.site}|${t.name.trim()}|${t.datePlayed.toISOString()}|${t.buyIn}`;
          if (existingByFields.has(key)) {
            duplicateTournaments.push(t);
            const site = t.site || 'Unknown';
            duplicatesBySite[site] = (duplicatesBySite[site] || 0) + 1;
          } else {
            validTournaments.push(t);
          }
        } else {
          validTournaments.push(t);
        }
      }



      res.json({
        validTournaments,
        duplicates: duplicateTournaments,
        duplicatesBySite,
        totalProcessed: parsedData.length,
        fileName: file.originalname,
        // ADR-243 — previa de reconciliacao (linhas lidas x parseadas x rejeitadas).
        reconciliation: buildImportSummary({
          parseReport,
          parsedCount: parsedData.length,
          duplicates: duplicateTournaments.length,
          inserted: 0,
          dbErrors: 0,
          tournaments: parsedData as any[],
        }),
      });

    } catch (error: any) {
      res.status(500).json({
        message: "Failed to check for duplicates",
        error: clientErrorDetail(error),
      });
    }
  });

  // New endpoint for handling duplicate decisions
  app.post('/api/upload-with-duplicates', requireAuth, upload.single('file'), async (req: any, res) => {
    try {
      const userPlatformId = req.user?.userPlatformId;


      if (!userPlatformId || !userPlatformId.startsWith('USER-')) {
        return res.status(401).json({ message: 'Invalid user platform ID' });
      }

      const { duplicateAction } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ message: 'No file provided' });
      }
      {
        const magicErr = validateUploadMagicBytes(file);
        if (magicErr) return res.status(400).json({ message: magicErr });
      }


      // CORREÇÃO CRÍTICA CNY - CARREGAR TAXAS DE CÂMBIO
      const userSettings = await storage.getUserSettings(userPlatformId);
      const exchangeRates = withExchangeRateDefaults(userSettings?.exchangeRates);


      // Re-parse the file to get fresh data
      const fileContent = file.buffer.toString('utf8');
      let parsedData: ParsedTournament[] = [];
      // ADR-243: relatorio de reconciliacao do import (linhas lidas x parseadas
      // x rejeitadas com motivo). Apenas o caminho CSV generico produz relatorio
      // hoje; os parsers dedicados (TXT/XLSX/CoinPoker) devolvem so a lista.
      let parseReport: { rowsInFile: number; parsedCount: number; rejected: any[] } | null = null;

      try {
        if (file.originalname.endsWith('.txt')) {
          parsedData = await PokerCSVParser.parseCoinTXT(fileContent, userPlatformId, exchangeRates);
        } else if (file.originalname.toLowerCase().endsWith('.xlsx') || file.originalname.toLowerCase().endsWith('.xls')) {
          // ADR-243 FIX: passava `fileContent` (string) para uma funcao que exige
          // Buffer -> todo upload de planilha (Bodog) falhava com 400 justamente
          // no caminho que a UI usa. O path /api/upload-history sempre passou
          // file.buffer; aqui estava divergente.
          parsedData = await PokerCSVParser.parseBodogXLSX(file.buffer, userPlatformId, exchangeRates);
        } else if (PokerCSVParser.isCoinPokerFormat(fileContent)) {
          parsedData = await PokerCSVParser.parseCoinPokerCSV(fileContent, userPlatformId, exchangeRates);
        } else {
          const detailed = await PokerCSVParser.parseCSVDetailed(fileContent, userPlatformId, exchangeRates);
          parsedData = detailed.tournaments;
          parseReport = detailed.report;
        }


      } catch (parseError) {
        return res.status(400).json({
          message: 'Erro ao processar arquivo',
          error: clientErrorDetail(parseError),
        });
      }

      // ADR-243: cambio por data do torneio antes de dedup/insert.
      let fxInfo: any = null;
      try {
        const fxResult = await applyHistoricalFxToBatch(parsedData as any[]);
        parsedData = fxResult.tournaments as any;
        fxInfo = fxResult.fx;
        if (fxInfo?.applied > 0) console.info('upload.fx.historical_applied', fxInfo);
      } catch (fxErr) {
        console.error('upload.fx.historical_failed', fxErr);
      }

      // Batch check duplicates
      const validTournaments: typeof parsedData = [];
      const duplicateTournaments: typeof parsedData = [];

      const withId = parsedData.filter(t => t.tournamentId && t.tournamentId.trim() !== '');
      const withoutId = parsedData.filter(t => !t.tournamentId || t.tournamentId.trim() === '');

      const existingIds = await storage.findExistingTournamentIds(userPlatformId, withId.map((t: any) => t.tournamentId!));
      // P1 fix (2026-05-11) #4: site-aware dup lookup.
      const existingByFields = await storage.findExistingTournamentsByFields(userPlatformId, withoutId.map((t: any) => ({ name: t.name, datePlayed: t.datePlayed, buyIn: t.buyIn, site: t.site })));

      for (const t of withId) {
        if (existingIds.has(t.tournamentId!)) {
          duplicateTournaments.push(t);
        } else {
          validTournaments.push(t);
        }
      }

      for (const t of withoutId) {
        if (t.datePlayed) {
          // P1 fix (2026-05-11) #4: site-aware key.
          const key = `${t.site}|${t.name.trim()}|${t.datePlayed.toISOString()}|${t.buyIn}`;
          if (existingByFields.has(key)) {
            duplicateTournaments.push(t);
          } else {
            validTournaments.push(t);
          }
        } else {
          validTournaments.push(t);
        }
      }

      let tournamentsToSave: typeof parsedData = [];
      let actionMessage = '';

      switch (duplicateAction) {
        case 'import_new_only':
          tournamentsToSave = validTournaments;
          actionMessage = `Importados apenas ${validTournaments.length} torneios novos. ${duplicateTournaments.length} duplicatas ignoradas.`;
          break;

        case 'import_all':
          tournamentsToSave = [...validTournaments, ...duplicateTournaments];
          actionMessage = `Importados ${tournamentsToSave.length} torneios (incluindo ${duplicateTournaments.length} duplicatas que foram sobrescritas).`;
          break;

        default:
          return res.status(400).json({ message: 'Ação inválida' });
      }

      // ADR-243: mapeamento UNICO (ver server/services/tournamentInsertMapper).
      // Este e o caminho que a UI usa (AutoUpload -> check-duplicates ->
      // upload-with-duplicates) e era o mais pobre dos tres: perdia rake,
      // duracao, players_per_table, structure, game_type, deep_stack e
      // converted_to_usd.
      // ADR-243: cria o registro do upload ANTES do insert para que cada torneio
      // carregue `upload_id` -> permite auditoria e desfazer o import.
      let uploadId: string | null = null;
      try {
        const created = await storage.createUploadHistory({
          userId: userPlatformId,
          filename: file.originalname || 'upload.csv',
          status: 'processing',
          tournamentsCount: 0,
          duplicatesFound: duplicateTournaments.length,
          errorMessage: null,
          rowsInFile: parseReport?.rowsInFile ?? null,
          rejectedCount: parseReport ? parseReport.rejected.length : null,
        } as any);
        uploadId = (created as any)?.id ?? null;
      } catch (historyErr) {
        // Metadata nao bloqueia o import (comportamento legado preservado).
        console.error('upload-with-duplicates: createUploadHistory(pre) failed (non-blocking):', historyErr);
      }

      const insertData = mapParsedToInsertRows(tournamentsToSave as any[], userPlatformId, { uploadId });

      const savedTournaments = await storage.createTournamentsBatch(insertData);
      const successCount = savedTournaments.length;
      const errorCount = insertData.length - successCount;

      // HIGH #5 (CRITICAL para Tournament Selector): invalidar caches apos upload bem-sucedido.
      // Sem isso, o usuario nao ve o impacto do novo historico ate o cache TTL expirar.
      if (successCount > 0) {
        try {
          playerBundleCache.invalidate(userPlatformId);
          selectorCache.invalidateAllForUser(userPlatformId);
        } catch (cacheErr) {
          console.error('upload-with-duplicates: cache invalidation failed', cacheErr);
        }

        // Sprint Coach-2B / RF-08 — B-LEAK background detection
        setImmediate(() => {
          void import('../coach/jobs/processCoachLeakDetection')
            .then(({ processCoachLeakDetection }) =>
              processCoachLeakDetection({ userId: userPlatformId, uploadId: undefined }))
            .catch((err) =>
              console.error('coach.b_leak.bg.error', { userId: userPlatformId, err }));
        });
      }

      // Save upload history — payload alinhado ao schema upload_history
      // (tournamentsCount/uploadDate/duplicatesFound; sem fileType/processingTime/
      // createdAt/tournamentsImported que nao existem na tabela). try/catch
      // separado porque a persistencia do historico é metadata: se falhar, NAO
      // deve invalidar o upload que ja gravou os torneios — apenas loga e segue
      // com res.json 200 (consistente com o outro endpoint upload-history que
      // tambem isola a escrita do historico em try/catch — followup 2026-05-14).
      // ADR-243: fecha o registro criado antes do insert (status + contadores de
      // reconciliacao). Quando a criacao previa falhou, cria agora (fallback).
      const importSummary = buildImportSummary({
        parseReport,
        parsedCount: parsedData.length,
        duplicates: duplicateTournaments.length,
        inserted: successCount,
        dbErrors: errorCount,
        tournaments: tournamentsToSave as any[],
      });
      try {
        if (uploadId) {
          await storage.updateUploadHistory(uploadId, {
            status: successCount > 0 ? 'success' : 'error',
            tournamentsCount: successCount,
            processedCount: successCount,
            duplicatesFound: duplicateTournaments.length,
            duplicateAction: typeof duplicateAction === 'string' ? duplicateAction : null,
            errorMessage: errorCount > 0 ? `${errorCount} erros durante importação` : null,
            rowsInFile: parseReport?.rowsInFile ?? null,
            rejectedCount: parseReport ? parseReport.rejected.length : null,
            importSummary,
          } as any);
        } else {
          await storage.createUploadHistory({
            userId: userPlatformId,
            filename: file.originalname,
            status: successCount > 0 ? 'success' : 'error',
            tournamentsCount: successCount,
            duplicatesFound: duplicateTournaments.length,
            errorMessage: errorCount > 0 ? `${errorCount} erros durante importação` : null,
            rowsInFile: parseReport?.rowsInFile ?? null,
            rejectedCount: parseReport ? parseReport.rejected.length : null,
            importSummary,
          } as any);
        }
      } catch (historyErr) {
        console.error('upload-with-duplicates: upload history persist failed (non-blocking):', historyErr);
      }


      res.json({
        success: true,
        message: actionMessage,
        tournamentsImported: successCount,
        duplicatesProcessed: duplicateTournaments.length,
        errors: errorCount,
        // ADR-243: reconciliacao visivel para o jogador.
        uploadId,
        reconciliation: importSummary,
      });

    } catch (error) {
      console.error('POST /api/upload-with-duplicates failed:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Exchange rates endpoints
  // Aceita BRL (Suprema/PPoker), CNY (mercado asiatico), EUR (iPoker/PS.ES).
  // Convencao ADR-033: rate = unidades nativas por 1 USD.
  app.post('/api/settings/exchange-rates', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const { BRL, CNY, EUR } = req.body;

      if (!CNY || !EUR || CNY <= 0 || EUR <= 0) {
        return res.status(400).json({ message: 'Invalid exchange rates provided' });
      }
      if (BRL !== undefined && (typeof BRL !== 'number' || BRL <= 0)) {
        return res.status(400).json({ message: 'Invalid BRL exchange rate' });
      }

      const existing = (await storage.getUserSettings(userId))?.exchangeRates || {};
      const merged: Record<string, number> = {
        ...(existing as Record<string, number>),
        CNY,
        EUR,
      };
      if (typeof BRL === 'number' && BRL > 0) merged.BRL = BRL;

      await storage.upsertUserSettings({
        userId,
        exchangeRates: merged,
      });

      res.json({ message: 'Exchange rates updated successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to save exchange rates' });
    }
  });

  // Get exchange rates endpoint
  app.get('/api/settings/exchange-rates', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const settings = await storage.getUserSettings(userId);

      // Default inclui BRL para Suprema/PPoker funcionar fora-da-caixa.
      // Usuario pode sobrescrever via Settings.
      const stored = (settings?.exchangeRates || {}) as Record<string, number>;
      const exchangeRates: Record<string, number> = {
        BRL: stored.BRL && stored.BRL > 0 ? stored.BRL : 5.0,
        CNY: stored.CNY && stored.CNY > 0 ? stored.CNY : 7.20,
        EUR: stored.EUR && stored.EUR > 0 ? stored.EUR : 0.92,
      };
      // Preserva codigos extras (USDT, GBP) ja salvos.
      for (const [k, v] of Object.entries(stored)) {
        if (!(k in exchangeRates) && typeof v === 'number' && v > 0) {
          exchangeRates[k] = v;
        }
      }
      res.json(exchangeRates);
    } catch (error) {
      res.status(500).json({ message: 'Failed to get exchange rates' });
    }
  });

  // UPLOAD HISTORY ENDPOINTS - Persistência do histórico de upload
  app.get('/api/upload-history', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;

      // ADR-243: era `.limit(5)` fixo — o jogador via apenas os 5 ultimos imports
      // de toda a vida da conta. Agora paginado (default 20, teto 100).
      const rawLimit = parseInt(String(req.query?.limit ?? '20'), 10);
      const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 20;
      const rawOffset = parseInt(String(req.query?.offset ?? '0'), 10);
      const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;

      const history = await db
        .select()
        .from(uploadHistory)
        .where(eq(uploadHistory.userId, userId))
        .orderBy(desc(uploadHistory.uploadDate))
        .limit(limit)
        .offset(offset);

      res.json(history);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch upload history' });
    }
  });

  // Upload statistics endpoint
  app.get('/api/upload-stats', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;

      // Get total tournaments count
      // CLAUDE.md 6.1: historico = tournaments com grind_session_id IS NULL.
      // Sem o filtro, registros de sessao /grind-live inflariam o painel de import.
      const tournamentsCountResult = await db
        .select({ count: sql<string>`count(*)` })
        .from(tournaments)
        .where(and(eq(tournaments.userId, userId), isNull(tournaments.grindSessionId)));

      const totalTournaments = parseInt(tournamentsCountResult[0]?.count || '0');

      // Get unique sites count
      const sitesResult = await db
        .select({ site: tournaments.site })
        .from(tournaments)
        .where(and(eq(tournaments.userId, userId), isNull(tournaments.grindSessionId)))
        .groupBy(tournaments.site);

      const activeSites = sitesResult.length;

      // Get uploads completed count
      const uploadsResult = await db
        .select({ count: sql<string>`count(*)` })
        .from(uploadHistory)
        .where(eq(uploadHistory.userId, userId));

      const uploadsCompleted = parseInt(uploadsResult[0]?.count || '0');

      const stats = {
        totalTournaments,
        activeSites,
        uploadsCompleted
      };

      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch upload stats' });
    }
  });

  /**
   * ADR-243 — desfazer um import.
   * Antes era impossivel: `tournaments` nao tinha vinculo com o upload, e o
   * DELETE /api/upload-history/:id apagava apenas a linha de log (os torneios
   * ficavam). Agora apaga os torneios daquele upload_id (escopo do usuario) e
   * o registro de historico, devolvendo a contagem removida.
   */
  app.post('/api/upload-history/:id/undo', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const { id } = req.params;

      const [record] = await db
        .select()
        .from(uploadHistory)
        .where(and(eq(uploadHistory.id, id), eq(uploadHistory.userId, userId)));
      if (!record) {
        return res.status(404).json({ message: 'Import nao encontrado' });
      }

      const removed = await db
        .delete(tournaments)
        .where(and(eq(tournaments.userId, userId), eq(tournaments.uploadId, id)))
        .returning({ id: tournaments.id });

      await db
        .update(uploadHistory)
        .set({ status: 'undone', errorMessage: `Import desfeito: ${removed.length} torneios removidos` })
        .where(and(eq(uploadHistory.id, id), eq(uploadHistory.userId, userId)));

      // Caches que dependem do historico do jogador.
      try {
        playerBundleCache.invalidate(userId);
        selectorCache.invalidateAllForUser(userId);
        invalidateHomeOverviewCache(userId);
        invalidateDashboardQuickStatsCache(userId);
        invalidateHistoricalStatsCache(userId);
      } catch (cacheErr) {
        console.error('upload-history.undo: cache invalidation failed', cacheErr);
      }

      res.json({
        message: `${removed.length} torneios removidos deste import`,
        removedCount: removed.length,
        uploadId: id,
      });
    } catch (error) {
      console.error('POST /api/upload-history/:id/undo failed:', error);
      res.status(500).json({ message: 'Erro ao desfazer import' });
    }
  });

  app.delete('/api/upload-history/:id', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const { id } = req.params;

      const deleted = await storage.deleteUploadHistory(id, userId);
      if (!deleted) {
        return res.status(404).json({ message: 'Upload history not found' });
      }

      res.json({ message: 'Upload history deleted successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to delete upload history' });
    }
  });

  // Sprint Flight-1 RF-06/RF-07: novos handlers expostos via Express.
  app.post('/api/upload', requireAuth, upload.single('file'), handleUploadCsv as any);
  app.post('/api/upload/confirm-flights', requireAuth, handleConfirmFlights as any);
  // RF-02 (Backend-Sweep ADR-181): polling de progresso async.
  app.get('/api/upload-history/:id', requireAuth, (req: any, res) => handleGetUploadHistoryById(req, res) as any);

  // === Sprint library-evolution Fase 5: modo Overview (efemero) + highlights ===

  // Analise EFEMERA de um CSV grande (pool multi-jogador). NAO persiste nada —
  // parseia em memoria, agrupa e devolve os melhores torneios por plataforma
  // com os motivos do destaque. O CSV e descartado ao fim do request.
  app.post('/api/library/overview/analyze', requireAuth, upload.single('file'), async (req: any, res) => {
    try {
      const userPlatformId = req.user?.userPlatformId;
      const file = req.file;
      if (!file) return res.status(400).json({ message: 'Nenhum arquivo enviado' });
      const magicErr = validateUploadMagicBytes(file);
      if (magicErr) return res.status(400).json({ message: magicErr });

      const userSettings = await storage.getUserSettings(userPlatformId);
      const exchangeRates = withExchangeRateDefaults(userSettings?.exchangeRates);
      const fileContent = file.buffer.toString('utf-8');

      let parsed: any[] = [];
      try {
        if (isCoinPokerFormat(fileContent)) {
          parsed = await PokerCSVParser.parseCoinPokerCSV(fileContent, userPlatformId, exchangeRates);
        } else {
          parsed = await PokerCSVParser.parseCSV(fileContent, userPlatformId, exchangeRates);
        }
      } catch (parseError) {
        return res.status(400).json({ message: 'Erro ao processar arquivo', error: clientErrorDetail(parseError) ?? 'Erro desconhecido' });
      }
      if (!parsed || parsed.length === 0) {
        return res.status(400).json({ message: 'Nenhum torneio válido encontrado no arquivo' });
      }

      const { analyzeOverview } = await import('../services/overviewAnalysis');
      const result = analyzeOverview(parsed);
      // Dado efemero — nada gravado no banco.
      res.json(result);
    } catch (error) {
      console.error('overview.analyze failed:', error);
      res.status(500).json({ message: 'Erro ao analisar o arquivo' });
    }
  });

  app.get('/api/library/highlights', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const site = (req.query.site as string) || undefined;
      res.json(await storage.listSavedHighlights(userId, site));
    } catch (error) {
      res.status(500).json({ message: 'Erro ao listar highlights' });
    }
  });

  app.post('/api/library/highlights', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const { site, familyKey, groupName, buyInTier, type, metrics, reasons, source } = req.body ?? {};
      if (!site || !familyKey) {
        return res.status(400).json({ message: 'site e familyKey sao obrigatorios' });
      }
      const row = await storage.saveHighlight({ userId, site, familyKey, groupName, buyInTier, type, metrics, reasons, source });
      res.json(row);
    } catch (error) {
      console.error('highlights.save failed:', error);
      res.status(500).json({ message: 'Erro ao salvar highlight' });
    }
  });

  app.delete('/api/library/highlights/:id', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const ok = await storage.deleteHighlight(userId, req.params.id);
      if (!ok) return res.status(404).json({ message: 'Highlight nao encontrado' });
      res.json({ message: 'Removido' });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao remover highlight' });
    }
  });

  // Fase 6: drill-down — re-deriva ultimos resultados + metricas atuais do
  // historico do user para a familia salva (reconciliacao via `found`).
  app.get('/api/library/highlights/:id/details', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const list = await storage.listSavedHighlights(userId);
      const hl = list.find((h: any) => h.id === req.params.id);
      if (!hl) return res.status(404).json({ message: 'Highlight nao encontrado' });
      const details = await storage.getFamilyDetails(userId, hl.familyKey);
      res.json({ highlight: hl, ...details });
    } catch (error) {
      console.error('highlights.details failed:', error);
      res.status(500).json({ message: 'Erro ao carregar detalhes' });
    }
  });
}

// ============================================================================
// Sprint Flight-1 — Handlers expostos (RF-06, RF-07, RF-08)
// Spec: docs/specs/sprint-flight-1.md
// ADRs: 090 (single source of truth), 091 (stack_mode enum)
// ============================================================================

function userIdOfReq(req: any): string | null {
  return req?.user?.userPlatformId ?? null;
}

/**
 * RF-06 + RF-08: parser CSV + flight detection + auto-link Day 1 + Day 2.
 *
 * Comportamento:
 *  - Tournaments inseridos NORMALMENTE com seriesId=NULL (D10 — sem persistencia
 *    de "pending confirmation").
 *  - Response inclui pendingFlightConfirmations[] em memoria (in-memory).
 *  - RF-08: se Day 1s + Day 2 do mesmo baseName + site + janela 1-7d chegam
 *    juntos, cria series automaticamente (sem prompt) e linka via seriesId.
 *  - autoLinkedSeries[] no response para UI mostrar toast.
 */
export async function handleUploadCsv(req: any, res: any): Promise<void> {
  const userId = userIdOfReq(req);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ message: "No file uploaded" });
      return;
    }
    const magicErr = validateUploadMagicBytes(file);
    if (magicErr) {
      res.status(400).json({ message: magicErr });
      return;
    }

    const userSettings = await (storage as any).getUserSettings(userId);
    const exchangeRates = withExchangeRateDefaults(userSettings?.exchangeRates);

    // P1 fix (2026-05-11) #5: prefer central dispatcher when available so XLSX/Coin/
    // CoinPoker payloads reach the right parser. Existing integration tests mock
    // PokerCSVParser with only parseCSV/parseBodogXLSX defined (no dispatchCSVParser),
    // so we fall back to parseCSV when the dispatcher is missing — keeps mocks valid
    // without losing format detection in production.
    const fileContent = file.buffer.toString('utf-8');
    const dispatcher = (PokerCSVParser as any).dispatchCSVParser;
    const parsed = typeof dispatcher === 'function'
      ? await dispatcher.call(PokerCSVParser, file, userId, exchangeRates)
      : await PokerCSVParser.parseCSV(fileContent, userId, exchangeRates);

    // Detecta candidates e separa em buckets para auto-link RF-08.
    const detections = (parsed ?? []).map((t: any) => ({
      tournament: t,
      detection: detectFlightCandidate(t.name),
    }));

    // RF-08: agrupa flight candidates por baseName + site para identificar
    // pares Day 1 + Day 2 dentro do mesmo upload.
    const groups = new Map<string, { day1s: any[]; day2s: any[] }>();
    for (const { tournament, detection } of detections) {
      if (!detection.isFlightCandidate) continue;
      const key = `${detection.baseName.trim().toLowerCase()}|${(tournament.site ?? '').trim().toLowerCase()}`;
      if (!groups.has(key)) groups.set(key, { day1s: [], day2s: [] });
      const bucket = groups.get(key)!;
      // "Day 2" detector matches "day 2" with leading "Day" + space + "2".
      // baseName already excludes the matched flight day text.
      const isDay2 = /day\s*2/i.test(detection.flightDay ?? '');
      if (isDay2) bucket.day2s.push({ tournament, detection });
      else bucket.day1s.push({ tournament, detection });
    }

    // Para cada grupo com 1+ Day 1 + 1+ Day 2 dentro da janela 1-7d, cria series.
    const autoLinkMap = new Map<string, string>(); // tournamentId → seriesId
    const autoLinkedSeries: any[] = [];

    for (const [key, bucket] of groups) {
      if (bucket.day1s.length === 0 || bucket.day2s.length === 0) continue;

      // Verifica janela 1-7 dias entre Day 1 mais cedo e Day 2.
      const day1Times = bucket.day1s
        .map((d) => d.tournament.datePlayed?.getTime?.() ?? 0)
        .filter((t) => t > 0);
      const day2Times = bucket.day2s
        .map((d) => d.tournament.datePlayed?.getTime?.() ?? 0)
        .filter((t) => t > 0);
      if (day1Times.length === 0 || day2Times.length === 0) continue;
      const earliestDay1 = Math.min(...day1Times);
      const earliestDay2 = Math.min(...day2Times);
      const diffDays = (earliestDay2 - earliestDay1) / (1000 * 60 * 60 * 24);
      if (diffDays < 1 || diffDays > 7) continue;

      // Cria a serie. stackMode = combined se >= 2 Day 1s, senao single.
      const baseName = bucket.day1s[0].detection.baseName;
      const site = bucket.day1s[0].tournament.site;
      const stackMode = bucket.day1s.length >= 2 ? 'combined' : 'single';
      const series = await (storage as any).createSeries(userId, {
        name: baseName,
        network: site,
        totalDay1s: bucket.day1s.length,
        day2DateTime: new Date(earliestDay2),
        day2Status: 'completed',
        stackMode,
      });

      const seriesId = series?.id ?? `srs-auto-${autoLinkedSeries.length + 1}`;
      const allEntries = [...bucket.day1s, ...bucket.day2s];
      for (const e of allEntries) {
        autoLinkMap.set(e.tournament.tournamentId ?? e.tournament.id, seriesId);
      }
      autoLinkedSeries.push({
        seriesId,
        name: baseName,
        entryCount: allEntries.length,
      });
    }

    // Insere todos os tournaments. Auto-linkados recebem seriesId imediato;
    // demais ficam com seriesId=null (D10 — visiveis em reports normalmente).
    const insertFn = (storage as any).createTournament ?? (storage as any).insertTournament;
    const inserted: any[] = [];
    const pendingFlightConfirmations: any[] = [];

    for (const { tournament, detection } of detections) {
      const externalId = tournament.tournamentId ?? tournament.id;
      const linkedSeriesId = autoLinkMap.get(externalId) ?? null;
      const enriched = enrichTournamentTypeFields({ name: tournament.name, category: tournament.category });
      // launch-fix P1#2 + P1#3: stake-only addOnCost (sem rake) + preservar
      // category original do parser quando ja for SSoT-valido (PKO/Mystery/etc).
      const buyInNum = parseFloat(tournament.buyIn?.toString() ?? '0');
      const rakeNum = parseFloat((tournament as any).rake?.toString() ?? '0');
      const stakeOnly = Math.max(0, buyInNum - rakeNum);
      const payload: any = {
        ...tournament,
        userId,
        seriesId: linkedSeriesId,
        type: enriched.type,
        category: tournament.category || enriched.type,
        // detection.isFlightCandidate ja eh trustworthy do flightDetector;
        // OU caia pro pattern detector quando flightDetector nao matcha
        isFlight: detection.isFlightCandidate || enriched.isFlight,
        allowsAddOn: enriched.allowsAddOn,
        addOnCost: enriched.allowsAddOn ? stakeOnly.toString() : null,
        allowsReentry: enriched.allowsReentry,
      };
      const persisted = insertFn ? await insertFn(payload) : payload;
      inserted.push(persisted);

      // Adiciona ao pending list APENAS se: candidate detectado + NAO auto-linkado.
      if (detection.isFlightCandidate && !linkedSeriesId) {
        pendingFlightConfirmations.push({
          tournamentId: persisted.id ?? externalId,
          name: tournament.name,
          baseName: detection.baseName,
          flightDay: detection.flightDay,
          site: tournament.site,
          datePlayed: tournament.datePlayed,
          buyIn: tournament.buyIn,
          suggestedSeriesId: null,
        });
      }
    }

    // Wave E + G (Fase 3 perf): invalidar caches /api/home/overview e
    // /api/dashboard/quick-stats pos-upload — quickStats/performance/
    // dashboardAllTime/lastTournamentUploadAt mudam.
    try { invalidateHomeOverviewCache(req.user?.userPlatformId); } catch {}
    try { invalidateDashboardQuickStatsCache(req.user?.userPlatformId); } catch {}

    res.status(200).json({
      imported: inserted.length,
      pendingFlightConfirmations,
      autoLinkedSeries,
    });
  } catch (err: any) {
    console.error("[handleUploadCsv] failed:", err);
    res.status(500).json({ message: "Internal error" });
  }
}

// ----------------------------------------------------------------------------
// RF-07: POST /api/upload/confirm-flights
// ----------------------------------------------------------------------------

const confirmFlightsBodySchema = z.object({
  confirmations: z.array(z.object({
    tournamentId: z.string().min(1),
    isFlight: z.boolean(),
    seriesId: z.string().nullable().optional(),
    newSeries: z.object({
      name: z.string().min(1),
      totalDay1s: z.number().int().min(0),
      day2DateTime: z.union([z.string(), z.date()]),
      stackMode: z.enum(['single', 'combined']),
      network: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    }).optional(),
  })).max(50, 'max 50 confirmations per batch'),
}).superRefine((data, ctx) => {
  // Verifica duplicatas em tournamentIds.
  const ids = data.confirmations.map((c) => c.tournamentId);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'duplicate tournamentIds',
      path: ['confirmations'],
    });
  }
  // isFlight=true exige seriesId OU newSeries.
  for (let i = 0; i < data.confirmations.length; i++) {
    const c = data.confirmations[i];
    if (c.isFlight && !c.seriesId && !c.newSeries) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'isFlight=true requires seriesId or newSeries',
        path: ['confirmations', i],
      });
    }
  }
});

export async function handleConfirmFlights(req: any, res: any): Promise<void> {
  const userId = userIdOfReq(req);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  try {
    const parsed = confirmFlightsBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten?.() ?? parsed.error,
      });
      return;
    }

    const { confirmations } = parsed.data;
    let createdSeries = 0;
    let linkedToExisting = 0;
    let markedNotFlight = 0;

    // Atomico: validar todos refs primeiro, depois aplicar.
    // Pre-valida ownership de tournamentIds + seriesIds referenciados.
    for (const c of confirmations) {
      const tournament = await (storage as any).getTournamentById(c.tournamentId, userId);
      if (!tournament) {
        res.status(404).json({ message: `Tournament ${c.tournamentId} not found` });
        return;
      }
      if (c.isFlight && c.seriesId) {
        const series = await (storage as any).getSeriesById(userId, c.seriesId);
        if (!series) {
          res.status(404).json({ message: `Series ${c.seriesId} not found` });
          return;
        }
      }
    }

    // Sprint Flight-1 H1 fix (Reviewer R1): app-level rollback se erro no meio.
    // Storage methods nao aceitam tx ainda — guardamos applied stack pra reverter
    // manualmente se algo falhar (best-effort atomicity). Spec RF-07 exige atomico.
    type Applied =
      | { type: "create-series"; seriesId: string }
      | { type: "link"; tournamentId: string; prevSeriesId: string | null };
    const applied: Applied[] = [];

    try {
      for (const c of confirmations) {
        if (!c.isFlight) {
          // No-op (D10): tournament ja esta com seriesId=NULL desde insert.
          // Defesa: se tournament TEM seriesId, faz unlink.
          const tournament = await (storage as any).getTournamentById(c.tournamentId, userId);
          if (tournament?.seriesId) {
            applied.push({ type: "link", tournamentId: c.tournamentId, prevSeriesId: tournament.seriesId });
            await (storage as any).linkTournamentToSeries(userId, c.tournamentId, null);
          }
          markedNotFlight += 1;
          continue;
        }

        if (c.seriesId) {
          const tournament = await (storage as any).getTournamentById(c.tournamentId, userId);
          applied.push({ type: "link", tournamentId: c.tournamentId, prevSeriesId: tournament?.seriesId ?? null });
          await (storage as any).linkTournamentToSeries(userId, c.tournamentId, c.seriesId);
          linkedToExisting += 1;
        } else if (c.newSeries) {
          const series = await (storage as any).createSeries(userId, c.newSeries);
          applied.push({ type: "create-series", seriesId: series.id });
          const tournament = await (storage as any).getTournamentById(c.tournamentId, userId);
          applied.push({ type: "link", tournamentId: c.tournamentId, prevSeriesId: tournament?.seriesId ?? null });
          await (storage as any).linkTournamentToSeries(userId, c.tournamentId, series.id);
          createdSeries += 1;
        }
      }

      res.status(200).json({
        processed: confirmations.length,
        createdSeries,
        linkedToExisting,
        markedNotFlight,
        errors: [],
      });
    } catch (innerErr: any) {
      // Rollback best-effort: reverte na ordem inversa.
      console.error("[handleConfirmFlights] inner error, rolling back:", innerErr);
      const rollbackErrors: string[] = [];
      for (const op of applied.reverse()) {
        try {
          if (op.type === "link") {
            await (storage as any).linkTournamentToSeries(userId, op.tournamentId, op.prevSeriesId);
          } else if (op.type === "create-series") {
            await (storage as any).deleteSeries(userId, op.seriesId);
          }
        } catch (rbErr: any) {
          rollbackErrors.push(`${op.type}:${(rbErr?.message ?? rbErr)}`);
        }
      }
      res.status(500).json({
        message: "Internal error during confirm; rollback attempted",
        rollbackErrors,
      });
    }
  } catch (err: any) {
    console.error("[handleConfirmFlights] failed:", err);
    res.status(500).json({ message: "Internal error" });
  }
}

// ADR-181 §2.2 — sync path ate ASYNC_THRESHOLD; acima processa em background
// em chunks de BATCH_CHUNK, atualizando processed_count por batch. Falha de
// batch nao aborta processamento (preserva trabalho parcial).
const ASYNC_THRESHOLD = 5000;
const BATCH_CHUNK = 500;

// ADR-243: a definicao local foi removida — o mapeamento agora vive em
// server/services/tournamentInsertMapper (importado no topo) e e o MESMO para os
// tres endpoints de upload. Ver comentario do modulo para o historico.

async function processAsyncBatches(
  injectedStorage: any,
  uploadHistoryId: string,
  userPlatformId: string,
  rows: any[],
): Promise<void> {
  const total = rows.length;
  let processed = 0;
  let failedRows = 0;
  for (let i = 0; i < rows.length; i += BATCH_CHUNK) {
    const batch = rows.slice(i, i + BATCH_CHUNK);
    try {
      await injectedStorage.createTournamentsBatch(batch);
    } catch (err) {
      failedRows += batch.length;
      console.error('upload_history.batch_failed', {
        uploadHistoryId,
        batchStart: i,
        batchSize: batch.length,
        error: err instanceof Error ? err.message : String(err),
      });
      // Continua — preserva trabalho parcial conforme ADR-181.
    }
    processed = Math.min(i + batch.length, total);
    try {
      await injectedStorage.updateUploadHistory(uploadHistoryId, {
        processedCount: processed,
      });
    } catch (updateErr) {
      console.error('upload_history.update_failed', {
        uploadHistoryId,
        processed,
        error: updateErr instanceof Error ? updateErr.message : String(updateErr),
      });
    }
  }
  const successCount = total - failedRows;
  if (successCount > 0) {
    playerBundleCache.invalidate(userPlatformId);
    selectorCache.invalidateAllForUser(userPlatformId);
  }
  try {
    await injectedStorage.updateUploadHistory(uploadHistoryId, {
      status: successCount > 0 ? 'success' : 'failed',
      tournamentsCount: successCount,
    });
  } catch (finalErr) {
    console.error('upload_history.finalize_failed', {
      uploadHistoryId,
      error: finalErr instanceof Error ? finalErr.message : String(finalErr),
    });
  }
}

export async function handlePostUploadHistory(
  req: any,
  res: any,
  injectedStorage?: any,
): Promise<void> {
  const store = injectedStorage ?? storage;
  try {
    const userPlatformId = req.user?.userPlatformId;
    if (!userPlatformId || !String(userPlatformId).startsWith('USER-')) {
      res.status(401).json({ message: 'Invalid user platform ID' });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ message: 'No file uploaded' });
      return;
    }

    if (file.originalname) {
      const magicErr = validateUploadMagicBytes({ originalname: file.originalname, buffer: file.buffer });
      if (magicErr) {
        res.status(400).json({ message: magicErr });
        return;
      }
    }

    const userSettings = await store.getUserSettings(userPlatformId);
    const exchangeRates = withExchangeRateDefaults(userSettings?.exchangeRates);

    const fileContent = file.buffer.toString('utf-8');
    const parsed = await PokerCSVParser.parseCSV(fileContent, userPlatformId, exchangeRates);

    const withId = parsed.filter((t: any) => t.tournamentId && t.tournamentId.trim() !== '');
    const withoutId = parsed.filter((t: any) => !t.tournamentId || t.tournamentId.trim() === '');

    const [existingIds, existingByFields] = await Promise.all([
      store.findExistingTournamentIds(
        userPlatformId,
        withId.map((t: any) => t.tournamentId!),
      ),
      store.findExistingTournamentsByFields(
        userPlatformId,
        withoutId.map((t: any) => ({ name: t.name, datePlayed: t.datePlayed, buyIn: t.buyIn, site: t.site })),
      ),
    ]);

    const validParsed: any[] = [];
    let duplicatesIgnored = 0;
    for (const t of withId) {
      if (existingIds.has(t.tournamentId!)) {
        duplicatesIgnored++;
      } else {
        validParsed.push(t);
      }
    }
    for (const t of withoutId) {
      if (t.datePlayed) {
        const key = `${t.site}|${t.name.trim()}|${t.datePlayed.toISOString()}|${t.buyIn}`;
        if (existingByFields.has(key)) {
          duplicatesIgnored++;
        } else {
          validParsed.push(t);
        }
      } else {
        validParsed.push(t);
      }
    }

    const rows = mapParsedToInsertRows(validParsed, userPlatformId);
    const total = rows.length;

    if (total <= ASYNC_THRESHOLD) {
      const saved = await store.createTournamentsBatch(rows);
      const successCount = Array.isArray(saved) ? saved.length : total;
      if (successCount > 0) {
        playerBundleCache.invalidate(userPlatformId);
        selectorCache.invalidateAllForUser(userPlatformId);
      }
      try {
        await store.createUploadHistory({
          userId: userPlatformId,
          filename: file.originalname || 'upload.csv',
          status: successCount > 0 ? 'success' : 'failed',
          tournamentsCount: successCount,
          processedCount: successCount,
          errorMessage: null,
          duplicatesFound: duplicatesIgnored,
        });
      } catch (historyErr) {
        console.error('upload_history.create_failed_sync', historyErr);
      }
      invalidateHistoricalStatsCache(userPlatformId);
      res.status(200).json({
        message: `${successCount} tournaments uploaded successfully`,
        imported: successCount,
        tournamentsImported: successCount,
        savedCount: successCount,
        duplicates: duplicatesIgnored,
        parsed: parsed.length,
        skipped: duplicatesIgnored,
      });
      return;
    }

    const createdRecord = await store.createUploadHistory({
      userId: userPlatformId,
      filename: file.originalname || 'upload.csv',
      status: 'processing',
      tournamentsCount: total,
      processedCount: 0,
      errorMessage: null,
      duplicatesFound: duplicatesIgnored,
    });
    const uploadHistoryId = createdRecord?.id;
    if (!uploadHistoryId) {
      res.status(500).json({ message: 'Failed to enqueue async upload' });
      return;
    }

    void processAsyncBatches(store, uploadHistoryId, userPlatformId, rows).catch(async (err) => {
      console.error('upload_history.background_failed', {
        uploadHistoryId,
        error: err instanceof Error ? err.message : String(err),
      });
      try {
        await store.updateUploadHistory(uploadHistoryId, {
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      } catch {
        // ignored — log acima ja capturou
      }
    });

    res.status(202).json({
      uploadHistoryId,
      estimatedTournaments: total,
      status: 'processing',
    });
  } catch (err: any) {
    console.error('[handlePostUploadHistory] failed:', err);
    res.status(500).json({
      message: 'Failed to upload file',
      error: clientErrorDetail(err),
    });
  }
}

export async function handleGetUploadHistoryById(
  req: any,
  res: any,
  injectedStorage?: any,
): Promise<void> {
  const store = injectedStorage ?? storage;
  try {
    const userPlatformId = req.user?.userPlatformId;
    if (!userPlatformId || !String(userPlatformId).startsWith('USER-')) {
      res.status(401).json({ message: 'Invalid user platform ID' });
      return;
    }
    const { id } = req.params || {};
    if (!id) {
      res.status(400).json({ message: 'Missing upload history id' });
      return;
    }
    const row = await store.getUploadHistoryById(id, userPlatformId);
    if (!row) {
      res.status(404).json({ message: 'Upload history not found' });
      return;
    }
    // Defense-in-depth: storage ja filtra por userId, mas a checagem aqui
    // protege contra storage adapter que ignore o filtro.
    if (row.userId && row.userId !== userPlatformId) {
      res.status(404).json({ message: 'Upload history not found' });
      return;
    }
    res.status(200).json(row);
  } catch (err: any) {
    console.error('[handleGetUploadHistoryById] failed:', err);
    res.status(500).json({
      message: 'Failed to fetch upload history',
      error: clientErrorDetail(err),
    });
  }
}
