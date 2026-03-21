# Fluxo: Biblioteca de Torneios v2 + Redesign Grade Semanal

## Trigger
Navegacao para a pagina /grade-planner. A pagina agora exibe split panels: Biblioteca (esquerda) + Grade (direita).

## Atores
- Jogador de poker (usuario autenticado)
- Sistema de auto-sync Suprema (backend job)
- Sistema de limpeza de lixeira (backend job)

## Pre-condicoes
- Usuario autenticado com JWT valido
- Tabelas tournament_library e tournament_library_settings existem no banco
- user_settings tem campos grade_start_hour e grade_end_hour
- profile_states aceita valor 'OFF'

## Caminho Principal (Happy Path)

### Biblioteca
1. Usuario abre /grade-planner e ve split panels (biblioteca + grade)
2. Biblioteca mostra cards de torneios do catalogo pessoal
3. Usuario filtra por site, tipo, velocidade, buy-in range
4. Usuario importa torneios via Suprema, grind-live ou manual
5. Cards mostram logo do site, buy-in, badges de tipo/velocidade
6. Usuario pode mover torneio para lixeira (soft delete)
7. Lixeira permite restaurar ou deletar permanente (expira em 7 dias)

### Grade
8. Grade mostra 7 dias x N horas (configuraveis pelo usuario)
9. Cada dia tem perfil A, B, C ou OFF via segmented control
10. Celulas mostram chips de torneios planejados para aquele dia/horario/perfil
11. Click em celula vazia abre mini-form inline (CellPopover)
12. Click em chip abre popover com detalhes e acoes (remover, mover)
13. Overflow de chips mostra "+N torneios" com expansao

### Drag & Drop
14. Usuario arrasta LibraryCard da biblioteca para celula da grade
15. Drop cria novo planned_tournament com dados do library item
16. Torneio permanece na biblioteca (e catalogo, nao move)
17. Usuario arrasta chip entre celulas para reposicionar
18. Dia OFF rejeita drop com feedback visual (cursor proibido)

### Metricas
19. Header mostra 5 metricas consolidadas (WeeklySummaryBar)
20. Card expandivel inferior compara perfis A vs B vs C
21. OFF nao aparece na comparacao

## Caminhos de Erro
- API Suprema offline: sistema continua, tenta proximo ciclo de sync
- Biblioteca vazia: estado vazio com CTA para importar
- Todas 7 sessoes ja importadas: mensagem informativa
- Lixeira vazia: mensagem "Nenhum torneio na lixeira"
- Filtros sem resultado: "Nenhum torneio encontrado" + limpar filtros
- Perfil sem torneios na comparacao: "Sem dados"
- Range de horarios < 4h: erro de validacao
- Torneios fora do novo range: aviso informativo
- Drop em dia OFF: toast de rejeicao + cursor proibido
- Celula com 20+ torneios: scroll interno, layout preservado

## Regras de Negocio
- Suprema nao duplica: dedup por externalId na biblioteca + lixeira
- Grind-live filtra existentes: dedup por nome+site+buyIn na ativa + lixeira
- Dia OFF rejeita drop e oculta torneios (nao deleta)
- Mudar para OFF com torneios: aviso (oculta, nao deleta). Voltar para A/B/C restaura visibilidade
- Torneio arrastado permanece na biblioteca (catalogo)
- Lixeira expira em 7 dias (job automatico backend)
- Todo dia sempre tem perfil (nunca null), default OFF
- Perfis A, B e C sao todos jogaveis (C nao e OFF)
- Range de horarios: minimo 4h, maximo 20h, suporta wrap midnight (ex: 18-03)
- Velocidades: Normal, Turbo, Hyper (nao "Regular")
- Tipos: Vanilla, PKO, Mystery (campo `type`, nao `category`)

## Endpoints Envolvidos

### Biblioteca (12 novos)
- GET /api/tournament-library -- listar ativos
- POST /api/tournament-library -- adicionar manual
- PUT /api/tournament-library/:id -- editar
- PATCH /api/tournament-library/:id/trash -- soft delete
- POST /api/tournament-library/:id/restore -- restaurar
- DELETE /api/tournament-library/:id -- deletar permanente
- GET /api/tournament-library/trash -- listar lixeira
- GET /api/tournament-library/import/grind-live/available -- torneios importaveis
- POST /api/tournament-library/import/grind-live -- importar selecionados
- GET /api/tournament-library/settings -- config importacao
- PUT /api/tournament-library/settings -- atualizar toggles
- POST /api/tournament-library/sync/suprema -- sync manual

