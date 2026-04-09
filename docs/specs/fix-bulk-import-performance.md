# Fix: Importacao de CSV com grande volume (18K+ torneios) falha por timeout

## Status
Aprovada

## Comportamento Atual (bugado)

Ao importar um CSV SharkScope com 18.614 torneios (~3MB), a importacao falha silenciosamente (timeout HTTP). O fluxo atual:

1. `parseCSV()` faz streaming do CSV e parseia todas as linhas em memoria — **funciona OK**
2. `parseCSVWithDuplicateCheck()` executa `isDuplicateTournament()` **1 query por torneio** em loop sequencial (`server/csvParser.ts:1811`) — **18.614 queries sequenciais**
3. Se nao ha duplicatas, `upload.ts:204` executa `createTournament()` **1 insert por torneio** em loop sequencial — **mais 18.614 queries**
4. Total: **~37.000 queries sequenciais ao banco**. A ~50ms/query no Neon serverless = **~30 minutos**
5. O request HTTP faz timeout (~2 minutos) bem antes de completar

**Endpoint afetado:** `POST /api/upload-history`
**Arquivo de entrada:** CSV SharkScope com headers em portugues, 18.614 linhas, ~3MB
**Input que causa o bug:** Qualquer CSV com mais de ~2.000 torneios

## Comportamento Esperado (correto)

- Importacao de 18.614 torneios deve completar em **menos de 60 segundos**
- O usuario deve receber feedback de progresso durante a importacao
- Checagem de duplicatas deve ser feita em batch (poucos queries, nao N queries)
- Insercao de torneios deve ser feita em batch (poucos queries, nao N queries)
- Arquivos com ate 50.000 torneios devem ser suportados

## Como Reproduzir
1. Fazer login no Grindfy
2. Ir para a pagina de Upload
3. Selecionar o arquivo `Zigurats-Player Group-tournaments (1).csv` (18.614 torneios, formato SharkScope PT-BR)
4. Clicar em importar
5. **Resultado:** Request faz timeout, nenhum torneio e importado
6. **Esperado:** Todos os torneios sao importados com feedback de progresso

## Causa Raiz

### Problema 1: N+1 queries na checagem de duplicatas
**Arquivo:** `server/csvParser.ts:1811` (metodo `parseCSVWithDuplicateCheck`)
```typescript
for (const tournament of tournaments) {
  const isDuplicate = await storage.isDuplicateTournament(userId, tournament);
  // 18.614 queries sequenciais
}
```

### Problema 2: N+1 queries na insercao
**Arquivo:** `server/routes/upload.ts:204`
```typescript
for (const tournament of tournaments) {
  const saved = await storage.createTournament(tournamentData);
  // 18.614 queries sequenciais
}
```

### Problema 3: Sem limite de tamanho no multer
**Arquivo:** `server/routes/upload.ts:14`
```typescript
const upload = multer({ storage: multer.memoryStorage() });
// Sem limits: { fileSize: ... } — aceita arquivos de qualquer tamanho em memoria
```

### Problema 4: Sem timeout/progress no request
Request HTTP padrao tem timeout de ~2 minutos. A importacao precisa de ~30 minutos com o fluxo atual. Nao ha mecanismo de progresso.

## Modulos Afetados
- `server/routes/upload.ts` — rota de upload e logica de salvamento
- `server/csvParser.ts` — metodo `parseCSVWithDuplicateCheck`
- `server/storage.ts` — metodos `isDuplicateTournament` e `createTournament`
- `shared/schema.ts` — tabela `tournaments` (possivelmente precisa de indice)

## Requisitos Funcionais

