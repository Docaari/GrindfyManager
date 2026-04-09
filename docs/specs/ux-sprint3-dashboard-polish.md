# Spec: UX Sprint 3 — Dashboard & Data Polish

## Status
Proposta

## Resumo
Quatro melhorias focadas na experiencia de dados do Grindfy: upload com feedback visual de progresso, filtros de dashboard persistentes via URL, tabs responsivas em mobile, e sliders mentais com contexto e benchmark pessoal.

## Contexto
Sprint 3 do UX Audit Master Plan (`Docs/specs/ux-audit-master-plan.md`). Apos os quick wins do Sprint 1 e o redesign de grind do Sprint 2, este sprint endereça friccoes na experiencia de dados — upload sem feedback, filtros que resetam, tabs inacessiveis em mobile, e sliders mentais sem significado.

Duracao estimada: 5-6 dias. ICE medio: 6.5.

## Usuarios
- **Jogador (todos):** Faz upload de historicos, usa dashboard, avalia estado mental antes de sessoes
- **Jogador mobile:** Acessa dashboard pelo celular, precisa navegar entre 8 tabs de analise

---

## FP-02: Upload com Barra de Progresso

### Arquivos Afetados
- `client/src/components/FileUpload.tsx`
- `client/src/components/AutoUpload.tsx`
- `client/src/lib/queryClient.ts` (nova funcao utilitaria)

### RF-01: Barra de progresso durante upload de arquivo
**Descricao:** Substituir o spinner "Uploading..." / "Analisando arquivo..." por uma barra de progresso com informacoes contextuais.

**Regras de negocio:**
- A barra de progresso deve mostrar: nome do arquivo, tamanho formatado (KB/MB), percentual concluido (0-100%), velocidade estimada (KB/s ou MB/s)
- O percentual deve refletir o progresso REAL do upload HTTP, nao uma animacao fake
- Quando o upload terminar (100%), exibir brevemente "Processando..." enquanto o servidor faz o parsing (nao ha como trackear progresso server-side)
- Se o upload falhar, a barra deve mudar para estado de erro (vermelho) com a mensagem de erro

**Decisao tecnica — XMLHttpRequest vs fetch:**
- A funcao `apiRequest` em `queryClient.ts` usa `fetch()`, que NAO suporta `upload.onprogress`
- Criar uma funcao utilitaria separada `uploadWithProgress()` que usa `XMLHttpRequest` com `xhr.upload.onprogress`
- Esta funcao deve incluir: CSRF token (via `getCsrfToken()`), credentials (cookies), tratamento de 401 com refresh token
- NAO alterar a funcao `apiRequest` existente — a nova funcao e especifica para uploads

**Criterio de aceitacao:**
- [ ] Barra de progresso aparece ao iniciar upload com percentual real (0% a 100%)
- [ ] Nome do arquivo e tamanho sao exibidos durante o upload
- [ ] Velocidade estimada e exibida (ex: "1.2 MB/s")
- [ ] Apos 100%, exibe "Processando dados..." ate a resposta do servidor
- [ ] Em caso de erro, barra muda para vermelho com mensagem
- [ ] Botao de cancelar upload disponivel durante o progresso (via `xhr.abort()`)
- [ ] Funciona em ambos os componentes: `FileUpload.tsx` e `AutoUpload.tsx`

### RF-02: Funcao utilitaria de upload com progresso
**Descricao:** Nova funcao em `queryClient.ts` que encapsula XMLHttpRequest com suporte a progresso.

**Interface sugerida:**
```typescript
interface UploadProgress {
  loaded: number;      // bytes enviados
  total: number;       // bytes totais
  percentage: number;  // 0-100
  speed: number;       // bytes/segundo
}

function uploadWithProgress(
  url: string,
  formData: FormData,
  onProgress: (progress: UploadProgress) => void,
  signal?: AbortSignal
): Promise<any>;
```

**Regras de negocio:**
- Deve incluir header `X-CSRF-Token` se token disponivel
- Deve enviar `credentials: include` (withCredentials = true no XHR)
- Deve calcular velocidade como media movel dos ultimos 3 segundos (nao instantanea, pois oscila demais)
- Em caso de 401, deve tentar refresh token uma vez e re-enviar (mesma logica do `apiRequest`)
- Deve respeitar `AbortSignal` para cancelamento

