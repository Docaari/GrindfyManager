# ADR-030: Telemetria do warm-up Sprint W-1 e client-side via console.log (sem persistencia server-side)

## Status
Aceito

## Data
2026-04-25

## Contexto

A Sprint W-1 do warm-up (`Docs/specs/warm-up-sprint-w1-spec.md`, RF-19, Secao 11) define 9 eventos de telemetria que precisam ser instrumentados:

| Evento | Trigger | Props |
|--------|---------|-------|
| `warmup_started` | Mount WarmUpRunner | userId, ritualId, startedAt, viewport |
| `block_completed` | Avance de bloco | userId, ritualId, blockId, durationSeconds, blockData |
| `emotional_check_submitted` | Submit score Bloco 1 | userId, ritualId, score |
| `gate_triggered` | score < 6 dispara modal | userId, ritualId, score |
| `override_used` | Confirmacao dupla aceita | userId, ritualId, score |
| `warmup_completed` | POST 201 com version=full | userId, ritualId, durationMinutes, decisionToPlay, overrideUsed |
| `warmup_aborted` | POST com version=aborted ou abandono | userId, ritualId, reason, lastBlockId |
| `weekly_heuristics_saved` | Save heuristicas no Bloco 2 | userId, source |
| `grind_blocked_by_gate` | Tentou /grind sem warm-up | userId, reason |

Esses eventos sao **especialmente importantes** para a Sprint W-1 porque:
1. **ADR-027 (soft-gate)** depende de `gate_triggered` + `override_used` para mensurar % de override e decidir migrar para hard.
2. **R-1, R-2 do plano** ("override loophole" e "10min eh muito") so podem ser validados/refutados via telemetria.
3. **Roadmap futuro (W-2 IZOF, W-2 Coach Review)** precisa de baseline desses eventos para construir features de inteligencia.

A pergunta arquitetural: **como instrumentar esses eventos sem inflar escopo da Sprint W-1?**

### Restricoes

- **Sprint W-1 ja tem escopo grande:** 22 RFs, 14 tarefas atomicas, 30+ testes minimos, 7 componentes novos, 3 hooks novos, schema migration, 4 endpoints. Nao podemos somar "pipeline server-side de analytics" ao sprint.
- **Projeto nao tem analytics provider integrado.** Existem tabelas `user_activities` / `user_activity` / `analytics_daily` (CLAUDE.md), mas elas servem casos diferentes (page views, login, upload). Adaptar ou criar `warmup_events` exigiria: schema novo, endpoint POST `/api/telemetry/*`, batching client, retry logic, schema versioning - sprint de analytics inteira.
- **Privacy:** dados de score emocional + decisao "vou jogar mesmo em estado ruim" sao sensiveis. Persistir requer politicas de retencao explicitas - nao temos policy formalizada.
- **Custo de errar contratos de evento:** se persistirmos no banco com schema X e depois descobrirmos que props Y e necessario, migration de eventos antigos e dolorosa. Validar shape com console.log primeiro e barato.
- **Maioria dos eventos ja ESTARAO persistidos como side-effect dos POST de ritual.** `gate_triggered` corresponde a `version='aborted' + decisionToPlay=false` OR `overrideUsed=true`. `warmup_completed` corresponde a row com `version='full'`. Telemetria duplica sinal - seu valor incremental nesta sprint e validar contratos, nao alimentar dashboard.
- **Browser DevTools dao filter+search nativo** sobre console.log. Para validar que eventos disparam corretamente, console.log e ferramenta suficiente.

## Opcoes Consideradas

### Opcao A: Telemetria client-only via console.log estruturado (ESCOLHIDA)

`useWarmupTelemetry.ts` expoe funcao `track(eventName, props)` que internamente faz:
```ts
console.log('[telemetry][warmup]', eventName, { ...props, ts: new Date().toISOString() });
```

Sem rede, sem batching, sem persistencia. Validavel via DevTools console + filtro `[telemetry][warmup]`.

- **Pros:**
  - **Custo zero de infra.** Sem novo endpoint, sem nova tabela, sem cron, sem batching.
  - **Validacao rapida.** Browser DevTools com filtro `[telemetry][warmup]` mostra todos eventos de uma sessao em ordem. Test E2E (manual ou Playwright) verifica trivial.
  - **Permite calibrar contratos antes de instrumentar.** Se descobrirmos que precisamos de prop `viewportWidth` em `warmup_started`, mudar e 1 linha. Sem migration.
  - **Side-effect ja persistido.** Eventos importantes (`warmup_started/completed/aborted`, `gate_triggered`, `override_used`) tem espelho fiel em `warmup_rituals` (campos `version`, `decisionToPlay`, `overrideUsed`, `emotionalCheckScore`). Se quisermos % override apos sprint, query SQL em `warmup_rituals` substitui agregacao de eventos.
  - **Privacy nativa.** Dados nao saem do browser do usuario. Sem GDPR/LGPD overhead.
  - **Caminho de upgrade claro.** `useWarmupTelemetry` e adapter pattern - quando sprint futura adicionar `analytics_events` server-side, trocamos a implementacao do hook (`fetch('/api/telemetry/...', payload)`) sem mudar nenhum call site.
  - **Nao bloqueia sprint W-1.** Marcando explicitamente como interim, evitamos discussao de "qual provider usar" agora.
  - **Spec ja prescreve.** RF-19 e Secao 11 falam explicitamente em "console.log estruturado nesta sprint, instrumentacao completa em sprint posterior".
  - **Simples de auditar.** Test pode mockar `console.log` e verificar formato esperado. Nao precisa de MSW ou rede.

