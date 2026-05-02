# ADR-086: Citations + confidence rules em arquivo unico (`coachSafetyPrompts.ts`) consumido pelo bloco estatico cacheado e pelo legacy builder

## Status
Aceito

## Data
2026-05-02

## Contexto

Sprint Coach Sprint 0 (`Docs/specs/coach-sprint-0.md`, RF-04 + RF-05) formaliza o contrato:
- **Citations inline:** toda mencao de numero quantitativo (ROI, profit, volume, ITM, count) deve vir com marcador `[fonte: <tool>:<key>:<period>]` ou `[fonte: nao verificado]`.
- **Confidence tags:** `[confianca: baixa|media|alta, N=<n>]` com base em sample size (regras em ADR-022).

Estado atual:
- **ADR-022** ja decidiu pelo formato inline textual + parser regex no frontend. Frontend ja tem `ConfidenceBadge` + `CitationChip` componentes.
- **MAS o system prompt nao instrui criacao consistente.** Hoje o LLM cita de forma esporadica. Coach pode dizer "seu ROI eh 8%" sem fonte nem tag. Em Sprint 2B (write tools + nudges) essa lacuna vira risco regulatorio: numero alucinado sem tag de "nao verificado" engana user.

A pergunta central: **onde inserir as regras CITATIONS_RULES e CONFIDENCE_RULES de modo que (a) sejam DRY, (b) entrem no bloco ESTATICO cacheado (ADR-019), (c) nao quebrem a janela de cache (que nem sempre invalida) e (d) ambos os builders (`coachSystemBuilder.ts` cached + `coachPrompts.ts` legacy) consumam?**

### Restricoes

- **Lesson #10 (DRY de prompts):** ja batizada como lesson — divergencia silenciosa entre builders quebra cache da Anthropic (texto estatico precisa ser bit-identico para cache hit).
- **ADR-019 cache strategy:** texto novo no bloco estatico → 1 cache miss (esperado); apos miss, todos os requests proximos 5min hit. Aceito.
- **Frontend ja existe:** `ConfidenceBadge.tsx` + `CitationChip.tsx`. ADR-022 confirma `cursor-help` + tooltip "nao verificado" como UX.
- **LLM nao garante 100% adesao:** parser frontend ja faz graceful degradation (regex nao matcha → texto literal). Aceitavel; eval em Coach-2B+ mede taxa de "numero sem fonte" via LLM-as-judge.
- **Ja existe `coachSafetyPrompts.ts`** — arquivo certo para colocar as rules.

## Opcoes Consideradas

### Opcao A: Exportar `CITATIONS_RULES` + `CONFIDENCE_RULES` de `coachSafetyPrompts.ts`, consumir em ambos builders, 1 cache invalidation (ESCOLHIDA)

Adicionar em `server/coachSafetyPrompts.ts`:

```ts
export const CITATIONS_RULES = `
## Citacoes inline (obrigatorio)

Para QUALQUER numero quantitativo derivado de tools ou contexto (ROI, profit, volume, ITM,
sample size, contagem, percentual), incluir marcador inline ao final da frase:

- Numero de tool: \`[fonte: <toolName>:<key>:<period>]\`
  Ex: \`[fonte: query_dimension:roi:30d]\`, \`[fonte: find_top_leaks:negative_roi_pko:90d]\`
- Numero de page context: \`[fonte: <route>:<period>]\`
  Ex: \`[fonte: dashboard:30d]\`, \`[fonte: tournament-library:all]\`
- Numero NAO derivado de tool nem context (estimativa, intuition, fora dos dados): \`[fonte: nao verificado]\`

REGRA: Coach NAO pode mencionar numero sem fonte. Se nao houver fonte segura, escrever
"nao verificado". Numeros literais em frases qualitativas tambem entram.

Exemplos corretos:
- "Seu ROI ultimo mes foi +8% [fonte: query_dimension:roi:30d]."
- "Aproximadamente 30% dos pros zeram esse spot [fonte: nao verificado]."
- "Voce tem 12 leaks ativos [fonte: find_top_leaks:overall:90d]."

Exemplos errados:
- "Seu ROI eh 8%" (sem fonte — INACEITAVEL).
`.trim();

