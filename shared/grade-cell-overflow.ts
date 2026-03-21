interface CellDisplayInfo {
  visible: any[];
  overflow: number;
  hasOverflow: boolean;
}

export function getCellDisplayInfo(tournaments: any[], maxVisible: number): CellDisplayInfo {
  const visible = tournaments.slice(0, maxVisible);
  const overflow = tournaments.length - visible.length;

  return {
    visible,
    overflow,
    hasOverflow: overflow > 0,
  };
}
