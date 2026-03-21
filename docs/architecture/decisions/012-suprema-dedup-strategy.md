# ADR-012: Estrategia de deduplicacao Suprema (externalId vs nome+site+buyIn)

## Status
Aceito

## Data
2026-03-21

## Contexto

A integracao Suprema importa torneios enriquecidos para o Grindfy. O mesmo torneio pode ser importado multiplas vezes (sync manual, auto-sync, import por dia). Sem dedup, a biblioteca e a grade acumulam duplicatas.

Existem dois contextos de dedup com necessidades diferentes:

1. **tournament_library** (catalogo pessoal): torneios da biblioteca sao generos ("Sunday Million" que acontece toda semana). Dois torneios com mesmo nome, site e buy-in sao provavelmente o mesmo torneio recorrente.

2. **planned_tournaments** (grade semanal): torneios planejados ja usam externalId ("suprema-{id}") para dedup precisa, pois o ID Suprema identifica a instancia exata.

## Opcoes Consideradas

### Opcao 1: Dedup apenas por externalId em ambas tabelas
- **Pros:** Preciso — identifica exatamente o mesmo torneio Suprema. Simples de implementar (WHERE externalId = ?).
- **Contras:** Torneios manuais e grind-live nao tem externalId. Nao previne duplicatas conceituais (mesmo torneio adicionado por fontes diferentes sem externalId). Dois imports Suprema em dias diferentes geram IDs diferentes para o "mesmo" torneio recorrente.

### Opcao 2: Dedup apenas por nome+site+buyIn em ambas tabelas
- **Pros:** Funciona para todas as fontes (manual, suprema, grind-live). Captura duplicatas conceituais (torneio recorrente).
- **Contras:** Falsos positivos — dois torneios diferentes podem ter mesmo nome, site e buy-in (ex: "Bounty Hunter $22" na GGPoker pode ser diario e semanal). Menos preciso que externalId.

### Opcao 3: Estrategia hibrida por contexto
- **Pros:** Cada tabela usa a melhor estrategia para seu caso. tournament_library usa nome+site+buyIn (catalogo conceitual de torneios recorrentes — agrupar faz sentido). planned_tournaments mantém externalId (instancia exata em dia especifico — precisao necessaria). Inclui verificacao na lixeira para ambos.
- **Contras:** Logica de dedup diferente por tabela — mais codigo. Documentacao necessaria para evitar confusao.

## Decisao

Adotar estrategia hibrida (Opcao 3):

### tournament_library (catalogo)
- **Fontes Suprema:** dedup por externalId (campo `external_id` na tabela). Se nao encontrar por externalId, fallback para nome+site+buyIn.
- **Fontes grind-live:** dedup por nome+site+buyIn (nao tem externalId).
- **Fontes manual:** sem dedup automatica (usuario decide).
- **Escopo da verificacao:** inclui registros ativos (deletedAt IS NULL) E lixeira (deletedAt NOT NULL). Evita reimportar torneio que usuario deletou.

### planned_tournaments (grade)
- Mantém dedup por externalId para imports Suprema (comportamento atual).
- Sem dedup para torneios arrastados da biblioteca (cada drop e intencional).

### Query de dedup na biblioteca (pseudo-SQL)
```sql
-- Suprema: verifica externalId primeiro
SELECT id FROM tournament_library
WHERE user_id = ? AND external_id = ?;

-- Fallback ou grind-live: verifica nome+site+buyIn
SELECT id FROM tournament_library
WHERE user_id = ? AND name = ? AND site = ? AND buy_in = ?;
-- Inclui deletedAt IS NOT NULL (lixeira)
```

## Consequencias

- **Positiva:** Minimiza duplicatas em ambos os contextos
- **Positiva:** Lixeira como parte do escopo de dedup evita "reimport acidental"
- **Positiva:** Flexivel — cada fonte usa a melhor estrategia
- **Negativa:** Falsos positivos possiveis com nome+site+buyIn (mitigado: usuario pode deletar duplicata manualmente)
- **Negativa:** Codigo de dedup mais complexo (duas logicas)
- **Neutra:** Torneios Suprema recorrentes (mesmo torneio em dias diferentes) sao tratados como um so na biblioteca (correto — e catalogo, nao instancia)

## Confianca
Media — falsos positivos com nome+site+buyIn sao raros mas possiveis
