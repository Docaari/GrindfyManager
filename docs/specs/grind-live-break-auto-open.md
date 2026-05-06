# Spec: Grind-Live Break Auto-Open (clock-aligned)

## Status
Proposta

## Resumo
Adicionar toggle visivel em `/grind-live` que, quando ON, abre automaticamente o `BreakFeedbackPopup` em **XX:54** (relogio real) e fecha em **XX:02** (~8 min). Quando OFF, mantem o comportamento atual de banner FP-07 + clique manual. Persiste em `user_settings`, default ON. Resolve regressao silenciosa do trigger automatico (banner aparece, modal nao).

## Contexto
- Hoje (`GrindSessionLive.tsx` linhas 1164–1222): timer relativo ao inicio da sessao usa `breakFrequency` (default 60min); quando dispara, mostra apenas o **banner FP-07** (`setShowBreakBanner(true)` + `setBreakBannerActive(true)`). Modal so abre se o user clica "Responder Agora" (`handleBreakRespond` linha 1243).
- Bug reportado pelo founder: "Feedbacks Breaks pararam de aparecer durante os breaks" — provavel regressao do auto-open antigo (modal abria sozinho), perdido em algum refactor pos-FP-07.
- Founder quer alinhar breaks ao **relogio real** (XX:54 / XX:02) porque coincide com o intervalo natural entre tabelas de torneios (most MTTs entram em break do minuto 55 ate 02 da hora seguinte).
- Tudo ja existe: schema `user_settings`, padrao de toggle persistente (`bankrollManagementEnabled`, `lateRegAlertEnabled`), `BreakFeedbackPopup` componente, mutation `breakFeedbackMutation`. Reuso maximo.

## Usuarios
- **Jogador profissional MTT em sessao /grind-live ativa**: quer que o feedback de break dispare sozinho no horario natural de break dos torneios, sem precisar clicar banner.

## Requisitos Funcionais

### RF-01: Toggle visivel na pagina /grind-live
**Descricao:** Switch shadcn posicionado no header **entre o botao "Breaks" (esquerda) e o botao "Pausar" (direita)**. Ordem: `[Breaks] [Switch Auto-Break ON/OFF] [Pausar]`. Label curto "Auto-Break" + estado visual (ON verde / OFF cinza).
**Regras de negocio:**
- Visivel apenas se `activeSession` existe (sem sessao ativa, nao renderizar).
- Estado inicial = `userAlertSettings.breakAutoOpenEnabled` (default `true`).
- Click alterna estado e dispara mutation PATCH `/api/user-settings` (padrao existente — ver `bankrollManagementEnabled`).
- Mudanca otimista: UI atualiza imediato, rollback se mutation falha.
- Tooltip on hover: "Abre o feedback de break automaticamente as XX:54 e fecha as XX:02."
**Criterio de aceitacao:**
- [ ] Toggle renderiza somente com `activeSession` ativa.
- [ ] Estado inicial reflete `userAlertSettings.breakAutoOpenEnabled` (true para usuarios novos).
- [ ] Clicar dispara PATCH e atualiza UI otimista.
- [ ] Tooltip aparece em hover.

### RF-02: Auto-open as XX:54 quando ON
**Descricao:** Quando `breakAutoOpenEnabled === true` e ha `activeSession`, abrir `BreakFeedbackPopup` (`setShowBreakDialog(true)`) automaticamente quando o relogio real bate `minute === 54`.
**Regras de negocio:**
- Check roda no `setInterval` ja existente (30s) ou em interval dedicado novo (preferencia: novo `useEffect` + interval 30s para nao misturar com timer relativo).
- Dedupe via `useRef<number>` armazenando `lastTriggerHourKey` (formato `YYYY-MM-DD-HH`); so dispara se `lastTriggerHourKey !== currentHourKey` E `minute === 54`.
- Usa horario LOCAL do browser (`new Date().getHours() / .getMinutes()`).
- NAO dispara se: `isPaused === true`, `skipBreaksToday === true`, `activeSession.skipBreaksToday === true`, OU `showBreakDialog === true` (ja esta aberto).
- Quando dispara, tambem suprime o banner FP-07 da hora corrente (`setShowBreakBanner(false)`, `setBreakBannerActive(false)`) para nao haver redundancia visual.
**Criterio de aceitacao:**
- [ ] Modal abre exatamente uma vez por hora real quando minute === 54.
- [ ] Nao re-dispara dentro da mesma hora (ex.: check 54:00 e 54:30 — abre so na primeira).
- [ ] Nao dispara se sessao pausada (verificacao `isPaused`).
- [ ] Nao dispara se `skipBreaksToday` ativo.
- [ ] Nao dispara se modal ja aberto.
- [ ] Banner FP-07 da mesma hora suprimido quando auto-open dispara.

