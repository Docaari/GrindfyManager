# ADR-015: Combinacao linear ponderada com Bayesian shrinkage para o Tournament Selector (vez de ML)

## Status
Aceito

## Data
2026-04-23

## Contexto

A feature **Tournament Selector Inteligente** (Sprint 1 do roadmap aprovado em 2026-04-23, ICE 8.0) precisa atribuir um score 0-100 + grade S/A/B/C/D a cada torneio disponivel hoje, cruzando o ROI historico do jogador (em 7 dimensoes: site, buy-in, categoria, velocidade, dia da semana, horario, field size) com a oferta do dia (Suprema + biblioteca pessoal).

A pergunta central e: **qual modelo matematico produz o score?**

### Realidade do dataset (analisada do schema atual)

| Variavel | Valor tipico (jogador medio) | Valor tipico (jogador novo) |
|---|---|---|
| Total de torneios | 1.000-5.000 | 30-200 |
| Sites jogados | 2-4 | 1-2 |
| Faixas de buy-in usadas | 3-5 (de 8 possiveis) | 1-2 |
| Sample por bucket primario (buy-in x categoria) | 30-200 | 0-15 |
| Janela analitica padrao | 180 dias | 180 dias |
| ROI por bucket — variancia | Alta (poker e high-variance) | Inutilizavel |

**Implicacoes para modelagem:**
- Dataset e **por jogador**, nao agregado (privacidade + ROI proprio e o diferencial vs SharkScope que usa media de mercado).
- **N efetivo por bucket e baixo** mesmo para jogadores grindeiros (200 torneios em "PKO $11-21" e otimo cenario).
- **Distribuicao long-tail** nas dimensoes raras (ex: "Hyper Mystery $55" pode ter 5 amostras em 1 ano).
- **Variancia inerente do jogo** — ROI de 0% com sample 30 nao e equivalente a ROI 0% com sample 300.
- **Cold start agudo:** jogadores com <50 torneios totais nao tem dados confiaveis em quase nenhuma dimensao.

### Restricoes de produto

- **Performance:** <500ms p95 para 200 torneios + jogador com 5k+ historico. 200 torneios x 7 sinais = 1.400 lookups por request.
- **Interpretabilidade obrigatoria:** UX exige `rationale` curto + breakdown de signals em modal de detalhes ("ROI 18% em PKO $22 — 87 amostras"). Jogador profissional **vai questionar** o score; precisa ver de onde veio.
- **Sem pipeline de retreinamento.** Equipe e founder + 1-2 contratados eventuais. Nao ha MLOps, nao ha airflow, nao ha label studio.
- **Sem labels claras.** "Edge esperado" nao e uma label observavel diretamente — o que existe e ROI passado por bucket. Nao temos rotulos `(torneio, deveria_jogar?)` confirmados por especialista.
- **Mudanca de equilibrio do jogo.** Pools de Suprema, formato dos eventos GG, anti-bot do Stars: o "edge" muda em meses. Modelo precisa absorver dados novos sem retraining.
- **Funcao precisa ser pura e testavel** — sem mocks de modelos serializados, sem dependencia de runtime de inferencia.

## Opcoes Consideradas

### Opcao A: Combinacao linear ponderada com Bayesian shrinkage (ESCOLHIDA)

Para cada um dos 7 sinais:
1. Converte ROI bruto em `bucketScore = clamp(50 + roi*2, 0, 100)`.
2. Aplica shrinkage: `shrunkScore = (bucketScore*sample + 50*K) / (sample + K)`, com `K=30`.
3. Multiplica por peso fixo (site 0.20, buyIn 0.20, category 0.20, speed 0.10, dayOfWeek 0.10, timeOfDay 0.15, field 0.05).

Score final = soma das contribuicoes. Grade derivada de faixas. Cold start (totalTournaments < 50) usa heuristica simplificada.

