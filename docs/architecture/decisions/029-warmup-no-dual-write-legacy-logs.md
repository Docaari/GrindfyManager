# ADR-029: Nao fazer dual-write em `preparation_logs` durante a transicao para `warmup_rituals`

## Status
Aceito

## Data
2026-04-25

## Contexto

ADR-028 estabelece que `warmup_rituals` (nova tabela) coexistira com `preparation_logs` (legada) por 60 dias. A pergunta complementar: **codigo novo deve tambem escrever em `preparation_logs` para manter compatibilidade (dual-write)?**

Dual-write e a tecnica em que um service grava em duas tabelas simultaneamente (geralmente em transacao) para manter sincronia entre schemas durante migracao. Padrao classico no playbook Strangler Fig (Fowler).

### Restricoes

- **`preparation_logs` ja tem dados historicos** de usuarios atuais (4 sliders + score 60/40). Estes dados precisam permanecer acessiveis enquanto a nova UI rola.
- **Schema gap entre tabelas e grande.** `mentalState`, `focusLevel`, `confidenceLevel` (sliders 1-10) nao mapeiam diretamente para `emotionalCheckScore` (0-10) + `blocksCompleted` (jsonb estruturado). Qualquer sintese seria heuristica inventada.
- **Codigo legado que ainda le `preparation_logs`:** spec aponta apenas `AchievementsDialog` (reaproveitado) e endpoints `/api/preparation-logs*` (mantidos por compat). Nenhum codigo novo da Sprint W-1 le essa tabela.
- **Erros conhecidos do projeto** (CLAUDE.md secao 9): "Double-write de tokens (saveMessage + recordUsage) escondido em codigo de producao (Coach Sprint 1)" - patologia ja vivida no projeto, custou ~10-30ms por mensagem + duplicacao de logica.
- **Janela 60 dias** documentada. Pos avaliacao, se nenhum dashboard ou query nova ler `preparation_logs`, a tabela e dropada.

## Opcoes Consideradas

### Opcao A: Nao fazer dual-write (ESCOLHIDA)

Codigo novo da Sprint W-1 escreve EXCLUSIVAMENTE em `warmup_rituals`. Codigo legado continua lendo `preparation_logs`. Nenhum mapeamento sintetico entre as duas.

- **Pros:**
  - **Zero overhead em writes.** Cada `POST /api/warmup-rituals` faz apenas 1 INSERT. Latencia P95 < 300ms (RNF-03 da spec) e factivel.
  - **Sem mapeamento heuristico.** Dual-write exigiria transformar `emotionalCheckScore` + `blocksCompleted` em `mentalState` + `focusLevel` + `confidenceLevel` + `exercisesCompleted` - sintese inventada que polui dado historico.
  - **Sem patologia de divergencia.** Em dual-write, falha parcial (succeed em A, fail em B) gera dados inconsistentes silenciosos. Sem dual-write, esse modo de falha nao existe.
  - **Codigo simples.** Service layer fica com 1 funcao `createWarmupRitual()` e ponto. Sem `try { writePrepLog(); } catch {...}`.
  - **Reverter e trivial.** Drop `warmup_rituals` - `preparation_logs` continua exatamente como esta.
  - **Dado historico legado preservado, isolado.** UI nova exibe historico de `warmup_rituals`; UI legada (se houver) ainda mostra `preparation_logs`. Sem mistura confusa.
  - **CLAUDE.md ja documenta:** "Double-write de tokens (saveMessage + recordUsage) escondido em codigo de producao (Coach Sprint 1)" - padrao aprendido a evitar; mesmo problema apareceria aqui.
  - **Strangler Fig compativel.** O padrao Fowler nao exige dual-write; exige que codigo novo eventualmente substitua codigo antigo. Coexistencia read-only legada e variante valida.

- **Contras:**
  - **Historico antigo separado dos novos rituais.** UI mostra ambos lado-a-lado (ou seccoes diferentes), mas nao consolida. Aceitavel - usuario percebe corte explicito da refatoracao.
  - **Eventual migracao de historico, se desejada, e ad-hoc.** Provavelmente nunca rodara - dados de sliders nao mapeiam para o novo modelo (perda de informacao mesmo com migration).

