import type { Express } from "express";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import {
  tournaments,
  uploadHistory,
} from "@shared/schema";
import multer from "multer";
import { PokerCSVParser } from "../csvParser";
import { nanoid } from "nanoid";
import { eq, desc, sql } from "drizzle-orm";

const upload = multer({ storage: multer.memoryStorage() });

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

      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Fetch user settings to get exchange rates
      const userSettings = await storage.getUserSettings(userId);
      const exchangeRates = userSettings?.exchangeRates || {};

      try {
        // Detect file format and use appropriate parser
        let tournaments;
        let duplicatesIgnored = 0;
        let duplicateIds: string[] = [];

        if (isBodogFormat(file.originalname)) {
          // Handle Excel files from Bodog
          tournaments = await PokerCSVParser.parseBodogXLSX(file.buffer, userPlatformId, exchangeRates);

          // Check for duplicates in parsed tournaments
          const validTournaments = [];
          for (const tournament of tournaments) {
            const isDuplicate = await storage.isDuplicateTournament(userPlatformId, tournament);
            if (isDuplicate) {
              duplicatesIgnored++;
              duplicateIds.push(tournament.tournamentId || `${tournament.name} (${tournament.datePlayed?.toISOString().split('T')[0] ?? 'unknown'})`);
            } else {
              validTournaments.push(tournament);
            }
          }
          tournaments = validTournaments;
        } else {
          // Handle text-based files (CSV/TXT)
          const fileContent = file.buffer.toString('utf-8');

          if (isCoinFormat(fileContent)) {
            tournaments = await PokerCSVParser.parseCoinTXT(fileContent, userPlatformId, exchangeRates);

            // Check for duplicates in parsed tournaments
            const validTournaments = [];
            for (const tournament of tournaments) {
              const isDuplicate = await storage.isDuplicateTournament(userPlatformId, tournament);
              if (isDuplicate) {
                duplicatesIgnored++;
                duplicateIds.push(tournament.tournamentId || `${tournament.name} (${tournament.datePlayed?.toISOString().split('T')[0] ?? 'unknown'})`);
              } else {
                validTournaments.push(tournament);
              }
            }
            tournaments = validTournaments;
          } else if (isCoinPokerFormat(fileContent)) {
            tournaments = await PokerCSVParser.parseCoinPokerCSV(fileContent, userPlatformId, exchangeRates);

            // Check for duplicates in parsed tournaments
            const validTournaments = [];
            for (const tournament of tournaments) {
              const isDuplicate = await storage.isDuplicateTournament(userPlatformId, tournament);
              if (isDuplicate) {
                duplicatesIgnored++;
                duplicateIds.push(tournament.tournamentId || `${tournament.name} (${tournament.datePlayed?.toISOString().split('T')[0] ?? 'unknown'})`);
              } else {
                validTournaments.push(tournament);
              }
            }
            tournaments = validTournaments;
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

        // Remove duplicates and save tournaments to database
        const savedTournaments = [];
        let successCount = 0;
        let errorCount = 0;
        let skippedCount = 0;

        // VERIFICAR SE TOURNAMENTS TÊM USERID CORRETO
        const invalidTournaments = tournaments.filter(t => t.userId !== userPlatformId);
        if (invalidTournaments.length > 0) {
          return res.status(500).json({ message: 'Internal error: Tournament data contains incorrect user identification' });
        }


        for (const tournament of tournaments) {
          try {
            let isDuplicate = false;

            // Special handling for Bodog Reference ID verification
            if (tournament.site === 'Bodog') {
              // Extract Reference ID from tournament name format: "MTT Bodog [REF123]"
              const refIdMatch = tournament.name.match(/\[([^\]]+)\]/);
              if (refIdMatch) {
                const referenceId = refIdMatch[1];
                isDuplicate = await storage.isBodogTournamentExists(userPlatformId, referenceId);

                if (isDuplicate) {
                  skippedCount++;
                  continue;
                }
              }
            } else {
              // Use standard duplicate check for other sites
              isDuplicate = await storage.isDuplicateTournament(userPlatformId, {
                name: tournament.name,
                datePlayed: tournament.datePlayed,
                buyIn: tournament.buyIn,
                position: tournament.position,
                fieldSize: tournament.fieldSize,
                site: tournament.site
              });
            }

            if (!isDuplicate) {
              // Convert ParsedTournament to InsertTournament format
              const tournamentData = {
                userId: userPlatformId, // SEMPRE usar userPlatformId do token JWT, nunca dados do CSV
                name: tournament.name.trim(),
                buyIn: tournament.buyIn.toString(),
                prize: tournament.prize?.toString() || "0",
                position: tournament.position || null,
                datePlayed: tournament.datePlayed ?? new Date(),
                site: tournament.site,
                format: tournament.format,
                category: tournament.category,
                speed: tournament.speed,
                fieldSize: tournament.fieldSize || null,
                finalTable: tournament.finalTable || false,
                bigHit: tournament.bigHit || false,
                currency: tournament.currency || "USD",
                prizePool: tournament.prizePool?.toString() || null,
                reentries: tournament.reentries || 0,
                tournamentId: tournament.tournamentId || null
              };

              const saved = await storage.createTournament(tournamentData);
              savedTournaments.push(saved);
              successCount++;
            } else {
              skippedCount++;
            }
          } catch (error) {
            errorCount++;
          }
        }

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
          error: parseError instanceof Error ? parseError.message : "Unknown parsing error.",
          suggestion: "Verify encoding (UTF-8 preferred), delimiter (comma expected), and that all necessary columns are present."
        });
      }
    } catch (error: any) {
      res.status(500).json({
        message: "Failed to upload file due to a server error.",
        error: error.message
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


      // CORREÇÃO CRÍTICA CNY - CARREGAR TAXAS DE CÂMBIO
      const userSettings = await storage.getUserSettings(userPlatformId);
      const exchangeRates = userSettings?.exchangeRates || {};


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
          error: parseError instanceof Error ? parseError.message : 'Erro desconhecido',
          details: parseError instanceof Error ? parseError.stack : String(parseError)
        });
      }

      if (!parsedData || parsedData.length === 0) {
        return res.status(400).json({ message: 'Nenhum torneio válido encontrado no arquivo' });
      }

      // Check for duplicates
      const validTournaments = [];
      const duplicateTournaments = [];
      const duplicatesBySite: Record<string, number> = {};

      for (const tournament of parsedData) {
        try {
          const isDuplicate = await storage.isDuplicateTournament(userPlatformId, tournament);

          if (isDuplicate) {
            duplicateTournaments.push(tournament);
            const site = tournament.site || 'Unknown';
            duplicatesBySite[site] = (duplicatesBySite[site] || 0) + 1;
          } else {
            validTournaments.push(tournament);
          }
        } catch (duplicateError) {
          // Em caso de erro, trata como não duplicado
          validTournaments.push(tournament);
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
        error: error.message,
        details: error.stack
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


      // CORREÇÃO CRÍTICA CNY - CARREGAR TAXAS DE CÂMBIO
      const userSettings = await storage.getUserSettings(userPlatformId);
      const exchangeRates = userSettings?.exchangeRates || {};


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
          error: (parseError as Error).message
        });
      }

      // Check duplicates again
      const validTournaments = [];
      const duplicateTournaments = [];

      for (const tournament of parsedData) {
        const isDuplicate = await storage.isDuplicateTournament(userPlatformId, tournament);

        if (isDuplicate) {
          duplicateTournaments.push(tournament);
        } else {
          validTournaments.push(tournament);
        }
      }

      let tournamentsToSave = [];
      let actionMessage = '';

      switch (duplicateAction) {
        case 'import_new_only':
          tournamentsToSave = validTournaments;
          actionMessage = `Importados apenas ${validTournaments.length} torneios novos. ${duplicateTournaments.length} duplicatas ignoradas.`;
          break;

        case 'import_all':
          // For import_all, we save all tournaments and let the database handle duplicates
          tournamentsToSave = [...validTournaments, ...duplicateTournaments];
          actionMessage = `Importados ${tournamentsToSave.length} torneios (incluindo ${duplicateTournaments.length} duplicatas que foram sobrescritas).`;
          break;

        default:
          return res.status(400).json({ message: 'Ação inválida' });
      }

      // Save tournaments to database
      const savedTournaments = [];
      let successCount = 0;
      let errorCount = 0;

      for (const tournament of tournamentsToSave) {
        try {
          const savedTournament = await storage.createTournament(tournament as any);
          savedTournaments.push(savedTournament);
          successCount++;
        } catch (error) {
          errorCount++;
        }
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
  app.post('/api/settings/exchange-rates', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const { CNY, EUR } = req.body;

      if (!CNY || !EUR || CNY <= 0 || EUR <= 0) {
        return res.status(400).json({ message: 'Invalid exchange rates provided' });
      }

      await storage.upsertUserSettings({
        userId,
        exchangeRates: { CNY, EUR }
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

      const exchangeRates = settings?.exchangeRates || { CNY: 7.20, EUR: 0.92 };
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
}
