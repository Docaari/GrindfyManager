# Trabalho em Multiplas Sessoes — Regras Operacionais

**Status:** ativo desde 2026-07-31.
**Para quem:** todo agente (Claude Code) trabalhando no Grindfy em uma das sessoes paralelas.
**Leia isto ANTES do primeiro comando de git.**

---

## 1. A situacao

O founder trabalha com **uma sessao por area do produto**, cada uma com seu proprio agente e
seu proprio contexto. Hoje estao ativas: Dashboard, Calculadoras, Torneios, Grade-Planner e
Grind-Live — **mas o numero cresce**. Novas sessoes serao abertas conforme a necessidade,
inclusive para areas que ainda nao existem no codigo. Este documento e escrito para valer em
qualquer uma delas: as regras (§2) nao dependem de qual area voce e.

Fatos que mudam como voce trabalha:

- **Todos escrevem na branch `main`, no MESMO diretorio `B:\grindfy`.** Nao ha branch por
  sessao, nao ha worktree.
- **O founder executa um comando de cada vez**, alternando entre as sessoes. Nao ha duas
  sessoes escrevendo no mesmo segundo — mas ha, sim, codigo de OUTRA sessao chegando na
  `main` entre um comando seu e o proximo.
- **A plataforma nao tem usuario ativo.** Quebrar algo custa pouco: o founder testa no
  navegador e a gente corrige. Isso favorece passos pequenos e frequentes, nao commits
  gigantes "perfeitos".
- **O founder nao programa.** Ele descreve o problema em linguagem de jogador de poker e
  valida olhando a tela. Explique em portugues claro e diga sempre o que ele deve testar.

O risco real dessa montagem ja aconteceu neste projeto (varias vezes, ver
`Docs/architecture/lessons-learned.md`): **um agente commitar arquivo de outro agente**.
As regras abaixo existem por causa disso.

---

## 2. As sete regras

### R1 — Sincronize antes de comecar

Primeiro comando de todo turno de trabalho:

```bash
git pull --ff-only origin main
```

Se falhar, PARE e avise o founder. Nao tente resolver com `rebase`, `reset` ou `force`.

### R2 — `git add` sempre EXPLICITO, arquivo por arquivo

```bash
# CERTO
git add client/src/pages/Dashboard.tsx client/src/components/dashboard/TabSite.tsx

# PROIBIDO — vai levar junto o trabalho de outra sessao
git add .
git add -A
git add -u
git commit -a
```

Antes de commitar, rode `git status --short` e confirme que **so os seus arquivos** estao
marcados. Se aparecer algo que voce nao editou, nao adicione — e mencione ao founder.

### R3 — Fique no seu escopo

Mexa nos arquivos da sua area (§4). Se a mudanca exigir tocar um **arquivo compartilhado**
(§5): faca a edicao **minima e aditiva** (adicionar linha, nao reescrever bloco vizinho),
e diga isso no resumo final para o founder.

Nunca refatore, formate ou "limpe" arquivo que nao e da sua area.

### R4 — Verifique antes de commitar

```bash
npm run check
```

Precisa dar **0 erros**. Depois rode os testes do seu escopo:

```bash
npx vitest run <caminho dos testes da sua area>
```

Se um teste ja estava quebrado antes de voce (pre-existente), diga isso explicitamente em
vez de tentar consertar codigo de outra area.

### R5 — Commit pequeno, push imediato

Um assunto por commit. Mensagem em portugues, dizendo o efeito para o jogador
(ex.: `fix(dashboard): ROI da aba Site passa a excluir torneios de sessao`).

Termine sempre com:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

E **pushe logo apos commitar** (`git push origin main`). Quanto mais tempo seu commit fica
so na maquina, maior a chance de divergir do que outra sessao ja empurrou.

### R6 — Comandos proibidos sem autorizacao explicita do founder

`git push --force` · `git reset --hard` · `git rebase` · `git stash` da arvore inteira ·
`git branch -D` · `git checkout <outra branch>` · `npm run db:push` contra producao ·
editar `package.json` (dependencias).

### R7 — Servidor de desenvolvimento e compartilhado

Roda em `localhost:3000` e serve **todas** as sessoes.

- Mudou arquivo em `client/` → o Vite recarrega sozinho, o founder ja ve na tela.
- Mudou arquivo em `server/` ou `shared/` → **precisa reiniciar**. Nao mate o processo por
  conta propria: peca ao founder ("reinicie o servidor para essa mudanca valer").

