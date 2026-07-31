import { Readable } from "stream";
import csv from "csv-parser";
// xlsx (SheetJS) was replaced with exceljs to drop the unpatched
// prototype-pollution + ReDoS advisories. exceljs is lazy-loaded in parseBodogXLSX
// (the only .xlsx path) to keep it out of the hot import graph.
import { detectAddonReaFromName } from "../shared/addon-rea-detector";
import { detectSatelliteFromName, detectIsFlightFromName, detectStackDepthFromName } from "../shared/tournament-type-detector";
import { classifySpeed } from "../shared/speed-detector";
import { parseSharkscopeFlags } from "../shared/sharkscope-flags";
import { wallClockToUtc, timezoneFromHeader } from "../shared/wallclock-timezone";

export interface ParsedTournament {
  userId: string; // 🎯 ETAPA 2.2: Este campo é preenchido pelo contexto de autenticação, nunca pelos dados CSV
  tournamentId?: string; // External tournament ID from poker sites
  name: string;
  buyIn: number; // Changed to number for internal calculations
  prize: number; // Changed to number for internal calculations (net profit)
  position: number;
  datePlayed: Date | null;
  site: string;
  format: string;
  category: string;
  speed: string;
  fieldSize: number;
  currency: string; // Original currency from CSV before conversion
  finalTable: boolean;
  bigHit: boolean;
  prizePool?: number; // Total prize pool of the tournament
  reentries?: number;
  rake?: number; // Added rake
  convertedToUSD?: boolean; // Flag to indicate if currency conversion happened
  bountyPrize?: number | null; // Bounty/knockout prize (SharkScope PKO tournaments)
  // Add-on + Re-entry (ADR-014)
  allowsAddOn?: boolean;
  addOnCost?: number | null;
  allowsReentry?: boolean;
  maxReentries?: number | null;
  // Sprint library-evolution Fase 3 — campos antes descartados do Sharkscope.
  durationSeconds?: number | null;
  playersPerTable?: number | null;
  structure?: string | null; // 'NL' | 'PL'
  gameType?: string | null; // 'Holdem' | 'Omaha'
  startingStackBb?: number | null;
  deepStack?: boolean;
  playerNick?: string; // Fase 5 Overview — nick do jogador (pool multi-jogador)
  // Sprint import-otimizacao (ADR-243 / Migration 0097). Todos opcionais:
  // parser de rede que nao tem a coluna simplesmente nao seta (null no DB).
  /** Premio BRUTO do jogador (distinto de `prize`=liquido e de `prizePool`=premiacao total). */
  grossPrize?: number | null;
  /** Fim do torneio — habilita sessao real por overlap de horario. */
  endDate?: Date | null;
  /** Total de reentradas do FIELD (nao do jogador). */
  fieldTotalEntries?: number | null;
  /** Bandeiras cruas do export (token novo nunca vira perda silenciosa). */
  flags?: string[] | null;
  /** Valores na moeda original + taxa/origem usadas na conversao para USD. */
  buyInNative?: number | null;
  prizeNative?: number | null;
  fxRateUsed?: number | null;
  fxSource?: string | null;
  /** Data (YYYY-MM-DD) da cotacao usada — cambio por data do torneio (ADR-243). */
  fxRateDate?: string | null;
  /** Fuso declarado no cabecalho do export (ex. America/Sao_Paulo). */
  sourceTimezone?: string | null;
  /** true quando o nome veio vazio no arquivo e foi sintetizado (auditoria). */
  nameSynthesized?: boolean;
}

/** Motivo de rejeicao de uma linha, devolvido no relatorio do import (ADR-243). */
export interface RejectedRow {
  rowNum: number;
  reason: string;
  /** Linha crua (para o jogador conseguir achar no arquivo). */
  rowData?: Record<string, any>;
}

export interface ParseReport {
  /** Linhas de dado lidas do arquivo (exclui cabecalho). */
  rowsInFile: number;
  /** Linhas que viraram torneio. */
  parsedCount: number;
  /** Linhas descartadas, com motivo. */
  rejected: RejectedRow[];
}

export interface ParseResultDetailed {
  tournaments: ParsedTournament[];
  report: ParseReport;
}

/**
 * Motivo legivel (PT-BR) da rejeicao de uma linha (ADR-243). Puro.
 * `null` = o parser da rede nao reconheceu a linha; caso contrario diz QUAL
 * campo obrigatorio faltou, para o jogador conseguir corrigir o arquivo.
 */
export function describeRejection(t: ParsedTournament | null | undefined): string {
  if (!t) return 'linha nao reconhecida pelo parser da rede (colunas ausentes ou formato inesperado)';
  const missing: string[] = [];
  if (!t.name || String(t.name).trim() === '') missing.push('nome do torneio');
  if (!(typeof t.buyIn === 'number') || !Number.isFinite(t.buyIn) || t.buyIn < 0) missing.push('buy-in valido');
  if (!(t.datePlayed instanceof Date) || isNaN(t.datePlayed.getTime())) missing.push('data valida');
  return missing.length > 0
    ? `campo obrigatorio ausente/invalido: ${missing.join(', ')}`
    : 'linha rejeitada por validacao do parser';
}

/**
 * Converte uma string de duracao do Sharkscope em segundos. Aceita:
 *   "4980" (ja em segundos), "1h 23m", "01:23:00" (h:m:s), "83m", "83:00" (m:s).
 * Retorna null para vazio/invalido (null = desconhecido, distinto de 0).
 */
export function parseDurationToSeconds(raw: any): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toLowerCase();
  if (s === "") return null;

  // hh:mm:ss ou mm:ss
  if (/^\d{1,3}(:\d{1,2}){1,2}$/.test(s)) {
    const parts = s.split(":").map((p) => parseInt(p, 10));
    if (parts.some((n) => Number.isNaN(n))) return null;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return parts[0] * 60 + parts[1]; // mm:ss
  }

  // "1h 23m 45s" / "1h23m" / "83m"
  if (/[hms]/.test(s)) {
    const h = s.match(/(\d+)\s*h/);
    const m = s.match(/(\d+)\s*m/);
    const sec = s.match(/(\d+)\s*s/);
    if (!h && !m && !sec) return null;
    return (
      (h ? parseInt(h[1], 10) * 3600 : 0) +
      (m ? parseInt(m[1], 10) * 60 : 0) +
      (sec ? parseInt(sec[1], 10) : 0)
    );
  }

  // numero puro = segundos
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Normaliza a estrutura ("No Limit" -> 'NL', "Pot Limit" -> 'PL'). */
export function normalizeStructure(raw: any): string | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  if (s === "") return null;
  if (s.includes("pot")) return "PL";
  if (s.includes("no limit") || s === "nl" || s.includes("no-limit")) return "NL";
  if (s.includes("fixed") || s.includes("limit")) return "FL";
  return null;
}

/** Normaliza o jogo ("H"/"Holdem" -> 'Holdem', "O"/"Omaha" -> 'Omaha'). */
export function normalizeGame(raw: any): string | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  if (s === "") return null;
  if (s === "h" || s.includes("hold")) return "Holdem";
  if (s === "o" || s.includes("omaha") || s.includes("plo")) return "Omaha";
  return null;
}

export class PokerCSVParser {
  // Helper function to detect CoinPoker CSV format
  static isCoinPokerFormat(fileContent: string): boolean {
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

  // 🎯 ETAPA 2.2: userId é sempre do contexto de autenticação (userPlatformId), nunca dos dados CSV
  static async parseCoinTXT(fileContent: string, userId: string, exchangeRates: Record<string, number> = {}): Promise<ParsedTournament[]> {
    const tournaments: ParsedTournament[] = [];
    const lines = fileContent.split('\n').filter(line => line.trim());

    // Skip the header line
    const dataLines = lines.slice(1);

    // Parse all withdrawals and deposits first
    const withdrawals: Array<{
      amount: number;
      name: string;
      date: Date;
      line: string;
      index: number;
      used: boolean;
    }> = [];

    const deposits: Array<{
      amount: number;
      name: string;
      date: Date;
      line: string;
      index: number;
      used: boolean;
    }> = [];

    // First pass: collect all withdrawals and deposits
    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i].trim();

      if (line.includes('Withdrawal')) {
        const withdrawalData = this.parseCoinLine(line, 'Withdrawal');
        if (withdrawalData) {
          withdrawals.push({
            ...withdrawalData,
            index: i,
            used: false
          });
        }
      } else if (line.includes('Deposit')) {
        const depositData = this.parseCoinLine(line, 'Deposit');
        if (depositData) {
          deposits.push({
            ...depositData,
            index: i,
            used: false
          });
        }
      }
    }

    // Second pass: pair withdrawals with deposits using flexible matching
    const pairedTournaments: Set<string> = new Set(); // Track tournament name + date to avoid duplicates

    for (const withdrawal of withdrawals) {
      if (withdrawal.used) continue;

      // Find the first unused deposit that matches criteria:
      // 1. Same tournament name
      // 2. Date equal or after withdrawal date
      // 3. Not already used
      const matchingDeposit = deposits.find(deposit => 
        !deposit.used &&
        deposit.name === withdrawal.name &&
        deposit.date >= withdrawal.date
      );

      if (matchingDeposit) {
        // Create unique key for tournament duplication check
        const tournamentKey = `${withdrawal.name}_${withdrawal.date.toISOString().split('T')[0]}`;

        // Check for duplicates before creating tournament
        if (!pairedTournaments.has(tournamentKey)) {
          const tournament: ParsedTournament = {
            userId,
            name: withdrawal.name,
            buyIn: withdrawal.amount,
            prize: matchingDeposit.amount - withdrawal.amount, // Net profit
            position: 0, // Always N/A for Coin network
            datePlayed: withdrawal.date,
            site: 'Coin',
            format: 'MTT',
            category: this.detectCoinCategory(withdrawal.name),
            speed: this.detectCoinSpeed(withdrawal.name),
            fieldSize: 0, // Not available in Coin format
            currency: 'USDT',
            finalTable: false,
            bigHit: (matchingDeposit.amount - withdrawal.amount) > (withdrawal.amount * 10),
            prizePool: 0,
            reentries: 0,
            rake: 0,
            convertedToUSD: false
          };

          tournaments.push(tournament);
          pairedTournaments.add(tournamentKey);
        }

        // Mark both as used to prevent re-pairing
        withdrawal.used = true;
        matchingDeposit.used = true;
      }
    }

