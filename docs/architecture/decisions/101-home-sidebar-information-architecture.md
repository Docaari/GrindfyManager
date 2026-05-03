# ADR-101 — Sidebar Information Architecture: 5 grupos (HOJE / GRIND / ESTUDOS / FERRAMENTAS / ADMIN) com zero migration de URL

- Status: Proposto
- Data: 2026-05-03
- Sprint: home-reform-1 (Onda 1 da reforma da Home)
- Decision owner: system-architect (formaliza founder D19 da Spec home-reform-1)
- Related: ADR-099 (cockpit pattern), ADR-100 (news flag), ADR-102 (overview cache strategy)
- Spec: `Docs/specs/home-reform-1.md` §3 D19, §5.11 F10, RF-07

---

## 1. Contexto

### 1.1. Diagnostico

A sidebar atual (`B:\grindfy\client\src\components\Sidebar.tsx`) tem **4 grupos** que refletem a organizacao **historica** do produto, nao o **fluxo diario do pro player MTT**:

| Grupo atual | Items | Critica |
|---|---|---|
| **VISAO GERAL** | Home / Dashboard / Import / Torneios | Mistura "ponto de entrada" com "import" e "biblioteca de torneios". 4 conceitos diferentes em 1 grupo. |
| **GRIND** | Grade / Coach IA / Grind / Warm Up | Ordem nao reflete fluxo: pro player faz **Grade (planejamento) → Warm Up → Grind (live) → Coach IA (review pos-sessao)**, nao Grade → Coach IA → Grind → Warm Up. |
| **FERRAMENTAS** | Estudos / Biblioteca / Calculadoras / Banca / Flight | 5 items mistos — Estudos+Biblioteca sao **conteudo educativo**, Calculadoras+Banca sao **utilitarios**, Flight e **operacional**. Grupo virou caixote. |
| **ADMIN** | Analytics / Usuarios / Bugs | OK (admin-only). |

### 1.2. Forcas

- **Reflectir fluxo diario**: pro player abre o app multiplas vezes ao dia. Acordou as 11h → ve Home (Hoje). Pre-grind → Grade. Aquece → Warm Up. Grinda → Grind. Pos-sessao → Coach IA. Estuda hand history → Estudos. Estuda curso → Biblioteca. Trata banca → Banca. Calcula odds → Calculadoras. Multi-flight → Flight.
- **Zero migration de URL**: D19 e explicito. Toda URL atual (`/`, `/dashboard`, `/upload`, `/library`, `/coach`, `/coach-ai`, `/grind`, `/mental`, `/flight`, `/estudos`, `/biblioteca`, `/calculadoras`, `/bankroll`, `/analytics`, `/admin/users`, `/admin/bugs`) **deve** continuar funcionando. Sidebar so muda labels e grupamento, nunca path.
- **Muscle memory**: power user que aprendeu "VISAO GERAL → primeira opcao = Home" continua tendo o item mais alto na sidebar (so renomeado para "Hoje"). Risco R3 §15 da spec mitigado.
- **Nova identidade da Home**: ADR-099 estabelece Home como "Operations Cockpit Pessoal". Renomear "Home" → **"Hoje"** alinha label com proposito (cockpit do **agora**).
- **Studies-Reform e Biblioteca shipados em 2026-04+**: ambos sao conteudo educativo de natureza diferente. Estudos = hand history personal. Biblioteca = cursos, aulas, articles. Merece grupo proprio "ESTUDOS" — separado de "FERRAMENTAS" (utilitarios genericos).
- **Flight (Sprint Flight-1, 2026-05-03)**: feature operacional ativa em sessao multi-flight. Hoje esta em FERRAMENTAS, mas e parte do fluxo de **GRIND** (player que baggou ontem precisa ver "Day 2 do XYZ comeca em 1h" — fluxo operacional, nao utilitario).

### 1.3. Pre-existentes nao tocados

- **Footer**: trial badge + Settings + Logout — D19 explicito ("inalterado").
- **Badges**: pendingSpots em Estudos (logica linhas 240-244) + "Novo" em Biblioteca (linhas 250-258) — D19 explicito ("preservados").
- **Sub-componentes**: `renderSubscriptionBadge`, `getSubscriptionStatus`, `getTrialDaysRemaining`, `isSuperAdmin` — preservados.
- **Collapse toggle** (chevron, `isCollapsed` state) — preservado.

---

## 2. Decisao

Refator de `Sidebar.tsx` aplicando D19. **Zero migracao de URL**, apenas labels e grupamento. 5 grupos novos (4 visiveis + ADMIN admin-only).

### 2.1. Estrutura final (5 grupos)

