# Spec — UI-FND-1 Foundation (Design Tokens + Componentes Utilitarios)

> Sprint: UI-FND-1 (Fase 0 — Foundation do plano UX 2026-05-02)
> Data: 2026-05-02
> Input: `Docs/ux-audit-2026-05-02/implementation-plan.md` (secao "Sprint UI-FND-1") + `Docs/ux-audit-2026-05-02/README.md` (secao "Convencoes Sugeridas") + `Docs/ux-audit-2026-05-02/ux-research-reference.md` (boas praticas + anti-patterns)
> Output: este documento — fonte de verdade operacional para `system-architect`, `test-writer`, `implementer`, `reviewer`
> Status: Proposta (aguardando aprovacao do dev)
> Idioma: PT-BR (codigo em ingles, conteudo/UI em PT-BR)

---

## 1. Sumario Executivo

**Objetivo.** Criar a fonte de verdade visual do Grindfy (design tokens + componentes utilitarios padronizados + guia de padroes documentado) ANTES de qualquer sprint de polish em paginas existentes. Sem foundation, sprints subsequentes (UI-QW-1, UI-T1-*) replicariam a inconsistencia atual catalogada no audit (130+ achados, ~7 anti-patterns recorrentes).

**Escopo.** 5 RFs entregaveis em ~3 dias dev. **ZERO mudanca em paginas existentes neste sprint** — entrega so foundation. Sprints subsequentes consomem.

**5 RFs em 1 linha:**
- **RF-01** — `client/src/lib/ui-tokens.ts` — design tokens (spacing scale, font sizes, semantic colors, radii, shadows, motion durations)
- **RF-02** — `client/src/components/ui/EmptyState.tsx` — empty state canonico (icone + titulo + subtexto + CTA + link opcional), com variantes por tipo
- **RF-03** — `client/src/components/ui/FilterChip.tsx` — chip removivel padrao (label + valor + close), com group helper opcional
- **RF-04** — `client/src/components/ui/PageHeader.tsx` — header consistente (h1 + subtitle + actions slot a direita + breadcrumb opcional)
- **RF-05** — `Docs/conventions/ui-patterns.md` — guia de padroes UI canonicos (uso de tokens, decisao tree para componentes, exemplos PT-BR)

**Fora de escopo:** veja secao 11.

---

## 2. Contexto e Motivacao

### 2.1. Problema documentado pelo audit

O audit Grindfy 2026-05-02 catalogou 130+ achados em 10 paginas Tier 1/2 (~7500 linhas de codigo lidas). Os anti-patterns recorrentes que motivam Foundation:

1. **Inconsistencia de espacamento e tipografia** (anti-pattern 2.1 do `ux-research-reference.md`) — `p-4` aqui, `p-6` ali, `py-3 px-5` la; headings com `text-xl` vs `text-2xl` para mesmo nivel hierarquico.
2. **Cores semanticas sem padrao** (anti-pattern 2.7) — Library com 7 gradientes de cor; Bankroll com 4 estilos de botao primario; verde em uma tela e vermelho em outra para "Confirmar".
3. **Empty states genericos** (anti-pattern 2.10 + secao 1.3 das boas praticas) — Library, GrindSession, lista de uploads mostram so "Nenhum item" sem CTA. Excecao: Biblioteca/Studies sao exemplares (motivo: Sprint Studies-Reform criou EmptyState local).
4. **Filtros sem chips ativos** (secao 1.7 das boas praticas) — Dashboard, Library, GrindSession, GrindSessionLive todos tem filtros sem indicacao visual do que esta ativo. Cada pagina implementou ad-hoc.
5. **Hierarquia visual plana** (anti-pattern 2.6) — Home, Dashboard, Library, Bankroll, Settings sem 1 elemento dominante. Headers das paginas com tratamento divergente (Home = grid, UploadHistory = `text-center`, demais = esquerda mas com tamanhos variaveis).

### 2.2. Tese

**Tokens + componentes utilitarios = atalho para refatoracao subsequente.** Sprints UI-QW-1 (cleanup global) e UI-T1-* (page-by-page polish) precisam consumir Foundation. Sem isso:
- Cada sprint duplica decisao de escala (4/8/12 vs 2/4/8 vs random).
- Cada pagina cria proprio EmptyState com markup incompativel.
- Reviewer nao tem checklist concreto para reprovar drift visual.
- Pipeline TDD desperdica testes em casos repetidos (cada componente local re-testa o mesmo padrao basico).

### 2.3. Por que ZERO mudanca em paginas

Foundation e arquitetural. Misturar com refator de pagina (ex: aplicar EmptyState novo em Library no mesmo sprint) cria escopo gordo, dificulta review, viola principio "1 spec = 1 entregavel coerente". O plano explicitamente isola: Sprint UI-FND-1 entrega componentes; Sprint UI-QW-1 (proximo) faz a substituicao em batch.

### 2.4. Por que Tokens primeiro (nao componentes primeiro)

EmptyState/FilterChip/PageHeader CONSOMEM tokens. Se construirmos componentes hardcoded (`text-lg`, `bg-poker-accent`, `p-12`) e depois extrairmos tokens, viramos refactor circular. Tokens sao o substrato — entram em RF-01 e os outros 3 RFs derivam.

---

## 3. Defaults Ativos D1-D12

Decisoes ja tomadas pelo PM. Test-writer e implementer assumem sem requestionar.

