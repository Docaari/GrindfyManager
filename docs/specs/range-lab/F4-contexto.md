# F4 — Contexto

> Frente 4 de 5 do [Range Lab](00-INDICE.md). Uma frente por sessao.

> **CANCELADA (founder, 2026-08-18).** Escopo de integracao maior do que o
> produto precisa agora — nem RP/ICM, nem biblioteca sincronizada no servidor,
> nem ponte com Estudos/MDA/Coach/export. O roadmap ativo pula F3 -> F5a -> F5b.
> Este documento fica no repo so como referencia (formula do risk premium,
> desenho de persistencia) caso o founder peca de volta mais pra frente — **nao
> abrir sessao a partir daqui sem reconfirmar com o founder**. Detalhe da
> decisao: `memory/session_2026-08-18-range-lab-f2-round3-f4-cut.md`.

## Cabecalho
| | |
|---|---|
| **Modelo** | Opus 5 — Alto |
| **Depende de** | F1 (modelo v2 de `Spot`). F3 nao e bloqueante, mas o valor e maior depois dela |
| **Entrega** | Risk premium (ICM), persistencia server-side, ponte com Estudos/MDA, Coach, export |
| **Migration** | **sim — 0101** (additive-only, com `_rollback.sql`) |
| **ADR** | sim — obrigatorio antes dos testes |
| **Status** | **Cancelada** 2026-08-18 |

Toca duas zonas criticas: **dinheiro/ICM** e **schema/migration**. Nunca abaixo de
`Alto`. Migration e additive-only e sem back-fill, por isso nao exige `Extra`.

## Contexto minimo (para abrir a frio)
Duas lacunas de contexto: a calculadora ignora ICM (e MTT sem ICM e metade da
historia), e tudo que o jogador salva mora em `localStorage` — troca de maquina ou
limpa cache, perde tudo.

