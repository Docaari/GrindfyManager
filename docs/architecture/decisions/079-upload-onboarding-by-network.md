# ADR-079 — Upload Onboarding por Rede de Poker (tabs + tutoriais textuais + sample CSVs estaticos)

- Status: Aceito
- Data: 2026-05-02
- Sprint: UI-T1-Upload (Fase 2 do plano UX 2026-05-02)
- Decision owner: system-architect (formaliza decisoes founder DP-1..DP-8 da spec UI-T1-Upload)
- Related: ADR-078 (Foundation tokens + componentes canonicos), spec `Docs/specs/ui-t1-upload.md`
- Audit base: `Docs/ux-audit-2026-05-02/audit-tier1-library-upload.md` (achados U1, U3..U8, U11)
- Plano: `Docs/ux-audit-2026-05-02/implementation-plan.md` (Sprint UI-T1-Upload)

---

## 1. Contexto

### 1.1. Problema concreto

`UploadHistory.tsx` (605 linhas) eh a **primeira pagina P0** que o usuario novo encontra apos cadastro. O audit U1 (severidade ALTA) identificou:

- Drop-zone generico sem tutorial — usuario nao sabe **qual rede aceita** (10 redes suportadas no parser: WPN, GGNetwork, PokerStars, PartyPoker, 888poker, Bodog, CoinPoker, Chico, Revolution, iPoker), nem **como exportar** o CSV de cada uma, nem consegue **testar o sistema sem dados reais**.
- Resultado real esperado: **abandono na pagina de entrada** = usuario novo signup nao consegue usar o app.
- Component `GranularDataCleanup` (linhas 376-605, acao destrutiva irreversivel) acoplada na MESMA pagina do fluxo de import — risco de erro humano + blast radius confuso para iniciante (achado U4).

### 1.2. Por que esta decisao precisa de ADR

- **Estabelece padrao de "onboarding por rede"** que outras paginas multi-network do app (Bankroll wallets, Tournament Selector) podem reutilizar no futuro.
- **Fixa contrato de assets**: onde sample CSVs vivem, como sao servidos, como adicionar novos, qual fixture sourcing pattern.
- **Resolve DP-1..DP-8** com decisoes concretas para Test-Writer e Implementer nao reabrirem.
- **Documenta movimento de feature destrutiva** (`GranularDataCleanup` — Upload → Settings) — decisao de IA com impacto em rota e DOM permanente, deve ser auditavel.
- **Resolve gap de schema** (`upload.site` nao existe) com plano de derivacao explicito ate Sprint dedicado adicionar coluna.

### 1.3. Decisoes founder ja consolidadas (DP-1..DP-8)

| ID | Pergunta | Decisao |
|---|---|---|
| DP-1 | Sample CSV format | Extrair de `tests/fixtures/` para 4 redes disponiveis (WPN, 888, GG, iPoker); criar minimal (3-5 torneios fake) para 6 restantes (PokerStars, PartyPoker, Bodog, CoinPoker, Chico, Revolution) |
| DP-2 | Screenshot fonte | MVP textual com slot reservado em `<figure aria-label="">`; sprint dedicada futura adiciona screenshots reais |
| DP-3 | Conteudo do tutorial | Implementer escreve drafts (1-2 frases por step); founder ajusta no PR |
| DP-4 | Copy delete | "Excluir N torneios" (verbo+objeto, padrao `ui-patterns.md`) |
| DP-5 | Filtros persistem em URL | NAO — useState local. URL state vira padrao global em sprint futuro |
| DP-6 | Link `/docs/parser` inerte | INCLUIR com `aria-disabled="true"` + tooltip "Em breve" (anchor preparada para futuro) |
| DP-7 | Settings scroll-to-anchor | `useEffect` com `window.location.hash === '#cleanup'` + `scrollIntoView({ behavior: 'smooth' })` (Wouter nao tem hash navigation nativa) |
| DP-8 | `upload.site` field existe? | **NAO existe no schema** — fallback "Desconhecido" para opcao de filter; documentar plano de derivacao |

**Verificacao DP-8 (executada por system-architect):**

`shared/schema.ts:747-758` mostra `upload_history` table com:

