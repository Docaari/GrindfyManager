# ADR-125 — Consolidar Flight + Variance em abas dentro de /coach

- Status: Aprovado
- Data: 2026-05-07
- Sprint: coach-page-reform-1
- Decision owner: system-architect (founder confirmou 2026-05-07)
- Related: spec `Docs/specs/sprint-coach-page-reform-1.md`, ADR-013 (eliminar PlanningDialog), ADR-099 (cockpit Home)
- Diagramas: `Docs/architecture/sprint-coach-page-reform-1/components-after.mermaid`, `routes-migration.mermaid`, `tab-persistence-sequence.mermaid`, `x-delete-gate-flow.mermaid`

---

## 1. Contexto

A pagina `/coach` (componente `GradePlanner.tsx`) e a "central de planejamento" do jogador, mas crescer organicamente acumulou quatro responsabilidades que hoje vivem em estruturas heterogeneas:

1. **Biblioteca de torneios + Grade semanal** — abas internas em `<Tabs>` Radix.
2. **Tournament Selector** — outra aba interna do mesmo `<Tabs>`.
3. **Variance Calculator (PrimeDope)** — painel inline `react-resizable-panels` vertical embaixo do `WeekGrid`, com toggle separado persistido em `localStorage('primedope_panel_expanded')`.
4. **Flights (multi-flight series)** — pagina **completamente separada** em rota `/flight` standalone, com item proprio na sidebar.

Resultado:

- **Hierarquia inconsistente:** PrimeDope vive como painel resizable (peer assimetrico) e Flight vive em outra rota (peer ainda mais distante). Ambos sao logicamente "planejar grade pro grind", mas o mental model exposto pela navegacao trata cada um como cidadao de classe diferente.
- **Estado UX duplicado:** PrimeDope tem flag `localStorage` + `react-resizable-panels` simultaneos (dois mecanismos para a mesma acao "esconder/mostrar").
- **Bookmarks dispersos:** sidebar item "Flight" + URL `/flight` quebram a unificacao de "tudo de planejamento mora em /coach".
- **Discoverability ruim:** founder relatou que jogadores frequentemente esquecem que o Variance Calculator existe (escondido como sub-painel) e que Flight esta em pagina separada.

Founder pediu unificacao das 4 entidades como abas peer dentro de `/coach`, com URL persistente para deep-linking e preservacao de bookmarks legados de `/flight`.

---

## 2. Decisao

**Consolidar Tournament Selector, Flights e Variance Calculator como abas peer dentro de `/coach`, com persistencia de aba ativa via query string `?tab=`. Remover rota `/flight` standalone e adicionar redirect `/flight -> /coach?tab=flights` para preservar bookmarks.**

### 2.1 Estrutura final

`/coach` renderiza um `<Tabs>` Radix com 4 abas peer:

| Slug `?tab=` | Label | Conteudo |
|---|---|---|
| `planner` (default) | Biblioteca + Grade | `BibliotecaPanel` + `WeekGrid` (split horizontal) |
| `selector` | Tournament Selector | `SelectorPanel` (intacto) |
| `flights` | Flights | `FlightsPanel` (novo, extraido de `Flight.tsx`) |
| `variance` | Variance Calculator | `PrimedopePanel` (migrado de painel inline) |

### 2.2 Persistencia URL

Novo hook `useTabFromUrl(validTabs, defaultTab)` em `client/src/hooks/useTabFromUrl.ts`:

- Le aba ativa de `?tab=`. Se ausente ou invalida, cai no default `planner` (e limpa param invalido via `replaceState`).
- `setActiveTab(slug)` atualiza URL via `history.replaceState` (NAO `pushState` — evita poluir historico do navegador a cada toggle de aba).
- Refresh F5 + bookmark direto + back/forward do navegador funcionam consistentemente.

### 2.3 Redirect `/flight`

`App.tsx` substitui `<Route path="/flight" component={Flight}>` por:

```tsx
import { Redirect } from "wouter";
<Route path="/flight">{() => <Redirect to="/coach?tab=flights" />}</Route>
```

`Sidebar.tsx` linha 93 atualiza `path: '/flight'` para `path: '/coach?tab=flights'` (label "Flight" mantido).

`Flight.tsx` recebe header `@deprecated` mas NAO e deletado fisicamente neste sprint (followup).