### RF-03: Auto-close as XX:02 quando aberto via auto-open
**Descricao:** Modal aberto automaticamente fecha sozinho quando relogio bate `minute >= 2 && minute < 4` (janela de tolerancia 2 min).
**Regras de negocio:**
- Check no mesmo interval do RF-02.
- So fecha modais que foram abertos via auto-open (flag `wasAutoOpened`, `useRef<boolean>` setado em RF-02 e limpo em close manual / submit).
- **NAO fecha** se user esta interagindo: foco em textarea (`isInTextarea` ja existe em BreakFeedbackPopup) OU teve mudanca de slider nos ultimos 30s (novo flag exposto via callback).
  - Se nao puder fechar por interacao, retentar a cada 30s ate sair da interacao OU ate dar 4 min apos XX:02 (ai forca fechar).
- Fechar = `setShowBreakDialog(false)` SEM submit. Feedback nao salvo eh perdido.
- **Toast obrigatorio no auto-close** (sempre, independente de ter input ou nao): "Break finalizado. Voce pode registrar manualmente em Gerenciar Breaks." (variant=default, duration=5s).
**Criterio de aceitacao:**
- [ ] Modal aberto via auto-open fecha quando minute === 2 (com tolerancia ate 4).
- [ ] Modal aberto manualmente (clique no banner) NAO fecha sozinho.
- [ ] Se user esta digitando em textarea no momento do close, nao fecha.
- [ ] Se ultimos 30s teve mudanca de slider, nao fecha.
- [ ] Apos 4 min de tolerancia (XX:06), forca close mesmo com interacao.

### RF-04: Coexistencia toggle ON/OFF com banner FP-07
**Descricao:** Quando toggle OFF, comportamento atual mantido 100%: timer relativo + banner FP-07 + clique manual abre modal. Quando ON, auto-open por relogio substitui o trigger.
**Regras de negocio:**
- ON: banner FP-07 ainda pode aparecer (ex.: 5 min antes do break relativo), mas se XX:54 chega antes, auto-open dispara e banner eh limpo.
- ON: clicar manualmente "Responder Agora" no banner ainda funciona (nao bloquear). Marca `wasAutoOpened = false` para nao auto-fechar em XX:02.
- OFF: timer XX:54/XX:02 nao roda (skip do `useEffect` via guard).
**Criterio de aceitacao:**
- [ ] Toggle OFF: banner FP-07 funciona como hoje (zero regressao).
- [ ] Toggle ON: clique manual no banner abre modal e modal NAO auto-fecha em XX:02.
- [ ] Toggle ON: se XX:54 dispara antes do banner FP-07 da hora corrente, banner eh suprimido.

### RF-05: "Pular Todos os Breaks Hoje" desliga toggle persistente
**Descricao:** Click em "Pular Todos os Breaks Hoje" dentro do `BreakFeedbackPopup` (linha 433 do componente) deve, alem do comportamento atual (`skipBreaksToday = true`), tambem **persistir `breakAutoOpenEnabled = false` em user_settings** via PATCH. Toggle UI passa a exibir OFF.
**Regras de negocio:**
- `skipBreaksToday` continua existindo como guard em memoria.
- Adicionalmente: dispara mutation PATCH `/api/user-settings { breakAutoOpenEnabled: false }`.
- Toggle UI atualiza otimista para OFF imediatamente.
- Toast confirma: "Auto-Break desativado. Reative quando quiser via toggle."
- Para reativar, user precisa clicar manualmente no toggle (sem reset automatico).
**Criterio de aceitacao:**
- [ ] Click "Pular Todos" dispara PATCH com `breakAutoOpenEnabled: false`.
- [ ] Toggle UI muda de ON para OFF instantaneamente (otimista).
- [ ] No proximo dia / proxima sessao, toggle continua OFF ate user reativar.
- [ ] PATCH falha — rollback do toggle + toast erro.

