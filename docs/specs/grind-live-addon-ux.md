# Grind Live — Add-on UX (botão, diálogos, badge)

**ID:** spec-addon-rea-addon-ux
**Data:** 2026-04-23
**Status:** Draft
**Prioridade:** Alta
**Estimativa:** S
**Dependências:** `spec-addon-rea-foundation` (`addon-rea-schema-foundation.md`) — **obrigatória**. Esta spec não faz sentido sem as colunas `allowsAddOn`, `addOnCost`, `addOnTaken` já no banco e a fórmula de cálculo já atualizada.

Pode ser deployada em paralelo com `spec-addon-rea-reentry-flow` (`grind-live-reentry-flow.md`), mas é independente dela.

---

## 1. Problema

### User story
> "Como jogador de MTT, quando entro no intervalo de um torneio Plus e decido pagar o add-on (normalmente 100% do buy-in para dobrar o stack), hoje não tenho onde registrar isso no Grindfy. Vou embora com ROI inflado em 8-15 pontos percentuais porque o sistema não sabe que paguei $X a mais."

### Quantificação

- ~20% dos torneios jogados no dia a dia são Plus (Suprema, PokerStars, ACR especialmente).
- Entre Plus, o jogador paga o add-on em ~65% dos casos (quando o spot vale — quase sempre em soft fields).
- Add-on típico = 100% do buy-in. Em um torneio de $11, são $11 a mais investidos. Em um de $55, $55 a mais.
- Em uma semana típica (60 torneios), o jogador pode pagar 8-10 add-ons. Isso é **$80-$300 de investimento oculto** distorcendo o ROI semanal.
- Sessão com ROI reportado de +40% com 4 add-ons não registrados vira +28% quando corrigido — diferença entre "cronograma ótimo" e "cronograma decente".

### Quem sofre
Todos os usuários do Grind Live. Frequência: **~8-10 vezes por semana** (jogadores volume) ou **1-2 vezes por sessão**.

---

## 2. Objetivo

**Outcome mensurável (14 dias pós-deploy):**

1. **% de torneios Plus com `addOnTaken` preenchido (true ou explicitamente false)** > 70%. Ponto de partida: 0% (ninguém tem como marcar hoje).
2. **Média de add-ons registrados por usuário ativo/semana** ≥ 4 (indica adoção saudável).
3. **ROI médio reportado por jogador com >10 torneios Plus na semana** cai em mediana **5-10 pontos percentuais** comparado à semana anterior ao deploy (indica que o leak foi corrigido na direção certa). Não cai mais do que 18 pp (sanity — se cair muito é porque estão marcando add-on em torneios sem allowsAddOn).
4. **Zero reclamações** de UI confusa no canal de suporte relacionada a "add-on" nos 14 dias.

---

## 3. Escopo

### Incluído

- Botão `+ Add-on` no card "Jogando" (`RegisteredCard` em `TournamentCard.tsx`), antes do botão "Resultado".
- Checkbox "Permite Add-on" + input "Custo do Add-on ($)" em `AddTournamentDialog.tsx`.
- Mesmo checkbox + input em `EditTournamentDialog.tsx`.
- Handler `handleAddOnTaken(tournamentId)` em `GrindSessionLive.tsx`.
- Mutation React Query para persistir `addOnTaken=true` no `session_tournaments`.
- Toast de confirmação ao clicar.
- Badge compacto "Permite Add-on" nos cards `UpcomingCard` e `CompletedCard` quando `allowsAddOn=true`.
- Resumo "Add-ons Pagos: N" na seção final do `SessionDashboard` (mini-card ou linha no resumo).
- Edge case: reverter add-on (1 clique no badge dourado → voltar ao botão verde).

### Fora do escopo (explícito)

- **Não tocar no fluxo de Re-entry** — é a Spec 3.
- **Não alterar a fórmula de cálculo** — está pronta da Spec 1.
- **Não exibir o add-on no Library Stats/Dashboard Analytics** — isso vai automaticamente via fórmula. Spec 2 não muda Analytics.
- **Não permitir editar `addOnCost` a partir do card "Jogando"** — só pelo botão Editar do torneio (abre `EditTournamentDialog`). Mantém clique único no card.
- **Não mostrar `addOnCost` na `TournamentLibrary` UI** — já é exibido no card de torneio; library pode ficar para uma v2 se houver demanda.
- **Não adicionar flag no `Estudos` / AI Coach** — eles consomem agregados já corrigidos.
- **Sem suporte a múltiplos add-ons** (alguns torneios oferecem 2 add-ons). v1 é booleano; v2 trata contador se surgir demanda.

