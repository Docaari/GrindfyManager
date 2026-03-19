/**
 * Maps a Pokerbyte API tournament object to Grindfy's planned tournament format.
 */

interface PokerbyteTournament {
  id: number;
  liga: number;
  ligaName: string;
  name: string;
  date: string;
  guaranteed: number;
  buyin: number;
  late: number;
  status: string;
  tournament: number;
  moneyPrefix: string;
  stack: number;
  temponivelmMeta: number;
  type: string;
  maxPl: number;
  isKO: number;
}

interface MappedSupremaTournament {
  externalId: string;
  name: string;
  site: string;
  time: string;
  buyIn: string;
  guaranteed: string;
  type: string;
  speed: string;
  dayOfWeek: number;
  status: string;
  prioridade: number;
  startTime: Date;
}

function mapSpeed(temponivelmMeta: number | null | undefined): string {
  if (temponivelmMeta == null || temponivelmMeta === 0) return 'Normal';
  if (temponivelmMeta <= 6) return 'Hyper';
  if (temponivelmMeta <= 10) return 'Turbo';
  return 'Normal';
}

export function mapSupremaTournament(input: PokerbyteTournament): MappedSupremaTournament {
  const dateStr = input.date || '';
  const startTime = new Date(dateStr.replace(' ', 'T'));

  // Extract HH:mm from "YYYY-MM-DD HH:mm:ss"
  const timePart = dateStr.split(' ')[1] || '00:00:00';
  const [hours, minutes] = timePart.split(':');
  const time = `${hours}:${minutes}`;

  return {
    externalId: `suprema-${input.id}`,
    name: input.name || '',
    site: 'Suprema',
    time,
    buyIn: String(input.buyin ?? 0),
    guaranteed: String(input.guaranteed ?? 0),
    type: input.isKO === 1 ? 'PKO' : 'Vanilla',
    speed: mapSpeed(input.temponivelmMeta),
    dayOfWeek: startTime.getDay(),
    status: 'upcoming',
    prioridade: 2,
    startTime,
  };
}
