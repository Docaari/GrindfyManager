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
 * De qual campo dos dados sai cada coluna do CSV.
 *
 * BUG QUE ISSO CORRIGE (2026-08-01): `formatCSVRow(row, headers)` procura o
 * valor por `row[header]` — ou seja, espera um objeto já com as chaves em
 * português ("Torneios"). Mas as abas passavam as linhas cruas da API, que têm
 * chave em inglês (`volume`, `profit`, `roi`). Resultado: o CSV saía com o
 * cabeçalho certo e TODAS as linhas em branco, em 7 das 8 abas — só a aba Geral
 * funcionava, porque as linhas dela já são montadas como { Metrica, Valor }.
 *
 * `key` é o campo na resposta da API; `header` é o rótulo no arquivo. Coluna sem
 * campo correspondente (ex.: ITM% na aba Site, que a API não devolve) fica vazia
 * de propósito, para não quebrar o formato já documentado nos testes.
 */
const EXPORT_COLUMN_KEYS: Record<string, Record<string, string>> = {
  geral: { 'Metrica': 'Metrica', 'Valor': 'Valor' },
  site: { 'Site': 'site', 'Torneios': 'volume', 'Profit': 'profit', 'ROI%': 'roi' },
  abi: { 'Faixa': 'buyinRange', 'Torneios': 'volume', 'Profit': 'profit', 'ROI%': 'roi' },
  tipo: { 'Categoria': 'category', 'Torneios': 'volume', 'Profit': 'profit', 'ROI%': 'roi' },
  velocidade: { 'Speed': 'speed', 'Torneios': 'volume', 'Profit': 'profit', 'ROI%': 'roi' },
  periodo: { 'Mes': 'monthName', 'Torneios': 'volume', 'Profit': 'profit', 'ROI%': 'roi' },
  participantes: { 'Faixa': 'fieldRange', 'Torneios': 'volume', 'Profit': 'profit', 'ROI%': 'roi' },
  posicao: { 'Posicao': 'position', 'Frequencia': 'volume', 'Profit': 'profit' },
  reentradas: {
    'Reentradas': 'bucket', 'Torneios': 'volume', 'Investido': 'invested',
    'Custo das reentradas': 'reentryCost', 'Profit': 'profit', 'ROI%': 'roi',
  },
};

/**
 * Projeta uma linha da API no formato que `formatCSVRow` espera (chaveada pelos
 * rótulos do cabeçalho). Chave ausente vira string vazia.
 */
export function projectRowForExport(row: Record<string, any>, tabType: string): Record<string, any> {
  const map = EXPORT_COLUMN_KEYS[tabType];
  if (!map) return row;
  const out: Record<string, any> = {};
  for (const [header, key] of Object.entries(map)) {
    out[header] = row?.[key] ?? '';
  }
  return out;
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
    reentradas: ['Reentradas', 'Torneios', 'Investido', 'Custo das reentradas', 'Profit', 'ROI%'],
    biblioteca: [
      'Nome', 'Site', 'Formato', 'Categoria', 'Velocidade',
      'ABI', 'ROI%', 'ITM%', 'Total Jogados', 'Profit', 'Confidence',
    ],
  };
  return headersMap[tabType] || [];
}