### Grade (3 novos)
- GET /api/grade-planner/hours -- range horarios do usuario
- PUT /api/grade-planner/hours -- atualizar range
- GET /api/grade-planner/profile-comparison -- metricas A vs B vs C

### Existentes (mantidos)
- CRUD planned-tournaments (GET, POST, PUT, DELETE)
- CRUD profile-states (GET, PUT)
- POST /api/active-days/toggle

## Cenarios de Teste Derivados

### Biblioteca
- [ ] Happy path: Biblioteca abre colapsada, expande ao arrastar divisor -> cards visiveis
- [ ] Happy path: Cards mostram logo + buy-in + nome + badges corretamente
- [ ] Happy path: Toggle Suprema ativa auto-sync, torneios aparecem apos sync manual
- [ ] Happy path: Importacao grind-live filtra duplicatas, mostra apenas novos
- [ ] Happy path: Adicionar manualmente com validacao -> torneio aparece na lista
- [ ] Happy path: Mover para lixeira -> torneio desaparece da lista ativa
- [ ] Happy path: Restaurar da lixeira -> torneio volta para lista ativa
- [ ] Happy path: Deletar permanente -> torneio removido do banco
- [ ] Erro: API Suprema offline -> toast de erro, sistema continua
- [ ] Edge case: Biblioteca com 0 torneios -> estado vazio com CTA
- [ ] Edge case: Todas 7 sessoes ja importadas -> mensagem informativa
- [ ] Edge case: Lixeira vazia -> mensagem "Nenhum torneio na lixeira"
- [ ] Edge case: Filtros sem resultado -> "Nenhum torneio encontrado" + limpar
- [ ] Dedup: Suprema nao duplica torneio com mesmo externalId (ativo ou lixeira)
- [ ] Dedup: Grind-live nao duplica torneio com mesmo nome+site+buyIn

### Grade
- [ ] Happy path: Configurar horario 18:00-08:00 -> grade mostra slots noturnos
- [ ] Happy path: Selecionar perfil A -> grade filtra torneios do perfil A
- [ ] Happy path: Click em celula vazia -> CellPopover com mini-form
- [ ] Happy path: Click em chip -> ChipPopover com detalhes + remover
- [ ] Happy path: Celula com 8 torneios -> mostra 3 chips + "+5 torneios"
- [ ] Happy path: Click em "+5" -> expande/mostra todos
- [ ] Erro: Range de horarios < 4h -> erro de validacao
- [ ] Edge case: Mudar para OFF com torneios -> aviso, oculta sem deletar
- [ ] Edge case: Voltar de OFF para A -> torneios reaparecem
- [ ] Edge case: Celula com 20+ torneios -> scroll interno, sem quebra de layout
- [ ] Regra: Todo dia tem perfil (nunca null), default OFF
- [ ] Regra: Perfis A, B, C sao jogaveis (C nao equivale a OFF)

### Drag & Drop
- [ ] Happy path: Arrastar LibraryCard para celula Ter 20:00 (perfil A) -> chip aparece
- [ ] Happy path: Torneio permanece na biblioteca apos drop (catalogo)
- [ ] Happy path: Arrastar chip de Seg 19:00 para Qua 20:00 -> chip move
- [ ] Erro: Drop em dia OFF -> cursor proibido, toast de rejeicao
- [ ] Edge case: Dia OFF visualmente desativado ANTES de tentar drag
- [ ] Feedback: Borda azul em celula ativa durante drag over
- [ ] Feedback: Borda vermelha em celula OFF durante drag over

### Metricas e Comparacao
- [ ] Happy path: WeeklySummaryBar mostra 5 metricas corretas
- [ ] Happy path: ProfileComparison mostra 7 metricas para A, B, C
- [ ] Regra: OFF nao aparece na comparacao
- [ ] Edge case: Perfil sem torneios -> coluna "Sem dados"
- [ ] Edge case: Dias OFF nao contam como "Dias Ativos" no header
