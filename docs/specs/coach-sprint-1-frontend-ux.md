# Spec: Coach Sprint 1 — Frontend UX (Fases UX-1A, UX-1B, UX-1C)

## Status
Proposta

## Resumo
Entrega end-to-end da camada UX das features backend do Sprint Coach-1 (prompt caching, upgrade de modelos, feedback thumbs up/down, citations, confidence tags, rate limit tiered e gate por plano). Sem esta spec, o deploy do backend degrada visualmente a experiencia do usuario (tags cruas no markdown, erros 403/429 sem CTA, lock das tabs invisivel, sem monetizacao visivel do tiered). A spec entrega 3 fases em sequencia: **UX-1A** (bloqueante de deploy), **UX-1B** (destrava receita do plano Pro/Premium) e **UX-1C** (polimento + admin analytics — opcional).

## Contexto
O backend do Coach Sprint 1 (`docs/specs/coach-sprint-1-fundacao-economica.md`) ja esta implementado e approved:
- Prompt caching + upgrade de modelos (Haiku/Sonnet por coach).
- LLM instruido a emitir `[confianca: alta, N=X]`, `[nao sei: motivo]` e `[Fonte: origem, N=X, janela: Y]`.
- Rate limit por plano (Free 10/dia, Pro 50/dia, Premium 200/dia) com respostas 429 `{limit, resetAt, upgradeTo, currentPlan}`.
- Gate por coachType × plano com 403 `{currentPlan, upgradeTo, feature}`.
- Endpoints prontos: `POST/DELETE /api/coach/messages/:id/feedback`, `GET /api/coach/limits`.

O frontend atual (`client/src/pages/CoachAI.tsx`) renderiza `content` direto com `ReactMarkdown`, tratando tags como texto cru. Erros aparecem como string vermelha sem CTA. Nao ha contador de mensagens, lock visual das tabs, thumbs up/down, nem admin dashboard de custo.

Auditoria UX do **strategist** (2026-04-24) priorizou:
1. **UX-1A** — nao quebrar ao deployar backend (bloqueante).
2. **UX-1B** — monetizar o tiered backend (destrava receita).
3. **UX-1C** — admin analytics + polimento (backlog, opcional).

## Usuarios
- **Jogador Free:** usa Mental coach. Tem 10 msgs/dia. Precisa entender quando atinge limite, por que nao pode acessar Tournament/Technical, e qual o caminho de upgrade.
- **Jogador Pro:** usa Mental + Tournament. Tem 50 msgs/dia. Precisa ver contador, ser avisado quando restam poucas msgs, e saber que Technical exige Premium.
- **Jogador Premium:** uso ilimitado (200/dia como soft cap). Nao ve paywall.
- **Admin:** precisa de visibilidade sobre custo real do LLM, cache hit rate e feedback dos usuarios para calibrar prompts e definir precos.

---

## Requisitos Funcionais

### Fase UX-1A — BLOQUEANTE

Sem esta fase, o deploy do backend causa regressao visual severa (tags cruas, erros sem CTA).

#### RF-01: Render inline de ConfidenceBadge e UnknownBadge
**Descricao:** Mensagens do assistant devem renderizar as tags `[confianca: alta, N=145]` e `[nao sei: motivo]` como badges visuais inline, no lugar exato onde a tag aparece no texto. Tags malformadas ou parciais (durante streaming) devem continuar como texto literal ate virarem validas.

**Regras de negocio:**
- Parser existente em `client/src/lib/coachMessageParser.ts` ja expoe `parseConfidenceTags(text): CoachNode[]` retornando nodes `{kind:'text'}|{kind:'badge'}` na ordem do texto original. **Reusar sem reescrever.**
- Criar `client/src/components/coach/CoachMessageContent.tsx` que:
  - Recebe `content: string`.
  - Chama `parseConfidenceTags(content)`.
  - Para cada `node.kind === 'text'`, renderiza um `<ReactMarkdown remarkPlugins={[remarkGfm]}>`.
  - Para cada `node.kind === 'badge'`, renderiza `<ConfidenceBadge>` ou `<UnknownBadge>` conforme `badge.type`.
  - Preserva classes `prose prose-invert prose-sm ...` que ja existem em `CoachAI.tsx:56`.
- `MessageBubble` e `StreamingBubble` em `CoachAI.tsx` passam a usar `<CoachMessageContent content={...}>` ao inves de `<ReactMarkdown>` direto.
- Streaming parcial: se o texto terminar em `[confianca: al` (tag cortada), o parser ja trata como texto literal (nao quebra). Nao re-renderizar agressivamente — deixar fluir ate tag fechar.

**Criterio de aceitacao:**
- [ ] Mensagem com `[confianca: alta, N=145]` renderiza badge verde "Alta N=145" no lugar da tag, texto ao redor preservado.
- [ ] Mensagem com `[nao sei: sem dados suficientes]` renderiza badge cinza com icone de info.
- [ ] Multiplas tags na mesma mensagem sao renderizadas nas posicoes corretas.
- [ ] Tag malformada (`[confianca: muito alta, N=abc]`) aparece como texto literal, nao quebra render.
- [ ] Streaming: texto chega caractere por caractere ate fechar tag, e so entao vira badge (nao flicker).
- [ ] Render em dark mode (bg-gray-800) legivel — badges tem contraste adequado.

#### RF-02: CitationChip para tags de fonte
**Descricao:** Respostas do coach podem incluir citations no formato `[Fonte: Dashboard > Por Speed, N=145, janela: 30d]` (N e janela opcionais). Renderizar como chip clicavel com tooltip.

**Regras de negocio:**
- Estender `coachMessageParser.ts`:
  - Adicionar tipo `Citation = { origem: string; n?: number; janela?: string }`.
  - Adicionar regex `/\[Fonte:\s*([^,\]]+?)(?:\s*,\s*N\s*=\s*(\d+))?(?:\s*,\s*janela:\s*([^\]]+?))?\s*\]/gi`.
  - `parseConfidenceTags` passa a retornar tambem `{kind:'citation', citation: Citation}` em `CoachNode`.
  - Manter retrocompat com testes existentes em `ConfidenceBadge.test.tsx`.
- Criar `client/src/components/coach/CitationChip.tsx`:
  - Renderiza chip com icone `BookOpen` (lucide-react) + `origem`.
  - Tooltip (shadcn `<Tooltip>`) mostra "Baseado em N={n}, janela={janela}" quando presentes.
  - `aria-label="Fonte: {origem}"`.
  - Classes: `inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-900/30 border border-blue-700/40 text-blue-300 text-xs hover:bg-blue-900/50 cursor-help`.
  - `origem` pode virar link interno no futuro (ex: `/dashboard?filter=speed`) — por ora e so visual. Adicionar prop opcional `onClick` preparando para isso.
- `CoachMessageContent` trata node `citation` invocando `<CitationChip>`.

