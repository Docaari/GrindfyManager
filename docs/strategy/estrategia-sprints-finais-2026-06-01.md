# Estratégia dos Sprints Finais — Fluxo + Ferramenta de Metas (2026-06-01)

> **Fonte de verdade** do roadmap pós-EST. Consolida: (a) o fluxo otimizado end-to-end já com a ferramenta de Metas, (b) a Metas posicionada + dependências, (c) o board ICE marcado (curso "Antes das Cartas" + 4DX), (d) a sequência de sprints finais.
>
> **Supersede** `Docs/strategy/fluxo-otimizacao-pos-est-2026-06-01.md` (vira histórico — ver §7). Ancoragem do mental game: `Docs/strategy/curso-antes-das-cartas-learnings-2026-06-01.md`. Spec da Metas: `Docs/specs/metas-tool-2026-06-01.md`.
>
> **Status:** board ICE + duas decisões-chave ACEITOS pelo founder (2026-06-01).

---

## 0. Espinha conceitual: 4DX × curso

A ferramenta de Metas e o loop inteiro são um sistema **4DX (As 4 Disciplinas da Execução)**, que mapeia 1:1 na doutrina do curso:

| Disciplina 4DX | Na plataforma | Âncora no curso |
|----------------|---------------|-----------------|
| **D1 — Meta Global (WIG)** | 1-2 metas "de X para Y até quando" (lag, longo) — **estende `career_goals`** | C7 resultado + A2 norte |
| **D2 — Medidas de Direção** | métricas preditivas **+** influenciáveis (controláveis) | C7 processo + A9 sistema + A2 controle |
| **D3 — Placar Convincente** | painel visual "onde estou × onde deveria estar" (`/metas`) | competência SDT (A7); esconde P&L curto (D9/C5) |
| **D4 — Cadência de Responsabilização** | prestação de contas semanal no ritual de segunda (EST-5) | A4 (cobra comportamento, não culpa) |

**Regra de ouro:** medida de direção = preditiva (mover ela move a WIG) **e** influenciável (o jogador controla) = exatamente meta de processo (C7) dentro da dicotomia do controle (A2).

---

## 1. O loop otimizado end-to-end (estado-alvo)

```
                    ┌─────────────────────────── CADÊNCIA DE SEGUNDA (EST-5 + 4DX-D4) ───────────────────────────┐
                    │                                                                                            │
   GRIND ──────► ESTUDA ──────► IMPORTA ──────► RITUAL DE SEGUNDA ──────► METAS ──────► EXECUTA ──────► ADERÊNCIA ─┘
 (sessões +     (sessões,      (sharkscope,    1. recap (EST-2)         define/revisa  (plano da      (placar +
  break_fb +     stat_analysis  histórico)      2. análise 7d            WIG + medidas  semana EST-6   plano-vs-
  notas)         EST-3, temas)                  3. plano (EST-6)         de direção)    + 1-clique)    realizado) → repete
```

**O buraco que tudo isto fecha:** hoje o plano é gerado (EST-6) mas **não é medido**. O mentor recomenda, não cobra. A Metas + o motor de aderência transformam o mentor de "quem fala" em "quem cobra" — a proposta de valor de accountability para jogador profissional (A4: cobrar comportamento, não culpa).

**Onde cada disciplina 4DX vive no loop:**
- **D1/D2 (definir WIG + medidas):** no estado `planning` do ritual de segunda (EST-5 → EST-6), 1x/semana ou quando a WIG é criada/revista.
- **D3 (placar):** página `/metas`, consultável a qualquer momento; snapshot semanal idempotente.
- **D4 (cadência):** o próprio ritual de segunda — o recap (EST-2) passa a incluir "semana passada você comprometeu X medidas de direção, cumpriu Y" antes de planejar a próxima.

---

## 2. A ferramenta de Metas posicionada + dependências

### 2.1 O que é (resumo da spec `metas-tool-2026-06-01.md`)
Sistema 4DX que **cria** metas e **acompanha** com participação do Coach IA + painel dedicado. Tipos: **processo** (controlável, semanal — C7/A9/A2), **performance** (mensal, vs próprio histórico — C7), **resultado/WIG** (trimestral/temporada, só norte — C7; recusa resultado de curto prazo por D9/C5). Categorias cobrindo as dores: financeira/BRM (F2), volume/grind (F4/F3), estudo (C4/B), mental/tilt (D1/D5), processo/rotina (C8), longevidade (F5/F7). 5 perfis de trilha do curso (Esgotado/Empolgado/Consolidado/Afundado/Em Transição) = **templates de meta inicial**.

