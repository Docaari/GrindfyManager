# Gold Standard — o arquivo que serve de molde

## A ideia

Regra escrita e uma coisa. Exemplo e outra, e funciona melhor.

Um **gold standard** e um arquivo que segue **todas** as convencoes do projeto ao
mesmo tempo, de ponta a ponta. A IA aprende o padrao vendo, nao lendo uma lista.
E a diferenca entre "use nomes descritivos" e ver vinte nomes descritivos seguidos
no contexto real deles.

A analogia que circula na comunidade e boa: **exemplos soltos sao testes
unitarios; o gold standard e o teste de ponta a ponta.** Cada exemplo prova uma
regra isolada; o gold standard prova que as regras convivem.

## O nosso

`Docs/padrao/exemplo-padrao.ts`

Normaliza o buy-in de um torneio (que chega em moeda nativa, e do Postgres chega
como **string** por ser `numeric`) para USD, e classifica a banda de ABI. **Nao
faz parte do produto** — e exemplo, e roda sozinho:

```bash
npx tsx Docs/padrao/exemplo-padrao.ts
# 15/15 casos
```

Esse recorte foi escolhido porque, num tamanho que cabe numa tela, exercita as
decisoes que mais se repetem aqui: dinheiro, cambio, valor ausente, contrato de
retorno, degradacao nomeada e aviso em vez de silencio.

## O que ele demonstra

**Constantes no topo, com o motivo ao lado.** `MAX_PLAUSIBLE_BUYIN_USD` traz a
explicacao de que "1,090.00" ja virou 1.090.000 num import. Quem le entende por
que nao pode simplificar a constante.

**Fronteira explicita para o que vem do banco.** `toFiniteNumber` aceita
`string | number | null | undefined` porque e isso que o pg e o parser entregam, e
converte **na fronteira**. O resto do arquivo trabalha so com `number`. Essa e a
correcao que ficou pendente em quatro callsites do Coach (AI-3.2 HIGH-2): a
funcao estrita nao serve se ninguem converte antes.

**Devolve `null`, nunca zero inventado.** A decisao mais importante do arquivo.
Zero parece numero valido e se propaga por toda conta que encostar nele; `null`
obriga quem chamou a decidir. `NaN` seria pior ainda — se propaga em silencio.

**`?? 1` numa cotacao e o antipadrao central.** Sem cotacao, a funcao recusa. Um
`?? 1` ali trata real como dolar e mente sem erro nenhum na tela — que e
exatamente a familia do bug de FX do grind-live.

**O contrato de retorno e sempre igual.** `{ usd, band, degradedReason, warnings }`,
de certo ou de errado. Quem chama nunca vira arvore de `if` para descobrir o que
recebeu.

**Degradacao com razao nomeada.** `buyin_missing`, `buyin_unparseable`,
`fx_rate_missing`, `buyin_implausible` — a mesma forma que os geradores de
relatorio do Coach usam (`degradedReason: 'llm_timeout'`). Distinguir "nao veio"
de "veio quebrado" importa: o segundo e incidente de parser, nao dado faltando.

**Plausibilidade antes de aceitar.** Import troca separador; leitura absurda
precisa ser recusada, nao classificada.

**Log antes do fallback.** `console.warn` antes de devolver degradado (lesson #9).
Fallback silencioso e como um incidente vira "comportamento".

**Teste embutido, com o placar impresso.** Quinze casos, cada um com uma
descricao que diz **o que ele protege** — nao "caso 3", mas "sem cotacao devolve
null, NUNCA o valor nativo como se fosse USD". E o ultimo bloco verifica algo que
nenhum caso individual verifica: **toda leitura que falhou avisou.**

## Como usar

**Ao escrever codigo novo:** abra o arquivo e copie a forma. Nao o conteudo — a
forma.

**Ao revisar:** compare. Se o codigo novo tem menos avisos, menos comentario de
porque ou nenhum teste, a diferenca e o que falta.

**Ao pedir para a IA:** *"escreva no padrao de `Docs/padrao/exemplo-padrao.ts`"* e
instrucao mais forte que qualquer lista de regras, porque nao deixa espaco para
interpretacao.

## Os antipadroes — o que ele evita de proposito

| Antipadrao | Por que |
|---|---|
| `return 0` quando nao achou | Zero parece valido e se propaga silenciosamente |
| `rate ?? 1` numa cotacao | Trata moeda estrangeira como dolar e mente sem erro |
| `catch {}` vazio | Artigo IV: falhar calado e proibido |
| `parseFloat` sem checar `Number.isFinite` | NaN contamina toda conta seguinte |
| Contrato de retorno variavel | Quem chama vira arvore de `if` |
| `throw` para caso esperado | Ausencia de dado nao e excecao; e resultado |
| Comparar dinheiro sem normalizar moeda | O bug de FX do grind-live |
| Teste sem descricao (`teste_3`) | Quando falha, ninguem sabe o que se perdeu |
| Comentario que repete o codigo | Ocupa espaco e nao informa |
| Nome generico (`data`, `process`) | Obriga a abrir a funcao para saber o que faz |

## Manutencao

O gold standard so vale se estiver certo. Quando uma convencao mudar, ele muda
junto — e ele tem teste, entao da para saber se continua funcionando. Rode-o antes
de fechar sprint que mexa em dinheiro ou em fronteira de dados.

**Proximo passo natural:** um segundo gold standard para o frontend
(`Docs/padrao/exemplo-padrao.tsx`), porque componente React e outro tipo de
codigo — hooks primeiro, `data-testid`, tokens de `@/lib/ui-tokens`, empty state,
estado de erro isolado por ErrorBoundary. Fica em aberto ate a variacao de estilo
na UI comecar a incomodar de novo.

---

Fontes: [Building shared coding guidelines for AI](https://stackoverflow.blog/2026/03/26/coding-guidelines-for-ai-agents-and-people-too/) ·
[Coding Guidelines for Your AI Agents — JetBrains](https://blog.jetbrains.com/idea/2025/05/coding-guidelines-for-your-ai-agents/)
