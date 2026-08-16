# F3 — Leitura do spot

> Frente 3 de 5 do [Range Lab](00-INDICE.md). Uma frente por sessao.

## Cabecalho
| | |
|---|---|
| **Modelo** | Opus 5 — Extra |
| **Depende de** | F1 (precisa do motor rapido e do heroi-como-range) |
| **Entrega** | A ferramenta deixa de responder "quanto" e passa a responder "por que" |
| **Migration** | nao |
| **Status** | Nao iniciada |

Maior frente depois da F1, e a que mais coloca numero novo na tela — por isso
`Extra`. **Se inchar, quebrar em F3a** (categorias + cascata + bloqueadores) e
**F3b** (runout + distribuicao + filtros).

**Primeiro passo desta sessao:** passe de detalhamento, com foco na taxonomia de
categorias e na regra de sobreposicao. Mostrar ao founder antes do TDD.

## Contexto minimo (para abrir a frio)
Hoje a tabela de combos diz "ganha / perde / chop" e uma equity que, no river, so
pode ser 100%, 0% ou 50% — informacao praticamente nula. O jogador ve **o
resultado** e nao ve **a estrutura**: quantos flushes, quantos top pares, quantos
blefes, o que a carta dele bloqueia.

E o que Flopzilla e GTO Wizard fazem melhor que nos. Fechar essa lacuna e o ponto
alto do projeto.

---

## RF-03.1: Decomposicao por categoria de mao
- Agrupar os combos do vilao pelas categorias padrao (taxonomia Flopzilla).
- **Taxonomia fechada (emenda A14, [F5](F5-mindriver.md)).** O MindRiver ja porta
  essa classificacao inteira; adotar tal e qual, inclusive as cores fixas por
  categoria:

  **Maos feitas, 16** — straight flush, quadra, full house, flush, sequencia,
  set (par na mao), trinca (par na mesa), dois pares, overpair, top par, 2o par,
  3o par, par fraco (4o+), underpair, as alto, sem par.

  **Qualificadores dentro da categoria** — flush: `nut` / `strong` / `weak`;
  dois pares: `top two` / `top + bottom` / `bottom two` / `par + par da mesa`;
  par: kicker `k_top` / `k_good` / `k_weak`. Sem isso "top par" junta o
  incomparavel.

  **Draws, 8** — flush draw nut, flush draw, backdoor flush draw, open-ended /
  dupla gutshot, gutshot, backdoor de sequencia, 2 overcards, 1 overcard.

- Por categoria: contagem, massa ponderada e equity media.
- **Contagem e massa lado a lado, sempre (emenda A17).** Combos crus e massa
  ponderada na mesma linha, mais o rodape com `total de combos` e
  `combos que passam no filtro`. E o que impede somar coisa que nao soma.
- **Textura do bordo no topo (emenda A15).** `monotone` / `2flush` / `rainbow` +
  `trips` / `pareado` / `sem par`. Barato, e enquadra tudo que vem embaixo.
- **Regra que nao pode ser esquecida:** categorias de mao feita e de draw se
  sobrepoem. O proprio manual do Flopzilla avisa que as contagens sao
  independentes e podem duplicar. **Nunca somar as duas e apresentar como 100%.**
  A tela declara a sobreposicao.

## RF-03.2: Cascata da equity
Barra que explica de onde saiu o numero: range nominal (1326) -> range declarado
-> massa apos card removal -> massa que perde para voce -> chops. O jogador ve o
proprio bloqueador operando.

## RF-03.3: Analise de bloqueadores
- Para cada carta da mao do heroi: quantos combos de value e de blefe do vilao ela
  remove, e o efeito liquido em pontos percentuais de equity.
- Metodo: comparar o spot real contra o contrafactual em que aquela carta esta
  viva.
- Nenhuma ferramenta do benchmark entrega isso mastigado. E o coracao do river.

## RF-03.4: MDF, razao value/blefe e indiferenca
- `MDF = 1 - alpha`.
- Blefes necessarios para a sua indiferenca: `blefes = value * alpha / (1 - alpha)`.
- "Faltam N combos de blefe" ou "sobram N" no range declarado.
- Com heroi como range: "sua mao e o 7o melhor bluffcatcher de 19; o corte de EV
  zero esta no 12o".
- O que conta como "value" e como "blefe" e uma **classificacao derivada** (mao
  que bate o heroi vs mao que perde). Declarar isso — nao e a intencao do vilao, e
  o resultado contra a sua mao.

## RF-03.5: Matriz de runout — **movido para a F5a (RF-05.3)**
Era: grade das cartas que ainda podem sair, pintada pelo **veredito**
(call / break-even / fold).

