# Spec: Integracao com API Suprema Poker

## Status
Aprovada

## Resumo
Integrar a API publica da Suprema Poker (via pokerbyte.com.br) ao Grindfy, permitindo que jogadores importem a grade de torneios MTT do dia diretamente para o planejamento semanal (planned_tournaments) na pagina /coach (GradePlanner).

## Contexto
Atualmente o usuario cadastra torneios planejados manualmente na grade semanal, um por um. A Suprema Poker e uma das redes de poker populares no Brasil e disponibiliza uma API publica com a lista completa de torneios MTT do dia. Integrar essa API permite que o usuario importe torneios em lote, economizando tempo e reduzindo erros de digitacao.

A API pertence ao dominio pokerbyte.com.br e possui CORS restrito ao dominio supremapoker.com.br, portanto a chamada DEVE ser feita pelo backend (server-side proxy).

## Usuarios
- **Jogador (user)**: Visualiza a lista de torneios da Suprema, seleciona os desejados e importa para sua grade semanal

## Requisitos Funcionais

### RF-01: Endpoint backend de proxy para API Suprema
**Descricao:** Criar endpoint GET /api/suprema/tournaments que busca torneios da API Pokerbyte no server-side, mapeia os campos para o formato Grindfy e retorna ao frontend.

**Regras de negocio:**
- Endpoint requer autenticacao JWT (requireAuth)
- Parametro obrigatorio: `date` no formato YYYY-MM-DD (query string)
- Se `date` nao informado ou formato invalido, retornar 400 com mensagem descritiva
- Chamada ao endpoint externo: `GET https://api.pokerbyte.com.br/mtt/list/106/all/{date}/guaranteed/desc`
- Timeout da chamada externa: 10 segundos
- Se API externa retornar erro ou timeout, retornar 502 com mensagem "Nao foi possivel conectar a API da Suprema Poker. Tente novamente em alguns minutos."
- Se API externa retornar array vazio, retornar 200 com array vazio
- Cache em memoria (Map com TTL): respostas cacheadas por 1 hora, chave = data solicitada
- Rate limit dedicado: maximo 10 requests por minuto por usuario (via express-rate-limit, keyGenerator baseado em req.user.userPlatformId)

**Criterio de aceitacao:**
- [ ] GET /api/suprema/tournaments?date=2026-03-19 retorna lista de torneios mapeados
- [ ] Requisicao sem parametro date retorna 400
- [ ] Requisicao com data em formato invalido retorna 400
- [ ] Requisicao sem token JWT retorna 401
- [ ] Se API externa timeout (>10s), retorna 502
- [ ] Segunda requisicao com mesma data dentro de 1 hora usa cache (nao chama API externa novamente)
- [ ] 11a requisicao no mesmo minuto retorna 429

### RF-02: Mapeamento de campos API Pokerbyte para formato Grindfy
**Descricao:** Transformar cada objeto da resposta da API externa no formato compativel com a criacao de planned_tournaments.

**Schema da resposta da API externa (TypeScript interface):**
```typescript
interface PokerbyteTournament {
  id: number;              // ID unico do torneio na Suprema
  liga: number;            // ID da liga (106 = Suprema)
  ligaName: string;        // Nome da liga
  name: string;            // Nome do torneio
  date: string;            // Data/hora no formato ISO ou "YYYY-MM-DD HH:mm:ss"
  guaranteed: number;      // Garantido em R$
  buyin: number;           // Buy-in em R$
  late: number;            // Late registration (minutos ou flag)
  status: string;          // Status do torneio
  tournament: number;      // ID do torneio (pode diferir de id)
  moneyPrefix: string;     // Prefixo monetario (ex: "R$")
  stack: number;           // Stack inicial
  temponivelmMeta: number; // Tempo de nivel em minutos
  type: string;            // "NLH" ou "PLO5"
  maxPl: number;           // Maximo de jogadores
  isKO: number;            // 0 = nao e KO, 1 = e KO
}
```

**Mapeamento campo a campo:**

