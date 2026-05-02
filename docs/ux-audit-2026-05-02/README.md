# UX Audit Grindfy — 2026-05-02

Auditoria minuciosa da interface do app Grindfy (SaaS poker). Objetivo: identificar oportunidades de melhoria UX/UI page-by-page.

---

## Estrutura dos documentos

| Arquivo | Conteudo |
|---------|----------|
| `ux-research-reference.md` | Boas praticas UX/UI 2025 + 17 anti-patterns IA + checklist auditoria |
| `page-inventory.md` | Inventario completo: 38 paginas + ~50 modais + componentes core |
| `audit-tier1-core.md` | Audit Home + Dashboard |
| `audit-tier1-library-upload.md` | Audit TournamentLibraryNew + UploadHistory |
| `audit-tier1-grind.md` | Audit GrindSession + GrindSessionLive |
| `audit-tier2.md` | Audit CoachAI + Bankroll + MentalPrep + GradePlanner (parcial) |
| `audit-tier3.md` | Audit GradePlanner detalhe + Biblioteca x3 + Studies + Settings (parcial) + macro |
| `implementation-plan.md` | **Plano de implementacao 5 fases / 11 sprints respeitando pipeline TDD** |
| `README.md` | Este arquivo (sumario executivo) |

---

## Cobertura

**Auditadas em profundidade (10 paginas, ~7500 linhas lidas):**
- Home, Dashboard, TournamentLibraryNew, UploadHistory, GrindSession, GrindSessionLive (estrutural), CoachAI, Bankroll, MentalPrep, GradePlanner (parcial), BibliotecaPage, CourseDetailPage, LessonViewer (estrutural), Studies, Settings (parcial)

**Pendentes (audit dedicado em proxima sessao):**
- Calculadoras, SessionHistory, Subscriptions, SubscriptionDemo
- Auth: Login, Register, ForgotPassword, ResetPassword, VerifyEmail, RegistrationConfirmation, Landing
- Admin: AdminDashboard, AdminUsers, AdminBugs, Analytics, AdminCoachAnalytics
- not-found

**Razao da pausa**: Limite de tokens da sessao + tamanho dos arquivos restantes. Auditoria do que esta documentado representa as paginas Tier 1 (uso diario) e Tier 2 (diferencial), que tem o maior impacto UX.

---

## Sumario Executivo — Top 15 Melhorias Prioritarias

Ordenadas por impacto x esforco. Numero entre [] = referencia ao audit detalhado.

### Quick wins (P1-P2, esforco low/med)

1. **[U1]** UploadHistory: tutorial por rede de poker + sample CSV. Onboarding critico — usuario novo abandona se nao consegue importar. **Impacto: HIGH | Esforco: HIGH** (ja vale a alocacao).

2. **[GS1, MP1]** Mover early return apos hooks em GrindSession + MentalPrep. Lesson #1 do CLAUDE.md viola. **Impacto: HIGH | Esforco: LOW**.

3. **[H1]** Home: esconder onboarding apos completo + progress bar. Hoje vira lixo permanente. **Impacto: HIGH | Esforco: LOW**.

4. **[D1, L2]** Filter chips ativos com reset rapido em Dashboard + Library. Padrao moderno ausente. **Impacto: HIGH | Esforco: MED**.

5. **[L3]** Library: card compacto + density toggle. Hoje cada card mostra 15 datapoints — muro de numeros. **Impacto: HIGH | Esforco: MED**.

6. **[B1, B3]** Bankroll: header 1 primary + 1 secondary + dropdown (atual: 5 botoes lutando). Remover BankrollWidget duplicado. **Impacto: HIGH | Esforco: MED**.

7. **[C1, C2]** CoachAI: counter de msgs/limites + prompt starters por persona. Empty state nao ensina hoje. **Impacto: HIGH | Esforco: MED**.

8. **[GL11]** GrindSessionLive: botao mute global TTS. Sessao com 5 alertas falando = caos. **Impacto: HIGH | Esforco: LOW**.

### Refatoracoes estruturais (P0-P1, esforco high mas indispensavel)

9. **[GL1]** GrindSessionLive: refatorar 2460 linhas em sub-containers. Tela mais critica do app, performance e manutencao precarias. **Impacto: HIGH | Esforco: HIGH**.

10. **[GL2]** GrindSessionLive: migrar bankroll shot modal pra Radix AlertDialog. Remove ~50 linhas de hack de focus trap + keyboard. **Impacto: HIGH | Esforco: MED**.

11. **[SE1]** Settings: tabs/shell navegavel. 1176 linhas empilhadas hoje. **Impacto: HIGH | Esforco: HIGH**.

12. **[GL3, GS2]** Reducer pra dialog state em GrindSessionLive + GrindSession. 14 booleans soltos = bugs futuros. **Impacto: MED | Esforco: MED**.

### Padronizacao visual (P1-P2)

13. **[L1]** Library: filtros uniformes (sem 7 gradientes). Anti-pattern 2.7 cores semanticas sem padrao. **Impacto: HIGH | Esforco: MED**.

14. **[U4]** Mover GranularDataCleanup pra Settings. Acao destrutiva colada em pagina de upload e foot-gun. **Impacto: HIGH | Esforco: MED**.

15. **[H6, L11, U9]** Remover `hover:scale-[1.02]` em todos cards. Sensacao de instabilidade, mobile sem hover. **Impacto: LOW | Esforco: LOW** (cleanup global).

