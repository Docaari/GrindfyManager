# Auditoria: `xSearchProvider` do News — uso de Grok/LLM em `title`/`summary`

**Data:** 2026-05-12
**Escopo:** Sprint AI-0A / RF-15 (deliverable: documento de achado + recomendação — **não** implementar mitigação)
**Arquivo auditado:** `server/services/news/xSearchProvider.ts` (+ `orchestrator.ts`, `categorizeItem.ts`,
`dedupeLayers.ts` no que é relevante para o achado)
**Relacionado:** ADR-107-news (refactor RSS/X), ADR-110 (ranking server-side + zoning),
`memory/session_2026-05-04-news-audit-and-news-3.md` (fiasco Grok-LLM 100% fake — origem deste refactor)

---

## 1. O que o `xSearchProvider` faz

O provider busca posts recentes do X (Twitter) de uma lista de handles curados (`source.xHandle`) sobre poker
MTT, usando a **xAI Agent Tools API** com a tool `x_search` (`server/services/news/xSearchProvider.ts`,
`fetchFromXSource`):

1. Monta um prompt pedindo ao Grok que liste até `MAX_SEARCH_RESULTS` posts relevantes de `@handle`, **só os
   que ele realmente achou via `x_search`**, e retorne **um JSON array** `[{tweet_url, title, summary,
   published_at}]` (sem prosa, sem markdown fences).
2. Envia o request com `tools: [{ type: 'x_search', allowed_x_handles: [handle], from_date, to_date }]` —
   janela de `SEARCH_WINDOW_DAYS` dias.
3. Da resposta, extrai **dois sinais independentes**:
   - `extractCitationIds(json)` — os tweet IDs **reais** dos `annotations[]` (citations) retornados pela tool
     `x_search` (não pela prosa do modelo).
   - `extractOutputText(json)` + `parseTweetsFromText(text)` — o JSON array que o **modelo** escreveu.
4. Para cada item do JSON do modelo, aplica uma **cadeia de validação**:
   - URL precisa casar o regex `TWEET_URL_RE` (formato `https://x.com/<handle>/status/<id>`);
   - ID não pode ter trailing zeros (`TRAILING_ZEROS_RE` — heurística anti-ID-fabricado);
   - **se `realIds.size > 0`, o ID precisa estar em `realIds`** (cross-validação contra as citations reais do
     `x_search`) — senão, drop como alucinação;
   - `title` não vazio; `published_at` ISO date válido (`isValidIsoDate`).
5. Os itens sobreviventes viram `ScrapedNewsItem[]` e seguem para o `orchestrator` → dedupe 3-layer
   (`dedupeLayers.ts`) → categorização (`categorizeItem.ts`) → ranking server-side (ADR-110: determinístico,
   `engagement*0.6 + recency*0.4`) → zoning na Home.

### Veredito factual

O Grok/LLM é usado para **busca + montagem da lista** (qual handle, quais posts, em que janela) — e a tool
`x_search` faz a busca real, com citations reais. As **URLs** são cross-validadas contra essas citations (boa
defesa, herança direta do refactor pós-fiasco). **Mas o `title` e o `summary` de cada item são prosa autoral
do modelo Grok** — o prompt pede ao modelo que escreva um título e um resumo do post; não há extração verbatim
do texto real do tweet, e não há validação de que o `title`/`summary` corresponde ao conteúdo real do post de
ID `X`. O ranking server-side (ADR-110) é determinístico — **sem risco de fabricação no ranking**.

---

## 2. Achado e avaliação de risco

**Achado:** risco residual de **conteúdo fabricado em `title`/`summary`**. O modelo pode (a) achar um post
real (ID válido, nas citations) mas (b) descrever esse post de forma imprecisa, exagerada ou simplesmente
errada no `title`/`summary`. A URL leva ao post real, mas o card que o jogador vê na Home pode dizer algo que
o post não diz.

**Magnitude:** **menor** que o fiasco de 2026-05-04 (quando 100% dos itens eram fabricados e 73% das URLs
eram mortas). Aqui:
- a URL é real e clicável (cross-validada contra citations) — o jogador pode verificar;
- o post existe e é do handle certo;
- o erro fica confinado ao texto descritivo, não à existência do item.

