// Presets de range MTT (aproximacoes pedagogicas, formato solver).
// NAO sao ranges GTO exatos — pontos de partida para o jogador ajustar.
export interface RangePreset {
  id: string;
  label: string;
  /** Notacao solver, separada por virgula. Expande via expandRangeToken. */
  range: string;
}

export const RANGE_PRESETS: RangePreset[] = [
  {
    id: "btn-open",
    label: "BTN open ~45%",
    range:
      "22+, A2s+, K5s+, Q7s+, J7s+, T7s+, 96s+, 85s+, 75s+, 64s+, 54s, A8o+, K9o+, Q9o+, J9o+, T9o",
  },
  {
    id: "co-open",
    label: "CO open ~28%",
    range:
      "22+, A2s+, K8s+, Q9s+, J9s+, T8s+, 97s+, 87s, 76s, 65s, ATo+, KJo+, QJo",
  },
  {
    id: "bb-defend-vs-btn",
    label: "BB defend vs BTN",
    range:
      "22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 96s+, 85s+, 74s+, 64s+, 53s+, A2o+, K7o+, Q8o+, J8o+, T8o+, 98o",
  },
  {
    id: "vs-3bet-value",
    label: "Call 3bet (value)",
    range: "99+, AJs+, KQs, AQo+",
  },
  {
    id: "river-bluffcatch",
    label: "River bluffcatch (exemplo)",
    range: "A7s, A7o, 87s, 76s, 75s, K7s, Q7s, 55, 77",
  },
];
