# Dashboard — revisão completa e plano de melhorias

**Data:** 2026-08-01 · **Sessão:** Dashboard (`/dashboard`)
**Escopo auditado:** tudo que foi implementado nesta sessão **mais** o dashboard
pré-existente (página, 9 abas, filtros, gráficos, export, camada de dados).

Este documento é o resultado da revisão pedida pelo founder ("busque por leaks,
buracos, melhorias e gargalos; torne tudo mais efetivo, eficaz e eficiente") e o
plano do que ainda vale fazer.

---

## 1. Bugs encontrados e CORRIGIDOS nesta rodada

| # | Bug | Impacto | Origem |
|---|---|---|---|
| 1 | O "x" de uma etiqueta **excluída** não limpava o filtro — convertia em *incluída*, invertendo o recorte | **Alto**: mostrava número errado sem avisar | Meu, nesta sessão |
| 2 | Estado vazio dizia "Sem dados disponíveis" quando eram os filtros novos que zeravam o resultado | Médio: sugeria que o jogador não tinha histórico | Meu, nesta sessão |
| 3 | **Export CSV saía vazio em 7 das 8 abas** — cabeçalho certo, linhas em branco | **Alto**: a funcionalidade inteira era inútil | Pré-existente |
| 4 | Aba Posição prometia "eliminação por faixa do field" e mostrava **volume por tamanho de field** | **Alto**: rótulo mentindo + duplicava a aba Participantes | Pré-existente |
| 5 | Marca **FT** na tabela usava a regra antiga (top 10% do field) | Alto: 100º de 1000 aparecia como mesa final | Pré-existente |
| 6 | Comparação de períodos: "10 torneios" fixo, último dia da janela descartado, e histórico inteiro partido ao meio quando a janela vinha vazia | Alto: três formas de mentir na mesma tela | Pré-existente |

**Causa raiz de 1:** `setMode(...)` seguido de `toggleOption(...)` — o estado do
React só vale no render seguinte, então o toggle rodava com o modo anterior.
Virou `removeOption`, que não depende de modo. Coberto por teste.

**Causa raiz de 3:** `formatCSVRow(row, headers)` lê `row[header]` (chaves em
português) e recebia a linha crua da API (chaves em inglês). Virou
`projectRowForExport`. Coberto por teste com 6 abas.

---

## 2. Ganho de eficiência entregue

**O dashboard baixava até 50.000 torneios em toda visita**, em qualquer aba, com
um único propósito: extrair as listas de sites/tipos/velocidades para os botões
de filtro. Em conta grande são dezenas de MB de JSON por load, e o painel de
filtros só ficava utilizável quando esse download terminava.

- `/api/dashboard/filter-options`: três `DISTINCT` no banco, dezenas de bytes,
  cache de 60s. Medido em **6ms**.
- O histórico completo passou a carregar **só na aba Geral**, a única que precisa
  dele (detecção de big hits).

---

## 3. Achados NÃO corrigidos — plano priorizado

### P0 — corrigido nesta rodada

**3.1 A tabela "Todos os Torneios" ignorava os filtros ao ordenar.** ✅ CORRIGIDO
`TournamentTable.handleSort` busca `/api/tournaments?sortBy=...&limit=500` **sem
período e sem filtros** (há até um comentário assumindo isso: *"para ordenação,
não aplicar filtros"*). Clicar em "Maiores Lucros" passa a exibir torneios de
fora do recorte, e a lista **fica presa nesse resultado** mesmo depois de o
jogador mudar filtro ou período. Some com o dado que ele está analisando sem
qualquer aviso.
*Corrigido:* `period` + `filters` viajam na busca de ordenação, e a chave da
query os inclui — mudou o recorte, refaz a busca. A ordenação por data deixou de
ir ao servidor (a lista da página já basta).

**3.2 A mesma tabela se chamava "Todos os Torneios" e mostrava 20.** ✅ CORRIGIDO
*Corrigido:* virou "Torneios do Recorte", e o subtítulo diz quantos está
exibindo e por qual critério. A paginação de verdade continua como melhoria
futura (hoje: 50 por vez, com "carregar mais").

### P0 — restante

**3.3 Verificação de ponta a ponta das consultas novas.**
Cinco consultas criadas nesta sessão (bounty, bolha, eliminação, reentradas,
mesas simultâneas) passaram por tipagem e testes de unidade, mas **não foram
executadas contra o banco real** — não houve acesso a banco nesta sessão. A
primeira visita às abas Tipo, Posição, Período e Reentradas é o teste real.
*Ação:* abrir as quatro abas e conferir o log do servidor. Esforço: minutos.

### P1 — inconsistências que confundem o jogador

**3.4 Três formatações de dinheiro diferentes na mesma página.**
`en-US` nos cards e na tabela (`$1,234.56`), `pt-BR` no gráfico de evolução
(`US$ 1.235`), e uma terceira nas dicas/cards novos. O mesmo valor aparece
escrito de dois jeitos em telas vizinhas.
*Correção:* uma função só, exportada de `lib`, usada em todos os pontos.
Esforço: baixo. Cuidado: mexe em arquivo usado por outras áreas.

**3.5 As faixas de ABI do filtro e do gráfico não são as mesmas.**
O filtro usa as 12 bandas canônicas (`$16-19`, `$20-29`...) — as mesmas da área
Torneios, por decisão do founder. Mas a **aba ABI** ainda agrupa com rótulos
legados (`$21-$32`). O jogador filtra por uma régua e lê o gráfico em outra.
*Correção:* migrar `getAnalyticsByBuyinRange` para `BUYIN_BANDS`. Esforço: médio
(o gráfico e o export dependem do rótulo).

**3.6 Conteúdo das dicas nunca foi validado contra histórico real.**
A mecânica está testada (24 testes); o *texto* e os limiares (30 torneios para
veredito, 10 para tendência) foram escolhidos por bom senso, não medidos.
*Ação:* o founder já sinalizou que quer revisar isso com calma.

### P2 — manutenção e dívida

- **3.7** O card com `className` de ~180 caracteres está repetido **39 vezes**
  nos componentes de aba. Extrair `<DashboardCard>` elimina a repetição e dá um
  lugar único para ajustar o visual.
- **3.8** `tabTypeMap` e `tabNameMap` (em `Dashboard.tsx`) duplicam os rótulos
  que já vivem em `dashboard-tabs-helpers`. Três listas de abas para manter em
  sincronia — a de `Dashboard.tsx`, a de `dashboard-tabs-helpers` e a
  `VALID_TABS` de `dashboard-filter-helpers`.
- **3.9** `/api/analytics/mental-correlation` e
  `client/src/lib/mental-correlation-helpers.ts` ficaram **sem nenhum
  consumidor** depois que o popup saiu da aba Geral. Decisão pertence à área
  Mental: reaproveitar ou aposentar.
- **3.10** `/api/dashboard/stats` não tem cache no servidor, enquanto
  `quick-stats` tem. É a consulta mais pesada da página.
- **3.11** `TicketsWidget` mora em `components/dashboard/` mas quem usa é o
  `GradePlanner`. Arquivo na pasta errada — confunde o mapa de áreas.
- **3.12** Os cards novos (Reentradas, Bolha, Eliminação, Bounty, Mesas
  Simultâneas) têm a lógica pura coberta, mas **nenhum teste de componente**.
- **3.13** Período personalizado: `customDateRange` é estado local do painel;
  ao trocar para um período pré-definido, `dateFrom`/`dateTo` somem do filtro
  mas o texto do botão pode continuar exibindo o intervalo antigo.

---

## 4. Fora do escopo desta sessão

**Classificação de satélite e flight** continua errada e já está documentada em
`dashboard-plano-2026-07-31.md` §3. Pertence à área **Import**. Enquanto não for
tratada, os botões "Satélite" e "Flight" do filtro funcionam mecanicamente mas
classificam mal — evidência coletada: `FLIGHT_DAY_REGEX` aceita a palavra
"Final", e o balde Satélite vem contaminado do import, não da leitura do nome.

---

## 5. Ordem sugerida

1. Verificar as abas Tipo, Posição, Período e Reentradas no navegador (3.3) — é
   a única verificação que não dá para fazer sem o founder.
2. P1 3.4 e 3.5 — consistência de leitura (dinheiro e faixas de ABI).
3. Revisão do conteúdo das dicas junto com o founder (3.6).
4. P2 conforme sobrar espaço.

---

## 6. Resumo em números

- **8 bugs corrigidos** — 6 pré-existentes, 2 introduzidos e pegos nesta sessão.
- **1 gargalo de performance** removido (download de até 50k linhas por visita).
- **6 consultas novas** no servidor, todas respeitando período e filtros.
- **660 testes verdes**, `tsc` sem erro.
- **Pendente de validação real:** as 5 consultas criadas hoje, que precisam de
  uma visita às abas para confirmar o SQL contra o banco.
