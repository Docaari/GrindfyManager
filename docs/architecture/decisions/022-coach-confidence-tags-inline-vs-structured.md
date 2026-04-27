# ADR-022: Confidence tags do Coach em formato inline textual (`[confianca: alta, N=145]`) em vez de response JSON estruturado ou tool use

## Status
Aceito

## Data
2026-04-24

## Contexto

O Sprint Coach-1 (`docs/specs/coach-sprint-1-fundacao-economica.md`, RF-03) requer que o Coach sinalize confianca em cada afirmacao quantitativa. As tags devem refletir tamanho de amostra:

- `[confianca: baixa, N={n}]` quando `N < 30`
- `[confianca: media, N={n}]` quando `30 <= N < 100`
- `[confianca: alta, N={n}]` quando `N >= 100`
- `[nao sei: {motivo}]` quando dado nao existe no contexto

O frontend renderiza essas tags como **badges coloridas** (amarelo / azul / verde / cinza) inline no texto.

A **pergunta central:** como o Coach entrega essas tags? Tres padroes possiveis:

1. **Inline textual** no stream de texto (escolhida). Exemplo: `Seu ROI [confianca: alta, N=450] esta +8%.`
2. **Response JSON estruturado** em vez de texto livre. Coach retorna `{text, annotations: [...]}` e frontend reconstrói.
3. **Tool use** da Anthropic com ferramenta `annotate_confidence(text, level, n)` chamada pelo modelo.

### Restricoes

- **Streaming SSE ja existe** e funciona. Quebrar isso custa tempo e risco.
- **Frontend ja renderiza texto progressivamente** (usuario ve resposta sendo "escrita"). Qualquer formato precisa suportar streaming parcial sem esperar o fim da resposta.
- **Parser precisa ser robusto a tags malformadas.** LLM nao garante 100% de formato — pode emitir `[confianca: extrema, N=abc]` ocasionalmente. Parser deve degradar graciosamente para texto literal.
- **Custo e complexidade importam.** Coach-1 tem ambicao economica (ADR-019). Solucoes que aumentam token count ou adicionam roundtrips sao custosas.
- **Acessibilidade:** badge precisa ter `role="status"` + `aria-label`. Isso e trivial com qualquer formato.
- **Voluntariedade do LLM:** modelos seguem prompts com ~95% de adesao em formatos simples, menos em formatos complexos/estruturados com stream.

## Opcoes Consideradas

### Opcao A: Tags inline textuais `[confianca: alta, N=145]` (ESCOLHIDA)

O Coach emite o texto normalmente, com tags intercaladas. Frontend parseia regex e substitui trechos por badges React.

```ts
// Parser: client/src/lib/coachMessageParser.ts
parseConfidenceTags("Seu ROI [confianca: alta, N=450] esta +8%")
// => [{kind:'text', content:'Seu ROI '},
//     {kind:'badge', badge:{level:'alta', n:450}},
//     {kind:'text', content:' esta +8%'}]
```

- **Pros:**
  - **Streaming SSE intocado.** Texto continua fluindo; frontend parseia chunks progressivamente.
  - **Zero roundtrip adicional.** Sem tool use call, sem JSON parsing de response estruturado.
  - **Prompt simples.** "Emita `[confianca: alta, N=N]` antes de afirmacoes quantitativas" + 3 exemplos few-shot. Adesao alta em testes.
  - **Parser simples e testavel.** Regex `\[confianca:\s*(baixa|media|alta),\s*N=(\d+)\]`. Poucos caracteres.
  - **Graceful degradation.** Tag malformada (`[confianca: extrema, N=abc]`) -> regex nao matcha -> texto literal renderizado como texto normal. Zero quebra.
  - **Compativel com citation format** (`[Fonte: Dashboard, N=145, janela: 90d]`, RF-02). Padrao visual unificado.
  - **Custo de tokens baixo.** `[confianca: alta, N=145]` = ~10 tokens. Com 5 afirmacoes/msg = 50 tokens extras. Irrisorio.
  - **Extensivel.** Adicionar `[pista: rever mao]` ou outras tags nao quebra parser — so adicionar regex.
  - **Export friendly.** Usuario que copia-cola a resposta leva as tags junto (texto puro), preservando contexto para planilhas ou notas.

- **Contras:**
  - **Tags podem vir malformadas ocasionalmente.** Mitigacao: fallback do parser (texto literal). Monitorar via dashboard admin (RF-02) — se taxa de malformadas > 5%, iterar no prompt.
  - **Visualmente "polui" a resposta** se o usuario copiar o texto. Aceito — e parte da proposta de transparencia sobre amostra.
  - **Nao ha contrato formal.** Se quisermos usar confidence para decisoes server-side (ex: rebater afirmacoes de baixa confianca), precisariamos parsear no servidor tambem. Fora do escopo Coach-1.

### Opcao B: Response JSON estruturado

Coach retorna JSON com text + annotations. Frontend para de receber texto plano.

```json
{
  "content": "Seu ROI esta +8%",
  "annotations": [
    {"text": "Seu ROI", "range": [0, 7], "confidence": "alta", "n": 450}
  ]
}
```

- **Pros:**
  - **Contrato formal.** Servidor pode agir sobre annotations (ex: filtrar respostas com `confidence: baixa` em afirmacoes criticas).
  - **Parser trivial (JSON.parse).**