### Opcao B: Dual-write em ambas as tabelas

Cada `POST /api/warmup-rituals` tambem dispara INSERT/UPDATE em `preparation_logs`. Mapeamento heuristico syntetiza campos antigos.

- **Pros:**
  - Dashboards e endpoints `/api/preparation-logs*` ja consomem dados novos automaticamente.
  - Nao quebra nenhum codigo existente.

- **Contras:**
  - **Mapeamento perde informacao.** `emotionalCheckScore=4` deve virar `mentalState=4`? Mas `mentalState` antigo era media de 4 sliders - heuristica fica errada. `blocksCompleted` (jsonb estruturado) vira `exercisesCompleted` (string[]) - perda de detalhamento.
  - **Latencia dupla.** 2 INSERTs em transacao = +30-50ms. Em endpoint quente (chamado a cada conclusao de ritual), pode estourar P95 RNF-03 (300ms) em horario de pico.
  - **Patologia de divergencia.** Falha parcial silenciosa documentada em literatura de microservices. Mitigacao via transacao reduz mas nao elimina (DB local OK; em sharding ou Neon serverless ha edge cases).
  - **Codigo dobra.** Toda mudanca futura em warm-up precisa pensar em ambos schemas. Manutencao recorrente.
  - **Esconde a deprecacao.** `preparation_logs` continua "viva" indefinidamente porque dual-write a alimenta. Nunca chega o momento de drop.
  - **CLAUDE.md ja documenta o erro:** Coach Sprint 1 fez double-write de tokens (saveMessage + recordUsage) - foi removido por overhead + duplicacao de logica. Mesmo padrao aqui levaria ao mesmo refactor.
  - **Rejeitada por: mapeamento heuristico, latencia, divergencia, dificultar deprecacao.**

### Opcao C: Migrar dados antigos imediatamente para `warmup_rituals` (one-shot)

Script de migracao corre na deploy: para cada `preparation_logs` antiga, gera `warmup_rituals` correspondente com mapeamento heuristico, e dropa `preparation_logs`.

- **Pros:**
  - Tabela unica imediatamente, sem coexistencia.
  - Codigo legado precisa atualizar consultas, mas ja consome do novo.

- **Contras:**
  - **Migracao com mapeamento heuristico polui historico novo.** Rituais migrados teriam dados sinteticos (heuristicas snapshot inventadas, blocos completed forjados, etc). Indistinguivel de rituais reais.
  - **Big bang risk.** Se migracao falha em prod, rollback exige restore de backup. Sprint W-1 ja tem mudanca grande de UI - acumular migration big bang aumenta risco de release.
  - **Codigo legado quebra ate atualizar.** `AchievementsDialog`, `/api/preparation-logs*` etc precisam ser atualizados em mesma deploy.
  - **Sem janela de observacao.** Sem coexistencia, nao temos baseline para decidir o destino real de `preparation_logs`. Pode ser que features futuras precisem do schema antigo - destruimos optionality.
  - **Rejeitada por risco + perda de optionality.**

### Opcao D: Sem dual-write + script de export periodico de `warmup_rituals` -> `preparation_logs`

Cron diario que copia rituais novos para `preparation_logs` (read-replica style) com mapeamento.

- **Pros:**
  - Mantem `preparation_logs` "vivo" sem custo no caminho quente.

- **Contras:**
  - **Adiciona infra (cron).** Sprint W-1 nao tem outras crons - inflar escopo por algo que nao tem consumidor real.
  - **Latencia eventual:** dashboards legados tem dados velhos por ate 24h.
  - **Mesmo problema de mapeamento heuristico.**
  - **Rejeitada como over-engineering.**

## Decisao

**Adotar Opcao A: nao fazer dual-write. Codigo da Sprint W-1 escreve EXCLUSIVAMENTE em `warmup_rituals`.**

### Detalhes-chave do design

