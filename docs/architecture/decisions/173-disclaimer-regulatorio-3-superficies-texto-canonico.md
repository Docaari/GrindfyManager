# ADR-173: Disclaimer regulatório em 3 superfícies — (1) footer fixo `ReportContent.disclaimer` em todos os 4 tipos de report renderizado pelo `ReportView` + emails footer + (2) bloco STATIC do `GRINDFY_AI_BASE` no system prompt com regra de deflexão IRPF/tax/regulamentação/staking/contrato/lei + regra de disclaimer condicional (qualquer output que mencione $/BRL/banca/profit) + (3) `OnboardingWizard` (AI-1A) ganha step novo penúltimo com checkbox de aceite explícito + back-fill banner não-bloqueante no `/coach-ai` para users pré-AI-2B (rate via `user_coach_preferences.disclaimer_accepted_at`) com texto canônico único em `server/coach/disclaimers.ts` exportando `REPORT_DISCLAIMER` (PT-BR locked Q-H 2026-05-20)

## Status
Aceito

## Data
2026-05-20

## Sprint
AI-2B (`Docs/specs/sprint-ai-2b.md` — RF-09; Q-H locked 2026-05-20)

## Decision owner
system-architect (founder locked Q-H em 2026-05-20: 3 superfícies + texto canônico — variações de tom permitidas por superfície mas o **núcleo do texto vem de fonte única**)

## Related
- Depende de: ADR-019 (Coach prompt cache 2-block — disclaimer entra no STATIC, não quebra cache `ephemeral`); ADR-148 (Grindyfy AI agente único); ADR-159 (AI-1C `ReportContent` v2/v3 — campo opcional `disclaimer`); ADR-169 (Quarterly + IRPF — disclaimer obrigatório); ADR-172 (Email templates — disclaimer no footer); AI-1A (OnboardingWizard).
- Reusa: `OnboardingWizard.tsx` (estrutura de steps), `user_coach_preferences` (coluna nova `disclaimer_accepted_at`), `coachSystemBuilder.ts` (`GRINDFY_AI_BASE` STATIC).
- Sucessor de: nada — primeiro tratamento formal de disclaimer regulatório.

---

## 1. Contexto

Grindfy lida com $/banca/poker → fronteira regulatória. Sem disclaimer formal, exposição a 3 riscos:
1. **Fiscal/IRPF** — user pode interpretar relatório como "guia de declaração"; jogador BR perguntar ao Coach "como declarar?" e receber resposta que parece autoritativa.
2. **Garantia de retorno** — "your ROI was 8% last trimester" pode ser lido como "vai continuar 8%". Disclaimer claro "passado não prevê futuro".
3. **Categoria de produto** — Grindfy NÃO é casa de aposta, NÃO é advisor financeiro, NÃO é contador. Regulamentação brasileira (LC 215/22 + Bets Lei 14.790/23) está em fluxo — postura defensiva é mandatória.

A pergunta central: superfícies, tom, idempotência (não repetir 5x no mesmo email), aceite explícito.

### Restrições

- **Lesson #10 (DRY):** texto canônico em arquivo único `server/coach/disclaimers.ts`. Mudança propaga.
- **Lesson #19 (CTAs):** links nos disclaimers só para rotas Wouter existentes (`/coach-ai`, `/terms`, `/privacy` se existirem).
- **Lesson #11 (default mínimo):** disclaimer onde tem chance de gerar confusão regulatória; NÃO em todo render de KPI individual.
- **Cache ADR-019:** disclaimer no STATIC do system prompt mantém `cache_control: ephemeral` válido (texto fixo + raro de mudar).
- **PT-BR fixo** — UI do produto é PT-BR; texto legal em PT.

### O que está fora de escopo

- Termos de uso completos / Privacy Policy (documentos longos jurídicos) — disclaimer NÃO substitui ToS. Pages dedicadas `/terms` + `/privacy` existem ou serão criadas pelo founder fora deste sprint.
- Tradução para EN — quando internacionalizar.
- Versionamento explícito do disclaimer (v1, v2, v3) — `disclaimer_accepted_at` timestamp basta hoje; se texto mudar significativamente, founder decide re-aceite via banner novo.
- Disclaimer em cada response de chat do Coach — só na regra de deflexão + disclaimer condicional (LLM aplica conforme regra do system prompt).
- Compliance LGPD completo — fora de escopo (já há esforço separado fora de AI-2B).

