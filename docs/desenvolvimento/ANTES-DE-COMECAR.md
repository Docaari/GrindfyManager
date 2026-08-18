# Antes de lancar uma spec — 60 segundos

Cola de bolso. Detalhe: `Docs/desenvolvimento/00-INDICE.md`.

---

## 1. Qual o tamanho? (escolha antes de falar com a IA)

| Faixa | O que e | Processo |
|---|---|---|
| **P** | copy, espacamento, rotulo, bug obvio de UI | sem spec. muda, confere na tela |
| **M** | rota + tela + storage; ajuste de regra existente | portoes + teste + suite da area. `reviewer` no fim |
| **G** | dominio novo, migration, Coach, mudanca transversal | pipeline completo: spec -> ADR -> testes -> impl -> `/simplify` -> `reviewer` |

**Nao sabe dizer qual invariante pode quebrar? Sobe uma faixa.**

## 2. Toca zona critica? Se sim, e G. Sempre.

- parser CSV / import
- fonte do historico (`grind_session_id IS NULL` — CLAUDE.md 6.1)
- dinheiro, FX, bankroll, wallet
- permissao, tier, plano
- prompt / custo / jobs do Coach
- schema, migration
- ordem de rota Express (`:id` engole sub-path)

## 3. Os tres portoes (responda em voz alta antes de implementar)

**Simplicidade** — resolve problema de HOJE? sem abstracao para um caso so? sem
dependencia nova? sem tabela nova quando uma coluna resolve?

**Regressao** — quais lessons/ADRs se aplicam? existe teste que falha hoje e passa
depois? qual caso vizinho **nao** pode mudar de resultado?

**Contexto** — a IA **leu** os arquivos que vai mudar, ou esta indo pela memoria?

## 4. A spec abre com isto

- **Modelo e esforco** declarados (tabela: `.claude/rules/04-modelo-e-esforco.md`).
  Zona critica nunca abaixo de `high`.
- **`[PRECISA DECIDIR: pergunta]`** em tudo que for ambiguo. Duvida marcada vale
  mais que resposta plausivel inventada.
- **Casos de teste ANTES da solucao** — e o caso vizinho que nao pode quebrar.
- Comportamento, nao tecnologia. Nome de tabela na spec = vazou para o plano.

## 5. Frases que mudam o resultado

- "escreva no padrao de `Docs/padrao/exemplo-padrao.ts`"
- "liste as lessons-learned e ADRs que se aplicam a esta area antes de mexer"
- "qual caso vizinho nao pode mudar de resultado?"
- "marque como [PRECISA DECIDIR] tudo que voce assumiu"
- "pense com cuidado, isto envolve varias etapas"
- "o que ficou de fora e por que"

## 6. Fim de tarefa

`npm run check` limpo · suite da area verde · conferido no `:3000` **reiniciado** ·
migration com `_rollback.sql` + PENDENTE PROD · env em `.env.example` + CLAUDE.md ·
bug virou entrada em `lessons-learned.md` (sintoma, causa, validacao).

## 7. Ele pergunta antes de

`git push` · deploy · `db:push` em **producao** · dependencia nova ·
mudanca grande no CLAUDE.md · teste legado · `rebase` / `reset --hard` / `branch -D`.

Em dev, o resto ele faz sozinho: **reversivel e barato = faz. Irreversivel ou
visivel a terceiros = pergunta.**

---

## Os 4 principios que mais pegam (de 9, em `CONSTITUICAO.md`)

1. **Regressao e o bug mais caro.** O jogador nao ve o que voce somou; ve o que parou.
2. **Regra de negocio sem teste nao existe.** E teste do caso degradado, nao do feliz.
3. **Falhar calado e proibido.** `catch {}`, `?? 0` em dinheiro, `?? 1` em cotacao.
4. **Uma fonte de verdade.** Mesmo dado em dois lugares diverge — sempre divergiu.
