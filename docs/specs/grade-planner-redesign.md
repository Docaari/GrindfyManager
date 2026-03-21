# Spec: Grade Planner Redesign — Grid Temporal + Suprema Multi-Entry

## Status
Aprovada

## Resumo
Redesign completo do Grade Planner: substituir layout de cards por grid temporal estilo calendario semanal, adicionar drag-and-drop, copiar dias, templates, multi-entry para torneios Suprema, e remover funcionalidades desnecessarias.

## Contexto
A pagina Grade Planner atualmente usa cards por dia com listas de torneios. Jogadores profissionais planejam por horario (time slots), nao por lista. A pesquisa mostrou que o padrao ideal e um grid 7 colunas (dias) x linhas de horario, com pills coloridas por site.

## Mudancas solicitadas pelo usuario
- REMOVER: warning de conflito <30min entre torneios
- REMOVER: indicador de mesas simultaneas
- ADICIONAR: multi-entry para torneios Suprema (quantos registros o jogador vai fazer)
- ADICIONAR: cada registro conta como torneio separado (mesmo sendo o mesmo torneio)
- IMPLEMENTAR: todas as melhorias de UX do plano aprovado

## Requisitos Funcionais

### RF-01: Remover warning de conflito
**Descricao:** Remover a deteccao de conflito <30min implementada no commit anterior.
**Criterio de aceitacao:**
- [ ] Funcao detectConflicts removida do PlanningDialog
- [ ] Sem warning de conflito em torneios proximos
- [ ] Sem badge AlertTriangle em torneios

### RF-02: Multi-entry Suprema
**Descricao:** No modal de import Suprema, cada torneio deve ter um seletor de quantidade (1-10) para definir quantos registros/entradas o jogador fara. Cada registro cria um torneio separado no planner.
**Regras:**
- Campo "Entradas" (1-10) por torneio no modal de import
- Default: 1 entrada
- Ao importar com N entradas, cria N registros do mesmo torneio
- Cada registro tem externalId unico (ex: "suprema-123-entry-1", "suprema-123-entry-2")
- Na grade, mostra badge "x2" ou "x3" se houver multiplas entradas do mesmo torneio base
- Apenas torneios Suprema podem ter multi-entry
**Criterio de aceitacao:**
- [ ] Seletor de quantidade (1-10) por torneio no modal Suprema
- [ ] 3 entradas = 3 torneios criados no planner
- [ ] Cada entrada tem externalId unico
- [ ] Badge de contagem visivel na grade

### RF-03: Grid temporal (layout overhaul)
**Descricao:** Substituir o layout de cards por dia por um grid temporal com 7 colunas e linhas de horario.
**Regras:**
- 7 colunas: Seg a Dom
- Linhas de horario: slots de 1 hora (configuravel), range 12:00-03:00 (padrao)
- Cada torneio renderiza como "pill" colorida por site no slot do seu horario
- Pill mostra: buy-in, nome abreviado, site (cor)
- Multiplos torneios no mesmo slot empilham verticalmente
- Tabs A/B/C no topo de cada coluna de dia
- Clicar na pill abre editor inline ou modal de edicao
- Clicar em slot vazio abre form de adicao rapida
**Criterio de aceitacao:**
- [ ] Grid 7 colunas renderiza corretamente
- [ ] Torneios posicionados no horario correto
- [ ] Multiplos torneios no mesmo slot empilham
- [ ] Perfil A/B/C tabs por dia funcionam
- [ ] Responsivo (scroll horizontal em mobile)

### RF-04: Drag-and-drop
**Descricao:** Arrastar torneios entre dias e horarios usando react-beautiful-dnd (ja instalado).
**Regras:**
- Drag pill de um dia para outro → muda dayOfWeek
- Drag pill de um horario para outro → muda time
- Drag da sidebar de biblioteca → adiciona ao slot
- Visual: ghost pill durante drag, highlight do slot alvo
**Criterio de aceitacao:**
- [ ] Drag entre dias funciona
- [ ] Drag para novo horario funciona
- [ ] Feedback visual durante drag

### RF-05: Copiar dia
**Descricao:** Botao "Copiar" por dia que permite copiar todos os torneios de um dia/perfil para outro dia.
**Regras:**
- Botao no header do dia: "Copiar para..."
- Abre dropdown com os outros 6 dias
- Copia todos os torneios do perfil ativo para o dia destino
- Se dia destino ja tem torneios, adiciona (nao substitui)
- Torneios copiados recebem novo ID
**Criterio de aceitacao:**
- [ ] Copiar Segunda A → Quarta A funciona
- [ ] Torneios copiados tem IDs unicos
- [ ] Nao substitui torneios existentes no destino

### RF-06: Sidebar com biblioteca de torneios
**Descricao:** Painel lateral com os torneios mais jogados do usuario para arraste rapido.
**Regras:**
- Lista os top 15 torneios do historico (agrupados por nome+site+buyIn)
- Pesquisa por nome/site
- Filtro por buy-in range
- Cada item mostra: site (cor), nome, buyIn, frequencia
- Arrastar da sidebar para o grid adiciona o torneio
- Clicar adiciona ao dia/perfil selecionado
**Criterio de aceitacao:**
- [ ] Sidebar mostra torneios do historico
- [ ] Busca filtra em tempo real
- [ ] Clicar adiciona ao dia ativo

### RF-07: Prioridade visual
**Descricao:** Torneios com prioridade alta (1) tem visual diferente de gap-fillers (3).
**Regras:**
- Prioridade 1 (must-play): borda solida + estrela dourada
- Prioridade 2 (normal): visual padrao
- Prioridade 3 (gap-filler): opacidade 60% + borda tracejada
**Criterio de aceitacao:**
- [ ] Prioridade 1 visualmente destacada
- [ ] Prioridade 3 visualmente secundaria

### RF-08: Summary bar fixo
**Descricao:** Barra no topo com totais da semana, atualizada em tempo real.
**Regras:**
- Mostra: total buy-in, total torneios, ABI, dias ativos, horas estimadas
- Sticky no topo ao fazer scroll
- Atualiza quando torneios sao adicionados/removidos
**Criterio de aceitacao:**
- [ ] Barra visivel no topo
- [ ] Totais corretos
- [ ] Atualiza em tempo real

### RF-09: Modo compacto vs expandido
**Descricao:** Toggle para alternar entre ver pills minimas (so buyIn+site) ou expandidas (nome completo + detalhes).
**Criterio de aceitacao:**
- [ ] Toggle visivel no header
- [ ] Modo compacto mostra apenas "$11 PS"
- [ ] Modo expandido mostra nome + tipo + speed

## Fora de Escopo
- Comparacao plano vs real (requer integracao com /grind)
- Bankroll safety check (requer configuracao de bankroll)
- Import do SharkScope (requer API paga)
- Historico de grades passadas

## Dependencias
- react-beautiful-dnd (ja instalado)
- Endpoints existentes: GET/POST/PUT/DELETE /api/planned-tournaments
- GET /api/suprema/tournaments
- GET /api/tournaments (para biblioteca)
