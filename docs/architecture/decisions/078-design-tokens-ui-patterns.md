# ADR-078 — Design tokens TS-puros + componentes utilitarios canonicos para Foundation UI

- Status: Aceito
- Data: 2026-05-02
- Sprint: UI-FND-1 (Fase 0 do plano UX 2026-05-02)
- Decision owner: system-architect (formaliza decisoes founder D1-D12 da spec + R8/R2/R5)
- Related: ADR-076 (sanitizacao), nenhuma sobreposicao de dominio com ADRs anteriores
- Spec: `Docs/specs/ui-fnd-1-foundation.md`
- Audit base: `Docs/ux-audit-2026-05-02/` (130+ achados em 10 paginas)
- Nota de numeracao: ADR-077 ja em uso por `077-coach-actions-migration-and-audit-log.md` (mesma data 2026-05-02). Esta ADR usa 078 (proximo livre). Founder pode renumerar se quiser.

---

## 1. Contexto

### 1.1. Diagnostico

O audit Grindfy 2026-05-02 catalogou **130+ achados** em ~7500 linhas de codigo lidas em 10 paginas Tier 1/2. Sete anti-patterns recorrentes da `ux-research-reference.md` se materializam de forma sistematica:

| Anti-pattern | Manifestacao concreta no Grindfy |
|---|---|
| 2.1 — Inconsistencia de espacamento/tipografia | `p-4` em Library, `p-6` em Bankroll, `py-3 px-5` em Settings; `text-xl` vs `text-2xl` para mesmo nivel hierarquico em Home/Dashboard |
| 2.7 — Cores semanticas sem padrao | TournamentLibraryNew com **7 gradientes diferentes** em filter chips; Bankroll com **4 estilos de botao primario** divergentes |
| 2.10 — Empty states genericos | Library, GrindSession, lista de uploads mostram apenas "Nenhum item" sem CTA. Excecao: `studies/EmptyState.tsx` (Sprint Studies-Reform) eh exemplar mas isolado |
| 1.7 + UX checklist — Filtros sem chips ativos | Dashboard, Library, GrindSession, GrindSessionLive: cada um implementou ad-hoc, nenhum mostra chips removiveis dos filtros aplicados |
| 2.6 — Hierarquia visual plana | Home, Dashboard, Library, Bankroll, Settings sem 1 elemento dominante; headers das paginas com tratamento divergente (Home grid, UploadHistory text-center, demais esquerda mas com tamanhos variaveis) |
| 1.12 — Microinteracoes inconsistentes | Sem token de duracao: animacoes 200ms aqui, 300ms ali, 500ms em outros (anti-pattern: >300ms vira lento) |
| Lessons #2 + #11 do CLAUDE.md | Componentes locais sem `data-testid` estavel; EmptyStates com CTAs decorativos ja causaram bugs (ver lesson #11 — "Default minimo em componentes") |

### 1.2. Por que tokens AGORA (antes de tocar paginas)

O `implementation-plan.md` agenda 11 sprints UI distribuidos em 7 semanas. Sem foundation:

- Cada sprint duplica decisao de escala (4/8/12 vs 2/4/8 vs random) — desperdicando o trabalho do anterior.
- Cada pagina cria proprio `EmptyState`/`FilterChip` com markup incompativel — Sprint UI-QW-1 vira churn massivo.
- Reviewer nao tem checklist concreto para reprovar drift visual.
- Pipeline TDD desperdica testes em casos repetidos (cada componente local re-testa o mesmo padrao basico).

### 1.3. Por que decisao precisa ADR

- Estabelece **fonte de verdade visual** consumida por todos os 10 sprints UI subsequentes — eh decisao arquitetural, nao escolha tatica.
- Fixa contrato de API (estrutura de `tokens.color.*`, signature de `EmptyState`/`FilterChip`/`PageHeader`) que reviewer usa pra reprovar PRs futuros.
- Documenta alternativas descartadas (CSS vars, lib externa, Tailwind extend puro) para que sprints futuros nao revisitem sem causa.
- Resolve 3 questoes pendentes da spec (R8 estrutura color tokens, R2 legacy migration, R5 PageHeader gradient) com decisoes do founder.