- **Pros:**
  - **Matematicamente rigoroso para o caso.** Bayesian shrinkage com prior de score=50 (neutro) e a solucao classica de literatura para "estimar a media verdadeira de um bucket com N pequeno". Wikipedia/Empirical Bayes / Stein estimator: identica abordagem usada por IMDb (rating bayesiano), Amazon ratings, baseball sabermetrics (Brooks Baseball PA-shrinkage), Reddit rankings (Wilson lower bound e variante similar).
  - **Funcao pura.** `computeTournamentScore(tournament, bundle, options)` -> resultado. Mesmo input, mesmo output, sem side effects. Testavel com 0 mocks. Atende restricao de spec RF-02.
  - **Performance previsivel.** ~14 multiplicacoes + 7 divisoes + 1 round por torneio. <2ms validavel com benchmark. 200 torneios = ~400ms ja considerando overhead. Fica dentro do orcamento de 500ms p95 com folga.
  - **Interpretabilidade total.** Modal de detalhes mostra exatamente: `ROI bruto -> bucketScore -> shrunkScore -> peso -> contribuicao`. Soma das contribuicoes = score final. Jogador entende e contesta com base.
  - **Cold start nao quebra o modelo.** Sample baixo puxa shrunkScore para 50; sample zero deixa o sinal neutro (nao penaliza nem premia). Nao precisa de "fallback de cold start" no codigo principal — o shrinkage **e** o cold start handling. (A heuristica simplificada para totalTournaments<50 e bonus de UX, nao necessidade matematica.)
  - **Pesos ajustaveis sem retreinar.** Pesos sao constantes em `scoringConstants.ts`. Ajuste no proximo deploy. Migracao para pesos por usuario (preferencia explicita) e additive — nao quebra contrato.
  - **Sem dependencia npm nova.** Implementacao em ~150 linhas de TS puro. Reduz superficie de ataque, vendor lock-in e bundle size.
  - **Calibragem futura via RF-07.** Telemetria registra `(score, grade, foi_adicionado, ROI_realizado_meses_depois)`. Em 6-12 meses temos dados para A/B test de pesos ou substituicao gradual por modelo aprendido.
  - **Onboarding de equipe.** Qualquer dev junior entende o algoritmo em 1 hora. Manutencao trivial.
  - **Reusavel para outras features.** Mesma logica sirve futura "study card scoring", "session readiness scoring", "bankroll risk scoring". Nao queima ciclo aprendendo framework de ML que depois precisa explicar pra cada nova feature.

- **Contras:**
  - **Pesos sao opinionados.** 0.20 / 0.20 / 0.20 / 0.10 / 0.10 / 0.15 / 0.05 e palpite informado, nao otimizado por dados. Pode ser que `timeOfDay` seja mais preditivo que `site` para alguns jogadores — nao sabemos sem RF-07.
  - **Independencia entre sinais e premissa forte.** Linear assume que efeitos sao aditivos. Na realidade pode haver interacao ("PKO so funciona pra mim em horario nobre"). Modelo nao captura.
  - **Nao aprende com feedback.** Se jogador adicionou um torneio com score baixo e ganhou consistentemente, o algoritmo nao se ajusta automaticamente. So ajusta se humanos olharem a telemetria e mexerem nos pesos.
  - **Nao captura nao-linearidades.** Por exemplo, pode ser que field=1500 seja melhor que field=200 e field=5000 (curva U invertida). Linear so consegue "field bom" ou "field ruim" via 1 weight.

### Opcao B: Regressao logistica/ridge treinada por jogador

Treinar um modelo `P(ROI > threshold | features)` para cada jogador, usando historico como dataset. Features: as 7 dimensoes one-hot encodadas + interacoes principais. Inferencia retorna probabilidade calibrada.

- **Pros:**
  - **Aprende pesos do dataset.** Pesos otimizados por verossimilhanca, nao palpite.
  - **Captura algumas interacoes** se incluidas como features explicitas.
  - **Probabilidade calibrada** e mais defensavel matematicamente que score arbitrario.
  - **Ainda interpretavel.** Coeficientes mostram efeitos por feature.

- **Contras:**
  - **Pipeline de retreinamento e operacionalmente custoso.** Cada upload novo do jogador muda o dataset; modelo precisa rodar fit. Cron noturno? Sob demanda no upload? Cache de modelo serializado por usuario? Cada opcao adiciona complexidade.
  - **Cold start e ainda pior.** Regressao com N<50 e instavel — convergencia ruim, regularizacao forte mascara sinal. Ironia: para jogador novo (que mais precisa de ajuda), o modelo treinado e o pior.
  - **Falta de label real.** "ROI > threshold" nao e a resposta correta — jogador pode ter feito ROI alto em buy-in baixo por sorte, ou ROI baixo em buy-in alto por edge real. Reduzir "edge" a "ROI passado" e exatamente o que o modelo linear ja faz; regressao adiciona complexidade sem mudar a fonte de verdade.
  - **Dependencia npm.** scikit-learn nao esta no stack TS. Opcoes: `ml-regression` (npm, manutencao instavel), portar para Python service (overkill), usar `tensorflow.js` (bundle gigante). Todas violam premissa "sem nova dependencia salvo se justificado".
  - **Inferencia mais lenta.** Carregar modelo serializado por usuario adiciona I/O. 200 torneios x predict() x 5k usuarios na producao tem custo nao-trivial.
  - **Interpretabilidade degrada com interacoes.** Quando coeficientes de interacao entram, "por que esse torneio tem score alto" vira mais dificil de explicar em 1 frase.
  - **MLOps inexistente.** Sem versionamento de modelo, sem monitoramento de drift, sem rollback. Primeira regressao com bug treinada em dados ruins contamina todos os usuarios.

