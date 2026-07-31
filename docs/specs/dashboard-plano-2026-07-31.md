# Dashboard — plano de trabalho (aberto em 2026-07-31)

**Sessao:** Dashboard (`/dashboard`). Escopo em `Docs/conventions/multi-sessao-agentes.md` §4.1.
**Origem:** lista de ajustes do founder, priorizada e aprovada por ele em 2026-07-31.

Ordem aprovada: bugs → filtros → satelite/flight → dicas por aba → abas novas → revisao.

---

## 1. Bugs baratos — FEITO (2026-07-31)

- **Comparacao de periodos** (`93392aec`). Volume era o texto fixo `"10 torneios"`.
  Junto vieram dois erros nao reportados: o ultimo dia da janela era descartado
  (comparacao de string entre ISO completo e `YYYY-MM-DD`) e, quando a janela
  vinha vazia, o codigo partia o historico inteiro ao meio e exibia como se
  fossem os periodos pedidos.
- **Marca FT na tabela de torneios** (`d9547125`). Lia `tournaments.final_table`,
  gravado na importacao com a regra `posicao <= 9 OU posicao <= 10% do field` —
  100o lugar num field de 1000 aparecia como mesa final. Passou a derivar na
  leitura de `posicao <= players_per_table` (fallback 9), igual ao card do topo.
  **Divida:** a regra errada continua no `csvParser.ts`, que e da area Import.
  Corrigir na fase Import (o founder assumira essa sessao depois desta).

## 2. Filtros — reforma

- Botao global **Incluir / Excluir** (ex.: Excluir + PKO + field `<100`).
- Multi-selecao em todos os grupos.
- **Faixa de ABI** (ausente hoje na UI; `buildFilters` ja aceita `buyinRange`),
  com as mesmas 12 bandas da area Torneios + campo manual.
- Participantes: min/max compactos, junto dos botoes de faixa.
- **Satelite** e **Flight** como botoes independentes (`type='Satellite'` e
  `is_flight` — o filtro "Tipo" atual usa a coluna legada `category`).
- Layout redesenhado; filtros ativos como etiquetas removiveis.

## 3. Satelite vs Flight

Separar de verdade e garantir que o Day 2 entre na conta (senao o ROI de flight
fica cronicamente negativo: Day 1 so tem custo). Lado leitura (filtrar, agrupar
por serie, contar) e desta sessao; mudanca na classificacao durante o import
pertence a area Import — ver §4.5 do documento de multiplas sessoes.

## 4. Dicas por aba

Remove o popup de correlacao mental do Geral (vai para a aba Mental no futuro —
decisao do founder). Cada aba ganha um diagnostico proprio, **por regra
deterministica, sem LLM**, respeitando o filtro ativo e com amostra minima
(abaixo dela, dizer "amostra pequena" em vez de dar veredito).

| Aba | Cruzamento |
|---|---|
| Site | ROI por site com volume comparavel; aponta o gargalo |
| ABI | Lucro medio por faixa; onde comeca a cair |
| Tipo | Vanilla vs PKO + quanto do lucro em PKO vem de bounty (`bounty_prize`) |
| Velocidade | $/hora por velocidade (`duration_seconds`); sem duracao, cai para ROI |
| Periodo | Melhor e pior dia da semana, em $ e volume |
| Participantes | ITM vs ROI por faixa de field × onde esta o volume |
| Posicao | Faixa de bust; alerta na zona de bolha; queda cedo na FT |

## 5. Abas novas — decidido com o founder

| Ideia | Decisao |
|---|---|
| Hora do dia | Entra **dentro da aba Periodo**. Endpoint `/api/analytics/by-time-of-day` ja existe e nenhuma tela usa |
| Bounty (PKO) | Entra **dentro da aba Tipo** |
| Bolha / ITM | Entra **dentro da aba Posicao** |
| Reentradas | **Aba nova** |
| Mesas simultaneas × ROI | Fazer **se o dado sustentar**. A maquinaria de sobreposicao existe (alimenta o card "Mesas Simultaneas"). Limite conhecido e documentado: `Duracao` do export e a duracao do EVENTO, nao o tempo do jogador na mesa — o numero e um teto |
| $/hora de mesa | Descartado pelo founder |
| Rake real | Descartado pelo founder |
| ROI por conta (nick) | Descartado pelo founder |
| **Field softness** | **NAO e do dashboard.** Ideia registrada aqui para a sessao **Torneios**: `field_total_entries` vs `field_size` mede reentrada do field e serve como proxy de campo mole na hora de escolher torneio |

## 6. Revisao final

Varredura de bugs/UX no dashboard inteiro depois que os itens acima entrarem.