### RF-06: Default ON para usuarios existentes
**Descricao:** Migration SQL adiciona coluna `break_auto_open_enabled BOOLEAN DEFAULT true` em `user_settings`. Usuarios existentes ganham `true` automaticamente via DEFAULT (back-fill).
**Criterio de aceitacao:**
- [ ] Migration drizzle-kit cria coluna com default true.
- [ ] Query `SELECT break_auto_open_enabled FROM user_settings WHERE user_id = X` retorna `true` para users pre-migration.
- [ ] User novo (registro pos-migration) tambem nasce com true.

## Requisitos Nao-Funcionais
- **Performance:** Check XX:54/XX:02 deve rodar no mesmo interval de 30s ja existente OU em interval dedicado leve (sem nova HTTP, sem re-render desnecessario). Nao adicionar tick mais frequente que 30s.
- **Drift:** Tolerancia de janela 0–60s para XX:54 (interval 30s pode pegar `minute === 54` em segundos 0–30 ou 30–60). Dedupe por `YYYY-MM-DD-HH` garante uma unica abertura.
- **Time zone:** Usar horario fixo `America/Sao_Paulo` (UTC-3, sem DST desde 2019), independente do fuso do browser. Justificativa: o calendario de torneios das principais redes (Stars/GG/ACR/Party/Chico) usa horario brasileiro como referencia comum dos jogadores brasileiros, garantindo XX:54/XX:02 alinhado ao break real dos torneios. Implementacao: `new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })` ou usar `Intl.DateTimeFormat` para extrair hora/minuto em BRT. Helpers em `break-clock-helpers.ts` recebem `Date` e timezone como parametro para serem testaveis.
- **Acessibilidade:** Toggle Switch shadcn ja eh acessivel (role=switch, aria-checked). Tooltip via Radix.

## Endpoints Previstos
| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| PATCH | /api/user-settings | (existente) Aceita campo novo `breakAutoOpenEnabled: boolean` | JWT |
| GET | /api/user-settings | (existente) Retorna campo `breakAutoOpenEnabled` no payload | JWT |

Nenhum endpoint novo. Reaproveita rota generica de user_settings ja consumida via `userAlertSettings` query.

## Modelos de Dados Afetados

### `user_settings` (alteracao)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| break_auto_open_enabled | boolean | DEFAULT true, NOT NULL | Toggle persistente do auto-open clock-aligned |

Schema Drizzle em `shared/schema.ts` (apos linha 789, junto aos toggles bankroll/alert):
```ts
breakAutoOpenEnabled: boolean("break_auto_open_enabled").default(true).notNull(),
```

Migration drizzle-kit: criar via `npm run db:push` apos editar schema. Numerar conforme padrao (`migrations/00XX_*.sql` — verificar proximo numero disponivel).

## Integracoes Externas
Nenhuma.

## Componentes Afetados

### Alterados
- `client/src/pages/GrindSessionLive.tsx`
  - Novo `useEffect` para auto-open/auto-close clock-aligned (separado do useEffect FP-07 atual linhas 1168–1222).
  - Novo `useRef<string | null>` para `lastTriggerHourKey`.
  - Novo `useRef<boolean>` para `wasAutoOpened`.
  - Novo `useRef<number>` para `lastSliderInteractionAt` (atualizado via callback do BreakFeedbackPopup).
  - Renderizar `<Switch>` (shadcn) ou `<Button>` toggle no header da pagina.
  - Mutation `updateUserSettingsMutation` reaproveitada para PATCH otimista.
  - Suprimir banner FP-07 quando auto-open dispara.