export const CONFIDENCE_RULES = `
## Confidence tags (sample size aware)

Quando mencionar metrica que depende de sample size, prefixar a frase com tag de confianca:

- Sample N < 30: \`[confianca: baixa, N=<n>]\`
- Sample 30 <= N < 100: \`[confianca: media, N=<n>]\`
- Sample N >= 100: \`[confianca: alta, N=<n>]\`
- Sample N nao disponivel: omitir tag (nao inventar numero)

REGRA: tag DEVE preceder a afirmacao. Tools que retornam sample (\`query_dimension.totalCount\`,
\`find_top_leaks.evidence.n\`, \`read_user_hud_stats.latestSnapshot.sampleSize\`) ja entregam
\`n\` — usa-lo no output.

Exemplos corretos:
- "[confianca: baixa, N=12] Seu ROI em PKO esta -15%, mas amostra muito pequena."
- "[confianca: alta, N=450] Voce eh +EV em \\$22 regulares (+8% ROI)."

Exemplos errados:
- "[confianca: alta, N=5]" (n=5 nao eh alta — INVENT).
- "Seu ROI eh +8%" sem tag quando ha sample disponivel.

Boundary: N=30 inclusive em "media". N=100 inclusive em "alta".
`.trim();
```

**Consumo nos dois builders** (lesson #10):

```ts
// server/coachSystemBuilder.ts (cached path)
import { SAFETY_RULES, CITATIONS_RULES, CONFIDENCE_RULES } from './coachSafetyPrompts';

export function buildStaticSystemBlock(input: StaticInput): string {
  return [
    baseCoachPrompt(input.coachType),
    SAFETY_RULES,
    CITATIONS_RULES,
    CONFIDENCE_RULES,
    formatUserAiProfile(input.userAiProfile),
    formatStatsSnapshot(input.stats),
    formatLastSummary(input.lastSummary),
  ].join('\n\n');
}

// server/coachPrompts.ts (legacy path) — mesmo import, mesmo concat
```

- **Pros:**
  - **DRY garantido (lesson #10):** ambos builders importam mesmo string. Bit-identical guaranteed.
  - **Cache hit preserved:** texto literal igual em ambos paths → mesma key de cache.
  - **1 cache invalidation no deploy:** primeira mensagem pos-deploy paga write (~$3.75/1M); demais 5min hit.
  - **Tests snapshot:** `coachSystemBuilder` snapshot test confirma `CITATIONS_RULES` + `CONFIDENCE_RULES` presentes (lesson — test snapshot sobreviveu Sprint Coach-1).
  - **Manutencao:** mudar regra eh editar 1 arquivo. Nao precisa lembrar de 2 lugares.
  - **Frontend nao muda:** parser regex de Sprint Coach-1 ja preparado (ADR-022).
  - **`[fonte: nao verificado]` rendering:** CitationChip mostra com `cursor-help` + tooltip "esse numero NAO foi verificado contra dados reais. Cuidado." (Sprint 0 RF-04 acceptance).

- **Contras:**
  - **+~150 tokens no bloco estatico:** custo cache write +~$0.0006 por usuario/sessao (5min). Negligible.
  - **LLM adesao 80-95% historicamente:** edge cases de "esqueci fonte" persistem. Mitigacao: eval em Coach-2B detecta.

### Opcao B: Inline as rules em cada builder (duplicado)

```ts
// coachSystemBuilder.ts
const block = baseCoachPrompt + SAFETY_RULES + `## Citacoes...` + ...