**Criterio de aceitacao:**
- [ ] Funcao retorna Promise que resolve com dados JSON da resposta
- [ ] Callback `onProgress` e chamado multiplas vezes durante o upload
- [ ] CSRF token e incluido automaticamente
- [ ] Cancelamento via AbortSignal funciona corretamente
- [ ] Erro de rede resulta em rejeicao da Promise com mensagem clara

---

## FP-11: Filtros do Dashboard Persistentes via URL

### Arquivos Afetados
- `client/src/pages/Dashboard.tsx`
- `client/src/components/dashboard/DashboardFilters.tsx`
- `client/src/components/dashboard/types.ts` (possivelmente)

### RF-03: Serializar estado dos filtros na URL
**Descricao:** Ao alterar qualquer filtro do dashboard, atualizar os search params da URL para refletir o estado atual. Ao montar o componente, carregar filtros da URL.

**Contexto tecnico — Wouter:**
- Wouter NAO tem `useSearchParams` nativo (diferente de react-router)
- O codebase ja usa `window.location.search` com `URLSearchParams` em `VerifyEmailPage.tsx`, `RegistrationConfirmationPage.tsx` e `Subscriptions.tsx`
- Abordagem recomendada: criar hook `useSearchParams()` customizado que:
  1. Le params com `new URLSearchParams(window.location.search)` no mount
  2. Escreve params com `window.history.replaceState()` (NAO pushState, para nao poluir historico)
  3. NAO precisa ouvir `popstate` — o dashboard e uma pagina unica, nao tem sub-rotas

**Mapeamento de filtros para URL params:**

| Estado | URL Param | Formato | Exemplo |
|--------|-----------|---------|---------|
| `period` | `period` | string | `?period=last_3_months` |
| `activeTab` | `tab` | string | `&tab=por-site` |
| `filters.sites` | `sites` | comma-separated | `&sites=GGPoker,PokerStars` |
| `filters.categories` | `categories` | comma-separated | `&categories=PKO,Vanilla` |
| `filters.speeds` | `speeds` | comma-separated | `&speeds=Regular,Turbo` |
| `filters.keyword` | `keyword` | string | `&keyword=Sunday` |
| `filters.keywordType` | `keywordType` | string | `&keywordType=contains` |
| `filters.dateFrom` | `dateFrom` | ISO date | `&dateFrom=2026-01-01` |
| `filters.dateTo` | `dateTo` | ISO date | `&dateTo=2026-03-31` |
| `filters.participantMin` | `pMin` | number | `&pMin=100` |
| `filters.participantMax` | `pMax` | number | `&pMax=1500` |

**Regras de negocio:**
- Params com valor default ou vazio NAO devem aparecer na URL (URL limpa por padrao)
- Valores default: `period=all`, `tab=evolution`, demais filtros vazios
- Ao navegar para outra pagina e voltar ao dashboard, os filtros devem ser restaurados da URL
- Ao compartilhar a URL, o destinatario vera os mesmos filtros aplicados (desde que tenha acesso)
- Se um param da URL for invalido (ex: `tab=inexistente`), ignorar e usar default
- Arrays vazios (`sites=`) devem ser ignorados (tratados como "sem filtro")

**Criterio de aceitacao:**
- [ ] URL atualiza ao mudar period (ex: `?period=last_3_months`)
- [ ] URL atualiza ao mudar tab ativa (ex: `&tab=por-site`)
- [ ] URL atualiza ao selecionar filtros de site, categoria, velocidade
- [ ] URL atualiza ao aplicar filtro de keyword e participantes
- [ ] URL atualiza ao selecionar date range customizado
- [ ] Ao carregar pagina com params na URL, filtros sao restaurados corretamente
- [ ] URL sem params carrega dashboard com defaults (period=all, tab=evolution)
- [ ] `replaceState` e usado (nao `pushState`) para nao poluir historico do browser
- [ ] Botao "Limpar Todos" remove todos os params da URL
- [ ] Param invalido na URL e ignorado silenciosamente

---

## FP-12: Tabs do Dashboard Responsivas em Mobile

### Arquivos Afetados
- `client/src/components/dashboard/DashboardTabs.tsx`

### RF-04: Tabs com scroll horizontal e indicadores em mobile
**Descricao:** Em telas menores que 768px, as 8 tabs do dashboard devem ser navegaveis via scroll horizontal com indicadores visuais de que ha mais conteudo.

