/**
 * Bulk-import torneios de CSV para tournament_library + planned_tournaments.
 *
 * CSV format (Sprint Library Import 2026-05-02 + Flight Day 2 2026-05-05):
 *   Nome,Site,Buy In,Moeda,Dia,Inicio,Tipo,Velocidade,Garantido,Add-on,Horario de Registro,Dia 2
 *
 * Comportamento:
 *   - Filtra linhas pelo --day (0=Dom..6=Sab); skip Break/vazias.
 *   - Normaliza site (Champion/Party/GG/PS/Ya/Suprema/Coin/WPT) para nomes
 *     usados no resto do app.
 *   - Mapeia Velocidade=Regular -> Normal.
 *   - Parseia buy-in/garantido/add-on aceitando formato europeu/BR.
 *   - Calcula late_reg_minutes = (HorarioRegistro - Inicio) em minutos.
 *   - Dedup library por (userId, name, site, time) — ignora soft-deleted.
 *   - Coluna "Dia 2" preenchida (formato "DD/MM HH:MM") -> cria
 *     tournament_series (totalDay1s=1, day2DateTime, network=site) e marca
 *     planned_tournament com isFlight=true + seriesId.
 *
 * Uso:
 *   tsx --env-file=.env scripts/import-tournaments-csv.ts \
 *     --user ricardo.agnolo@hotmail.com \
 *     --csv "C:/Users/.../arquivo.csv" \
 *     [--day 2] [--profile B] [--dry]
 */

import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import pg from "pg";

interface CliArgs {
  email: string;
  csv: string;
  dayOfWeek: number;
  profile: string;
  dry: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const out: Partial<CliArgs> = { dayOfWeek: 6, profile: "B", dry: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--user") out.email = args[++i];
    else if (a === "--csv") out.csv = args[++i];
    else if (a === "--day") out.dayOfWeek = parseInt(args[++i], 10);
    else if (a === "--profile") out.profile = args[++i];
    else if (a === "--dry") out.dry = true;
  }
  if (!out.email || !out.csv) {
    console.error("Usage: --user <email> --csv <path> [--day N] [--profile X] [--dry]");
    process.exit(1);
  }
  return out as CliArgs;
}