| Campo API (Pokerbyte) | Campo Grindfy (planned_tournaments) | Transformacao |
|---|---|---|
| id | externalId (campo NOVO) | `"suprema-{id}"` -- prefixado para namespace |
| name | name | Direto, sem transformacao |
| date | time | Extrair apenas HH:mm do datetime (ex: "19:00") |
| date | startTime | Converter para Date object |
| buyin | buyIn | Converter para string (decimal no schema) |
| guaranteed | guaranteed | Converter para string (decimal no schema) |
| isKO | type | 0 -> "Vanilla", 1 -> "PKO" |
| temponivelmMeta | speed | <=6 -> "Hyper", <=10 -> "Turbo", >10 -> "Normal" |
| -- | site | Fixo: "Suprema" |
| -- | profile | Usar perfil ativo do dia, ou "A" se nenhum ativo |
| -- | dayOfWeek | Derivado da data selecionada (0=domingo, 6=sabado) |
| -- | status | Fixo: "upcoming" |
| -- | prioridade | Fixo: 2 (Media) |
| stack | -- | NAO mapeado (sem campo equivalente) |
| maxPl | -- | NAO mapeado (informativo no modal, nao salvo) |
| late | -- | NAO mapeado (informativo no modal, nao salvo) |
| type (NLH/PLO5) | -- | Exibido no modal como informacao, NAO salvo em planned_tournaments |

**Regras de negocio:**
- Torneios com type "PLO5" devem ser incluidos na lista mas exibidos com badge "PLO" no modal para o usuario diferenciar de NLH
- Se temponivelmMeta for null ou 0, assumir speed "Normal"
- Se buyin for 0 ou null, exibir no modal mas com aviso visual (freeroll)
- O campo externalId usa prefixo "suprema-" para permitir futura integracao com outras redes sem colisao de IDs

**Criterio de aceitacao:**
- [ ] Torneio com isKO=0 e mapeado como type "Vanilla"
- [ ] Torneio com isKO=1 e mapeado como type "PKO"
- [ ] Torneio com temponivelmMeta=5 e mapeado como speed "Hyper"
- [ ] Torneio com temponivelmMeta=8 e mapeado como speed "Turbo"
- [ ] Torneio com temponivelmMeta=15 e mapeado como speed "Normal"
- [ ] Torneio com temponivelmMeta=0 ou null e mapeado como speed "Normal"
- [ ] Campo time extraido corretamente do datetime (ex: "2026-03-19 19:30:00" -> "19:30")
- [ ] Campo externalId gerado como "suprema-{id}"

### RF-03: Campo externalId na tabela planned_tournaments
**Descricao:** Adicionar campo opcional `externalId` (varchar, nullable, nao unico globalmente) na tabela planned_tournaments para rastrear torneios importados de fontes externas.

**Regras de negocio:**
- Campo nullable -- torneios criados manualmente continuam sem externalId (null)
- NAO e unique constraint global porque o mesmo torneio externo pode existir em dias diferentes ou para usuarios diferentes
- Usado apenas para deduplicacao dentro do escopo: mesmo usuario + mesmo dia + mesmo externalId
- Formato: "{fonte}-{id_externo}" (ex: "suprema-12345")

**Criterio de aceitacao:**
- [ ] Campo externalId adicionado ao schema Drizzle em shared/schema.ts
- [ ] Campo adicionado ao insertPlannedTournamentSchema (opcional)
- [ ] Tipo PlannedTournament inclui externalId: string | null
- [ ] Migracao aplicada sem perder dados existentes (campo nullable, sem default)
- [ ] Torneios existentes continuam funcionando com externalId = null

### RF-04: Modal de importacao no frontend (GradePlanner)
**Descricao:** Adicionar botao "Importar Suprema" na pagina GradePlanner que abre modal com lista de torneios da Suprema para selecao e importacao.

**Regras de negocio:**
- Botao "Importar Suprema" visivel no header da grade do dia selecionado
- Ao clicar, abre modal Dialog (usando Radix UI Dialog, padrao do projeto)
- Modal carrega torneios do dia selecionado via GET /api/suprema/tournaments?date={YYYY-MM-DD}
- Exibir estado de loading (spinner) durante fetch
- Se erro, exibir mensagem de erro dentro do modal com botao "Tentar Novamente"
- Lista de torneios exibida em formato tabela/lista com colunas: Horario, Nome, Buy-in, Garantido, Tipo (NLH/PLO), KO/Vanilla, Speed
- Cada torneio tem checkbox para selecao
- Botao "Selecionar Todos" / "Desmarcar Todos" no topo
- Torneios que ja existem no planejamento do dia (mesmo externalId para o usuario) aparecem desabilitados com badge "Ja importado"
- Botao "Adicionar Selecionados (N)" no footer do modal, onde N e a contagem de selecionados
- Botao desabilitado se nenhum torneio selecionado
- Ao clicar "Adicionar Selecionados", cria cada torneio via POST /api/planned-tournaments (reutilizando mutation existente)
- Apos importacao com sucesso, fechar modal e exibir toast "N torneios importados da Suprema"
- Se algum torneio falhar na criacao, exibir toast de erro com contagem de falhas mas manter os que deram certo
- O perfil (A/B/C) usado na importacao e o perfil ativo do dia selecionado; se nenhum perfil ativo, usar "A"
- O dayOfWeek e derivado da data do dia selecionado na grade

