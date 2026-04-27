# ADR-019: Estrategia de prompt caching do Coach — system prompt em 2 blocos (estatico cacheado + dinamico)

## Status
Aceito

## Data
2026-04-24

## Contexto

O Sprint Coach-1 (`docs/specs/coach-sprint-1-fundacao-economica.md`, RF-01) tem como objetivo economico viabilizar a escalabilidade do Coach IA. Custo atual: **~$0.028/mensagem** sem prompt caching. Projecao para 1000 mensagens/mes = ~$28/usuario ativo — insustentavel ao escalar alem de uns ~100 usuarios pagantes.

A Anthropic API oferece **prompt caching nativo** (`cache_control: {type: 'ephemeral'}`), com precos distintos:
- **Input regular:** $3.00 / 1M tokens (Sonnet)
- **Cache write (criacao):** $3.75 / 1M (+25% vs regular)
- **Cache read:** $0.30 / 1M (**-90%** vs regular)
- **Output:** $15.00 / 1M

O TTL do cache e de ~5 minutos. Em uma sessao ativa de conversa (usuario + coach trocando msgs rapidamente), **2 ou mais mensagens em 5 min** tornam o cache economicamente dominante.

O system prompt atual do coach tem ~1500 tokens e e **reconstruido a cada request sem cacheamento**, misturando:
- Base prompt do coach (fixo por `coachType`)
- SAFETY_RULES compartilhadas
- `user_ai_profile.content` (muda raramente — compactacao mensal)
- Dashboard stats snapshot
- Last archived session summary
- Active grind session (muda durante o grind — a cada segundos/minutos)
- Recent break feedbacks
- Weekly plan atual
- Leaks detectados em tempo real
- Progresso de estudos recente

A **pergunta central:** cacheamos o system prompt inteiro, ou separamos em bloco estatico (cacheavel) + bloco dinamico (nao cacheado)?

### Restricoes

- **Cache TTL 5 min.** Qualquer campo que muda dentro da janela invalida o cache inteiro caso esteja no mesmo bloco.
- **Active grind e feedbacks de break mudam dentro de uma sessao.** Se cachearmos o prompt inteiro, cada update de grind-live (chega a cada minuto na sessao ativa) invalida o cache imediatamente — desperdicamos a escrita ($3.75/1M, +25%).
- **User profile e stats snapshot mudam raro.** Profile mensalmente; stats snapshot entre 0 e 1x por sessao. Sao candidatos ideais a cache.
- **O volume de tokens estatico (~1000-1200) e dominante** no prompt total (~1500). Se cachearmos so o estatico, ainda capturamos ~70-80% da economia possivel.
- **A Anthropic aplica cache ate o ultimo breakpoint no array.** Breakpoint e cumulativo: tudo ANTES e CACHEADO, tudo DEPOIS e DINAMICO. Estrutura natural: array de 2 blocos, `cache_control` so no primeiro.

## Opcoes Consideradas

### Opcao A: System prompt em 2 blocos — estatico cacheado + dinamico nao cacheado (ESCOLHIDA)

```ts
const system = [
  {
    type: 'text',
    text: baseCoachPrompt + safetyRules + userAiProfile + statsSnapshot + lastSummary,
    cache_control: { type: 'ephemeral' },
  },
  {
    type: 'text',
    text: activeGrind + weeklyPlan + breakFeedbacks + leaks + studyProgress,
    // sem cache_control
  },
];
```