// ---------------------------------------------------------------------------
// CSV parsing — quoted fields, commas inside quotes
// ---------------------------------------------------------------------------
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function readCsv(filePath: string): Record<string, string>[] {
  const raw = fs.readFileSync(filePath, "utf8");
  // Strip BOM if present
  const text = raw.replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Normalize site sigla -> canonical name
// ---------------------------------------------------------------------------
const SITE_MAP: Record<string, string> = {
  Champion: "ChampionPoker",
  Party: "PartyPoker",
  GG: "GGNetwork",
  PS: "PokerStars",
  Ya: "YaPoker",
  Suprema: "Suprema",
  Coin: "CoinPoker",
  WPT: "WPT Global",
};
function normalizeSite(s: string): string {
  return SITE_MAP[s.trim()] ?? s.trim();
}

// ---------------------------------------------------------------------------
// Money parser — accepts "$5,50", "R$ 1.000,00", "€10,00", "5.50"
// Returns plain number string (e.g. "5.50") suitable for decimal column.
// ---------------------------------------------------------------------------
function parseMoney(raw: string): string | null {
  if (!raw || !raw.trim()) return null;
  // Strip currency symbols / letters
  let s = raw.replace(/[^\d.,-]/g, "").trim();
  if (!s) return null;
  // If both . and , present: assume . is thousand sep, , is decimal
  if (s.includes(".") && s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    // only , — treat as decimal sep (BR/EU)
    s = s.replace(",", ".");
  }
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return n.toFixed(2);
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------
function normalizeTime(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  // Aceita H:MM ou HH:MM ou HH:MM:SS
  const m = s.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/);
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map((x) => parseInt(x, 10));
  return h * 60 + m;
}

function calcLateReg(startTime: string, regTime: string): number {
  const startMin = timeToMinutes(startTime);
  const regMin = timeToMinutes(regTime);
  let diff = regMin - startMin;
  if (diff < 0) diff += 24 * 60; // wrap-over (regTime no dia seguinte)
  return diff;
}

// ---------------------------------------------------------------------------
// Speed mapping: Regular -> Normal, otherwise pass through if valid
// ---------------------------------------------------------------------------
const SPEED_MAP: Record<string, string> = {
  Regular: "Normal",
  Normal: "Normal",
  Turbo: "Turbo",
  Hyper: "Hyper",
  "Super Turbo": "Hyper",
};

// ---------------------------------------------------------------------------
// Type mapping (CSV -> SSoT)
// ---------------------------------------------------------------------------
const TYPE_MAP: Record<string, string> = {
  PKO: "PKO",
  Vanilla: "Vanilla",
  Mystery: "Mystery",
  Satelite: "Satellite",
  Satellite: "Satellite",
  "Add-on": "Add-on",
  Addon: "Add-on",
  AddOn: "Add-on",
};

// ---------------------------------------------------------------------------
// Special: when user typed "12:5" (line 37), interpret as 12:05.
// Single trailing digit after colon means user dropped leading zero.
// ---------------------------------------------------------------------------
function fixShortTime(raw: string): string {
  const m = raw.trim().match(/^(\d{1,2}):(\d)$/);
  if (m) return `${m[1]}:0${m[2]}`;
  return raw;
}

// ---------------------------------------------------------------------------
// Day-of-week mapping CSV sigla <-> dayOfWeek numerico (0=Dom..6=Sab)
// ---------------------------------------------------------------------------
const DAY_NUM_TO_SIGLA: Record<number, string> = {
  0: "Dom",
  1: "Seg",
  2: "Ter",
  3: "Qua",
  4: "Qui",
  5: "Sex",
  6: "Sab",
};

// ---------------------------------------------------------------------------
// Parse "Dia 2" cell — formato "DD/MM HH:MM" (ex: "10/05 17:05").
// Ano = ano corrente. Retorna Date ou null.
// ---------------------------------------------------------------------------
function parseDay2(raw: string): Date | null {
  if (!raw || !raw.trim()) return null;
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{1,2})$/);
  if (!m) return null;
  const [, ddS, mmS, hhS, minS] = m;
  const dd = parseInt(ddS, 10);
  const mm = parseInt(mmS, 10);
  const hh = parseInt(hhS, 10);
  const min = parseInt(minS, 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || hh > 23 || min > 59) return null;
  const year = new Date().getFullYear();
  return new Date(year, mm - 1, dd, hh, min, 0, 0);
}

interface LibraryRow {
  name: string;
  site: string;
  buyIn: string;
  guaranteed: string | null;
  time: string;
  type: string;
  speed: string;
  currency: string;
  allowsAddOn: boolean;
  addOnCost: string | null;
  lateRegMinutes: number;
  source: string;
  csvLine: number;
  // Flight Day 2 (ADR-090): se preenchido, criar tournament_series + isFlight em planned
  day2DateTime: Date | null;
}

function processRows(
  rows: Record<string, string>[],
  targetDayOfWeek: number,
): {
  valid: LibraryRow[];
  skipped: { line: number; reason: string }[];
} {
  const valid: LibraryRow[] = [];
  const skipped: { line: number; reason: string }[] = [];
  const targetSigla = DAY_NUM_TO_SIGLA[targetDayOfWeek];

  rows.forEach((r, idx) => {
    const csvLine = idx + 2; // +2: header + 1-based
    const dia = r["Dia"]?.trim();
    const nome = r["Nome"]?.trim();
    const site = r["Site"]?.trim();

    if (!nome || nome.toLowerCase() === "break") {
      skipped.push({ line: csvLine, reason: "break/empty name" });
      return;
    }
    if (!site) {
      skipped.push({ line: csvLine, reason: "site vazio" });
      return;
    }
    if (dia !== targetSigla) {
      skipped.push({ line: csvLine, reason: `dia=${dia || "vazio"} (nao ${targetSigla})` });
      return;
    }

    const buyInRaw = r["Buy In"];
    const buyIn = parseMoney(buyInRaw);
    if (!buyIn || parseFloat(buyIn) <= 0) {
      skipped.push({ line: csvLine, reason: `buy-in invalido: ${buyInRaw}` });
      return;
    }

    const startRaw = fixShortTime(r["Inicio"] ?? "");
    const start = normalizeTime(startRaw);
    if (!start) {
      skipped.push({ line: csvLine, reason: `inicio invalido: ${r["Inicio"]}` });
      return;
    }

    const regRaw = fixShortTime(r["Horario de Registro"] ?? "");
    const reg = normalizeTime(regRaw);
    let lateRegMinutes = 0;
    if (reg) {
      lateRegMinutes = calcLateReg(start, reg);
    }

    const typeRaw = r["Tipo"]?.trim();
    const type = TYPE_MAP[typeRaw] ?? "Vanilla";

    const speedRaw = r["Velocidade"]?.trim();
    const speed = SPEED_MAP[speedRaw] ?? "Normal";

    const currency = (r["Moeda"]?.trim() || "USD").toUpperCase();
    const guaranteed = parseMoney(r["Garantido"] ?? "");

    const addOnRaw = r["Add-on"]?.trim();
    const addOnCost = addOnRaw ? parseMoney(addOnRaw) : null;
    const allowsAddOn = !!addOnCost;

    const day2Raw = (r["Dia 2"] ?? r["Dia 2/Vaga"] ?? "").trim();
    const day2DateTime = day2Raw ? parseDay2(day2Raw) : null;
    if (day2Raw && !day2DateTime) {
      skipped.push({ line: csvLine, reason: `Dia 2 invalido: ${day2Raw}` });
      return;
    }

    valid.push({
      name: nome,
      site: normalizeSite(site),
      buyIn,
      guaranteed,
      time: start,
      type,
      speed,
      currency,
      allowsAddOn,
      addOnCost,
      lateRegMinutes,
      source: "csv",
      csvLine,
      day2DateTime,
    });
  });

  return { valid, skipped };
}

