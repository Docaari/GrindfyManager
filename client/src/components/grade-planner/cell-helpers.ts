type CellDisplayState = 'empty-active' | 'empty-off' | 'has-tournaments';

interface CellContext {
  dayOfWeek: number;
  profile: 'A' | 'B' | 'C' | 'OFF' | null;
  tournaments: any[];
}

export function getCellDisplayState(context: CellContext): CellDisplayState {
  if (context.tournaments.length > 0) {
    return 'has-tournaments';
  }
  if (context.profile === 'A' || context.profile === 'B' || context.profile === 'C') {
    return 'empty-active';
  }
  return 'empty-off';
}

export function shouldShowAddHint(context: CellContext): boolean {
  return getCellDisplayState(context) === 'empty-active';
}
