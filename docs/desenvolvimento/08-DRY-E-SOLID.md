# DRY e SOLID — o que aplicar e o que ignorar

## Aviso antes de comecar

DRY e SOLID sao principios bons que viraram slogan. Aplicados sem entender por que
existem, produzem codigo pior que a bagunca que substituiram.

Este guia diz o que vale no Grindfy e o porque de cada um.

---

# DRY — nao se repita

## O que ele realmente diz

A formulacao original nao e "nao escreva a mesma linha duas vezes":

> Todo **conhecimento** deve ter uma representacao unica, sem ambiguidade e
> autoritativa dentro do sistema.

A palavra-chave e **conhecimento**, nao texto. Duas funcoes parecidas que
representam **regras diferentes** nao violam DRY — e junta-las e erro.

## Onde DRY vale muito aqui

**Elegibilidade de plano.** `PRO_PLANS = ['pro','premium','admin']` vivia copiado
enquanto `users.subscription_plan` era `'trial'|'active'|'expired'|'admin'`. Tres
lugares, tres divergencias, Trial sem relatorio. Virou
`server/coach/planEligibility.ts` com `resolveEligiblePlanTier`.

**Acesso ao SDK da Anthropic.** Cinco geradores instanciavam o cliente e faziam
retry cada um do seu jeito; o cap de timeout existia num e nao no outro. Virou
`server/coach/anthropicClient.ts` (`getAnthropicClient` / `callReportLlm`).

**Precificacao de token.** Quatro callsites com preco hardcoded. Virou
`server/coach/reportCost.ts`.

**Blocos de prompt.** `SAFETY_RULES` duplicado entre `coachPrompts` e
`coachSystemBuilder` divergiu em silencio e **quebrou o cache da Anthropic** —
custo real, invisivel no teste. Prompt e conhecimento unico: um arquivo so.

**Timezone e chave de semana.** `ymdUtc`, `brtMondayYmd`, `isBrTimezone` moram em
util compartilhado. Reimplementar "segunda-feira" foi bug em duas sprints.

Repare o padrao: as violacoes que doeram aqui nao eram codigo repetido. Eram **a
mesma verdade guardada em dois lugares que divergiram.**

## Onde DRY atrapalha

O outro lado tem nome: **abstracao precipitada**. Alguem extrai a duplicacao; a
abstracao esta certa naquele momento; o requisito muda; o proximo adiciona um
parametro, depois uma flag, depois uma condicional — ate a funcao "compartilhada"
acumular todos os casos especiais e nao ser mais abstracao nenhuma.

> **Duplicacao e muito mais barata que a abstracao errada.** (Sandi Metz)

Exemplo nosso do lado certo da linha: `weeklyReportGenerator`,
`monthlyReportGenerator`, `dailyDebriefGenerator` e `quarterlyReportGenerator`
compartilham `reportGeneratorShared.ts` para o que e mesmo conhecimento (montar
bundle, custo, shell de email) e **continuam separados** no resto, porque mudam
por razoes diferentes: o diario muda quando a sessao ao vivo muda, o mensal muda
quando a analise de variancia muda.

## As duas regras que usamos

**Regra de tres.** Espere a terceira repeticao antes de extrair. Duas podem ser
coincidencia; tres e padrao. E calibragem, nao lei — evita 90% das abstracoes
precipitadas.

**AHA — Avoid Hasty Abstractions.** So abstraia quando tiver certeza de que os
casos mudam **pela mesma razao**.

Teste rapido antes de extrair: *"quando essa regra mudar, os dois lugares mudam
juntos?"* Se nao, deixe duplicado.

## No Grindfy, concretamente

| Situacao | Extrair? |
|---|---|
| Formula de conversao FX em tres lugares | **Sim.** Uma regra so |
| Elegibilidade de plano/tier | **Sim.** Ja divergiu e cortou Trial |
| Bloco de prompt do Coach | **Sim.** Divergencia quebra o cache |
| Dois parsers de rede diferentes com forma parecida | **Nao.** Mudam quando a rede muda, e as redes sao independentes |
| Dois geradores de relatorio com estrutura parecida | **Parcial.** So o bundle/custo/shell |
| Cinco arquivos de teste com setup parecido | **Nao.** Teste duplicado e barato e legivel |
| Dois cards de dashboard com layout parecido | **Nao**, se um e P&L e o outro e volume |