**Criterio de aceitacao:**
- [ ] `[Fonte: Dashboard > Por Speed, N=145, janela: 30d]` renderiza chip azul clicavel.
- [ ] `[Fonte: Biblioteca]` (sem N nem janela) renderiza chip sem tooltip extra.
- [ ] `[Fonte: X, janela: 7d]` (sem N) renderiza chip e tooltip mostra "Janela: 7d".
- [ ] Tooltip aparece no hover e tem contraste legivel.
- [ ] aria-label legivel por screen reader.

#### RF-03: Thumbs up/down + comment opcional
**Descricao:** Footer discreto na bubble do assistant com botoes thumbs-up (`ThumbsUp`) e thumbs-down (`ThumbsDown`). Click em thumbs-down abre textarea opcional para comentario (max 500 chars). Consome `POST /api/coach/messages/:id/feedback` e `DELETE /api/coach/messages/:id/feedback`.

**Regras de negocio:**
- Criar `client/src/hooks/useCoachFeedback.ts`:
  - `submitFeedback(messageId, rating: 'up'|'down', comment?: string): Promise<void>` — POST com body `{rating, comment}`.
  - `removeFeedback(messageId): Promise<void>` — DELETE.
  - Optimistic update via `useMutation` do react-query. Em erro, rollback com toast `"Nao foi possivel registrar feedback"`.
  - Armazenar estado local de feedback atual por `messageId` em queryClient.setQueryData (cache simples, nao precisa endpoint de listagem).
- Criar `client/src/components/coach/MessageFeedbackActions.tsx`:
  - Props: `{ messageId: string; isUserMessage: boolean }`. Se `isUserMessage === true`, renderiza `null`.
  - Dois botoes icone (`ThumbsUp`, `ThumbsDown`), tamanho `h-6 w-6`, `text-gray-500 hover:text-gray-300`.
  - Estado ativo: thumbs-up ativo = `text-green-400`, thumbs-down ativo = `text-red-400`.
  - Click em thumbs-up: submit imediato (sem comentario).
  - Click em thumbs-down: abre popover (`Popover` shadcn) com `<Textarea maxLength={500}>` + botoes "Pular" (envia sem comentario) e "Enviar feedback".
  - Se usuario ja deu rating, novo click no mesmo rating chama DELETE. Click no rating oposto chama POST (substitui).
  - `aria-label`: "Gostei desta resposta" / "Nao gostei desta resposta".
- `MessageBubble` em `CoachAI.tsx` adiciona `<MessageFeedbackActions messageId={message.id} isUserMessage={isUser} />` abaixo do timestamp, apenas quando `!isUser`.
- Toast de sucesso opcional (discreto): "Feedback registrado". Nao bloquear UI.

**Criterio de aceitacao:**
- [ ] Thumbs-up click envia POST `{rating: 'up'}` e pinta icone em verde imediatamente.
- [ ] Thumbs-down click abre popover com textarea (maxLength=500).
- [ ] "Pular" envia POST `{rating: 'down'}` sem comment. "Enviar feedback" envia com comment.
- [ ] Click duplo no mesmo rating remove (DELETE) e despinta.
- [ ] Click no rating oposto substitui (POST) sem DELETE intermediario.
- [ ] Em erro 4xx/5xx, estado visual faz rollback e toast vermelho aparece.
- [ ] Bubble do usuario NAO mostra os botoes (so assistant).
- [ ] Focus visible + navegavel por teclado (Tab + Enter).

#### RF-04: AlertDialog no delete de sessao
**Descricao:** Substituir delete direto por `AlertDialog` (shadcn) com confirmacao explicita.

**Regras de negocio:**
- Em `CoachAI.tsx`, o botao `<Trash2>` dentro de `SessionSidebar` hoje chama `onDeleteSession(session.id)` direto.
- Passar a usar `<AlertDialog>` (shadcn, ja disponivel em `client/src/components/ui/alert-dialog.tsx`).
- Copy pt-BR:
  - Titulo: **"Apagar esta conversa?"**
  - Descricao: **"Essa acao nao pode ser desfeita. Todas as mensagens desta conversa serao removidas permanentemente."**
  - Cancelar: **"Cancelar"** (variant outline).
  - Confirmar: **"Apagar conversa"** (variant destructive, bg-red-600).
- AlertDialog usa `AlertDialogTrigger` como `asChild` em torno do botao de trash.
- Apos confirmar, chama `onDeleteSession(session.id)` e dialog fecha automaticamente.
- Archive NAO precisa de confirmacao (acao reversivel).

**Criterio de aceitacao:**
- [ ] Click em trash abre AlertDialog, NAO deleta imediatamente.
- [ ] Click em "Cancelar" fecha dialog sem acao.
- [ ] Click em "Apagar conversa" executa delete e fecha dialog.
- [ ] Copy esta exatamente em pt-BR conforme especificado.
- [ ] Dialog tem foco inicial no botao "Cancelar" (safe default).
- [ ] Esc fecha dialog sem deletar.

#### RF-05: Skeletons em vez de spinners
**Descricao:** Substituir `<Loader2 animate-spin>` por skeletons especificos ao contexto (bubbles de mensagem, rows de sessao).

**Regras de negocio:**
- Criar `client/src/components/coach/MessageSkeleton.tsx`:
  - Renderiza 3-4 bubbles alternando lado (user/assistant), cada uma com `<Skeleton>` de largura variavel (60-85%) e altura 60-120px.
  - Classes bubble user: `max-w-[80%] rounded-lg px-4 py-3 bg-green-600/10 ml-auto`.
  - Classes bubble assistant: `max-w-[80%] rounded-lg px-4 py-3 bg-gray-800 border border-gray-700`.
- Criar `client/src/components/coach/SessionListSkeleton.tsx`:
  - Renderiza 4-5 rows com `<Skeleton>` simulando titulo (70% width, 14px height) e metadata (40% width, 10px height).
- `CoachAI.tsx`:
  - Substituir `isLoadingMessages && activeSessionId` (linhas 298-301 no original) por `<MessageSkeleton />`.
  - Substituir `isLoading` em `SessionSidebar` (linha 122-125) por `<SessionListSkeleton />`.
- Usa `client/src/components/ui/skeleton.tsx` (shadcn, ja presente).

**Criterio de aceitacao:**
- [ ] Carregar sessao existente mostra skeletons de bubbles, nao spinner.
- [ ] Carregar lista de sessoes mostra skeletons de rows, nao spinner.
- [ ] Skeletons respeitam dark mode (`bg-gray-700/50` pulsing).
- [ ] Transicao de skeleton para conteudo real e fluida (nao pisca).
- [ ] Skeleton de bubble alterna user/assistant para parecer conversa.

#### RF-06: Copy-to-clipboard em respostas do assistant
**Descricao:** Icone discreto no footer de cada bubble do assistant para copiar conteudo em texto simples (sem tags internas).

**Regras de negocio:**
- Botao `<Copy>` (lucide-react) no footer da `MessageBubble` (ao lado dos thumbs, so em mensagens do assistant).
- Copia `parseCoachMessage(message.content).cleanText` — ou seja, sem tags `[confianca:]` `[nao sei:]` `[Fonte:]`.
- Usa `navigator.clipboard.writeText()`.
- Toast de sucesso: `"Copiado"` (short, 2s).
- Em falha (browser sem clipboard API), toast vermelho: `"Nao foi possivel copiar"`.
- `aria-label="Copiar resposta"`.