---

## 4. Solução técnica

### 4.1 Schema

Nenhuma mudança. Tudo provido pela Spec 1: `allowsAddOn`, `addOnCost`, `addOnTaken` já existem em `session_tournaments`, `planned_tournaments` e `tournament_library`.

### 4.2 API

Nenhuma rota nova. Reutiliza:

- **PUT `/api/session-tournaments/:id`** (ou endpoint equivalente do módulo `server/routes/grind-sessions.ts`) — aceita payload `{ addOnTaken: boolean }`.
- **PUT `/api/planned-tournaments/:id`** — aceita `{ allowsAddOn, addOnCost }` para o dialog de add/edit do planejamento.
- **POST `/api/planned-tournaments`** — idem para criação.

Confirmação necessária no implementer: identificar o **exato endpoint** usado pelo `updateTournamentMutation` já existente em `GrindSessionLive.tsx:923` (linha do `handleRebuyTournament`). A mutation do add-on deve usar o mesmo padrão.

#### Contrato da nova mutation

**Observação importante:** a spec originalmente propunha criar uma `addOnMutation` dedicada, mas **reusa-se a `updateTournamentMutation` já existente** em `GrindSessionLive.tsx` para não fragmentar o padrão (mesma razão porque `handleRebuyTournament` reusa o mutation genérico). O handler fica:

```ts
// Em GrindSessionLive.tsx, próximo ao handleRebuyTournament (linha 922):
const handleAddOnTaken = (tournamentId: string, value: boolean) => {
  updateTournamentMutation.mutate(
    { id: tournamentId, data: { addOnTaken: value } },
    {
      onSuccess: () => {
        toast({
          title: value ? 'Add-on registrado' : 'Add-on removido',
          description: value ? 'Investimento atualizado' : 'Valor do add-on desfeito'
        });
      },
      onError: (err: any) => {
        toast({
          title: 'Erro ao registrar add-on',
          description: err?.message || 'Tente novamente',
          variant: 'destructive'
        });
      },
    }
  );
};
```

Query invalidation já acontece dentro do `updateTournamentMutation` existente — não duplicar.

Se `allowsAddOn=false` no torneio (edge case: racing condition), backend retorna 400 da validação cruzada da Spec 1 → `onError` captura e mostra toast.

**Pré-requisito do handler PUT (Spec 1 dependência):** no `server/routes/grind-sessions.ts:706`, o handler precisa fazer merge do payload com o registro atual do banco antes de validar (refinement `addOnTaken && !allowsAddOn` falha em update parcial sem merge). **Documentado em Spec 1 §4.3.** Essa Spec 2 assume a correção já aplicada.

### 4.3 UI

#### Botão no `RegisteredCard` — `B:\grindfy\client\src\components\grind-session-live\TournamentCard.tsx:208-246`

Na linha de botões de ação (`div className="flex flex-col sm:flex-row..."`), **entre** o botão `REBUY` (linha 210-226) e o botão `Resultado` (linha 229), inserir:

```tsx
{tournament.allowsAddOn && (
  <Button
    size="sm"
    variant="outline"
    onClick={() => onAddOnTaken(tournament.id, !tournament.addOnTaken)}
    disabled={updateIsPending}
    className={`border-2 h-10 px-3 text-xs font-bold shadow-lg transition-all duration-200 ${
      tournament.addOnTaken
        ? "border-amber-400 bg-gradient-to-r from-amber-500/80 to-yellow-600/80 text-white hover:from-amber-400 hover:to-yellow-500"
        : "border-green-500 bg-gradient-to-r from-emerald-600/80 to-emerald-700/80 text-white hover:from-emerald-500 hover:to-emerald-600"
    }`}
    title={tournament.addOnTaken
      ? `Add-on $${tournament.addOnCost || tournament.buyIn} pago. Clique para desfazer.`
      : `Pagar add-on $${tournament.addOnCost || tournament.buyIn}`}
  >
    <Plus className="w-3 h-3 mr-1" />
    {tournament.addOnTaken
      ? `Add-on $${formatAddOnCost(tournament)} pago`
      : `+ Add-on`}
  </Button>
)}
```