---

## 2. Decisão

Adotada: **texto canônico único + 3 superfícies + aceite explícito + back-fill banner**.

### 2.1. Texto canônico

Localização: `server/coach/disclaimers.ts`.

```ts
// Sprint AI-2B (ADR-173). Texto canônico do disclaimer regulatório do Grindfy.
// Consumido em 3 superfícies:
// 1. server/services/reportGeneratorShared.ts → ReportContent.disclaimer (footer dos 4 reports)
// 2. server/coach/coachSystemBuilder.ts → GRINDFY_AI_BASE (system prompt STATIC, cache ephemeral OK)
// 3. server/emails/templates/*.ts → footer dos emails de relatório (ADR-172)
// 4. OnboardingWizard step + back-fill banner no /coach-ai (frontend lê via endpoint)

export const REPORT_DISCLAIMER = `Grindfy é uma ferramenta de análise de performance em poker. Não somos casa de apostas, advisor financeiro, contador, advogado ou consultor regulatório. O conteúdo gerado por nossos relatórios e pelo Grindfy AI é informativo e baseado em dados que você forneceu — não constitui aconselhamento fiscal, jurídico ou de investimento. Resultados passados não preveem resultados futuros e nenhum retorno é garantido. Para questões de IRPF, declaração fiscal, staking, contratos ou regulamentação, consulte um profissional especializado (contador, advogado). Jogue com responsabilidade.`;

// Versão curta para footer compacto de cards/widgets — opcional.
export const REPORT_DISCLAIMER_SHORT = `Conteúdo informativo — não garante retorno futuro. Não substitui contador. Jogue com responsabilidade.`;

// Regra de deflexão para o system prompt (LLM aplica em runtime).
export const DEFLECTION_RULE_REGULATORY = `Quando o usuário perguntar sobre IRPF, tax, declaração fiscal, regulamentação de jogos, staking, contratos, leis ou qualquer assunto jurídico/fiscal/regulatório → defletir educadamente: "Não opino sobre isso — consulte um profissional especializado (contador, advogado)." NÃO inventar números fiscais. NÃO sugerir alíquotas. NÃO recomendar "como declarar".`;

// Regra de disclaimer condicional para o system prompt.
export const FINANCIAL_CAVEAT_RULE = `Em qualquer resposta que mencione $/BRL/banca/profit/ROI/retorno como projeção ou expectativa, adicione 1 frase no final: "Conteúdo informativo — não garante retorno futuro." NÃO repetir em respostas puramente descritivas de passado ("você teve $X de profit no mês").`;
```

### 2.2. Superfície 1 — Footer fixo em reports

