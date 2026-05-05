/**
 * setupItemsStore — defaults dos items do Setup Fisico.
 *
 * Reform 2026-05-05 (ADR-120): persistencia migrou para `user_settings.warmup_setup_items`
 * via hook `useSetupItems`. Este modulo agora exporta APENAS os defaults.
 *
 * As funcoes load/save/reset legacy (localStorage) permanecem para retro-compat
 * de testes — em runtime nao sao mais usadas pelo PhysicalSetupBlock.
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

/** @deprecated Use `useSetupItems` hook (ADR-120). Mantido para retro-compat de testes. */
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

/** @deprecated Use `useSetupItems` hook (ADR-120). */
export function saveSetupItems(items: string[], userId?: string | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    const cleaned = items.map((s) => s.trim()).filter((s) => s.length > 0);
    localStorage.setItem(storageKey(userId), JSON.stringify(cleaned));
  } catch {
    /* ignore quota */
  }
}

/** @deprecated Use `useSetupItems` hook (ADR-120). */
export function resetSetupItems(userId?: string | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(storageKey(userId));
    if (userId) localStorage.removeItem(STORAGE_KEY_PREFIX);
  } catch {
    /* ignore */
  }
}
