/**
 * Sleep Gate Service — Sprint Cooldown-2
 *
 * Spec: Docs/specs/cooldown-refactor-plan.md (RF-02 Bloco 4)
 * ADR : Docs/architecture/decisions/041-cooldown-dedicated-spec-and-schema.md
 *
 * Helpers para o Sleep Gate (Bloco 4 do cool-down):
 *   - nextMorning(now): proximo dia 08:00 LOCAL (snooze do dashboard)
 *   - randomActivitySuggestion(): sugestao de atividade neutra quando NAO vai dormir
 */

const ACTIVITY_POOL: readonly string[] = [
  "Ler livro 20min",
  "Caminhar 10min",
  "Banho quente",
  "Conversar com alguem",
  "Cozinhar",
  "Tarefa domestica leve",
];

/**
 * Retorna proximo "dia 08:00" local apos `now`.
 *
 * Regras:
 *   - now < 08:00 do mesmo dia -> retorna mesmo dia 08:00:00
 *   - now == 08:00 ou now > 08:00 -> retorna proximo dia 08:00:00
 *   - segundos/milissegundos zerados no resultado
 */
export function nextMorning(now: Date): Date {
  const target = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    8,
    0,
    0,
    0,
  );
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

/**
 * Retorna 1 sugestao aleatoria do pool de 6 atividades neutras.
 */
export function randomActivitySuggestion(): string {
  const idx = Math.floor(Math.random() * ACTIVITY_POOL.length);
  return ACTIVITY_POOL[idx];
}

export const ACTIVITY_SUGGESTIONS: readonly string[] = ACTIVITY_POOL;
