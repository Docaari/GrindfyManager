# Spec: UX Sprint 5 — Estudos & Refinamento Final

## Status
Proposta

## Resumo
Ultimo sprint da auditoria UX do Grindfy. Cinco fixes que completam os 20 friction points identificados: integracao de Estudos com Leak Detector, metricas de progresso nos estudos, export de dados do dashboard (CSV/PNG), correlacao de metricas mentais com ROI, e migracao do warm-up de localStorage para banco de dados.

## Contexto
Este sprint fecha a auditoria UX iniciada em `Docs/specs/ux-audit-master-plan.md`. Os sprints 1-4 cobriram quick wins, grind redesign, dashboard polish e landing page. Sprint 5 foca em: (1) tornar a feature de Estudos orientada por dados em vez de auto-dirigida, (2) dar visibilidade ao progresso de estudo, (3) permitir export de dados para compartilhamento com stakers/coaches, (4) contextualizar metricas mentais com correlacao de ROI, e (5) eliminar dependencia de localStorage para dados de warm-up.

Sprint anterior: Sprint 4 — Landing Page & Conversao (FP-01, FP-03)
Este sprint: Sprint 5 — Estudos & Refinamento Final (FP-16, FP-17, FP-10, FP-13, FP-15)
Proximo sprint: Nenhum. Auditoria UX completa.

## Usuarios
- **Jogador (todos os planos):** Usa estudos, dashboard, warm-up e grind
- **Jogador com staker/coach:** Precisa exportar dados para prestacao de contas

---

## FP-16: Estudos Integrado com Leak Detector

### RF-01: Endpoint de sugestoes de estudo baseadas em leaks
**Descricao:** Novo endpoint que roda o leak detector existente (`server/coachLeakDetection.ts`) e mapeia os top 3 leaks para topicos de estudo.
**Regras de negocio:**
- Reutilizar a funcao `detectLeaks()` de `server/coachLeakDetection.ts` (ja implementada, 7 tipos de leak)
- Ordenar leaks por `severity` descrescente e retornar no maximo 3
- Cada leak retornado deve incluir: tipo, descricao, severidade, e `suggestedTopic` (string mapeada)
- Mapping de leak para topico de estudo:
  | leak.type | suggestedTopic |
  |-----------|----------------|
  | `roi_by_format` (Turbo/Hyper) | "ICM e Push/Fold em Turbo" |
  | `roi_by_format` (PKO) | "Estrategia PKO e Bounty" |
  | `roi_by_format` (outros) | "Game Selection e Analise de Formato" |
  | `weak_site` | "Adaptacao Multi-Site" |
  | `early_bust` | "Jogo Early Game e Sobrevivencia" |
  | `low_ft_conversion` | "Final Table Play e ICM" |
  | `declining_trend` | "Revisao de Estrategia e Volume" |
  | `insufficient_volume` | "Disciplina de Volume e Grind" |
  | `no_study` | "Rotina de Estudo e Evolucao" |
- Se o usuario nao tem torneios suficientes para rodar o detector (0 torneios), retornar array vazio
- Endpoint requer autenticacao JWT
**Criterio de aceitacao:**
- [ ] GET /api/study/suggestions retorna array de 0-3 objetos com { type, description, severity, suggestedTopic }
- [ ] Leaks sao ordenados por severity descrescente
- [ ] Mapping cobre todos os 7 tipos de leak do detector
- [ ] Usuario sem torneios recebe array vazio (nao erro)
- [ ] Endpoint protegido por requireAuth

### RF-02: Secao "Sugerido para Voce" na pagina de Estudos
**Descricao:** No topo da pagina de Estudos (`Studies.tsx`), antes da grid de temas, exibir secao com ate 3 cards de sugestao baseados nos leaks detectados.
**Regras de negocio:**
- Buscar dados via `GET /api/study/suggestions` com React Query
- Cada card mostra: icone de alerta, titulo do topico sugerido, descricao do leak (truncada a 100 chars), badge de severidade (1-5 com cor: 1-2 verde, 3 amarelo, 4-5 vermelho)
- Botao "Criar Tema" em cada card que abre `CreateThemeDialog` pre-preenchido com nome do `suggestedTopic`
- Se nao ha sugestoes (array vazio), ocultar a secao inteira (sem mensagem de "nenhuma sugestao")
- Loading state: 3 skeletons durante fetch
- Secao colapsavel com toggle "Sugestoes baseadas nos seus dados" (expandida por default)
**Criterio de aceitacao:**
- [ ] Secao aparece no topo da pagina de Estudos quando ha sugestoes
- [ ] Mostra ate 3 cards com topico, descricao truncada e severidade
- [ ] Botao "Criar Tema" abre dialog pre-preenchido com o nome do topico
- [ ] Secao oculta quando nao ha sugestoes
- [ ] Loading state com skeletons

