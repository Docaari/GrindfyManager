# Spec: Grade Planner UX Reform

## Status
Aprovada

## Resumo
Corrigir bugs criticos, melhorar UX e adicionar features faltantes na pagina Grade Planner e seus modais. Foco em reducao de friccao, validacao de inputs e features que jogadores de poker esperam.

## Contexto
A auditoria UX identificou 15 problemas: 4 bugs, 6 melhorias de UX, 3 features faltantes e 2 itens de dead code. O Grade Planner e uma pagina central do Grindfy usada diariamente por jogadores para planejar sua semana de torneios.

## Requisitos Funcionais

### RF-01: Fix profile toggle (bug)
**Descricao:** Clicar no perfil ativo nao deve desativa-lo. Clicar em outro perfil deve trocar.
**Regras:**
- Clicar perfil A quando A ativo → mantem A ativo
- Clicar perfil B quando A ativo → troca para B
- Clicar perfil C → sempre ativa C (dia off)
**Criterio de aceitacao:**
- [ ] Perfil ativo nao pode ser desativado por clique
- [ ] Trocar entre A e B funciona sem fechar modal

### RF-02: Validacao de horario
**Descricao:** Campo de horario deve aceitar apenas HH:MM valido (00:00-23:59).
**Regras:**
- Formato obrigatorio: HH:MM
- HH: 00-23, MM: 00-59
- Input type="time" no HTML (nativo do browser)
**Criterio de aceitacao:**
- [ ] "25:99" rejeitado com mensagem de erro
- [ ] "20:30" aceito
- [ ] Input usa type="time" nativo

### RF-03: Modal atualiza ao trocar perfil
**Descricao:** Se o perfil muda enquanto PlanningDialog esta aberto, o conteudo deve atualizar.
**Criterio de aceitacao:**
- [ ] Trocar perfil com modal aberto → torneios atualizam
- [ ] Form nao submete para perfil errado

### RF-04: Remover duplo refetch
**Descricao:** Apos mutacoes, usar apenas invalidateQueries (nao invalidate + refetch).
**Criterio de aceitacao:**
- [ ] Apenas 1 request apos adicionar/editar/deletar torneio

### RF-05: Switch de perfil dentro do modal
**Descricao:** Adicionar tabs A/B no header do PlanningDialog para trocar perfil sem fechar.
**Criterio de aceitacao:**
- [ ] Tabs A/B visiveis no header do modal
- [ ] Clicar troca torneios e form para o perfil selecionado
- [ ] Perfil C nao aparece (dia off nao tem torneios)

### RF-06: Sugestoes visivelmente clicaveis
**Descricao:** Cards de sugestao devem ter hover claro, cursor pointer, e badge "Clique para adicionar".
**Criterio de aceitacao:**
- [ ] Hover muda background visivelmente
- [ ] Cursor pointer no card inteiro
- [ ] Primeiro uso mostra tooltip "Clique para preencher o formulario"

### RF-07: Botao Adicionar desabilita em erro
**Descricao:** Botao "Adicionar" fica disabled quando form tem campos obrigatorios vazios.
**Criterio de aceitacao:**
- [ ] Botao disabled ate site + time + type + speed + buyIn preenchidos
- [ ] Botao mostra spinner durante submit

### RF-08: Deteccao de conflito de horario
**Descricao:** Avisar quando 2+ torneios tem horario sobreposto (mesma hora ou dentro de 30min).
**Regras:**
- Conflito: diferenca < 30 minutos entre horarios de inicio
- Mostrar badge de warning no torneio conflitante
- Nao bloquear (apenas avisar)
**Criterio de aceitacao:**
- [ ] Torneio 20:00 + torneio 20:15 → ambos mostram warning
- [ ] Torneio 20:00 + torneio 21:00 → sem warning

### RF-09: Responsividade do PlanningDialog
**Descricao:** Modal adapta para mobile (1 coluna em telas < 768px).
**Criterio de aceitacao:**
- [ ] Em mobile, form aparece abaixo da lista de torneios (nao ao lado)
- [ ] Pie charts reduzem ou ocultam em mobile

### RF-10: Remover dead code
**Descricao:** Remover isDashboardExpanded state e any types.
**Criterio de aceitacao:**
- [ ] isDashboardExpanded removido
- [ ] editingTournament tipado corretamente

### RF-11: Templates de torneios favoritos
**Descricao:** Botao "Favoritos" que lista os 10 torneios mais jogados do usuario para adicao rapida.
**Regras:**
- Buscar do historico de torneios (GET /api/tournaments com limit)
- Agrupar por nome+site+buyIn, ordenar por frequencia
- 1 clique preenche o form com os dados do favorito
**Criterio de aceitacao:**
- [ ] Lista mostra top 10 torneios mais jogados
- [ ] Clicar preenche site, nome, buyIn, type, speed

### RF-12: Reducao de variacoes falsas nas sugestoes
**Descricao:** Remover generateTournamentVariations ou marcar variacoes claramente.
**Regras:**
- Sugestoes reais (historico) aparecem primeiro
- Variacoes aparecem em secao separada "Variacoes" com badge
- Limite: max 5 reais + max 3 variacoes
**Criterio de aceitacao:**
- [ ] Sugestoes reais separadas de variacoes
- [ ] Variacoes tem badge "Variacao"

## Fora de Escopo
- Drag-and-drop para reordenar torneios (complexidade alta, futuro)
- Comparacao plano vs real (requer integracao com grind sessions, futuro)
- Bankroll safety check (requer configuracao de bankroll, futuro)
- Duracao customizada por torneio (requer campo adicional no schema, futuro)

## Dependencias
- Nenhuma nova dependencia de pacote
- Endpoints existentes: GET /api/planned-tournaments, GET /api/tournaments