    return tournaments;
  }

  private static parseCoinLine(line: string, type: 'Withdrawal' | 'Deposit'): {
    amount: number;
    name: string;
    date: Date;
    line: string;
  } | null {
    try {
      // Extract amount - pattern: "Withdrawal-25 USDT" or "Deposit 131.25 USDT"
      const amountMatch = type === 'Withdrawal' 
        ? line.match(/Withdrawal-(\d+(?:\.\d+)?)\s+USDT/)
        : line.match(/Deposit\s+(\d+(?:\.\d+)?)\s+USDT/);

      if (!amountMatch) return null;

      const amount = parseFloat(amountMatch[1]);

      // Extract tournament name - between "?" and date
      const nameMatch = line.match(/\?\s*([^?]+?)\s+(\d{4}-\d{2}-\d{2})/);
      if (!nameMatch) return null;

      const name = nameMatch[1].trim();

      // Extract date - pattern: "2025-01-02 22:10:38"
      const dateMatch = line.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/);
      if (!dateMatch) return null;

      // P0 fix (2026-05-10): force UTC parsing when CSV has no TZ marker.
      const date = new Date(`${dateMatch[1]}T${dateMatch[2]}Z`);

      return {
        amount,
        name,
        date,
        line
      };
    } catch (error) {
      return null;
    }
  }

  private static detectCoinCategory(name: string): string {
    const upperName = name.toUpperCase();

    if (upperName.includes('PKO')) {
      return 'PKO';
    }

    return 'Vanilla';
  }

  private static detectCoinSpeed(name: string): string {
    // CoinPoker: keywords Sprint/Bolt/Flash/Rapido ja cobertas pelo detector
    // compartilhado (TURBO_RE) + Hyper. Mantido como metodo p/ os callsites.
    return classifySpeed(name);
  }

  // 🎯 ETAPA 2.2: userId é sempre do contexto de autenticação (userPlatformId), nunca dos dados CSV
  static async parseBodogXLSX(fileBuffer: Buffer, userId: string, exchangeRates: Record<string, number> = {}): Promise<ParsedTournament[]> {
    const tournaments: ParsedTournament[] = [];

    try {
      // Read Excel file with exceljs (replaces xlsx/SheetJS — see import note).
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(fileBuffer as any);
      const worksheet = workbook.worksheets[0]; // Use first sheet
      if (!worksheet) throw new Error('No worksheet in workbook');

      // Bodog statements have 4 header rows; the ledger starts at row 5.
      // Columns A..D map to date / description / referenceId / cashAmount
      // (mirrors the previous `sheet_to_json({ range: 4, header: [...] })`).
      const cellValue = (raw: unknown): any => {
        if (raw && typeof raw === 'object') {
          const o = raw as any;
          if ('result' in o) return o.result;       // formula cell -> computed value
          if ('text' in o) return o.text;           // hyperlink / rich text -> plain text
          if ('richText' in o && Array.isArray(o.richText)) return o.richText.map((p: any) => p.text).join('');
        }
        return raw;
      };
      const jsonData: Array<{ date: any; description: any; referenceId: any; cashAmount: any }> = [];
      worksheet.eachRow({ includeEmpty: false }, (row: any, rowNumber: number) => {
        if (rowNumber <= 4) return; // skip the 4 header rows
        jsonData.push({
          date: cellValue(row.getCell(1).value),
          description: cellValue(row.getCell(2).value),
          referenceId: cellValue(row.getCell(3).value),
          cashAmount: cellValue(row.getCell(4).value),
        });
      });

      // Maps to store Buy-ins and Payouts by Reference ID (ensuring uniqueness)
      const buyInsByRefId = new Map<string, {
        date: Date;
        referenceId: string;
        amount: number;
      }>();

      const payoutsByRefId = new Map<string, {
        date: Date;
        referenceId: string;
        amount: number;
      }>();

      // First pass: collect all Buy-ins and Payouts, ensuring unique Reference IDs
      for (const row of jsonData as any[]) {
        if (!row.description || !row.referenceId || !row.cashAmount) continue;

        const description = String(row.description).trim();
        const referenceId = String(row.referenceId).trim();
        const cashAmount = parseFloat(row.cashAmount) || 0;

        if (description === 'Poker Multi Table Tournament Buy-In' && cashAmount < 0) {
          // Buy-in entry (negative amount) - only store if we haven't seen this Reference ID
          if (!buyInsByRefId.has(referenceId)) {
            const date = this.parseBodogDate(row.date);
            if (date) {
              buyInsByRefId.set(referenceId, {
                date,
                referenceId,
                amount: Math.abs(cashAmount) // Store as positive for buy-in
              });
            }
          }
        } else if (description === 'Poker Multi Table Tournament Cashout/Payout' && cashAmount > 0) {
          // Payout entry (positive amount) - only store if we haven't seen this Reference ID
          if (!payoutsByRefId.has(referenceId)) {
            const date = this.parseBodogDate(row.date);
            if (date) {
              payoutsByRefId.set(referenceId, {
                date,
                referenceId,
                amount: cashAmount
              });
            }
          }
        }
      }

      // Second pass: create tournaments from unique Reference IDs with Buy-ins
      const processedRefIds = new Set<string>(); // Final deduplication check

      buyInsByRefId.forEach((buyIn, referenceId) => {
        // Ensure we haven't already processed this Reference ID
        if (processedRefIds.has(referenceId)) {
          return;
        }

        // Find matching payout with same Reference ID
        const matchingPayout = payoutsByRefId.get(referenceId);

        const prize = matchingPayout ? matchingPayout.amount : 0;
        const profit = prize - buyIn.amount; // Net profit

        const tournament: ParsedTournament = {
          userId,
          name: `Vanilla $${buyIn.amount}`, // Based on buy-in amount as specified
          buyIn: buyIn.amount,
          prize: profit,
          position: 0, // Not available - use null equivalent 
          datePlayed: buyIn.date,
          site: 'Bodog',
          format: 'MTT',
          category: 'Vanilla', // Fixed as "Vanilla"
          speed: 'Normal', // Default assumption
          fieldSize: 0, // Not available
          currency: 'USD', // Values are in USD
          finalTable: false,
          bigHit: profit > (buyIn.amount * 10),
          prizePool: 0,
          reentries: 0,
          rake: 0, // null - not provided as specified
          convertedToUSD: false
        };

        tournaments.push(tournament);
        processedRefIds.add(referenceId);

      });


    } catch (error) {
      throw new Error('Failed to parse Bodog Excel file');
    }

    return tournaments;
  }

  private static parseBodogDate(dateValue: any): Date | null {
    if (!dateValue) return null;

    try {
      // exceljs hands back a real Date object for date-formatted cells.
      if (dateValue instanceof Date) {
        return isNaN(dateValue.getTime()) ? null : dateValue;
      }

      // Handle Excel serial date numbers
      if (typeof dateValue === 'number') {
        // Excel date serial number to JavaScript Date
        const excelEpoch = new Date(1900, 0, 1);
        const jsDate = new Date(excelEpoch.getTime() + (dateValue - 2) * 24 * 60 * 60 * 1000);
        return jsDate;
      }

      // Handle string dates in format: "jun. 27/25 10:23:00 PM"
      if (typeof dateValue === 'string') {
        const dateStr = dateValue.trim();

        // Try to parse Bodog specific format: "jun. 27/25 10:23:00 PM"
        const bodogDateMatch = dateStr.match(/(\w{3})\.\s*(\d{1,2})\/(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i);
        if (bodogDateMatch) {
          const [, monthStr, day, year, hour, minute, second, ampm] = bodogDateMatch;

          // Convert abbreviated month to number (0-based)
          const monthMap: Record<string, number> = {
            'jan': 0, 'fev': 1, 'mar': 2, 'abr': 3, 'mai': 4, 'jun': 5,
            'jul': 6, 'ago': 7, 'set': 8, 'out': 9, 'nov': 10, 'dez': 11,
            'feb': 1, 'apr': 3, 'may': 4, 'aug': 7, 'sep': 8, 'oct': 9, 'dec': 11
          };

          const month = monthMap[monthStr.toLowerCase()];
          if (month === undefined) return null;

          // Convert 2-digit year to 4-digit (assuming 20xx)
          const fullYear = 2000 + parseInt(year);

          // Convert 12-hour to 24-hour format
          let hour24 = parseInt(hour);
          if (ampm.toLowerCase() === 'pm' && hour24 !== 12) {
            hour24 += 12;
          } else if (ampm.toLowerCase() === 'am' && hour24 === 12) {
            hour24 = 0;
          }

          return new Date(fullYear, month, parseInt(day), hour24, parseInt(minute), parseInt(second));
        }

        // Fallback to standard date parsing
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  // 🎯 ETAPA 2.2: userId é sempre do contexto de autenticação (userPlatformId), nunca dos dados CSV
  static async parseCoinPokerCSV(fileContent: string, userId: string, exchangeRates: Record<string, number> = {}): Promise<ParsedTournament[]> {
    const tournaments: ParsedTournament[] = [];
    const lines = fileContent.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      return tournaments;
    }

    // Parse all valid transactions
    const transactions: Array<{
      description: string;
      amount: number;
      dateStr: string;
      date: Date;
      tournamentName: string;
    }> = [];

    for (let i = 1; i < lines.length; i++) { // Skip header
      const line = lines[i];

      // Parse CSV manually (handling commas in description)
      const matches = line.match(/^([^,]*),([^,]*),([^,]*),([^,]*),([^,]*)$/);
      if (!matches) continue;

      const [, type, description, amountStr, dateStr, status] = matches;

      // Rule 1: Skip if not NL Hold'em
      if (!description.trim().startsWith('NL Hold\'em')) continue;

      // Rule 2: Extract tournament name after ?
      const questionMarkIndex = description.indexOf('?');
      if (questionMarkIndex === -1) continue;

      const tournamentName = description.substring(questionMarkIndex + 1).trim();
      if (!tournamentName) continue;

      // Parse amount (remove USDT suffix)
      const cleanAmount = amountStr.trim().replace(' USDT', '');
      const amount = parseFloat(cleanAmount);
      if (isNaN(amount)) continue;

      // Rule 2: Extract date part (YYYY-MM-DD)
      const dateMatch = dateStr.match(/(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch) continue;

      const dateOnlyStr = dateMatch[1];
      // P0 fix (2026-05-10): force UTC parsing for date-only strings to keep
      // re-imports stable across TZs.
      const date = new Date(`${dateOnlyStr}T00:00:00Z`);
      if (isNaN(date.getTime())) continue;

      transactions.push({
        description: description.trim(),
        amount,
        dateStr: dateOnlyStr,
        date,
        tournamentName
      });
    }

    // Rule 3: Group by tournament name and date
    const tournamentGroups = new Map<string, typeof transactions>();

    for (const transaction of transactions) {
      const key = `${transaction.tournamentName}_${transaction.dateStr}`;
      if (!tournamentGroups.has(key)) {
        tournamentGroups.set(key, []);
      }
      tournamentGroups.get(key)!.push(transaction);
    }

    // Rule 3: Process each tournament group - must have exactly one buy-in (negative) and one result (0 or positive)
    for (const [key, group] of Array.from(tournamentGroups.entries())) {
      const buyIns = group.filter(t => t.amount < 0);
      const results = group.filter(t => t.amount >= 0);

      // Rule 6: If same tournament appears more than twice, treat as separate instances
      const maxInstances = Math.min(buyIns.length, results.length);

      for (let i = 0; i < maxInstances; i++) {
        const buyIn = buyIns[i];
        const result = results[i];

        // Rule 4: Build tournament record
        const buyInAmount = Math.abs(buyIn.amount);
        const prizeAmount = result.amount;

        // Calculate profit using universal formula: Prize - Buy-in
        const profit = prizeAmount - buyInAmount;

        // Convert date to DD-MM-YYYY format for display (but store as Date object)
        const dateParts = buyIn.dateStr.split('-');
        const formattedDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;

        const tournament: ParsedTournament = {
          userId,
          name: buyIn.tournamentName, // Rule 4: Tournament name from text after ?
          buyIn: buyInAmount, // Rule 4: Absolute value of negative amount
          prize: profit, // Net profit (prize minus buy-in)
          position: 0, // Rule 4: Position null (not available)
          datePlayed: buyIn.date, // Rule 4: Date as Date object
          site: 'CoinPoker', // Rule 4: Site = "CoinPoker"
          format: this.detectFormat(buyIn.tournamentName),
          category: this.detectCoinPokerCategory(buyIn.tournamentName),
          speed: this.detectCoinPokerSpeed(buyIn.tournamentName),
          fieldSize: 0, // Not available in CoinPoker CSV
          currency: 'USD', // Rule 5: USDT treated as USD
          finalTable: false, // Can't determine without position
          bigHit: profit > buyInAmount * 10,
          prizePool: prizeAmount > 0 ? prizeAmount : undefined,
          reentries: 0,
          rake: 0, // Rule 4: Rake = 0
          convertedToUSD: false, // Rule 5: No conversion needed
        };

        tournaments.push(tournament);
      }
    }

    return tournaments;
  }

  private static detectCoinPokerCategory(name: string): string {
    const upperName = name.toUpperCase();

    if (upperName.includes('MYSTERY')) return 'Mystery';
    if (upperName.includes('BOUNTY') || upperName.includes('PKO') || upperName.includes('KNOCKOUT')) return 'PKO';

    return 'Vanilla';
  }

  private static detectCoinPokerSpeed(name: string): string {
    const upperName = name.toUpperCase();

    if (upperName.includes('HYPER')) return 'Hyper';
    if (upperName.includes('TURBO')) return 'Turbo';

    return 'Normal';
  }

  // Helper function to normalize Portuguese headers to English
  private static normalizePortugueseHeaders(row: any): any {
    const headerMap: Record<string, string> = {
      'Rede': 'Network',
      'Jogador': 'Player',
      'ID do Jogo': 'Game ID',
      'Reentradas/Recompras': 'ReEntries/Rebuys',
      'Participantes': 'Entrants',
      'Posição': 'Position',
      'Resultado': 'Result',
      'Resultado (incluindo Rake)': 'Result Including Rake',
      'Bandeiras': 'Flags',
      'Velocidade': 'Speed',
      'Moeda': 'Currency',
      'Data': 'Date',
      'Data de Início': 'Start Date',
      'Data de Conclusão': 'End Date',
      'Nome': 'Name',
      'Prêmio': 'Prize Pool',
      'Prêmio de Recompensa': 'Bounty Prize',
      'Jogadores por mesa': 'Players Per Table',
      'Duração': 'Duration',
      'Jogo': 'Game',
      'Estrutura': 'Structure',
      'Total de Reentradas': 'Total ReEntries'
    };

    const normalizedRow: any = {};

    // Copy all existing keys first
    for (const key in row) {
      normalizedRow[key] = row[key];
    }

    // Map cada coluna do CSV para o nome ingles. Tolerante a:
    //   1. espaco a esquerda (separador ", " do Sharkscope) -> trim
    //   2. sufixo de timezone tipo "Data de Início (America/Sao_Paulo)" -> tenta
    //      match exato primeiro (preserva "Resultado (incluindo Rake)"), depois
    //      remove o "(...)" final e tenta de novo.
    for (const rawKey in row) {
      const trimmed = rawKey.trim();
      let english = headerMap[trimmed];
      if (!english) {
        const stripped = trimmed.replace(/\s*\([^)]*\)\s*$/, "").trim();
        english = headerMap[stripped];
      }
      if (english && normalizedRow[english] === undefined) {
        normalizedRow[english] = row[rawKey];
        normalizedRow[` ${english}`] = row[rawKey]; // space-prefixed tambem
      }
    }

    return normalizedRow;
  }

  // Pre-process CSV content to fix common formatting issues
  // Removes thousands-separator commas inside monetary values (e.g. "$5,000" -> "$5000")
  // This prevents csv-parser from splitting on commas within tournament names like "$5,000 GTD"
  private static preprocessCSV(content: string): string {
    // Match currency symbols followed by digits with thousands commas: $5,000 or €8,500 etc.
    // Replace the comma between digits so csv-parser doesn't split on it
    return content.replace(/([€$£¥₹])\s*(\d{1,3})(,\d{3})+(?!\d)/g, (match) => {
      return match.replace(/,/g, '');
    });
  }

  /**
   * ETAPA 2.2: userId é sempre do contexto de autenticação (userPlatformId).
   *
   * Assinatura preservada (Promise<ParsedTournament[]>) para nao quebrar os ~12
   * arquivos de teste + 3 endpoints que a consomem. Quem precisa do relatorio de
   * rejeicao usa `parseCSVDetailed` (ADR-243).
   */
  static async parseCSV(fileContent: string, userId: string, exchangeRates: Record<string, number> = {}): Promise<ParsedTournament[]> {
    const { tournaments } = await this.parseCSVDetailed(fileContent, userId, exchangeRates);
    return tournaments;
  }

  /**
   * Mesma logica do `parseCSV`, mas devolve tambem o relatorio do import:
   * linhas lidas, parseadas e REJEITADAS com motivo (ADR-243). Antes as
   * rejeicoes eram coletadas em `rowErrors` e descartadas ("for now, just
   * resolving tournaments") — o jogador nao tinha como saber que uma linha do
   * arquivo nao entrou.
   */
  static async parseCSVDetailed(fileContent: string, userId: string, exchangeRates: Record<string, number> = {}): Promise<ParseResultDetailed> {
    const tournaments: ParsedTournament[] = [];
    const rowErrors: { rowNum: number, error: string, rowData: any }[] = [];
    const rejected: RejectedRow[] = [];
    let rowNum = 0;
    let dataRows = 0;

    // Pre-process CSV to fix unquoted monetary commas (e.g. "$5,000 GTD" -> "$5000 GTD")
    const processedContent = this.preprocessCSV(fileContent);

    // ADR-181 kill-switch: ON emite audit log com breakdown por rede pra diff
    // manual antes do backfill historico de prize=NET canonico.
    const newPrizeSemantics = process.env.CSV_PARSER_NEW_PRIZE_SEMANTICS === 'true';

    return new Promise((resolve, reject) => {
      const stream = Readable.from(processedContent);

      stream
        .pipe(csv())
        .on('data', (data) => {
          rowNum++;
          try {

            if (this.isRowLikelyHeader(data)) {
            } else {
              dataRows++;
              const tournament = this.parsePokerSiteData(data, userId, exchangeRates);

              if (tournament &&
                  tournament.name &&
                  tournament.name.trim() !== '' &&
                  tournament.buyIn >= 0 &&
                  tournament.datePlayed instanceof Date &&
                  !isNaN(tournament.datePlayed.getTime())) {
                // Add-on + Re-entry (ADR-014) - detect from name centrally.
                // ADR-243: agora OR com o que o parser da rede ja detectou. Antes
                // sobrescrevia — as bandeiras `Rebuy` (256 linhas) e `Multi-Entry`
                // (815) do SharkScope morriam aqui e allowsAddOn/allowsReentry
                // ficavam false em 1179/1179 linhas do export real.
                const flags = detectAddonReaFromName(tournament.name);
                const addOn = flags.allowsAddOn || tournament.allowsAddOn === true;
                tournament.allowsAddOn = addOn;
                tournament.addOnCost = addOn && tournament.buyIn > 0 ? tournament.buyIn : null;
                tournament.allowsReentry = flags.allowsReentry || tournament.allowsReentry === true;
                tournament.maxReentries = tournament.maxReentries ?? null;
                tournaments.push(tournament);
              } else {
                // ADR-243: rejeicao deixa de ser silenciosa. Antes este `else`
                // era vazio — linha valida com nome ausente (4 no export real do
                // founder) desaparecia sem contagem nem aviso.
                rejected.push({
                  rowNum,
                  reason: describeRejection(tournament),
                  rowData: data,
                });
              }
            }
          } catch (error: any) {
            const errorMessage = error.message || 'Unknown error parsing row';
            rowErrors.push({ rowNum, error: errorMessage, rowData: data });
            rejected.push({ rowNum, reason: `erro ao processar linha: ${errorMessage}`, rowData: data });
          }
        })
        .on('end', () => {
          // ADR-243: rejeicoes viram log estruturado + relatorio devolvido ao
          // caller (antes o array era montado e descartado).
          if (rejected.length > 0) {
            console.warn('csvParser.rows_rejected', {
              userId,
              rowsInFile: dataRows,
              parsed: tournaments.length,
              rejected: rejected.length,
              firstReasons: rejected.slice(0, 5).map((r) => `linha ${r.rowNum}: ${r.reason}`),
            });
          }
          if (newPrizeSemantics && tournaments.length > 0) {
            const byNetwork: Record<string, number> = {};
            for (const t of tournaments) {
              const key = (t.site || 'unknown').toString().toLowerCase();
              byNetwork[key] = (byNetwork[key] || 0) + 1;
            }
            console.info('csvParser.new_prize_semantics.applied', {
              userId,
              count: tournaments.length,
              byNetwork,
            });
          }
          resolve({
            tournaments,
            report: { rowsInFile: dataRows, parsedCount: tournaments.length, rejected },
          });
        })
        .on('error', (error) => {
          reject(new Error(`CSV Stream Error: ${error.message}`));
        });
    });
  }

  private static isRowLikelyHeader(row: any): boolean {
    // Only check values for header keywords, not keys (column names)
    const rowValues = Object.values(row).map(val => String(val).toLowerCase());

    // Check if multiple header keywords appear in the VALUES of this row
    const headerKeywords = ['tournament', 'buy-in', 'buyin', 'stake', 'date', 'player', 'network', 'rede', 'nome', 'data e hora', 'jogador', 'posição', 'participantes'];
    let keywordCount = 0;

    for (const keyword of headerKeywords) {
      if (rowValues.some(value => value.includes(keyword))) {
        keywordCount++;
      }
    }

    // Only consider it a header if it has multiple header keywords in values
    // AND the first value looks like a header (not actual data)
    const firstValue = String(Object.values(row)[0] || '').toLowerCase();
    const isFirstValueHeader = headerKeywords.some(keyword => firstValue.includes(keyword));

    return keywordCount >= 3 && isFirstValueHeader;
  }


  // 🎯 ETAPA 2.2: userId é sempre do contexto de autenticação (userPlatformId), nunca dos dados CSV
  private static parsePokerSiteData(row: any, userId: string, exchangeRates: Record<string, number>): ParsedTournament | null {
    
    // Normalize Portuguese headers to English
    const normalizedRow = this.normalizePortugueseHeaders(row);
    
    // SharkScope format detection: has "Resultado (incluindo Rake)" column (profit already includes rake)
    const isSharkScope = normalizedRow['Result Including Rake'] !== undefined
      || normalizedRow['Resultado (incluindo Rake)'] !== undefined
      || normalizedRow[' Resultado (incluindo Rake)'] !== undefined;
    if (isSharkScope) {
      return this.parseSharkScopeFormat(normalizedRow, userId, exchangeRates);
    }

    // Network-based site detection with priority
    const networkValue = normalizedRow['Network'] || normalizedRow['Rede'] || normalizedRow['network'] || normalizedRow['rede'];
    
    if (networkValue) {
      const networkNormalized = networkValue.toString().trim().toLowerCase();

      // Priority 1: Check specific network values (case-insensitive)
      if (networkNormalized === 'pokerstars' || networkNormalized === 'ps') {
        return this.parsePokerStarsFormat(normalizedRow, userId, exchangeRates);
      }

      if (networkNormalized === '888poker' || networkNormalized === '888' || networkNormalized === 'eight88') {
        return this.parse888PokerFormat(normalizedRow, userId, exchangeRates);
      }

      if (networkNormalized === 'wpn') {
        return this.parseWPNNetworkFormat(normalizedRow, userId, exchangeRates);
      }

      if (networkNormalized === 'chico' || networkNormalized === 'chicopoker') {
        return this.parseChicoNetworkFormat(normalizedRow, userId, exchangeRates);
      }

      if (networkNormalized === 'partypoker' || networkNormalized === 'party') {
        return this.parsePartyPokerFormat(normalizedRow, userId, exchangeRates);
      }

      if (networkNormalized === 'ggnetwork' || networkNormalized === 'ggpoker') {
        return this.parseGGPokerFormat(normalizedRow, userId, exchangeRates);
      }

      if (networkNormalized === 'ipoker') {
        return this.parseIPokerFormat(normalizedRow, userId, exchangeRates);
      }

      if (networkNormalized === 'revolution' || networkNormalized === 'revolutionpoker') {
        return this.parseGenericNetworkFormat(normalizedRow, userId, exchangeRates, 'Revolution');
      }

      // Generic network handling for unrecognized networks
      return this.parseGenericNetworkFormat(normalizedRow, userId, exchangeRates, networkValue);
    }
    
    // Priority 2: Column structure detection for CSV files without Network field
    const hasName = normalizedRow['Name'] || normalizedRow['Nome'] || normalizedRow['Tournament'] || normalizedRow['Torneio'];
    const hasBuyIn = normalizedRow['Buy-in'] || normalizedRow['Stake'] || normalizedRow['Buy-In'] || normalizedRow['Buyin'] || normalizedRow['buy_in'];
    const hasDate = normalizedRow['Date'] || normalizedRow['Data'] || normalizedRow['Data e Hora'] || normalizedRow['date'];
    const hasResult = normalizedRow['Result'] || normalizedRow['Resultado'] || normalizedRow['Prize'] || normalizedRow['Prêmio'];
    const hasPosition = normalizedRow['Position'] || normalizedRow['Posição'] || normalizedRow['Pos'] || normalizedRow['position'];
    
    
    if (hasName && hasBuyIn && hasDate && hasResult && hasPosition) {
      return this.parseBrazilianFormat(normalizedRow, userId, exchangeRates);
    }
    
    // Priority 3: Generic format without forcing any specific site
    return this.parseGenericNetworkFormat(normalizedRow, userId, exchangeRates, 'Generic');
  }



  // Helper to safely parse float, returning 0 for errors or empty strings
  private static parseFloatSafe(value: any, defaultValue = 0): number {
    if (value === null || value === undefined || String(value).trim() === '') {
      return defaultValue;
    }
    const parsed = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
    return isNaN(parsed) ? defaultValue : parsed;
  }

  // P1 fix (2026-05-10): normalize currency codes coming from CSV (whitespace + case + alias).
  // Known list mirrors common Sharkscope/native exports: USD, BRL, EUR, CNY, GBP, CAD, AUD, USDT,
  // JPY, CHF. Falls back to USD when input is null/empty. Returns the upper-cased + trimmed
  // string when the input doesn't match any known alias — callers handle missing rates downstream.
  //
  // Made public (P1 2026-05-11) so the helper is reachable from the route-level dispatcher and
  // unit tests; also re-exported through normalizeCsvCurrency below.
  public static readonly KNOWN_CURRENCIES = new Set([
    'USD', 'BRL', 'EUR', 'CNY', 'GBP', 'CAD', 'AUD', 'USDT', 'JPY', 'CHF',
  ]);
  public static normalizeCurrency(value: any): string {
    if (value === null || value === undefined) return 'USD';
    const cleaned = String(value).trim().toUpperCase();
    if (cleaned === '') return 'USD';
    // Common aliases.
    if (cleaned === 'US$' || cleaned === 'USDOLLAR') return 'USD';
    if (cleaned === 'R$') return 'BRL';
    if (cleaned === '€') return 'EUR';
    if (cleaned === '£') return 'GBP';
    if (cleaned === '¥') return 'CNY';
    if (cleaned === 'TETHER') return 'USDT';
    return cleaned;
  }

  /**
   * Strict normalizer for callers that need to reject invalid currency codes.
   * Returns null if value can't be mapped to any known fiat/crypto code.
   *
   * P1 fix (2026-05-11): used by dispatcher to defensive-validate the exchange-rate
   * map before passing to parser. Empty/null inputs are NOT errors — defaults to USD.
   */
  public static normalizeCurrencyStrict(value: any): string | null {
    if (value === null || value === undefined) return 'USD';
    const cleaned = String(value).trim().toUpperCase();
    if (cleaned === '') return 'USD';
    const normalized = PokerCSVParser.normalizeCurrency(cleaned);
    return PokerCSVParser.KNOWN_CURRENCIES.has(normalized) ? normalized : null;
  }

  // Helper to safely parse int, returning 0 for errors or empty strings
  private static parseIntSafe(value: any, defaultValue = 0): number {
    if (value === null || value === undefined || String(value).trim() === '') {
      return defaultValue;
    }
    const parsed = parseInt(String(value).replace(/[^0-9-]/g, ''), 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }


  private static parsePokerStarsFormat(row: any, userId: string, exchangeRates: Record<string, number> = {}): ParsedTournament | null {

    // PokerStars CSV structure (similar to PartyPoker with leading spaces):
    // Network: "PokerStars"
    // " Player": "Docari Agnol"
    // " Game ID": 3907052694 (Tournament ID)
    // " Stake": 50.0 (Buy-in)
    // " Date": "2025-07-13 17:45"
    // " Entrants": 2106 (Field size)
    // " Rake": 5.0 (Rake)
    // " Result": 546.94 (Net result)
    // " Position": 20 (Final position)
    // " Flags": "Bounty Multi-Entry" (Category info)
    // " Currency": "USD"
    // " Name": "Mystery Bounty Series 02: $55 NLHE..."

    const name = row[' Name'] || row['Name'] || '';
    const gameId = row[' Game ID'] || row['Game ID'] || '';


    if (!name.trim()) {
      return null;
    }

    // Currency conversion for PokerStars
    // P1 fix (2026-05-10): normalize currency before lookup.
    let originalCurrency = PokerCSVParser.normalizeCurrency(row[' Currency'] || row['Currency'] || 'USD');
    let conversionRate = 1.0;
    let convertedToUSD = false;

    if (originalCurrency !== 'USD' && exchangeRates && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    }

    // Parse PokerStars specific fields (handle column names with spaces)
    const stake = this.parseFloatSafe(row[' Stake'] || row['Stake']) / conversionRate;
    const rake = this.parseFloatSafe(row[' Rake'] || row['Rake']) / conversionRate;
    const result = this.parseFloatSafe(row[' Result'] || row['Result']) / conversionRate;


    // Calculate buy-in and profit for PokerStars
    const buyIn = stake + rake; // Total tournament cost
    const profit = result; // Result is already net profit in PokerStars format

    const position = Math.max(0, this.parseIntSafe(row[' Position'] || row['Position']));
    const fieldSize = this.parseIntSafe(row[' Entrants'] || row['Entrants']);

    // Parse reentries for PokerStars
    const playerReentriesNumber = this.parseIntSafe(row[' ReEntries/Rebuys'] || row['ReEntries/Rebuys']);



    // Parse date with detailed logging
    const parsedDate = this.parseDate(row[' Date'] || row['Date']);

    const tournamentId = gameId?.toString().trim();
    const flags = row[' Flags'] || row['Flags'] || '';
    const speed = (row[' Speed'] || row['Speed']) || '';


    const parsedTournament = {
      userId,
      tournamentId: tournamentId,
      name: name,
      buyIn: buyIn,
      prize: profit, // Net profit
      position: position,
      datePlayed: parsedDate,
      site: 'PokerStars',
      format: this.detectFormat(name),
      category: this.detectCategory(name, flags),
      speed: this.detectSpeed(speed, name),
      fieldSize: fieldSize,
      currency: originalCurrency,
      finalTable: (position > 0 && (position <= 9 || position <= Math.ceil(fieldSize * 0.1))),
      bigHit: (profit > buyIn * 10 && buyIn > 0),
      convertedToUSD: convertedToUSD,
      reentries: playerReentriesNumber,
    };


    // Final validation check
    const isValid = parsedTournament.name && parsedTournament.datePlayed && parsedTournament.buyIn >= 0;

    if (!isValid) {
      return null;
    }

    return parsedTournament;
  }

  private static parseGGPokerFormat(row: any, userId: string, exchangeRates: Record<string, number> = {}): ParsedTournament | null {
    const name = row['Name'] || row[' Name'] || row['Event'] || row['Tournament Name'] || '';


    // 💱 CORREÇÃO CNY - Currency conversion for GGPoker with Portuguese 'Moeda' column priority
    const stakeValue = row['Stake'] || row[' Stake'] || 0;
    let originalCurrency = 'USD'; // default

    // 1. PRIORIDADE: Coluna 'Moeda' (CSV em português)
    // P1 fix (2026-05-10): normalize via shared helper.
    if (row['Moeda'] || row[' Moeda']) {
      originalCurrency = PokerCSVParser.normalizeCurrency(row['Moeda'] || row[' Moeda']);
    }
    // 2. FALLBACK: Colunas em inglês
    else if (row['Currency'] || row[' Currency']) {
      originalCurrency = PokerCSVParser.normalizeCurrency(row['Currency'] || row[' Currency']);
    }
    // 3. ÚLTIMO RECURSO: Detectar pelo valor do stake
    else {
      originalCurrency = PokerCSVParser.normalizeCurrency(this.detectCurrency(stakeValue));
    }
    
    let conversionRate = 1.0;
    let convertedToUSD = false;


    // 🔧 CORREÇÃO CRÍTICA: Verificar se exchangeRates existe e tem a taxa
    if (originalCurrency !== 'USD' && exchangeRates && typeof exchangeRates === 'object' && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    } else {
    }


    const stake = this.parseFloatSafe(stakeValue) / conversionRate;
    const rake = this.parseFloatSafe(row['Rake'] || row[' Rake']) / conversionRate;
    const buyIn = stake + rake;
    const result = this.parseFloatSafe(row['Result'] || row[' Result']) / conversionRate;
    const prize = result - rake; // Net profit calculation
    const position = Math.max(0, this.parseIntSafe(row['Position'] || row[' Position'] || row['Rank']));


    return {
      userId,
      name: name,
      buyIn: buyIn,
      prize: prize,
      position: position,
      datePlayed: this.parseDate(row['Date'] || row[' Date'] || row['Start Time']),
      site: 'GGPoker',
      format: this.detectFormat(name),
      category: this.detectCategory(name, row['Flags'] || row[' Flags']),
      speed: this.detectSpeed(row['Speed'] || row[' Speed'], name),
      fieldSize: this.parseIntSafe(row['Entrants'] || row[' Entrants'] || row['Players'] || row['Field']),
      currency: originalCurrency,
      finalTable: (position > 0 && (position <= 9 || position <= Math.ceil(this.parseIntSafe(row['Entrants'] || row[' Entrants'] || row['Players'] || row['Field']) * 0.1))),
      bigHit: (prize > buyIn * 10 && buyIn > 0),
      convertedToUSD: convertedToUSD,
    };
  }

  private static parseBrazilianFormat(row: any, userId: string, exchangeRates: Record<string, number> = {}): ParsedTournament | null {
    // Handle Brazilian CSV format with 'Rede' column (works for multiple sites)
    // Handle column names with leading spaces (like ' Nome' instead of 'Nome')
    const name = row['Nome'] || row[' Nome'] || row['Game'] || row['Tournament'] || '';

    // Currency conversion (handle leading spaces)
    // P1 fix (2026-05-10): normalize currency before lookup.
    let originalCurrency = PokerCSVParser.normalizeCurrency(row['Moeda'] || row[' Moeda'] || this.detectCurrency(row['Stake'] || row[' Stake'] || row['Buy-in'] || 'USD'));
    let conversionRate = 1.0;
    let convertedToUSD = false;

    if (originalCurrency !== 'USD' && exchangeRates && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    }

    // Apply universal profit calculation: Resultado - Rake (handle leading spaces)
    const resultado = this.parseFloatSafe(row['Resultado'] || row[' Resultado']) / conversionRate;
    const rake = this.parseFloatSafe(row['Rake'] || row [' Rake']) / conversionRate;
    const profit = resultado - rake;

    // Buy-in calculation: Stake + Rake (total tournament cost)
    const stake = this.parseFloatSafe(row['Stake'] || row[' Stake'] || row['Buy-in']) / conversionRate;
    const buyIn = stake + rake;

    const position = Math.max(0, this.parseIntSafe(row['Posição'] || row[' Posição'] || row['Position']));
    const fieldSize = this.parseIntSafe(row['Participantes'] || row[' Participantes'] || row['Players']);
    const reentries = this.parseIntSafe(row['Reentradas/Recompras'] || row[' Reentradas/Recompras']) || 0;

    // Use tournament name from 'Nome' field (handling leading spaces and trimming properly)
    const finalName = name.trim() || `${(row['Jogo'] || row[' Jogo'] || 'Tournament')} - ${(row['Estrutura'] || row[' Estrutura'] || 'Unknown')}`;

    // Note: Only "Reentradas/Recompras" column should be used for player re-entries
    // Do not use "Total de Reentradas" or "Duração" columns

    // Enhanced validation - be more lenient with empty names but strict about meaningful content
    if (!finalName || finalName.trim() === '' || finalName === 'Tournament - Unknown' || finalName === '/' || finalName === '-') {
      return null;
    }

    if (buyIn < 0) {
      return null;
    }


    return {
      userId,
      name: finalName.trim(),
      buyIn: buyIn,
      prize: profit, // Using universal profit calculation
      position: position,
      datePlayed: this.parseDate(row['Data'] || row[' Data'] || row['Date'] || row['Start Time']),
      site: row['Rede'] || 'Unknown', // Site from 'Rede' column
      format: this.detectFormat(finalName),
      category: this.detectCategory(finalName, row['Bandeiras'] || row[' Bandeiras']), // Use flags for category detection
      speed: this.detectSpeed(row['Velocidade'] || row[' Velocidade'] || '', finalName),
      fieldSize: fieldSize,
      currency: originalCurrency,
      finalTable: (position > 0 && (position <= 9 || position <= Math.ceil(fieldSize * 0.1))),
      bigHit: (profit > buyIn * 10 && buyIn > 0),
      prizePool: this.parseFloatSafe(row['Prêmio'] || row[' Prêmio'] || row['Prize Pool']) / conversionRate,
      reentries: reentries,
      rake: rake,
      convertedToUSD: convertedToUSD,
    };
  }

  private static parseSharkScopeFormat(row: any, userId: string, exchangeRates: Record<string, number> = {}): ParsedTournament | null {
    // SharkScope export: "Resultado (incluindo Rake)" is the final profit (rake already deducted)
    // Unlike other formats where Result needs rake subtracted, SharkScope's result IS the profit.
    // Note: csv-parser preserves leading spaces in headers (e.g. " Stake" not "Stake")
    const g = (key: string) => row[key] ?? row[` ${key}`] ?? '';

    const name = g('Name') || g('Nome');
    const gameId = g('Game ID') || g('ID do Jogo');
    const site = g('Network') || g('Rede') || 'Unknown';
    // Fase 5 (Overview): nick do jogador. Redundante no historico proprio (e o
    // user), essencial no pool multi-jogador efemero ("quem jogou cada um").
    const playerNick = (g('Player') || g('Jogador') || '').toString().trim() || undefined;

    // P1 fix (2026-05-11): normalize currency before lookup (SharkScope path).
    let originalCurrency = PokerCSVParser.normalizeCurrency(g('Currency') || g('Moeda') || 'USD');
    let conversionRate = 1.0;
    let convertedToUSD = false;

    if (originalCurrency !== 'USD' && exchangeRates && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    }

    const stake = this.parseFloatSafe(g('Stake')) / conversionRate;
    const rake = this.parseFloatSafe(g('Rake')) / conversionRate;
    const buyIn = stake + rake;

    // Key difference: "Result Including Rake" is already the final profit
    const profit = this.parseFloatSafe(g('Result Including Rake') || g('Resultado (incluindo Rake)')) / conversionRate;

    const position = Math.max(0, this.parseIntSafe(g('Position') || g('Posição')));
    const fieldSize = this.parseIntSafe(g('Entrants') || g('Participantes'));
    const reentries = this.parseIntSafe(g('ReEntries/Rebuys') || g('Reentradas/Recompras')) || 0;
    const bountyPrize = this.parseFloatSafe(g('Bounty Prize') || g('Prêmio de Recompensa')) / conversionRate;

    // ADR-243 CORRECAO DE SEMANTICA: a coluna `Prêmio` do SharkScope e o premio
    // BRUTO recebido pelo jogador, NAO a premiacao total do torneio. Validado no
    // export real: `Prêmio == Resultado + investimento` em 364/364 linhas com
    // valor. Antes ia para `prizePool`, poluindo a coluna (ex: "$108 Mystery
    // Bounty Main Event, $5M GTD" gravava prizePool=241.19) e perdendo a metrica
    // de ITM correta. Agora vai para `grossPrize`; `prizePool` fica null (o
    // SharkScope nao exporta premiacao total — ela so existe dentro do nome).
    // Fonte do premio BRUTO: a coluna PT `Prêmio` ou a EN `Prize`. NUNCA
    // `Prize Pool` sozinha — num export ingles legitimo `Prize Pool` seria a
    // premiacao TOTAL do torneio, semantica diferente. Como
    // normalizePortugueseHeaders espelha `Prêmio` -> `Prize Pool`, so aceitamos
    // `Prize Pool` como premio do jogador quando o header PT original existe.
    const hasPtPremio = row['Prêmio'] !== undefined || row[' Prêmio'] !== undefined;
    const grossPrizeRaw = hasPtPremio
      ? (row['Prêmio'] ?? row[' Prêmio'])
      : (g('Prize') !== '' ? g('Prize') : '');
    const grossPrizeNum = this.parseFloatSafe(grossPrizeRaw);
    const grossPrize = grossPrizeNum > 0 ? grossPrizeNum / conversionRate : null;
    // `Prize Pool` de export ingles (premiacao total) continua indo para prizePool.
    const realPrizePoolNum = hasPtPremio
      ? 0
      : this.parseFloatSafe(g('Prize Pool'));
    const prizePool = realPrizePoolNum > 0 ? realPrizePoolNum / conversionRate : undefined;

    const flagsRaw = g('Flags') || g('Bandeiras');
    const flagSignals = parseSharkscopeFlags(flagsRaw);
    const speed = g('Speed') || g('Velocidade');

    // ADR-243: linha com `Nome` vazio NAO e mais descartada. No export real 4
    // linhas WPT Global vinham sem nome mas com stake/resultado/posicao/duracao
    // completos — eram perdidas em silencio (mexia no lucro total). Sintetiza um
    // nome rastreavel e marca `nameSynthesized` para a UI poder listar/renomear.
    let finalName = name.toString().trim();
    let nameSynthesized = false;
    if (finalName === '') {
      const idPart = gameId?.toString().trim();
      const buyInLabel = Number.isFinite(buyIn) && buyIn > 0 ? `$${buyIn.toFixed(2)}` : 'buy-in ?';
      finalName = `[sem nome] ${site} ${buyInLabel}${idPart ? ` #${idPart}` : ''}`;
      nameSynthesized = true;
    }
    if (buyIn < 0) {
      return null;
    }

    // Date: prefer "Start Date" (Data de Início), fallback to "Date".
    // ADR-243: o SharkScope declara o fuso NO CABECALHO
    // (`Data de Início (America/Sao_Paulo)`) e o valor vem sem offset. O parser
    // antigo tratava como UTC -> erro fixo de 3h e torneio 21h+ caindo no dia
    // seguinte. Agora converte hora-de-parede -> UTC no fuso declarado.
    const dateStr = g('Start Date') || g('Data de Início') || g('Date') || g('Data');
    const endStr = g('End Date') || g('Data de Conclusão');
    const sourceTimezone = this.timezoneFromRow(row);
    const datePlayed = (sourceTimezone ? wallClockToUtc(dateStr, sourceTimezone) : null)
      ?? this.parseDate(dateStr);
    const endDate = (sourceTimezone ? wallClockToUtc(endStr, sourceTimezone) : null)
      ?? this.parseDate(endStr);

    // Fase 3 (library-evolution): campos antes descartados do Sharkscope.
    const durationSeconds = parseDurationToSeconds(g('Duration') || g('Duração'));
    const playersPerTable = this.parseIntSafe(g('Players Per Table') || g('Jogadores por mesa'))
      || flagSignals.maxPlayersPerTable
      || null;
    const structure = normalizeStructure(g('Structure') || g('Estrutura'));
    const gameType = normalizeGame(g('Game') || g('Jogo'));
    const stack = detectStackDepthFromName(finalName);
    const startingStackBb = stack.startingStackBb;
    const deepStack = stack.deepStack || flagSignals.deepStack;

    // ADR-243: `Total de Reentradas` e do FIELD (media 676 no export real), nao
    // do jogador — habilita "entradas vs jogadores unicos" e rake real do field.
    const fieldTotalEntriesRaw = g('Total ReEntries') || g('Total de Reentradas');
    const fieldTotalEntries = String(fieldTotalEntriesRaw).trim() === ''
      ? null
      : this.parseIntSafe(fieldTotalEntriesRaw);

    // ADR-243: bandeira declarada pela rede vence heuristica de nome para o tipo.
    // Medicao do export real: `Satellite` em 104 linhas, deteccao por nome pegava
    // apenas 6 (98 satelites classificados como Vanilla, escondendo ROI -76%).
    const category = flagSignals.primaryType ?? this.detectCategory(finalName, flagsRaw);

    return {
      userId,
      tournamentId: gameId?.toString().trim() || undefined,
      name: finalName,
      nameSynthesized: nameSynthesized || undefined,
      buyIn,
      prize: profit,
      position,
      datePlayed,
      endDate,
      site,
      format: this.detectFormat(finalName),
      category,
      speed: this.detectSpeed(speed, finalName),
      fieldSize,
      fieldTotalEntries,
      currency: originalCurrency,
      finalTable: (position > 0 && (position <= 9 || position <= Math.ceil(fieldSize * 0.1))),
      bigHit: (profit > buyIn * 10 && buyIn > 0),
      // prizePool so recebe uma coluna de premiacao TOTAL de verdade (export EN);
      // a coluna PT `Prêmio` vai para grossPrize (ver comentario acima).
      prizePool,
      reentries,
      rake,
      convertedToUSD,
      grossPrize,
      bountyPrize: bountyPrize || undefined,
      durationSeconds,
      playersPerTable,
      structure,
      gameType,
      startingStackBb,
      deepStack,
      playerNick,
      flags: flagSignals.flags.length > 0 ? flagSignals.flags : null,
      // Valores nativos + taxa: auditoria e re-valorizacao sem re-import.
      buyInNative: convertedToUSD ? +(buyIn * conversionRate).toFixed(8) : null,
      prizeNative: convertedToUSD ? +(profit * conversionRate).toFixed(8) : null,
      fxRateUsed: convertedToUSD ? conversionRate : null,
      fxSource: convertedToUSD ? (this._fxSourceHint ?? 'import_rates') : null,
      sourceTimezone,
      allowsAddOn: flagSignals.allowsAddOn || undefined,
      allowsReentry: flagSignals.allowsReentry || undefined,
    } as ParsedTournament;
  }

  /**
   * Origem das taxas de cambio usadas no import corrente (ADR-243). Setado pelo
   * caller via `setFxSourceHint` para que cada linha registre `fx_source`.
   * Estatico porque o parser e uma classe estatica; sempre sobrescrito no inicio
   * de cada parse e apenas informativo (nunca altera valores).
   */
  private static _fxSourceHint: string | null = null;

  static setFxSourceHint(source: string | null): void {
    this._fxSourceHint = source;
  }

  /**
   * Fuso declarado no cabecalho do export (`Data de Início (America/Sao_Paulo)`).
   * Retorna null quando nenhum cabecalho traz `(Area/Local)` — nesse caso o
   * caller cai no `parseDate` legado (comportamento antigo, sem regressao).
   */
  private static timezoneFromRow(row: any): string | null {
    if (!row || typeof row !== 'object') return null;
    for (const key of Object.keys(row)) {
      const trimmed = key.trim();
      if (!/^(Data de (In[íi]cio|Conclus[ãa]o)|Start Date|End Date|Date|Data)\b/i.test(trimmed)) continue;
      const tz = timezoneFromHeader(trimmed);
      if (tz) return tz;
    }
    return null;
  }

  private static parse888PokerFormat(row: any, userId: string, exchangeRates: Record<string, number> = {}): ParsedTournament | null {
    
    // 🔍 PROBLEMA IDENTIFICADO: FORMATO 888POKER NÃO RECONHECIDO
    // Implementando parser específico para formato 888poker conforme especificação
    
    // Verificar se é realmente formato 888poker
    // Pode ser 'Network', 'csvNetwork' ou ter espaços no nome
    const networkField = row['Network'] || row['csvNetwork'] || row[' Network'] || row['  Network'];
    
    // DETECÇÃO MELHORADA: Verificar campos específicos do formato 888poker
    const hasGameId = row['Game ID'] || row[' Game ID'] || row['  Game ID'];
    const hasStake = row['Stake'] || row[' Stake'] || row['  Stake'];
    const hasEntrants = row['Entrants'] || row[' Entrants'] || row['  Entrants'];
    const hasFlags = row['Flags'] || row[' Flags'] || row['  Flags'];
    const hasReEntries = row['ReEntries/Rebuys'] || row[' ReEntries/Rebuys'] || row['  ReEntries/Rebuys'];
    
    // Detectar formato 888poker por presença de campos específicos OU Network = 888Poker
    const is888PokerFormat = (networkField && networkField.toString().trim().toLowerCase() === '888poker') ||
                             (hasGameId && hasStake && hasEntrants && hasFlags && hasReEntries);
    
    if (is888PokerFormat) {
      
      // Campos específicos do formato 888poker:
      // csvNetwork, Player, Game ID, Stake, Date, Entrants, Rake, Game, Structure, Speed, Result, Position, Flags, Currency, ReEntries/Rebuys, Duration, Players Per Table, Prize, Name, Total ReEntries
      
      const tournamentId = row['Game ID'] || row[' Game ID'] || row['  Game ID'] || '';
      const buyIn = this.parseFloatSafe(row['Stake'] || row[' Stake'] || row['  Stake']) || 0;
      const rake = this.parseFloatSafe(row['Rake'] || row[' Rake'] || row['  Rake']) || 0;
      const result = this.parseFloatSafe(row['Result'] || row[' Result'] || row['  Result']) || 0;
      const position = Math.max(0, this.parseIntSafe(row['Position'] || row[' Position'] || row['  Position']));
      const fieldSize = this.parseIntSafe(row['Entrants'] || row[' Entrants'] || row['  Entrants']) || 0;
      const reentries = this.parseIntSafe(row['ReEntries/Rebuys'] || row[' ReEntries/Rebuys'] || row['  ReEntries/Rebuys']) || 0;
      const tournamentName = row['Name'] || row[' Name'] || row['  Name'] || '';
      const flags = row['Flags'] || row[' Flags'] || row['  Flags'] || '';
      // P1 fix (2026-05-11): normalize currency before lookup.
      const currency = PokerCSVParser.normalizeCurrency(row['Currency'] || row[' Currency'] || row['  Currency'] || 'USD');
      const speed = row['Speed'] || row[' Speed'] || row['  Speed'] || 'Normal';
      const dateStr = row['Date'] || row[' Date'] || row['  Date'] || '';
      
      
      // Currency conversion
      let conversionRate = 1.0;
      let convertedToUSD = false;
      
      if (currency !== 'USD' && exchangeRates && exchangeRates[currency]) {
        conversionRate = exchangeRates[currency];
        convertedToUSD = true;
      }
      
      // Apply conversion to monetary values
      const convertedBuyIn = buyIn / conversionRate;
      const convertedRake = rake / conversionRate;
      const convertedResult = result / conversionRate;
      
      // Profit calculation: Result é já o lucro líquido no formato 888poker
      const profit = convertedResult;
      
      // Parse date - formato 888poker: "2025-06-09 13:32"
      // P0 fix (2026-05-10): use parseDate helper to force UTC when CSV has no TZ marker.
      const datePlayedNullable = this.parseDate(dateStr);
      if (!datePlayedNullable) {
        return null;
      }
      const datePlayed: Date = datePlayedNullable;
      
      // Validações básicas
      if (convertedBuyIn <= 0) {
        return null;
      }
      
      if (!tournamentName || tournamentName.trim() === '') {
        return null;
      }
      
      // Detectar categoria baseado em flags e nome
      const category = this.detectCategory(tournamentName, flags);
      
      // Detectar velocidade baseado no campo Speed
      const detectedSpeed = this.detectSpeed(speed, tournamentName);
      
      
      return {
        userId,
        tournamentId: tournamentId,
        name: tournamentName.trim(),
        buyIn: convertedBuyIn,
        prize: profit,
        position: position,
        datePlayed: datePlayed,
        site: '888poker',
        format: this.detectFormat(tournamentName),
        category: category,
        speed: detectedSpeed,
        fieldSize: fieldSize,
        currency: currency,
        finalTable: (position > 0 && (position <= 9 || position <= Math.ceil(fieldSize * 0.1))),
        bigHit: (profit > convertedBuyIn * 10 && convertedBuyIn > 0),
        prizePool: undefined, // Não disponível no formato 888poker
        reentries: reentries,
        rake: convertedRake,
        convertedToUSD: convertedToUSD,
      };
    }
    
    // Fallback para formato brasileiro antigo
    const name = row['Nome'] || row['Game'] || row['Tournament'] || '';

    // Currency conversion for 888poker (BR-old fallback)
    // P1 fix (2026-05-11): normalize currency before lookup.
    let originalCurrency = PokerCSVParser.normalizeCurrency(
      row['Moeda'] || this.detectCurrency(row['Stake'] || row['Buy-in'] || 'USD')
    );
    let conversionRate = 1.0;
    let convertedToUSD = false;

    if (originalCurrency !== 'USD' && exchangeRates && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    }

    // Apply universal profit calculation: Resultado - Rake
    const resultado = this.parseFloatSafe(row['Resultado']) / conversionRate;
    const rake = this.parseFloatSafe(row['Rake']) / conversionRate;
    const profit = resultado - rake;

    // Buy-in calculation: Stake + Rake (total tournament cost)
    const stake = this.parseFloatSafe(row['Stake'] || row['Buy-in']) / conversionRate;
    const buyIn = stake + rake;
    const position = Math.max(0, this.parseIntSafe(row['Posição'] || row['Position']));
    const fieldSize = this.parseIntSafe(row['Participantes'] || row['Players']);
    const reentries = this.parseIntSafe(row['Reentradas/Recompras']) || 0;

    // Enhanced validation - allow empty name if we have other data
    if (buyIn < 0) {
      return null;
    }

    // Use tournament name from 'Nome' field or construct from other fields
    const finalName = name || `${row['Jogo'] || 'Tournament'} - ${row['Estrutura'] || 'Unknown'}`;

    if (!finalName || finalName.trim() === '') {
      return null;
    }


    return {
      userId,
      name: finalName.trim(),
      buyIn: buyIn,
      prize: profit, // Using universal profit calculation
      position: position,
      datePlayed: this.parseDate(row['Data'] || row['Date'] || row['Start Time']),
      site: row['Rede'] || '888poker',
      format: this.detectFormat(finalName),
      category: this.detectCategory(finalName, row['Bandeiras']), // Use flags for category detection
      speed: this.detectSpeed(row['Velocidade'] || '', finalName),
      fieldSize: fieldSize,
      currency: originalCurrency,
      finalTable: (position > 0 && (position <= 9 || position <= Math.ceil(fieldSize * 0.1))),
      bigHit: (profit > buyIn * 10 && buyIn > 0),
      prizePool: this.parseFloatSafe(row['Prêmio'] || row['Prize Pool']) / conversionRate,
      reentries: reentries,
      rake: rake,
      convertedToUSD: convertedToUSD,
    };
  }

  private static parseChicoNetworkFormat(row: any, userId: string, exchangeRates: Record<string, number> = {}): ParsedTournament | null {

    // Chico Network columns have same structure as PartyPoker but with Network = 'Chico'
    const name = row[' Name'] || row['Tournament Name'] || '';
    const gameId = row[' Game ID'] || row['Game ID'] || '';

    const playerReentries = row[' ReEntries/Rebuys'] || row['ReEntries/Rebuys'] || '';
    const totalTournamentReentries = row[' Total ReEntries'] || row['Total ReEntries'] || 0;


    // Currency conversion for Chico Network
    // P1 fix (2026-05-11): normalize currency before lookup.
    let originalCurrency = PokerCSVParser.normalizeCurrency(row[' Currency'] || 'USD');
    let conversionRate = 1.0;
    let convertedToUSD = false;

    if (originalCurrency !== 'USD' && exchangeRates && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    }

    // Parse values first
    const stake = this.parseFloatSafe(row[' Stake']) / conversionRate;
    const rake = this.parseFloatSafe(row[' Rake']) / conversionRate;
    const result = this.parseFloatSafe(row[' Result']) / conversionRate;

    // CORREÇÃO: Buy-in deve incluir rake para Chico
    const buyIn = stake + rake; // Total tournament cost (stake + rake)


    // Calculate profit (Result - Rake for Chico)
    const profit = result - rake;

    const position = Math.max(0, this.parseIntSafe(row[' Position']));
    const fieldSize = this.parseIntSafe(row[' Entrants']);
    const playerReentriesNumber = this.parseIntSafe(playerReentries);

    const parsedTournament = {
      userId,
      tournamentId: gameId?.toString().trim(),
      name: name,
      buyIn: buyIn,
      prize: profit,
      position: position,
      datePlayed: this.parseDate(row[' Date']),
      site: 'Chico', // Site correto é Chico
      format: this.detectFormat(name),
      category: this.detectCategory(name, row[' Flags']),
      speed: this.detectSpeed(row[' Speed'] || '', name),
      fieldSize: fieldSize,
      currency: originalCurrency,
      finalTable: (position > 0 && (position <= 9 || position <= Math.ceil(fieldSize * 0.1))),
      bigHit: (profit > buyIn * 10 && buyIn > 0),
      convertedToUSD: convertedToUSD,
      reentries: playerReentriesNumber,
    };


    return parsedTournament;
  }

  private static parsePokerStarsFRESPTFormat(row: any, userId: string, exchangeRates: Record<string, number> = {}): ParsedTournament | null {

    // PokerStars(FR-ES-PT) CSV structure (similar to PokerStars with leading spaces):
    // Network: "PokerStars(FR-ES-PT)"
    // " Player": "Docari Agnol"
    // " Game ID": 3907052694 (Tournament ID)
    // " Stake": 50.0 (Buy-in in EUR)
    // " Date": "2025-07-13 17:45"
    // " Entrants": 2106 (Field size)
    // " Rake": 5.0 (Rake in EUR)
    // " Result": 546.94 (Net result in EUR)
    // " Position": 20 (Final position)
    // " Flags": "Bounty Multi-Entry" (Category info)
    // " Currency": "EUR"
    // " Name": "Mystery Bounty Series 02: €55 NLHE..."

    const name = row[' Name'] || row['Name'] || '';
    const gameId = row[' Game ID'] || row['Game ID'] || '';


    if (!name.trim()) {
      return null;
    }

    // Currency conversion for PokerStars(FR-ES-PT) (EUR to USD)
    // P1 fix (2026-05-11): normalize currency before lookup.
    let originalCurrency = PokerCSVParser.normalizeCurrency(row[' Currency'] || row['Currency'] || 'EUR');
    let conversionRate = 1.0;
    let convertedToUSD = false;


    if (originalCurrency === 'EUR' && exchangeRates && exchangeRates.EUR) {
      conversionRate = exchangeRates.EUR;
      convertedToUSD = true;
    } else if (originalCurrency === 'EUR') {
    }

    // Parse PokerStars(FR-ES-PT) specific fields (handle column names with spaces)
    const stakeEUR = this.parseFloatSafe(row[' Stake'] || row['Stake']);
    const rakeEUR = this.parseFloatSafe(row[' Rake'] || row['Rake']);
    const resultEUR = this.parseFloatSafe(row[' Result'] || row['Result']);


    // Apply conversion to USD
    const stake = stakeEUR / conversionRate;
    const rake = rakeEUR / conversionRate;
    const result = resultEUR / conversionRate;


    // Calculate buy-in and profit for PokerStars(FR-ES-PT)
    const buyIn = stake + rake; // Total tournament cost
    const profit = result; // Result is already net profit in PokerStars format

    const position = Math.max(0, this.parseIntSafe(row[' Position'] || row['Position']));
    const fieldSize = this.parseIntSafe(row[' Entrants'] || row['Entrants']);

    // Parse reentries for PokerStars(FR-ES-PT)
    const playerReentriesNumber = this.parseIntSafe(row[' ReEntries/Rebuys'] || row['ReEntries/Rebuys']);



    // Parse date with detailed logging
    const parsedDate = this.parseDate(row[' Date'] || row['Date']);

    const tournamentId = gameId?.toString().trim();
    const flags = row[' Flags'] || row['Flags'] || '';
    const speed = (row[' Speed'] || row['Speed']) || '';

    const parsedTournament = {
      userId,
      tournamentId: tournamentId,
      name: name,
      buyIn: buyIn,
      prize: profit, // Net profit
      position: position,
      datePlayed: parsedDate,
      site: 'PS.ES', // Tag simplificada para PokerStars(FR-ES-PT)
      format: this.detectFormat(name),
      category: this.detectCategory(name, flags),
      speed: this.detectSpeed(speed, name),
      fieldSize: fieldSize,
      currency: 'USD', // Always USD after conversion
      finalTable: (position > 0 && (position <= 9 || position <= Math.ceil(fieldSize * 0.1))),
      bigHit: (profit > buyIn * 10 && buyIn > 0),
      convertedToUSD: convertedToUSD,
      reentries: playerReentriesNumber,
    };


    // Final validation check
    const isValid = parsedTournament.name && parsedTournament.datePlayed && parsedTournament.buyIn >= 0;
    if (!isValid) {
      return null;
    }

    return parsedTournament;
  }

  private static parseIPokerFormat(row: any, userId: string, exchangeRates: Record<string, number> = {}): ParsedTournament | null {

    // iPoker CSV structure (similar to PartyPoker with leading spaces):
    // Network: "iPoker"
    // " Player": "Docari"
    // " Game ID": "JSMwbfAD" (Tournament ID)
    // " Stake": 26.6175 (Buy-in in EUR)
    // " Date": "2024-03-31 20:00"
    // " Entrants": 231 (Field size)
    // " Rake": 5.3825 (Rake in EUR)
    // " Result": -32.0 (Net result in EUR)
    // " Position": 103 (Final position)
    // " Flags": "Rebuy Multi-Entry" (Category info)
    // " Currency": "EUR"
    // " Name": "€8,500 GTD | Fists of Fury"

    const name = row[' Name'] || row['Name'] || '';
    const gameId = row[' Game ID'] || row['Game ID'] || '';


    if (!name.trim()) {
      return null;
    }

    // Currency conversion for iPoker (EUR to USD)
    // P1 fix (2026-05-11): normalize currency before lookup.
    let originalCurrency = PokerCSVParser.normalizeCurrency(row[' Currency'] || row['Currency'] || 'EUR');
    let conversionRate = 1.0;
    let convertedToUSD = false;


    if (originalCurrency === 'EUR' && exchangeRates && exchangeRates.EUR) {
      conversionRate = exchangeRates.EUR;
      convertedToUSD = true;
    } else if (originalCurrency === 'EUR') {
    }

    // Parse iPoker specific fields (handle column names with spaces)
    const stakeEUR = this.parseFloatSafe(row[' Stake'] || row['Stake']);
    const rakeEUR = this.parseFloatSafe(row[' Rake'] || row['Rake']);
    const resultEUR = this.parseFloatSafe(row[' Result'] || row['Result']);


    // Apply conversion to USD
    const stake = stakeEUR / conversionRate;
    const rake = rakeEUR / conversionRate;
    const result = resultEUR / conversionRate;


    // Calculate buy-in and profit for iPoker
    // REGRA ESPECIAL: Dobrar buy-in para torneios "Fury" ou "Rebuy"
    const flagsRaw = row[' Flags'] || row['Flags'] || '';
    const isFury = /\bFury\b/i.test(name);
    const isRebuyFormat = /\bRebuy\b/i.test(flagsRaw) && /\bRebuy\b/i.test(name);
    const isFuryOrRebuy = isFury || isRebuyFormat;

    let adjustedStake = stake;
    if (isFuryOrRebuy) {
      adjustedStake = stake * 2; // Dobrar stake para torneios Fury/Rebuy
    }

    const buyIn = adjustedStake + rake; // Total tournament cost (com ajuste se necessário)

    // FÓRMULA SIMPLIFICADA DE PROFIT:
    // Torneios normais: profit = result
    // Fury/Rebuy: profit = result - stake (subtrair apenas 1 stake)
    let profit;
    if (isFuryOrRebuy) {
      profit = result - stake; // Subtrair apenas 1 stake para Fury/Rebuy
    } else {
      profit = result; // Para torneios normais, profit = result
    }


    const position = Math.max(0, this.parseIntSafe(row[' Position'] || row['Position']));
    const fieldSize = this.parseIntSafe(row[' Entrants'] || row['Entrants']);

    // Parse reentries for iPoker
    const playerReentriesNumber = this.parseIntSafe(row[' ReEntries/Rebuys'] || row['ReEntries/Rebuys']);


    // Parse date with detailed logging
    const parsedDate = this.parseDate(row[' Date'] || row['Date']);

    const tournamentId = gameId?.toString().trim();
    const flags = row[' Flags'] || row['Flags'] || '';
    const speed = (row[' Speed'] || row['Speed']) || '';

    const parsedTournament = {
      userId,
      tournamentId: tournamentId,
      name: name,
      buyIn: buyIn,
      prize: profit, // Net profit
      position: position,
      datePlayed: parsedDate,
      site: 'iPoker',
      format: this.detectFormat(name),
      category: this.detectCategory(name, flags),
      speed: this.detectSpeed(speed, name),
      fieldSize: fieldSize,
      currency: convertedToUSD ? 'USD' : originalCurrency, // Store as USD if converted
      finalTable: (position > 0 && (position <= 9 || position <= Math.ceil(fieldSize * 0.1))),
      bigHit: (profit > buyIn * 10 && buyIn > 0),
      convertedToUSD: convertedToUSD,
      reentries: playerReentriesNumber,
    };


    // Final validation check
    const isValid = parsedTournament.name && parsedTournament.datePlayed && parsedTournament.buyIn >= 0;
    if (!isValid) {
      return null;
    }

    return parsedTournament;
  }

  private static parseGenericNetworkFormat(row: any, userId: string, exchangeRates: Record<string, number> = {}, siteName: string): ParsedTournament | null {

    // Generic network format - use provided siteName.
    // `Name` sem espaco eh header canonico do Generic Network.
    const name = row[' Name'] || row['Name'] || row['Tournament Name'] || row['Tournament'] || row['name'] || row['tournament'] || '';
    const gameId = row[' Game ID'] || row['Game ID'] || row['id'] || '';

    const playerReentries = row[' ReEntries/Rebuys'] || row['ReEntries/Rebuys'] || row['reentries'] || '';



    // Currency conversion for Generic Network
    // P1 fix (2026-05-11): normalize currency before lookup.
    let originalCurrency = PokerCSVParser.normalizeCurrency(row[' Currency'] || row['Currency'] || 'USD');
    let conversionRate = 1.0;
    let convertedToUSD = false;

    if (originalCurrency !== 'USD' && exchangeRates && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    }

    // Parse buy-in and result - flexible field mapping
    const stake = this.parseFloatSafe(row[' Stake'] || row['Stake'] || row['Buy-in'] || row['buy_in'] || row['buyin']) / conversionRate;
    const result = this.parseFloatSafe(row[' Result'] || row['Result'] || row['winnings'] || row['prize']) / conversionRate;
    const rake = this.parseFloatSafe(row[' Rake'] || row['Rake'] || row['rake']) / conversionRate;

    // Se name ainda estiver vazio, força o valor do campo Tournament
    if (!name && row['Tournament']) {
      const forcedName = row['Tournament'];
      return {
        userId,
        tournamentId: gameId?.toString().trim() || '',
        name: forcedName,
        buyIn: stake + rake,
        prize: result - rake,
        position: Math.max(0, this.parseIntSafe(row[' Position'] || row['Position'] || row['position'] || row['finish'])),
        datePlayed: this.parseDate(row[' Date'] || row['Date'] || row['date'] || row['start_time']),
        site: siteName,
        format: this.detectFormat(forcedName),
        category: this.detectCategory(forcedName, row[' Flags'] || row['Flags']),
        speed: this.detectSpeed(row[' Speed'] || row['Speed'] || '', forcedName),
        fieldSize: this.parseIntSafe(row[' Entrants'] || row['Entrants'] || row['Field Size'] || row['players'] || row['field_size']),
        currency: originalCurrency,
        finalTable: false,
        bigHit: false,
        convertedToUSD: convertedToUSD,
        reentries: this.parseIntSafe(playerReentries),
      };
    }

    // CORREÇÃO: Buy-in deve incluir rake para Generic Network (inclui WPN, PartyPoker, Revolution, etc.)
    const buyIn = stake + rake; // Total tournament cost (stake + rake)


    // Calculate profit (Result - Rake for Generic)
    const profit = result - rake;

    const position = Math.max(0, this.parseIntSafe(row[' Position'] || row['Position'] || row['position'] || row['finish']));
    const fieldSize = this.parseIntSafe(row[' Entrants'] || row['Entrants'] || row['players'] || row['field_size']);
    const playerReentriesNumber = this.parseIntSafe(playerReentries);

    const parsedTournament = {
      userId,
      tournamentId: gameId?.toString().trim(),
      name: name,
      buyIn: buyIn,
      prize: profit,
      position: position,
      datePlayed: this.parseDate(row[' Date'] || row['Date'] || row['date'] || row['start_time']),
      site: siteName, // Usa o siteName fornecido (pode ser Network value ou 'Unknown')
      format: this.detectFormat(name),
      category: this.detectCategory(name, row[' Flags'] || row['Flags']),
      speed: this.detectSpeed(row[' Speed'] || row['Speed'] || '', name),
      fieldSize: fieldSize,
      currency: originalCurrency,
      finalTable: (position > 0 && (position <= 9 || position <= Math.ceil(fieldSize * 0.1))),
      bigHit: (profit > buyIn * 10 && buyIn > 0),
      convertedToUSD: convertedToUSD,
      reentries: playerReentriesNumber,
    };


    return parsedTournament;
  }

  private static parseWPNNetworkFormat(row: any, userId: string, exchangeRates: Record<string, number> = {}): ParsedTournament {

    // WPN Network columns have same structure as generic with Network = 'WPN'
    const name = row[' Name'] || row['Tournament Name'] || '';
    const gameId = row[' Game ID'] || row['Game ID'] || '';

    const playerReentries = row[' ReEntries/Rebuys'] || row['ReEntries/Rebuys'] || '';


    // Currency conversion for WPN Network
    // P1 fix (2026-05-11): normalize currency before lookup.
    let originalCurrency = PokerCSVParser.normalizeCurrency(row[' Currency'] || row['Currency'] || 'USD');
    let conversionRate = 1.0;
    let convertedToUSD = false;

    if (originalCurrency !== 'USD' && exchangeRates && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    }

    // Parse values first
    const stake = this.parseFloatSafe(row[' Stake'] || row['Stake']) / conversionRate;
    const rake = this.parseFloatSafe(row[' Rake'] || row['Rake']) / conversionRate;
    const result = this.parseFloatSafe(row[' Result'] || row['Result']) / conversionRate;

    // CORREÇÃO: Buy-in deve incluir rake para WPN Network
    const buyIn = stake + rake; // Total tournament cost (stake + rake)

    // Calculate profit (Result - Rake for WPN)
    const profit = result - rake;

    const position = Math.max(0, this.parseIntSafe(row[' Position'] || row['Position']));
    const fieldSize = this.parseIntSafe(row[' Entrants'] || row['Entrants']);
    const playerReentriesNumber = this.parseIntSafe(playerReentries);

    const parsedTournament = {
      userId,
      tournamentId: gameId?.toString().trim(),
      name: name,
      buyIn: buyIn,
      prize: profit,
      position: position,
      datePlayed: this.parseDate(row[' Date'] || row['Date']),
      site: 'WPN',
      format: this.detectFormat(name),
      category: this.detectCategory(name, row[' Flags'] || row['Flags']),
      speed: this.detectSpeed(row[' Speed'] || row['Speed'] || '', name),
      fieldSize: fieldSize,
      currency: originalCurrency,
      finalTable: (position > 0 && (position <= 9 || position <= Math.ceil(fieldSize * 0.1))),
      bigHit: (profit > buyIn * 10 && buyIn > 0),
      convertedToUSD: convertedToUSD,
      reentries: playerReentriesNumber,
    };


    return parsedTournament;
  }

  private static parsePartyPokerFormat(row: any, userId: string, exchangeRates: Record<string, number> = {}): ParsedTournament {

    // PartyPoker columns have same structure as generic with Network = 'PartyPoker'
    const name = row[' Name'] || row['Tournament Name'] || '';
    const gameId = row[' Game ID'] || row['Game ID'] || '';

    const playerReentries = row[' ReEntries/Rebuys'] || row['ReEntries/Rebuys'] || '';


    // Currency conversion for PartyPoker
    // P1 fix (2026-05-11): normalize currency before lookup.
    let originalCurrency = PokerCSVParser.normalizeCurrency(row[' Currency'] || row['Currency'] || 'USD');
    let conversionRate = 1.0;
    let convertedToUSD = false;

    if (originalCurrency !== 'USD' && exchangeRates && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    }

    // Parse values first
    const stake = this.parseFloatSafe(row[' Stake'] || row['Stake']) / conversionRate;
    const rake = this.parseFloatSafe(row[' Rake'] || row['Rake']) / conversionRate;
    const result = this.parseFloatSafe(row[' Result'] || row['Result']) / conversionRate;

    // CORREÇÃO: Buy-in deve incluir rake para PartyPoker
    const buyIn = stake + rake; // Total tournament cost (stake + rake)

    // Calculate profit (Result - Rake for PartyPoker)
    const profit = result - rake;

    const position = Math.max(0, this.parseIntSafe(row[' Position'] || row['Position']));
    const fieldSize = this.parseIntSafe(row[' Entrants'] || row['Entrants']);
    const playerReentriesNumber = this.parseIntSafe(playerReentries);

    const parsedTournament = {
      userId,
      tournamentId: gameId?.toString().trim(),
      name: name,
      buyIn: buyIn,
      prize: profit,
      position: position,
      datePlayed: this.parseDate(row[' Date'] || row['Date']),
      site: 'PartyPoker',
      format: this.detectFormat(name),
      category: this.detectCategory(name, row[' Flags'] || row['Flags']),
      speed: this.detectSpeed(row[' Speed'] || row['Speed'] || '', name),
      fieldSize: fieldSize,
      currency: originalCurrency,
      finalTable: (position > 0 && (position <= 9 || position <= Math.ceil(fieldSize * 0.1))),
      bigHit: (profit > buyIn * 10 && buyIn > 0),
      convertedToUSD: convertedToUSD,
      reentries: playerReentriesNumber,
    };


    return parsedTournament;
  }

  // P0 fix (2026-05-10): Force UTC parsing when the input has no explicit TZ marker.
  // Mixed local-time vs UTC parsing across networks desaligns dashboard aggregates
  // and breaks duplicate detection on re-imports.
  // Strategy: if the string has Z, +HH, +HH:MM, or 'GMT' marker, trust the input.
  // Otherwise, append "Z" so JS Date treats it as UTC.
  private static parseDate(dateStr: any): Date | null {
    if (dateStr === null || dateStr === undefined) return null;
    const raw = String(dateStr).trim();
    if (raw === '') return null;

    // Detect explicit TZ marker (Z, +HH, +HHMM, +HH:MM, -HH..., or 'GMT'/'UTC' word).
    const hasExplicitTz = /(?:Z|[+-]\d{2}:?\d{2}|GMT|UTC)\b/i.test(raw);
    let normalized = raw;

    if (!hasExplicitTz) {
      // Common formats coming from poker network exports:
      //   "2025-01-15 18:00"        -> "2025-01-15T18:00:00Z"
      //   "2025-01-15 18:00:00"     -> "2025-01-15T18:00:00Z"
      //   "2025-01-15"              -> "2025-01-15T00:00:00Z"
      //   "2025-01-15T18:00:00"     -> "2025-01-15T18:00:00Z"
      const isoLike = /^(\d{4}-\d{2}-\d{2})([T\s](\d{2}:\d{2}(:\d{2})?))?$/;
      const m = raw.match(isoLike);
      if (m) {
        const datePart = m[1];
        const timePart = m[3] ? (m[3].length === 5 ? `${m[3]}:00` : m[3]) : '00:00:00';
        normalized = `${datePart}T${timePart}Z`;
      } else {
        // Fallback: try to append Z if it looks ISO-ish; otherwise leave as-is and
        // let Date constructor try (will return null below if invalid).
        if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
          normalized = `${raw.replace(' ', 'T')}Z`;
        }
      }
    }

    const date = new Date(normalized);
    return isNaN(date.getTime()) ? null : date;
  }

  private static detectFormat(name: any): string {
    return 'MTT'; // Default format
  }

  private static detectCategory(name: any, flags?: any): string {
    const nameStr = (name || '').toString();
    const nameUpper = nameStr.toUpperCase();
    const flagsUpper = (flags || '').toString().toUpperCase();

    // Mystery has highest priority
    if (nameUpper.includes('MYSTERY')) {
      return 'Mystery';
    }

    // KO word-boundary aceita digito adjacente (ex: `$5+$0.50KO`) mas exclui
    // TOKYO/PIKO/KOREA (delimitador = non-letter).
    if (flagsUpper.includes('BOUNTY') ||
        nameUpper.includes('PROGRESSIVE') ||
        nameUpper.includes('KNOCKOUT') ||
        /(?:^|[^A-Z])KO(?:[^A-Z]|$)/.test(nameUpper) ||
        nameUpper.includes('BOUNTY') ||
        nameUpper.includes('PKO')) {
      return 'PKO';
    }

    // Satellite — terceiro lugar (defesa em profundidade; upload route tambem
    // chama enrichTournamentTypeFields, mas se outro caller usar parseCSV
    // diretamente queremos categorizar corretamente).
    if (detectSatelliteFromName(nameStr)) {
      return 'Satellite';
    }

    // Add-on (Plus pattern) — primary type per ADR-031 extension 2026-05-06
    const detected = detectAddonReaFromName(name);
    if (detected.allowsAddOn) {
      return 'Add-on';
    }

    // Default to Vanilla
    return 'Vanilla';
  }

  /**
   * Detecta se torneio do CSV e parte de uma serie multi-flight (modificador
   * ortogonal ADR-031). Usado pelo upload pipeline para popular `isFlight`.
   */
  private static detectIsFlight(name: any): boolean {
    return detectIsFlightFromName((name || '').toString());
  }

  private static detectSpeed(speed: any, name: any): string {
    // Sprint torneios-library-grouping: delega ao detector compartilhado
    // (shared/speed-detector). Antes so "SUPER TURBO" virava Hyper — nomes
    // "Hyper"/"Hyper-Turbo"/"Hyperturbo" caiam em Turbo (Hyper sub-detectado).
    return classifySpeed(
      (speed ?? '').toString(),
      (name ?? '').toString(),
    );
  }

  private static detectCurrency(value: any): string {
    if (!value || typeof value !== 'string') return 'USD';
    
    const valueUpper = value.toString().toUpperCase();
    
    // Common currency patterns
    if (valueUpper.includes('USD') || valueUpper.includes('$')) {
      return 'USD';
    }
    
    if (valueUpper.includes('EUR') || valueUpper.includes('€')) {
      return 'EUR';
    }
    
    if (valueUpper.includes('GBP') || valueUpper.includes('£')) {
      return 'GBP';
    }
    
    if (valueUpper.includes('CAD') || valueUpper.includes('C$')) {
      return 'CAD';
    }
    
    if (valueUpper.includes('CNY') || valueUpper.includes('¥')) {
      return 'CNY';
    }
    
    if (valueUpper.includes('USDT')) {
      return 'USDT';
    }
    
    // Default to USD if no currency detected
    return 'USD';
  }

  private static applyCurrencyConversion(amount: number, currency: string, exchangeRates: Record<string, number>): { amount: number, converted: boolean } {
    if (currency === 'USD' || !exchangeRates[currency]) {
      return { amount, converted: false };
    }

    const rate = exchangeRates[currency];
    return { amount: amount / rate, converted: true };
  }

  static async parseCSVWithDuplicateCheck(fileContent: string, userId: string, exchangeRates: Record<string, number> = {}, storage: any): Promise<{
    validTournaments: ParsedTournament[],
    duplicateTournaments: ParsedTournament[],
    duplicateCount: number,
    totalProcessed: number,
    duplicateIds: string[]
  }> {

    try {
      // Parse tournaments using existing parseCSV method
      const tournaments = await this.parseCSV(fileContent, userId, exchangeRates);

      // Separate tournaments WITH tournamentId and WITHOUT
      const withId: ParsedTournament[] = [];
      const withoutId: ParsedTournament[] = [];

      for (const t of tournaments) {
        if (t.tournamentId && t.tournamentId.trim() !== '') {
          withId.push(t);
        } else {
          withoutId.push(t);
        }
      }

      // Batch check for tournaments WITH tournamentId
      const existingIds = await storage.findExistingTournamentIds(
        userId,
        withId.map(t => t.tournamentId!)
      );

      // Batch check for tournaments WITHOUT tournamentId (by fields)
      // P1 fix (2026-05-11): include `site` in lookup payload so the same name+date+buyIn
      // played on different networks (cross-platform tracking) is NOT collapsed as duplicate.
      const existingByFields = await storage.findExistingTournamentsByFields(
        userId,
        withoutId.map(t => ({ name: t.name, datePlayed: t.datePlayed, buyIn: t.buyIn, site: t.site }))
      );

      const validTournaments: ParsedTournament[] = [];
      const duplicateTournaments: ParsedTournament[] = [];
      const duplicateIds: string[] = [];

      // Filter tournaments with tournamentId
      for (const t of withId) {
        if (existingIds.has(t.tournamentId!)) {
          duplicateTournaments.push(t);
          duplicateIds.push(t.tournamentId!);
        } else {
          validTournaments.push(t);
        }
      }

      // Filter tournaments without tournamentId (by fields)
      // P1 fix (2026-05-11): site-aware key. Storage emits BOTH site-aware AND legacy
      // (siteless) keys for backward compat, so callers using either format match.
      for (const t of withoutId) {
        if (t.datePlayed) {
          const key = `${t.site}|${t.name.trim()}|${t.datePlayed.toISOString()}|${t.buyIn}`;
          if (existingByFields.has(key)) {
            duplicateTournaments.push(t);
            duplicateIds.push(`${t.name} (${t.datePlayed.toISOString().split('T')[0]})`);
          } else {
            validTournaments.push(t);
          }
        } else {
          // No datePlayed and no tournamentId — cannot check duplicate, treat as valid
          validTournaments.push(t);
        }
      }

      return {
        validTournaments,
        duplicateTournaments,
        duplicateCount: duplicateTournaments.length,
        totalProcessed: tournaments.length,
        duplicateIds
      };

    } catch (error) {
      throw error;
    }
  }

  // P1 fix (2026-05-11): central dispatcher used by ALL upload endpoints
  // (POST /api/upload-history, /api/check-duplicates, /api/upload-with-duplicates,
  // /api/upload). Previously each endpoint duplicated the same isBodog/isCoin/
  // isCoinPoker chain — drift between them silently bypassed format detection in
  // /api/upload. Single source of truth here.
  //
  // Detection precedence:
  //   1. .xlsx/.xls (Bodog) — by filename extension
  //   2. CoinTXT — content sniff (Withdrawal+Deposit+USDT+AccountAction)
  //   3. CoinPoker CSV — content sniff (header has type/description/amount/date + USDT NL Hold'em)
  //   4. Generic CSV via parseCSV (PartyPoker, WPN, PokerStars, GG, iPoker, Chico, ...)
  //
  // Returns ParsedTournament[] always; never throws — caller decides validity.
  static async dispatchCSVParser(
    file: { buffer: Buffer; originalname: string },
    userId: string,
    exchangeRates: Record<string, number> = {},
  ): Promise<ParsedTournament[]> {
    const filename = (file.originalname ?? '').toLowerCase();
    const isXlsx = filename.endsWith('.xlsx') || filename.endsWith('.xls');

    if (isXlsx) {
      return PokerCSVParser.parseBodogXLSX(file.buffer, userId, exchangeRates);
    }

    // Text-based payloads. Decode as UTF-8 (no BOM stripping here — leaving the
    // text intact lets each parser handle encoding quirks). Future P2: try
    // UTF-8 then Latin-1 fallback for legacy Western European exports.
    const fileContent = file.buffer.toString('utf-8');

    if (PokerCSVParser.isCoinTXTFormat(fileContent)) {
      return PokerCSVParser.parseCoinTXT(fileContent, userId, exchangeRates);
    }
    if (PokerCSVParser.isCoinPokerFormat(fileContent)) {
      return PokerCSVParser.parseCoinPokerCSV(fileContent, userId, exchangeRates);
    }

    return PokerCSVParser.parseCSV(fileContent, userId, exchangeRates);
  }

  /**
   * P1 fix (2026-05-11): public sibling of the route-level isCoinFormat helper
   * (kept duplicated in upload.ts pre-dispatcher). Lives on the parser so all
   * call-sites stay in sync.
   */
  static isCoinTXTFormat(fileContent: string): boolean {
    return fileContent.includes('Withdrawal') &&
           fileContent.includes('Deposit') &&
           fileContent.includes('USDT') &&
           fileContent.includes('AccountAction') &&
           fileContent.includes("NL Hold'em");
  }
}