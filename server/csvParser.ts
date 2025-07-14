import { Readable } from "stream";
import csv from "csv-parser";
import * as XLSX from 'xlsx';

export interface ParsedTournament {
  userId: string;
  tournamentId?: string; // External tournament ID from poker sites
  name: string;
  buyIn: number; // Changed to number for internal calculations
  prize: number; // Changed to number for internal calculations (net profit)
  position: number;
  datePlayed: Date;
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
      console.error('Error parsing Coin line:', error, line);
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
        
        console.log(`✓ Bodog tournament processed: ${referenceId} - Buy-in: $${buyIn.amount}${matchingPayout ? `, Prize: $${prize}` : ', No payout (prize = 0)'}`);
      });
      
      console.log(`Bodog import summary: ${tournaments.length} unique tournaments from ${buyInsByRefId.size} Reference IDs`);
      
    } catch (error) {
      console.error('Error parsing Bodog XLSX:', error);
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

  static async parseCSV(fileContent: string, userId: string, exchangeRates: Record<string, number> = {}): Promise<ParsedTournament[]> {
    const tournaments: ParsedTournament[] = [];
    const rowErrors: { rowNum: number, error: string, rowData: any }[] = [];
    let rowNum = 0;

    return new Promise((resolve, reject) => {
      const stream = Readable.from(fileContent);
      
      stream
        .pipe(csv())
        .on('data', (data) => {
          rowNum++;
          try {
            console.log(`Processing row ${rowNum}:`, data);
            
            if (this.isRowLikelyHeader(data)) {
              console.log(`Row ${rowNum} identified as header, skipping`);
            } else {
              console.log(`Row ${rowNum} processing as data row`);
              const tournament = this.parsePokerSiteData(data, userId, exchangeRates);
              console.log(`Row ${rowNum} parsed result:`, tournament);
              
              if (tournament && 
                  tournament.name && 
                  tournament.name.trim() !== '' && 
                  tournament.buyIn >= 0 && 
                  tournament.datePlayed instanceof Date && 
                  !isNaN(tournament.datePlayed.getTime())) {
                console.log(`Row ${rowNum} valid tournament, adding to results`);
                tournaments.push(tournament);
              } else {
                console.log(`Row ${rowNum} skipped - validation failed:`, {
                  hasTournament: !!tournament,
                  hasName: tournament?.name?.trim(),
                  buyIn: tournament?.buyIn,
                  validDate: tournament?.datePlayed instanceof Date && !isNaN(tournament?.datePlayed.getTime()),
                  data
                });
              }
            }
          } catch (error: any) {
            const errorMessage = error.message || 'Unknown error parsing row';
            console.error(`Error parsing row ${rowNum}:`, errorMessage, data);
            rowErrors.push({ rowNum, error: errorMessage, rowData: data });
          }
        })
        .on('end', () => {
          if (rowErrors.length > 0) {
            console.warn(`Finished parsing CSV with ${rowErrors.length} row errors.`);
            // Optionally, you could pass rowErrors up in the resolve or a custom object
            // resolve({ tournaments, errors: rowErrors });
            // For now, just resolving tournaments to maintain current behavior,
            // but errors are logged server-side.
          }
          if (tournaments.length === 0 && rowNum > 1) { // rowNum > 1 to account for header
             console.warn("CSV parsed, but no valid tournaments were extracted. Possible reasons: all rows skipped, format not recognized, or validation failed for all rows.");
          }
          resolve(tournaments);
        })
        .on('error', (error) => {
          console.error('Critical CSV stream error:', error);
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


  private static parsePokerSiteData(row: any, userId: string, exchangeRates: Record<string, number>): ParsedTournament | null {
    console.log("parsePokerSiteData called with row:", row);
    console.log("Row keys:", Object.keys(row));
    console.log("🔍 NETWORK DEBUG - Network field value:", row['Network']);
    console.log("🔍 NETWORK DEBUG - Network field type:", typeof row['Network']);
    
    // PRIORIDADE 1: Verificar campo Network primeiro para sites conhecidos
    if (row['Network']) {
      const networkValue = row['Network'].toString().trim();
      console.log("🔍 NETWORK FIRST - Network value detected:", networkValue);
      
      // Mapear Network para parsers específicos
      switch (networkValue) {
        case 'PokerStars':
          console.log("PokerStars detected by Network field");
          return this.parsePokerStarsFormat(row, userId, exchangeRates);
        
        case '888Poker':
          console.log("888Poker detected by Network field");
          return this.parse888PokerFormat(row, userId, exchangeRates);
        
        case 'WPN':
          console.log("WPN Network detected by Network field");
          return this.parseWPNNetworkFormat(row, userId, exchangeRates);
        
        case 'Chico':
        case 'Chico Network':
          console.log("Chico Network detected by Network field");
          return this.parseChicoNetworkFormat(row, userId, exchangeRates);
        
        case 'PartyPoker':
          console.log("PartyPoker detected by Network field");
          return this.parsePartyPokerFormat(row, userId, exchangeRates);
        
        default:
          console.log("🔍 NETWORK UNKNOWN - Using Network value as site:", networkValue);
          return this.parseGenericNetworkFormat(row, userId, exchangeRates, networkValue);
      }
    }
    
    // PRIORIDADE 2: Formato brasileiro (GGNetwork, 888poker, WPN, etc.)
    if (row['Rede'] || row['Jogador'] || row['Stake'] || row['Resultado'] || row['Posição'] || row['Nome']) {
      console.log("Brazilian format detected - matching keys found");
      return PokerCSVParser.parseBrazilianFormat(row, userId, exchangeRates);
    }
    
    // PRIORIDADE 3: Formatos específicos por estrutura de colunas
    // PokerStars format detection
    if (row['Tournament'] || row['Date'] || row['Buy-in'] || row['Winnings']) {
      console.log("PokerStars format detected by column structure");
      return this.parsePokerStarsFormat(row, userId, exchangeRates);
    }
    
    // GGPoker format detection  
    if (row['Event'] || row['Tournament Name'] || row['Entry Fee']) {
      console.log("GGPoker format detected by column structure");
      return this.parseGGPokerFormat(row, userId, exchangeRates);
    }
    
    // PartyPoker/WPN columns with leading spaces - SÓ SE NÃO TIVER NETWORK
    if (row[' Name'] || row[' Stake'] || row[' Result'] || row[' Position']) {
      console.log("Sharkscope format detected by column structure - treating as Generic");
      return this.parseGenericNetworkFormat(row, userId, exchangeRates, 'Unknown');
    }
    
    // WPN Network (Americas Cardroom, Black Chip Poker, etc.) - Portuguese format
    if (row['Rede'] && row['Nome'] && (row['Data e hora'] || row['Data']) && row['Moeda'] && row['Stake'] && row['Rake'] !== undefined && row['Resultado'] !== undefined) {
      console.log("WPN Portuguese format detected by column structure");
      return PokerCSVParser.parseWPNPortugueseFormat(row, userId, exchangeRates);
    }
    
    // WPN Network (Americas Cardroom, Black Chip Poker, etc.) - English format
    if (row['Tournament'] && row['Buy In'] && row['Date']) {
      console.log("WPN English format detected by column structure");
      return this.parseWPNFormat(row, userId, exchangeRates);
    }
    
    // Generic format (fallback) - SEM FORÇAR PARTYPOKER
    console.log("🔍 FALLBACK - Using Generic format without forcing PartyPoker");
    return this.parseGenericFormat(row, userId, exchangeRates);
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


  private static parsePokerStarsFormat(row: any, userId: string, exchangeRates: Record<string, number> = {}): ParsedTournament {
    console.log("🔍 POKERSTARS PARSER DEBUG - parsePokerStarsFormat called with row:", row);
    
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
    
    console.log("🔍 POKERSTARS FIELD DEBUG - Name:", name);
    console.log("🔍 POKERSTARS FIELD DEBUG - Game ID:", gameId);
    console.log("🔍 POKERSTARS FIELD DEBUG - Stake:", row[' Stake']);
    console.log("🔍 POKERSTARS FIELD DEBUG - Date:", row[' Date']);
    console.log("🔍 POKERSTARS FIELD DEBUG - Result:", row[' Result']);
    console.log("🔍 POKERSTARS FIELD DEBUG - Position:", row[' Position']);
    console.log("🔍 POKERSTARS FIELD DEBUG - Rake:", row[' Rake']);
    console.log("🔍 POKERSTARS FIELD DEBUG - Entrants:", row[' Entrants']);
    console.log("🔍 POKERSTARS FIELD DEBUG - ReEntries/Rebuys:", row[' ReEntries/Rebuys']);
    
    if (!name.trim()) {
      console.log('🚨 POKERSTARS REJECTION - Row rejected due to empty name:', row);
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
    
    console.log("🔍 POKERSTARS NUMERIC PARSING:", {
      stake: { raw: row[' Stake'], parsed: stake },
      rake: { raw: row[' Rake'], parsed: rake },
      result: { raw: row[' Result'], parsed: result },
      conversionRate: conversionRate
    });
    
    // Calculate buy-in and profit for PokerStars
    const buyIn = stake + rake; // Total tournament cost
    const profit = result; // Result is already net profit in PokerStars format
    
    const position = this.parseIntSafe(row[' Position'] || row['Position']);
    const fieldSize = this.parseIntSafe(row[' Entrants'] || row['Entrants']);
    
    // Parse reentries for PokerStars
    const playerReentriesNumber = this.parseIntSafe(row[' ReEntries/Rebuys'] || row['ReEntries/Rebuys']);
    
    console.log("🔍 POKERSTARS REENTRIES CALCULATION:", {
      playerReentriesRaw: row[' ReEntries/Rebuys'],
      playerReentriesNumber: playerReentriesNumber,
      note: "Usando ReEntries/Rebuys (jogador)"
    });
    
    console.log("🔍 POKERSTARS CALCULATED VALUES:", {
      buyIn: buyIn,
      profit: profit,
      position: { raw: row[' Position'], parsed: position },
      fieldSize: { raw: row[' Entrants'], parsed: fieldSize },
      reentries: playerReentriesNumber
    });

    // Parse date with detailed logging
    const parsedDate = this.parseDate(row[' Date'] || row['Date']);
    console.log("🔍 POKERSTARS DATE PARSING:", {
      rawDate: row[' Date'],
      parsedDate: parsedDate,
      isValidDate: parsedDate && !isNaN(parsedDate.getTime()),
      dateType: typeof parsedDate
    });
    
    const tournamentId = gameId?.toString().trim();
    const flags = row[' Flags'] || row['Flags'] || '';
    const speed = (row[' Speed'] || row['Speed']) || '';
    
    console.log("🔍 POKERSTARS ADDITIONAL FIELDS:", {
      tournamentId: tournamentId,
      flags: flags,
      speed: speed,
      currency: originalCurrency
    });
    
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
    
    console.log("🔍 POKERSTARS FINAL TOURNAMENT OBJECT:", parsedTournament);
    
    // Final validation check
    const isValid = parsedTournament.name && parsedTournament.datePlayed && parsedTournament.buyIn >= 0;
    console.log("🔍 POKERSTARS FINAL VALIDATION:", {
      hasName: !!parsedTournament.name,
      hasDate: !!parsedTournament.datePlayed,
      hasValidBuyIn: parsedTournament.buyIn >= 0,
      overallValid: isValid
    });
    
    if (!isValid) {
      console.log("🚨 POKERSTARS REJECTION - Tournament failed final validation");
      return null;
    }
    
    return parsedTournament;
  }
  
  private static parseGGPokerFormat(row: any, userId: string, exchangeRates: Record<string, number> = {}): ParsedTournament {
    const name = row['Event'] || row['Tournament Name'] || '';
    
    // Currency conversion for GGPoker
    let originalCurrency = this.detectCurrency(row['Entry Fee'] || 'USD');
    let conversionRate = 1.0;
    let convertedToUSD = false;

    if (originalCurrency !== 'USD' && exchangeRates && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    }

    const buyIn = this.parseFloatSafe(row['Entry Fee']) * conversionRate;
    const prize = this.parseFloatSafe(row['Prize']) * conversionRate; // This is typically net profit for GG
    const position = this.parseIntSafe(row['Position'] || row['Rank']);

    return {
      userId,
      name: name,
      buyIn: buyIn,
      prize: prize,
      position: position,
      datePlayed: this.parseDate(row['Date'] || row['Start Time']),
      site: 'GGPoker',
      format: this.detectFormat(name),
      category: this.detectCategory(name),
      speed: this.detectSpeed(name),
      fieldSize: this.parseIntSafe(row['Players'] || row['Field']),
      currency: originalCurrency,
      finalTable: (position > 0 && position <= (this.parseIntSafe(row['Players per table'], 9) || 9)),
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
    const position = this.parseIntSafe(row['Posição'] || row[' Posição'] || row['Position']);
    const fieldSize = this.parseIntSafe(row['Participantes'] || row[' Participantes'] || row['Players']);
    const reentries = this.parseIntSafe(row['Reentradas/Recompras'] || row[' Reentradas/Recompras']) || 0;

    // Use tournament name from 'Nome' field (handling leading spaces and trimming properly)
    const finalName = name.trim() || `${(row['Jogo'] || row[' Jogo'] || 'Tournament')} - ${(row['Estrutura'] || row[' Estrutura'] || 'Unknown')}`;
    
    // Note: Only "Reentradas/Recompras" column should be used for player re-entries
    // Do not use "Total de Reentradas" or "Duração" columns
    
    // Enhanced validation - be more lenient with empty names but strict about meaningful content
    if (!finalName || finalName.trim() === '' || finalName === 'Tournament - Unknown' || finalName === '/' || finalName === '-') {
      console.log('Skipping Brazilian format row with no meaningful name:', { finalName, row });
      return null;
    }
    
    if (buyIn < 0) {
      console.log('Skipping invalid Brazilian format row (negative buy-in):', { name: finalName, buyIn, row });
      return null;
    }

    console.log('Processing Brazilian format row:', { 
      finalName, 
      buyIn, 
      resultado, 
      rake, 
      profit, 
      site: row['Rede'],
      position,
      fieldSize 
    });

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
    // Handle Brazilian CSV format with 'Rede' column
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
    const position = this.parseIntSafe(row['Posição'] || row['Position']);
    const fieldSize = this.parseIntSafe(row['Participantes'] || row['Players']);
    const reentries = this.parseIntSafe(row['Reentradas/Recompras']) || 0;

    // Enhanced validation - allow empty name if we have other data
    if (buyIn < 0) {
      console.log('Skipping invalid 888Poker row (negative buy-in):', { name, buyIn, row });
      return null;
    }

    // Use tournament name from 'Nome' field or construct from other fields
    const finalName = name || `${row['Jogo'] || 'Tournament'} - ${row['Estrutura'] || 'Unknown'}`;
    
    if (!finalName || finalName.trim() === '') {
      console.log('Skipping 888Poker row with no name:', { finalName, row });
      return null;
    }

    console.log('Processing 888Poker row:', { finalName, buyIn, profit, site: row['Rede'] });

    return {
      userId,
      name: finalName.trim(),
      buyIn: buyIn,
      prize: profit, // Using universal profit calculation
      position: position,
      datePlayed: this.parseDate(row['Data'] || row['Date'] || row['Start Time']),
      site: row['Rede'] || '888Poker',
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
  
  private static parseChicoNetworkFormat(row: any, userId: string, exchangeRates: Record<string, number> = {}): ParsedTournament {
    console.log("🔍 PARSER DEBUG - parseChicoNetworkFormat called with row:", row);
    
    // Chico Network columns have same structure as PartyPoker but with Network = 'Chico'
    const name = row[' Name'] || row['Tournament Name'] || '';
    const gameId = row[' Game ID'] || row['Game ID'] || '';
    
    const playerReentries = row[' ReEntries/Rebuys'] || row['ReEntries/Rebuys'] || '';
    const totalTournamentReentries = row[' Total ReEntries'] || row['Total ReEntries'] || 0;
    
    console.log("🔍 CHICO REENTRIES DEBUG - Campos de reentradas:", {
      name: name,
      gameId: gameId,
      playerReentries: playerReentries,
      totalTournamentReentries: totalTournamentReentries,
      network: row['Network']
    });
    
    // Currency conversion for Chico Network
    let originalCurrency = row[' Currency'] || 'USD';
    let conversionRate = 1.0;
    let convertedToUSD = false;

    if (originalCurrency !== 'USD' && exchangeRates && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    }

    // Parse buy-in and result
    const buyIn = this.parseFloatSafe(row[' Stake']) * conversionRate;
    const result = this.parseFloatSafe(row[' Result']) * conversionRate;
    const rake = this.parseFloatSafe(row[' Rake']) * conversionRate;
    
    // Calculate profit (Result - Rake for Chico)
    const profit = result - rake;
    
    const position = this.parseIntSafe(row[' Position']);
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
    
    console.log("🔍 CHICO FINAL TOURNAMENT:", {
      tournamentId: gameId,
      name: name,
      site: "Chico (correto)",
      finalObject: parsedTournament
    });
    
    return parsedTournament;
  }

  private static parseGenericNetworkFormat(row: any, userId: string, exchangeRates: Record<string, number> = {}, siteName: string): ParsedTournament {
    console.log("🔍 PARSER DEBUG - parseGenericNetworkFormat called with siteName:", siteName);
    console.log("🔍 PARSER DEBUG - row:", row);
    
    // Generic network format - use provided siteName
    const name = row[' Name'] || row['Tournament Name'] || row['name'] || row['tournament'] || '';
    const gameId = row[' Game ID'] || row['Game ID'] || row['id'] || '';
    
    const playerReentries = row[' ReEntries/Rebuys'] || row['ReEntries/Rebuys'] || row['reentries'] || '';
    
    console.log("🔍 GENERIC NETWORK DEBUG - Campos básicos:", {
      name: name,
      gameId: gameId,
      playerReentries: playerReentries,
      siteName: siteName,
      network: row['Network']
    });
    
    // Currency conversion for Generic Network
    let originalCurrency = row[' Currency'] || row['Currency'] || 'USD';
    let conversionRate = 1.0;
    let convertedToUSD = false;

    if (originalCurrency !== 'USD' && exchangeRates && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    }

    // Parse buy-in and result - flexible field mapping
    const buyIn = this.parseFloatSafe(row[' Stake'] || row['Stake'] || row['buy_in'] || row['buyin']) * conversionRate;
    const result = this.parseFloatSafe(row[' Result'] || row['Result'] || row['winnings'] || row['prize']) * conversionRate;
    const rake = this.parseFloatSafe(row[' Rake'] || row['Rake'] || row['rake']) * conversionRate;
    
    // Calculate profit (Result - Rake for Generic)
    const profit = result - rake;
    
    const position = this.parseIntSafe(row[' Position'] || row['Position'] || row['position'] || row['finish']);
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
    
    console.log("🔍 GENERIC NETWORK FINAL TOURNAMENT:", {
      tournamentId: gameId,
      name: name,
      site: siteName + " (from Network field or Unknown)",
      finalObject: parsedTournament
    });
    
    return parsedTournament;
  }

  private static parseWPNNetworkFormat(row: any, userId: string, exchangeRates: Record<string, number> = {}): ParsedTournament {
    console.log("🔍 PARSER DEBUG - parseWPNNetworkFormat called with row:", row);
    
    // WPN Network columns have same structure as PartyPoker but with Network = 'WPN'
    const name = row[' Name'] || row['Tournament Name'] || '';
    const gameId = row[' Game ID'] || row['Game ID'] || '';
    
    // CORREÇÃO: Usar campo correto para reentradas do jogador
    const playerReentries = row[' ReEntries/Rebuys'] || row['ReEntries/Rebuys'] || '';
    const totalTournamentReentries = row[' Total ReEntries'] || row['Total ReEntries'] || 0;
    
    console.log("🔍 WPN REENTRIES DEBUG - Campos de reentradas:", {
      name: name,
      gameId: gameId,
      playerReentries: playerReentries,
      totalTournamentReentries: totalTournamentReentries,
      stake: row[' Stake'],
      result: row[' Result'],
      rake: row[' Rake'],
      position: row[' Position'],
      entrants: row[' Entrants'],
      date: row[' Date'],
      currency: row[' Currency'],
      flags: row[' Flags'],
      speed: row[' Speed'],
      network: row['Network']
    });
    
    // Check if this is a multi-entry tournament
    const isMultiEntry = (row[' Flags'] || '').includes('Multi-Entry');
    console.log("🔍 WPN MULTIENTRY DEBUG:", {
      flags: row[' Flags'],
      isMultiEntry: isMultiEntry,
      playerReentries: playerReentries,
      totalTournamentReentries: totalTournamentReentries,
      gameId: gameId,
      network: row['Network']
    });
    
    // Currency conversion for WPN Network
    let originalCurrency = row[' Currency'] || 'USD';
    let conversionRate = 1.0;
    let convertedToUSD = false;

    if (originalCurrency !== 'USD' && exchangeRates && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    }

    // Parse buy-in and result
    const buyIn = this.parseFloatSafe(row[' Stake']) * conversionRate;
    const result = this.parseFloatSafe(row[' Result']) * conversionRate;
    const rake = this.parseFloatSafe(row[' Rake']) * conversionRate;
    
    // Calculate profit (Result - Rake for WPN)
    const profit = result - rake;
    
    const position = this.parseIntSafe(row[' Position']);
    const fieldSize = this.parseIntSafe(row[' Entrants']);

    // CORREÇÃO: Calcular reentradas do jogador corretamente
    const playerReentriesNumber = this.parseIntSafe(playerReentries);
    
    console.log("🔍 WPN REENTRIES CALCULATION:", {
      playerReentriesRaw: playerReentries,
      playerReentriesNumber: playerReentriesNumber,
      totalTournamentReentries: totalTournamentReentries,
      note: "Usando ReEntries/Rebuys (jogador) em vez de Total ReEntries (torneio)"
    });
    
    const parsedTournament = {
      userId,
      tournamentId: gameId?.toString().trim(), // Use Game ID as tournament ID
      name: name,
      buyIn: buyIn,
      prize: profit, // Net profit after rake
      position: position,
      datePlayed: this.parseDate(row[' Date']),
      site: 'WPN', // CORREÇÃO: Site correto é WPN, não PartyPoker
      format: this.detectFormat(name),
      category: this.detectCategory(name, row[' Flags']), // Use flags for category detection
      speed: this.detectSpeed(row[' Speed'] || '', name),
      fieldSize: fieldSize,
      currency: originalCurrency,
      finalTable: (position > 0 && (position <= 9 || position <= Math.ceil(fieldSize * 0.1))),
      bigHit: (profit > buyIn * 10 && buyIn > 0),
      convertedToUSD: convertedToUSD,
      reentries: playerReentriesNumber, // CORREÇÃO: Usar reentradas do jogador
    };
    
    console.log("🔍 WPN FINAL TOURNAMENT:", {
      tournamentId: gameId,
      name: name,
      buyIn: buyIn,
      playerReentries: playerReentriesNumber,
      totalTournamentReentries: totalTournamentReentries,
      fieldUsed: "ReEntries/Rebuys (correto)",
      site: "WPN (correto)",
      finalObject: parsedTournament
    });
    
    return parsedTournament;
  }

  private static parseChicoNetworkFormat(row: any, userId: string, exchangeRates: Record<string, number> = {}): ParsedTournament {
    console.log("🔍 PARSER DEBUG - parseChicoNetworkFormat called with row:", row);
    
    // Chico Network columns have same structure as PartyPoker but with Network = 'Chico'
    const name = row[' Name'] || row['Tournament Name'] || '';
    const gameId = row[' Game ID'] || row['Game ID'] || '';
    
    // CORREÇÃO: Usar campo correto para reentradas do jogador
    const playerReentries = row[' ReEntries/Rebuys'] || row['ReEntries/Rebuys'] || '';
    const totalTournamentReentries = row[' Total ReEntries'] || row['Total ReEntries'] || 0;
    
    console.log("🔍 CHICO REENTRIES DEBUG - Campos de reentradas:", {
      name: name,
      gameId: gameId,
      playerReentriesRaw: playerReentries,
      totalTournamentReentries: totalTournamentReentries,
      stake: row[' Stake'],
      result: row[' Result'],
      rake: row[' Rake'],
      position: row[' Position'],
      entrants: row[' Entrants'],
      date: row[' Date'],
      currency: row[' Currency'],
      flags: row[' Flags'],
      speed: row[' Speed'],
      network: row['Network']
    });
    
    // Check if this is a multi-entry tournament
    const isMultiEntry = (row[' Flags'] || '').includes('Multi-Entry');
    console.log("🔍 CHICO MULTIENTRY DEBUG:", {
      flags: row[' Flags'],
      isMultiEntry: isMultiEntry,
      playerReentries: playerReentries,
      totalTournamentReentries: totalTournamentReentries,
      gameId: gameId,
      network: row['Network']
    });
    
    // Currency conversion for Chico Network
    let originalCurrency = row[' Currency'] || 'USD';
    let conversionRate = 1.0;
    let convertedToUSD = false;

    if (originalCurrency !== 'USD' && exchangeRates && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    }

    // Parse buy-in and result
    const buyIn = this.parseFloatSafe(row[' Stake']) * conversionRate;
    const result = this.parseFloatSafe(row[' Result']) * conversionRate;
    const rake = this.parseFloatSafe(row[' Rake']) * conversionRate;
    
    // Calculate profit (Result - Rake for Chico)
    const profit = result - rake;
    
    const position = this.parseIntSafe(row[' Position']);
    const fieldSize = this.parseIntSafe(row[' Entrants']);

    // CORREÇÃO: Calcular reentradas do jogador corretamente
    const playerReentriesNumber = this.parseIntSafe(playerReentries);
    
    console.log("🔍 CHICO REENTRIES CALCULATION:", {
      playerReentriesRaw: playerReentries,
      playerReentriesNumber: playerReentriesNumber,
      totalTournamentReentries: totalTournamentReentries,
      note: "Usando ReEntries/Rebuys (jogador) em vez de Total ReEntries (torneio)"
    });
    
    const parsedTournament = {
      userId,
      tournamentId: gameId?.toString().trim(), // Use Game ID as tournament ID
      name: name,
      buyIn: buyIn,
      prize: profit, // Net profit after rake
      position: position,
      datePlayed: this.parseDate(row[' Date']),
      site: 'Chico', // CORREÇÃO: Site correto é Chico
      format: this.detectFormat(name),
      category: this.detectCategory(name, row[' Flags']), // Use flags for category detection
      speed: this.detectSpeed(row[' Speed'] || '', name),
      fieldSize: fieldSize,
      currency: originalCurrency,
      finalTable: (position > 0 && (position <= 9 || position <= Math.ceil(fieldSize * 0.1))),
      bigHit: (profit > buyIn * 10 && buyIn > 0),
      convertedToUSD: convertedToUSD,
      reentries: playerReentriesNumber, // CORREÇÃO: Usar reentradas do jogador
    };
    
    console.log("🔍 CHICO FINAL TOURNAMENT:", {
      tournamentId: gameId,
      name: name,
      buyIn: buyIn,
      playerReentries: playerReentriesNumber,
      totalTournamentReentries: totalTournamentReentries,
      fieldUsed: "ReEntries/Rebuys (correto)",
      site: "Chico (correto)",
      finalObject: parsedTournament
    });
    
    return parsedTournament;
  }

  private static parsePartyPokerFormat(row: any, userId: string, exchangeRates: Record<string, number> = {}): ParsedTournament {
    console.log("🔍 PARSER DEBUG - parsePartyPokerFormat called with row:", row);
    
    // PartyPoker columns have leading spaces (e.g., " Name", " Stake", " Result")
    const name = row[' Name'] || row['Tournament Name'] || '';
    const gameId = row[' Game ID'] || row['Game ID'] || '';
    
    // CORREÇÃO: Usar campo correto para reentradas do jogador
    const playerReentries = row[' ReEntries/Rebuys'] || row['ReEntries/Rebuys'] || '';
    const totalTournamentReentries = row[' Total ReEntries'] || row['Total ReEntries'] || 0;
    
    console.log("🔍 PARTYPOKER REENTRIES DEBUG - Campos de reentradas:", {
      name: name,
      gameId: gameId,
      playerReentriesRaw: playerReentries,
      totalTournamentReentries: totalTournamentReentries,
      stake: row[' Stake'],
      result: row[' Result'],
      rake: row[' Rake'],
      position: row[' Position'],
      entrants: row[' Entrants'],
      date: row[' Date'],
      currency: row[' Currency'],
      flags: row[' Flags'],
      speed: row[' Speed']
    });
    
    // Check if this is a multi-entry tournament
    const isMultiEntry = (row[' Flags'] || '').includes('Multi-Entry');
    console.log("🔍 PARTYPOKER MULTIENTRY DEBUG:", {
      flags: row[' Flags'],
      isMultiEntry: isMultiEntry,
      playerReentries: playerReentries,
      totalTournamentReentries: totalTournamentReentries,
      gameId: gameId
    });
    
    // Currency conversion for PartyPoker
    let originalCurrency = row[' Currency'] || 'USD';
    let conversionRate = 1.0;
    let convertedToUSD = false;

    if (originalCurrency !== 'USD' && exchangeRates && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    }

    // Parse buy-in and result
    const buyIn = this.parseFloatSafe(row[' Stake']) * conversionRate;
    const result = this.parseFloatSafe(row[' Result']) * conversionRate;
    const rake = this.parseFloatSafe(row[' Rake']) * conversionRate;
    
    // Calculate profit (Result - Rake for PartyPoker)
    const profit = result - rake;
    
    const position = this.parseIntSafe(row[' Position']);
    const fieldSize = this.parseIntSafe(row[' Entrants']);

    // CORREÇÃO: Calcular reentradas do jogador corretamente
    const playerReentriesNumber = this.parseIntSafe(playerReentries);
    
    console.log("🔍 PARTYPOKER REENTRIES CALCULATION:", {
      playerReentriesRaw: playerReentries,
      playerReentriesNumber: playerReentriesNumber,
      totalTournamentReentries: totalTournamentReentries,
      note: "Usando ReEntries/Rebuys (jogador) em vez de Total ReEntries (torneio)"
    });
    
    const parsedTournament = {
      userId,
      tournamentId: gameId?.toString().trim(), // Use Game ID as tournament ID
      name: name,
      buyIn: buyIn,
      prize: profit, // Net profit after rake
      position: position,
      datePlayed: this.parseDate(row[' Date']),
      site: 'PartyPoker',
      format: this.detectFormat(name),
      category: this.detectCategory(name, row[' Flags']), // Use flags for category detection
      speed: this.detectSpeed(row[' Speed'] || '', name),
      fieldSize: fieldSize,
      currency: originalCurrency,
      finalTable: (position > 0 && (position <= 9 || position <= Math.ceil(fieldSize * 0.1))),
      bigHit: (profit > buyIn * 10 && buyIn > 0),
      convertedToUSD: convertedToUSD,
      reentries: playerReentriesNumber, // CORREÇÃO: Usar reentradas do jogador
    };
    
    console.log("🔍 PARTYPOKER FINAL TOURNAMENT:", {
      tournamentId: gameId,
      name: name,
      buyIn: buyIn,
      playerReentries: playerReentriesNumber,
      totalTournamentReentries: totalTournamentReentries,
      fieldUsed: "ReEntries/Rebuys (correto)",
      finalObject: parsedTournament
    });
    
    return parsedTournament;
  }

  private static parse888PokerFormat(row: any, userId: string, exchangeRates: Record<string, number> = {}): ParsedTournament | null {
    console.log("🔍 PARSER DEBUG - parse888PokerFormat called with row:", row);
    
    // Debug field extraction - DETAILED
    const extractedName = row['Name'] || row[' Name'] || '';
    const extractedStake = row['Stake'] || row[' Stake'] || '';
    const extractedGameID = row['Game ID'] || row[' Game ID'] || '';
    const extractedDate = row['Date'] || row[' Date'] || '';
    const extractedResult = row['Result'] || row[' Result'] || '';
    const extractedPosition = row['Position'] || row[' Position'] || '';
    const extractedRake = row['Rake'] || row[' Rake'] || '';
    const extractedEntrants = row['Entrants'] || row[' Entrants'] || '';
    
    // CORREÇÃO: Extrair campo de reentradas igual ao PartyPoker
    const extractedReentries = row['ReEntries/Rebuys'] || row[' ReEntries/Rebuys'] || '';
    
    console.log("🔍 888POKER FIELD DEBUG - Name:", extractedName);
    console.log("🔍 888POKER FIELD DEBUG - Stake:", extractedStake);
    console.log("🔍 888POKER FIELD DEBUG - Game ID:", extractedGameID);
    console.log("🔍 888POKER FIELD DEBUG - Date:", extractedDate);
    console.log("🔍 888POKER FIELD DEBUG - Result:", extractedResult);
    console.log("🔍 888POKER FIELD DEBUG - Position:", extractedPosition);
    console.log("🔍 888POKER FIELD DEBUG - Rake:", extractedRake);
    console.log("🔍 888POKER FIELD DEBUG - Entrants:", extractedEntrants);
    console.log("🔍 888POKER FIELD DEBUG - ReEntries/Rebuys:", extractedReentries);
    
    // 888Poker CSV structure:
    // Network: "888Poker"
    // Player: "Docari"
    // Game ID: 273370872 (Tournament ID)
    // Stake: 100.0 (Buy-in)
    // Date: 2025-06-09 13:32
    // Entrants: 772 (Field size)
    // Rake: 9.0 (Rake)
    // Result: -100.0 (Profit/Loss)
    // Position: 681 (Final position)
    // Flags: "Deep-Stack Multi-Entry" (Category info)
    // Currency: "USD"
    // Name: "$100,000 Mystery Bounty Main Event"
    
    const name = extractedName;
    console.log("🔍 888POKER VALIDATION - Name validation:", {
      rawName: name,
      trimmed: name.trim(),
      isValid: name.trim() !== '',
      length: name.trim().length
    });
    
    if (!name.trim()) {
      console.log('🚨 888POKER REJECTION - Row rejected due to empty name:', row);
      return null;
    }
    
    // Currency conversion
    let originalCurrency = (row['Currency'] || row[' Currency'] || 'USD').toString().toUpperCase();
    let conversionRate = 1.0;
    let convertedToUSD = false;

    if (originalCurrency !== 'USD' && exchangeRates && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    }

    // Parse 888Poker specific fields (handle column names with spaces)
    const stake = this.parseFloatSafe(extractedStake) * conversionRate;
    const rake = this.parseFloatSafe(extractedRake) * conversionRate;
    const result = this.parseFloatSafe(extractedResult) * conversionRate;
    
    console.log("🔍 888POKER NUMERIC PARSING:", {
      stake: { raw: extractedStake, parsed: stake },
      rake: { raw: extractedRake, parsed: rake },
      result: { raw: extractedResult, parsed: result },
      conversionRate: conversionRate
    });
    
    // Calculate buy-in and profit
    const buyIn = stake + rake; // Total tournament cost
    const profit = result - rake; // Net profit after rake
    
    const position = this.parseIntSafe(extractedPosition);
    const fieldSize = this.parseIntSafe(extractedEntrants);
    
    // CORREÇÃO: Calcular reentradas do jogador igual ao PartyPoker
    const playerReentriesNumber = this.parseIntSafe(extractedReentries);
    
    console.log("🔍 888POKER REENTRIES CALCULATION:", {
      playerReentriesRaw: extractedReentries,
      playerReentriesNumber: playerReentriesNumber,
      note: "Usando ReEntries/Rebuys (jogador) igual ao PartyPoker"
    });
    
    console.log("🔍 888POKER CALCULATED VALUES:", {
      buyIn: buyIn,
      profit: profit,
      position: { raw: extractedPosition, parsed: position },
      fieldSize: { raw: extractedEntrants, parsed: fieldSize },
      reentries: playerReentriesNumber
    });

    // Parse date with detailed logging
    const parsedDate = this.parseDate(extractedDate);
    console.log("🔍 888POKER DATE PARSING:", {
      rawDate: extractedDate,
      parsedDate: parsedDate,
      isValidDate: parsedDate && !isNaN(parsedDate.getTime()),
      dateType: typeof parsedDate
    });
    
    const tournamentId = extractedGameID?.toString().trim();
    const flags = row['Flags'] || row[' Flags'] || '';
    const speed = (row['Speed'] || row[' Speed']) || '';
    const currency = (row['Currency'] || row[' Currency'] || 'USD').toString().toUpperCase();
    
    console.log("🔍 888POKER ADDITIONAL FIELDS:", {
      tournamentId: tournamentId,
      flags: flags,
      speed: speed,
      currency: currency
    });
    
    const parsedTournament = {
      userId,
      tournamentId: tournamentId,
      name: name,
      buyIn: buyIn,
      prize: profit,
      position: position,
      datePlayed: parsedDate,
      site: '888Poker',
      format: this.detectFormat(name),
      category: this.detectCategory(name, flags),
      speed: this.detectSpeed(speed, name),
      fieldSize: fieldSize,
      currency: currency,
      finalTable: (position > 0 && (position <= 9 || position <= Math.ceil(fieldSize * 0.1))),
      bigHit: (profit > buyIn * 10 && buyIn > 0),
      convertedToUSD: convertedToUSD,
      reentries: playerReentriesNumber, // CORREÇÃO: Adicionar reentradas igual ao PartyPoker
    };
    
    console.log("🔍 888POKER FINAL TOURNAMENT OBJECT:", parsedTournament);
    
    // Final validation check
    const isValid = parsedTournament.name && parsedTournament.datePlayed && parsedTournament.buyIn >= 0;
    console.log("🔍 888POKER FINAL VALIDATION:", {
      hasName: !!parsedTournament.name,
      hasDate: !!parsedTournament.datePlayed,
      hasValidBuyIn: parsedTournament.buyIn >= 0,
      overallValid: isValid
    });
    
    if (!isValid) {
      console.log("🚨 888POKER REJECTION - Tournament failed final validation");
      return null;
    }
    
    return parsedTournament;
  }

  private static parseWPNPortugueseFormat(row: any, userId: string, exchangeRates: Record<string, number>): ParsedTournament | null {
    // WPN Column Names (based on user's description and CSV example)
    // Coluna A: Rede -> row['Rede']
    // Coluna B: Jogador (Ignored)
    // Coluna C: ID do Jogo (Ignored by user, but could be useful for unique ID)
    // Coluna D: Buy-in -> row['Stake'] (as per existing code and common WPN term for buy-in part)
    // Coluna E: Data e hora -> row['Data e hora'] or row['Data'] (existing code uses 'Data')
    // Coluna F: Total de Participantes do torneio -> row['Participantes'] (existing code) or row['Total de Participantes do torneio']
    // Coluna G: Rake -> row['Rake']
    // Coluna H: Tipo de Jogo (Ignored)
    // Coluna I: Estrutura do jogo (Ignored)
    // Coluna J: Velocidade -> row['Velocidade']
    // Coluna K: Resultado -> row['Resultado'] (Player's winnings from prize pool + bounties if any, before rake deduction by some WPN reports)
    // Coluna L: Posição -> row['Posição']
    // Coluna M: Bandeira -> row['Bandeiras'] (existing code) or row['Bandeira']
    // Coluna N: Moeda -> row['Moeda']
    // Coluna O: Reentradas do Jogador -> row['Reentradas do Jogador'] or existing fallbacks
    // Coluna P: Duração (Ignored)
    // Coluna Q: Jogadores por mesa (Ignored)
    // Coluna R: Premiação -> row['Prêmio'] (existing code for prize pool) or row['Premiação']
    // Coluna S: Nome do Torneio -> row['Nome'] (existing code) or row['Nome do Torneio']
    // Coluna T: Total de reentradas do torneio (Not explicitly used for player stats but could be for tournament analysis)

    // Map columns according to user specification:
    // S: Nome do Torneio (Column S) -> CSV example uses 'Nome'
    const tournamentName = this.findField(row, ['Nome', 'Nome do Torneio', 'S']) || '';
    if (!tournamentName.trim()) {
      console.warn('Skipping WPN row with empty tournament name:', row);
      return null;
    }

    // N: Moeda (Column N) -> CSV example uses 'Moeda'
    let originalCurrency = (this.findField(row, ['Moeda', 'N']) || 'USD').toString().toUpperCase();
    let conversionRate = 1.0;
    let convertedToUSD = false;

    if (originalCurrency !== 'USD' && exchangeRates && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    } else if (originalCurrency !== 'USD') {
      console.warn(`Exchange rate for ${originalCurrency} not found for user ${userId}. Values will be stored in ${originalCurrency}. Tournament: ${tournamentName}`);
      // If currency is not USD and no rate is found, we might choose to skip or store as is.
      // For now, it proceeds with conversionRate = 1.0, meaning values are stored as if they were USD.
      // This might need adjustment based on desired behavior for missing exchange rates.
    }

    // D: Buy-in (Column D) -> CSV example uses 'Stake'
    // User spec: Stake (D), Rake (G), Resultado (K), Premio (R) should be converted.
    const rawStake = this.findField(row, ['Stake', 'Buy-in', 'Buy In', 'D']);
    let stake = this.parseFloatSafe(rawStake) * conversionRate;

    // G: Rake (Column G) -> CSV example uses 'Rake'
    const rawRake = this.findField(row, ['Rake', 'G']);
    let rake = this.parseFloatSafe(rawRake) * conversionRate;
    
    // Buy-in calculation: Stake + Rake (total tournament cost)
    let buyIn = stake + rake;

    // K: Resultado (Column K) -> CSV example uses 'Resultado'
    const rawResultado = this.findField(row, ['Resultado', 'K']);
    let resultado = this.parseFloatSafe(rawResultado) * conversionRate;
    
    // Profit calculation as specified: Resultado (K) - Rake (G)
    // Both resultado and rake are now in USD if conversion happened, or original currency if not.
    let profit = resultado - rake;

    // R: Premiação (Prize Pool) (Column R) -> CSV example uses 'Prêmio'
    const rawPrizePool = this.findField(row, ['Prêmio', 'Premiação', 'R']);
    const prizePool = this.parseFloatSafe(rawPrizePool) * conversionRate;
    
    // A: Rede (Column A) -> CSV example uses 'Rede'
    const rede = this.findField(row, ['Rede', 'A']) || 'WPN Network';
    // E: Data e hora (Column E) -> CSV example uses 'Data'
    const datePlayed = this.parseDate(this.findField(row, ['Data e hora', 'Data', 'E']) || '');
    // L: Posição (Column L) -> CSV example uses 'Posição'
    const position = this.parseIntSafe(this.findField(row, ['Posição', 'L']) || '0');
    // F: Total de Participantes do torneio (Column F) -> CSV example uses 'Participantes'
    const fieldSize = this.parseIntSafe(this.findField(row, ['Participantes', 'Total de Participantes do torneio', 'F']) || '0');
    // J: Velocidade (Column J) -> CSV example uses 'Velocidade'
    const velocidadeField = this.findField(row, ['Velocidade', 'J']) || 'Normal';
    // M: Bandeira (Column M) -> CSV example uses 'Bandeiras'
    const bandeiras = this.findField(row, ['Bandeiras', 'Bandeira', 'M']) || '';
    // O: Reentradas do Jogador (Column O) -> CSV example uses 'Reentradas/Recompras'
    const reentries = this.parseIntSafe(this.findField(row, ['Reentradas do Jogador', 'Reentradas/Recompras', 'O']) || '0');
    // T: Total de reentradas do torneio (Column T) -> CSV example uses 'Total de Reentradas'
    // const totalTournamentReentries = this.parseIntSafe(this.findField(row, ['Total de reentradas do torneio', 'Total de Reentradas', 'T']) || '0'); // Not directly used in ParsedTournament

    // Category detection (Priority: Mystery > PKO > Vanilla)
    let category = 'Vanilla'; // Default
    const nameLower = tournamentName.toLowerCase();
    const bandeirasLower = bandeiras.toLowerCase();

    if (nameLower.includes('mystery')) {
      category = 'Mystery';
    } else if (bandeirasLower.includes('bounty') || 
               nameLower.includes('progressive') ||
               nameLower.includes('knockout') ||
               nameLower.includes('ko') ||
               nameLower.includes('bounty') ) { // Re-added nameLower.includes('bounty') as per user spec
      category = 'PKO';
    }
    
    // Speed detection: Normal, Turbo, Hyper (Super Turbo)
    let speed = 'Normal'; // Default
    const velocidadeLower = velocidadeField.toLowerCase();
    if (velocidadeLower.includes('super turbo') || velocidadeLower.includes('hyper')) { // Accept 'hyper' as well
      speed = 'Hyper';
    } else if (velocidadeLower.includes('turbo')) {
      speed = 'Turbo';
    }
    // 'Normal' remains default if 'normal', empty, or not caught

    const siteNetwork = rede; // Use the value from 'Rede' column


    return {
      userId,
      name: tournamentName,
      buyIn: Math.max(0, buyIn), // Ensure non-negative
      prize: profit, // This is the net profit/loss
      position: position,
      datePlayed: datePlayed,
      site: siteNetwork,
      format: this.detectFormat(tournamentName), // Standard format detection
      category: category,
      speed: speed,
      fieldSize: fieldSize,
      currency: originalCurrency, // Store original currency before conversion
      finalTable: (position > 0 && position <= 9 && fieldSize > 9), // Standard FT definition, can be refined
      bigHit: (profit > buyIn * 10 && buyIn > 0),
      prizePool: prizePool,
      reentries: reentries,
      rake: rake,
      convertedToUSD: convertedToUSD,
    };
  }

  private static parseWPNFormat(row: any, userId: string, exchangeRates: Record<string, number> = {}): ParsedTournament {
    const name = row['Tournament'] || '';
    
    // Currency conversion for WPN English format
    let originalCurrency = this.detectCurrency(row['Buy In'] || 'USD');
    let conversionRate = 1.0;
    let convertedToUSD = false;

    if (originalCurrency !== 'USD' && exchangeRates && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    }

    const buyIn = this.parseFloatSafe(row['Buy In']) * conversionRate;
    const prize = this.parseFloatSafe(row['Winnings']) * conversionRate;
    const position = this.parseIntSafe(row['Place'] || row['Position']);

    return {
      userId,
      name: name,
      buyIn: buyIn,
      prize: prize,
      position: position,
      datePlayed: this.parseDate(row['Date']),
      site: 'WPN Network',
      format: this.detectFormat(name),
      category: this.detectCategory(name),
      speed: this.detectSpeed(name),
      fieldSize: this.parseIntSafe(row['Players']),
      currency: originalCurrency,
      finalTable: (position > 0 && position <= 9),
      bigHit: (prize > buyIn * 10 && buyIn > 0),
      convertedToUSD: convertedToUSD,
    };
  }
  
  private static parseGenericFormat(row: any, userId: string, exchangeRates: Record<string, number> = {}): ParsedTournament {
    const nameFields = ['name', 'tournament', 'event', 'game', 'tournament_name'];
    const buyinFields = ['buyin', 'buy_in', 'buy-in', 'entry_fee', 'entry', 'stake'];
    const prizeFields = ['prize', 'winnings', 'prize_won', 'earnings', 'win']; // Typically net profit
    const positionFields = ['position', 'finish', 'rank', 'place'];
    const dateFields = ['date', 'date_played', 'start_time', 'timestamp'];
    
    const name = this.findField(row, nameFields) || '';
    
    // Currency conversion for generic format
    let originalCurrency = this.detectCurrency(this.findField(row, buyinFields) || 'USD');
    let conversionRate = 1.0;
    let convertedToUSD = false;

    if (originalCurrency !== 'USD' && exchangeRates && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    }

    const buyIn = this.parseFloatSafe(this.findField(row, buyinFields)) * conversionRate;
    const prize = this.parseFloatSafe(this.findField(row, prizeFields)) * conversionRate;
    const position = this.parseIntSafe(this.findField(row, positionFields));
    
    return {
      userId,
      name: name,
      buyIn: buyIn,
      prize: prize,
      position: position,
      datePlayed: this.parseDate(this.findField(row, dateFields) || ''),
      site: row.site || 'Unknown',
      format: this.detectFormat(name),
      category: this.detectCategory(name),
      speed: this.detectSpeed(name),
      fieldSize: this.parseIntSafe(row.field_size || row.entries || row.players),
      currency: originalCurrency,
      finalTable: (position > 0 && position <= 9),
      bigHit: (prize > buyIn * 10 && buyIn > 0),
      convertedToUSD: convertedToUSD,
    };
  }
  
  private static findField(row: any, fields: string[]): string | null {
    for (const field of fields) {
      if (row[field] !== undefined && row[field] !== null && row[field] !== '') {
        return row[field];
      }
      // Try case variations
      const lowerField = field.toLowerCase();
      const upperField = field.toUpperCase();
      const titleField = field.charAt(0).toUpperCase() + field.slice(1);
      
      if (row[lowerField]) return row[lowerField];
      if (row[upperField]) return row[upperField];
      if (row[titleField]) return row[titleField];
    }
    return null;
  }
  
  private static parseDate(dateStr: string): Date {
    if (!dateStr) return new Date();
    
    const cleanDateStr = dateStr.toString().trim();
    
    // Try parsing the date directly first
    const directParse = new Date(cleanDateStr);
    if (!isNaN(directParse.getTime())) {
      return directParse;
    }
    
    // Try different date formats common in Brazil and WPN
    const formats = [
      { regex: /^(\d{4})-(\d{2})-(\d{2})/, order: [1, 2, 3] }, // YYYY-MM-DD
      { regex: /^(\d{2})\/(\d{2})\/(\d{4})/, order: [3, 2, 1] }, // DD/MM/YYYY (Brazilian)
      { regex: /^(\d{2})-(\d{2})-(\d{4})/, order: [3, 2, 1] }, // DD-MM-YYYY
      { regex: /^(\d{4})\/(\d{2})\/(\d{2})/, order: [1, 2, 3] }, // YYYY/MM/DD
      { regex: /^(\d{2})\.(\d{2})\.(\d{4})/, order: [3, 2, 1] }, // DD.MM.YYYY
      { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})/, order: [3, 2, 1] }, // D/M/YYYY or DD/MM/YYYY
    ];
    
    for (const format of formats) {
      const match = cleanDateStr.match(format.regex);
      if (match) {
        const year = parseInt(match[format.order[0]]);
        const month = parseInt(match[format.order[1]]) - 1; // Month is 0-indexed
        const day = parseInt(match[format.order[2]]);
        
        const parsed = new Date(year, month, day);
        if (!isNaN(parsed.getTime()) && year >= 2000 && year <= 2030) {
          return parsed;
        }
      }
    }
    
    // If all else fails, try to extract just numbers and assume DD/MM/YYYY
    const numbers = cleanDateStr.match(/\d+/g);
    if (numbers && numbers.length >= 3) {
      const day = parseInt(numbers[0]);
      const month = parseInt(numbers[1]) - 1;
      const year = parseInt(numbers[2]);
      
      if (year >= 2000 && year <= 2030 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
        return new Date(year, month, day);
      }
    }
    
    console.log('Could not parse date:', cleanDateStr, 'using current date');
    return new Date();
  }
  
  private static detectFormat(name: string): string {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('sit') || lowerName.includes('sng')) return 'SNG';
    if (lowerName.includes('spin') || lowerName.includes('jackpot')) return 'Spin & Go';
    if (lowerName.includes('satellite') || lowerName.includes('sat')) return 'Satellite';
    if (lowerName.includes('freeroll')) return 'Freeroll';
    if (lowerName.includes('heads up') || lowerName.includes('hu')) return 'Heads-Up';
    return 'MTT';
  }
  
  private static detectCategory(name: string, flags?: string): string {
    const nameUpper = name.toUpperCase();
    const flagsUpper = (flags || '').toUpperCase();
    
    // Priority order: Mystery > PKO > Vanilla (as specified by user)
    
    // Mystery has highest priority
    if (nameUpper.includes('MYSTERY')) {
      return 'Mystery';
    }
    
    // PKO/Bounty has second priority - check both name and flags
    if (flagsUpper.includes('BOUNTY') || 
        nameUpper.includes('PROGRESSIVE') || 
        nameUpper.includes('KNOCKOUT') || 
        nameUpper.includes('KO') || 
        nameUpper.includes('BOUNTY') ||
        nameUpper.includes('PKO')) {
      return 'PKO';
    }
    
    // Default to Vanilla for all other tournaments
    return 'Vanilla';
  }
  
  private static detectSpeed(speedField: string, name?: string): string {
    const speedLower = speedField.toLowerCase();
    const nameLower = (name || '').toLowerCase();
    
    // Check speed field first (more reliable)
    if (speedLower.includes('super turbo') || speedLower.includes('hyper')) {
      return 'Hyper';
    }
    if (speedLower.includes('turbo')) {
      return 'Turbo';
    }
    if (speedLower.includes('normal') || speedLower === '') {
      return 'Normal';
    }
    
    // Fallback to name detection if speed field is unclear
    if (nameLower.includes('hyper') || nameLower.includes('super turbo')) {
      return 'Hyper';
    }
    if (nameLower.includes('turbo')) {
      return 'Turbo';
    }
    
    return 'Normal';
  }
  
  private static detectCurrency(text: string): string {
    if (!text) return 'USD';
    if (text.includes('€') || text.includes('EUR')) return 'EUR';
    if (text.includes('£') || text.includes('GBP')) return 'GBP';
    if (text.includes('R$') || text.includes('BRL')) return 'BRL';
    if (text.includes('¥') || text.includes('CNY')) return 'CNY';
    if (text.includes('₹') || text.includes('INR')) return 'INR';
    if (text.includes('₽') || text.includes('RUB')) return 'RUB';
    return 'USD';
  }

  // Optimized parseCSV with batch duplicate checking
  static async parseCSVWithDuplicateCheck(fileContent: string, userId: string, exchangeRates: Record<string, number> = {}, storage: any): Promise<{
    tournaments: ParsedTournament[];
    duplicatesIgnored: number;
    duplicateIds: string[];
  }> {
    const tournaments: ParsedTournament[] = [];
    const rowErrors: { rowNum: number, error: string, rowData: any }[] = [];
    let rowNum = 0;
    
    return new Promise((resolve, reject) => {
      const stream = Readable.from(fileContent);
      
      stream
        .pipe(csv())
        .on('data', (data) => {
          rowNum++;
          try {
            console.log(`Processing row ${rowNum}:`, data);
            
            if (this.isRowLikelyHeader(data)) {
              console.log(`Row ${rowNum} identified as header, skipping`);
            } else {
              console.log(`Row ${rowNum} processing as data row`);
              const tournament = this.parsePokerSiteData(data, userId, exchangeRates);
              console.log(`Row ${rowNum} parsed result:`, tournament);
              
              if (tournament && 
                  tournament.name && 
                  tournament.name.trim() !== '' && 
                  tournament.buyIn >= 0 && 
                  tournament.datePlayed instanceof Date && 
                  !isNaN(tournament.datePlayed.getTime())) {
                console.log(`Row ${rowNum} valid tournament, adding to results`);
                tournaments.push(tournament);
              } else {
                console.log(`Row ${rowNum} skipped - validation failed:`, {
                  hasTournament: !!tournament,
                  hasName: tournament?.name?.trim(),
                  buyIn: tournament?.buyIn,
                  validDate: tournament?.datePlayed instanceof Date && !isNaN(tournament?.datePlayed.getTime()),
                  data
                });
              }
            }
          } catch (error: any) {
            const errorMessage = error.message || 'Unknown error parsing row';
            console.error(`Error parsing row ${rowNum}:`, errorMessage, data);
            rowErrors.push({ rowNum, error: errorMessage, rowData: data });
          }
        })
        .on('end', async () => {
          try {
            // Extract Tournament IDs for batch checking
            const tournamentIds = tournaments
              .map(t => t.tournamentId)
              .filter(id => id && id.trim() !== '');
            
            console.log(`🔍 DUPLICATE CHECK - Processing ${tournaments.length} tournaments, ${tournamentIds.length} have Tournament IDs`);
            
            // Batch check for duplicates by Tournament ID
            const duplicateIds = await storage.batchCheckDuplicateTournamentIds(userId, tournamentIds);
            
            // Filter out duplicates
            const validTournaments: ParsedTournament[] = [];
            const ignoredDuplicates: string[] = [];
            
            for (const tournament of tournaments) {
              if (tournament.tournamentId && duplicateIds.has(tournament.tournamentId)) {
                ignoredDuplicates.push(tournament.tournamentId);
                console.log(`🔍 DUPLICATE CHECK - Skipping duplicate Tournament ID: ${tournament.tournamentId}`);
              } else {
                // For tournaments without ID, check traditional duplicate detection
                const isDuplicate = await storage.isDuplicateTournament(userId, tournament);
                if (isDuplicate) {
                  ignoredDuplicates.push(`${tournament.name} (${tournament.datePlayed.toISOString().split('T')[0]})`);
                  console.log(`🔍 DUPLICATE CHECK - Skipping duplicate tournament: ${tournament.name}`);
                } else {
                  validTournaments.push(tournament);
                }
              }
            }
            
            if (rowErrors.length > 0) {
              console.warn(`Finished parsing CSV with ${rowErrors.length} row errors.`);
            }
            
            resolve({
              tournaments: validTournaments,
              duplicatesIgnored: ignoredDuplicates.length,
              duplicateIds: ignoredDuplicates
            });
          } catch (error) {
            reject(error);
          }
        })
        .on('error', (error) => {
          console.error('Critical CSV stream error:', error);
          reject(new Error(`CSV Stream Error: ${error.message}`));
        });
    });
  }
}