**Criterio de aceitacao:**
- [ ] Botao "Importar Suprema" aparece na interface do dia selecionado
- [ ] Modal abre e exibe loading enquanto busca torneios
- [ ] Lista de torneios exibida com todas as colunas especificadas
- [ ] Checkbox funciona para selecionar/deselecionar torneios individuais
- [ ] "Selecionar Todos" e "Desmarcar Todos" funcionam corretamente
- [ ] Torneios ja importados (mesmo externalId) aparecem desabilitados
- [ ] Botao "Adicionar Selecionados" mostra contagem correta
- [ ] Apos importacao, lista de planned_tournaments e atualizada (cache invalidado)
- [ ] Toast de sucesso exibido com contagem
- [ ] Estado de erro exibido corretamente quando API falha

### RF-05: Deduplicacao na importacao
**Descricao:** Impedir que o mesmo torneio externo seja importado duas vezes para o mesmo usuario no mesmo dia.

**Regras de negocio:**
- Antes de exibir a lista no modal, consultar planned_tournaments do usuario para o dia selecionado
- Comparar externalId dos torneios ja planejados com os retornados pela API
- Torneios com externalId ja presente no planejamento ficam desabilitados (nao selecionaveis)
- A verificacao e feita no frontend usando os dados ja carregados via GET /api/planned-tournaments (query existente)
- NAO e necessario verificacao server-side adicional -- se por algum motivo duplicar, nao causa erro funcional (apenas redundancia)

**Criterio de aceitacao:**
- [ ] Torneio importado uma vez aparece como "Ja importado" ao reabrir o modal
- [ ] Torneio "Ja importado" nao pode ser selecionado via checkbox
- [ ] "Selecionar Todos" ignora torneios ja importados
- [ ] Se nenhum torneio novo disponivel, exibir mensagem "Todos os torneios deste dia ja foram importados"

## Requisitos Nao-Funcionais
- **Performance:** Endpoint /api/suprema/tournaments deve responder em <2s no p95 (dependente da API externa; o cache garante <50ms apos primeira chamada)
- **Resiliencia:** Timeout de 10s na chamada externa. Se API fora, usuario recebe erro claro e pode continuar usando o GradePlanner normalmente (feature aditiva, nao bloqueia funcionalidade existente)
- **Cache:** TTL de 1 hora em Map em memoria. Sem persistencia -- reinicio do servidor limpa o cache (aceitavel, pois dados mudam diariamente)
- **Seguranca:** Endpoint requer JWT. Rate limit de 10 req/min por usuario impede abuso. Nenhuma credencial externa necessaria (API publica)

## Endpoints Previstos

| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| GET | /api/suprema/tournaments?date=YYYY-MM-DD | Lista torneios da Suprema Poker para a data | JWT |

## Modelos de Dados Afetados

### planned_tournaments (alteracao)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| externalId | varchar | nullable | Novo campo. Formato: "{fonte}-{id}". Null para torneios manuais |

Todos os demais campos da tabela permanecem inalterados. A importacao usa os campos existentes: userId, dayOfWeek, profile, site, time, type, speed, name, buyIn, guaranteed, status, startTime, prioridade.

### Schema Drizzle -- alteracao necessaria em shared/schema.ts
Adicionar na definicao de `plannedTournaments`:
```
externalId: varchar("external_id"),
```

Posicao: apos o campo `prioridade` e antes de `isActive`.

## Integracoes Externas

| Servico | Proposito | Quando |
|---|---|---|
| API Pokerbyte (api.pokerbyte.com.br) | Buscar lista de torneios MTT da Suprema Poker | Quando usuario clica "Importar Suprema" no GradePlanner |

**Detalhes da API externa:**
- Base URL: `https://api.pokerbyte.com.br`
- Endpoint: `GET /mtt/list/106/all/{YYYY-MM-DD}/guaranteed/desc`
- Autenticacao: Nenhuma (API publica)
- Rate limit externo: Desconhecido (respeitar com cache de 1h e rate limit proprio)
- CORS: Restrito a supremapoker.com.br (por isso chamada via backend)

## Cenarios de Teste Derivados

### Happy Path
- [ ] Usuario abre GradePlanner, seleciona dia, clica "Importar Suprema", ve lista de torneios, seleciona 5, clica "Adicionar Selecionados", 5 torneios aparecem na grade
- [ ] Segunda chamada no mesmo dia usa cache (verificavel via log ou tempo de resposta)

