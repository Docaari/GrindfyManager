# Spec: UX Sprint 2 — Grind Experience Redesign

## Status
Proposta

## Resumo
Redesign de dois pontos criticos da experiencia de grind: (1) substituicao do break popup bloqueante por um sistema nao-intrusivo com feedback rapido e frequencia customizavel, e (2) adicao de "Inicio Rapido" no modal de sessao para eliminar friccao ao comecar a grindar. Ambos impactam diretamente a retencao de dados mentais e o engagement diario.

## Contexto
Este sprint faz parte do UX Audit Master Plan (`Docs/specs/ux-audit-master-plan.md`), Sprint 2 — "Grind Experience Redesign". Os dois fixes (FP-07 e FP-09) tem ICE 7.7 e foram priorizados como P0 por impactarem diretamente a coleta de dados mentais durante sessoes de grind.

**Problema atual:** Usuarios desativam breaks completamente (skipBreaksToday) porque o popup e intrusivo, perdendo todo tracking mental. Da mesma forma, o modal de inicio de sessao exige muita interacao, fazendo usuarios pularem campos importantes por pressa.

**Meta:** Aumentar a taxa de usuarios que usam breaks de ~20% para 50%+ e reduzir o tempo medio de inicio de sessao de ~30s para ~3s (1 clique).

## Usuarios
- **Grinder ativo:** Jogador que usa Grind Live diariamente, quer comecar rapido e nao ser interrompido em momentos criticos
- **Grinder disciplinado:** Jogador que faz warm-up antes de grindar e quer que os dados fluam automaticamente para a sessao

---

## FP-07: Break Feedback Nao-Bloqueante

### Arquivos Afetados
- `client/src/pages/GrindSessionLive.tsx` (linhas ~424-451 — timer logic)
- `client/src/components/BreakFeedbackPopup.tsx` (componente completo)
- `shared/schema.ts` (tabela `user_settings` — novo campo)
- Novo componente: `client/src/components/BreakBanner.tsx`

### Estado Atual
- Timer em `GrindSessionLive.tsx` usa `setInterval` a cada 30s, verifica se passaram 55min (primeiro break) ou 60min (subsequentes)
- Ao disparar, seta `setShowBreakDialog(true)` que abre o `BreakFeedbackPopup` como Sheet (drawer lateral direito)
- O drawer exige 5 sliders (foco, energia, confianca, inteligenciaEmocional, interferencias, todos 0-10) + notas opcionais
- Opcoes atuais: "Salvar Feedback", "Pular" (pula este break), "Lembrar em 5min" (snooze via custom event), "Pular Todos os Breaks Hoje"
- Snooze atual usa `setTimeout` de 5min fixo + `window.dispatchEvent(CustomEvent)` — funcional mas fixo
- Frequencia de break e hardcoded: 55min primeiro, 60min subsequentes
- Dados salvos na tabela `break_feedbacks`: foco, energia, confianca, inteligenciaEmocional, interferencias (integer 0-10 cada), notes (text)

### Requisitos Funcionais

#### RF-01: Banner de aviso pre-break
**Descricao:** Exibir um banner nao-bloqueante no topo da tela de Grind Live com countdown antes do break disparar.
**Regras de negocio:**
- O banner aparece 5 minutos antes do horario programado do break
- Exibe texto: "Break em X:XX" com countdown decrescente em tempo real
- O banner e fixo (sticky) no topo, acima do conteudo, com z-index alto mas sem bloquear interacao com a pagina
- Cor neutra (azul/cinza) para nao parecer alerta critico
- Ao atingir 0:00, o banner muda de estado para o "break ativo" (RF-02)
- Se o usuario ja desativou breaks (skipBreaksToday), o banner nao aparece
- O banner deve ser dismissible (botao X) — dismissar o banner equivale a "Pular este break"
**Criterio de aceitacao:**
- [ ] Banner aparece exatamente 5 minutos antes do break programado
- [ ] Countdown atualiza a cada segundo
- [ ] Banner nao bloqueia cliques em nenhum elemento da pagina abaixo dele
- [ ] Fechar o banner com X pula o break atual
- [ ] Banner nao aparece se skipBreaksToday esta ativo