**Criterio de aceitacao:**
- [ ] Click copia texto limpo (sem tags internas) para clipboard.
- [ ] Toast "Copiado" aparece por ~2s.
- [ ] Fallback em clipboard indisponivel mostra toast de erro.
- [ ] Bubble do usuario nao tem botao copy.
- [ ] Icone tem contraste adequado e nao polui bubble (usar `opacity-60 hover:opacity-100`).

---

### Fase UX-1B — MONETIZACAO

#### RF-07: Hook useCoachLimits
**Descricao:** Hook React Query que consome `GET /api/coach/limits` e expoe limites + uso por coach.

**Regras de negocio:**
- Criar `client/src/hooks/useCoachLimits.ts`:
  - `useCoachLimits(coachType?: CoachType)` — se passado, retorna dados do coach especifico; se nao, agrega geral.
  - Endpoint: `GET /api/coach/limits`. Response shape esperada:
    ```json
    {
      "tier": "free|pro|premium|admin",
      "limits": {
        "mental": { "dailyLimit": 10, "used": 7, "remaining": 3, "resetAt": "ISO..." },
        "tournament": { "dailyLimit": 0, "used": 0, "remaining": 0, "resetAt": null },
        "technical": { "dailyLimit": 0, "used": 0, "remaining": 0, "resetAt": null }
      },
      "coachAccess": { "mental": true, "tournament": false, "technical": false }
    }
    ```
  - `staleTime: 60_000` (60s).
  - `refetchOnWindowFocus: true` (re-sync quando usuario volta pra aba).
- Exportar hook `useInvalidateCoachLimits()` que chama `queryClient.invalidateQueries({ queryKey: ['/api/coach/limits'] })`.
- `useCoachChat`: apos evento SSE `done`, chamar `useInvalidateCoachLimits`.

**Criterio de aceitacao:**
- [ ] Hook retorna `{ tier, limits, coachAccess, isLoading, error }`.
- [ ] `staleTime` evita re-fetch excessivo em navegacao interna.
- [ ] Apos enviar mensagem, limits e invalidado e re-fetched.
- [ ] Volta para aba re-sync automatico (refetchOnWindowFocus).
- [ ] Shape do response esta validado com Zod no hook (evita crashes por shape mismatch).

#### RF-08: Contador "X/Y hoje" no header do coach
**Descricao:** Ao lado do titulo do coach ativo, mostrar `7/10 hoje` (Free), `43/50 hoje` (Pro) ou `Ilimitado` (Premium/admin).

**Regras de negocio:**
- Criar `client/src/components/coach/LimitCounter.tsx`:
  - Props: `{ coachType: CoachType }`.
  - Usa `useCoachLimits(coachType)`.
  - Render:
    - Se `tier === 'admin' || dailyLimit >= 1000`: badge "Ilimitado" (cinza).
    - Senao: `{used}/{dailyLimit} hoje` com cor:
      - `remaining / dailyLimit > 0.4`: verde (`text-green-400`).
      - `remaining / dailyLimit <= 0.4 && > 0.1`: ambar (`text-amber-400`).
      - `remaining / dailyLimit <= 0.1`: vermelho (`text-red-400`).
  - Hover mostra tooltip: "Reseta em {HH:mm}" baseado em `resetAt`.
- Integrar em `CoachAI.tsx` dentro do bloco `<Tabs>` (linha 272-285). Posicionar a direita com `ml-auto` — contador do coach ativo aparece ao lado do `<TabsList>`.

**Criterio de aceitacao:**
- [ ] Free com mental=7/10 mostra "7/10 hoje" em verde.
- [ ] Free com mental=9/10 mostra "9/10 hoje" em vermelho.
- [ ] Pro mostra "43/50 hoje" com cor certa por ratio.
- [ ] Premium/admin mostra "Ilimitado" em cinza.
- [ ] Tooltip on hover mostra horario de reset formatado em pt-BR.
- [ ] Atualiza em tempo real apos envio de mensagem.

#### RF-09: RateLimitBanner (erro 429)
**Descricao:** Banner fixo no topo da area de mensagens quando backend retorna 429.

**Regras de negocio:**
- Criar `client/src/components/coach/RateLimitBanner.tsx`:
  - Props: `{ error: { limit: number; resetAt: string; upgradeTo: string | null; currentPlan: string } }`.
  - Layout: fundo vermelho escuro (`bg-red-900/30 border border-red-700/50`), icone `AlertTriangle`, texto + CTA.
  - Copy pt-BR:
    - Titulo: **"Voce atingiu o limite diario do Coach {coachLabel}"**
    - Corpo: **"Plano atual: {currentPlan}. Volta em {timeUntilReset}"** (ex: "em 3h 24m").
    - CTA (se `upgradeTo`): **"Upgrade para {upgradeTo}"** → navega para `/subscriptions`.
  - `timeUntilReset` calculado client-side com `date-fns/formatDistanceStrict` em pt-BR.
  - Re-calcula a cada 60s via `setInterval`.
  - Dismissivel? NAO — fica ate reset ou upgrade.
- Integrar em `useCoachChat`: quando `response.status === 429`, parsear body e setar state `rateLimitError`. Expor no retorno do hook.
- `CoachAI.tsx` renderiza `<RateLimitBanner>` logo acima do `<ScrollArea>` quando `rateLimitError` presente.

**Criterio de aceitacao:**
- [ ] 429 do backend aciona banner com copy correto.
- [ ] CTA navega para `/subscriptions`.
- [ ] Tempo ate reset e atualizado a cada 60s.
- [ ] Banner some quando `resetAt` passa ou usuario muda de coach que nao esta em rate limit.
- [ ] Input de mensagem desabilita enquanto banner ativo para o coach atual.
- [ ] Cor/contraste acessiveis em dark mode.

#### RF-10: UpgradeCoachModal (erro 403)
**Descricao:** Modal aberto ao bater 403 com `upgradeTo`. Mostra matriz 3x3 coach × plano e CTA.

**Regras de negocio:**
- Criar `client/src/components/coach/UpgradeCoachModal.tsx`:
  - Props: `{ open: boolean; onClose: () => void; currentPlan: string; targetCoach: CoachType; upgradeTo: string }`.
  - Dialog shadcn (`<Dialog>`).
  - Titulo: **"O Coach {coachLabel(targetCoach)} requer plano {upgradeTo}"**.
  - Corpo:
    - Paragrafo breve em pt-BR explicando: **"Voce esta no plano {currentPlan}. Para conversar com o Coach {coachLabel(targetCoach)}, faca upgrade para {upgradeTo}."**
    - Matriz 3x3 (linhas = coaches, colunas = planos Free/Pro/Premium):
      - Check verde (`<Check>`) se plano tem acesso.
      - Lock cinza (`<Lock>`) se nao tem.
      - Linha do plano atual destacada com `bg-gray-800/50`.
    - Origem do mapping: constante local `COACH_ACCESS_MATRIX`:
      ```ts
      const COACH_ACCESS_MATRIX = {
        free:    { mental: true,  tournament: false, technical: false },
        pro:     { mental: true,  tournament: true,  technical: false },
        premium: { mental: true,  tournament: true,  technical: true  },
      };
      ```
    - Pricing (estatico com flag TODO):
      ```ts
      // TODO_DYNAMIC_PRICING: consumir GET /api/subscription-plans quando endpoint expuser precos finais.
      const STATIC_PRICING = { free: 'Gratis', pro: 'R$ 49/mes', premium: 'R$ 99/mes' };
      ```
  - CTA: **"Fazer upgrade para {upgradeTo} — {STATIC_PRICING[upgradeTo]}"** → navega para `/subscriptions`.
  - Botao secundario: **"Voltar"** (variant outline).