### RF-03: Templates de estudo pre-definidos
**Descricao:** Lista de 8 temas de estudo padrao que o usuario pode usar como ponto de partida. Nao sao criados automaticamente — o usuario escolhe quais quer usar.
**Regras de negocio:**
- Templates sao constantes no frontend (nao precisam de tabela no banco):
  1. "3bet Ranges" (emoji: target, cor: azul)
  2. "Blind Defense" (emoji: shield, cor: verde)
  3. "ICM Basics" (emoji: chart, cor: roxo)
  4. "PKO Strategy" (emoji: trophy, cor: vermelho)
  5. "Mental Game" (emoji: brain, cor: rosa)
  6. "Bankroll Management" (emoji: wallet, cor: amarelo)
  7. "Game Selection" (emoji: magnifier, cor: laranja)
  8. "Final Table Play" (emoji: star, cor: dourado)
- Secao "Templates" na pagina de Estudos, abaixo das sugestoes e acima da grid de temas
- Cada template e um card com emoji, nome e botao "Criar a partir deste template"
- Ao clicar, abre `CreateThemeDialog` pre-preenchido com nome, emoji e cor do template
- Se o usuario ja tem um tema com nome identico (case-insensitive), mostrar badge "Ja criado" e desabilitar botao
- Secao colapsavel, colapsada por default se usuario ja tem >= 3 temas criados
**Criterio de aceitacao:**
- [ ] 8 templates listados na secao "Templates"
- [ ] Clicar "Criar a partir deste template" abre dialog pre-preenchido
- [ ] Templates ja criados mostram badge "Ja criado" com botao desabilitado
- [ ] Secao colapsada por default quando usuario tem >= 3 temas

---

## FP-17: Metricas de Progresso nos Estudos

### RF-04: Barra de progresso por tema
**Descricao:** Cada tema na grid de Estudos exibe barra de progresso baseada no campo `progress` (0-100) ja existente na tabela `study_themes`.
**Regras de negocio:**
- A barra de progresso usa o campo `study_themes.progress` (ja existe no schema, integer 0-100)
- Calcular progress como: media dos `knowledgeScore` dos `study_cards` associados ao tema (via `study_cards.category` matching `study_themes.name`, ou novo campo de relacao — decisao do Architect)
- Se o tema nao tem cards, progress = 0
- Atualizar `study_themes.progress` no backend sempre que um `study_card.knowledgeScore` for atualizado
- Cor da barra: vermelho 0-29, amarelo 30-59, verde 60-89, dourado 90-100
**Criterio de aceitacao:**
- [ ] Barra de progresso visivel em cada card de tema na grid
- [ ] Valor baseado na media dos knowledgeScore dos cards do tema
- [ ] Cores mudam conforme faixa de progresso
- [ ] Tema sem cards mostra barra vazia (0%)

### RF-05: Badge de dominio por tema
**Descricao:** Badge textual no card de tema indicando nivel de dominio.
**Regras de negocio:**
- Baseado no `progress` do tema:
  | Faixa | Badge | Cor |
  |-------|-------|-----|
  | 0-29 | "Iniciante" | cinza |
  | 30-59 | "Intermediario" | azul |
  | 60-89 | "Avancado" | verde |
  | 90-100 | "Dominado" | dourado |
- Badge aparece no canto superior direito do card de tema
**Criterio de aceitacao:**
- [ ] Badge correto exibido conforme faixa de progresso
- [ ] Cores e labels conforme tabela acima

