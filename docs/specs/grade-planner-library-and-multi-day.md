# Spec: Grade Planner — biblioteca encurtada + adicionar torneio a varios dias

## Status
Aprovada (founder, 2026-08-02)

## Modelo e esforco
Rota nova nao ha; escopo e UI + helper puro + orquestracao de N POSTs existentes.
**Sonnet 5 / `medium`** para os componentes e o layout; **Sonnet 5 / `high`** para
o helper `resolveMultiDayTargets` e a orquestracao de criacao em lote (dado do
jogador entra na grade — erro parcial nao pode virar grade errada em silencio).
Zona critica NAO e tocada (sem parser CSV, sem FX, sem schema, sem ordem de rota).

## Resumo
Duas mudancas na aba "Grade" do `/coach`: (1) a Biblioteca de Torneios para de
crescer junto com a grade — ganha altura ancorada no viewport, fica fixa na tela
e a lista rola por dentro; (2) o jogador passa a colocar o mesmo torneio em
varios dias da semana de uma vez, tanto no modal de criacao quanto clicando num
card da biblioteca (o arrasto continua funcionando como hoje).

## Contexto
A grade fica na esquerda e cresce com o conteudo (`PanelGroup min-h-[800px]`,
`client/src/pages/GradePlanner.tsx:1155`). A Biblioteca fica no painel da direita
com `h-full`, entao herda essa altura: a lista vira uma coluna de centenas de
cards, o rodape com o contador some da tela e o jogador rola a pagina inteira pra
achar um torneio.

Montar grade e trabalho repetitivo: o mesmo torneio das 20:00 costuma entrar de
segunda a sexta. Hoje isso e um arrasto por dia (5 arrastos) ou 5 aberturas do
modal. O caminho de criacao ja e unico (`TournamentFormDialog` via
`DayCreateTournamentDialog`), e o card da biblioteca so responde a arrasto
(`Draggable` + `mapLibraryToPlanned`) — clicar nele nao faz nada.

## Usuarios
- **Jogador (grade semanal)**: monta a grade no `/coach?tab=planner`; e quem
  sofre a lista longa e a repeticao dia a dia.

## Decisoes tomadas (founder, 2026-08-02)
- **D1** — Biblioteca: altura fixa + scroll interno. Renderiza todos os itens
  filtrados; nao pagina, nao virtualiza.
- **D2** — Clique no card da biblioteca abre o **modal completo de torneio**
  (`TournamentFormDialog`) ja preenchido com os dados da biblioteca, com a secao
  de dias.
- **D3** — Dia marcado que esta OFF ou sem perfil ativo: **pula e avisa**. Nao
  altera perfil do jogador.
- **D4** — Modal de criacao: campo "Dias" com os 7 chips; o dia de origem ja
  vem marcado.

## Requisitos Funcionais

### RF-01: Biblioteca com altura ancorada no viewport
**Descricao:** o painel da Biblioteca (`BibliotecaPanel`, modo expandido e modo
colapsado) para de acompanhar a altura da grade. Passa a ter altura maxima
ancorada no viewport e a acompanhar o scroll da pagina (sticky), de modo que
busca, filtros e contador continuem visiveis enquanto a lista rola por dentro.

**Regras de negocio:**
- A altura maxima do painel e derivada do viewport (`max-h-[calc(100vh - <offset do header>)]`),
  nunca um pixel fixo escolhido no olho. O offset sai da soma do chrome acima do
  painel — nao chutar valor solto (`.claude/rules/14-frontend-ui.md`).
- O painel gruda no topo (`sticky`) dentro do seu `Panel`, e continua visivel
  enquanto o jogador rola a grade.
- Existe **exatamente um** container de scroll vertical dentro do painel: a
  lista (`Droppable droppableId="library"`). Cabecalho, busca, filtros, secao
  "Importar", toggle da lixeira e contador ficam fora dele. `react-beautiful-dnd`
  nao suporta scroll container aninhado — foi o que matou o drag na regressao
  `a6b2925c` citada em `GradePlanner.tsx:1148`.
- O rodape com `{filtrados} de {total} torneios` fica sempre visivel (nao rola
  com a lista).
- A secao "Importar" (Manual / Historico / Suprema) e o toggle da Lixeira ficam
  recolhidos por padrao atras de um disclosure, para devolver altura util a
  lista. Estado do disclosure nao precisa persistir.
- Comportamento identico no modo colapsado (`collapsed`) do painel.
- Mobile (`isMobile`) mantem o container atual `h-[calc(100vh-280px)]` da aba
  "Biblioteca"; nao regride.
- Nenhuma mudanca em filtros, ordenacao, busca ou persistencia
  (`bibliotecaFilters` em localStorage).

