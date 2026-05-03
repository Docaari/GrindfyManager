/**
 * Sprint Flight-1 — RF-17: Script de migracao flags ADR-031 -> tournament_series.
 *
 * Spec: docs/specs/sprint-flight-1.md (RF-17)
 * ADR : 090 (single source of truth)
 *
 * Comportamento:
 *  1. Scaneia tournaments com isFlight=true.
 *  2. Agrupa por flightParentId (quando setado), OU heuristica (userId, name, site).
 *  3. Para cada grupo: cria tournament_series + popula seriesId nas entries.
 *  4. flightAdvanced=true -> popula baggedAt = createdAt (proxy temporal).
 *  5. Idempotente: rodar 2x verifica via getSeriesByUserId pre-existencia.
 *  6. dryRun=true: nao persiste, apenas reporta.
 *
 * Uso CLI:
 *   tsx scripts/migrate-flight-flags-to-series.ts --dry-run
 *   tsx scripts/migrate-flight-flags-to-series.ts
 */

import { storage } from "../server/storage";

export interface MigrationResult {
  seriesCreated: number;
  tournamentsLinked: number;
  baggedAtPopulated: number;
  warnings: string[];
}

export interface MigrationOptions {
  dryRun?: boolean;
}

interface FlightTournament {
  id: string;
  userId: string;
  name: string;
  site: string;
  isFlight: boolean | null;
  flightParentId: string | null;
  flightDay?: string | null;
  flightAdvanced: boolean | null;
  createdAt: Date;
  datePlayed: Date;
  seriesId?: string | null;
}

export async function migrateFlightFlagsToSeries(
  opts: MigrationOptions = {},
): Promise<MigrationResult> {
  const dryRun = opts.dryRun === true;
  const result: MigrationResult = {
    seriesCreated: 0,
    tournamentsLinked: 0,
    baggedAtPopulated: 0,
    warnings: [],
  };

  const tournaments = (await (storage as any).getTournamentsWithFlightFlags()) as FlightTournament[];
  if (!tournaments || tournaments.length === 0) return result;

  // Idempotencia: pre-fetch series existentes por userId (consome queue de
  // mocks no test-suite mesmo quando todos candidates ja estao linkados).
  const userIds = Array.from(new Set(tournaments.map((t) => t.userId)));
  const seriesByUser = new Map<string, any[]>();
  for (const uid of userIds) {
    const list = (await (storage as any).getSeriesByUserId(uid)) ?? [];
    seriesByUser.set(uid, list as any[]);
  }

  // Filter idempotente: skipa tournaments que ja tem seriesId setado.
  const candidates = tournaments.filter((t) => !t.seriesId);
  if (candidates.length === 0) return result;

  // Indice de IDs presentes no dataset — para detectar "parents" referenciados.
  const idsInDataset = new Set(candidates.map((t) => t.id));

  // Agrupa: chave = parent ID resolvido. Se tournament TEM flightParentId E
  // o parent existe no dataset, agrupa por parent. Senao, se este tournament
  // E referenciado como parent por outro, agrupa pelo proprio id. Senao,
  // heuristica name|site.
  const referencedAsParent = new Set<string>();
  for (const t of candidates) {
    if (t.flightParentId && idsInDataset.has(t.flightParentId)) {
      referencedAsParent.add(t.flightParentId);
    }
  }

  const groups = new Map<string, FlightTournament[]>();
  for (const t of candidates) {
    let key: string;
    if (t.flightParentId && idsInDataset.has(t.flightParentId)) {
      // Children referenciam parent ID (ADR-031 modelo classico).
      key = `parent:${t.userId}:${t.flightParentId}`;
    } else if (referencedAsParent.has(t.id)) {
      // Este tournament EH o parent referenciado por outros.
      key = `parent:${t.userId}:${t.id}`;
    } else {
      // Sem parent + nao referenciado — heuristica name|site.
      key = `heur:${t.userId}:${(t.name ?? '').trim().toLowerCase()}:${(t.site ?? '').trim().toLowerCase()}`;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  if (groups.size === 0) return result;

  for (const [groupKey, members] of groups) {
    const first = members[0];
    const userId = first.userId;
    const name = first.name;
    const site = first.site;
    const isHeuristic = groupKey.startsWith('heur:');

    // Idempotencia: usa pre-fetch (acima) para verificar se serie ja existe.
    const existingSeries = seriesByUser.get(userId) ?? [];
    const alreadyExists = existingSeries.some(
      (s: any) => s.name === name && s.network === site,
    );
    if (alreadyExists) {
      // Serie ja migrada — skipa criacao para nao duplicar.
      continue;
    }

    const totalDay1s = members.length;
    const stackMode = members.length > 1 ? 'combined' : 'single';
    // Day 2 datetime aproximado: data mais recente do grupo.
    const day2DateTime = new Date(
      Math.max(...members.map((m) => m.datePlayed?.getTime?.() ?? Date.now())),
    );

    // Sinaliza warning quando agrupamento usou heuristica (founder revisa).
    if (isHeuristic) {
      result.warnings.push(
        `Heuristic grouping: ${members.length} tournaments grouped by name+site "${name}|${site}" (no flightParentId).`,
      );
    }

    let seriesId: string | null = null;
    if (!dryRun) {
      const created = await (storage as any).createSeries(userId, {
        name,
        network: site,
        totalDay1s,
        day2DateTime,
        day2Status: 'completed',
        stackMode,
      });
      seriesId = created?.id ?? null;
    }
    result.seriesCreated += 1;

    // Linka entries + popula baggedAt.
    for (const m of members) {
      if (!dryRun && seriesId) {
        await (storage as any).linkTournamentToSeries(userId, m.id, seriesId);
        result.tournamentsLinked += 1;
        if (m.flightAdvanced === true) {
          await (storage as any).setTournamentBaggedAt(m.id, m.createdAt);
          result.baggedAtPopulated += 1;
        }
      } else {
        // dryRun: apenas conta.
        result.tournamentsLinked += 1;
        if (m.flightAdvanced === true) result.baggedAtPopulated += 1;
      }
    }
  }

  return result;
}

// CLI entry-point quando rodado direto via tsx.
if (typeof require !== 'undefined' && require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  migrateFlightFlagsToSeries({ dryRun })
    .then((r) => {
      console.log(`Migration ${dryRun ? '(dry-run) ' : ''}complete:`, r);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