- Integrar em `useCoachChat`: quando `response.status === 403`, setar state `gateError`. Expor no hook.
- `CoachAI.tsx` renderiza `<UpgradeCoachModal>` quando `gateError` presente. `onClose` limpa state.

**Criterio de aceitacao:**
- [ ] 403 aciona modal com matriz visual correta.
- [ ] Plano atual destacado visualmente.
- [ ] Target coach destacado (linha com borda verde).
- [ ] CTA navega para `/subscriptions`.
- [ ] Esc fecha modal.
- [ ] Comentario `TODO_DYNAMIC_PRICING` presente no codigo.

#### RF-11: Lock visual nas tabs bloqueadas
**Descricao:** Tabs de coaches inacessiveis ao plano atual recebem lock icon + badge + `opacity-50`. Click nao navega — abre `UpgradeCoachModal` direto.

**Regras de negocio:**
- `CoachAI.tsx` consome `useCoachLimits()` global (sem coachType) para obter `coachAccess`.
- Em `COACH_TABS.map`, para cada tab:
  - Se `coachAccess[tab.value] === false`:
    - Adicionar badge de plano necessario (ex: "Pro", "Premium") usando `COACH_ACCESS_MATRIX` para descobrir plano minimo.
    - Adicionar icone `<Lock>` antes do label.
    - Classe: `opacity-50 cursor-not-allowed`.
  - Interceptar `onValueChange`: se tab de destino esta bloqueada, NAO chamar `setCoachType`. Setar `gateError` manualmente com `{currentPlan, upgradeTo: minimumPlan, targetCoach: tab.value}` para abrir modal.
- Helper local `getMinimumPlanFor(coachType): 'pro' | 'premium'`:
  ```ts
  function getMinimumPlanFor(coach: CoachType): 'pro' | 'premium' {
    return coach === 'tournament' ? 'pro' : 'premium'; // technical → premium
  }
  ```

**Criterio de aceitacao:**
- [ ] Usuario Free ve Mental normal, Tournament com badge "Pro" + lock, Technical com badge "Premium" + lock.
- [ ] Click em tab bloqueada abre UpgradeCoachModal, NAO muda tab ativa.
- [ ] Usuario Pro ve Mental e Tournament normais, Technical locked com "Premium".
- [ ] Usuario Premium nao ve locks.
- [ ] Tab locked mantem `aria-disabled="true"` mas ainda e focavel para abrir modal via teclado.

#### RF-12: Prompt starters por coach
**Descricao:** Quando a tela esta vazia (nenhuma sessao ativa + nenhuma mensagem), mostrar 3-4 chips de perguntas iniciais especificas ao coach.

**Regras de negocio:**
- Criar `client/src/components/coach/PromptStarters.tsx`:
  - Props: `{ coachType: CoachType; onPick: (text: string) => void }`.
  - Mostra 3 chips (mobile) ou 4 chips (desktop) com texto clicavel.
  - Chip style: `rounded-full px-4 py-2 text-sm bg-gray-800 border border-gray-700 hover:border-green-500 hover:bg-green-600/10 cursor-pointer transition-colors`.
  - Click chama `onPick(text)` que preenche `inputValue` e da foco no textarea.
- Copies pt-BR por coach (exato — nao traduzir):
  - **Mental:**
    1. "Estou tiltado depois de um bad beat. Como recupero o foco?"
    2. "Como manter disciplina quando a sessao esta longa?"
    3. "Meu warm-up ideal antes de uma sessao de alta stakes"
    4. "Como lidar com downswing prolongado sem afetar o jogo?"
  - **Tournament:**
    1. "Analise minha grade desta semana e sugira ajustes"
    2. "Quais torneios ofertam melhor ROI para minha banca atual?"
    3. "Estou pagando muito rake? Como identificar?"
    4. "Vale entrar neste torneio com field de X jogadores?"
  - **Technical:**
    1. "Como jogar 3bet pot fora de posicao em stack medio?"
    2. "ICM na bolha — como ajustar ranges pre-flop?"
    3. "Revise minha mao: AK em 4bet pot"
    4. "Qual o range otimo para open de BTN em HU final?"
- Integrar em `CoachAI.tsx`: bloco do empty state (linha 302-318) passa a incluir `<PromptStarters coachType={coachType} onPick={(text) => { setInputValue(text); textareaRef.current?.focus(); }} />`.

**Criterio de aceitacao:**
- [ ] Empty state mostra chips especificos ao coach ativo.
- [ ] Click em chip preenche textarea e foca.
- [ ] Chips nao aparecem apos 1a mensagem ser enviada.
- [ ] Mobile mostra 3 chips em grid 1 coluna, desktop mostra 4 em 2 colunas.
- [ ] Copies pt-BR exatamente conforme especificado.

#### RF-13: Toast "poucas mensagens restantes"
**Descricao:** Quando `remaining <= 2` apos envio, mostrar toast azul informativo. Disparar UMA vez por sessao (sessionStorage).

**Regras de negocio:**
- Em `useCoachChat`, apos evento SSE `done`, verificar limits atualizado (via `useCoachLimits`).
- Se `remaining <= 2 && tier !== 'admin' && dailyLimit < 1000`:
  - Checar `sessionStorage.getItem('coach-low-warning-' + coachType)`.
  - Se nao presente, disparar toast informativo + marcar `sessionStorage.setItem('coach-low-warning-' + coachType, Date.now())`.
- Copy toast:
  - Titulo: **"Voce tem {remaining} mensagens restantes hoje"**
  - Descricao: **"Reseta em {timeUntilReset}. Considere upgrade se precisar de mais."**
  - Action: **"Ver planos"** → navega para `/subscriptions`.
  - Duracao: 8s (maior que o default por ser informativo).
- SessionStorage key inclui data (ex: `coach-low-warning-mental-2026-04-24`) para resetar diariamente.

**Criterio de aceitacao:**
- [ ] Ao bater remaining=2 pela 1a vez, toast aparece.
- [ ] Proximas msgs no mesmo dia NAO re-disparam toast.
- [ ] Novo dia re-dispara (sessionStorage key com data).
- [ ] Tier admin/Premium com dailyLimit >= 1000 nao dispara.
- [ ] Action "Ver planos" navega corretamente.

---