#### RF-02: Opcoes de acao ao disparar o break
**Descricao:** Quando o countdown do banner atinge 0:00, o banner se transforma para oferecer 3 opcoes de acao.
**Regras de negocio:**
- O banner muda de cor (verde suave) e exibe 3 botoes inline:
  1. **"Responder Agora"** — abre o drawer lateral (Sheet) existente do `BreakFeedbackPopup` (nao modal bloqueante)
  2. **"Adiar 15min"** — fecha o banner e agenda reexibicao em 15 minutos
  3. **"Pular"** — fecha o banner sem feedback, incrementa contador de breaks pulados
- O banner permanece visivel ate o usuario escolher uma das 3 opcoes (nao auto-dismiss)
- Maximo de 3 adiamentos consecutivos por break. Apos 3 adiamentos, so mostra "Responder Agora" e "Pular"
- O drawer lateral (Sheet) do BreakFeedbackPopup continua existindo como esta — nao e removido, apenas o trigger muda (nao e mais auto-aberto, e aberto via clique em "Responder Agora")
**Criterio de aceitacao:**
- [ ] Ao atingir 0:00, banner mostra 3 botoes de acao
- [ ] "Responder Agora" abre o drawer lateral com os sliders
- [ ] "Adiar 15min" fecha o banner e reabre em 15 minutos
- [ ] "Pular" fecha o banner sem salvar nenhum dado
- [ ] Apos 3 adiamentos, botao "Adiar 15min" desaparece
- [ ] Contador de adiamentos reseta a cada novo break programado

#### RF-03: Modo Quick Feedback
**Descricao:** Adicionar um modo de feedback rapido com 1 unico slider que auto-distribui o valor para os 5 campos de break feedback.
**Regras de negocio:**
- No drawer lateral do BreakFeedbackPopup, adicionar toggle no topo: "Feedback Completo" / "Quick Feedback"
- Default do toggle: "Quick Feedback" (para incentivar resposta)
- Quick Feedback mostra 1 slider (0-10) com label "Como voce esta?" e descricao "Avaliacao geral do seu estado mental"
- A distribuicao do valor unico para os 5 campos segue este algoritmo:
  - Se o usuario tem historico de breaks (>= 3 breaks com feedback completo na mesma sessao OU nas ultimas 5 sessoes):
    - Calcular a proporcao relativa media de cada campo no historico
    - Aplicar essa proporcao ao valor unico informado
    - Exemplo: se historicamente foco=7, energia=6, confianca=8, IE=5, interferencias=6 (total=32), as proporcoes sao foco=21.9%, energia=18.7%, confianca=25%, IE=15.6%, interferencias=18.7%. Para um quick feedback de 7: foco=round(7*7/6.4)=clamped 7, energia=round(7*6/6.4)=7, confianca=round(7*8/6.4)=clamped 9, IE=round(7*5/6.4)=5, interferencias=round(7*6/6.4)=7
  - Se o usuario NAO tem historico suficiente:
    - Distribuicao uniforme: todos os 5 campos recebem o mesmo valor do slider
    - Exemplo: quick feedback 7 → foco=7, energia=7, confianca=7, IE=7, interferencias=7
  - Todos os valores resultantes sao clamped entre 0 e 10
- O calculo de proporcao e feito no frontend usando os dados de breaks ja carregados (sessionBreaks no componente)
- Ao salvar quick feedback, os 5 campos sao enviados normalmente para a API (nao muda o formato de dados salvo)
- O campo `notes` no quick feedback fica oculto (nao e exibido)
**Criterio de aceitacao:**
- [ ] Toggle "Quick Feedback" / "Feedback Completo" visivel no topo do drawer
- [ ] Quick Feedback mostra 1 slider com label "Como voce esta?"
- [ ] Com historico suficiente (>= 3 breaks), valores distribuidos proporcionalmente
- [ ] Sem historico, valores distribuidos uniformemente
- [ ] Valores salvos no banco sao identicos ao formato atual (5 campos integer 0-10)
- [ ] Trocar de Quick para Completo preserva os valores calculados nos sliders
- [ ] Trocar de Completo para Quick recalcula o valor unico como media dos 5 campos

