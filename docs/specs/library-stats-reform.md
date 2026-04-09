# Spec: Reforma da Pagina Library — Substituicao do ICD por Sistema Estatistico Real

## Status
Aprovada

## Resumo
Substituir o ICD (Indice de Confianca de Desempenho) por um sistema de metricas estatisticamente validas que informe ao jogador profissional de MTT: (1) quao confiaveis sao seus dados por grupo de torneio, (2) qual o intervalo real de ROI possivel, e (3) qual o perfil de risco/variancia de cada grupo. A reforma inclui novos calculos backend, redesign dos cards e remoção de metricas enganosas.

## Contexto
O ICD atual (`avgProfit * (1 - e^(-0.1 * volume))`) atinge 99% de "confianca" com apenas 50 torneios. Em MTT poker, a comunidade (SharkScope, 2+2, coaches) define 1.500-3.000 como minimo para confianca moderada e 5.000+ para significancia estatistica. O ICD tambem ignora variancia, usa unidade em dolares (impossivel comparar entre stakes), e nao fornece intervalos de confianca. Um jogador profissional que toma decisoes de grade baseado nesses dados precisa de metricas que reflitam a realidade estatistica.

## Usuarios
- **Jogador profissional de MTT**: Usa a Library para decidir quais torneios manter na grade, quais remover, e quais testar mais. Precisa saber se o ROI observado e confiavel ou se precisa de mais volume.

## Requisitos Funcionais

### RF-01: Nota de Confiabilidade (A-F) por grupo
**Descricao:** Cada grupo de torneios recebe uma nota de A a F baseada exclusivamente no sample size, seguindo os parametros aceitos pela comunidade de poker profissional.
**Regras de negocio:**
- A: 2000+ torneios — "Altamente confiavel"
- B: 1000-1999 torneios — "Confiavel"
- C: 500-999 torneios — "Moderado"
- D: 200-499 torneios — "Baixa confiabilidade"
- F: 50-199 torneios — "Dados insuficientes"
- Grupos com menos de 50 torneios nao aparecem na Library (substituir o minimo atual de 20)
- A nota e exibida como badge colorida no card do grupo (A=verde, B=azul, C=amarelo, D=laranja, F=vermelho)
**Criterio de aceitacao:**
- [ ] Grupo com 2500 torneios exibe badge "A" verde
- [ ] Grupo com 150 torneios exibe badge "F" vermelho
- [ ] Grupo com 30 torneios nao aparece na listagem
- [ ] Badge exibe a nota + tooltip com a faixa (ex: "A — 2000+ torneios, altamente confiavel")

### RF-02: Intervalo de Confianca do ROI (95%)
**Descricao:** Para cada grupo, calcular e exibir o intervalo de confianca de 95% do ROI. Isso mostra a faixa provavel do ROI verdadeiro.
**Regras de negocio:**
- Calcular desvio padrao dos resultados por torneio: `SD = sqrt(sum((prize_i - avgPrize)^2) / (N - 1))` (sample standard deviation)
- Calcular erro padrao: `SE = SD / sqrt(N)`
- Calcular intervalo: `ROI_lower = ROI - 1.96 * (SE / avgBuyin) * 100` e `ROI_upper = ROI + 1.96 * (SE / avgBuyin) * 100`
- Exibir como: "ROI: 12.3% (IC 95%: 4.1% a 20.5%)"
- Se N < 50: nao calcular IC, exibir "Amostra insuficiente"
- Os valores de `prize` usados sao net profit (ja armazenados como tal no banco)
**Criterio de aceitacao:**
- [ ] Grupo com 1000 torneios, ROI 10%, SD 5 BI exibe IC de aproximadamente 10% +/- 0.31%
- [ ] Grupo com 50 torneios, ROI 15%, SD 5 BI exibe IC de aproximadamente 15% +/- 1.39%
- [ ] Grupo com 40 torneios nao exibe IC (abaixo do minimo)
- [ ] IC e exibido no card do grupo abaixo do ROI principal