**Decisao de design — Scroll horizontal vs Dropdown:**
- Dropdown "Mais..." esconderia tabs e reduziria discoverability
- ScrollArea horizontal com indicadores de fade nas bordas e mais natural em mobile
- Manter as 8 tabs visiveis, mas com scroll suave

**Regras de negocio:**
- Em desktop (>= 768px): manter layout atual (`flex flex-wrap gap-4`)
- Em mobile (< 768px):
  - Container com `overflow-x: auto` e scroll suave
  - Tabs em `flex-nowrap` sem quebra de linha
  - Tabs compactas: remover emoji, reduzir padding, texto menor
  - Fade gradient nas bordas esquerda/direita indicando mais conteudo
  - Fade esquerdo aparece somente quando scroll > 0
  - Fade direito desaparece quando scroll atinge o fim
  - Ao clicar em uma tab, fazer auto-scroll para centraliza-la no viewport
- A tab ativa deve ser visivel (scroll automatico para ela no mount)

**Criterio de aceitacao:**
- [ ] Em desktop (>= 768px), comportamento identico ao atual
- [ ] Em mobile (< 768px), tabs exibem scroll horizontal
- [ ] Indicadores de fade aparecem/desaparecem conforme posicao do scroll
- [ ] Tabs compactas em mobile (sem emoji, padding reduzido)
- [ ] Tab ativa e scrollada para visibilidade no mount
- [ ] Clicar em tab faz auto-scroll suave para centraliza-la
- [ ] Nao ha barra de scrollbar visivel (estilizar com CSS `scrollbar-width: none` / `::-webkit-scrollbar`)

---

## FP-14: Sliders Mentais com Contexto e Benchmark

### Arquivos Afetados
- `client/src/components/MentalSlider.tsx` (componente do slider)
- `client/src/components/mental-prep/MentalStateCard.tsx` (card que renderiza os 4 sliders)
- `client/src/pages/MentalPrep.tsx` (pagina que monta o card)

### RF-05: Labels descritivos nos extremos de cada slider
**Descricao:** Adicionar labels textuais nos extremos (min e max) de cada slider para dar significado a escala numerica.

**Labels por slider:**

| Slider | Min (1) | Max (10) |
|--------|---------|----------|
| Energia | "Esgotado" | "Eletrico" |
| Foco | "Disperso" | "Laser Focus" |
| Confianca | "Inseguro" | "Inabalavel" |
| Equilibrio | "Instavel" | "Zen" |

**Regras de negocio:**
- Labels aparecem abaixo do slider, alinhados com os extremos (esquerda/direita)
- Labels sao fixos e sempre visiveis (nao apenas no hover)
- O feedback textual existente no centro ("Muito baixo", "Medio", "Bom", etc.) deve ser MANTIDO — os labels de extremo sao adicionais
- Em mobile, labels podem ter fonte menor (text-[10px]) para nao causar overflow

**Criterio de aceitacao:**
- [ ] Cada slider exibe label no extremo esquerdo (valor 1)
- [ ] Cada slider exibe label no extremo direito (valor 10)
- [ ] Labels sao diferentes para cada slider (Energia, Foco, Confianca, Equilibrio)
- [ ] Feedback textual central ("Muito baixo"..."Excelente") permanece funcionando
- [ ] Layout nao quebra em mobile

### RF-06: Benchmark pessoal (media historica) em cada slider
**Descricao:** Mostrar a media historica do usuario em cada dimensao mental como referencia visual no slider.

**Fonte de dados:**
- Tabela `preparation_logs`: campos `mental_state` (energia geral), `focus_level`, `confidence_level`
  - Nota: `preparation_logs` nao tem campo separado para "equilibrio" — usar a media dos 3 campos como proxy, ou omitir benchmark para equilibrio
- Tabela `break_feedbacks`: campos `foco`, `energia`, `confianca`, `inteligencia_emocional` (equivale a equilibrio)
  - Dados mais granulares e frequentes (coletados durante breaks)
- **Decisao:** Usar `break_feedbacks` como fonte primaria (mais dados). Fazer fallback para `preparation_logs` se nao houver break feedbacks.

