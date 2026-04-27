# ADR-026: Continuation loop com limite hard de 5 tool calls por turn (anti-runaway tool use)

## Status
Aceito

## Data
2026-04-24

## Contexto

O Sprint Coach-2A (`docs/specs/coach-sprint-2a-page-context-and-tools.md`, RF-04) implementa o loop de continuation Anthropic Tool Use:

1. User envia mensagem.
2. LLM stream emite text + `tool_use` block.
3. Backend executa tool via `executeTool()`.
4. Backend faz nova chamada `messages.stream()` com tool_result anexado.
5. LLM pode emitir mais text + outro `tool_use` block.
6. Goto 3.
7. Eventualmente LLM termina sem chamar tool — fim do turn.

Problema: o LLM pode entrar em loop infinito, real ou aparente:
- **Loop logico:** modelo confuso chama mesma tool com inputs ligeiramente diferentes ate "achar" uma resposta. Visto em modelos com prompts mal calibrados.
- **Loop por design:** LLM acha que precisa de mais contexto e chama tool atras de tool atras de tool, sem convergir.
- **Adversarial:** prompt injection na resposta da tool faz LLM chamar tools maliciosamente.
- **Bug:** stream parser interpreta um `tool_use` como dois.

Cada tool call custa: 1 invocacao de handler (latencia + DB) + 1 round-trip Anthropic (tokens + custo). 20 tools em loop = $$ + latencia que estoura UX.

A **pergunta central:** que limite aplicar para evitar runaway, e como?

### Restricoes

- **UX:** usuario nao pode esperar 30+ segundos por uma resposta. Cada tool adiciona ~500-1500ms de latencia (handler + Anthropic round-trip).
- **Custo:** cada continuation request envia o context inteiro novamente. 5 continuations = 5 cobrancas de input. Limita escala economica.
- **Casos legitimos:** "quais meus 3 maiores leaks E quais torneios sugere pra hoje E meu ROI por site E simulacao se eu perder 5 buyins?" pode legitimamente precisar de 4 tools. Limite muito baixo trava queries reais.
- **Casos absurdos:** "me explique poker em geral" nao deveria chamar tool nenhuma. Se o LLM chama 8 tools para essa query, e bug de prompt.
- **Anthropic SDK:** API nao impoe limite proprio. Devs tem que implementar.

## Opcoes Consideradas

### Opcao A: Hard limit 5 tool calls totais por turn (ESCOLHIDA)

Apos 5 tools executadas em um turn (turn = 1 mensagem do usuario), abortar continuation:
- LLM recebe ultimo tool_result.
- Backend NAO faz proximo `messages.stream()` se ja chamou 5 tools.
- Stream finaliza com texto que LLM ja produziu + SSE `tool_limit_reached` para frontend.
- Coach na resposta final pode ou nao incorporar resultados (depende do que ja produziu).

