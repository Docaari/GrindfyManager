# Spec: Alarmes 2.0 — TTS na pagina /grind-session-live

## Status
Proposta

## Resumo
Substituir o beep de 880Hz dos alarmes da pagina `/grind-session-live` por narracao TTS browser-native (SpeechSynthesis API) com voz pt-BR, adicionar fluxo de criacao de alarme vinculado a torneio com narracao rica ("plataforma - nome - buy-in valor") e politica de repeticao configuravel ate dispensa. Mantem os 3 layers atuais (toast/som/notification), apenas troca a camada de som de beep para TTS, com fallback para o beep atual quando voz pt-BR ausente ou `speechSynthesis` indisponivel.

## Contexto
Hoje `client/src/lib/fireAlert.ts` toca uma onda senoidal de 880Hz por 200ms (Web Audio API) quando um alarme dispara. Founder pediu 3 melhorias para Sprint Alarmes 2.0:

1. **R1** — Substituir beep por TTS narrando o `label` do alarme.
2. **R2** — Permitir criar alarme vinculado a torneio especifico com narracao rica gerada automaticamente: `"{plataforma} - {nome} - buy-in {valor}"` (ex: "Suprema - Sunday Plus - buy-in 100").
3. **R3** — Repetir a narracao N vezes ou em loop ate o usuario dispensar (politica a definir).

Decisao arquitetural ja tomada em `Docs/strategy/2026-04-27-tts-research.md`: **browser-native SpeechSynthesis puro**, sem cloud TTS na v1, com fallback beep quando voz pt-BR ausente. Razoes: custo zero, latencia <100ms, narracao curta (<5s) elimina bug Chrome 15s, publico alvo desktop Windows/Mac (Maria/Luciana cobrem 95%+).

A feature roda em **paralelo** com a Sessao B (refactor do flow de finalizacao de sessao). Esta spec respeita os contratos de mediacao definidos: nao mexe em `endSessionMutation`, `SessionSummaryModal`, `WalletReconciliationDialog`, invalidates de `/api/grind-sessions`/`/api/wallets`/`/api/bankroll/*`, nem na duracao default do `useToast`. Consome a flag `alertsSuspended` exposta pela Sessao B.

---

## Changelog UX v1.1 (2026-04-27)

Founder aprovou TODOS os P0 e P1 do strategist UX audit. As 13 mudancas abaixo foram incorporadas in-place; v1.0 da spec (sem changelog) preservada via git history.