**Regras de negocio:**
- Exibir texto "Sua media: X.X" abaixo do label do slider (proximo ao valor numerico)
- Valor arredondado para 1 casa decimal
- Se o usuario nao tem dados historicos (nenhum break feedback nem preparation log), NAO mostrar benchmark — exibir apenas os sliders normais
- Minimo de 3 registros para mostrar benchmark (com menos dados, a media nao e significativa)
- A media deve considerar TODOS os registros historicos do usuario (nao apenas ultimos 30 dias)
- Cor da media: cinza claro (text-gray-400) para nao competir visualmente com o valor atual

**Mapeamento de campos break_feedbacks -> sliders:**

| Slider | Campo break_feedbacks | Campo preparation_logs (fallback) |
|--------|----------------------|-----------------------------------|
| Energia | `energia` | `mental_state` |
| Foco | `foco` | `focus_level` |
| Confianca | `confianca` | `confidence_level` |
| Equilibrio | `inteligencia_emocional` | media de (`mental_state` + `focus_level` + `confidence_level`) / 3 |

**Endpoint necessario:**
- Novo endpoint ou extensao de endpoint existente: `GET /api/mental-averages`
- Resposta: `{ energia: number | null, foco: number | null, confianca: number | null, equilibrio: number | null }`
- Valores `null` indicam dados insuficientes (< 3 registros)
- O endpoint deve calcular a media no servidor (nao enviar todos os registros para o client calcular)

**Criterio de aceitacao:**
- [ ] "Sua media: X.X" aparece no slider quando usuario tem >= 3 registros de break feedback
- [ ] Media nao aparece para usuarios sem historico ou com < 3 registros
- [ ] Media e calculada no servidor via novo endpoint
- [ ] Valores sao arredondados para 1 casa decimal
- [ ] Estilo discreto (text-gray-400) nao compete com valor atual do slider

### RF-07: Tooltip com descricao de niveis (opcional, baixa prioridade)
**Descricao:** Ao passar o mouse sobre o slider (ou long press em mobile), mostrar tooltip com descricao do nivel atual.

**Niveis sugeridos (exemplo para Foco):**
- 1-2: "Voce esta com dificuldade para manter atencao. Considere exercicios de respiracao."
- 3-4: "Atencao flutuante. Pode jogar, mas cuidado com decisoes automaticas."
- 5-6: "Foco adequado para sessoes de rotina."
- 7-8: "Boa concentracao. Aproveite para sessoes mais longas ou stakes maiores."
- 9-10: "Estado de flow. Momento ideal para grind intenso."

**Regras de negocio:**
- Tooltip aparece no hover do area do slider (desktop) ou long press (mobile)
- Conteudo muda dinamicamente conforme o valor atual
- Cada slider (Energia, Foco, Confianca, Equilibrio) tem textos proprios
- Se RF-07 atrasar o sprint, pode ser movido para sprint futuro — RF-05 e RF-06 sao prioridade

**Criterio de aceitacao:**
- [ ] Tooltip aparece ao hover sobre o slider
- [ ] Conteudo do tooltip muda conforme valor selecionado
- [ ] Tooltip funciona em mobile (long press ou tap no icone de info)
- [ ] Cada dimensao (Energia, Foco, Confianca, Equilibrio) tem textos unicos

---

## Requisitos Nao-Funcionais

- **Performance (FP-02):** Barra de progresso deve atualizar com frequencia minima de 250ms e maxima de 100ms (throttle se necessario para nao causar re-renders excessivos)
- **Performance (FP-11):** `replaceState` nao deve causar re-render — usar ref ou callback para sincronizar, nao useEffect que re-renderiza em loop
- **Performance (FP-14):** Endpoint `/api/mental-averages` deve responder em < 100ms (query simples com AVG)
- **Acessibilidade (FP-12):** Tabs em mobile devem ser navegaveis por swipe e keyboard (arrow keys)
- **Acessibilidade (FP-14):** Labels de extremo devem ter `aria-label` para screen readers
- **Compatibilidade (FP-02):** XMLHttpRequest e suportado em todos os browsers modernos — nao ha risco de compatibilidade

---

## Endpoints Previstos

| Metodo | Rota | Descricao | Auth | Novo? |
|--------|------|-----------|------|-------|
| GET | `/api/mental-averages` | Medias historicas de estado mental do usuario | JWT | Sim |

### GET /api/mental-averages — Detalhamento

**Request:** Nenhum parametro. Usa `userId` do token JWT.

