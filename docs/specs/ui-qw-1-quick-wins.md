# Spec — UI-QW-1 Quick Wins Globais (Padronizacao em Batch)

> Sprint: UI-QW-1 (Fase 1 — Quick Wins do plano UX 2026-05-02)
> Data: 2026-05-02
> Input: `Docs/ux-audit-2026-05-02/implementation-plan.md` (secao "Sprint UI-QW-1") + `Docs/ux-audit-2026-05-02/README.md` + `Docs/specs/ui-fnd-1-foundation.md` (Foundation entregue) + `Docs/architecture/decisions/078-design-tokens-ui-patterns.md` + `Docs/conventions/ui-patterns.md` + revisor UI-FND-1 (6 NITs)
> Output: este documento — fonte de verdade operacional para `implementer` + `reviewer`
> Status: Proposta (aguardando aprovacao do dev)
> Idioma: PT-BR (codigo em ingles, conteudo/UI em PT-BR)

---

## 1. Sumario Executivo

**Objetivo.** Aplicar limpezas globais low-effort/high-impact em batch, consumindo a Foundation entregue por UI-FND-1 (`tokens` + `EmptyState` + `FilterChip`/`FilterChipGroup` + `PageHeader`). Sem logica nova, sem mudanca de business rules — apenas substituicao + cleanup visual + 6 NITs do reviewer da Foundation absorvidos.

**Escopo.** 14 RFs em ~2 dias dev (8 quick wins globais G1-G8 + 6 NITs N1-N6 do UI-FND-1 reviewer). Cada RF e independente e pode ser revertido isoladamente se quebrar (commits atomicos).