- `server/services/reportGeneratorShared.ts` `buildReportFollowUp` ganha sibling `attachDisclaimer(content)` que setam `content.disclaimer = REPORT_DISCLAIMER`.
- `ReportContent.disclaimer` populado em **todos** os 4 tipos (weekly, daily, monthly, quarterly). `schemaVersion: 3` (lesson #7).
- `markdown` (gerado em `renderMarkdownBase`) inclui:
  ```
  ---
  > Conteúdo informativo — Grindfy é ferramenta de análise...
  > [texto canônico REPORT_DISCLAIMER]
  ```
- Frontend `ReportView` (`client/src/pages/coach-ai/ReportView.tsx`) renderiza o `content.disclaimer` como bloco final destacado (border + texto menor + ícone).

### 2.3. Superfície 2 — System prompt

- `server/coach/coachSystemBuilder.ts` `GRINDFY_AI_BASE` (STATIC, `cache_control: ephemeral`) ganha 2 blocos:
  - `## Regras regulatórias\n${DEFLECTION_RULE_REGULATORY}\n\n${FINANCIAL_CAVEAT_RULE}`
- Cache `ephemeral` permanece válido (texto fixo, mudança rara — quando texto mudar, cache invalida 1x e re-populao).
- Inventário de tools novas (ADR-168 `define_career_goal`/`evaluate_career_goal`, ADR-169 `compute_irpf_summary`, ADR-171 `log_mental_hand`) também entra no STATIC (lesson "tools mention" do AI-0A).

### 2.4. Superfície 3 — Onboarding step + back-fill banner

- **Step novo no `OnboardingWizard` (AI-1A)** — penúltimo (antes do "Concluir"):
  - Título: "Antes de começar — leia o disclaimer."
  - Body: scroll box com texto canônico `REPORT_DISCLAIMER`.
  - Checkbox: "Eu li e aceito." → desbloqueia botão "Concluir onboarding".
  - Submit → POST `/api/coach/onboarding/accept-disclaimer` → UPDATE `user_coach_preferences SET disclaimer_accepted_at = NOW()`.
- **Back-fill banner para users existentes** (`disclaimer_accepted_at IS NULL`):
  - Hub `/coach-ai` na primeira visita pós-deploy AI-2B → renderiza banner não-bloqueante (topo da página).
  - Texto: "Atualizamos nosso disclaimer. [Ler] [Aceito]"
  - Click "Aceito" → mesma chamada UPDATE.
  - Banner some após aceite. Componente: `client/src/components/coach/DisclaimerBanner.tsx`. `data-testid="disclaimer-back-fill-banner"`.
- **Não bloqueia uso** do produto em users existentes — banner é não-modal (lesson #11 — default mínimo, não interromper fluxo).

### 2.5. Superfície 4 — Email templates

- `server/emails/templates/{weekly,monthly,quarterly}ReportEmail.ts` (ADR-172) inclui `REPORT_DISCLAIMER` no footer abaixo dos links unsubscribe/preferences.
- Texto pequeno (font-size: 11px, color: muted) — visível mas discreto.

### 2.6. Endpoint de aceite

`POST /api/coach/onboarding/accept-disclaimer` — JWT required. Body vazio. UPDATE `user_coach_preferences SET disclaimer_accepted_at = NOW() WHERE user_id = $userPlatformId`. Idempotente (se já aceito, no-op). Retorna `{ acceptedAt: <iso> }`.

---

## 3. Opções consideradas

### Opção A — 3 superfícies + texto canônico único — ESCOLHIDA (Q-H lock)
**Prós:**
- Cobertura completa (relatórios + chat + onboarding).
- Texto canônico único — DRY (lesson #10).
- Aceite explícito → defesa jurídica (proof of consent).
- Back-fill banner não-modal — não friction users existentes.
**Contras:**
- 4 lugares para popular (server-side reports, frontend banner, system prompt, email template). Aceito.
- Banner pode ser ignorado por user (mas aceite é opt-in — não bloqueia uso). Aceito: política deliberada de "non-blocking" para evitar churn forçado.

### Opção B — Apenas footer dos reports + email (sem onboarding step)
**Prós:**
- Simples.
**Contras:**
- Sem aceite explícito → defesa jurídica fraca.
- System prompt sem regra de deflexão → LLM pode "ajudar" com IRPF mesmo com disclaimer no footer (risco).

### Opção C — Modal bloqueante no primeiro login de TODO user
**Prós:**
- Aceite explícito 100% cobertura.
**Contras:**
- Friction alta — user pode abandonar.
- Modal sem contexto (logged in mas ainda no /home) confuso.
- Lesson #11 — "default mínimo" — não bloqueante quando informativo.

---

## 4. Consequências

### Positivas
- Texto canônico único — mudança fácil de propagar.
- 3 superfícies cobrem 95% dos pontos de contato fiscal/regulatório.
- Aceite explícito no onboarding novo → defesa jurídica + UX limpa (parte do fluxo natural).
- Back-fill non-modal preserva users existentes sem friction.
- System prompt deflete IRPF/tax automaticamente (LLM aplica regra) — proteção runtime.

### Negativas
- Texto longo em PT-BR pode parecer "burocrático" para users — discrete styling mitiga.
- Cache `ephemeral` no STATIC invalida quando texto muda — re-populao na 1ª chamada após mudança. Aceito (raro).

### Neutras
- `disclaimer_accepted_at` timestamp serve para auditoria futura (proof of consent date).
- Banner back-fill desaparece para sempre após 1 clique — sem re-display.
- Texto não versionado explícito (v1/v2) — founder decide se mudança significativa exige re-aceite via banner novo.

## Confiança
**Alta** — pattern simples e robusto; texto canônico aceito por founder Q-H lock; 3 superfícies cobrem chat + report + email + onboarding; aceite explícito proof de consent.
