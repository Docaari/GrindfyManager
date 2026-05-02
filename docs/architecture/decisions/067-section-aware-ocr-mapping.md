# ADR-067 — Section-aware OCR mapping com SECTION_ALIASES

- Status: Accepted
- Date: 2026-05-01
- Sprint: Stats-V3.5 (Section-Aware OCR Mapping)
- Decision owner: system-architect (autonomous, founder AFK)
- Related: ADR-065 (OCR via Claude/Gemini Vision), ADR-062 (grouped tool response), ADR-064 (HUD grouped layout rendering)

## Context

Sprint Stats-V3 entregou OCR via vision LLM (Gemini Flash 2.5 default, Claude Haiku fallback) extraindo pares `{label, value, confidence}` linha-a-linha do popup Hand2Note. O resultado eh persistido em `hud_stat_snapshots.ocr_raw_response` (jsonb) e mapeado para `statId` do catalogo via `fuzzyMatchStat` (Levenshtein <=3 OR substring >=80%).

O catalogo `shared/hud-stat-catalog.ts` ja agrupa as 217 stats em **16 `HudGroupId`** (basics, rfi, threebet, resteal, pos_flop_pfr_ip/oop, pos_flop_multiway, cbets_by_board, caller_pre_flop, threeway_bb, bb_defense, pos_flop_pfc_ip, blind_war_sb, blind_war_bb, threebet_pot_ip, threebet_pot_oop_vs_lp), cada um com label PT-BR em `HUD_GROUP_LABELS`. O popup Hand2Note real renderiza headings visualmente distintos acima de cada bloco de stats — informacao que o OCR atual descarta.

### Problema concreto (founder, 2026-05-01)

Print Hand2Note continha duas secoes: **Big Blind defense** e **Blind war SB**. Ambas tem stats com label-base "Probe River" (nomes oficiais: `bb_probe_river_sb` e `sb_probe_river`). O OCR extraiu "Probe River 37" sob "Big Blind defense". `fuzzyMatchStat` rankeou apenas por similaridade textual e mapeou para `sb_probe_river` (errado — deveria ser `bb_probe_river_sb`).

O label-base "Probe River" eh ambiguo entre **6 entries do catalogo** (em 4 grupos diferentes). Sem sinal de contexto visual, o ranking textual puro nao consegue desambiguar. Headings sao o sinal natural: o jogador humano usa exatamente esse contexto para ler o popup.

### Forcas em jogo

- Precisao: meta zero mismatch quando heading visivel.
- Custo: nenhum re-treino, nenhum modelo proprio. LLM vision generico ja sabe ler heading.
- Compatibilidade: Sprint Stats-V3 ja persistiu cache para users beta. Nao podemos invalidar massivamente.
- DX: `fuzzyMatchStat` eh shared (server + frontend). Mudanca de assinatura precisa ser aditiva.
- Iteracao: lista de variantes Hand2Note vai expandir com prints reais — precisa ser facil ampliar.

## Decision

### Pipeline section-aware