### Fase UX-1C — POLIMENTO (OPCIONAL)

Pode ser adiada sem bloquear UX-1A nem UX-1B. Entregaveis aqui sao incrementais.

#### RF-14: Endpoint GET /api/admin/coach/cost-metrics
**Descricao:** Endpoint admin-only que agrega custo real do LLM baseado em `chat_messages.input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `model` nos ultimos N dias.

**Regras de negocio:**
- Rota: `GET /api/admin/coach/cost-metrics?days=7` (default 7, max 90).
- Middleware: `requirePermission('admin_full')` (ja existe).
- Schema de response (Zod):
  ```ts
  {
    period: { from: string; to: string; days: number },
    totalMessages: number,
    totalCost: number, // USD
    avgCostPerMessage: number,
    cacheHitRate: number, // 0..1
    byCoachType: {
      mental:     { messages: number; cost: number; cacheHitRate: number },
      tournament: { messages: number; cost: number; cacheHitRate: number },
      technical:  { messages: number; cost: number; cacheHitRate: number }
    },
    byModel: Record<string, { messages: number; cost: number }>,
    byDay: Array<{ date: string; messages: number; cost: number; cacheHitRate: number }>
  }
  ```
- Pricing interno (constante no server):
  ```ts
  const MODEL_PRICING_USD = {
    'claude-haiku-4-5': { input: 0.80/1e6, output: 4/1e6, cacheRead: 0.08/1e6, cacheWrite: 1/1e6 },
    'claude-sonnet-4-5': { input: 3/1e6, output: 15/1e6, cacheRead: 0.30/1e6, cacheWrite: 3.75/1e6 },
    'claude-opus-4-5': { input: 15/1e6, output: 75/1e6, cacheRead: 1.50/1e6, cacheWrite: 18.75/1e6 },
  };
  ```
  - TODO_UPDATE_PRICING flag: revisar a cada atualizacao de modelo.
- Calculo:
  - `cost_per_message = input*p.input + output*p.output + cacheRead*p.cacheRead + cacheWrite*p.cacheWrite`.
  - `cacheHitRate = sum(cache_read_input_tokens) / sum(cache_read_input_tokens + input_tokens)`.
- Criar em `server/routes/admin.ts` (ou novo arquivo `server/routes/admin-coach.ts` se crescer).

**Criterio de aceitacao:**
- [ ] Endpoint retorna shape valida em Zod.
- [ ] Apenas admin passa middleware; non-admin recebe 403.
- [ ] `days` fora de [1, 90] retorna 400.
- [ ] Periodo sem mensagens retorna zeros, nao 500.
- [ ] Cache hit rate 0 quando sem dados.
- [ ] Flag `TODO_UPDATE_PRICING` presente no codigo.

#### RF-15: Pagina /admin/coach-analytics
**Descricao:** Dashboard admin com 4 cards + tabela de top thumbs-down + grafico por dia.

**Regras de negocio:**
- Criar `client/src/pages/AdminCoachAnalytics.tsx`:
  - Hero: 4 cards em grid-cols-2 md:grid-cols-4:
    1. "Mensagens (7d)" — `totalMessages`.
    2. "Cache hit rate" — `cacheHitRate * 100%` com cor (>70% verde, 40-70% amber, <40% red).
    3. "Custo total (USD)" — `$totalCost.toFixed(2)`.
    4. "Feedback up-rate" — `upCount / (upCount + downCount)` como %.
  - Grafico (recharts) linha: custo por dia (x: date, y: cost USD).
  - Tabela top 10 thumbs-down:
    - Colunas: preview da mensagem (50 chars), coach, comment do user, timestamp.
    - Consome `GET /api/admin/coach/feedback-stats?rating=down&limit=10` (verificar se endpoint existe; se nao, spec item 15a abaixo cria).
- Proteger rota no `App.tsx` com `<AdminRoute>`.
- Adicionar link no sidebar admin (`Sidebar.tsx`) em bloco "Admin > Coach Analytics".

**RF-15a (sub):** Se endpoint `/api/admin/coach/feedback-stats` nao existe, criar:
- Query: `SELECT message.id, content, coachType, rating, comment, createdAt FROM chat_messages JOIN feedback ...`.
- Filtros: `rating`, `limit` (max 50).
- Admin-only.

**Criterio de aceitacao:**
- [ ] Pagina renderiza sem erro para admin logado.
- [ ] Non-admin redirecionado para home.
- [ ] 4 cards exibem valores vindos do endpoint.
- [ ] Grafico de custo por dia renderiza com 7 pontos.
- [ ] Tabela de top thumbs-down exibe ate 10 rows.
- [ ] Link no sidebar admin visivel apenas para admins.

#### RF-16: Busca + filtro status no sidebar de sessoes
**Descricao:** Input de busca + toggle "Todas / Ativas / Arquivadas" no sidebar.

**Regras de negocio:**
- Em `SessionSidebar` (`CoachAI.tsx`):
  - Adicionar `<Input>` search acima da lista (ou em `client/src/components/coach/SessionSidebar.tsx` se extrair).
  - Adicionar `<ToggleGroup>` (shadcn) com 3 opcoes: Todas, Ativas, Arquivadas.
  - Filtro client-side (nao novo endpoint): `sessions.filter(s => (filter === 'all' || s.status === filter) && s.title.includes(search))`.
  - Default: "Ativas" (hoje sessions ja vem misturado, mostrar so active por default).
  - Persistir escolha em `localStorage` por coachType.

**Criterio de aceitacao:**
- [ ] Busca filtra em tempo real (debounce 150ms).
- [ ] Toggle "Arquivadas" mostra apenas arquivadas.
- [ ] Filtro persiste ao trocar de coachType.
- [ ] Empty state aparece se 0 resultados apos filtro.

#### RF-17: Auto-scroll inteligente + botao "nova mensagem"
**Descricao:** Auto-scroll apenas se usuario estava no fim. Senao, mostra botao flutuante.

**Regras de negocio:**
- Em `CoachAI.tsx`:
  - Adicionar ref `scrollAreaRef` no `<ScrollArea>`.
  - Listener de scroll: `isAtBottom = scrollTop + clientHeight >= scrollHeight - 40`.
  - useEffect de auto-scroll so chama `scrollIntoView` se `isAtBottom`.
  - Se nao esta at bottom E streaming esta ativo, mostrar botao flutuante `<ArrowDown>` com texto "Nova mensagem".
  - Click no botao scroll to bottom.

**Criterio de aceitacao:**
- [ ] Usuario rolando para cima durante streaming NAO e puxado para baixo.
- [ ] Botao "Nova mensagem" aparece apenas quando nao esta at bottom + streaming ativo.
- [ ] Click no botao scroll suave para bottom.
- [ ] Ao atingir bottom manualmente, botao some.

#### RF-18: Textarea auto-resize
**Descricao:** Textarea cresce com conteudo ate max 120px.

**Regras de negocio:**
- useEffect no input de `CoachAI.tsx`: quando `inputValue` muda, ajustar `ref.height = 'auto'` seguido de `ref.height = min(scrollHeight, 120) + 'px'`.
- `max-h-[120px]` ja esta no className.
- Shift+Enter continua inserindo nova linha.

**Criterio de aceitacao:**
- [ ] Digitando linhas, textarea cresce.
- [ ] Ao atingir ~5 linhas, para de crescer e vira scroll interno.
- [ ] Clear do input volta para min-h-[44px].

#### RF-19: Titulo gerado por Haiku
**Descricao:** Apos 2a ou 3a mensagem do assistant, chamar Haiku em background para gerar titulo <= 40 chars e atualizar sessao.

**Regras de negocio:**
- Backend: novo endpoint `POST /api/coach/sessions/:id/auto-title` (admin NAO necessario, usuario dono da sessao).
  - Pega primeiras 3 mensagens (user + assistant + user).
  - Prompt Haiku: "Gere um titulo de no maximo 40 caracteres em portugues brasileiro resumindo esta conversa de poker: ..."
  - Update `chat_sessions.title`.
- Frontend: em `useCoachChat`, apos `event.type === 'done'` e `messageCount === 2`, chamar endpoint em background (fire and forget).
- Nao bloqueia UI. Apos sucesso, invalida query de sessoes (titulo atualizado).

**Criterio de aceitacao:**
- [ ] Na 2a resposta do assistant, backend gera titulo e atualiza.
- [ ] Sidebar atualiza titulo sem reload.
- [ ] Se Haiku falhar, sessao mantem titulo original "Nova conversa".
- [ ] Usuario nao-dono da sessao recebe 403.

---

## Requisitos Nao-Funcionais

- **Performance:**
  - `useCoachLimits` com `staleTime: 60s` evita over-fetching.
  - Parser de tags nao re-executa se `content` nao mudou (memoize em `CoachMessageContent`).
  - Skeletons aparecem em <100ms apos mount.
- **Acessibilidade:**
  - Todos botoes icon-only com `aria-label` pt-BR.
  - Badges com `role="status"` (ja implementado em `ConfidenceBadge`).
  - Focus visible em tabs, botoes, chips.
  - AlertDialog + Modal com focus trap automatico do Radix.
  - Screen reader anuncia mudancas de limit ("Voce tem 2 mensagens restantes").
- **Seguranca:**
  - Nenhum novo endpoint no frontend expoe dados sensiveis — apenas consome backend existente.
  - Admin endpoint RF-14/RF-15 protegido por `requirePermission('admin_full')`.
  - Pricing estatico marcado com `TODO_DYNAMIC_PRICING` para revisao antes de prod.
- **I18n:** pt-BR em toda copy; nao usar placeholders tipo "{0}" em strings finais.
- **Compatibilidade com backend:** retrocompat garantida — frontend nao assume campos novos alem dos ja implementados.
- **Bundle size:** nao adicionar novas dependencias. Reusar `shadcn/ui`, `lucide-react`, `date-fns` ja presentes.

---

## Endpoints Previstos

### Novos (Fase UX-1C)
| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| GET | `/api/admin/coach/cost-metrics` | Agregado de custo LLM por coach/dia/modelo | admin_full |
| GET | `/api/admin/coach/feedback-stats` | Top thumbs-down com preview + comment | admin_full |
| POST | `/api/coach/sessions/:id/auto-title` | Gera titulo via Haiku (RF-19) | JWT + session owner |

### Consumidos (ja existem no backend)
| Metodo | Rota | Fase |
|---|---|---|
| POST | `/api/coach/chat` | UX-1A (integracao ja existe, estender handling 403/429) |
| GET | `/api/coach/limits` | UX-1B (novo hook) |
| POST | `/api/coach/messages/:id/feedback` | UX-1A (RF-03) |
| DELETE | `/api/coach/messages/:id/feedback` | UX-1A (RF-03) |
| POST | `/api/coach/sessions/:id/archive` | UX-1A (ja usado) |
| DELETE | `/api/coach/sessions/:id` | UX-1A (ja usado, + RF-04 AlertDialog) |

---

## Modelos de Dados Afetados

**Nenhum schema novo em UX-1A e UX-1B.** UX-1C usa tabelas ja existentes:
- `chat_messages.input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `model`, `created_at` (RF-14).
- `chat_messages` + tabela de feedback ja criada no Sprint Coach-1 Fundacao (RF-15).