**Response (200):**
```json
{
  "energia": 6.8,
  "foco": 7.2,
  "confianca": 5.9,
  "equilibrio": 6.3,
  "totalRecords": 42,
  "source": "break_feedbacks"
}
```

**Response quando dados insuficientes (200):**
```json
{
  "energia": null,
  "foco": null,
  "confianca": null,
  "equilibrio": null,
  "totalRecords": 1,
  "source": null
}
```

**Logica:**
1. Buscar count de `break_feedbacks` do usuario
2. Se >= 3 registros: calcular AVG de cada campo, retornar com `source: "break_feedbacks"`
3. Se < 3 break feedbacks: buscar count de `preparation_logs`
4. Se >= 3 prep logs: calcular AVG com mapeamento de campos, retornar com `source: "preparation_logs"`
5. Se ambos < 3: retornar nulls com `source: null`

---

## Modelos de Dados Afetados

Nenhum modelo novo ou alterado. Consultas apenas leitura nas tabelas existentes:

- `break_feedbacks` (leitura — AVG de campos mentais)
- `preparation_logs` (leitura — fallback para AVG)

---

## Integracoes Externas

Nenhuma.

---

## Cenarios de Teste Derivados

### FP-02 — Upload com Progresso

#### Happy Path
- [ ] Upload de arquivo pequeno (< 100KB): barra vai de 0% a 100% rapidamente, exibe "Processando..."
- [ ] Upload de arquivo grande (5MB+): barra avanca progressivamente com velocidade estimada
- [ ] Upload concluido com sucesso: barra desaparece apos resposta do servidor

#### Validacao de Input
- [ ] Arquivo maior que maxSize: erro de validacao ANTES do upload (sem barra de progresso)
- [ ] Arquivo com extensao invalida: erro de validacao ANTES do upload

#### Edge Cases
- [ ] Cancelamento durante upload: `xhr.abort()` interrompe transferencia, UI volta ao estado inicial
- [ ] Erro de rede durante upload: barra muda para vermelho, mensagem de erro exibida
- [ ] Upload com resposta 401: tenta refresh token, re-envia upload se refresh OK
- [ ] Upload de arquivo de 0 bytes: validacao no client impede envio (ou servidor rejeita)
- [ ] Multiplos uploads consecutivos: cada um reseta a barra corretamente

### FP-11 — Filtros Persistentes

#### Happy Path
- [ ] Selecionar period "last_3_months" → URL contem `?period=last_3_months`
- [ ] Selecionar tab "por-site" → URL contem `&tab=por-site`
- [ ] Selecionar site "GGPoker" → URL contem `&sites=GGPoker`
- [ ] Navegar para outra pagina e voltar → filtros restaurados da URL
- [ ] Abrir URL com params `?period=last_6_months&tab=por-abi&sites=PokerStars` → dashboard carrega com esses filtros

#### Validacao de Input
- [ ] URL com `tab=invalido` → ignora, usa default "evolution"
- [ ] URL com `period=xyz` → ignora, usa default "all"
- [ ] URL com `sites=` (vazio) → ignora, sem filtro de site
- [ ] URL com `pMin=abc` (nao numerico) → ignora

#### Edge Cases
- [ ] Limpar todos os filtros → URL volta para path sem params
- [ ] Filtro de date range customizado → `dateFrom` e `dateTo` na URL
- [ ] Multiplos sites selecionados → `sites=GGPoker,PokerStars,888poker`
- [ ] Browser back/forward → NAO deve criar entradas extras no historico (replaceState)

### FP-12 — Tabs Mobile

#### Happy Path
- [ ] Em desktop (>= 768px): layout identico ao atual, nenhuma mudanca visual
- [ ] Em mobile (< 768px): tabs em scroll horizontal sem quebra de linha
- [ ] Scroll para direita revela tabs escondidas
- [ ] Clicar em tab a direita faz auto-scroll para ela

#### Edge Cases
- [ ] Resize de janela de desktop para mobile: transicao suave
- [ ] Tab ativa e a ultima (Posicao): deve ser scrollada para visibilidade no mount
- [ ] Carregar pagina com `?tab=por-posicao` em mobile: tab deve ser auto-scrollada

### FP-14 — Sliders com Contexto

