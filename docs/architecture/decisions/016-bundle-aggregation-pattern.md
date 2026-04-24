# ADR-016: Endpoint agregado `/api/analytics/player-bundle` em vez de 7 chamadas paralelas pelo cliente

## Status
Aceito

## Data
2026-04-23

## Contexto

A feature Tournament Selector (Sprint 1) precisa, para scorar cada torneio, do ROI do jogador em 7 dimensoes: site, buy-in, categoria, velocidade, dia da semana, horario, field size. Essas metricas ja estao disponiveis em endpoints separados:

```
GET /api/analytics/by-site
GET /api/analytics/by-buyin
GET /api/analytics/by-category
GET /api/analytics/by-speed
GET /api/analytics/by-day
GET /api/analytics/by-field
GET /api/analytics/by-time-of-day   (novo — RF-06)
```

Dois pontos consomem esse "bundle":
1. **Endpoint `/api/tournament-selector`** (servidor): orquestra + scoring + cache de 30min do resultado final.
2. **Widget no `/coach`** (cliente): pode precisar exibir metricas agregadas em banner, filtros adaptativos, modal de detalhes.

A pergunta: como o cliente/servidor obtem essas 7 metricas? Chamadas paralelas diretas, endpoint agregado dedicado, ou hibrido?

### Contexto tecnico observado
- O projeto ja tem pattern similar com `tournament-library` — endpoint retorna dados de varias fontes num payload unico.
- Servidor esta hospedado em Render (regiao provavelmente US), usuarios em sua maioria no Brasil. Latencia de round-trip tipica: 150-250ms por request.
- Client usa TanStack Query com cache local — cache hit no cliente evita fetch.
- TLS handshake + request overhead: cada fetch separado custa ~30-50ms adicionais mesmo em paralelo.
- Servidor precisa do bundle **completo** no scorer. Nao tem como scorar com bundle parcial.

## Opcoes Consideradas

### Opcao A: Cliente faz 7 fetch() paralelos, servidor (endpoint selector) faz 7 queries paralelas ao banco

Cada endpoint existente permanece. O endpoint selector faz `Promise.all` das 7 queries. O cliente faz `Promise.all` dos 7 fetches quando precisa das metricas isoladamente.

- **Pros:**
  - Zero mudanca de API. Endpoints existentes sao reutilizados.
  - Cada dimensao pode ser cacheada independentemente.
  - Cliente que so precisa de 1 dimensao paga custo de 1 request.

- **Contras:**
  - **7 round-trips de rede do cliente ao servidor quando precisa do conjunto.** No mobile brasileiro, 7 x 200ms = 1.4s so de latencia, mesmo em paralelo (navegadores limitam conexoes simultaneas, HTTP/2 ajuda mas nao elimina overhead de parsing/serializacao).
  - **7 auths separadas.** JWT decode e middleware rodam 7 vezes. Custo CPU multiplicado.
  - **7 respostas com overhead de envelope.** Headers HTTP + JSON framing somam bytes nao-triviais.
  - **Cache distribuido.** 7 entradas no TanStack Query por jogador. Invalidacao coordenada em upload fica chata (ter que invalidar 7 keys).
  - **Nao resolve scoring no servidor.** Endpoint selector ainda precisa chamar as 7 queries internas — paralelismo interno sim, mas sem cache compartilhado entre selector e library e coach.
  - **Duplica latencia se /api/tournament-library tambem precisar do bundle.** RF-05 exige scoring na library — essa rota tambem precisaria carregar bundle do jogador. Se bundle nao e endpoint propio, duas rotas farao 7 queries duplicadas.

### Opcao B: Endpoint agregado `/api/analytics/player-bundle` (ESCOLHIDA)

Novo endpoint retorna as 7 dimensoes num unico payload. Cliente chama 1 vez. Servidor tambem usa internamente (servico `playerBundle.ts` com cache TTL 5min por usuario).

```
GET /api/analytics/player-bundle?lookbackDays=180
  -> { totalTournaments, lookbackTournaments, overallRoi, bySite, byBuyIn, byCategory, bySpeed, byDayOfWeek, byTimeOfDay, byField }
```

