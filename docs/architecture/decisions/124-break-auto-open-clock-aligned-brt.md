# ADR-124: Break Auto-Open clock-aligned em America/Sao_Paulo (BRT) com toggle persistente

## Status

Aceito

## Data

2026-05-05

## Contexto

A Spec `Docs/specs/grind-live-break-auto-open.md` introduz auto-abertura do `BreakFeedbackPopup` em `XX:54` e auto-fechamento em `XX:02` durante sessoes ativas em `/grind-live`, substituindo o trigger manual via banner FP-07 (regressao silenciosa do auto-open antigo). A pergunta arquitetural eh: **qual relogio usar como referencia, e onde manter o estado do toggle**.

Forcas em jogo:

- **Heterogeneidade de fuso dos jogadores**: o publico Grindfy eh majoritariamente brasileiro mas inclui jogadores expatriados (EU, Asia). Um relogio ancorado no `Date()` local do browser produziria `XX:54` em horarios distintos para cada user, desalinhando do break real dos torneios.
- **Calendario das principais redes (Stars, GG, ACR/WPN, PartyPoker, Chico)**: torneios MTT publicados nas plataformas usam horario brasileiro como referencia comum dos jogadores brasileiros (mesmo quando o site de origem mostra ET). Break natural cai entre minuto 55 e 02 da hora seguinte, em horario BRT.
- **Server time vs client time**: server time exigiria push (WebSocket) ou polling para sincronizar, com custo de infra e latencia. O break trigger eh local, sem necessidade de coordenacao multi-cliente.
- **Brasil sem DST desde 2019**: `America/Sao_Paulo` = UTC-3 ano todo. Sem DST switching, o offset eh estavel — implementacao via `Intl.DateTimeFormat` ou `toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })` retorna hora/minuto BRT consistentes.
- **Persistencia do toggle**: o toggle nao pode ser apenas in-memory — usuario que recarrega `/grind-live` espera que escolha permaneca. Tambem deve sobreviver a multiplas sessoes ate ser explicitamente alterado.
- **Drift do interval 30s**: check em `setInterval(..., 30000)` pode pegar `minute === 54` em segundos `0..30` ou `30..60`. Sem dedupe, o modal poderia abrir, ser fechado e re-abrir dentro da mesma janela de 1 minuto.
- **Padrao de toggles ja estabelecido**: `bankrollManagementEnabled`, `lateRegAlertEnabled` ja vivem em `user_settings` com PATCH otimista `/api/user-settings`. Reuso maximo desse padrao eh esperado.

Pre-requisitos satisfeitos:

- Tabela `user_settings` ja existe (ADR-008 e correlatos).
- Mutation pattern PATCH otimista + rollback ja implementado para `bankrollManagementEnabled` (ver `session_2026-05-05-bankroll-reform.md`).
- `BreakFeedbackPopup` componente existe com slider, textarea e botao "Pular Todos os Breaks Hoje".
- `setInterval` 30s ja roda em `GrindSessionLive.tsx` linhas 1168-1222 para banner FP-07 (timer relativo).
- `Intl.DateTimeFormat` disponivel em todos os browsers suportados (Chrome, Firefox, Safari modernos).

## Decisao

Adotar **relogio fixo `America/Sao_Paulo` (BRT)** como referencia unica para os triggers `XX:54` (open) e `XX:02-XX:06` (close), com **toggle persistente em `user_settings.break_auto_open_enabled` (boolean DEFAULT true NOT NULL)** e **dedupe via hour key formato `YYYY-MM-DD-HH` em BRT** armazenada em `useRef`.

Especificacao tecnica:

1. **Migration `0050_break_auto_open_enabled.sql`** adiciona coluna `break_auto_open_enabled BOOLEAN DEFAULT true NOT NULL` em `user_settings`. Schema Drizzle estende `userSettings` com `breakAutoOpenEnabled: boolean("break_auto_open_enabled").default(true).notNull()`.