- `client/src/components/BreakFeedbackPopup.tsx`
  - Aceitar nova prop opcional `onSliderInteraction?: () => void` chamada em `updateSliderValue` e `handleQuickScoreChange`.
  - Aceitar nova prop opcional `wasAutoOpened?: boolean` (uso futuro: pode condicionar UI, mas RF-03 trata via parent).
  - Sem mudancas visuais ao usuario.

- `shared/schema.ts`
  - Adicionar campo `breakAutoOpenEnabled` em `userSettings` table.
  - Atualizar `insertUserSettingsSchema` se ja existe (Zod).

### Novos
- `migrations/00XX_break_auto_open_enabled.sql` (gerado por drizzle-kit).
- `client/src/components/grind-session/break-clock-helpers.ts` — helpers puros para TDD:
  - `getCurrentHourKey(date: Date, tz?: string): string` — retorna `YYYY-MM-DD-HH` em BRT (default `America/Sao_Paulo`).
  - `getBrtMinute(date: Date): number` — retorna minuto (0–59) no fuso BRT.
  - `shouldAutoOpenAtClock(now: Date, lastTriggerHourKey: string | null): boolean` — true se BRT minute === 54 e key !== ultima.
  - `shouldAutoCloseAtClock(now: Date, openedAt: Date): boolean` — janela BRT XX:02–XX:06.
  - `isInteractingWithModal(lastSliderInteractionAt: number, isInTextarea: boolean): boolean` — true se interacao nos ultimos 30s.

## Cenarios de Teste Derivados

### Happy Path
- [ ] Toggle ON, sessao ativa, relogio bate XX:54 — modal abre.
- [ ] Modal aberto via auto-open, relogio bate XX:02 — modal fecha sem submit.
- [ ] User submete feedback antes de XX:02 — modal fecha normal e mutation salva.
- [ ] User clica "Responder Agora" no banner FP-07 (toggle ON) — modal abre e NAO auto-fecha em XX:02.

### Validacao de Estado
- [ ] Toggle invisivel quando sem activeSession.
- [ ] Estado inicial reflete user_settings.breakAutoOpenEnabled.
- [ ] Click toggle dispara PATCH e UI atualiza otimista.
- [ ] PATCH falha — toggle reverte e toast erro.

### Dedupe / Drift
- [ ] Interval roda em XX:54:05 — abre. Roda em XX:54:35 — NAO re-abre.
- [ ] Interval roda em XX:54:55 (proximo XX:55:25) — pega edge case.
- [ ] Hora muda de 14 para 15: 14:54 dispara, 15:54 dispara (keys diferentes).
- [ ] Mesma hora em dia diferente (ex.: ontem 14:54 vs hoje 14:54): keys diferentes — dispara.

### Guards
- [ ] `isPaused === true` em XX:54 — modal NAO abre.
- [ ] `skipBreaksToday === true` em XX:54 — modal NAO abre.
- [ ] `activeSession.skipBreaksToday === true` em XX:54 — modal NAO abre.
- [ ] `showBreakDialog === true` em XX:54 (ja aberto manualmente) — NAO re-abre.
- [ ] Toggle OFF em XX:54 — modal NAO abre, banner FP-07 funciona normal.

### Auto-close Edge Cases
- [ ] Modal aberto via auto-open, user esta com foco em textarea em XX:02 — NAO fecha.
- [ ] User tira foco do textarea em XX:03 — fecha.
- [ ] User mudou slider em XX:01:45 e em XX:02 ainda esta dentro da janela 30s — NAO fecha.
- [ ] User parou de interagir em XX:01:30, em XX:02 ja passaram 30s — fecha.
- [ ] User esta interagindo continuamente — em XX:06 (4 min apos), forca close.
- [ ] Modal aberto manualmente em XX:30 (clique banner) — em XX:02 da hora seguinte NAO fecha.