---

## 3. Banco de dados e migrations

- Migration nova = criar `migrations/NNNN_nome.sql` **e** `migrations/NNNN_nome_rollback.sql`.
- Aplicar **somente no banco local**. Producao (Neon) e sempre pendente — registre isso no
  resumo e no `CLAUDE.md` §6, como as outras migrations pendentes.
- Pegue o proximo numero livre com `ls migrations/ | tail -5` — outra sessao pode ter criado
  um numero desde a ultima vez que voce olhou.

---

## 4. Registro de areas — documento VIVO

> **Leia isto antes da tabela.** O registro abaixo e uma **conveniencia**, nao a definicao
> do sistema. Ele existe para poupar investigacao, nunca para limitar o que o produto pode
> ter. Area que nao esta na tabela **nao e area invalida** — e area ainda nao registrada.
>
> A regra de verdade e uma so: **cada sessao e dona de uma area do produto e responde por
> ela.** O que a area contem se **deriva** (§4.3), nao se consulta.
>
> Quem trabalha numa area ausente ou desatualizada **corrige a tabela no mesmo commit** —
> uma linha, edicao aditiva, como manda a R3. Registro desatualizado e falha de processo,
> nao motivo para parar.

### 4.1 Ativas

| Sessao | Rota | Frontend | Backend |
|---|---|---|---|
| **Dashboard** | `/dashboard` | `pages/Dashboard.tsx`, `components/dashboard/*`, `components/analytics-charts/*`, `components/ProfitChart.tsx`, `components/TournamentTable.tsx` | `routes/dashboard.ts`, `routes/analytics.ts`, `storage.getDashboardStats` |
| **Calculadora MTTs** | `/calculadoras` | `pages/Calculadoras.tsx`, `pages/CalculadoraPopup.tsx`, `components/calculators/*`, `lib/combo-calc/*`, `lib/calculatorTools.ts` | (nenhum — calculo e 100% no navegador) |
| **Torneios** | `/library` | `pages/TournamentLibraryNew.tsx`, `components/library/*`, `components/tournament-library/*` | `routes/tournament-library.ts`, `routes/grouping-views.ts`, `routes/adminWorkspaces.ts`, `services/libraryGrouping.ts`, `shared/library-grouping-dims.ts` |
| **Grade-Planner** | `/grade-planner`, `/coach` | `pages/GradePlanner.tsx`, `components/grade-planner/*`, `components/grade/*` | `routes/grade-planner.ts`, `routes/grade-day-detail.ts`, `routes/tournament-series.ts` |
| **Grind-Live** | `/grind-live`, `/grind` | `pages/GrindSessionLive.tsx`, `pages/GrindSession.tsx`, `components/grind-session-live/*`, `components/grind-session/*` | `routes/grind-sessions.ts`, `routes/reentry.ts`, `routes/tickets.ts` |
| **Import** | `/upload` | `pages/UploadHistory.tsx`, `components/upload/*`, `components/AutoUpload.tsx` | `routes/upload.ts`, `csvParser.ts`, `services/tournamentInsertMapper.ts`, `services/importReconciliation.ts`, `services/fx/*`, `shared/tournament-type-detector.ts` |

### 4.2 Pre-mapeadas (sessao ainda nao aberta)