O ICM ja existe no projeto e esta desligado da calculadora:
[`RPCalculator.tsx`](../../../client/src/components/calculators/RPCalculator.tsx)
implementa Malmuth-Harville (`calculateICM`) e a matriz de bubble factor por par
de jogadores (`computeRPMatrix`, `computeBFRP` em
[RPCalculator.tsx:118](../../../client/src/components/calculators/RPCalculator.tsx#L118)).
Ligar as duas abas e o maior ganho por linha de codigo desta frente.

---

## RF-04.1: Risk premium / ICM
**Formula.** Com bubble factor `BF` (razao entre o custo em equity de torneio de
perder e o ganho de vencer), a equity necessaria para pagar `call` num pote
`pote`:

```
alpha_ICM = (call * BF) / (pote + call * BF)
RP        = alpha_ICM - alpha_cEV
```

Reduz a `BF / (BF + 1)` quando `pote = call`, batendo com o `eqMin` que
`computeBFRP` ja calcula. `RP = ReqEq(ICM) - ReqEq(cEV)` e a definicao do
glossario do GTO Wizard.

**Regras:**
- Tres formas de entrada: RP direto em pontos percentuais, BF direto, ou **puxar
  do RPCalculator** (stacks + premiacao ja modelados la).
- O veredito passa a mostrar duas linhas — cEV e ICM, lado a lado — com o RP
  destacado.
- **Ressalva obrigatoria na tela:** a linearizacao por bubble factor e exata para
  stack-off e aproximacao para call parcial. Declarar, nao esconder.
- Sem ICM valido (stacks/premiacao incompletos): mostra so cEV com razao nomeada.
  Nao inventa numero (`03-padrao-codigo.md`, item 3: ausencia devolve `null` +
  razao, nunca zero inventado).

## RF-04.2: Persistencia server-side
- Migration **0101** — proxima livre (a ultima existente e
  `0100_manual_session_result.sql`). Tabelas novas para biblioteca de ranges e
  spots salvos.
- Padrao das migrations recentes (0088/0089/0090): additive-only, `_rollback.sql`
  junto, sem FK rigida (ownership validado na aplicacao), enums Zod-only sem
  CHECK no banco, nullable sem default (licao #7). Nasce vazia, sem back-fill.
- Estrutura de tabela, indices e ownership fecham no ADR desta frente.
- `localStorage` vira cache local, nao fonte de verdade. Migrar o que ja esta no
  navegador, sem perda.
- **Confirmar com o founder antes de implementar:** a biblioteca sincronizada e
  Pro+ ou aberta? O **calculo** continua aberto a todos em qualquer cenario.
- Rotas em `server/routes/`: sub-paths estaticos **antes** de `/:id` (a colisao de
  rota ja mordeu em est-3 e mda-1). Handlers aceitam `injectedStorage?` como 3o
  argumento (licao #34). Query Drizzle so em `storage*`.

## RF-04.3: Ponte com Estudos e MDA
- "Salvar como spot de estudo": grava o spot com print, tag por tema, e aparece na
  sessao de estudo. Infra de imagem privada ja existe (ADR-057); registro de MDA
  tambem (`mda_reads`, migration 0090).
- Um spot de river estudado e exatamente uma leitura de tendencia da populacao — o
  encaixe e natural.
- Imagem de solver e conteudo de terceiro: **storage privado**, nunca pasta
  publica (`00-produto.md`).

## RF-04.4: Coach
- Tool `analyze_river_spot` (write, Pro+, com confirmacao — padrao das tools
  existentes). O spot salvo entra no bloco de contexto do chat.
- Passa por `server/coach/anthropicClient.ts`. **Nunca instanciar o SDK direto**
  (`01-tecnologia.md`).
- Prompt novo mora em arquivo unico; bloco duplicado quebra o cache da Anthropic.

## RF-04.5: Export
Copiar range em formato GTO Wizard / PIO, exportar imagem do spot, link
compartilhavel.

**Formato do GTO Wizard (emenda A13, [F5](F5-mindriver.md)).** Mesma notacao
colapsada da F2 RF-02.5, com o peso como **fracao de 3 casas e sem `%`** —
`AQo:0.336`. Classe cheia sai sem sufixo. E so um formatador de peso diferente do
nosso; o serializador e o mesmo.

O cenario em arquivo (`.json` com ranges, bordo e cartas mortas) fica na
[F5b](F5-mindriver.md) RF-05.7 e e complementar a persistencia server-side desta
frente — um e backup portatil, o outro e fonte de verdade.

---

## Criterios de aceite
1. `pote = call` -> `alpha_ICM` bate com `eqMin` do `computeBFRP` para o mesmo BF.
2. `BF = 1` -> `alpha_ICM = alpha_cEV` e `RP = 0`.
3. ICM incompleto: a tela mostra so cEV, com razao nomeada. Nunca um numero
   inventado.
4. Migration 0101 aplica e reverte no banco local; registrada como **PENDENTE
   PROD** no `CLAUDE.md`.
5. Biblioteca: um range salvo aparece em outro navegador do mesmo usuario.
6. Ownership: usuario A nao le nem escreve range de B (teste de rota).
7. `npm run check` limpo; suite da area verde.

## Fora de escopo
Multiway. Solver. Deploy (o founder decide separado).

---

## HANDOFF — ao concluir a F4 (fim do projeto)

### Confira voce mesmo (10 min, no `:3000` reiniciado)
1. **RP zerado nao muda nada.** Com bubble factor 1, a linha ICM tem que ser
   identica a linha cEV, e o risk premium tem que dar 0.
2. **RP aperta o call.** Suba o bubble factor. A equity necessaria tem que subir e
   um call marginal tem que virar fold.
3. **Ponte com o ICM.** Puxe os stacks da aba RP/ICM. O bubble factor tem que
   chegar sozinho, sem digitar.
4. **Sem ICM, sem chute.** Apague a premiacao. Tem que sumir a linha ICM e
   aparecer o motivo — nunca um numero qualquer no lugar.
5. **Ressalva visivel.** A tela avisa que o ajuste e exato para all-in e
   aproximado para call parcial.
6. **Salvou de verdade.** Salve um range, abra em outro navegador logado na mesma
   conta: tem que estar la.
7. **Spot virou estudo.** "Salvar como spot de estudo" -> aparece em Estudos, com
   o print.
8. **Coach enxerga.** Pergunte ao Coach sobre o spot salvo: ele tem que citar os
   numeros certos.
9. **Export.** Copie o range e cole no campo de importar: volta igual.

### Depois da F4
1. Marcar todas as frentes como concluidas em
   [`00-INDICE.md`](00-INDICE.md).
2. Registrar a **migration 0101 como PENDENTE PROD** no `CLAUDE.md` (ela so foi
   aplicada no banco local).
3. Reavaliar as pendencias abertas do indice: multiway, fonte da tabela de ranking
   pre-flop.
4. `git push` **so com o seu aval** (regra de autonomia).
