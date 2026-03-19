# Fluxo: Planejamento de Grade Semanal

## Trigger
Usuario acessa a pagina de Grade Planner (`/coach`) para configurar sua grade semanal de torneios.

## Atores
- Usuario autenticado (jogador)
- Express API (planned tournaments, active days, profile states endpoints)
- PostgreSQL (Neon)

## Pre-condicoes
- Usuario autenticado com JWT valido
- Opcionalmente: torneios ja importados (para sugestoes da biblioteca)
- Opcionalmente: tournament_templates existentes (para auto-sugestoes)

## Caminho Principal (Happy Path)
1. Usuario acessa `/coach` (GradePlanner)
2. Frontend carrega em paralelo:
   a. GET `/api/active-days` — dias ativos da semana
   b. GET `/api/profile-states` — perfil ativo por dia (A/B/C)
   c. GET `/api/planned-tournaments` — torneios ja planejados
   d. GET `/api/tournament-templates` — templates disponiveis da biblioteca
3. Usuario define quais dias da semana sao ativos (toggle por dia)
   - POST `/api/active-days/toggle` {dayOfWeek}
4. Usuario define perfil por dia (A, B ou C) — diferentes configuracoes de volume/buyIn
   - PUT `/api/profile-states/:dayOfWeek` {activeProfile: "A"|"B"|"C"}
5. Usuario adiciona torneios ao dia/perfil:
   a. Seleciona de sugestoes da biblioteca (tournament_templates)
   b. Adiciona manualmente com site, nome, buyIn, horario, tipo, velocidade
   - POST `/api/planned-tournaments` {dayOfWeek, profile, site, time, buyIn, name, type, speed}
6. Usuario organiza torneios por horario e prioridade (drag and drop)
   - PUT `/api/planned-tournaments/:id` {prioridade, time}
7. Grade semanal visivel como calendario com torneios por dia e perfil
8. Opcionalmente: cria plano semanal com metas
   - POST `/api/weekly-plans` {weekStart, targetBuyins, targetProfit, targetVolume}

## Caminhos de Erro
- Tentativa de adicionar torneio em dia inativo -> frontend impede a acao
- BuyIn invalido (negativo, nao numerico) -> validacao Zod rejeita
- Horario duplicado no mesmo dia/perfil -> sistema permite (jogador multi-tabling)
- Falha na conexao -> dados nao salvos, frontend mostra erro

## Regras de Negocio
- 3 perfis (A, B, C) representam diferentes configuracoes de volume/buyIn por dia
- Cada dia da semana pode ter um perfil ativo (ou nenhum se o dia esta inativo)
- Torneios planejados estao vinculados a um dia da semana + perfil
- Templates da biblioteca servem como sugestao baseada no historico do jogador
- Prioridade dos torneios: 1=Alta, 2=Media (default), 3=Baixa
- Tipos: Vanilla, PKO, Mystery
- Velocidades: Normal, Turbo, Hyper
- Torneios planejados podem ser vinculados a um template_id da biblioteca
- Ao iniciar sessao de grind, torneios planejados do dia podem ser importados

## Endpoints Envolvidos
- GET `/api/active-days` — Dias ativos da semana
- POST `/api/active-days/toggle` — Alternar dia ativo/inativo
- GET `/api/profile-states` — Perfis ativos por dia
- PUT `/api/profile-states/:dayOfWeek` — Atualizar perfil do dia
- GET `/api/planned-tournaments` — Torneios planejados
- POST `/api/planned-tournaments` — Adicionar torneio planejado
- PUT `/api/planned-tournaments/:id` — Atualizar torneio planejado
- DELETE `/api/planned-tournaments/:id` — Remover torneio planejado
- GET `/api/weekly-plans` — Planos semanais
- POST `/api/weekly-plans` — Criar plano semanal
- GET `/api/tournament-templates` — Templates da biblioteca
- GET `/api/tournament-suggestions` — Sugestoes baseadas no historico

## Cenarios de Teste Derivados
- [ ] Happy path: Definir dia como ativo -> active_days atualizado
- [ ] Happy path: Definir perfil A para segunda-feira -> profile_states atualizado
- [ ] Happy path: Adicionar torneio planejado -> planned_tournament criado com dayOfWeek e profile
- [ ] Happy path: Editar horario de torneio planejado -> time atualizado
- [ ] Happy path: Remover torneio planejado -> DELETE funciona, torneio removido
- [ ] Happy path: Criar plano semanal com metas -> weekly_plan criado
- [ ] Erro: Adicionar torneio sem site -> validacao rejeita
- [ ] Erro: BuyIn negativo -> validacao rejeita
- [ ] Edge case: Mesmo horario, dois torneios (multi-tabling) -> ambos salvos
- [ ] Edge case: Trocar perfil do dia que ja tem torneios -> torneios permanecem no perfil antigo
- [ ] Edge case: Dia inativo com torneios planejados -> torneios ficam mas dia aparece como off
- [ ] Edge case: Torneio planejado vinculado a template -> templateId preenchido
- [ ] Integracao: Torneios planejados importados para sessao de grind -> fromPlannedTournament = true