- **Pros:**
  - **-60% a -75% de custo** em sessoes >=2 msgs (cache read $0.30 vs $3.00 input regular no bloco estatico de ~1000 tokens).
  - **Cache write so na primeira msg da sessao** (paga +25%, mas amortiza nas msgs seguintes em ate 5 min).
  - **Active grind dinamico nao invalida cache.** Usuario pode atualizar a sessao live e o bloco estatico continua cacheado.
  - **Separacao semantica natural.** Bloco estatico = "quem e voce e quem e o jogador"; dinamico = "o que esta acontecendo agora".
  - **Zero impacto em latencia de leitura.** Cache hit adiciona ~0ms vs input regular (Anthropic otimiza cache no lado deles).
  - **Funciona com streaming SSE.** A API devolve `usage.cache_read_input_tokens` em `message_start`, registravel sem bloquear stream.
  - **Refactor simples.** `server/coachSystemBuilder.ts` com duas funcoes puras — `buildStaticSystemBlock` e `buildDynamicSystemBlock` — alimentam `assembleContext`.
  - **Graceful fallback.** Se cache_control der erro (API rejeita por algum motivo), refazer request sem cache_control e logar: resposta ainda funciona.
  - **Criterios mensuraveis.** Cache hit rate >= 60% apos 5 msgs consecutivas; custo amortizado <= $0.012/msg.

- **Contras:**
  - **+1 arquivo (`coachSystemBuilder.ts`).** Tamanho minimo.
  - **Primeira msg da sessao paga +25%** (cache write). Amortizado ja na segunda msg.
  - **Janela de 5 min e curta.** Sessoes mais espacadas (usuario abre, fica 10 min sem digitar) perdem cache. Aceitavel — janelas curtas sao o padrao de conversa ativa.
  - **Nao cacheia o array messages (history).** Historico cresce a cada turno e tem outro padrao de cache (fora do escopo Coach-1, esta em roadmap Coach-2).

### Opcao B: Cachear o system prompt inteiro (incluindo blocos dinamicos)

```ts
const system = [
  { type: 'text', text: tudoConcatenado, cache_control: { type: 'ephemeral' } },
];
```

- **Pros:**
  - Mais simples conceitualmente (um bloco so).
  - Se usuario nao atualizar active grind entre msgs, cache hit rate seria 100%.

- **Contras:**
  - **Active grind muda dentro da sessao.** Cada atualizacao de grind-live (a cada ~minuto em sessao ativa) invalida o cache. Escrita paga ($3.75/1M, +25%) sem ser amortizada.
  - **Break feedbacks chegam em tempo real.** Mesma logica: invalidacao constante.
  - **Cache write vira custo recorrente em vez de custo inicial.** Pior que nao usar cache.
  - **Imprevisivel.** Custo mensal depende de quao "agitado" e o grind do usuario — dificil de modelar.
  - **Nao e como a API foi desenhada.** Anthropic documenta breakpoint cumulativo para separar estatico de dinamico; usar um breakpoint so significa tratar tudo como estatico.
  - **Rejeitada por economia pior e imprevisibilidade.**

### Opcao C: 3 blocos — super-estatico (SAFETY_RULES + base prompt) + quase-estatico (profile + stats) + dinamico

```ts
const system = [
  { type: 'text', text: safetyRules + basePrompt, cache_control: { type: 'ephemeral' } },
  { type: 'text', text: userProfile + statsSnapshot + lastSummary, cache_control: { type: 'ephemeral' } },
  { type: 'text', text: dinamico },
];
```

- **Pros:**
  - Granularidade maior — se profile for atualizado, super-estatico ainda cacheia.
  - Permite modelar "camadas" de volatilidade.

- **Contras:**
  - **Limite de 4 breakpoints por request** na API. Usamos 2 dos 4, mas **complexidade operacional cresce** sem ganho proporcional.
  - **Profile e stats mudam MUITO raro** (profile = mensal; stats = entre sessoes). Na pratica, eles se comportam como super-estaticos. Separar e overhead sem ROI.
  - **Mais codigo, mais testes, mesma economia.** Rejeitada por complexidade sem ganho.

### Opcao D: Nao usar prompt caching (baseline atual)

- **Pros:**
  - Zero mudancas.

- **Contras:**
  - **$0.028/msg = inviavel economicamente.** 1000 msg/mes por usuario = $28. Premium a $20/mes = margem negativa.
  - **Rejeitada por inviabilidade de negocio.**

