# Stats V3 — Pesquisa Profunda + Priorizacao

**Sprint:** Stats-V3 (Hand2Note popup layout + OCR de print + 3-way comparison)
**Branch:** `feature/stats-analyzer-v3-grouped-ocr`
**Data:** 2026-05-01
**Autor:** Strategist (modo pesquisa profunda)

---

## TL;DR

- **Layout Hand2Note ganhou** porque consolida densidade alta com agrupamento semantico (15-20 grupos, colunas `target | hero` em popup escuro). PT4/HM3 sao mais "tabela seca" — perdem em escaneabilidade. Copiar o padrao de header colorido por grupo + 2 colunas alinhadas eh decisao baixo-risco.
- **OCR via Claude Haiku 4.5 vision e o caminho mais barato e mais simples.** Custo estimado: **~$0.0016 por screenshot processada** (input apenas), ou **~$0.005-0.008** com output JSON estruturado + 1 retry. Para 1000 users x 4 OCR/mes = **$24-32/mes** (negligivel). PaddleOCR-VL self-hosted bate em accuracy mas exige GPU + manutencao — nao vale a pena no estagio atual.
- **Hand2Note tem export de hand histories (txt) e API C++ para hand history feed**, mas NAO tem export estruturado de stats agregadas (tabelas de popup). OCR continua sendo o unico caminho viavel para extrair stats da UI proprietaria sem violar EULA.
- **3-way comparison (hero | population | GTO) ja eh padrao em GTO Wizard Reports e PT4 vs Villain stat packs.** UI cor-codificada (vermelho = excede GTO, azul = abaixo) eh o estado-da-arte e tem boa adocao. Aplicavel direto a Grindfy.
- **Risco maior: "leakage" de IP do Hand2Note** — se a Microgaming/Hand2Note bloquear OCR por TOS, o feature quebra. Recomendo plano B com import manual de CSV/print + fallback para parse local de banco H2N (quando user tem desktop).

---

## 1. Concorrentes — Comparativo

### Tabela: Strengths / Weaknesses

| Ferramenta | Forca | Fraqueza | Padrao UX que copiamos |
|-----------|-------|----------|------------------------|
| **Hand2Note 4** | Popup denso (15+ grupos), header colorido por grupo, customizacao via marketplace ("HUD Store"), Dynamic HUD, Advanced Popups com bet sizing/board texture | Desktop-only, customizacao complexa, EULA restritiva | **Layout 2-coluna `target/hero` + group header + dark theme** — referencia direta |
| **PokerTracker 4** | Drag-and-drop stats, color benchmarks por range, baixo uso de memoria, UI mais intuitiva | Popup tradicional (denso mas sem agrupamento moderno), sem live HUD adaptativo | Color benchmarks (vermelho/amarelo/verde) por threshold |
| **Holdem Manager 3** | Cache em memoria (rapido), reports avancados | UI considerada confusa, bugs frequentes, suporte ruim, mais lento que PT4 | Pouco a copiar — usar como contra-exemplo de UI |
| **GTO Wizard (Reports)** | 3-way comparison nativo (hero vs GTO), color-coding (vermelho excede / azul abaixo), click-through stat -> filtered hand report | Apenas preflop por enquanto, postflop em desenvolvimento, foco GTO ignora populacao real | **Cor-coding semantico de delta + click-to-drill** — copiar 100% |
| **PocketSolver / PeakGTO** | Comparacao OOP vs IP lado a lado, color hierarchy de EV | Foco solver, nao tracker | Hand matrix com color hierarchy por EV |

### Padroes UX confirmados pelo mercado (que vamos seguir)

1. **Layout 2 ou 3 colunas alinhadas verticalmente** — `Stat | Hero | Pool/GTO` com delta colorido na lateral
2. **Header colorido por grupo semantico** (Basics, Raise First In, 3Bet, 4Bet, Squeeze, etc) — Hand2Note popup tem 15-20 grupos
3. **Color benchmark binario:** vermelho (>GTO/range), amarelo (borderline), verde (within range), cinza (sample insuficiente)
4. **Click-to-drill:** clicar numa stat abre filtered hand report — GTO Wizard popularizou e PT4 ja tinha
5. **Dark theme padrao** para sessoes longas (3+ horas) — todos os trackers usam
6. **Densidade alta intencional:** popup de stats nao deve ter padding generoso — jogadores querem ver 50+ stats em uma tela

---

## 2. OCR Options Matrix