Servico interno `playerBundle.getOrLoad(userId, lookbackDays)` e compartilhado entre `/api/tournament-selector`, `/api/tournament-library` (para RF-05), e cliente via endpoint REST.

- **Pros:**
  - **Um round-trip em vez de sete.** No mobile BR: ~200ms vs 1.4s. Diferenca perceptivel mesmo em HTTP/2.
  - **Um auth, uma validacao, um overhead de envelope.**
  - **Cache unico compartilhado entre consumidores internos.** Selector, library-com-score, e widget de coach leem da mesma `Map em memoria`. Invalidacao em upload e uma operacao, nao sete.
  - **Cache TTL 5min com invalidacao em upload** atende requisito de frescor sem overfetching.
  - **Compression HTTP mais eficaz.** Gzip de um JSON grande comprime melhor que 7 JSONs pequenos (redundancia de structural metadata).
  - **Reuso em outros consumidores futuros.** AI Coach, dashboards complementares, exportacao de dados — todos reutilizam o bundle.
  - **Pattern ja estabelecido no projeto.** `tournament-library` ja retorna dados agregados. Seguir o mesmo padrao mantem coerencia arquitetural.
  - **Normalizacao de moeda num ponto unico.** BuyIn normalizado para USD uma vez no servico, nao 7 vezes.

- **Contras:**
  - **Cliente que so precisa de 1 dimensao paga payload inteiro.** Pequena perda — o payload completo ainda e leve (~10-20KB comprimido).
  - **Novo endpoint para documentar, testar, monitorar.** Custo pequeno.
  - **Cache stale mais custoso.** Se precisarmos de frescor diferente por dimensao, TTL unico e menos flexivel. Na pratica, todas as 7 dimensoes derivam do mesmo dataset (`tournaments` do user), entao invalidam juntas naturalmente.

### Opcao C: GraphQL ou endpoint customizavel via query param

`GET /api/analytics/player-bundle?dimensions=site,buyin,category` retorna so as dimensoes pedidas.

- **Pros:**
  - Flexibilidade para consumidores com necessidades diferentes.

- **Contras:**
  - **Complexidade de cache combinatoria.** (userId, lookbackDays, conjunto de dimensoes) = muitas keys possiveis. Cache hit rate despenca.
  - **GraphQL nao esta no stack.** Adicionar biblioteca + esquema + validacao e overhead grande para o ganho.
  - **Consumo atual e uniforme.** Todos os 3 consumidores (selector, library-score, widget) precisam das 7 dimensoes. Nao ha caso real de "so precisa de 2".
  - **Over-engineering.** Resolve problema que nao temos.

### Opcao D: Servidor apenas (sem expor endpoint ao cliente)

Servico interno `playerBundle` e consumido apenas pelo `/api/tournament-selector` e `/api/tournament-library`. Cliente nao precisa acessar bundle diretamente.

- **Pros:**
  - Superficie de API menor.
  - Cliente nunca ve payload completo.

- **Contras:**
  - **RF-04 pode precisar exibir metricas agregadas no widget** (banner "seu ROI geral: 12%", filtros adaptativos tipo "voce nunca jogou PKO — o filtro por categoria esta limitado"). Isso exigiria adicionar campos ao response do selector ou criar endpoint depois mesmo assim.
  - **Componentes do frontend reutilizaveis sofrem.** `usePlayerBundle` e um hook util para outras telas futuras (dashboard, studies, etc.) — expor endpoint habilita reuso.
  - **Coesao ruim.** "Servico interno invisivel" vira debuga dificil (precisamos de endpoint de introspeccao se algo nao bater).

## Decisao

**Adotar Opcao B: Endpoint agregado `/api/analytics/player-bundle` com servico compartilhado `server/services/playerBundle.ts`.**

### Detalhes de implementacao

1. **Servico `playerBundle.ts`:**
   - Funcao `getOrLoad(userId: string, lookbackDays: number): Promise<PlayerAnalyticsBundle>`
   - Cache Map em memoria com chave `${userId}:${lookbackDays}`, TTL 5min.
   - Internamente: `Promise.all` das 7 queries (incluindo `getAnalyticsByTimeOfDay`, novo).
   - Expoe `invalidate(userId: string)` — remove todas as entradas do Map cuja chave comeca com `${userId}:`.