## Decisao

**Adotar Opcao A: dois blocos no array `system`, com `cache_control: {type: 'ephemeral'}` aplicado APENAS ao primeiro bloco (estatico).**

### Detalhes-chave do design

1. **Bloco 1 (estatico, cacheado):** `baseCoachPrompt + SAFETY_RULES + user_ai_profile.content + statsSnapshot + lastSummary`. Rewrites so quando profile e compactado (mensal) ou quando stats agregadas sao atualizadas (entre sessoes).
2. **Bloco 2 (dinamico, sem cache):** `activeGrind + weeklyPlan + breakFeedbacks + leaks + studyProgress`. Rewrite a cada request.
3. **`cache_control: {type: 'ephemeral'}`** aplicado APENAS ao ultimo item do bloco estatico. A API aplica cache cumulativo ate o breakpoint — tudo antes e cacheado.
4. **Refactor:** extrair `server/coachSystemBuilder.ts` com duas funcoes puras.
5. **Tipo de `system`:** passa de `string` para `Array<{type: 'text', text: string, cache_control?: {type: 'ephemeral'}}>`. Zero breaking change (SDK aceita ambos).
6. **Telemetria obrigatoria:** capturar `usage.cache_creation_input_tokens` e `usage.cache_read_input_tokens` do stream e persistir em colunas dedicadas em `chat_messages`.
7. **Fallback:** se a API rejeitar o array com cache_control (erro 400), refazer request sem cache_control e logar.

## Consequencias

### Positivas
- **Custo amortizado em sessao de 5 msgs <= $0.012** (criterio de aceitacao RF-01). Reducao de ~57% vs baseline ($0.028).
- **Cache hit rate >= 60%** mensuravel via telemetria persistida.
- **Escalabilidade:** Premium ($20/mes, 200 msg/dia = 6000/mes) passa a custar ~$72 vs $168 no baseline. Margem volta a ser positiva.
- **Active grind e feedbacks podem atualizar livremente** sem quebrar cache.
- **Zero impacto em latencia de leitura** (medir P95 <200ms regressao, RF-01).
- **Base para Coach-2 (intent classifier):** o padrao de blocos ja esta pronto para adicionar um terceiro (query-scoped).

### Negativas
- **Primeira msg da sessao paga +25%** (cache write). Aceito — amortiza ja na segunda msg da mesma sessao.
- **Profile atualizado no meio da janela invalida cache** (ex: compactacao mensal disparada). Raro; aceitavel.
- **Janela de 5 min:** sessoes muito espacadas nao aproveitam cache. Aceitavel — usuario ativo em conversa tipicamente troca msgs em <2 min.
- **+1 modulo (`coachSystemBuilder.ts`) + 4 colunas em `chat_messages`.** Custo de manutencao baixo.

### Neutras
- **Nao cacheamos messages array.** Fica para Coach-2 quando o historico crescer o suficiente para justificar outro breakpoint.
- **Contra-indicado se Anthropic mudar precos de cache.** Monitorar; se cache read subir para >$1/1M, revisar.

## Confianca

**Alta.** Padrao documentado pela Anthropic para prompts >=1024 tokens. ROI modelado matematicamente via calculadora de custo (RF-01, secao "Notas de Implementacao"). Risco principal — API rejeitar cache_control malformed — mitigado por fallback.

## Referencias

- Spec: `docs/specs/coach-sprint-1-fundacao-economica.md` (RF-01)
- Plano: `docs/strategy/2026-04-24-coach-ai-optimization-plan.md` (A1)
- Anthropic docs: [Prompt Caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- ADR-AI-001 (`docs/architecture/ai-coach/adr-001-llm-provider.md`): uso da Anthropic como provedor LLM.
- ADR-AI-002 (`docs/architecture/ai-coach/adr-002-memory-architecture.md`): estrategia de memoria persistente (profile + resumos) — fonte do bloco estatico.
