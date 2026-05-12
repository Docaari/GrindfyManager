# Diagramas — Sprint AI-0B (Consolidação Grindfy AI)

Diagramas Mermaid do Sprint AI-0B: consolidação dos 3 coaches num agente único, page context plugado de fato + expandido, hub `/coach-ai`.

| Arquivo | O que mostra | ADR |
|---|---|---|
| `system-prompt-structure.mermaid` | Estrutura do system prompt unificado: bloco STATIC cacheado (idêntico p/ todo `coachType`) + bloco DYNAMIC (linha de lente — única coisa que varia — + grind + feedbacks + leaks + weekly + study + page context). Anota a quebra única de cache. | ADR-148, ADR-019, ADR-147 §3 |
| `page-context-flow.mermaid` | Fluxo do page context: frontend (`useCoachPageContext`) → body do POST → `handleCoachChat` (`sanitizePageContext`, 400 se inválido) → `assembleContext` (`getPageContext` loader) → `buildPageContextSection` → bloco DYNAMIC. 10 variantes (5 originais + 5 novas: bankroll, estudos, stats, biblioteca, upload). Princípio "inspeção leve, não dump — números vêm das tools". | ADR-149, ADR-025 |
| `coach-ai-overview.mermaid` | Visão geral do Grindfy AI consolidado (substitui o C4 de 3 coaches de `ai-coach/c4-component.md`): frontend (hub, MiniChat, chips de lente, `useCoachPageContext`, audit/prefs panels) → backend (route sem `403 tier_locked`, `coachAccess` só rate limit + tools, `coachPageContext` 10 variantes, `coachContext` loaders genéricos, `coachSystemBuilder` base único, tools inalteradas) → externos (Sonnet 4.6 c/ cache, Haiku 4.5, PG/Neon zero migração). | ADR-148, ADR-149, ADR-150 |
| `coach-ai-hub-wireframe.mermaid` | Wireframe do hub `/coach-ai`: tabs URL-persisted `?tab=chat|reports|audit|prefs` (default `chat`). Chat (funcional — chips de lente, page context), Relatórios e avisos (esqueleto/EmptyState — não funcional), Histórico de ações (`CoachAuditPanel` — `GET /api/coach/audit`), Preferências (`CoachPreferencesPanel` — `GET/PUT /api/coach/preferences`, 8 toggles). | ADR-150, ADR-125 |

## Diagramas defasados (superseded por estes)

- `Docs/architecture/ai-coach/c4-component.md` — mostra 3 coaches separados + 3 context loaders (`buildMentalContext`/`buildTournamentContext`/`buildTechnicalContext`) + 3 system prompts. **Superseded** por `coach-ai-overview.mermaid` (agente único, contexto completo, lente inicial). Cabeçalho de aviso adicionado no arquivo.
- `Docs/architecture/ai-coach/sequence-diagrams.md` — diagrama "Envio de Mensagem" mostra `getXxxPrompt(coachType)` por coach + queries de stats "por coachType". **Superseded** por `page-context-flow.mermaid` (e pela estrutura de `system-prompt-structure.mermaid`). Cabeçalho de aviso adicionado.
- `Docs/architecture/ai-coach/adr-001-llm-provider.md` / `adr-002-memory-architecture.md` — descrevem "3 coaches especializados" / "compartilhado entre os 3 coaches". **Emendados** por ADR-148 (a separação de personas é superseded; o agente é único; o `user_ai_profile` continua sendo memória compartilhada — agora de um agente só).