### P0 — Blockers (3)
- **P0-1 — First-run TTS hint** ([RF-10b](#rf-10b-first-run-tts-hint)). Toast amigavel "Alertas com voz ativados" na primeira sessao com TTS funcional. Nova coluna `tts_first_run_seen` em `user_settings` ([RF-07](#rf-07-schema--novos-campos-em-user_settings)).
- **P0-2 — `ttsRedactBuyIn` default `true`** ([RF-07](#rf-07-schema--novos-campos-em-user_settings)). Privacy-by-default. Default trocado de `false` para `true`.
- **P0-3 — Keyboard dismiss** ([RF-14](#rf-14-dismiss-rapido-via-teclado-durante-narracao)). Esc/Space cancelam TTS em curso sem mexer em dialogs/modais. Skip quando foco em input/textarea.

### P1 — Polish (10)
- **P1-1 — Modos de horario simplificados** ([RF-03](#rf-03-modal-de-criacao-de-alarme-vinculado-a-torneio)). De 3 radios para 2 modos visiveis ("Antes do start" pre-preenchido com 10min, "Antes do late close" condicional) + link discreto "Outro horario..." que expande modo absoluto. Selecionar torneio ja popula previa.
- **P1-2 — Lista de torneios ordenada** ([RF-03](#rf-03-modal-de-criacao-de-alarme-vinculado-a-torneio)). Dropdown ordenado por proximidade temporal ascendente.
- **P1-3 — "Testar voz" sempre habilitado** ([RF-06](#rf-06-settings-page--secao-alertas-e-voz)). Botao usa default voice se nenhuma selecionada — nao fica disabled antes da selecao.
- **P1-4 — Repeat defaults reduzidos** ([RF-01](#rf-01-substituir-beep-por-tts-no-firealert), [RF-07](#rf-07-schema--novos-campos-em-user_settings)). `alertRepeatCount` 3 → **2**, `alertRepeatGapMs` 5000 → **3000ms**. Ciclo total cai de 15s para ~7s.
- **P1-5 — Scoped TTS cancel** ([RF-09](#rf-09-integracao-com-checkalerts-em-grindsessionlive)). `handleDismissAlert` so cancela TTS se alarme em curso == alertId dismissado. `stopAlertById` no-op para IDs nao-ativos. Edge case: dismiss de alarme antigo nao mata narracao de outro.
- **P1-6 — "Modo discreto"** ([RF-06](#rf-06-settings-page--secao-alertas-e-voz)). Renomeado de "Redatar buy-in alto" para "Modo discreto". Help text estendido cobrindo streaming, ambientes compartilhados.
- **P1-7 — Redaction binaria sem threshold** ([RF-05](#rf-05-helper-de-narracao-de-torneio-com-redacao-opcional), DP-03 RESOLVIDA). Substitui logica de threshold $100 por toggle binario puro. Quando `ttsRedactBuyIn === true` → narra `"{site}, {name}, atencao"` (NUNCA valor). Helper perde param `redactThresholdUSD`.
- **P1-8 — FLUSH inteligente com priority queue** ([RF-13](#rf-13-multi-tabling--queue-com-priority-flush-inteligente)). Adiciona `priority: 'high'|'normal'`. late-reg = high, custom/tournament = normal. Lógica FLUSH (priority maior) vs QUEUE (mesma priority, max 3 itens, cap 30s). Itens em queue tocam apenas 1x.
- **P1-9 — Botao "preview por alarme"** ([RF-03](#rf-03-modal-de-criacao-de-alarme-vinculado-a-torneio), [AlertsPanel](#alertspaneltsx)). Cada card de active alert ganha botao `Volume2` antes do X de remover. Click toca narracao 1x.
- **P1-10 — Preview no form custom** ([AlertsPanel](#alertspaneltsx)). Botao "Ouvir como vai soar" abaixo do input de label, debounced 500ms. Paridade com TournamentAlertDialog.

### Decisoes pendentes — atualizadas
- **DP-03** RESOLVIDA por P1-7 (toggle binario sem threshold).
- **DP-01, DP-02, DP-04, DP-05, DP-06** continuam pendentes (founder validar). DP-05 fica vacuous se P1-7 prevalecer (nao ha mais threshold para configurar) — marcar como NA.

---

## Usuarios
- **Grinder em /grind-session-live:** durante sessao ativa multi-tabling, recebe alarmes manuais e late-reg automatico. Hoje ouve beep curto que se confunde com sons das salas. Com TTS, ouve voz humana dizendo o que e o alarme sem precisar olhar a tela.
- **Grinder configurando alarme de torneio:** quer ser avisado X minutos antes do start ou late-close de um torneio especifico, com narracao que identifica o torneio (ex: "Suprema, Sunday Plus, buy-in 100").
- **Grinder em ambiente compartilhado (privacy):** nao quer que valor do buy-in seja narrado em voz alta perto de outras pessoas.
- **Grinder em Linux ou sem voz pt-BR:** cai no fallback beep+toast sem perder funcionalidade.

---

## Goals
- TTS pt-BR substitui beep como modo padrao, sem regressao funcional.
- Alarme de torneio com narracao rica em <5s.
- Politica de repeticao configuravel; dispensa interrompe imediatamente (incluindo via teclado Esc/Space).
- Fallback transparente quando voz indisponivel.
- Zero friction de onboarding (gesture ja capturado em "Iniciar Sessao") + first-run hint educativo.
- **Privacy by default:** "Modo discreto" ativo por padrao — narra alarmes sem mencionar valores monetarios.
- Settings persistidos em `userSettings` via endpoint existente.
- Multi-tabling: priority queue inteligente — late-reg (high) interrompe custom (normal); customs proximos formam fila ate cap.

## Non-goals
- Cloud TTS (ElevenLabs, Google, Polly) — reavaliar em v2 se founder reclamar de qualidade.
- TTS em outras paginas alem de `/grind-session-live` (Coach, Cooldown, etc — fora de escopo).
- Suporte mobile-first (grind = desktop).
- Configurar voz por idioma alem de pt-BR (ex: en-US para narrar nome de torneio em ingles) — v2.
- Clone de voz, vozes customizadas, prosodia avancada.
- Alterar logica de quando alarme dispara (`SessionAlertManager.getAlertsToFire`) — apenas como dispara.

---

## User stories

### US-01: Grinder ouve voz em vez de beep
Como grinder em sessao ativa, ao criar alarme com label "Faltam 5min para o break", quando o alarme dispara, ouco a voz pt-BR falando "Faltam 5min para o break" em vez de beep, com volume controlavel em Settings.

### US-02: Grinder cria alarme de torneio com narracao automatica
Como grinder, abro o painel de alertas, clico "Novo alerta de torneio", seleciono o torneio "Sunday Plus" da lista (Suprema, buy-in 100, start 18:00), escolho "10min antes do start", confirmo. Quando 17:50 chegar, ouco "Suprema, Sunday Plus, buy-in 100" 3x com pausa de 5s entre repeticoes.

### US-03: Grinder dispensa alarme em curso
Como grinder, durante a 2a repeticao da narracao, clico no botao X do alarme (dispensa). A voz para imediatamente, a 3a repeticao nao toca.

### US-04: Grinder em Linux sem voz pt-BR
Como grinder em Linux sem voz pt-BR instalada, abro `/grind-session-live`, vejo toast informativo "[TTS indisponivel — usando beep]" no primeiro alarme, ouco beep como antes. Settings mostra "Modo de som: Beep (TTS indisponivel)".

### US-05: Grinder ouve previa antes de salvar alarme de torneio
Como grinder, no modal de criar alarme de torneio, vejo a string previa "Suprema, Sunday Plus, buy-in 100" e tenho botao "Ouvir previa" que toca a narracao antes de salvar.

### US-06: Grinder configura privacidade
Como grinder em ambiente compartilhado, em Settings ativo "Redatar buy-in alto". Alarme de torneio com buy-in 215 narra "Suprema, Sunday Plus, buy-in alto" em vez do valor.

### US-07: Grinder ajusta volume e numero de repeticoes
Como grinder, em Settings tenho slider de volume (0.0–1.0, default 0.8) e select de repeticoes (1, 2, 3, 5x ou loop). Mudanca aplica no proximo alarme.

### US-08: Grinder finaliza sessao com TTS em curso
Como grinder, durante narracao do alarme, clico "Finalizar sessao". O modal de summary abre, TTS para imediatamente (`alertsSuspended=true` cancela `speechSynthesis`).

### US-09: Grinder dispensa alarme via teclado (P0-3)
Como grinder com hands-on-mouse durante grind ativo, ouco narracao de alarme tocando. Pressiono Esc (ou Space) sem precisar mover mouse — narracao para imediatamente, repeticoes restantes nao tocam, demais modais/dialogs continuam abertos.

### US-10: Grinder ouve hint educativo na primeira sessao (P0-1)
Como grinder novo apos deploy do TTS, na minha primeira sessao com voz pt-BR detectada e modo `'tts'` ativo, ouco unlock silencioso e vejo toast "Alertas com voz ativados — voce pode trocar para beep ou mudo em Settings" por 6s. Em sessoes seguintes, toast nao reaparece.

### US-11: Multi-tabling com priority FLUSH (P1-8)
Como grinder em multi-tabling, alarme custom toca "Faltam 5min para break". 1s depois, alarme automatico de late-reg dispara. Late-reg (priority high) interrompe o custom em curso (FLUSH) e narra "Late Reg encerrando — Sunday Plus em 3min". Quando 2 customs disparam proximos, segundo aguarda fim do primeiro (QUEUE).

### US-12: Grinder ouve previa antes de salvar alarme custom (P1-10)
Como grinder, ao criar alarme custom no AlertsPanel, digito label "Faltam 10min para break". Apos 500ms de pausa, botao "Ouvir como vai soar" fica habilitado. Clico, ouco "Faltam 10min para break" antes de confirmar.

### US-13: Grinder revisa narracao de alarme ja criado (P1-9)
Como grinder, vejo lista de alertas ativos. Em cada card, alem do X de remover, vejo botao `Volume2`. Clico no alarme "Suprema, Sunday Plus, buy-in 100" e ouco a narracao 1x para conferir que ficou correta.

---

## Requisitos Funcionais

### RF-01: Substituir beep por TTS no `fireAlert`
**Descricao:** A funcao `fireAlert` em `client/src/lib/fireAlert.ts` ganha 4o parametro de modo de som. Quando modo for `'tts'` e `speechSynthesis` disponivel + voz pt-BR detectada, narra o texto via `SpeechSynthesisUtterance` em vez de tocar oscillator. Demais layers (toast, browser notification) inalterados.

**Regras de negocio:**
- Nova interface `FireAlertOptions` ganha:
  - `soundMode: 'tts' | 'beep' | 'mute'` (substitui `soundEnabled` boolean — soundEnabled vira derivado de `soundMode !== 'mute'`).
  - `narrationText?: string` — texto a ser narrado. Se ausente, usa `description`.
  - `voiceURI?: string | null` — voz preferida (vinda de `userSettings.preferredVoiceURI`). Null = primeira pt-BR disponivel.
  - `volume?: number` (0.0–1.0, default 0.8).
  - `repeatCount?: number` (**default 2** — atualizado em P1-4; range 1–5; se for 99, indica loop ate dismiss).
  - `repeatGapMs?: number` (**default 3000** — atualizado em P1-4).
  - `priority?: 'high' | 'normal'` (**novo em P1-8**, default `'normal'`). late-reg automatic deve passar `'high'`. custom + tournament ficam `'normal'`.
  - `alertId?: string` — ID do alarme (necessario para `stopAlertById` scoped — P1-5). Quando ausente (ex: late-reg automatic disparado sem ir pelo SessionAlertManager), gera UUID interno.
  - `onUtteranceEnd?: () => void` — callback opcional quando narracao termina (usado para sequencial em queue).
- Decisao de FLUSH/QUEUE delegada para `RF-13` (priority queue). Resumo: FLUSH so quando `priority` da nova chamada for maior que da em curso; senao QUEUE.
- Se voz pt-BR nao detectada OU `speechSynthesis` undefined, faz fallback para beep atual + emite toast informativo `[TTS indisponivel]` (apenas 1x por sessao — flag em modulo).
- Se `soundMode === 'mute'`, nao toca nada (toast e notification ainda disparam).
- Se `soundMode === 'beep'`, executa branch oscillator atual sem TTS.
- Repeticao implementada via cadeia `setTimeout` chamando `speak()` novamente. ID do timeout armazenado em `Map<alertId, number>` para permitir cancelamento scoped (P1-5).
- Itens em queue (mesma priority) tocam apenas 1x (sem repeat) para nao acumular tempo total (P1-8).

**Criterio de aceitacao:**
- [ ] Modo `'tts'` com voz pt-BR detectada narra `description` (ou `narrationText` se passado) em vez de beep.
- [ ] Modo `'beep'` mantem comportamento atual (oscillator 880Hz 200ms).
- [ ] Modo `'mute'` nao emite som; toast e notification ainda disparam.
- [ ] Sem voz pt-BR -> fallback beep + toast `[TTS indisponivel]` exibido apenas 1x por sessao.
- [ ] `priority: 'high'` interrompe priority `'normal'` em curso (FLUSH).
- [ ] `priority` igual ao atual entra na queue (QUEUE) — comportamento detalhado em RF-13.
- [ ] Volume aplicado via `utterance.volume`.
- [ ] **Repeticao 2x default com gap 3000ms** (atualizado P1-4).
- [ ] Cancelar repeticao via `stopAlertById(alertId)` interrompe TTS daquele ID e cancela timeouts pendentes; se ID nao for o em curso, no-op (P1-5).

### RF-02: Detectar e listar vozes pt-BR
**Descricao:** Criar utilitario `client/src/lib/ttsVoices.ts` que detecta vozes disponiveis, espera `voiceschanged` no Chrome e retorna lista filtrada de pt-BR (`v.lang.startsWith('pt-BR')`). Expoe hook `useTTSVoices()` para componentes.

**Regras de negocio:**
- Funcao `getPtBRVoices(): Promise<SpeechSynthesisVoice[]>`:
  - Chama `speechSynthesis.getVoices()`. Se retornar nao-vazio, filtra `pt-BR` e resolve.
  - Se vazio, registra listener em `voiceschanged`, espera ate 2s. Re-tenta. Resolve mesmo array vazio se timeout.
- Hook `useTTSVoices(): { voices: SpeechSynthesisVoice[]; ready: boolean; available: boolean }`:
  - Estado `voices` come a lista pt-BR.
  - `ready` true quando carregamento concluiu (mesmo que vazio).
  - `available` = `voices.length > 0`.
- Funcao `pickVoice(preferredURI: string | null, voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null`:
  - Se `preferredURI` presente e existe em `voices`, retorna ele.
  - Senao retorna primeira `pt-BR`.
  - Se vazio, retorna null.
- Funcao `speakUtterance(text, voice, volume): SpeechSynthesisUtterance` — cria utterance configurado.

**Criterio de aceitacao:**
- [ ] No Chrome, `getPtBRVoices()` retorna array vazio inicialmente, depois preenchido apos `voiceschanged` (max 2s).
- [ ] No Firefox/Safari, retorna preenchido em 1a chamada.
- [ ] `pickVoice` retorna voz preferida quando presente.
- [ ] `pickVoice` cai em primeira pt-BR quando preferida nao existe (ex: `Microsoft Maria` foi removida do SO).
- [ ] Sem voz pt-BR, `pickVoice` retorna null.

### RF-03: Modal de criacao de alarme vinculado a torneio
**Descricao:** Adicionar botao "Novo alerta de torneio" no `AlertsPanel` (alem do "Novo Alerta" existente). Abre modal com seletor de torneio, modo de horario simplificado, previa de narracao e botao "Ouvir previa". Modos progressivos: "Antes do start" pre-preenchido; "Antes do late close" condicional; "Outro horario" colapsado atras de link discreto.

**Regras de negocio:**
- Novo componente `client/src/components/grind-session-live/TournamentAlertDialog.tsx`:
  - Props: `{ open, onOpenChange, plannedTournaments, sessionTournaments, onCreate, ttsAvailable, voice, volume, redactBuyIn }`.
  - Lista combinada de torneios elegiveis: `[...plannedTournaments, ...sessionTournaments].filter(t => t.status === 'upcoming' && t.time)`.
  - **Ordenacao (P1-2):** lista ordenada ascendente por `triggerAt` calculado a partir de `t.time` — torneio mais proximo primeiro. Se 2 torneios mesmo horario, ordem alfabetica por `name` como tie-breaker.
  - Cada item exibe: bandeira/logo do site (reusar componente existente), nome, horario, buy-in.
  - Campos:
    1. **Selecionar torneio** — dropdown com lista filtrada+ordenada. Disabled se lista vazia.
    2. **Quando avisar (P1-1 — simplificacao)** — apresentacao progressiva, NAO 3 radios:
       - **Modo principal "Antes do start"** — input numerico minutos pre-preenchido com `10` (NAO "agora"). Range 1–120. Renderizado como input + label "min antes do start".
       - **Modo condicional "Antes do late close"** — so aparece como segundo input se `selectedTournament.lateRegMinutes > 0`. Mesmo formato. Radio entre "start" e "late close" so visivel quando ambos disponiveis.
       - **Modo escondido "Outro horario..."** — link discreto/botao secundario `<button class="text-xs text-blue-400 underline">Outro horario...</button>` abaixo dos modos visiveis. Click expande input `type="time"` (HH:MM). Cancelar collapsa de volta.
       - O modo selecionado define `triggerAt` calculado on-change.
    3. **Previa da narracao** — string computada pelo helper `buildTournamentNarration(t, { redactBuyIn })` (RF-05). Exibida em caixa cinza com fonte mono. **Pre-popula automaticamente ao selecionar torneio (P1-1)** — sem precisar digitar nada extra.
    4. **Botao "Ouvir previa"** (icone `Volume2`) — chama `speakUtterance(narration, voice, volume)` 1x. Disabled se `ttsAvailable === false` OU torneio nao selecionado.
    5. **Botao "Salvar alerta"** — calcula `triggerAt`, valida (>now), chama `onCreate({ tournamentId, narrationText, triggerAt, type: 'tournament' })`.
- Botao no `AlertsPanel`:
  - Estilo identico ao "Novo Alerta" existente, label "Novo alerta de torneio", icone `Trophy`.
  - Renderizado apenas se `(plannedTournaments.length + sessionTournaments.length) > 0`.
- **Preview por alarme em cada card de active alert (P1-9):**
  - Nas linhas ~239–265 do `AlertsPanel` (cards de active alert), antes do `<X>` de remover, adicionar `<button aria-label="Ouvir previa do alerta"><Volume2 className="w-3.5 h-3.5" /></button>`.
  - Click chama `speakUtterance(alert.narrationText || alert.label, voice, volume)` 1x — sem repeat, sem entrar na queue de fireAlert.
  - Hidden quando `soundMode === 'mute'` ou `ttsAvailable === false`.
  - Hover state idem ao botao X (gray-500 → gray-300).
- Validacao:
  - `triggerAt` deve ser futuro (>now). Erro: "Horario ja passou".
  - Modo "X min antes do late close" exige `lateRegMinutes > 0`.
  - Limite 50 alarmes ativos (reusar `MAX_ALERTS` existente em `SessionAlertManager`).
  - Nao permite duplicata: rejeita se ja existe alarme com mesmo `tournamentId` + `triggerAt` (tolerancia 60s — reusar `hasDuplicateLateReg`).

**Criterio de aceitacao:**
- [ ] Botao "Novo alerta de torneio" visivel quando ha torneios upcoming.
- [ ] Modal abre com lista de torneios upcoming (planned + session) **ordenada por proximidade temporal ascendente** (P1-2).
- [ ] Modo principal "Antes do start" renderiza pre-preenchido com `10` min (P1-1).
- [ ] Modo "Antes do late close" so aparece quando torneio selecionado tem `lateRegMinutes > 0` (P1-1).
- [ ] Modo "Outro horario" inicialmente colapsado atras de link; expandir mostra input `type="time"` (P1-1).
- [ ] Selecionar torneio popula previa automaticamente sem outra acao do usuario (P1-1).
- [ ] Previa da narracao reflete `buildTournamentNarration` corretamente (incluindo redacao quando ativa).
- [ ] "Ouvir previa" toca TTS 1x e respeita volume + voz preferida.
- [ ] "Ouvir previa" desabilitado quando TTS indisponivel ou torneio nao selecionado.
- [ ] Salvar com `triggerAt` no passado mostra erro.
- [ ] Salvar com duplicata mostra erro.
- [ ] Apos salvar, modal fecha e alarme aparece na lista de ativos com botao preview `Volume2` (P1-9).
- [ ] Preview por alarme: click toca 1x sem entrar na priority queue, sem afetar alarme em curso (P1-9).
- [ ] Preview por alarme: hidden em `soundMode === 'mute'` (P1-9).

### RF-04: SessionAlert ganha campo `narrationText`
**Descricao:** Estender o tipo `SessionAlert` em `shared/generic-alerts.ts` para incluir `narrationText?: string` opcional. Quando ausente, narracao usa `label` (retrocompat).

**Regras de negocio:**
- Adicionar campo `narrationText?: string` a interface `SessionAlert` e `CreateAlertInput`.
- `SessionAlertManager.addAlert` aceita `narrationText` opcional via input.
- Novo metodo `addTournamentAlert(input: { tournamentId, narrationText, triggerAt, label })` que:
  - Cria alarme `type: 'custom'` (ou novo `'tournament'` — decisao pendente DP-04 abaixo).
  - Armazena `narrationText` para evitar recalculo a cada disparo.
- `getAlertsToFire`/`getActiveAlerts`/etc inalterados.
- Reset de sessao limpa `narrationText` junto.

**Criterio de aceitacao:**
- [ ] Tipo `SessionAlert` aceita `narrationText` opcional.
- [ ] Alarme criado via `addTournamentAlert` armazena `narrationText` no objeto.
- [ ] Ao disparar, `fireAlert` recebe `narrationText || label`.
- [ ] Alarmes existentes (sem `narrationText`) continuam funcionando — fallback para `label`.

### RF-05: Helper de narracao de torneio com redacao binaria (Modo discreto)
**Descricao:** Criar funcao pura `buildTournamentNarration(tournament, options)` em `client/src/lib/tournamentNarration.ts` que monta a string narrada. Redacao **binaria** (P1-7): quando `redactBuyIn === true`, NUNCA narra valor numerico, independente do buy-in.

**Regras de negocio:**
- Assinatura: `buildTournamentNarration(t: { site, name, buyIn }, opts: { redactBuyIn: boolean })`. **Param `redactThresholdUSD` REMOVIDO em P1-7.**
- Formato base (modo normal): `"{site}, {name}, buy-in {valor}"` (separador virgula + espaco — TTS pt-BR pausa naturalmente em virgula).
- Formato discreto (`redactBuyIn === true`): `"{site}, {name}, atencao"`. **Sem mencionar valor monetario sob nenhuma circunstancia.**
- Justificativa P1-7: vergonha social nao escala linear com buy-in. Usuario que ativa "Modo discreto" quer garantir que nenhum valor seja narrado, nao apenas "valor alto". Toggle binario remove ambiguidade.
- Sanitizacao:
  - Trim espacos, remove caracteres `<`, `>`, `&` (anti-injection visual).
  - Se `name` > 60 chars, trunca em 60 + "...".
  - Numeros narrados como "100" funcionam OK em pt-BR (Maria/Luciana leem como "cem"). Sem formatacao especial.
- Exemplos:
  - Modo normal: `{ site: 'Suprema', name: 'Sunday Plus', buyIn: '100' }` → `"Suprema, Sunday Plus, buy-in 100"`
  - Modo normal: `{ site: 'WPN', name: 'Loncar', buyIn: '55' }` → `"WPN, Loncar, buy-in 55"`
  - Modo discreto: qualquer buyIn → `"Suprema, Sunday Plus, atencao"`
  - Modo discreto: qualquer buyIn → `"WPN, Loncar, atencao"`

**Criterio de aceitacao:**
- [ ] Formato modo normal: `"{site}, {name}, buy-in {valor}"`.
- [ ] Formato modo discreto (P1-7): `"{site}, {name}, atencao"` — independente do valor de `buyIn`.
- [ ] Modo discreto + buyIn 5 → "atencao" (NUNCA narra "5").
- [ ] Modo discreto + buyIn 215 → "atencao" (NUNCA narra "215").
- [ ] Nome > 60 chars truncado.
- [ ] Caracteres especiais sanitizados.
- [ ] Helper NAO recebe `redactThresholdUSD` mais (assinatura P1-7).
- [ ] Sem dependencia de `normalizeBuyInToUSD` (binario nao precisa converter moeda).

### RF-06: Settings page — secao "Alertas e Voz"
**Descricao:** Em `client/src/pages/Settings.tsx`, adicionar secao "Alertas e Voz" com controles para os novos campos de userSettings. Defaults atualizados (P1-4) e renomeacao "Modo discreto" (P1-6).

**Regras de negocio:**
- Nova secao "Alertas e Voz" (apos "Notificacoes"):
  1. **Modo de som** — radio: TTS / Beep / Mudo. Default `'tts'`.
     - Se voz pt-BR nao detectada, opcao "TTS" mostra texto auxiliar "(indisponivel)" e fica disabled. Selecao automatica cai para `'beep'`.
  2. **Voz** — select com vozes pt-BR disponiveis (label = `voice.name`, value = `voice.voiceURI`). Disabled quando modo nao `'tts'`. Botao `Volume2` ao lado para testar voz selecionada (toca "Teste de voz Grindfy").
     - **Botao "Testar voz" SEMPRE habilitado quando `soundMode === 'tts'` (P1-3)**, mesmo se nenhuma voz especifica selecionada. Quando `preferredVoiceURI === null`, usa default voice (primeira pt-BR via `pickVoice(null, voices)`). So fica disabled se `useTTSVoices().available === false` (sem voz nenhuma).
  3. **Volume** — slider 0.0–1.0, step 0.05, default 0.8. Display "%" ao lado.
  4. **Repeticao** — select: 1x / **2x (default — P1-4)** / 3x / 5x / Loop ate dispensar.
  5. **Intervalo entre repeticoes** — input numerico segundos (range 2–30, **default 3 — P1-4**).
  6. **Modo discreto (renomeado P1-6)** — switch boolean (**default `true` — P0-2**). Help text (atualizado P1-6): "Narra alertas sem mencionar valores. Recomendado para streaming, ambientes compartilhados ou jogo perto de outras pessoas."
- Salvar via `PUT /api/user/settings` (endpoint existente, RF-08).
- Optimistic update + rollback on error.

**Criterio de aceitacao:**
- [ ] Secao "Alertas e Voz" renderiza apos "Notificacoes".
- [ ] 6 controles funcionam, salvam via PUT existente.
- [ ] Modo "TTS" disabled quando voz pt-BR ausente; auto-fallback para "Beep".
- [ ] Botao "Testar voz" sempre habilitado quando `soundMode === 'tts'`, mesmo sem voz selecionada (usa default) (P1-3).
- [ ] Botao "Testar voz" so disabled quando `available === false` (sem voz pt-BR) (P1-3).
- [ ] Botao testar voz toca "Teste de voz Grindfy" usando voz selecionada (ou default) e volume.
- [ ] Default de "Repeticao" = 2x (P1-4).
- [ ] Default de "Intervalo entre repeticoes" = 3s (P1-4).
- [ ] Label do switch = "Modo discreto" (P1-6); help text reflete texto novo.
- [ ] Switch "Modo discreto" inicia ativado (default `true`) para usuarios novos (P0-2).
- [ ] Persistencia: ao recarregar pagina, valores corretos exibidos.

### RF-07: Schema — novos campos em `user_settings`
**Descricao:** Adicionar **7 colunas** a tabela `user_settings` para persistir preferencias TTS (P0-1 acrescenta `tts_first_run_seen`).

**Regras de negocio:**
- Novos campos (todos com default — backward compatible):
  - `soundMode varchar default 'tts'` — enum aplicacional `'tts' | 'beep' | 'mute'` (validado via Zod, nao constraint DB para flexibilidade futura).
  - `preferredVoiceURI varchar nullable default NULL` — URI da voz preferida; null = primeira pt-BR.
  - `alertVolume decimal default '0.8'` — range 0.0–1.0, validado Zod.
  - `alertRepeatCount integer default 2` — range 1–5, ou 99 = loop ate dismiss. **Atualizado P1-4 (era 3).**
  - `alertRepeatGapMs integer default 3000` — range 2000–30000. **Atualizado P1-4 (era 5000).**
  - `ttsRedactBuyIn boolean default true` — privacy flag (Modo discreto). **Atualizado P0-2 (era `false`). Privacy-by-default.**
  - `ttsFirstRunSeen boolean default false` — **NOVO P0-1.** Marca se usuario ja viu o toast amigavel "Alertas com voz ativados". Set para `true` apos primeiro hint exibido (RF-10b).
- Migration via `db:push` (drizzle-kit, padrao do projeto).
- Zod schema `insertUserSettingsSchema` extendido com:
  ```ts
  soundMode: z.enum(['tts','beep','mute']).optional(),
  preferredVoiceURI: z.string().max(255).nullable().optional(),
  alertVolume: z.union([z.string(), z.number()])
    .optional()
    .transform(v => v == null ? v : String(v))
    .refine(v => v == null || (parseFloat(v) >= 0 && parseFloat(v) <= 1),
      { message: 'alertVolume deve estar entre 0 e 1' }),
  alertRepeatCount: z.number().int().min(1).max(99).optional(),
  alertRepeatGapMs: z.number().int().min(2000).max(30000).optional(),
  ttsRedactBuyIn: z.boolean().optional(),
  ttsFirstRunSeen: z.boolean().optional(),  // P0-1
  ```
- Migracao de usuarios existentes:
  - Defaults aplicam-se ao ler — NAO requer back-fill explicito.
  - **Cuidado P0-2:** Como `ttsRedactBuyIn` agora e `true` por default, usuarios existentes que nunca tocaram em settings tambem ganham privacy ativa. Aceitavel (privacy-by-default e melhor UX que opt-in tardio). Documentar mudanca no release notes.
  - **Cuidado P0-1:** `tts_first_run_seen` default `false`. Usuarios EXISTENTES (que nunca interagiram com TTS) verao o toast amigavel na primeira sessao pos-deploy. Comportamento desejado (ajuda usuarios a descobrirem a feature).
  - Frontend trata default `'tts'` mas auto-fallback para `'beep'` se voz pt-BR nao detectada na primeira renderizacao.

**Criterio de aceitacao:**
- [ ] 7 colunas existem em `user_settings` com defaults corretos.
- [ ] `tts_first_run_seen` default `false` (P0-1).
- [ ] `tts_redact_buy_in` default `true` (P0-2).
- [ ] `alert_repeat_count` default `2`, `alert_repeat_gap_ms` default `3000` (P1-4).
- [ ] Zod aceita parciais e valida ranges para todos 7 campos.
- [ ] Usuarios existentes (sem registros nas novas colunas) recebem defaults.
- [ ] Read/write via storage funciona end-to-end.

### RF-08: Endpoint `PUT /api/user/settings` aceita novos campos
**Descricao:** Endpoint existente em `server/routes/userSettings.ts` (ou similar — ver `endpoints-index.md`) ja faz merge generico via `insertUserSettingsSchema.partial().parse()`. Bastando estender o schema (RF-07), endpoint aceita os 6 campos sem alteracao de codigo de rota.

**Regras de negocio:**
- Sem nova rota.
- Sem alteracao em handler — apenas confirma que o schema aceita os campos (RF-07 ja cobre).
- Validacao Zod retorna 400 com `{ message }` se campo invalido (ex: `alertVolume: 1.5`).
- Auth via `requireAuth` ja existente.

**Criterio de aceitacao:**
- [ ] PUT com body parcial `{ soundMode: 'tts' }` retorna 200.
- [ ] PUT com body parcial `{ alertVolume: 0.5 }` retorna 200.
- [ ] PUT com `alertVolume: 2` retorna 400.
- [ ] PUT com `soundMode: 'invalid'` retorna 400.
- [ ] Usuario nao autenticado recebe 401.

### RF-09: Integracao com checkAlerts em GrindSessionLive
**Descricao:** O `useEffect` de `checkAlerts` (linhas 928–1007 de `GrindSessionLive.tsx`) passa a invocar `fireAlert` com novos parametros (incluindo `priority` e `alertId`) e respeitar `alertsSuspended`. **Cancel de TTS por dismiss agora e scoped por alertId (P1-5).**

**Regras de negocio:**
- Adicionar `alertsSuspended` (vindo da Sessao B) como dep do `useEffect`. Quando `true`:
  - Skipa execucao de `checkAlerts`.
  - Chama `stopAllAlerts()` (helper) que:
    - `speechSynthesis.cancel()`.
    - Limpa todos timeouts de repeticao via `Map<alertId, timeoutHandle>` global do modulo `fireAlert.ts`.
    - Limpa queue de prioridade (RF-13).
- `fireAlert` invocado com `priority`:
  ```ts
  // Late-reg automatic
  fireAlert({
    title: "Late Reg Encerrando!",
    description,
    soundMode: settings.soundMode,
    voiceURI: settings.preferredVoiceURI,
    volume: settings.alertVolume,
    repeatCount: settings.alertRepeatCount,
    repeatGapMs: settings.alertRepeatGapMs,
    narrationText: description,
    priority: 'high',                       // P1-8 — late-reg = high
    alertId: `latereg-${tournamentId}`,     // P1-5
    duration: 30000,
    toast,
  });

  // Custom + tournament alerts
  fireAlert({
    ...
    priority: 'normal',                     // P1-8 — custom/tournament = normal
    alertId: alert.id,                      // P1-5
    narrationText: alert.narrationText || alert.label,
    ...
  });
  ```
- **`handleDismissAlert` scoped (P1-5):**
  - Chama nova helper `stopAlertById(alertId)` (em vez de `stopAllAlerts`).
  - `stopAlertById(alertId)`:
    - Se `currentlySpeakingAlertId === alertId`, chama `speechSynthesis.cancel()` + clear timeouts daquele ID + promove proximo da queue (se houver).
    - Senao (alertId nao esta tocando agora — talvez ja esta na queue ou era um alarme antigo): apenas remove da queue (se presente) e clear timeouts pendentes daquele ID. **NO-OP para a narracao em curso de outro alertId.**
  - Edge case explicito: usuario dispensa alarme A (que ja parou de tocar ha 30s) enquanto narracao B (priority normal) toca. B continua tocando normalmente.
- Voz e volume vem de `userAlertSettings` (query existente — apenas adicionar campos no select).

**Criterio de aceitacao:**
- [ ] `alertsSuspended === true` cancela TTS em curso e impede novos disparos.
- [ ] `alertsSuspended` voltando a `false` retoma checkAlerts normal.
- [ ] Dispensa do alarme em curso via X interrompe sua narracao imediatamente (P1-5).
- [ ] Dispensa de alarme antigo (nao tocando) NAO interrompe narracao em curso de outro alarme (P1-5).
- [ ] `stopAlertById` no-op quando ID nao corresponde ao em curso e nem esta na queue.
- [ ] late-reg automatic disparado com `priority: 'high'` (P1-8).
- [ ] Custom/tournament disparados com `priority: 'normal'` (P1-8).

### RF-10: User gesture unlock implicito em "Iniciar Sessao"
**Descricao:** Aproveitar o gesture do botao "Iniciar Sessao" para destravar `speechSynthesis` no Chrome/Safari.

**Regras de negocio:**
- No `handleStartSession` (linha 1246 de `GrindSessionLive.tsx`), apos `apiRequest('POST', ...)` ja iniciado, chamar:
  ```ts
  if (typeof speechSynthesis !== 'undefined') {
    const unlock = new SpeechSynthesisUtterance('');
    unlock.volume = 0;
    speechSynthesis.speak(unlock);
  }
  ```
- Operacao silenciosa (volume 0). Engine fica destravada para o resto da sessao.
- No `TournamentAlertDialog`, botao "Ouvir previa" tambem serve de unlock alternativo (caso usuario queira ouvir voz antes mesmo de iniciar sessao).
- Sem modal de "ativar voz" — onboarding zero-friction.

**Criterio de aceitacao:**
- [ ] Click em "Iniciar Sessao" destrava SpeechSynthesis no Chrome (proximo `speak()` toca audio).
- [ ] "Ouvir previa" no TournamentAlertDialog serve de unlock alternativo.
- [ ] Sem modal de permissao de audio.

### RF-10b: First-run TTS hint
**Descricao (NOVO P0-1):** Apos unlock TTS no `handleStartSession`, se `userSettings.ttsFirstRunSeen !== true` E `settings.soundMode === 'tts'` E `useTTSVoices().available === true`, exibir toast educativo amigavel e marcar flag persistida.

**Regras de negocio:**
- Trigger: dentro de `handleStartSession`, apos chamada de unlock (RF-10), checar 3 condicoes:
  1. `userAlertSettings?.ttsFirstRunSeen !== true`
  2. `userAlertSettings?.soundMode === 'tts'` (modo efetivo, nao default)
  3. `useTTSVoices().available === true` (voz pt-BR detectada)
- Se TODAS verdadeiras:
  - Disparar toast com:
    ```ts
    toast({
      title: "🎙️ Alertas com voz ativados",
      description: "Voce pode trocar para beep ou mudo em Settings.",
      variant: 'default',
      duration: 6000,
    });
    ```
  - Disparar `apiRequest('PUT', '/api/user/settings', { ttsFirstRunSeen: true })` em background. Optimistic update via `queryClient.setQueryData` para evitar segundo toast em re-mount rapido.
  - Em caso de falha do PUT, log silencioso — proxima sessao tentara de novo (UX trade-off aceito: pode mostrar toast 2x em race condition de rede).
- NAO mostrar:
  - Quando `ttsFirstRunSeen === true` (ja viu).
  - Quando `soundMode !== 'tts'` (usuario ja escolheu beep/mute — nao educar sobre algo nao-ativo).
  - Quando voz pt-BR indisponivel — RF-11 ja cuida do fallback toast.
- Emoji e UTF-8 valido em toast title (compatibilidade ja confirmada com toast atual).

**Criterio de aceitacao:**
- [ ] Primeira sessao com TTS funcional + flag `false` → toast amigavel exibido por 6s.
- [ ] Apos toast, PUT atualiza `tts_first_run_seen = true`.
- [ ] Segunda sessao do mesmo usuario → toast NAO aparece.
- [ ] Sessao em modo `'beep'` → toast NAO aparece (flag continua false).
- [ ] Sessao sem voz pt-BR → toast amigavel NAO aparece (RF-11 cuida da indicacao).
- [ ] Falha do PUT loga mas nao quebra UX (toast ja foi exibido).

### RF-11: Fallback transparente quando TTS indisponivel
**Descricao:** Quando voz pt-BR ausente OU `speechSynthesis === undefined` OU usuario seleciona modo `'beep'`, comportamento volta ao beep atual + toast informativo (apenas 1x por sessao para nao spammar).

**Regras de negocio:**
- Flag de modulo em `fireAlert.ts`: `let _ttsUnavailableNotified = false`.
- Quando deteccao falha:
  - Toca beep (oscillator atual).
  - Se `_ttsUnavailableNotified === false` e modo era `'tts'`, toast `[TTS indisponivel — usando beep]` (variant: 'default', duration: 8000).
  - Set flag `true`.
- Reset flag ao trocar para outra rota ou em `useEffect cleanup`.
- Settings page mostra "(indisponivel)" ao lado da opcao TTS quando `useTTSVoices().available === false`.

**Criterio de aceitacao:**
- [ ] Voz pt-BR ausente → beep + toast "TTS indisponivel" exibido 1x.
- [ ] Multiplos alarmes na mesma sessao nao spammam toast.
- [ ] Settings indica "(indisponivel)" claramente.

### RF-12: Acessibilidade — `prefers-reduced-data`
**Descricao:** Respeitar media query `prefers-reduced-data` skipando TTS (audio carrega vozes em alguns SO). NAO respeitar `prefers-reduced-motion` (motion ≠ audio).

**Regras de negocio:**
- Em `fireAlert`, antes de tentar TTS:
  ```ts
  const prefersReducedData = typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-data: reduce)').matches;
  if (prefersReducedData && soundMode === 'tts') {
    // fallback beep + toast 1x
  }
  ```
- Sem alteracao em comportamento visual (toast continua igual).

**Criterio de aceitacao:**
- [ ] `prefers-reduced-data: reduce` ativo + modo TTS → beep.
- [ ] `prefers-reduced-motion` nao afeta audio.

### RF-13: Multi-tabling — queue com priority FLUSH inteligente
**Descricao (atualizado P1-8):** Substitui FLUSH naive (sempre interrompe) por logica baseada em `priority`. late-reg automatic (`'high'`) interrompe custom/tournament (`'normal'`) em curso. Mesma priority entra em fila (QUEUE) com cap de 3 itens e cap de 30s. Toasts continuam acumulando como hoje.

**Regras de negocio:**
- Estado de modulo em `fireAlert.ts`:
  ```ts
  type QueueItem = {
    alertId: string;
    priority: 'high' | 'normal';
    text: string;
    voice: SpeechSynthesisVoice | null;
    volume: number;
    enqueuedAt: number; // Date.now()
  };
  let _currentlySpeaking: QueueItem | null = null;
  let _queue: QueueItem[] = [];
  const _alertTimeouts: Map<string, number> = new Map();
  const QUEUE_MAX_ITEMS = 3;
  const QUEUE_MAX_TIME_MS = 30000;
  ```
- Logica ao entrar nova `fireAlert`:
  1. **Sem item em curso** (`_currentlySpeaking === null`):
     - Comeca a falar imediatamente. Item vira `_currentlySpeaking`.
     - Repeticoes via cadeia de setTimeout normalmente (RF-01).
  2. **Com item em curso E nova priority > current priority** (high entrando vs normal em curso):
     - **FLUSH:** `speechSynthesis.cancel()`, clear timeouts do `_currentlySpeaking.alertId`, descarta queue inteira (todas em normal, todas obsoletas frente ao high).
     - Nova chamada vira `_currentlySpeaking` e fala.
  3. **Com item em curso E nova priority == current priority** (normal vs normal, ou high vs high):
     - **QUEUE:** adiciona ao final de `_queue`.
     - Cap por contagem: se `_queue.length >= 3`, descarta o novo (apenas toast continua via fluxo normal). Log: `[tts.queue.dropped] reason=cap_items`.
     - Cap por tempo: ao processar fila, antes de promover proximo, verificar `Date.now() - item.enqueuedAt > 30000`. Se passou, descarta + log `reason=cap_time`.
  4. **Com item em curso E nova priority < current** (normal entrando vs high em curso):
     - **QUEUE atras** (mesmo comportamento de mesma priority): adiciona ao final.
- Promocao de proximo:
  - `utterance.onend` aciona `_promoteNext()`.
  - `_promoteNext()` faz: `_currentlySpeaking = _queue.shift() || null`. Se nao-null, descarta itens com `>30s` no buffer; chama `speak()` para o promovido.
  - **Itens em queue tocam apenas 1x (sem repeat)** — para nao acumular tempo total. Repeat so se aplica ao item que entra direto no `_currentlySpeaking` sem precisar enfileirar.
- `stopAlertById(alertId)` (P1-5):
  - Se `_currentlySpeaking?.alertId === alertId`, `speechSynthesis.cancel()` + clear timeouts daquele ID + `_promoteNext()`.
  - Senao remove de `_queue` (`_queue = _queue.filter(i => i.alertId !== alertId)`).
- `stopAllAlerts()`:
  - `speechSynthesis.cancel()`, `_currentlySpeaking = null`, `_queue = []`, clear todos timeouts.
- Comportamento de toast inalterado (`useToast` empilha como hoje, **TODOS** alarmes geram toast mesmo se TTS for descartado).

**Criterio de aceitacao:**
- [ ] Cenario "5 alarmes em <5s, todos normal": 1o fala (com repeat), 2o-3o aguardam em queue (1x cada), 4o-5o sao descartados (toast continua). 5 toasts visiveis.
- [ ] Cenario "late-reg interrompe custom": custom (normal) tocando, late-reg (high) entra. Custom interrompido (FLUSH), late-reg fala. Queue limpa.
- [ ] Cenario "2 customs proximos": A (normal) tocando + repetindo. B (normal) entra. B vai pra queue. A termina (incluindo repeats). B fala 1x.
- [ ] Cenario "queue lota com 3": 1o tocando, 2o-3o-4o em queue. 5o entra. 5o descartado, log `cap_items`.
- [ ] Cenario "item rancado por tempo": item enqueued em t=0, demora >30s para chegar a vez. Quando vai promover, descarta com log `cap_time`.
- [ ] Repeticoes pendentes do item anterior cancelados quando FLUSH ocorre.
- [ ] Toasts disparam para todos alarmes (incluindo descartados) — comportamento existente.

### RF-14: Dismiss rapido via teclado durante narracao
**Descricao (NOVO P0-3):** Listener global de teclado em `GrindSessionLive` permite que Esc ou Space cancelem narracao TTS em curso instantaneamente, sem fechar dialogs/modais e sem afetar interacoes de form.

**Regras de negocio:**
- `useEffect` no escopo da sessao ativa (mesmo gate que `checkAlerts`):
  ```ts
  useEffect(() => {
    if (!activeSession || activeSession.status !== 'active') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip when focus on form fields
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' ||
          (target as any)?.isContentEditable) return;

      if (e.key === 'Escape' || e.key === ' ') {
        // Only act if there's TTS currently speaking
        if (_currentlySpeaking || speechSynthesis.speaking) {
          e.preventDefault();
          stopAllAlerts();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSession]);
  ```
- Listener auto-removido em cleanup (mudanca de sessao, unmount).
- **Skip quando foco em**: `input`, `textarea`, `select`, elementos com `contentEditable` true. Garante que digitar Space em label de alarme nao cancele TTS.
- **Skip quando nada toca:** so chama `stopAllAlerts` se de fato ha narracao ativa (`_currentlySpeaking` ou `speechSynthesis.speaking`). Evita bloquear Space de outras acoes UI.
- **Click X em toast:** o toast atual ja gera handler de close. Adicionar callback `onCloseClick` no `fireAlert` que chama `stopAllAlerts` (ou `stopAlertById(alertId)` se `alertId` conhecido). Implementacao: passar callback ao toast via shadcn `useToast` action prop.
- **NAO fecha dialogs/modais:** apenas para o TTS. SessionSummaryModal, WalletReconciliationDialog, TournamentAlertDialog continuam abertos. Esc nativo destes dialogs ainda funciona — o `e.preventDefault()` so e chamado quando ha narracao em curso (evita quebrar comportamento padrao do dialog).

**Criterio de aceitacao:**
- [ ] Esc com TTS tocando → narracao para imediatamente, dialog/modal continua aberto.
- [ ] Space com TTS tocando + foco no body → narracao para.
- [ ] Space com TTS tocando + foco em `<input>` (digitando label) → digita espaco normal, narracao continua.
- [ ] Esc sem TTS tocando → comportamento nativo (fecha dialog se aberto).
- [ ] Click X no toast cancela TTS daquele alarme.
- [ ] Listener removido apos finalizacao de sessao (cleanup do useEffect).
- [ ] Funciona em Chrome, Firefox, Edge (verificar Mac Safari como nice-to-have).

---

## Schema changes

### Tabela `user_settings` — 7 novas colunas

| Campo | Tipo SQL | Default | Notas |
|---|---|---|---|
| `sound_mode` | `varchar` | `'tts'` | enum logico `'tts'\|'beep'\|'mute'` (Zod) |
| `preferred_voice_uri` | `varchar(255)` | `NULL` | null = primeira pt-BR |
| `alert_volume` | `decimal` | `'0.8'` | range 0.0–1.0 (Zod) |
| `alert_repeat_count` | `integer` | `2` | **P1-4** (era 3). Range 1–5; 99 = loop |
| `alert_repeat_gap_ms` | `integer` | `3000` | **P1-4** (era 5000). Range 2000–30000 |
| `tts_redact_buy_in` | `boolean` | `true` | **P0-2** (era `false`). Privacy-by-default. "Modo discreto" |
| `tts_first_run_seen` | `boolean` | `false` | **P0-1** (NOVO). Flag de primeira sessao com TTS funcional |

Migration: drizzle `db:push`. Sem back-fill explicito — defaults aplicam-se a registros existentes via leitura. Documentar mudanca de privacy default em release notes.

### Tipo `SessionAlert` (shared/generic-alerts.ts) — 1 novo campo

| Campo | Tipo | Default | Notas |
|---|---|---|---|
| `narrationText` | `string?` (opcional) | `undefined` | Quando ausente, usa `label` |

`CreateAlertInput` derivado herda automaticamente.

---

## API contracts

### `PUT /api/user/settings`
Endpoint existente. Sem nova rota. Aceita os 6 novos campos via merge parcial:

**Request body (parcial — exemplo completo dos 7 campos):**
```json
{
  "soundMode": "tts",
  "preferredVoiceURI": "Microsoft Maria - Portuguese (Brazil)",
  "alertVolume": 0.7,
  "alertRepeatCount": 2,
  "alertRepeatGapMs": 3000,
  "ttsRedactBuyIn": true,
  "ttsFirstRunSeen": true
}
```

Body parcial valido tambem (ex: usuario so trocando volume):
```json
{ "alertVolume": 0.5 }
```

E especificamente do RF-10b (set automatico apos hint):
```json
{ "ttsFirstRunSeen": true }
```

**Response 200:** UserSettings completo (espelhando o registro). Erro 400 com Zod message se invalido.

### Sem endpoints adicionais
Tudo demais e client-side (TTS roda no browser, alarmes ja sao in-memory via `SessionAlertManager`).

---

## UI changes

### `AlertsPanel.tsx`
- Botao novo "Novo alerta de torneio" (icone `Trophy`) ao lado de "Novo Alerta", visivel quando `tournamentsCount > 0`.
- **Botao "Preview" por active alert (P1-9)** nos cards das linhas ~239–265: `<button aria-label="Ouvir previa"><Volume2 className="w-3.5 h-3.5" /></button>` antes do X de remover. Click chama `speakUtterance(alert.narrationText || alert.label, voice, volume)` 1x sem entrar na priority queue. Hidden quando `soundMode === 'mute'` ou `available === false`.
- **Preview no form de criar alarme custom (P1-10):**
  - Abaixo do input de label, antes dos botoes de mode (linha ~165), adicionar botao `<Button variant="ghost" size="sm"><Volume2 /> Ouvir como vai soar</Button>`.
  - Click toca `speakUtterance(formLabel.trim(), voice, volume)` 1x.
  - Debounced 500ms (apos pausa na digitacao). Se usuario clicar antes do debounce, ignora-se o debounce e usa valor atual.
  - Disabled quando `formLabel.trim() === ''`, `formLabel.length > 80`, ou TTS unavailable.
  - Paridade com TournamentAlertDialog — mesmo comportamento de unlock alternativo.
- Props novas a `AlertsPanel`:
  - `voice: SpeechSynthesisVoice | null` — voz preferida resolvida via `pickVoice` no parent.
  - `volume: number` — volume preferido.
  - `ttsAvailable: boolean` — flag para hide/disable de previews.
  - `soundMode: 'tts'|'beep'|'mute'` — para hide previews em mute.

### `TournamentAlertDialog.tsx` (novo componente)
- Dialog (shadcn `Dialog`) com:
  - Header "Novo alerta de torneio".
  - Selector de torneio com logos.
  - 3 modos de horario.
  - Caixa de previa da narracao + botao "Ouvir previa".
  - Botoes Cancelar / Salvar.
- Integrado em `GrindSessionLive.tsx` proximo aos demais dialogs.

### `Settings.tsx`
- Nova secao "Alertas e Voz" com 6 controles (RF-06).
- Posicao: apos secao "Notificacoes" existente.

### `GrindSessionLive.tsx`
- Sem mudanca visual significativa.
- `handleStartSession` ganha unlock TTS silencioso.
- Handlers de alerta passam a propagar `narrationText` quando vindos do dialog de torneio.

---

## Telemetry

Logs client-side simples (console + futuro endpoint opcional). NAO requer endpoints de telemetria nesta sprint — apenas instrumenta para v2 de tunning.

| Evento | Quando | Payload |
|---|---|---|
| `tts.voice.detected` | Apos `getPtBRVoices` resolver | `{ count, names[] }` |
| `tts.voice.unavailable` | Quando array vazio + sessao ativa | `{ ua, platform }` |
| `tts.fallback.triggered` | Quando cai em beep por indisponibilidade | `{ reason: 'no_voice'\|'no_api'\|'reduced_data' }` |
| `tts.alert.fired` | A cada `fireAlert` modo tts bem-sucedido | `{ chars, repeatCount, hasTournamentNarration, priority }` |
| `tts.alert.dismissed_during_speech` | Dismiss durante narracao | `{ msIntoSpeech, dismissMethod: 'click'\|'esc'\|'space'\|'toast_close' }` |
| `tts.queue.dropped` | Queue lota ou item expira | `{ reason: 'cap_items'\|'cap_time' }` |
| `tts.flush.triggered` | Priority high interrompe normal | `{ interruptedAlertId }` |
| `tts.first_run.shown` | Toast amigavel exibido (P0-1) | `{ voiceCount }` |
| `tts.keyboard.dismiss` | Esc/Space cancelam (P0-3) | `{ key: 'Escape'\|' ' }` |
| `tournament_alert.created` | Salvar TournamentAlertDialog | `{ mode: 'before_start'\|'before_late'\|'absolute', minutesBefore?, redacted: boolean }` |
| `alert.preview.played` | Click em preview button (P1-9 ou P1-10) | `{ source: 'active_card'\|'custom_form'\|'tournament_dialog' }` |

Implementacao: `console.log` com prefixo `[tts]` por enquanto. Em v2, hookar em endpoint `/api/telemetry` (fora desta sprint).

---

## Acceptance criteria (suite resumida)

### Happy path
- [ ] Usuario inicia sessao (gesture captured), cria alarme custom "Faltam 5min", quando dispara ouve voz pt-BR narrando "Faltam 5min" **2x com 3s gap** (P1-4).
- [ ] Usuario abre TournamentAlertDialog, seleciona torneio Suprema/Sunday Plus/$100. Lista exibe torneio mais proximo no topo (P1-2). Modo "Antes do start" pre-preenchido com 10min (P1-1). Previa popula automaticamente.
- [ ] Como `ttsRedactBuyIn` default `true` (P0-2) e modo discreto ativo, narra "Suprema, Sunday Plus, atencao" no horario.
- [ ] "Ouvir previa" no dialog toca narracao 1x.
- [ ] Usuario muda volume para 0.3 em Settings, proximo alarme respeita volume.
- [ ] **First-run** (P0-1): primeira sessao com TTS funcional → toast amigavel "Alertas com voz ativados" por 6s, flag persistida.
- [ ] **First-run** segunda sessao: toast NAO aparece (flag `true`).

### Validacao de input
- [ ] Modal de torneio: triggerAt no passado mostra erro.
- [ ] Modal de torneio: duplicata mostra erro.
- [ ] Settings: alertVolume = 1.5 rejeitado pelo Zod (400).
- [ ] Settings: soundMode = 'invalid' rejeitado.
- [ ] PUT com `ttsFirstRunSeen: true` aceito (P0-1).

### Regras de negocio
- [ ] Modo `'beep'` em Settings → alarme toca beep 880Hz como antes.
- [ ] Modo `'mute'` → sem som, toast e notification ainda disparam. **Preview buttons hidden** (P1-9, P1-10).
- [ ] Repeticao loop (99) toca ate dismiss.
- [ ] Dismiss do alarme em curso (X ou Esc/Space) interrompe imediato + cancela timeouts.
- [ ] **Modo discreto ativo** + buyIn QUALQUER → narra "atencao", NUNCA valor (P1-7).
- [ ] **Modo discreto desativado** + buyIn 50 → narra "buy-in 50" (P1-7).
- [ ] **Modo discreto desativado** + buyIn 215 → narra "buy-in 215" (P1-7).
- [ ] Helper `buildTournamentNarration` NAO recebe `redactThresholdUSD` — assinatura limpa (P1-7).

### Edge cases
- [ ] Linux sem voz pt-BR → fallback beep + toast 1x.
- [ ] Chrome com voz carregando assincrono → espera `voiceschanged` antes de tocar.
- [ ] `speechSynthesis === undefined` (browser muito antigo) → fallback beep silencioso + toast.
- [ ] `prefers-reduced-data: reduce` → fallback beep.
- [ ] **P1-8 multi-tabling FLUSH**: late-reg (high) interrompe custom (normal) em curso.
- [ ] **P1-8 QUEUE**: 2 customs proximos → 2o aguarda 1o terminar (incluindo repeats).
- [ ] **P1-8 cap_items**: 5 alarmes em <5s → 1o + 2o (queue) + 3o (queue) tocam; 4o-5o descartados de audio (toast continua).
- [ ] **P1-8 cap_time**: item enqueued + queue lenta + >30s → descartado com log.
- [ ] **P1-5 scoped cancel**: dispense alarme A (parado ha 30s) durante narracao B → B continua tocando.
- [ ] `alertsSuspended` (Sessao B abre summary modal) → TTS cancelado, sem novos disparos, queue limpa.
- [ ] Voz preferida foi removida do SO entre sessoes → cai em primeira pt-BR.
- [ ] Limite 50 alarmes ativos respeitado em TournamentAlertDialog.

### Keyboard / acessibilidade (P0-3)
- [ ] Esc com TTS tocando + foco no body → cancela narracao, NAO fecha dialogs.
- [ ] Space com TTS tocando + foco no body → cancela narracao.
- [ ] Space com TTS tocando + foco em input → digita espaco normal, narracao continua.
- [ ] Esc com TTS tocando + dialog aberto → cancela narracao, dialog continua aberto.
- [ ] Esc sem TTS tocando + dialog aberto → comportamento nativo (fecha dialog).
- [ ] Listener de keydown removido apos `endSessionMutation` ter sucesso.
- [ ] Botao "Novo alerta de torneio" tem aria-label.
- [ ] "Ouvir previa" tem aria-label "Ouvir previa da narracao".
- [ ] Botao preview por alarme tem aria-label "Ouvir previa".
- [ ] Settings sliders tem labels associados.
- [ ] Toast de fallback tem role=status.

### Persistencia
- [ ] Settings salvos sobrevivem reload.
- [ ] `ttsFirstRunSeen` persiste entre sessoes (P0-1).
- [ ] alarmes session-scoped (em-memoria) — comportamento atual mantido.

### Defaults atualizados (P0-2 + P1-4)
- [ ] Usuario novo: `ttsRedactBuyIn === true` (P0-2).
- [ ] Usuario novo: `alertRepeatCount === 2` (P1-4).
- [ ] Usuario novo: `alertRepeatGapMs === 3000` (P1-4).
- [ ] Usuario existente sem registros nas novas colunas: ganha mesmos defaults (privacy-on por padrao). Documentado em release notes.

### Preview buttons (P1-9 + P1-10)
- [ ] Card de active alert mostra botao `Volume2` antes do X (P1-9).
- [ ] Click no preview do card toca narracao 1x sem afetar TTS em curso.
- [ ] Custom form mostra botao "Ouvir como vai soar" abaixo do label input (P1-10).
- [ ] Custom form preview disabled quando label vazio.
- [ ] Custom form preview funciona com debounce 500ms.
- [ ] Custom form preview disabled quando TTS unavailable.

---

## Decisoes pendentes (precisam validacao do founder)

### DP-01: Politica de repeticao default (R3 ambiguo)
Founder pediu "repete ate dispensa" mas nao definiu se "repete" = N vezes ou loop infinito.

**Opcoes:**
- (a) **1x apenas** — narra uma vez e para.
- (b) **N vezes com gap (default 3x, 5s gap)** — repete N vezes ou ate dismiss, o que vier primeiro. **<- DEFAULT SUGERIDO**.
- (c) **Loop infinito ate dismiss** — sem limite, so para via dismiss explicito.

**Recomendacao da spec:** opcao (b) com defaults `repeatCount=3`, `repeatGapMs=5000`. Permite usuario escolher 1x/2x/3x/5x/loop em Settings (RF-06). Loop disponivel para quem quer (campo aceita 99 = loop). Compromisso entre acessibilidade ("se eu nao vi, repete pra eu ouvir") e nao-spam ("se eu ignorei 3x, nao adianta repetir 50").

### DP-02: Cooldown suppression (clarificacao do dossie)
Dossie de pesquisa apontou que `cooldown_logs` roda PoS-sessao em rota separada. Durante `/grind-session-live` ativo, cooldown nunca esta em curso. Founder pediu "TTS NAO pode tocar quando cooldown ativo".

**Opcoes:**
- (a) Durante session live, suprimir TTS quando alguma sub-modal de cooldown abre (nao existe atualmente). NAO IMPLEMENTAR.
- (b) **Em geral, se usuario finalizou e esta em /cooldown, alertas que ainda dispararem ficam silenciosos.** **<- DEFAULT SUGERIDO**.
- (c) Outro caso?

**Recomendacao da spec:** opcao (b). Implementacao: ao montar componente de `/cooldown`, chamar `speechSynthesis.cancel()` e setar flag global. Como alarmes sao session-scoped (in-memory), eles nao sobrevivem ao endSession naturalmente — mas se usuario voltar para `/grind-session-live` apos cooldown, alarmes podem reaparecer. **Requer confirmacao do founder se vale implementar agora ou e edge case raro pra deixar pra v2.**

### DP-03: ~~Threshold para "buy-in alto"~~ → REDACAO BINARIA (RESOLVIDA por P1-7)
**STATUS:** RESOLVIDA em UX v1.1.

Founder aprovou P1-7: substituir threshold $100 por toggle binario puro. Quando `ttsRedactBuyIn === true`, narra "atencao" em vez do valor — independente do buyIn. Sem threshold configuravel.

Helper `buildTournamentNarration` perdeu param `redactThresholdUSD`. Justificativa: vergonha social nao escala linear com buy-in — usuario que ativa "Modo discreto" quer ZERO valores, nao "valores altos apenas".

### DP-03b: Limite de caracteres do label de alarme custom
Atual: 80 chars. Narracao de ~5s em pt-BR ≈ 90 chars (3 palavras/seg × 5s × 6 chars/palavra).

**Opcoes:**
- (a) **Manter 80 chars** — compatibilidade com UI atual, evita narracoes longas. **<- DEFAULT SUGERIDO**.
- (b) Subir para 120 chars — caber narracoes mais ricas mas pode passar de 5s.

**Recomendacao da spec:** manter 80. Para narracoes ricas (torneio), `narrationText` (que o usuario nao digita, e gerado) pode ser maior — limite maximo 200 chars por seguranca.

### DP-04: Tipo `'tournament'` separado em SessionAlert
Hoje temos `type: 'late-reg' | 'custom'`. Alarme de torneio criado via TournamentAlertDialog poderia ser `'tournament'` ou reusar `'custom'`.

**Opcoes:**
- (a) Reusar `'custom'` — minimiza mudanca de schema, mas perde semantica.
- (b) **Adicionar `'tournament'` como novo type** — semantica clara, permite icone diferente no AlertsPanel. **<- DEFAULT SUGERIDO**.

**Recomendacao da spec:** opcao (b). Adicionar `type: 'late-reg' | 'custom' | 'tournament'`. Icone `Trophy` no AlertsPanel para tipo tournament.

### DP-05: ~~Threshold USD para "buy-in alto"~~ → NAO APLICAVEL
**STATUS:** NA (vacuous) por P1-7.

Como redacao virou binaria, nao ha mais threshold para configurar. Campo `redactThresholdUSD` removido. Decisao DP-05 resolvida implicitamente pela mesma mudanca que resolveu DP-03.

### DP-06: Modo de som default para usuarios existentes
Defaults aplicam-se a registros antigos. `soundMode` default = `'tts'`. Mas se usuario existente nao tem voz pt-BR, primeira sessao mostraria toast "TTS indisponivel" sem ele ter pedido.

**Opcoes:**
- (a) **Default `'tts'` no schema, frontend auto-fallback para `'beep'` + toast amigavel "Voz nao detectada — usando beep" 1x na primeira deteccao.** **<- DEFAULT SUGERIDO**.
- (b) Default `'beep'` no schema, usuario opt-in TTS depois.

**Recomendacao da spec:** opcao (a). Defaults gerais de produto = melhor experiencia para maioria (Win/Mac com voz) sem prejudicar minoria (Linux cai em beep transparente).

### DP-07: Privacy default migration para usuarios existentes (P0-2)
Mudanca de `ttsRedactBuyIn` default de `false` → `true` afeta usuarios EXISTENTES via fallback de leitura (defaults aplicam-se a colunas NULL).

**Implicacao:** todo usuario existente que nunca tocou em settings, ao primeiro alarme de torneio pos-deploy, vai ouvir "atencao" em vez do valor. Pode estranhar.

**Opcoes:**
- (a) **Aceitar comportamento — privacy-by-default e melhor que opt-in tardio.** Documentar em release notes + first-run hint cobre informacao geral. **<- DEFAULT SUGERIDO**.
- (b) Back-fill explicito: setar `ttsRedactBuyIn = false` para usuarios existentes via script, manter `true` como default apenas para novos. Mais complexo, contradiz spirit de privacy-by-default.
- (c) Mostrar toast adicional na primeira sessao explicando "Modo discreto ativado por padrao" + link para Settings. Mais friction, mas educativo.

**Recomendacao da spec:** opcao (a). Release notes + first-run hint do P0-1 ja cobrem onboarding. Founder validar.


---

## Riscos

### R-01: Voz pt-BR Maria/Luciana sons robotica/incomoda
**Probabilidade:** media | **Impacto:** medio
**Mitigacao:** Fallback para Beep facil em Settings. Se reclamacao for sistemica, abrir v2 com cloud TTS (ElevenLabs/Google) — dossie ja documenta trade-offs e custos.

### R-02: Bug Chrome de 15s afeta narracoes longas
**Probabilidade:** muito baixa | **Impacto:** baixo
**Mitigacao:** Narracoes desta feature sao todas curtas (<5s). Limite de 80 chars em label custom + 200 chars em narrationText garante isso. **NON-ISSUE conforme dossie.**

### R-03: Mobile iOS Safari silencia TTS via switch fisico de mute
**Probabilidade:** baixa | **Impacto:** baixo
**Mitigacao:** Grindfy e desktop-first. Mobile sera fora de escopo formal (documentar).

### R-04: User gesture nao destrava engine em alguns navegadores
**Probabilidade:** baixa | **Impacto:** medio
**Mitigacao:** Botao "Iniciar Sessao" e click direto. "Ouvir previa" no dialog serve de unlock alternativo. Se usuario nunca clicar nem em sessao nem em previa, primeiro alarme silencia (toast funciona) — degradacao aceitavel.

### R-05: Race condition entre `voiceschanged` e primeiro alarme rapido
**Probabilidade:** baixa | **Impacto:** baixo
**Mitigacao:** `useTTSVoices` faz pre-load no mount de `GrindSessionLive` (componente de pagina), ja resolve antes de qualquer alarme criavel. Em caso extremo (alarme criado e disparado em <2s), cai em fallback beep.

### R-06: Privacy concern em sessao gravada (streamer/coaching)
**Probabilidade:** baixa | **Impacto:** baixo-medio
**Mitigacao:** Modo `'mute'` em Settings ja resolve completamente. `ttsRedactBuyIn` cobre o caso especifico de buy-in alto. Se demanda aparecer, v2 pode ter "modo discreto" que omite tudo exceto toast.

### R-07: alertsSuspended nao chega a tempo de cancelar TTS
**Probabilidade:** baixa | **Impacto:** baixo
**Mitigacao:** `useEffect` reage imediatamente a mudanca de prop. `speechSynthesis.cancel()` e sincrono. Latencia <50ms aceitavel.

### R-08: Narrar nome de torneio em ingles soa estranho com voz pt-BR
**Probabilidade:** alta | **Impacto:** baixo
**Exemplo:** "Suprema, Bounty Builder, buy-in 100" — Maria pronuncia "Bounty Builder" com sotaque PT.
**Mitigacao:** Aceitar nesta v1 — usuarios reconhecem nomes de torneios mesmo com pronuncia sotaque. v2 pode detectar idioma do nome e trocar voz.

### R-09: Schema migration `db:push` sem rollback
**Probabilidade:** baixa | **Impacto:** medio
**Mitigacao:** Defaults garantem zero downtime. Se for necessario reverter, rollback = `db:push` com schema antigo (drop colunas). **Validar com founder antes de db:push em prod.**

### R-10: Esc/Space global colide com inputs de form (P0-3)
**Probabilidade:** media | **Impacto:** medio (digitar em form pode cancelar alarme inesperadamente; vice-versa, querer cancelar e nao funcionar)
**Mitigacao:** Skip explicito em `input/textarea/select/contentEditable` no listener (RF-14). Cobrir testes com foco em diferentes elementos. Re-validar em PR review.

### R-11: Privacy migration silenciosa confunde usuarios existentes (P0-2 + DP-07)
**Probabilidade:** media | **Impacto:** baixo (usuario consegue desativar facilmente em Settings)
**Mitigacao:** First-run hint do P0-1 menciona "Settings" claramente. Release notes destacam mudanca. Documentar tambem em CLAUDE.md secao de breaking-changes silenciosos. Considerar opcao (c) de DP-07 se founder priorizar transparencia.

### R-12: Queue "stuck" (item em curso nunca termina) (P1-8)
**Probabilidade:** baixa | **Impacto:** medio (queue para de promover, alarmes seguintes silenciam)
**Mitigacao:** `utterance.onerror` tambem chama `_promoteNext()`. Timeout watchdog: se `_currentlySpeaking` esta setado por >30s (max alarme = ~7s), forca cleanup + promote. Telemetria `tts.alert.fired` permite detectar anomalia.

### R-13: P1-9 preview button overload visual (P1-9)
**Probabilidade:** baixa | **Impacto:** baixo
**Cards de active alert ja tem icone, label, countdown e X.** Adicionar `Volume2` aumenta densidade.
**Mitigacao:** Hide quando `soundMode === 'mute'` (ja na regra). Botao discreto `text-gray-500 hover:text-gray-300` para nao competir com X. Validar visualmente apos implementacao. Se ficar poluido, considerar dropdown menu de "acoes" agrupando preview + remover.

---

## Fora de escopo (explicito)
- Cloud TTS (ElevenLabs, Google, Polly).
- TTS em outras paginas (Coach, Cooldown, Bankroll).
- Multi-idioma (en-US para nomes de torneio em ingles).
- Voz customizada / clone.
- Endpoint dedicado de telemetria TTS (apenas console.log).
- Grafico/analise de uso de TTS no admin.
- Notificacoes push (browser Notification atual mantido sem mudanca).
- Mobile-first refinement.
- Suprimir TTS durante chamadas Discord/Zoom (impossivel detectar via browser).

---

## Dependencias
- **Sessao B** (paralela) — flag `alertsSuspended` exposta. Sem ela, RF-09 fica incompleto.
- `userSettings` schema + endpoint `PUT /api/user/settings` (existente).
- `SessionAlertManager` em `shared/generic-alerts.ts` (existente).
- `fireAlert` em `client/src/lib/fireAlert.ts` (sera modificado).
- Componente de logos de site (existente, reusado em TournamentAlertDialog).
- `normalizeBuyInToUSD` em `server/scoring/` (server-side; para client-side criar helper espelho ou expor via util compartilhado em `shared/`).

---

## Notas de implementacao (sugestoes)

### Estrutura de arquivos sugerida
```
client/src/
├── lib/
│   ├── fireAlert.ts                   # MODIFICADO — soundMode + repetições
│   ├── ttsVoices.ts                   # NOVO — getPtBRVoices, pickVoice, useTTSVoices
│   └── tournamentNarration.ts         # NOVO — buildTournamentNarration helper
├── components/grind-session-live/
│   ├── AlertsPanel.tsx                # MODIFICADO — botão "Novo alerta de torneio"
│   └── TournamentAlertDialog.tsx      # NOVO
├── pages/
│   ├── GrindSessionLive.tsx           # MODIFICADO — unlock + propagar settings
│   └── Settings.tsx                   # MODIFICADO — secao "Alertas e Voz"

shared/
├── generic-alerts.ts                  # MODIFICADO — narrationText + addTournamentAlert + type 'tournament'
└── schema.ts                          # MODIFICADO — 6 colunas + Zod
```

### Ordem sugerida de implementacao (test-writer + implementer)
1. Schema + Zod (RF-07) — 7 colunas (P0-1, P0-2, P1-4 incluidos).
2. `ttsVoices.ts` + tests (RF-02).
3. `tournamentNarration.ts` + tests (RF-05) — assinatura SEM threshold (P1-7).
4. `generic-alerts.ts` extensao + tests (RF-04).
5. `fireAlert.ts` refactor + tests (RF-01, RF-11, RF-12, RF-13 priority queue P1-8) — defaults P1-4.
6. Helpers de cancel: `stopAlertById` scoped (P1-5) e `stopAllAlerts`.
7. `Settings.tsx` secao + tests (RF-06) — labels P1-3, P1-6 incluidos.
8. `TournamentAlertDialog.tsx` + tests (RF-03) — modos progressivos P1-1, lista ordenada P1-2.
9. `AlertsPanel.tsx` modificacoes + tests — preview por alarme P1-9, preview no form custom P1-10.
10. `GrindSessionLive.tsx` integracao + tests — RF-09 (com priority + alertId), RF-10, RF-10b first-run hint P0-1, RF-14 keyboard P0-3.

### Lessons learned aplicaveis (Docs/architecture/lessons-learned.md)
- **#testing**: usar `data-testid` para selecionar TournamentAlertDialog elements (nao confiar em texto que muda com i18n futuro).
- **#schemas**: novos campos em userSettings vao com Zod `optional + default` (nao required puro).
- **#schemas**: vi.fn nao constructor — mockar `SpeechSynthesisUtterance` em tests com `vi.stubGlobal` + factory function.
- **#mocks idealizados**: validar shape REAL de `speechSynthesis.getVoices()` (retorna array de `SpeechSynthesisVoice`, nao plain object).
- **Hooks primeiro**: `useTTSVoices` antes de qualquer early return em components que usam.

### Test setup necessario
- `tests/setup.ts` ja tem polyfills Radix. Adicionar polyfill `SpeechSynthesisUtterance` global (mock simples).
- `vi.stubGlobal('speechSynthesis', mockSpeechSynthesis)` em tests de fireAlert.
- Mock de `getVoices()` retornando arrays vazios e populados para testar fallback.