#### RF-04: Frequencia de break customizavel
**Descricao:** Permitir que o usuario configure a frequencia dos breaks nas configuracoes.
**Regras de negocio:**
- Novo campo na tabela `user_settings`: `breakFrequencyMinutes` (integer, default 60)
- Opcoes permitidas: 30, 45, 60, 90 minutos
- Configuravel na pagina Settings (`client/src/pages/Settings.tsx`) na secao de preferencias de grind
- UI: Select/dropdown com as 4 opcoes, label "Intervalo entre breaks"
- O timer em `GrindSessionLive.tsx` deve ler este valor do user_settings (via API ou cache do React Query) em vez de usar constantes hardcoded
- O primeiro break continua sendo 5 minutos antes do intervalo configurado (ex: se 60min, primeiro break aviso aos 55min, break dispara aos 60min)
- Se o usuario nao tem user_settings (novo usuario), usar default de 60 minutos
- Mudanca de frequencia so toma efeito na proxima sessao (nao altera sessao em andamento)
**Criterio de aceitacao:**
- [ ] Campo `breakFrequencyMinutes` existe na tabela `user_settings` com default 60
- [ ] Select com opcoes 30/45/60/90 visivel na pagina Settings
- [ ] Timer em GrindSessionLive usa o valor configurado em vez de constantes hardcoded
- [ ] Novo usuario sem settings recebe default de 60 minutos
- [ ] Alterar a frequencia durante uma sessao ativa nao afeta a sessao em curso

---

## FP-09: Inicio Rapido de Sessao

### Arquivos Afetados
- `client/src/pages/GrindSession.tsx` (linhas ~732-758 — botao e modal)
- `client/src/components/grind-session/EpicStartSessionModal.tsx` (componente completo)
- `client/src/pages/MentalPrep.tsx` (fornece dados via localStorage e POST /api/preparation-logs)

### Estado Atual
- Botao "Iniciar Sessao" chama `checkExistingSessionBeforePreparation()` que verifica conflitos e abre o `EpicStartSessionModal`
- O modal `EpicStartSessionModal` tem 5 campos: Preparacao % (slider), Notas de Preparacao (textarea), Objetivos do Dia (textarea), Torneios Planejados (read-only), Cap de Telas (input number)
- Dados de warm-up passam via localStorage (`warmUpScore`, `warmUpData`, `warmUpIntegration`) — fragil
- MentalPrep.tsx ja faz POST para `/api/preparation-logs` antes de setar localStorage e redirecionar para /grind
- GrindSession.tsx le o localStorage no mount e popula `preparationPercentage` e `preparationNotes`

### Requisitos Funcionais

#### RF-05: Botao Inicio Rapido
**Descricao:** Adicionar um botao "Inicio Rapido" que cria sessao com 1 clique usando defaults inteligentes.
**Regras de negocio:**
- Substituir o botao unico "Iniciar Sessao" por dois botoes:
  1. **"Inicio Rapido"** (botao principal, destaque verde, maior) — cria sessao imediatamente
  2. **"Personalizar..."** (link/botao secundario, menor, abaixo ou ao lado) — abre o modal EpicStartSessionModal atual
- "Inicio Rapido" cria sessao com os seguintes valores default:
  - `preparationPercentage`: valor do warm-up se disponivel (via banco, RF-06), ou 0 se nao fez warm-up
  - `preparationNotes`: observacoes do warm-up se disponiveis, ou vazio
  - `dailyGoals`: vazio
  - `screenCap`: valor de `user_settings.gradeStartHour`... NAO. Valor fixo default 4, OU valor do ultimo `screenCap` usado pelo usuario (da sessao anterior mais recente)
  - `skipBreaksToday`: false