**Estados visuais:**
- **Default** (verde): `+ Add-on`. Ícone `Plus`. Mesma altura dos outros botões (`h-10`).
- **Ativo** (dourado): `Add-on $X pago`. Mesma posição. Clique reverte.
- **Disabled** enquanto mutation em flight.

Adicionar nova prop na interface `TournamentCardRegisteredProps`:
```ts
onAddOnTaken: (tournamentId: string, value: boolean) => void;
```

#### Dialog `AddTournamentDialog.tsx`

Adicionar na seção de campos (após "Velocidade" ou próximo de "Tipo"):

```tsx
<div className="flex items-center gap-3">
  <Checkbox
    id="allowsAddOn"
    checked={form.allowsAddOn}
    onCheckedChange={(checked) => {
      setForm(prev => ({
        ...prev,
        allowsAddOn: !!checked,
        addOnCost: !!checked && !prev.addOnCost ? prev.buyIn : prev.addOnCost,
      }));
    }}
  />
  <label htmlFor="allowsAddOn" className="text-sm text-gray-200 cursor-pointer">
    Permite Add-on
  </label>
</div>
{form.allowsAddOn && (
  <div className="ml-6">
    <label className="text-xs text-gray-400 mb-1 block">Custo do Add-on ($)</label>
    <Input
      type="number"
      step="0.01"
      min="0"
      value={form.addOnCost || form.buyIn}
      onChange={(e) => setForm(prev => ({ ...prev, addOnCost: e.target.value }))}
      placeholder={form.buyIn}
      className="..."
    />
  </div>
)}
```

#### Dialog `EditTournamentDialog.tsx`

Idêntico ao AddTournamentDialog. Pré-popula com valores existentes.

#### `UpcomingCard` e `CompletedCard` — badge "Plus"

Em `TournamentCard.tsx` onde já existem os badges de Site/Type/Speed (aproximadamente linhas 127–143 em RegisteredCard, 417–445 em UpcomingCard, 589–604 em CompletedCard — **implementer deve confirmar linhas exatas**; estrutura dos 3 cards é similar com badges em `<div className="flex gap-1 flex-wrap text-xs">`), adicionar:

```tsx
{tournament.allowsAddOn && (
  <Badge className="px-1.5 py-0.5 bg-amber-600 text-white font-semibold">
    Plus
  </Badge>
)}
```

No `CompletedCard`, se `tournament.addOnTaken=true`, usar variante dourada:
```tsx
<Badge className="px-1.5 py-0.5 bg-amber-500 text-white font-semibold">
  + Add-on pago
</Badge>
```

#### `SessionDashboard.tsx` — resumo final

Adicionar nos KPIs/resumo final (arquivo `B:\grindfy\client\src\components\grind-session-live\SessionDashboard.tsx`):

```tsx
<div className="bg-gray-900/50 border border-gray-700 rounded p-3">
  <div className="text-xs text-gray-400">Add-ons Pagos</div>
  <div className="text-lg font-bold text-amber-400">
    {addOnsPaidCount} <span className="text-xs text-gray-500">(${addOnsPaidTotal})</span>
  </div>
</div>
```

`addOnsPaidCount` = `sessionTournaments.filter(t => t.addOnTaken).length`.
`addOnsPaidTotal` = soma de `addOnCost` desses torneios.

### 4.4 Lógica

#### Helper em `helpers.ts`

```ts
export const formatAddOnCost = (tournament: any): string => {
  const cost = parseFloat(tournament.addOnCost) || parseFloat(tournament.buyIn) || 0;
  return cost.toFixed(2).replace(/\.00$/, '');
};
```

#### Handler em `GrindSessionLive.tsx`

Próximo ao `handleRebuyTournament` (linha 922). Versão completa já definida em §4.2 acima — **não duplicar, usar referência única**.

Passar `onAddOnTaken={handleAddOnTaken}` para `<TournamentCard mode="registered" ...>` em `GrindSessionLive.tsx:1400–1410`, imediatamente abaixo da prop `onRebuy`.