### 2.2 Decisão 1 (ACEITA) — WIG estende `career_goals`
`career_goals` (AI-2B) já existe (tabela + tools `define_career_goal`/`evaluate_career_goal` + Quarterly Review). A WIG (D1) **estende `career_goals`**, não cria domínio de carreira paralelo. As medidas de direção (D2) + o placar (D3) penduram nele. O architect resolve a forma exata (coluna nova vs tabela-filha) no ADR — ver DEC-A6 da spec.

### 2.3 Decisão 2 (ACEITA) — Metas em duas fatias
- **Fatia 1 (sem o motor de aderência, ~70% do valor):** metas manuais + medidas com agregação direta de dado já capturado (volume = count `grind_sessions`; estudo = sum `durationMinutes`; financeira = `wallets`/`bankroll_snapshots`; performance = `getPerformanceByPeriod`; processo = compliance de warm-up/cool-down da Onda 1). Placar + snapshots + cobrança funcionam. **Não é hard-block.**
- **Fatia 2 (com o motor — Fase A):** `compliancePct` rigoroso ("planejou X com warm-up, fez Y" + distingue "pulado" de "não feito") + `leak_focus` via detecção real de leak (Onda 2). Sem o motor, a cobrança usa proxy "realizado vs alvo" (downgrade documentado).

