# Spec: UX Sprint 1 — Quick Wins de Alto Impacto

## Status
Proposta

## Resumo
Sprint agrupando 7 correcoes de UX frontend-only que eliminam friccoes criticas e medias na Grade Planner, Grind Session e Biblioteca de Torneios. Nenhum endpoint novo, nenhuma mudanca de backend ou banco de dados.

## Contexto
Auditoria UX completa (documentada em `Docs/specs/ux-audit-master-plan.md`) identificou 20 friction points em 5 sprints. Este e o Sprint 1, focado em fixes rapidos (3-4 dias) com alto impacto percebido pelo usuario. Todos os 7 itens sao puramente frontend e podem ser implementados e testados de forma independente.

## Usuarios
- **Jogador (usuario padrao):** Interage com Grade Planner, Grind Session e Biblioteca diariamente

---

## Requisitos Funcionais

### RF-01: Profile switch com Dialog styled (FP-04) [CRITICO]

**Arquivo:** `client/src/pages/GradePlanner.tsx` (linhas 59-84, funcao `setActiveProfile`)
**Modulo auxiliar:** `shared/grade-off-toggle.ts` (funcao `checkOffToggleWarning`)

**Descricao:** Substituir `window.confirm()` nativo por Dialog do shadcn/ui ao trocar perfil de um dia para OFF quando ha torneios planejados nesse dia.

**Comportamento atual:**
- Usuario clica para trocar perfil para OFF
- `checkOffToggleWarning()` retorna `{ needsWarning: true, tournamentCount: N }`
- Aparece `window.confirm()` nativo do browser com texto simples
- Sem preview dos torneios afetados, sem estilo, sem possibilidade de undo

**Comportamento esperado:**
- Quando `needsWarning` for `true`, abrir Dialog do shadcn/ui (componente `Dialog` ja usado no projeto via Radix)
- O Dialog deve exibir:
  1. Titulo: "Desativar dia [nome-do-dia]?"
  2. Descricao: "Este dia possui N torneio(s) planejado(s). Ao mudar para OFF, eles serao ocultados (nao deletados)."
  3. Lista dos torneios afetados mostrando: nome, horario, buy-in, site (dados ja disponiveis em `plannedTournaments`)
  4. Botao primario: "Confirmar" (executa a mutacao)
  5. Botao secundario: "Cancelar" (fecha o dialog, nenhuma acao)
- Quando `needsWarning` for `false` (dia sem torneios), executar mutacao diretamente sem dialog

**Regras de negocio:**
- A lista de torneios afetados deve ser filtrada pelo `dayOfWeek` correspondente ao dia que esta sendo desativado
- O dialog deve usar o mesmo estilo visual dos outros dialogs do projeto (ex: `DeleteDialog`, `EditDialog` do grade-planner)
- Nenhum torneio e deletado — apenas ocultado (comportamento ja existente, nao muda)

**Criterio de aceitacao:**
- [ ] `window.confirm()` removido de `setActiveProfile`
- [ ] Dialog shadcn/ui abre ao trocar para OFF quando ha torneios no dia
- [ ] Dialog lista os torneios afetados com nome, horario, buy-in e site
- [ ] Botao "Cancelar" fecha o dialog sem efeito
- [ ] Botao "Confirmar" executa a mutacao e fecha o dialog
- [ ] Troca para OFF em dia sem torneios funciona sem dialog (comportamento direto mantido)
- [ ] Troca entre perfis A/B/C nao dispara dialog (apenas OFF)

---

### RF-02: Celulas vazias na grade com indicacao de acao (FP-05) [MEDIO]

**Arquivo:** `client/src/pages/GradePlanner.tsx` e subcomponentes em `client/src/components/grade-planner/WeekGrid.tsx`

**Descricao:** Adicionar affordance visual nas celulas vazias da grade semanal para que usuarios novos entendam que podem adicionar torneios.

**Comportamento atual:**
- Celulas vazias na grade sao completamente em branco, sem nenhum indicador visual
- Usuario novo nao descobre que pode clicar ou arrastar torneios para a celula

