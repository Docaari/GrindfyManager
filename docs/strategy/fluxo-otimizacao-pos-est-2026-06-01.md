# Otimização do Fluxo Estudo + IA — Pós-EST (Estratégia, 2026-06-01)

> ⚠️ **SUPERSEDED (2026-06-01) por `Docs/strategy/estrategia-sprints-finais-2026-06-01.md`** — que é a fonte de verdade do roadmap pós-EST. Este doc fica como **registro histórico do estado pré-curso "Antes das Cartas"**. Os 10 itens ICE abaixo foram re-pesados, renumerados e estendidos (com a ferramenta de Metas + os gaps revelados pelo curso) no doc novo. NÃO planejar a partir daqui — usar o doc novo. O ranking abaixo não foi editado de propósito (preserva o snapshot pré-curso).

> Análise estratégica do fluxo de planos/metas/acompanhamento/relatórios APÓS as sprints EST-1..6. Ranqueado em ICE (Impact / Confidence / Ease, 1–10, score = média). **A ferramenta de "Metas" é deliberadamente deixada para depois** — será precedida de um estudo no curso "antes-das-cartas" sobre como definir/acompanhar metas. O foco aqui é o fluxo e as ferramentas que já temos (ou teremos ao fim das EST).

## Loop do usuário (estado-alvo pós-EST)
> **Grind** (sessões + break feedbacks + notas) → **Estuda** (sessões, análise de stats, temas, spots) → **Importa** histórico (sharkscope) → **Segunda-feira ritual** (recap → análise 7d → plano da semana) → **Executa o plano** → repete.

Buraco estrutural: **o plano é gerado mas não é medido.** O mentor recomenda, não cobra. Fechar isso é o eixo da análise — e é o pré-requisito natural da futura ferramenta de Metas (meta = plano de horizonte longo com aderência medida).

## Gaps identificados
1. **Loop aberto** — plano de segunda (EST-6) é write-only; sem plano-vs-realizado.
2. **Recomendação → ação com fricção** — sem 1-clique pra agendar a aula/tema/drill recomendado.
3. **Ritual gateia em upload manual do sharkscope** — ponto único de falha, alto abandono.
4. **Dados mentais subutilizados** — break_feedbacks talvez não preenchidos; mentor não cruza estado mental com resultado.
5. **Diagnóstico → prescrição não-encadeado** — leak/tema/aula/drill são peças soltas.
6. **Fragmentação** — performance (/stats), estudo (/estudos), mentor (/coach-ai), grind (/grind) sem visão única.

## Lista ICE-ranqueada
| # | Sugestão | I | C | E | Score |
|---|----------|---|---|---|-------|
| 1 | Recomendação → ação em 1 clique ("adicionar ao plano / agendar") | 8 | 8 | 7 | **7.7** |
| 2 | 🔑 Aderência do plano (plano-vs-realizado) | 9 | 8 | 5 | **7.3** |
| 3 | Reduzir fricção do upload sharkscope (staleness + lembrete + import guiado) | 8 | 7 | 6 | **7.0** |
| 4 | Boost de adoção do break-feedback (1-tap + nudge + streak) | 7 | 7 | 7 | **7.0** |
| 5 | Insight estado-mental ↔ resultado (foco/tilt × P&L) | 8 | 6 | 6 | **6.7** |
| 6 | Report → "pergunte ao coach sobre isso" (deep-dive contextual no chat) | 6 | 7 | 7 | **6.7** |
| 7 | Cadência de re-engajamento (nudges: logue break, faça estudo planejado, suba sharkscope) | 7 | 7 | 6 | **6.7** |
| 8 | Cadeia leak → tema → aula → drill automatizada | 8 | 6 | 5 | **6.3** |
| 9 | Onboarding cold-start (importa histórico → 1ºs temas → 1º plano → 1ª mensagem) | 7 | 6 | 5 | **6.0** |
| 10 | Cockpit "minha semana" (performance + mental + estudo + aderência numa tela) | 7 | 6 | 4 | **5.7** |

## Ressalva estratégica
Por ICE puro, **#1** ganha (quick win mais limpo). Mas **#2 (aderência) é a peça-chave e o que vem antes da Metas**:
- #1 e #2 são complementares: **#1 enche o plano sem fricção, #2 mede se foi cumprido.** Juntos transformam o mentor de "quem fala" em "quem cobra" — a proposta de valor de accountability para jogador profissional.
- A infra de aderência (`planned vs actual`, comparação semanal, % de cumprimento) é a **fundação da ferramenta de Metas**. Construir agora deixa a Metas barata depois — meta = plano de horizonte longo plugado no mesmo motor.
- Por isso o ranking de *execução* recomendado não é o ICE cru: **#1 + #2 como par primeiro**.

## Por que cada um (top 5)
- **#1 Recomendação→ação:** hoje o insight morre na tela. Botão "adicionar ao plano" (reusa persistência EST-6) converte conselho em comportamento. Multiplicador de valor de tudo que o mentor produz. Barato — UI + endpoint.
- **#2 Aderência:** dado já existe (grind_sessions, study_sessions_v2, tournaments). Falta o modelo que guarda o plano *intencionado* e compara com o *realizado*. Sem isso, planejar é teatro. Com isso, o ritual ganha "semana passada você planejou 4 dias e 5h, fez 2 e 1h — vamos falar". Ease 5 (modelo + lógica novos), Impact 9 (fecha o loop + pré-requisito Metas).
- **#3 Sharkscope:** EST-5 gateia análise profunda no upload manual; atrito alto → o passo mais valioso vira o mais abandonado. Mínimo: detectar histórico velho + cobrar + import dead-simple. Protege o ROI inteiro do EST-5.
- **#4 Break-feedback:** toda a análise de estado mental (EST-2) depende disso. Popup interrompe grind → risco de ninguém preencher → seção "estado mental" nasce vazia. 1-tap + nudge + streak. Alimenta #5. Ease alto (captura já existe).
- **#5 Mental↔resultado:** diferencial competitivo. Ninguém cruza "como você se sentiu" com "quanto ganhou". "Foco<5 perde X/torneio; >7 ganha Y" muda comportamento. Confidence 6 (correlação ruidosa, precisa volume — depende de #4).

## Sequência de execução recomendada (pós-EST)
```
Fase A (par keystone):     #1 Recomendação→ação  +  #2 Aderência do plano
Fase B (combustível):      #4 Adoção break-feedback  +  #3 Fricção sharkscope
Fase C (inteligência):     #5 Mental↔resultado  +  #8 Cadeia leak→estudo
Fase D (engajamento):      #7 Re-engajamento  +  #6 Report→chat  +  #9 Cold-start
Fase E (consolidação):     #10 Cockpit "minha semana"
─────────────────────────────────────────────
DEPOIS → Ferramenta de Metas (sobre o motor de aderência da Fase A)
```
Lógica: Fase A fecha o loop (motor que a Metas herda) → Fase B garante combustível (dados densos) → Fase C extrai inteligência diferenciada → Fase D segura o usuário no loop → só então Metas faz sentido (depende de aderência + dados densos pra meta longa ser rastreável).

## Notas de execução
- Fase A só roda depois de EST-2 + EST-5 fecharem (evita competir pela working tree compartilhada — INCIDENT #24/#45). Considerar git worktree por sprint paralelo.
- Metas: bloqueada por estudo no curso "antes-das-cartas" (founder) — não especificar até esse estudo definir o modelo de meta/acompanhamento.
