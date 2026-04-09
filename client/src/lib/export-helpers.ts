// =============================================================================
// FP-10: Logica de exportacao de dados (CSV)
// =============================================================================

/**
 * Escapa caracteres especiais para CSV (RFC 4180).
 */
export function sanitizeForCSV(value: any): string {
  if (value === null || value === undefined) return '';
  let str = String(value);

  // Formula injection prevention: prefix dangerous characters with apostrophe
  // Only for non-numeric values to preserve legitimate negative numbers
  if (typeof value !== 'number' && typeof value !== 'boolean') {
    const firstChar = str.charAt(0);
    if (firstChar === '=' || firstChar === '+' || firstChar === '-' || firstChar === '@' || firstChar === '\t' || firstChar === '\r') {
      str = "'" + str;
    }
  }

  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Formata uma linha de dados em CSV, alinhada aos headers fornecidos.
 */
export function formatCSVRow(data: Record<string, any>, headers: string[]): string {
  return headers.map((h) => sanitizeForCSV(data[h] ?? '')).join(',');
}

/**
 * Monta CSV completo com BOM UTF-8, headers e linhas de dados.
 */
export function buildCSVContent(headers: string[], rows: string[]): string {
  const bom = '\uFEFF';
  const headerLine = headers.join(',');
  const lines = [headerLine, ...rows];
  return bom + lines.join('\n') + '\n';
}

/**
 * Gera nome do arquivo de export no formato grindfy-[prefix]-[period].[format].
 */
export function getExportFilename(prefix: string, period: string, format: 'csv' | 'png'): string {
  const sanitized = prefix.toLowerCase().replace(/\s+/g, '-');
  return `grindfy-${sanitized}-${period}.${format}`;
}

/**
 * Retorna headers corretos por tipo de tab do dashboard.
 */
export function getExportHeaders(tabType: string): string[] {
  const headersMap: Record<string, string[]> = {
    geral: ['Metrica', 'Valor'],
    site: ['Site', 'Torneios', 'Profit', 'ROI%', 'ITM%'],
    abi: ['Faixa', 'Torneios', 'Profit', 'ROI%'],
    tipo: ['Categoria', 'Torneios', 'Profit', 'ROI%'],
    velocidade: ['Speed', 'Torneios', 'Profit', 'ROI%'],
    periodo: ['Mes', 'Torneios', 'Profit', 'ROI%'],
    participantes: ['Faixa', 'Torneios', 'Profit', 'ROI%'],
    posicao: ['Posicao', 'Frequencia', 'Profit'],
    biblioteca: [
      'Nome', 'Site', 'Formato', 'Categoria', 'Velocidade',
      'ABI', 'ROI%', 'ITM%', 'Total Jogados', 'Profit', 'Confidence',
    ],
  };
  return headersMap[tabType] || [];
}