### Opcao C: Gradient boosting (XGBoost/LightGBM) global ou por cohort

Modelo unico (ou poucos) treinado em dataset agregado de todos os jogadores, predizendo edge esperado.

- **Pros:**
  - **Estado da arte em scoring tabular.** Captura interacoes nao-lineares automaticamente.
  - **Robusto a dados faltantes** (caracteristica nativa do XGBoost).
  - **Generaliza bem.** Modelo unico para milhares de jogadores escala melhor que 1-modelo-por-jogador.

- **Contras:**
  - **Quebra premissa de personalizacao.** O **diferencial** do Selector vs SharkScope e usar o ROI **proprio** do jogador. Modelo global predizendo "edge medio do mercado" e exatamente o que o concorrente ja faz. Perde-se a tese.
  - **Sem dataset agregado licito.** Para treinar global, precisaria juntar historicos de todos os usuarios — privacidade complexa (LGPD), exige consentimento explicito, impacta marketing ("seus dados nao sao usados para treinar nada" e claim defensavel hoje).
  - **Pipeline ainda mais pesado.** Treinamento periodico (mensal? semanal?), avaliacao em hold-out, deployment de modelo, AB testing. Requer infraestrutura inexistente.
  - **Interpretabilidade degrada.** SHAP values explicam, mas requerem biblioteca pesada e UX dedicada. "Por que esse torneio e grade S?" vira "olhe esses 47 SHAP values" — ruim para o jogador.
  - **Dependencia npm enorme.** XGBoost-node, lightgbm-node — bibliotecas com bindings nativos, builds complexos, problemas de portabilidade Linux/Windows/Mac.
  - **Cold start nao resolvido.** Modelo global aplicado a jogador novo da resposta "media de mercado" — exatamente o oposto do diferencial.

### Opcao D: Heuristica simples sem shrinkage (ROI bruto + threshold)

`grade = "S" if roi > 20% and sample > 50 else ...` cascateado.

- **Pros:**
  - Trivial de implementar.
  - Zero matematica.

- **Contras:**
  - **Overfitting agudo a outliers.** Sample 5 com ROI 50% vira grade S. Jogador segue recomendacao, perde dinheiro, quebra confianca no produto.
  - **Sem combinacao de sinais.** Como agregar ROI por site + ROI por buy-in + ... ? Cascata de IFs vira spaghetti de regras.
  - **Cold start nao tratado.** Jogador novo recebe lixo.
  - **Equivale a "rule engine"** — exatamente o que jogadores criticam no Lobbyze (filtros sem inteligencia).

## Decisao

**Adotar Opcao A: Combinacao linear ponderada com Bayesian shrinkage.**

A escolha e **deliberadamente conservadora pelo momento do produto**:

1. **MVP precisa enviar valor em Sprint 1.** Linear ponderada com shrinkage entrega 85-90% do valor de um modelo aprendido com 5% do esforco e 0% da operacao MLOps.

2. **Personalizacao por jogador (premissa do produto) sai gratis no design.** Cada jogador tem seu proprio bundle analytics; mesmo algoritmo, dados diferentes -> scores diferentes. Sem retreinamento.

3. **Bayesian shrinkage com K=30 e o que o problema pede.** O calibro foi escolhido porque:
   - Spec do PM recomenda 30 explicitamente.
   - Empirical Bayes em dominios high-variance tipicamente usa K equivalente a 1-2 desvios-padroes da metrica observada. Para ROI (~15-25% std em buckets de poker), K=30 puxa fortemente N pequeno para o prior sem sufocar buckets ricos.
   - Validavel post-deploy via RF-07: se telemetria mostrar que torneios com `sample==30` tem precisao "boa", K esta certo; se ainda over/under, ajusta.

4. **Interpretabilidade nao e luxo, e requisito de produto.** Modal de detalhes do RF-04 exige tabela de signals com bucketScore, shrunkScore, peso, contribuicao. Modelo linear entrega isso natively; ML exigiria SHAP.