---

## Padroes Globais Identificados

### Anti-patterns recorrentes
1. **Hierarquia visual plana** — Home, Dashboard, Library, Bankroll, Settings
2. **Filtros sem chips ativos** — Dashboard, Library, GrindSession, GrindSessionLive
3. **Multiplos dialogs sem mutex** — GrindSession (7), GrindSessionLive (14), Bankroll (6), Settings (~5)
4. **Cores semanticas inconsistentes** — Library (7 gradientes), Bankroll (4 estilos botao)
5. **`hover:scale-[1.02]`** — Home, Library, UploadHistory (cleanup global)
6. **Empty states genericos** — Library, GrindSession, lista de uploads (excecao: Biblioteca = exemplar)
7. **Loading com spinner full-screen** ao inves de skeleton — UploadHistory, MentalPrep dialogs
8. **Botoes sem tooltip em mobile/icon-only** — varios
9. **Confirm via `window.confirm()`** — GrindSession (recovery banner)
10. **localStorage misturado com server state** — GrindSession, GrindSessionLive (TODOs em codigo)

### Boas praticas a replicar
1. **Studies** — command palette Cmd/K, shell responsivo 3-breakpoints, onboarding wizard, hooks first explicito
2. **Biblioteca** — empty state rico, breadcrumb, error states tipados, "Continuar de onde parou", skeleton matching
3. **Dashboard** — URL state sync (FP-11), lazy-load tabs por enabled flag

---

## Convencoes Sugeridas (para padronizar codebase)

> **Status (2026-05-02):** Spec UI-FND-1 aprovada e ADR-078 criado formalizando estas convencoes como contrato arquitetural.
>
> - Spec: [`Docs/specs/ui-fnd-1-foundation.md`](../specs/ui-fnd-1-foundation.md)
> - ADR: [`Docs/architecture/decisions/078-design-tokens-ui-patterns.md`](../architecture/decisions/078-design-tokens-ui-patterns.md)
> - Diagrama de hierarquia: [`Docs/architecture/diagrams/ui-foundation-hierarchy.mermaid`](../architecture/diagrams/ui-foundation-hierarchy.mermaid)
> - Guia operacional: `Docs/conventions/ui-patterns.md` (entregavel RF-05 do sprint UI-FND-1; ainda nao criado nesta etapa)

Recomendado criar `Docs/conventions/ui-patterns.md` com:

- **CTA primario**: 1 por tela, cor solida (`tokens.color.action`), texto descritivo (acao + objeto)
- **Filtros**: chips removiveis acima da grid (`<FilterChipGroup>`) + collapsible filter panel
- **Empty state**: `<EmptyState>` canonico — icone + titulo + subtexto + CTA OBRIGATORIO + opcional `secondaryLink` "Como funciona?"
- **Loading state**: skeleton matching layout, nunca spinner full-screen
- **Error state**: mensagem por status code + botao retry + link sugestao bug
- **Modal vs Sheet**: confirmacoes destrutivas = AlertDialog, edicao em contexto = Sheet
- **Density**: pro user (Grind/Dashboard) = alta, conteudo (Biblioteca) = baixa
- **Hover/focus**: SEMPRE definir, nunca `outline:none` sem replacement
- **Motion**: usar `tokens.motion.fast/base/slow` (150/200/300ms); >300ms eh anti-pattern
- **PT-BR consistente**: acoes verbo + objeto ("Importar 47 torneios" > "Confirmar")
- **Hooks first**: early return apos todos useState/useEffect/useQuery (lesson #1)
- **Tokens TS**: `tokens.space.{xs..3xl}`, `tokens.font.{xs..2xl}`, `tokens.color.{success,danger,warn,info,action,neutral}.{text,bg,border}` — type-safe, frozen, autocompleta no IDE

---

## Proximos Passos

### Imediato (proxima sessao)
1. Audit Tier 4 (Auth + Admin + paginas remanescentes)
2. Audit completo Settings (linhas 150-1176)
3. Audit completo GradePlanner (linhas 200-978)

### Implementacao sugerida (priorizar via strategist + ICE)
1. **Sprint UI-Polish 1**: Quick wins (#1-#8 acima) — 5-7 dias
2. **Sprint UI-Refactor 1**: GrindSessionLive refatoracao (#9-#10) — 7-10 dias
3. **Sprint UI-Refactor 2**: Settings shell + GradePlanner sub-componentes — 5-7 dias
4. **Sprint UI-Polish 2**: Padronizacao global (#13-#15 + convencoes) — 3-5 dias

### Manutencao
- Adicionar checklist `ux-research-reference.md#parte-3` ao reviewer agent
- Criar template de PR com box "Auditoria UX" pra novas paginas
- Estabelecer "UX police" — reviewer roda checklist antes de merge

---

## Metricas do Audit

- **Paginas inventariadas**: 38
- **Modais inventariados**: ~50
- **Paginas auditadas em profundidade**: 10
- **Linhas de codigo lidas**: ~7500
- **Achados totais**: 130+
  - P0: 6
  - P1: 35+
  - P2: 50+
  - P3: 40+
- **Linhas de documentacao gerada**: ~2200

Auditoria realizada por Claude Opus 4.7 em modo autonomo (founder request: "investigue minuciosamente, multiplos agentes, plano completo de melhoria por pagina").