| # | Grupo | Items (label · path · icone existente) | Justificativa |
|---|---|---|---|
| 1 | **HOJE** (era "VISAO GERAL") | Hoje · `/` · `User` (era "Home")<br>Dashboard · `/dashboard` · `BarChart3`<br>Import · `/upload` · `Upload`<br>Torneios · `/library` · `BookOpen` | Cockpit do agora + entradas de dados (import, library de torneios scrapeados). Renomear "Home" → "Hoje" alinha com ADR-099. |
| 2 | **GRIND** | Grade · `/coach` · `Calendar`<br>Grind · `/grind` · `Gamepad2`<br>Warm Up · `/mental` · `Brain`<br>Coach IA · `/coach-ai` · `MessageSquare`<br>Flight · `/flight` · `Layers` | Ordem reflete fluxo diario: planeja (Grade) → joga live (Grind) → aquece pre-sessao (Warm Up) → revisa pos-sessao (Coach IA) → multi-flight ativo (Flight). Flight movido de FERRAMENTAS. |
| 3 | **ESTUDOS** (NOVO) | Estudos · `/estudos` · `BookOpen`<br>Biblioteca · `/biblioteca` · `GraduationCap` | Conteudo educativo proprio. Estudos = hand history personal. Biblioteca = cursos. Movidos de FERRAMENTAS. |
| 4 | **FERRAMENTAS** | Calculadoras · `/calculadoras` · `Wrench`<br>Banca · `/bankroll` · `Wallet` | Utilitarios genericos. Estudos+Biblioteca movidos out (ESTUDOS proprio). Flight movido out (GRIND). |
| 5 | **ADMIN** (admin-only — `isAdmin` filter) | Analytics · `/analytics` · `TrendingUp`<br>Usuarios · `/admin/users` · `Users`<br>Bugs · `/admin/bugs` · `Bug` | Inalterado. |

### 2.2. Mudancas exatas em `Sidebar.tsx`

Lista vinculante para implementer. PR isolado pode validar 1-1.

1. **Renomear grupo "VISAO GERAL" → "HOJE"** (linha 69 da `Sidebar.tsx` atual).
2. **Renomear item `path: '/'` label "Home" → "Hoje"** (linha 71).
3. **Reordenar GRIND**: nova ordem `Grade / Grind / Warm Up / Coach IA / Flight` (linhas 80-87 + Flight movido de linha 98).
4. **Criar grupo "ESTUDOS"** entre "GRIND" e "FERRAMENTAS" contendo `Estudos` (movido de linha 91) + `Biblioteca` (movida de linha 94). Manter labels e badges existentes.
5. **FERRAMENTAS reduzido** para `Calculadoras` (linha 95) + `Banca` (linha 96). Estudos, Biblioteca, Flight movidos out.
6. **ADMIN inalterado** (linhas 102-108).
7. **Footer inalterado** (trial badge + Settings + Logout).
8. **Badges preservados**: pendingSpots (linhas 240-244 atuais) e "Novo" Biblioteca (linhas 250-258 atuais) referenciam itens cuja rota nao muda — apenas o grupo onde aparecem muda. Badge logica continua linkada ao path.
9. **Header da sidebar** consome `<HeaderLogo variant='mark' />` (RF-06) substituindo `<img src={logoImage}>` direto (linhas 170-173 e 181-185 atuais). Sem mudanca visual em Onda 1 (asset = atual).

### 2.3. Zero migration

**URLs preservadas (15):** `/`, `/dashboard`, `/upload`, `/library`, `/coach`, `/coach-ai`, `/grind`, `/mental`, `/flight`, `/estudos`, `/biblioteca`, `/calculadoras`, `/bankroll`, `/analytics`, `/admin/users`, `/admin/bugs`. Nenhuma alterada.

**Schema:** zero CREATE TABLE, zero migration, zero alteracao.

**Bookmarks:** todos continuam funcionando.

**Deep links externos** (compartilhamento Discord etc.): todos continuam funcionando.

**E2E tests**: tests que usam copy literal `"Home"` em `findByText` ou `getByRole('link', { name: 'Home' })` precisam atualizar para `"Hoje"`. Nao ha tests existentes que dependam do texto exato "VISAO GERAL" ou "FERRAMENTAS" em assertions (verificado via grep). Test-writer Sprint home-reform-1 atualiza esses casos.

### 2.4. Arquivos tocados/criados (binding contract)

- `B:\grindfy\client\src\components\Sidebar.tsx` — refactor in-place (estrutura `menuSections` linhas 67-109).
- `B:\grindfy\client\src\components\branding\HeaderLogo.tsx` — NOVO (RF-06), consumido por Sidebar header.
- Tests existentes que dependem da copy "Home" — atualizar para "Hoje" (search-and-replace cuidadoso, manter rota `/` igual).

---

## 3. Opcoes Consideradas

### Opcao A — Manter sidebar atual e nao mexer

**Pros:**
- Zero risco de quebra em e2e tests.
- Zero curva de aprendizado.