// coachPrompts.ts
const block = baseCoachPrompt + SAFETY_RULES + `## Citacoes...` + ...  // mesmo texto, copy-pasted
```

- **Pros:**
  - Sem import.

- **Contras:**
  - **Lesson #10 violada:** divergencia silenciosa. Atualiza um, esquece outro → 50% requests viram cache miss.
  - **Bit-identical fragil:** alguem aplica refactor em um lugar (espacos, ordem de exemplo), outro fica desincronizado.
  - **Rejeitada por contraddir lesson catalogada.**

### Opcao C: Adicionar como tool description (cada read tool descreve "ao retornar numero, lembre da fonte")

- **Pros:**
  - Localizado por tool.

- **Contras:**
  - **Tool description fica enorme:** cada tool repete a regra. Mais tokens.
  - **Page context numbers (vindos de pageContext, nao tool) ficam orfaos.**
  - **Sistema prompt eh mais natural:** rule global, nao per-tool.
  - **Rejeitada por escopo errado.**

### Opcao D: Validar server-side via parser (forcar tag)

Apos LLM responder, parsear texto e validar todo numero tem tag. Se nao, post-process inserindo `[fonte: nao verificado]`.

- **Pros:**
  - 100% adesao.

- **Contras:**
  - **Streaming SSE quebra:** post-process precisa de texto completo.
  - **Mutate texto do LLM:** quebra autenticidade. Disclaimer ruim.
  - **Falsos positivos:** "30% dos pros" nao precisa fonte (informal); regex pode insertar `[fonte: nao verificado]` em frase que nao precisa.
  - **Rejeitada por overengineering.**

## Decisao

**Adotar Opcao A: exportar `CITATIONS_RULES` + `CONFIDENCE_RULES` de `coachSafetyPrompts.ts`, consumir em ambos `coachSystemBuilder.ts` (cached) + `coachPrompts.ts` (legacy). Snapshot test confirma presenca apos build.**

### Detalhes-chave do design

1. **Arquivo unico:** `server/coachSafetyPrompts.ts` (ja existe). Adiciona 2 exports.

2. **Ambos builders importam:**
   ```ts
   import { SAFETY_RULES, CITATIONS_RULES, CONFIDENCE_RULES } from './coachSafetyPrompts';
   ```

3. **Cache invalidation 1x apos deploy:** primeira request paga write (~+25%). Apos, 5min hit normal. Documentado em CHANGELOG.

4. **Snapshot test:**
   ```ts
   it('static system block contains CITATIONS_RULES + CONFIDENCE_RULES', () => {
     const block = buildStaticSystemBlock(testInput);
     expect(block).toContain('## Citacoes inline');
     expect(block).toContain('## Confidence tags');
     expect(block).toContain('[fonte:');
     expect(block).toContain('[confianca:');
   });
   ```

5. **Eval test (Coach-2B+):**
   - Setup mock chat com page context contendo numero.
   - Prompt: "qual meu ROI por site?"
   - Assert response contem `[fonte: ...]` em cada numero.
   - Test E2E manual (founder QA) — nao bloqueia merge Sprint 0.

6. **Edge cases documentados:**
   - Numero proveniente de tool com `note: 'sem dados suficientes'` → Coach orientado a NAO mencionar valor numerico (cite contagem `n=0` em vez de "ROI X%"). System prompt esclarece.
   - LLM "alucina" fonte falsa → tests de eval em Coach-2B+ tentam pegar; aqui nao temos forma 100% server-side.
   - N=30 exato (boundary) — pertence a "media" (boundary inclusive). Documentado.
   - N=100 exato — pertence a "alta". Documentado.

7. **Frontend rendering** (ja existe via ADR-022):
   - `[confianca: baixa]` → ⚠️ amber.
   - `[confianca: media]` → 🟡 azul.
   - `[confianca: alta]` → ✅ green.
   - `[fonte: ...]` → CitationChip com tooltip do `:` separator.
   - `[fonte: nao verificado]` → CitationChip cinza com `cursor-help` + tooltip "esse numero NAO foi verificado contra dados reais".

8. **Lesson #10 honrada explicitamente:** 1 export, 2 imports, snapshot test guard.

## Consequencias

### Positivas
- **DRY:** 1 fonte de verdade.
- **Cache eficiente:** 1 invalidation por deploy. Steady-state 5min hits.
- **Confianca user-side:** numero sempre com fonte ou disclaimer "nao verificado".
- **Reusavel:** Coach-3 reports + Coach-4 mental analytics tambem consomem. Sem duplicacao.
- **Tests snapshot:** regressao detectada em CI.

### Negativas
- **+~150 tokens estaticos:** cache write +~$0.0006/sessao. Negligible.
- **LLM adesao 80-95%:** edge "esquece fonte" persiste. Mitigacao: eval Coach-2B.

### Neutras
- **Boundary inclusive (N=30 → media; N=100 → alta):** decisao consensual; revisitar em Coach-3 se telemetria indicar UX divergente.
- **Frontend ja preparado** (ADR-022). Nada a fazer no client.

## Confianca

**Alta.** Padrao DRY + cache strategy ja validados em Coach-1. Lesson #10 explicitamente fala desta dor — Sprint 0 a resolve.

## Code references

- `server/coachSafetyPrompts.ts` — adiciona `CITATIONS_RULES` + `CONFIDENCE_RULES`.
- `server/coachSystemBuilder.ts` — importa + concat no bloco estatico.
- `server/coachPrompts.ts` — mesmo (legacy path).
- `tests/unit/coach/system-builder.test.ts` (existing) — adiciona snapshot test cobrindo presenca.
- `tests/integration/coach/citations-eval.test.ts` (NOVO em Coach-2B) — eval LLM-as-judge.
- `client/src/components/coach/CitationChip.tsx` (existing) — sem mudanca.
- `client/src/components/coach/ConfidenceBadge.tsx` (existing) — sem mudanca.
- `client/src/lib/coachMessageParser.ts` (existing) — sem mudanca.

## Related ADRs

- [ADR-019](019-coach-prompt-cache-strategy.md) — Cache strategy — **constrange** que rules vao no bloco ESTATICO.
- [ADR-022](022-coach-confidence-tags-inline-vs-structured.md) — Confidence tags inline — **define** formato + UX.
- [ADR-024](024-coach-tool-result-wrapping.md) — Tool result wrapping — **fornece** sample size em `data` para confidence inline.

## Lessons learned aplicadas
- **#10** (DRY de prompts) — 1 export, 2 imports, snapshot test guard.
- **#testing** (snapshot tests) — guarda contra divergencia entre builders.
