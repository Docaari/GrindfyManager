# ADR-245: Grade Planner — biblioteca ancorada no viewport + criacao multi-dia por `extraSlot`, helper puro e lote sequencial

## Status
Aceito

## Data
2026-08-02

Spec de origem: `Docs/specs/grade-planner-library-and-multi-day.md` (aprovada pelo
founder em 2026-08-02). Modelo/esforco declarados na spec: **Sonnet 5 / `medium`**
para componentes e layout; **Sonnet 5 / `high`** para o helper
`resolveMultiDayTargets` e a orquestracao do lote. Zona critica **nao** e tocada
(sem parser CSV, sem FX, sem schema, sem migration, sem ordem de rota nova).

> **Nota de numeracao:** maior ADR em disco na abertura desta sessao e o **244**
> (`244-grind-live-manual-session-result.md`). Este usa o proximo livre
> confirmado = **245**. O indice `README.md` desta pasta ja carrega o drift
> historico (buraco 238-243); a linha de 245 foi adicionada sem mascarar o
> buraco.

---

## Contexto

A aba "Grade" do `/coach` (`client/src/pages/GradePlanner.tsx`) tem dois
problemas que a spec ataca junto, porque tocam o mesmo par de componentes.

**Problema 1 — a Biblioteca cresce junto com a grade.** O `PanelGroup` nao tem
altura definida (`min-h-[800px]`, `GradePlanner.tsx:1149-1151`), os `Panel` sao
itens flex esticados, e o `BibliotecaPanel` roda com `h-full`
(`BibliotecaPanel.tsx:340`). Resultado: o painel herda a altura da grade, a lista
vira uma coluna de centenas de cards, o rodape do contador sai da tela e o
jogador rola a pagina inteira para achar um torneio.

**Problema 2 — montar grade e repeticao manual.** O mesmo torneio das 20:00
costuma entrar de segunda a sexta. Hoje isso e um arrasto por dia, ou cinco
aberturas do modal. O card da biblioteca so responde a arrasto (`Draggable` +
`mapLibraryToPlanned`); clicar nele nao faz nada.

Estado do codigo levantado antes de decidir:

| Ponto | Arquivo / linha | Comportamento hoje |
|---|---|---|
| Layout dos paineis | `GradePlanner.tsx:1149-1196` | `PanelGroup min-h-[800px]`, grade a esquerda (`Panel` 70), biblioteca a direita (`Panel` 30, colapsavel) |
| Comentario da regressao | `GradePlanner.tsx:1153-1158` | proibe capar altura + aninhar overflow vertical: `react-beautiful-dnd` nao suporta scroll container aninhado; capar matou o drag em `a6b2925c` |
| Scroll da lista | `BibliotecaPanel.tsx:598` (expandido) e `:300` (colapsado) | o `Droppable droppableId="library"` **ja** e `flex-1 overflow-y-auto` — hoje ele nunca rola porque o painel e alto demais |
| Casca do painel | `BibliotecaPanel.tsx:342-552` | header, busca, chips de plataforma, filtros avancados, secao "Importar", toggle da Lixeira — tudo fora do scroll container, empilhado |
| Contador | `BibliotecaPanel.tsx:643-645` | rodape `{filtrados} de {total}` fora do scroll |
| Shell da aplicacao | `App.tsx:118-120` | `div.flex.h-screen` + `div.flex-1.overflow-auto` — **o scroller da pagina e esse div**, nao o `body`; nao ha header fixo acima |
| Modal canonico | `TournamentFormDialog.tsx` | dialog unico de torneio; expoe `extraSlot` como render-prop `(ctx: { values, patch }) => ReactNode` na linha 807 |
| Regra de submit | `TournamentFormDialog.tsx:262-267` | `canSubmit` interno: nome, site, `time` no formato `HH:MM`, buy-in quando `requireBuyIn`. Sem gancho para validacao externa |
| Fechar/manter aberto | `TournamentFormDialog.tsx:269-294` | `onSubmit` que **lanca** mantem o dialog aberto e exibe `errorLocal`; `errorMessage` (prop) tem precedencia sobre `errorLocal` |
| Adapter da grade | `DayCreateTournamentDialog.tsx` | monta o payload, faz **1** `POST /api/planned-tournaments`, invalida 3 chaves, emite `coach.day_zoom_create_save`. **Tambem consumido por `DayDetailZoom.tsx:1668`** |
| State do form | `useTournamentDialogForm.ts` | `TournamentFormState` com 20 campos; sem nocao de dia |
| Perfil por dia | `GradePlanner.tsx:193-201` | `getActiveProfile(dayOfWeek): 'A' \| 'B' \| 'C' \| 'OFF' \| null` |
| Drag da biblioteca | `GradePlanner.tsx:817-832` | `mapLibraryToPlanned` + `addPlannedMutation`; **nao** seta `libraryTemplateId` |
| Card | `LibraryCard.tsx` | `cursor-grab`, sem `onClick`; `X` de excluir e `+` mobile ja fazem `stopPropagation` |
| Rota | `server/routes/grade-planner.ts:147-180` | `POST /api/planned-tournaments`, Zod estrito, 1 registro por chamada |
| Auto-populate da biblioteca | `storage.ts:4645` -> `services/libraryAutoPopulate.ts` | `ensureLibraryEntryForPlannedSafe(created)` **sem `await`**: le candidatos, decide por `libraryCanonicalKey` e insere. **Sem unique constraint** — e um read-then-write sujeito a corrida |

Restricoes herdadas que nao se reabrem aqui:
- `.claude/rules/02-estrutura.md` — `shared/` nao importa `server/` nem
  `client/`; helper puro com teste unitario e a primeira casa de regra nova.
- `.claude/rules/03-padrao-codigo.md` — ausencia de dado devolve razao nomeada,
  nunca booleano solto nem fallback silencioso.
- `.claude/rules/14-frontend-ui.md` — nao inventar valor de espacamento/altura;
  `data-testid` estavel; hooks antes de qualquer early return.
