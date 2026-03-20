import { Readable } from "stream";
import csv from "csv-parser";
import * as XLSX from 'xlsx';

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

      const date = new Date(`${dateMatch[1]}T${dateMatch[2]}`);

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
    const upperName = name.toUpperCase();

    if (upperName.includes('HYPER')) {
      return 'Hyper';
    }

    if (upperName.includes('SPRINT') || 
        upperName.includes('TURBO') || 
        upperName.includes('BOLT') || 
        upperName.includes('RÁPIDO') || 
        upperName.includes('RAPIDO') ||
        upperName.includes('FLASH')) {
      return 'Turbo';
    }

    return 'Normal';
  }

  // 🎯 ETAPA 2.2: userId é sempre do contexto de autenticação (userPlatformId), nunca dos dados CSV
  static async parseBodogXLSX(fileBuffer: Buffer, userId: string, exchangeRates: Record<string, number> = {}): Promise<ParsedTournament[]> {
    const tournaments: ParsedTournament[] = [];

    try {
      // Read Excel file
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0]; // Use first sheet
      const worksheet = workbook.Sheets[sheetName];

      // Convert to JSON starting from row 5 (skip irrelevant headers)
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        range: 4, // Start from row 5 (0-indexed)
        header: ['date', 'description', 'referenceId', 'cashAmount']
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
      const date = new Date(dateOnlyStr);
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
      'Bandeiras': 'Flags',
      'Velocidade': 'Speed',
      'Moeda': 'Currency',
      'Data': 'Date',
      'Nome': 'Name',
      'Prêmio': 'Prize Pool',
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
    
    // Add Portuguese mappings with leading spaces support
    for (const [portuguese, english] of Object.entries(headerMap)) {
      // Check for both normal and space-prefixed versions
      const normalKey = portuguese;
      const spaceKey = ` ${portuguese}`;
      
      if (row[normalKey] !== undefined) {
        normalizedRow[english] = row[normalKey];
        normalizedRow[` ${english}`] = row[normalKey]; // Also add space-prefixed version
      }
      
      if (row[spaceKey] !== undefined) {
        normalizedRow[english] = row[spaceKey];
        normalizedRow[` ${english}`] = row[spaceKey]; // Also add space-prefixed version
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

  // 🎯 ETAPA 2.2: userId é sempre do contexto de autenticação (userPlatformId), nunca dos dados CSV
  static async parseCSV(fileContent: string, userId: string, exchangeRates: Record<string, number> = {}): Promise<ParsedTournament[]> {
    const tournaments: ParsedTournament[] = [];
    const rowErrors: { rowNum: number, error: string, rowData: any }[] = [];
    let rowNum = 0;

    // Pre-process CSV to fix unquoted monetary commas (e.g. "$5,000 GTD" -> "$5000 GTD")
    const processedContent = this.preprocessCSV(fileContent);

    return new Promise((resolve, reject) => {
      const stream = Readable.from(processedContent);

      stream
        .pipe(csv())
        .on('data', (data) => {
          rowNum++;
          try {

            if (this.isRowLikelyHeader(data)) {
            } else {
              const tournament = this.parsePokerSiteData(data, userId, exchangeRates);

              if (tournament && 
                  tournament.name && 
                  tournament.name.trim() !== '' && 
                  tournament.buyIn >= 0 && 
                  tournament.datePlayed instanceof Date && 
                  !isNaN(tournament.datePlayed.getTime())) {
                tournaments.push(tournament);
              } else {
              }
            }
          } catch (error: any) {
            const errorMessage = error.message || 'Unknown error parsing row';
            rowErrors.push({ rowNum, error: errorMessage, rowData: data });
          }
        })
        .on('end', () => {
          if (rowErrors.length > 0) {
            // Optionally, you could pass rowErrors up in the resolve or a custom object
            // resolve({ tournaments, errors: rowErrors });
            // For now, just resolving tournaments to maintain current behavior,
            // but errors are logged server-side.
          }
          if (tournaments.length === 0 && rowNum > 1) { // rowNum > 1 to account for header
          }
          resolve(tournaments);
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
    let originalCurrency = (row[' Currency'] || row['Currency'] || 'USD').toString().toUpperCase();
    let conversionRate = 1.0;
    let convertedToUSD = false;

    if (originalCurrency !== 'USD' && exchangeRates && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    }

    // Parse PokerStars specific fields (handle column names with spaces)
    const stake = this.parseFloatSafe(row[' Stake'] || row['Stake']) * conversionRate;
    const rake = this.parseFloatSafe(row[' Rake'] || row['Rake']) * conversionRate;
    const result = this.parseFloatSafe(row[' Result'] || row['Result']) * conversionRate;


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
    if (row['Moeda'] || row[' Moeda']) {
      originalCurrency = (row['Moeda'] || row[' Moeda']).toString().trim().toUpperCase();
    }
    // 2. FALLBACK: Colunas em inglês
    else if (row['Currency'] || row[' Currency']) {
      originalCurrency = (row['Currency'] || row[' Currency']).toString().trim().toUpperCase();
    }
    // 3. ÚLTIMO RECURSO: Detectar pelo valor do stake
    else {
      originalCurrency = this.detectCurrency(stakeValue);
    }
    
    let conversionRate = 1.0;
    let convertedToUSD = false;


    // 🔧 CORREÇÃO CRÍTICA: Verificar se exchangeRates existe e tem a taxa
    if (originalCurrency !== 'USD' && exchangeRates && typeof exchangeRates === 'object' && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    } else {
    }


    const stake = this.parseFloatSafe(stakeValue) * conversionRate;
    const rake = this.parseFloatSafe(row['Rake'] || row[' Rake']) * conversionRate;
    const buyIn = stake + rake;
    const result = this.parseFloatSafe(row['Result'] || row[' Result']) * conversionRate;
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
    let originalCurrency = row['Moeda'] || row[' Moeda'] || this.detectCurrency(row['Stake'] || row[' Stake'] || row['Buy-in'] || 'USD');
    let conversionRate = 1.0;
    let convertedToUSD = false;

    if (originalCurrency !== 'USD' && exchangeRates && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    }

    // Apply universal profit calculation: Resultado - Rake (handle leading spaces)
    const resultado = this.parseFloatSafe(row['Resultado'] || row[' Resultado']) * conversionRate;
    const rake = this.parseFloatSafe(row['Rake'] || row[' Rake']) * conversionRate;
    const profit = resultado - rake;

    // Buy-in calculation: Stake + Rake (total tournament cost)
    const stake = this.parseFloatSafe(row['Stake'] || row[' Stake'] || row['Buy-in']) * conversionRate;
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
      prizePool: this.parseFloatSafe(row['Prêmio'] || row[' Prêmio'] || row['Prize Pool']) * conversionRate,
      reentries: reentries,
      rake: rake,
      convertedToUSD: convertedToUSD,
    };
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
      const currency = row['Currency'] || row[' Currency'] || row['  Currency'] || 'USD';
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
      const convertedBuyIn = buyIn * conversionRate;
      const convertedRake = rake * conversionRate;
      const convertedResult = result * conversionRate;
      
      // Profit calculation: Result é já o lucro líquido no formato 888poker
      const profit = convertedResult;
      
      // Parse date - formato 888poker: "2025-06-09 13:32"
      let datePlayed: Date;
      try {
        if (dateStr.includes(' ')) {
          // Formato: "2025-06-09 13:32"
          datePlayed = new Date(dateStr);
        } else {
          datePlayed = new Date(dateStr);
        }
        
        // Validar data
        if (isNaN(datePlayed.getTime())) {
          return null;
        }
      } catch (error) {
        return null;
      }
      
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
    
    // Currency conversion for 888poker
    let originalCurrency = row['Moeda'] || this.detectCurrency(row['Stake'] || row['Buy-in'] || 'USD');
    let conversionRate = 1.0;
    let convertedToUSD = false;

    if (originalCurrency !== 'USD' && exchangeRates && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    }

    // Apply universal profit calculation: Resultado - Rake
    const resultado = this.parseFloatSafe(row['Resultado']) * conversionRate;
    const rake = this.parseFloatSafe(row['Rake']) * conversionRate;
    const profit = resultado - rake;

    // Buy-in calculation: Stake + Rake (total tournament cost)
    const stake = this.parseFloatSafe(row['Stake'] || row['Buy-in']) * conversionRate;
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
      prizePool: this.parseFloatSafe(row['Prêmio'] || row['Prize Pool']) * conversionRate,
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
    let originalCurrency = row[' Currency'] || 'USD';
    let conversionRate = 1.0;
    let convertedToUSD = false;

    if (originalCurrency !== 'USD' && exchangeRates && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    }

    // Parse values first
    const stake = this.parseFloatSafe(row[' Stake']) * conversionRate;
    const rake = this.parseFloatSafe(row[' Rake']) * conversionRate;
    const result = this.parseFloatSafe(row[' Result']) * conversionRate;

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
    let originalCurrency = (row[' Currency'] || row['Currency'] || 'EUR').toString().toUpperCase();
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
    const stake = stakeEUR * conversionRate;
    const rake = rakeEUR * conversionRate;
    const result = resultEUR * conversionRate;


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
    let originalCurrency = (row[' Currency'] || row['Currency'] || 'EUR').toString().toUpperCase();
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
    const stake = stakeEUR * conversionRate;
    const rake = rakeEUR * conversionRate;
    const result = resultEUR * conversionRate;


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

    // Generic network format - use provided siteName
    const name = row[' Name'] || row['Tournament Name'] || row['Tournament'] || row['name'] || row['tournament'] || '';
    const gameId = row[' Game ID'] || row['Game ID'] || row['id'] || '';

    const playerReentries = row[' ReEntries/Rebuys'] || row['ReEntries/Rebuys'] || row['reentries'] || '';



    // Currency conversion for Generic Network
    let originalCurrency = row[' Currency'] || row['Currency'] || 'USD';
    let conversionRate = 1.0;
    let convertedToUSD = false;

    if (originalCurrency !== 'USD' && exchangeRates && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    }

    // Parse buy-in and result - flexible field mapping
    const stake = this.parseFloatSafe(row[' Stake'] || row['Stake'] || row['Buy-in'] || row['buy_in'] || row['buyin']) * conversionRate;
    const result = this.parseFloatSafe(row[' Result'] || row['Result'] || row['winnings'] || row['prize']) * conversionRate;
    const rake = this.parseFloatSafe(row[' Rake'] || row['Rake'] || row['rake']) * conversionRate;

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
    let originalCurrency = row[' Currency'] || row['Currency'] || 'USD';
    let conversionRate = 1.0;
    let convertedToUSD = false;

    if (originalCurrency !== 'USD' && exchangeRates && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    }

    // Parse values first
    const stake = this.parseFloatSafe(row[' Stake'] || row['Stake']) * conversionRate;
    const rake = this.parseFloatSafe(row[' Rake'] || row['Rake']) * conversionRate;
    const result = this.parseFloatSafe(row[' Result'] || row['Result']) * conversionRate;

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
    let originalCurrency = row[' Currency'] || row['Currency'] || 'USD';
    let conversionRate = 1.0;
    let convertedToUSD = false;

    if (originalCurrency !== 'USD' && exchangeRates && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    }

    // Parse values first
    const stake = this.parseFloatSafe(row[' Stake'] || row['Stake']) * conversionRate;
    const rake = this.parseFloatSafe(row[' Rake'] || row['Rake']) * conversionRate;
    const result = this.parseFloatSafe(row[' Result'] || row['Result']) * conversionRate;

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

  private static parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  }

  private static detectFormat(name: any): string {
    return 'MTT'; // Default format
  }

  private static detectCategory(name: any, flags?: any): string {
    const nameUpper = (name || '').toString().toUpperCase();
    const flagsUpper = (flags || '').toString().toUpperCase();

    // Mystery has highest priority
    if (nameUpper.includes('MYSTERY')) {
      return 'Mystery';
    }

    // PKO has second priority
    if (flagsUpper.includes('BOUNTY') || 
        nameUpper.includes('PROGRESSIVE') || 
        nameUpper.includes('KNOCKOUT') ||
        /\bKO\b/.test(nameUpper) ||
        nameUpper.includes('BOUNTY') ||
        nameUpper.includes('PKO')) {
      return 'PKO';
    }

    // Default to Vanilla
    return 'Vanilla';
  }

  private static detectSpeed(speed: any, name: any): string {
    const speedUpper = (speed || '').toString().toUpperCase();
    const nameUpper = (name || '').toString().toUpperCase();

    if (speedUpper.includes('SUPER TURBO') || nameUpper.includes('SUPER TURBO')) {
      return 'Hyper';
    }

    if (speedUpper.includes('TURBO') || nameUpper.includes('TURBO')) {
      return 'Turbo';
    }

    return 'Normal';
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
      
      // Check for duplicates
      const validTournaments = [];
      const duplicateTournaments = [];
      const duplicateIds: string[] = [];
      
      for (const tournament of tournaments) {
        const isDuplicate = await storage.isDuplicateTournament(userId, tournament);
        if (isDuplicate) {
          duplicateTournaments.push(tournament);
          duplicateIds.push(tournament.tournamentId || `${tournament.name} (${tournament.datePlayed?.toISOString().split('T')[0] ?? 'unknown'})`);
        } else {
          validTournaments.push(tournament);
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
}