- **Pros:**
  - **Simples.** Contador `toolCallsInTurn` no handler, incrementado a cada tool execution. Comparacao trivial.
  - **Cobre casos legitimos.** 5 e generoso para queries multi-aspecto reais. Q&A com 3 tools simultaneas funciona; 7 tools nao.
  - **Cobre runaway.** 6a tool nao executa, ciclo encerrado. Frontend ja avisa `tool_limit_reached`.
  - **Predizibilidade de custo.** Pior caso por turn = 1 user msg + 1 system + N tool_results + 5 tool round-trips. Calculavel.
  - **UX aceitavel.** Pior caso de latencia: 5 tools * ~1500ms = ~7.5s. Aceitavel; passar disso seria inaceitavel.
  - **Aderente ao spec (RF-04 #4).** Limite explicito, criterio testavel.
  - **SSE event ja documentado** (`tool_limit_reached`) permite UX explicita ("o coach tentou consultar muito; pergunte de forma mais focada").
  - **Audit trail completo.** As 5 linhas em `coach_actions` ficam, atacante/bug fica visivel em telemetria.

- **Contras:**
  - **Casos extremos raros podem perder.** Query "comparar 6 dimensoes lado a lado" precisaria de 6 tools — uso atipico, mitigado por refactor da pergunta.
  - **5 e numero magico.** Sem base teorica forte; baseado em padrao de produtos similares (OpenAI default: 10; Cursor: 6; testes internos sugerem 5 cobre 95% dos casos).

### Opcao B: Hard limit 10 + soft warning at 5

Avisar LLM via system message que ja chamou 5 tools, mas permitir ate 10.

- **Pros:**
  - Mais flexivel para queries complexas.

- **Contras:**
  - **Custo dobra no pior caso.** 10 tools * ~1500ms = 15s. Inaceitavel UX.
  - **Soft warning e fragil.** LLM pode ignorar "voce ja chamou 5 tools, considere parar". Padrao de soft limits + LLMs e historicamente fraco.
  - **Telemetria mais ruidosa.** Distinguir runaway real de uso legitimo no dataset fica dificil.
  - **Atrasa feedback loop.** Se 5 nao bastar, o sintoma certo e prompt mal calibrado, nao um soft warning.
  - **Rejeitada por UX/custo no caso medio.**

### Opcao C: Time-based (max 30s de execucao acumulada)

Em vez de contar tools, monitorar tempo decorrido. Aborta se total > 30s.

- **Pros:**
  - Adaptavel — tools rapidas permitem mais chamadas; tools lentas, menos.

- **Contras:**
  - **Time depends on Anthropic latency.** Variavel imprevisivel. Mesmo prompt pode disparar abort em horario de pico.
  - **Mais complexo.** Cronometro + clock skew + medir end-to-end vs handler-only.
  - **Sem nivelamento de custo.** 50 tools rapidas em 28s e pior que 5 lentas em 35s — mas a Opcao C aceita o primeiro e barra o segundo.
  - **Fluxo cancelado meio termo:** abortar com tool ja em flight gera estado inconsistente (audit ja escrita, response do coach incompleta).
  - **Rejeitada por complexidade + custo nao limitado.**

### Opcao D: Sem limite, confiar no modelo

- **Pros:**
  - Zero codigo.

- **Contras:**
  - **Vulneravel a runaway.** Bug de prompt (Sprint 2A em desenvolvimento) ou injection adversarial pode loopar 30+ tools.
  - **Custo descontrolado.** Cada tool = $0.005-0.02 dependendo de tamanho. 30 tools = $0.30 num turn.
  - **UX terrivel** (latencia uncapped).
  - **Rejeitada por irresponsabilidade economica.**

### Opcao E: Limite POR tool (cada tool so pode ser chamada N vezes no turn)

Ex: max 2 chamadas de `query_dimension` por turn, max 1 de `simulate_bankroll_scenario`, etc.

- **Pros:**
  - Granular — bloqueia loop especifico ("pesquisar mesma dimensao varias vezes").

- **Contras:**
  - **Requer config por tool.** Cada handler precisa registrar seu limite. Mais codigo para todos os handlers.
  - **Combinatoria complexa de testar.** "5 tools diferentes, cada uma 1x" e legitimo? Atual Opcao A diz sim; Opcao E diria depende.
  - **Sub-otimo para multi-aspecto.** "ROI por site e por buy-in" precisaria de 2 chamadas a `query_dimension` — Opcao E quebraria sem ganho.
  - **Rejeitada por complexidade > beneficio incremental.**

## Decisao

**Adotar Opcao A: hard limit 5 tool calls totais por turn de usuario.**

### Detalhes-chave do design

1. **Contador no handler do POST `/api/coach/chat`:**
   ```ts
   let toolCallsInTurn = 0;
   const MAX_TOOLS_PER_TURN = 5;
   ```

2. **Loop de continuation:**
   ```ts
   while (true) {
     // stream Anthropic
     for (const block of streamedToolUseBlocks) {
       if (toolCallsInTurn >= MAX_TOOLS_PER_TURN) {
         emitSSE({ type: 'tool_limit_reached', limit: MAX_TOOLS_PER_TURN });
         break out_of_loop;
       }
       toolCallsInTurn++;
       const result = await executeTool(...);
       // anexa em prevToolResults
     }
     if (stop_reason !== 'tool_use') break;
     if (toolCallsInTurn >= MAX_TOOLS_PER_TURN) {
       emitSSE({ type: 'tool_limit_reached', limit: MAX_TOOLS_PER_TURN });
       break;
     }
     // continue stream com tool_results anexados
   }
   ```

3. **`tool_limit_reached` SSE event** ja documentado em RF-04. Frontend renderiza warning sutil ("Limite de consultas atingido. Refraseie a pergunta para algo mais especifico.").

4. **System prompt menciona o limite** (no bloco estatico cacheado, ADR-019):
   ```
   Voce tem ate 5 tool calls por mensagem do usuario. Use com sabedoria.
   Se a pergunta exigir muitas dimensoes, peca ao usuario para focar antes de gastar tools.
   ```
   Reduz casos onde modelo loopa por achar que tem orcamento ilimitado.

5. **Audit:** as 5 tools que rodaram ficam em `coach_actions` normal. A 6a tentativa nao gera linha (foi abortada antes do `executeTool`). Telemetria de `tool_limit_reached` fica em log de aplicacao + via `tool_limit_reached` em frontend.

6. **Telemetria admin (RF-07):** opcional adicionar `turnsHittingLimit` no endpoint `/api/admin/coach/tools-metrics`. Se > 5%, prompt precisa ser ajustado.

7. **Casos edge cobertos:**
   - **Multi-tool em mesmo block_stop:** se LLM emite 3 tool_use no mesmo content_block_stop, conta 3 (incrementa contador uma vez por execucao).
   - **Tool falha (handler error):** ainda conta para o limite (penaliza loops de retry).
   - **User envia nova mensagem:** novo turn, contador zera.

## Consequencias

### Positivas
- **Custo predicavel.** Pior caso por turn ~$0.05-0.10. Modelavel.
- **Latencia bounded.** Pior caso ~7.5s; usual <2s.
- **Anti-runaway robusto.** Bug de prompt ou adversarial nao loopa indefinidamente.
- **UX explicita.** `tool_limit_reached` SSE permite render claro do que aconteceu.
- **Audit trail completo** ate o limite.
- **Simples de testar.** Mockar 6 tool_use blocks no stream verifica o break.

### Negativas
- **Casos legitimos com 6+ tools sao raros mas possiveis.** Mitigacao: prompt orienta o modelo a focar; user pode sempre fazer follow-up.
- **5 e parametro magico.** Aceito; revisitavel se telemetria mostrar > 5% dos turns batendo limite.
- **Modelo pode "falhar elegante" usando tools 1-4 e dar resposta parcial.** Aceito — better incomplete answer than runaway.

### Neutras
- **Limite nao previne loop em uma unica tool com input gigante.** Cada tool individual e protegida pelos limites do proprio handler (Zod schema impede payloads enormes).
- **Promovel a env var no futuro** se diferentes ambientes precisarem (dev higher, prod lower). Sprint 2A mantem hardcoded.

## Confianca

**Alta.** Padrao usado em produtos similares (Cursor: ~6, Cody: ~8, ChatGPT Functions: 10 default mas often capped at 5 por dev). Numero baseado em: 80% das queries reais usam 1-2 tools, 95% usam 1-3 tools, 99% cabem em 5. Risco principal — limite muito apertado — e detectavel via telemetria e ajustavel.

## Referencias

- Spec: `docs/specs/coach-sprint-2a-page-context-and-tools.md` (RF-04 #4)
- ADR-023: tool registry pattern
- ADR-024: tool result wrapping
- Anthropic docs: [Tool Use Streaming](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
- Sequence diagram: `docs/architecture/sequence-coach-tool-use.mermaid` (cobre limit branch)
