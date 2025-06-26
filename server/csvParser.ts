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
    
    // Brazilian format detection - prioritize this for GGNetwork, 888poker, WPN, etc.
    if (row['Rede'] || row['Jogador'] || row['Stake'] || row['Resultado'] || row['Posição'] || row['Nome']) {
      console.log("Brazilian format detected - matching keys found");
      return PokerCSVParser.parseBrazilianFormat(row, userId, exchangeRates);
    }
    
    // PokerStars format detection
    if (row['Tournament'] || row['Date'] || row['Buy-in'] || row['Winnings']) {
      console.log("PokerStars format detected");
      return this.parsePokerStarsFormat(row, userId, exchangeRates);
    }
    
    // GGPoker format detection  
    if (row['Event'] || row['Tournament Name'] || row['Entry Fee']) {
      console.log("GGPoker format detected");
      return this.parseGGPokerFormat(row, userId, exchangeRates);
    }
    
    // partypoker format detection
    if (row['Tournament Name'] || row['Buy In'] || row['Prize']) {
      // console.log("Attempting partypoker format for row:", row);
      return this.parsePartyPokerFormat(row, userId, exchangeRates);
    }
    
    // WPN Network (Americas Cardroom, Black Chip Poker, etc.) - Portuguese format
    // Uses more specific column names from the user's description
    // Prioritize more complete WPN Portuguese format detection first
    if (row['Rede'] && row['Nome'] && (row['Data e hora'] || row['Data']) && row['Moeda'] && row['Stake'] && row['Rake'] !== undefined && row['Resultado'] !== undefined) {
        // console.log("Attempting WPN Portuguese format (strict) for row:", row);
        return PokerCSVParser.parseWPNPortugueseFormat(row, userId, exchangeRates);
    }
    // Fallback for WPN with potentially missing or differently named columns (like the example CSV)
    // Check for essential WPN fields before assuming it's this format.
    // The fields like 'Stake', 'Nome', 'Data', 'Resultado', 'Moeda' are quite distinctive for WPN.
    if (row['Stake'] && row['Nome'] && (row['Data e hora'] || row['Data']) && row['Moeda'] && row['Resultado'] !== undefined) {
        // console.log("Attempting WPN Portuguese format (fallback) for row:", row);
        return PokerCSVParser.parseWPNPortugueseFormat(row, userId, exchangeRates);
    }
    
    // WPN Network (Americas Cardroom, Black Chip Poker, etc.) - English format
    if (row['Tournament'] && row['Buy In'] && row['Date']) {
      // console.log("Attempting WPN English format for row:", row);
      return this.parseWPNFormat(row, userId, exchangeRates);
    }
    
    // Generic format (fallback)
    // console.log("Attempting Generic format for row:", row);
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
    const tournamentName = row['Tournament'] || '';
    const buyInText = row['Buy-in'] || '';
    const buyInMatch = buyInText.match(/\$?(\d+(?:\.\d{2})?)/);
    
    // Currency conversion for PokerStars
    let originalCurrency = this.detectCurrency(buyInText || row['Winnings'] || 'USD');
    let conversionRate = 1.0;
    let convertedToUSD = false;

    if (originalCurrency !== 'USD' && exchangeRates && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    }

    const buyIn = (buyInMatch ? this.parseFloatSafe(buyInMatch[1]) : 0) * conversionRate;
    const prize = this.parseFloatSafe(row['Winnings']) * conversionRate;
    const position = this.parseIntSafe(row['Position'] || row['Finish']);
    const prizePool = this.parseFloatSafe(row['Prize Pool']) * conversionRate;
    const rake = this.parseFloatSafe(row['Rake']) * conversionRate;
    
    return {
      userId,
      name: tournamentName,
      buyIn: buyIn,
      prize: prize, // This is typically net profit for PS
      position: position,
      datePlayed: this.parseDate(row['Date']),
      site: 'PokerStars',
      format: this.detectFormat(tournamentName),
      category: this.detectCategory(tournamentName),
      speed: this.detectSpeed(tournamentName),
      fieldSize: this.parseIntSafe(row['Entries']),
      currency: originalCurrency,
      finalTable: (position > 0 && position <= (this.parseIntSafe(row['Players per table'], 9) || 9)),
      bigHit: (prize > buyIn * 10 && buyIn > 0),
      prizePool: prizePool,
      reentries: this.parseIntSafe(row['Rebuys']) + this.parseIntSafe(row['Add-ons']),
      rake: rake,
      convertedToUSD: convertedToUSD,
    };
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
    
    const buyIn = this.parseFloatSafe(row['Stake'] || row[' Stake'] || row['Buy-in']) * conversionRate;
    const position = this.parseIntSafe(row['Posição'] || row[' Posição'] || row['Position']);
    const fieldSize = this.parseIntSafe(row['Participantes'] || row[' Participantes'] || row['Players']);
    const reentries = this.parseIntSafe(row['Reentradas/Recompras'] || row[' Reentradas/Recompras'] || row['Total de Reentradas'] || row[' Total de Reentradas']) || 0;

    // Use tournament name from 'Nome' field (handling leading spaces and trimming properly)
    const finalName = name.trim() || `${(row['Jogo'] || row[' Jogo'] || 'Tournament')} - ${(row['Estrutura'] || row[' Estrutura'] || 'Unknown')}`;
    
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

  private static parse888PokerFormat(row: any, userId: string, exchangeRates: Record<string, number> = {}): ParsedTournament {
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
    
    const buyIn = this.parseFloatSafe(row['Stake'] || row['Buy-in']) * conversionRate;
    const position = this.parseIntSafe(row['Posição'] || row['Position']);
    const fieldSize = this.parseIntSafe(row['Participantes'] || row['Players']);
    const reentries = this.parseIntSafe(row['Reentradas/Recompras'] || row['Total de Reentradas']) || 0;

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
  
  private static parsePartyPokerFormat(row: any, userId: string, exchangeRates: Record<string, number> = {}): ParsedTournament {
    const name = row['Tournament Name'] || '';
    
    // Currency conversion for PartyPoker
    let originalCurrency = this.detectCurrency(row['Buy In'] || 'USD');
    let conversionRate = 1.0;
    let convertedToUSD = false;

    if (originalCurrency !== 'USD' && exchangeRates && exchangeRates[originalCurrency]) {
      conversionRate = exchangeRates[originalCurrency];
      convertedToUSD = true;
    }

    const buyIn = this.parseFloatSafe(row['Buy In']) * conversionRate;
    const prize = this.parseFloatSafe(row['Prize']) * conversionRate; // Net profit
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
      currency: originalCurrency,
      finalTable: (position > 0 && position <= 9),
      bigHit: (prize > buyIn * 10 && buyIn > 0),
      convertedToUSD: convertedToUSD,
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
    const rawBuyIn = this.findField(row, ['Stake', 'Buy-in', 'Buy In', 'D']);
    let buyIn = this.parseFloatSafe(rawBuyIn) * conversionRate;

    // G: Rake (Column G) -> CSV example uses 'Rake'
    const rawRake = this.findField(row, ['Rake', 'G']);
    let rake = this.parseFloatSafe(rawRake) * conversionRate;

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
}