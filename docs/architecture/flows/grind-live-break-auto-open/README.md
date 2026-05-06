# Flow: Grind-Live Break Auto-Open (clock-aligned BRT)

## O que faz

Adiciona toggle persistente em `/grind-live` que, quando ON, abre automaticamente o `BreakFeedbackPopup` em `XX:54` (relogio BRT) e fecha em `XX:02` (~8 min depois). Quando OFF, mantem comportamento atual de banner FP-07 + clique manual. Resolve regressao silenciosa do trigger automatico em que o banner aparecia mas o modal nao abria sozinho. Alinha o trigger ao break natural dos MTTs em horario brasileiro (calendario das principais redes — Stars, GG, ACR/WPN, PartyPoker, Chico — usa BRT como referencia comum dos jogadores brasileiros).

## Componentes envolvidos

- **`client/src/pages/GrindSessionLive.tsx`** — orquestrador. Renderiza Switch shadcn no header (entre Breaks e Pausar), mantem `useRef` de `lastTriggerHourKey`, `wasAutoOpened`, `lastSliderInteractionAt`, e roda `useEffect` dedicado com `setInterval` 30s para checagens BRT XX:54 / XX:02.
- **`client/src/components/grind-session/break-clock-helpers.ts`** (novo) — modulo puro de helpers de tempo (`getCurrentHourKey`, `getBrtMinute`, `shouldAutoOpenAtClock`, `shouldAutoCloseAtClock`, `isInteractingWithModal`). 100% testavel via Date injetada como parametro, sem dependencia de `Date.now()` global.
- **`client/src/components/BreakFeedbackPopup.tsx`** — recebe novas props opcionais `onSliderInteraction?: () => void` (chamado em slider/quick-score change) e `wasAutoOpened?: boolean`. Sem mudancas visuais. Botao "Pular Todos os Breaks Hoje" propaga callback ao parent que tambem persiste toggle OFF.
- **`shared/schema.ts`** — extensao da tabela `userSettings` com coluna `breakAutoOpenEnabled: boolean("break_auto_open_enabled").default(true).notNull()`.
- **`migrations/0050_break_auto_open_enabled.sql`** (novo) — migration drizzle-kit que cria a coluna com default true. Back-fill nativo via DEFAULT cobre usuarios existentes.
- **PATCH `/api/user-settings`** (existente) — aceita campo novo `breakAutoOpenEnabled: boolean`. Reaproveita mutation otimista pattern (`bankrollManagementEnabled`, `lateRegAlertEnabled`).

## Onde estao os helpers puros

`client/src/components/grind-session/break-clock-helpers.ts` (a ser criado pelo implementer apos test-writer escrever testes red-phase). Recebem `Date` e timezone como parametros para isolar logica de tempo de side-effects React. Cobertura esperada: 100% via Vitest unit tests com Dates conhecidas (`new Date('2026-05-05T17:54:15Z')` -> BRT minute 54, hour key `'2026-05-05-14'`).

## Decisao chave

Relogio fixo `America/Sao_Paulo` (BRT, UTC-3 sem DST) como referencia unica, com dedupe via hour key `YYYY-MM-DD-HH`. Justificativa completa em [ADR-124](../../decisions/124-break-auto-open-clock-aligned-brt.md).

## Fluxos cobertos no diagrama

Ver `sequence.mermaid` neste mesmo diretorio. Cobre 4 fluxos:

1. **Toggle ON click + persist** — PATCH otimista com rollback em erro.
2. **Auto-open em XX:54 BRT** — interval 30s -> helpers -> setShowBreakDialog + suprime banner FP-07.
3. **Auto-close em XX:02 BRT com guards** — verifica `isInteractingWithModal` -> close OR retentar (limite 4 min) -> toast obrigatorio.
4. **"Pular Todos os Breaks Hoje" -> persiste OFF** — PATCH disparado de dentro do modal + toggle UI vira OFF otimista.

## Links

- Spec: [`Docs/specs/grind-live-break-auto-open.md`](../../../specs/grind-live-break-auto-open.md)
- ADR: [`Docs/architecture/decisions/124-break-auto-open-clock-aligned-brt.md`](../../decisions/124-break-auto-open-clock-aligned-brt.md)
- Diagrama: [`sequence.mermaid`](sequence.mermaid)

## Cenarios de Teste Derivados

Spec ja lista cenarios completos (secao "Cenarios de Teste Derivados"). Resumo dos grupos para o test-writer:

- Happy Path (4 cenarios): toggle ON + XX:54 abre, XX:02 fecha, submit antes de XX:02, banner manual nao auto-fecha.
- Validacao de Estado (4): toggle invisivel sem activeSession, estado inicial reflete user_settings, click otimista, rollback em erro.
- Dedupe / Drift (4): mesma hora nao re-abre, virada de hora dispara, virada de dia dispara, edge case 54:55.
- Guards (5): isPaused, skipBreaksToday, activeSession.skipBreaksToday, showBreakDialog ja aberto, toggle OFF.
- Auto-close Edge Cases (6): textarea focused, sai do textarea, slider <30s, slider >30s, forca close em XX:06, modal manual em hora seguinte.
- Coexistencia FP-07 (3): suprime banner, OFF preserva FP-07, ambos ativos clock vence.
- "Pular Todos" (5): PATCH dispara, toggle vira OFF, hora seguinte nao abre, persiste em sessao nova, rollback em erro.
- Migration / Default (3): user existente nasce true, user novo nasce true, PATCH false persiste.
