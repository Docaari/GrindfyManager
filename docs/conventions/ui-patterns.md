# UI Patterns — Convencoes Canonicas Grindfy

> **Versao:** 1.0
> **Data:** 2026-05-02
> **Autor:** Sprint UI-FND-1 (PM-Spec → System-Architect → Implementer)
> **Spec:** `Docs/specs/ui-fnd-1-foundation.md`
> **ADR:** `Docs/architecture/decisions/078-design-tokens-ui-patterns.md`
> **Audiencia:** agentes do pipeline (test-writer, implementer, reviewer) + dev humano
> **Idioma:** PT-BR (codigo em ingles, copy/UI em PT-BR)

---

## 1. Sumario

Este guia eh **fonte de verdade** para padroes UI canonicos do Grindfy. Sprints UI-QW-1, UI-T1-*, UI-T2-* CONSOMEM este guia. Reviewer reprova PRs que driftem dos padroes documentados aqui.

**Quando usar:**
- Criar componente novo? Procure padrao aqui antes.
- Revisar PR? Use as secoes como checklist.
- Decisao de UX em duvida? Consulte secoes 2-11.

**Quando NAO usar:**
- Como teoria de UX — para isso veja `Docs/ux-audit-2026-05-02/ux-research-reference.md` (boas praticas + anti-patterns).
- Como referencia de implementacao de feature especifica — veja a spec da sprint.

---

## 2. Design Tokens

Importacao canonica:

```ts
import { tokens } from '@/lib/ui-tokens';
```

Tokens sao **frozen profundo** em runtime. Nao tente mutar (`tokens.space.md = 99` falha silenciosamente em non-strict ou throw em strict).

### 2.1. Spacing — `tokens.space`

| Token | Valor | Tailwind | Quando usar |
|---|---|---|---|
| `xs` | 4px | `p-1`, `gap-1` | Espaco entre icone e label compacto |
| `sm` | 8px | `p-2`, `gap-2` | Padding interno de chip/pill |
| `md` | 12px | `p-3`, `gap-3` | Gap entre items densos (lista) |
| `base` | 16px | `p-4`, `gap-4` | Padding padrao de cards |
| `lg` | 24px | `p-6`, `gap-6` | Espaco entre secoes da pagina |
| `xl` | 32px | `p-8`, `gap-8` | Padding de containers grandes |
| `2xl` | 48px | `p-12`, `gap-12` | Padding de empty states (variant default) |
| `3xl` | 64px | `p-16`, `gap-16` | Espacos heroicos (raro) |

> **Regra:** se sentir vontade de usar `p-5` ou `p-7`, **pare**. Escolha um da escala. Excecoes raras documentadas com `// TODO: token TBD`.

### 2.2. Tipografia — `tokens.font`

| Token | Valor | Quando usar |
|---|---|---|
| `xs` | 12px | Caption, label de badge |
| `sm` | 14px | Texto secundario, descricoes |
| `base` | 16px | Corpo de texto |
| `lg` | 20px | Titulo de card, secao secundaria |
| `xl` | 24px | Titulo de pagina (h1 — `PageHeader`) |
| `2xl` | 32px | Hero/dashboards (uso pontual) |

Pesos canonicos via `tokens.fontWeight`: `normal (400)`, `medium (500)`, `semibold (600)`, `bold (700)`. **NAO use** `font-thin` (300) ou `font-extrabold` (800/900) — anti-pattern em pro UI.

### 2.3. Cores semanticas — `tokens.color`

6 tokens semanticos. Cada um com `{ text, bg, border }`:

| Token | Quando usar | Exemplo |
|---|---|---|
| `success` | Acao concluida, valor positivo, ROI verde | "Sessao salva", profit +$120 |
| `danger` | Deletar, falha critica, alerta de risco | "Deletar conta", ROI -50% |
| `warn` | Limite se aproximando, input invalido | "Bankroll <5BI", "Email invalido" |
| `info` | Info neutra, dica, status secundario | "47 torneios importados" |
| `action` | **CTA primario de marca** (poker-accent) | "Importar CSV", "Comecar grind" |
| `neutral` | Fallback/muted, fundo de cards | filtros sem destaque |

**Decisao tree para tons:**
- O elemento eh um CTA principal? → `action`
- Indica acao destrutiva ou negativa? → `danger`
- Indica risco proximo (nao critico)? → `warn`
- Indica sucesso/positivo? → `success`
- Eh meramente informativo? → `info`
- Senao → `neutral`

