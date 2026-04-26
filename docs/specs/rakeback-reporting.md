# Spec: Reportar Rakeback

## Status
Proposta

## Resumo
Adiciona um novo tipo de movimento — `rakeback` — ao ledger multi-wallet. Permite ao jogador registrar rakeback recebido em uma carteira (plataforma) especifica via dialog dedicado. Tecnicamente eh uma entrada `direction='in'` com `reason='rakeback'`, sempre creditando o saldo nativo da wallet. Reaproveita 100% da infra de ledger ja entregue no Sprint Bankroll-2 (transacao + SELECT FOR UPDATE + espelho em `bankroll_snapshots`).

## Contexto
Hoje rakeback eh registrado como `deposit` ou `manual_adjustment`, contaminando relatorios de "depositos reais" e impedindo analise de "ganhos extra-jogo por plataforma". Tornar `rakeback` um tipo proprio:
- Habilita futuro dashboard de rakeback (por plataforma, periodo, % do volume jogado) sem precisar adivinhar quais movimentos sao rakeback no historico.
- Distingue rakeback de bonus/milestone — se vierem outros ganhos extra-jogo, promovemos `reason` para uma "category" (YAGNI ate la).
- Mantem o ledger imutavel (ADR-017) e o pattern multi-wallet (ADR-034) intactos.

Sprint imediatamente anterior: Bankroll-2.1 ("Reportar saldo") commitado em `3c31b28`.

## Usuarios
- **Jogador (player):** recebeu rakeback semanal/mensal na sala, abre o Grindfy, escolhe a wallet da plataforma e reporta o valor. ~10s.
- **Jogador (relatorio futuro):** consulta historico filtrando por `reason=rakeback` para entender quanto a plataforma X retornou no mes.

## Requisitos Funcionais

### RF-01: Adicionar `rakeback` ao enum de reasons P0
**Descricao:** Promover `rakeback` de "nao existente" para `reason` valido em `wallet_transactions`.
**Regras de negocio:**
- Adicionar `'rakeback'` ao array `WALLET_TX_REASONS_P0` em `shared/wallet-reasons.ts` (entre `'session_result'` e `'manual_adjustment'`).
- Adicionar tambem ao `WALLET_TX_REASONS` (lista forward-compat) se ainda nao estiver.
- Adicionar a `BANKROLL_REASON_ENUM` em `shared/schema.ts` (espelho em `bankroll_snapshots`).
- Endpoint `POST /api/wallets/:id/transactions` valida via `WalletTxReasonP0Schema` — `rakeback` passa a ser aceito automaticamente apos a inclusao.
**Criterio de aceitacao:**
- [ ] `WalletTxReasonP0Schema.parse({ reason: 'rakeback' })` nao lanca.
- [ ] `BANKROLL_REASON_ENUM.parse({ reason: 'rakeback' })` nao lanca.
- [ ] Suite existente de wallet transactions passa sem alteracao (backward-compat).

### RF-02: Endpoint reaproveita `POST /api/wallets/:id/transactions`
**Descricao:** Nao criar endpoint novo. Cliente envia `reason='rakeback'` + `direction='in'` no payload existente.
**Regras de negocio:**
- Tradeoff considerado:
  - **(a) endpoint dedicado `/rakeback`:** mais semantico, sem `direction` no body. Custo: codigo duplicado, divergencia de validacao, novo rate limit isolado.
  - **(b) reuso `/transactions`:** zero codigo novo no router, validacao centralizada, rate limit ja configurado (`walletLimiter`). Custo: cliente precisa enviar `direction='in'` (trivial — UI sempre sabe que rakeback eh credito).
- **Decisao: (b) — reuso.** Alinhado com pattern multi-wallet vigente (deposit/withdrawal/session_result tambem usam o mesmo endpoint diferenciados por `reason`).
- Backend valida que quando `reason='rakeback'`, `direction` deve ser `'in'`; rejeita `'out'` com 400 (`{code: 'invalid_rakeback_direction'}`).
**Criterio de aceitacao:**
- [ ] POST `/api/wallets/:id/transactions` com `reason='rakeback', direction='in', nativeAmount=50` cria a transacao normal.
- [ ] POST com `reason='rakeback', direction='out'` retorna 400 com codigo `invalid_rakeback_direction`.
- [ ] Schema Zod nao precisa de campos novos — apenas o enum aceita o valor novo.