```ts
{
  id, userId, filename, status (success|error|processing),
  tournamentsCount, errorMessage, uploadDate,
  duplicatesFound, duplicateAction, createdAt
}
```

**Nao ha campo `site`.** Site so existe em `tournaments.site` (tabela diferente). Filter Site no RF-05 da spec NAO pode usar `upload.site` direto. Plano de derivacao documentado na secao 2.4.

---

## 2. Decisao

### 2.1. Estrutura de UI: `<NetworkImportGuide>` com tabs Radix

Acima do card `<AutoUpload>` na pagina `/upload`, novo componente `<NetworkImportGuide>` com **10 tabs horizontais** (uma por rede, ordem fixa: WPN, GGNetwork, PokerStars, PartyPoker, 888poker, Bodog, CoinPoker, Chico, Revolution, iPoker).

**Sub-componentes:**

- `client/src/components/upload/NetworkImportGuide.tsx` — container Radix `<Tabs>`, gerencia tab ativa + persistencia.
- `client/src/components/upload/NetworkTab.tsx` — wrapper de `<TabsTrigger>` + logo PNG da rede (de `attached_assets/`).
- `client/src/components/upload/NetworkGuideContent.tsx` — conteudo de uma tab (3 steps + sample download + link doc).
- `client/src/components/upload/NetworkSampleDownload.tsx` — botao "Baixar exemplo CSV" com `<a download>`.
- `client/src/components/upload/NetworkSteps.tsx` — lista de 3 steps numerados com slot futuro para screenshot.

**Layout:**
- Mobile: tabs scrollam horizontal (`overflow-x-auto` + snap).
- Desktop: pills lado-a-lado.
- Tab ativa: destaque via `tokens.color.action.bg` (Foundation, ADR-078).
- Conteudo lazy: Radix `<TabsContent>` controlled — apenas tab ativa renderiza (NFR perf).

### 2.2. Persistencia da tab ativa: localStorage

**Chave:** `grindfy.upload.activeNetworkTab` (namespace `grindfy.` + dominio + sufixo descritivo).

**Default na primeira visita:** `'wpn'` (rede mais comum no Brasil, alinhado com ADR-002 Neon serverless + base de usuarios).

**Fallback se localStorage falha** (incognito + storage disabled, valor corrompido, JSON parse error):
1. Try/catch em torno de `localStorage.getItem`.
2. Validar valor contra lista de `NETWORK_KEYS` (10 keys validas).
3. Se invalido ou ausente: `'wpn'` default.
4. Tab ativa funciona em memoria (useState) mesmo sem persistencia disponivel — nao quebra UX.

