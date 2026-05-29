// =============================================================================
// historyAggregate.ts — VR-CALC-2 (import do histórico CSV)
//
// Spec: docs/specs/sprint-variance-calculator-poker-fidelity.md §1.6
//
// Agrega os torneios do HISTÓRICO real do jogador (uploads CSV) dentro de um
// período, agrupados por tier×type com ROI ajustado, no MESMO shape que o
// endpoint /buckets-aggregate devolve — o AggregationWizard consome sem mudança.
//
// Interim: reusa o agrupamento tier×type (igual getHistoricalStatsByUser) +
// filtro de período. Quando libraryGrouping.groupTournaments (motor de família)
// landar em main, trocar a fonte de agrupamento aqui sem mexer no contrato.
//
// Regra §6.1: histórico = `tournaments WHERE grind_session_id IS NULL`. FX → USD
// já garantido pelo filtro `currency = 'USD'` (paridade getHistoricalStatsByUser).
//
// NÃO edita storage.ts (arquivo compartilhado com sessão paralela) — query
// inline aqui, additive + collision-free.
// =============================================================================

import { db } from "../db";
import { sql } from "drizzle-orm";

export interface HistoryAggregateInput {
  userId: string;
  from: string; // YYYY-MM-DD (inclusive)
  to: string; // YYYY-MM-DD (inclusive)
  weeks?: number; // horizonte do sim (default 12) — só preenche meta
}

export interface HistoryAggGroup {
  name: string;
  tier: string;
  type: string;
  buyIn: number;
  field: number;
  roi: number;
  countPerWeek: number;
  count: number;
  isPKO: boolean;
  source: "historical";
  lowSample: boolean;
}

export interface HistoryAggregateResult {
  groups: HistoryAggGroup[];
  meta: {
    profileLetter: "historical";
    weeks: number;
    daysInProfile: number;
    tournamentsPerWeek: number;
    weeklyInvestment: number;
    from: string;
    to: string;
  };
}

const LOW_SAMPLE_THRESHOLD = 20;

function tierLabel(tier: string): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

/**
 * Agrega torneios do histórico no período [from, to] por tier×type.
 * Mesma classificação/ROI de getHistoricalStatsByUser + filtro de data.
 */
export async function buildHistoryAggregate(
  input: HistoryAggregateInput,
): Promise<HistoryAggregateResult> {
  const weeks = input.weeks ?? 12;
  const empty: HistoryAggregateResult = {
    groups: [],
    meta: {
      profileLetter: "historical",
      weeks,
      daysInProfile: 0,
      tournamentsPerWeek: 0,
      weeklyInvestment: 0,
      from: input.from,
      to: input.to,
    },
  };

  let raw: any[] = [];
  try {
    const rows = await db.execute(
      sql`WITH deduped AS (
            SELECT DISTINCT ON (name, site, buy_in, prize, field_size, position, date_played::date)
              buy_in, prize, field_size, type, date_played
            FROM tournaments
            WHERE grind_session_id IS NULL
              AND buy_in >= 10
              AND currency = 'USD'
              AND user_id = ${input.userId}
              AND date_played::date >= ${input.from}::date
              AND date_played::date <= ${input.to}::date
            ORDER BY name, site, buy_in, prize, field_size, position,
                     date_played::date, date_played
          ),
          classified AS (
            SELECT
              CASE
                WHEN buy_in >= 100 THEN 'high'
                WHEN buy_in >= 50 THEN 'mid'
                WHEN buy_in >= 22 THEN 'low'
                ELSE 'entry'
              END AS tier,
              type AS raw_type,
              buy_in, prize, field_size
            FROM deduped
          )
          SELECT
            c.tier,
            c.raw_type AS type,
            COUNT(*)::int AS count,
            AVG(c.buy_in)::numeric AS avg_buy_in,
            AVG(c.field_size)::numeric AS avg_field,
            (SUM(c.prize) / NULLIF(SUM(c.buy_in) + SUM(GREATEST(0, -(c.prize + c.buy_in))), 0))::numeric AS roi_adjusted
          FROM classified c
          GROUP BY c.tier, c.raw_type
          ORDER BY c.tier, c.raw_type`,
    );
    raw = (rows as any).rows ?? rows ?? [];
  } catch (err) {
    console.error("[historyAggregate] query failed", err);
    return empty;
  }

  if (!raw || raw.length === 0) return empty;

  const groups: HistoryAggGroup[] = raw.map((r: any) => {
    const tier = String(r.tier);
    const type = String(r.type ?? "Vanilla");
    const count = Number(r.count) || 0;
    const avgBuyIn = Number(r.avg_buy_in) || 0;
    const avgField = Number(r.avg_field) || 0;
    const roi = r.roi_adjusted != null ? Number(r.roi_adjusted) : 0;
    return {
      name: `${tierLabel(tier)} ${type}`,
      tier,
      type,
      buyIn: Math.round(avgBuyIn * 100) / 100,
      field: Math.max(2, Math.round(avgField)),
      roi: Number.isFinite(roi) ? roi : 0,
      countPerWeek: weeks > 0 ? count / weeks : count,
      count,
      isPKO: type === "PKO",
      source: "historical" as const,
      lowSample: count < LOW_SAMPLE_THRESHOLD,
    };
  });

  const totalCount = groups.reduce((s, g) => s + g.count, 0);
  const weeklyInvestment = groups.reduce(
    (s, g) => s + g.buyIn * g.count,
    0,
  );

  return {
    groups,
    meta: {
      profileLetter: "historical",
      weeks,
      daysInProfile: 0,
      tournamentsPerWeek: weeks > 0 ? totalCount / weeks : totalCount,
      weeklyInvestment,
      from: input.from,
      to: input.to,
    },
  };
}