### 2.4 Aliasing de testid legacy

A aba Tournament Selector ganha alias `grade-tab-selector` (testid legacy) lado a lado com novo `coach-tab-selector` via wrapper `<div data-testid="grade-tab-selector" style={{display:'contents'}}>`. Justificativa em §5 abaixo. Outras abas sao novas e nao precisam alias.

---

## 3. Alternativas consideradas

### A. Manter standalone (status quo)

Manter `/flight` separado e PrimeDope como painel resizable inline.

- **Pros:** zero refactor, zero risco de regressao.
- **Contras:** continua o problema de discoverability + mental model fragmentado. Founder explicito que NAO quer essa opcao.

**Descartada** — founder pediu unificacao explicitamente.

### B. Sub-rotas Wouter `/coach/flights`, `/coach/variance`, etc.

Em vez de `?tab=`, usar `Route path="/coach/:tab?"` com sub-rotas dedicadas.

- **Pros:** semanticamente mais "limpo" (sub-rotas sao navegacao, abas sao apenas estado UI). Funciona melhor com `Sidebar` active state baseado em `pathname.startsWith()`.
- **Contras:**
  - Wouter v3 nao tem nested route layouts nativos como react-router v6 — precisaria implementar manualmente o "outlet" pattern.
  - Cada switch de aba via `setLocation('/coach/flights')` empurra entry no historico do navegador (a menos que use replaceState, que entao perde o beneficio de "voltar para aba anterior").
  - `Sidebar` ainda precisaria logica especial para destacar "Flight" quando em `/coach/flights` mas tambem destacar "Coach" quando em qualquer sub-rota — complexidade extra.
  - Dois sistemas de "navegacao": rota e estado interno para ordering de abas. Mais codigo, mais testes.

**Descartada** — `?tab=` e mais simples, casa naturalmente com `<Tabs>` Radix (que ja espera `value` controlado), e o wrapper `replaceState` resolve a poluicao de historico de forma trivial.

### C. Sidebar nav links separados (sem abas internas)

Criar 4 entradas distintas na sidebar (`Coach`, `Selector`, `Flights`, `Variance`) e ter 4 paginas separadas.

- **Pros:** discoverability maxima — cada feature tem entrada propria.
- **Contras:**
  - Sidebar ja sobrecarregada (mais de 12 itens). Adicionar 3 novos quebra o agrupamento por dominio.
  - Quebra o mental model "tudo de planejamento mora em /coach" que founder construiu.
  - Cada pagina renderiza sua propria casca (header, layout) — duplicacao de boilerplate.
  - Mobile fica ainda mais hostil (sidebar ja eh um drawer apertado).

**Descartada** — adicionar peso na sidebar piora UX em vez de melhorar.

### D. Uma aba unica com toggle interno por feature

Manter `/coach` com 1 aba, mas usar tabs/segmented control INTERNO para alternar entre Biblioteca+Grade / Selector / Flights / Variance.

- **Pros:** identica ao status quo de aba simples (sem novo `<Tabs>` Radix).
- **Contras:**
  - Sem persistencia URL nativa (precisaria implementar `?tab=` mesmo assim).
  - Visualmente: dois niveis de tabs (Radix outer + segmented inner) confundem. Ou nenhum, e fica visualmente mais barata mas pior discoverability.

**Descartada** — equivale a opcao decidida sem o beneficio de hierarquia visual clara.

---

## 4. Consequencias

### 4.1 Positivas

- **Discoverability:** todas as 4 entidades visiveis lado a lado no mesmo TabsList. Jogador descobre Variance Calculator ao olhar `/coach` pela primeira vez.
- **Deep-link e bookmark:** `?tab=flights` funciona como URL canonica. Compartilhar link de uma aba especifica com outro jogador / Coach AI / suporte e trivial.
- **Back/forward consistentes:** `replaceState` evita poluicao de historico, mas ainda permite refresh + bookmark sem regressao.
- **Mental model unificado:** "/coach = sala de planejamento" alinhado com pivot de roadmap.
- **Codigo mais coeso:** `Flight.tsx` standalone (131 linhas + dependencias proprias) eliminado como pagina top-level. Sidebar reduz acoplamento (nao depende mais de rota standalone).
- **localStorage cleanup:** key legacy `primedope_panel_expanded` removida automaticamente em mount inicial (housekeeping silencioso).

