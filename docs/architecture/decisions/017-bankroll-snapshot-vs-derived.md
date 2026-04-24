# ADR-017: Banca em tabela `bankroll_snapshots` (snapshots explicitos) em vez de derivar em tempo real dos torneios

## Status
Aceito

## Data
2026-04-24

## Contexto

O Sprint 2 (Bankroll Management, `docs/specs/bankroll-management.md`) precisa entregar:
- Estado atual da banca em USD (`user_settings.bankroll_amount` ja existente).
- Historico de evolucao ao longo do tempo (aportes, saques, ajustes manuais, resultados de sessao).
- Grafico de evolucao + resumo (total aportado, total sacado, P&L de sessoes, variacao liquida).
- Filtro de Tournament Selector (Sprint 1) e alerta em Grind Live, ja integrados com `user_settings.bankroll_amount`.

A **pergunta central:** o historico de banca deve ser derivado em tempo real a partir de `tournaments` + `grind_sessions` ja importados, ou registrado explicitamente em uma nova tabela `bankroll_snapshots`?

### Realidade do dataset

| Aspecto | Observado |
|---|---|
| Fonte de movimentacao financeira | Multipla: resultados de torneios (via upload CSV) + movimentos nao-torneio (aportes, saques, ajustes manuais, reembolsos, P&L de live game, transferencias entre redes) |
| Moeda | Banca em USD; torneios em BRL/USD/EUR/etc com taxa historica de cambio variavel |
| Data de ativacao da feature | Usuario pode ter historico de 1 ano no sistema **sem** nunca ter configurado banca — derivar "agora" retroativamente teria que inventar saldo inicial |
| Uploads retroativos | Usuario pode importar CSV antigo (janeiro 2026) hoje (abril 2026); a ordem de importacao nao corresponde a ordem temporal dos movimentos |
| Auditoria | Jogador profissional quer ver "em 15/abril minha banca era $2347, hoje e $2512" sem depender de recomputacao probabilistica |

### Restricoes de produto

- **Movimentos nao-torneio sao first-class.** Aporte por PIX, saque via Pix da rede, ajuste manual apos bug de parser, ajuste de cambio — todos sao eventos validos que **nao existem em `tournaments`**.
- **Performance:** `GET /api/bankroll/history` com 500 snapshots < 200ms p95. Recomputacao dinamica sobre 5k torneios com conversao de moeda por evento nao cabe no p95.
- **Consistencia com Sprint 1:** Tournament Selector ja le `user_settings.bankroll_amount` como fonte de verdade. Se derivarmos em tempo real, `user_settings.bankroll_amount` vira cache recomputavel — exige refatoracao do Selector.
- **Cambio historico:** ROI de um torneio BRL de janeiro (com USD/BRL = 5.10) nao deve ser reinterpretado com taxa de abril (USD/BRL = 5.20). Snapshot captura taxa efetiva no momento do evento.
- **Q3 do spec:** auto-snapshot de sessao esta **fora do MVP**. Se escolhermos derivar, teriamos que suportar P&L-de-sessao automatico desde o dia 1.
- **Q7 do spec:** DELETE de snapshot fora do MVP; Q4 define que o DELETE futuro usa hard delete com recompute. Esse padrao so faz sentido se houver uma tabela de snapshots para recomputar.

## Opcoes Consideradas

### Opcao A: Tabela dedicada `bankroll_snapshots` com `delta + previousAmount + newAmount` (ESCOLHIDA)

Cada movimento vira uma linha com:
- `delta` (assinado, USD)
- `previousAmount` (saldo antes)
- `newAmount` (saldo depois)
- `reason` (enum: initial / deposit / withdrawal / session_result / manual_adjustment)
- `source` (manual / auto_session / auto_import)
- `occurredAt` (timestamp do evento — permite retroativo)
- `sessionId` (FK opcional para `grind_sessions`, usado quando `source=auto_session`)
- `note` (free text 500 chars)

`user_settings.bankroll_amount` continua sendo o saldo "atual" (cache autoritativo) — mas derivavel da soma de `delta` em caso de discrepancia.