**Comportamento esperado:**
- Celula vazia exibe icone "+" (lucide `Plus`) com opacity 30% centralizado
- Ao fazer hover na celula, o icone aumenta para opacity 60% e aparece texto "Clique ou arraste para adicionar" em tooltip ou subtitle sutil
- Primeira visita: nao implementar tooltip de onboarding neste sprint (fora de escopo)

**Regras de negocio:**
- O icone "+" so aparece em celulas de dias ativos (perfil A, B ou C). Dias OFF nao mostram o icone
- O icone nao deve interferir com a funcionalidade de drag-and-drop existente (react-beautiful-dnd)
- A interacao de clique na celula vazia deve manter o comportamento atual (se ja abre modal de adicao, manter; se nao, o icone e apenas indicativo)

**Criterio de aceitacao:**
- [ ] Celulas vazias de dias ativos mostram icone "+" com opacity 30%
- [ ] Hover na celula aumenta opacity do icone para 60%
- [ ] Hover exibe texto auxiliar "Clique ou arraste para adicionar"
- [ ] Dias OFF nao mostram o icone "+"
- [ ] Drag-and-drop continua funcionando normalmente
- [ ] Nao ha regressao visual quando celula tem torneios (icone some)

---

### RF-03: CTA contextual Grade para Grind (FP-06) [MEDIO]

**Arquivo:** `client/src/pages/GradePlanner.tsx`

**Descricao:** Adicionar banner contextual no topo da Grade Planner quando o usuario tem torneios planejados para o dia atual, com CTA para iniciar sessao de grind.

**Comportamento atual:**
- Nenhum link ou CTA conectando a grade planejada com o inicio de uma sessao de grind
- Usuario precisa navegar manualmente para /grind apos planejar

**Comportamento esperado:**
- Banner exibido acima da grade (abaixo do WeeklySummaryBar) quando:
  - O dia atual (hoje) tem perfil ativo (A, B ou C) E
  - Existem torneios planejados para o dia da semana atual
- Conteudo do banner:
  - Texto: "Voce tem X torneio(s) planejado(s) para hoje"
  - Botao: "Iniciar Grind" que navega para `/grind`
- O banner e dispensavel (botao X para fechar) e nao reaparece na mesma sessao de navegacao (estado local via useState, sem persistencia)
- Se nao ha torneios para hoje ou dia e OFF, o banner nao aparece

**Regras de negocio:**
- A contagem de torneios deve considerar apenas torneios do dia da semana atual com perfil ativo
- O dia da semana deve ser calculado com `new Date().getDay()` (0=domingo, 1=segunda, etc.) e mapeado para o formato usado pelo `plannedTournaments`
- A navegacao usa `useLocation` do Wouter (padrao do projeto)
- O banner nao pre-carrega torneios na sessao de grind (fora de escopo deste sprint)

**Criterio de aceitacao:**
- [ ] Banner aparece quando ha torneios planejados para hoje com perfil ativo
- [ ] Banner mostra a contagem correta de torneios
- [ ] Botao "Iniciar Grind" navega para `/grind`
- [ ] Banner nao aparece quando dia e OFF
- [ ] Banner nao aparece quando nao ha torneios para hoje
- [ ] Banner e dispensavel com botao de fechar
- [ ] Banner nao reaparece apos ser fechado (na mesma sessao de navegacao)

---

### RF-04: Continuacao automatica de sessao ativa (FP-08) [MEDIO]

**Arquivo:** `client/src/pages/GrindSession.tsx` (funcao `checkExistingSessionBeforePreparation`, linhas 390-403)
**Componente:** `client/src/components/grind-session/ConflictDialog.tsx`

**Descricao:** Quando uma sessao ativa (nao completa) existe para o dia atual, navegar automaticamente para /grind-live em vez de abrir dialog de conflito.

