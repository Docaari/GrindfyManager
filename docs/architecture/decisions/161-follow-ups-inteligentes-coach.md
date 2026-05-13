# ADR-161: Follow-ups inteligentes no Coach — seção "Seu acompanhamento" (`ReportContent.followUp`) nos 3 tipos de relatório (foco de leak ativo via `coach_leak_focus` + status via `verify_leak_progress`; metas em progresso do perfil estruturado); bloco "## Follow-ups abertos" no contexto DINÂMICO do chat (`coachContext.ts` `assembleContext` — não vai pro STATIC, não quebra o cache); 1 instrução no system prompt STATIC base (`GRINDFY_AI_BASE`) sobre mencionar follow-ups de forma não-repetitiva — conteúdo passivo (não é nudge)

## Status
Aceito

## Data
2026-05-12

## Sprint
AI-1C (`Docs/specs/sprint-ai-1c.md`, RF-08)

## Decision owner
system-architect (founder validou o roadmap — follow-ups inteligentes)

## Related
- Depende de: ADR-159 (`ReportContent.followUp` é um dos campos opcionais novos do `ReportContent` v2; os 3 geradores o populam), ADR-152 (anti-fadiga — o follow-up no relatório **não** é um nudge, não passa pelo `shouldSendNudge`; é conteúdo passivo do card de relatório), ADR-151 (perfil estruturado — `AiStructuredProfileMeta` é a fonte das metas em progresso), ADR-148 (agente único — a instrução vai no `GRINDFY_AI_BASE`, o prompt único do agente), ADR-019 (prompt em 2 blocos STATIC cacheado + DINÂMICO — o bloco "## Follow-ups abertos" vai no DINÂMICO; a instrução vai no STATIC).
- Reusa: `findActiveLeakFocusList` (`server/storage.ts`) + `coach_leak_focus`, `findActiveLeakFocus`/`queryStatByKey` (a lógica de `server/coachTools/handlers/verifyLeakProgress.ts` — reusada como **função**, não como tool, dentro do gerador), `getAiStructuredProfile` (`server/storage/aiStructuredProfile.ts` — `metas`/`focoDoMes`), `server/coachContext.ts` (`assembleContext` — o bloco DINÂMICO), `server/coachSystemBuilder.ts` (`GRINDFY_AI_BASE` — o bloco STATIC base).
- Sucessor de: nada — primeira implementação de "o agente fecha o loop sobre o que sugeriu".

---

## 1. Contexto

O Coach do AI-0A introduziu `log_leak_focus` (registra um foco de leak por mês — `coach_leak_focus`, UNIQUE `(userId, leakCode, targetMonth)`) e `verify_leak_progress` (lê o foco ativo + compara o stat baseline com o atual → `status: 'improving'|'regressing'|'stable'|'insufficient_sample'`). O AI-1A introduziu o perfil estruturado (`users.ai_structured_profile.metas: AiStructuredProfileMeta[]` = `{ id, texto, prazo: 'mes'|'trimestre'|null, criadaEm, origem }` + `focoDoMes`). Mas o agente **não fecha o loop**: ele sugere um foco de leak / uma meta numa conversa e depois nunca mais menciona se o jogador progrediu. O roadmap prevê **follow-ups inteligentes**: o agente lembra do que sugeriu (foco de leak, meta) e fecha o loop — nos relatórios e no chat.

A pergunta: **onde mora o follow-up; como ele entra nos relatórios (uma seção); como ele entra no chat (sem quebrar o prompt cache); como o agente é instruído a mencioná-lo sem ser repetitivo; o que evita "inventar" follow-up onde não há.**

