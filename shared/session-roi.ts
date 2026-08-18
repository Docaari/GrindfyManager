/**
 * ROI de sessao — leitura e exibicao.
 *
 * Spec: Docs/specs/grind-live-manual-session-result.md (RF-03)
 * ADR:  Docs/architecture/decisions/244-grind-live-manual-session-result.md (D4)
 *
 * `grind_sessions.roi` e nullable e ja existem sessoes legadas com a coluna
 * nula. A leitura inline antiga (`parseFloat(session.roi || '0') || 0`) achatava
 * `null` em `0`, fazendo o historico afirmar "0.0%" para uma sessao que nunca
 * teve ROI. Aqui ausencia devolve `null` e a exibicao devolve "—".
 *
 * Mora em `shared/` porque serve a rota (server) e as telas de sessao (client);
 * `shared/` nao importa server/ nem client/ (.claude/rules/02-estrutura.md).
 */

/** Travessao exibido quando nao ha ROI conhecido. */
const NO_ROI = '—';

/**
 * Le o ROI persistido (pg `numeric` chega como string no driver) devolvendo
 * `null` para qualquer ausencia. `0` legitimo continua sendo `0`.
 */
export function parseSessionRoi(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;

  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

/**
 * Formata o ROI para exibicao: 1 casa decimal com sinal explicito, ou "—"
 * quando nao ha ROI. Arredondar so acontece aqui — o valor persistido e cru.
 */
export function formatSessionRoi(roi: number | null | undefined): string {
  if (roi === null || roi === undefined || !Number.isFinite(roi)) return NO_ROI;
  const sign = roi >= 0 ? '+' : '';
  return `${sign}${roi.toFixed(1)}%`;
}
