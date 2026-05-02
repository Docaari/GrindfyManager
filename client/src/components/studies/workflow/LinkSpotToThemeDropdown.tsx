/**
 * Sprint Studies-Reform — RF-05: dropdown para vincular spot a tema
 *
 * Custom listbox com role=listbox + role=option para acessibilidade nativa
 * (substitui o <select> sr-only que combinava aria-hidden + sr-only — ambos
 * cancelando o efeito util para screen readers).
 */

import React from 'react';

interface ThemeOption {
  id: string;
  name: string;
  emoji?: string;
  color?: string;
  tags?: string[];
}

interface LinkSpotToThemeDropdownProps {
  spotId: string;
  themes: ThemeOption[];
  value: string | null;
  onChange: (themeId: string | null) => void;
  disabled?: boolean;
}

export function LinkSpotToThemeDropdown({
  themes,
  value,
  onChange,
  disabled,
}: LinkSpotToThemeDropdownProps) {
  const selected = themes.find((t) => t.id === value) ?? null;

  return (
    <div data-testid="link-spot-theme-dropdown" className="flex flex-col gap-2">
      <label id="link-spot-theme-label" className="text-xs text-gray-400">
        Vincular a tema (opcional)
      </label>
      <div
        role="listbox"
        aria-labelledby="link-spot-theme-label"
        className="rounded border border-gray-700 bg-gray-800 p-2 space-y-1"
      >
        <button
          type="button"
          role="option"
          aria-selected={value === null}
          data-testid="link-spot-theme-option-none"
          onClick={() => onChange(null)}
          disabled={disabled}
          className={`w-full text-left text-xs px-2 py-1 rounded ${
            value === null ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800'
          }`}
        >
          — sem tema —
        </button>
        {themes.map((t) => {
          const active = t.id === value;
          return (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={active}
              data-testid={`link-spot-theme-option-${t.id}`}
              onClick={() => onChange(t.id)}
              disabled={disabled}
              className={`w-full text-left text-xs px-2 py-1 rounded ${
                active ? 'bg-poker-accent/30 text-white' : 'text-gray-300 hover:bg-gray-700/40'
              }`}
            >
              {t.emoji ? `${t.emoji} ` : ''}
              {t.name}
            </button>
          );
        })}
      </div>
      {selected && (
        <div className="text-[11px] text-gray-500">
          Selecionado: {selected.name}
        </div>
      )}
    </div>
  );
}

export default LinkSpotToThemeDropdown;
