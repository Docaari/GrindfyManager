# Trabalho em Multiplas Sessoes — Regras Operacionais

**Status:** ativo desde 2026-07-31.
**Para quem:** todo agente (Claude Code) trabalhando no Grindfy em uma das sessoes paralelas.
**Leia isto ANTES do primeiro comando de git.**

---

## 1. A situacao

O founder abriu **uma sessao por area do produto** (Dashboard, Calculadoras, Torneios,
Grade-Planner, Grind-Live). Cada sessao tem um agente diferente, com seu proprio contexto.

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

## 4. Mapa de escopo por sessao

| Sessao | Rota | Frontend | Backend |
|---|---|---|---|
| **Dashboard** | `/dashboard` | `pages/Dashboard.tsx`, `components/dashboard/*`, `components/analytics-charts/*`, `components/ProfitChart.tsx`, `components/TournamentTable.tsx` | `routes/dashboard.ts`, `routes/analytics.ts`, `storage.getDashboardStats` |
| **Calculadora MTTs** | `/calculadoras` | `pages/Calculadoras.tsx`, `pages/CalculadoraPopup.tsx`, `components/calculators/*`, `lib/combo-calc/*`, `lib/calculatorTools.ts` | (nenhum — calculo e 100% no navegador) |
| **Torneios** | `/library` | `pages/TournamentLibraryNew.tsx`, `components/library/*` | `routes/tournament-library.ts`, `routes/grouping-views.ts`, `routes/adminWorkspaces.ts`, `services/libraryGrouping.ts`, `shared/library-grouping-dims.ts` |
| **Grade-Planner** | `/grade-planner`, `/coach` | `pages/GradePlanner.tsx`, `components/grade-planner/*`, `components/grade/*` | `routes/grade-planner.ts`, `routes/grade-day-detail.ts`, `routes/tournament-series.ts` |
| **Grind-Live** | `/grind-live`, `/grind` | `pages/GrindSessionLive.tsx`, `pages/GrindSession.tsx`, `components/grind-session-live/*` | `routes/grind-sessions.ts`, `routes/reentry.ts`, `routes/tickets.ts` |

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