**Hooks-first (CLAUDE.md lesson #1):** `useEffect` que le localStorage roda APOS todos os hooks. NAO bloquear render inicial — primeiro frame mostra default WPN, depois sincroniza com storage se houver.

### 2.3. Sample CSVs: assets estaticos via Vite import

**Decisao:** servir como **assets estaticos co-localizados em `client/src/assets/samples/`**, importados via Vite (build-time bundling).

**Layout do diretorio:**

```
client/src/assets/samples/
├── wpn-sample.csv          (extraido de tests/fixtures/test_888_format.csv adaptado para WPN headers)
├── ggnetwork-sample.csv    (extraido de tests/fixtures/test_gg_simple.csv)
├── pokerstars-sample.csv   (criado minimal — 3 torneios fake)
├── partypoker-sample.csv   (criado minimal — 3 torneios fake)
├── 888poker-sample.csv     (extraido de tests/fixtures/test_888_format.csv)
├── bodog-sample.csv        (criado minimal — 3 torneios fake; nota: Bodog real eh XLSX, sample CSV e simplificado)
├── coinpoker-sample.csv    (criado minimal — 3 torneios fake)
├── chico-sample.csv        (criado minimal — 3 torneios fake)
├── revolution-sample.csv   (criado minimal — 3 torneios fake)
└── ipoker-sample.csv       (extraido de tests/fixtures/test_ipoker.csv)
```

**Mapeamento fixture → sample (DP-1):**

| Rede | Fixture origem | Estrategia |
|---|---|---|
| WPN | `tests/fixtures/test_888_format.csv` | **Adaptar** — substituir Network=WPN no header (parser aceita WPN puro ou Americas Cardroom) |
| GGNetwork | `tests/fixtures/test_gg_simple.csv` | Copiar |
| 888poker | `tests/fixtures/test_888_format.csv` | Copiar |
| iPoker | `tests/fixtures/test_ipoker.csv` | Copiar |
| PokerStars | NAO existe | **Criar minimal** — 3 torneios baseados em headers do parser (`server/csvParser.ts:786-809`) |
| PartyPoker | NAO existe | **Criar minimal** — 3 torneios baseados em headers do parser (`csvParser.ts:728`) |
| Bodog | NAO existe | **Criar minimal** — Bodog real eh XLSX (ver `parseBodogXLSX:233`); sample CSV simplificado |
| CoinPoker | NAO existe | **Criar minimal** — formato proprio (ver `parseCoinPokerCSV:404`) |
| Chico | NAO existe | **Criar minimal** — generic format com Network=Chico |
| Revolution | NAO existe | **Criar minimal** — generic format com Network=Revolution |

**Por que assets estaticos (rejeitada API endpoint dedicado):**

- **Zero overhead de rede** — embedded no bundle Vite.
- **Cache HTTP nativo** — browsers cacheiam por hash de build.
- **Versionavel no Git** — diff visivel quando founder ajusta sample.
- **Testavel via Vite mock** — `vi.mock('@/assets/samples/wpn-sample.csv')` simples.
- **Sem permissao server-side** — nao precisa de autenticacao/middleware.

**Implementer DEVE validar:** rodar cada sample no parser real (`PokerCSVParser.parseCSV`) antes de commit — se algum falhar, ajustar formato (risco "sample rejeitado" da spec).

### 2.4. Filter Site (RF-05) — fallback para schema sem coluna `site`

Como `upload_history` NAO tem coluna `site` (DP-8 verificado), opcoes consideradas:

| Opcao | Decisao |
|---|---|
| (A) Adicionar coluna `site` ao schema agora | **Rejeitado** — fora de escopo (spec explicita: zero schema change), gera migration desnecessaria, atrasa sprint |
| (B) Inferir site do filename (regex match) | **Rejeitado** — fragil (nomes variam: "wpn_export.csv" vs "americas-cardroom-jun.csv" vs "AC.csv"), gera "Desconhecido" demais |
| (C) Inferir site via JOIN com `tournaments.site` (1 query extra: distinct sites por uploadId) | **Rejeitado** — adiciona endpoint novo + acoplamento storage, fora de escopo |
| (D) **Filter degradado** — opcao "Site" no select mostra apenas "Todos" + "Desconhecido"; cada upload exibe badge "Desconhecido" | **ACEITO** |

**Plano de derivacao futuro (sprint dedicado, fora de UI-T1-Upload):**

- Adicionar `upload_history.detected_site VARCHAR` via migration.
- Backfill: rodar query `UPDATE upload_history SET detected_site = (SELECT site FROM tournaments WHERE upload_id = ... LIMIT 1)`.
- Parser preenche `detected_site` em uploads novos via metadado do `PokerCSVParser`.
- Filter Site vira full-funcional pos-backfill.

**Comportamento atual (Sprint UI-T1-Upload):**

- Select "Site" mostra: `Todos | Desconhecido` (2 opcoes).
- Cada `<UploadRow>` exibe badge "Desconhecido" no lugar de site.
- Filter funcional mas degradado — usuario nao perde funcionalidade critica.
- Test-Writer marca testes de filter Site como `it.todo` ou `it.skip` com TODO referenciando ADR-079.

### 2.5. Mover `GranularDataCleanup` Upload → Settings (RF-03)

**De:** `client/src/pages/UploadHistory.tsx` linhas 376-605 (definicao + uso)
**Para:** `client/src/components/settings/GranularDataCleanup.tsx`

**Integracao em `Settings.tsx`:**

- Adicionar nova section minima no fim de Settings.tsx (5-10 linhas JSX, **NAO refatorar shell de 1176 linhas** — fica para Sprint UI-REF-2).
- Section ganha:
  - `id="cleanup"` no DOM (anchor para `/settings#cleanup`).
  - Heading `<h2>Limpeza de Dados Avancada</h2>`.
  - `<GranularDataCleanup />` dentro de `<Card>` proprio.
- `useEffect` curto que checa hash:
  ```ts
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#cleanup') {
      // setTimeout aguarda mount para garantir scrollIntoView funcione
      setTimeout(() => {
        document.getElementById('cleanup')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, []);
  ```

**Recovery affordance em `UploadHistory.tsx`:**

- Rodape da pagina (apos lista de uploads) ganha link discreto:
  - `<Link to="/settings#cleanup">` (Wouter).
  - Texto: "Precisa limpar dados antigos? Acesse Settings > Limpeza de Dados".
  - Visual: `text-sm text-muted-foreground` (sem CTA destacado — power user feature, nao deve competir com import).
  - `data-testid="link-to-cleanup"`.
- **Nao** exibir toast "Movido para Settings > Avancado" — usuario que nao sabia da feature nao precisa de notificacao.
- Para usuarios que tinham bookmark da pagina /upload com section cleanup: o link de rodape eh suficiente como recovery affordance. Sem redirect 301 ou similar (acao reversivel — pode ser melhorada depois se metricas mostrarem confusao).

### 2.6. Decisoes pre-tomadas pelo founder (resolvendo DP-1..DP-8)

Resumo executivo (detalhe em secao 1.3 + plano em 2.x):

- **DP-1** (sample format): hibrido — extrair de fixtures (4 redes) + criar minimal (6 redes).
- **DP-2** (screenshots): MVP textual, slot reservado.
- **DP-3** (conteudo): drafts pelo implementer, ajuste no PR.
- **DP-4** (copy): "Excluir N torneios" interpolado.
- **DP-5** (URL state): NAO — useState local.
- **DP-6** (link inerte): INCLUIR com `aria-disabled` + tooltip.
- **DP-7** (scroll-to-anchor): useEffect + setTimeout(100).
- **DP-8** (`upload.site`): NAO existe — fallback "Desconhecido", plano de derivacao futuro.

---

## 3. Alternativas Consideradas

### 3.1. Wizard multi-step (vs tabs) — REJEITADO

**Pros:**
- Usuario novo tem caminho linear "obvio" (passo 1 → 2 → 3 → upload).
- Reduz paralisia de escolha (10 redes em tabs).

**Contras (decisivos):**
- **Power users odeiam wizard** — usuario que ja sabe qual rede usa nao quer 4 cliques para chegar no upload.
- **Re-entrada eh chata** — voltar ao wizard apos primeiro upload eh fricao.
- **Nao escala para multi-rede** — usuario que importa de 2-3 redes diferentes em sessao de bulk import precisa atravessar wizard 2-3 vezes.
- **Conflita com pattern Foundation** — `<PageHeader>` + cards eh layout horizontal, wizard quebra hierarquia.

**Decisao**: tabs sao mais flexiveis para iniciante (le tab WPN default) E power user (clica direto na sua rede).

### 3.2. Modal full-screen tutorial — REJEITADO

**Pros:**
- Foco total no tutorial (sem distracao do upload card).
- Pattern conhecido de SaaS (Stripe, Notion).

**Contras (decisivos):**
- **Perde contexto do upload card** — usuario tem que fechar modal para arrastar arquivo.
- **Modal fatigue** — usuario novo no app ja viu varios modais (welcome, terms, etc) — mais um modal cansa.
- **Reentry friction** — fechar e reabrir modal para conferir step 2 eh tedioso.
- **Mobile**: modal full-screen em portrait quebra UX (no espaco para drag-and-drop ao mesmo tempo).

**Decisao**: tabs inline acima do upload card mantem ambos visiveis simultaneamente — usuario le step e arrasta CSV sem trocar de tela.

### 3.3. API-served samples (`GET /api/upload-samples/:network`) — REJEITADO

**Pros:**
- Centraliza logica server-side (validacao, versionamento).
- Permite gerar sample dinamicamente (ex: incluir userId no filename).

**Contras (decisivos):**
- **Zero ganho real** — sample eh estatico, nao depende de userId.
- **Adiciona endpoint + middleware auth + rate limit** — mais codigo para mesma funcionalidade.
- **Latency** — round-trip HTTP por download vs servir do bundle.
- **Cache miss** — endpoint dinamico nao tem cache HTTP nativo trivial.
- **Testabilidade pior** — precisa mockar fetch vs vi.mock simples de import.

**Decisao**: assets estaticos via Vite import = simples, rapido, cacheavel, testavel.

### 3.4. Adicionar coluna `site` ao `upload_history` agora — REJEITADO (mas planejado para sprint futuro)

**Pros:**
- Filter Site funciona 100% imediatamente.
- Schema fica completo para futuras queries (ex: stats por site).

**Contras (decisivos):**
- **Fora de escopo** spec UI-T1-Upload — explicito "zero schema change".
- **Migration nova** + backfill historico (uploads existentes nao tem site).
- **Risco de regressao** — `upload_history` eh tabela usada por dashboard + analytics; mudar schema afeta queries.
- **Atrasa sprint** — implementer + reviewer + smoke test em backend + frontend cresce escopo ~30%.

**Decisao**: filter degradado por agora (opcao D na secao 2.4); coluna `detected_site` em sprint dedicado futuro.

### 3.5. Persistir tab ativa em URL (vs localStorage) — REJEITADO

**Pros:**
- Compartilhavel via link (`/upload?network=ggnetwork` abre tab GG direto).
- Back/forward browser funciona naturalmente.
- Alinhado com decisao Dashboard FP-11 (filtros em URL).

**Contras (decisivos):**
- **DP-5 founder ja decidiu**: filtros NAO persistem em URL nesta sprint. Tab ativa e logicamente um filtro — coerencia importa.
- **URL noise** — abre app, ve `/upload?network=wpn` na barra, parece tecnico/feio para iniciante.
- **Sem ganho real** para usuario que so importa da propria rede — localStorage cobre 95% dos casos.

**Decisao**: localStorage agora; URL state vira padrao global em sprint dedicado (UI-Patterns-V2 ou similar).

### 3.6. Mover GranularDataCleanup para rota propria `/cleanup` (vs Settings) — REJEITADO

**Pros:**
- Rota dedicada eh "encontravel" via menu lateral.
- Nao polui Settings (que ja tem 1176 linhas).

**Contras (decisivos):**
- **Cria rota nova** — adiciona nav item, sidebar entry, breadcrumb — escopo cresce.
- **Acao destrutiva merece estar em "lugar tecnico"** — Settings eh contexto natural para "configuracao avancada" (alinha com pattern de outros SaaS: Notion, Linear, GitHub).
- **Discoverability via menu lateral** — power users ja sabem que limpeza eh tecnica = procuram em Settings primeiro.

**Decisao**: Settings com section dedicada + anchor `#cleanup` para deeplink.

---

## 4. Consequencias

### 4.1. Positivas

- **Onboarding P0 resolvido.** Usuario novo abre `/upload` → ve tab WPN com 3 steps + sample CSV → consegue testar sistema sem dados reais → reduz abandono.
- **Padrao reusavel.** Pattern "tabs por rede + sample assets" pode ser adotado em Bankroll wallets (multi-currency) e Tournament Selector (multi-site filter).
- **Blast radius reduzido.** `GranularDataCleanup` (acao destrutiva) sai do fluxo de import — reduz risco de erro humano em pagina P0.
- **Foundation compliance.** Componente novo consome tokens (`tokens.color.action.bg` para tab ativa, `tokens.space` para gaps), `<EmptyState>` e `<FilterChipGroup>` — zero re-implementacao de design.
- **Type safety.** `NetworkKey = 'wpn' | 'ggnetwork' | ...` (10 literais) garante autocomplete + erro de build se alguem digita errado.
- **Lazy rendering.** Radix `<TabsContent>` controlled = apenas tab ativa renderiza — bundle adicional <15KB respeitado.
- **Anti-pattern IA endereçado.** Lesson #2 (`data-testid` em todas tabs e botoes), lesson #11 (sample download obrigatorio em cada tab — sem tab decorativa sem CTA).

### 4.2. Negativas / Trade-offs

- **6 sample CSVs criados manualmente** (PokerStars, PartyPoker, Bodog, CoinPoker, Chico, Revolution) — risco de formato errado se implementer nao validar contra parser real. **Mitigacao:** validacao obrigatoria via teste de integracao "cada sample passa em PokerCSVParser.parseCSV sem erro".
- **MVP textual sem screenshots** — esteticamente menos rico que tutorial com imagens. **Mitigacao:** founder QA decide se aceita; sprint dedicado adiciona screenshots depois.
- **Filter Site degradado** — opcao "Site" so mostra "Todos" + "Desconhecido" ate sprint adicionar coluna `detected_site`. **Mitigacao:** documentar plano de derivacao + Test-Writer marca testes de filter Site como `it.todo`.
- **Convivencia com legacy** — `GranularDataCleanup` ainda existe em `UploadHistory.tsx` durante PR (move-out) — risco de import duplo se merge sequencial errado. **Mitigacao:** RF-03 move ANTES de RF-05/RF-06 (ordem documentada na spec).
- **Bundle size +15KB** — 10 tabs + sub-componentes + tutorial content + 10 sample CSVs (cada ~1-3KB). NFR Foundation (<8KB) nao se aplica a sprint Tier 1 (NFR proprio: <30KB total para esta sprint).

### 4.3. Neutras / Operacionais

- **Zero novas dependencias.** Radix `<Tabs>` ja em uso (`@/components/ui/tabs`), Wouter `<Link>` ja em uso, Vite asset import nativo.
- **Zero impact em backend.** Sprint 100% frontend (consume endpoints existentes).
- **Zero schema change.** Tabela `upload_history` intocada.
- **Zero novos endpoints.** Conforme spec.
- **Tests existentes.** `UploadHistory` tem alguns tests integration ja — Test-Writer atualiza os que quebrarem (move de Cleanup, AlertDialog, etc.) e adiciona testes novos para `<NetworkImportGuide>`.

### 4.4. Impacto em sprints subsequentes

- **Sprint UI-REF-2 (Settings shell refactor).** Section `#cleanup` adicionada minimamente nesta sprint vira componente "natural" do shell refatorado depois. Anchor `#cleanup` deve ser preservado para nao quebrar deeplinks salvos.
- **Sprint UI-Patterns-V2 (futuro).** Decidira se URL state vira padrao global — entao tab ativa migra de localStorage para URL retroativamente. Helper `useNetworkTabState` pode abstrair fonte (localStorage hoje, URL amanha).
- **Sprint Schema-Upload-Site (futuro).** Adicionar coluna `detected_site` + backfill + popular em uploads novos via parser. Filter Site vira full-funcional sem mudar UI.
- **Sprint UI-T1-Upload-Screenshots (futuro).** Slots reservados em `<NetworkSteps>` ganham `<img>` com screenshots reais; sem refactor de logic.
- **Sprint Docs-Parser (futuro).** Implementar pagina `/docs/parser`; remover `aria-disabled` do link em cada tab.
- **Reviewer agent.** Ganha checklist novo: "Foundation tokens consumidos? Sample CSV existe e passa no parser? Tab default funciona em incognito (localStorage indisponivel)?".

### 4.5. Debt removida

- Drop-zone generico sem tutorial (achado U1 P0) → resolvido.
- `GranularDataCleanup` colado em pagina P0 (achado U4) → movido.
- Code morto `uploadResult` (achado U8) → removido.
- 13 chamadas `invalidateQueries` duplicadas (achado U11) → centralizadas em `invalidateAfterUpload(qc)` helper.

### 4.6. Debt nova introduzida

- **Filter Site degradado** documentado como TODO ate sprint Schema-Upload-Site.
- **Tutorial textual MVP** sem screenshots — sprint UI-T1-Upload-Screenshots agendado.
- **`/docs/parser` rota inerte** — sprint Docs-Parser agendado.
- **6 sample CSVs criados manualmente** — risco de divergencia se parser mudar; mitigacao via teste de integracao.

---

## 5. Confianca

**Alta.** Decisao baseada em:

- Audit empirico (achado U1 = severidade ALTA, classificado P0 critico).
- Verificacao concreta de schema (DP-8 confirmado: `upload.site` nao existe — plano de fallback explicito).
- Verificacao concreta de fixtures (4 disponiveis + 6 a criar — gap conhecido com plano).
- Foundation ja entregue (ADR-078) — componentes canonicos prontos para consumo.
- Decisoes founder DP-1..DP-8 ja consolidadas — Implementer/Test-Writer nao precisam reabrir.
- Escopo bem isolado (1 pagina P0 + Settings com adicao minima) — risco de regressao baixo.

**Pontos de atencao para reviewer validar pos-implementer:**

- Cada um dos 10 sample CSVs passa no `PokerCSVParser.parseCSV` sem erro (rodar manualmente ou via teste de integracao).
- Tab default funciona em incognito (localStorage indisponivel) — fallback `'wpn'` em useState inicial.
- `Settings.tsx` adicao minima (5-10 linhas JSX) — NAO refatorou shell.
- Anchor `#cleanup` scrolla corretamente em primeiro load (`useEffect` + `setTimeout(100)`).
- Recovery link em `/upload` rodape leva para `/settings#cleanup`.
- `GranularDataCleanup` funciona EXATAMENTE como antes em novo path.
- Filter Site exibe "Todos | Desconhecido" + cada upload ganha badge "Desconhecido" sem crashes.

---

## 6. Notas de Implementacao

**Ordem recomendada (alinha com spec):**

1. Criar 10 sample CSVs em `client/src/assets/samples/` + validar cada um no parser.
2. Implementar `<NetworkSteps>` + `<NetworkSampleDownload>` + `<NetworkGuideContent>` (componentes folha).
3. Implementar `<NetworkImportGuide>` (container com Radix Tabs + localStorage hook).
4. Mover `GranularDataCleanup` para `client/src/components/settings/GranularDataCleanup.tsx`.
5. Adicionar section `#cleanup` minima em `Settings.tsx` + useEffect scroll-to-anchor.
6. Substituir error global por error inline em UploadHistory (RF-02).
7. AlertDialog confirmacao delete (RF-04).
8. Filter bar + chips ativos com fallback "Desconhecido" (RF-05).
9. Sparkline + delta (RF-06).
10. Helper `invalidateAfterUpload` (RF-08) + remover `uploadResult` morto (RF-07).
11. Adicionar recovery link no rodape do UploadHistory.

**Diagrama:** `Docs/architecture/diagrams/upload-onboarding.mermaid` — hierarquia de componentes + fluxo do usuario novo.

**Test co-location (lesson #2):**

- `client/src/components/upload/__tests__/NetworkImportGuide.test.tsx`
- `client/src/components/upload/__tests__/NetworkGuideContent.test.tsx`
- `client/src/components/upload/__tests__/NetworkSampleDownload.test.tsx`
- `client/src/components/settings/__tests__/GranularDataCleanup.test.tsx` (smoke test pos-move)
- `client/src/lib/__tests__/upload-helpers.test.ts`
- `client/src/lib/__tests__/upload-stats.test.ts`
- `client/src/pages/__tests__/UploadHistory.test.tsx` (integration)

**data-testid obrigatorios (lesson #2):**

- `network-tab-{key}` (10 tabs: wpn, ggnetwork, pokerstars, partypoker, 888poker, bodog, coinpoker, chico, revolution, ipoker).
- `network-guide-{key}` (10 contents).
- `network-sample-download-{key}` (10 botoes).
- `network-doc-link-{key}` (10 links inertes para `/docs/parser`).
- `link-to-cleanup` (recovery affordance no rodape).
- `filter-status`, `filter-site`, `filter-filename`, `clear-filters`.
- `delete-upload-button-{id}`, `confirm-delete-upload-{id}`.
- `stat-card-{kind}`, `stat-sparkline-{kind}`, `stat-delta-{kind}`.
- `stats-card-error-{kind}`, `upload-list-error`.

**Founder QA obrigatoria** antes merge para main (pagina P0, regressao em onboarding = abandono real de novos signups).

---

**Fim do ADR-079.**
