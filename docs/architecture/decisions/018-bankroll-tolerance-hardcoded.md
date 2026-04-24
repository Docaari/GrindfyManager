# ADR-018: Tolerancia de 1.5x hardcoded no MVP (nao configuravel por usuario)

## Status
Aceito

## Data
2026-04-24

## Contexto

O Tournament Selector (Sprint 1, ADR-015) ja aplica a regra:

```
bankrollThreshold = bankrollAmount * (rulePct / 100) * 1.5
```

Onde `1.5` e uma tolerancia que permite o jogador dar "shots" controlados acima da regra estrita. Exemplo: banca $500 com regra `1pct` = $5 estrito, mas torneios ate **$7.50** passam no filtro. Esse multiplicador foi introduzido no MVP do Selector para evitar que jogadores com banca apertada vissem a lista vazia a todo momento.

O Sprint 2 (Bankroll Management) precisa decidir: essa tolerancia continua hardcoded em `1.5`, ou vira parametro configuravel por usuario (`user_settings.bankroll_tolerance` ou similar)?

A **pergunta central:** ganhamos valor suficiente deixando o jogador configurar a tolerancia, considerando o custo de superficie de UI + schema + validacao?

### Contexto do usuario

- **Jogador iniciante (~60% da base esperada):** nao sabe o que e "tolerancia" nem por que a regra `1pct` deixa passar algo acima de 1%. Mais controles confundem.
- **Jogador intermediario (~30%):** entende shots, mas ja usa a propria regra (`2pct` ou `custom:3`) para controlar risco. Muda a regra, nao a tolerancia.
- **Jogador profissional (~10%):** muito disciplinado, usa `1pct` estrito. Considera qualquer shot como erro. Provavelmente preferiria desligar tolerancia (= 1.0x).

A decisao Q1 do spec ja foi tomada pelo founder em 2026-04-24: **hardcoded 1.5x, sem novo campo em `user_settings`**.

### Onde o valor `1.5` aparece hoje e onde aparecera

| Local | Uso |
|---|---|
| `server/routes/tournament-selector.ts:137` (funcao `bankrollThreshold`) | Filtro de torneios fora da regra (Sprint 1) |
| `server/scoring/bankrollRules.ts` (novo, Sprint 2) | Consolidacao da regra para o `bankrollService` |
| `server/services/bankrollService.ts:getBankrollState` (novo) | Response do `GET /api/bankroll` (`maxBuyInUSD`, `tolerance`) |
| `GrindSessionLive.tsx` (novo comportamento RF-08) | Modal de confirmacao "acima da regra" |
| Settings `Banca (Bankroll)` UI | "Letra miuda" explicando a tolerancia |

## Opcoes Consideradas

### Opcao A: Hardcoded 1.5x em `scoringConstants.ts`/`bankrollRules.ts` (ESCOLHIDA — Q1 founder)

Constante unica `BANKROLL_TOLERANCE = 1.5` exportada de `server/scoring/bankrollRules.ts` (novo modulo) e consumida por:
- `bankrollService` (response do GET).
- `tournamentScorer`/selector endpoint (mesma fonte).
- Grind Live modal (via response do endpoint).

- **Pros:**
  - **Simplicidade radical.** Uma constante, um lugar. Zero UI, zero schema, zero validacao, zero teste de edge case ("tolerancia invalida", "tolerancia negativa", "tolerancia=0 desabilita?").
  - **Consistencia Sprint 1 <-> Sprint 2.** Mesmo multiplicador, mesma fonte. Selector e Grind Live nao divergem.
  - **Faz o que 99% dos jogadores querem.** Pratica comum em comunidade profissional de MTT (1% da banca como regra + shots ocasionais 1.5-2x). O valor 1.5 e um compromisso razoavel.
  - **Reduz carga cognitiva na UI.** Settings ja tem `amount`, `rule`, `preferredCurrency`, `exchangeRates`. Tolerancia adicional entopica.
  - **Letra miuda resolve transparencia.** Q8 do spec: "shot permitido ate $X (1.5x)". Jogador que se importa ve; jogador que nao, fica com o valor base.
  - **Facil mudar no futuro.** Se telemetria mostrar que jogadores profissionais querem `1.0x` estrito, abrir ADR substituidor.
  - **Alinha com Q8 do spec** (tolerancia como letra miuda, nao campo principal da UI).

