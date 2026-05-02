/**
 * Sprint Studies-Reform — RF-05 (D5): SuggestedThemeSidePanel
 *
 * Mostra sugestao de tema baseada no SPOT_TO_THEME_MAPPING.
 * Botao "Aplicar sugestao" preenche o dropdown de vinculacao.
 */

import React, { useMemo } from 'react';
import { findSuggestedThemeId } from '@shared/spot-theme-mapping';

interface ThemeOption {
  id: string;
  name: string;
  emoji?: string;
  color?: string;
  tags?: string[];
}

interface SuggestedThemeSidePanelProps {
  spot: {
    type?: string;
    spot?: string;
  };
  themes: ThemeOption[];
  onApply: (themeId: string) => void;
}

export function SuggestedThemeSidePanel({ spot, themes, onApply }: SuggestedThemeSidePanelProps) {
  const suggestedId = useMemo(
    () => findSuggestedThemeId(spot, themes),
    [spot, themes],
  );
  const suggested = useMemo(
    () => themes.find((t) => t.id === suggestedId) ?? null,
    [themes, suggestedId],
  );

  return (
    <aside
      data-testid="suggested-theme-side-panel"
      className="rounded-lg border border-gray-700 bg-gray-900/60 p-3 text-sm"
    >
      <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">
        Tema sugerido
      </div>
      {suggested ? (
        <div className="space-y-2">
          <div data-testid="suggested-theme-name" className="text-white font-medium">
            {suggested.emoji ? `${suggested.emoji} ` : ''}
            {suggested.name}
          </div>
          <button
            type="button"
            data-testid="suggested-theme-apply"
            onClick={() => onApply(suggested.id)}
            className="text-xs px-3 py-1.5 rounded bg-poker-accent text-black font-semibold"
          >
            Aplicar sugestao
          </button>
        </div>
      ) : (
        <div data-testid="suggested-theme-empty" className="text-gray-500 text-xs">
          Nenhum tema casa com este spot. Selecione manualmente.
        </div>
      )}
    </aside>
  );
}

export default SuggestedThemeSidePanel;