**Mas presente:** um `summary` confiante e errado é exatamente o tipo de coisa que mina a confiança no feed,
e "Sinal Externo" é uma feature do dashboard que o jogador consulta passivamente — ele pode não clicar para
verificar. Severidade: **baixa-média**. Probabilidade: **média** (LLMs resumindo conteúdo curto erram com
frequência não-trivial; tweets têm pouco contexto, tentação de "preencher" alta).

**Mitigação já existente:** o kill-switch `NEWS_FEED_ENABLED` (default `false`, ADR-100/106) — a feature só
roda quando explicitamente ligada. E o ranking determinístico garante que nenhuma fabricação altera a ordem
ou o destaque.

---

## 3. Recomendação — opções de mitigação ordenadas por esforço

| # | Opção | Esforço | Efeito |
|---|-------|---------|--------|
| (a) | **Prompt restritivo + omit-on-fail.** Trocar o prompt para pedir ao Grok que retorne `title`/`summary` **verbatim** do tweet (texto literal do post, sem reescrever), com instrução explícita "se não conseguir extrair o texto literal, omita o item" + um campo `verbatim: true/false` que o provider usa para dropar itens não-verbatim. Ainda é LLM, mas com instrução restritiva e fail-closed. | **Baixo** (mudança de prompt + 1 campo de validação) | Reduz fabricação; não elimina (modelo pode mentir sobre `verbatim`). |
| (b) | **Buscar o texto real do tweet via outra fonte** (oEmbed do X, RSS bridge, ou re-fetch da URL) e **descartar o `summary` do Grok** — usar o Grok só para descoberta de IDs, e o texto vem da fonte canônica. | **Médio-alto** (nova integração + rate limits + fragilidade do oEmbed/scraping do X) | Elimina fabricação no texto; introduz uma dependência nova e frágil. |
| (c) | **Marcar `summary` como "gerado por IA, pode conter imprecisões"** no UI do card (badge + tooltip), e tratar a URL como a fonte de verdade. Não muda o backend. | **Baixo** (mudança de UI) | Não reduz fabricação, mas torna o risco transparente ao usuário — honesto e barato. |
| (d) | **Deixar como está e aceitar o risco.** O kill-switch `NEWS_FEED_ENABLED` já existe; a feature está desligada por default; o ranking é determinístico; a URL é real. | **Zero** | Risco residual permanece; transparência zero. |

**Recomendação combinada:** **(a) + (c)** se/quando a feature for ligada — prompt restritivo com
omit-on-fail (baixo esforço, reduz a probabilidade) **mais** o badge "gerado por IA" no card (baixo esforço,
torna o risco honesto para o usuário). (b) só vale se o feed virar uma feature de primeira classe com tráfego
real — não é o caso hoje.

**Veredito:** **backlog**, não item de sprint imediato. A feature está atrás de um kill-switch desligado por
default; o ranking é seguro; a URL é real. Quando o founder decidir ligar `NEWS_FEED_ENABLED` em produção,
abrir um item **News-4** com escopo (a) + (c) como pré-condição. Até lá, este documento é o registro do risco
conhecido. **Nenhuma mudança de código no `xSearchProvider` neste sprint** (RF-15 é só o documento).

---

## 4. Notas

- `extractCitationIds` + a cross-validação contra `realIds` é a defesa-chave herdada do refactor pós-fiasco
  (ADR-107). Ela protege a **integridade dos IDs/URLs**, não a **fidelidade do texto descritivo** — essa é
  precisamente a lacuna deste achado.
- A heurística `TRAILING_ZEROS_RE` (drop de IDs com zeros à direita) é uma defesa adicional barata contra
  IDs fabricados — mantida.
- O `categorizeItem.ts` e o `dedupeLayers.ts` operam sobre `title`/`summary` — se esses campos forem
  fabricados, a categorização/dedupe pode ser sub-ótima, mas não há risco de segurança (só de qualidade do
  feed).