### 2.4 Dependências da Metas
| Depende de | Por quê | Estado |
|------------|---------|--------|
| **EST-5** (ritual de segunda) | é a cadência (4DX-D4) onde a Metas é revista/cobrada | em andamento |
| **EST-6** (planejamento semanal) | as medidas de direção semanais nascem do plano | shipado |
| **Onda 1** (#1 compliance + #2 A/B/C) | são as `sourceMetric` de processo/performance mais puras (alimentam o placar) | a fazer |
| **Fase A motor de aderência** (#7) | fatia 2 (compliance rigoroso) | a fazer (não bloqueia fatia 1) |
| **Onda 2 #3** (leak real) | categoria `leak_focus` | a fazer |
| `career_goals` (AI-2B) | a WIG estende | existe |

---

## 3. Board ICE — marcado (ACEITO pelo founder)

19 itens. **NOVO** = gap revelado pelo curso; **REFINA #N** = re-pesa item do doc antigo. Todos **ACEITOS** (founder aceitou as recomendações 2026-06-01); a coluna **Fase** dá a ordem de execução. Nada cortado.

| # | Item | Tipo | Âncora | I·C·E | Score | Fase |
|---|------|------|--------|-------|-------|------|
| 1 | Compliance de processo (warm-up/cool-down % visível) | REFINA #2/#10 | C8, A9, 4DX-D2 | 8·9·8 | **8.3** | B |
| 2 | Distribuição A/B/C-game (agregar dado já capturado) | NOVO | C2, C7 | 8·9·8 | **8.3** | B |
| 3 | `getStatsLeaks` stub → detecção real de leak | REFINA #8↑ | C4 | 9·8·6 | **7.7** | C |
| 4 | Tilt tipado 7 tipos + antídoto | REFINA #5 | D1 | 8·8·7 | **7.7** | C |
| 5 | Stop-loss pré-comprometido a frio | NOVO | D5, A9 | 8·8·7 | **7.7** | D |
| 6 | Recomendação → ação 1-clique | mantém #1 | — | 8·8·7 | **7.7** | A |
| 7 | 🔑 Aderência do plano (motor plano-vs-realizado) | mantém #2 | A9, 4DX | 9·8·5 | **7.3** | A |
| 8 | Painel BRM/RoR ao vivo (varianceEngine → banca real) | NOVO | F2, D9 | 8·8·6 | **7.3** | D |
| 9 | Boost adoção break-feedback | mantém #4↑ | D-block | 8·7·7 | **7.3** | E |
| 10 | Insight mental↔resultado (foco/tilt × P&L) | mantém #5↑ | D1, C2 | 9·6·6 | **7.0** | C |
| 11 | Fricção upload sharkscope | mantém #3 | — | 8·7·6 | **7.0** | E |
| 12 | Game selection score F1 (6 indicadores de softness) | REFINA Selector | F1 | 7·7·6 | **6.7** | F |
| 13 | Report → "pergunte ao coach" | mantém #6 | A4 | 6·7·7 | **6.7** | E |
| 14 | Cadência de re-engajamento (nudges) | mantém #7 | A7 | 7·7·6 | **6.7** | E |
| 15 | Periodização sprint/taper/férias | NOVO | F5, F4 | 7·7·5 | **6.3** | F |
| 16 | Cold-start onboarding | mantém #9 | — | 7·6·5 | **6.0** | F |
| 17 | Painel burnout (v1 heurístico → v2 MBI) | NOVO | F7 | 7·6·5 | **6.0** | F |
| 18 | Cockpit "minha semana" | mantém #10 | — | 7·6·4 | **5.7** | F |
| 19 | Sono/cronotipo (captura nova, alto atrito) | NOVO | E2/E3, B3 | 6·5·3 | **4.7** | backlog dormente |

### Leituras estratégicas que justificam a ordem
1. **Os 2 maiores quick-wins são "dado parado"** (#1, #2, ICE 8.3): a plataforma já captura os dois lead measures 4DX mais puros (`warmup_rituals`/`cooldown_logs` + `cooldown_logs.abGameAnswers`) e **não mostra nenhum**. São a prova-de-conceito barata do 4DX e alimentam o placar da Metas de graça.
2. **`getStatsLeaks` (#3) é gargalo escondido:** é stub `return []`, consumido em 5 fluxos que nascem vazios. A cadeia leak→estudo do doc antigo (#8) assumia que a detecção existe — não existe; o pré-requisito sobe na frente.
3. **A matemática F2 já existe desplugada (#8):** `varianceEngine` calcula RoR/SD (Monte Carlo) mas só serve o simulador; wire ao bankroll real entrega a dor #1 do curso quase de graça.
4. **Captura mental rica mas crua (#4, #10):** `tiltSelfAssessment` + `abGameAnswers` + `break_feedbacks` existem; falta tipificar (7 tilts) e cruzar (mental × P&L).
5. **A Metas herda quase tudo:** #1/#2/#3/#8 são as `sourceMetric` da RF-05 da spec — construí-los antes/junto alimenta o placar 4DX.

---

## 4. Sequência de sprints finais

> Dependência-aware. Cada sprint roda o pipeline TDD (`pm-spec → system-architect → test-writer → implementer → /simplify → reviewer`).

```
PRÉ ──► FASE A ──► FASE B ──► METAS-1 ──► FASE C ──► METAS-2 ──► FASE D ──► FASE E ──► FASE F ──► (backlog)
```

| Fase | Sprints | Itens | Depende de | Entrega |
|------|---------|-------|------------|---------|
| **PRÉ** | Fechar EST-2 + EST-5 | — | em andamento | recap enriquecido + ritual de segunda (a cadência D4) |
| **A — Keystone** | Recomendação→ação · **Motor de aderência** | #6, #7 | PRÉ | 1-clique enche o plano; motor mede plano-vs-realizado (Metas herda) |
| **B — Lead measures baratos** | Compliance de processo · A/B/C-game | #1, #2 | — (dado já existe) | prova-de-conceito 4DX; `sourceMetric` da Metas |
| **METAS-1** | Ferramenta de Metas (fatia 1) | spec `metas-tool` | A (motor opcional), B, EST-5 | WIG (estende `career_goals`) + medidas de direção + placar + cadência; manual + agregação direta |
| **C — Inteligência** | Leak real · Tilt tipado · Mental↔resultado | #3, #4, #10 | B | destrava 5 fluxos; insight diferenciado |
| **METAS-2** | Metas (fatia 2) | spec `metas-tool` | A (motor), C (#3) | compliance rigoroso + `leak_focus` |
| **D — Proteção** | Stop-loss a frio · BRM/RoR ao vivo | #5, #8 | A (alerta da sessão), bankroll | anti-ruína comportamental + financeira |
| **E — Combustível & engajamento** | Break-feedback boost · Sharkscope · Re-engajamento · Report→chat | #9, #11, #14, #13 | B, EST-5 | densidade de dados + retenção no loop |
| **F — Refinamentos** | Game selection F1 · Periodização · Burnout v1 · Cold-start · Cockpit | #12, #15, #17, #16, #18 | C, D | margem + longevidade + visão única |
| **Backlog dormente** | Sono/cronotipo | #19 | — | só se demanda emergir; v0 = "dormiu bem? s/n" no warm-up |

### Notas de execução
- **Working tree compartilhada (INCIDENT #24/#45):** Fase A só começa depois de EST-2 + EST-5 fecharem, pra não competir pela tree. Sprints paralelos → **git worktree por sprint**; `git add` EXPLÍCITO por arquivo, nunca `git add -A`.
- **Metas pode rodar em paralelo a Fase C** (fatia 1 não depende de #3/#4) — usar worktree.
- **Colisão de rota** (EST-3/EST-6 já sofreram): rotas `/api/.../metas/*` registradas com ordem segura + guard test (DEC-A8 da spec).
- **Chave de semana** (CLAUDE.md §10/§6): snapshots de progresso em DATE UTC (`ymdUtc`); recs do Coach em BRT — não unificar.
- **Migrations:** drizzle-kit + rollback, psql local (localhost:5433), documentar pendência PROD (Neon) em CLAUDE.md §6.

---

## 5. Como cada ferramenta existente pluga na Metas (mapa de integração)

| Módulo | Lê | Alimenta a Metas com |
|--------|-----|----------------------|
| **Estudo** | `study_sessions_v2` (modes incl. `stat_analysis` EST-3, `handsSolvedCount`, `filtersAnalyzedCount`, `durationMinutes`), `study_themes`, `user_focus_stats`, `getStatsLeaks` (stub→Fase C) | medidas de estudo (horas, mãos, filtros), `leak_focus` |
| **Grind** | `grind_sessions`, `break_feedbacks` (foco/energia/confiança/IE/interferências 0-10), `warmup_rituals`, `cooldown_logs` (`abGameAnswers`, `tiltSelfAssessment`), notas | compliance de processo (#1), A/B/C-game (#2), tilt (#4), volume |
| **Coach** | relatórios (EST-1/2), nudges, ritual de segunda (EST-5), planejamento (EST-6), tools AI-2A (`recommend_lesson`, `schedule_study_block`, `bulk_propose_grade`), `career_goals` | co-define WIG/medidas, cobra na cadência (A4), ajusta meta irreal |
| **Bankroll** | `wallets` (multi-moeda, FX→USD lesson #6), `bankroll_snapshots`, `bankrollRules` | metas financeiras/BRM, RoR ao vivo (#8) |
| **Tournament Selector** | `tournamentScorer`, `varianceEngine` (RoR/SD) | game selection (#12), variância pra meta financeira |

---

## 6. Checkpoint do founder — registro

- ✅ **Espinha 4DX × curso** confirmada (processo/sistema controlável no curto prazo; resultado só norte de longo; Coach cobra comportamento sem culpa).
- ✅ **Board ICE** aceito integralmente (19 itens, ondas/fases conforme §3-§4).
- ✅ **Decisão 1:** WIG estende `career_goals`.
- ✅ **Decisão 2:** Metas em 2 fatias (fatia 1 manual ~70% sem motor; fatia 2 após Fase A).
- ⏳ **Pendente pro architect** (na fase de cada sprint, não agora): DEC-A6 (forma exata WIG↔career_goals), DEC-A7 (contrato do motor de aderência `getPlannedVsActual`), DEC-A8 (colisão de rota), demais DEC da spec.

---

## 7. O que foi aposentado / superseded

`Docs/strategy/fluxo-otimizacao-pos-est-2026-06-01.md` → **histórico.** Conteúdo absorvido e estendido aqui:
- Os 10 itens ICE originais → re-pesados e renumerados no board §3 (coluna "mantém #N" / "REFINA #N").
- As Fases A-E originais → reorganizadas em §4 incorporando os itens novos do curso + a Metas.
- A ressalva "aderência é pré-requisito da Metas" → confirmada e operacionalizada (Fase A motor; Metas fatia 2).

> O doc antigo recebe um header apontando para este como fonte de verdade. Não editar o ranking antigo — ele fica como registro do estado pré-curso.