**Comportamento atual:**
- Ao clicar para iniciar sessao, `checkExistingSessionBeforePreparation()` verifica se ja existe sessao hoje
- Se existe, abre `ConflictDialog` com 3 opcoes: "Ir para Sessao Existente", "Criar Nova Sessao e Substituir", "Cancelar"
- Obriga o usuario a fazer 2-3 cliques extras em 90%+ dos casos (quase sempre quer continuar a existente)

**Comportamento esperado:**
- Se existe sessao para hoje com `status !== 'completed'`:
  - Navegar automaticamente para `/grind-live` sem abrir dialog
  - Exibir toast informativo: "Retomando sessao ativa de hoje"
- Se existe sessao para hoje com `status === 'completed'`:
  - Manter o dialog de conflito (usuario precisa decidir se quer criar nova ou ja terminou)
- Se nao existe sessao para hoje:
  - Abrir o fluxo normal de criacao (dialog de inicio)

**Regras de negocio:**
- A verificacao de status deve usar o campo `status` da sessao retornada pela API (`sessionHistory`)
- A navegacao para `/grind-live` deve preservar o mesmo mecanismo usado por `onEditSession` no ConflictDialog atual
- O `ConflictDialog` continua existindo para o caso de sessao completa, mas o texto pode ser ajustado para "Voce ja completou uma sessao hoje. Deseja iniciar uma nova?"
- O botao "Nova Sessao" deve permanecer acessivel em algum lugar da pagina (ex: dentro do menu ou como acao secundaria) para o caso raro de o usuario querer forcar uma nova sessao mesmo com ativa

**Criterio de aceitacao:**
- [ ] Sessao ativa (status != completed) para hoje redireciona automaticamente para /grind-live
- [ ] Toast informativo aparece ao redirecionar: "Retomando sessao ativa de hoje"
- [ ] Sessao completa para hoje abre dialog de conflito (comportamento preservado)
- [ ] Sem sessao hoje, fluxo normal de criacao funciona
- [ ] Existe forma de criar nova sessao mesmo quando ha sessao ativa (nao bloquear completamente)

---

### RF-05: Empty state na Biblioteca com filtros ativos (FP-18) [MEDIO]

**Arquivo:** `client/src/pages/TournamentLibraryNew.tsx` (linhas 709-719)

**Descricao:** Melhorar a mensagem de empty state quando filtros aplicados retornam 0 resultados, adicionando botao para limpar filtros.

**Comportamento atual:**
- Quando `filteredAndSortedGroups.length === 0`, exibe Card com:
  - Icone Trophy
  - "Nenhum Grupo Encontrado"
  - "Grupos sao criados automaticamente quando voce tem 50+ torneios similares."
  - "Ajuste os filtros ou importe mais historico de torneios."
- A mensagem e a mesma independente de ter filtros ativos ou nao
- Nao ha botao para limpar filtros

**Comportamento esperado:**
- Diferenciar dois cenarios de empty state:
  1. **Sem filtros ativos e sem dados:** Manter mensagem atual (importar mais historico)
  2. **Com filtros ativos e 0 resultados:** Exibir mensagem diferente:
     - Icone Search (lucide `Search`) em vez de Trophy
     - "Nenhum torneio encontrado com esses filtros"
     - "Tente ajustar seus criterios de busca ou limpe os filtros."
     - Botao: "Limpar Filtros" que reseta todos os filtros para valores default

**Regras de negocio:**
- "Filtros ativos" significa que pelo menos um filtro esta diferente do valor default (verificar estado dos filtros da pagina: busca, site, categoria, etc.)
- O botao "Limpar Filtros" deve resetar todos os campos de filtro para seus valores iniciais
- O estado de filtro "limpo" e o estado que a pagina tem ao ser carregada pela primeira vez

**Criterio de aceitacao:**
- [ ] Com filtros ativos e 0 resultados: exibe mensagem "Nenhum torneio encontrado com esses filtros"
- [ ] Com filtros ativos e 0 resultados: botao "Limpar Filtros" visivel
- [ ] Botao "Limpar Filtros" reseta todos os filtros para valores default
- [ ] Sem filtros e sem dados: mensagem original sobre importar historico mantida
- [ ] Apos limpar filtros, os grupos voltam a aparecer (se existem dados)