Uso em componente:
```tsx
import { tokens } from '@/lib/ui-tokens';
import { cn } from '@/lib/utils';

<div className={cn(
  tokens.color.danger.bg,
  tokens.color.danger.text,
  tokens.color.danger.border,
  'border rounded-md p-2',
)}>
  Deletar permanentemente
</div>
```

### 2.4. Motion — `tokens.motion`

| Token | Valor | Quando usar |
|---|---|---|
| `fast` | 150ms | Hover, click feedback |
| `base` | 200ms | Toggle, expand/collapse |
| `slow` | 300ms | Modal entrada/saida |
| `easing` | `cubic-bezier(0.4, 0, 0.2, 1)` | Easing canonico (standard ease-out) |

> **Regra:** transicao >300ms vira anti-pattern (lento). Sempre acompanhe `motion-reduce:transition-none` para respeitar `prefers-reduced-motion`.

```tsx
<div
  className="transition-colors motion-reduce:transition-none"
  style={{ transitionDuration: `${tokens.motion.base}ms`, transitionTimingFunction: tokens.motion.easing }}
>
  ...
</div>
```

### 2.5. Radius — `tokens.radius`

| Token | Valor | Uso |
|---|---|---|
| `sm` | 4px | Badge, input compacto |
| `md` | 8px | Botao, card padrao |
| `lg` | 12px | Modal, sheet |
| `full` | 9999px | Pill, chip, avatar |

### 2.6. Shadow — `tokens.shadow`

| Token | Uso |
|---|---|
| `sm` | Hover de cards |
| `md` | Popovers, dropdowns |
| `lg` | Modais flutuantes |

---

## 3. Hierarquia visual

**Regra de ouro:** 1 elemento dominante por sessao da tela. Se 5 botoes tem o mesmo tamanho/cor, nenhum eh dominante — usuario nao sabe onde clicar.

**Bom:**
```tsx
<div>
  <h1 className="text-2xl font-bold">Importar torneios</h1>
  <Button variant="default">Confirmar import</Button>     {/* CTA primario */}
  <Button variant="ghost" size="sm">Cancelar</Button>     {/* secundario apagado */}
</div>
```

**Ruim:**
```tsx
<div>
  <h2 className="text-lg">Importar</h2>                   {/* h2 enfraquece hierarquia */}
  <Button variant="default">Confirmar</Button>
  <Button variant="default">Cancelar</Button>             {/* dois primarios = nenhum */}
</div>
```

---

## 4. CTA primario

- **1 por tela.** Mais de 1 = paralisia de escolha.
- **Cor solida** (`tone='action'`).
- **Texto descritivo verbo+objeto** (PT-BR).

| Bom | Ruim |
|---|---|
| `"Importar 47 torneios"` | `"Confirmar"` |
| `"Salvar configuracoes"` | `"OK"` |
| `"Comecar nova sessao"` | `"Iniciar"` |
| `"Excluir 3 torneios"` | `"Sim"` |

---

## 5. Filtros e chips

**Padrao canonico:**
1. Filtros vivem em barra acima da grid (Select/dropdown/range).
2. Chips ativos abaixo da barra mostrando o que esta filtrado (use `<FilterChipGroup>`).
3. Botao "Limpar tudo" aparece automaticamente quando >1 chip ativo.

```tsx
import { FilterChip, FilterChipGroup } from '@/components/ui/FilterChip';

<FilterChipGroup
  chips={[
    { key: 'buyin', label: 'Buy-in: $5-$20', onRemove: () => clearFilter('buyin'), tone: 'info' },
    { key: 'rede',  label: 'Rede: WPN',      onRemove: () => clearFilter('rede') },
    { key: 'data',  label: 'Ultimos 7 dias', onRemove: () => clearFilter('data') },
  ]}
  onClearAll={() => clearAllFilters()}
/>
```

**API resumida:**
- `<FilterChip label onRemove tone? variant? keyId? />` — chip standalone.
- `<FilterChipGroup chips onClearAll? />` — group helper. Retorna `null` quando `chips.length === 0`. Botao "Limpar tudo" so renderiza com `chips.length > 1` E `onClearAll` definido.

---

## 6. Empty state

Use `<EmptyState>` para qualquer tela/secao sem dados.

