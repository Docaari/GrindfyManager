/**
 * Wave D (Fase 3 escalabilidade) — Single-instance guard pra crons.
 *
 * Usa `pg_try_advisory_lock` do Postgres. Crons in-process correm em todos os
 * replicas (FX, news, study plan, drill, spot purge, study freezes, coach,
 * suprema autosync, library cleanup, refresh-token cleanup). Sem guard:
 * BCB PTAX rate-limit explode (N× hit), Anthropic cost N×, caps diarios racy.
 *
 * Pattern:
 *   cron.schedule(EXPR, () =>
 *     withAdvisoryLock("cron:fx-rates", runFxRatesRefresh).catch(...)
 *   );
 *
 * Test fallback (lesson #34): se `pool` undefined (test que NAO mocka ../db),
 * roda direto sem guard — preserva comportamento original. Producao sempre
 * tem pool inicializado.
 *
 * ADR: Docs/architecture/decisions/144-cron-advisory-lock-pattern.md
 */

import { pool } from "../db";

/**
 * Hash 32-bit estavel pra `pg_try_advisory_lock(bigint)`. Mesmo nome em
 * replicas distintas resolve pro mesmo key — eh isso que garante mutex
 * cross-instance.
 */
export function hashLockKey(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  }
  return h;
}

export interface WithAdvisoryLockOptions {
  /**
   * Quando pool indisponivel (testes sem mock de ../db), rodar `fn` direto.
   * Default true (preserva back-compat). Producao default eh false implicito
   * porque pool sempre existe.
   */
  fallbackWhenPoolMissing?: boolean;
}

/**
 * Roda `fn` exclusivamente — apenas um replica/processo executa por chave.
 * Outros replicas vendo `lock held elsewhere` simplesmente pulam o tick.
 *
 * @param name Nome estavel do lock (ex: "cron:fx-rates"). Prefixado internamente.
 * @param fn Trabalho a executar dentro do lock.
 */
export async function withAdvisoryLock(
  name: string,
  fn: () => Promise<unknown> | unknown,
  opts: WithAdvisoryLockOptions = {},
): Promise<void> {
  const fallback = opts.fallbackWhenPoolMissing ?? true;

  if (!pool || typeof (pool as any).connect !== "function") {
    if (fallback) {
      await fn();
    }
    return;
  }

  const key = hashLockKey(`grindfy:${name}`);
  let client: any;
  try {
    client = await pool.connect();
  } catch (err) {
    console.error("[advisoryLock] pool.connect failed", {
      name,
      err: (err as any)?.message ?? String(err),
    });
    // Sem conexao = sem lock confiavel = skip. Cron tickara de novo no proximo
    // schedule; melhor pular do que rodar sem guard e duplicar trabalho.
    return;
  }

  try {
    const result: any = await client.query(
      "SELECT pg_try_advisory_lock($1) AS got",
      [key],
    );
    const got = !!result?.rows?.[0]?.got;
    if (!got) {
      console.info("[advisoryLock] skipped — held elsewhere", { name });
      return;
    }

    try {
      await fn();
    } finally {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [key]);
      } catch (err) {
        console.error("[advisoryLock] unlock failed", {
          name,
          err: (err as any)?.message ?? String(err),
        });
      }
    }
  } finally {
    try {
      client.release();
    } catch {
      /* noop */
    }
  }
}