**Criterio de aceitacao:**
- [ ] Com 200+ torneios na biblioteca, a altura do painel nao ultrapassa o
      viewport e o rodape do contador continua visivel sem rolar a pagina.
- [ ] Rolando a pagina ate o fim da grade, o painel da Biblioteca continua na
      tela (busca + lista + contador).
- [ ] Arrastar um card da biblioteca para uma celula da grade continua criando o
      torneio planejado (regressao do drag).
- [ ] Arrastar um card ate o `DragTrashZone` continua mandando para a lixeira.
- [ ] Lista rola por dentro; a pagina nao ganha altura por causa da biblioteca.
- [ ] Modo colapsado tambem respeita o teto de altura.

---

### RF-02: Seletor de dias no modal de criacao de torneio
**Descricao:** o modal canonico de criacao ganha um campo "Dias" com os 7 chips
da semana (Dom..Sab). Ao submeter, cria um `planned_tournament` por dia marcado.

**Regras de negocio:**
- O seletor so aparece nos fluxos de **criacao da grade**: `"+"` da celula e
  botao "Novo Torneio" (`DayCreateTournamentDialog`) e o clique no card da
  biblioteca (RF-03). Nao aparece em edicao, nem no dialog da biblioteca
  (`BibliotecaPanel` -> `tournament_library`), nem no grind ao vivo.
- Ao abrir, o dia de origem vem marcado. Nos fluxos sem dia de origem (botao
  "Novo Torneio"), vem marcado o dia que o `handleOpenNewDialog` ja escolhe hoje.
- Desmarcar e permitido enquanto restar **pelo menos 1** dia. Com zero dias
  marcados o botao Salvar fica desabilitado.
- Maximo 7 dias (a propria semana). Nao ha repeticao alem da semana.
- Um chip por dia, rotulo curto de `weekDays[].short` (`Dom`..`Sab`), ordem
  domingo-primeiro (paridade `Date#getDay`, igual a `DAYS_PT`).
- Chip de dia OFF/sem perfil continua **clicavel e marcavel** (D3: a decisao de
  pular acontece no submit, com aviso), mas recebe marcacao visual de "dia sem
  perfil ativo" e `title` explicando.
- Com 1 dia marcado o comportamento e byte-a-byte o de hoje: 1 POST, 1 toast.
- O horario/`time` e o mesmo para todos os dias marcados (o campo unico do
  modal). Nao ha horario por dia.

**Criterio de aceitacao:**
- [ ] `"+"` numa celula de quarta abre o modal com o chip `Qua` marcado e os
      outros 6 desmarcados.
- [ ] Marcar `Qui` e `Sex` e salvar cria 3 torneios planejados (Qua/Qui/Sex) com
      os mesmos campos e horario.
- [ ] Desmarcar o ultimo dia deixa Salvar desabilitado.
- [ ] Salvar com 1 dia marcado gera exatamente 1 POST em
      `/api/planned-tournaments` (sem regressao no fluxo atual).
- [ ] O dialog de **edicao** nao mostra o campo "Dias".
- [ ] O dialog da biblioteca (`Adicionar torneio a biblioteca`) nao mostra o
      campo "Dias".

---

### RF-03: Clique no card da biblioteca abre o modal completo pre-preenchido
**Descricao:** clicar (sem arrastar) num card da biblioteca dentro da aba Grade
abre o `TournamentFormDialog` em modo criacao, ja preenchido com os dados do
torneio da biblioteca, com o seletor de dias do RF-02 visivel.

**Regras de negocio:**
- Pre-preenchimento a partir do registro de `tournament_library`: `name`, `site`,
  `buyIn`, `time`, `type`, `speed`, `guaranteed`. Campos ausentes ficam vazios/
  default (`type='Vanilla'`, `speed='Normal'`), mesma regra que
  `mapLibraryToPlanned` ja aplica no arrasto.
- Quando o registro da biblioteca nao tem `time`, o modal abre com o horario
  vazio e o Salvar exige preencher (mesma validacao de hoje).
- Nenhum dia vem marcado por padrao neste fluxo (nao ha dia de origem). Salvar
  fica desabilitado ate marcar >= 1 dia.
- O card fica com `cursor-pointer` alem do `cursor-grab` atual e ganha um
  affordance de "clique para escolher dias" (tooltip/`title`); o texto de
  onboarding "arraste da biblioteca" passa a citar as duas formas.
- **Arrastar continua identico.** O clique so dispara quando nao houve arrasto —
  `react-beautiful-dnd` ja suprime o `click` que segue um drag; o handler nao
  pode disparar apos soltar um card na grade nem na lixeira.
- O `X` de excluir do card (`library-card-delete`, revelado apos
  `LIBRARY_CARD_DELETE_REVEAL_MS`) e o `"+"` inline mobile continuam com
  `stopPropagation` e **nao** abrem o modal.