- **Pros:**
  - **Movimentos nao-torneio sao naturais.** Aporte, saque, ajuste manual sao inseridos como linha sem precisar inventar um torneio-fantasma.
  - **Auditabilidade total.** Cada linha tem `previousAmount` + `newAmount` redundantes (pratica herdada de sistemas contabeis de ledger), permitindo detectar divergencia por clock skew ou bug de race condition.
  - **Performance previsivel.** `SELECT ... FROM bankroll_snapshots WHERE user_id=? AND occurred_at BETWEEN ? AND ? ORDER BY occurred_at DESC LIMIT 100` usa indice `(user_id, occurred_at DESC)`. O(log N) por request independente do tamanho do historico de torneios.
  - **Cambio historico preservado.** `delta` ja vem em USD — conversao aconteceu no momento do evento com taxa vigente. Nao reinterpretamos ROIs antigos com cambio novo.
  - **Compativel com imports retroativos.** Upload de CSV de janeiro hoje nao afeta snapshots de abril. Mesmo se `auto_import` for implementado no futuro, cada linha carrega seu proprio `occurredAt` e nao mexe nas outras.
  - **Desacoplado de `tournaments`.** Se o parser do CSV muda, ou se adicionarmos uma rede nova, ou se um torneio for deletado/reimportado, o historico de banca nao e afetado.
  - **Q4 (DELETE com recompute) e viavel.** Recompute recorrendo os snapshots em ordem cronologica: `newAmount[i] = newAmount[i-1] + delta[i]`. Simples. Impossivel sem tabela dedicada.
  - **AI Coach (futuro) pode consumir.** "Voce sacou $500 na semana passada apos 3 sessoes negativas" e query trivial sobre snapshots + sessions.
  - **Padrao padrao de gestao de banca.** HM3, PT4, PokerAnalytics e todos os bankroll trackers profissionais usam tabela dedicada. Nao estamos inventando.
  - **Compatibilidade com Sprint 1.** Tournament Selector le `user_settings.bankroll_amount` como sempre. Nenhuma refatoracao.

- **Contras:**
  - **Redundancia de dados.** Informacao de P&L de torneio existe em `tournaments.prize - tournaments.buy_in` E em `bankroll_snapshots.delta` quando `auto_session` for implementado. Risco de drift se as duas fontes divergirem.
  - **Dupla escrita em operacoes de torneio.** Se futuro `auto_session` for ativado, criar snapshot na finalizacao da sessao adiciona um INSERT extra. Transacao necessaria para garantir atomicidade.
  - **Migracao retroativa.** Usuarios existentes com historico de torneios nao vao ter historico de banca. Aceitacao: comecam com snapshot `initial` a partir da configuracao. (Documentado em "Fora de Escopo" da spec.)

### Opcao B: Derivar em tempo real a partir de `tournaments` + movimentos externos (view materializada)

Nao criar `bankroll_snapshots`. Para cada request de historico:
1. Buscar todos os `tournaments` do usuario com `tournaments.prize - tournaments.buy_in` como delta.
2. Buscar movimentos externos de uma tabela auxiliar (aportes, saques) — que TERIAMOS QUE CRIAR mesmo assim.
3. Merge temporal, aplicar cambio historico, acumular saldo.

- **Pros:**
  - **Normalizacao estrita.** Sem redundancia entre `tournaments` e `bankroll_snapshots`.
  - **P&L de sessao automatico.** Qualquer torneio importado ja aparece no historico sem dupla escrita.
  - **Menos tabelas.** Arquitetura parece mais enxuta.