| ID | Default |
|---|---|
| **D1** | **Tokens em TS puro, nao CSS variables novas.** Stack atual ja usa `var(--background)`, `var(--primary)`, etc (definidas em `client/src/index.css` via shadcn). RF-01 NAO mexe nesses CSS vars existentes — adiciona uma camada **complementar** em TS exportando: spacing, font sizes, motion, semantic color tokens (que mapeiam para classes Tailwind ou CSS vars existentes). Motivo: tokens em TS sao type-safe, autocompletam no IDE, e podem ser consumidos em props de componente sem precisar parsear classnames. |
| **D2** | **Spacing scale = `[0, 4, 8, 12, 16, 24, 32, 48, 64]`** (em px). Mapeamento Tailwind: `0 → 0`, `4 → 1`, `8 → 2`, `12 → 3`, `16 → 4`, `24 → 6`, `32 → 8`, `48 → 12`, `64 → 16`. Tokens expoem como `space.xs (4)`, `space.sm (8)`, `space.md (12)`, `space.base (16)`, `space.lg (24)`, `space.xl (32)`, `space.2xl (48)`, `space.3xl (64)`. Valor `0` nao tem alias (use literal). |
| **D3** | **Font sizes = `[12, 14, 16, 20, 24, 32]`** (em px). Aliases: `font.xs (12)`, `font.sm (14)`, `font.base (16)`, `font.lg (20)`, `font.xl (24)`, `font.2xl (32)`. Pesos suportados: `400` (normal), `500` (medium), `600` (semibold), `700` (bold). NAO incluir `300` (thin) nem `800/900` (anti-pattern de poker pro UI). |
| **D4** | **Semantic colors = 6 tokens canonicos**: `success`, `danger`, `warn`, `info`, `action`, `neutral`. Cada um expoe 3 variantes: `default`, `subtle` (bg suave), `foreground` (texto sobre subtle). Mapeamento (referenciar CSS vars quando existirem, senao classes Tailwind): `success → green-500/950/green-300`, `danger → red-500/red-950/red-300`, `warn → amber-500/amber-950/amber-300`, `info → blue-500/blue-950/blue-300`, `action → poker-accent (existing) / poker-accent/15 / poker-accent`, `neutral → gray-500/gray-900/gray-300`. **`action` e o CTA primario** — cor de marca Grindfy ja usada em botoes "primary". |
| **D5** | **Motion tokens = 3 durations + 1 easing**: `motion.fast (150ms)`, `motion.base (200ms)`, `motion.slow (300ms)`, `motion.easing ('cubic-bezier(0.4, 0, 0.2, 1)')`. Animacoes que excedam 300ms sao anti-pattern (boas praticas 1.12). Uso obrigatorio de `prefers-reduced-motion` documentado no guia (RF-05) — implementacao concreta fica para sprints de polish. |
| **D6** | **Radii tokens = 4 niveis**: `radius.sm (4px)`, `radius.md (8px)`, `radius.lg (12px)`, `radius.full (9999px)`. NAO criar token `radius.xs` ou `radius.xl` — mantemos escala enxuta. CSS var `--radius` existente (definida em `index.css`) continua valendo para shadcn primitives — nossos tokens cobrem casos custom. |
| **D7** | **Shadow tokens = 3 niveis**: `shadow.sm` (sutil, hover de cards), `shadow.md` (popovers/dropdowns), `shadow.lg` (modais flutuantes). Strings CSS prontas (ex: `'0 1px 2px 0 rgb(0 0 0 / 0.05)'`). NAO criar `shadow.xl` ou `shadow.inner` — escopo enxuto. |
| **D8** | **EmptyState: API expandida sem quebrar EmptyState existente em studies/.** O componente `studies/EmptyState.tsx` (criado em Sprint Studies-Reform) NAO sera deletado neste sprint (escopo fora — quem migra e o sprint UI-QW-1). Novo componente em `ui/EmptyState.tsx` tem API superset: aceita os mesmos props (`icon`, `title`, `description`, `ctaLabel`, `ctaAction`, `area`) **mais** props novos (`secondaryLink?: { label: string; href: string }`, `variant?: 'default' \| 'compact'`, `iconSize?: 'sm' \| 'md' \| 'lg'` default `md`=64px). Lessons aplicadas: #11 (sem default action decorativa — chamador define `ctaAction` obrigatorio), #2 (`data-testid="empty-state"` + `data-testid="empty-state-cta"` + `data-testid="empty-state-secondary-link"` quando aplicavel). |
| **D9** | **FilterChip: 1 chip = 1 filtro removivel.** Props: `label: string` (ex: `"Buy-in: $5-$20"`), `onRemove: () => void` (obrigatorio — chip sempre removivel), `variant?: 'default' \| 'subtle'` default `default`, `tone?: 'neutral' \| 'success' \| 'danger' \| 'warn' \| 'info' \| 'action'` default `neutral`. Renderiza pill com label + botao "x" (icone X 14px, `aria-label="Remover filtro {label}"`). NAO renderiza `value` separado — chamador formata o label completo (ex: `"Buy-in: $5-$20"` ou `"Rede: WPN"`). Helper opcional `<FilterChipGroup>` aceita array `chips: Array<{ key: string; label: string; onRemove: () => void; tone?: ... }>` + prop `onClearAll?: () => void` (renderiza botao "Limpar tudo" no fim quando definido). `data-testid="filter-chip-{key}"` no chip + `data-testid="filter-chip-group"` no wrapper + `data-testid="filter-chip-clear-all"` no botao. |
| **D10** | **PageHeader: layout em 2 colunas (titulo+subtitle a esquerda, actions a direita).** Props: `title: string` (h1), `subtitle?: string \| ReactNode` (renderizar como ReactNode permite tags inline), `actions?: ReactNode` (slot livre — chamador passa botoes/dropdowns), `breadcrumb?: ReactNode` (slot livre — chamador passa Breadcrumb componente, padrao recomendado mas nao obrigatorio). NAO incluir prop `icon` (anti-pattern: titulo de pagina nao precisa icone — heading semantico ja basta). Layout responsivo: `<768px` empilha (title -> subtitle -> actions full-width). Aplica tokens: `font.2xl` para title, `font.sm` para subtitle, `gap.md` entre elementos. `data-testid="page-header"` + `data-testid="page-header-title"` + `data-testid="page-header-actions"` quando `actions` definido. |
| **D11** | **ui-tokens.ts e read-only namespace pattern.** Export default = objeto frozen (`Object.freeze`) profundo (helper recursivo) para garantir que consumers nao mutem (`tokens.space.md = 99` quebra silenciosamente em runtime sem freeze). Estrutura: `export const tokens = { space, font, color, motion, radius, shadow }`. Cada sub-namespace tem tipos exportados (`type Space = typeof tokens.space; type SpaceKey = keyof Space`) para autocompletar em props de componentes. |
| **D12** | **Componentes consomem tokens via classnames Tailwind, NAO inline style.** Inline `style={{ padding: tokens.space.md }}` quebra dark mode dinamico e tree-shaking. Padrao: tokens documentam o valor canonico, e componente renderiza `className="p-3"` (12px = Tailwind 3). Quando nao houver classe Tailwind equivalente exata (ex: `space.2xl = 48px = tw-12 OK`, mas custom values), usar `style={{ padding: '48px' }}` como fallback documentado. Tokens em TS sao a referencia para revisao + uso em props (ex: prop `gap?: SpaceKey`), mas o markup final usa classes. |