2. **Helpers puros em `client/src/components/grind-session/break-clock-helpers.ts`** (modulo isolado, 100% testavel sem React):
   - `getCurrentHourKey(date: Date, tz?: string): string` — retorna `YYYY-MM-DD-HH` em BRT (default `America/Sao_Paulo`).
   - `getBrtMinute(date: Date): number` — retorna minuto `0..59` no fuso BRT.
   - `shouldAutoOpenAtClock(now: Date, lastTriggerHourKey: string | null): boolean` — true se `getBrtMinute(now) === 54` E `getCurrentHourKey(now) !== lastTriggerHourKey`.
   - `shouldAutoCloseAtClock(now: Date, openedAt: Date): boolean` — true se BRT minute esta na janela `[2, 6)`. Janela 4 min eh tolerancia para guards de interacao retentarem.
   - `isInteractingWithModal(lastSliderInteractionAt: number, isInTextarea: boolean): boolean` — true se `Date.now() - lastSliderInteractionAt < 30000` OU `isInTextarea === true`.

3. **`useEffect` dedicado em `GrindSessionLive.tsx`** separado do `useEffect` FP-07 atual, com guard `if (!breakAutoOpenEnabled) return;`. Interval 30s reusa cadencia existente OU novo interval dedicado (preferencia: novo, para isolamento).

4. **Refs (sem re-render)**:
   - `lastTriggerHourKey: useRef<string | null>(null)` — atualizada para `getCurrentHourKey(now)` quando dispara open.
   - `wasAutoOpened: useRef<boolean>(false)` — true quando open veio do clock; false quando veio de banner manual. Limpada em close manual, submit, "Pular Todos", auto-close.
   - `lastSliderInteractionAt: useRef<number>(0)` — atualizada via callback `onSliderInteraction` propagado ao `BreakFeedbackPopup`.

5. **Toggle UI** = `<Switch>` shadcn no header de `/grind-live`, ordem `[Breaks] [Switch Auto-Break] [Pausar]`. Estado inicial = `userAlertSettings.breakAutoOpenEnabled`. Click dispara mutation otimista PATCH `/api/user-settings { breakAutoOpenEnabled: bool }` reaproveitando o handler de `bankrollManagementEnabled`. Tooltip: "Abre o feedback de break automaticamente as XX:54 e fecha as XX:02."

6. **"Pular Todos os Breaks Hoje"** dentro do popup propaga callback ao parent que dispara o mesmo PATCH com `{ breakAutoOpenEnabled: false }`, alem do comportamento existente de `skipBreaksToday = true`.

7. **Coexistencia com banner FP-07**: quando auto-open dispara, parent chama `setShowBreakBanner(false) + setBreakBannerActive(false)` para suprimir banner da hora corrente. Banner permanece funcional quando toggle OFF (zero regressao).

`Intl.DateTimeFormat` eh a primitiva de extracao de hora/minuto BRT:

```ts
const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
});
const parts = formatter.formatToParts(now);
// extrai year/month/day/hour/minute -> compoe key + minuto
```

Helpers recebem `Date` e timezone como parametros para serem testaveis com qualquer momento (ex: `new Date('2026-05-05T17:54:15Z')` -> BRT minute 54).

## Opcoes Consideradas

### Opcao 1 (escolhida): Clock-aligned BRT fixo + toggle persistente em `user_settings`

- **Pros:**
  - **Alinhamento com break real dos torneios brasileiros**: `XX:54/XX:02` BRT casa com janela natural dos MTTs nas redes principais para o publico majoritario (BR).
  - **Brasil sem DST**: offset estavel (UTC-3 ano todo). Sem switching, sem ambiguidade.
  - **Helpers puros 100% testaveis**: TDD-friendly. Date injetada como parametro, sem dependencia de `Date.now()` global.
  - **Dedupe via `YYYY-MM-DD-HH`**: previne re-open quando interval pega minute=54 duas vezes na mesma hora (ex: 54:05 e 54:35). Tambem cobre virada de dia (`14:54` ontem != `14:54` hoje).
  - **`useRef` em vez de `useState`**: nao causa re-render, nao polui ciclo React.
  - **Persistencia em `user_settings`**: pattern estabelecido (`bankrollManagementEnabled`, `lateRegAlertEnabled`). Reuso de mutation otimista existente.
  - **Default `true`**: feature ativa para todos, opt-out explicito via toggle ou "Pular Todos".
  - **Coexistencia com FP-07**: zero regressao quando toggle OFF.
  - **Sem rede**: 100% client-side timer + 1 PATCH por toggle change.