- **Contras:**
  - **Precisamos criar uma tabela para movimentos externos mesmo assim** (aportes/saques nao sao torneios). Ou seja, a "economia" e ilusoria — so evita snapshot de torneio, nao de aporte.
  - **Cambio historico vira dor.** Taxa de cambio de janeiro e diferente de abril. Converter BRL -> USD no momento do request exige buscar taxa historica. `user_settings.exchange_rates` guarda a taxa **atual**, nao a historica. Solucoes: (a) guardar taxa historica por torneio (duplica dado que ja existe em `tournaments.currency`); (b) aceitar que banca historica oscila conforme cambio atual (bug de produto).
  - **Performance degrada com historico.** Jogador com 5k torneios + query com conversao + merge + acumulacao: 200-500ms so para o bundle. Inviavel com cache invalidado por upload.
  - **Retroatividade quebra quando usuario configura banca hoje.** Qual era a banca ha 6 meses? Derivar assumiria que todos os torneios afetaram a banca, mas o jogador so comecou a trackear formalmente hoje. Precisaria de "saldo inicial" — que e basicamente o que o snapshot `initial` resolve.
  - **Delete de torneio reverte banca retroativamente.** Se usuario deleta torneio de janeiro por ser duplicado, todos os saldos de fev/mar/abr mudam. Auditoria fica confusa.
  - **Conflita com Q4 (hard delete com recompute).** Sem tabela de snapshots, o que recomputa? Tudo? Sempre?
  - **Conflita com Q3 fora do MVP.** Auto-snapshot de sessao esta FORA do MVP. Opcao B essencialmente FORCA auto-snapshot (via derivacao) — invalidando a decisao do founder.
  - **AI Coach fica mais complexo.** Queries agregadas por periodo com conversao historica e dor.

### Opcao C: Hibrida — snapshots explicitos para movimentos nao-torneio + derivacao de torneios

Tabela de "movimentos externos" + derivar P&L dos torneios on-the-fly. Merge no response da API.

- **Pros:**
  - Mantem normalizacao parcial (P&L vem de `tournaments`).

- **Contras:**
  - **Pior dos dois mundos.** Tem complexidade da derivacao (cambio historico, performance) sem o ganho de auditabilidade total.
  - **Forca decisao "isso conta ou nao conta na banca" em cada torneio.** Se usuario importa sessao antiga antes de configurar banca, conta? E depois de configurar? Linha e obscura.
  - **Response de `/api/bankroll/history` precisa orquestrar merge em todo request.** Cache fica complicado (invalida em upload + em snapshot).
  - **Mesmo problema de retroatividade** — qual era a banca em janeiro? Derivar ou congelar?

### Opcao D: Apenas `user_settings.bankroll_amount` + log em `user_activity` (sem tabela dedicada)

Escrever movimento como entry em `user_activity` (tabela de tracking existente).

- **Pros:**
  - Reutiliza tabela existente.

- **Contras:**
  - **`user_activity` e tabela de analytics comportamental.** Misturar "click em botao" com "aporte de $500" polui ambas as camadas.
  - **Sem schema tipado.** Drizzle + Zod nao validam deltas, reasons, etc.
  - **Queries de P&L viram joins feios.** Filtrar por `metadata->>'reason' = 'deposit'` em JSONB.
  - **Sem FK para `grind_sessions`.** Integracao futura (Q3) inviavel sem mudar schema.
  - **Rejeitada por qualidade arquitetural.**

## Decisao

**Adotar Opcao A: tabela dedicada `bankroll_snapshots` com colunas explicitas `delta + previousAmount + newAmount + reason + source + occurredAt + sessionId + note`.**

### Detalhes-chave do design

1. **`user_settings.bankroll_amount` continua sendo o saldo autoritativo em leitura.** Evita derivacao em cada request. Invariante: `bankroll_amount == soma(delta)` (auditavel, nao autoritativo).
2. **`previousAmount` + `newAmount` sao redundantes mas propositais.** Permitem auditoria sem recomputar do zero e detectam drift (se `snapshot[n].newAmount != snapshot[n+1].previousAmount`, alertamos).
3. **Transacao obrigatoria.** Toda operacao que muda `bankroll_amount` + cria snapshot roda em `db.transaction`. Se INSERT do snapshot falha, UPDATE do `bankroll_amount` reverte.
4. **`reason` e enum application-level (validado por Zod), nao DB-level.** Permite evoluir sem migration. Enum inicial: `initial | deposit | withdrawal | session_result | manual_adjustment`.
5. **`source` separa origem operacional de reason semantico.** `manual` (UI), `auto_session` (futura integracao Grind Live, Q3), `auto_import` (futura derivacao retroativa de CSVs — NAO no MVP).
6. **FK opcional para `grind_sessions`.** Prepara integracao futura sem bloquear MVP. Hoje fica sempre `null`.
7. **Indice `(user_id, occurred_at DESC)`.** Alvo das queries de historico. Segundo indice `(user_id, reason)` para queries de resumo agrupadas por tipo.
8. **FK `user_id` com `ON DELETE CASCADE`.** Remocao de usuario remove snapshots. Alinhado com resto do schema (tournaments, planned_tournaments, etc.).