### RF-01: Checagem de duplicatas em batch
**Descricao:** Substituir o loop sequencial de `isDuplicateTournament` por uma query batch que verifica multiplos torneios de uma vez.
**Regras de negocio:**
- Prioridade 1: Checar por `tournamentId` (quando disponivel) usando `WHERE tournamentId IN (...)`
- Prioridade 2: Para torneios sem `tournamentId`, usar checagem por `name + datePlayed + buyIn`
- Processar em batches de 500 torneios por query
- Manter a mesma logica de deteccao de duplicatas existente (apenas otimizar a execucao)
**Criterio de aceitacao:**
- [ ] Checagem de duplicatas para 18.614 torneios completa em menos de 10 segundos
- [ ] Resultados identicos ao metodo sequencial (mesmos torneios marcados como duplicata)
- [ ] Funciona com torneios que tem `tournamentId` e com os que nao tem

### RF-02: Insercao em batch
**Descricao:** Substituir o loop sequencial de `createTournament` por insercoes em batch usando uma unica transacao.
**Regras de negocio:**
- Inserir em batches de 500 torneios por INSERT
- Usar transacao para garantir atomicidade de cada batch
- Se um batch falhar, registrar erro e continuar com o proximo batch (nao abortar toda a importacao)
- Gerar IDs via `nanoid()` antes do batch insert
**Criterio de aceitacao:**
- [ ] Insercao de 18.614 torneios completa em menos de 30 segundos
- [ ] Cada torneio recebe um ID unico gerado via nanoid
- [ ] Falha em um batch nao impede insercao dos demais batches
- [ ] Contagem final (success/error) reflete o resultado real

### RF-03: Indice de banco para checagem de duplicatas
**Descricao:** Criar indice composto na tabela `tournaments` para acelerar as queries de duplicatas.
**Regras de negocio:**
- Indice composto em `(userId, tournamentId)` para checagem por ID
- Indice composto em `(userId, name, datePlayed, buyIn)` para checagem por criterios
**Criterio de aceitacao:**
- [ ] Indices criados via migracao Drizzle
- [ ] Query de duplicatas usa os indices (verificar via EXPLAIN)
- [ ] Performance da checagem individual nao regride (para outros fluxos que usam isDuplicateTournament)

### RF-04: Limite de tamanho no multer
**Descricao:** Adicionar limite de tamanho no upload de arquivos.
**Regras de negocio:**
- Limite de 10MB para arquivos CSV/XLSX
- Retornar erro 413 com mensagem clara se exceder
**Criterio de aceitacao:**
- [ ] Arquivo de 3MB (18K torneios) e aceito
- [ ] Arquivo acima de 10MB e rejeitado com mensagem "Arquivo muito grande. Limite: 10MB"
- [ ] Erro e retornado antes de tentar parsear o arquivo

### RF-05: Feedback de progresso (opcional, se viavel)
**Descricao:** Se a importacao demorar mais de 5 segundos, fornecer feedback de progresso ao usuario.
**Regras de negocio:**
- Opcao A (simples): Retornar resposta parcial com contagem estimada antes de iniciar o processamento, depois processar em background e salvar resultado no `upload_history`
- Opcao B (complexa): Usar Server-Sent Events (SSE) ou WebSocket para enviar progresso em tempo real
- **Recomendacao:** Opcao A e suficiente para o MVP desta correcao
**Criterio de aceitacao:**
- [ ] Para arquivos com mais de 5.000 torneios, o usuario recebe feedback antes de 5 segundos
- [ ] O resultado final da importacao e registrado no `upload_history`
- [ ] O frontend mostra o status atualizado apos a importacao completar

## Requisitos Nao-Funcionais
- **Performance:** Importacao de 18.614 torneios deve completar em < 60 segundos (end-to-end)
- **Performance:** Checagem de duplicatas deve completar em < 10 segundos para 20K torneios
- **Memoria:** Pico de uso de memoria durante importacao deve ser < 200MB
- **Resiliencia:** Falha parcial nao deve corromper dados existentes (transacoes por batch)
- **Compatibilidade:** Importacoes pequenas (< 1.000 torneios) devem continuar funcionando sem mudanca visivel