---

# SOLID — os cinco principios

SOLID nasceu para sistemas grandes orientados a objetos. O Grindfy e um monolito
TypeScript de funcoes e modulos, com quase nenhuma heranca. **Tres dos cinco se
traduzem bem. Dois nao se aplicam, e forcar produz codigo pior.**

## S — Responsabilidade unica · **vale muito**

Cada modulo tem **uma razao para mudar**. `csvParser.ts` muda quando o formato de
uma rede muda; `scoring/` muda quando o criterio de selecao muda;
`reportEligibility.ts` muda quando a regra de plano muda.

E a fronteira da tabela em [05 — Arquitetura](05-ARQUITETURA.md), e e o principio
que mais paga: e ele que permite testar scoring e pace de meta sem subir Express.

**Sinal de que quebrou:** o mesmo arquivo aparece em duas specs sem relacao entre
si. `storage.ts` aparece em todas — por isso a extracao por dominio comecou.

## O — Aberto/fechado · **vale com moderacao**

Onde vale: a lista de redes do parser e a lista de `sourceMetric` das metas.
Adicionar e acrescentar entrada, nao reescrever a funcao.

Onde **nao** vale: criar sistema de plugin para "algum dia suportar outra rede".
Isso e future-proofing. O jeito certo de ser extensivel aqui e ter a logica clara
e testada, nao uma arquitetura de extensao.

## L — Substituicao de Liskov · **quase nao se aplica**

E sobre heranca de classe. Praticamente nao existe heranca aqui — e nao vamos
introduzir para poder aplicar o principio. O parente proximo que vale: quando ha
uniao de tipos (`reportType`, `goalKind`), todo consumidor precisa tratar todos os
casos; `switch` sem `default` que explode e melhor que `default` silencioso.

## I — Segregacao de interface · **vale traduzido**

Traduzido para funcoes: **nao obrigue quem chama a passar o que nao usa.**

Funcao com sete parametros, quatro opcionais e ignorados na maioria das chamadas,
esta pedindo para virar duas. O sinal mais claro e o booleano que muda o
comportamento inteiro: `gerar(x, { monthly: true })` normalmente e
`gerarMensal(x)` e `gerarSemanal(x)`.

Contraponto legitimo do nosso codigo: `injectedStorage?` como ultimo argumento
opcional em handlers (lesson #34). E parametro so-para-teste, nao muda
comportamento, e substitui `vi.mock` do modulo inteiro. Vale.

## D — Inversao de dependencia · **vale traduzido, sem framework**

O que vale: **o modulo de baixo nao conhece o de cima.** `storage` nao conhece
`req`; `services` nao conhecem `res`; `shared/` nao conhece nenhum dos dois.

O que **nao** vale: container de DI, interface abstrata para tudo. Passar a
dependencia como argumento resolve 100% dos casos que aparecem aqui — que e
exatamente o que o attach pattern do storage e o `injectedStorage` fazem.

---

## O resumo em cinco linhas

1. DRY e sobre **conhecimento**, nao sobre texto parecido.
2. **Duplicacao e mais barata que a abstracao errada.**
3. Espere a **terceira** repeticao, e so extraia se os casos mudarem pela mesma
   razao.
4. De SOLID vale: **uma razao para mudar por modulo**, **nao obrigue a passar o
   que nao se usa**, **o de baixo nao conhece o de cima**.
5. Heranca e container de DI nao sao problema deste projeto. Nao invente um para
   poder resolver.

---

Fontes: [AHA Programming — Kent C. Dodds](https://kentcdodds.com/blog/aha-programming) ·
[Avoiding Hasty Abstractions](https://dev.to/cher/avoiding-hasty-abstractions-aha-programming-3d3b)
