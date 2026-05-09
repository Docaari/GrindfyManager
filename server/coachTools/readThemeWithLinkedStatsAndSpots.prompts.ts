// =============================================================================
// Sprint stats-themes-linking-1 (ADR-142). Lesson #10 — DRY de prompts.
//
// Description unificada da Coach tool unificada
// `read_theme_with_linked_stats_and_spots`. Mesmo template eh referenciado pelo
// alias deprecated `read_theme_with_linked_spots` para garantir cache estavel.
// =============================================================================

export const READ_THEME_TOOL_DESCRIPTION = `Le um tema de estudo do usuario com seu contexto completo:

- theme: dados base (id, nome, cor, emoji, progresso, ultima visita).
- tabs: ate 5 abas com preview de 200 chars do conteudo.
- linked_spots: ate 10 spots vinculados (id, conclusao, tipo, screenshot URL).
- stats: stats HUD linkadas ao tema com valores correntes do usuario,
  alvo (targetMin/targetMax), direcao (higher/lower/context/neutral),
  e sparkline dos ultimos 30 dias. Inclui catalog stats e custom user stats.
- summary: contadores agregados (spots, tabs, stats no alvo, stats em alarme,
  ultima atividade).

Use stats para diagnosticar leaks especificos com NUMEROS no contexto:
"voce esta com C-bet OOP=58%, alvo 38-45%, leak claro nessa stat".
Use linked_spots para citar spots concretos.
Use tabs para citar conteudo concreto que o user ja escreveu.

Cross-user isolation: tema deve pertencer ao usuario autenticado (403 caso contrario).
`.trim();