- **Contras:**
  - **Profissionais rigoristas nao conseguem desligar tolerancia.** Workaround: usar `custom:0.67` em vez de `1pct` para compensar matematicamente (1 / 1.5 = 0.67). Feio, mas funcional.
  - **Se a comunidade evoluir para valor diferente (ex: 2x virou padrao), precisa de deploy.** Migracao e trivial (mudar constante).

### Opcao B: Campo `bankroll_tolerance` em `user_settings` (configuravel, default 1.5)

Adicionar coluna `user_settings.bankroll_tolerance DECIMAL DEFAULT 1.5 CHECK (bankroll_tolerance BETWEEN 1.0 AND 3.0)`. UI nova em Settings. Validacao Zod + migration.

- **Pros:**
  - **Flexibilidade total.** Jogador rigorista escolhe `1.0`, jogador agressivo escolhe `2.0`.
  - **Futuro-proof.** Se comunidade adotar padroes diferentes, produto nao precisa redeploy.
  - **Profissionais ganham controle explicito.**

- **Contras:**
  - **+1 campo em schema, +1 migration, +1 input na UI, +1 input em tela de onboarding futura.** Custo real de manutencao.
  - **Confusao conceitual "regra vs tolerancia".** Muitos jogadores ja confundem "1pct" com "1% literal" sem shot. Adicionar tolerancia configuravel amplifica o bug de mental model.
  - **Teste extra: combinatorias de `rule * tolerance`.** `custom:3` com tolerancia `2.0` = shots ate 6% da banca. E isso valido? Precisa tabular.
  - **Superficie de UI cresce.** Q8 do spec ja estava dividido entre "mostra 2 numeros" vs "letra miuda". Adicionar slider de tolerancia piora o problema.
  - **MVP aumenta escopo sem valor comprovado.** Zero evidencia de demanda. Nao temos dados (Sprint 1 so ativou bankroll agora).
  - **Incompativel com Q1 do founder** (decidido hardcoded).

### Opcao C: Tolerancia por regra (mapa fixo)

Hardcoded mas com valor diferente por `rule`:
- `1pct` -> `1.5x` (apertado, permite shots)
- `2pct` -> `1.25x` (moderado, menos shots)
- `5pct` -> `1.0x` (agressivo, sem tolerancia adicional)
- `custom:X` -> `1.5x` (default)

- **Pros:**
  - **Comunica intencionalidade.** "Quanto mais apertada a regra, mais tolerancia precisa ter."
  - **Sem superficie de UI.**

- **Contras:**
  - **Inventa ciencia de poker que nao existe.** A escolha `1pct -> 1.5x` e `5pct -> 1.0x` e palpite sem evidencia. Comunidade usa 1.5x mais ou menos em qualquer regra.
  - **Dificil de explicar na letra miuda.** "Shot permitido ate X (varia conforme regra)" vs "Shot permitido ate X (1.5x)". Primeiro e mais confuso.
  - **Teste extra:** matriz `rule x tolerancia` em regression de Selector. Nao agrega.

### Opcao D: Dois thresholds expostos (`softLimit` e `hardLimit`)

Nao existe tolerancia — existem dois limites:
- `softLimit = amount * rulePct` (1.0x)
- `hardLimit = amount * rulePct * 2.0` (2.0x)

Torneios entre `soft` e `hard` tem warning; acima de `hard` sao bloqueados.

- **Pros:**
  - **Semantica clara.** "Soft" e regra literal, "Hard" e teto absoluto.
  - **Alinha com RF-10 do spec** que ja introduz `out_of_bankroll_soft` e `out_of_bankroll` (hard).

- **Contras:**
  - **Muda o contrato existente do Sprint 1** que define `bankrollThreshold = amount * rulePct * 1.5`. Refatoracao + compatibilidade.
  - **Hard em 2.0x e arbitrario.** Mesmo problema do 1.5x — continua sendo palpite.
  - **NA VERDADE, e o que ja implementamos com outra aritmetica.** O `1.5x` hoje e o "hard" do Sprint 1 (`out_of_bankroll` se acima de 1.5x) e o "soft" e o proprio `1.0x`. O spec RF-10 ja descreve exatamente isso sem precisar de decisao nova.

## Decisao

**Adotar Opcao A: `BANKROLL_TOLERANCE = 1.5` hardcoded, em conformidade com Q1 do founder (2026-04-24).**

### Detalhes

