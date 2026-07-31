/**
 * importReconciliation — Sprint import-otimizacao (ADR-243).
 *
 * Fecha a conta do import para o jogador: quantas linhas o arquivo tinha, quantas
 * viraram torneio, quantas eram duplicadas, quantas foram rejeitadas e POR QUE.
 * Antes: `rowErrors` era montado no parser e descartado ("for now, just resolving
 * tournaments") e o `else` da validacao era vazio — 4 linhas do export real do
 * founder desapareciam sem contagem nem aviso (mexendo no lucro total em $46,58).
 *
 * Funcao PURA (sem I/O, sem Date.now()). O resultado vai para
 * `upload_history.import_summary` (jsonb) e tambem na resposta HTTP.
 */

export interface ImportRejection {
  rowNum: number;
  reason: string;
  rowData?: Record<string, any>;
}

export interface QuarantineInfo {
  /** Quantas linhas foram retidas, por rede. */
  bySite: Record<string, number>;
  /** Motivo por rede (texto exibido ao jogador). */
  reasons: Array<{ site: string; reason: string }>;
}

export interface ImportReconciliationInput {
  parseReport: { rowsInFile: number; parsedCount: number; rejected: ImportRejection[] } | null;
  /** Linhas que o parser devolveu (antes de dedup). */
  parsedCount: number;
  /** Linhas classificadas como duplicadas. */
  duplicates: number;
  /** Linhas efetivamente gravadas. */
  inserted: number;
  /** Falhas de banco (batch parcial). */
  dbErrors: number;
  /** Amostra dos torneios gravados — usada para os avisos de qualidade. */
  tournaments?: Array<Record<string, any>>;
  /** Linhas retidas por rede em quarentena (ADR-243). */
  quarantine?: QuarantineInfo | null;
}

export interface ImportReconciliation {
  rowsInFile: number | null;
  parsed: number;
  duplicates: number;
  inserted: number;
  rejected: number;
  dbErrors: number;
  /** Amostra das rejeicoes (cap 50 — jsonb nao deve virar dump do arquivo). */
  rejectedSample: Array<{ rowNum: number; reason: string }>;
  /** Agrupamento "motivo -> quantidade" para exibir resumo. */
  rejectedByReason: Record<string, number>;
  /**
   * Linhas NÃO importadas por a rede estar em quarentena (export da origem
   * inconsistente). Distinto de `rejected`: aqui o parser entendeu a linha, mas
   * nós escolhemos não gravar. Ver `shared/quarantined-sites`.
   */
  quarantined: number;
  quarantinedBySite: Record<string, number>;
  quarantineReasons: Array<{ site: string; reason: string }>;
  /** Avisos de qualidade do lote gravado (nao bloqueiam o import). */
  warnings: string[];
}

const REJECTED_SAMPLE_CAP = 50;

export function buildImportSummary(input: ImportReconciliationInput): ImportReconciliation {
  const rejected = input.parseReport?.rejected ?? [];

  const rejectedByReason: Record<string, number> = {};
  for (const r of rejected) {
    const key = r.reason || "motivo desconhecido";
    rejectedByReason[key] = (rejectedByReason[key] ?? 0) + 1;
  }

  const warnings: string[] = [];

  // ADR-243: quarentena aparece PRIMEIRO nos avisos — é a informação mais
  // importante para o jogador entender por que o total não bate com a origem.
  const quarantine = input.quarantine ?? null;
  const quarantinedTotal = quarantine
    ? Object.values(quarantine.bySite).reduce((a, b) => a + b, 0)
    : 0;
  if (quarantine && quarantinedTotal > 0) {
    for (const { site, reason } of quarantine.reasons) {
      const n = quarantine.bySite[site] ?? 0;
      warnings.push(`${n} torneios de ${site} NAO foram importados. ${reason}`);
    }
  }

  const rows = input.tournaments ?? [];
  if (rows.length > 0) {
    const noPosition = rows.filter((t) => !t.position).length;
    if (noPosition > 0) {
      warnings.push(
        `${noPosition} de ${rows.length} torneios sem posicao final no arquivo — metricas por posicao (mesa final, ITM por colocacao) ignoram essas linhas.`,
      );
    }
    const synthesized = rows.filter((t) => t.nameSynthesized === true).length;
    if (synthesized > 0) {
      warnings.push(
        `${synthesized} torneios vieram sem nome no arquivo e foram importados como "[sem nome]" — antes eram descartados em silencio.`,
      );
    }
    const unconverted = rows.filter(
      (t) => t.currency && t.currency !== "USD" && t.convertedToUSD !== true,
    ).length;
    if (unconverted > 0) {
      warnings.push(
        `${unconverted} torneios em moeda estrangeira sem cotacao disponivel — valores ficaram na moeda original. Defina a cotacao em Configuracoes e reimporte para normalizar.`,
      );
    }
    const noRake = rows.filter((t) => t.rake === null || t.rake === undefined || Number(t.rake) === 0).length;
    if (noRake === rows.length) {
      warnings.push(
        "Nenhuma linha trouxe rake — este export nao separa rake do buy-in, logo rake real por rede fica indisponivel para este lote.",
      );
    }
  }

  if (input.dbErrors > 0) {
    warnings.push(`${input.dbErrors} linhas falharam ao gravar no banco (lote parcial).`);
  }

  return {
    rowsInFile: input.parseReport?.rowsInFile ?? null,
    parsed: input.parsedCount,
    duplicates: input.duplicates,
    inserted: input.inserted,
    rejected: rejected.length,
    dbErrors: input.dbErrors,
    rejectedSample: rejected
      .slice(0, REJECTED_SAMPLE_CAP)
      .map((r) => ({ rowNum: r.rowNum, reason: r.reason })),
    rejectedByReason,
    quarantined: quarantinedTotal,
    quarantinedBySite: quarantine?.bySite ?? {},
    quarantineReasons: quarantine?.reasons ?? [],
    warnings,
  };
}