- **Contras:**
  - **Usuarios expatriados (EU, Asia) precisam de mental mapping de fuso**: jogador em Lisboa ve modal abrindo em `XX:54` BRT que para ele eh hora local diferente. Mitigacao: tooltip explicita `XX:54/XX:02` (BRT implicito); se demanda crescer, Sprint futura adiciona configuracao de fuso (out-of-scope MVP).
  - **`XX:54/XX:02` hardcoded sem UI para customizar**: jogadores que jogam redes com break em `XX:55/XX:05` ou diferentes nao podem ajustar. Out-of-scope MVP — feedback do founder validara se demanda existe.
  - **Drift do interval 30s**: sem dedupe explicito, modal poderia ser re-aberto ao detectar `minute === 54` em duas execucoes consecutivas. Mitigado pelo dedupe key `YYYY-MM-DD-HH`.

### Opcao 2: Browser local time (`new Date().getHours()/getMinutes()`)

- **Pros:**
  - **Trivial**: zero dependencia de `Intl.DateTimeFormat` ou timezone string.
  - **Helpers minimo**: 5 linhas.

- **Contras:**
  - **Desalinhamento para users em fusos diferentes**: jogador BR em Lisboa receberia modal em hora diferente do break real dos torneios (porque `getHours()` retorna hora local de Lisboa).
  - **Impossivel justificar `XX:54/XX:02`**: o numero perde significado (porque break real dos torneios eh ancorado em horario BR, nao no browser).
  - **Founder-feedback assume BR como denominador comum**: requirement explicito em D-Time-Zone da spec.
  - **Rejeitada:** quebra premissa central da feature (alinhamento ao break real dos torneios).

### Opcao 3: Server time push via WebSocket / SSE

- **Pros:**
  - **Garantia de sincronizacao**: server time eh source of truth absoluto.
  - **Configuracao server-side**: trocar `XX:54` para `XX:55` seria 1 linha sem deploy de cliente.

- **Contras:**
  - **Overengineering**: nenhuma coordenacao multi-cliente eh necessaria. Cada user tem seu proprio modal, totalmente local.
  - **Custo de infra**: WebSocket persistente para signaling de tempo eh desproporcional ao problema (cron simples no client cobre 100%).
  - **Latencia / falhas de rede**: trigger ficaria sujeito a hiccups de conexao. Modal poderia abrir em `XX:54:05` em users com latencia OK e `XX:54:45` em outros, criando inconsistencia visual desnecessaria.
  - **Push ja eh anti-pattern para timer simples**: `Intl.DateTimeFormat` resolve com 0 dependencias.
  - **Rejeitada:** complexidade injustificada.

### Opcao 4: Configuracao por user (escolher fuso horario + horario do break)

- **Pros:**
  - **Maxima flexibilidade**: user expatriado configura fuso, user que joga rede X configura `XX:55/XX:05`.
  - **Escala para outras redes/regioes** sem novos deploys.

- **Contras:**
  - **Out-of-scope MVP**: spec define hardcoded `XX:54/XX:02` BRT explicitamente. Founder priorizou simplicidade da v1.
  - **UI extra**: campo de timezone + 2 campos de minuto (open/close) + validacao + tooltip. Multiplica esforco da feature.
  - **Discoverability ruim em v1**: maioria dos users nao tocaria configuracao default e teria mesma experiencia que Opcao 1 com mais friccao.
  - **Pode ser adicionada futuramente**: sem custo de migracao porque schema atual (`break_auto_open_enabled` boolean) eh trivialmente extensivel via `break_auto_open_config jsonb` em sprint futura.
  - **Rejeitada:** scope creep; reverter futuramente eh facil.

### Opcao 5: Toggle in-memory (sem persistir)

- **Pros:**
  - **Sem migration**: zero schema delta.
  - **Mais simples**: state local React.

- **Contras:**
  - **User perde escolha em refresh/nova sessao**: forca opt-out toda hora, anti-UX.
  - **Inconsistente com padrao do projeto** (`bankrollManagementEnabled`, `lateRegAlertEnabled` ja persistem).
  - **"Pular Todos os Breaks Hoje" perderia efeito persistente**: queremos que escolha sobreviva ate dia seguinte.
  - **Rejeitada:** quebra UX e convencao do projeto.

