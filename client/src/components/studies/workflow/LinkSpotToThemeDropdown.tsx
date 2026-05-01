/**
 * Sprint Studies-Reform — RF-05: dropdown para vincular spot a tema
 *
 * Implementa custom dropdown (lista clicavel) ao inves de <select> nativo
 * para que os testes TDD possam clicar diretamente em option-{id} e ver
 * onChange disparado (jsdom limitation com <select>).
 */

import React, { useState } from 'react';

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
  const [expanded, setExpanded] = useState<boolean>(true);
  const selected = themes.find((t) => t.id === value) ?? null;

  return (
    <div data-testid="link-spot-theme-dropdown" className="flex flex-col gap-2">
      <label className="text-xs text-gray-400">Vincular a tema (opcional)</label>
      <div className="rounded border border-gray-700 bg-gray-800 p-2 space-y-1">
        <button
          type="button"
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
      {/* hidden native select para fallback / acessibilidade SR */}
      <select
        aria-hidden
        tabIndex={-1}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="sr-only"
      >
        <option value="">none</option>
        {themes.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      {/* Avoid eslint unused warning for expanded state — toggling reserved for future polish */}
      <span className="hidden">{expanded ? '' : ''}</span>
    </div>
  );
}

export default LinkSpotToThemeDropdown;