- Apos criar a sessao, navegar diretamente para `/grind-live` (mesmo comportamento atual do `handleStartSession`)
- Se existe sessao ativa hoje, o fluxo de conflito existente continua funcionando normalmente antes de exibir os botoes
**Criterio de aceitacao:**
- [ ] Dois botoes visiveis: "Inicio Rapido" (primario) e "Personalizar..." (secundario)
- [ ] "Inicio Rapido" cria sessao e navega para /grind-live em 1 clique
- [ ] Sessao criada via Inicio Rapido tem preparationPercentage do warm-up ou 0
- [ ] Sessao criada via Inicio Rapido tem screenCap da ultima sessao ou 4
- [ ] "Personalizar..." abre o modal EpicStartSessionModal existente sem mudancas
- [ ] Fluxo de conflito de sessao continua funcionando antes dos botoes aparecerem

#### RF-06: Integracao warm-up via banco (substituir localStorage)
**Descricao:** Carregar dados de warm-up do banco de dados em vez de localStorage para maior confiabilidade.
**Regras de negocio:**
- MentalPrep.tsx ja salva no banco via POST `/api/preparation-logs` — este dado e a fonte de verdade
- Ao montar GrindSession.tsx, fazer GET `/api/preparation-logs/latest` para buscar o warm-up mais recente do usuario
- Criterio de "warm-up recente": criado nas ultimas 4 horas e com `warmupCompleted = true`
- Se existe warm-up recente no banco, usar seus dados para popular os defaults do Inicio Rapido:
  - `preparationPercentage` = `preparationLog.mentalState`
  - `preparationNotes` = `preparationLog.notes` ou auto-gerar a partir de `exercisesCompleted`
- Manter localStorage como fallback temporario (para retrocompatibilidade) mas priorizar banco
- Ordem de prioridade: banco > localStorage > defaults (0/vazio)
- O endpoint GET `/api/preparation-logs/latest` ja existe? Verificar. Se nao, criar endpoint que retorna o preparation_log mais recente do usuario com `warmupCompleted = true` e `createdAt` nas ultimas 4 horas
**Criterio de aceitacao:**
- [ ] GET `/api/preparation-logs/latest` retorna warm-up mais recente (ultimas 4h, warmupCompleted=true)
- [ ] GrindSession.tsx busca warm-up do banco ao montar
- [ ] Se banco retorna warm-up, localStorage e ignorado
- [ ] Se banco nao retorna warm-up, tenta localStorage como fallback
- [ ] Se nenhum warm-up disponivel, usa defaults (0/vazio)

#### RF-07: Badge de warm-up no Inicio Rapido
**Descricao:** Mostrar indicador visual de que o warm-up foi concluido no botao de Inicio Rapido.
**Regras de negocio:**
- Se warm-up recente foi detectado (RF-06), mostrar badge no botao "Inicio Rapido":
  - Texto: "Warm-up concluido (XX%)" onde XX e o mentalState do warm-up
  - Posicao: abaixo do texto principal do botao, em fonte menor
  - Cor: verde se >= 70%, amarelo se >= 40%, laranja se < 40%
- Se warm-up NAO foi feito, mostrar texto sutil: "Sem warm-up" em cinza, abaixo do botao
- O badge e puramente informativo — nao bloqueia o Inicio Rapido
**Criterio de aceitacao:**
- [ ] Badge "Warm-up concluido (85%)" aparece quando warm-up recente existe
- [ ] Cor do badge muda conforme o percentual (verde/amarelo/laranja)
- [ ] Texto "Sem warm-up" aparece quando nao ha warm-up recente
- [ ] Badge nao aparece no botao "Personalizar..."

---

## Requisitos Nao-Funcionais
- **Performance:** Banner de countdown nao deve causar re-renders desnecessarios. Usar `useRef` para o timer, atualizar DOM diretamente ou usar estado local isolado (nao propagar para componentes pai)
- **Performance:** GET `/api/preparation-logs/latest` deve responder em < 100ms (query simples com index em userId + createdAt)
- **Mobile:** Banner de break deve ser responsivo — em telas < 768px, os 3 botoes de acao empilham verticalmente
- **Mobile:** Botoes "Inicio Rapido" e "Personalizar..." devem empilhar verticalmente em mobile
- **Acessibilidade:** Banner deve ter role="status" e aria-live="polite" para screen readers
- **Dados:** Nenhum dado de break feedback e perdido — Quick Feedback salva os mesmos 5 campos no banco

