# Feature Flow — Tournament Selector (perspectiva do usuario)

## Contexto
Fluxograma do ponto de vista do jogador interagindo com o widget Selector dentro de `/coach` (Grade Planner). Cobre cold start granular, fluxo principal, filtros, bankroll desabilitado, add-to-grid e modal de detalhes.

---

## Diagrama Principal

```mermaid
flowchart TD
    Start([Jogador acessa /coach]) --> ClicaTabSelector["Clica tab 'Selector'<br/>(painel da Biblioteca)"]
    ClicaTabSelector --> Carrega["GET /api/tournament-selector<br/>?date=hoje&sources=suprema,library"]
    Carrega --> CheckLoading{Loading?}
    CheckLoading -->|sim| Spinner["Mostra spinner<br/>'Calculando ranking...'"]
    Spinner --> CheckLoading
    CheckLoading -->|nao| CheckErro{Erro?}

    CheckErro -->|"timeout/500"| Erro["Mostra erro<br/>+ botao 'Tentar novamente'"]
    Erro -->|usuario clica| Carrega

    CheckErro -->|ok| CheckColdStart{"playerProfile.totalTournaments<br/>quantos?"}

    CheckColdStart -->|"&lt; 20"| ColdStartPuro["Banner laranja:<br/>'Importe mais historico (X torneios)<br/>Score abaixo usa metricas universais'<br/><br/>Lista com algoritmo simplificado<br/>(Normal+15, Hyper-10, etc.)<br/>Confidence sempre 'low'"]

    CheckColdStart -->|"20-49"| ColdStartParcial["Banner amarelo:<br/>'Personalizando recomendacoes — atualmente X torneios.<br/>Importe ate 50 para precisao maxima.'<br/><br/>Lista com algoritmo full<br/>+ badge 'Low confidence' visivel em cada card"]

    CheckColdStart -->|"&gt;= 50"| Normal["Sem banner cold start.<br/>Lista com algoritmo full<br/>+ confidence calculada por bucket"]

    ColdStartPuro --> ListaRender
    ColdStartParcial --> ListaRender
    Normal --> ListaRender

    ListaRender["Renderiza lista ordenada<br/>(score DESC, confidence DESC, startTime ASC)"] --> CheckBankroll{"user_settings.bankroll<br/>configurado?"}

    CheckBankroll -->|nao| BankrollDisabled["Chip 'Bankroll' desabilitado<br/>Tooltip: 'Configure bankroll em /settings'"]
    CheckBankroll -->|sim| BankrollEnabled["Chip 'Bankroll' ativo<br/>(filtra torneios fora da regra 1pct)"]

    BankrollDisabled --> EsperaAcao
    BankrollEnabled --> EsperaAcao

    EsperaAcao{"Acao do usuario?"}

    EsperaAcao -->|filtra fonte| AjustaFiltros["Atualiza queryKey<br/>refetch /api/tournament-selector"]
    EsperaAcao -->|filtra score min| AjustaFiltros
    EsperaAcao -->|filtra sample| AjustaFiltros
    EsperaAcao -->|filtra bankroll| AjustaFiltros
    EsperaAcao -->|muda data| MudaData["seletor de data<br/>refetch com nova data"]
    EsperaAcao -->|"clica 'Atualizar'"| ForceRefetch["queryClient.invalidateQueries<br/>+ refetch (cacheHit=false)"]

    AjustaFiltros --> Carrega
    MudaData --> Carrega
    ForceRefetch --> Carrega

    EsperaAcao -->|"clica 'Detalhes'<br/>em um card"| Modal["Abre SelectorDetailsModal<br/>Tabela 7x6 com signals,<br/>weights, contribuicoes,<br/>texto explicativo"]
    Modal -->|fecha| EsperaAcao
    Modal -->|"botao 'Adicionar a grade'"| AddGrid

    EsperaAcao -->|"clica 'Adicionar a grade'<br/>em um card"| CheckJaNaGrade{"alreadyInGrid<br/>== true?"}

    CheckJaNaGrade -->|sim| Disabled["Botao desabilitado<br/>texto 'Ja na grade'<br/>(usuario nao pode clicar)"]
    Disabled --> EsperaAcao

    CheckJaNaGrade -->|nao| AddGrid

    AddGrid["POST /api/planned-tournaments<br/>com metadata.fromSelector=true<br/>+ score + grade + signals"] --> CheckAddOk{"Sucesso?"}

    CheckAddOk -->|"erro: subscription_limit"| ErroAdd["Toast vermelho:<br/>'Limite de torneios planejados atingido.<br/>Faca upgrade do plano.'"]
    ErroAdd --> EsperaAcao

    CheckAddOk -->|"erro: 500"| ErroAddGenerico["Toast vermelho com mensagem"]
    ErroAddGenerico --> EsperaAcao

    CheckAddOk -->|sim| Sucesso["Toast verde:<br/>'Adicionado a grade — Score 87 (S)'<br/><br/>Card atualiza:<br/>- alreadyInGrid=true<br/>- botao 'Ja na grade' desabilitado<br/>- TanStack invalida ['planned-tournaments']<br/><br/>Background:<br/>- Log RF-07 'add_to_grid'<br/>- Selector cache invalidado<br/>(proxima chamada recalcula com novo alreadyInGrid)"]
    Sucesso --> EsperaAcao

    EsperaAcao -->|"sair de /coach"| Fim([Sai])

    classDef coldStart fill:#ffe6cc,stroke:#cc8800
    classDef erro fill:#ffd6d6,stroke:#cc0000
    classDef sucesso fill:#d6f5d6,stroke:#008800
    classDef bankroll fill:#e6f0ff,stroke:#0066cc

    class ColdStartPuro,ColdStartParcial coldStart
    class Erro,ErroAdd,ErroAddGenerico erro
    class Sucesso sucesso
    class BankrollDisabled,BankrollEnabled bankroll
```