### RF-06: Streak de dias estudando
**Descricao:** Contagem de dias consecutivos com pelo menos 1 `study_session` registrada.
**Regras de negocio:**
- Calcular no backend: contar dias consecutivos (ate hoje) onde existe pelo menos 1 registro em `study_sessions` para o usuario
- Se hoje nao tem sessao mas ontem teve, streak = 0 (resetou)
- Se hoje tem sessao, contar para tras ate encontrar dia sem sessao
- Retornar como parte de um novo endpoint `GET /api/study/stats` ou agregar a um endpoint existente
**Criterio de aceitacao:**
- [ ] Streak calculado corretamente com dias consecutivos
- [ ] Streak reseta para 0 se hoje nao tem sessao de estudo
- [ ] Streak = 1 se so hoje tem sessao

### RF-07: Mini-dashboard de estudos
**Descricao:** Secao no topo da pagina de Estudos (abaixo das sugestoes, acima dos templates) com 3 metricas resumidas.
**Regras de negocio:**
- Novo endpoint `GET /api/study/stats` retorna:
  - `hoursThisMonth`: soma de `study_sessions.duration` (em minutos, converter para horas) do mes corrente
  - `themesInProgress`: contagem de `study_themes` com `progress` entre 1 e 99
  - `streakDays`: streak de dias estudando (RF-06)
- UI: 3 cards compactos em linha horizontal:
  - "X horas estudadas este mes" (icone: clock)
  - "Y temas em progresso" (icone: book-open)
  - "Streak: Z dias" (icone: flame, com emoji de fogo se >= 7 dias)
- Se todos os valores sao 0, mostrar mensagem motivacional: "Comece a estudar hoje para acompanhar seu progresso aqui."
**Criterio de aceitacao:**
- [ ] GET /api/study/stats retorna hoursThisMonth, themesInProgress, streakDays
- [ ] 3 cards compactos exibidos no topo
- [ ] Mensagem motivacional quando tudo e zero
- [ ] Horas calculadas corretamente a partir de minutos

---

## FP-10: Export de Dados do Dashboard

### RF-08: Botao de export em cada tab do dashboard
**Descricao:** Botao "Exportar" no canto superior direito de cada tab do dashboard com dropdown de opcoes.
**Regras de negocio:**
- Botao com icone de download + texto "Exportar"
- Dropdown com 2 opcoes: "Exportar CSV" e "Exportar Imagem (PNG)"
- Disponivel em todas as tabs: Geral, Site, ABI, Tipo, Velocidade, Periodo, Participantes, Posicao
- Botao desabilitado durante o export com loading spinner
**Criterio de aceitacao:**
- [ ] Botao "Exportar" visivel em cada tab
- [ ] Dropdown com opcoes CSV e PNG
- [ ] Botao desabilitado durante processamento

### RF-09: Export CSV
**Descricao:** Gerar arquivo CSV com os dados da tab ativa do dashboard.
**Regras de negocio:**
- Usar os dados ja carregados pelo React Query (endpoints `GET /api/analytics/by-*`)
- Formato do CSV:
  - Header na primeira linha: "Grindfy - [Nome do Usuario] - [Periodo selecionado] - [Nome da Tab]"
  - Linha em branco
  - Headers das colunas (depende da tab):
    - Geral: Metrica, Valor
    - Site: Site, Torneios, Profit, ROI%, ITM%
    - ABI: Faixa, Torneios, Profit, ROI%
    - Tipo: Categoria, Torneios, Profit, ROI%
    - Velocidade: Speed, Torneios, Profit, ROI%
    - Periodo: Mes, Torneios, Profit, ROI%
    - Participantes: Faixa, Torneios, Profit, ROI%
    - Posicao: Posicao, Frequencia, Profit
  - Dados tabulares
- Encoding: UTF-8 com BOM (para compatibilidade com Excel)
- Nome do arquivo: `grindfy-[tab]-[data].csv`
- Download via `Blob` + `URL.createObjectURL` (client-side, sem endpoint extra)
**Criterio de aceitacao:**
- [ ] CSV gerado com header identificando usuario, periodo e tab
- [ ] Colunas corretas para cada tab
- [ ] Encoding UTF-8 com BOM
- [ ] Download automatico ao clicar
- [ ] Dados correspondem ao que esta exibido na tela (respeitando filtros ativos)