## Endpoints Previstos

| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| GET | /api/preparation-logs/latest | Retorna warm-up mais recente (ultimas 4h, warmupCompleted=true) | JWT |
| GET | /api/user-settings | Ja existe — inclui novo campo breakFrequencyMinutes | JWT |
| PUT | /api/user-settings | Ja existe — aceita novo campo breakFrequencyMinutes | JWT |

**Nota:** Os endpoints de user-settings ja existem. O unico endpoint novo e o GET `/api/preparation-logs/latest`. Verificar se o GET `/api/preparation-logs` existente pode ser filtrado ou se precisa de endpoint dedicado.

## Modelos de Dados Afetados

### user_settings (alteracao)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| breakFrequencyMinutes | integer | default 60 | Opcoes validas: 30, 45, 60, 90. Validar no backend |

### break_feedbacks (sem alteracao)
Tabela nao muda. Quick Feedback salva os mesmos 5 campos (foco, energia, confianca, inteligenciaEmocional, interferencias) com valores derivados do algoritmo de distribuicao.

### preparation_logs (sem alteracao)
Tabela nao muda. Ja tem todos os campos necessarios (mentalState, focusLevel, confidenceLevel, warmupCompleted, notes, exercisesCompleted).

### grind_sessions (sem alteracao)
Tabela nao muda. Campos preparationPercentage, preparationNotes, screenCap, skipBreaksToday ja existem.

## Integrações Externas
Nenhuma. Todos os dados sao internos.

---

## Cenarios de Teste Derivados

### FP-07: Break Feedback

#### Happy Path
- [ ] Usuario grinds por 55min, banner de aviso aparece com countdown de 5min
- [ ] Countdown chega a 0:00, banner mostra 3 opcoes
- [ ] Usuario clica "Responder Agora", drawer abre, preenche 5 sliders, salva — break_feedbacks criado no banco
- [ ] Usuario usa Quick Feedback com valor 7, 5 campos salvos com distribuicao proporcional baseada no historico
- [ ] Usuario configura frequencia para 45min nas Settings, proxima sessao usa intervalo de 45min

#### Validacao de Input
- [ ] breakFrequencyMinutes recebe valor invalido (ex: 120) via API — rejeita com 400
- [ ] breakFrequencyMinutes recebe valor valido (30/45/60/90) — aceita e salva
- [ ] Quick Feedback com valor 0 — todos os 5 campos salvos como 0
- [ ] Quick Feedback com valor 10 — distribuicao nao excede 10 em nenhum campo (clamp)

#### Regras de Negocio
- [ ] Apos 3 adiamentos consecutivos, botao "Adiar 15min" desaparece
- [ ] Contador de adiamentos reseta no proximo break programado
- [ ] Quick Feedback sem historico (usuario novo) distribui uniformemente
- [ ] Quick Feedback com historico (>= 3 breaks) distribui proporcionalmente
- [ ] Trocar toggle de Quick para Completo preserva valores calculados nos sliders
- [ ] Trocar toggle de Completo para Quick mostra media dos 5 valores no slider unico
- [ ] skipBreaksToday ativo impede banner de aparecer

#### Edge Cases
- [ ] Usuario pausa a sessao — timer de break pausa junto (ja implementado)
- [ ] Usuario com sessao de 30min e frequencia de 60min — nenhum break dispara
- [ ] Usuario sem user_settings no banco — timer usa default 60min
- [ ] Dois breaks quase simultaneos (edge case do interval) — apenas 1 banner por vez
- [ ] Usuario fecha e reabre aba durante countdown — banner recalcula posicao correta no timer
- [ ] Mobile: banner com 3 botoes empilhados verticalmente cabe na tela

### FP-09: Inicio Rapido

#### Happy Path
- [ ] Usuario sem warm-up clica "Inicio Rapido" — sessao criada com preparationPercentage=0, screenCap=4, navega para /grind-live
- [ ] Usuario faz warm-up (score 85%), vai para /grind, ve badge "Warm-up concluido (85%)", clica "Inicio Rapido" — sessao com preparationPercentage=85
- [ ] Usuario clica "Personalizar..." — modal EpicStartSessionModal abre normalmente com todos os campos
- [ ] GET /api/preparation-logs/latest retorna warm-up feito ha 2h com warmupCompleted=true