## Consequencias

### Positivas
- **Auditabilidade enterprise-grade.** Cada movimento tem trail. Jogador profissional confia no produto.
- **Performance constante.** Historico com indice nao degrada com volume de torneios.
- **Desacoplamento de `tournaments`.** Mudancas no parser, reuploads, delecoes de CSV nao afetam a banca.
- **Q4 (DELETE com recompute) viavel.** Algoritmo trivial: recorrer snapshots em ordem cronologica recomputando `newAmount`.
- **Q3 (auto-snapshot de sessao) incremental.** Quando for implementado no Sprint 2.5+, basta inserir linha com `source=auto_session + sessionId`. Zero refactor.
- **Cambio historico naturalmente preservado.** `delta` e em USD no momento do evento; nao reinterpretamos com cambio futuro.
- **Reuso por AI Coach (futuro).** "Padrao de aportes", "comportamento pos-bust", "drawdown maximo" viram queries diretas.
- **Compatibilidade Sprint 1.** Selector continua lendo `user_settings.bankroll_amount`. Nenhuma quebra.

### Negativas
- **Dupla escrita quando `auto_session` entrar.** UPDATE session_tournament + UPDATE bankroll_amount + INSERT bankroll_snapshot. Mitigacao: transacao. Documentar invariante.
- **Redundancia P&L(torneios) vs delta(snapshots) quando auto_session ativar.** Mitigacao: `session_result` snapshot referencia `sessionId`, queries de conciliacao periodicas (fora do MVP) detectam drift.
- **Usuarios existentes nao tem historico pre-configuracao.** Aceito (spec "Fora de Escopo" ja documenta: comeca com snapshot `initial`).
- **+1 tabela, +2 indices, +1 migration, +1 service.** Custo de manutencao adicional pequeno.

### Neutras
- **Soft delete (Q4) escolhido como "hard com recompute" para o futuro.** Significa que no momento do DELETE, recalculamos todos os snapshots posteriores ao snapshot deletado. Custo O(N) onde N = snapshots apos o alvo. Aceitavel dado que MVP nao expoe DELETE.
- **Taxa de cambio historica nao e guardada na tabela.** Aceitamos que `delta` em USD e suficiente — a taxa usada no momento da conversao (Suprema BRL -> USD no Grind Live) e do knowledge do `currencyNormalizer`, nao fica materializada em `bankroll_snapshots`. Se auditabilidade de cambio for pedida depois, adicionar coluna `exchange_rate_applied` em migration futura.

## Confianca

**Alta** para o MVP. Padrao padrao da industria (HM3, PT4 e bankroll trackers profissionais fazem assim). Caminho de evolucao (auto_session, auto_import, DELETE com recompute) esta mapeado. Risco principal — dupla escrita — e mitigavel com transacao e testes de integracao.

## Referencias

- Spec: `docs/specs/bankroll-management.md` (RF-04, RF-05, Q3, Q4, Q7)
- ADR-015: scoring usa `user_settings.bankroll_amount` como fonte de verdade; este ADR mantem esse contrato intacto.
- ADR-016: pattern de servico + cache (aqui sera `bankrollService.ts` com invalidacao de `selectorCache`).
- ADR-018: tolerancia 1.5x hardcoded (complementa este ADR ao fixar regra de comparacao).
- Literatura: padrao "event-sourced ledger" (simplificado, sem replay completo) — mesma raiz conceitual.