| Provider | Accuracy (numeric/table) | Latency | Cost / 1k req | Implementation effort | Recommendation |
|----------|--------------------------|---------|---------------|------------------------|-----------------|
| **Claude Haiku 4.5 (vision)** | Alta para texto estruturado em tabelas. Excelente para inferencia semantica ("essa coluna eh hero", "este header eh 3Bet"). Modelo entende contexto poker. | 2-5s | **~$1.60-8.00** (input apenas: $1.60; com output JSON ~500 tokens: $4.10) | **Baixa.** SDK ja usado no Coach. Prompt + response_format JSON. Sem GPU. | **GO. Recomendacao primaria.** |
| **Claude Sonnet 4.6 (vision)** | Maxima accuracy, raciocina sobre layout ambiguo | 4-8s | ~$5-15 | Baixa (mesma SDK) | Fallback se Haiku falhar (retry com Sonnet em <1% casos) |
| **PaddleOCR-VL 1.5 (self-hosted)** | 94.5% OmniDocBench v1.5. Excelente em tabelas estruturadas (PP-StructureV3) | 0.5-2s (GPU) | ~$0.09 / 1k pages (mas exige GPU $0.40-1/h) | **Alto.** Deploy GPU, manutencao modelo, parsing custom para layout H2N | NAO recomendado. Vale a pena apenas em escala >100k OCR/mes |
| **Tesseract** | Baixa em tabelas/numeric (struggles com layouts complexos) | 0.3-1s (CPU) | $0 (open-source) | Medio. Precisa preprocessing OpenCV pesado | NAO recomendado. Tecnologia legada para esse uso |
| **EasyOCR** | Media | 1-2s | $0 | Medio | Nao recomendado |
| **GPT-5 / GPT-4o vision** | Comparavel a Sonnet | 3-6s | $10-25 / 1k req | Baixa | Vendor-lock + custo similar a Sonnet sem ganho |

### Justificativa: Haiku 4.5 vence

1. **Custo desprezivel:** $1-8 por 1000 OCR. Para 1000 users com 4 OCR/mes (4k OCR), custa **$4-32/mes total**. Negligivel.
2. **Implementacao 1 dia:** chamar `messages.create` com image + system prompt "extraia stats em JSON". Sem deploy de infra.
3. **Robustez semantica:** o modelo entende que "RFI" = "Raise First In" e mapeia. Tesseract nao faz isso.
4. **Stack alinhado:** ja usamos Anthropic SDK no Coach AI. Reuso de auth, retry, observability.
5. **Prompt caching aplicavel:** se prompt for fixo (~2k tokens), 5min cache cai 90% — efetivamente metade do custo apos primeiro request.

### Quando reavaliar PaddleOCR-VL self-hosted
- Volume mensal >50k OCR (custo Haiku ~$200/mes vs GPU ~$300/mes equivale)
- Latencia critica <1s p99
- Privacy/compliance exige nao enviar prints para Anthropic

---

## 3. Custo Projetado (Claude Haiku 4.5 vision)

### Premissas

- **Imagem tipica:** screenshot popup H2N ~1200x800px = **~1280 tokens** (formula `width * height / 750`)
- **System prompt:** ~1500 tokens (instrucoes + schema JSON exemplo). Cacheado 5min = $0.10/MTok apos primeiro hit.
- **Output JSON:** ~600 tokens (15-20 grupos x 5-8 stats = 100-150 valores estruturados)
- **Retry rate:** ~5% (low-confidence triggers Sonnet fallback). Custo Sonnet: $3 input + $15 output = ~$0.012/req.

### Custo por OCR (cenario realista, com cache hit)

| Componente | Tokens | Preco | Custo |
|-----------|--------|-------|-------|
| Cache read (system prompt) | 1500 | $0.10/MTok | $0.00015 |
| Image input | 1280 | $1.00/MTok | $0.00128 |
| Output (JSON) | 600 | $5.00/MTok | $0.00300 |
| **Total Haiku (95% casos)** | | | **$0.00443** |
| Sonnet retry (5% casos) | ~3380 in + 600 out | mix | ~$0.012 |
| **Custo medio ponderado** | | | **~$0.0050** |

### Projecao mensal por escala

| Users | OCR/mes/user | OCR/mes total | Custo Haiku | Custo Sonnet retry (5%) | **Total mensal** |
|-------|--------------|----------------|-------------|--------------------------|-------------------|
| 100 | 4 | 400 | $1.77 | $0.24 | **~$2.01** |
| 500 | 4 | 2.000 | $8.86 | $1.20 | **~$10.06** |
| 1.000 | 4 | 4.000 | $17.72 | $2.40 | **~$20.12** |
| 5.000 | 4 | 20.000 | $88.60 | $12.00 | **~$100.60** |
| 1.000 (heavy 20/mes) | 20 | 20.000 | $88.60 | $12.00 | **~$100.60** |

### Conclusao financeira