| Area | Rota | Frontend | Backend |
|---|---|---|---|
| **Inicio** | `/`, `/home` | `pages/Home.tsx`, `components/home/*` | `routes/home.ts`, `routes/home-focus-stats.ts`, `routes/home-settings.ts`, `routes/home-coach-recommendation.ts` |
| **Metas** | `/metas` | `pages/metas/MetasPage.tsx`, `components/metas/*` | `routes/goals.ts`, `storage/goalsStorage.ts`, `storage/goalDailyLogsStorage.ts`, `coach/goals/*` |
| **Warm Up** | `/mental` | `pages/MentalPrep.tsx`, `components/mental-prep/*`, `components/warmup/*` | `routes/warmup-rituals.ts` |
| **Mental / Cooldown** | `/analise-mental` | `pages/AnaliseMental.tsx`, `components/cooldown/*` | `routes/cooldown.ts`, `routes/cooldownAnalytics.ts` |
| **Banca** | `/bankroll` | `pages/Bankroll.tsx`, `components/bankroll/*` | `routes/bankroll.ts`, `routes/wallets.ts`, `routes/variance.ts`, `services/walletService.ts` |
| **Estudos** | `/estudos` | `pages/Studies.tsx`, `components/studies/*`, `components/studies-v2/*`, `components/study-themes/*`, `components/spots/*` | `routes/studies.ts`, `routes/studies-v2.ts`, `routes/study-sessions.ts`, `routes/mda.ts`, `routes/themeLessonNotes.ts` |
| **Coach IA** | `/coach-ai` | `pages/CoachAI.tsx`, `components/coach-ai/*`, `components/coach/*` | `routes/coach.ts`, `routes/coachAi1a.ts`, `routes/coachAi1b.ts`, `routes/coachPlanning.ts`, `routes/coachWeeklyReview.ts`, `server/coach/*` |
| **Biblioteca (aulas)** | `/biblioteca` | `pages/biblioteca/BibliotecaPage.tsx`, `components/biblioteca/*`, `components/audio-player/*` | `routes/library.ts`, `routes/library-search.ts`, `routes/library-continue.ts`, `routes/premiumLibrary.ts` |
| **Selecao de torneios** | (dentro de `/coach`) | `components/tournament-selector/*` | `routes/tournament-selector.ts`, `server/scoring/*` |
| **Ajustes** | `/settings` | `pages/Settings.tsx`, `components/settings/*`, `components/profile/*` | `routes/misc.ts`, `routes/userActivity.ts`, `routes/fx.ts` |
| **Admin** | `/admin/*`, `/analytics` | `pages/AdminDashboard.tsx`, `pages/AdminUsers.tsx`, `pages/Analytics.tsx`, `components/admin/*` | `routes/admin.ts`, `routes/adminLibrary.ts`, `routes/adminFx.ts`, `routes/adminAudioMetrics.ts` |
| **Assinaturas** | `/subscriptions` | `pages/Subscriptions.tsx` | `routes/subscriptions.ts` |

### 4.3 Area que JA existe mas nao esta na tabela

Nao pergunte, derive. Quatro comandos resolvem qualquer area do produto:

```bash
# 1. rota -> componente de pagina
grep -n "<ROTA>" client/src/App.tsx

# 2. pasta de componentes da area (o nome costuma espelhar a pagina)
ls client/src/components/ | grep -i "<palavra-chave>"

# 3. quais endpoints a pagina consome
grep -on "/api/[a-z0-9/-]*" client/src/pages/<Pagina>.tsx | sort -u

# 4. qual modulo de rota atende esses endpoints
grep -rn "'<endpoint>'" server/routes/
```

O que sair disso **e** o seu escopo. Registre na tabela e siga o trabalho.

### 4.4 Area que ainda NAO existe em codigo (feature nova)

Este e o caso mais comum daqui pra frente: o founder abre uma sessao para algo que ainda
vai ser construido. Nao existe pagina, pasta nem rota para consultar.

Procedimento:

1. **Nomeie a area** e reserve o espaco seguindo a convencao ja existente do projeto:
   `client/src/pages/<Area>.tsx` (ou `pages/<area>/<Area>Page.tsx` quando tiver varias
   telas), `client/src/components/<area>/*`, `server/routes/<area>.ts`.
2. **Registre a linha na tabela §4.2 antes de escrever codigo.** Isso e o que impede duas
   sessoes de comecarem a mesma feature com nomes diferentes.
3. Rota nova no frontend entra em `client/src/App.tsx`; rota nova no backend entra em
   `server/routes/index.ts` — os dois sao arquivos compartilhados (§5): **uma linha,
   aditiva, e avise no resumo**. Atencao a ordem de registro no backend.
4. Feature de porte medio ou maior: use o pipeline de agentes do `CLAUDE.md` §11
   (`pm-spec` → `system-architect` → `test-writer` → `implementer` → `reviewer`).
5. Tabela nova no banco = migration + rollback, aplicada so no local (§3).

### 4.5 Quando duas areas nao podem virar sessoes simultaneas

Nao decore a lista — aplique o teste: **duas areas colidem quando escrevem na mesma tabela
do banco ou dependem do mesmo trecho de `storage.ts`.** Ler a mesma tabela e seguro; gravar
nao e.

Pares ja conhecidos que falham nesse teste:

- **Torneios** e **Import** — ambos mexem em `tournaments`, `storage.ts` e agrupamento.
- **Dashboard** e **Import** — o dashboard le exatamente o que o import grava.
- **Coach IA** e **Metas** / **Estudos** — o Coach le e escreve nas tabelas dessas duas.
- **Grind-Live** e **Warm Up** / **Mental** — mesma sessao de jogo, do aquecimento ao
  resfriamento.

