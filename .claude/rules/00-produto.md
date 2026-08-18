---
description: Para quem o Grindfy e, o que ele resolve e o que decide uma disputa de prioridade
---

# Produto

**Grindfy** — SaaS de gestao e performance para jogadores profissionais de poker
MTT online. O jogador importa historico de varias redes, entende onde perde
dinheiro, planeja a semana, joga com assistente ao vivo, estuda e e cobrado por
um coach de IA.

Publico: profissional e semi-profissional de MTT online, majoritariamente BR.
Codigo em ingles, interface em PT-BR.

## Os cinco modulos

| Setor | Nome | O que entrega |
|---|---|---|
| 1 | Analise de Dados | Import, dashboard de performance, biblioteca de torneios |
| 2 | Assistente de Grind | Grade semanal, warm-up, grind ao vivo |
| 3 | Coach AI | Chat, relatorios automaticos, nudges, metas |
| 4 | Bankroll | Multi-wallet USD/BRL/EUR/CNY, snapshots, rakeback |
| 5 | Tournament Selector | Score 0-100 + grade S/A/B/C/D |

## O que decide uma disputa de prioridade

Nesta ordem, sempre:

1. **Numero errado perde para numero ausente.** O jogador decide grade e stake
   com o que a tela mostra. Metrica errada e pior que metrica faltando, porque
   nao parece errada.
2. **Retencao antes de aquisicao.** O produto vive de quem volta toda semana.
3. **O que o jogador ve hoje antes do que ele veria depois.** Feature invisivel
   ate o proximo deploy perde para correcao de superficie que ele usa hoje.
4. **Dado do proprio jogador antes de heuristica generica.** Quando ha historico
   suficiente, usar o historico; heuristica so como cold start, e declarada.

## Vocabulario que o founder usa

"Grade" = plano semanal de torneios (`planned_tournaments`). "Sessao" = grind ao
vivo (`grind_sessions`). "ABI" = buy-in medio. "Field" = campo/populacao.
"MDA" = leitura de tendencia da populacao. "WIG" = meta principal do 4DX.

Escreva o produto no vocabulario dele, nao no nome da tabela.

## Restricoes de negocio que a IA costuma esquecer

- Planos: `trial`, `active`, `expired`, `admin` em `users.subscription_plan`.
  Trial e elegivel; free nunca recebe relatorio; a resolucao canonica esta em
  `server/coach/planEligibility.ts` e `server/coach/reportEligibility.ts`.
- Conteudo de terceiros (imagem de solver, aula) e privado por copyright. Nunca
  em pasta publica.
- Coach nao da conselho financeiro pessoal; ha disclaimer regulatorio em tres
  superficies (`server/coach/disclaimers.ts`).