- Mobile (sem drag): o clique no card e o caminho principal e abre o mesmo modal.
- O modal criado por este fluxo grava em `planned_tournaments` (a grade), nunca
  em `tournament_library`.
- Fora do `/coach?tab=planner` nada muda: `BibliotecaEmbedded` (Detalhe do Dia)
  e `TournamentLibraryNew` (/library) ficam como estao.

**Criterio de aceitacao:**
- [ ] Clicar num card abre o modal com nome/plataforma/buy-in/horario/tipo/
      velocidade do torneio da biblioteca preenchidos.
- [ ] Marcar `Seg`, `Ter`, `Qua` e salvar cria 3 planejados iguais nesses dias.
- [ ] Arrastar um card ate uma celula cria 1 planejado e **nao** abre o modal.
- [ ] Arrastar um card ate a lixeira manda para a lixeira e **nao** abre o modal.
- [ ] Clicar no `X` de excluir nao abre o modal.
- [ ] Salvar com zero dias marcados e impossivel (botao desabilitado).

---

### RF-04: Criacao em lote — dias sem perfil, erro parcial e feedback
**Descricao:** regra unica de resolucao dos dias marcados em alvos de criacao,
compartilhada pelo RF-02 e pelo RF-03.

**Regras de negocio:**
- Helper **puro** e testavel isoladamente (sugestao: `shared/grade-multi-day.ts`,
  `resolveMultiDayTargets`). Entrada: dias marcados + perfil ativo por dia.
  Saida: `{ targets: [{ dayOfWeek, profile }], skipped: [{ dayOfWeek, reason }] }`.
- `reason` nomeado, nunca booleano solto: `'day_off'` (perfil `OFF`) e
  `'no_active_profile'` (nenhum perfil A/B/C ativo). Sem razao inventada e sem
  fallback silencioso (`.claude/rules/03-padrao-codigo.md`).
- Cada alvo herda o **perfil ativo daquele dia** (A/B/C). O perfil nao e copiado
  do dia de origem.
- Nenhum perfil e ativado automaticamente (D3).
- Criacao = N chamadas ao endpoint existente `POST /api/planned-tournaments`,
  uma por alvo. Sem endpoint novo, sem schema novo.
- As N chamadas sao resolvidas com tolerancia a falha parcial
  (`Promise.allSettled`): um 500 num dia nao aborta os outros nem descarta os
  ja criados.
- Feedback obrigatorio, em um unico toast por submit:
  - todos criados: `"Torneio adicionado a N dias"`;
  - com pulados: acrescenta `"Pulados: Qui, Sex (dia sem perfil ativo)"`;
  - com falhas: variante `destructive` dizendo quantos entraram e em quais dias
    falhou. Nunca reportar sucesso quando houve falha.
- `targets` vazio (todos os dias marcados estao OFF/sem perfil): nao dispara
  nenhum POST, mostra toast explicativo e **mantem o modal aberto**.
- Invalidacao de cache uma unica vez ao fim do lote:
  `["/api/planned-tournaments"]`, `["/api/active-days"]` e
  `["/api/tournament-library"]` (o backend auto-popula a biblioteca dentro de
  `storage.createPlannedTournament`).
- Modal fecha ao fim do lote quando houve pelo menos 1 sucesso.
- Telemetria: o evento existente `coach.day_zoom_create_save` e emitido **uma vez
  por lote** (nao por dia), com `daysCount` e `skippedCount` adicionados.

**Criterio de aceitacao:**
- [ ] `resolveMultiDayTargets` com Qua ativa (perfil B), Qui `OFF` e Sex sem
      perfil devolve 1 target (`{3, 'B'}`) e 2 skipped com razoes distintas.
- [ ] Cada torneio criado usa o perfil ativo do proprio dia (nao o do dia de
      origem).
- [ ] 3 dias marcados, 1 POST falha: os outros 2 permanecem criados e o toast e
      `destructive` nomeando o dia que falhou.
- [ ] Todos os dias marcados estao OFF: nenhum POST sai, modal continua aberto.
- [ ] `["/api/planned-tournaments"]` e invalidada uma vez por lote, nao N vezes.

---

## Requisitos Nao-Funcionais
- **Performance:** com 500 torneios na biblioteca a rolagem da lista nao pode
  travar perceptivelmente. Se a lista renderizada virar gargalo, o remedio e
  medir antes — virtualizacao foi explicitamente descartada nesta spec (D1).
- **Compatibilidade DnD:** `react-beautiful-dnd` continua funcionando com o
  painel sticky/capado. Um unico scroll container por droppable.
- **Regressao zero:** nenhum outro consumidor de `TournamentFormDialog`
  (grind ao vivo, edicao da grade, biblioteca) muda de comportamento.
