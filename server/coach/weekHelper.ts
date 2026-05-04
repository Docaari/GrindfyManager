// =============================================================================
// weekHelper — Sprint home-reform-4 / Item 4 (RF-12, ADR-111).
//
// `getCurrentWeekStartBRT(now?)` retorna a Date representando segunda-feira
// 00:00 BRT da semana corrente.
//
// BRT (America/Sao_Paulo) eh fixo UTC-3 desde 2019 (Brasil aboliu DST).
// Logo segunda 00:00 BRT == segunda 03:00 UTC (sempre).
//
// Algoritmo:
//   1. Converte `now` para "BRT clock" subtraindo 3 horas (UTC-3).
//   2. Calcula dia da semana no BRT clock (0=domingo, 1=segunda, ...).
//   3. Subtrai dias para chegar na segunda da semana corrente.
//   4. Zera horas/min/sec do BRT clock e retorna o equivalente em UTC.
// =============================================================================

const BRT_OFFSET_HOURS = 3; // UTC-3

export function getCurrentWeekStartBRT(now?: Date): Date {
  const ref = now ? new Date(now) : new Date();

  // Shift para o "BRT clock". subtrai 3h em ms.
  const brtClock = new Date(ref.getTime() - BRT_OFFSET_HOURS * 60 * 60 * 1000);

  // Dia da semana no BRT (0=dom .. 1=seg .. 6=sab) usando UTC getters
  // (porque ja shiftamos manualmente o relogio).
  const day = brtClock.getUTCDay();
  // Distancia ate segunda corrente: domingo (0) -> 6 dias atras; segunda (1) -> 0;
  // terca (2) -> 1 ... sabado (6) -> 5.
  const diff = day === 0 ? 6 : day - 1;

  const monday = new Date(brtClock);
  monday.setUTCDate(brtClock.getUTCDate() - diff);
  monday.setUTCHours(0, 0, 0, 0);

  // Volta para UTC adicionando 3h (segunda 00:00 BRT == segunda 03:00 UTC).
  return new Date(monday.getTime() + BRT_OFFSET_HOURS * 60 * 60 * 1000);
}