### Restrições
- **Lesson #11 (não inventar ações onde não há):** se não há foco de leak ativo nem meta em progresso, o `followUp` é **ausente** / a seção é **omitida** — não criar acompanhamento decorativo.
- **Lesson #10 (fonte única do prompt):** a instrução de "mencione follow-ups de forma não-repetitiva" vai no `GRINDFY_AI_BASE` (o prompt único do agente — bloco STATIC), em um único lugar.
- **Cache (ADR-019):** o bloco "## Follow-ups abertos" varia por user → vai no bloco **DINÂMICO** (`coachContext.ts` `assembleContext` / `buildDynamicSystemBlock`), nunca no STATIC. A instrução (1 frase) vai no STATIC (não varia — não quebra o cache; só muda 1×, no deploy).
- **Lesson #17/#12 (`coachContext.ts` tem dead-code `systemParts` + ~8 queries inline — NIT pendente):** ao adicionar o bloco, **não piorar** o problema; reusar `findActiveLeakFocusList`/`getAiStructuredProfile` (não duplicar queries); se for trivial limpar parte do dead-code junto, fazer (opcional, não bloqueia).
- **Não é um nudge:** o follow-up no relatório é conteúdo passivo do card (não passa pelo `shouldSendNudge`, não tem `cycleKey`/quiet hours) — risco de "ser chato" mitigado: é uma seção do relatório que o user já optou em receber, não uma interrupção separada.
- **Status vem dos dados, não inventado:** o `status`/`progressNote` de cada foco de leak vem da lógica de `verify_leak_progress` (`findActiveLeakFocus` + `queryStatByKey`), não do LLM.

---

## 2. Decisões