RF-19 usa `chat_sessions.title` existente (apenas UPDATE, sem schema change).

---

## Integracoes Externas

| Servico | Proposito | Fase | Quando |
|---|---|---|---|
| Anthropic API (Haiku) | Gerar titulos automaticos | UX-1C | Apos 2a mensagem da sessao |

---

## Arquivos a Criar / Modificar

### Fase UX-1A (BLOQUEANTE)
**Criar:**
- `B:/grindfy/client/src/components/coach/CoachMessageContent.tsx`
- `B:/grindfy/client/src/components/coach/CitationChip.tsx`
- `B:/grindfy/client/src/components/coach/MessageFeedbackActions.tsx`
- `B:/grindfy/client/src/components/coach/MessageSkeleton.tsx`
- `B:/grindfy/client/src/components/coach/SessionListSkeleton.tsx`
- `B:/grindfy/client/src/hooks/useCoachFeedback.ts`

**Modificar:**
- `B:/grindfy/client/src/lib/coachMessageParser.ts` (adicionar Citation + extender CoachNode)
- `B:/grindfy/client/src/pages/CoachAI.tsx` (substituir ReactMarkdown por CoachMessageContent, adicionar AlertDialog, skeletons, feedback actions, copy button)

**Testes a criar (test-writer):**
- `B:/grindfy/client/src/lib/__tests__/coachMessageParser.citations.test.ts` (RF-02)
- `B:/grindfy/client/src/components/coach/__tests__/CoachMessageContent.test.tsx` (RF-01, RF-02)
- `B:/grindfy/client/src/components/coach/__tests__/CitationChip.test.tsx` (RF-02)
- `B:/grindfy/client/src/components/coach/__tests__/MessageFeedbackActions.test.tsx` (RF-03)
- `B:/grindfy/client/src/hooks/__tests__/useCoachFeedback.test.tsx` (RF-03)
- `B:/grindfy/client/src/components/coach/__tests__/MessageSkeleton.test.tsx` (RF-05)
- `B:/grindfy/client/src/pages/__tests__/CoachAI.delete-dialog.test.tsx` (RF-04)

### Fase UX-1B (MONETIZACAO)
**Criar:**
- `B:/grindfy/client/src/hooks/useCoachLimits.ts`
- `B:/grindfy/client/src/components/coach/LimitCounter.tsx`
- `B:/grindfy/client/src/components/coach/RateLimitBanner.tsx`
- `B:/grindfy/client/src/components/coach/UpgradeCoachModal.tsx`
- `B:/grindfy/client/src/components/coach/PromptStarters.tsx`

**Modificar:**
- `B:/grindfy/client/src/pages/CoachAI.tsx` (integrar LimitCounter, banner, modal, tab locks, prompt starters, toast baixo limite)
- `B:/grindfy/client/src/hooks/useCoachChat.ts` (expor gateError, rateLimitError; parsear 403/429)