### RF-10: Export PNG (imagem do grafico)
**Descricao:** Capturar o container do grafico da tab ativa como imagem PNG.
**Regras de negocio:**
- Usar biblioteca `html2canvas` (adicionar como dependencia)
- Capturar o elemento DOM que contem o grafico (Recharts container)
- Adicionar header na imagem: logo Grindfy (texto, nao imagem) + nome do usuario + periodo + tab
- Footer: "Gerado por Grindfy — grindfyapp.com"
- Resolucao: 2x para qualidade (devicePixelRatio = 2)
- Background branco (nao transparente)
- Nome do arquivo: `grindfy-[tab]-[data].png`
- Download via `canvas.toBlob` + `URL.createObjectURL`
**Criterio de aceitacao:**
- [ ] Imagem PNG gerada a partir do grafico visivel
- [ ] Header com identificacao do usuario e periodo
- [ ] Footer com branding Grindfy
- [ ] Resolucao 2x para qualidade
- [ ] Background branco
- [ ] Download automatico ao clicar

### RF-11: Export na Tournament Library
**Descricao:** Botao de export CSV na pagina de Tournament Library para exportar lista de templates com stats.
**Regras de negocio:**
- Botao "Exportar CSV" no header da pagina
- Colunas: Nome, Site, Formato, Categoria, Velocidade, ABI, ROI%, ITM%, Total Jogados, Profit, Confidence
- Exportar todos os templates visiveis (respeitando filtros ativos)
- Mesmo formato de header que o dashboard (Grindfy - Usuario - Data)
- Nome do arquivo: `grindfy-biblioteca-[data].csv`
**Criterio de aceitacao:**
- [ ] Botao "Exportar CSV" na Tournament Library
- [ ] Colunas completas com stats de cada template
- [ ] Respeita filtros ativos
- [ ] Header com identificacao

---

## FP-13: Metricas Mentais no Dashboard com Correlacao

### RF-12: Endpoint de correlacao mental-performance
**Descricao:** Novo endpoint que calcula correlacao entre metricas mentais (foco, energia, confianca) e ROI.
**Regras de negocio:**
- Endpoint: `GET /api/analytics/mental-correlation`
- Requer autenticacao JWT
- Dados cruzados de `break_feedbacks` (foco, energia, confianca) com `grind_sessions` (profitLoss) e `session_tournaments` (resultados)
- Join: `break_feedbacks.sessionId` → `grind_sessions.id` → somar resultados dos `session_tournaments` da sessao
- Calcular:
  - `roiHighFocus`: ROI medio das sessoes onde media de `foco` dos breaks >= 7
  - `roiLowFocus`: ROI medio das sessoes onde media de `foco` dos breaks < 5
  - `roiHighEnergy`: ROI medio das sessoes onde media de `energia` dos breaks >= 7
  - `roiLowEnergy`: ROI medio das sessoes onde media de `energia` dos breaks < 5
  - `roiHighConfidence`: ROI medio das sessoes onde media de `confianca` dos breaks >= 7
  - `roiLowConfidence`: ROI medio das sessoes onde media de `confianca` dos breaks < 5
  - `bestSession`: { date, avgFocus, avgEnergy, avgConfidence, roi } da sessao com maior ROI que tem break feedbacks
  - `worstSession`: { date, avgFocus, avgEnergy, avgConfidence, roi } da sessao com menor ROI que tem break feedbacks
  - `sampleSize`: total de sessoes com pelo menos 1 break feedback
- Se `sampleSize` < 5, retornar `insufficient: true` e nao retornar as demais metricas
- Respeitar filtros de periodo (query params `startDate`, `endDate`) se fornecidos
**Criterio de aceitacao:**
- [ ] GET /api/analytics/mental-correlation retorna dados de correlacao
- [ ] ROI calculado corretamente para cada faixa de metrica mental
- [ ] Retorna `insufficient: true` quando sample < 5
- [ ] Respeita filtros de periodo
- [ ] Endpoint protegido por requireAuth

### RF-13: Tooltips de correlacao nos cards de metricas mentais
**Descricao:** Nos cards de metricas mentais do dashboard, adicionar tooltip mostrando impacto no ROI.
**Regras de negocio:**
- Cards existentes de foco, energia e confianca recebem icone de info (Lucide `Info`)
- Ao hover no icone, tooltip mostra:
  - Foco: "Seu ROI e X% quando foco >= 7, vs Y% quando foco < 5"
  - Energia: "Seu ROI e X% quando energia >= 7, vs Y% quando energia < 5"
  - Confianca: "Seu ROI e X% quando confianca >= 7, vs Y% quando confianca < 5"