## Endpoints Afetados
| Metodo | Rota | Mudanca | Auth |
|--------|------|---------|------|
| POST | `/api/upload-history` | Otimizar para batch processing | JWT |
| POST | `/api/check-duplicates` | Otimizar checagem de duplicatas em batch | JWT |
| POST | `/api/upload-with-duplicates` | Otimizar insercao em batch | JWT |

## Modelos de Dados Afetados

### tournaments (alteracao — indices)
| Campo | Tipo | Indice | Notas |
|-------|------|--------|-------|
| userId + tournamentId | varchar | idx_tournaments_user_tid | Indice composto para checagem de duplicatas por ID |
| userId + name + datePlayed + buyIn | varchar + varchar + timestamp + varchar | idx_tournaments_user_dedup | Indice composto para checagem de duplicatas por criterios |

## Cenarios de Teste

### Happy Path
- [ ] Importar CSV SharkScope PT-BR com 18.614 torneios — todos importados com sucesso em < 60s
- [ ] Importar CSV pequeno (100 torneios) — funciona normalmente sem regressao
- [ ] Importar CSV com mix de redes (PokerStars, WPN, GGNetwork, Chico) — todas parseadas corretamente
- [ ] Re-importar mesmo CSV — todos detectados como duplicatas em batch

### Validacao de Input
- [ ] Arquivo > 10MB — erro 413 com mensagem clara
- [ ] Arquivo vazio — erro 400 mantido
- [ ] Arquivo com formato nao suportado — erro 400 mantido

### Regras de Negocio
- [ ] Duplicatas por tournamentId — detectadas corretamente em batch
- [ ] Duplicatas por name+date+buyIn — detectadas corretamente em batch
- [ ] Mix de duplicatas e novos torneios — novos inseridos, duplicatas ignoradas
- [ ] Torneios com moeda CNY — convertidos corretamente com exchange rates

### Edge Cases
- [ ] CSV com 50.000 torneios — completa sem crash
- [ ] Falha de conexao com banco durante batch — batch atual falha, demais continuam
- [ ] Torneios sem tournamentId (Bodog) — fallback para checagem por criterios funciona em batch
- [ ] Campos vazios (position vazia, prize vazio) — parseados como 0/null sem erro

## Fora de Escopo
- Mudar o formato do CSV aceito (o parser SharkScope PT-BR ja funciona)
- Adicionar novos parsers de redes de poker
- Mudar a UI de upload (apenas o backend e otimizado)
- Implementar upload assincrono com fila (Redis/Bull) — overkill para o volume atual
- Streaming de progresso via WebSocket (SSE ou polling sao suficientes)

## Dependencias
- Nenhuma feature nova. Apenas otimizacao de codigo existente.

## Notas de Implementacao

### Batch duplicate check — abordagem sugerida
```
// Em vez de N queries individuais, fazer:
// 1. Coletar todos os tournamentIds do CSV
// 2. Uma unica query: SELECT tournamentId FROM tournaments WHERE userId = ? AND tournamentId IN (...)
// 3. Criar Set com IDs existentes
// 4. Filtrar localmente: torneios cujo ID nao esta no Set sao novos
// Para torneios sem tournamentId, agrupar por (name, datePlayed, buyIn) e checar em batch similar
```

### Batch insert — abordagem sugerida
```
// Em vez de N inserts individuais, fazer:
// 1. Gerar IDs com nanoid() para cada torneio
// 2. Montar array de values
// 3. INSERT INTO tournaments VALUES (...), (...), (...) em batches de 500
// Drizzle suporta: db.insert(tournaments).values([...array])
```

### Prioridade de implementacao
1. RF-03 (indices) — impacto imediato mesmo no fluxo atual
2. RF-01 (batch duplicates) — maior ganho de performance
3. RF-02 (batch inserts) — segundo maior ganho
4. RF-04 (limite multer) — seguranca
5. RF-05 (progresso) — UX, pode ser feito depois