### RF-03: Desvio Padrao em Buy-ins (Volatilidade)
**Descricao:** Calcular e exibir o desvio padrao dos resultados de cada grupo normalizado em buy-ins, para que o jogador entenda a volatilidade.
**Regras de negocio:**
- `SD_buyins = SD / avgBuyin` onde SD e o desvio padrao dos resultados em dolares
- Exibir como: "Volatilidade: 4.2 BI" com classificacao visual:
  - Baixa: < 3 BI (verde)
  - Media: 3-6 BI (amarelo)
  - Alta: > 6 BI (vermelho)
- Quanto maior o field size medio, espera-se maior volatilidade (normal em MTT)
**Criterio de aceitacao:**
- [ ] Grupo com resultados consistentes (SD baixo) exibe "Baixa" em verde
- [ ] Grupo com big hits esporadicos exibe "Alta" em vermelho
- [ ] Valor numerico exibido com 1 casa decimal

### RF-04: Posicao Normalizada Media
**Descricao:** Calcular `avg(position / fieldSize)` para cada grupo. Esse numero indica skill edge independente de field size.
**Regras de negocio:**
- Apenas incluir torneios onde position > 0 E fieldSize > 0
- Resultado entre 0 e 1: abaixo de 0.50 indica edge positivo, acima indica abaixo da media
- Exibir como percentual: "Pos. Media: 42.3%" com cor (verde se < 50%, vermelho se >= 50%)
**Criterio de aceitacao:**
- [ ] Jogador lucrativo com boas posicoes exibe valor < 50% em verde
- [ ] Jogador breakeven exibe valor proximo de 50%
- [ ] Torneios sem position (0 ou null) sao excluidos do calculo

### RF-05: ROI sem Top 3 Resultados (Robustez)
**Descricao:** Calcular ROI removendo os 3 maiores resultados do grupo, para testar se a lucratividade depende de outliers.
**Regras de negocio:**
- Ordenar torneios por prize DESC, remover os 3 primeiros
- Recalcular ROI com os torneios restantes
- Exibir como: "ROI sem outliers: 8.1%"
- Se o grupo tem menos de 20 torneios apos remocao, nao calcular
- Se ROI sem outliers e negativo mas ROI total e positivo, destacar em laranja como alerta
**Criterio de aceitacao:**
- [ ] Grupo com ROI 20% que cai para -5% sem top 3 exibe alerta laranja "Dependente de outliers"
- [ ] Grupo com ROI 10% que fica 8% sem top 3 exibe valor normal em verde
- [ ] Grupo com menos de 23 torneios nao exibe essa metrica

### RF-06: Remocao do ICD
**Descricao:** Remover completamente o calculo e exibicao do ICD em toda a pagina.
**Regras de negocio:**
- Remover a funcao `calculateICD` do frontend
- Remover sorting por ICD (substituir por sorting padrao por Nota de Confiabilidade, depois ROI)
- Remover KPIs "Best ICD" e "Worst ICD" do topo da pagina
- Substituir por: "Melhor ROI (confiavel)" — grupo com nota A ou B com maior ROI
**Criterio de aceitacao:**
- [ ] Nenhuma referencia a "ICD" em toda a UI
- [ ] Sorting padrao: Nota de Confiabilidade DESC, depois ROI DESC
- [ ] KPI topo mostra "Melhor ROI" filtrando apenas grupos nota A ou B

### RF-07: Redesign dos Cards de Grupo
**Descricao:** Cada card de grupo exibe informacoes em layout reorganizado com hierarquia visual clara.
**Regras de negocio:**
- **Header:** Nome do grupo + Badge de Confiabilidade (A-F) + Site badge
- **Linha 1 (destaque):** ROI com IC 95% + Profit total
- **Linha 2:** Volume (torneios) + Avg Buy-in + Avg Field Size
- **Linha 3:** Volatilidade (SD em BI) + Pos. Media Normalizada + ROI sem outliers
- **Linha 4:** ITM% + Final Table% + Reentradas
- Tags: Category + Speed
- Manter drill-down modal ao clicar no card
**Criterio de aceitacao:**
- [ ] Card exibe todas as metricas listadas sem scroll horizontal
- [ ] Badge de confiabilidade e visivel imediatamente
- [ ] ROI e o numero mais proeminente do card
- [ ] Alerta de outlier visivel quando aplicavel

