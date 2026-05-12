/**
 * Sprint AI-0B (ADR-148 + ADR-150 / RF-07) — SUITE DESATIVADA (it.skip).
 *
 * O sujeito destes testes era a pagina CoachAI ANTIGA: 3 abas seletoras de coach
 * (Mental / Torneios / Tecnico), prompt-starters por coach, tabs-lock por tier,
 * LimitCounter inline, delete-confirm AlertDialog, session-search no sidebar etc.
 *
 * A consolidacao para o agente unico "Grindfy AI" (Sprint AI-0B) reformou a
 * pagina /coach-ai num HUB com 4 tabs (Chat / Relatorios e avisos / Historico de
 * acoes / Preferencias) — os testids e a estrutura mudaram completamente. Estes
 * cenarios NAO tem equivalente direto no hub novo. Os testes do hub vivem em
 * tests/coach/ai-0b/coach-ai-hub.test.tsx.
 *
 * Mantidos como skip (em vez de deletados) para historico/rastreabilidade. Se
 * uma feature equivalente for re-introduzida no hub (ex: LimitCounter no header
 * do hub na Fase 1), reescrever o cenario apontando para o testid novo.
 */

import { describe, it, expect } from 'vitest';

describe.skip('CoachAI (pre-Sprint-AI-0B) — low-remaining-toast: suite desativada apos reforma do hub', () => {
  it('reforma do hub Grindfy AI superou estes cenarios — ver tests/coach/ai-0b/coach-ai-hub.test.tsx', () => {
    expect(true).toBe(true);
  });
});