**Contras:**
- Diagnostico §1.1 nao resolvido — sidebar continua nao reflectindo fluxo diario.
- Disonancia com ADR-099 (Home renomeada conceitualmente para "cockpit") — usuario abre "Home" mas pagina e cockpit; label desatualizado.
- "ESTUDOS+Biblioteca" continuam misturados com Calculadoras+Banca em FERRAMENTAS (caixote).

### Opcao B — Refactor IA com 5 grupos + zero migration de URL (ESCOLHIDA)

**Pros:**
- Reflete fluxo diario do pro player MTT.
- Renomear "Home" → "Hoje" alinha com ADR-099.
- ESTUDOS proprio separa conteudo educativo de utilitarios.
- Flight em GRIND (operacional) faz sentido semantico.
- Zero migration de URL → zero risco de bookmarks quebrados.
- Muscle memory minimamente preservado (item `/` continua mais alto, mesma sidebar visual).

**Contras:**
- 5 grupos > 4 grupos = leve aumento de scroll vertical na sidebar (mitigado: ADMIN ja e admin-only).
- E2E tests com `"Home"` literal precisam atualizar (~3-5 ocorrencias estimadas).
- Reviewer precisa garantir badges (pendingSpots, "Novo" Biblioteca) continuam visualmente posicionados corretos pos-refactor.

### Opcao C — Refactor mais agressivo: renomear URLs tambem (`/` → `/hoje`, `/coach` → `/grade`)

**Pros:**
- URL semanticamente alinhada com label.

**Contras:**
- Quebra todos os bookmarks.
- Quebra todos os deep links compartilhados em Discord.
- Quebra todos os tests existentes (~50+ ocorrencias estimadas).
- Founder D19 explicito: zero migration de URL.

---

## 4. Consequencias

### 4.1. Positivas

- **Sidebar reflete fluxo diario** — power player encontra features na ordem em que usa.
- **Renomeacao "Home" → "Hoje"** alinha com ADR-099 (cockpit do agora).
- **ESTUDOS grupo proprio** separa conteudo educativo de utilitarios — escala bem para futuras features de educacao.
- **Flight em GRIND** semanticamente correto (operacional pre-grind).
- **Zero migration** — bookmarks, deep links e e2e tests com path literal preservados.

### 4.2. Negativas

- **3-5 e2e tests** precisam atualizar copy literal `"Home"` → `"Hoje"`.
- **5 grupos > 4 grupos** = leve aumento de scroll na sidebar quando user esta em viewport curto (mitigado: ADMIN admin-only; user comum ve 4 grupos visiveis).
- **Aprendizado breve** para power user reaprender que "Estudos" agora e grupo proprio (mitigado: a 1a vez que ele clica, internaliza).

### 4.3. Neutras

- **Sub-componentes preservados**: `renderSubscriptionBadge`, `getSubscriptionStatus`, badges, collapse toggle — zero mudanca.
- **Footer preservado**: trial badge + Settings + Logout — zero mudanca.
- **Tokens UI**: refactor consome `@/lib/ui-tokens` (RNF-06) — Sidebar migra para tokens como parte do escopo F10. Outras paginas migram em sprints proprias.

---

## 5. Confianca

**Alta.** Decisao alinhada com D19 (founder explicito). Risco R3 (muscle memory) mitigado por preservar item `/` no topo + sidebar visualmente estavel + zero migration de URL. Refactor escope-limitado (1 arquivo principal `Sidebar.tsx` + 1 novo componente `HeaderLogo.tsx`).

---

## 6. Notas de Implementacao

- Reviewer checklist obrigatorio:
  - [ ] 5 grupos na ordem D19.
  - [ ] Item `/` no topo, label "Hoje".
  - [ ] GRIND ordem: Grade → Grind → Warm Up → Coach IA → Flight.
  - [ ] ESTUDOS grupo proprio entre GRIND e FERRAMENTAS.
  - [ ] FERRAMENTAS reduzido para Calculadoras + Banca.
  - [ ] ADMIN inalterado (Analytics, Usuarios, Bugs).
  - [ ] Badges pendingSpots e "Novo" Biblioteca continuam funcionando.
  - [ ] Footer inalterado (trial badge + Settings + Logout).
  - [ ] Header consome `<HeaderLogo variant='mark' />` ao inves de `<img src={logoImage}>` direto.
  - [ ] Zero `bg-gray-9`, `text-emerald-`, `bg-slate-8` hardcoded no diff.
- Test-writer Sprint home-reform-1 cobre: snapshot ou DOM-query confirmando 5 grupos na ordem; teste de "Hoje" como label do path `/`; teste smoke que cada item navega para a URL esperada.
- E2E tests existentes com `"Home"` literal: search-and-replace para `"Hoje"` (Test-writer responsavel por mapear quais).