### Coexistencia FP-07
- [ ] Toggle ON, banner FP-07 dispara em XX:50 (5 min antes do break relativo coincidente), em XX:54 auto-open suprime banner.
- [ ] Toggle OFF, comportamento FP-07 100% identico ao baseline (regressao zero).
- [ ] Toggle ON mas `breakFrequency` user setou 30min: timer relativo e clock auto-open coexistem; clock vence se ambos ativos na mesma hora.

### "Pular Todos os Breaks Hoje"
- [ ] Click "Pular Todos" — PATCH `breakAutoOpenEnabled: false` disparado.
- [ ] Toggle UI muda de ON para OFF instantaneamente.
- [ ] Em XX:54 da hora seguinte — modal NAO abre (porque toggle agora OFF).
- [ ] Sessao nova no proximo dia — toggle ainda OFF ate user reativar manualmente.
- [ ] PATCH falha — toggle reverte para ON + toast erro.

### Migration / Default
- [ ] User existente sem registro de break_auto_open_enabled apos migration — query retorna `true`.
- [ ] User novo registrado pos-migration — campo nasce `true`.
- [ ] PATCH com `breakAutoOpenEnabled: false` — persiste e GET retorna false.

## Fora de Escopo
- **NAO** mudar `breakFrequency` (continua configuravel em user_settings, controla timer relativo).
- **NAO** notificacao push/desktop quando modal abre (separado, ja existe Notification API request em outro effect).
- **NAO** auto-submit do modal em XX:02 (founder pediu close sem salvar).
- **NAO** suporte a horario customizado (ex.: XX:50/XX:00 ou XX:55/XX:05). XX:54/XX:02 hardcoded.
- **NAO** sincronizacao com horario do site da rede (Stars/GG/PartyPoker etc) — usa horario fixo `America/Sao_Paulo` (BRT).
- **NAO** historico/log de auto-opens (sem tabela de tracking).
- **NAO** A/B test ou feature flag — deploy direto com default ON.
- **NAO** mexer no comportamento do `BreakFeedbackPopup` em si (sliders, shortcuts, history popup) — apenas adicionar callbacks de interacao.

## Dependencias
- `userSettings` table com PATCH endpoint funcional (ja existe).
- `userAlertSettings` query no GrindSessionLive (ja existe, linha 1166 usa).
- `BreakFeedbackPopup` componente (ja existe).
- Mutation pattern para user_settings PATCH (ja existe — ver `bankrollManagementEnabled`).
- `Switch` component shadcn (`@/components/ui/switch`) — verificar se ja importado em outro toggle.

## Notas de Implementacao
- **Helpers puros primeiro (TDD-friendly):** `break-clock-helpers.ts` deve cobrir 100% da logica de tempo. Component apenas wirea state e chama helpers. Lesson #1: hooks primeiro, sem early return antes de hooks.
- **Dedupe key formato:** Usar `YYYY-MM-DD-HH` (ex.: `2026-05-05-14`) e nao apenas hora numerica — evita problema de virada de dia.
- **`useRef` vs `useState`:** Usar `useRef` para `lastTriggerHourKey`, `wasAutoOpened`, `lastSliderInteractionAt`. Esses valores nao precisam re-renderizar quando mudam.
- **Mutation otimista:** Seguir padrao existente do `bankrollManagementEnabled` (ver onde for que esta wired). `setQueryData` antes da mutation, rollback no `onError`.
- **Lesson #13 (apiRequest):** PATCH user_settings provavelmente ja usa `apiRequest("PATCH", ...)` que retorna JSON parseado direto. Mocks de teste: nao retornar `{ ok, json: () => ... }`.
- **Cleanup:** Limpar `wasAutoOpened.current = false` em: submit do modal, close manual (X), close via "Pular", auto-close em XX:02.
- **Toast no auto-close:** Opcional, mas util para user nao achar que perdeu o feedback. String: "Break finalizado. Voce pode registrar manualmente em Gerenciar Breaks." (ou similar).
- **data-testid:** Lesson #2. Adicionar `data-testid="toggle-break-auto-open"` no Switch e `data-testid="break-feedback-popup"` no Sheet do modal (se ainda nao tem) para testes E2E estaveis.