**Atenção ao refactor `NewTournamentForm`:** a interface em `types.ts` precisa ganhar `allowsAddOn?: boolean`, `addOnCost?: string` (Spec 1 pré-requisito). Se ainda não aplicado, a Spec 2 não pode adicionar o checkbox no AddTournamentDialog. Implementer deve validar antes de começar.

#### Invariantes

- Botão **só aparece** se `allowsAddOn=true`.
- `addOnTaken` é **1 bit** — não é contador.
- Toggle off (desfazer) é permitido enquanto sessão está ativa.
- Se usuário finaliza torneio (GG) com `addOnTaken=true`, valor permanece no `session_tournament` finalizado.

---

## 5. Fluxo do usuário

### Fluxo A — Jogador registra add-on em torneio Plus

1. Jogador registra o torneio "Big Sunday Plus $22" (vindo do planejamento; `allowsAddOn=true` já foi marcado pelo parser ou pelo usuário).
2. Torneio aparece no card "Jogando" com badge `Plus` dourado ao lado dos badges Site/Tipo/Velocidade.
3. Ao final do 1º intervalo, jogador decide pagar o add-on.
4. Jogador clica em `+ Add-on` (verde, antes do botão Resultado).
5. Mutation dispara PUT com `addOnTaken: true`. Loading: botão desabilita.
6. Sucesso: toast verde "Add-on registrado — investimento atualizado". Botão vira dourado: "Add-on $22 pago". Query invalidada → dashboard atualiza `totalInvestido` e `ROI`.
7. Jogador volta ao Grind.

### Fluxo B — Jogador pagou por engano, quer desfazer

1. Botão dourado exibido.
2. Jogador clica.
3. Confirmação **implícita** (1 clique). Reverte para `addOnTaken: false`.
4. Toast: "Add-on removido". Botão volta ao verde.

### Fluxo C — Jogador cria torneio na hora, marca Plus

1. Clica "+ Torneio" no `AddTournamentDialog`.
2. Preenche dados.
3. Marca checkbox "Permite Add-on". Input "Custo do Add-on" aparece pré-preenchido com o buy-in.
4. Ajusta se precisar (ex: alguns torneios têm add-on diferente do buy-in).
5. Salva. Torneio entra com `allowsAddOn=true, addOnCost=X, addOnTaken=false`.

### Fluxo D — Jogador esquece o checkbox na criação, vai editar

1. Usa botão Editar no UpcomingCard.
2. `EditTournamentDialog` abre.
3. Marca "Permite Add-on".
4. Salva. Flag é persistida. Na próxima renderização do card, botão `+ Add-on` aparece.

### Fluxo E — Erro de rede

1. Jogador clica `+ Add-on`.
2. PUT falha (rede, 500).
3. Toast vermelho: "Erro ao registrar add-on — tente novamente".
4. Botão volta ao estado anterior (optimistic update revertido via React Query onError).

### Fluxo F — Torneio finalizado com add-on

1. Torneio finaliza (GG, com ou sem prêmio).
2. Card vira `CompletedCard`.
3. Badge muda: em vez de `Plus`, mostra `+ Add-on pago` em dourado (se `addOnTaken=true`).
4. Investimento total no summary modal reflete o add-on.

---

## 6. Critérios de aceitação

Cada bullet = >= 1 teste automatizado.

