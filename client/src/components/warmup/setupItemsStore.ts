/**
 * setupItemsStore — persistencia de items custom do Setup Fisico em localStorage.
 *
 * Defaults incluem os 6 originais + "Bancas das plataformas verificadas".
 * User pode add/edit/remove. Min 3 marcados para avancar (validado no Block).
 *
 * Key segregada por userId quando disponivel (multi-user no mesmo browser
 * NAO compartilha lista). Fallback para chave global em sessao anonima.
 *
 * TODO (futuro): migrar para user_settings.warmupSetupItems jsonb quando
 * houver migration disponivel.
 */

const STORAGE_KEY_PREFIX = "warmup-setup-items-v1";

function storageKey(userId?: string | null): string {
  if (userId && userId.length > 0) return `${STORAGE_KEY_PREFIX}::${userId}`;
  return STORAGE_KEY_PREFIX;
}

export const DEFAULT_SETUP_ITEMS: string[] = [
  "Garrafa de 1L de agua na mesa",
  "Snacks preparados (nozes, banana, barra)",
  "Celular em modo aviao ou na gaveta",
  "Notificacoes silenciadas no computador",
  "Fone de ouvido (se for grindar com playlist)",
  "Luz ambiente calibrada",
  "Bancas das plataformas verificadas",
];

export function loadSetupItems(userId?: string | null): string[] {
  if (typeof localStorage === "undefined") return DEFAULT_SETUP_ITEMS.slice();
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return DEFAULT_SETUP_ITEMS.slice();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_SETUP_ITEMS.slice();
    const cleaned = parsed
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return cleaned.length > 0 ? cleaned : DEFAULT_SETUP_ITEMS.slice();
  } catch {
    return DEFAULT_SETUP_ITEMS.slice();
  }
}

export function saveSetupItems(items: string[], userId?: string | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    const cleaned = items.map((s) => s.trim()).filter((s) => s.length > 0);
    localStorage.setItem(storageKey(userId), JSON.stringify(cleaned));
  } catch {
    /* ignore quota */
  }
}

export function resetSetupItems(userId?: string | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(storageKey(userId));
    // Fallback: tambem limpa a key global legada (pre-segregacao)
    if (userId) localStorage.removeItem(STORAGE_KEY_PREFIX);
  } catch {
    /* ignore */
  }
}
