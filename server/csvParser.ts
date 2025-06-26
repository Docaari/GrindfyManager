import { Readable } from "stream";
import csv from "csv-parser";

export interface ParsedTournament {
  userId: string;
  name: string;
  buyIn: string;
  prize: string;
  position: number;
  datePlayed: Date;
  site: string;
  format: string;
  category: string;
  speed: string;
  fieldSize: number;
  currency: string;
  finalTable: boolean;
  bigHit: boolean;
  prizePool?: string;
  reentries?: number;
}

export class PokerCSVParser {
  static async parseCSV(fileContent: string, userId: string): Promise<ParsedTournament[]> {
    const tournaments: ParsedTournament[] = [];
    
    return new Promise((resolve, reject) => {
      const stream = Readable.from(fileContent);
      
      stream
        .pipe(csv())
        .on('data', (row) => {
          try {
            const tournament = this.parsePokerSiteData(row, userId);
            if (tournament && tournament.name && parseFloat(tournament.buyIn) >= 0) {
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

  private static parsePokerSiteData(row: any, userId: string): ParsedTournament | null {
    // PokerStars format detection
    if (row['Tournament'] || row['Date'] || row['Buy-in'] || row['Winnings']) {
      return this.parsePokerStarsFormat(row, userId);
    }
    
    // GGPoker format detection  
    if (row['Event'] || row['Tournament Name'] || row['Entry Fee']) {
      return this.parseGGPokerFormat(row, userId);
    }
    
    // 888poker format detection
    if (row['Game'] || row['Tournament ID'] || row['Prize Won']) {
      return this.parse888PokerFormat(row, userId);
    }
    
    // partypoker format detection
    if (row['Tournament Name'] || row['Buy In'] || row['Prize']) {
      return this.parsePartyPokerFormat(row, userId);
    }
    
    // WPN Network (Americas Cardroom, Black Chip Poker, etc.) - Portuguese format
    if (row['Rede'] || row['Stake'] || row['Participantes'] || row['Posição']) {
      return PokerCSVParser.parseWPNPortugueseFormat(row, userId);
    }
    
    // WPN Network (Americas Cardroom, Black Chip Poker, etc.) - English format
    if (row['Tournament'] && row['Buy In'] && row['Date']) {
      return this.parseWPNFormat(row, userId);
    }
    
    // Generic format (fallback)
    return this.parseGenericFormat(row, userId);
  }
  
  private static parsePokerStarsFormat(row: any, userId: string): ParsedTournament {
    const tournament = row['Tournament'] || '';
    const buyInText = row['Buy-in'] || '';
    const buyInMatch = buyInText.match(/\$?(\d+(?:\.\d{2})?)/);
    const buyIn = buyInMatch ? parseFloat(buyInMatch[1]) : 0;
    const prize = parseFloat(row['Winnings']?.replace(/[^0-9.-]/g, '') || '0');
    
    return {
      userId,
      name: tournament,
      buyIn: buyIn.toString(),
      prize: prize.toString(),
      position: parseInt(row['Position'] || row['Finish'] || '0'),
      datePlayed: this.parseDate(row['Date']),
      site: 'PokerStars',
      format: this.detectFormat(tournament),
      category: this.detectCategory(tournament),
      speed: this.detectSpeed(tournament),
      fieldSize: parseInt(row['Entries'] || '0'),
      currency: this.detectCurrency(buyInText || row['Winnings'] || 'USD'),
      finalTable: (parseInt(row['Position'] || '0') <= 9 && parseInt(row['Position'] || '0') > 0),
      bigHit: (prize > buyIn * 10),
      prizePool: parseFloat(row['Prize Pool']?.replace(/[^0-9.]/g, '') || '0').toString(),
    };
  }
  
  private static parseGGPokerFormat(row: any, userId: string): ParsedTournament {
    const name = row['Event'] || row['Tournament Name'] || '';
    const buyIn = parseFloat(row['Entry Fee']?.replace(/[^0-9.]/g, '') || '0');
    const prize = parseFloat(row['Prize']?.replace(/[^0-9.-]/g, '') || '0');
    
    return {
      userId,
      name: name,
      buyIn: buyIn.toString(),
      prize: prize.toString(),
      position: parseInt(row['Position'] || row['Rank'] || '0'),
      datePlayed: this.parseDate(row['Date'] || row['Start Time']),
      site: 'GGPoker',
      format: this.detectFormat(name),
      category: this.detectCategory(name),
      speed: this.detectSpeed(name),
      fieldSize: parseInt(row['Players'] || row['Field'] || '0'),
      currency: this.detectCurrency(row['Entry Fee'] || 'USD'),
      finalTable: (parseInt(row['Position'] || '0') <= 9 && parseInt(row['Position'] || '0') > 0),
      bigHit: (prize > buyIn * 10),
    };
  }
  
  private static parse888PokerFormat(row: any, userId: string): ParsedTournament {
    const name = row['Game'] || row['Tournament'] || '';
    const buyIn = parseFloat(row['Buy-in']?.replace(/[^0-9.]/g, '') || '0');
    const prize = parseFloat(row['Prize Won']?.replace(/[^0-9.-]/g, '') || '0');
    
    return {
      userId,
      name: name,
      buyIn: buyIn.toString(),
      prize: prize.toString(),
      position: parseInt(row['Position'] || '0'),
      datePlayed: this.parseDate(row['Date']),
      site: '888poker',
      format: this.detectFormat(name),
      category: this.detectCategory(name),
      speed: this.detectSpeed(name),
      fieldSize: parseInt(row['Field Size'] || '0'),
      currency: this.detectCurrency(row['Buy-in'] || 'USD'),
      finalTable: (parseInt(row['Position'] || '0') <= 9 && parseInt(row['Position'] || '0') > 0),
      bigHit: (prize > buyIn * 10),
    };
  }
  
  private static parsePartyPokerFormat(row: any, userId: string): ParsedTournament {
    const name = row['Tournament Name'] || '';
    const buyIn = parseFloat(row['Buy In']?.replace(/[^0-9.]/g, '') || '0');
    const prize = parseFloat(row['Prize']?.replace(/[^0-9.-]/g, '') || '0');
    
    return {
      userId,
      name: name,
      buyIn: buyIn.toString(),
      prize: prize.toString(),
      position: parseInt(row['Position'] || '0'),
      datePlayed: this.parseDate(row['Date']),
      site: 'partypoker',
      format: this.detectFormat(name),
      category: this.detectCategory(name),
      speed: this.detectSpeed(name),
      fieldSize: parseInt(row['Entrants'] || '0'),
      currency: this.detectCurrency(row['Buy In'] || 'USD'),
      finalTable: (parseInt(row['Position'] || '0') <= 9 && parseInt(row['Position'] || '0') > 0),
      bigHit: (prize > buyIn * 10),
    };
  }

  private static parseWPNPortugueseFormat(row: any, userId: string): ParsedTournament {
    const name = row['Nome'] || '';
    const buyIn = parseFloat(row['Stake']?.toString().replace(/[^0-9.]/g, '') || '0');
    const rake = parseFloat(row['Rake']?.toString().replace(/[^0-9.-]/g, '') || '0');
    const result = parseFloat(row['Resultado']?.toString().replace(/[^0-9.-]/g, '') || '0');
    const prize = parseFloat(row['Prêmio']?.toString().replace(/[^0-9.-]/g, '') || '0');
    
    // Calculate profit: Result - Rake (as per WPN documentation)
    const profit = result - rake;
    const finalPrize = prize > 0 ? prize : (profit > 0 ? profit : 0);
    
    // Categorize tournament based on WPN rules: Mystery > PKO > Vanilla
    let category = 'Vanilla';
    const flags = row['Bandeiras'] || '';
    
    if (name.toLowerCase().includes('mystery')) {
      category = 'Mystery';
    } else if (flags.toLowerCase().includes('bounty') || 
               name.toLowerCase().includes('progressive') ||
               name.toLowerCase().includes('knockout') ||
               name.toLowerCase().includes('ko') ||
               name.toLowerCase().includes('bounty') ||
               name.toLowerCase().includes('pko')) {
      category = 'PKO';
    }
    
    // Parse speed based on WPN rules
    let speed = 'Normal';
    const velocidade = row['Velocidade'] || 'Normal';
    if (velocidade.toLowerCase().includes('super turbo')) {
      speed = 'Hyper';
    } else if (velocidade.toLowerCase().includes('turbo')) {
      speed = 'Turbo';
    }
    
    return {
      userId,
      name: name,
      buyIn: buyIn.toString(),
      prize: finalPrize.toString(),
      position: parseInt(row['Posição'] || '0'),
      datePlayed: this.parseDate(row['Data']),
      site: 'WPN Network',
      format: this.detectFormat(name),
      category: category,
      speed: speed,
      fieldSize: parseInt(row['Participantes'] || '0'),
      currency: this.detectCurrency(row['Moeda'] || 'USD'),
      finalTable: (parseInt(row['Posição'] || '0') <= 9 && parseInt(row['Posição'] || '0') > 0),
      bigHit: (finalPrize > buyIn * 10),
      reentries: parseInt(row['Reentradas/Recompras'] || row['Total de Reentradas'] || '0'),
    };
  }

  private static parseWPNFormat(row: any, userId: string): ParsedTournament {
    const name = row['Tournament'] || '';
    const buyIn = parseFloat(row['Buy In']?.replace(/[^0-9.]/g, '') || '0');
    const prize = parseFloat(row['Winnings']?.replace(/[^0-9.-]/g, '') || '0');
    
    return {
      userId,
      name: name,
      buyIn: buyIn.toString(),
      prize: prize.toString(),
      position: parseInt(row['Place'] || row['Position'] || '0'),
      datePlayed: this.parseDate(row['Date']),
      site: 'WPN Network',
      format: this.detectFormat(name),
      category: this.detectCategory(name),
      speed: this.detectSpeed(name),
      fieldSize: parseInt(row['Players'] || '0'),
      currency: this.detectCurrency(row['Buy In'] || 'USD'),
      finalTable: (parseInt(row['Place'] || '0') <= 9 && parseInt(row['Place'] || '0') > 0),
      bigHit: (prize > buyIn * 10),
    };
  }
  
  private static parseGenericFormat(row: any, userId: string): ParsedTournament {
    const nameFields = ['name', 'tournament', 'event', 'game', 'tournament_name'];
    const buyinFields = ['buyin', 'buy_in', 'buy-in', 'entry_fee', 'entry', 'stake'];
    const prizeFields = ['prize', 'winnings', 'prize_won', 'earnings', 'win'];
    const positionFields = ['position', 'finish', 'rank', 'place'];
    const dateFields = ['date', 'date_played', 'start_time', 'timestamp'];
    
    const name = this.findField(row, nameFields) || '';
    const buyIn = parseFloat(this.findField(row, buyinFields)?.replace(/[^0-9.]/g, '') || '0');
    const prize = parseFloat(this.findField(row, prizeFields)?.replace(/[^0-9.-]/g, '') || '0');
    
    return {
      userId,
      name: name,
      buyIn: buyIn.toString(),
      prize: prize.toString(),
      position: parseInt(this.findField(row, positionFields) || '0'),
      datePlayed: this.parseDate(this.findField(row, dateFields) || ''),
      site: row.site || 'Unknown',
      format: this.detectFormat(name),
      category: this.detectCategory(name),
      speed: this.detectSpeed(name),
      fieldSize: parseInt(row.field_size || row.entries || row.players || '0'),
      currency: this.detectCurrency(this.findField(row, buyinFields) || 'USD'),
      finalTable: (parseInt(this.findField(row, positionFields) || '0') <= 9 && parseInt(this.findField(row, positionFields) || '0') > 0),
      bigHit: (prize > buyIn * 10),
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
    
    // Try parsing the date directly first
    const directParse = new Date(dateStr);
    if (!isNaN(directParse.getTime())) {
      return directParse;
    }
    
    // Try different date formats
    const formats = [
      /(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
      /(\d{2})\/(\d{2})\/(\d{4})/, // MM/DD/YYYY
      /(\d{2})-(\d{2})-(\d{4})/, // DD-MM-YYYY
      /(\d{4})\/(\d{2})\/(\d{2})/, // YYYY/MM/DD
      /(\d{2})\.(\d{2})\.(\d{4})/, // DD.MM.YYYY
    ];
    
    for (const format of formats) {
      const match = dateStr.match(format);
      if (match) {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      }
    }
    
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