- [ ] Card "Jogando" renderiza botão `+ Add-on` **somente** se `tournament.allowsAddOn=true`
- [ ] Botão `+ Add-on` aparece **antes** do botão `Resultado` e **depois** do botão `REBUY`
- [ ] Clique no botão chama `onAddOnTaken(tournament.id, true)` com o valor correto
- [ ] Após clique com sucesso, botão muda para estado dourado com texto `Add-on $X pago` onde X = `addOnCost || buyIn`
- [ ] Clique no botão dourado chama `onAddOnTaken(tournament.id, false)` (toggle off)
- [ ] Botão está `disabled` durante mutation em flight (`updateIsPending=true`)
- [ ] Toast de sucesso dispara após PUT 200
- [ ] Toast de erro dispara após PUT 4xx/5xx
- [ ] Dashboard atualiza `totalInvestido` com `+addOnCost` após mutation — via React Query invalidation (não requer reload)
- [ ] Badge "Plus" aparece em `UpcomingCard`, `RegisteredCard` e `CompletedCard` quando `allowsAddOn=true`
- [ ] Em `CompletedCard` com `addOnTaken=true`, badge "Plus" é substituído por badge dourado "+ Add-on pago"
- [ ] `AddTournamentDialog` tem checkbox "Permite Add-on"; marcar revela input "Custo do Add-on"
- [ ] Input "Custo do Add-on" é pré-preenchido com valor de buy-in ao marcar o checkbox
- [ ] `AddTournamentDialog` envia `allowsAddOn` e `addOnCost` no payload de criação
- [ ] `EditTournamentDialog` pré-popula checkbox e input com valores atuais do torneio
- [ ] `EditTournamentDialog` envia updates de `allowsAddOn`/`addOnCost`
- [ ] `SessionDashboard` mostra "Add-ons Pagos: N (total $X)" no resumo final
- [ ] Se `allowsAddOn=false` mas UI permite marcar via race condition, backend retorna 400 (validação cruzada Spec 1) e toast de erro é exibido
- [ ] `handleAddOnTaken` reusa `updateTournamentMutation` já existente em `GrindSessionLive.tsx` (não cria mutation duplicada)
- [ ] Helper `formatAddOnCost` remove `.00` desnecessário ($22.00 → $22, mas $22.50 → $22.50)

---

## 7. Casos de borda

1. **`addOnCost` null com `allowsAddOn=true`**: botão mostra `+ Add-on` e usa `buyIn` como fallback no texto e no cálculo. Mutation envia `addOnTaken: true` sem tocar em `addOnCost`.
2. **Usuário marca add-on, depois edita torneio removendo `allowsAddOn`**: backend aceita? Da Spec 1, `addOnTaken` não pode ser true se `allowsAddOn=false` → backend retorna 400. UI deve **bloquear o unchecking do checkbox** se `addOnTaken=true` no EditDialog, ou limpar `addOnTaken` junto. Decisão: **limpar junto** (mais ergonômico) — EditDialog envia `{ allowsAddOn: false, addOnTaken: false }` quando desmarca.
3. **Torneio tem `addOnCost=0`** (algum usuário maluco): botão mostra `Add-on $0 pago` ao clicar. Fórmula soma 0. Sem bug.
4. **Race: usuário clica 2x rápido**: 2ª click bloqueado por `disabled={updateIsPending}`. Mas se o debounce falhar, mutations chegam em ordem no server → última ganha. Validation Zod garante booleano. Não há double-count.
5. **Torneio finalizado antes da UX (histórico retroativo)**: torneios em `tournaments` com `allowsAddOn=true` (do backfill) — UI da Spec 2 **não aparece no histórico**, só em sessão ativa. Para editar retroativamente: via `EditTournamentDialog` em session_tournaments finalizados na mesma sessão ativa. Em sessão já completa → sem UI (aceitar como limitação v1).
6. **Add-on pago em torneio que o jogador depois re-entrou** (cruza com Spec 3): `reentries=2, addOnTaken=true, addOnCost=5.50, buyIn=5.50` → `totalInvestido = 5.50 * (1+0+2) + 5.50 = 22.00`. Add-on é 1x só; re-entry é o "stack novo". Sem conflito. Badge "Plus + ReA" aparece junto.
7. **Usuário marca Plus em AddDialog mas não digita addOnCost e buyIn está vazio**: Zod exige `buyIn` notNull; se buyIn presente, addOnCost fallback = buyIn. Se nem buyIn nem addOnCost, erro de validação antes do Plus virar questão.
8. **Copy/paste de torneio (duplicar)**: se feature existe, `addOnTaken` **não é copiado** (é ação de instância, não característica). `allowsAddOn` e `addOnCost` **são** copiados. Verificar em `server/routes/grind-sessions.ts` se há duplicação.
9. **Sessão crasha / restaurada**: `addOnTaken` está persistido no banco; ao recarregar, botão já aparece dourado. Coerente com session recovery (commit e3b792b).
10. **Jogador finaliza torneio e percebe que esqueceu de marcar add-on**: hoje a UI só existe em `RegisteredCard`. Edge case: em `CompletedCard`, **adicionar um pequeno botão `+ Add-on`** nos botões de ação (ao lado do Editar). Ou então resolver via EditDialog. **Decisão v1**: via EditDialog (mais simples). Documentar: "Para marcar add-on em torneio já finalizado, clique em Editar e marque o checkbox".
11. **`allowsAddOn=true` e `addOnCost=null` e usuário clica**: mutation envia `addOnTaken: true`. Fórmula: `addOnCost parse → 0`. Adiciona 0 ao investimento. Bug quieto. **Mitigação (movido para Spec 1):** refinement Zod já incluído na Spec 1 (§4.3): `.refine(d => !d.addOnTaken || (d.addOnCost != null && parseFloat(d.addOnCost) > 0))`. UI do Spec 2 valida antes de mandar: se `addOnCost` nulo, **UI do botão exige que usuário abra EditDialog** para preencher `addOnCost` primeiro. Alternativa aceita: mini-prompt inline pedindo valor antes de confirmar.
12. **Add-on pago em torneio onde jogador vai re-entrar (Spec 3 cross-over)**: `addOnTaken` é **booleano único por torneio** na v1. Se jogador pagou add-on na tentativa 1 e re-entra, tentativa 2 vai "herdar" `addOnTaken=true`. Fórmula adiciona o add-on **1 vez só** (está correto se jogador só pagou 1 vez; subcontagem se pagou nas 2 tentativas). Limitação aceita v1. Documentar no tooltip.
13. **Pagamento de add-on em torneio finalizado via EditDialog retroativo**: Zod aceita update parcial `{addOnTaken: true}` após merge com DB (Spec 1 §4.3). Dashboard recalcula ROI automaticamente via React Query invalidation. Teste: torneio finalizado com `allowsAddOn=true, addOnTaken=false, addOnCost=22, buyIn=22` → PUT `{addOnTaken: true}` → dashboard mostra `totalInvestido += 22`.
14. **Backend retorna 400 por refinement novo Spec 1 — `addOnTaken=true` com `addOnCost<=0`**: toast vermelho "Configure o custo do add-on primeiro — clique em Editar." Usuário deve abrir EditDialog para preencher valor antes de marcar o botão.
15. **Histórico de torneios finalizados em sessão anterior (já completa) com `allowsAddOn=true` mas `addOnTaken=false`**: fora do escopo v1 (aceitar como limitação). Usuário ativa a flag retroativamente só via EditDialog em sessão ATIVA. Sessão concluída é imutável para essa propriedade — mudanças têm que ir via endpoint `/api/tournaments/:id` (histórico), não `/api/session-tournaments/:id`.