### 2.1 Seção "Seu acompanhamento" nos relatórios (`ReportContent.followUp`) — RF-08.1
- `ReportContent.followUp?: { activeLeakFocus: Array<{ code, label, targetMonth, status, progressNote? }>; goalsInProgress: Array<{ goalId, texto, prazo }>; narrative? }` (campo opcional do `ReportContent` v2 — ADR-159 §2.7).
- **Populado pelo gerador** (weekly + monthly + daily), depois de montar as seções, por um helper compartilhado `server/coach/reportFollowUp.ts → buildReportFollowUp(storage, userId): Promise<ReportContent['followUp'] | undefined>`:
  - `const activeFocus = await safe(() => findActiveLeakFocusList(userId) ?? findActiveLeakFocus(userId) wrapped as list, [])`.
  - Para cada foco: a lógica de `verify_leak_progress` (reusar — extrair de `verifyLeakProgress.ts` um `runVerifyLeakProgress({ leakFocusId }, ctx)` análogo a `runQueryDimension` se ainda não existir, ou chamar `findActiveLeakFocus` + `queryStatByKey` diretamente) → `{ status, improvementPct }` → `progressNote` derivado.
  - `const profile = await safe(() => getAiStructuredProfile(userId), null)`; `goalsInProgress` = `profile?.metas?.filter(m => m.prazo === 'mes' || m.prazo === 'trimestre')` (as relevantes ao período); `focoDoMes` mencionado na `narrative`.
  - **Se `activeFocus.length === 0 && goalsInProgress.length === 0` → retorna `undefined`** (a seção é omitida — lesson #11).
- O LLM gera o `followUp.narrative` (1-2 frases) fechando o loop ("Seu foco do mês é [X] — a [semana/sessão/mês] teve dado relevante? [ação]." / "Sua meta de [Y] — você está [no caminho/atrasado].") — passar o `followUp` (sem a `narrative`) no prompt do gerador para ele preencher.
- No `markdown` (gerado pelo `renderMarkdownBase`) e no `ReportView` (ADR-159 §2.7): renderiza como "## Seu acompanhamento" (no daily, "Acompanhamento") com os itens + a narrativa, **só quando `followUp` está presente**.

### 2.2 Bloco "## Follow-ups abertos" no contexto DINÂMICO do chat — RF-08.2
- Em `server/coachContext.ts` (`assembleContext` — ou o `buildDynamicSystemBlock` de `coachSystemBuilder.ts`, onde o bloco DINÂMICO é montado; o spec aponta `assembleContext`): adicionar, no padrão `systemParts.push(...)` (mesma forma de `## Leaks Detectados`, `## Plano Semanal Atual`, `## Progresso de Estudo`):
  ```
  const activeFocus = await safe(() => findActiveLeakFocusList(userId), []);
  const profile = await safe(() => getAiStructuredProfile(userId), null);
  const metasEmProgresso = (profile?.metas ?? []).filter(m => m.prazo === 'mes' || m.prazo === 'trimestre');
  if (activeFocus.length > 0 || metasEmProgresso.length > 0) {
    const lines = [
      ...activeFocus.map(f => `- Foco de leak ativo: ${f.leakCode}${f.targetMonth ? ` (escolhido em ${f.targetMonth})` : ''} — status: <verify_leak_progress: improving|regressing|stable|...>`),
      ...metasEmProgresso.map(m => `- Meta em progresso (${m.prazo}): ${m.texto}`),
      profile?.focoDoMes ? `- Foco do mês: ${profile.focoDoMes}` : null,
    ].filter(Boolean);
    systemParts.push(`\n## Follow-ups abertos:\n${lines.join('\n')}`);
  }
  ```
- **Vai no bloco DINÂMICO** (varia por user — não quebra o prompt cache do STATIC). Reusa `findActiveLeakFocusList`/`getAiStructuredProfile` (não duplica queries — atenção lesson #17). O status do foco pode vir da mesma lógica de `verify_leak_progress` ou, mais barato, ser deixado pro LLM consultar via a tool `verify_leak_progress` quando o user perguntar (decisão de calibração do implementer — o critério é: o bloco lista os follow-ups; o status, se incluído, vem dos dados).

### 2.3 Instrução no system prompt STATIC base (`GRINDFY_AI_BASE`) — RF-08.3
- Adicionar 1 frase ao `GRINDFY_AI_BASE` (em `coachSystemBuilder.ts`): _"Quando houver um bloco '## Follow-ups abertos' no contexto, e for natural na conversa, mencione brevemente o follow-up pendente (foco de leak, meta) e ofereça fechar o loop — sem ser repetitivo nem interromper o assunto do usuário."_
- 1 frase, fonte única (lesson #10). Vai no bloco STATIC (não varia — não quebra o cache; muda 1× no deploy). O agente **não força** o assunto — só menciona quando relevante.

---

## 3. Consequências

### Positivas
- O agente fecha o loop — o jogador que escolheu um foco de leak ou definiu uma meta vê o progresso nos relatórios e ouve o agente mencionar no chat (quando relevante).
- Reusa toda a infra existente (`coach_leak_focus` + `verify_leak_progress` + `AiStructuredProfileMeta`) — zero tabela nova, zero migração.
- Não quebra o prompt cache: o bloco "## Follow-ups abertos" vai no DINÂMICO; a instrução (1 frase) vai no STATIC e só muda no deploy.
- Conteúdo passivo (não nudge) — não adiciona uma categoria de proatividade nova; o risco de "ser chato" é baixo (é uma seção de um relatório que o user já optou em receber).
- Não inventa follow-up onde não há — a seção é omitida quando não há foco de leak ativo nem meta (lesson #11).

### Negativas / trade-offs
- Adiciona 2 queries ao bloco DINÂMICO do chat (`findActiveLeakFocusList` + `getAiStructuredProfile`) — ambas têm cache (`getAiStructuredProfile` cacheia 30s); aceito (o bloco DINÂMICO já faz ~8 queries — a NIT de limpá-lo continua aberta, mas não piora porque reusa as funções existentes).
- O status do foco de leak no bloco do chat pode ser deixado pro LLM consultar via tool (calibração) — se incluído inline, +1 chamada de `queryStatByKey` por foco; o implementer decide.

### Neutras
- A `narrative` do follow-up é gerada pelo LLM (1-2 frases) a partir do `followUp` estruturado — sem campos novos no prompt além do `followUp` que já vai no bundle.

## Confiança
Alta — reusa infra consolidada; a única decisão de calibração (status inline no chat vs deixar pro LLM consultar) é local e reversível.