### 4.2 Negativas

- **Pagina `GradePlanner.tsx` fica maior em LOC** (de ~1000 para ~1200+ linhas estimado, antes da refatoracao em sub-componentes Tab que vai vir em followup).
- **Risco de regressao em testes legacy de Flight:** suite atual de Flight.tsx tem testes que importam direto da pagina. Migracao para `FlightsPanel` exige update de imports. Mitigacao: spec ja preve update + alias testId.
- **Mobile horizontal scroll de TabsList:** 4 abas em viewport pequeno (< 360px) podem precisar overflow scroll. Decisao visual fica com strategist no sub-handoff de RF-05; spec aceita scroll horizontal como tradeoff razoavel.
- **`Sidebar` active state com query string:** logica atual provavelmente compara `pathname === item.path`. `/coach?tab=flights` nao casa exatamente — destaque do item "Flight" pode quebrar. Mitigacao: spec RF-07.2 manda investigar e ajustar; followup-8 dedicada se nao resolver no sprint.
- **Carga inicial:** se Radix Tabs renderizar todos os `TabsContent` ao mesmo tempo (forceMount=true), PrimedopePanel e FlightsPanel pagam custo de mount mesmo com user na aba Planner. Mitigacao: spec usa `forceMount={false}` (default) para lazy mount.

### 4.3 Neutras

- **Followup obrigatorio:** Flight.tsx file fica em pe com header `@deprecated`; futuros PRs nao podem importar. Cleanup fisico em followup-1 apos sprint validado em prod.
- **Banner de pendencias temporario:** RF-04 cria `CoachPendingBanner` com checklist visual para founder validar features novas. Banner sera removido em followup-7 quando todos itens forem OK.

---

## 5. Detalhe — testid alias `grade-tab-selector`

Testes legacy do projeto usam `screen.getByTestId('grade-tab-selector')` para alvejar a aba Tournament Selector (presente no `GradePlanner.tsx` original em duas linhas — desktop 964, mobile 942).

Para manter compatibilidade zero-touch com esses testes E adotar o novo testid canonico `coach-tab-selector`, adotamos a **Opcao B** (wrapper invisivel) das 3 alternativas listadas na spec §5.4:

```tsx
<div data-testid="grade-tab-selector" style={{ display: 'contents' }}>
  <TabsTrigger data-testid="coach-tab-selector" value="selector">
    Tournament Selector
  </TabsTrigger>
</div>
```

`display: contents` faz o `<div>` desaparecer do layout/CSS/tab-order/a11y tree mas preserva o no no DOM. Resultado:

- `getByTestId('grade-tab-selector')` resolve o `<div>` wrapper (testes legacy passam).
- `getByTestId('coach-tab-selector')` resolve o `<TabsTrigger>` real (testes novos funcionam).
- Radix Tabs nao percebe diferenca: o `<TabsTrigger>` continua sendo filho direto do `<TabsList>` para fins de keyboard nav e ARIA.

Razao de escolher Opcao B sobre Opcao A (atributo paralelo `data-testid-legacy`):

- Opcao A exigiria adaptacao em testes legacy (`getByTestId(/^grade-tab-selector$/)` ou query custom). NAO eh zero-touch.
- Opcao B eh zero-touch para testes legacy e nao polui o DOM com atributos invented.

Aplicado APENAS na aba Selector — outras abas sao novas (`coach-tab-planner`, `coach-tab-flights`, `coach-tab-variance`) e nao tem legacy.

Followup: sprint dedicada migra testes legacy para `coach-tab-selector` e remove o wrapper.

---

## 6. Confianca

**Alta.**

- Wouter v3 (`^3.3.5` em `package.json`) ja exporta `Redirect`, `useLocation`, `useSearch`. API estavel.
- Radix Tabs `value` controlado sincroniza com qualquer state externo (`useTabFromUrl`).
- `display: contents` tem suporte universal em browsers atuais (Chromium, Firefox, Safari 17+).
- Pattern `?tab=` + `replaceState` ja foi aplicado em projetos similares sem regressao.
- Padrao de abas com lazy mount (Radix `forceMount={false}` default) ja em uso em outras paginas do projeto.

Riscos residuais (`Sidebar` active state, regressao de testes Flight legacy) tem mitigacoes documentadas na spec §12 e fallback em followups.