---

## 2. Decisao

Criar **camada Foundation TS-pura** complementar ao shadcn/Tailwind ja em uso, composta por:

### 2.1. Design tokens em `client/src/lib/ui-tokens.ts`

**TypeScript puro, NAO novas CSS variables.** Stack atual ja usa `var(--background)`, `var(--primary)`, `var(--radius)` (definidas em `client/src/index.css` via shadcn) — esses CSS vars permanecem intocados. Tokens TS sao camada **complementar** que:

- Oferece type-safety + autocomplete (`tokens.space.md` em vez de classnames Tailwind soltas).
- Mapeia para classes Tailwind / referencia CSS vars existentes.
- Frozen profundo via helper `deepFreeze<T>(obj: T): Readonly<T>` co-localizado.
- Tipos exportados (`SpaceKey`, `FontKey`, `ColorKey`, `MotionKey`, `RadiusKey`, `ShadowKey`) para uso em props de componentes.

**Estrutura final dos namespaces:**

| Namespace | Aliases | Valores | Justificativa |
|---|---|---|---|
| `space` | `xs, sm, md, base, lg, xl, 2xl, 3xl` | `[4, 8, 12, 16, 24, 32, 48, 64]` px | Escala potencia-de-2 + intermediarios. `0` sem alias (use literal). Mapeia 1:1 para Tailwind `0/1/2/3/4/6/8/12/16` |
| `font` (size) | `xs, sm, base, lg, xl, 2xl` | `[12, 14, 16, 20, 24, 32]` px | 6 niveis (boas praticas: 4-5 max, +1 caption). Sem `3xl` (display) — Home hero usa custom |
| `fontWeight` | `normal, medium, semibold, bold` | `400, 500, 600, 700` | Excluido `300` (thin — anti-pattern em pro UI) e `800/900` |
| `color` | `success, danger, warn, info, action, neutral` | Cada um = `{ text, bg, border }` (objeto, **R8**) | 6 tokens semanticos. **`action` = CTA primario de marca** (poker-accent). `neutral` para fallback/muted |
| `motion` | `fast, base, slow, easing` | `150, 200, 300` (ms) + `cubic-bezier(0.4, 0, 0.2, 1)` | 3 duracoes — anti-pattern: >300ms vira lento. Easing unico padrao |
| `radius` | `sm, md, lg, full` | `4, 8, 12, 9999` (px) | 4 niveis — escala enxuta. CSS var `--radius` segue valendo para shadcn |
| `shadow` | `sm, md, lg` | Strings CSS prontas | 3 niveis — sem `xl/inner` |

**Estrutura de cor (resolve R8 — decisao founder):**

```ts
color: {
  success: {
    text: 'text-green-300',
    bg: 'bg-green-500/15',
    border: 'border-green-500/40',
  },
  danger:  { text: 'text-red-300',   bg: 'bg-red-500/15',    border: 'border-red-500/40' },
  warn:    { text: 'text-amber-300', bg: 'bg-amber-500/15',  border: 'border-amber-500/40' },
  info:    { text: 'text-blue-300',  bg: 'bg-blue-500/15',   border: 'border-blue-500/40' },
  action:  { text: 'text-poker-accent', bg: 'bg-poker-accent/15', border: 'border-poker-accent/40' },
  neutral: { text: 'text-muted-foreground', bg: 'bg-muted',  border: 'border-border' },
}
```

Cada cor exporta as 3 variantes mais usadas (`text` para tipografia, `bg` para preenchimento sutil, `border` para outline). Componentes consomem como `tokens.color.danger.bg` direto em `className`, sem string-manipulation. Implementer pode adicionar `solid` no futuro (variant cheia) sem quebra — extensao retrocompativel.

### 2.2. Tres componentes utilitarios canonicos

Cada um em `client/src/components/ui/`:

