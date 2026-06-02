# Spec: Fase C #4 — Tilt Tipado (7 tipos) + Antídoto

## Status
Proposta

## Resumo
Classifica cada episódio de tilt registrado no cool-down em **um dos 7 tipos psicológicos** da taxonomia de Tendler (D1 do curso), oferece o **antídoto distinto** de cada tipo na hora (pós-assessment) e na aba Mental do perfil, e agrega "seu tipo de tilt mais frequente" ao longo do tempo. Para o jogador profissional de MTT que hoje só captura score + gatilhos situacionais + texto livre, mas nunca tipifica o tilt nem recebe a alavanca certa.

## Contexto
A captura crua de tilt já existe (`cooldown_logs.tiltSelfAssessment`: `feltTilt`, `keptTilting`, `presence`, `triggers[]`, `action`). O que falta — e o curso D1 prega como tese central — é que **"estou tiltado" tem o valor de "estou com dor": é sintoma, não diagnóstico**. Cada um dos 7 tipos tem causa, sintoma e **antídoto diferentes**. Sem tipificar, o jogador não sabe qual alavanca puxar.

Esta é a peça **#4 do board ICE (7.7)** da Fase C, **âncora curso D1**, e **REFINA o #5** (stop-loss a frio): o tipo `desperation` é exatamente o que exige a regra mecânica do #5 — mas o #5 (Fase D) está fora de escopo aqui (ver Fora de Escopo).

Irmã da Fase B (ADR-228): aquele sprint expôs lead measures já capturados (warm-up compliance + A/B/C-game) na aba Mental lendo `cooldown_logs` read-only. O tilt tipado segue o mesmo molde: estende a captura mínima + agrega read-only no mesmo padrão de `cooldownAnalytics.ts`.

**Fonte de verdade do conteúdo (NÃO inventar poker):** `B:/A anatomia de um Spot/antes_das_cartas/Bloco D - Tilt, Emocao e Regulacao/TXT Conteudo/D1 - Voce Nao Esta Tiltado — Esta Em Um dos Sete.md` §2.4 (taxonomia canônica + verbatim Tendler) e §15.1 (gatilho + antídoto contextualizados ao MTT). Resumo citável em `Docs/strategy/curso-antes-das-cartas-learnings-2026-06-01.md` §6/§7.

## Usuários
- **Jogador profissional de MTT (todos os tiers — SEM tier gate):** no cool-down pós-sessão escolhe o tipo de tilt (ou aceita a sugestão heurística), lê o antídoto, e consulta seu tipo dominante na aba Mental. Paridade com `stat_analysis` (EST-3) e Fase B, que não gateiam por tier.

---

## Os 7 Tipos de Tilt (catálogo estático — conteúdo extraído do curso D1)

> Extraído fielmente de D1 §2.4 (tabela canônica + definições verbatim de Tendler) e §15.1 (gatilho de pico + antídoto contextualizados ao MTT). O `defaultTrigger` mapeia para os `TILT_TRIGGERS` situacionais já existentes quando há correspondência; `null` quando o tipo não tem gatilho situacional 1:1 (a derivação heurística trata isso — ver RF-02).

