// =============================================================================
// Coach Prompts — DEPRECATED (Sprint AI-0B / ADR-148)
//
// Os 3 system prompts por coach (getMentalPrompt / getTournamentPrompt /
// getTechnicalPrompt) foram REMOVIDOS quando os 3 coaches viraram um agente
// unico "Grindfy AI". O base prompt unico vive em server/coachSystemBuilder.ts
// (constante GRINDFY_AI_BASE + helper getGrindfyAiBasePrompt()). As regras de
// citacao/confianca/seguranca continuam com fonte unica em
// server/coachSafetyPrompts.ts.
//
// Este arquivo permanece apenas como ponto de re-export do builder unico para
// callers legados que ainda referenciam um "prompt base do coach".
// =============================================================================

export { getGrindfyAiBasePrompt, GRINDFY_AI_BASE } from './coachSystemBuilder';