- **Custo desprezivel ate 5k users.** Nao precisa cobrar feature isolada.
- **Pode incluir gratuito no plano Free** com limite de 4 OCR/mes (custo Grindfy = $0.02/user/mes).
- **Plano Pro:** 50 OCR/mes (custo $0.25/user/mes — irrelevante vs receita assinatura).
- **Plano Premium:** ilimitado pratico (assumindo ~100 OCR/mes maximo realista).

---

## 4. Risks Priorizados (ICE)

| # | Risco | Impact (1-10) | Confidence (1-10) | Effort mitigacao (1-10, 10=facil) | ICE | Mitigacao |
|---|-------|---------------|--------------------|------------------------------------|-----|-----------|
| 1 | **Hand2Note bloqueia OCR via EULA / detecta automacao** | 9 (feature core morre) | 5 (EULA proibe "scraping" mas screenshot manual user-driven eh zona cinza) | 7 (fallback CSV import facil) | **7.0** | User faz screenshot manual no proprio sistema; nao automatizar captura; documentar que ferramenta processa imagem que USER fornece (parecido com PT4 importando .txt do H2N) |
| 2 | **OCR confidence baixo em screenshots de baixa res / mobile / dark mode customizado** | 7 (UX ruim, churn) | 7 (Haiku 4.5 robusto mas casos edge existem) | 6 (preview + ediciao manual) | **6.7** | Mostrar preview do JSON extraido + permitir edicao inline antes de salvar; threshold de confidence + retry com Sonnet |
| 3 | **3-way comparison (hero/pool/GTO) exige populacao de dados reais** | 8 (sem pool data, comparison vira "hero vs hero") | 8 (Grindfy ainda nao tem pool data agregado) | 4 (precisa coletar/comprar dataset ou usar GTO como proxy unico) | **6.7** | MVP: hero vs GTO apenas (GTO Wizard usa esse padrao). Pool data como Sprint V4 (parceria com SharkScope/HHSmithy ou crowdsourcing dos uploads) |
| 4 | **Layout Hand2Note tem variantes (custom popups da marketplace)** — OCR treinado em layout default falha em customs | 5 (poucos users tem custom popup) | 6 (marketplace tem ~50 popups distintos) | 7 (LLM vision tolera variacoes) | **6.0** | Documentar suporte a "default popups H2N 4 padrao"; aceitar imagem mas avisar accuracy reduzida em customs |
| 5 | **Custo Haiku escala mais que linear se users abusam (50+ OCR/dia)** | 4 (financeiro baixo ate 10k users) | 7 (uso heavy concentrado em poucos pros) | 9 (rate limit por plano trivial) | **6.7** | Rate limit: Free 4/mes, Pro 50/mes, Premium 500/mes. Telemetria de uso por user. |

### Risk #1 — detalhe legal

Hand2Note EULA proibe reverse-engineering e modificacao do software. Capturar screenshot da janela do USER nao eh reverse-engineering — eh equivalente a fotografar a tela. Hand2Note tem **API oficial em C++** (github.com/hand2note/Hand2NoteApi) mas eh para feed de hand history, nao para extrair stats agregadas da UI. Conclusao juridica preliminar (nao substitui advogado): processar screenshot fornecido voluntariamente pelo user eh defensavel, mas:

- **Nao automatizar captura** (nao usar window scraping / DLL injection)
- **User precisa explicitamente carregar a imagem** (drag-drop ou upload)
- **Documentar:** "Grindfy processa a imagem que VOCE faz upload. Garanta que voce tem direito ao conteudo."

---

## 5. Recomendacao Final

### Veredito: **GO** (alta confianca)

Stats V3 e viavel tecnica e economicamente. Tres pernas independentes — implementar em ordem de risco crescente.

### Ordem de execucao (Sprints)

**Sprint V3.1 — Layout Hand2Note (1 semana)**
- Implementar componente React com layout 2-colunas `target | hero` + group headers + dark theme
- 15-20 grupos hardcoded (Basics, RFI, 3Bet, 4Bet, Squeeze, CBet, Fold to CBet, Check-Raise, Donk, etc)
- Color coding por threshold (vermelho/amarelo/verde/cinza)
- Click-to-drill: stat -> filtered hand list (reaproveita filters existentes)
- **Sem OCR ainda** — popular com dados ja agregados pelo backend (tournaments + grind sessions)
- **Dependencias:** zero. Frontend puro.

**Sprint V3.2 — OCR ingestion (1 semana)**
- Endpoint `POST /api/stats/ocr/h2n-popup` (multipart image upload)
- Servico backend: Anthropic SDK + Haiku 4.5 + system prompt cacheado
- Schema JSON validado com Zod (ja padrao Grindfy)
- Preview UI: mostra JSON parseado + permitir edicao manual antes de salvar
- Rate limit por plano (Free 4, Pro 50, Premium 500)
- **Dependencias:** V3.1 layout pronto (para popular preview). ANTHROPIC_API_KEY.

