# Dashboard — o que falta você revisar

**Atualizado:** 2026-08-01, ao encerrar a sessão Dashboard.
**Para quem:** founder. Este é o único documento que você precisa abrir para
saber o que ainda depende de você.

Detalhe técnico completo em `dashboard-revisao-2026-08-01.md` (revisão + plano
P0/P1/P2) e `dashboard-plano-2026-07-31.md` (plano por item).

---

## 1. Verificação que só você pode fazer — PRIORIDADE

Cinco consultas novas ao banco foram criadas nesta sessão. Todas passaram por
tipagem e testes de unidade, mas **nenhuma delas rodou contra o banco de
verdade** — não houve acesso a banco na sessão. Se alguma tiver erro de SQL, é na
tela que aparece.

Abra `/dashboard` e passe por estas quatro abas:

| Aba | O que conferir |
|---|---|
| **Tipo** | Card "De Onde Vem o Prêmio" (bounty). Se **não aparecer**, seu histórico não trouxe o dado de recompensa — isso é assunto do Import, não bug. |
| **Posição** | Card "Bolha e ITM" + gráfico "Eliminação por Field" (agora mostra % do field restante, com âmbar na zona da bolha). |
| **Período** | Gráfico "Desempenho por Horário" e card "Mesas Simultâneas x ROI". **Confira se os turnos batem com a sua rotina real** — se você joga à noite e a madrugada aparece cheia, o fuso está errado. |
| **Reentradas** | Aba nova. Os 5 indicadores, o veredito e as quatro tabelas. |

Se aparecer tela de erro ou card vazio onde deveria ter dado, me diga qual aba.

---

## 2. Decisões de conteúdo que dependem do seu olho

### 2.1 As dicas de cada aba
A mecânica está testada; o **texto** não foi validado contra o seu histórico.
Ao abrir cada aba, leia a frase do topo e me diga:
- ela diz algo **verdadeiro** sobre o seu jogo?
- é o **cruzamento mais útil** para aquela aba, ou você esperaria outro?
- os limites de amostra (**30 torneios** para dar veredito, **10** para falar em
  tendência) estão no ponto? Muito alto e ela cala demais; muito baixo e ela
  mente.

Ajustar é barato: tudo vive num arquivo só, sem chamada de rede.

### 2.2 Faixas de ABI: filtro e gráfico não usam a mesma régua
O **filtro** usa as 12 bandas canônicas (`$16-19`, `$20-29`...), as mesmas da
área Torneios, como você pediu. Mas a **aba ABI** ainda agrupa com rótulos
antigos (`$21-$32`). Você filtra por uma régua e lê o gráfico em outra.

Preciso da sua decisão: **migro a aba ABI para as 12 bandas?** Isso muda os
rótulos do gráfico e do CSV exportado — por isso não fiz por conta própria.

### 2.3 Correlação mental ficou órfã
O endpoint `/api/analytics/mental-correlation` e o helper do cliente não têm mais
nenhum consumidor desde que o popup saiu da aba Geral. Quem cuidar da área
**Mental** decide: reaproveitar ali ou aposentar.

---

## 3. Fora do dashboard, já registrado

- **Satélite vs Flight** classificados errado. É da área **Import**. Evidência
  em `dashboard-plano-2026-07-31.md` §3: `FLIGHT_DAY_REGEX` aceita a palavra
  "Final" (qualquer torneio com "Final" no nome vira flight), e o balde Satélite
  vem contaminado do import, não da leitura do nome.
- **Field softness** (entradas totais vs jogadores únicos, como proxy de campo
  mole) — ideia sua, registrada para a sessão **Torneios**.

---

## 4. O que está pronto e não precisa de você

- Filtros com Incluir/Excluir, faixa de ABI, satélite e flight separados,
  etiquetas removíveis, tudo persistindo na URL.
- Dicas determinísticas em 8 abas (sem IA), que se calam quando a amostra não
  sustenta.
- Horário do dia (aba Período), bounty (Tipo), bolha + eliminação (Posição),
  aba nova de Reentradas, mesas simultâneas x ROI.
- **9 bugs corrigidos**, 7 deles pré-existentes — inclusive o export CSV que
  saía vazio em 7 das 8 abas e a tabela que ignorava seus filtros ao ordenar.
- Dashboard parou de baixar até 50 mil torneios por visita.
- Uma só grafia de dinheiro na página (eram três).
- 660 testes verdes, `tsc` sem erro.