---

## 8. Impactos em cascata

Arquivos que mudam fora do escopo principal:

- `B:\grindfy\client\src\components\grind-session-live\TournamentCard.tsx` — RegisteredCard (botão + badge), UpcomingCard (badge), CompletedCard (badge variante)
- `B:\grindfy\client\src\components\grind-session-live\AddTournamentDialog.tsx` — checkbox + input
- `B:\grindfy\client\src\components\grind-session-live\EditTournamentDialog.tsx` — checkbox + input
- `B:\grindfy\client\src\components\grind-session-live\SessionDashboard.tsx` — KPI "Add-ons Pagos"
- `B:\grindfy\client\src\components\grind-session-live\helpers.ts` — helper `formatAddOnCost`
- `B:\grindfy\client\src\components\grind-session-live\types.ts` — confirmar que `SessionTournament` e `NewTournamentForm` já têm os campos (da Spec 1). Se não, **bloquear Spec 2** até Spec 1 aplicar.
- `B:\grindfy\client\src\pages\GrindSessionLive.tsx` — handler + prop passing para TournamentCard (linha 1400–1410). Adicionar também no render de `UpcomingCard` e `CompletedCard` se houver botão "+ Add-on retroativo" no CompletedCard (decisão v1 é NÃO — via EditDialog apenas).
- `B:\grindfy\shared\schema.ts` — refinement Zod do caso 11 **já incluído na Spec 1** (não precisa adicionar aqui).
- Testes: `tests/unit/grind-session/` + testes de componente React (se existirem, caso contrário criar smoke tests). Cobertura mínima: 12 casos (1 por bullet de critério de aceitação).

Não afeta:
- Analytics, Dashboard, Library (só consomem totais)
- Auth, permissions, uploads
- Calendar, Studies, AI Coach — recebem dados corrigidos automaticamente

---

## 9. Métricas de sucesso