// ---------------------------------------------------------------------------
// DB ops
// ---------------------------------------------------------------------------
async function findUserId(client: pg.Client, email: string): Promise<string> {
  const r = await client.query<{ user_platform_id: string }>(
    `SELECT user_platform_id FROM users WHERE email=$1 LIMIT 1`,
    [email]
  );
  if (r.rows.length === 0) throw new Error(`User nao encontrado: ${email}`);
  return r.rows[0].user_platform_id;
}

async function findExistingTemplate(
  client: pg.Client,
  userId: string,
  name: string,
  site: string,
  time: string
): Promise<string | null> {
  const r = await client.query<{ id: string }>(
    `SELECT id FROM tournament_library
     WHERE user_id=$1 AND name=$2 AND site=$3 AND time=$4 AND deleted_at IS NULL
     LIMIT 1`,
    [userId, name, site, time]
  );
  return r.rows[0]?.id ?? null;
}

async function insertLibrary(
  client: pg.Client,
  userId: string,
  row: LibraryRow,
  dayOfWeek: number
): Promise<string> {
  const id = nanoid();
  await client.query(
    `INSERT INTO tournament_library (
       id, user_id, name, site, buy_in, guaranteed, time, type, speed,
       source, day_of_week, currency, allows_addon, addon_cost,
       late_reg_minutes, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9,
       $10, $11, $12, $13, $14,
       $15, NOW(), NOW()
     )`,
    [
      id,
      userId,
      row.name,
      row.site,
      row.buyIn,
      row.guaranteed,
      row.time,
      row.type,
      row.speed,
      row.source,
      dayOfWeek,
      row.currency,
      row.allowsAddOn,
      row.addOnCost,
      row.lateRegMinutes,
    ]
  );
  return id;
}

async function findExistingPlanned(
  client: pg.Client,
  userId: string,
  templateId: string,
  dayOfWeek: number,
  profile: string
): Promise<string | null> {
  const r = await client.query<{ id: string }>(
    `SELECT id FROM planned_tournaments
     WHERE user_id=$1 AND library_template_id=$2 AND day_of_week=$3 AND profile=$4
     LIMIT 1`,
    [userId, templateId, dayOfWeek, profile]
  );
  return r.rows[0]?.id ?? null;
}

async function findExistingSeries(
  client: pg.Client,
  userId: string,
  name: string,
  day2DateTime: Date,
): Promise<string | null> {
  const r = await client.query<{ id: string }>(
    `SELECT id FROM tournament_series
     WHERE user_id=$1 AND name=$2 AND day2_datetime=$3
     LIMIT 1`,
    [userId, name, day2DateTime]
  );
  return r.rows[0]?.id ?? null;
}

async function insertSeries(
  client: pg.Client,
  userId: string,
  row: LibraryRow,
): Promise<string> {
  const id = nanoid();
  await client.query(
    `INSERT INTO tournament_series (
       id, user_id, name, network, total_day1s, day2_datetime,
       day2_status, stack_mode, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, 1, $5,
       'pending', 'single', NOW(), NOW()
     )`,
    [id, userId, row.name, row.site, row.day2DateTime]
  );
  return id;
}

