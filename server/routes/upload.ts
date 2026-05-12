import type { Express } from "express";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import { invalidateHomeOverviewCache } from "./home";
import { invalidateDashboardQuickStatsCache } from "./dashboard";
import {
  tournaments,
  uploadHistory,
} from "@shared/schema";
import multer from "multer";
import { PokerCSVParser } from "../csvParser";
import { detectFlightCandidate } from "../flightDetector";
import { enrichTournamentTypeFields } from "@shared/tournament-type-detector";
import { nanoid } from "nanoid";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { playerBundleCache } from "../services/playerBundle";
import { selectorCache } from "../services/selectorCache";

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
        let tournaments;
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

              return res.json({
                status: 'duplicates_found',
                validTournaments: parseResult.validTournaments,
                duplicateTournaments: parseResult.duplicateTournaments,
                duplicateCount: parseResult.duplicateCount,
                totalProcessed: parseResult.totalProcessed,
                duplicatesBySite,
                message: `Encontrados ${parseResult.duplicateCount} torneios duplicados de ${parseResult.totalProcessed} torneios processados`
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

        // VERIFICAR SE TOURNAMENTS TÊM USERID CORRETO
        const invalidTournaments = tournaments.filter(t => t.userId !== userPlatformId);
        if (invalidTournaments.length > 0) {
          return res.status(500).json({ message: 'Internal error: Tournament data contains incorrect user identification' });
        }

        // Convert ParsedTournament[] to InsertTournament[] and batch insert.
        // enrichTournamentTypeFields garante paridade type<->category + Satellite/Flight/Add-on.
        const tournamentsToInsert = tournaments.map(tournament => {
          const enriched = enrichTournamentTypeFields({ name: tournament.name, category: tournament.category });
          // P1 fix (2026-05-11) #2: addOnCost = stake (NOT buyIn). buyIn = stake + rake,
          // so subtract rake to get stake. Avoids double-counting rake when user adds
          // a re-buy / add-on later.
          const buyInNum = Number(tournament.buyIn ?? 0);
          const rakeNum = Number(tournament.rake ?? 0);
          const stakeOnly = Math.max(0, buyInNum - rakeNum);
          // P1 fix (2026-05-11) #3: preserve parser-provided category when it's a
          // recognized label (legacy Bounty/Knockout/Re-entry are not in PRIMARY_TYPES
          // but still meaningful as display labels). enriched.type is the SSoT for
          // the ortogonal `type` column; `category` keeps the historical string.
          const preservedCategory = (tournament.category && tournament.category.trim() !== '')
            ? tournament.category
            : enriched.type;
          return {
            userId: userPlatformId,
            name: tournament.name.trim(),
            buyIn: tournament.buyIn.toString(),
            prize: tournament.prize?.toString() || "0",
            position: tournament.position || null,
            datePlayed: tournament.datePlayed ?? new Date(),
            site: tournament.site,
            format: tournament.format,
            type: enriched.type,
            category: preservedCategory,
            isFlight: enriched.isFlight,
            allowsAddOn: enriched.allowsAddOn,
            addOnCost: enriched.allowsAddOn ? stakeOnly.toString() : null,
            allowsReentry: enriched.allowsReentry,
            speed: tournament.speed,
            fieldSize: tournament.fieldSize || null,
            finalTable: tournament.finalTable || false,
            bigHit: tournament.bigHit || false,
            currency: tournament.currency || "USD",
            prizePool: tournament.prizePool?.toString() || null,
            reentries: tournament.reentries || 0,
            tournamentId: tournament.tournamentId || null,
          };
        });

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
      let parsedData = [];

      try {
        if (isBodogFormat(file.originalname)) {
          parsedData = await PokerCSVParser.parseBodogXLSX(file.buffer, userPlatformId, exchangeRates);
        } else if (isCoinFormat(fileContent)) {
          parsedData = await PokerCSVParser.parseCoinTXT(fileContent, userPlatformId, exchangeRates);
        } else if (isCoinPokerFormat(fileContent)) {
          parsedData = await PokerCSVParser.parseCoinPokerCSV(fileContent, userPlatformId, exchangeRates);
        } else {
          parsedData = await PokerCSVParser.parseCSV(fileContent, userPlatformId, exchangeRates);
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
        fileName: file.originalname
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
      let parsedData = [];

      try {
        if (file.originalname.endsWith('.txt')) {
          parsedData = await PokerCSVParser.parseCoinTXT(fileContent, userPlatformId, exchangeRates);
        } else if (file.originalname.endsWith('.xlsx')) {
          parsedData = await PokerCSVParser.parseBodogXLSX(fileContent, userPlatformId, exchangeRates);
        } else if (PokerCSVParser.isCoinPokerFormat(fileContent)) {
          parsedData = await PokerCSVParser.parseCoinPokerCSV(fileContent, userPlatformId, exchangeRates);
        } else {
          parsedData = await PokerCSVParser.parseCSV(fileContent, userPlatformId, exchangeRates);
        }


      } catch (parseError) {
        return res.status(400).json({
          message: 'Erro ao processar arquivo',
          error: clientErrorDetail(parseError),
        });
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

      // Batch insert tournaments. enrichTournamentTypeFields garante paridade
      // type<->category + Satellite/Flight/Add-on.
      const insertData = tournamentsToSave.map(tournament => {
        const enriched = enrichTournamentTypeFields({ name: tournament.name, category: tournament.category });
        // P1 fix (2026-05-11) #2: addOnCost = stake (NOT buyIn).
        const buyInNum = Number(tournament.buyIn ?? 0);
        const rakeNum = Number(tournament.rake ?? 0);
        const stakeOnly = Math.max(0, buyInNum - rakeNum);
        // P1 fix (2026-05-11) #3: preserve parser-provided category.
        const preservedCategory = (tournament.category && tournament.category.trim() !== '')
          ? tournament.category
          : enriched.type;
        return {
          userId: userPlatformId,
          name: tournament.name.trim(),
          buyIn: tournament.buyIn.toString(),
          prize: tournament.prize?.toString() || "0",
          position: tournament.position || null,
          datePlayed: tournament.datePlayed ?? new Date(),
          site: tournament.site,
          format: tournament.format,
          type: enriched.type,
          category: preservedCategory,
          isFlight: enriched.isFlight,
          allowsAddOn: enriched.allowsAddOn,
          addOnCost: enriched.allowsAddOn ? stakeOnly.toString() : null,
          allowsReentry: enriched.allowsReentry,
          speed: tournament.speed,
          fieldSize: tournament.fieldSize || null,
          finalTable: tournament.finalTable || false,
          bigHit: tournament.bigHit || false,
          currency: tournament.currency || "USD",
          prizePool: tournament.prizePool?.toString() || null,
          reentries: tournament.reentries || 0,
          tournamentId: tournament.tournamentId || null,
        };
      });

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

      // Save upload history
      const uploadData = {
        id: nanoid(),
        userId: userPlatformId,
        filename: file.originalname,
        fileType: file.originalname.split('.').pop() || 'unknown',
        status: 'completed',
        tournamentsImported: successCount,
        duplicatesFound: duplicateTournaments.length,
        processingTime: 0,
        createdAt: new Date(),
        errorMessage: errorCount > 0 ? `${errorCount} erros durante importação` : null
      };

      await storage.createUploadHistory(uploadData);


      res.json({
        success: true,
        message: actionMessage,
        tournamentsImported: successCount,
        duplicatesProcessed: duplicateTournaments.length,
        errors: errorCount
      });

    } catch (error) {
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

      // Buscar os últimos 5 registros diretamente do banco
      const history = await db
        .select()
        .from(uploadHistory)
        .where(eq(uploadHistory.userId, userId))
        .orderBy(desc(uploadHistory.uploadDate))
        .limit(5);

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
      const tournamentsCountResult = await db
        .select({ count: sql<string>`count(*)` })
        .from(tournaments)
        .where(eq(tournaments.userId, userId));

      const totalTournaments = parseInt(tournamentsCountResult[0]?.count || '0');

      // Get unique sites count
      const sitesResult = await db
        .select({ site: tournaments.site })
        .from(tournaments)
        .where(eq(tournaments.userId, userId))
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