- Se dados insuficientes (`insufficient: true`), tooltip mostra: "Registre mais breaks para ver a correlacao com seu ROI (minimo 5 sessoes)"
- Buscar dados via React Query com `GET /api/analytics/mental-correlation`
- Cache de 5 minutos (staleTime)
**Criterio de aceitacao:**
- [ ] Icone de info aparece nos cards de metricas mentais
- [ ] Tooltip mostra ROI por faixa de metrica
- [ ] Mensagem de dados insuficientes quando sample < 5
- [ ] Dados carregados via React Query com cache de 5 min

### RF-14: Mini-insight card de performance mental
**Descricao:** Card de insight abaixo das metricas mentais com dica baseada nos dados.
**Regras de negocio:**
- Exibido apenas quando `sampleSize` >= 5
- Texto dinamico baseado na maior diferenca entre ROI alto e baixo:
  - Se maior diferenca e foco: "Dica: Suas melhores sessoes tem foco medio de X. Quando seu foco cai abaixo de 5, seu ROI cai Y pontos percentuais."
  - Se maior diferenca e energia: mesma estrutura com energia
  - Se maior diferenca e confianca: mesma estrutura com confianca
- Icone de lampada (Lucide `Lightbulb`)
- Background sutil diferenciado (amarelo claro)
- Dismissivel (X para fechar, nao aparece novamente por 7 dias via localStorage)
**Criterio de aceitacao:**
- [ ] Insight card aparece quando sample >= 5
- [ ] Texto dinamico baseado na maior diferenca de ROI
- [ ] Dismissivel com cooldown de 7 dias
- [ ] Nao aparece quando dados insuficientes

---

## FP-15: Warm-up Salvo no Banco (Remover localStorage)

### RF-15: MentalPrep salva warm-up no banco ao iniciar grind
**Descricao:** Ao clicar "Iniciar Grind" na pagina MentalPrep, salvar dados de warm-up no banco via endpoint existente.
**Regras de negocio:**
- Endpoint ja existe: `POST /api/preparation-logs` (em `server/routes/grind-sessions.ts`, linha 547)
- Schema ja existe: tabela `preparation_logs` com campos `mentalState`, `focusLevel`, `confidenceLevel`, `exercisesCompleted`, `warmupCompleted`, `sessionGoals`, `notes`
- Storage ja existe: `storage.createPreparationLog()` (em `server/storage.ts`, linha 964)
- No MentalPrep.tsx, ao clicar "Iniciar Grind":
  1. Chamar `POST /api/preparation-logs` com os dados do warm-up
  2. Aguardar resposta com o `id` do preparation log criado
  3. Manter localStorage como fallback temporario (escrever nos dois)
  4. Navegar para `/grind` com query param `?prepId=[id]` ou simplesmente navegar (GrindSession buscara via API)
- Dados a enviar: `mentalState` (score geral), `focusLevel`, `confidenceLevel`, `exercisesCompleted` (lista de exercicios feitos), `warmupCompleted: true`, `sessionGoals` (se preenchido)
**Criterio de aceitacao:**
- [ ] Clicar "Iniciar Grind" salva preparation log no banco
- [ ] Dados de warm-up persistidos corretamente na tabela preparation_logs
- [ ] localStorage mantido como fallback temporario
- [ ] Navegacao para /grind funciona apos salvar

### RF-16: GrindSession busca warm-up do banco
**Descricao:** Ao iniciar sessao, GrindSession busca o ultimo preparation log do dia via API em vez de localStorage.
**Regras de negocio:**
- Novo endpoint: `GET /api/preparation-logs/latest` — retorna o preparation log mais recente do usuario criado hoje (data de `createdAt` = hoje)
- Se nao existe preparation log de hoje, retornar `null` (status 200, body `null`)
- No GrindSession.tsx, ao carregar a pagina:
  1. Tentar buscar via `GET /api/preparation-logs/latest`
  2. Se retornou dados, usar como warm-up data
  3. Se retornou null, tentar localStorage como fallback
  4. Se localStorage tambem vazio, sessao inicia sem dados de warm-up (comportamento atual)