#### Validacao de Input
- [ ] GET /api/preparation-logs/latest sem auth — retorna 401
- [ ] GET /api/preparation-logs/latest sem nenhum log — retorna null/vazio (nao 404)

#### Regras de Negocio
- [ ] Warm-up feito ha 5 horas NAO e considerado recente (limite 4h)
- [ ] Warm-up com warmupCompleted=false NAO e retornado pelo endpoint /latest
- [ ] Prioridade: banco > localStorage > default — se banco retorna warm-up, localStorage e ignorado
- [ ] screenCap default: usa valor da sessao anterior mais recente, ou 4 se nenhuma sessao anterior
- [ ] Conflito de sessao (sessao ativa hoje) — fluxo de conflito aparece ANTES dos botoes Inicio Rapido / Personalizar

#### Edge Cases
- [ ] Usuario nunca fez warm-up e nunca grindou — Inicio Rapido funciona com todos os defaults
- [ ] Usuario fez warm-up mas nao completou (warmupCompleted=false) — tratado como "sem warm-up"
- [ ] Usuario limpa cache do browser — warm-up do banco ainda funciona (fallback localStorage nao disponivel)
- [ ] Mobile: botoes empilham verticalmente e sao tocaveis (min-height 44px)
- [ ] Dois cliques rapidos em "Inicio Rapido" — mutation nao dispara 2x (disabled durante isPending)

---

## Fora de Escopo
- Remocao completa do localStorage de warm-up (manter como fallback neste sprint; remocao total no Sprint 5 / FP-15)
- Mudanca no formato de dados da tabela `break_feedbacks` (Quick Feedback salva os mesmos 5 campos)
- Notificacoes push/desktop para breaks (ja existe requestPermission, mas integracao com banner e escopo futuro)
- Analytics de taxa de breaks completados vs pulados (sera adicionado em sprint futuro)
- Redesign visual completo do BreakFeedbackPopup drawer (manter o drawer atual, apenas adicionar toggle Quick/Completo)
- Mudanca no fluxo de conflito de sessao (FP-08, resolvido no Sprint 1)
- Mudanca no componente EpicStartSessionModal (mantido intacto; apenas o trigger muda)
- Suporte a frequencia de break customizada por sessao (sempre usa valor de user_settings)

## Dependencias
- **Sprint 1 concluido:** FP-08 (continuacao automatica de sessao) deve estar pronto, pois o fluxo de conflito e pre-requisito para o Inicio Rapido funcionar corretamente
- **Tabela user_settings existente:** O campo `breakFrequencyMinutes` sera adicionado via migration
- **Endpoint GET /api/preparation-logs existente:** Base para o novo endpoint `/latest`
- **BreakFeedbackPopup.tsx existente:** O componente sera estendido (toggle Quick/Completo), nao substituido

## Notas de Implementacao (opcional)
- O banner de countdown pode ser um componente `BreakBanner.tsx` separado, renderizado condicionalmente dentro de `GrindSessionLive.tsx`
- Para o timer do banner, considerar usar `requestAnimationFrame` ou um `setInterval` de 1s isolado dentro do componente banner (nao no parent)
- O algoritmo de distribuicao do Quick Feedback deve ser uma funcao pura exportada e testavel unitariamente (ex: `calculateQuickFeedbackDistribution(value: number, history: BreakFeedback[]): BreakFeedbackValues`)
- Para o endpoint `/api/preparation-logs/latest`, a query Drizzle seria algo como: `WHERE userId = ? AND warmupCompleted = true AND createdAt > NOW() - INTERVAL '4 hours' ORDER BY createdAt DESC LIMIT 1`
- Para o `screenCap` default do Inicio Rapido, buscar da sessao anterior: `SELECT screenCap FROM grind_sessions WHERE userId = ? AND screenCap IS NOT NULL ORDER BY date DESC LIMIT 1`
