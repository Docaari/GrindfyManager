/**
 * Sprint Studies-Reform — D5 (RF-05)
 *
 * Mapping inicial spot.type / spot.spot -> array de theme tags sugeridos.
 * Usado por SuggestedThemeSidePanel para sugerir vinculo automatico
 * baseado em metadata do spot.
 *
 * Cada chave e um valor de spot.type ou spot.spot.
 * Cada valor e array de tags (lowercase, snake_case) que devem casar
 * com theme.tags ou theme.name (fuzzy match).
 */
export const SPOT_TO_THEME_MAPPING: Record<string, string[]> = {
  // Por type
  tilt: ['emocional', 'mental_game', 'tilt_control'],
  leak: ['preflop_ranges', 'icm_basics', 'leak_specific'],
  bluff: ['bluff_strategy', '3bet_pot_oop', '3bet_pot_ip'],
  cbet: ['cbet_strategy', 'flop_strategy'],
  fold: ['fold_equity', 'icm_basics'],
  call: ['calling_ranges', 'pot_odds'],
  raise: ['raising_ranges', '3bet_strategy'],

  // Por spot
  ip_vs_bb: ['ip_vs_bb', 'flop_strategy', 'cbet_strategy'],
  bb_vs_ip: ['bb_vs_ip', 'defending_ranges'],
  sb_vs_bb_bw: ['sb_vs_bb', 'blind_war'],
  bb_vs_sb_bw: ['bb_vs_sb', 'blind_war'],
  '3bet_pot_ip': ['3bet_pot_ip', 'bluff_strategy'],
  '3bet_pot_oop': ['3bet_pot_oop'],
  icm: ['icm_basics', 'icm_advanced', 'bubble_play'],

  // Catch-all
  generic: ['general_strategy'],
};

/**
 * Helper: dado um spot, retorna array de theme tags sugeridos.
 * Combina mapeamento por type + por spot, dedupe.
 */
export function getSuggestedThemeTags(spot: { type?: string; spot?: string }): string[] {
  const tags = new Set<string>();
  if (spot.type && SPOT_TO_THEME_MAPPING[spot.type]) {
    SPOT_TO_THEME_MAPPING[spot.type].forEach((tag) => tags.add(tag));
  }
  if (spot.spot && SPOT_TO_THEME_MAPPING[spot.spot]) {
    SPOT_TO_THEME_MAPPING[spot.spot].forEach((tag) => tags.add(tag));
  }
  return Array.from(tags);
}

/**
 * Helper: dado um spot e uma lista de temas, retorna o ID do tema sugerido
 * (best match). Usa fuzzy match com tags + nome do tema.
 *
 * Heuristica:
 *   1) Para cada tag do mapping, procura tema cujo nome (lowercase, sem espaco)
 *      OR tags array contains a tag.
 *   2) Retorna o primeiro tema com match.
 *   3) Se nenhum match, retorna null.
 */
export function findSuggestedThemeId(
  spot: { type?: string; spot?: string },
  themes: Array<{ id: string; name: string; tags?: string[] | null }>,
): string | null {
  const tags = getSuggestedThemeTags(spot);
  if (tags.length === 0) return null;

  for (const tag of tags) {
    const tagSlug = tag.toLowerCase();
    for (const theme of themes) {
      const nameSlug = (theme.name || '')
        .toLowerCase()
        .replace(/\s+/g, '_');
      const themeTags = (theme.tags ?? []).map((t) => String(t).toLowerCase());
      if (
        nameSlug === tagSlug ||
        nameSlug.includes(tagSlug) ||
        tagSlug.includes(nameSlug) ||
        themeTags.includes(tagSlug)
      ) {
        return theme.id;
      }
    }
  }
  return null;
}