- Remover cleanup de localStorage somente apos migration period (proximo release)
**Criterio de aceitacao:**
- [ ] GET /api/preparation-logs/latest retorna preparation log de hoje ou null
- [ ] GrindSession busca via API primeiro, fallback para localStorage
- [ ] Sessao inicia normalmente mesmo sem warm-up data
- [ ] Endpoint protegido por requireAuth

### RF-17: Cleanup de localStorage (migration period)
**Descricao:** Manter localStorage como fallback por 1 release. Documentar para remocao futura.
**Regras de negocio:**
- Chaves de localStorage afetadas: `warmUpScore`, `warmUpData`, `warmUpIntegration`
- Neste release: escrever nos dois (banco + localStorage) e ler do banco com fallback para localStorage
- Proximo release (documentar como TODO): remover todas as referencias a localStorage para warm-up
- Adicionar comentario `// TODO: Remove localStorage fallback after migration period (FP-15)` em cada ponto de uso
**Criterio de aceitacao:**
- [ ] localStorage mantido como fallback de leitura
- [ ] Escrita acontece tanto no banco quanto no localStorage
- [ ] Comentarios TODO adicionados para remocao futura

---

## Requisitos Nao-Funcionais

- **Performance:** Endpoint `/api/study/suggestions` deve responder em < 500ms (roda leak detection em tempo real). Endpoint `/api/analytics/mental-correlation` deve responder em < 300ms. Export CSV deve ser instantaneo (dados ja carregados no frontend). Export PNG pode levar ate 3s (rendering de canvas).
- **Dependencias novas:** `html2canvas` (para RF-10 export PNG). Nenhuma outra dependencia nova.
- **Seguranca:** Todos os novos endpoints requerem `requireAuth`. Export nao deve vazar dados de outros usuarios.
- **Compatibilidade:** Export CSV com BOM para compatibilidade com Excel. Export PNG testado em Chrome e Firefox.

## Endpoints Previstos

| Metodo | Rota | Descricao | Auth |
|--------|------|-----------|------|
| GET | /api/study/suggestions | Top 3 leaks mapeados para topicos de estudo | JWT |
| GET | /api/study/stats | Mini-dashboard: horas, temas em progresso, streak | JWT |
| GET | /api/analytics/mental-correlation | Correlacao metricas mentais vs ROI | JWT |
| GET | /api/preparation-logs/latest | Ultimo preparation log de hoje | JWT |

**Endpoints existentes utilizados (sem alteracao):**
| Metodo | Rota | Uso |
|--------|------|-----|
| POST | /api/preparation-logs | Salvar warm-up (ja existe) |
| GET | /api/preparation-logs | Listar preparation logs (ja existe) |
| GET | /api/analytics/by-site | Dados para export CSV tab Site |
| GET | /api/analytics/by-buyin | Dados para export CSV tab ABI |
| GET | /api/analytics/by-category | Dados para export CSV tab Tipo |
| GET | /api/analytics/by-speed | Dados para export CSV tab Velocidade |
| GET | /api/analytics/by-month | Dados para export CSV tab Periodo |
| GET | /api/analytics/by-field | Dados para export CSV tab Participantes |

## Modelos de Dados Afetados

### Nenhuma alteracao de schema necessaria

As tabelas necessarias ja existem:

| Tabela | Status | Campos relevantes |
|--------|--------|-------------------|
| `preparation_logs` | Existe | mentalState, focusLevel, confidenceLevel, exercisesCompleted, warmupCompleted, sessionGoals, createdAt |
| `study_themes` | Existe | progress (integer 0-100), name, emoji, color |
| `study_cards` | Existe | knowledgeScore (integer 0-100), category, status |
| `study_sessions` | Existe | duration (minutos), date, createdAt |
| `break_feedbacks` | Existe | sessionId, foco, energia, confianca (0-10) |
| `grind_sessions` | Existe | id, profitLoss, date |
| `session_tournaments` | Existe | sessionId, buyIn, prize |

**Nota:** A relacao entre `study_themes` e `study_cards` para calculo de progresso por tema pode precisar de decisao arquitetural (matching por nome/category vs foreign key). Delegar ao System-Architect.

## Integracoes Externas