---

## Sub-Fluxo: Library com Score (RF-05)

```mermaid
flowchart TD
    Start([Usuario abre tab 'Catalogo'<br/>na Biblioteca em /coach]) --> Fetch["GET /api/tournament-library"]
    Fetch --> CheckScore{"Cada item tem<br/>dayOfWeek definido?"}

    CheckScore -->|sim| HasScore["Backend ja calculou<br/>selectorScore para o item<br/>(mesmo payload — RF-05 batch)"]
    CheckScore -->|nao| NoScore["Item renderiza<br/>SEM badge de score"]

    HasScore --> Render["LibraryCard renderiza:<br/>- nome, site, buyIn<br/>- badge 'S 87' canto superior direito<br/>(cor por grade)"]
    Render --> Hover{"Usuario faz hover<br/>na badge?"}
    Hover -->|sim| Tooltip["Tooltip exibe<br/>primeira sentenca do rationale"]
    Hover -->|nao| Fim
    Tooltip --> Fim
    NoScore --> Fim([Item exibido sem score])
```

---

## Sub-Fluxo: Cold Start Granular

```mermaid
flowchart TD
    Start([Endpoint recebe request]) --> CountTournaments["Conta tournaments<br/>do usuario nos ultimos lookbackDays"]

    CountTournaments --> CheckSize{"Quantos?"}

    CheckSize -->|"&lt; 20"| Pure["coldStartPureScorer<br/><br/>Score = 50 (base) + bonus universal:<br/>+ Speed Normal: +15<br/>+ Speed Turbo: +5<br/>+ Speed Hyper: -10<br/>+ Field medio: +10<br/>+ Field pequeno: +5<br/>+ Field massivo: -5<br/>+ Horario nobre: +5<br/><br/>Clamp [0,100]<br/>Confidence sempre 'low'<br/>Rationale: 'Score generico — importe mais...'"]

    CheckSize -->|"20-49"| HybridLow["fullScorer + lowConfidenceFlag<br/><br/>Algoritmo padrao roda normalmente.<br/>Cada card recebe badge visivel:<br/>'Personalizacao parcial — X torneios'<br/><br/>Confidence ainda calculado por bucket<br/>(pode ser low/medium se sample suficiente em alguma dimensao)"]

    CheckSize -->|"&gt;= 50"| Full["fullScorer (sem flags especiais)<br/><br/>Algoritmo padrao com confidence<br/>derivada normalmente do sample dos buckets"]

    Pure --> AppendProfile["response.playerProfile.coldStart = 'pure'"]
    HybridLow --> AppendProfile2["response.playerProfile.coldStart = 'partial'<br/>response.playerProfile.totalTournaments = N"]
    Full --> AppendProfile3["response.playerProfile.coldStart = false"]

    AppendProfile --> Return([Retorna response])
    AppendProfile2 --> Return
    AppendProfile3 --> Return
```

---

## Cenarios de Teste Derivados

### Happy Path
- [ ] Jogador com 1k+ torneios abre tab Selector → recebe lista ranqueada com scores 0-100
- [ ] Top torneio tem grade S, badge verde com trofeu, rationale destacando ROI alto
- [ ] Bottom torneio tem grade D, badge vermelho com X, rationale destacando warnings
- [ ] Lista esta ordenada por score DESC
- [ ] Card mostra: grade colorida, score grande, nome, horario, site (logo), buy-in, rationale, mini-grafico, warnings, botoes "Adicionar" e "Detalhes"