1. **`server/storage.ts`:** funcao `createWarmupRitual(payload)` faz unico INSERT em `warmup_rituals`. Sem chamada a `createPreparationLog`.
2. **Endpoint `POST /api/warmup-rituals`** (em `server/routes/warmup-rituals.ts`) so toca `warmup_rituals`.
3. **Codigo legado nao tocado:**
   - `preparation_logs` permanece read-only do ponto de vista do codigo novo.
   - Endpoints `/api/preparation-logs*` mantidos (nao removidos nesta sprint).
   - `AchievementsDialog` recebe refactor minimo: trocar query de `preparation_logs` para `warmup_rituals` filtrando `version='full'` (ja documentado na spec). Apos esse refactor, achievements param de ler `preparation_logs` - mas tabela permanece como leitura passiva pra dashboards admin/legacy.
4. **UI exibe historicos separados (sem consolidar):**
   - `WarmupHistoryCard` (novo) lista os ultimos 14 de `warmup_rituals`.
   - Se admin precisar ver historico antigo de algum usuario, faz query direta em `preparation_logs` (rota legada).
5. **Janela 60 dias para avaliacao:**
   - **Dia 60:** verificar telemetria/logs - se nenhum codigo (front ou back) leu `preparation_logs` nesse periodo, marcar tabela como deprecada, planejar DROP em sprint posterior.
   - **Dia 90:** DROP `preparation_logs` se telemetria confirmar zero uso.
6. **Migracao de historico:** **NAO planejada.** Sliders 1-10 nao mapeiam para `emotionalCheckScore` + estruturas jsonb sem perda. Se ocorrer demanda futura, rodar script ad-hoc com flag `migrated_from_preparation_log=true` para distinguir.
7. **Documentacao:**
   - CLAUDE.md secao 6 (Modelos de dados): `preparation_logs` ganha tag "DEPRECATED 60d - ADR-029".
   - data-model.mermaid: nota visual de deprecacao na entidade.

## Consequencias

### Positivas
- **Latencia P95 baixa.** 1 INSERT por conclusao de ritual. RNF-03 (300ms) tranquilo.
- **Zero patologia de divergencia.** Sem caminho de falha parcial entre 2 INSERTs.
- **Codigo simples e auditavel.** Service layer com responsabilidade unica.
- **Reverter e seguro.** Drop `warmup_rituals` - `preparation_logs` continua intocavel.
- **Forca decisao explicita aos 60 dias.** Drop ou keep - nao "morre por inatividade".
- **Aprende com erro previo do projeto** (saveMessage + recordUsage no Coach Sprint 1).

### Negativas
- **Historico antigo isolado da UI nova.** Aceitavel - dados de sliders nao agregam valor analitico ao modelo de blocos cronometrados.
- **Refactor pequeno de `AchievementsDialog`.** Documentado na spec - trocar query - ~10 LOC. Apos refactor, `preparation_logs` perde seu unico leitor ativo de codigo novo.
- **Migracao final de historico provavelmente nao acontece.** Perda de continuidade longitudinal para usuarios atuais. Mitigado por: (a) UI legada ainda permite visualizar; (b) volume historico baixo (poucos sprints de uso); (c) novos rituais comecam a acumular dado rico de blocos.

### Neutras
- **Decisao revisitavel.** Se Sprint W-2 ou demanda admin requererem ver historico unificado, podemos rodar migration ad-hoc.
- **Padrao para futuras deprecacoes.** Quando outras tabelas precisarem deprecar (ex: `user_activities` vs `user_activity` - cleanup ja feito), Strangler Fig sem dual-write e o playbook.

## Confianca

**Alta.** Caso de uso classico do padrao Strangler Fig com leitura legada read-only durante deprecacao. Sem dual-write minimiza risco de divergencia documentado em literatura de microservices (Kleppmann, "Designing Data-Intensive Applications", Cap 11). Erro previo do projeto (Coach Sprint 1 dual-write) reforca direcao.

## Referencias

- Spec: `Docs/specs/warm-up-sprint-w1-spec.md` (Secao 12 - Plano de Migracao)
- ADR-028: criacao da tabela `warmup_rituals` (esta ADR e complementar).
- CLAUDE.md secao 9: "2026-04-24 - Double-write de tokens (saveMessage + recordUsage)" - erro evitado nesta decisao.
- Fowler, M. ["Strangler Fig Application"](https://martinfowler.com/bliki/StranglerFigApplication.html) - padrao de migracao de codigo legado.
- Kleppmann, M. "Designing Data-Intensive Applications" Cap 11 - patologias de dual-write.