---

## 4. Usuarios e Personas

Esta spec entrega componentes/tokens. Os "usuarios" do entregavel sao **outros agentes do pipeline** + dev humano que mantem o codigo. Nao ha persona end-user direta (Foundation invisivel para jogador final ate sprints subsequentes consumirem).

| Persona | O que faz com a Foundation | Trigger principal |
|---|---|---|
| **Test-writer (proximo agente)** | Le ADR-077 + esta spec, escreve testes RTL para EmptyState/FilterChip/PageHeader + testes unit para tokens (frozen, completude) | Spec aprovada pelo dev |
| **Implementer (apos test-writer)** | Cria 4 arquivos: `ui-tokens.ts`, `EmptyState.tsx`, `FilterChip.tsx`, `PageHeader.tsx`. Garante todos testes verdes. ZERO toque em paginas. | Testes red-phase em main |
| **Reviewer (pre-merge)** | Valida cobertura tokens vs casos catalogados, checa que nao ha regressao em paginas existentes (paginas nao foram tocadas, mas estao instalando dep nova), checa consistencia de naming e API entre os 4 entregaveis | Implementation green-phase |
| **Implementer Sprint UI-QW-1** | Importa `EmptyState`, `FilterChip`, `PageHeader`, `tokens` em refactors de Library, Dashboard, GrindSession, UploadHistory, etc. | Sprint UI-FND-1 mergeado |
| **Dev (founder)** | QA visual antes de merge. Le `ui-patterns.md` quando precisar lembrar como usar. Adiciona novos padroes ao guia conforme aprendizados de sprints futuros. | Manual + sprint reviews |

### 4.1. User Stories

#### US-01 (test-writer)
> Como test-writer, quero `tokens` ser type-safe (export `SpaceKey`, `FontKey`, `ColorKey`) para validar em testes que componente aceita so valores canonicos, evitando `gap="random"` passar despercebido.

#### US-02 (implementer)
> Como implementer, quero importar `<EmptyState />` com API consistente para nao recriar markup do zero em cada pagina, e ainda assim ter flexibilidade para casos especiais (variant compact, secondary link).

#### US-03 (reviewer)
> Como reviewer, quero `ui-patterns.md` ter decisao tree explicita ("modal vs sheet vs page", "quando usar tone='danger' vs 'warn'") para reprovar PRs que escolham padrao errado sem ter que escrever 5 paragrafos.

#### US-04 (founder/dev)
> Como dev, quero `tokens.space.md` ser autocompletado no IDE e ter docstring `/** 12px */` para nao precisar abrir o arquivo de tokens toda hora.

#### US-05 (implementer Sprint UI-QW-1)
> Como implementer do proximo sprint, quero `<FilterChipGroup chips={...} onClearAll={...} />` resolver 80% dos casos de filtros ativos do app sem precisar escrever wrapper proprio em Dashboard, Library, GrindSession.

---

## 5. Requisitos Funcionais

### RF-01: Design Tokens em `client/src/lib/ui-tokens.ts`

**Descricao.** Criar arquivo TypeScript que exporta um objeto `tokens` frozen com 6 sub-namespaces: `space`, `font`, `color`, `motion`, `radius`, `shadow`. Tipos exportados (`SpaceKey`, `FontKey`, etc) para uso em props de componentes.

**Regras de negocio:**
- Spacing scale conforme D2: 8 aliases (`xs`, `sm`, `md`, `base`, `lg`, `xl`, `2xl`, `3xl`) mapeando para `[4, 8, 12, 16, 24, 32, 48, 64]` px.
- Font sizes conforme D3: 6 aliases (`xs`, `sm`, `base`, `lg`, `xl`, `2xl`) mapeando para `[12, 14, 16, 20, 24, 32]` px. Pesos exportados como constantes (`fontWeight.normal/medium/semibold/bold = 400/500/600/700`).
- Color semantic conforme D4: 6 tokens (`success`, `danger`, `warn`, `info`, `action`, `neutral`), cada um com `default`, `subtle`, `foreground`. Valores mapeiam para classes Tailwind (referenciar como string de classe — ex: `success.default = 'text-green-500 bg-green-500'` ou objeto `{ text: 'text-green-500', bg: 'bg-green-500', border: 'border-green-500' }` — implementer decide forma final, mas testes validam estrutura).
- Motion conforme D5: `motion.fast/base/slow + easing`.
- Radius conforme D6: 4 aliases.
- Shadow conforme D7: 3 aliases com strings CSS prontas.
- Frozen profundamente conforme D11. Helper `deepFreeze<T>(obj: T): Readonly<T>` co-localizado no arquivo.
- JSDoc em cada propriedade com valor pixel/string para hover-hint do IDE.
- Re-export de `cn` de `@/lib/utils` NAO faz parte deste arquivo (mantem separacao).

**Criterio de aceitacao:**
- [ ] `import { tokens } from '@/lib/ui-tokens'` funciona em qualquer componente client.
- [ ] `tokens.space.md` retorna `12` (number).
- [ ] `tokens.color.danger.default` retorna estrutura/string conforme implementer + validado por teste.
- [ ] Tentativa de mutar (`tokens.space.md = 99`) falha silenciosamente em strict mode E nao altera o valor lido (frozen).
- [ ] Tipos `SpaceKey`, `FontKey`, `ColorKey`, `MotionKey`, `RadiusKey`, `ShadowKey` exportados.
- [ ] Type-check (`npm run check`) passa.
- [ ] 100% dos achados do audit relacionados a inconsistencia de espacamento/font/cor podem ser endereçados usando tokens (validar via checklist em ADR-077 + revisao do reviewer).