---

### RF-06: Tooltip no sistema de confidence A-F (FP-19) [MEDIO]

**Arquivo:** `client/src/pages/TournamentLibraryNew.tsx` (linhas 73-79)

**Descricao:** Tornar os tooltips de confidence (ja definidos no codigo) visiveis na UI como tooltip interativo nos badges A-F.

**Comportamento atual:**
- Objeto `confidenceGradeTooltips` esta definido no codigo (linhas 73-79) com textos para cada grade
- O tooltip e referenciado em `gradeTooltip` (linha 727) mas a forma de exibicao na UI precisa ser verificada — pode nao estar usando Tooltip do Radix/shadcn

**Comportamento esperado:**
- Cada badge de confidence (A, B, C, D, F) nos cards da biblioteca deve exibir Tooltip do shadcn/ui ao hover
- Conteudo do tooltip deve usar os textos ja definidos em `confidenceGradeTooltips`:
  - A: "A — 2000+ torneios, altamente confiavel"
  - B: "B — 1000-1999 torneios, confiavel"
  - C: "C — 500-999 torneios, moderado"
  - D: "D — 200-499 torneios, baixa confiabilidade"
  - F: "F — 50-199 torneios, dados insuficientes"
- Tooltip deve ter delay curto (~200ms) e posicao `top` por padrao

**Regras de negocio:**
- Usar componente `Tooltip` / `TooltipTrigger` / `TooltipContent` do shadcn/ui (ja disponivel no projeto via Radix)
- Se o projeto ja usa `TooltipProvider` em nivel mais alto, nao duplicar
- Os textos de tooltip sao os ja definidos no arquivo — nao alterar os thresholds

**Criterio de aceitacao:**
- [ ] Hover no badge de confidence mostra tooltip com texto explicativo
- [ ] Todos os 5 grades (A, B, C, D, F) tem tooltip funcional
- [ ] Tooltip usa componente shadcn/ui (nao title HTML nativo)
- [ ] Tooltip desaparece ao sair do hover
- [ ] Funciona corretamente em todos os cards da grid

---

### RF-07: Tooltip e cor contextual para volatilidade (FP-20) [BAIXO]

**Arquivo:** `client/src/pages/TournamentLibraryNew.tsx`

**Descricao:** Adicionar tooltip explicativo e coloracao contextual ao campo de volatilidade (SD Buyins) nos cards da biblioteca.

**Comportamento atual:**
- Campo `sdBuyins` e exibido como numero nos cards (ex: "SD 4.2 buyins")
- Existe variavel `volatilityColor` (linha 724) que ja aplica cores baseadas em `volatilityLevel` (low/medium/high)
- Nao ha tooltip explicando o que significa SD Buyins

**Comportamento esperado:**
- Tooltip ao hover no valor de SD Buyins:
  - "Desvio padrao em buy-ins. Menor = resultados mais previsiveis. Maior = mais variancia (swings maiores)."
  - Incluir referencia dos ranges: "Verde: <3 (baixa variancia) | Amarelo: 3-6 (media) | Vermelho: >6 (alta)"
- Cores ja existentes devem ser mantidas (verificar se `volatilityColor` esta sendo aplicada corretamente):
  - Verde (`text-emerald-400`): SD < 3
  - Amarelo (`text-yellow-400`): SD 3-6
  - Vermelho (`text-red-400`): SD > 6

**Regras de negocio:**
- Usar componente Tooltip do shadcn/ui (mesmo padrao do RF-06)
- Se o campo SD nao esta visivel em algum card (dados insuficientes ou null), nao exibir tooltip
- Nao alterar os thresholds de cor existentes

**Criterio de aceitacao:**
- [ ] Hover no valor de SD Buyins mostra tooltip explicativo
- [ ] Tooltip inclui descricao do significado e referencia dos ranges de cor
- [ ] Cores verde/amarelo/vermelho aplicadas corretamente conforme thresholds
- [ ] Tooltip nao aparece quando campo SD nao existe no card
- [ ] Componente Tooltip do shadcn/ui utilizado (consistencia com RF-06)