**Testes a criar:**
- `B:/grindfy/client/src/hooks/__tests__/useCoachLimits.test.tsx` (RF-07)
- `B:/grindfy/client/src/components/coach/__tests__/LimitCounter.test.tsx` (RF-08)
- `B:/grindfy/client/src/components/coach/__tests__/RateLimitBanner.test.tsx` (RF-09)
- `B:/grindfy/client/src/components/coach/__tests__/UpgradeCoachModal.test.tsx` (RF-10)
- `B:/grindfy/client/src/pages/__tests__/CoachAI.tab-locks.test.tsx` (RF-11)
- `B:/grindfy/client/src/components/coach/__tests__/PromptStarters.test.tsx` (RF-12)
- `B:/grindfy/client/src/pages/__tests__/CoachAI.low-warning-toast.test.tsx` (RF-13)

### Fase UX-1C (POLIMENTO)
**Criar (server):**
- `B:/grindfy/server/routes/admin-coach.ts` (ou adicionar em `admin.ts`)

**Criar (client):**
- `B:/grindfy/client/src/pages/AdminCoachAnalytics.tsx`
- `B:/grindfy/client/src/components/coach/SessionSidebar.tsx` (extrair de CoachAI para encapsular busca/filter)

**Modificar:**
- `B:/grindfy/client/src/App.tsx` (adicionar rota `/admin/coach-analytics`)
- `B:/grindfy/client/src/components/Sidebar.tsx` (adicionar link admin)
- `B:/grindfy/client/src/pages/CoachAI.tsx` (auto-scroll inteligente, textarea auto-resize)
- `B:/grindfy/server/routes/coach.ts` (auto-title endpoint RF-19)

**Testes a criar:**
- `B:/grindfy/tests/integration/admin-coach-cost-metrics.test.ts` (RF-14)
- `B:/grindfy/tests/integration/coach-auto-title.test.ts` (RF-19)
- `B:/grindfy/client/src/pages/__tests__/AdminCoachAnalytics.test.tsx` (RF-15)
- `B:/grindfy/client/src/components/coach/__tests__/SessionSidebar.search.test.tsx` (RF-16)

---

## Cenarios de Teste Derivados

### Fase UX-1A

#### Happy Path
- [ ] Usuario envia mensagem, resposta vem com `[confianca: alta, N=145]` e renderiza como badge verde inline.
- [ ] Usuario da thumbs-up em resposta util → POST enviado, botao fica verde.
- [ ] Usuario da thumbs-down + escreve comment → POST enviado com comment, botao fica vermelho.
- [ ] Usuario deleta sessao → AlertDialog abre, confirma, sessao some do sidebar.

#### Validacao de Input
- [ ] Comment de feedback > 500 chars bloqueia envio (maxLength enforce).
- [ ] Comment vazio apos click em "Enviar feedback" envia POST `{rating:'down'}` sem comment.

#### Regras de Negocio
- [ ] Click duplo em thumbs-up executa DELETE (remove rating).
- [ ] Mudanca de thumbs-up → thumbs-down executa POST substituindo (nao DELETE+POST).
- [ ] Tags malformadas (`[confianca: invalido]`) aparecem como texto literal sem quebrar.
- [ ] Copy-to-clipboard copia `cleanText` sem tags internas.

#### Edge Cases
- [ ] Mensagem super longa (>2000 chars) com 5+ tags: parser + render funciona sem lag perceptivel.
- [ ] Streaming com tag parcial (`[conf...`) nao faz flicker ao completar.
- [ ] Feedback em mensagem que ja foi deletada → 404 tratado com toast de erro.
- [ ] AlertDialog: Esc cancela, Enter no "Cancelar" cancela.

### Fase UX-1B

#### Happy Path
- [ ] Free com 3 msgs envia 1 → contador vira 4/10 em verde.
- [ ] Free com 9/10 envia 1 → contador vira 10/10 em vermelho + 11a msg retorna 429 e banner aparece.
- [ ] Free clica em tab Technical → UpgradeCoachModal abre destacando Premium.
- [ ] Empty state mostra 3-4 prompt starters clicaveis que preenchem textarea.

#### Regras de Negocio
- [ ] Banner de rate limit se atualiza a cada 60s (contador de tempo).
- [ ] Toast de "2 restantes" dispara UMA vez por dia (sessionStorage).
- [ ] Pro ve locks apenas na tab Technical.
- [ ] Premium nao ve locks.

#### Edge Cases
- [ ] Usuario muda de aba, volta depois de reset → limits re-sync e contador atualiza.
- [ ] 403 em tab bloqueada nao altera tab ativa.
- [ ] Admin com tier especial mostra "Ilimitado" mesmo com dailyLimit=200.
- [ ] Banner 429 some quando resetAt passa sem reload.

### Fase UX-1C

#### Happy Path
- [ ] Admin acessa `/admin/coach-analytics` e ve 4 cards + grafico.
- [ ] Top thumbs-down tabela mostra mensagens com preview e comment.
- [ ] Busca no sidebar filtra em tempo real.
- [ ] Auto-scroll para cima durante streaming mostra botao "nova mensagem".
- [ ] Apos 2a msg, titulo da sessao e atualizado via Haiku.

#### Regras de Negocio
- [ ] Non-admin em `/admin/coach-analytics` e redirecionado.
- [ ] `days=100` retorna 400 (max 90).
- [ ] Cache hit rate com 0 tokens retorna 0, nao NaN.
- [ ] Filtro "Arquivadas" persiste em localStorage por coachType.

---

## Fora de Escopo

- **Inline action buttons nas citations** (ex: "Ver no Dashboard"): apenas tooltip por ora.
- **Historico de feedback do usuario** em UI propria: backend armazena, mas frontend nao lista.
- **Export de conversa em markdown/pdf**: fora desta spec.
- **Busca full-text dentro das mensagens** (apenas titulo da sessao em RF-16).
- **Suporte a i18n real** (so pt-BR fixo).
- **Editar mensagem apos envio**.
- **Reacoes extras alem de thumbs up/down** (ex: emojis).
- **Admin endpoint de ajuste manual de rate limit** (sem bypass UI).
- **Preview de citations em markdown** (ex: embed do torneio). Por ora so texto + tooltip.

---

## Dependencias

**UX-1A depende de:**
- Backend Sprint Coach-1 Fundacao (ja implementado): endpoints `/api/coach/chat`, `/api/coach/messages/:id/feedback` (POST/DELETE), LLM configurado para emitir tags.
- Parser existente em `coachMessageParser.ts` (ja existe; RF-02 estende).
- Componentes shadcn/ui ja presentes: `alert-dialog`, `popover`, `tooltip`, `skeleton`, `toast`.

**UX-1B depende de:**
- UX-1A (componentes base).
- Backend `/api/coach/limits` (ja existe no `server/routes/coach.ts:610+`).
- Respostas 403/429 ja incluindo `upgradeTo`, `resetAt`, `currentPlan` no payload.
- Pagina `/subscriptions` existente (destino dos CTAs).