O MindRiver tem a mesma grade pintada pela **equity** ("Hotness"), com resumo de
quantas cartas sobem e quantas descem. E o mesmo painel com duas pinturas —
construir duas vezes seria desperdicio. Consolidado em
[F5a RF-05.3](F5-mindriver.md), com um seletor equity/decisao e **decisao como
padrao** (e a pergunta que esta ferramenta se propos a responder).

Nada se perde: os criterios de aceite do runout continuam valendo, agora la.

## RF-03.6: Distribuicao de equity — **ampliado na F5a (RF-05.1)**
Era: curva ordenada dos combos do heroi com a linha de `alpha` cortando.

O MindRiver desenha **as duas curvas sobrepostas** (range ativo em cor cheia,
adversario em cinza atras) — a vantagem de range vira desenho. A versao final,
com as duas curvas **mais** a linha de `alpha` e o "N das suas M maos pagam" (que
o MindRiver nao tem), esta em [F5a RF-05.1](F5-mindriver.md).

## RF-03.7: Filtros
- **Na leitura:** por categoria, por resultado, por faixa de equity, por
  bloqueador (combos que contem carta X), por naipe.
- **O filtro pinta o range, nao filtra uma tabela (emenda A16,
  [F5](F5-mindriver.md)).** Marcar "flush draw" **esmaece a matriz 13x13 inteira
  e acende so as celulas que contem flush draw**. Este e o mecanismo — era o que
  faltava especificar. Atalhos `marcar tudo` / `desmarcar tudo`, e o rodape diz
  quantos combos passam no filtro (RF-03.1 / A17).
- **Na construcao:** destacar na matriz so as classes que fazem top par ou melhor
  no bordo atual.

## RF-03.8: Por combo, as duas maos feitas
A coluna "equity" no river so diz 100/0/50. Passa a mostrar a mao feita dos dois
lados: "`KhQh` = flush de copas -> voce `A6s` = top par, kicker 6".

---

## Criterios de aceite
1. A soma das massas por **categoria de mao feita** bate com a massa total do
   range (dentro de `1e-9`). Draws sao contados a parte e a tela diz isso.
2. Bloqueador: remover manualmente do range os combos que contem a carta do heroi
   produz o mesmo delta de equity que a analise reporta.
3. ~~Matriz de runout~~ — criterio migrou para a [F5a RF-05.3](F5-mindriver.md)
   junto com o RF.
4. `MDF + alpha = 1` em toda a faixa de aposta.
5. ~~Distribuicao de equity~~ — criterio migrou para a
   [F5a RF-05.1](F5-mindriver.md) junto com o RF.
6. `npm run check` limpo; suite da area verde.

## Fora de escopo desta frente
ICM / risk premium (F4), persistencia server-side (F4), Coach (F4).

---

## HANDOFF — ao concluir a F3

### Confira voce mesmo (10 min, no `:3000` reiniciado)
Monte um river de verdade: bordo de 5 cartas, sua mao, um range de vilao com
value e blefe.

1. **Categorias batem.** O painel de leitura lista flush, dois pares, top par,
   ace-high, sem par. Some as contagens de **mao feita**: tem que dar o total de
   combos do range. Draws aparecem separados e com aviso de que se sobrepoem.
2. **Cascata faz sentido.** A barra mostra quanto do range morreu por causa das
   suas cartas. O numero final tem que ser o mesmo total do item 1.
3. **Bloqueador confere na mao.** A tela diz quanto sua carta remove. Tire essa
   carta do bordo/mao e refaca: a equity tem que mexer no tamanho que ele disse.
4. **MDF.** MDF + equity necessaria (alpha) = 100%. Sempre.
5. **Blefes que faltam.** Se o vilao tem so value, tem que dizer "faltam N combos
   de blefe". Adicione blefes ate o veredito virar call.
6. **Filtro pinta o range.** Marque so "flush draw" no painel de categorias: a
   matriz 13x13 tem que esmaecer tudo e acender so as classes que fazem flush
   draw nesse bordo. O rodape diz quantos combos passaram.
7. **Combo explicado.** Na tabela, cada linha diz a mao feita dos dois lados — nao
   so "ganha/perde".

Runout e curva de distribuicao saem na [F5a](F5-mindriver.md); nao procure por
eles aqui.

### Prompt da proxima sessao

Frente: **F4 — Contexto**. Modelo: **Opus 5 — Alto**.
```
Frente F4 do Range Lab. Leia Docs/specs/range-lab/00-INDICE.md e
Docs/specs/range-lab/F4-contexto.md antes de qualquer coisa.

F0 a F3 estao concluidas e verificadas. Esta frente tem migration (0101) e toca
dinheiro (ICM). Comece pelo ADR: formula do risk premium, estrutura das tabelas
novas e gate de tier da biblioteca sincronizada. Depois pipeline TDD.

Confirme comigo o gate de tier antes de implementar.
```
