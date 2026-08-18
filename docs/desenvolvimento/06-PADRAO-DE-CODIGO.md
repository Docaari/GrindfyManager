# Padrao de codigo — por que ele existe e o que ele decide

## O padrao e para a IA, nao para o programador

Um humano le o arquivo em volta e imita. Uma IA tambem imita — mas imita o que
estiver no contexto naquele momento, que pode ser um trecho atipico. Sem padrao
escrito, cada sessao produz um estilo, e em seis meses a base parece escrita por
cinco pessoas. Neste repositorio, com dezenas de sprints tocadas por agentes
diferentes, isso nao e hipotese.

Consistencia vale mais que a qualidade individual de cada escolha. Uma convencao
mediocre que todo mundo segue e melhor que a convencao otima que metade segue.

A regra operacional que a IA carrega esta em `.claude/rules/03-padrao-codigo.md`.
Este guia explica o **porque**.

## Ingles no codigo, PT-BR na tela

Identificador, tabela, coluna, tipo, nome de teste: ingles. Texto visivel ao
jogador: PT-BR. A fronteira e nitida e nao se negocia — sem ela a IA "conserta" o
idioma achando que ajuda e metade da base vira portugues pela metade.

Copy PT-BR tem hierarquia propria (`Docs/conventions/ui-patterns.md` secao 12).

## Nomes

- Funcao: verbo — `resolveEligiblePlanTier`, `computeReportCost`.
- Helper interno de modulo: sem export, ou prefixo `_` quando exportado so para
  teste (`_resetForTests`) — o `_` sinaliza "nao use em runtime".
- Booleano: pergunta ou estado — `isProPlusEligible`, `hasRecentTicketNotif`.
- Constante: MAIUSCULA — `PRO_PLANS`, `REPORT_DISCLAIMER`.

Proibidos: `data`, `info`, `temp`, `aux`, `x`, `process`, `handle` sozinho. Nao
por serem feios: nome que nao informa obriga quem le — humano ou IA — a abrir a
funcao para descobrir o que ela faz. E ha um custo extra aqui: nome generico
colide. Ja aconteceu de redeclarar `const profile` no mesmo escopo e o parser so
reclamar no run (lesson #17). Antes de declarar nome generico em arquivo grande,
`grep` primeiro.

## Falhar alto — o padrao mais importante daqui

```ts
// certo
if (!rates?.[currency]) {
  console.warn(`[fx] sem cotacao para ${currency}; valor nao comparado`);
  return { value: null, degraded: true, reason: "fx_unavailable" };
}

// errado
const usd = amount * (rates?.[currency] ?? 1);
```

O bug mais caro desta base nunca foi crash. Foi **numero errado que parecia
certo**: dashboard somando torneio de sessao ao vivo, buy-in comparado sem
conversao, parser gravando `Vanilla` para todo tipo de torneio, aba Posicao
mentindo. Erro na tela alguem corrige em dois minutos; numero errado o jogador usa
para decidir a grade da semana.

Dai quatro regras:

1. **`catch {}` vazio e proibido.** Erro ignoravel ganha comentario dizendo por
   que, e log antes do fallback. Distinga "no rows" de "DB explodiu" (lesson #9).
2. **Fallback silencioso e proibido.** `?? 1` numa taxa de cambio, `?? 0` num
   valor monetario e `|| []` numa lista que deveria existir sao as tres formas
   mais comuns de mentir sem erro. Retorne `null` e obrigue quem chamou a decidir.
3. **Degradacao e explicita.** O padrao ja existe no Coach: `status: 'degraded'` +
   `degradedReason` nomeado (`llm_timeout`, `llm_failed_3x`, `no_anthropic_key`).
   Copie essa forma em qualquer lugar que possa entregar resultado parcial.
4. **Dado inconsistente recusa a operacao**, nao segue torto.

## Validacao e autorizacao — a ordem

Em toda rota, nesta ordem: `requireAuth` -> gate de permissao/tier ->
`schema.parse(req.body)` -> storage. Zod antes de qualquer operacao; ownership
checado no `where`, nunca so no `if` do handler (IDOR ja apareceu em
grind-sessions).

## Dinheiro

`numeric` no Postgres chega como **string** no pg. Converter na fronteira do
storage, de forma explicita, e nunca somar `parseFloat` acumulado sem saber onde
arredonda. Esse e o drift que o Dev LLM Hub ja marcou para o Grindfy
(`catalog/financial-precision/decimal-end-to-end.md`): usamos `Number` em bankroll
e isso e conhecido e vigiado.

Antes de comparar com threshold: converter para USD. Sempre.

## Testes — o formato

`data-testid` estavel, nunca heuristica de DOM (lesson #2). Nome de teste diz **o
que protege**, nao "caso 3". Mock com o shape **real** do storage — mock idealizado
ja escondeu tres bugs CRITICAL de uma vez (lesson #3). `.test.ts` roda no projeto
node, `.test.tsx` no jsdom; hook test precisa de config, nao de giria
(lesson #30).

Detalhe caro: em teste `.tsx`, use `await import(...)`, nunca `require(...)`
(lessons #14, #26, #38). E nunca misture os dois no mesmo arquivo quando houver
React Context no meio — viram dois module records e dois contextos.

## Comentarios

Comentario explica **por que**. O que ja esta no codigo.

```ts
// certo
// filtra grind_session_id IS NULL: session_tournaments e detalhe de sessao ao
// vivo e nao pode entrar em nenhuma metrica de dashboard (CLAUDE.md 6.1)

// errado
// busca os torneios do usuario
```

Bug corrigido ganha uma linha de comentario no codigo apontando o motivo, e a
entrada completa vai para `Docs/architecture/lessons-learned.md` — **sintoma,
causa e validacao, nessa ordem**. Sintoma primeiro, porque e pelo sintoma que se
procura seis meses depois.

## A lista de antes de dar por pronto

1. `npm run check` limpo (tsc sem emitir).
2. A suite da area passa e o placar nao caiu. Suite inteira quando a mudanca e
   transversal.
3. Nenhum segredo no codigo; nenhuma env nova sem entrada em `.env.example` e no
   CLAUDE.md secao 4.
4. Nenhuma zona critica tocada sem spec.
5. Migration nova registrada como PENDENTE PROD, com `_rollback.sql`.
6. Bug corrigido virou entrada em `lessons-learned.md`; padrao generico virou
   postcard no hub (`/post-learning`).
7. Verificado na tela quando a mudanca e visivel — com o `:3000` **reiniciado**,
   porque servidor stale ja enganou o founder mais de uma vez.
