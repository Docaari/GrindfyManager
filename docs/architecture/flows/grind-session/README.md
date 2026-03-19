# Fluxo: Sessao de Grind em Tempo Real

## Trigger
Usuario clica em "Iniciar Sessao" na pagina de Grind Session (`/grind`) ou entra na sessao ativa em `/grind-live`.

## Atores
- Usuario autenticado (jogador)
- Express API (grind session + session tournaments endpoints)
- PostgreSQL (Neon)

## Pre-condicoes
- Usuario autenticado com JWT valido
- Opcionalmente: torneios planejados na grade para o dia (planned_tournaments)
- Opcionalmente: preparacao mental concluida (MentalPrep)

## Caminho Principal (Happy Path)
1. Usuario acessa `/grind` e visualiza sessoes existentes (planned/active/completed)
2. Usuario cria nova sessao: POST `/api/grind-sessions` com data, goals, screenCap
3. Backend cria grind_session com status `planned`
4. Usuario inicia preparacao mental (opcional): registra mentalState, focusLevel, confidenceLevel
5. Backend salva preparation_log vinculado a sessao
6. Usuario inicia a sessao: PUT `/api/grind-sessions/:id` com status `active`, startTime
7. Backend atualiza sessao para `active`
8. Frontend redireciona para `/grind-live` (dashboard em tempo real)
9. Usuario adiciona torneios a sessao:
   a. Importa da grade planejada (planned_tournaments -> session_tournaments)
   b. Adiciona manualmente (POST session_tournaments)
10. Usuario atualiza status dos torneios durante o grind (upcoming -> registered -> active -> finished)
11. Para cada torneio finalizado: registra result, position, bounty, prize
12. Periodicamente, usuario registra feedback de break: foco, energia, confianca, IE, interferencias (0-10)
13. Backend salva break_feedback vinculado a sessao
14. Ao finalizar: usuario encerra sessao
15. Backend calcula metricas finais: profitLoss, duration, tournamentsPlayed, finalTables, medias de breaks
16. Backend atualiza sessao com status `completed`, endTime, metricas calculadas
17. Sessao aparece no historico (`/grind` -> SessionHistory)

## Caminhos de Erro
- Sessao ja ativa para o usuario -> previne criacao de nova sessao ativa
- Torneio com buyIn invalido -> validacao Zod rejeita
- Falha ao atualizar torneio -> 500, sessao permanece ativa
- Token JWT expirado durante sessao longa -> refresh token automatico pelo frontend
- Perda de conexao durante grind -> dados nao salvos (sem offline mode)

## Regras de Negocio
- Um usuario pode ter apenas uma sessao `active` por vez
- Torneios planejados (planned_tournaments) podem ser importados para session_tournaments
- Break feedbacks medem 5 dimensoes: foco, energia, confianca, inteligencia_emocional, interferencias (0-10)
- Metricas finais sao calculadas automaticamente ao encerrar: medias de breaks, profit total, volume
- screenCap define o numero maximo de telas/torneios simultaneos planejados
- Torneios na sessao tem prioridade: 1=Alta, 2=Media, 3=Baixa
- Tipos de torneio: Vanilla, PKO, Mystery
- Velocidades: Normal, Turbo, Hyper
- Status do torneio na sessao: upcoming -> registered -> active -> finished
- Sessao pode ser cancelada (status `cancelled`)

## Endpoints Envolvidos
- GET `/api/grind-sessions` — Lista sessoes do usuario
- GET `/api/grind-sessions/history` — Historico com filtros
- POST `/api/grind-sessions` — Cria nova sessao
- PUT `/api/grind-sessions/:id` — Atualiza sessao (start, end, metricas)
- DELETE `/api/grind-sessions/:id` — Deleta sessao
- GET `/api/grind-sessions/:sessionId/tournaments` — Torneios da sessao
- POST `/api/grind-sessions/reset-tournaments` — Reset torneios
- GET `/api/session-tournaments/weekly-suggestions` — Sugestoes semanais
- POST `/api/break-feedbacks` — Registra feedback de break
- POST `/api/preparation-logs` — Registra log de preparacao

## Cenarios de Teste Derivados
- [ ] Happy path: Criar sessao -> status planned, id retornado
- [ ] Happy path: Iniciar sessao -> status muda para active, startTime registrado
- [ ] Happy path: Adicionar torneio a sessao -> session_tournament criado com sessionId
- [ ] Happy path: Finalizar torneio -> result, position, prize registrados
- [ ] Happy path: Registrar break feedback -> 5 dimensoes salvas (0-10)
- [ ] Happy path: Encerrar sessao -> status completed, metricas calculadas, endTime
- [ ] Erro: Criar sessao sem data -> validacao Zod rejeita
- [ ] Erro: Adicionar torneio sem buyIn -> validacao rejeita
- [ ] Edge case: Importar torneios da grade planejada -> fromPlannedTournament = true
- [ ] Edge case: Sessao com 0 torneios encerrada -> metricas zeradas, ainda valida
- [ ] Edge case: Dois breaks na mesma sessao -> medias calculadas corretamente
- [ ] Edge case: Cancelar sessao ativa -> status muda para cancelled
- [ ] Edge case: Preparacao mental registrada antes da sessao
- [ ] Calculo: profitLoss = soma de (prize - buyIn) de todos torneios finished
- [ ] Calculo: Medias de break corretas com multiplos feedbacks