### RF-03: Dialog `RakebackDialog`
**Descricao:** Novo dialog dedicado para o fluxo de reportar rakeback. NAO adicionar como modo dentro do `WalletTransactionDialog` — mantem-se simples e focado.
**Regras de negocio:**
- Componente: `client/src/components/bankroll/RakebackDialog.tsx`.
- Campos: (a) "Carteira" — select obrigatorio com wallets ATIVAS do usuario (default: wallet da qual o dialog foi disparado, se houver); (b) "Valor do rakeback" — input numerico positivo no `nativeCurrency` da wallet selecionada; (c) "Data" — datetime-local default = agora; (d) "Nota" — textarea opcional, max 500 chars.
- Sem campo `direction` (sempre `'in'`); sem campo `reason` (sempre `'rakeback'`).
- Trocar a wallet no select reformata o prefixo de moeda do input de valor.
- Botao primario: "Registrar rakeback".
**Criterio de aceitacao:**
- [ ] Dialog abre via 2 disparadores (RF-04) e mostra os 4 campos acima.
- [ ] Trocar wallet atualiza prefixo de moeda no input "Valor".
- [ ] Submit valido fecha o dialog, dispara toast de sucesso, invalida queries `['wallets']` e `['wallets', walletId, 'transactions']`.
- [ ] Submit com erro 4xx mantem dialog aberto e mostra mensagem inline.
- [ ] Carteiras `archived` nao aparecem no select.

### RF-04: Disparadores na UI
**Descricao:** Dois pontos de entrada para o `RakebackDialog`.
**Regras de negocio:**
- **Pagina `/bankroll`:** botao "Reportar rakeback" no header da pagina, ao lado do botao "Nova transacao" / "Reportar saldo" existente. Sem wallet pre-selecionada (usuario escolhe no dialog).
- **`WalletDetailPanel` / card de wallet:** acao "Reportar rakeback" no menu de acoes da wallet (mesmo menu que ja tem "Nova transacao", "Editar", "Arquivar"). Wallet pre-selecionada e select trava no nome dela (read-only, mas sem desabilitar o campo — apenas defaultValue + indicador visual).
- Em ambos: usar o mesmo `RakebackDialog` componente.
**Criterio de aceitacao:**
- [ ] Botao no header da `/bankroll` abre o dialog sem wallet pre-selecionada.
- [ ] Acao no menu da wallet abre o dialog com a wallet pre-selecionada.
- [ ] Botao tem icone consistente com pattern (sugestao: `Coins` ou `Gift` do lucide-react — decisao final do System-Architect/Implementer).

### RF-05: Validacao de input
**Descricao:** Garantir que rakeback so registra valores faceis de auditar.
**Regras de negocio:**
- `nativeAmount > 0` — rejeita zero, negativo, NaN, vazio. Mensagem: "Informe um valor positivo".
- `nativeAmount` aceita ate 2 casas decimais; mais sao truncadas (ou bloqueado pelo input — decisao de UX no Implementer).
- Wallet selecionada deve estar `status='active'`. Se arquivada (caso bizarro de race), backend retorna 422 (`{code: 'wallet_archived'}`); frontend mostra alerta inline e refetch `['wallets']`.
- `note` opcional, max 500 chars.
- `occurredAt` <= `now()` (futuro nao aceito; mensagem: "Data nao pode ser no futuro"). Permite retroativo sem limite (mesmo comportamento das demais transactions).
- Ownership: `walletService.recordTransaction` ja valida `wallet.userId === req.user.userPlatformId` — nao precisa nova checagem.
**Criterio de aceitacao:**
- [ ] `nativeAmount=0` ou negativo → botao salvar desabilitado + mensagem inline.
- [ ] Wallet archived → 422 com codigo `wallet_archived`; dialog mostra alerta e oferece refetch.
- [ ] `occurredAt` no futuro → bloqueado (input `max=now`) ou 400 do backend.
- [ ] `note` > 500 chars → bloqueado pelo input/contador + 400 do backend como defesa.