Identificou um par novo que falha no teste? Acrescente aqui.

---

## 5. Arquivos compartilhados (zona de atencao)

Estes sao tocados por varias sessoes. Edicao **minima e aditiva**, e sempre avisar:

- `shared/schema.ts` — tabelas do banco
- `server/storage.ts` — camada de acesso a dados (arquivo enorme, muito disputado)
- `server/routes/index.ts` — registro de rotas (**a ordem importa**: rota de 1 segmento
  registrada depois de `/:id` nunca e alcancada)
- `client/src/App.tsx` — rotas do frontend
- `client/src/components/Sidebar.tsx` — menu lateral
- `client/src/index.css` e `client/src/lib/ui-tokens.ts` — estilo global
- `CLAUDE.md` — memoria do projeto

---

## 6. Regras de produto que ninguem pode quebrar

- **Historico vs sessao** (`CLAUDE.md` §6.1): toda metrica de dashboard/analytics/biblioteca
  filtra `grind_session_id IS NULL`. `session_tournaments` so aparece dentro do detalhe da
  sessao de grind.
- **Moeda**: converter para USD antes de comparar valores. Nunca somar moedas diferentes.
- **Idioma**: codigo e nomes em ingles; interface e mensagens ao jogador em portugues.
- **Hooks primeiro** (licao #1): nenhum `return` antes de todos os `useState`/`useQuery`.
- **`data-testid`** (licao #2): teste procura por testid estavel, nao por texto na tela.
- Padroes visuais: `Docs/conventions/ui-patterns.md`.

---

## 7. Como terminar todo turno

Fecha com um resumo curto para o founder contendo:

1. O que mudou, em linguagem de jogador (nao "refatorei o reducer").
2. **O que ele deve testar no navegador**, passo a passo, com a URL.
3. Se precisa reiniciar o servidor.
4. Se tocou arquivo compartilhado ou criou migration pendente.

---

## 8. A sessao gestora

Existe **uma sessao gestora** (sem area de produto propria). Ela nao disputa arquivo com
ninguem porque nao implementa feature. Papel:

- manter este documento e o registro de areas (§4) atualizados;
- preparar o ambiente e gerar o prompt de cada sessao nova;
- decidir quando duas areas colidem (§4.5) e em que ordem elas rodam;
- resolver o que for de repositorio e nao de area: divergencia com o `origin`, conflito de
  merge, `.gitignore`, migrations pendentes, arvore suja herdada;
- registrar decisoes de processo que valem para todas as sessoes.

Se algo cruza duas areas ou nao pertence a nenhuma, e da gestora. Agente de area que topar
com isso: **nao resolva sozinho** — descreva ao founder e siga no seu escopo.

---

## 9. Prompt-padrao para abrir uma sessao

### 9.1 Area que ja existe

Copie o bloco abaixo, trocando `<AREA>` e `<ROTA>`:

```
Voce e o agente responsavel pela area <AREA> do Grindfy (rota <ROTA>).

Contexto: tenho varias sessoes abertas, uma por area do produto, todas
escrevendo direto na branch main e no mesmo diretorio B:\grindfy. Executo
um comando de cada vez, nunca duas sessoes ao mesmo tempo. Existe tambem
uma sessao gestora que cuida do repositorio e coordena as demais — o que
for de git, conflito ou decisao que cruza areas, e com ela. A plataforma
nao tem usuario ativo: eu testo no navegador e a gente corrige. Nao sou
programador, fale em portugues claro e sempre me diga o que testar.

Antes de qualquer coisa, leia Docs/conventions/multi-sessao-agentes.md e
siga as regras dele — principalmente a R2 (git add explicito, arquivo por
arquivo; nunca `git add .`), porque ja aconteceu de um agente commitar o
trabalho de outro.

Depois: rode `git pull --ff-only origin main`, estude os arquivos da sua
area (secao 4 do documento) e me avise quando estiver pronto, pedindo o
primeiro ajuste. Nao mude nada ainda.
```

### 9.2 Area nova, que ainda nao existe em codigo

Mesmo bloco, trocando o ultimo paragrafo por:

```
Essa area ainda nao existe no codigo. Siga a secao 4.4 do documento:
proponha o nome e o lugar dos arquivos, registre a area na tabela e so
depois comece. Me explique o plano antes de escrever codigo.
```