**Anatomia:**
- Icone (opcional).
- Titulo (h3).
- Descricao curta.
- CTA primario obrigatorio.
- Link secundario opcional.

**4 tipos canonicos:**

| Tipo | Quando | CTA recomendado |
|---|---|---|
| **Nunca-teve-dados** | Onboarding implicito | "Importar seu primeiro CSV" |
| **Filtros zerados** | Filtros aplicados sem match | "Limpar filtros" |
| **Busca sem resultado** | Query nao retornou nada | "Refinar busca" + sugestao |
| **Erro de rede** | Falha de fetch | "Tentar novamente" + link "Reportar problema" |

```tsx
import { EmptyState } from '@/components/ui/EmptyState';
import { Inbox } from 'lucide-react';

<EmptyState
  icon={<Inbox className="w-full h-full" />}
  title="Nenhum torneio importado"
  description="Importe seu primeiro CSV para ver suas estatisticas."
  ctaLabel="Importar CSV"
  ctaAction={() => navigate('/upload')}
  secondaryLink={{ label: 'Como exportar?', href: '/docs/export' }}
  area="library"
/>
```

**API resumida:**
- `icon?: ReactNode` — opcional.
- `title: string` — obrigatorio.
- `description: string` — obrigatorio.
- `ctaLabel: string` — obrigatorio.
- `ctaAction: () => void` — **OBRIGATORIO** (lesson #11 — sem default decorativo).
- `secondaryLink?: { label, href }` — opcional.
- `variant?: 'default' | 'compact'` — `default` centralizado padding amplo, `compact` inline.
- `iconSize?: 'sm' | 'md' | 'lg'` — 32/64/96 px.
- `area?: string` — telemetria. Default `'generic'`.

> **Legacy:** `client/src/components/studies/EmptyState.tsx` eh DEPRECATED. Migracao para `@/components/ui/EmptyState` agendada para Sprint UI-QW-1.

### 6.1. Validacao de secondaryLink.href

Quando `secondaryLink` for usado, o **CHAMADOR e responsavel** por validar que `href` nao usa schemas perigosos (`javascript:`, `data:`, `vbscript:`). O componente `<EmptyState>` NAO valida runtime — assume input confiavel.

Helper sugerido:

```ts
function isSafeHref(href: string): boolean {
  return /^(https?:|\/|#|mailto:)/.test(href);
}

// Uso:
<EmptyState
  // ...
  secondaryLink={
    isSafeHref(linkFromAPI)
      ? { label: 'Como funciona?', href: linkFromAPI }
      : undefined
  }
/>
```

> Regra: hrefs vindos de API/usuario PRECISAM passar por `isSafeHref` antes de virar prop. Hrefs hardcoded (literais no fonte) sao seguros por inspecao.

---

## 7. Loading state

- **Skeleton matching layout** > spinner full-screen.
- Use `<Skeleton />` do shadcn (`@/components/ui/skeleton`).
- Spinner so em acoes >2s sem skeleton possivel (ex: aguardando resposta de API depois de submit).

```tsx
import { Skeleton } from '@/components/ui/skeleton';

{isLoading ? (
  <div className="space-y-2">
    <Skeleton className="h-8 w-48" />
    <Skeleton className="h-4 w-32" />
  </div>
) : (
  <YourContent />
)}
```

---

## 8. Modal vs Sheet vs Page — decision tree

| Cenario | Componente |
|---|---|
| Confirmacao destrutiva curta (1 pergunta) | `<AlertDialog>` |
| Criacao 1-3 campos | `<Dialog>` |
| Edicao 4-10 campos em contexto | `<Sheet>` (drill-in lateral) |
| Form >10 campos ou multi-step | Pagina dedicada |

**Anti-pattern:** chain modals (modal abre modal abre modal). Quase sempre indica fluxo mal modelado — refatore para wizard ou pagina.

---

## 9. Densidade

| Contexto | Densidade | Gap padrao |
|---|---|---|
| Pro user (Grind, Dashboard, Bankroll) | Alta | `gap-3` / `gap-4` |
| Conteudo (Biblioteca, Studies leitura) | Baixa | `gap-6` / `gap-8` |
| Forms | Media | `gap-4` / `gap-5` |

Pro players tem alta tolerancia a densidade — info >> respiro. Conteudo de leitura inverte.

---

## 10. PageHeader

Use `<PageHeader>` no topo de toda pagina (excluindo paginas hero como Home).

```tsx
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';

<PageHeader
  title="Biblioteca"
  subtitle="47 torneios catalogados"
  actions={
    <>
      <Button variant="ghost">Filtros</Button>
      <Button>Importar CSV</Button>
    </>
  }
  breadcrumb={<a href="/">Home</a>}
/>
```

**API:**
- `title: string | ReactNode` — obrigatorio. Renderiza sempre como `<h1>`.
- `subtitle?: string | ReactNode` — opcional.
- `actions?: ReactNode` — slot a direita (desktop) / abaixo (mobile).
- `breadcrumb?: ReactNode` — slot acima do title, envolvido por `<nav aria-label="breadcrumb">`.

> **Restricoes (R5 ADR-078):** SEM prop `icon`, `gradient`, `background`. Header eh canonico minimalista. Heros vivem em componente proprio (ex: `HomeHero` se necessario).

---

## 11. Hover / focus / motion

- **SEMPRE definir hover** (ex: `hover:bg-muted`).
- **SEMPRE definir focus-visible** (`focus-visible:ring-2 focus-visible:ring-ring`).
- **NUNCA usar `outline:none` sem replacement** (acessibilidade quebra).
- Transitions 150-300ms (`tokens.motion.fast/base/slow`).
- Respeitar `prefers-reduced-motion` (`motion-reduce:transition-none`).

---

## 12. Hierarquia de copy PT-BR

- **Verbo + objeto descritivo** em CTAs e botoes.
- **Gerundio** so em estados de loading: `"Importando torneios..."`.
- **Numeros sempre com unidade**: `"47 torneios"`, `"$ 1.234,56"`, `"5 dias atras"`.
- **Tom direto** — evite "Por favor", "Voce gostaria de...".

| Bom | Ruim |
|---|---|
| `"Importar 47 torneios"` | `"Confirmar"` |
| `"$ 1.234,56"` | `"1234.56"` |
| `"5 dias atras"` | `"5"` |
| `"Importando torneios..."` | `"Aguarde..."` |

---

## 13. Hooks first (lesson #1 do CLAUDE.md)

Early return SEMPRE depois de todos `useState`/`useEffect`/`useQuery`. Violacao = violacao das Rules of Hooks.

**Bom:**
```tsx
function MyComponent({ id }: Props) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['item', id] });

  if (isLoading) return <Skeleton />;
  if (!data) return <EmptyState ... />;

  return <div>{data.title}</div>;
}
```

**Ruim:**
```tsx
function MyComponent({ id }: Props) {
  if (!id) return null;                                 // ANTES dos hooks — proibido
  const [open, setOpen] = useState(false);
  const { data } = useQuery(...);
  return <div>{data.title}</div>;
}
```

---

## 14. data-testid (lesson #2 do CLAUDE.md)

- **Convencao:** `kebab-case`.
- **Prefixo do componente:** `empty-state`, `filter-chip-{key}`, `page-header-title`.
- **NUNCA** depender de innerText em testes E2E — use testid.
- Use testid mesmo para elementos que ja tem `aria-label` ou `role` — testid eh estavel; conteudo de texto muda.

```tsx
<Button data-testid="import-csv-cta">Importar 47 torneios</Button>
```

---

## 15. Quando NAO usar componentes Foundation

Escape hatch — se feature requer comportamento exotico:

1. Empty state com 3 CTAs simultaneos? → build custom local.
2. PageHeader com background gradient hero? → use `HomeHero` proprio.
3. FilterChip com expander interno? → custom local.

**Regra:** custom local OK, MAS:
- Adicione comentario `// TODO(ui-foundation): considerar evoluir API canonica para cobrir este caso`.
- Abra issue para discutir com PM se padrao se repetir em 2+ paginas.
- Documente decisao em ADR se mudanca for arquitetural.

Anti-pattern: criar componente local "porque eh mais rapido" quando Foundation ja resolve. Reviewer reprova.

---

## 16. Historico de revisoes

| Data | Versao | Autor | Mudanca |
|---|---|---|---|
| 2026-05-02 | 1.0 | Sprint UI-FND-1 | Versao inicial — tokens + EmptyState + FilterChip + PageHeader documentados |

---

**Fim de `ui-patterns.md` v1.0.**