### Cold Start Granular
- [ ] Jogador com 0 torneios → response.playerProfile.coldStart = "pure", banner laranja, lista com algoritmo simplificado
- [ ] Jogador com 19 torneios → mesmo comportamento (pure)
- [ ] Jogador com 20 torneios → response.playerProfile.coldStart = "partial", banner amarelo, badge "low confidence" em cada card
- [ ] Jogador com 49 torneios → mesmo comportamento (partial)
- [ ] Jogador com 50 torneios → sem banner, scoring normal, confidence calculada por bucket
- [ ] Cold start "pure" com Speed=Normal + Field=medio + Horario=nobre → score 80 (50 + 15 + 10 + 5)
- [ ] Cold start "pure" com Speed=Hyper + Field=massivo + Horario=madrugada → score 35 (50 - 10 - 5 + 0, clampado)

### Filtros
- [ ] Filtro "Fonte: Suprema" → endpoint chamado com sources=suprema, lista so com source=suprema
- [ ] Filtro "Fonte: Biblioteca" → endpoint com sources=library, NAO chama Pokerbyte (verificar via mock)
- [ ] Filtro "Score >= 70" → lista esconde grades C/D
- [ ] Filtro "Score >= 85" → lista mostra so grades S
- [ ] Filtro "Sample >= 30" → torneios com bucket primario sample < 30 ocultos
- [ ] Filtro "Bankroll: dentro do limite" com bankroll cadastrado → oculta torneios > 1pct
- [ ] Filtro "Bankroll" sem bankroll cadastrado → chip desabilitado, tooltip "Configure em /settings"
- [ ] Mudar data → refetch com nova date, lista atualiza
- [ ] Botao "Atualizar" → invalida cache, refetch garantido (cacheHit=false)

### Add to Grid
- [ ] Clicar "Adicionar" cria planned_tournament, toast verde, botao vira "Ja na grade" desabilitado
- [ ] alreadyInGrid=true desde inicio → botao ja vem desabilitado
- [ ] Apos add, refresh do widget mostra alreadyInGrid=true persistente (cache invalidado corretamente)
- [ ] Erro 403 (subscription limit) → toast vermelho com mensagem clara
- [ ] Erro 500 generico → toast vermelho + botao continua habilitado para retry
- [ ] Background: log RF-07 "add_to_grid" inserido em tournament_selector_logs com snapshot de signals

### Modal de Detalhes
- [ ] Clicar "Detalhes" abre modal com tabela completa: Sinal | ROI bruto | Sample | bucketScore | shrunkScore | Peso | Contribuicao
- [ ] Total na ultima linha bate com score mostrado no card
- [ ] Modal tem botao "Adicionar a grade" replicado (mesma logica)
- [ ] Modal fecha sem afetar lista

### Edge Cases
- [ ] Suprema API offline → response.warnings inclui "suprema_unavailable", lista so com library
- [ ] Biblioteca vazia + Suprema offline → lista vazia, mensagem "Nenhum torneio para esta data"
- [ ] Filtros aplicados zeraram lista → mensagem "Nenhum torneio combina com seus filtros"
- [ ] Torneio Suprema sem `maxPlayers` → fieldRoi peso redistribuido (visivel no modal de detalhes)
- [ ] Torneio category desconhecida ("Bounty Hunter") → mapeado via constantes para PKO ou redistribuido
- [ ] Data no passado → request aceito, Suprema pode retornar vazio
- [ ] Cache hit (segunda chamada em <30min) → response.cacheHit=true, latencia <50ms
- [ ] Apos upload novo de CSV → bundle e selector cache invalidados, proxima chamada recalcula
- [ ] 31a request no minuto → 429 rate limit
- [ ] Sem auth → 401
- [ ] Date invalido (23-04-2026) → 400

### UI Responsividade
- [ ] Mobile: cards full-width, mini-grafico empilhado abaixo do rationale
- [ ] Desktop: cards compactos, mini-grafico ao lado do rationale
- [ ] Loading state com spinner centralizado
- [ ] Erro state com retry button
- [ ] Cores das grades sao acompanhadas de icone + texto (acessibilidade)

### Performance
- [ ] 200 torneios + 5k historico → endpoint p95 < 500ms
- [ ] computeTournamentScore < 2ms por torneio (benchmark unitario)
- [ ] /api/analytics/player-bundle p95 < 300ms
- [ ] Cache hit < 50ms
- [ ] /api/tournament-library com selectorScore p95 < 600ms (200 itens) — monitorar

### Telemetria (RF-07)
- [ ] Cada GET /api/tournament-selector insere row eventType="view"
- [ ] Cada add_to_grid via Selector insere row eventType="add_to_grid" com metadata
- [ ] Logs sao async — falha do INSERT NAO afeta response do endpoint
- [ ] Index (userId, createdAt DESC) presente para queries futuras de calibragem