### RF-06: Visibilidade no historico (`BankrollHistoryTable` / `WalletDetailPanel`)
**Descricao:** Rakeback deve ser distinguivel a olho nu no historico, sem exigir filtro.
**Regras de negocio:**
- Nova badge/cor para `reason='rakeback'`. Sugestao de cor: amber/dourado (distinto de verde-deposit, azul-session, neutro-adjustment). Decisao final visual fica no Implementer + helpers em `client/src/lib/bankrollHelpers.ts`.
- Label PT-BR no historico: **"Rakeback"**.
- Filtro existente por `reason` no historico ganha automaticamente a opcao "Rakeback" assumindo que ele eh derivado do enum (verificar — se for hardcoded, atualizar).
- Nao agrupar rakeback separadamente (sem secao dedicada). Aparece inline na timeline ordenada por `occurredAt` desc.
**Criterio de aceitacao:**
- [ ] Linha de transacao com `reason='rakeback'` mostra badge "Rakeback" + cor distinta + label PT-BR.
- [ ] Filtro por reason no historico inclui "Rakeback" como opcao.
- [ ] Ordenacao do historico inalterada.

### RF-07: i18n PT-BR e helper centralizado
**Descricao:** Toda copy nova em PT-BR. Mapping de reason → label centralizado.
**Regras de negocio:**
- Centralizar `reasonLabel(reason: WalletTxReasonP0): string` em `client/src/lib/bankrollHelpers.ts` (criar se nao existir; expandir se ja existe). Mapping inicial: `deposit→Deposito`, `withdrawal→Saque`, `session_result→Resultado de sessao`, `manual_adjustment→Ajuste manual`, `rakeback→Rakeback`.
- Toda UI (dialog title, botoes, badges, filtros, historico) consome o helper.
- Mensagens de erro tambem em PT-BR ("Informe um valor positivo", "Carteira arquivada", "Data nao pode ser no futuro").
**Criterio de aceitacao:**
- [ ] Nenhuma string hardcoded "rakeback" sem capitalizacao em UI; usa sempre o helper.
- [ ] Helper exporta tipo `ReasonLabel` derivado do enum (typesafe).

### RF-08: Backward-compat e zero regressao
**Descricao:** Adicao do enum nao pode quebrar nada existente.
**Regras de negocio:**
- Nenhuma migration de dados (rows existentes nao precisam mudar).
- Schema do enum em DB: `reason` eh `varchar` (nao Postgres enum), entao adicionar valor eh transparente — sem `ALTER TYPE`.
- Suite atual de wallet transactions, bankroll snapshots, history e widget continua verde.
- Nenhuma row historica vira rakeback automaticamente — eh feature puramente opt-in.
**Criterio de aceitacao:**
- [ ] Suite existente roda sem alteracao.
- [ ] Sem migration SQL necessaria (db:push nao detecta diff alem do enum Zod).
- [ ] Spec wallet-balance-mode (commit `3c31b28`) continua funcional para os 4 reasons originais + novo.

## Edge Cases
- **Wallet arquivada durante edicao:** usuario abre dialog, outra aba arquiva; submit retorna 422; dialog mostra alerta e refetch wallets.
- **Rakeback em moeda diferente da wallet:** nao aplicavel — input eh sempre no `nativeCurrency` da wallet selecionada (sem campo de moeda no dialog). Se sala paga rakeback em USD para wallet BRL, jogador troca wallet ou converte mentalmente. **Fora de escopo conversao automatica.**
- **Reportar 2x o mesmo rakeback (idempotencia):** sem dedupe automatico (igual deposit/withdrawal). Usuario que duplica deve usar UI futura de "estornar/deletar transacao" (fora deste sprint). Mitigacao: nota explicativa eh boa pratica + futuro dashboard de rakeback ajuda a auditar.
- **Concorrencia (2 abas/dispositivos):** ledger ja resolve via `SELECT FOR UPDATE` no `walletService.recordTransaction`. Sem optimistic concurrency aqui (rakeback nao depende de saldo previo conhecido pelo cliente, diferente do "Reportar saldo").
- **Rakeback em wallet recem-criada (balance=0):** funciona normalmente; cria primeira transacao da wallet.
- **Valor com mais de 2 casas decimais:** truncado/bloqueado (alinhar com input atual de "Valor" do `WalletTransactionDialog` para consistencia).

