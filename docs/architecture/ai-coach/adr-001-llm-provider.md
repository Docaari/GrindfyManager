# ADR-014: Usar Claude API (Anthropic) como Provedor LLM para AI Coach

## Status
Proposto

## Data
2026-04-08

## Contexto
O Grindfy vai implementar 3 coaches de IA especializados (Mental, Torneios, Tecnico) que conversam com o jogador usando dados reais da plataforma. O sistema precisa de um LLM que:

- Gere respostas de qualidade em portugues brasileiro
- Suporte streaming (SSE) para UX de chat responsivo
- Ofereca modelos com diferentes relacoes custo-beneficio (chat interativo vs background tasks)
- Tenha SDK oficial para Node.js
- Suporte janela de contexto suficiente para historico + stats + perfil (~7000 tokens input)
- Siga instrucoes de system prompt com precisao (seguranca, tom, limitacoes)

O projeto precisa de dois perfis de uso:
1. **Chat interativo:** Respostas de alta qualidade, personalizadas, com streaming — custo moderado
2. **Tarefas de background:** Sumarizacao, atualizacao de perfil, compactacao mensal — custo minimo

## Opcoes Consideradas

### Opcao 1: OpenAI API (GPT-4o / GPT-4o-mini)
- **Pros:** Ecossistema maduro, ampla documentacao, GPT-4o-mini muito barato para background tasks, function calling robusto, boa qualidade em portugues
- **Contras:** GPT-4o mais caro que Sonnet para qualidade similar em tarefas de coaching, historico de mudancas de pricing, function calling nao e necessario para este caso de uso (chat puro), rate limits mais restritivos no tier inicial

### Opcao 2: Claude API (Anthropic) — Sonnet + Haiku
- **Pros:** Sonnet oferece excelente relacao custo-qualidade para chat, Haiku extremamente barato para tasks de background (~$0.25/M input), qualidade superior em seguir instrucoes de system prompt (fundamental para personas de coach), streaming nativo via SDK, boa qualidade em portugues, janela de contexto de 200K tokens (sobra para o budget de ~7K), SDK oficial `@anthropic-ai/sdk`
- **Contras:** Ecossistema menor que OpenAI, menos recursos de community/tutorials, sem function calling nativo (nao necessario), vendor lock-in parcial na API

### Opcao 3: Self-hosted (Ollama + Llama 3 / Mistral)
- **Pros:** Zero custo de API, controle total dos dados (privacidade maxima), sem rate limits, sem dependencia de terceiros
- **Contras:** Requer GPU dedicada (custo de infra alto), qualidade muito inferior em portugues, latencia alta sem GPU adequada, sem streaming nativo confiavel, overhead de manutencao significativo, nao viavel para um SaaS em escala inicial

### Opcao 4: Multi-provider (abstraction layer)
- **Pros:** Flexibilidade para trocar de provider, fallback automatico, A/B testing entre modelos
- **Contras:** Complexidade desnecessaria nesta fase, overhead de manter abstraction layer, cada provider tem nuances de formato que afetam qualidade dos prompts, over-engineering para 3 coaches com uso previsivel

## Decisao
Opcao 2: Claude API (Anthropic) com dois modelos:

- **`claude-sonnet-4-5-20250514`** para chat interativo (streaming) — todas as respostas dos 3 coaches
- **`claude-haiku-4-5-20251001`** para tarefas de background — sumarizacao de sessoes, atualizacao de perfil IA, compactacao mensal

A qualidade do Sonnet em seguir instrucoes de system prompt e o fator decisivo. Os coaches dependem de personas bem definidas (tom, limitacoes, formato de resposta, regras de seguranca) e o Claude demonstra consistencia superior em respeitar essas diretrizes. O Haiku e suficiente para tarefas de sumarizacao onde a criatividade nao e necessaria, reduzindo custos de background em ~10x comparado ao Sonnet.

**Estimativa de custo:**
- Chat (Sonnet): ~$0.028/mensagem (6600 tokens in + 500 tokens out)
- Compactacao de sessao (Haiku): ~$0.001/sessao
- Compactacao mensal (Haiku): ~$0.005/usuario/mes
- Para 1000 mensagens/mes (todos usuarios): ~$28/mes total

## Consequencias

**Positivas:**
- Custo previsivel e baixo para o volume esperado
- Dois modelos cobrem ambos os perfis de uso (interativo e background)
- SDK `@anthropic-ai/sdk` com streaming nativo simplifica a implementacao
- System prompts bem respeitados garantem qualidade das personas dos coaches

**Negativas:**
- Dependencia de um unico provider (Anthropic) — se a API cair, todos os coaches ficam indisponiveis
- Precos podem mudar (mitigado: token count rastreado por mensagem para monitoramento)
- Sem fallback automatico para outro provider

**Neutras:**
- Nova variavel de ambiente necessaria: `ANTHROPIC_API_KEY`
- Nova dependencia npm: `@anthropic-ai/sdk`
- Token count estimado via heuristica (chars / 4) — suficiente para monitoramento de custo, nao para billing exato

## Confianca
Alta — Claude Sonnet e reconhecido como best-in-class para instruction following, e o modelo de dois tiers (Sonnet + Haiku) otimiza custo sem sacrificar qualidade onde importa.
