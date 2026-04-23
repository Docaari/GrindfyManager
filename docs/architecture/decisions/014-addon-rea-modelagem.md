# ADR-014: Modelar Add-on e Re-entry como flags ortogonais (nao expandir enum `type`)

## Status
Aceito

## Data
2026-04-23

## Contexto

Grindfy e uma ferramenta de decisao financeira para jogadores profissionais de MTT. A auditoria do estrategista em `/grind-live` identificou dois leaks analiticos materiais:

| Leak | Incidencia | Impacto |
|------|------------|---------|
| Add-on nao rastreado | ~20% dos torneios jogados sao "Plus" | ROI inflado em 8-15 pontos percentuais nos torneios afetados (add-on ~=100% do buy-in nao contabilizado) |
| ReA usando REBUY como workaround | ~15% do volume total | ABI errado em ~22% nesses torneios; KPI "Rebuys" e "Re-Entries" confundido |

Um jogador profissional tipico joga 40-80 torneios/semana; 8-16 sao Plus, 6-12 sao ReA. Em festivais (WCOOP, KO Series) esses numeros dobram. O leak contamina Dashboard, Analytics, Library Stats, Studies e AI Coach — **todos** consomem ROI/ABI como base.

O modelo de dados atual tem:
- `tournaments.category` enum: `Vanilla | PKO | Mystery` (3 valores)
- `tournaments.reentries` integer (existe, mas nao consumido no calculo)
- nenhuma nocao de "permite add-on", "add-on foi pago", "permite re-entry", "limite de re-entries"

Precisamos representar dois conceitos **ortogonais**:

1. **Plus (Add-on):** torneio permite pagamento opcional de stack adicional no intervalo. Caracteristica do torneio + instancia de jogo (pagou ou nao).
2. **ReA (Re-entry Allowed):** torneio permite re-entrada apos bust. Caracteristica do torneio + instancia de jogo (quantas re-entradas ja tomou).

Esses dois eixos sao independentes: `Vanilla` pode ser Plus, ReA, ambos, ou nenhum. `PKO` idem. `Mystery` idem.

## Opcoes Consideradas

### Opcao A: Expandir enum `type` (ou criar enum paralelo `structure`)

Adicionar valores ao enum ou criar enums derivados: `Vanilla`, `Vanilla Plus`, `Vanilla ReA`, `Vanilla Plus ReA`, `PKO`, `PKO Plus`, `PKO ReA`, `PKO Plus ReA`, `Mystery`, `Mystery Plus`, `Mystery ReA`, `Mystery Plus ReA` — **12 variantes**.

- **Pros:**
  - Nenhuma coluna nova no schema (ou poucas).
  - Parser CSV mapeia direto para string.