- **Contras:**
  - **Dados nao agregaveis em dashboard.** Para saber % override agregado entre todos usuarios, precisariamos exportar logs do browser - nao acontece naturalmente. Mitigado: invariantes-chave estao em `warmup_rituals`; queries SQL geram dashboards equivalentes.
  - **Producao tem console.log poluindo console.** Aceitavel - usuario raramente abre DevTools; volume baixo; pode ser silenciado em prod via env flag se necessario.
  - **Eventos perdidos em browsers que limpam console.** Aceitavel - persistencia ja ocorre em `warmup_rituals` para os eventos materialmente importantes.

### Opcao B: Endpoint server-side `POST /api/telemetry/warmup` + tabela `warmup_events`

Cada `track()` faz fetch para servidor que persiste em tabela dedicada.

- **Pros:**
  - Dashboards agregam por usuario / por evento / por janela temporal.
  - Eventos sobrevivem a fim de sessao do browser.

- **Contras:**
  - **Inflar Sprint W-1.** Schema novo, endpoint, validacao Zod, rate limit, batching client (senao N requests por ritual), retry com backoff. ~3-4 dias de dev.
  - **Schema versioning prematuro.** Sem ter contratos finais validados, persistir formato estavel risk schema migration ja na Sprint W-2.
  - **Custos de banco.** Eventos de warmup em escala = ~9 eventos por ritual x ~1 ritual/dia x N usuarios. Volume baixo, mas inflando tabela sem ROI imediato (ja temos `warmup_rituals`).
  - **Sem alinhamento com spec.** RF-19 explicitamente difere para sprint posterior.
  - **Privacy questions.** Politica de retencao precisa ser definida formalmente antes de persistir dados emocionais.
  - **Rejeitada por: escopo + prematuridade + duplicacao com `warmup_rituals`.**

### Opcao C: Provider externo (PostHog / Mixpanel / Amplitude)

Integrar SDK de provider 3rd party. `track()` passa eventos para o provider.

- **Pros:**
  - Dashboards prontos.
  - Funnels nativos (gate_triggered -> override_used vs no_play).

- **Contras:**
  - **Decisao de provider e cara.** Cada um tem precos, conformidade GDPR/LGPD, opinions. Sem necessidade urgente, escolher 3rd party agora cria lock-in.
  - **Bundle JS extra.** PostHog SDK ~30KB gzip; concorre com RNF-05 (bundle WarmUpRunner < 60KB).
  - **Custo recorrente.** PostHog/Mixpanel cobram por evento ou por usuario. Pre-otimizacao.
  - **Privacy complexa.** Dados emocionais saindo para 3rd party precisa de DPA, termos de uso ajustados, opt-in explicito do usuario.
  - **Spec nao prescreve.** Opcao B fica para sprint futura propria de analytics; nao deveria atravessar W-1.
  - **Rejeitada como over-commit.**

### Opcao D: Sem telemetria nesta sprint

Nao implementar `useWarmupTelemetry`. Apenas persistir em `warmup_rituals` (campos ja existentes).

- **Pros:**
  - Zero codigo extra.

- **Contras:**
  - **Perde sinais que NAO estao em `warmup_rituals`:**
    - `block_completed` por bloco (durationSeconds, blockData granular). `warmup_rituals.blocksCompleted` jsonb captura, mas nao em "evento" - so em snapshot final.
    - `weekly_heuristics_saved` (interacao com `user_settings`).
    - `grind_blocked_by_gate` (acontece em `/grind` antes de qualquer ritual).
  - **Quebra RF-19** explicitamente.
  - **Coach Review futuro fica cego** para padroes de comportamento intra-ritual ("usuario sempre pula animacao" - so detectavel via evento).
  - **Rejeitada por perda de informacao + violacao de RF.**

### Opcao E: Salvar eventos em localStorage (em vez de console.log)

`track()` faz append num array em localStorage chave `warmup-telemetry-events`.

- **Pros:**
  - Sobrevive a fim de sessao.
  - Permite export manual ("export logs" button).

- **Contras:**
  - **localStorage nao foi feito para isso.** Quota limitada (~5MB), sem TTL nativo, sem indices.
  - **Sem agregacao multi-usuario.** Continua dado isolado no browser.
  - **Risco de bagunca.** Cleanup logic (TTL, max events) e uma feature por si - mais codigo que o ROI.
  - **console.log + DevTools ja resolve mesmo caso.** Sem ganho material vs Opcao A.
  - **Rejeitada como soluction sem problema.**

## Decisao