- **Contras:**
  - **Quebra streaming SSE.** JSON so e valido quando completo. Usuario espera a resposta inteira — UX regride drasticamente.
  - **Mitigacao via JSON streaming (partial JSON parser)** adiciona complexidade alta e bibliotecas novas.
  - **LLM adesao cai.** Pedir "retorne sempre JSON valido com estrutura X" e conhecido por ter ~85% de adesao (vs ~95% para tags inline). Malformed JSON quebra resposta inteira em vez de degradar pontualmente.
  - **Tokens +30-40%.** Overhead de JSON (`{` `"` `,` etc.) em cada request.
  - **Export ruim.** Usuario copia JSON com range indices em vez de texto.
  - **Rejeitada por UX de streaming + adesao LLM.**

### Opcao C: Tool use da Anthropic

Coach chama ferramenta `annotate_confidence(text_fragment, level, n)` que o servidor processa e insere no output.

- **Pros:**
  - **Contrato forte.** Tool call e tipado pela API.
  - **Futuro-compativel** com Coach-3 (tool use para acoes).

- **Contras:**
  - **Excessivo para o caso.** Tool use e para **acoes** (execute X, fetch Y), nao para **anotacao textual**.
  - **Latencia +20-40%.** Tool call interrompe stream, servidor responde, coach continua. Em uma resposta com 5 afirmacoes, 5 interrupcoes — latencia percebida quebra fluidez.
  - **Custo em tokens maior.** Tool call + tool result sao mensagens adicionais no context.
  - **Complexidade de codigo alta.** `server/routes/coach.ts` ja e grande. Adicionar logic de tool use so para confidence adiciona ~100+ linhas.
  - **Rejeitada por overengineering.**

### Opcao D: Nao sinalizar confianca (baseline atual)

- **Pros:**
  - Zero trabalho.

- **Contras:**
  - **Coach afirma tudo com mesmo peso.** "Seu ROI em Turbos e -8%" soa igual com N=5 e com N=500. Usuario nao tem defesa contra ruido estatistico.
  - **Credibilidade do coach regride.** Premium paga $20/mes esperando insight; insight baseado em N=5 gera desconfianca.
  - **Rejeitada por UX ruim.**

## Decisao

**Adotar Opcao A: tags inline textuais com parser regex no frontend.**

### Detalhes-chave do design

1. **Formato exato** (nao varia):
   - `[confianca: baixa, N={n}]`
   - `[confianca: media, N={n}]`
   - `[confianca: alta, N={n}]`
   - `[nao sei: {motivo}]`

2. **Posicao:** ANTES da afirmacao correspondente. Exemplo: `[confianca: alta, N=450] Seu ROI em regulares $22 e solido +8%.`

3. **Prompt inclui 3+ exemplos few-shot** no bloco estatico cacheado (ADR-019). Few-shot aumenta adesao do LLM.

4. **Parser em `client/src/lib/coachMessageParser.ts`:**
   - Regex 1: `/\[confianca:\s*(baixa|media|alta),\s*N=(\d+)\]/g`
   - Regex 2: `/\[nao sei:\s*([^\]]+)\]/g`
   - Retorna `Array<{kind: 'text' | 'badge', content?: string, badge?: ConfidenceBadge}>`
   - Tag malformada ou aninhada -> texto literal (graceful)

5. **Componente `client/src/components/coach/ConfidenceBadge.tsx`** com classes Tailwind:
   - `baixa` -> amarelo (`bg-yellow-100 text-yellow-900 border-yellow-300`)
   - `media` -> azul (`bg-blue-100 text-blue-900 border-blue-300`)
   - `alta` -> verde (`bg-green-100 text-green-900 border-green-300`)
   - `nao sei` -> cinza (`bg-gray-100 text-gray-700 border-gray-300`)

6. **Acessibilidade:** badge tem `role="status"` + `aria-label` descrevendo o nivel.

7. **Citations (RF-02.2) seguem mesmo padrao** `[Fonte: ...]`. Mesma filosofia: inline, regex-parsed, graceful.

8. **Monitoramento:** taxa de tags malformadas medida via dashboard admin (se >5%, iterar prompt).

## Consequencias

### Positivas
- **Streaming SSE intocado.** Zero regressao de latencia percebida.
- **Parser simples, testavel, graceful.** 2 regex + 1 componente React.
- **Custo de tokens irrisorio (~50 tokens/msg extras).**
- **Extensivel:** futuras tags (`[pista: ...]`, `[risco: alto]`) seguem mesmo padrao.
- **Compativel com citations (RF-02.2)** — mesmo sistema visual.
- **Copy-paste amigavel.** Texto puro preserva tags.
- **Testavel:** parser tem testes unitarios previstos no spec RF-03.

### Negativas
- **Tags malformadas ocasionais.** Mitigacao: fallback + monitoramento.
- **Sem contrato formal** para servidor agir sobre confianca. Aceito — Coach-1 nao precisa disso.
- **Copy-paste leva "lixo" visual.** Aceito — e parte da proposta de transparencia.

### Neutras
- **Caminho para tool use no futuro** (Coach-2 ou Coach-3 para acoes) segue aberto. Esta decisao nao fecha aquele caminho.
- **Se adesao do LLM cair <80%** (medido via taxa de malformadas), considerar migracao para Opcao C (tool use) no Coach-2.

## Confianca

**Alta.** Padrao testado em produtos similares (ChatGPT com `[citation:1]`, Perplexity com `[1][2][3]` inline). Fallback graceful reduz risco de quebra visivel. Monitoramento permite iterar.

## Referencias

- Spec: `docs/specs/coach-sprint-1-fundacao-economica.md` (RF-03 completo)
- ADR-019: prompt caching — exemplos few-shot ficam no bloco estatico (cacheado)
- Precedentes: Perplexity, ChatGPT, Claude.ai (citation inline em texto)
- Sequence diagram: `docs/architecture/sequence-coach-chat-cached.mermaid` (passo "FE renderiza streaming + ConfidenceBadge parser inline")
