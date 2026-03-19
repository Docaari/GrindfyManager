/**
 * Fetches tournament data from the Pokerbyte API for Suprema Poker.
 */

const API_BASE = 'https://api.pokerbyte.com.br/mtt/list/106/all';
const TIMEOUT_MS = 10000;

export async function fetchSupremaTournaments(date: string): Promise<any[]> {
  const url = `${API_BASE}/${date}/guaranteed/desc`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Nao foi possivel conectar a API da Suprema Poker: timeout');
    }
    throw new Error(`Nao foi possivel conectar a API da Suprema Poker: ${err.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(
      `Nao foi possivel conectar a API da Suprema Poker (status ${response.status})`,
    );
  }

  const json = await response.json();

  // API returns { recordsTotal, recordsFiltered, data: [...] } or plain array
  const tournaments = Array.isArray(json) ? json : json.data;

  if (!Array.isArray(tournaments)) {
    return [];
  }

  // Filter out items missing required fields
  return tournaments.filter((item: any) => {
    return item.name && item.buyin != null && item.date;
  });
}
