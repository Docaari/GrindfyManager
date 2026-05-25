// =============================================================================
// isTestEnv — detecta NODE_ENV=test ou Vite import.meta.env.MODE=test.
//
// Usado para gatear helpers `window.__*` que so existem em testes (ex: bridges
// para disparar handlers internos sem precisar simular DnD/IO real).
// @internal test-only — sempre retorna false em PROD.
// =============================================================================

export function isTestEnv(): boolean {
  try {
    if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") {
      return true;
    }
  } catch {
    /* ignore */
  }
  try {
    // @ts-ignore — import.meta.env.MODE may exist under Vite.
    if (typeof import.meta !== "undefined" && (import.meta as any).env?.MODE === "test") {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export default isTestEnv;
