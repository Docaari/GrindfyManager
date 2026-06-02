# 238 — Coach AI UX Overhaul (12 melhorias UX + gaps técnicos)

> Numerado 238: 236 e 237 foram ocupados pela sessão paralela Fase D/F (BRM/RoR + game-selection).

- Status: Accepted
- Data: 2026-06-02
- Contexto de origem: auditoria UX (strategist) + mapeamento de código do Coach AI (chat + relatórios + proatividade).

## Contexto

O Coach AI estava tecnicamente maduro (18 tools, 4 tipos de relatório, 8 nudges, memória estruturada) mas **vazava valor na superfície**: tools invisíveis ao jogador, loop diagnóstico→ação não fechava na UI, sem accountability contínua. A auditoria produziu 12 melhorias priorizadas por ICE + 6 gaps técnicos. Founder pediu execução completa em waves.

Trabalho isolado em git worktree (`feature/coach-ai-ux-overhaul`) em paralelo à Fase D (bankroll/stop-loss) — boundaries disjuntas (domínio coach vs bankroll), migrations coordenadas (0092-0093 coach; Fase D 0094+).

## Decisão

Implementado em 5 waves (ordem ICE) + integração:

**Wave 1 — UX quick wins (frontend):**
- #4 trocar de lente NÃO limpa o input digitado.
- #3 empty-state + quick suggestions orientados a AÇÃO (monta grade, registra foco, leaks, ROI vs field) — torna tools descobríveis.
- #11 lente ativa muda placeholder + chips sob medida (`?lens=` no endpoint + `ctx.lens` em `computeSuggestions`, cache por lente; fonte client `lib/coachLensMeta.ts`).

**Wave 2 — aha moment + loop de ação:**
- #2 onboarding termina com 1º insight personalizado (cria 1ª sessão de chat + mensagem determinística com perfil/nível/foco, navega `?session=`).
- #1 CTAs acionáveis na timeline (`CoachReportCtaButtons` compartilhado; timeline endpoint expõe top-2 `content.cta`).
- #12 daily debrief inteligente — suprime quando `< COACH_DAILY_DEBRIEF_MIN_TOURNAMENTS` (default 1) **E** sem follow-up aberto (preserva loop de leak focus). `result.suppressed` → job `skipped`.

**Wave 3 — conversão + proatividade completa:**
- #6 teaser de tool no Free (`buildFreeToolTeaser` detecta intenção, anexa upsell `/subscriptions`).
- #7 ticks B-MENTAL (C-game recorrente via `getAbGameDistribution`, 20h local) + B-LIFE (volume ≥6/7 dias via `getGrindSessions`, 11h local), opt-in (toggle default false). Sem migration (cols já na 0024).
- GAP-quarterly: `deliverReport` agora trata quarterly (in-app + chat + email).

**Wave 4 — memória + accountability (big bets):**
- #9 perfil estruturado editável (`GET/PUT /api/coach/structured-profile` + `CoachKnowledgePanel`).
- #8 loop de accountability: tabela `coach_commitments` (migration 0092) + tool `log_commitment` + tick B-FOLLOWUP (cobra no vencimento, dedup via `followedUpAt`) + bloco "Compromissos abertos" no contexto. Categoria B-FOLLOWUP (toggle `nudge_b_followup` default true).
- #10 benchmark vs população: bloco de contexto ativa `query_pool_intelligence` (seed BR 0070) quando seeded.

**Wave 5 — gaps técnicos:**
- #5 dedup de elegibilidade: `reportJobRunner` delega a `planEligibility.resolveEligiblePlanTier` (fonte única).
- Auditados e já corretos: #1 abort/state-machine, #2 recordUsage separado, #4 parser graceful, #3 back-fill idempotente.

## Decisões de design

- **#12 suppression semantics**: contrato alterado (0-torneios sem follow-up não vira debrief). Default conservador via env; `=0` restaura o antigo. Legacy test atualizado + caso de back-compat.
- **#11 lens-aware via endpoint (não client-only)**: mantém o endpoint como fonte primária (testes legados que mockam o endpoint continuam verdes), lente injetada via `ctx.lens` + fallback client lens-aware.
- **#8 B-FOLLOWUP default true**: o jogador se comprometeu explicitamente → cobrar é esperado (≠ B-MENTAL/B-LIFE opt-in).
- **#1 testId prop** em `CoachReportCtaButtons` p/ preservar `weekly-report-cta` (suite legada) + `coach-report-cta` na timeline.

## Migrations

- **0092** (`coach_commitments` + `nudge_b_followup`): APLICADA LOCAL, PENDENTE PROD (Neon, no deploy).
- #7 NÃO precisou de migration (`nudge_b_life`/`nudge_b_mental` já na 0024).

## Envs novas

`COACH_DAILY_DEBRIEF_MIN_TOURNAMENTS` (1), `COACH_BMENTAL_CGAME_MIN` (2), `COACH_BLIFE_DAYS_MIN` (6).

## Consequências

- Tools descobríveis (empty-state + lente + teaser Free) → maior ativação + conversão.
- Loop diagnóstico→ação fecha na UI (CTAs na timeline).
- Accountability contínua (commitments + follow-up) → de chatbot para coach.
- Proatividade completa (B-MENTAL/B-LIFE/B-FOLLOWUP) sem promessa quebrada.
- Quarterly com entrega tripla (paridade com weekly/monthly).

## Pendências

- Aplicar 0092 em PROD no deploy.
- Verify browser (extensão off na sessão).
- #10 é MVP (ativa a tool no contexto); benchmark numérico personalizado por stake = fase 2.
- UI toggle de `nudge_b_followup` em `CoachPreferencesPanel` (default true funciona sem UI).