---

### RF-02: Componente `EmptyState` em `client/src/components/ui/EmptyState.tsx`

**Descricao.** Componente React funcional padronizado para empty states. Renderiza icone (opcional), titulo, descricao, CTA primario (obrigatorio), link secundario opcional. Variantes `default` (centralizado, padding generoso) e `compact` (inline, padding reduzido para uso em cards/secoes pequenas).

**Regras de negocio:**
- API conforme D8: `icon?`, `title` (obrigatorio), `description` (obrigatorio), `ctaLabel` (obrigatorio), `ctaAction` (obrigatorio), `secondaryLink?: { label: string; href: string }`, `variant?: 'default' | 'compact'`, `iconSize?: 'sm' | 'md' | 'lg'` (32/64/96 px), `area?: string` (opcional, telemetria).
- `ctaAction` SEMPRE definido pelo chamador (lesson #11 — sem default decorativo). Se chamador quiser empty state sem acao, usar componente diferente (fora do escopo).
- Renderiza estrutura semantica: `<div role="status">` (empty state e regiao informativa estatica, nao alerta), `<h3>` para titulo, `<p>` para descricao, `<Button>` (de `@/components/ui/button`) para CTA, `<Link>` (Wouter) ou `<a>` para secondaryLink.
- Telemetria: try/catch com `(window as any).__telemetry?.track?.('ui.empty_state_cta_clicked', { area })` — copiando padrao do `studies/EmptyState.tsx`. Lesson #9: nunca panico (try/catch silencioso).
- Tokens consumidos: `tokens.space.lg` para gap entre elementos, `tokens.space.2xl` para padding (variant default), `tokens.space.md` para padding (variant compact), `tokens.font.lg` para titulo (variant default), `tokens.font.base` para titulo (variant compact), `tokens.font.sm` para descricao.
- Cor: usa `tokens.color.neutral.foreground` para descricao, `text-foreground` (CSS var existente) para titulo. CTA usa estilo primario default do `<Button>` (variant default do shadcn). Nao impor cor customizada — chamador pode passar `<Button variant="destructive">` via children se quiser, mas API base usa default.

**Criterio de aceitacao:**
- [ ] Renderiza `data-testid="empty-state"` com `data-area={area || 'generic'}`.
- [ ] Renderiza icone quando `icon` definido, oculta wrapper quando nao.
- [ ] Renderiza CTA com `data-testid="empty-state-cta"` e label exato passado via prop.
- [ ] `ctaAction` e chamada quando CTA clicado (testar com `vi.fn()`).
- [ ] Renderiza `data-testid="empty-state-secondary-link"` apenas quando `secondaryLink` definido.
- [ ] Variant `compact` reduz padding e font-size do titulo (validar via classnames ou computed style).
- [ ] Telemetria nao quebra renderizacao quando `window.__telemetry` ausente.
- [ ] `aria-label` no botao = `ctaLabel` (acessibilidade).

---

### RF-03: Componente `FilterChip` em `client/src/components/ui/FilterChip.tsx`

**Descricao.** Chip pill compacto para representar 1 filtro ativo, com botao "x" obrigatorio para remover. Helper opcional `<FilterChipGroup>` para renderizar lista + botao "Limpar tudo" agregado.

**Regras de negocio:**
- API `<FilterChip>` conforme D9: `label: string`, `onRemove: () => void`, `variant?: 'default' | 'subtle'` (default), `tone?: ColorKey` (`'neutral'` default, aceita 6 semantic tones).
- `<FilterChip>` renderiza: `<span>` com `<span>{label}</span>` + `<button aria-label={"Remover filtro " + label}><X size={14} /></button>` (icone do lucide-react).
- Tones aplicam `tokens.color.{tone}.subtle` no bg + `tokens.color.{tone}.foreground` no texto. Variant `subtle` reduz peso (background mais tenue), `default` mais solido.
- Helper `<FilterChipGroup>`: `chips: Array<{ key: string; label: string; onRemove: () => void; tone?: ColorKey; variant?: 'default' | 'subtle' }>`, `onClearAll?: () => void`. Renderiza wrapper flex com gap, mapeia chips, e renderiza botao "Limpar tudo" (ghost button) ao final quando `onClearAll` definido E `chips.length > 1`. Quando `chips.length === 0`, retorna `null` (nao renderiza nada).
- `data-testid` conforme D9: `filter-chip-{key}` em cada chip dentro do group, `filter-chip` em chip standalone, `filter-chip-group` no wrapper, `filter-chip-clear-all` no botao agregado.
- Botao "x" tem `min-width: 24px; min-height: 24px` para alvo Fitts mobile (target >= 44px e ideal mas chip eh denso por design — 24px aceitavel pois ha visual de pill envolvendo).
- Foco-visivel: `focus-visible:ring-2 focus-visible:ring-ring` (CSS var existente). NUNCA `outline:none` sem ring.

**Criterio de aceitacao:**
- [ ] `<FilterChip label="X" onRemove={fn} />` renderiza pill com label visivel + botao X.
- [ ] Click no botao X chama `onRemove` 1x.
- [ ] `data-testid="filter-chip"` aplicado em standalone, `data-testid="filter-chip-{key}"` em cada chip dentro do group.
- [ ] `aria-label` do botao X = `"Remover filtro {label}"`.
- [ ] Tone `success` aplica classes do `tokens.color.success.*` (validar via classname ou computed style).
- [ ] `<FilterChipGroup chips={[]} />` retorna null (sem markup).
- [ ] `<FilterChipGroup chips={[1 item]} onClearAll={fn} />` NAO renderiza botao "Limpar tudo" (1 chip nao precisa).
- [ ] `<FilterChipGroup chips={[2+ items]} onClearAll={fn} />` renderiza botao "Limpar tudo" com `data-testid="filter-chip-clear-all"`.
- [ ] Click no "Limpar tudo" chama `onClearAll` 1x.
- [ ] Focus visivel ao Tab no botao X (snapshot ou jsdom check via `:focus-visible`).

---

### RF-04: Componente `PageHeader` em `client/src/components/ui/PageHeader.tsx`

**Descricao.** Header consistente para topo de paginas. Layout 2 colunas em desktop (titulo+subtitle a esquerda, actions a direita), empilhado em mobile. Slot opcional para breadcrumb acima do title.

**Regras de negocio:**
- API conforme D10: `title: string`, `subtitle?: string | ReactNode`, `actions?: ReactNode`, `breadcrumb?: ReactNode`.
- Renderiza estrutura semantica: opcional `<nav aria-label="breadcrumb">{breadcrumb}</nav>` no topo (se definido), `<header>` envolvendo, `<h1>` para title, `<p>` para subtitle (so quando string) ou render direto quando ReactNode, `<div>` slot para actions com classe `flex items-center gap-2`.
- Tokens consumidos: `tokens.space.md` para gap entre title/subtitle, `tokens.space.lg` para padding-bottom do header, `tokens.font.2xl` para title, `tokens.font.sm` para subtitle, `tokens.color.neutral.foreground` para subtitle.
- Layout: `flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4` no wrapper interno (titulo a esq, actions a dir). Mobile (<640px) empilha verticalmente, actions ficam embaixo full-width (chamador deve usar botoes que se adaptem — `<Button className="w-full sm:w-auto">` etc).
- `<h1>` SEMPRE — pagina deve ter exatamente 1 h1 (acessibilidade). Se chamador colocar 2 PageHeader na mesma rota, e bug do chamador (documentado no guia).
- NAO incluir prop `icon`. NAO incluir prop `gradient` ou `background`. Header e neutro por design.
- `data-testid` conforme D10.

**Criterio de aceitacao:**
- [ ] Renderiza `<h1>` com texto exato `title`.
- [ ] Renderiza `<p>` com texto exato `subtitle` quando `subtitle` for string.
- [ ] Renderiza ReactNode arbitrario quando `subtitle` for nao-string (testar com `<span data-testid="custom-subtitle">x</span>`).
- [ ] Nao renderiza `<p>` nem container de subtitle quando `subtitle` undefined.
- [ ] Renderiza slot `actions` com `data-testid="page-header-actions"` quando definido. Nao renderiza container quando undefined.
- [ ] Renderiza `<nav aria-label="breadcrumb">` envolvendo `breadcrumb` quando definido.
- [ ] Nenhum elemento extra (ex: icone hardcoded, separator) presente.
- [ ] Type-check passa: `<PageHeader title="X" />` valido (so `title` obrigatorio).

---

### RF-05: Guia `Docs/conventions/ui-patterns.md`

**Descricao.** Documento Markdown que estabelece padroes UI canonicos do Grindfy. Audiencia: agentes futuros (test-writer, implementer, reviewer) + dev humano. Documento e fonte de verdade para reviewer reprovar drift.

**Regras de negocio:**
- Conteudo obrigatorio (ordem):
  1. **Sumario** — proposito + como usar (link cruzado para `ux-research-reference.md` para teoria).
  2. **Design Tokens** — referencia de uso de `ui-tokens.ts`. Tabela: `tokens.space.* → quando usar`, `tokens.font.* → niveis hierarquicos`, `tokens.color.* → quando cada tone`. Exemplo: `tone='danger'` so para deletar, falha critica, alertas; `tone='warn'` para inputs invalidos, limites se aproximando; `tone='action'` para CTA primario de marca.
  3. **Hierarquia visual** — regra "1 elemento dominante por sessao" + exemplo do que NAO fazer (5 botoes do mesmo tamanho).
  4. **CTA primario** — 1 por tela, cor solida (`tone='action'`), texto descritivo verbo+objeto (PT-BR). Tabela bom/ruim: `"Importar 47 torneios"` > `"Confirmar"`; `"Salvar configuracoes"` > `"OK"`.
  5. **Filtros e chips** — padrao: filtros vivem em barra acima da grid, chips ativos abaixo (use `<FilterChipGroup>`), botao "Limpar tudo" se >1 ativo. Exemplo de uso com snippet.
  6. **Empty state** — quando usar `<EmptyState>`. Anatomia (icone + titulo + descricao + CTA + opcional link). 4 tipos catalogados:
     - **Nunca-teve-dados** — onboarding implicito (ex: "Importe seu primeiro CSV").
     - **Filtros zerados** — oferecer "Limpar filtros" como CTA.
     - **Busca sem resultado** — mostrar query + sugerir refinar.
     - **Erro de rede** — CTA "Tentar novamente" + link "Reportar problema".
  7. **Loading state** — skeleton matching layout > spinner full-screen (referenciar `<Skeleton />` shadcn). Spinner so em acoes >2s sem skeleton possivel.
  8. **Modal vs Sheet vs Page** — decision tree:
     - Confirmacao destrutiva curta → AlertDialog.
     - Criacao 1-3 campos → Dialog.
     - Edicao 4-10 campos em contexto → Sheet (drill-in sem sair da tela).
     - Form >10 campos ou multi-step → Pagina dedicada.
     - **Anti-pattern**: chain modals (modal abre modal abre modal).
  9. **Densidade** — pro user (Grind/Dashboard/Bankroll) = densidade alta com gap-4. Conteudo (Biblioteca/Studies leitura) = densidade baixa com gap-6/8.
  10. **Hover/focus/motion** — SEMPRE definir hover (bg shift) e `focus-visible:ring-2 focus-visible:ring-ring`. NUNCA `outline:none` sem replacement. Transitions 150-300ms (`tokens.motion.fast/base/slow`). Respeitar `prefers-reduced-motion` (snippet de Tailwind: `motion-reduce:transition-none`).
  11. **Hierarquia de copy PT-BR** — verbo + objeto descritivo. Gerundio so para estados de loading ("Importando torneios..."). Numeros sempre com unidade ("47 torneios", "$ 1.234,56", "5 dias atras").
  12. **Hooks first (lesson #1)** — early return SEMPRE depois de todos useState/useEffect/useQuery. Snippet ruim/bom.
  13. **data-testid (lesson #2)** — convencao: `kebab-case`, prefixo do componente (`empty-state`, `filter-chip-{key}`, `page-header-title`). NUNCA depender de innerText para teste E2E — usar testid.
  14. **Quando nao usar componentes Foundation** — escape hatch: se feature requer comportamento exotico (ex: empty state com 3 CTAs), build custom MAS abrir issue para evoluir API ou documentar nova convencao.
- Tom: prescritivo, curto, snippets > paragrafos. Idioma PT-BR.
- Tamanho alvo: 200-400 linhas.
- Cabecalho do arquivo: data, autor (PM-Spec via spec UI-FND-1), versao 1.0, link para esta spec.
- Footer: secao "Historico de revisoes" com tabela vazia (proximas atualizacoes documentadas conforme novos padroes surgirem em sprints subsequentes).

**Criterio de aceitacao:**
- [ ] Arquivo `Docs/conventions/ui-patterns.md` existe.
- [ ] Diretorio `Docs/conventions/` criado se nao existir.
- [ ] Cobre os 14 topicos listados na ordem especificada.
- [ ] Inclui pelo menos 1 snippet de codigo TypeScript/JSX por componente Foundation (EmptyState, FilterChip, PageHeader).
- [ ] Inclui pelo menos 1 exemplo bom vs ruim para CTA primario, copy PT-BR, e hooks first.
- [ ] Reviewer aprova como "consumivel sem ambiguidade" (validacao subjetiva mas obrigatoria).
- [ ] Reverenciado em `CLAUDE.md` secao 12 ("Quando carregar cada doc") em sprint subsequente — fora de escopo deste sprint apenas a edicao do CLAUDE.md (founder decide se quer atualizar agora ou em UI-QW-1).

---

## 6. Requisitos Nao-Funcionais

| Tipo | Requisito |
|---|---|
| **Performance** | `ui-tokens.ts` e tree-shakeable (export const, nao default export gigante). Componentes nao introduzem re-renders desnecessarios — `<EmptyState>` e funcional puro, sem `useEffect`. Tokens frozen avaliam 1x na importacao. |
| **Bundle size** | Os 3 componentes + tokens devem somar <8KB minified ungzipped. Sem dependencias novas alem de `lucide-react` (X icone, ja em uso) e dependencias existentes. |
| **Acessibilidade WCAG 2.2** | EmptyState: `role="status"` no wrapper, `aria-label` no CTA. FilterChip: `aria-label="Remover filtro {label}"` no botao X, `focus-visible:ring`. PageHeader: `<h1>` semantico unico, `<nav aria-label="breadcrumb">` quando aplicavel. Todos componentes navegaveis via teclado (Tab/Enter/Esc onde aplicavel). Contraste >=4.5:1 em todos tokens semantic colors (validar manualmente via WebAIM em ADR-077, nao em teste automatico). |
| **i18n** | Todos textos em PT-BR no documento `ui-patterns.md`. Componentes nao tem textos hardcoded (chamador sempre passa label/title/description). Excecao: `aria-label="Remover filtro X"` em FilterChip e PT-BR hardcoded — internacionalizacao futura sai do escopo. |
| **Test coverage** | 100% dos componentes Foundation tem testes unit + RTL. Tokens tem testes que validam: estrutura completa (todos namespaces presentes), frozen profundo, tipos corretos. Testes em `client/src/lib/__tests__/ui-tokens.test.ts`, `client/src/components/ui/__tests__/EmptyState.test.tsx`, `FilterChip.test.tsx`, `PageHeader.test.tsx`. |
| **Regressao zero em paginas existentes** | NENHUMA pagina/componente existente e modificado neste sprint. Suite de testes existente (4157+ testes, ver memory) deve continuar 100% verde. |
| **Convivencia com `studies/EmptyState.tsx`** | Componente legacy em `studies/EmptyState.tsx` permanece intocado. Importacoes existentes funcionam. Sprint UI-QW-1 fara migracao para `ui/EmptyState.tsx` com PR dedicado. |
| **Compatibilidade Vitest 4 + oxc.jsx** | Testes seguem padrao do `tests/setup.ts` ja em uso. Sem novos polyfills Radix necessarios (componentes Foundation nao usam Radix primitives). |
| **TypeScript strict** | `npm run check` passa sem warnings. Tipos exportados de tokens devem permitir `gap?: SpaceKey` em props futuras sem cast. |

---

## 7. Endpoints Previstos

Nao aplicavel — esta spec nao toca em backend. Zero novos endpoints.

---

## 8. Modelos de Dados Afetados

Nao aplicavel — esta spec nao toca em schema/database. Zero migrations.

---

## 9. Integracoes Externas

Nao aplicavel — esta spec nao introduz integracoes. Telemetria (`window.__telemetry`) e contrato existente (no-op se ausente).

---

## 10. Cenarios de Teste Derivados

Test-writer usa esta secao como base. Lista nao-exaustiva, apenas os criticos.

### 10.1. Happy Path

#### Tokens (`RF-01`)
- [ ] Importa `tokens` e acessa todos namespaces (`space`, `font`, `color`, `motion`, `radius`, `shadow`).
- [ ] Cada namespace tem todas as keys documentadas (D2-D7) — validacao por contagem + match exato de keys.
- [ ] Valores numericos batem com defaults (ex: `tokens.space.md === 12`).
- [ ] Tipos exportados (`SpaceKey`, etc) sao usaveis em assinaturas (compile-time check via `expectTypeOf` de Vitest se disponivel, ou snapshot de assinatura).

#### EmptyState (`RF-02`)
- [ ] Renderiza com props minimos (`title`, `description`, `ctaLabel`, `ctaAction`).
- [ ] Renderiza icone quando passado.
- [ ] Click no CTA chama `ctaAction`.
- [ ] Variant `compact` aplica classes/styles diferentes do `default`.
- [ ] `secondaryLink` renderiza link com `href` correto.

#### FilterChip (`RF-03`)
- [ ] Renderiza pill com label visivel.
- [ ] Click no X chama `onRemove`.
- [ ] FilterChipGroup com 0 chips retorna null.
- [ ] FilterChipGroup com 1 chip + `onClearAll` NAO renderiza botao "Limpar tudo".
- [ ] FilterChipGroup com 2+ chips + `onClearAll` renderiza e chama callback.

#### PageHeader (`RF-04`)
- [ ] Renderiza `<h1>` com title.
- [ ] Renderiza subtitle como string OU ReactNode.
- [ ] Renderiza actions slot quando definido.
- [ ] Renderiza breadcrumb com `<nav aria-label="breadcrumb">`.
- [ ] Type-check: so `title` e obrigatorio.

### 10.2. Validacao de Input

- [ ] EmptyState sem `ctaLabel` → erro de tipo (TS) — validado em build, nao runtime.
- [ ] EmptyState com `iconSize` invalido → erro de tipo TS.
- [ ] FilterChip com `tone` fora dos 6 tokens → erro de tipo TS.
- [ ] PageHeader com 0 props → erro de tipo TS (title obrigatorio).
- [ ] FilterChipGroup com `chips` sem `key` → erro de tipo TS.

### 10.3. Regras de Negocio

- [ ] Tokens sao frozen: `tokens.space.md = 999` em strict mode falha; em non-strict, valor nao muda.
- [ ] EmptyState NAO tem CTA default — se chamador nao passa `ctaAction`, e erro de TS (lesson #11).
- [ ] FilterChipGroup oculta "Limpar tudo" com `chips.length <= 1`.
- [ ] FilterChip preserva `onRemove` callback identity (nao re-cria a cada render — testar com mock que conta calls em re-render).

### 10.4. Edge Cases

- [ ] EmptyState com `title` muito longo (300 chars) — nao quebra layout, faz wrap natural (snapshot opcional).
- [ ] EmptyState `area` undefined → `data-area="generic"`.
- [ ] EmptyState telemetria com `window.__telemetry` undefined — nao throw.
- [ ] EmptyState telemetria com `window.__telemetry.track` que throws — nao propaga (try/catch silencioso, lesson #9).
- [ ] FilterChip com label vazio (string `""`) — renderiza X mas pill vazio (chamador responsavel).
- [ ] FilterChip `aria-label` quando `label=""` → `"Remover filtro "` (string com espaco trailing OK, nao quebra).
- [ ] PageHeader subtitle como `null` (chamador passa explicitamente null) — nao renderiza container.
- [ ] PageHeader actions como array (`actions={[<Button/>, <Button/>]}`) — renderiza ambos.
- [ ] FilterChipGroup com chip duplicado (mesmo `key`) — React warning, mas nao crash. Implementer pode optar por throw em dev (lesson #9: log antes).
- [ ] Importar `ui-tokens` em ambiente Node (server-side) NAO quebra (sem `window` reference no arquivo).

### 10.5. Convivencia com legacy

- [ ] Importar `studies/EmptyState` ainda funciona (sem alteracao no arquivo).
- [ ] Renderizar AMBOS EmptyState (legacy e novo) na mesma tree de teste nao causa erro.
- [ ] Suite Studies-Reform existente (407+ testes) continua 100% verde apos sprint.

### 10.6. Acessibilidade

- [ ] EmptyState: `role="status"` no wrapper, `aria-label` no CTA matching `ctaLabel`.
- [ ] FilterChip: botao X tem `aria-label` correto.
- [ ] PageHeader: `<h1>` semantico, `<nav aria-label="breadcrumb">` quando breadcrumb definido.
- [ ] Tab navigation funcional em todos componentes (snapshot ou jsdom check).

---

## 11. Fora de Escopo

Itens explicitos que esta spec NAO entrega — para evitar que implementer adicione "so um pouco mais":

- **Aplicacao em paginas existentes** — Library, Dashboard, GrindSession, etc continuam com markup atual. Sprint UI-QW-1 fara o trabalho.
- **Migracao do `studies/EmptyState`** — legacy permanece. Migracao em UI-QW-1.
- **Atualizacao do CLAUDE.md** — secao 12 "Quando carregar cada doc" deveria ganhar entrada para `ui-patterns.md`, mas isso fica para UI-QW-1 (founder decide se quer batch).
- **Internacionalizacao** — `aria-label="Remover filtro X"` em PT-BR hardcoded. i18n fora deste sprint e do roadmap proximo.
- **Tokens de breakpoint responsivo** — Tailwind ja expoe `sm/md/lg/xl/2xl`. NAO duplicar em `ui-tokens.ts`.
- **Tokens de z-index** — escopo separado. Sprints futuros se necessario.
- **Componentes adicionais Foundation** — Toast, Skeleton, Spinner ja existem em `ui/`. NAO recriar nem refatorar agora.
- **Refactor de cores existentes** — `--background`, `--primary`, etc em `index.css` continuam intocados.
- **Storybook ou doc visual interativa** — `ui-patterns.md` e suficiente como guia escrito.
- **Snapshot tests visuais (chromatic, percy)** — fora do escopo. RTL com classnames + testid e suficiente.
- **Animacao concreta de motion tokens** — tokens documentam valores; aplicacao concreta em paginas e Sprint UI-QW-1+.
- **PageHeader com prop `icon`** — explicitamente excluido (D10). Se proximo sprint julgar necessario, abre issue.
- **EmptyState com 3+ CTAs ou layouts exoticos** — escape hatch documentado em ui-patterns.md. Nao expandir API.
- **Tokens dark/light mode dynamic** — tokens consomem CSS vars existentes (`--background`, etc) que ja respondem a dark/light. Sem nova logica de toggle.
- **Refactor de Sidebar, Topbar, Layout** — Foundation visual, nao layout. Sprint UI-REF-2 (Settings shell) eventualmente toca em parts disso.

---

## 12. Dependencias

- **Pre-requisitos satisfeitos** — Pipeline ja existe, Vitest 4 configurado, Tailwind + shadcn ja em uso. Nada bloqueia.
- **Dependencias de ferramentas** — `lucide-react` (X icone) ja em `package.json`. `clsx` + `tailwind-merge` (cn) ja em uso via `@/lib/utils`. ZERO novas deps.
- **Dependencias de specs anteriores** — Nenhuma. Foundation e o primeiro sprint da Fase 0.

---

## 13. Riscos e Mitigacao

| Risco | Probabilidade | Impacto | Mitigacao |
|---|---|---|---|
| **R1.** Tokens criados nao cobrem casos reais — implementer descobre em UI-QW-1 que falta `space.4xl=80` ou tone novo. | Media | Medio | ADR-077 lista todos casos catalogados pelo audit (130+ achados). Reviewer valida cobertura via checklist antes do merge. Se faltar, adicionar em UI-QW-1 com micro-spec. |
| **R2.** Conflito de naming entre `ui/EmptyState` (novo) e `studies/EmptyState` (legacy) confunde devs. | Alta | Baixo | Documentar em `ui-patterns.md` que legacy e deprecated, novo uso = `ui/EmptyState`. Migracao programada para UI-QW-1. ADR-077 explicita timeline. |
| **R3.** API de FilterChipGroup nao casa com casos reais (Dashboard usa filter mais complexo). | Media | Medio | Test-writer escreve testes baseados em D9 + cenarios concretos catalogados (Buy-in, Rede, Periodo). Se Dashboard precisar mais, sprint UI-T1-Dashboard pode estender. Helper foi desenhado para cobrir 80% — escape hatch eh usar `<FilterChip>` standalone. |
| **R4.** Frozen profundo pode quebrar HMR/Vite em dev (atribuicao silenciosa em chunk reload). | Baixa | Baixo | Testar manualmente apos implementer. Se quebrar, alternativa: frozen so em production build via `if (process.env.NODE_ENV !== 'production') ... `. |
| **R5.** PageHeader rigido demais — algum app usa variant gradient ou icone hoje. | Baixa | Baixo | Audit mostrou que paginas atuais usam markup ad-hoc (text-center, gradiente em Home). Migracao gradual em UI-QW-1 vai re-confirmar API. Se rigid, expandir em sprint dedicado. |
| **R6.** `ui-patterns.md` fica desatualizado em 2 sprints. | Alta | Baixo | Adicionar item ao reviewer agent: "Validar ui-patterns.md atualizado em sprints que mudem padrao UI". Documentar em proxima revisao do CLAUDE.md. |
| **R7.** Suite de testes existente quebra apos adicao dos novos arquivos (improvavel mas possivel se import circular ou tsconfig). | Baixa | Alto | Implementer roda `npm run check` + `npx vitest run` antes de commit. Reviewer valida zero regressao. |
| **R8.** Tokens semantic color em strings de classnames complica validacao type-safe. | Media | Medio | D4 deixa implementer escolher entre string-de-classe vs objeto `{text, bg, border}`. Test-writer valida estrutura escolhida. ADR-077 documenta decisao final. |
| **R9.** Telemetria silenciosa em EmptyState pode esconder bugs (track nunca chamado). | Baixa | Baixo | Lesson #9 — log antes de fallback. Implementer adiciona `console.debug` (nao `error`) quando track falha em dev. Production silencioso. |

---

## 14. Notas de Implementacao (opcional)

- **Estrutura recomendada de `ui-tokens.ts`:**
  ```ts
  // Co-locate deepFreeze helper.
  function deepFreeze<T>(obj: T): Readonly<T> { /* recursive Object.freeze */ }

  const _tokens = {
    space: { xs: 4, sm: 8, md: 12, base: 16, lg: 24, xl: 32, '2xl': 48, '3xl': 64 },
    font: { /* ... */ },
    fontWeight: { normal: 400, medium: 500, semibold: 600, bold: 700 },
    color: { success: { default: '...', subtle: '...', foreground: '...' }, /* ... */ },
    motion: { fast: 150, base: 200, slow: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
    radius: { sm: 4, md: 8, lg: 12, full: 9999 },
    shadow: { sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)', /* ... */ },
  } as const;

  export const tokens = deepFreeze(_tokens);
  export type Tokens = typeof tokens;
  export type SpaceKey = keyof Tokens['space'];
  export type FontKey = keyof Tokens['font'];
  export type ColorKey = keyof Tokens['color'];
  // ...
  ```

- **Diretorio de testes:** seguir convencao existente — testes co-localizados em `__tests__/` adjacente. `client/src/lib/__tests__/ui-tokens.test.ts`, `client/src/components/ui/__tests__/EmptyState.test.tsx`, etc. Verificar `vitest.config.ts` para garantir glob `**/*.test.ts(x)?` ja cobre.

- **Order de implementacao:** RF-01 (tokens) → RF-02 (EmptyState) → RF-03 (FilterChip) → RF-04 (PageHeader) → RF-05 (guia). Componentes dependem de tokens; guia depende de todos os 4.

- **Testes em paralelo:** test-writer pode escrever todos 4 arquivos de teste em paralelo apos tokens estar em red-phase (impl pode comecar tokens enquanto testes dos componentes sao escritos).

- **Smoke manual:** apos implementer, founder pode rodar `npm run dev` e verificar que app continua bootando sem erros (componentes Foundation existem mas nao sao consumidos — smoke se restringe a "build OK + tipos OK + suite verde").

- **ADR-077 esperado:** title sugerido "Design tokens + UI patterns canonicos para Grindfy". Conteudo: contexto (audit 2026-05-02), decisao (criar tokens TS + 3 componentes utilitarios + guia), alternativas consideradas (so CSS vars; usar lib externa como Radix Themes; expandir tema do shadcn), consequencias (positivas: consistencia; negativas: 1 lugar a mais para sincronizar com Tailwind config), implementation notes.

---

## 15. Definicao de Pronto (DoD)

- [ ] 5 RFs entregues (4 arquivos + 1 doc).
- [ ] 100% testes verdes (`npx vitest run`).
- [ ] Type-check verde (`npm run check`).
- [ ] Zero arquivo de pagina existente modificado (`git diff --stat` confirma).
- [ ] Zero novo dep em `package.json`.
- [ ] Reviewer aprovou (round 1 ou 2 conforme necessario).
- [ ] ADR-077 criado por system-architect.
- [ ] `ui-patterns.md` revisado e aprovado pelo dev.
- [ ] Founder QA visual antes de merge para main.

---

**Fim da spec UI-FND-1.**