### Validacao de Input
- [ ] GET /api/suprema/tournaments sem parametro date retorna 400
- [ ] GET /api/suprema/tournaments?date=19-03-2026 (formato errado) retorna 400
- [ ] GET /api/suprema/tournaments?date=2026-13-45 (data invalida) retorna 400

### Regras de Negocio
- [ ] Torneio com isKO=1 importado como type "PKO"
- [ ] Torneio com isKO=0 importado como type "Vanilla"
- [ ] Torneio com temponivelmMeta=5 importado como speed "Hyper"
- [ ] Torneio com temponivelmMeta=8 importado como speed "Turbo"
- [ ] Torneio com temponivelmMeta=12 importado como speed "Normal"
- [ ] Torneio ja importado aparece desabilitado no modal
- [ ] "Selecionar Todos" nao seleciona torneios ja importados
- [ ] Perfil ativo do dia e usado na importacao; se nenhum ativo, usa "A"

### Edge Cases
- [ ] API externa retorna array vazio (dia sem torneios) -- modal exibe "Nenhum torneio encontrado para esta data"
- [ ] API externa retorna timeout (>10s) -- modal exibe erro com botao "Tentar Novamente"
- [ ] API externa retorna 500 -- endpoint retorna 502 com mensagem amigavel
- [ ] Todos os torneios do dia ja foram importados -- modal exibe "Todos os torneios ja foram importados"
- [ ] Usuario importa torneios, fecha modal, abre novamente -- torneios recém importados aparecem como "Ja importado"
- [ ] Torneio com buyin=0 (freeroll) -- exibido no modal com indicacao visual
- [ ] Campo temponivelmMeta null ou 0 -- speed mapeado como "Normal"
- [ ] Falha parcial na importacao (3 de 5 salvos) -- toast indica "3 torneios importados, 2 falharam"
- [ ] Cache expira apos 1 hora -- proxima requisicao chama API externa novamente
- [ ] Rate limit atingido (11a requisicao no minuto) -- retorna 429

## Fora de Escopo
- Importacao automatica/agendada (cron) de torneios da Suprema
- Integracao com outras redes de poker (PokerStars, GGPoker, etc.) -- apenas Suprema nesta spec
- Sincronizacao bidirecional (Grindfy nao envia dados para a API Pokerbyte)
- Armazenamento persistente da resposta da API externa (apenas cache em memoria)
- Filtros avancados no modal (por buy-in, horario, tipo) -- usuario seleciona manualmente
- Atualizacao automatica da lista quando cache expira (usuario precisa clicar novamente)
- Mapeamento do campo `type` (NLH/PLO5) para um campo em planned_tournaments -- exibido apenas como informacao no modal
- Mapeamento dos campos `stack`, `maxPl`, `late` para campos em planned_tournaments

## Dependencias
- Nenhuma feature nova precisa existir antes desta
- O campo `externalId` precisa ser adicionado ao schema e migrado antes do desenvolvimento do frontend
- A tabela `planned_tournaments` e os endpoints POST/GET ja existem e estao funcionais

## Notas de Implementacao (sugestoes para o System-Architect)

1. **Estrutura do cache:** Um `Map<string, { data: PokerbyteTournament[], timestamp: number }>` no escopo do modulo de rotas e suficiente. Antes de chamar a API externa, verificar se `Date.now() - cache.get(date).timestamp < 3600000`. Nao precisa de Redis para este volume.

2. **Rate limit dedicado:** Criar uma instancia separada de `express-rate-limit` (mesma lib ja usada no projeto) com windowMs=60000, max=10, keyGenerator baseado em `req.user.userPlatformId`. Aplicar apenas na rota /api/suprema/tournaments.

3. **Fetch no backend:** Usar `fetch` nativo do Node 20 (ja disponivel, sem necessidade de instalar node-fetch).

4. **Posicao no routes.ts:** Adicionar a rota na regiao de endpoints de grade/planejamento (proximo das rotas /api/planned-tournaments, ~linha 2515).

5. **Componente do modal:** Criar como componente separado `client/src/components/SupremaImportModal.tsx` para nao poluir o GradePlanner.tsx (que ja e grande). O GradePlanner apenas renderiza o botao e controla o estado open/close do Dialog.

6. **Site na Sidebar/Biblioteca:** Apos esta integracao, "Suprema" passara a aparecer como site nos torneios planejados. Verificar se o filtro de sites no dashboard e biblioteca reconhece automaticamente (provavelmente sim, pois filtra por valores distintos no banco).