| id | label (PT-BR) | gatilho de pico no MTT (do curso §15.1) | antídoto (do curso §15.1) | `defaultTrigger` mapeado |
|---|---|---|---|---|
| `running_bad` | Tilt da Fase Ruim | Seca de deep runs (2-4 semanas sem cravada, gráfico negativo); atribui o tilt ao downswing | Inversão causal: "dos outros 6 tipos, qual aparece com mais força nesta fase?" e tratar ESSE. O downswing revelou, não criou. | `downswing` |
| `injustice` | Tilt de Injustiça | Cooler/suckout perto da bubble, na bubble ou em FT (ICM amplifica) | Logic statement de variância ensaiado p/ alto ICM: "este all-in tinha equity X; perdê-lo é amostra de uma distribuição que escolhi; a bubble não muda a matemática da carta". Aplicar ANTES de registrar o próximo. | `cooler` |
| `hate_losing` | Tilt de Ódio à Derrota | Bust após deep run, ou bust em FT — a dor do quase-prêmio | Reframe de bust como custo operacional do MTT: a maioria das entradas não cobra (fato estrutural, não falha). O lucro é líquido, depois dos busts. | `null` |
| `mistake` | Tilt de Erro | Erro próprio revelado em revisão (shove mal dimensionado, call de ICM errado, misclick crítico). Risco: confundir azar com erro. | Auto-compaixão; separar processo de outcome (liga C7). O erro vira dado p/ a próxima sessão de estudo, não veredicto sobre o jogador. | `null` |
| `entitlement` | Tilt de Direito | Perder para um recreational que jogou um range "impossível" e floupou | Correção de calibração: "quero que recreationals joguem assim e ganhem às vezes — é daí que vem meu EV. O poker não deve nada." | `null` |
| `revenge` | Tilt de Vingança | Um vilão específico te deu suckout e reaparece; você passa a checar a stack dele antes da sua | Antídoto mecânico: trocar de mesa, ocultar HUD do vilão, ou encerrar a sessão. "Minha estratégia se define pelo plano que estudei, não pela pessoa na minha frente." | `briga-interpessoal` |
| `desperation` | Tilt de Desespero | Late reg de high roller fora do schedule p/ "recuperar o dia" (ABI acima do confortável + edge reduzido + estado comprometido) | Stop-loss mecânico inegociável, definido a frio (em BIs ou horas). O jogador em desperation NÃO pode decidir parar; a regra é tomada antecipadamente. (Conecta #5 / Fase D.) | `null` |

**Notas de catálogo:**
- Os labels EN canônicos: running-bad, injustice, hate-losing, mistake, entitlement, revenge, desperation.
- `running_bad` é o "guarda-chuva" — Tendler diz que não é um tilt em si, mas o catálogo o inclui como opção (o antídoto é diagnosticar qual dos outros 6 está ativo).
- O catálogo NÃO inclui Winner's Tilt ("+1" do curso, euforia pós-cravada) — o board #4 fala em "7 tipos". Winner's tilt fica fora de escopo (mencionado, não implementado).
- Conteúdo é folk model (D1 nota epistêmica) — `description` do catálogo deve usar linguagem contextual ("nesta fase meu tilt dominante tem sido X"), NUNCA de identidade ("eu SOU um jogador de injustice"). Tom A4 (cobra comportamento, não caráter).

---

## Requisitos Funcionais

### RF-01: Catálogo estático dos 7 tipos (`shared/tilt-types.ts`)
**Descrição:** Novo módulo compartilhado com os 7 tipos, paridade com `shared/hud-stat-catalog.ts`. Fonte única consumida por backend (validação + agregação + antídoto) e frontend (seletor + exibição).
**Regras de negócio:**
- Cada tipo: `{ id, label, description, defaultTrigger, antidote }` (campos exatos do catálogo acima; `defaultTrigger: TiltTrigger | null`).
- `TILT_TYPE_IDS` = tupla `as const` dos 7 ids → `tiltTypeSchema = z.enum(TILT_TYPE_IDS)` + `type TiltTypeId`.
- Helper `getTiltType(id): TiltTypeMeta | undefined` + `isValidTiltType(id): boolean`.
- Conteúdo (`label`/`description`/`antidote`) derivado **literalmente** do curso D1 §2.4 + §15.1. Test-writer e implementer NÃO inventam texto de poker.
**Critério de aceitação:**
- [ ] `TILT_TYPE_IDS.length === 7` (validado por presença individual de cada id, NÃO por length absoluta — lesson #8).
- [ ] Cada um dos 7 ids tem os 5 campos não-vazios.
- [ ] `defaultTrigger`, quando não-null, é um valor presente em `TILT_TRIGGERS`.
- [ ] `getTiltType('injustice')?.antidote` contém "variância" (sentinela de conteúdo do curso).
- [ ] `isValidTiltType('winners_tilt') === false`.

### RF-02: Tipificação no cool-down (jogador escolhe; heurística sugere) — DECISÃO (c)
**Descrição:** O jogador escolhe o tipo de tilt no fluxo de cool-down. Se não escolher, uma derivação heurística determinística sugere o tipo provável a partir dos `triggers[]` + scores já capturados. Estende `tiltSelfAssessmentSchema` com `tiltType?` (nullable, jsonb interno — Zod-only, SEM migration).
**Regras de negócio:**
- Novo campo no `tiltSelfAssessmentSchema`: `tiltType: tiltTypeSchema.nullable().optional()` (lesson #7 — nullable+optional, back-compat com registros antigos sem o campo).
- `tiltType` só é relevante quando há tilt declarado. Regra de gating: se `feltTilt === 0` E `keptTilting === 0`, `tiltType` é ignorado (não há tilt a tipificar) — o backend não persiste valor mesmo se enviado.
- **Heurística de sugestão** (função pura `suggestTiltType(assessment): TiltTypeId | null`, determinística, server-side):
  - Mapeamento direto por trigger presente (precedência na ordem abaixo, primeiro match vence):
    1. `briga-interpessoal` → `revenge`
    2. `cooler` OU `slowroll` OU `big-bluff-fail` → `injustice`
    3. `downswing` → `running_bad`
  - Se nenhum trigger mapeável presente E `keptTilting >= 7` → `desperation` (manteve tiltando alto = chasing provável).
  - Se nenhum dos acima → `null` (não chuta; jogador decide). `distracao`/`fome`/`sono`/`outro` NÃO mapeiam para tipo (são estados aversivos genéricos, não tipos de tilt — Berkowitz: somam afeto negativo, não são um tipo).
- A escolha explícita do jogador SEMPRE vence a sugestão. A sugestão é exibida como "Parece tilt de ___?" pré-selecionável, nunca auto-gravada sem confirmação (lesson #11 — sem ação decorativa default; o tipo só persiste se o jogador confirmar/selecionar).
**Critério de aceitação:**
- [ ] `tiltSelfAssessmentSchema.parse({...semTiltType})` continua válido (back-compat).
- [ ] `parse({ tiltType: 'injustice', ... })` aceita; `parse({ tiltType: 'foo', ... })` rejeita.
- [ ] `suggestTiltType` com `triggers:['cooler']` → `'injustice'`.
- [ ] `suggestTiltType` com `triggers:['briga-interpessoal','cooler']` → `'revenge'` (precedência).
- [ ] `suggestTiltType` com `triggers:['fome'], keptTilting: 8` → `'desperation'`.
- [ ] `suggestTiltType` com `triggers:['fome'], keptTilting: 2` → `null`.
- [ ] `suggestTiltType` com `triggers:[]` e scores baixos → `null`.

### RF-03: Antídoto surfaced (pós-assessment + aba Mental)
**Descrição:** Quando um tipo é selecionado/confirmado no cool-down, exibir 1 antídoto claro do catálogo (o do tipo). O antídoto também aparece na aba Mental, atrelado ao tipo dominante.
**Regras de negócio:**
- Superfícies mínimas (founder sensível a UX confusa — manter enxuto, lesson #11):
  1. **Pós-assessment no cool-down:** card com `label` + `antidote` do tipo selecionado. UM antídoto, do tipo detectado. Sem lista de 7.
  2. **Aba Mental do perfil:** o antídoto do tipo dominante (RF-04) exibido junto da estatística de frequência.
- Antídoto vem do catálogo (RF-01) por `tiltType` — nunca texto gerado/LLM.
- Se `tiltType` é `null` (jogador não tipificou e heurística não sugeriu), NÃO exibir antídoto (sem fallback decorativo — lesson #11).
**Critério de aceitação:**
- [ ] Selecionar `revenge` no cool-down exibe o antídoto mecânico ("trocar de mesa / ocultar HUD").
- [ ] `tiltType` null → nenhum card de antídoto renderizado.
- [ ] O texto do antídoto exibido === `getTiltType(id).antidote` (sem divergência).

### RF-04: Agregação read-only — "tipo de tilt mais frequente" + frequência no tempo
**Descrição:** Endpoint + método de storage que agrega os `tiltType` dos `cooldown_logs` do usuário numa janela, no padrão `cooldownAnalytics.ts` / Fase B. Read-only, stateless.
**Regras de negócio:**
- Método `storage.getTiltTypeDistribution(userId, period)` (`period ∈ {'7d','30d','90d'}`, default `'30d'`).
- Contrato de retorno:
  ```ts
  {
    period: '7d' | '30d' | '90d';
    totalAssessments: number;        // cool-downs com tilt declarado (feltTilt>0 || keptTilting>0) na janela
    typedCount: number;              // quantos desses tinham tiltType não-null
    dominant: TiltTypeId | null;     // tipo mais frequente; null se typedCount===0 ou empate sem desempate
    distribution: Array<{ tiltType: TiltTypeId; count: number; sharePct: number }>; // desc por count; sharePct sobre typedCount
    dataSufficiency: 'ok' | 'low';   // 'low' quando typedCount < 3 (amostra insuficiente p/ falar em "dominante")
  }
  ```
- `dominant`: maior `count`. Empate → `null` (não cravar dominante arbitrário; padrão dataSufficiency da Fase B).
- `sharePct` = `count / typedCount` (0 quando typedCount===0). NUNCA dividir por totalAssessments (registros sem tipo não entram no denominador da distribuição).
- Só conta cool-downs com tilt declarado (`feltTilt>0 || keptTilting>0`); cool-downs "zero tilt" não poluem.
- Endpoint `GET /api/analytics/tilt-type-distribution` — auth + ownership rigoroso + `Cache-Control: private, max-age=300`, idêntico aos handlers de `cooldownAnalytics.ts`.
- **PII/segurança (lesson Fase B R5 — TRAVADO):** `action` (texto livre) e quaisquer notas NUNCA entram na agregação nem na resposta. Só `tiltType` (enum) + contagens. A resposta NÃO contém nenhum campo de texto livre do usuário.
**Critério de aceitação:**
- [ ] 5 logs `injustice` + 2 `revenge` (typedCount 7) → `dominant: 'injustice'`, share injustice ≈ 71.4.
- [ ] typedCount 2 → `dataSufficiency: 'low'`.
- [ ] Empate 3×`injustice` / 3×`mistake` → `dominant: null`.
- [ ] Logs com `feltTilt:0, keptTilting:0` ignorados em `totalAssessments`.
- [ ] Resposta NÃO contém `action` nem texto livre (assert ausência da chave).
- [ ] GET sem auth → 401; `period=foo` → 400; user A não vê dados de user B.

### RF-05: UI mínima e verificável no browser
**Descrição:** Wirar RF-02/03/04 na UI existente do cool-down e da aba Mental, mínimo e testável.
**Regras de negócio:**
- Cool-down: seletor dos 7 tipos (chips/radio) com sugestão heurística pré-destacada ("Parece tilt de ___?"); card de antídoto abaixo após seleção.
- Aba Mental (mesma superfície da Fase B): widget "Seu tilt mais frequente" — tipo dominante + sharePct + antídoto; estado `dataSufficiency:'low'` mostra "amostra pequena, continue registrando"; `dominant:null`/typedCount 0 mostra empty state (sem antídoto decorativo).
- Componentes com `data-testid` estáveis (lesson #2): `tilt-type-selector`, `tilt-type-option-{id}`, `tilt-antidote-card`, `mental-tilt-dominant`.
**Critério de aceitação:**
- [ ] Selecionar um tipo renderiza `tilt-antidote-card` com o texto correto.
- [ ] Aba Mental renderiza `mental-tilt-dominant` com tipo + share quando há dados.
- [ ] **VERIFY OBRIGATÓRIO no browser** (parte do "done" — sprint anterior shippou sem verify e quebrou): registrar um cool-down com tilt, escolher tipo, ver antídoto; abrir aba Mental e ver o dominante. Sinalizado ao reviewer/deployer.

## Requisitos Não-Funcionais
- **Performance:** `getTiltTypeDistribution` em uma query agregada por janela; endpoint responde < 200ms p95; cache 5min (paridade Fase B).
- **Segurança/PII:** texto livre (`action`, notas) NUNCA na agregação ou resposta (RF-04). Ownership rigoroso por `userId`.
- **Disponibilidade:** falha de agregação → 500 com `console.error` ANTES (lesson #9), nunca engole erro silencioso. Distinguir "sem dados" (200 com distribution vazia) de "DB explodiu" (500).
- **Compat:** registros antigos sem `tiltType` (back-compat lesson #7) tratados como `typedCount` não incrementado, sem quebrar.

## Endpoints Previstos
| Método | Rota | Descrição | Auth |
|---|---|---|---|
| GET | /api/analytics/tilt-type-distribution | Distribuição de tipos de tilt + dominante na janela (read-only) | JWT |

> O cool-down já tem endpoint de update (PATCH em `cooldown_logs` via `storage.updateCooldownLog`, linha 6840) que persiste `tiltSelfAssessment` inteiro como jsonb. **Nenhum endpoint novo de escrita** — `tiltType` viaja dentro do `tiltSelfAssessment` jsonb existente.

## Modelos de Dados Afetados

### `cooldown_logs.tiltSelfAssessment` (jsonb — ALTERAÇÃO de shape interno, SEM migration)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| feltTilt | number | 0-10 | (existente) |
| keptTilting | number | 0-10 | (existente) |
| presence | number | 0-10 | (existente) |
| triggers | TiltTrigger[] | enum existente | (existente) gatilhos situacionais |
| action | string | max 500 | (existente) texto livre — NUNCA agregado/exposto |
| **tiltType** | TiltTypeId \| null | enum dos 7, **nullable optional** | **NOVO** — Zod-only, dentro do jsonb existente |

> **DECISÃO TRAVADA — SEM migration / SEM ALTER TABLE.** `tiltType` é campo dentro do jsonb `tilt_self_assessment` que já existe (`shared/schema.ts:3571`). Adicionar à `tiltSelfAssessmentSchema` (linha 3857) é mudança Zod-only. Confirma o padrão lesson #7 (nullable+optional p/ deprecação/adição gradual). Nenhuma coluna nova, nenhuma tabela nova.

### `shared/tilt-types.ts` (NOVO módulo — não é tabela)
Catálogo estático (RF-01). Paridade `hud-stat-catalog.ts`.

## Integrações Externas
Nenhuma. Sem LLM, sem serviço externo. Antídoto é estático do catálogo (não-gerado).

## Cenários de Teste Derivados

### Happy Path
- [ ] Jogador registra cool-down com `triggers:['cooler']` → heurística sugere `injustice` → confirma → antídoto de variância exibido → aba Mental mostra `injustice` como dominante após N registros.

### Validação de Input
- [ ] `tiltType` ausente (registro antigo) → schema válido, back-compat (lesson #7).
- [ ] `tiltType` enum inválido → `parse` rejeita.
- [ ] `period` inválido no endpoint → 400.
- [ ] GET sem auth → 401.

### Regras de Negócio
- [ ] Escolha explícita do jogador vence sugestão heurística.
- [ ] `feltTilt:0, keptTilting:0` → tiltType ignorado, não persiste, não conta em totalAssessments.
- [ ] Heurística: precedência `revenge` > `injustice` > `running_bad` > `desperation`(score) > null.
- [ ] `dominant` empate → null.
- [ ] sharePct sobre `typedCount`, não `totalAssessments`.
- [ ] `dataSufficiency:'low'` quando typedCount < 3.
- [ ] Antídoto exibido === catálogo (sem divergência de texto).

### Edge Cases
- [ ] Nenhum cool-down na janela → 200 com `distribution:[]`, `dominant:null`, `dataSufficiency:'low'`, `totalAssessments:0`.
- [ ] Todos os cool-downs sem `tiltType` (legado) → `typedCount:0`, `dominant:null`, distribution vazia, mas `totalAssessments` reflete os com tilt declarado.
- [ ] Mix de registros tipados e não-tipados → só tipados na distribution.
- [ ] **PII:** resposta da agregação inspecionada — NÃO contém `action`/notas/texto livre (assert ausência).
- [ ] User A não acessa distribution de User B (ownership).
- [ ] DB lança erro → 500 com log antes do fallback (lesson #9), não 200 mascarado.
- [ ] Heurística com mock de `tiltSelfAssessment` no shape REAL (lesson #3 — validar shape do storage antes de mockar; mock idealizado já passou 3 bugs CRITICAL em sprints anteriores).

## Fora de Escopo
- **#5 Stop-loss a frio (Fase D):** `desperation` aponta para a regra mecânica, mas a regra em si (stop-loss em BIs/horas, definido a frio) é o #5, sprint separado. Aqui só tipificamos + antídoto textual.
- **#10 Mental × resultado (cruzar tilt × P&L):** sprint separado da Fase C. NÃO cruzar tilt com lucro/perda aqui.
- **Winner's Tilt:** o "+1" do curso (euforia pós-cravada) NÃO entra no catálogo de 7. Mencionado, não implementado.
- **sourceMetric mental para Metas (METAS-1 RF-15):** a categoria `mental_tilt` existe no CHECK de `goals` mas o sourceMetric foi deferido. Este #4 HABILITA um sourceMetric mental futuro (frequência de tilt tipado), mas NÃO o implementa. Mencionado para o architect, não escopo.
- **Logic statements personalizados pré-escritos pelo jogador:** o curso prega o jogador escrever seu próprio logic statement a frio. Aqui o antídoto é o estático do catálogo. Logic statement editável = fase futura.
- **LLM/narrativa:** zero LLM. Antídoto é estático.
- **Body check / cadência de detecção precoce (D1 §15.3):** fora de escopo.

## Dependências
- `cooldown_logs` + `tiltSelfAssessment` jsonb (existe, `schema.ts:3571`).
- `TILT_TRIGGERS` enum (existe, `schema.ts:3842`) — `defaultTrigger` referencia.
- Padrão `cooldownAnalytics.ts` + Fase B (ADR-228) para o endpoint de agregação.
- Aba Mental do perfil (superfície da Fase B) para exibir o dominante.
- Fonte de conteúdo: curso D1 (caminho na seção Contexto) — LER, não inventar.

## Notas de Implementação (para o System-Architect / Implementer)
- **Catálogo:** `shared/tilt-types.ts` espelha `hud-stat-catalog.ts` (tupla `as const` → `z.enum`). Conteúdo literal do curso §2.4 + §15.1.
- **Schema:** adicionar `tiltType: tiltTypeSchema.nullable().optional()` ao `tiltSelfAssessmentSchema` (linha 3857). Importar de `shared/tilt-types.ts`. Sem migration.
- **Heurística:** função pura `suggestTiltType` (sem I/O) — fácil de testar isolada, padrão dos helpers puros de `server/coach/goals/` e `server/coach/adherence/`.
- **Storage/endpoint:** `getTiltTypeDistribution` + handler em `cooldownAnalytics.ts` (mesmo arquivo, mesmos helpers `resolvePeriod`/`setCacheHeader`/`userIdOf`/`unauthorized`). Registrar no `registerCooldownAnalyticsRoutes`.
- **Padrão de injeção de storage (lesson #34/#3):** Fase B usou `import { storage }` + `vi.mock` (não injectedStorage). Manter consistência com `cooldownAnalytics.ts` (que importa `storage` direto). Test-writer deve mockar `storage.getTiltTypeDistribution` no shape REAL retornado.
- **git add EXPLÍCITO** (tree compartilhada, incidente #24/#45) — nunca `git add -A`.
- **Branch:** `feature/fase-c-4-tilt-tipado` off `origin/main`.
- **NÃO plugar** no motor de aderência ADR-227 nem em Metas (apenas habilita futuro).
