import { Readable } from "stream";
import csv from "csv-parser";

export interface ParsedTournament {
  userId: string;
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
  static async parseCSV(fileContent: string, userId: string, exchangeRates: Record<string, number> = {}): Promise<ParsedTournament[]> {
    const tournaments: ParsedTournament[] = [];
    
    return new Promise((resolve, reject) => {
      const stream = Readable.from(fileContent);
      
      stream
        .pipe(csv())
        .on('data', (row) => {
          try {
            const tournament = this.parsePokerSiteData(row, userId, exchangeRates);
            if (tournament && 
                tournament.name && 
                tournament.name.trim() !== '' && 
                tournament.buyIn >= 0) { // buyIn is now a number
              tournaments.push(tournament);
            }
          } catch (error) {
            console.error('Error parsing row:', error, row);
          }
        })
        .on('end', () => {
          resolve(tournaments);
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  }

  private static parsePokerSiteData(row: any, userId: string, exchangeRates: Record<string, number>): ParsedTournament | null {
    // PokerStars format detection
    if (row['Tournament'] || row['Date'] || row['Buy-in'] || row['Winnings']) {
      return this.parsePokerStarsFormat(row, userId); // TODO: Consider if exchange rates apply here
    }
    
    // GGPoker format detection  
    if (row['Event'] || row['Tournament Name'] || row['Entry Fee']) {
      return this.parseGGPokerFormat(row, userId); // TODO: Consider if exchange rates apply here
    }
    
    // 888poker format detection
    if (row['Game'] || row['Tournament ID'] || row['Prize Won']) {
      return this.parse888PokerFormat(row, userId); // TODO: Consider if exchange rates apply here
    }
    
    // partypoker format detection
    if (row['Tournament Name'] || row['Buy In'] || row['Prize']) {
      return this.parsePartyPokerFormat(row, userId); // TODO: Consider if exchange rates apply here
    }
    
    // WPN Network (Americas Cardroom, Black Chip Poker, etc.) - Portuguese format
    // Uses more specific column names from the user's description
    if (row['Rede'] && row['Nome'] && row['Data e hora'] && row['Moeda']) {
        return PokerCSVParser.parseWPNPortugueseFormat(row, userId, exchangeRates);
    }
    // Fallback for WPN with less specific columns (older or different WPN CSVs)
    if (row['Rede'] || row['Stake'] || row['Participantes'] || row['Posição'] || 
        row['Nome'] || row['Data'] || row['Resultado'] ||
        row['Bandeiras'] || row['Velocidade'] || row['Moeda']) {
      return PokerCSVParser.parseWPNPortugueseFormat(row, userId, exchangeRates);
    }
    
    // WPN Network (Americas Cardroom, Black Chip Poker, etc.) - English format
    if (row['Tournament'] && row['Buy In'] && row['Date']) {
      return this.parseWPNFormat(row, userId); // TODO: Consider if exchange rates apply here
    }
    
    // Generic format (fallback)
    return this.parseGenericFormat(row, userId); // TODO: Consider if exchange rates apply here
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


  private static parsePokerStarsFormat(row: any, userId: string): ParsedTournament {
    const tournamentName = row['Tournament'] || '';
    const buyInText = row['Buy-in'] || '';
    const buyInMatch = buyInText.match(/\$?(\d+(?:\.\d{2})?)/);
    const buyIn = buyInMatch ? this.parseFloatSafe(buyInMatch[1]) : 0;
    const prize = this.parseFloatSafe(row['Winnings']);
    const position = this.parseIntSafe(row['Position'] || row['Finish']);
    
    return {
      userId,
      name: tournamentName,
      buyIn: buyIn,
      prize: prize, // This is typically net profit for PS
      position: position,
      datePlayed: this.parseDate(row['Date']),
      site: 'PokerStars',
      format: this.detectFormat(tournamentName),
      category: this.detectCategory(tournamentName), // May need adjustment for PKO/Mystery based on PS specific tags if any
      speed: this.detectSpeed(tournamentName),
      fieldSize: this.parseIntSafe(row['Entries']),
      currency: this.detectCurrency(buyInText || row['Winnings'] || 'USD'),
      finalTable: (position > 0 && position <= (this.parseIntSafe(row['Players per table'], 9) || 9)), // More accurate FT for PS
      bigHit: (prize > buyIn * 10 && buyIn > 0),
      prizePool: this.parseFloatSafe(row['Prize Pool']),
      reentries: this.parseIntSafe(row['Rebuys']) + this.parseIntSafe(row['Add-ons']), // Example, PS has rebuys/add-ons
      rake: this.parseFloatSafe(row['Rake']), // Assuming PS provides rake directly or can be calculated
    };
  }
  
  private static parseGGPokerFormat(row: any, userId: string): ParsedTournament {
    const name = row['Event'] || row['Tournament Name'] || '';
    const buyIn = this.parseFloatSafe(row['Entry Fee']);
    const prize = this.parseFloatSafe(row['Prize']); // This is typically net profit for GG
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
      category: this.detectCategory(name), // Needs robust detection for GG's PKO/Mystery
      speed: this.detectSpeed(name),
      fieldSize: this.parseIntSafe(row['Players'] || row['Field']),
      currency: this.detectCurrency(row['Entry Fee'] || 'USD'),
      finalTable: (position > 0 && position <= (this.parseIntSafe(row['Players per table'], 9) || 9)),
      bigHit: (prize > buyIn * 10 && buyIn > 0),
      // GG often includes bounty prizes in 'Prize', so direct rake might be hard to get from basic CSVs
      // prizePool might be available in some reports
    };
  }
  
  private static parse888PokerFormat(row: any, userId: string): ParsedTournament {
    const name = row['Game'] || row['Tournament'] || '';
    const buyIn = this.parseFloatSafe(row['Buy-in']);
    const prize = this.parseFloatSafe(row['Prize Won']); // Net profit
    const position = this.parseIntSafe(row['Position']);

    return {
      userId,
      name: name,
      buyIn: buyIn,
      prize: prize,
      position: position,
      datePlayed: this.parseDate(row['Date']),
      site: '888poker',
      format: this.detectFormat(name),
      category: this.detectCategory(name),
      speed: this.detectSpeed(name),
      fieldSize: this.parseIntSafe(row['Field Size'] || row['Players']),
      currency: this.detectCurrency(row['Buy-in'] || 'USD'),
      finalTable: (position > 0 && position <= 9), // Assuming default 9-max FT
      bigHit: (prize > buyIn * 10 && buyIn > 0),
    };
  }
  
  private static parsePartyPokerFormat(row: any, userId: string): ParsedTournament {
    const name = row['Tournament Name'] || '';
    const buyIn = this.parseFloatSafe(row['Buy In']);
    const prize = this.parseFloatSafe(row['Prize']); // Net profit
    const position = this.parseIntSafe(row['Position']);

    return {
      userId,
      name: name,
      buyIn: buyIn,
      prize: prize,
      position: position,
      datePlayed: this.parseDate(row['Date']),
      site: 'partypoker',
      format: this.detectFormat(name),
      category: this.detectCategory(name),
      speed: this.detectSpeed(name),
      fieldSize: this.parseIntSafe(row['Entrants'] || row['Players']),
      currency: this.detectCurrency(row['Buy In'] || 'USD'),
      finalTable: (position > 0 && position <= 9), // Assuming default 9-max FT
      bigHit: (prize > buyIn * 10 && buyIn > 0),
    };
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

    const tournamentName = (row['Nome do Torneio'] || row['Nome'] || '').toString().trim();
    if (!tournamentName) {
      console.log('Skipping WPN row with empty tournament name:', row);
      return null;
    }

    let originalCurrency = (row['Moeda'] || 'USD').toString().toUpperCase();
    let conversionRate = 1.0;
    let convertedToUSD = false;

    if (originalCurrency !== 'USD' && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    } else if (originalCurrency !== 'USD') {
      console.warn(`Exchange rate for ${originalCurrency} not found for user ${userId}. Values will be stored in ${originalCurrency}.`);
      // Keep originalCurrency, conversionRate remains 1.0
    }

    // Get values, apply conversion if necessary
    let buyIn = this.parseFloatSafe(row['Stake'] || row['Buy-in']) * conversionRate;
    let rake = this.parseFloatSafe(row['Rake']) * conversionRate;
    // 'Resultado' in WPN often means total cashout (prize + bounties).
    // Profit is Resultado - Rake (as per user spec for this specific WPN CSV structure)
    let result = this.parseFloatSafe(row['Resultado']) * conversionRate;
    let profit = result - rake; // Corrected Profit calculation

    const prizePool = this.parseFloatSafe(row['Premiação'] || row['Prêmio']) * conversionRate;
    
    // Category detection (Priority: Mystery > PKO > Vanilla)
    let category = 'Vanilla';
    const flags = (row['Bandeira'] || row['Bandeiras'] || '').toString().toLowerCase();
    const nameLower = tournamentName.toLowerCase();

    if (nameLower.includes('mystery')) {
      category = 'Mystery';
    } else if (flags.includes('bounty') || 
               nameLower.includes('progressive') ||
               nameLower.includes('knockout') ||
               nameLower.includes('ko') || // KO specifically
               nameLower.includes('bounty') || // General bounty term
               nameLower.includes('pko')) { // PKO specifically
      category = 'PKO';
    }
    
    // Speed detection
    let speed = 'Normal'; // Default
    const velocidadeLower = (row['Velocidade'] || '').toString().toLowerCase();
    if (velocidadeLower.includes('super turbo') || velocidadeLower.includes('hyper')) {
      speed = 'Hyper';
    } else if (velocidadeLower.includes('turbo')) {
      speed = 'Turbo';
    } else if (velocidadeLower.includes('normal') || velocidadeLower === '') { // Treat empty as Normal
      speed = 'Normal';
    }
    
    const datePlayed = this.parseDate(row['Data e hora'] || row['Data'] || '');
    const position = this.parseIntSafe(row['Posição']);
    const fieldSize = this.parseIntSafe(row['Total de Participantes do torneio'] || row['Participantes']);
    const reentries = this.parseIntSafe(row['Reentradas do Jogador'] || row['Reentradas/Recompras'] || row['Total de Reentradas']);
    const siteNetwork = (row['Rede'] || 'WPN Network').toString();

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

  private static parseWPNFormat(row: any, userId: string): ParsedTournament { // This is likely for English WPN CSVs
    const name = row['Tournament'] || '';
    // Assuming this format also needs potential currency conversion and profit calculation
    // For simplicity, this example assumes direct values are USD and profit is 'Winnings'
    // If not, it would need logic similar to parseWPNPortugueseFormat with exchangeRates
    const buyIn = this.parseFloatSafe(row['Buy In']);
    // Winnings in some generic WPN formats might be net profit or gross. Clarification needed.
    // Assuming 'Winnings' is net profit for this generic WPN English parser.
    const prize = this.parseFloatSafe(row['Winnings']);
    const position = this.parseIntSafe(row['Place'] || row['Position']);

    return {
      userId,
      name: name,
      buyIn: buyIn,
      prize: prize,
      position: position,
      datePlayed: this.parseDate(row['Date']),
      site: 'WPN Network', // Generic WPN
      format: this.detectFormat(name),
      category: this.detectCategory(name), // Generic detection, may not catch all WPN specifics
      speed: this.detectSpeed(name),
      fieldSize: this.parseIntSafe(row['Players']),
      currency: this.detectCurrency(row['Buy In'] || 'USD'), // Detects currency from buy-in string
      finalTable: (position > 0 && position <= 9),
      bigHit: (prize > buyIn * 10 && buyIn > 0),
      // Rake, prizePool might be missing or need specific column names for this WPN (English) variant
    };
  }
  
  private static parseGenericFormat(row: any, userId: string): ParsedTournament {
    const nameFields = ['name', 'tournament', 'event', 'game', 'tournament_name'];
    const buyinFields = ['buyin', 'buy_in', 'buy-in', 'entry_fee', 'entry', 'stake'];
    const prizeFields = ['prize', 'winnings', 'prize_won', 'earnings', 'win']; // Typically net profit
    const positionFields = ['position', 'finish', 'rank', 'place'];
    const dateFields = ['date', 'date_played', 'start_time', 'timestamp'];
    
    const name = this.findField(row, nameFields) || '';
    const buyIn = this.parseFloatSafe(this.findField(row, buyinFields));
    const prize = this.parseFloatSafe(this.findField(row, prizeFields));
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
      currency: this.detectCurrency(this.findField(row, buyinFields) || 'USD'),
      finalTable: (position > 0 && position <= 9),
      bigHit: (prize > buyIn * 10 && buyIn > 0),
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
  
  private static detectCategory(name: string): string {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('pko') || lowerName.includes('bounty') || lowerName.includes('knockout')) return 'PKO';
    if (lowerName.includes('mystery') || lowerName.includes('unknown')) return 'Mystery';
    if (lowerName.includes('progressive') || lowerName.includes('prog')) return 'Progressive';
    if (lowerName.includes('rebuy')) return 'Rebuy';
    if (lowerName.includes('addon') || lowerName.includes('add-on')) return 'Add-on';
    if (lowerName.includes('freezeout')) return 'Freezeout';
    return 'Vanilla';
  }
  
  private static detectSpeed(name: string): string {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('hyper') || lowerName.includes('ultra')) return 'Hyper';
    if (lowerName.includes('turbo')) return 'Turbo';
    if (lowerName.includes('slow') || lowerName.includes('deep')) return 'Slow';
    if (lowerName.includes('speed') || lowerName.includes('fast')) return 'Fast';
    return 'Regular';
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
}