| Componente | API resumida | Resolve achados |
|---|---|---|
| `EmptyState.tsx` | `{ icon?, title, description, ctaLabel, ctaAction, secondaryLink?, variant: 'default'\|'compact', iconSize: 'sm'\|'md'\|'lg', area? }` — CTA OBRIGATORIO (lesson #11) | L4, U2, GS6-recovery + Library/Upload list |
| `FilterChip.tsx` + `FilterChipGroup` | Chip: `{ label, onRemove, variant, tone: ColorKey }`; Group: `{ chips: [...], onClearAll? }` — onClearAll so renderiza com >=2 chips | D1, L2, GL8 + futuro padrao Dashboard/Library/GrindSession |
| `PageHeader.tsx` | `{ title, subtitle?, actions?, breadcrumb? }` — sem prop `icon`/`gradient` (R5: minimalista canonico) | H6 indireto, U10, hierarquia plana global |

### 2.3. Guia `Docs/conventions/ui-patterns.md`

Documento prescritivo (200-400 linhas, PT-BR, snippets > paragrafos) cobrindo 14 topicos: tokens, hierarquia, CTA, filtros, empty/loading/error, modal vs sheet, densidade, hover/focus/motion, copy PT-BR, hooks first, `data-testid`, escape hatch. Reviewer usa como checklist explicito.

### 2.4. Decisoes pre-tomadas pelo founder (resolvendo questoes da spec)

**R8 — Estrutura de color tokens.** Decidido: **objeto `{text, bg, border}` por semantic color**. Mais flexivel + type-safe + autocompleta no IDE. Componentes acessam `tokens.color.danger.bg` direto, sem template string manipulation.

**R2 — Legacy `studies/EmptyState.tsx` + `EmptyState` novo.** Decidido: **NAO deletar agora**. Marca `studies/EmptyState.tsx` como deprecated via JSDoc comment (`@deprecated Use @/components/ui/EmptyState. Migration target: Sprint UI-QW-1.`). Migracao agendada como item G6 do plano UI-QW-1. Convivencia segura — APIs sao supersets compativeis.

**R5 — PageHeader gradient/hero.** Decidido: **sem variant gradient**. PageHeader eh canonico minimalista (titulo + subtitle + actions + breadcrumb opcional). Home tem hero unico que continua componente proprio (`HomeHero.tsx` opcional, criado em Sprint UI-T1-Home se necessario). Mistura de hero + header generico vira anti-pattern (`PageHeader` virando carga de variants).

---

## 3. Alternativas Consideradas

### 3.1. CSS vars novas (em `index.css`) — REJEITADO

**Pros:**
- Coerente com sistema atual shadcn (que usa `--background`, `--primary`).
- Suporte nativo a dark/light mode via media query.
- Nao requer importacao em cada componente.

**Contras (decisivos):**
- **Nao type-safe.** `var(--space-md)` em CSS classname nao tem autocomplete, nao detecta typos em build.
- **Nao auditavel via TS.** Reviewer nao consegue grep estrutura, validar completude.
- **Sem tipos exportados.** Props como `gap?: SpaceKey` requerem manter um TS espelho duplicado.
- **Cor estruturada complexa.** `{text, bg, border}` em CSS exige 3 vars por cor (`--color-danger-text`, etc) — proliferacao.

**Rejeitado**: trade-off type-safety vs convenience pesa para TS quando o consumer principal eh React + autocomplete-driven.

### 3.2. Usar lib externa (Radix Themes, Mantine Theme, Stitches) — REJEITADO

**Pros:**
- Dark mode, theme switching, scale completa "free".
- Comunidade + docs.

**Contras (decisivos):**
- **Conflito com shadcn ja instalado.** Migrar dual seria churn massivo (50+ componentes shadcn em uso).
- **Bundle size.** +30-80KB, contradiz NFR (<8KB para Foundation total).
- **Lock-in.** Mudar de tema no futuro requer migrar todos consumers.
- **Excesso de feature.** 90% da API nao usaremos; complexidade de manutencao desproporcional.

**Rejeitado**: pragma e que shadcn + Tailwind ja resolvem 80% do problema visual; faltam tokens semanticos canonicos + 3 componentes utilitarios — escopo cabe em arquivo TS proprio.

### 3.3. Tailwind config extend puro — REJEITADO

**Pros:**
- Aproveita pipeline ja configurado.
- Classnames consistentes.

**Contras (decisivos):**
- **Nao cobre motion durations** (transitions inline).
- **Nao cobre objetos complexos** como `color.danger.{text,bg,border}` — Tailwind extend gera classes mas nao oferece API estruturada para componente.
- **Sem tipos TS automaticos.** SpaceKey, ColorKey precisariam ser declarados a parte ou via plugin custom (overhead).

**Rejeitado**: Tailwind eh o backend de classes, mas tokens TS sao a frontend type-safe que Tailwind nao oferece.

### 3.4. CVA (class-variance-authority) only — REJEITADO

**Pros:**
- Ja em uso pelos componentes shadcn.
- Composicao de variants type-safe.

**Contras (decisivos):**
- **CVA eh para variants de COMPONENTE, nao para tokens semanticos compartilhados.** Resolve "Button has variant=primary|secondary"; nao resolve "qual eh o `space.md` canonico?".
- **Forca cada componente a redeclarar suas escalas.** Sem fonte de verdade compartilhada.

**Decisao final**: CVA continua em uso para variants internas dos componentes; tokens TS sao a camada superior consumida por CVA configs quando necessario.

### 3.5. Storybook ou doc visual interativa — DEFERRED

Considerado, descartado para escopo deste sprint. `ui-patterns.md` markdown eh suficiente como guia escrito. Storybook adicionaria setup nao trivial (~1 dia) sem retorno proporcional para projeto pequeno team.

---

## 4. Consequencias

### 4.1. Positivas

- **Consistencia visual auditavel.** Reviewer tem checklist concreto: "este botao usa `tokens.color.action`? este padding vem de `tokens.space.md`?".
- **Dev velocity nas paginas Tier 1.** Sprint UI-QW-1 (Fase 1) substitui empty states/filter chips ad-hoc por Foundation em batch — economiza ~30% do effort estimado.
- **Type safety end-to-end.** `gap?: SpaceKey` em props. Typo em `tokens.space.medd` bloqueia build.
- **Reducao de bug surface.** Componentes Foundation sao testados 1x; consumers nao re-testam markup basico.
- **Onboarding mais rapido.** Novo dev/agente tem 1 lugar canonico para "como construo X" (`ui-patterns.md`).
- **Anti-patterns IA endereçados.** Lesson #2 (data-testid), #11 (sem default action), e tres anti-patterns do `ux-research-reference.md` (2.1, 2.7, 2.10) tem componente canonico que respeita os padroes desde o nascimento.

### 4.2. Negativas / Trade-offs

- **+1 lugar para sincronizar.** `tokens.space.md = 12` precisa casar com Tailwind `p-3` em consumers. Drift possivel se Tailwind config mudar — mitigado por testes que validam mapeamento.
- **Curva de aprendizado.** Devs/agentes precisam aprender a importar tokens em vez de usar classnames soltas. Mitigado por `ui-patterns.md` + reviewer rigoroso.
- **Frozen pode quebrar HMR.** Risco baixo (testar manualmente apos implementacao); fallback documentado em spec (frozen so em prod build).
- **Convivencia com legacy `studies/EmptyState`** durante 1 sprint (UI-FND-1 deprecata, UI-QW-1 migra). Ambiguidade temporaria.
- **API rigida pode nao casar 100% dos casos.** Esperado 80-90% — escape hatch documentado em `ui-patterns.md`. Casos exoticos abrem issue para evoluir API.

### 4.3. Neutras / Operacionais

- **Bundle size impact.** ~3-6KB minified ungzipped (tokens + 3 componentes). Cabe em NFR <8KB.
- **Zero novas dependencias.** `lucide-react` (X icon), `clsx`, `tailwind-merge`, `wouter` ja em uso.
- **Zero impact em backend.** Foundation eh 100% client-side.
- **Suite de testes existente (4157+ testes) continua intocada.** Foundation adiciona testes proprios sem mexer em paginas.

### 4.4. Impacto em sprints subsequentes

- **UI-QW-1 (Fase 1).** Consome `EmptyState`/`FilterChip` para resolver achados G6 + G7 do plano. Migracao do `studies/EmptyState.tsx` legacy entra como item G6 (ja documentado).
- **UI-T1-Dashboard, UI-T1-Library, UI-T1-Grind, UI-T1-Upload (Fase 2).** Consomem `PageHeader` + tokens em refactor de header e padding. ADRs proprios do sprint nao precisam re-documentar essas decisoes.
- **UI-REF-1 (GrindSessionLive).** Consome tokens nos 7 sub-containers. Containers exotericos (alerts, breaks) podem precisar tokens adicionais — extensao retrocompativel via novos keys.
- **UI-T2-* (Fase 4).** Consomem para padronizar headers + empty states em Coach/Bankroll/MentalPrep.
- **Reviewer agent.** Ganha checklist novo: "Foundation usado quando aplicavel? Tokens em vez de magic numbers?". Documentado em `ui-patterns.md`.

### 4.5. Debt removida

- Empty states ad-hoc (5+ implementacoes locais detectadas no audit) viram 1 componente canonico.
- Filter chips ad-hoc (4+ implementacoes) viram 1 componente.
- Magic numbers de spacing/font/motion espalhados (~50 ocorrencias estimadas) viram tokens.
- Lesson #11 (default action decorativo) tem barreira arquitetural — impossivel passar `<EmptyState>` sem `ctaAction` em compile time.

### 4.6. Debt nova introduzida

- Migracao de `studies/EmptyState.tsx` agendada para UI-QW-1 — nao executar = inconsistencia perpetua.
- `ui-patterns.md` tem risco de ficar desatualizado (R6 da spec). Mitigacao: adicionar item ao reviewer agent + revisao periodica nos sprints UI-QW e UI-T1-*.
- CSS vars existentes em `index.css` continuam intocadas — eventual unificacao (tokens TS referenciando CSS vars consistentemente) fica para sprint dedicado se necessario.

---

## 5. Confianca

**Alta.** Decisao baseada em:

- Evidencia empirica do audit (130+ achados catalogados, padroes recorrentes claros).
- Lessons learned do projeto (lesson #2 testid, #9 try/catch, #11 default action) ja informaram a API dos componentes.
- Stack ja em uso (Tailwind + shadcn + TS) suporta tokens TS sem friccao.
- Escopo bem isolado (5 arquivos novos, zero mudanca em paginas) — risco de regressao baixo.
- Defaults D1-D12 da spec ja resolveram a maioria das decisoes; ADR consolida.

Pontos de atencao para o reviewer validar pos-implementer:

- Cobertura dos 130+ achados via tokens (nao deve faltar `space.4xl=80` ou tone novo).
- Bundle size real <8KB (medir apos build).
- Frozen profundo nao quebra HMR (smoke manual em `npm run dev`).
- API estavel — nenhum prop adicionado depois forca breaking change em consumers.

---

## 6. Notas de Implementacao

- Ordem recomendada: tokens → EmptyState → FilterChip → PageHeader → guia. Componentes dependem de tokens; guia depende dos 3.
- Testes co-localizados em `__tests__/` adjacente (`client/src/lib/__tests__/`, `client/src/components/ui/__tests__/`).
- Diagrama de hierarquia de componentes em `Docs/architecture/diagrams/ui-foundation-hierarchy.mermaid`.
- Founder QA visual antes de merge para main (smoke `npm run dev` + `npm run check` + `npx vitest run`).
- Rastreabilidade: cada token mapeia para 1+ achado do audit (validar via checklist no reviewer).

---

**Fim do ADR-078.**