## API Delta
**POST `/api/wallets/:id/transactions`** — sem novos campos. Apenas:
- `reason` agora aceita `'rakeback'` (RF-01).
- Backend rejeita `reason='rakeback' && direction='out'` com 400 (`{code: 'invalid_rakeback_direction'}`).

Body de exemplo (rakeback de R$ 50 numa wallet PokerStars BRL):
```json
{
  "direction": "in",
  "nativeAmount": 50.00,
  "reason": "rakeback",
  "note": "Rakeback semanal PokerStars 14-20/abr",
  "occurredAt": "2026-04-26T18:30:00Z"
}
```

## Modelos de Dados Afetados
**Nenhuma alteracao de schema SQL.** `wallet_transactions.reason` e `bankroll_snapshots.reason` sao `varchar` — aceitam `'rakeback'` automaticamente.

Alteracoes em codigo Zod:
| Arquivo | Mudanca |
|---|---|
| `shared/wallet-reasons.ts` | Adicionar `'rakeback'` em `WALLET_TX_REASONS_P0` e `WALLET_TX_REASONS` |
| `shared/schema.ts` | Adicionar `'rakeback'` em `BANKROLL_REASON_ENUM` |
| `client/src/lib/bankrollHelpers.ts` | Expandir `reasonLabel()` mapping |

## Cenarios de Teste Derivados

### Happy Path
- [ ] Abrir dialog do header `/bankroll`, escolher wallet PokerStars BRL, valor 50, salvar → transacao criada com `reason='rakeback', direction='in', nativeAmount=50, fxRate` correto.
- [ ] Abrir dialog do menu da wallet, valor 30 USD, com nota "Bonus pp", salvar → transacao criada, wallet pre-selecionada manteve-se.
- [ ] Apos submit, query `['wallets']` invalidada e saldo da wallet aumenta em 50.
- [ ] Espelhamento em `bankroll_snapshots` ocorre com `reason='rakeback'`.

### Validacao
- [ ] valor=0, negativo, vazio, NaN → botao desabilitado + mensagem.
- [ ] valor com 4 casas decimais → truncado para 2.
- [ ] note > 500 chars → bloqueado.
- [ ] occurredAt no futuro → bloqueado.

### Backend
- [ ] POST `reason='rakeback', direction='out'` → 400 `invalid_rakeback_direction`.
- [ ] POST `reason='rakeback'` em wallet de outro usuario → 403/404 (mesma protecao de ownership existente).
- [ ] POST `reason='rakeback'` em wallet `archived` → 422 `wallet_archived`.

### UI
- [ ] Carteiras `archived` nao aparecem no select do dialog.
- [ ] Trocar wallet reformata moeda do input.
- [ ] Historico mostra badge "Rakeback" com cor distinta.
- [ ] Filtro de reason no historico inclui "Rakeback".

### Backward-Compat (RF-08)
- [ ] Suite existente do `WalletTransactionDialog`, `BankrollHistoryTable`, `BankrollWidget` passa sem mudanca.
- [ ] `WalletTxReasonP0Schema.parse({reason: 'deposit'})` continua valido (idem para withdrawal/session_result/manual_adjustment).
- [ ] Nenhum diff em `db:push`.

## Telemetria
Logar 3 eventos no telemetry adapter existente (mesmo padrao do Tournament Selector):
| Evento | Quando | Payload |
|---|---|---|
| `rakeback_dialog_view` | `RakebackDialog` monta com `open=true` | `{walletId?: string, source: 'page_header' \| 'wallet_menu'}` |
| `rakeback_submit_success` | POST 2xx | `{walletId, nativeAmount, nativeCurrency}` |
| `rakeback_submit_error` | POST 4xx/5xx | `{walletId, errorCode, httpStatus}` |

