# Fluxo: Enriquecimento de Dados da API Suprema Poker

## Trigger
- Usuario abre SupremaImportModal (Grade Planner ou Grind Live) para importar torneios
- Usuario edita lateRegMinutes em torneio planejado ou de sessao
- Usuario configura preferencias de alerta em /settings
- Timer client-side (30s) detecta deadline de late reg proximo no Grind Live

## Atores
- **Jogador (user)**: Importa torneios, visualiza dados enriquecidos, edita late reg, configura alertas, recebe notificacoes

## Pre-condicoes
- Integracao Suprema Poker funcional (API key configurada via /settings)
- API Pokerbyte retornando dados raw dos torneios
- Schema com 5 novos campos em planned_tournaments e session_tournaments
- Schema com 3 novos campos em user_settings (alertas)
- Schema com 1 campo alertMinutesBefore em planned_tournaments e session_tournaments

## Caminho Principal (Happy Path)

### Importacao Enriquecida
1. Usuario abre SupremaImportModal
2. Frontend chama GET /api/suprema/tournaments (dados raw)
3. mapRawTournament() mapeia os 5 campos enriquecidos (late, stack, maxPl, type, temponivelmMeta)
4. Modal exibe torneios com linha enriquecida (Late: HH:mm, Stack: Xk, etc.)
5. Usuario seleciona torneios e confirma importacao
6. POST /api/planned-tournaments (ou session-tournaments) com campos enriquecidos
7. Dados persistidos no banco

### Alerta de Late Reg (Grind Live)
1. Usuario abre Grind Live com sessao ativa
2. Hook useLateRegAlerts inicializa com preferencias do user_settings
3. Solicita Notification.requestPermission() (1 vez)
4. Timer setInterval(30s) inicia
5. Para cada torneio upcoming com lateRegMinutes, calcula deadline e remaining
6. Quando remaining <= threshold (override torneio ou default global), dispara alerta
7. Toast destructive + som 880Hz + browser notification (simultaneo)
8. Usuario clica "Registrar" no toast, status muda para "registered"

## Caminhos de Erro
- API Pokerbyte retorna campos null/0 -> mapeados como null (sem erro, sem exibicao)
- gameType desconhecido (nem NLH nem PLO5) -> mapeado como null
- lateRegMinutes negativo na edicao -> validacao Zod rejeita (frontend + backend)
- Browser bloqueia autoplay de audio -> Web Audio API falha silenciosamente (catch vazio)
- Notification.permission == "denied" -> sem browser notification, toast + som funcionam
- Late reg ja encerrado quando sessao inicia -> nenhum alerta disparado
- Torneio ja "registered" ou "active" -> nenhum alerta

## Regras de Negocio

### Mapeamento de Campos
- Valores 0, null, undefined da API -> null no Grindfy (0 nao faz sentido para late/stack/max)
- "PLO5" -> "PLO"; "NLH" -> "NLH"; qualquer outro -> null
- temponivelmMeta preservado como blindLevelMinutes (alem de derivar speed)

### Late Reg Deadline
- Calculado no frontend: startTime + lateRegMinutes (nunca persistido)
- Cores no Grind Live: verde (>30min), amarelo (10-30min), vermelho (<10min), cinza riscado (encerrado)
- Cores no Grade Planner: amarelo (<30min), vermelho (encerrado)
- Nao exibido para torneios com status "registered" ou "active"

### Hierarquia de Alertas
1. Se lateRegAlertEnabled == false -> NENHUM alerta (master switch)
2. Se torneio.alertMinutesBefore != null -> usa valor do torneio
3. Se torneio.alertMinutesBefore == null -> usa userSettings.lateRegAlertMinutes (default: 10)

### Deduplicacao
- Cada torneio dispara alerta APENAS 1 vez por sessao (Set<string> de IDs)
- Se lateRegMinutes e editado, ID e removido do Set (permite novo alerta se deadline valido)

### Preservacao na Cadeia
- API -> planned_tournament: 5 campos enriquecidos + alertMinutesBefore (null)
- planned_tournament -> session_tournament: todos os 6 campos copiados
- API -> session_tournament (direto): 5 campos enriquecidos + alertMinutesBefore (null)

## Endpoints Envolvidos
- GET /api/suprema/tournaments — busca torneios raw da API (sem alteracao)
- POST /api/planned-tournaments — aceita 5 campos enriquecidos + alertMinutesBefore (opcionais)
- GET /api/planned-tournaments — retorna campos enriquecidos (automatico via Drizzle)
- PUT /api/planned-tournaments/:id — aceita edicao de lateRegMinutes e alertMinutesBefore
- POST /api/session-tournaments — aceita 5 campos + alertMinutesBefore
- GET /api/grind-sessions/:id/tournaments — retorna campos enriquecidos
- PUT /api/user-settings — aceita 3 novos campos (lateRegAlertMinutes, lateRegAlertEnabled, lateRegAlertSound)
- GET /api/user-settings — retorna 3 novos campos com defaults

## Cenarios de Teste Derivados