## Consequencias

### Positivas

- **Predictability total**: `XX:54` open + `XX:02` close BRT, fixo, ano todo (sem DST).
- **Alinhamento com break real dos torneios**: trigger casa com janela natural dos MTTs brasileiros.
- **Helpers puros TDD-friendly**: cobertura 100% sem mockar `Date.now()` global.
- **Zero rede para o timer**: 100% client-side, 1 PATCH apenas em toggle change.
- **Padrao reusado**: PATCH otimista `/api/user-settings` ja conhecido por outros toggles. Implementer reaproveita.
- **Default ON via DB DEFAULT**: usuarios existentes ganham `true` automaticamente (back-fill nativo via migration).
- **Dedupe robusto**: `YYYY-MM-DD-HH` key cobre drift de interval, virada de hora, virada de dia.
- **`useRef` para flags transientes**: zero re-render parasita.
- **Coexistencia limpa com banner FP-07**: toggle OFF mantem comportamento atual 100%; toggle ON suprime banner quando auto-open dispara.
- **Reativacao explicita**: "Pular Todos os Breaks Hoje" desliga toggle persistente, user reativa quando quiser.

### Negativas

- **Users em fusos nao-brasileiros precisam mental mapping**: documentado em tooltip + spec marca como out-of-scope MVP. Mitigado se demanda crescer (Opcao 4).
- **`XX:54/XX:02` nao customizavel**: redes com break em outros minutos (raro) ficam sem auto-open ajustado. Spec out-of-scope MVP.
- **Migration nova exige `db:push`**: custo unico, baixa complexidade.
- **Janela de auto-close 4 min (`[02, 06)`)**: usuario interagindo continuamente por mais de 4 min apos `XX:02` tem modal forcadamente fechado. Mitigado pela escolha de janela e pelo toast obrigatorio explicativo.

### Neutras

- **Default `true` para todos**: feature visivel imediatamente pos-deploy. Rollback via toggle individual ou sprint de hotfix se feedback negativo.
- **`useRef` vs `useState`**: decisao deliberada para evitar re-render — registrar como pattern em `lessons-learned.md` se for replicado.
- **Hour key inclui dia (`YYYY-MM-DD-HH`)**: aceita custo trivial de string mais longa em troca de cobertura de virada de dia sem branch.
- **`Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo' })`**: locale `en-US` escolhido por estabilidade do format string (sem variantes pt-BR de mes/dia). Apenas `formatToParts` eh usado, locale eh irrelevante para o output numerico.

## Confianca

**Alta.** Feature pequena, escopo claro, 100% client-side. Helpers puros sao trivialmente testaveis (`getCurrentHourKey(new Date('2026-05-05T17:54:15Z'))` = `'2026-05-05-14'`). Padrao de toggle persistente esta estabelecido (3 toggles anteriores em `user_settings`). Intl.DateTimeFormat tem 100% de suporte nos browsers alvo. Risco principal (drift do interval) tem mitigacao concreta (dedupe key). Decisao de fuso fixo BR eh respaldada explicitamente pelo founder e pela natureza do publico.

## Referencias

- Spec: `Docs/specs/grind-live-break-auto-open.md`
- ADR-008: late-reg-alerts-architecture (padrao de toggle em `user_settings`)
- ADR-038: optimistic concurrency (padrao mutation otimista)
- ADR-061: fxResolver (cache 5min em-memoria, padrao de invalidate)
- Lesson #1 (CLAUDE.md secao 9): hooks primeiro, sem early return antes de hooks
- Lesson #2 (CLAUDE.md secao 9): tests com `data-testid` estavel
- Lesson #13 (CLAUDE.md secao 9): `apiRequest` retorna JSON parseado direto
- Helpers: `client/src/components/grind-session/break-clock-helpers.ts` (novo)
- Componente alterado: `client/src/pages/GrindSessionLive.tsx`
- Componente alterado: `client/src/components/BreakFeedbackPopup.tsx`
- Migration: `migrations/0050_break_auto_open_enabled.sql` (novo)
- Schema: `shared/schema.ts` (extensao `userSettings.breakAutoOpenEnabled`)
- Diagrama: `Docs/architecture/flows/grind-live-break-auto-open/sequence.mermaid`