**Sprint V3.3 — 3-way comparison (1 semana)**
- Coluna "GTO" estatica (datasets do GTO Wizard / GTO+ disponiveis para licenciamento OU hardcoded para spots comuns)
- Coluna "Pool" baseada em agregacao das tournaments + grind sessions de TODOS users (anonimizado)
- Delta calculation + cor-coding ja preparado em V3.1
- **Dependencias:** V3.1 layout. Decisao: usar GTO Wizard licenciado vs hardcoded spots.

### Decisoes pendentes do founder

1. **Fonte do dado GTO:** licenciar GTO Wizard? Hardcode top 50 spots? **Recomendacao:** hardcode top 50 spots (cobre 80% dos users) para MVP, parceria GTO Wizard se feature explodir.
2. **Pool data:** agregar uploads dos users (anonimizado, GDPR-safe) ou comprar dataset (HHSmithy ~$500/mo)? **Recomendacao:** crowdsource dos uploads existentes — Grindfy ja tem dezenas de milhoes de hands importadas. Aprovar query agregada.
3. **Plano de monetizacao:** liberar OCR gratis (custo desprezivel, gera adocao) vs gate atras de Pro? **Recomendacao:** 4 OCR/mes free como hook + ilimitado em Pro/Premium.

### Metricas de sucesso (pos-launch)

- **Adocao OCR:** % de Pro/Premium users que fizeram >=1 OCR em 30d (target: 40% em 60d)
- **Confidence rate:** % de OCRs sem retry Sonnet (target: >95%)
- **Engagement:** sessoes/semana com Stats V3 popup aberto (target: 3+ p/ Pro user)
- **Retencao D30:** users que tocaram Stats V3 vs nao tocaram (target: +15pp em D30)

---

## Sources

- [Hand2Note 4 HUD and Popups - Bluffaces](https://bluffaces.com/articles/hand2note-4-hud-and-popups/)
- [Hand2Note 4 Review - Getcoach.poker](https://www.getcoach.poker/articles/hand2note-4-review/)
- [Hand2Note 4.1 Updates 2025-2026](https://hand2noteguide.com/user-manual/how_hand2note_has_changed_major_recent_updates/)
- [Top 10 Hand2Note 4 Features](https://www.getcoach.poker/articles/top-10-hand2note-4-features-that-maximize-playing-comfort/)
- [Hand2Note vs HM3 vs PT4 - Hand2Note official](https://hand2note.com/Help/hand2note-vs-other-tools)
- [Best Poker Tracker 2026 - PokerSciences](https://pokersciences.com/en/articles/best-trackers-guide)
- [Hand2Note API GitHub repository](https://github.com/hand2note/Hand2NoteApi)
- [Hand2Note EULA](https://hand2note3.hand2note.com/Policies/EULA.html)
- [Export hand histories - Hand2Note Manual](https://hand2note3.hand2note.com/Help/pages/ExportAndMoving/HandHistories/)
- [Anthropic Pricing - Official Docs](https://platform.claude.com/docs/en/about-claude/pricing)
- [Claude Vision Documentation](https://platform.claude.com/docs/en/build-with-claude/vision)
- [Claude Haiku 4.5 - OpenRouter](https://openrouter.ai/anthropic/claude-haiku-4.5)
- [Best OCR Models 2026 - CodeSOTA](https://www.codesota.com/ocr)
- [PaddleOCR vs Tesseract benchmark](https://www.codesota.com/ocr/paddleocr-vs-tesseract)
- [GTO Wizard GTO Reports announcement](https://blog.gtowizard.com/major-upgrade-gto-reports-have-arrived-plus-tons-of-new-features/)
- [GTO Reports Leak Detection - RakeRace](https://rakerace.com/news/online-poker/2025/03/31/gto-reports-new-gto-wizard-feature-for-precise-leak-detection)
- [Redesigned Analyzer GTO Wizard](https://blog.gtowizard.com/redesigned_analyzer_and_upgraded_gto_reports/)
- [GTO Wizard EV Comparison Tool](https://blog.gtowizard.com/how-to-leverage-gto-wizards-ev-comparison-tool/)
- [PocketSolver hand matrix](https://www.pocketsolver.com/)
- [iPoker Hand2Note third-party policy](https://rakerace.com/news/poker-rooms/2025/09/05/ipoker-clarifies-policy-on-hand2note-and-third-party-software)
- [Dashboard Design Patterns 2026](https://artofstyleframe.com/blog/dashboard-design-patterns-web-apps/)
- [vs Hero / vs Villain Stat Pack - ProPokerHUDs](https://www.pokerhuds.com/product/vs-hero-vs-villain-stat-pack/)