Telemetry desabilitada por feature flag se ja for o padrao do projeto. **Sem PII** (nota e occurredAt nao logadas).

## Riscos e Mitigacoes
| Risco | Severidade | Mitigacao |
|---|---|---|
| Usuario reporta 2x mesmo rakeback (UI sem dedupe) | Baixa | Aceitar; mitigar com nota explicativa + futuro CRUD de transacao |
| Rakeback em moeda diferente da wallet | Media | Forcar moeda nativa da wallet (sem campo `currency` no dialog); usuario escolhe wallet certa |
| Confusao com "deposit" historico | Baixa | Badge visual distinta + label PT-BR + filtro no historico |
| Adicao de enum quebra Zod parse legado | Baixa | `varchar` no DB, sem migration; testes de regressao ja cobrem |

## Metricas de Sucesso
- **Adocao:** % de usuarios ativos que registram >= 1 rakeback em 30 dias pos-release. Meta inicial: > 20%.
- **Volume:** numero medio de rakebacks reportados por usuario ativo / mes. Meta inicial: 1-2.
- **Distribuicao:** rakeback como % de todas transacoes `direction='in'` excluindo `session_result`. Sinal de que esta tirando rakeback de "deposit" mascarado.

## Fora de Escopo
- Dashboard agregado de rakeback (por plataforma, periodo, % volume jogado) — Sprint Bankroll-3 ou posterior.
- Importacao automatica de rakeback (parser de planilha/CSV da sala) — fora.
- Recurring rakeback / agendamento — fora.
- Conversao automatica de moeda no dialog (rakeback em USD para wallet BRL) — fora.
- Categorizar `bonus`, `milestone_reward`, `tournament_leaderboard` — fora (YAGNI; promover `reason` para "category" se vierem mais).
- Editar/deletar transacoes de rakeback — usa o mesmo CRUD futuro generico de transactions.
- Auto-snapshot de rakeback de auto-import — sem fonte automatizada hoje.

## Dependencias
- Sprint Bankroll-2 (multi-wallet v2) — entregue (commit `69c03c7`).
- Sprint Bankroll-2.1 (Reportar saldo) — commitado (commit `3c31b28`); arquivos como `WalletTransactionDialog`, `walletService.recordTransaction`, `bankrollHelpers` ja existem.

## Notas de Implementacao (sugestoes)
- Adicionar `'rakeback'` no enum em `shared/wallet-reasons.ts` antes de tudo — destrava Test-Writer.
- Validacao no backend de `direction='in'` quando `reason='rakeback'` em `walletService.recordTransaction` (ou no schema Zod do endpoint via `superRefine`).
- `RakebackDialog` reusa `apiRequest` + invalidacao de queries no padrao existente do `WalletTransactionDialog`.
- Botao no header da `/bankroll` segue layout/spacing existente (alinhar com "Nova transacao").
- `useRakebackMutation` opcional (hook custom) para isolar logica do dialog — segue padrao `useWalletTransactionMutation` se existir.
- `reasonLabel()` helper deve ser typesafe via `Record<WalletTxReasonP0, string>` para falhar em compile-time se enum crescer.

## Q&A Interno (decisoes do founder)
- **Q1:** Endpoint dedicado ou reuso? **R:** Reuso de `/transactions` (justificado em RF-02).
- **Q2:** Modelar como `reason` ou `category`? **R:** `reason` (alinha com pattern; promover so se vierem mais ganhos extra-jogo — YAGNI).
- **Q3:** Sempre creditando saldo? **R:** Sim (`direction='in'` forcado).
- **Q4:** Permitir rakeback negativo? **R:** Nao. Validacao `> 0`.
- **Q5:** Dialog separado ou modo dentro de `WalletTransactionDialog`? **R:** Dialog separado (`RakebackDialog`) — fluxo enxuto, evita poluir o dialog existente que ja tem 2 modos (movement + balance).
- **Q6:** Conversao automatica de moeda? **R:** Nao (fora de escopo).
- **Q7:** Dashboard de rakeback agregado? **R:** Nao neste sprint — feature so cria a fundacao de dados (entrada via `reason='rakeback'`) que destrava o dashboard futuro.