- **Contras:**
  - **Combinatoria explode.** 3 types x 2 Plus x 2 ReA = 12 valores. Se amanha entra Bounty Builder (4o eixo), vai para 24. Se entra "Knockout" e "Progressive Knockout" como distincos, vai pra 48+. Inviavel.
  - **Quebra queries analiticas existentes.** `GROUP BY type` hoje retorna 3 grupos; passaria a retornar 12 — todos os dashboards, analytics, Library Stats, correlacao studies-performance quebram visualmente (bar chart com 12 barras em vez de 3).
  - **Conceitos ortogonais nao sao uma enumeracao.** Plus e ReA nao sao "tipos de torneio"; sao **caracteristicas** que podem ou nao estar presentes. Enum expressa categoria mutualmente exclusiva; aqui sao independentes.
  - **Falta dimensao de instancia.** Enum `type="PKO Plus"` nao diz se o jogador **pagou** o add-on nesta entrada. Precisariamos de outra coluna mesmo assim (`addOnTaken`). Ou seja: enum resolve zero problemas e cria 12 novos valores.
  - **`type` = "Mystery Plus ReA"` e ilegivel.** UI teria que split por espaco / regex para pintar badges. Schema nao comunica intent.
  - **Migrar dados existentes e custoso.** Toda row com `type="PKO"` precisaria ser reinspecionada para decidir se vira `"PKO"`, `"PKO Plus"`, `"PKO ReA"` ou `"PKO Plus ReA"` — mesmo trabalho que backfill com flags, mas com dado estruturalmente pior no final.

### Opcao B: Tabela filha `tournament_entries` (granular por entrada)

Cada torneio vira pai; cada entrada (inicial + re-entries) vira row filha. Schema:

```
tournaments (id, name, allowsAddOn, allowsReentry, maxReentries, ...)
tournament_entries (id, tournament_id FK, entry_number, buy_in_paid, addon_taken, addon_cost_paid, prize, bounty, position)
```

- **Pros:**
  - Modelo canonicamente correto. Uma row por entrada permite analises granulares: "meu ROI na 2a entrada em torneios ReA e pior que na 1a?", "add-on pago na entrada X tem relacao com prize?".
  - Sem ambiguidade: cada entrada tem seu proprio buy_in, seu proprio addon_taken, sua propria position de bust.
  - Evolucao natural: reports futuros "quantas entradas em media por torneio ReA" saem direto de `COUNT(*) FROM tournament_entries GROUP BY tournament_id`.
- **Contras:**
  - **Overkill para o MVP (v1).** Todo o codigo de calculo (`calculateSessionStats`, `storage.getTournamentStats`, `analytics.avgROI`) precisa ser reescrito para agregar rows filhas.
  - **Refactor massivo** em ~15 arquivos: todos endpoints, parser CSV, integracao Suprema, fluxo `GrindSessionLive.tsx` (TournamentCard precisa saber qual entrada esta ativa), summary modal, dashboard.
  - **Queries mais lentas.** Cada torneio na listagem vira N+1 (ou join) para pegar entradas. Library Stats precisa agregar filhas antes de exibir.
  - **UX do Live conflita.** O jogador clica "REBUY" no card — isso e "mesma entrada, stack adicional" (preserva entry). O jogador clica "GG" seguido de "Re-entrar" — isso e "entrada nova". Codigo precisa distinguir os dois eventos no TournamentCard com multi-state complexo.
  - **Prematuro.** MVP precisa resolver 95% do leak. Analise "ROI por entrada 1/2/3+" e feature de v2 (demanda ainda nao validada; AI Coach pode gerar o insight em cima de dados agregados v1).
  - **Risco de regressao.** Schema atual tem `tournaments.reentries` (integer) ja usado em endpoints. Mover para tabela filha quebra contratos. Custo alto por ganho nao-critico no prazo.

### Opcao C: Flags ortogonais por tabela (ESCOLHIDA)

Adicionar 6 campos distribuidos em 4 tabelas:

| Campo | Tipo | `tournament_library` | `planned_tournaments` | `session_tournaments` | `tournaments` |
|-------|------|---|---|---|---|
| `allowsAddOn` | boolean default false NOT NULL | x | x | x | x |
| `addOnCost` | decimal nullable | x | x | x | x |
| `addOnTaken` | boolean default false NOT NULL | — | — | x | x |
| `allowsReentry` | boolean default false NOT NULL | x | x | x | x |
| `maxReentries` | integer nullable (null = ilimitado) | x | x | x | x |
| `reentries` | integer default 0 NOT NULL | — | — | x | (ja existe) |

Regra: `allowsAddOn / addOnCost / allowsReentry / maxReentries` sao **caracteristicas do torneio** (presentes em library, planned, session e tournaments). `addOnTaken / reentries` sao **instancias de jogo** (so presentes em session e tournaments; nao existem em library/planned, pois esses representam "o torneio que vou/posso jogar", nao "como eu joguei").

Formula nova de investimento (aplicada em 3 lugares: `calculateSessionStats`, `calculateFinalSessionStats`, `storage.getTournamentStats`):

```
totalInvestido = buyIn * (1 + rebuys + reentries) + (addOnTaken ? addOnCost : 0)
```

- **Pros:**
  - **Resolve 100% do leak** com refactor minimo (~30 linhas de schema, ~15 linhas de Zod refinements, formula em 3 arquivos).
  - **Flags sao ortogonais** — modelo expressa exatamente a realidade: Plus e ReA sao independentes e podem co-existir em qualquer tipo.
  - **Queries analiticas existentes nao quebram.** `GROUP BY type` continua retornando `Vanilla | PKO | Mystery`. Novas agregacoes por `allowsAddOn` ou `allowsReentry` sao opt-in.
  - **Backward-compat perfeita.** Rows pre-existentes sem flags comportam-se como `false/0/null` — formula nova e numericamente identica a antiga (zero regressao).
  - **Backfill tranquilo.** Regex no nome do torneio (Plus, Re-Entry, ReA, R/A) preenche as flags em massa. Idempotente.
  - **Zod refinements cruzados** (`!addOnTaken || allowsAddOn`, `reentries <= maxReentries`) previnem estados invalidos no banco.
- **Contras:**
  - **Perde granularidade por-entrada no historico.** Nao sabemos se o add-on foi pago na entrada 1 ou na entrada 3 (so sabemos que foi pago uma vez no torneio). Nao sabemos o prize de cada entrada separadamente. Para v1 isso e aceitavel — a pergunta de negocio e "quanto investi total?" (resolvido) e nao "como performei por entrada?" (v2).
  - **`addOnCost` e `maxReentries` nullable** na fase inicial — parser nao consegue deduzir sempre. Zod refinement exige `addOnCost > 0` quando `addOnTaken=true`, forcando UI (Spec 2) a pedir o valor.
  - **Acumulacao de prize/bounty/position em re-entries** precisa ser convencionada (ADR suplementar — ver secao "Decisoes relacionadas").

## Decisao

Adotar **Opcao C: flags ortogonais**.

Justificativas principais:

1. **Modela corretamente conceitos ortogonais** — Plus e ReA nao sao categorias; sao caracteristicas independentes. Flags booleanas expressam isso direto no schema. Enum seria mentira sintatica.
2. **Custo minimo, cobertura maxima.** 6 campos resolvem 100% do leak com refactor pontual em 3 formulas. Opcao A teria custo similar de refactor mas com modelo pior. Opcao B tem custo 5-10x maior sem beneficio v1.
3. **Evolucao possivel.** Quando a necessidade de analise por-entrada aparecer (demanda validada em produto), migrar para Opcao B e **aditivo**: cria tabela `tournament_entries`, backfill a partir dos counts atuais (`reentries=2` vira 3 rows filhas iniciais), mantem flags como cache. Zero lock-in.
4. **Zero regressao numerica** em dados antigos sem flags. Garantido por teste bit-a-bit.

## Consequencias

### Positivas

- **Leak resolvido na raiz.** ROI e ABI passam a considerar add-on e re-entry em Dashboard, Analytics, Library Stats, AI Coach.
- **Refactor contido.** ~30 linhas schema + ~15 linhas Zod + 3 formulas atualizadas. Zero mudancas em dashboards existentes.
- **Schema legivel.** `allowsAddOn: true, addOnTaken: false` comunica intent direto; nenhum enum escondido.
- **Backfill em massa viavel.** Regex no nome do torneio detecta Plus/ReA em banco de 200k rows em <5min.
- **Queries analiticas por flag sao triviais.** `WHERE allows_addon = true AND addon_taken = true` da exatamente os torneios onde o leak estava mordendo.
- **Forward-compat.** Quando Spec 2/3 ligarem UI, nada mais muda no schema — so ligar botoes e modais a campos que ja existem e ja sao agregados corretamente.

### Negativas

- **Granularidade por-entrada ausente.** Se jogador quer "ROI na 2a entrada vs 1a", nao da para responder sem tabela filha. Aceito para v1; roadmap tem item para v2.
- **Duplicacao de 4 campos em 4 tabelas.** `allowsAddOn`, `addOnCost`, `allowsReentry`, `maxReentries` existem em library + planned + session + tournaments. Copy-on-promote (ver spec-foundation §4.1) mantem consistencia. Custo: ~120 bytes/row em session_tournaments + tournaments (aceitavel).
- **Zod refinements cruzados** tornam update parcial (PUT) mais complicado — precisa fazer merge com registro do DB antes de validar, documentado em spec-foundation §4.3.
- **Falsos positivos no backfill** (ex: "ExpressPLUS" da 888) exigem blocklist hardcoded.
- **Integracao Suprema sem flag explicita para add-on** — parser cai no mesmo regex de nome. Aceito.

### Neutras

- Flags nao impedem que, no futuro, migracao aditiva para `tournament_entries` aconteca. Neste caso, flags viram "cache denormalizado" para queries rapidas.
- `addOnCost` nullable forca UI a coletar o valor no momento do uso (nao no cadastro). Spec 2 documenta esse flow (dialog de add-on pede o valor com default `buyIn`).

## Decisoes relacionadas

Duas decisoes menores foram tomadas no escopo das Specs 2 e 3 e sao documentadas aqui para referencia centralizada.

### RD-1: Acumulacao de prize/bounty/position em re-entries (decisao C das alternativas da Spec 3)

**Contexto:** quando um torneio ReA tem re-entry, ha 3 opcoes para prize/bounty/position:
- **Opcao A — zerar:** cada re-entry reseta campos. Perde historico parcial.
- **Opcao B — preservar ultimo:** campo guarda so a ultima entrada. Perde premios anteriores.
- **Opcao C — acumular (ESCOLHIDA):** campos sao somados entre tentativas (prize += newPrize, bounty += newBounty); `position` guarda o **melhor** (`min(old, new)` null-safe).

**Justificativa:** jogador profissional pensa por-torneio, nao por-entrada. "Fiz $60 no torneio" e a pergunta util; "fiz $10 na entrada 1 e $50 na entrada 3" e curiosidade. Acumulacao preserva a resposta direta. Na v1, frontend nao envia prize/bounty/position no payload de re-entry; backend e defensivo (merge acumulativo quando os campos vem). Documentado em `docs/specs/grind-live-reentry-flow.md` §Decisao v1.

**Trade-off:** perde granularidade por entrada. Se usuario quer "prize da tentativa 1 separado", nao conseguimos. EditDialog permite corrigir manualmente.

Migrar para Opcao B e trivial em v2 (tabela filha `tournament_entries` captura granularidade; campo agregado vira SUM/MAX da filha).

### RD-2: Fila vs Pilha de modais em multi-tabling (decisao da Spec 3)

**Contexto:** jogador multi-tableando (4-8 mesas simultaneas) pode ter dois torneios ReA bustando quase ao mesmo tempo. Radix Dialog nao suporta nativamente modais empilhados (z-index conflict, focus trap, ESC nao determinista).

**Alternativas:**
- **Pilha (LIFO):** ultimo GG abre primeiro. Jogador responde o mais recente antes do anterior.
- **Fila (FIFO — ESCOLHIDA):** primeiro GG abre primeiro. Jogador responde na ordem em que os torneios bustaram.

**Justificativa:** FIFO preserva decisao explicita em cada torneio na ordem cronologica. Pilha confundiria: "esse modal e de qual torneio mesmo?". Com FIFO, jogador sabe que o modal atual e do torneio que bustou primeiro. Implementacao: state vira `reentryQueue: Tournament[]` (array), novo GG faz `push`, modal renderiza `queue[0]`, acao faz `shift`. Documentado em `docs/specs/grind-live-reentry-flow.md` §Caso 7.

**Trade-off:** jogador pode querer responder primeiro o torneio mais critico (ex: buy-in alto). FIFO nao prioriza. Em v2, se telemetria mostrar que jogadores fecham o modal sem escolher (tentando chegar ao outro), podemos priorizar por buy-in. V1 usa FIFO simples.

## Notas para evolucao (v2)

Se/quando aparecer demanda validada para analises granulares:

- **ROI por entrada (1a vs 2a vs 3a+):** exige tabela filha `tournament_entries`. Migracao aditiva: cria tabela, backfill a partir de `reentries` (3 entries para row com reentries=2), mantem flags no pai como cache.
- **Add-on pago em qual entrada:** idem. `tournament_entries.addon_taken` sobrescreve `tournaments.addon_taken` (campo pai vira OR das filhas).
- **Prize/bounty/position por entrada:** resolve RD-1 automaticamente.
- **Priorizacao de modal em multi-tabling:** telemetria de "modal fechado sem acao" + "tempo medio no modal" orienta se vale priorizar por buy-in.

Trigger para v2: AI Coach precisa responder "joga pior a segunda entrada?" — pergunta so respondivel com granularidade. Ate la, flags agregadas resolvem 95% das perguntas de produto.

## Confianca

Alta.

Decisao toma 3 restricoes como hard-constraints (resolver leak numerico, nao quebrar queries analiticas existentes, refactor minimo) e todas as alternativas foram pesadas contra elas. Opcao C passa nas 3; A e B falham em pelo menos uma.