---

## Requisitos Nao-Funcionais

- **Performance:** Nenhum dos 7 fixes deve adicionar chamadas de API extras. Todos usam dados ja carregados em memoria (planned tournaments, session history, filtered groups).
- **Consistencia visual:** Todos os componentes novos (Dialog, Tooltip, Banner) devem seguir o design system existente (shadcn/ui + Tailwind + paleta escura do Grindfy).
- **Acessibilidade:** Dialogs devem ser fechaveis via ESC. Tooltips devem funcionar com focus alem de hover. Botoes devem ter aria-labels descritivos.
- **Responsividade:** Banner do RF-03 e empty state do RF-05 devem funcionar em mobile. Tooltips (RF-06, RF-07) podem usar title HTML nativo em mobile como fallback.

## Endpoints Previstos

Nenhum. Todos os 7 fixes sao frontend-only e utilizam dados ja disponiveis via queries existentes.

## Modelos de Dados Afetados

Nenhum. Nao ha alteracoes em schema, banco de dados ou API.

## Integracoes Externas

Nenhuma.

## Cenarios de Teste Derivados

### RF-01 — Profile switch Dialog

**Happy Path:**
- [ ] Trocar perfil para OFF em dia com torneios abre Dialog styled
- [ ] Confirmar no Dialog executa a troca e oculta torneios
- [ ] Cancelar no Dialog mantem perfil atual sem mudanca

**Validacao:**
- [ ] Trocar para OFF em dia sem torneios funciona sem Dialog (direto)
- [ ] Trocar entre A/B/C nunca abre Dialog
- [ ] Lista de torneios no Dialog corresponde exatamente aos do dia selecionado

**Edge Cases:**
- [ ] Dia com 10+ torneios renderiza lista sem quebrar layout do Dialog (scroll interno)
- [ ] Clicar ESC fecha o Dialog sem executar acao

### RF-02 — Celulas vazias com hint

**Happy Path:**
- [ ] Celula vazia em dia ativo mostra icone "+" com opacity reduzida
- [ ] Hover na celula aumenta visibilidade do icone

**Validacao:**
- [ ] Dia OFF nao mostra icone "+"
- [ ] Celula com torneio nao mostra icone "+"

**Edge Cases:**
- [ ] Drag-and-drop sobre celula com icone "+" funciona normalmente
- [ ] Celula vazia apos deletar ultimo torneio volta a mostrar icone "+"

### RF-03 — Banner Grade para Grind

**Happy Path:**
- [ ] Banner aparece quando ha torneios planejados para hoje (dia ativo)
- [ ] Botao "Iniciar Grind" navega para /grind
- [ ] Fechar banner com X oculta o banner

**Validacao:**
- [ ] Banner nao aparece quando dia e OFF
- [ ] Banner nao aparece quando nao ha torneios para hoje
- [ ] Contagem de torneios esta correta

**Edge Cases:**
- [ ] Banner fechado nao reaparece ao trocar de tab na grade
- [ ] Se usuario muda perfil do dia para OFF enquanto banner esta visivel, banner desaparece

### RF-04 — Continuacao automatica de sessao

**Happy Path:**
- [ ] Com sessao ativa (nao completa) hoje, navegar automaticamente para /grind-live
- [ ] Toast "Retomando sessao ativa de hoje" exibido

**Validacao:**
- [ ] Sessao completa hoje abre dialog de conflito (nao redireciona)
- [ ] Sem sessao hoje, fluxo normal de criacao funciona

**Edge Cases:**
- [ ] Multiplas sessoes no mesmo dia: considerar a mais recente
- [ ] Sessao com status "planned" (mas nao "active"): tratar como ativa (nao completa)

### RF-05 — Empty state com filtros

**Happy Path:**
- [ ] Filtros ativos retornando 0 resultados mostra mensagem diferenciada
- [ ] Botao "Limpar Filtros" reseta todos os filtros

**Validacao:**
- [ ] Sem filtros e sem dados mostra mensagem original de importacao
- [ ] Apos limpar filtros, resultados voltam a aparecer