### Mapeamento de Campos (RF-03)
- [ ] Happy path: late=60, stack=10000, maxPl=500, type="NLH", temponivelmMeta=12 -> todos salvos corretamente
- [ ] API late=0 -> lateRegMinutes=null
- [ ] API late=null -> lateRegMinutes=null
- [ ] API stack=0 -> startingStack=null
- [ ] API maxPl=0 -> maxPlayers=null
- [ ] API type="PLO5" -> gameType="PLO"
- [ ] API type="NLH" -> gameType="NLH"
- [ ] API type="OUTRO" -> gameType=null
- [ ] API type=null -> gameType=null
- [ ] API temponivelmMeta=12 -> blindLevelMinutes=12 E speed="Normal"
- [ ] API temponivelmMeta=0 -> blindLevelMinutes=null

### Exibicao no Modal (RF-04)
- [ ] Torneio com late=60 e startTime 19:00 exibe "Late: 20:00 (60min)"
- [ ] Torneio com stack=10000 exibe "Stack: 10k"
- [ ] Torneio com stack=500 exibe "Stack: 500" (sem "k")
- [ ] Torneio sem nenhum campo enriquecido nao exibe segunda linha
- [ ] Badge "NLH" azul e "PLO" roxo exibidos corretamente

### Exibicao no Grade Planner (RF-05)
- [ ] "Late ate HH:mm" exibido abaixo do nome do torneio
- [ ] Late reg expirado aparece em vermelho com "Late encerrado"
- [ ] Late reg proximo (<30min) aparece em amarelo/laranja
- [ ] Torneio manual sem dados enriquecidos nao exibe nada extra
- [ ] Badge NLH/PLO aparece junto a badges de tipo e speed

### Exibicao no Grind Live (RF-06)
- [ ] Countdown "faltam Xmin" atualiza a cada minuto sem reload
- [ ] Cor verde quando faltam >30min
- [ ] Cor amarela quando faltam 10-30min
- [ ] Cor vermelha quando faltam <10min
- [ ] Texto riscado em cinza quando late encerrou
- [ ] Late reg nao exibido para torneios "registered" ou "active"

### Preservacao na Cadeia (RF-07)
- [ ] POST /api/planned-tournaments aceita 5 campos enriquecidos
- [ ] GET /api/planned-tournaments retorna campos enriquecidos
- [ ] Torneio importado da grade para sessao preserva todos os campos
- [ ] Importacao direta Suprema -> Grind Live preserva campos

### Edicao de Late Reg (RF-08)
- [ ] Alterar lateRegMinutes de 60 para 90 recalcula deadline
- [ ] Limpar campo salva como null
- [ ] Valor -5 rejeitado (validacao frontend + backend)
- [ ] Valor >999 rejeitado
- [ ] Torneio manual pode receber lateRegMinutes pela primeira vez
- [ ] No Grind Live, edicao recalcula countdown e reseta alerta

### Preferencias de Alerta (RF-09)
- [ ] Default lateRegAlertMinutes=10 para usuario sem configuracao
- [ ] Default lateRegAlertEnabled=true
- [ ] Default lateRegAlertSound=true
- [ ] Alterar para 20 minutos persiste via PUT /api/user-settings
- [ ] Desabilitar alertas persiste lateRegAlertEnabled=false
- [ ] Override por torneio: alertMinutesBefore=5 usa 5min (ignora default 10)
- [ ] Torneio com alertMinutesBefore=null usa default global
- [ ] lateRegAlertEnabled=false desabilita TODOS, mesmo com override

### Notificacao Late Reg (RF-10)
- [ ] Toast destructive disparado quando remaining <= threshold
- [ ] Toast exibe nome, deadline HH:mm e minutos restantes
- [ ] Botao "Registrar" no toast muda status para "registered"
- [ ] Som 880Hz/200ms toca quando lateRegAlertSound=true
- [ ] Som NAO toca quando lateRegAlertSound=false
- [ ] Browser notification aparece quando permissao concedida
- [ ] Browser notification NAO aparece quando permissao negada (sem erro)
- [ ] Clicar browser notification foca aba do Grindfy
- [ ] Permissao solicitada apenas 1 vez ao abrir Grind Live
- [ ] Deduplicacao: mesmo torneio nao alerta 2 vezes
- [ ] Editar lateRegMinutes permite novo alerta se deadline valido
- [ ] Timer limpo ao sair da pagina (cleanup useEffect)
- [ ] Timer nao roda se sessao nao esta ativa
- [ ] Torneios "registered"/"active" nao disparam alerta

### Edge Cases
- [ ] Late reg que cruza meia-noite (23:00 + 120min = 01:00) calcula corretamente
- [ ] 10+ torneios com late reg na mesma sessao — alertas sequenciais sem conflito
- [ ] Usuario recarrega pagina — timer reinicia, Set reseta (aceitavel)
- [ ] Torneio Suprema antigo (pre-feature) tem campos null — funciona sem erro
- [ ] Multiple countdowns simultaneos no Grind Live sem lag