1. **Prompt OCR atualizado** (`server/services/hudOcrPrompt.ts`): novo schema pede `{section, label, value, confidence}` por stat. `section` eh o texto exato do heading visual mais proximo acima do bloco. Se nao houver heading visivel, retornar `section: null`. Aplica-se igualmente a Gemini e Claude (DRY — single source `OCR_SYSTEM_PROMPT`, lesson #10).

2. **Resolucao server-side** (`shared/hud-section-aliases.ts` — novo): tabela `SECTION_ALIASES: Record<string, HudGroupId>` mapeia heading bruto normalizado para `HudGroupId`. Helper `resolveSection(rawHeading)` aplica normalizacao (lowercase, strip punctuation, collapse whitespace) e lookup. Cobertura obrigatoria: cada um dos 16 `HudGroupId` recebe >=3 aliases (label oficial PT-BR, versao EN canonica, variantes Hand2Note conhecidas).

3. **Boost/penalty no fuzzy match** (`shared/hud-fuzzy-match.ts`): `fuzzyMatchStat` recebe novo parametro opcional `sectionHint?: HudGroupId | null`. Logica:
   - `sectionHint == null` -> nenhum ajuste (legacy preservado).
   - candidata com `group === sectionHint` -> `score = min(1.0, score + 0.15)` (boost aditivo).
   - candidata com `group !== sectionHint` -> `score = score * 0.6` (penalty multiplicativo).
   - Tie-breaker: in-group vence; persistindo empate, ordem original do catalog.
   - Campo audit `boostedBySection: boolean` em `FuzzyMatchCandidate`.

4. **Service + endpoint** (`hudOcrService.ts`, `routes/statsAnalyzer.ts`): schema de parse aceita `section?: string`; servico chama `resolveSection()` e propaga `sectionHint` para `fuzzyMatchStat`. Response do endpoint inclui `section: HudGroupId | null` + `rawSection: string | null` (heading bruto, audit). Cache hit re-emite a mesma estrutura sem re-chamar LLM.

5. **Persistencia sem migration**: `ocrRawResponse` jsonb (ja existente desde ADR-065) absorve sections em `ocrRawResponse.sections: Record<statId, HudGroupId | null>`. Endpoint `from-ocr` aceita campo opcional `sections` no body. Compat: omitir = legacy.

6. **Frontend** (`HudOcrPreview`): badge `Secao: {HUD_GROUP_LABELS[section]}` por linha, dropdown de override com 17 opcoes (16 grupos + "Sem secao"). Override re-roda `fuzzyMatchStat` client-side com novo `sectionHint` (catalog + helper sao shared).

### Justificativa numerica do boost/penalty

Scores `fuzzy_substring` ficam em 0.85-0.95. Penalty `*0.6` derruba para 0.51-0.57 — **abaixo do piso de substring (0.85)**, garantindo que candidata fora-de-grupo so vence quando in-grupo nao existe como candidata. Boost `+0.15` em substring ja proximo de 0.95 chega ao teto 1.0, igualando exact match — o tie-breaker por `kindRank` ainda preserva exact > substring quando ambos batem. Para `fuzzy_lev` (<=0.7), penalty leva a <=0.42, efetivamente filtrado. Numeros calibrados manualmente contra os casos ambiguos conhecidos no catalogo.

## Alternativas rejeitadas

### A1 — Hard match por secao (exclusao em vez de penalty)

Filtrar candidatas fora do `sectionHint`. Rejeitado:
- LLM erra section em ~5% dos casos (heading confuso, corte de imagem, layout custom). Hard match transformaria erro de section em mismatch garantido em vez de degradacao graciosa.
- Penalty `*0.6` ja cumpre o objetivo na pratica (deriva matematicamente abaixo do piso de substring) mas mantem fallback se label for unico fora do grupo.

### A2 — Schema separado para sections (tabela DB nova)

Tabela `hud_ocr_sections (snapshot_id, stat_id, group_id)`. Rejeitado:
- jsonb existente ja resolve. Migration desnecessaria.
- Criaria join extra em todo read de snapshot (perda de perf).
- Nao habilita queries cross-user uteis (sections sao audit per-snapshot).

### A3 — Heuristica por proximidade visual (sem LLM extrair section)

Server analisa coordenadas y do label vs y das stats. Rejeitado:
- LLM nao retorna bbox por padrao. Pedir bbox = aumenta tokens / latencia.
- Algoritmo de proximidade exigiria deteccao de layout — complexidade alta para ganho marginal vs simplesmente pedir o heading.

### A4 — Catalogo enriquecido com aliases por stat (sem section)

Cada stat ganha campo `aliases: string[]` no catalogo, e o ranking textual vira mais permissivo. Rejeitado:
- Nao resolve ambiguidade quando duas stats compartilham label-base ("Probe River" continua igual em 6 entries).
- Aliases por stat ajudam OCR de label, nao desambiguacao por contexto.
- Solucoes ortogonais — podemos fazer ambas, mas section-aware resolve o caso real do founder, aliases por stat eh DEBT futuro.

### A5 — Fine-tune de modelo OCR proprio

Treinar modelo dedicado em prints Hand2Note. Rejeitado:
- Volume de dados rotulados insuficiente.
- Custo deploy GPU + manutencao perpetua.
- Vision LLMs generalistas ja entendem heading visual — pedir explicitamente eh suficiente.

## Consequences

### Positivas

- **Precisao maxima quando heading existe** — desambiguacao deterministica por boost +0.15 / penalty *0.6 calibrado matematicamente. "Probe River" sob "Big Blind defense" cai sempre em `bb_probe_river_sb`.
- **Audit trail claro** — campo `boostedBySection: boolean` no candidato + `rawSection` + `resolvedSection` no payload permitem debug pos-fato.
- **Zero migration** — `ocrRawResponse` jsonb absorve `sections`. Compat full backward (campo opcional, default omitir).
- **Reuso shared/** — `SECTION_ALIASES` + `resolveSection` em `shared/` permite frontend re-rodar ranking client-side em override sem round-trip server.
- **Degradacao graciosa** — section nulo (LLM nao detectou heading) cai em comportamento legacy 100%, sem regressao.
- **Iteracao barata** — adicionar variantes Hand2Note futuras = nova entry em `SECTION_ALIASES`. Sem re-deploy de modelo, sem migration.
- **Cobertura garantida por test** — test enumera os 16 `HudGroupId` e verifica >=1 alias por grupo. Falha CI se groupId novo entrar e ninguem aliasiar.

### Negativas

- **Cache pre-deploy vira miss** — entries existentes em `ocrRawResponse` nao tem `section` por stat. Primeiro upload re-extrai (~3-5s + tokens Gemini). Mitigado por: Gemini free tier 500/dia, base de users beta pequena (~10 users x ~4 OCR/mes), aceitavel.
- **Manutencao de aliases** — Hand2Note pode mudar wording em update. Mitigado por: lista exaustiva derivada de prints reais; fallback section nulo nao quebra nada.
- **Boost mal calibrado em fuzzy_lev** — scores baixos (0.5) ficam mais suscetiveis a mudanca proporcional pela penalty. Aceitavel: candidatas fuzzy_lev fora-de-grupo ja sao baixa confianca — filtrar agressivamente eh feature, nao bug.
- **LLM erra section** — em ~5% casos (heading cortado, layout custom, popup customizado pelo user). Mitigado: penalty `*0.6` (vs hard match) preserva fallback; user pode override manual no preview.

### Neutras

- **ADR-065 ganha cross-link** — atualizar referencias para apontar este ADR como evolucao do schema de response.
- **Telemetry opcional (futura sprint)** — contar quantos OCRs sao corrigidos por section vs sem section. Nao bloqueante.
- **Field audit `boostedBySection`** — no payload de cada candidato, custo de bytes desprezivel.
- **Frontend dropdown 17 opcoes** — UI plana sem busca funciona bem para 17 itens. Migrar para combobox em DEBT-V4 se lista crescer >25.

## Confianca

**Alta.** Sprint Stats-V3 ja entregou pipeline OCR base estavel (545+ testes verde). A mudanca eh aditiva (campo opcional no prompt, parametro opcional no fuzzy, jsonb existente). Numeros do boost/penalty calibrados contra casos conhecidos. Test de cobertura dos 16 HudGroupId previne regressao silenciosa em nova stat. Feature flag implicita: `sectionHint == null` = comportamento legacy intacto.

## Referencias

- **Spec:** `Docs/specs/sprint-stats-v3.5-ocr-context-aware.md`.
- **ADR-062:** grouped tool response — `HudGroupId` ja em uso na resposta do Coach.
- **ADR-064:** HUD grouped layout rendering — `HUD_GROUP_LABELS` PT-BR ja existente.
- **ADR-065:** OCR via Claude/Gemini Vision — base do pipeline; este ADR estende o schema de response com `section`.
- **Catalogo:** `shared/hud-stat-catalog.ts` (217 stats x 16 HudGroupId).
- **Diagrama:** `Docs/architecture/diagrams/ocr-context-aware-flow.mermaid` — flowchart upload -> cache -> LLM -> resolveSection -> fuzzy boost -> preview override -> persist.
- **Lesson aplicada:** #10 (DRY de prompts) — `OCR_SYSTEM_PROMPT` continua sendo single source.
- **Out of scope V3.5:** telemetria de boost vs no-boost (DEBT futuro), aliases por stat (A4 — ortogonal), fine-tune (A5 — defer indefinido), sections multi-heading hierarquicos (popup com sub-secoes — defer).