async function insertPlanned(
  client: pg.Client,
  userId: string,
  row: LibraryRow,
  templateId: string,
  dayOfWeek: number,
  profile: string,
  seriesId: string | null,
): Promise<string> {
  const id = nanoid();
  const isFlight = !!seriesId;
  await client.query(
    `INSERT INTO planned_tournaments (
       id, user_id, day_of_week, profile, site, time, type, speed, name,
       buy_in, guaranteed, library_template_id, status,
       prioridade, is_active, late_reg_minutes,
       allows_addon, addon_cost,
       is_flight, series_id,
       created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9,
       $10, $11, $12, 'upcoming',
       2, true, $13,
       $14, $15,
       $16, $17,
       NOW(), NOW()
     )`,
    [
      id,
      userId,
      dayOfWeek,
      profile,
      row.site,
      row.time,
      row.type,
      row.speed,
      row.name,
      row.buyIn,
      row.guaranteed,
      templateId,
      row.lateRegMinutes,
      row.allowsAddOn,
      row.addOnCost,
      isFlight,
      seriesId,
    ]
  );
  return id;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs();
  const csvPath = path.resolve(args.csv);
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV nao encontrado: ${csvPath}`);
  }

  console.log(`Lendo CSV: ${csvPath}`);
  const rows = readCsv(csvPath);
  console.log(`Linhas raw: ${rows.length}`);

  if (!(args.dayOfWeek in DAY_NUM_TO_SIGLA)) {
    throw new Error(`--day invalido: ${args.dayOfWeek} (esperado 0..6)`);
  }
  const { valid, skipped } = processRows(rows, args.dayOfWeek);
  console.log(`Filtro dia=${DAY_NUM_TO_SIGLA[args.dayOfWeek]} (${args.dayOfWeek})`);
  console.log(`Validas: ${valid.length} | Skipped: ${skipped.length}`);
  const flightCount = valid.filter((v) => v.day2DateTime).length;
  if (flightCount > 0) console.log(`Flights detectados (Dia 2): ${flightCount}`);

  if (skipped.length) {
    console.log("Skipped:");
    skipped.forEach((s) => console.log(`  L${s.line}: ${s.reason}`));
  }

  if (args.dry) {
    console.log("\n=== DRY RUN — primeiras 5 entradas ===");
    valid.slice(0, 5).forEach((v) => console.log(JSON.stringify(v, null, 2)));
    console.log(`\nTotal a inserir: ${valid.length}`);
    return;
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const userId = await findUserId(client, args.email);
    console.log(`User: ${userId}`);

    let libCreated = 0;
    let libReused = 0;
    let planCreated = 0;
    let planReused = 0;
    let seriesCreated = 0;
    let seriesReused = 0;

    await client.query("BEGIN");

    for (const row of valid) {
      let templateId = await findExistingTemplate(
        client,
        userId,
        row.name,
        row.site,
        row.time
      );
      if (templateId) {
        libReused++;
      } else {
        templateId = await insertLibrary(client, userId, row, args.dayOfWeek);
        libCreated++;
      }

      let seriesId: string | null = null;
      if (row.day2DateTime) {
        seriesId = await findExistingSeries(client, userId, row.name, row.day2DateTime);
        if (seriesId) {
          seriesReused++;
        } else {
          seriesId = await insertSeries(client, userId, row);
          seriesCreated++;
        }
      }

      const existingPlanned = await findExistingPlanned(
        client,
        userId,
        templateId,
        args.dayOfWeek,
        args.profile
      );
      if (existingPlanned) {
        planReused++;
      } else {
        await insertPlanned(
          client,
          userId,
          row,
          templateId,
          args.dayOfWeek,
          args.profile,
          seriesId,
        );
        planCreated++;
      }
    }

    await client.query("COMMIT");
    console.log(`\n=== Resultado ===`);
    console.log(`Library: ${libCreated} novos | ${libReused} reusados`);
    console.log(`Planned: ${planCreated} novos | ${planReused} reusados`);
    console.log(`Series:  ${seriesCreated} novos | ${seriesReused} reusados`);
    console.log(`Dia ${DAY_NUM_TO_SIGLA[args.dayOfWeek]} profile=${args.profile} dayOfWeek=${args.dayOfWeek}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