Nenhuma integracao externa nova. Todas as funcionalidades sao internas.

## Cenarios de Teste Derivados

### FP-16 — Estudos + Leak Detector

#### Happy Path
- [ ] Usuario com torneios suficientes ve 3 sugestoes de estudo no topo da pagina
- [ ] Clicar "Criar Tema" a partir de sugestao abre dialog pre-preenchido e cria tema
- [ ] Clicar "Criar a partir deste template" cria tema com dados do template

#### Validacao de Input
- [ ] Endpoint /api/study/suggestions sem auth retorna 401
- [ ] Endpoint retorna array vazio quando usuario nao tem torneios

#### Regras de Negocio
- [ ] Mapping correto de cada tipo de leak para topico sugerido
- [ ] Leak type `roi_by_format` com speed "Turbo" mapeia para "ICM e Push/Fold em Turbo"
- [ ] Leak type `roi_by_format` com category "PKO" mapeia para "Estrategia PKO e Bounty"
- [ ] Maximo 3 sugestoes retornadas mesmo com 7 leaks detectados
- [ ] Sugestoes ordenadas por severity descrescente
- [ ] Template com nome identico a tema existente mostra "Ja criado"

#### Edge Cases
- [ ] Usuario com exatamente 0 torneios: array vazio sem erro
- [ ] Usuario com torneios mas nenhum leak: array vazio
- [ ] Todos os 8 templates ja criados: todos com badge "Ja criado"
- [ ] Nome de tema existente com case diferente ("icm basics" vs "ICM Basics"): detectado como duplicata

### FP-17 — Metricas de Progresso

#### Happy Path
- [ ] Mini-dashboard mostra horas estudadas, temas em progresso e streak corretos
- [ ] Barra de progresso reflete media dos knowledgeScore dos cards do tema
- [ ] Badge de dominio muda conforme faixa de progresso

#### Regras de Negocio
- [ ] Streak = 0 se hoje nao tem sessao de estudo
- [ ] Streak = 3 se estudou hoje, ontem e anteontem
- [ ] Tema sem cards mostra 0% de progresso e badge "Iniciante"
- [ ] Horas calculadas como soma de study_sessions.duration / 60

#### Edge Cases
- [ ] Usuario novo sem sessoes de estudo: tudo zero, mensagem motivacional
- [ ] Sessao de estudo com duracao 0 minutos: conta para streak mas nao para horas
- [ ] Multiplas sessoes no mesmo dia: conta como 1 dia para streak

### FP-10 — Export de Dados

#### Happy Path
- [ ] Export CSV da tab "Site" gera arquivo com colunas corretas e dados filtrados
- [ ] Export PNG captura grafico visivel com header e footer
- [ ] Export CSV da Tournament Library gera lista de templates

#### Validacao de Input
- [ ] Export com filtro de periodo aplicado: CSV contem apenas dados do periodo
- [ ] Export de tab sem dados: CSV gerado com headers mas sem linhas de dados

#### Regras de Negocio
- [ ] Header do CSV: "Grindfy - [usuario] - [periodo] - [tab]"
- [ ] Encoding UTF-8 com BOM no CSV
- [ ] Nome do arquivo segue padrao grindfy-[tab]-[data].csv
- [ ] PNG com resolucao 2x e background branco

#### Edge Cases
- [ ] Export enquanto dados ainda carregando: botao desabilitado
- [ ] Grafico com muitos dados (1000+ pontos): PNG renderiza sem travar
- [ ] Tab "Geral" com formato Metrica/Valor (diferente das demais)
- [ ] Caracteres especiais no nome do usuario (acentos): CSV e PNG corretos

### FP-13 — Metricas Mentais com Correlacao

#### Happy Path
- [ ] Tooltip no card de foco mostra "Seu ROI e X% quando foco >= 7, vs Y% quando foco < 5"
- [ ] Insight card mostra dica baseada na maior diferenca de ROI

#### Regras de Negocio
- [ ] Sample < 5 sessoes: tooltip mostra mensagem de dados insuficientes
- [ ] Sample >= 5: tooltips mostram valores reais de correlacao
- [ ] Insight card identifica corretamente qual metrica tem maior impacto