- **Acessibilidade:** chips de dia sao `button` com `aria-pressed`; card da
  biblioteca clicavel expoe `role`/`title` legivel.

## Endpoints Previstos
Nenhum endpoint novo.

| Metodo | Rota | Uso nesta spec | Auth |
|---|---|---|---|
| POST | /api/planned-tournaments | 1 chamada por dia marcado (RF-04) | JWT |
| GET | /api/tournament-library | ja consumido pelo painel | JWT |

## Modelos de Dados Afetados
Nenhum. Sem migration, sem coluna nova, sem mudanca em `shared/schema.ts`.
Os registros criados sao `planned_tournaments` com o payload que o fluxo de
criacao ja envia hoje.

## Integracoes Externas
Nenhuma.

## Cenarios de Teste Derivados

### Happy path
- [ ] Painel da biblioteca com 200 itens: altura capada, contador visivel, lista
      rola por dentro.
- [ ] `"+"` da celula -> marcar 3 dias -> 3 planejados criados nos dias certos.
- [ ] Clique no card da biblioteca -> modal preenchido -> 2 dias -> 2 planejados.

### Validacao de input
- [ ] Zero dias marcados -> Salvar desabilitado.
- [ ] Card da biblioteca sem `time` -> modal abre com horario vazio e exige
      preencher.
- [ ] Buy-in/nome seguem as validacoes atuais do modal (sem regressao).

### Regras de negocio
- [ ] Dia `OFF` marcado -> pulado, nomeado no toast, perfil do dia intocado.
- [ ] Dia sem perfil ativo -> pulado com razao `no_active_profile`.
- [ ] Perfil por dia: cada criado herda o perfil daquele dia.
- [ ] 1 dia marcado -> exatamente 1 POST (paridade com o fluxo atual).
- [ ] Dialog de edicao e dialog da biblioteca nao mostram o campo "Dias".

### Edge cases
- [ ] Arrastar card -> soltar na grade: nenhum modal abre (clique suprimido pos-drag).
- [ ] Arrastar card -> soltar na lixeira: nenhum modal abre.
- [ ] Clique no `X` de excluir: nenhum modal abre.
- [ ] Falha parcial (1 de 3 POSTs falha): toast `destructive`, 2 criados
      persistem.
- [ ] Todos os dias marcados invalidos: nenhum POST, modal aberto.
- [ ] Biblioteca vazia / filtro sem resultado: empty state atual preservado
      dentro do painel capado.
- [ ] Painel colapsado: teto de altura respeitado, lista compacta rola.
- [ ] Mobile: aba Biblioteca inalterada; clique no card abre o modal.

## Fora de Escopo
- Virtualizacao ou paginacao ("carregar mais") da lista da biblioteca.
- Horario diferente por dia (o horario e unico para o lote).
- Repeticao alem da semana corrente (recorrencia, "toda segunda do mes").
- Endpoint de criacao em lote no backend.
- Multi-dia no dialog de **edicao** (mover/copiar um planejado existente para
  outros dias).
- Mudanca em `BibliotecaEmbedded` (Detalhe do Dia) e em `/library`
  (`TournamentLibraryNew`).
- Ativar perfil automaticamente em dia OFF.
- Remocao do componente morto `client/src/components/grade-planner/TournamentLibrary.tsx`
  (sem imports; limpeza separada).

## Dependencias
Nenhuma. Tudo que a spec precisa ja existe: `TournamentFormDialog` (modal
canonico), `POST /api/planned-tournaments`, `getActiveProfile` em `GradePlanner`,
`weekDays` em `components/grade-planner/types.ts`.

## Notas de Implementacao (sugestoes, nao obrigacoes)
- O seletor de dias cabe no `extraSlot` que o `TournamentFormDialog` ja expoe
  (render-prop pensada exatamente para conteudo especifico de contexto). Assim o
  state dos dias fica no caller e `TournamentFormState` nao muda — zero risco
  para grind-live e edicao. Componente sugerido:
  `client/src/components/grade-planner/WeekDaysPicker.tsx`.
- O caller natural do lote e `GradePlanner.tsx`: e quem ja tem `getActiveProfile`,
  `addPlannedMutation` e o `queryClient`.
- `BibliotecaPanel` precisa de uma prop nova (ex.: `onTournamentClick?`) para
  reportar o clique ao `GradePlanner`; sem a prop, o card segue somente
  arrastavel (back-compat com `BibliotecaEmbedded`).
- `data-testid` estaveis para o test-writer (lesson #2): `library-panel`,
  `library-card-${id}`, `week-days-picker`, `week-day-chip-${dayOfWeek}`,
  `multi-day-submit`.
- Nao inventar valores de espacamento/altura: derivar o offset do viewport dos
  tokens/layout existentes (`.claude/rules/14-frontend-ui.md`).