**UX-1C depende de:**
- UX-1A + UX-1B completas (hero do dashboard usa mesmas constantes).
- Permissao `admin_full` (ja existe em `shared/permissions.ts`).
- Tabela `chat_messages` com colunas de tokens/cache/model populadas (responsabilidade da fundacao do Sprint Coach-1).

---

## Notas de Implementacao

### Ordem sugerida dentro de UX-1A
1. Estender parser (adicionar Citation) — destrava render dos chips.
2. Criar `CoachMessageContent` que consome parser — substitui ReactMarkdown.
3. Integrar `CoachMessageContent` em `MessageBubble` e `StreamingBubble` — valida visual.
4. Criar `CitationChip` e testar com exemplos reais.
5. Criar `MessageFeedbackActions` + `useCoachFeedback`.
6. Substituir delete por AlertDialog.
7. Adicionar skeletons.
8. Adicionar copy button.

### Ordem sugerida dentro de UX-1B
1. Criar `useCoachLimits` — base de tudo.
2. Criar `LimitCounter` e integrar no header.
3. Criar `RateLimitBanner` + `UpgradeCoachModal` + parseamento de 403/429 em `useCoachChat`.
4. Adicionar lock nas tabs.
5. Criar `PromptStarters` e integrar no empty state.
6. Adicionar toast de baixo limite.

### Ordem sugerida dentro de UX-1C
1. Endpoint admin cost-metrics (+ feedback-stats se nao existe).
2. Pagina `/admin/coach-analytics` consumindo endpoint.
3. Busca/filtro no sidebar (extrair componente).
4. Auto-scroll inteligente.
5. Textarea auto-resize.
6. Auto-title via Haiku.

### Retrocompat com testes existentes
- `ConfidenceBadge.test.tsx` ja existe — nao alterar assinatura dos componentes `ConfidenceBadge`/`UnknownBadge`.
- `coachMessageParser.ts`: manter `parseCoachMessage` e `parseConfidenceTags` com contratos atuais. Estender `CoachNode` com novo kind `'citation'` e adicionar `Citation` type sem remover existing.
- Adicionar testes novos para citations em arquivo separado (`coachMessageParser.citations.test.ts`) para evitar conflito com suite existente.

### Observacoes de testing
- Usar `@testing-library/react` + `vitest` (config `client` em `test.projects`).
- Usar MSW (`msw@2`) para mockar endpoints em testes de hook — ou spies explicitos. **Nao mockar response shapes idealizados** — ver entrada de 2026-04-23 no CLAUDE.md secao 9.
- Polyfills Radix UI (ResizeObserver, etc.) ja estao em `tests/setup.ts`.
- Testes de streaming SSE: mock `fetch` com `ReadableStream` retornando chunks `data: {...}\n\n`.

---

## Plano de Rollout

### Gate 1: Deploy do backend Sprint Coach-1 BLOQUEADO ate UX-1A mergeada
Motivo: sem UX-1A, usuario ve `[confianca: alta, N=145]` como texto cru no markdown e erros 403/429 como string vermelha sem CTA. Regressao visual severa.

**Itens obrigatorios em UX-1A antes do deploy do backend:**
- RF-01 (badges inline)
- RF-02 (citations chip)
- RF-03 (thumbs up/down) — LLM ja produz sinal, precisa UI pra capturar
- RF-04 (alert dialog) — bom higiene mas nao bloqueante se tudo resto ok

### Gate 2: UX-1B antes do push comercial do plano Pro
Motivo: sem UX-1B, jogador Free nao entende por que nao acessa Tournament/Technical e nao vemos conversao. Rate limit gera erro silencioso.

**Itens obrigatorios em UX-1B antes de campanha:**
- RF-07 (hook de limits)
- RF-08 (contador visivel)
- RF-09 (banner 429)
- RF-10 (modal 403)
- RF-11 (lock visual nas tabs)

**Opcionais para campanha mas recomendados:** RF-12 (starters), RF-13 (toast de aviso).

### Gate 3: UX-1C nao bloqueia nada
Pode ser entregue em ondas — RF-14 e RF-15 juntos (admin analytics), RF-16/17/18 juntos (polimento chat), RF-19 isolado (auto-title).

---

## Manual Steps (Decisoes Humanas)

1. **Pricing final (RF-10):** Confirmar valores de Pro e Premium antes de flipar flag `TODO_DYNAMIC_PRICING` ou criar endpoint `/api/subscription-plans` com pricing dinamico. Hoje esta estatico R$49 / R$99.
2. **Abrir rota admin em producao (RF-14, RF-15):** Validar que `requirePermission('admin_full')` esta ativo na rota antes de merge. Setar NODE_ENV corretamente.
3. **Ajustar Sidebar.tsx (RF-15):** Adicionar link "Coach Analytics" apenas para role admin. Confirmar que ja existe bloco condicional de admin no sidebar.
4. **App.tsx (RF-15):** Registrar nova rota `/admin/coach-analytics` dentro do guard `<AdminRoute>`.
5. **Atualizar pricing do modelo (RF-14):** Toda vez que Anthropic atualizar preco de Haiku/Sonnet/Opus, atualizar `MODEL_PRICING_USD` no servidor (flag `TODO_UPDATE_PRICING`).
6. **Prompt Haiku (RF-19):** Revisar prompt final de auto-title antes de prod. Definir tom (objetivo vs engraçado). Hoje sugerido: "Gere um titulo de no maximo 40 caracteres em portugues brasileiro resumindo esta conversa de poker".
7. **Decisao sobre endpoint feedback-stats (RF-15):** Se ainda nao existe, decidir se cria subrota em `/api/admin/coach/*` ou em `/api/admin/*` generico.
8. **A/B test de prompt starters (RF-12):** Copy sugerida vem do strategist. Se preferir, fazer split-test com 2 variantes de copy e medir taxa de click.
9. **Decisao sobre soft cap Premium (RF-08):** Hoje Premium = 200/dia. Se preferir "Ilimitado visivel" para Premium mesmo com cap tecnico, ajustar threshold no `LimitCounter` (atualmente `>=1000`).
10. **Retencao de dados admin-coach analytics (RF-14):** Considerar view materializada ou caching se query fica lenta com muitos messages. Revisar apos 30 dias em prod.

---

## Verificacao Final da Spec

- [x] Cada RF tem criterios de aceitacao verificaveis.
- [x] Cenarios de teste cobrem happy path, validacao, regras de negocio e edge cases por fase.
- [x] "Fora de Escopo" preenchido.
- [x] 3 fases claramente separadas (UX-1A bloqueante, UX-1B monetizacao, UX-1C polimento).
- [x] Arquivos a criar/modificar com paths absolutos.
- [x] Copy em pt-BR (nao placeholder).
- [x] Endpoints consumidos e novos listados.
- [x] Plano de rollout com gates explicitos.
- [x] Manual steps listados para decisoes humanas.
- [x] Nenhuma nova dependencia (so shadcn/Radix/lucide/date-fns ja instaladas).
- [x] Retrocompat com testes existentes garantida.