**14 RFs em 1 linha:**
- **RF-01** (G1) — Remover `hover:scale-[1.02]` em paginas Tier 1 (Home, TournamentLibraryNew cards, UploadHistory stat cards)
- **RF-02** (G2) — Banir emoji em h1/h2 de paginas (manter so em onboarding/empty state especificos)
- **RF-03** (G3) — Migrar `window.confirm()` recovery banner em `GrindSession.tsx:960` para `AlertDialog` Radix
- **RF-04** (G4) — Migrar `fetch()` para `apiRequest()` em `Bankroll.tsx:70` e `:79`
- **RF-05** (G5) — Header alinhado a esquerda em `UploadHistory.tsx:127-131` (consumir `<PageHeader>`)
- **RF-06** (G6) — Aplicar `<EmptyState>` novo em TournamentLibraryNew + UploadHistory + GrindSession history; deprecar `studies/EmptyState.tsx` legacy
- **RF-07** (G7) — Aplicar `<FilterChip>` + `<FilterChipGroup>` em TournamentLibraryNew + Dashboard + GrindSession (substituir implementacoes ad-hoc)
- **RF-08** (G8) — Padronizar copy "Em breve" como canon (refactor 1 ocorrencia "sendo preparados" em CourseDetailPage)
- **RF-09** (N1) — Validar import semantico de `tokens` em pelo menos 1 ponto critico de EmptyState/PageHeader
- **RF-10** (N2) — JSDoc `@deprecated` em `studies/EmptyState.tsx` legacy ate migracao G6 completar
- **RF-11** (N3) — `FilterChipGroup` wrapper com `role="region" aria-label="Filtros ativos"`
- **RF-12** (N4) — Documentar em `ui-patterns.md` validacao de `secondaryLink.href` (rejeitar `javascript:`/`data:` schemas)
- **RF-13** (N5) — Telemetria do EmptyState com `console.debug` em dev (lesson #9 — log antes de fallback)
- **RF-14** (N6) — Atualizar CLAUDE.md secao 12 adicionando entrada `Docs/conventions/ui-patterns.md`

**Fora de escopo:** veja secao 11.

---

## 2. Contexto e Motivacao

### 2.1. Problema documentado pelo audit

A auditoria UX de 2026-05-02 catalogou 130+ achados e identificou padroes globais que se repetiam em multiplas paginas:

| Achado | Audit ID(s) | Resolvido por |
|---|---|---|
| `hover:scale-[1.02]` causa instabilidade visual + nao funciona em mobile | H6, L11, U9 | RF-01 (G1) |
| Emoji em headings polui hierarquia (anti-pattern 2.1, 2.6) | H7 | RF-02 (G2) |
| `window.confirm()` nao acessivel + visual fora de padrao | GS3 | RF-03 (G3) |
| `fetch()` direto em vez de `apiRequest()` perde CSRF + auth refresh | B5 | RF-04 (G4) |
| Header `text-center` quebra hierarquia padrao do app (esquerda) | U10 | RF-05 (G5) |
| Empty state generico (so "Nenhum item") sem CTA | L4, U2, GS6 | RF-06 (G6) |
| Filtros ativos sem chip removivel; cada pagina implementa do zero | D1, L2, GL8 | RF-07 (G7) |
| Inconsistencia "Em breve" vs "sendo preparados" como copy | BL3 | RF-08 (G8) |

### 2.2. Tese

Foundation UI-FND-1 entregou os 4 componentes/tokens canonicos. Sem aplicar em batch agora:
- Sprints Tier 1 page-specific (UI-T1-Home, UI-T1-Library, etc) gastariam tempo replicando substitucoes basicas em vez de focar em refatoracao de fluxo.
- Reviewer nao tem teste real de "Foundation funciona em paginas reais" — Foundation virou shelfware.
- Inconsistencia visual atual (objetivo do audit) continua na main por mais semanas.

### 2.3. Por que 14 RFs em 1 sprint reduzido

- Cada G/N e isolado (1 commit, 1 reverter possivel).
- Sem testes novos — apenas adapta testes existentes que quebrem com refactor visual.
- Foundation ja absorveu o risco de design das APIs.
- Smoke test manual em paginas Tier 1 cobre regressao visual.
- Reviewer `DOUBLE-check` (mudanca global = risco de regressao visual) = mitigacao definida no plano.

---

## 3. Defaults Ativos D1-D14

Decisoes ja tomadas pelo PM. Implementer assume sem requestionar.

| ID | Default |
|---|---|
| **D1** | **G1 escopo:** remover `hover:scale-[1.02]` apenas nas paginas/componentes Tier 1 listados explicitamente (Home, TournamentLibraryNew cards, UploadHistory stat cards). NAO remover em `client/src/index.css` (helper class generica) nem em ProfitChart, dashboard tabs (Position/Participants/Period/Category/Buyin/Site) — esses ficam para Sprint UI-T1-Dashboard. Foco aqui = paginas Tier 1 imediatas catalogadas em H6/L11/U9. |
| **D2** | **G2 escopo:** banir emoji em `<h1>` e `<h2>` de paginas (top of page). Manter em: empty states especificos (ex: 📁 em recuperacao de dados), botoes especificos com semantica clara (ex: 📋 em "Notas de Preparacao"), labels de filtros densos (ex: 🎯 Preparacao no FilterDropdown). Auditor sao `<h1>`/`<h2>` em arquivos de pagina (`client/src/pages/**`). Lista alvo gerada via Grep + revisao implementer (ver criterio de aceite). |
| **D3** | **G3 escopo:** apenas `GrindSession.tsx:960` (recovery banner do auto-save). Os outros 6 `window.confirm()` no codigo (AdminUsers, Subscriptions, GrindSessionLive, EditUserModal, TournamentCard) ficam para os respectivos sprints page-specific. Implementacao: usar `AlertDialog` de `@/components/ui/alert-dialog` (shadcn), gerenciar estado com `useState<boolean>` local (`isRecoveryDialogOpen`), trigger no useEffect substitui o `window.confirm`. State decoupling: nao misturar com outros dialogs do GrindSession (lesson #12 — `useState` local sobrevive se controlado isoladamente). |
| **D4** | **G4 escopo:** apenas Bankroll.tsx linhas 70 e 79 (queries `consolidated` + `wallets`). Substituir por `apiRequest` de `@/lib/queryClient`. Manter `staleTime: 30_000` e mensagens de erro existentes. NAO refatorar outras chamadas fetch no app — escopo restrito ao listado. |
| **D5** | **G5 escopo:** Substituir `<div className="text-center space-y-2">` em UploadHistory linha 127-131 por `<PageHeader title="Historico de Upload" subtitle="Gerencie e monitore suas importacoes de torneios" />`. NAO mexer em outros headers do app neste sprint. |
| **D6** | **G6 escopo + ordem de migracao:** (a) TournamentLibraryNew linhas 712-738 — 2 empty states (filtros zerados + "Nenhum Grupo Encontrado"); (b) UploadHistory linha 258-263 — empty state da lista de uploads; (c) SessionHistoryList linha 145 — "Nenhuma sessao encontrada". Cada um vira `<EmptyState>` do `@/components/ui/EmptyState` com CTA contextual obrigatorio (lesson #11). NAO migrar empty states de Studies/Biblioteca neste sprint (legacy continua valido — RF-10 marca @deprecated mas nao deleta). Migracao do `studies/EmptyState.tsx` legacy nao e parte deste sprint (consumidores de Studies continuam usando o legacy ate Sprint Studies-Polish). |
| **D7** | **G7 escopo + chips canonicos:** (a) TournamentLibraryNew linhas 628-672 — 7 chips ad-hoc viram array de objetos consumidos por `<FilterChipGroup>` com `onClearAll={handleClearFilters}`; (b) GrindSession linha 1133-1137 — substituir `<FilterDropdown>` por `<FilterChipGroup>` no topo APENAS para mostrar filtros ativos (manter `<FilterDropdown>` como controle de adicao — chips refletem estado e permitem remocao individual; NAO remover o componente `FilterDropdown` em si). (c) Dashboard — verificar se ha chips ad-hoc; se houver, substituir; se nao houver chips ativos hoje (audit D1 indica filtros sem chips ativos), implementer deve adicionar `<FilterChipGroup>` consumindo state existente de filtros do Dashboard (sem mudar logica de filtragem — apenas exibicao). Se nao for trivial, implementer documenta na PR e Dashboard fica para UI-T1-Dashboard. |
| **D8** | **G8 escopo + decisao:** "Em breve" e o canon (alinhado com BibliotecaPage:179, LessonRow, TournamentCard). Refactor obrigatorio: `CourseDetailPage.tsx:256` "Modulos sendo preparados - em breve!" -> "Modulos em breve!" (mantem o "em breve" mas remove "sendo preparados" duplicado). Nenhuma outra ocorrencia de "sendo preparados" foi encontrada no codigo (`Grep` confirmou apenas 1 hit). |
| **D9** | **N1 — import semantico:** EmptyState.tsx + PageHeader.tsx ja estao em main pos UI-FND-1. Implementer adiciona import `import { tokens } from '@/lib/ui-tokens'` e usa pelo menos 1 token concreto (ex: `tokens.space.lg` como padding-base, ou `tokens.color.neutral.text` para subtitle). Objetivo: provar que componente Foundation consome tokens (link semantico). Nao precisa refatorar todas classnames — 1 token aplicado e suficiente para reviewer validar. Se UI-FND-1 ja entregou com tokens consumidos, implementer apenas confirma e marca RF como done. |
| **D10** | **N2 — @deprecated tag:** Adicionar JSDoc `@deprecated` no top do arquivo `client/src/components/studies/EmptyState.tsx` indicando que sera substituido por `@/components/ui/EmptyState` em sprint futuro. Texto sugerido: `/** @deprecated Migrar para @/components/ui/EmptyState (canonico Sprint UI-FND-1). Este componente legacy permanece para compat com Sprint Studies-Reform; sera removido em Sprint Studies-Polish. */`. NAO deletar o arquivo nem alterar comportamento. |
| **D11** | **N3 — a11y region:** `FilterChipGroup` wrapper recebe `role="region"` + `aria-label="Filtros ativos"`. Edicao no arquivo `client/src/components/ui/FilterChip.tsx` (RF-03 da Foundation entregou esse componente). Adicionar atributos no `<div>` wrapper que ja envolve os chips. NAO criar novo wrapper — apenas anotar o existente. |
| **D12** | **N4 — secondaryLink validation guidance:** Adicionar secao curta em `Docs/conventions/ui-patterns.md` (item dentro do topico "Empty state") avisando que `secondaryLink.href` deve ser validado pelo CHAMADOR (nao pelo componente) para rejeitar schemas `javascript:` e `data:`. Nao adicionar validacao runtime no EmptyState (escopo: apenas docs). Snippet recomendado no guia: helper `isSafeHref(href)` documentado com regex `^(https?:|/|#|mailto:)`. |
| **D13** | **N5 — telemetria com console.debug:** Editar EmptyState.tsx (Foundation) para adicionar `console.debug` quando `window.__telemetry` ausente OU quando `track` throw. Lesson #9: log antes de fallback. Em production, `console.debug` e silenciado por padrao em devtools (nao polui). Implementacao: dentro do `try/catch` ja existente, adicionar `if (process.env.NODE_ENV !== 'production') console.debug('[EmptyState] telemetry skipped:', { area, reason });`. |
| **D14** | **N6 — CLAUDE.md update:** Adicionar entrada na tabela da secao 12 ("Quando Carregar Cada Doc") apontando para `Docs/conventions/ui-patterns.md`. Tarefa: padronizacao UI / componente novo / decisao visual. Conteudo da linha sugerido: `\| Padronizacao UI / componente novo / decisao visual \| Docs/conventions/ui-patterns.md (sempre) + tokens em @/lib/ui-tokens \|`. |

---

## 4. Usuarios e Personas

Spec entrega refactors visuais. "Usuarios" do entregavel sao (a) **end-user** (jogador poker) que ve UI mais consistente e (b) **agentes do pipeline / dev humano** que mantem o codigo.

| Persona | O que ganha com este sprint | Trigger principal |
|---|---|---|
| **End-user (jogador poker)** | UI sem instabilidade visual (sem scale hover), empty states com CTA acionavel, filtros visualizaveis e removiveis, copy consistente | Pos-merge — uso diario do app |
| **Implementer (proximo agente)** | Spec clara com path:linha exato. Cada G/N um RF independente. Sem necessidade de consultar audit completo. | Spec aprovada |
| **Reviewer (pre-merge)** | Spec organiza checklist DOUBLE-check por RF. Smoke test manual de paginas Tier 1 mapeado. | Implementer green-phase |
| **Implementer Sprints UI-T1-* futuros** | Foundation comprovadamente em uso real em multiplas paginas — pattern replicavel sem reinventar | Sprint UI-QW-1 mergeado |
| **Dev (founder)** | QA visual antes de merge main. Foundation provada em batch. Lessons aplicadas (#9, #11, #12). | Manual + sprint review |

### 4.1. User Stories

#### US-01 (end-user)
> Como jogador, quero que cards nao "pulem" quando passo o mouse para nao sentir instabilidade visual durante meu workflow de analise.

#### US-02 (end-user)
> Como jogador, quero ver chips dos filtros que apliquei na biblioteca e poder remove-los individualmente sem reabrir o painel de filtros, para iterar rapido.

#### US-03 (end-user)
> Como jogador novo no app, quero que empty states me digam o proximo passo (CTA) em vez de so "Nenhum item" para nao ficar perdido.

#### US-04 (end-user)
> Como jogador acessibilidade-dependente, quero que dialogs de confirmacao sejam navegaveis por teclado e leitor de tela (AlertDialog Radix), nao window.confirm() do browser que rompe contexto.

#### US-05 (implementer Tier 1)
> Como implementer da proxima sprint (UI-T1-Library), quero ver `<FilterChipGroup>` ja em uso em TournamentLibraryNew para extender o padrao em vez de re-inventar.

#### US-06 (reviewer)
> Como reviewer, quero spec listar smoke test obrigatorio de cada pagina Tier 1 para garantir zero regressao visual antes de aprovar merge.

---

## 5. Requisitos Funcionais

### RF-01 (G1): Remover `hover:scale-[1.02]` em paginas Tier 1

**Descricao.** Substituir efeito de zoom em hover por hover de cor/sombra mais sutil, em paginas Tier 1 catalogadas pelo audit (H6, L11, U9). Escopo restrito conforme D1.

**Locais alvo:**
- `client/src/pages/Home.tsx` — todos cards com `hover:scale-[1.02]` (Grep para listar; estimado 4-6 ocorrencias).
- `client/src/pages/TournamentLibraryNew.tsx` — cards de grupo (verificar se aplica em algum bloco do componente).
- `client/src/pages/UploadHistory.tsx` — linhas 183, 202, 221 (3 stat cards).

**Regras:**
- Substituir `hover:scale-[1.02]` por `hover:shadow-xl` (mantem feedback de interatividade sem deslocamento de layout).
- Manter `transition-all duration-200` ou similar para suavizar hover.
- NAO mexer em `client/src/index.css` (helper genericas) nem em componentes Dashboard tabs (Position/Participants/etc) — fora de escopo (UI-T1-Dashboard).

**Criterio de aceitacao:**
- [ ] `Grep` em `Home.tsx`, `TournamentLibraryNew.tsx`, `UploadHistory.tsx` para `hover:scale-[1.02]` retorna 0 resultados.
- [ ] `Grep` em `client/src/pages/dashboard/**` ainda mostra `hover:scale-[1.02]` (nao alterado neste sprint).
- [ ] Smoke manual: hover em cards das 3 paginas mostra sombra mais marcante mas SEM mudanca de tamanho.

---

### RF-02 (G2): Banir emoji em h1/h2 de paginas

**Descricao.** Remover emojis (🎯, 📊, 📁, etc) de tags `<h1>` e `<h2>` em arquivos de pagina (`client/src/pages/**`). Manter em empty states especificos, botoes com semantica e labels de filtros densos.

**Identificacao alvo:**
- Implementer roda `Grep` com pattern `<h[12][^>]*>.*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]` (regex emoji unicode) em `client/src/pages/**`.
- Lista resultante = locais a corrigir.

**Regras:**
- Para cada hit: remover emoji, manter texto. Se titulo dependia do emoji para semantica (ex: "🎯 Spots"), usar `<icon size={20} />` antes do texto via lucide-react quando icone semantico for necessario (ex: `<Target className="h-5 w-5 mr-2 inline" />`). Implementer decide caso a caso.
- Implementer documenta na PR a lista de paginas tocadas + decisao caso a caso.
- Se emoji estiver em `<CardTitle>` (shadcn), mesma regra (CardTitle renderiza como h3 mas tambem polui hierarquia visual em headings de pagina).

**Criterio de aceitacao:**
- [ ] Apos refactor, `Grep` em `client/src/pages/**` para emoji em h1/h2 retorna 0 resultados (ou apenas falsos positivos documentados na PR).
- [ ] Paginas continuam visualmente identificaveis (icones substituem emoji quando necessario).
- [ ] Outras areas (filtros, empty state, botoes) com emoji NAO foram tocadas.

---

### RF-03 (G3): Migrar `window.confirm()` recovery banner para AlertDialog

**Descricao.** Substituir `window.confirm()` em `GrindSession.tsx:960-963` (recovery do auto-save de edicao) por `<AlertDialog>` Radix com botoes "Recuperar" / "Descartar". Escopo: APENAS este local (D3).

**Implementacao sugerida:**
```tsx
// Estado local isolado (lesson #12 — useState sobrevive em componente controlado)
const [recoveryDialog, setRecoveryDialog] = useState<{
  open: boolean;
  data: Record<string, any> | null;
  lastSaved: Date | null;
} | null>(null);

useEffect(() => {
  if (editingSession && isEditDialogOpen) {
    const recoveredData = recoverAutoSave();
    if (recoveredData) {
      setRecoveryDialog({ open: true, data: recoveredData, lastSaved });
    }
  }
}, [editingSession, isEditDialogOpen]);

// Renderizacao no JSX:
<AlertDialog open={recoveryDialog?.open ?? false} onOpenChange={(open) => !open && setRecoveryDialog(null)}>
  <AlertDialogContent data-testid="recovery-dialog">
    <AlertDialogHeader>
      <AlertDialogTitle>Encontrei dados nao salvos</AlertDialogTitle>
      <AlertDialogDescription>
        Ultima modificacao: {recoveryDialog?.lastSaved ? recoveryDialog.lastSaved.toLocaleString() : 'Agora ha pouco'}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel onClick={() => setRecoveryDialog(null)}>Descartar</AlertDialogCancel>
      <AlertDialogAction onClick={() => {
        Object.entries(recoveryDialog!.data!).forEach(([f, v]) => updateField(f, v));
        toast({ title: 'Dados recuperados', description: 'Suas alteracoes nao salvas foram restauradas.' });
        setRecoveryDialog(null);
      }}>
        Recuperar
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

**Criterio de aceitacao:**
- [ ] `Grep` em `GrindSession.tsx` para `window.confirm` retorna 0 resultados.
- [ ] `<AlertDialog>` renderiza apos useEffect detectar dados salvos no localStorage.
- [ ] Click "Recuperar" chama `updateField` para cada par + toast aparece.
- [ ] Click "Descartar" fecha dialog sem alterar dados.
- [ ] `data-testid="recovery-dialog"` presente.
- [ ] Testes existentes de GrindSession continuam verdes (sem mudanca de logica de save/recover).
- [ ] `Grep` em outros arquivos para `window.confirm` permanece inalterado (escopo restrito).

---

### RF-04 (G4): Migrar `fetch()` para `apiRequest()` em Bankroll.tsx

**Descricao.** Substituir 2 chamadas `fetch()` em `client/src/pages/Bankroll.tsx` linhas 70 e 79 por `apiRequest()` de `@/lib/queryClient`. Razao: `apiRequest` injeta CSRF, lida com refresh de token automatico, redireciona em 401 (B5 do audit).

**Mudanca:**
```tsx
// Antes (linhas 67-74):
const { data: consolidated } = useQuery<ConsolidatedResponse>({
  queryKey: ["/api/bankroll/consolidated"],
  queryFn: async () => {
    const r = await fetch("/api/bankroll/consolidated", { credentials: "include" });
    if (!r.ok) throw new Error("consolidated_unavailable");
    return r.json();
  },
  staleTime: 30_000,
});

// Depois:
const { data: consolidated } = useQuery<ConsolidatedResponse>({
  queryKey: ["/api/bankroll/consolidated"],
  queryFn: async () => {
    const r = await apiRequest("/api/bankroll/consolidated");
    if (!r.ok) throw new Error("consolidated_unavailable");
    return r.json();
  },
  staleTime: 30_000,
});
```

E identico para a query `wallets` na linha 79 (substituir fetch por apiRequest, mantendo o path `/api/wallets?includeArchived=true`).

**Criterio de aceitacao:**
- [ ] `Grep` em `Bankroll.tsx` para `fetch(` retorna 0 resultados.
- [ ] `apiRequest` importado de `@/lib/queryClient` no topo.
- [ ] Comportamento de queries identico (mesmo `queryKey`, mesmo `staleTime`, mesma mensagem de erro).
- [ ] Testes existentes de Bankroll continuam verdes.

---

### RF-05 (G5): Header esquerda em UploadHistory via PageHeader

**Descricao.** Substituir bloco `<div className="text-center space-y-2">` em `UploadHistory.tsx` linha 127-131 por `<PageHeader>` da Foundation. Resultado: titulo alinhado a esquerda, subtitle abaixo, sem `text-center`.

**Mudanca:**
```tsx
// Antes (linhas 127-131):
<div className="text-center space-y-2">
  <h1 className="text-3xl font-bold text-white">Histórico de Upload</h1>
  <p className="text-gray-400 text-lg">Gerencie e monitore suas importações de torneios</p>
</div>

// Depois:
<PageHeader
  title="Historico de Upload"
  subtitle="Gerencie e monitore suas importacoes de torneios"
/>
```

**Regras:**
- Importar `PageHeader` de `@/components/ui/PageHeader`.
- Manter texto exato (atencao acentuacao: "Historico" sem acento conforme convencao do codebase ou com acento conforme texto original — implementer escolhe consistente com resto do app; recomenda manter acento se ja estava com acento).
- Sem `actions` slot — pagina nao tem botoes no header (o upload acontece via card abaixo).

**Criterio de aceitacao:**
- [ ] Bloco `<div className="text-center space-y-2">` envolvendo h1+p removido.
- [ ] `<PageHeader>` renderizado com `data-testid="page-header"` (vem da Foundation).
- [ ] `<h1>` resultante alinhado a esquerda (validar via DOM ou snapshot).
- [ ] Cards "Estatisticas Resumidas", "Importar Torneios", "Historico de Uploads" continuam intactos.

---

### RF-06 (G6): Aplicar `<EmptyState>` novo em 3 locais

**Descricao.** Substituir empty states ad-hoc em 3 paginas pelo `<EmptyState>` canonico da Foundation. Cada um com CTA contextual obrigatorio (lesson #11). Migracao do `studies/EmptyState.tsx` legacy NAO faz parte deste sprint (RF-10 apenas marca @deprecated).

**Local 1 — TournamentLibraryNew (filtros zerados)** linhas 712-728:
```tsx
// Substituir o bloco que renderiza Search icon + h3 + p + Button "Limpar Filtros"
<EmptyState
  icon={<Search className="h-16 w-16" />}
  title="Nenhum torneio encontrado com esses filtros"
  description="Tente ajustar seus criterios de busca ou limpe os filtros para ver todos os grupos."
  ctaLabel="Limpar filtros"
  ctaAction={handleClearFilters}
  area="library-filters-empty"
/>
```

**Local 2 — TournamentLibraryNew (sem grupos)** linhas 729-737:
```tsx
<EmptyState
  icon={<Trophy className="h-16 w-16" />}
  title="Nenhum grupo encontrado"
  description="Grupos sao criados automaticamente quando voce tem 50+ torneios similares. Importe mais historico para ver a biblioteca."
  ctaLabel="Importar torneios"
  ctaAction={() => setLocation('/upload')}
  area="library-no-groups"
/>
```
> Nota implementer: `setLocation` vem de Wouter (`useLocation` hook). Se ainda nao importado na pagina, adicionar.

**Local 3 — UploadHistory (lista de uploads vazia)** linhas 258-263:
```tsx
<EmptyState
  icon={<Database className="h-12 w-12" />}
  title="Nenhum upload encontrado"
  description="Faca seu primeiro upload usando o formulario acima para comecar a analisar seus torneios."
  ctaLabel="Importar primeiro CSV"
  ctaAction={() => {
    // Scroll suave ate o card de upload acima
    document.querySelector('[data-testid="auto-upload"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }}
  area="upload-history-empty"
  variant="compact"
/>
```
> Nota: usar `variant="compact"` porque empty state esta DENTRO de um Card (nao deve dominar a tela). Se `data-testid="auto-upload"` nao existir, implementer adiciona no componente `AutoUpload` (1 linha) ou usa scroll para topo da pagina como fallback.

**Local 4 — SessionHistoryList (sem sessoes)** linha 145:
```tsx
<EmptyState
  icon={<FileText className="h-16 w-16" />}
  title="Nenhuma sessao encontrada"
  description="Comece a registrar suas sessoes de grind para ver historico e estatisticas aqui."
  ctaLabel="Registrar primeira sessao"
  ctaAction={checkExistingSessionBeforePreparation}
  area="grind-session-history-empty"
/>
```
> Nota: `checkExistingSessionBeforePreparation` ja vem como prop do componente.

**Regras gerais:**
- Importar `EmptyState` de `@/components/ui/EmptyState` (NAO `studies/EmptyState`).
- CTA SEMPRE definido (lesson #11). Sem default decorativo.
- Cada chamada usa `area` unico para telemetria distinguivel.

**Criterio de aceitacao:**
- [ ] 4 locais migrados (2 em TournamentLibraryNew + 1 em UploadHistory + 1 em SessionHistoryList).
- [ ] Em cada local, `data-testid="empty-state"` aparece quando condicao de empty state acionada.
- [ ] CTA clicavel chama acao correta (smoke manual).
- [ ] `studies/EmptyState.tsx` permanece intocado em uso em Studies (`Grep` confirma imports continuam).
- [ ] Testes existentes nao regridem.

---

### RF-07 (G7): Aplicar `<FilterChipGroup>` em 3 paginas

**Descricao.** Substituir implementacoes ad-hoc de chips de filtros ativos pelo helper `<FilterChipGroup>` da Foundation. Mantem comportamento (chip removivel) e adiciona "Limpar tudo" automatico.

**Local 1 — TournamentLibraryNew** linhas 628-672 (7 chips ad-hoc):
```tsx
const activeFilterChips = useMemo(() => {
  const chips: Array<{ key: string; label: string; onRemove: () => void; tone?: 'info' | 'success' | 'action' | 'warn' | 'neutral' }> = [];
  if (filters.period !== 'all') {
    chips.push({
      key: 'period',
      label: `Periodo: ${filters.period === 'month' ? 'Mes atual' : filters.period === 'year' ? 'Ano atual' : filters.period}`,
      onRemove: () => setFilters(prev => ({ ...prev, period: 'all' })),
      tone: 'info',
    });
  }
  if (filters.sites.length > 0) {
    chips.push({
      key: 'sites',
      label: `Site: ${filters.sites.join(', ')}`,
      onRemove: () => setFilters(prev => ({ ...prev, sites: [] })),
      tone: 'success',
    });
  }
  // ... categories, speeds, roiFilter, minimumVolume, buyinRange — analogamente
  return chips;
}, [filters]);

<FilterChipGroup
  chips={activeFilterChips}
  onClearAll={handleClearFilters}
/>
```
> Substitui o bloco `<div className="flex flex-wrap gap-2 mb-4">` inteiro (linhas 629-672).

**Local 2 — GrindSession** linhas 1133-1137:

Adicionar `<FilterChipGroup>` ANTES (acima) do `<FilterDropdown>` existente, exibindo filtros ativos derivados de `filterState`. NAO remover o `<FilterDropdown>` — ele continua sendo o controle de adicao/edicao de filtros. Os chips refletem estado e permitem remocao individual sem reabrir o painel.

```tsx
const activeGrindChips = useMemo(() => {
  const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];
  // Derivar do filterState atual (implementer mapeia campos relevantes)
  // Exemplo: se filterState.preparationRange != [0, 100], adicionar chip
  // Implementer documenta na PR quais campos viraram chips.
  return chips;
}, [filterState]);

{activeGrindChips.length > 0 && (
  <FilterChipGroup
    chips={activeGrindChips}
    onClearAll={() => setFilterState(defaultFilterState)}
  />
)}
<FilterDropdown
  onApplyFilters={setFilterState}
  initialFilters={filterState}
/>
```

**Local 3 — Dashboard** (verificar implementacao atual):
- Implementer roda `Grep` em `client/src/pages/Dashboard.tsx` para identificar se ja existe bloco de chips ad-hoc.
- Se existir: substituir pelo `<FilterChipGroup>` com mesma logica de TournamentLibraryNew.
- Se NAO existir (audit D1 sugere que filtros do Dashboard nao tem chips visuais): adicionar `<FilterChipGroup>` consumindo state de filtros existentes (sem mudar logica de filtragem — apenas renderizar chips para filtros que estao ativos).
- Se a estrutura de filtros do Dashboard for muito complexa para extrair em <30min, implementer documenta na PR e MOVE este local para Sprint UI-T1-Dashboard. Outros 2 locais nao bloqueiam.

**Regras gerais:**
- Importar `FilterChipGroup` de `@/components/ui/FilterChip`.
- `chips` sao construidos via `useMemo` para evitar re-render desnecessario.
- `onClearAll` SEMPRE definido (mesma funcao que botao "Limpar Filtros" se existir).
- `tone` opcional — implementer escolhe semantico (info para periodo, success para sucesso/positivo, etc).

**Criterio de aceitacao:**
- [ ] TournamentLibraryNew: bloco ad-hoc de 7 chips removido, substituido por `<FilterChipGroup>`. Cada filtro ativo continua visivel como chip + botao X funcional.
- [ ] GrindSession: `<FilterChipGroup>` renderizado quando ha filtros ativos; oculto quando vazio. `<FilterDropdown>` continua existindo como controle.
- [ ] Dashboard: `<FilterChipGroup>` adicionado OU implementer documenta na PR motivo de adiar.
- [ ] `data-testid="filter-chip-group"` + `data-testid="filter-chip-clear-all"` (quando >1 chip) presentes (vem da Foundation).
- [ ] `data-testid="filter-chip-{key}"` em cada chip (key estavel: 'period', 'sites', 'categories', etc).
- [ ] Testes existentes verdes.

---

### RF-08 (G8): Padronizar copy "Em breve"

**Descricao.** "Em breve" e a copy canon. Refatorar `CourseDetailPage.tsx:256` que usa "Modulos sendo preparados - em breve!" para apenas "Modulos em breve!".

**Mudanca:**
```tsx
// Antes (linha 256):
<p className="text-gray-400">
  Modulos sendo preparados - em breve!
</p>

// Depois:
<p className="text-gray-400">
  Modulos em breve!
</p>
```

**Regras:**
- Apenas esta ocorrencia. `Grep` para "sendo preparados" no codigo confirmou ser unica.
- NAO mexer em outras ocorrencias de "Em breve" (ja consistentes com canon).

**Criterio de aceitacao:**
- [ ] `Grep` em `client/src/**` para "sendo preparados" retorna 0 resultados.
- [ ] `Grep` para "em breve" continua mostrando os usos existentes (nao alterados).
- [ ] CourseDetailPage continua renderizando empty state quando `course.modules.length === 0` com novo texto.

---

### RF-09 (N1): Validar import semantico de `tokens` em EmptyState/PageHeader

**Descricao.** Reviewer da UI-FND-1 sugeriu garantir link semantico entre componentes Foundation e tokens. Implementer valida (e adiciona se ausente) pelo menos 1 import + uso concreto de `tokens` em `EmptyState.tsx` e `PageHeader.tsx`.

**Implementacao:**
- Abrir `client/src/components/ui/EmptyState.tsx`. Verificar se ja ha `import { tokens } from '@/lib/ui-tokens'` + uso. Se nao, adicionar import e usar pelo menos 1 token concreto (ex: padding via `style={{ padding: tokens.space['2xl'] }}` ou cor de subtitle via `tokens.color.neutral.text` aplicado como classname concatenado).
- Mesma coisa para `PageHeader.tsx` (ex: `tokens.font.xl` aplicado como ref ou `tokens.space.md` como gap reference).
- NAO refatorar 100% das classnames — objetivo eh apenas link semantico para reviewer validar que componente "conhece" tokens.

**Criterio de aceitacao:**
- [ ] `Grep` em `client/src/components/ui/EmptyState.tsx` mostra `import { tokens }` + pelo menos 1 uso de `tokens.*`.
- [ ] Idem em `PageHeader.tsx`.
- [ ] Componente continua renderizando identico (sem regressao visual).
- [ ] Testes da Foundation continuam verdes.

---

### RF-10 (N2): JSDoc `@deprecated` em `studies/EmptyState.tsx`

**Descricao.** Adicionar tag JSDoc `@deprecated` no top do arquivo legacy.

**Implementacao:**
- Editar `client/src/components/studies/EmptyState.tsx`.
- Substituir o JSDoc atual (linhas 1-11) por:
```tsx
/**
 * @deprecated Migrar para `@/components/ui/EmptyState` (canonico Sprint UI-FND-1).
 *             Este componente legacy permanece para compat com Sprint Studies-Reform;
 *             sera removido em Sprint Studies-Polish.
 *
 * Sprint Studies-Reform — RF-10 (Empty States Personalizados)
 *
 * Componente reutilizavel para empty states. Aceita icon, title, description,
 * ctaLabel e ctaAction. Telemetria simples via window.__telemetry?.track quando
 * disponivel (no-op em production caso nao instalado).
 *
 * Lessons aplicadas:
 *   #11 sem default actions decorativas — chamador define ctaAction.
 *   #2 data-testid: empty-state, empty-state-cta
 */
```
- NAO alterar comportamento, props, ou markup.

**Criterio de aceitacao:**
- [ ] `studies/EmptyState.tsx` topo tem JSDoc com `@deprecated` tag.
- [ ] Imports existentes continuam funcionando.
- [ ] IDE (TS) reporta deprecation warning quando consumidor importa o legacy (verificacao manual via VSCode hover).

---

### RF-11 (N3): `FilterChipGroup` wrapper com `role="region" aria-label="Filtros ativos"`

**Descricao.** Adicionar atributos a11y no wrapper do FilterChipGroup. Edicao em `client/src/components/ui/FilterChip.tsx` (entregue por UI-FND-1).

**Implementacao:**
- Localizar o `<div>` wrapper do `FilterChipGroup` que envolve os chips.
- Adicionar `role="region"` + `aria-label="Filtros ativos"`.
- Manter classes existentes (flex, gap, etc).

**Mudanca:**
```tsx
// Antes (estimado):
return (
  <div className="flex flex-wrap items-center gap-2" data-testid="filter-chip-group">
    {chips.map(...)}
    {onClearAll && chips.length > 1 && (
      <button data-testid="filter-chip-clear-all" ...>Limpar tudo</button>
    )}
  </div>
);

// Depois:
return (
  <div
    role="region"
    aria-label="Filtros ativos"
    className="flex flex-wrap items-center gap-2"
    data-testid="filter-chip-group"
  >
    {chips.map(...)}
    {onClearAll && chips.length > 1 && (
      <button data-testid="filter-chip-clear-all" ...>Limpar tudo</button>
    )}
  </div>
);
```

**Criterio de aceitacao:**
- [ ] `FilterChipGroup` wrapper renderiza `role="region"` + `aria-label="Filtros ativos"`.
- [ ] Testes da Foundation atualizados se necessario (test-writer pode adicionar 1 assertion para esses atributos — se for trivial, implementer atualiza).
- [ ] Leitor de tela anuncia "Filtros ativos, regiao" ao tab no grupo (validacao manual opcional).

---

### RF-12 (N4): Documentar validacao de `secondaryLink.href` em ui-patterns.md

**Descricao.** Adicionar nota curta em `Docs/conventions/ui-patterns.md` (dentro do topico "Empty state") avisando que CHAMADOR deve validar `secondaryLink.href` para rejeitar schemas perigosos.

**Implementacao:**
- Editar `Docs/conventions/ui-patterns.md`.
- Localizar secao "Empty state" (item 6 do guia).
- Adicionar paragrafo no fim da secao:
```md
### Validacao de secondaryLink.href

Quando `secondaryLink` for usado, o **CHAMADOR e responsavel** por validar que `href` nao usa schemas perigosos (`javascript:`, `data:`, `vbscript:`). O componente `<EmptyState>` NAO valida runtime — assume input confiavel.

Helper sugerido:
```ts
function isSafeHref(href: string): boolean {
  return /^(https?:|\/|#|mailto:)/.test(href);
}

// Uso:
<EmptyState
  // ...
  secondaryLink={isSafeHref(linkFromAPI) ? { label: 'Como funciona?', href: linkFromAPI } : undefined}
/>
```
```
- NAO adicionar validacao runtime no componente `EmptyState.tsx` — escopo eh apenas docs.

**Criterio de aceitacao:**
- [ ] `Docs/conventions/ui-patterns.md` tem nova subsecao "Validacao de secondaryLink.href" dentro do topico "Empty state".
- [ ] Snippet `isSafeHref` documentado.
- [ ] Componente `EmptyState.tsx` NAO modificado por este RF (so docs).

---

### RF-13 (N5): Telemetria EmptyState com `console.debug` em dev

**Descricao.** Editar `client/src/components/ui/EmptyState.tsx` (Foundation) para adicionar `console.debug` quando telemetria indisponivel ou throw. Lesson #9: log antes de fallback.

**Implementacao:**
- Localizar bloco `try/catch` ja existente em `handleClick` (ou equivalente) que tenta `window.__telemetry?.track?.(...)`.
- Adicionar `console.debug` no catch + no caso de telemetria undefined.

**Mudanca esperada:**
```tsx
const handleClick = () => {
  try {
    const telemetry: any = (typeof window !== 'undefined' ? (window as any).__telemetry : null);
    if (telemetry?.track) {
      telemetry.track('ui.empty_state_cta_clicked', { area });
    } else if (process.env.NODE_ENV !== 'production') {
      console.debug('[EmptyState] telemetry skipped: window.__telemetry unavailable', { area });
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[EmptyState] telemetry error:', err, { area });
    }
    // sem panico (lesson #9)
  }
  ctaAction();
};
```

**Criterio de aceitacao:**
- [ ] EmptyState.tsx tem `console.debug` quando `window.__telemetry` ausente (dev only).
- [ ] EmptyState.tsx tem `console.debug` quando `track` throw (dev only).
- [ ] Production NAO loga (gate por `process.env.NODE_ENV`).
- [ ] CTA continua sendo chamado em ambos casos (sem regressao).
- [ ] Testes da Foundation verdes.

---

### RF-14 (N6): Atualizar CLAUDE.md secao 12

**Descricao.** Adicionar entrada na tabela "Quando Carregar Cada Doc" (secao 12 do CLAUDE.md) apontando para `Docs/conventions/ui-patterns.md`.

**Implementacao:**
- Editar `B:\grindfy\CLAUDE.md`.
- Localizar secao "## 12. Quando Carregar Cada Doc" (linha 204).
- Adicionar linha na tabela existente:
```md
| Padronizacao UI / componente novo / decisao visual | `Docs/conventions/ui-patterns.md` (sempre) + `tokens` em `@/lib/ui-tokens` |
```
- Inserir entre as linhas existentes em ordem logica (recomendo apos "Endpoint novo" e antes de "Decisao arquitetural").

**Criterio de aceitacao:**
- [ ] CLAUDE.md secao 12 contem nova entrada pointing para `Docs/conventions/ui-patterns.md`.
- [ ] Tabela continua bem formatada (markdown valido).
- [ ] Demais entradas inalteradas.

---

## 6. Requisitos Nao-Funcionais

| Tipo | Requisito |
|---|---|
| **Regressao zero em testes** | Suite existente (4157+ testes, ver memory) continua 100% verde apos sprint. Implementer roda `npx vitest run` antes de commit. |
| **Regressao visual zero** | Smoke test manual obrigatorio em paginas Tier 1 (Home, TournamentLibraryNew, UploadHistory, GrindSession, Bankroll, BibliotecaPage/CourseDetailPage). Reviewer DOUBLE-check (mudanca global = risco). |
| **Performance** | Sem mudanca de logica/queries. `useMemo` em chip arrays evita re-render desnecessario (RF-07). |
| **Acessibilidade WCAG 2.2** | RF-03: AlertDialog Radix ja gerencia focus trap, esc-to-close, aria-labelledby. RF-11: FilterChipGroup ganha `role="region" aria-label="Filtros ativos"`. RF-06: EmptyState mantem `role="status"` da Foundation. |
| **Bundle size** | Zero novas deps (`AlertDialog`, `apiRequest`, Foundation components ja em uso). Aumento incremental <2KB esperado (apenas codigo de wiring). |
| **i18n** | Toda copy em PT-BR conforme convencao. Acentuacao opcional (manter consistencia com texto original do bloco substituido). |
| **TypeScript strict** | `npm run check` passa. Sem `any` adicional alem do que ja existe. |
| **Atomicidade de commits** | Cada G/N em commit separado para revert isolado se quebrar. Implementer cria 14 commits ou agrupa por afinidade (ex: G1+G5 em "global header/visual cleanup", G6+G7 em "Foundation rollout") — desde que cada commit seja revertable sem cascata. |
| **Convivencia legacy** | `studies/EmptyState.tsx` continua funcionando intocado (apenas ganha @deprecated tag — RF-10). Imports existentes em Studies nao quebram. |

---

## 7. Endpoints Previstos

Nao aplicavel — esta spec nao toca em backend. Zero novos endpoints. Apenas RF-04 muda como o frontend chama 2 endpoints existentes (de `fetch` para `apiRequest`).

---

## 8. Modelos de Dados Afetados

Nao aplicavel — esta spec nao toca em schema/database. Zero migrations.

---

## 9. Integracoes Externas

Nao aplicavel.

---

## 10. Cenarios de Teste

Lista nao-exaustiva. Sprint NAO escreve testes novos como entregavel — apenas adapta testes existentes que quebrem com refactor visual. Casos abaixo orientam smoke manual.

### 10.1. Smoke manual obrigatorio (pos-implementer, pre-merge)

**Pagina Home:**
- [ ] Hover em cards principais NAO causa zoom (RF-01).
- [ ] Headings da pagina sem emoji (RF-02).

**TournamentLibraryNew:**
- [ ] Hover em cards de grupo NAO causa zoom (RF-01).
- [ ] Aplicar 2+ filtros — chips aparecem em FilterChipGroup com X funcional (RF-07).
- [ ] Botao "Limpar tudo" aparece quando >1 chip (RF-07).
- [ ] Sem filtros + sem grupos — empty state "Nenhum grupo encontrado" com CTA "Importar torneios" (RF-06).
- [ ] Com filtros + nenhum resultado — empty state "Nenhum torneio encontrado com esses filtros" com CTA "Limpar filtros" (RF-06).

**UploadHistory:**
- [ ] Header alinhado a esquerda (RF-05).
- [ ] Hover em stat cards NAO causa zoom (RF-01).
- [ ] Lista vazia — empty state "Nenhum upload encontrado" com CTA "Importar primeiro CSV" que faz scroll para o card de upload (RF-06).

**GrindSession:**
- [ ] FilterChipGroup aparece acima do FilterDropdown quando ha filtros ativos (RF-07).
- [ ] FilterDropdown continua funcional como controle de adicao (RF-07).
- [ ] Trigger de recovery dialog (editar sessao com auto-save salvo no localStorage) abre AlertDialog Radix em vez de window.confirm browser nativo (RF-03).
- [ ] AlertDialog "Recuperar" restaura dados + toast (RF-03).
- [ ] AlertDialog "Descartar" fecha sem mudar dados (RF-03).
- [ ] SessionHistoryList sem sessoes — empty state "Nenhuma sessao encontrada" com CTA (RF-06).

**Bankroll:**
- [ ] Pagina carrega sem erro de rede (RF-04 — apiRequest funciona como fetch).
- [ ] Wallets + consolidated rendem dados normalmente.
- [ ] Comportamento em sessao expirada: apiRequest dispara refresh/redirect (vs fetch que daria 401 sem retry).

**BibliotecaPage / CourseDetailPage:**
- [ ] Curso sem modulos: texto "Modulos em breve!" (sem "sendo preparados") (RF-08).

### 10.2. Testes existentes — adaptacoes esperadas

Implementer monitora `npx vitest run` e adapta testes que quebrem por:
- Selectors de DOM que dependiam de markup antigo (ex: teste que `findByText('Nenhum upload encontrado')` em estrutura especifica). Substituir por `data-testid="empty-state"`.
- Snapshots visuais (se houver) — atualizar com novo markup.
- Testes de `window.confirm` (se houver mock de `vi.spyOn(window, 'confirm')`) — substituir por interaction com AlertDialog.

### 10.3. Edge cases

- [ ] FilterChipGroup com 0 chips — retorna `null`, nao renderiza nada (Foundation behavior).
- [ ] FilterChipGroup com 1 chip + onClearAll — NAO renderiza botao "Limpar tudo" (Foundation D9).
- [ ] AlertDialog recovery: usuario fecha via Esc — dialog fecha, dados nao sao restaurados.
- [ ] EmptyState em UploadHistory com `data-testid="auto-upload"` ausente (se nao foi adicionado): scroll fallback para topo da pagina (validar implementer).
- [ ] CourseDetailPage com `course.modules.length > 0`: empty state nao renderiza, accordion normal aparece.

---

## 11. Fora de Escopo

Itens explicitos que esta spec NAO entrega:

- **Migracao de `studies/EmptyState.tsx` para `ui/EmptyState.tsx`** — legacy permanece (RF-10 apenas marca @deprecated). Migracao em Sprint Studies-Polish futuro.
- **Remocao de `hover:scale-[1.02]` em ProfitChart, dashboard tabs, index.css** — fora de escopo (D1). UI-T1-Dashboard ataca dashboard tabs.
- **Migracao de outros 6 `window.confirm()`** — fora de escopo (D3). AdminUsers, Subscriptions, GrindSessionLive, EditUserModal, TournamentCard ficam para sprints page-specific.
- **Refactor de fetch direto em outras paginas** — fora de escopo (D4). Apenas Bankroll.tsx.
- **Refactor de outros headers** — fora de escopo (D5). Apenas UploadHistory.
- **Empty states em Studies/Biblioteca** — fora de escopo (D6). Continuam usando legacy ate Sprint Studies-Polish.
- **Mudanca de logica de filtros, queries, business rules** — ZERO mudanca permitida. Apenas wiring visual.
- **Novos testes unit** — sprint reduzido, sem testes novos. Apenas adapta existentes.
- **Atualizacao de outras secoes do CLAUDE.md alem da secao 12** — fora de escopo (D14).
- **Storybook ou doc visual interativa** — fora de escopo (continuara faltando).
- **Validacao runtime de `secondaryLink.href` no componente** — apenas docs (D12).
- **Adicao de novos tokens em `ui-tokens.ts`** — Foundation entregue cobre. Se algum RF descobrir gap, documentar em PR e adiar para sprint dedicado.
- **Mudancas em mobile breakpoints, dark/light mode toggle** — ortogonal a este sprint.

---

## 12. Dependencias

- **UI-FND-1 mergeado em main** (Sprint Foundation entregue). Este sprint NAO inicia sem isso. ✅ confirmado.
- **Componentes consumidos:** `EmptyState`, `FilterChip`, `FilterChipGroup`, `PageHeader` em `@/components/ui/*` + `tokens` em `@/lib/ui-tokens`.
- **Componentes shadcn ja em uso:** `AlertDialog` (RF-03), `Card`, `Button`, `Skeleton`.
- **Hooks/utils ja em uso:** `useState`, `useMemo`, `useEffect`, `useLocation` (Wouter), `apiRequest` de `@/lib/queryClient`, `useToast`.
- **Pre-requisitos satisfeitos:** Vitest 4 configurado, Tailwind + shadcn em uso. Nada bloqueia.
- **ZERO novas deps em `package.json`.**

---

## 13. Riscos e Mitigacao

| Risco | Probabilidade | Impacto | Mitigacao |
|---|---|---|---|
| **R1.** RF-07 Dashboard se revela complexo demais (filtros multi-pagina com URL state sync FP-11) e bloqueia sprint. | **MEDIA** | Medio | D7 explicita escape hatch: implementer documenta na PR e ADIA Dashboard para UI-T1-Dashboard. Outros 2 locais (TournamentLibraryNew + GrindSession) nao bloqueiam. **Sinal para founder: confirmar se aceita adiar.** |
| **R2.** RF-07 ad-hoc chips em TournamentLibraryNew tem 7 variantes de cor (azul, verde, roxo, laranja, amarelo) — mapear para 6 tokens semantic pode perder fidelidade visual. | Media | Baixo | Implementer escolhe `tone` mais proximo semanticamente (info=azul, success=verde, action=poker-accent, warn=amarelo/laranja, neutral=roxo/cinza). Reviewer valida. |
| **R3.** RF-03 AlertDialog conflita com outros dialogs existentes em GrindSession (potencial dialog-em-dialog se editar sessao quando recovery ativo). | Baixa | Medio | D3 explicita: state isolado em `useState<{open, data, lastSaved} | null>`. Nao misturar com dialogs de edicao. Implementer testa fluxo manual: abrir edit > recovery aparece > escolher acao > continuar edit. |
| **R4.** RF-06 EmptyState quebra layout de UploadHistory (variant `compact` dentro de Card). | Baixa | Baixo | Smoke manual + variant `compact` ja testado em Foundation. Se quebrar, fallback: variant `default` (layout maior). |
| **R5.** RF-04 apiRequest tem comportamento sutilmente diferente de fetch (ex: throws em 401 vs retorna `{ ok: false }`). | Baixa | Medio | Implementer le `client/src/lib/queryClient.ts` antes de migrar. Testes existentes pegam regressao em queries Bankroll. |
| **R6.** RF-13 console.debug "polui" output em dev se EmptyState renderizado em loop ou em testes que nao mockam window. | Baixa | Baixo | `console.debug` e silenciado por padrao em devtools (precisa filtro "Verbose" ativado). Em Vitest pode ser silenciado via `vi.spyOn(console, 'debug').mockImplementation(() => {})` no setup se necessario. |
| **R7.** RF-02 emoji-bann lista pode ter falsos positivos (ex: emoji em prop string passada para componente que renderiza como h2). | Media | Baixo | Implementer usa Grep + revisao caso a caso. Documenta na PR lista exata de paginas tocadas. Se duvida, deixa o emoji + comenta no PR para reviewer decidir. |
| **R8.** RF-09 (link semantico tokens) e subjetivo — o que conta como "uso significativo" de tokens? | Baixa | Baixo | D9 define minimo: 1 import + 1 uso concreto. Reviewer valida sem reabrir bikeshed. |
| **R9.** Smoke manual incompleto (founder esquece pagina) deixa regressao escapar. | Media | Alto | Spec lista smoke check explicito por pagina (secao 10.1). Reviewer marca cada item antes de aprovar merge. Pos-merge: founder QA antes de merge para main. |
| **R10.** Conflito entre commits de RFs diferentes em mesmo arquivo (ex: TournamentLibraryNew tocado por RF-01, RF-06, RF-07). | Media | Baixo | Implementer ordena commits para minimizar conflito (ex: aplica todos RFs em TournamentLibraryNew em sequencia, depois passa para outro arquivo). Cada commit ainda revertable. |

---

## 14. Decisoes que Precisam Confirmacao do Founder

Antes do implementer atacar, founder confirma estes pontos para evitar refazer trabalho:

1. **Decisao DEC-01 (R1 + RF-07 Dashboard):** Se Dashboard for complexo demais, esta OK adiar para UI-T1-Dashboard? Spec atual diz SIM (D7 escape hatch). Confirmar.

2. **Decisao DEC-02 (RF-02 G2 emoji escopo):** Emoji em `<CardTitle>` (renderiza h3 mas usado como heading visual de pagina) deve ser banido tambem? Spec atual diz SIM (D2). Se founder preferir restringir apenas a `<h1>`/`<h2>` puros, ajustar D2 e Grep alvo.

3. **Decisao DEC-03 (RF-03 G3 confirm escopo):** Confirmar que so o `window.confirm` de GrindSession.tsx:960 vai ser migrado neste sprint. Outros 6 (AdminUsers, Subscriptions, etc) ficam para sprints respectivos. Spec atual diz SIM (D3).

4. **Decisao DEC-04 (RF-08 G8 canon):** "Em breve" e a copy canon (vs "Em breve!", com exclamacao). Spec atual: substituir "Modulos sendo preparados - em breve!" por "Modulos em breve!" (mantem exclamacao). Confirmar tom.

5. **Decisao DEC-05 (atomicidade de commits):** Founder prefere 14 commits separados (1 por RF) ou agrupamentos por afinidade (4-6 commits)? Spec atual: implementer escolhe, desde que cada commit seja revertable. Se founder tiver preferencia, definir.

6. **Decisao DEC-06 (RF-06 SessionHistoryList CTA):** CTA proposto = `checkExistingSessionBeforePreparation` (que abre modal de preparacao). Confirmar que e o caminho correto para "registrar primeira sessao" — alternativa seria `setLocation('/grind/live')` direto.

---

## 15. Notas de Implementacao (opcional)

- **Ordem recomendada:** RF-09 + RF-10 + RF-13 + RF-14 + RF-11 (NITs Foundation primeiro — tocam Foundation em main, baixo risco) → RF-01 + RF-02 + RF-05 + RF-08 (limpezas visuais simples) → RF-04 (Bankroll fetch→apiRequest) → RF-03 (recovery dialog) → RF-06 (EmptyStates) → RF-07 (FilterChipGroup) → RF-12 (docs ui-patterns).
- **Por que NITs primeiro:** Foundation pos-NITs vira input estavel para RF-06 (EmptyState) e RF-07 (FilterChipGroup). Se ordem inversa, refactor visual e refeito quando NITs acertarem APIs.
- **Smoke automation:** Se implementer quiser adicionar 1 teste E2E "smoke" rapido (Playwright? Cypress?), fora de escopo deste sprint mas pode propor para Sprint UI-T1-* futuro.
- **PR description template:** Implementer documenta na descricao da PR:
  - Lista exata de paginas tocadas em RF-02.
  - Lista exata de chips criados em RF-07 com mapeamento tone.
  - Decisao sobre Dashboard em RF-07 (incluido ou adiado).
  - Quaisquer testes que precisaram adaptacao com motivo.
- **Pos-merge:** Atualizar memory file de sessao + atualizar `Docs/specs/ui-qw-1-quick-wins.md` status para "Concluida".
- **Foundation tests:** Confirmar que testes UI-FND-1 nao quebram com adicoes de RF-09 (tokens import), RF-11 (a11y region), RF-13 (console.debug). Se quebrarem, ajustar testes (escopo deste sprint, nao novo teste).

---

## 16. Definicao de Pronto (DoD)

- [ ] 14 RFs entregues conforme criterios de aceitacao individuais.
- [ ] 100% testes verdes (`npx vitest run`). Adaptacoes documentadas na PR.
- [ ] Type-check verde (`npm run check`).
- [ ] Smoke manual paginas Tier 1 OK (secao 10.1) — checklist completo.
- [ ] Reviewer DOUBLE-check aprovado (round 1 ou 2 conforme necessario).
- [ ] Zero novo dep em `package.json`.
- [ ] Commits atomicos (cada RF revertable isoladamente).
- [ ] Founder QA visual antes de merge para main.
- [ ] CLAUDE.md secao 12 atualizada (RF-14).
- [ ] `ui-patterns.md` atualizado com nota de validacao secondaryLink (RF-12).
- [ ] `studies/EmptyState.tsx` com tag @deprecated (RF-10).

---

**Fim da spec UI-QW-1.**
