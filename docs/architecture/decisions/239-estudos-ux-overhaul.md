# 239. Overhaul de UX/UI do modulo de Estudos

Data: 2026-06-02
Status: Accepted

## Contexto

Queixa do founder: o modulo de Estudos tinha "muita informacao atrapalhando" e
"paginas nao modernas". Auditoria UX (strategist) revelou:

- **Dois bug-fixes funcionais** acoplados ao fluxo de registro de estudo:
  1. Botao "Iniciar sessao de estudo" no tema retornava **400** — `date` chegava
     como ISO string via JSON, mas a coluna `timestamp` do drizzle faz
     `value.toISOString()` no insert (quebra em string); o zod rejeitava e o
     fallback do handler passava a string crua.
  2. Sessoes registradas pelo form unificado (`study_sessions_v2`) eram
     **invisiveis**: `SessaoDetailPage` so renderizava jogadas de stat_analysis
     (escondia notas/modo/duracao), e `SessionsView` listava so a tabela legacy
     `study_sessions`.
- **Divida de UI generalizada:** ~430 ocorrencias de cor raw (`bg-gray-*`,
  `text-white`, `bg-[#hex]`) + camada legada `poker-*` (3a fonte de verdade);
  sprawl vertical (ThemeDetailView empilhava 8 secoes); forms sem header/
  agrupamento; um modal custom (`fixed inset-0`) em vez de `<Dialog>`.

## Decisao

### Fluxo de registro (bug-fixes)
- Coercao de `date` string→Date na boundary do `storage.createStudySession`.
- Botao do tema repontado para o **form unificado** (`/estudos/registrar?themeId=`),
  removendo a criacao da sessao legacy minima.
- `SessaoDetailPage` reescrita para renderizar a sessao v2 inteira (modo, data,
  duracao, **notas**, jogadas+prints, spots dificeis, drill, insights, voltar).
- Nova rota `GET /api/study-sessions/registered/list` (sub-path 2-seg dedicado,
  nao shadowada pelo `:id` legacy) + `SessionsView` migrada para `study_sessions_v2`
  (todos os modos), navegando para `/estudos/analise/:id`.

### Modernizacao UX/UI (3 ondas)
- **Onda 1 (cosmetico):** token swap raw→semantico em ~21 componentes;
  PageHeader no Dashboard; gaps de leitura.
- **Onda 2 (densidade):** `ThemeDetailView` → identidade enxuta + `<Tabs>`
  (Analises/MDA/Spots/Aulas, `forceMount` preserva ErrorBoundary+testids);
  `StudySessionForm`/`MdaReadForm` → PageHeader + secoes em cards.
- **Onda 3 (modal):** `StatsSnapshotEditorV2` modal custom → `<Dialog>` shadcn +
  chevrons lucide.
- **Migracao `poker-*`** (~120 subs em 33 arquivos): em DARK os valores CSS sao
  identicos (`poker-bg≡background`, `poker-surface≡card`, `poker-accent≡primary`),
  entao o swap e visualmente neutro e corrige classes `poker-card/border/muted/fg`
  que nem geravam CSS.

5 regras de ouro do modulo formalizadas em `Docs/conventions/ui-patterns.md` §16.

## Consequencias

**Positivas:** registro de estudo funcional e visivel ponta-a-ponta; densidade
reduzida via Tabs; UI consistente com os tokens canonicos; reviewer tem regra
explicita para barrar drift.

**Trade-offs / pendencias:**
- `<select>` nativo mantido em StudySessionForm (testes usam `selectOptions`;
  Radix Select quebraria — lesson #27).
- `text-black` preservado nos CTAs verdes (preserva look exato; minoria de
  inconsistencia tolerada).
- Migracao `poker-*` ficou escopada ao modulo Estudos; `App.tsx`/outros modulos
  ainda usam `poker-*` (fora de escopo).
- Sem migration de banco. A rota backend nova reusa `getStudySessionsV2`.

## Verificacao

tsc 0; 798/798 testes dos modulos de Estudos verdes (63 arquivos). Zero `poker-*`
residual em `client/src/components/studies` (exceto `poker-green`/`poker-gold`,
cores distintas nao usadas no escopo).
