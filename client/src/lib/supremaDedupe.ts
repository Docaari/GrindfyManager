/**
 * Suprema Dedupe Helpers (UX 2026-04-24 - GL-C)
 *
 * Como session_tournaments nao persiste o externalId original da Suprema
 * (formato `suprema-{pokerbyteId}`), dedupe de import deve usar uma chave
 * composta derivada de campos estaveis: site + name + time + buyIn.
 *
 * Regra: mesmo site (Suprema), mesmo nome (case-insensitive trim), mesmo
 * horario (HH:MM) e mesmo buy-in arredondado a 2 casas = tentativa de
 * importacao duplicada na mesma sessao.
 */

export interface SupremaDedupeKeyInput {
  site?: string | null;
  name?: string | null;
  time?: string | null;
  buyIn?: string | number | null;
}

/**
 * Normaliza um valor de buy-in para uma string numerica com ate 2 decimais.
 * Trata null/undefined/"0"/"R$ 5,50" retornando valor consistente.
 */
function normalizeBuyIn(value: string | number | null | undefined): string {
  if (value == null) return '0';
  const str = typeof value === 'number' ? String(value) : value;
  // Remove qualquer caractere que nao seja digito, ponto ou virgula; converte virgula em ponto
  const cleaned = str.replace(/[^\d.,]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  if (!isFinite(num)) return '0';
  return num.toFixed(2);
}

function normalizeName(value: string | null | undefined): string {
  if (!value) return '';
  return value.trim().toLowerCase();
}

function normalizeTime(value: string | null | undefined): string {
  if (!value) return '';
  // Se vier "HH:MM:SS", trunca para "HH:MM"
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

/**
 * Cria a chave de match usada para comparar tentativas de importacao contra
 * torneios ja existentes na sessao. Formato: `suprema-match:<name>|<time>|<buyIn>`.
 *
 * Retorna null se qualquer campo essencial faltar (sem chave = sem dedupe).
 */
export function buildSupremaMatchKey(input: SupremaDedupeKeyInput): string | null {
  const name = normalizeName(input.name);
  const time = normalizeTime(input.time);
  const buyIn = normalizeBuyIn(input.buyIn);
  if (!name || !time) return null;
  return `suprema-match:${name}|${time}|${buyIn}`;
}

/**
 * Extrai as chaves de match dos session tournaments existentes que vieram
 * da Suprema. Usado pelo SupremaImportModal para saber quais torneios
 * selecionaveis ja estao na sessao.
 */
export function buildSupremaMatchKeysFromSession(
  sessionTournaments: Array<{
    site?: string | null;
    name?: string | null;
    time?: string | null;
    buyIn?: string | number | null;
    status?: string | null;
  }> | null | undefined
): string[] {
  if (!Array.isArray(sessionTournaments)) return [];
  const keys: string[] = [];
  for (const t of sessionTournaments) {
    if (!t) continue;
    if ((t.site ?? '').toLowerCase() !== 'suprema') continue;
    // Ignora torneios deletados (nao devem impedir re-importacao)
    if ((t.status ?? '').toLowerCase() === 'deleted') continue;
    const key = buildSupremaMatchKey({
      site: t.site,
      name: t.name,
      time: t.time,
      buyIn: t.buyIn,
    });
    if (key) keys.push(key);
  }
  return keys;
}