## Requisitos Nao-Funcionais
- **Performance:** Calculo de SD/IC para 500 grupos com 50-5000 torneios cada deve completar em < 3 segundos
- **Precisao:** SD e IC devem usar sample standard deviation (N-1 no denominador, formula de Bessel)
- **Compatibilidade:** Todos os calculos devem funcionar com os dados SharkScope importados (prize = net profit)

## Endpoints Afetados
| Metodo | Rota | Mudanca | Auth |
|--------|------|---------|------|
| GET | `/api/tournament-library-grouped` | Adicionar campos: sdBuyins, roiLower, roiUpper, normalizedPosition, roiWithoutOutliers, confidenceGrade | JWT |

## Modelos de Dados Afetados

### Resposta do endpoint (alteracao — campos novos no JSON)
| Campo | Tipo | Descricao |
|-------|------|-----------|
| confidenceGrade | string (A/B/C/D/F) | Nota baseada em sample size |
| sdBuyins | number | Desvio padrao em buy-ins |
| volatilityLevel | string (low/medium/high) | Classificacao da volatilidade |
| roiLower | number | Limite inferior do IC 95% |
| roiUpper | number | Limite superior do IC 95% |
| normalizedPosition | number | avg(position/fieldSize), 0-1 |
| roiWithoutOutliers | number or null | ROI removendo top 3 resultados |
| outlierDependent | boolean | true se ROI sem outliers muda de sinal |

Nenhuma tabela de banco e alterada — todos os calculos sao feitos em runtime a partir dos dados de `tournaments`.

## Cenarios de Teste

### Happy Path
- [ ] Grupo com 3000 torneios exibe nota A, IC estreito, todas as metricas calculadas
- [ ] Grupo com 100 torneios exibe nota F, IC largo, metricas basicas
- [ ] Pagina carrega com 200 grupos em menos de 3 segundos

### Validacao de Input
- [ ] Grupo com 0 torneios (edge case) nao aparece
- [ ] Grupo com todos os prizes = 0 exibe ROI 0%, SD 0, sem erros
- [ ] Grupo com 1 torneio apenas nao aparece (minimo 50)

### Regras de Negocio
- [ ] Grupos com menos de 50 torneios sao filtrados
- [ ] IC nao e calculado para grupos com menos de 50 torneios
- [ ] ROI sem outliers nao e calculado para grupos com menos de 23 torneios
- [ ] Alerta de outlier aparece quando ROI muda de sinal ao remover top 3
- [ ] Nota de confiabilidade corresponde exatamente as faixas definidas

### Edge Cases
- [ ] Grupo onde TODOS os torneios tem mesmo resultado (SD = 0) exibe IC de 0 (ROI exato)
- [ ] Grupo com buyIn = 0 (freeroll) calcula metricas sem divisao por zero
- [ ] Grupo com positions todos null exibe "—" em posicao normalizada
- [ ] Grupo com exatamente 50 torneios aparece na listagem e calcula IC

## Fora de Escopo
- Alterar o algoritmo de agrupamento (Jaccard similarity) — reforma separada
- Adicionar hourly rate (requer dados de duracao que nem todos os torneios tem)
- Criar tabela materializada para cache dos calculos — otimizacao futura
- Mudar o calculo de ITM (prize > 0 vs posicao paga) — requer dados que nao temos
- Grafico de evolucao temporal por grupo
- Comparacao entre grupos lado a lado

## Dependencias
- Correcao do `prize - buyIn` ja aplicada nesta sessao (prize = net profit)
- `bestResult` e `worstResult` ja corrigidos para usar `prize` diretamente

## Notas de Implementacao
- Os calculos de SD, SE e IC devem ser feitos no metodo `getTournamentLibrary` em `server/storage.ts`, dentro do loop que calcula metricas por grupo (linhas 2325-2403)
- A funcao `calculateICD` no frontend (`TournamentLibraryNew.tsx:33`) deve ser removida
- Os novos campos devem ser adicionados ao objeto retornado pelo backend, sem alterar a estrutura existente (adicionar, nao substituir)
- Para SD, iterar sobre `tournamentsList` calculando `sum((prize_i - avgPrize)^2)` e dividir por `(N - 1)`
- Para posicao normalizada, iterar sobre torneios com position > 0 e fieldSize > 0
- Para ROI sem outliers, fazer `sort(tournaments by prize DESC).slice(3)` e recalcular