- ADR-011 — `react-beautiful-dnd` continua sendo a lib de drag da grade.

---

## Opcoes Consideradas

### Q1 — Onde mora o state dos dias marcados

#### Opcao A — `extraSlot` do `TournamentFormDialog`, state no adapter chamador, `TournamentFormState` INTOCADO **[ESCOLHIDA]**
- **Pros:**
  - `extraSlot` existe exatamente para isto (comentario do proprio arquivo,
    `TournamentFormDialog.tsx:20-22`: "render-prop para conteudo especifico de
    contexto"). Nao e um gancho improvisado.
  - `TournamentFormState` e consumido por tres contextos (grade, grind ao vivo,
    biblioteca). Todo campo novo ali entra no `EMPTY_TOURNAMENT_FORM_STATE`, no
    `reset`, no `patch` e no snapshot que **todos** os `onSubmit` recebem —
    incluindo `BibliotecaPanel.handleAddSubmit` e o `AddTournamentDialog` do
    grind ao vivo, que nao tem a menor nocao de "dia da semana". Risco de
    regressao desproporcional para um campo de um unico fluxo.
  - Dias sao um conceito do **lote**, nao do torneio. Um `planned_tournament`
    tem um `dayOfWeek`, nao sete. Guardar `days: number[]` no state do formulario
    modelaria errado o dominio.
  - O adapter que ja detem o dia e o perfil (`DayCreateTournamentDialog`) e o
    mesmo que precisa do state — zero prop drilling.
- **Contras:**
  - O `canSubmit` do dialog nao enxerga o state externo. Precisa do gancho de Q2.
  - O `extraSlot` e renderizado **antes do rodape** e depois de "Mais opcoes"
    (`TournamentFormDialog.tsx:807`); a posicao visual do campo "Dias" fica presa
    a esse ponto sem uma prop de posicao.

#### Opcao B — Campo `days: number[]` em `TournamentFormState`
- **Pros:** validacao entraria natural no `canSubmit`; um unico snapshot no
  `onSubmit`.
- **Contras:** contamina os tres contextos, exige branch por consumidor para
  ignorar o campo, e obriga a mexer no hook DRY que a Sprint
  `day-detail-consolidation` extraiu justamente para nao ter forks. A spec pede
  **regressao zero** nos outros consumidores; esta opcao aposta contra isso.

#### Opcao C — Context/store dedicado (`MultiDayContext`)
- **Pros:** desacopla dialog e picker por completo.
- **Contras:** infraestrutura nova para um state de sete booleanos que vive
  enquanto um modal esta aberto. Custo de leitura permanente para ganho nenhum.
  Descartada sem hesitacao.

### Q2 — Como desabilitar Salvar com zero dias marcados

#### Opcao A — Prop opcional `extraCanSubmit?: boolean` (default `true`), somada ao `canSubmit` interno **[ESCOLHIDA]**
- **Pros:**
  - Aditiva e neutra: consumidor que nao passa a prop tem o `disabled` de hoje,
    byte-a-byte.
  - Mantem **um** botao Salvar, com o `disabled` real (a criterio de aceitacao da
    spec e "botao Salvar desabilitado", nao "erro no submit").
  - O adapter ja tem `selectedDays.length > 0` a mao.
- **Contras:** amplia a superficie de props do dialog canonico (que ja tem 25).

#### Opcao B — Salvar habilitado, validacao no `onSubmit` lancando erro
- **Pros:** zero prop nova.
- **Contras:** viola o criterio de aceitacao explicito da spec e degrada a UX —
  o jogador so descobre no clique. Recusada.

#### Opcao C — Rodape proprio dentro do `extraSlot`
- **Contras:** dois botoes Salvar na mesma tela ou duplicacao do rodape sticky.
  Recusada.

### Q3 — Como o clique no card convive com o drag sem falso positivo

#### Opcao A — Confiar no bloqueio de clique do `react-beautiful-dnd`, com guarda de defesa em profundidade no adapter **[ESCOLHIDA]**
- **Pros:**
  - O sensor de mouse do rbd tem *post-drag click blocking*: apos um drag de
    verdade ele intercepta o `click` seguinte na fase de captura da `window`.
    Um "sloppy click" (mousedown, movimento abaixo do limiar, mouseup) **nao** e
    bloqueado — que e exatamente o comportamento desejado.
  - Cobre os dois casos que a spec cita como criticos: soltar na grade e soltar
    no `DragTrashZone`.
  - Em touch, o rbd exige long-press para iniciar o drag; um toque curto vira
    `click` normal. Isso da o "mobile: clique e o caminho principal" de graca.
- **Contras:**
  - Comportamento **implicito** de uma lib descontinuada (ADR-011). Se um dia o
    bloqueio quebrar, a falha e silenciosa e cara: o jogador arrasta um card para
    a lixeira e ganha um modal de criacao por cima.
  - Por isso a guarda de defesa em profundidade: o `GradePlanner` ja mantem
    `dragging` (`handleDragStart`/`handleDragEnd`); o handler de clique ignora o
    evento enquanto `dragging !== null` e por uma janela curta apos o
    `onDragEnd`. Isso e barato, testavel e nao depende de detalhe interno do rbd.

#### Opcao B — Detectar o clique manualmente por `mousedown`/`mouseup` com limiar de deslocamento
- **Pros:** independente do rbd.
- **Contras:** reimplementa o limiar que a lib ja aplica, com risco de divergir
  dele e produzir o pior dos mundos (drag iniciado **e** clique disparado).
  Recusada.

#### Opcao C — Botao dedicado no card ("escolher dias") em vez de clique na area toda
- **Pros:** elimina qualquer ambiguidade com o drag.
- **Contras:** a spec pede clique no card (D2 do founder) e cita `cursor-pointer`
  na area do card. Um botao a mais no card ja povoado (X de excluir, `+` mobile)
  aumenta o erro de mira. Recusada, mas registrada como plano B se a Opcao A
  falhar no navegador.

### Q4 — Teto de altura + sticky, e por que nao virtualizar

#### Opcao A — `max-height` derivada do viewport + `position: sticky` no `Panel` da biblioteca, mantendo o unico scroll container que ja existe **[ESCOLHIDA]**
- **Pros:**
  - **Nao cria scroll container novo.** O `Droppable droppableId="library"` ja e
    `overflow-y-auto` hoje (`BibliotecaPanel.tsx:598`); ele simplesmente nunca
    rola porque o painel e alto. Capar a altura do painel faz o scroll que ja
    existe passar a funcionar. A invariante do rbd ("um scroll container por
    droppable, nunca aninhado") e **preservada por construcao**, e a regressao
    `a6b2925c` nao se repete: o lado da grade fica intocado.
  - `max-h` derivada de `100vh` menos um unico offset nomeado atende
    `.claude/rules/14-frontend-ui.md` sem pixel escolhido no olho.
  - O sticky resolve contra `div.flex-1.overflow-auto` (`App.tsx:120`), que e o
    scroller real da pagina. Nao ha header fixo acima, entao o offset e apenas o
    padding vertical do container da pagina (`px-6 py-6`, `GradePlanner.tsx:917`).
- **Contras — e este e o ponto de risco tecnico do ADR:**
  - `react-resizable-panels` aplica `overflow: hidden` por padrao **tanto no
    `PanelGroup` quanto no `Panel`**. Um ancestral com `overflow: hidden` cria um
    scrollport que nunca rola, e `position: sticky` resolvido contra ele **nao
    gruda em nada**. Sem neutralizar isso, o sticky vira no-op silencioso: o
    painel apenas fica capado no topo de uma coluna alta e sai da tela ao rolar.
  - A forma recomendada (a verificar no navegador antes de fechar a sprint) e:
    `overflow: visible` no `PanelGroup` e no `Panel` da biblioteca (via `style`,
    que tem precedencia sobre o default da lib), `align-self: flex-start` no
    `Panel` para ele parar de esticar, e `position: sticky` + `max-height` no
    proprio `Panel`. O `align-self` age no eixo transversal e **nao** interfere
    no dimensionamento horizontal que a lib controla por `flex-basis/grow/shrink`.
  - Perder `overflow: hidden` no `PanelGroup` significa perder o recorte visual
    durante o arrasto do `PanelResizeHandle`. O conteudo interno ja se recorta
    sozinho (grade em `h-full overflow-auto`, `GradePlanner.tsx:1164`), entao o
    impacto esperado e cosmetico — mas e um efeito colateral real e precisa ser
    olhado na tela.

#### Opcao B — Capar o `PanelGroup` inteiro em `h-[calc(100vh - offset)]`
- **Contras:** e literalmente a forma que produziu a regressao `a6b2925c` — o
  lado da grade passa a precisar de `overflow` vertical proprio, o rbd ganha
  scroll container aninhado e o drag morre. O comentario em
  `GradePlanner.tsx:1153-1158` existe para impedir exatamente esta tentativa.
  **Recusada.**

#### Opcao C — Virtualizacao (`react-window`/`react-virtual`) ou paginacao "carregar mais"
- **Pros:** resolveria o custo de render de 500 cards.
- **Contras:** o founder decidiu contra (D1 da spec: renderiza todos os itens
  filtrados, nao pagina, nao virtualiza) e ha razao tecnica alem da preferencia:
  virtualizar uma lista que e um `Droppable` do rbd exige que os `Draggable`
  existam no DOM na hora do drag; a lib nao tem suporte de primeira classe a
  janelas virtuais e o resultado tipico e indice quebrado no drop. Paginar
  quebraria o arrastar-de-qualquer-item que a feature vive. O requisito
  nao-funcional da spec e claro: **medir antes**; se 500 cards travarem, a
  conversa reabre com numero na mao.

#### Opcao D — So `max-height`, sem sticky
- **Pros:** foge do problema de `overflow: hidden` por completo.
- **Contras:** falha o segundo criterio de aceitacao do RF-01 ("rolando a pagina
  ate o fim da grade, o painel continua na tela"). Fica registrada como
  degradacao aceitavel caso o sticky se mostre inviavel no navegador — entrega
  metade do valor sem risco.

### Q5 — Onde vive `resolveMultiDayTargets`

#### Opcao A — `shared/grade-multi-day.ts`, funcao pura, sem import de `client/` nem de `server/` **[ESCOLHIDA]**
- **Pros:**
  - Confere com `.claude/rules/02-estrutura.md`: "regra pura (calculo, formato,
    validacao) -> `shared/`, com teste unitario". A regra de dependencia e
    respeitada porque o helper so recebe primitivos e uma funcao injetada.
  - Ha familia inteira de precedentes no mesmo dominio: `shared/grade-off-toggle.ts`,
    `shared/grade-profile-utils.ts`, `shared/grade-drop-time.ts`,
    `shared/grade-cell-overflow.ts`, `shared/drag-drop-utils.ts`.
  - Testavel no projeto `server` (node) do Vitest, sem jsdom, sem RTL — o
    test-writer cobre a matriz de casos sem montar componente.
  - Texto PT-BR voltado ao jogador em `shared/` ja tem precedente
    (`drag-drop-utils.ts:47`, "Dia OFF nao aceita torneios").
- **Contras:** a composicao do texto do toast precisa dos rotulos curtos dos dias,
  que hoje vivem em `client/src/components/grade-planner/types.ts` (`weekDays`) e
  em `client/src/lib/days-pt.ts` (`DAYS_PT`). Como `shared/` nao pode importar
  `client/`, os rotulos entram **injetados** (`dayLabels: readonly string[]`).

#### Opcao B — `client/src/components/grade-planner/multi-day.ts`
- **Pros:** poderia importar `weekDays` direto.
- **Contras:** o teste passa a rodar no projeto jsdom sem necessidade, e a regra
  do projeto manda regra pura para `shared/`. O ganho (nao injetar 7 strings) nao
  paga o desvio da convencao.

#### Opcao C — Mover `DAYS_PT` para `shared/` e importar
- **Pros:** DRY de verdade; acaba com a duplicacao `weekDays` x `DAYS_PT`.
- **Contras:** `DAYS_PT` e importado por varios arquivos do client; mover no meio
  desta sprint amplia o raio de explosao sem relacao com a feature. **Fica como
  follow-up grepavel**, nao como parte do escopo.

### Q6 — N POSTs: sequencial, paralelo, ou endpoint em lote

#### Opcao A — Laco **sequencial** com `try/catch` por item, resultado agregado no mesmo formato de `allSettled` **[ESCOLHIDA, com desvio declarado da letra da spec]**
- **Pros:**
  - Tolera falha parcial exatamente como a spec exige: um 500 num dia nao aborta
    os outros nem descarta os ja criados.
  - **Reduz materialmente uma corrida real.** `storage.createPlannedTournament`
    chama `ensureLibraryEntryForPlannedSafe(created)` **sem `await`**, e esse
    servico faz read-then-write por `libraryCanonicalKey` **sem unique
    constraint** (`server/services/libraryAutoPopulate.ts`). Como a chave
    canonica nao inclui `dayOfWeek`, os 7 POSTs do mesmo torneio disputam a mesma
    linha de biblioteca: em paralelo, os 7 leem "nao existe" quase ao mesmo tempo
    e criam ate 7 duplicatas na Biblioteca — poluindo justamente a lista que o
    RF-01 esta tentando encurtar. Sequencial nao elimina a janela (o
    auto-populate continua fire-and-forget), mas reduz de "quase certo" para
    "improvavel".
  - Ordem deterministica dos resultados, o que torna o texto do toast estavel e
    o teste previsivel.
  - Custo: no maximo 7 idas ao servidor em serie, num fluxo iniciado por clique
    consciente. Aceitavel.
- **Contras:**
  - Mais lento que o paralelo no melhor caso.
  - **Desvia da letra da spec**, que diz `Promise.allSettled`. A intencao da spec
    ("tolerancia a falha parcial") e integralmente atendida; a mecanica muda.
    Registrado aqui para o founder poder reverter em uma linha.

#### Opcao B — `Promise.allSettled` com os N POSTs disparados em paralelo
- **Pros:** literal a spec; mais rapido; codigo mais curto.
- **Contras:** maximiza a corrida do auto-populate descrita acima. Se o founder
  preferir o paralelo, a mitigacao correta e enviar `libraryTemplateId` no
  payload (ver D6) e/ou criar unique index em `tournament_library` — o segundo e
  migration, que esta fora de escopo.

#### Opcao C — Endpoint novo `POST /api/planned-tournaments/bulk`
- **Pros:** uma transacao, um round-trip, dedup de biblioteca resolvido no
  servidor.
- **Contras:** a spec exclui explicitamente ("Fora de Escopo: endpoint de criacao
  em lote no backend") e exige "sem endpoint novo". Alem disso, transacao unica
  contradiz o requisito de **falha parcial tolerada**: ou tudo entra, ou nada.
  Recusada.

### Q7 — Quem orquestra o lote

#### Opcao A — `DayCreateTournamentDialog` ganha capacidade multi-dia **opt-in**; sem a prop, comportamento de hoje byte-a-byte **[ESCOLHIDA]**
- **Pros:**
  - Mantem **um** adapter do contexto "grade" montando payload, invalidando cache
    e emitindo telemetria. Nao ha segundo lugar no codigo que saiba transformar
    `TournamentFormState` em corpo de `POST /api/planned-tournaments`.
  - `DayDetailZoom.tsx:1668` (Detalhe do Dia) **nao** passa a prop nova e nao
    muda em nada — nem comportamento, nem os testes de
    `tests/client/day-detail-zoom/DayCreateTournamentDialog.test.tsx`.
  - Os dois fluxos novos (celula/"Novo Torneio" e clique no card) usam o mesmo
    adapter com `initial` diferente, sem duplicar mapeamento de payload.
- **Contras:**
  - `dayOfWeek` e `profileLetter` deixam de ser obrigatorios (no fluxo da
    biblioteca nao ha dia de origem) — alargamento de tipo que o TypeScript
    aceita, mas que exige revisar os usos internos dos dois campos.
  - O adapter cresce: passa a conter o laco, o resumo e o toast.

#### Opcao B — Componente novo `GradeMultiDayCreateDialog` ao lado do existente
- **Pros:** isola o codigo novo; risco zero para o Detalhe do Dia.
- **Contras:** duplica a montagem do payload (`buyIn` com virgula, `guaranteed`
  default `"0"`, `registrationTime` validado por regex) — o tipo de duplicacao
  que produz divergencia silenciosa em seis meses.

#### Opcao C — Orquestracao inline no `GradePlanner.tsx`
- **Pros:** `getActiveProfile`, `queryClient` e `toast` ja estao la.
- **Contras:** o arquivo ja tem ~1400 linhas e a mesma logica precisaria ser
  alcancavel pelo fluxo da biblioteca e pelo fluxo da celula. Recusada; o
  `GradePlanner` continua sendo **fonte** de `getActiveProfile` (passado como
  prop), nao dono do lote.

---

## Decisao

### D1 — Seletor de dias no `extraSlot`; `TournamentFormState` intocado

Componente novo `client/src/components/grade-planner/WeekDaysPicker.tsx`, puro de
apresentacao: recebe `selectedDays`, `onToggleDay`, `getProfileForDay` e
`dayLabels`; renderiza 7 `button` com `aria-pressed`, `data-testid="week-days-picker"`
e `data-testid="week-day-chip-${dayOfWeek}"`. Ordem domingo-primeiro, paridade com
`Date#getDay` e com `weekDays` de `components/grade-planner/types.ts`.

Chip de dia OFF ou sem perfil continua **clicavel e marcavel** (D3 do founder: a
decisao de pular acontece no submit), mas recebe marcacao visual e `title`
explicando. O picker **nao** decide nada — quem decide e o helper puro do D4.

O state (`selectedDays: number[]`) vive no `DayCreateTournamentDialog`.
`TournamentFormState` e `useTournamentDialogForm` **nao mudam**.

### D2 — `TournamentFormDialog` ganha uma unica prop: `extraCanSubmit?: boolean`

Default `true`. O `canSubmit` interno passa a ser `canSubmitInterno && extraCanSubmit`.
Consumidor que nao passa a prop tem o `disabled` de hoje, sem diferenca
observavel. Nenhuma outra prop, nenhum outro comportamento do dialog canonico
muda nesta sprint.

O `extraSlot` **ja existe** e nao muda de assinatura.

### D3 — Clique no card: rbd bloqueia o pos-drag, e o adapter guarda por cima

`LibraryCard` ganha `onCardClick?: () => void` **opcional**. Quando ausente
(caso de `BibliotecaEmbedded`, `client/src/components/grade/BibliotecaEmbedded.tsx:423`),
o card se comporta como hoje. Quando presente, o card ganha `cursor-pointer`,
`role="button"` e `title` citando "clique para escolher os dias".

`BibliotecaPanel` ganha `onTournamentClick?: (tournament: any) => void`; sem a
prop, os cards continuam so arrastaveis (back-compat).

Ordem de defesa contra falso positivo pos-arrasto, do mais barato ao mais forte:

1. `X` de excluir (`library-card-delete`) e `+` inline mobile ja fazem
   `stopPropagation` — continuam fazendo, e nao abrem o modal.
2. `react-beautiful-dnd` bloqueia o `click` que segue um drag de verdade.
3. **Guarda propria:** o handler ignora o clique enquanto `dragging !== null` no
   `GradePlanner` e por uma janela curta apos `onDragEnd`. E esta guarda que
   torna o comportamento **testavel sem depender do interno do rbd** — e o unico
   ponto que o test-writer consegue exercitar de forma deterministica em jsdom,
   porque o bloqueio nativo do rbd nao roda em teste de unidade.

Consequencia declarada: os criterios "arrastar ate a celula nao abre o modal" e
"arrastar ate a lixeira nao abre o modal" so tem cobertura real em navegador. Em
teste, o que se cobre e a guarda 3.

### D4 — `resolveMultiDayTargets` em `shared/grade-multi-day.ts`, com razao nomeada

Ver o contrato completo na secao "Contrato do helper puro" abaixo. Resumo das
decisoes de forma:

- Entrada: lista de dias marcados + **funcao** `getProfileForDay`, com a mesma
  assinatura de `GradePlanner.getActiveProfile` (adaptacao zero no chamador).
- Saida: `{ targets: [{ dayOfWeek, profile }], skipped: [{ dayOfWeek, reason }] }`.
- `reason` e um literal nomeado: `'day_off'` e `'no_active_profile'`. Nunca
  booleano, nunca `null` mudo.
- Cada alvo herda o perfil **daquele dia**. O perfil do dia de origem nao e
  copiado. Nenhum perfil e ativado automaticamente (D3 do founder).
- Dia fora de `0..6` ou nao inteiro **lanca `RangeError`**: e erro de programacao
  (os 7 chips sao a unica fonte), nao estado do jogador. Falhar alto e barato
  aqui e impede que um bug de indice vire torneio criado no dia errado.
- Valor de perfil desconhecido (nem `'A' | 'B' | 'C'`, nem `'OFF'`) resolve para
  `'no_active_profile'`. Isso **nao** e fallback silencioso: o dia e pulado, a
  razao e nomeada e o jogador e avisado no toast.

### D5 — Lote sequencial, um toast, uma invalidacao, uma telemetria

Fluxo do submit multi-dia, na ordem:

1. `resolveMultiDayTargets(selectedDays, getProfileForDay)`.
2. `targets` vazio: **nenhum POST**. O adapter seta a mensagem controlada
   (`errorMessage`) com a razao concreta, dispara o toast explicativo e **lanca**
   dentro do `onSubmit` — e assim que `TournamentFormDialog` mantem o modal
   aberto (`TournamentFormDialog.tsx:280`). Como `errorMessage` (prop) tem
   precedencia sobre `errorLocal`, o jogador nunca ve o texto generico "Falha ao
   salvar — tente novamente".
3. `targets` nao vazio: laco **sequencial**, um `POST /api/planned-tournaments`
   por alvo, `try/catch` por item, acumulando `created: number[]` e
   `failed: number[]` por `dayOfWeek`.
4. Invalidacao **uma vez ao fim do lote**: `["/api/planned-tournaments"]`,
   `["/api/active-days"]`, `["/api/tournament-library"]`.
5. Telemetria **uma vez por lote**: `coach.day_zoom_create_save` com o payload de
   hoje mais `daysCount` (alvos tentados) e `skippedCount`. `dayOfWeek` e
   `profileLetter` do evento sao os do dia de origem quando existe; no fluxo da
   biblioteca, os do primeiro alvo criado. Nao emite quando nao houve POST.
6. `summarizeMultiDayResult` compoe **um** toast (ver tabela de casos).
7. Modal fecha quando houve **pelo menos 1 sucesso**; caso contrario o `onSubmit`
   lanca e o modal fica aberto.

### D6 — O fluxo da biblioteca envia `libraryTemplateId`

No caminho do RF-03, o torneio veio de uma linha de `tournament_library`. O
payload de cada POST carrega `libraryTemplateId: <id da linha>`. Isso:

- faz `decideLibraryAction` retornar `{ action: "skip" }` logo na primeira
  guarda (`libraryAutoPopulate.ts`), **eliminando a corrida do Q6 neste fluxo**;
- e o que a rota ja espera para `alreadyInGrid` funcionar
  (`server/routes/grade-planner.ts:57-59`).

Divida vizinha registrada, **fora do escopo desta sprint**: o drag de hoje
(`mapLibraryToPlanned`, `shared/drag-drop-utils.ts:62`) **nao** seta
`libraryTemplateId`. Corrigir ali muda o comportamento do arrasto e tem teste
proprio (`tests/unit/tournament-library/drag-drop-mapping.test.ts`) — nao entra
aqui de carona.

### D7 — Teto de altura + sticky, com o `overflow` da lib neutralizado

- Um unico offset nomeado alimenta ao mesmo tempo o `top` do sticky e o
  `max-height` (`calc(100vh - <offset>)`), para os dois nao poderem divergir.
  O offset sai do padding vertical do container da pagina (`py-6`,
  `GradePlanner.tsx:917`) — derivado do layout, nao escolhido no olho.
- `overflow: visible` no `PanelGroup` e no `Panel` da biblioteca; `align-self:
  flex-start` no `Panel`; `sticky` + `max-height` no `Panel`.
- Dentro do painel continua existindo **exatamente um** scroll container
  vertical: o `Droppable droppableId="library"`. Header, busca, chips, filtros,
  "Importar", toggle da Lixeira e o rodape do contador ficam fora dele.
- Secao "Importar" e toggle da Lixeira passam a viver atras de um disclosure
  recolhido por padrao (estado nao persiste). Isto nao e cosmetico: com filtros
  avancados abertos, a casca do painel pode consumir a altura toda e deixar a
  lista com zero pixel. O disclosure e a mitigacao; a lista precisa de
  `flex-1 min-h-0` e de um piso de altura para nunca colapsar.
- Modo colapsado (`BibliotecaPanel.tsx:265-334`) recebe o mesmo tratamento.
- Mobile mantem `h-[calc(100vh-280px)]` (`GradePlanner.tsx:1142`) — nao regride.

---

## Contrato do helper puro

Arquivo: `shared/grade-multi-day.ts`. Sem import de `client/` nem de `server/`.

```ts
/** Perfil ativo de um dia, na forma que GradePlanner.getActiveProfile devolve. */
export type ActiveProfileLetter = "A" | "B" | "C";
export type DayProfile = ActiveProfileLetter | "OFF" | null | undefined;

/** Razao nomeada do descarte. Nunca booleano solto, nunca razao inventada. */
export type MultiDaySkipReason = "day_off" | "no_active_profile";

export interface MultiDayTarget {
  dayOfWeek: number;              // 0..6, domingo-primeiro (Date#getDay)
  profile: ActiveProfileLetter;   // perfil ativo DAQUELE dia
}

export interface MultiDaySkipped {
  dayOfWeek: number;
  reason: MultiDaySkipReason;
}

export interface ResolveMultiDayTargetsResult {
  targets: MultiDayTarget[];
  skipped: MultiDaySkipped[];
}

/**
 * Traduz "dias marcados nos chips" em "onde criar" + "o que foi pulado e por que".
 * Puro: nao le relogio, nao faz I/O, nao ativa perfil.
 *
 * @throws RangeError quando algum dia nao e inteiro em 0..6.
 */
export function resolveMultiDayTargets(
  selectedDays: readonly number[],
  getProfileForDay: (dayOfWeek: number) => DayProfile,
): ResolveMultiDayTargetsResult;

/** Resultado observado do lote, por dia. */
export interface MultiDayOutcome {
  created: readonly number[];             // dayOfWeek com POST 2xx
  failed: readonly number[];              // dayOfWeek com POST rejeitado
  skipped: readonly MultiDaySkipped[];    // veio de resolveMultiDayTargets
}

export interface MultiDayToast {
  title: string;
  description?: string;
  variant?: "destructive";
}

/**
 * Compoe O UNICO toast do lote. `dayLabels` tem 7 rotulos curtos indexados por
 * dayOfWeek ("Dom".."Sab") — injetados porque shared/ nao importa client/.
 *
 * @throws RangeError quando created, failed e skipped estao todos vazios
 *         (estado inalcancavel: Salvar fica desabilitado com zero dias).
 * @throws RangeError quando dayLabels nao tem exatamente 7 entradas.
 */
export function summarizeMultiDayResult(
  outcome: MultiDayOutcome,
  dayLabels: readonly string[],
): MultiDayToast;
```

### Regras de forma de `resolveMultiDayTargets`

1. Dias duplicados na entrada sao deduplicados, mantendo a primeira ocorrencia.
2. `targets` e `skipped` saem **ordenados por `dayOfWeek` crescente**, qualquer
   que seja a ordem da entrada — saida deterministica para toast e teste.
3. `'OFF'` -> `skipped` com `'day_off'`.
4. `null`, `undefined` ou qualquer valor fora de `A|B|C|OFF` -> `skipped` com
   `'no_active_profile'`.
5. Entrada vazia -> `{ targets: [], skipped: [] }` (nao e erro).

### Tabela de casos — `resolveMultiDayTargets`

| # | `selectedDays` | `getProfileForDay` | `targets` | `skipped` |
|---|---|---|---|---|
| 1 | `[3]` | `3 -> 'B'` | `[{3,'B'}]` | `[]` |
| 2 | `[3,4,5]` | `3->'B'`, `4->'OFF'`, `5->null` | `[{3,'B'}]` | `[{4,'day_off'},{5,'no_active_profile'}]` |
| 3 | `[1,2,3]` | todos `'A'` | `[{1,'A'},{2,'A'},{3,'A'}]` | `[]` |
| 4 | `[1,2,3]` | `1->'A'`, `2->'B'`, `3->'C'` | `[{1,'A'},{2,'B'},{3,'C'}]` | `[]` (perfil por dia, nao o da origem) |
| 5 | `[]` | qualquer | `[]` | `[]` |
| 6 | `[4,4,4]` | `4->'C'` | `[{4,'C'}]` | `[]` (dedup) |
| 7 | `[5,1,3]` | `1->'A'`, `3->'B'`, `5->'C'` | `[{1,'A'},{3,'B'},{5,'C'}]` | `[]` (ordenado) |
| 8 | `[0,6]` | ambos `'OFF'` | `[]` | `[{0,'day_off'},{6,'day_off'}]` |
| 9 | `[2]` | `2 -> undefined` | `[]` | `[{2,'no_active_profile'}]` |
| 10 | `[2]` | `2 -> 'X'` (valor inesperado) | `[]` | `[{2,'no_active_profile'}]` |
| 11 | `[7]` | qualquer | lanca `RangeError` | — |
| 12 | `[-1]` | qualquer | lanca `RangeError` | — |
| 13 | `[1.5]` | qualquer | lanca `RangeError` | — |
| 14 | `[0,1,2,3,4,5,6]` | todos `'A'` | 7 alvos | `[]` (teto = a propria semana) |

Rotulo de razao para texto (usado por `summarizeMultiDayResult`):
`'day_off'` -> `"dia OFF"`; `'no_active_profile'` -> `"dia sem perfil ativo"`.

### Tabela de casos — `summarizeMultiDayResult` (`dayLabels = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab']`)

| # | `created` | `failed` | `skipped` | `title` | `description` | `variant` |
|---|---|---|---|---|---|---|
| 1 | `[3]` | `[]` | `[]` | `Torneio adicionado a 1 dia` | ausente | ausente |
| 2 | `[3,4,5]` | `[]` | `[]` | `Torneio adicionado a 3 dias` | ausente | ausente |
| 3 | `[3]` | `[]` | `[{4,'no_active_profile'},{5,'no_active_profile'}]` | `Torneio adicionado a 1 dia` | `Pulados: Qui, Sex (dia sem perfil ativo)` | ausente |
| 4 | `[3]` | `[]` | `[{4,'day_off'},{5,'no_active_profile'}]` | `Torneio adicionado a 1 dia` | `Pulados: Qui (dia OFF); Sex (dia sem perfil ativo)` | ausente |
| 5 | `[1,2]` | `[3]` | `[]` | `Adicionado a 2 de 3 dias` | `Falhou em Qua` | `destructive` |
| 6 | `[1]` | `[2,3]` | `[{4,'day_off'}]` | `Adicionado a 1 de 3 dias` | `Falhou em Ter, Qua. Pulados: Qui (dia OFF)` | `destructive` |
| 7 | `[]` | `[1,2]` | `[]` | `Nao foi possivel adicionar` | `Falhou em Seg, Ter` | `destructive` |
| 8 | `[]` | `[]` | `[{4,'day_off'},{5,'day_off'}]` | `Nenhum dia valido` | `Pulados: Qui, Sex (dia OFF)` | `destructive` |
| 9 | `[]` | `[]` | `[]` | lanca `RangeError` | — | — |

Regras de composicao:
- "N de M dias": `M = created.length + failed.length` (os pulados nao entram no
  denominador — eles nunca viraram tentativa).
- Grupos de pulados sao ordenados por `dayOfWeek` crescente dentro do grupo, e os
  grupos aparecem na ordem `day_off`, depois `no_active_profile`.
- **Nunca reportar sucesso quando houve falha** — havendo qualquer item em
  `failed`, o toast e `destructive`.

---

## Contradicoes entre a spec e o codigo real

Registradas em vez de decididas em silencio.

### C1 — "1 dia = byte-a-byte o de hoje: 1 POST, 1 toast"
O RF-02 afirma isso, mas **o fluxo de criacao de hoje nao emite toast de sucesso
nenhum**: `DayCreateTournamentDialog.handleSubmit` faz POST, invalida e emite
telemetria; `GradePlanner.addPlannedMutation.onSuccess` so invalida.

**Resolucao adotada:** vale o RF-04, que e explicito ("feedback obrigatorio, em
um unico toast por submit"). Com 1 dia marcado passa a haver 1 toast
(`Torneio adicionado a 1 dia`), o que e **mudanca visivel** em relacao a hoje. A
paridade byte-a-byte vale para o payload e para a contagem de POSTs, nao para o
toast. **Precisa de ciencia do founder.**

### C2 — O Detalhe do Dia usa o mesmo adapter
O RF-02 restringe o seletor aos "fluxos de criacao da grade: `+` da celula, botao
Novo Torneio (`DayCreateTournamentDialog`) e clique no card da biblioteca". Mas
`DayCreateTournamentDialog` **tambem** e consumido por `DayDetailZoom.tsx:1668`
(Detalhe do Dia), que a spec nao cita nem em escopo nem em "Fora de Escopo".

**Resolucao adotada (conservadora):** a capacidade multi-dia e **opt-in por
prop**; o Detalhe do Dia nao passa a prop e nao muda. Se o founder quiser o
seletor la tambem, e uma linha — mas nao se decide isso por omissao.

### C3 — `data-testid="multi-day-submit"`
As notas da spec sugerem esse testid. O botao Salvar e do dialog canonico e ja
carrega `data-testid="${testIdPrefix}-submit"` — nos fluxos da grade,
`day-zoom-create-submit`. Um elemento nao tem dois testids, e mudar o
`testIdPrefix` renomearia **todos** os testids do modal naquele fluxo, quebrando
`tests/client/day-detail-zoom/DayCreateTournamentDialog.test.tsx`.

**Resolucao adotada:** o submit continua `day-zoom-create-submit`. Os testids
novos sao apenas os do picker: `week-days-picker` e `week-day-chip-${dayOfWeek}`
(mais `library-panel` e `library-card-${id}`, que a spec tambem pede). A
sugestao `multi-day-submit` fica superada, com este motivo.

### C4 — "`Promise.allSettled`" x execucao sequencial
Ver Q6/Opcao A. A garantia exigida (falha parcial tolerada) e mantida; a mecanica
muda para reduzir a corrida do auto-populate da biblioteca. **Desvio declarado.**

### C5 — Invalidacao de `["day-detail", profile, dayOfWeek]`
O RF-04 lista tres chaves a invalidar e **nao** inclui `["day-detail", ...]`, que
`DayCreateTournamentDialog.tsx:76-78` invalida hoje e que
`client/src/hooks/useDayDetail.ts:89` consome. Se o lote invalidar somente as tres
chaves da spec, o Detalhe do Dia fica com cache velho apos uma criacao multi-dia.

**Resolucao adotada:** o lote invalida as tres chaves do RF-04 **mais**
`["day-detail", profile, dayOfWeek]` por alvo criado, e mantem a chave legada
`["planned-tournaments"]` que o adapter ja invalida — tudo **uma unica vez ao fim
do lote** (o "uma vez por lote" do RF-04 e sobre nao invalidar N vezes, nao sobre
reduzir o conjunto de chaves). Sem isso a feature nasce com bug de cache numa
tela vizinha.

### C6 — Clique no card em modo colapsado
O RF-01 exige que o modo colapsado respeite o teto de altura; o RF-03 nao diz se
o clique tambem vale nos cards compactos (`LibraryCard compact`). **Resolucao
adotada:** vale, por coerencia — o card compacto e o mesmo card. Se o founder
quiser restringir, e uma condicao na prop.

---

## Consequencias

### Positivas
- A Biblioteca para de empurrar a pagina: com 200+ torneios a altura fica capada,
  o contador continua visivel e a lista rola por dentro do scroll container que
  **ja existia**.
- Montar cinco dias iguais deixa de ser cinco arrastos ou cinco modais.
- A regra de "quais dias viram torneio e por que os outros nao" fica num helper
  puro, testavel sem DOM, com razao nomeada — nao espalhada em `if` de JSX.
- `TournamentFormState`, `useTournamentDialogForm` e o dialog canonico saem da
  sprint praticamente intactos (uma prop opcional), entao grind ao vivo, edicao e
  biblioteca nao correm risco.
- O fluxo da biblioteca passa a mandar `libraryTemplateId`, o que de quebra faz
  `alreadyInGrid` do Selector funcionar nesse caminho.

### Negativas
- **O sticky depende de neutralizar o `overflow: hidden` do `react-resizable-panels`.**
  Se a neutralizacao nao for feita, o sticky vira no-op **silencioso** — nada
  quebra, o painel so nao acompanha o scroll, e o criterio de aceitacao passa
  despercebido em teste de unidade. E o maior risco desta sprint.
- Perder `overflow: hidden` no `PanelGroup` pode expor conteudo durante o arrasto
  do handle de resize. Impacto esperado cosmetico, nao verificado.
- Um toast passa a existir onde hoje nao existe (C1) — mudanca de tela sem flag.
- O lote sequencial reduz, mas **nao elimina**, a duplicacao de linhas em
  `tournament_library` no fluxo digitado a mao: `ensureLibraryEntryForPlannedSafe`
  continua fire-and-forget e sem unique constraint. A eliminacao real exige
  migration (indice unico) ou `await` no auto-populate — os dois fora de escopo.
- A protecao contra "clique disparado apos arrasto" depende, na parte mais forte,
  de comportamento nao documentado de uma lib descontinuada (ADR-011). A guarda
  propria cobre o teste; o navegador cobre o resto.
- `dayOfWeek`/`profileLetter` viram opcionais em `DayCreateTournamentDialogProps`
  — alargamento de tipo que o compilador aceita em silencio, entao os usos
  internos precisam de revisao manual.

### Neutras / operacionais
- **Sem migration, sem endpoint novo, sem mudanca em `shared/schema.ts`.** Nada a
  registrar como PENDENTE PROD.
- Nenhuma mudanca em filtros, ordenacao, busca ou persistencia
  (`bibliotecaFilters` em localStorage).
- `BibliotecaEmbedded` (Detalhe do Dia), `TournamentLibraryNew` (`/library`) e o
  mobile continuam como estao.
- `client/src/components/grade-planner/TournamentLibrary.tsx` (morto, sem
  imports) continua no repositorio — limpeza separada, como a spec pede.
- Follow-up grepavel: mover `DAYS_PT` para `shared/` e acabar com a duplicacao
  `weekDays` x `DAYS_PT` (Q5/Opcao C).
- Follow-up grepavel: `mapLibraryToPlanned` nao seta `libraryTemplateId` (D6).

---

## Confianca

**Alta** para D1, D2, D4 e D5. O `extraSlot` foi desenhado para este uso, a prop
`extraCanSubmit` e aditiva e neutra, o helper puro segue a familia
`shared/grade-*.ts` que ja existe, e o desenho do lote (sequencial, um toast, uma
invalidacao) e mecanico e inteiramente testavel.

**Media** para D3. O bloqueio de clique pos-drag do `react-beautiful-dnd` e real e
bem conhecido, mas e comportamento implicito de lib descontinuada e nao se
reproduz em jsdom. A guarda propria e o que sustenta a decisao; se o navegador
mostrar falso positivo, a saida e a Opcao C do Q3 (botao dedicado no card).

**Baixa a media** para D7. A parte "teto de altura" e segura e ate reduz risco de
DnD (o scroll container ja existe e nao vira aninhado). A parte **sticky** depende
de neutralizar o `overflow: hidden` de dois componentes de terceiros e **nao foi
verificada no navegador** ao escrever este ADR. A degradacao aceitavel esta
nomeada (Q4/Opcao D: so o teto, sem sticky), para a sprint nao travar caso o
sticky se prove inviavel.

---

## Artefatos relacionados
- Spec: `Docs/specs/grade-planner-library-and-multi-day.md`
- Diagramas: `Docs/architecture/diagrams/grade-planner-multi-day/`
  - `library-click-to-batch-flow.mermaid`
  - `multi-day-batch-submit-sequence.mermaid`
  - `ownership-components.mermaid`
- Precedentes: ADR-011 (escolha do `react-beautiful-dnd`), ADR-010 (perfil OFF
  como 4o estado), ADR-213 (consolidacao do Detalhe do Dia), ADR-200 Parte A
  (chave canonica da biblioteca)
- Codigo tocado: `client/src/pages/GradePlanner.tsx`,
  `client/src/components/grade-planner/BibliotecaPanel.tsx`,
  `client/src/components/grade-planner/LibraryCard.tsx`,
  `client/src/components/grade-planner/WeekDaysPicker.tsx` (novo),
  `client/src/components/grade/DayCreateTournamentDialog.tsx`,
  `client/src/components/tournament/TournamentFormDialog.tsx`,
  `shared/grade-multi-day.ts` (novo)