#### Edge Cases
- [ ] Usuario sem break feedbacks: mensagem de dados insuficientes
- [ ] Todas as sessoes com foco >= 7 (sem sessoes com foco < 5): mostrar apenas ROI alto, "sem dados para foco baixo"
- [ ] ROI negativo em ambas as faixas: tooltip mostra valores negativos corretamente
- [ ] Insight card dismissido: nao reaparece por 7 dias

### FP-15 — Warm-up no Banco

#### Happy Path
- [ ] Completar warm-up e clicar "Iniciar Grind" salva preparation_log no banco
- [ ] GrindSession busca warm-up do banco ao iniciar e exibe dados corretos
- [ ] Warm-up salvo persiste mesmo se usuario limpar localStorage

#### Regras de Negocio
- [ ] POST /api/preparation-logs salva todos os campos corretamente
- [ ] GET /api/preparation-logs/latest retorna log de hoje
- [ ] GET /api/preparation-logs/latest retorna null se nao ha log hoje
- [ ] Fallback para localStorage funciona quando API falha

#### Edge Cases
- [ ] Dois warm-ups no mesmo dia: /latest retorna o mais recente
- [ ] Warm-up salvo as 23:59, grind iniciado as 00:01 (dia seguinte): /latest retorna null (correto — novo dia)
- [ ] API de salvar falha: localStorage ainda funciona como fallback
- [ ] LocalStorage vazio + API retorna null: sessao inicia sem warm-up (sem erro)

## Fora de Escopo

- **Auditoria UX completa:** Este sprint finaliza todos os 20 friction points. Nao ha sprints adicionais planejados.
- **Spaced repetition:** Sistema de revisao espacada para study cards (Anki-like). Feature futura.
- **Export PDF:** Apenas CSV e PNG neste sprint. PDF pode ser adicionado futuramente.
- **Export programatico/API:** Export e somente via UI (download no browser). Nao ha endpoint de export.
- **Compartilhamento direto:** Nao ha integracao com redes sociais ou link compartilhavel. Usuario exporta e compartilha manualmente.
- **Correlacao mental avancada:** Nao calcular regressao linear ou correlacao de Pearson. Apenas comparacao de medias por faixa.
- **Remocao definitiva do localStorage:** Neste release, localStorage e mantido como fallback. Remocao completa fica para o release seguinte.
- **Recalculo automatico de study_themes.progress:** A estrategia de sincronizacao (trigger, cron, ou on-demand) fica a criterio do System-Architect.
- **Novos leak types:** O mapping cobre os 7 tipos existentes em `coachLeakDetection.ts`. Novos tipos de leak nao estao no escopo.

## Dependencias

- **FP-16** depende de `server/coachLeakDetection.ts` (funcao `detectLeaks()`) ja implementada no AI Coach
- **FP-16** depende do sistema de Study Themes v2 (`study_themes`, `study_tabs`) ja implementado
- **FP-10** requer adicionar `html2canvas` como dependencia do projeto
- **FP-13** depende de dados em `break_feedbacks` e `grind_sessions` — se usuario nunca usou breaks, mostra mensagem de dados insuficientes
- **FP-15** depende dos endpoints `POST /api/preparation-logs` e da funcao `storage.createPreparationLog()` ja existentes
- **Sprints 1-4** da auditoria UX (nao bloqueantes, mas recomendado completar antes)

## Notas de Implementacao

- **FP-16:** O `detectLeaks()` precisa que os dados de analytics sejam buscados antes (mesma logica de `server/coachContext.ts`). Considerar reutilizar `buildCoachContext()` ou extrair a logica de busca de dados em funcao compartilhada.
- **FP-10:** `html2canvas` tem limitacoes com SVG (que Recharts usa). Alternativa: `dom-to-image-more` (fork mantido do dom-to-image) que tem melhor suporte a SVG. Testar ambas antes de decidir.
- **FP-13:** O `coachContext.ts` ja tem campo `mentalCorrelation` (linhas 107/114) e `coachPrompts.ts` ja calcula `roiHighFocus`/`roiLowFocus`. Considerar reutilizar essa logica.
- **FP-15:** As 3 chaves de localStorage a migrar sao: `warmUpScore`, `warmUpData`, `warmUpIntegration` (encontradas em MentalPrep.tsx linhas 239-241 e GrindSession.tsx linhas 407-454).