7 dias pós-deploy:
- **Adoção:** >= 30% dos usuários ativos do Grind Live marcam pelo menos 1 add-on na semana.
- **% torneios Plus com decisão registrada:** >= 60% (usuário ou clicou botão ou finalizou torneio sem clicar → decisão implícita de "não pagou").
- **Quedas em ROI médio semanal:** mediana -5 a -12 pp (em usuários com alto volume Plus).
- **Tickets de suporte relacionados a add-on:** 0.

14 dias pós-deploy:
- **% torneios Plus com addOnTaken explícito** >= 70%.
- **Sem regressões no `GrindSessionLive`** (error rate estável).
- **Time-to-click** (tempo entre registro do torneio e clique no botão): mediana <= 40min (coerente com timing de add-ons reais em torneios de 4-5h).

Sanidade:
- **Taxa de clique no botão dourado para desfazer** < 10% (se alto = UX confusa).

---

## 10. Rollout

- **Feature flag:** desnecessária. UI condicional (`tournament.allowsAddOn`) é self-gating — só aparece quando há dados.
- **Migração:** já feita pela Spec 1.
- **Dependência:** garantir Spec 1 em produção por >= 48h antes de Spec 2 (tempo pra backfill rodar e usuários terem torneios Plus na base).
- **Aviso aos usuários:** toast proativo no primeiro login pós-deploy: "Novo: agora você pode registrar add-on nos torneios Plus. Procure o botão verde `+ Add-on` no card do torneio durante o jogo." (opcional, decisão de produto).
- **Rollback:** `git revert` — UI some, dados permanecem. Spec 1 mantém intacta.

---

## 11. Ações para outros agentes

- **system-architect:**
  - Atualizar fluxograma em `docs/architecture/flows/grind-live/add-on.mermaid` — sequência: clique no botão → mutation → invalidate query → re-render.
  - Documentar estado do botão (verde vs dourado) em tabela de UI states na pasta de componentes.

- **test-writer:**
  - **Áreas críticas:**
    - Renderização condicional do botão baseado em `allowsAddOn`.
    - Toggle (verde↔dourado) com `addOnTaken`.
    - Disabled durante mutation (simular `updateIsPending=true`).
    - Mutation dispara PUT com payload correto.
    - Optimistic update + rollback em erro.
    - `AddTournamentDialog` envia payload com flags.
    - `EditTournamentDialog` pré-popula e atualiza corretamente.
    - Badge "Plus" aparece nos 3 cards quando `allowsAddOn=true`.
    - KPI "Add-ons Pagos" soma e conta corretamente no SessionDashboard.
  - Usar `@testing-library/react` padrão do projeto. Se não há setup de RTL ainda, priorizar testes de integração via hooks + utils.

- **implementer:**
  - **Ordem sugerida:**
    1. Helper `formatAddOnCost` em `helpers.ts` + teste.
    2. Botão no `RegisteredCard` (com prop `onAddOnTaken`).
    3. `handleAddOnTaken` em `GrindSessionLive.tsx` + plugar na prop.
    4. Badge "Plus" em `UpcomingCard`, `RegisteredCard`, `CompletedCard`.
    5. Checkbox + input no `AddTournamentDialog`.
    6. Mesmo em `EditTournamentDialog`.
    7. KPI no `SessionDashboard`.
    8. Refinement Zod adicional (caso 11) se decidido.
  - **Não tocar** em `calculateSessionStats.ts` — já pronto da Spec 1.
  - **Não criar novos endpoints** — reusar PUT existente.

- **reviewer:**
  - Focar em:
    - Acessibilidade: botão tem `title` útil, cor não é único sinal (usa texto + ícone).
    - Optimistic update vs invalidation — garantir que UI nunca fica dessincronizada em erro.
    - Mobile: botões não quebram layout em 360px (vertical stack já configurado no CSS atual: `flex flex-col sm:flex-row`).
    - UX: botão dourado claramente distingue de botão Rebuy (cores distintas — amber/gold vs green/yellow/red).
    - Testar manualmente: torneio sem `allowsAddOn` → botão não aparece; com `allowsAddOn` → botão aparece; com `addOnTaken` → dourado.
    - Validar que `onAddOnTaken` está sendo passado corretamente em todos os lugares que renderizam `RegisteredCard`.