5. **Caminho de evolucao para ML esta aberto, nao bloqueado.** RF-07 (telemetria) coleta os dados que precisariamos para treinar futuro modelo. Quando volume justificar, migracao e refactor de 1 funcao (`computeTournamentScore`), nao do sistema todo.

6. **Restricao de stack respeitada.** Zero npm dependency nova. Funcao pura testavel sem mocks. Padrao do projeto (mesma estrategia de cache em memoria do Suprema).

## Consequencias

### Positivas
- **Time-to-ship Sprint 1 viavel.** Algoritmo cabe em ~150 linhas + ~80 linhas de constants + ~200 linhas de tests.
- **Performance previsivel.** Sem riscos de regressao por modelo "pesando mal" em outliers — shrinkage limita estragos.
- **Telemetria aciona evolucao.** RF-07 nao e desperdicio: os dados servirao tanto para calibrar pesos atuais quanto para treinar potencial modelo futuro.
- **AI Coach pode consumir o endpoint hoje.** Resposta ja e estruturada (signals + rationale) — quando AI Coach for integrado (fora do Sprint 1), nao ha refactor.
- **Onboarding de qualquer dev e trivial.** Modelo cabe em uma frase de README.

### Negativas
- **Pesos sao palpite informado.** Aceitamos que 0.20/0.20/0.20/0.10/0.10/0.15/0.05 pode estar errado em ate 20% para alguns jogadores. RF-07 mitiga em medio prazo.
- **Nao captura interacoes.** Aceitamos perda de sinal em casos como "PKO so funciona pra mim em horario nobre" — fica para v2 quando dados mostrarem que vale.
- **Heuristica de cold start e separada do modelo principal.** Adiciona ~30 linhas de codigo dedicadas; mantemos para UX (mensagem fixa "importe mais historico"), nao por necessidade matematica.

### Neutras
- **Pesos hardcoded inicialmente.** Quando RF-07 fornecer dados em 6+ meses, considerar:
  - **Calibragem coletiva** dos pesos default via correlacao score x ROI realizado.
  - **Calibragem por jogador** se telemetria mostrar variancia inter-jogador alta (fica como ADR futuro).
  - **Mudar para LR/XGBoost** apenas se tres condicoes acumularem:
    - Volume de telemetria > 10k eventos `add_to_grid` com ROI realizado calculavel,
    - A/B test mostrar uplift > 10% em metrica de adesao,
    - Equipe de engenharia tiver bandwidth para MLOps.

### Migracao para ML — gatilhos e riscos
| Gatilho | Sinal observavel | Acao |
|---|---|---|
| Volume telemetria suficiente | >10k eventos add_to_grid com janela ROI realizado >=30 dias por evento | Reabrir ADR — avaliar LR (Opcao B) |
| Variancia inter-jogador alta | Erro absoluto medio do score-vs-ROI realizado > 30 quando segmentado por cohort de stake | Considerar pesos por usuario antes de ML |
| Pedido explicito de jogador power | Top 5% jogadores pedem "deixa eu ajustar pesos" | Sprint dedicado a UI de calibragem manual (NAO ML) |
| Concorrente lanca modelo aprendido com vantagem demonstravel | Lobbyze/SharkScope publica feature similar com claim "ML" | Avaliar racionalmente — tem dados? Se sim, considerar Opcao C com ressalvas de privacidade |

**Risco principal de NAO migrar quando deveriamos:** competidor lanca selecao mais inteligente, capturada com dados que nos ja temos (mas nao usamos). Mitigacao: revisar este ADR a cada 6 meses junto com a estrategia de produto, com olho na telemetria do RF-07.

## Confianca

**Alta** para o MVP. **Media** para o medio prazo (>12 meses) — premissas podem mudar conforme:
- Tamanho da base de usuarios crescer (justifica pipeline coletivo),
- AI Coach ganhar capacidades de tool calling (justifica scoring estruturado mesmo se mudarmos de modelo),
- Concorrentes lancarem features de selecao com IA (forca acao defensiva).

## Referencias

- Spec: `docs/specs/tournament-selector.md` (RF-02)
- Roadmap: `docs/strategy/2026-04-23-product-roadmap.md` (Sprint 1)
- Empirical Bayes / James-Stein estimator: literatura classica de estatistica
- IMDb Top 250 Bayesian average: `https://en.wikipedia.org/wiki/Bayesian_average` (mesmo padrao matematico aplicado a ratings)
- ADR-014: filosofia de "modelo simples ortogonal vence enum complexo" — mesma raiz filosofica desta decisao (preferir clareza estrutural sobre sofisticacao prematura).