2. **Endpoint REST `GET /api/analytics/player-bundle`:**
   - Requer `requireAuth` (JWT).
   - Chama `playerBundle.getOrLoad(userId, lookbackDays)`.
   - Response inclui `cacheHit: boolean` para observabilidade.

3. **Invalidacao em upload:**
   - `routes/upload.ts` chama `playerBundle.invalidate(userId)` apos commit do batch.
   - Pattern: injecao simples do servico no handler. Sem event emitter (questao aberta Q3 no indice).

4. **Consumidores:**
   - `routes/tournament-selector.ts` chama `playerBundle.getOrLoad` diretamente (sem ir via fetch HTTP).
   - `routes/tournament-library.ts` (modificado para RF-05) chama o mesmo servico.
   - Cliente (`hooks/usePlayerBundle.ts`) usa TanStack Query com cache local de 5min matching o servidor.

5. **Endpoints legacy permanecem:**
   - `/api/analytics/by-site`, `/api/analytics/by-buyin`, etc. continuam funcionando.
   - Consumidores atuais (Dashboard v1) nao quebram.
   - Podemos deprecar em Sprint futuro se todos migrarem para bundle.

## Consequencias

### Positivas
- **Performance:** p95 do `/api/tournament-selector` cai ~800ms -> ~350ms (elimina 6 round-trips internos implicitos).
- **Cache compartilhado:** RF-05 (score na library) reusa bundle sem recomputar queries.
- **Invalidacao simplificada:** 1 chamada em upload; antes seriam 7.
- **Reuso futuro:** Hook `usePlayerBundle` util para dashboards, studies, onboarding analytics.
- **Normalizacao monetaria centralizada:** BuyIn converte para USD num ponto so, nao em cada query.
- **Coerente com o padrao `tournament-library`:** time nao precisa aprender abordagem nova.

### Negativas
- **Payload unico maior.** Cliente que so precisa de "byBuyIn" paga JSON completo. Mitigacao: payload estimado em 10-20KB comprimido e aceitavel.
- **TTL unico para todas as dimensoes.** Nao podemos ter "byBuyIn fresco de 1min e bySite stale de 1h". Na pratica, todas derivam do mesmo dataset — invalidam juntas.
- **Novo endpoint para monitorar.** Adicionar ao painel de observabilidade.

### Neutras
- **Cache Map em memoria, nao Redis.** MVP acomoda facil. Quando horizontal scaling entrar (multi-instancia no Render), migrar para Redis. ADR futuro cobre. Hoje o monolito roda em instancia unica — nao e problema.
- **Endpoints legacy permanecem.** Decisao de deprecar fica para outro momento — quando metrica de uso mostrar <5% dos requests.

## Riscos e mitigacao

| Risco | Mitigacao |
|---|---|
| Bundle fica pesado demais para jogadores com muitas dimensoes cheias | Payload estimado <30KB comprimido mesmo em pior caso. Monitorar. Se crescer, considerar compressao diferenciada ou paginacao por dimensao. |
| Cache Map cresce indefinidamente se muitos usuarios | Implementar LRU cap (ex: max 10k entries). TTL de 5min ja limita crescimento. |
| Servico invalidacao em upload falha silenciosamente | Log explicito no upload handler se `invalidate` throw. Adicionar testes integrados. |
| Futuro scaling horizontal quebra cache local | Migrar para Redis. ADR futuro. Nao bloqueia MVP. |

## Confianca

**Alta.** Padrao identico ja usado em `tournament-library` sem problemas. Ganho de performance mensuravel, custo de manutencao baixo. Caminho de evolucao (Redis quando escalar) esta claro.

## Referencias

- Spec: `docs/specs/tournament-selector.md` (RF-03)
- ADR-015: decisoes de scoring linear — consome o bundle que este ADR define.
- ADR-012: estrategia de cache do Suprema — mesmo pattern de Map em memoria com TTL.
- Pattern referencia: `tournament-library` response inclui dados agregados de varias fontes.