#### Happy Path
- [ ] Slider de Foco exibe "Disperso" a esquerda e "Laser Focus" a direita
- [ ] Usuario com 10 break feedbacks: "Sua media: 7.2" aparece no slider de Foco
- [ ] Slider funciona normalmente (drag, click, keyboard) com labels adicionais

#### Validacao de Input
- [ ] Endpoint `/api/mental-averages` retorna null para usuario sem dados
- [ ] Endpoint retorna null quando total < 3 registros

#### Edge Cases
- [ ] Usuario com break_feedbacks mas sem preparation_logs: usa break_feedbacks
- [ ] Usuario sem break_feedbacks mas com 5 preparation_logs: usa preparation_logs (fallback)
- [ ] Usuario com 2 break_feedbacks e 4 preparation_logs: usa preparation_logs (break < 3)
- [ ] Todos os valores historicos sao 10: media = 10.0
- [ ] Valores mistos extremos (muitos 1 e muitos 10): media correta com 1 decimal
- [ ] Labels de extremo em mobile: texto visivel sem overflow

---

## Fora de Escopo

- **Upload multi-arquivo simultaneo:** Apenas um arquivo por vez (comportamento atual mantido)
- **Progresso server-side:** Nao ha tracking do parsing do CSV no servidor — apenas progresso do upload HTTP
- **Persistencia de filtros em localStorage:** Somente URL params. Sem fallback para localStorage
- **Historico de filtros (undo/redo):** Nao implementar
- **Sincronizacao de filtros entre abas do browser:** Cada aba tem sua URL independente
- **Export de URL com filtros (botao "Compartilhar"):** Nao implementar — a URL ja e compartilhavel
- **Tabs em dropdown no mobile:** Descartado em favor de scroll horizontal (melhor discoverability)
- **Tooltip de niveis (RF-07):** Pode ser adiado se atrasar o sprint — classificado como baixa prioridade dentro do FP-14
- **Redesign visual dos sliders:** Manter visual atual, apenas adicionar labels e benchmark
- **Benchmark visual no slider (marcador na track):** Apenas texto, nao marcador visual na barra

---

## Dependencias

- **FP-02:** Nenhuma dependencia. Pode ser implementado independentemente.
- **FP-11:** Nenhuma dependencia tecnica. Usa Wouter (`useLocation`) ja presente no Dashboard.
- **FP-12:** Nenhuma dependencia. Componente `DashboardTabs.tsx` e isolado.
- **FP-14:** Depende de novo endpoint `GET /api/mental-averages` no backend. O endpoint e simples (AVG query) e pode ser implementado junto com o frontend.

Nao ha dependencia entre os 4 fixes — podem ser implementados em paralelo ou em qualquer ordem.

---

## Notas de Implementacao

### FP-02
- A funcao `uploadWithProgress` deve ser testavel isoladamente (injetar XHR se necessario para testes unitarios)
- Considerar throttle do callback `onProgress` para evitar re-renders a cada byte (50-100ms de intervalo)
- O componente `AutoUpload` tem 2 fases de upload (analise de duplicatas + upload final) — ambas devem ter barra de progresso

### FP-11
- Cuidado com loop infinito: `setFilters` → atualiza URL → dispara efeito → le URL → `setFilters`... Usar flag para distinguir mudanca do usuario vs mudanca da URL
- O hook `useSearchParams` customizado deve ser reutilizavel (pode servir para outras paginas no futuro)
- Sugestao: inicializar estado dos filtros a partir da URL no `useState` inicial (lazy init), nao em useEffect

### FP-12
- O componente `DashboardTabs.tsx` atualmente usa `flex flex-wrap gap-4` — em mobile, trocar para `flex-nowrap overflow-x-auto`
- Usar `scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })` para auto-scroll
- Esconder scrollbar: `scrollbar-width: none` (Firefox) + `::-webkit-scrollbar { display: none }` (Chrome/Safari)
- Detectar posicao de scroll com `onScroll` para controlar visibilidade dos fades

### FP-14
- O `MentalSlider` e um componente generico — os labels de extremo devem ser passados como props (nao hardcoded)
- Sugerir props: `minLabel?: string`, `maxLabel?: string`, `benchmark?: number | null`
- O `MentalStateCard` e quem deve conhecer os labels e passar para cada slider
- Query do benchmark: usar React Query com `staleTime` alto (10 min+) — dados historicos mudam raramente