**Edge Cases:**
- [ ] Apenas filtro de busca ativo (texto) sem outros filtros: detectado como "filtros ativos"
- [ ] Limpar filtros com campo de busca preenchido tambem limpa o texto

### RF-06 — Tooltip confidence

**Happy Path:**
- [ ] Hover no badge A mostra "A — 2000+ torneios, altamente confiavel"
- [ ] Cada grade (A-F) mostra tooltip correspondente

**Validacao:**
- [ ] Tooltip desaparece ao mover mouse para fora do badge
- [ ] Tooltip nao interfere com clique no card

### RF-07 — Tooltip volatilidade

**Happy Path:**
- [ ] Hover no campo SD Buyins mostra tooltip explicativo
- [ ] Cores verde/amarelo/vermelho correspondem aos thresholds (<3, 3-6, >6)

**Validacao:**
- [ ] Card sem dados de SD nao mostra tooltip
- [ ] Tooltip inclui referencia dos ranges de cor

---

## Fora de Escopo

Os seguintes itens NAO fazem parte deste sprint:

- **Sprint 2 (Grind Redesign):** FP-07 (break popup nao-bloqueante), FP-09 (inicio rapido de sessao)
- **Sprint 3 (Dashboard Polish):** FP-02 (upload com progresso), FP-11 (filtros persistentes URL), FP-12 (tabs mobile), FP-14 (sliders mentais)
- **Sprint 4 (Landing & Conversao):** FP-01 (landing PT-BR), FP-03 (Google OAuth)
- **Sprint 5 (Estudos & Final):** FP-16 (estudos/leaks), FP-17 (metricas estudo), FP-10 (export), FP-13 (correlacao mental), FP-15 (warm-up via banco)
- **Tooltip de onboarding / first-time user experience** (mencionado no FP-05 original mas removido para simplificar)
- **Pre-carregar torneios na sessao de grind** via banner (RF-03 apenas navega, nao passa dados)
- **Qualquer endpoint novo ou alteracao de backend**
- **Alteracoes em schema ou banco de dados**
- **Testes unitarios complexos** — cenarios sao visuais/comportamentais

## Dependencias

Nenhuma. Todos os 7 fixes usam componentes e dados ja existentes no projeto:
- shadcn/ui Dialog (ja usado em grade-planner: DeleteDialog, EditDialog)
- shadcn/ui Tooltip (ja disponivel no projeto)
- Lucide icons (ja usado extensivamente)
- Dados de `plannedTournaments`, `profileStates`, `sessionHistory`, `filteredAndSortedGroups` ja carregados via React Query

## Notas de Implementacao

1. **RF-01:** Criar componente `OffToggleDialog.tsx` em `client/src/components/grade-planner/` seguindo o padrao de `DeleteDialog.tsx`. O estado do dialog pode ficar no GradePlanner.tsx (useState para controle de abertura + dados pendentes).

2. **RF-02:** A modificacao provavelmente fica em `WeekGrid.tsx` ou no componente de celula da grade. Verificar se existe componente de celula individual.

3. **RF-03:** O banner pode ser um componente inline no GradePlanner.tsx ou extraido para `GrindCTABanner.tsx`. Usar `plannedTournaments` filtrado por `dayOfWeek` do dia atual e verificar `profileStates` para saber se o dia esta ativo.

4. **RF-04:** A mudanca principal esta na funcao `checkExistingSessionBeforePreparation` em GrindSession.tsx. Verificar campo `status` da sessao conflitante antes de decidir se abre dialog ou redireciona.

5. **RF-05:** Na TournamentLibraryNew.tsx, adicionar logica para detectar se filtros estao ativos (comparar estado atual com defaults). Renderizar empty state condicional baseado nessa verificacao.

6. **RF-06 e RF-07:** Verificar se `TooltipProvider` ja esta no App.tsx ou em algum wrapper. Se nao estiver, adicionar. Os dois fixes usam o mesmo padrao de Tooltip, podem compartilhar implementacao.