1. **Constante em `server/scoring/bankrollRules.ts`** (novo modulo que centraliza parsing de rule + calculo de threshold):
   ```typescript
   export const BANKROLL_TOLERANCE = 1.5;
   // Mantem compatibilidade com bankrollThreshold() do Sprint 1
   export function calculateMaxBuyIn(amount: number, rulePct: number): number {
     return amount * (rulePct / 100) * BANKROLL_TOLERANCE;
   }
   ```

2. **Exposto no response de `GET /api/bankroll`** como campo `tolerance: 1.5` — o frontend usa para render da letra miuda ("shot permitido ate $X (1.5x)").

3. **RF-10 reutiliza duas constantes:**
   - `softLimit = amount * rulePct` (sem tolerancia)
   - `hardLimit = amount * rulePct * BANKROLL_TOLERANCE` (com tolerancia)
   
   Torneios entre `soft` e `hard` recebem warning `out_of_bankroll_soft`; acima de `hard` recebem `out_of_bankroll` e sao filtrados se `bankrollFilter=true`.

4. **UI minimalista (Q8):** Settings nao tem input de tolerancia. Display "Buy-in maximo recomendado: $X.XX" usa `softLimit`. Letra miuda: "Shots ocasionais aceitos ate $Y (1.5x)".

5. **Workaround para rigoristas:** jogador que quer tolerancia efetiva 1.0x usa `custom:0.67` como regra (matematicamente equivalente a `1pct` estrito). Documentado como dica em FAQ (fora do escopo desta feature — backlog).

## Consequencias

### Positivas
- **Escopo Sprint 2 reduzido em ~3h de dev.** Sem UI de tolerancia, sem migration, sem teste de combinatoria.
- **Consistencia Sprint 1 <-> Sprint 2 trivial.** Uma constante, um import.
- **Mental model do jogador simples.** Regra = 1pct. Sistema permite shots ocasionais ate 1.5x. Dois numeros para entender, nao tres.
- **Mudanca futura e 1-liner.** Se telemetria (adicionar metrica de "quantos `out_of_bankroll_soft` foram confirmados no Grind Live") mostrar que o valor 1.5 esta errado, abrir ADR-019 trocando a constante.
- **Alinha com pesos hardcoded do scoring (ADR-015).** Mesma filosofia — palpite informado no MVP, calibragem pela telemetria.

### Negativas
- **Profissionais rigoristas nao tem caminho "limpo".** Workaround `custom:0.67` e feio; precisa ser documentado.
- **Valor 1.5 pode estar errado para alguns cohortes.** Aceitamos perda de precisao ate RF-07 (tournament_selector_logs) + futuro `bankroll_events_log` fornecerem dados.
- **Se `custom:X` ganhar casas decimais (Q2 do spec aceita 1 casa, ex `custom:3.5`), a combinacao "`custom:0.67`" como workaround fica mais visivel — jogador pode perguntar "por que 0.67 e nao 1.0?". Documentar.**

### Neutras
- **Nao bloqueia migrar para Opcao B no futuro.** Adicionar `bankroll_tolerance` em `user_settings` com default 1.5 mantem compatibilidade retroativa. Campo pode entrar em Sprint 2.5 ou 3 se houver demanda.
- **Constante morar em `server/scoring/bankrollRules.ts` alinha com Sprint 1.** Esse arquivo e criado/refatorado agora para consolidar a logica antes espalhada em `routes/tournament-selector.ts`.

## Gatilhos para revisao futura

| Gatilho | Acao |
|---|---|
| Telemetria mostrar >30% dos jogadores confirmando shots acima de 1.5x em Grind Live | Considerar aumentar constante para 2.0 ou tornar configuravel |
| Telemetria mostrar <5% dos jogadores aceitando shots soft | Considerar remover tolerancia (1.0x) |
| Pedido explicito de 3+ jogadores pro para configurar | Avaliar Opcao B (campo em user_settings) |
| Comunidade BR de MTT publicar "best practice" diferente (ex: 1.3x virou consenso) | Atualizar constante |

## Confianca

**Alta** para o MVP. Valor consistente com Sprint 1 ja em producao. Risco de "valor errado para alguns" e mensuravel e tem caminho de evolucao documentado.

## Referencias

- Spec: `docs/specs/bankroll-management.md` (Q1, Q8, RF-01, RF-10)
- ADR-015: filosofia de "palpite informado no MVP, calibragem pela telemetria"
- ADR-017: tabela `bankroll_snapshots` — este ADR complementa ao fixar a regra de comparacao
- Sprint 1: `server/routes/tournament-selector.ts:137` `bankrollThreshold()` ja usa 1.5 — este ADR documenta retroativamente