**Adotar Opcao A: telemetria client-only via console.log estruturado.**

### Detalhes-chave do design

1. **Hook unico:** `client/src/hooks/useWarmupTelemetry.ts` exporta funcao `track(eventName, props)`:
   ```ts
   export function useWarmupTelemetry() {
     const { user } = useAuth();
     return {
       track: (eventName: WarmupEvent, props: Record<string, unknown>) => {
         const payload = {
           userId: user?.userPlatformId ?? null,
           ts: new Date().toISOString(),
           viewport: window.innerWidth <= 768 ? 'mobile' : 'desktop',
           ...props,
         };
         console.log('[telemetry][warmup]', eventName, payload);
       },
     };
   }
   ```
2. **Tipo `WarmupEvent`:** union literal com os 9 eventos da Secao 11 da spec. Type-safe call sites.
3. **Call sites** distribuidos:
   - `WarmUpRunner` (mount): `warmup_started`, abort cleanup `warmup_aborted`.
   - `useWarmupRitual` (state machine): `block_completed` em cada transicao.
   - `EmotionalCheckBlock`: `emotional_check_submitted`.
   - `GoNoGoModal`: `gate_triggered` no mount.
   - `OverrideConfirmDialog`: `override_used` no confirm.
   - `useWarmupRitual` (POST sucesso): `warmup_completed`.
   - `WeeklyFocusBlock`: `weekly_heuristics_saved` no save.
   - `useWarmupGate` (em `/grind` quando gate falha): `grind_blocked_by_gate`.
4. **Backend NAO recebe eventos nesta sprint.** Endpoints POST `/api/warmup-rituals` so persistem o ritual final - nao registram eventos individuais.
5. **Test strategy:**
   - Hooks/components testam `track` mockado: `vi.spyOn(console, 'log')` valida formato.
   - Nenhum teste de rede - nada vai pra fora do browser.
6. **Caminho de upgrade documentado:**
   - Sprint futura cria endpoint `POST /api/telemetry/warmup` + tabela `warmup_events` (ou `analytics_events` generica).
   - `useWarmupTelemetry` ganha implementacao alternativa (env flag ou direto): substitui `console.log` por `fetch + batching`.
   - Nenhum call site precisa mudar.
7. **Production toggle:** opcional (pos-sprint) flag de env `VITE_WARMUP_TELEMETRY_LOG=false` desliga console.log em producao se ruido for problema. Default true ate sprint de analytics.

## Consequencias

### Positivas
- **Zero impacto no escopo Sprint W-1.** Implementacao do hook e ~20 LOC.
- **Validacao de contratos antes de persistir.** Iteracao rapida sem migration.
- **Privacy nativa.** Dados nao saem do browser nesta sprint.
- **Side-effect persistido.** Eventos materialmente importantes (`gate_triggered`, `override_used`, `warmup_completed/aborted`, `emotional_check_submitted`) tem espelho em `warmup_rituals`. Queries SQL geram metricas-chave (% override, taxa de abort).
- **Adapter pattern facilita upgrade.** Swap implementacao em sprint futura sem refactor de chamadas.
- **Aderente a RF-19** da spec.

### Negativas
- **Sem dashboard agregado por evento.** Para % override entre TODOS usuarios, queries em `warmup_rituals` resolvem (`SELECT COUNT(*) WHERE override_used / COUNT(*) WHERE emotional_check_score < 6`). Eventos granulares como `block_completed` ficam apenas em browsers individuais.
- **Eventos perdidos se browser limpa console.** Aceitavel - dados materialmente importantes persistem em DB.
- **Producao tem console.log "extra".** Volume baixo; toggle de env disponivel para silenciar.

### Neutras
- **Decisao explicitamente interim.** ADR documenta o caminho de upgrade. Quando sprint de analytics nascer, este ADR e referenciado.
- **Compatibilidade com Anthropic Coach AI.** Coach futuro pode ler `warmup_rituals` direto - nao precisa do stream de eventos.
- **Adverte futuro arquiteto:** se telemetria server-side virar prioridade antes da sprint de analytics, este ADR e candidato a "Substituido por ADR-XXX".

## Confianca

**Alta.** Estrategia client-only console.log e padrao em fases iniciais de feature - ver Linear, Vercel, Plausible adopting same pattern em early stages. Custo near-zero, ROI alto (validacao de contrato), reversivel. Risco principal - perder eventos relevantes - mitigado pelo fato de eventos materialmente importantes terem espelho em `warmup_rituals`.

## Referencias

- Spec: `Docs/specs/warm-up-sprint-w1-spec.md` (RF-19, Secao 11)
- ADR-027: soft-gate (depende de % override mensurado via telemetria; mensuravel tambem via SQL em `warmup_rituals`)
- ADR-028: schema `warmup_rituals` (espelha eventos materialmente importantes)
- ADR-029: no dual-write (analogia: nao fazer `dual-instrument` server-side ate ter contrato estavel)
- Patterns no projeto: `tournament_selector_logs` (tabela dedicada de telemetria) e contraste do que evitamos prematuramente nesta sprint.
