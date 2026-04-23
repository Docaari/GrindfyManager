# Grind Live — Re-Entry Flow (separar Rebuy, modal pós-busto, KPI Entradas Totais)

**ID:** spec-addon-rea-reentry-flow
**Data:** 2026-04-23
**Status:** Draft
**Prioridade:** Alta
**Estimativa:** M
**Dependências:** `spec-addon-rea-foundation` (`addon-rea-schema-foundation.md`) — **obrigatória**. Campos `allowsReentry`, `maxReentries`, `reentries` em `session_tournaments` e fórmula de cálculo precisam estar no banco antes desta spec.

Pode ser deployada em paralelo com `spec-addon-rea-addon-ux` (`grind-live-addon-ux.md`) mas é independente dela. **Sugere-se deployar Spec 2 (Add-on) primeiro — é mais simples e ganha um quick win de precisão no ROI antes do flow mais complexo de ReA.**

---

## 1. Problema

### User story
> "Como jogador profissional de MTT, hoje, quando busto em um torneio ReA (Re-entry Allowed) e decido re-entrar, eu clico em REBUY no Grindfy porque é o único botão disponível. Mas rebuy é conceitualmente diferente: rebuy é comprar stack adicional estando vivo; re-entry é uma entrada completamente nova após busto. O sistema conta `rebuys++` e distorce relatórios. Em uma sessão de 40 torneios onde 15 são ReA e eu re-entro em 6, meus dados ficam inutilizáveis para analisar ABI, ROI por torneio, ou estudar qual estrutura performa."

### Quantificação (auditoria /grind-live)

| Métrica | Leak | Nota |
|---------|------|------|
| Volume de torneios ReA | **~15% dos torneios** jogados (festivais dobram) | Base para cálculo de impacto |
| Taxa de re-entry em torneios ReA | **~40%** dos ReA viram 2+ entradas | Jogador re-entra na maioria quando o spot é soft |
| Erro em ABI | **~22% de desvio** nos torneios ReA | ABI reportado mais baixo do que realidade (não soma a 2ª entrada corretamente como buy-in novo) |
| Erro em ROI | **-5 a -10 pp** em direção errada | Depende de como profit/loss é alocado por "torneio" vs "entrada" |
| Confusão semântica no Dashboard | "Rebuys" inclui re-entries | KPI perde significado, análise fica suspeita |

### Quem sofre

- Jogadores profissionais que jogam festivais (KO Series, WCOOP, SCOOP): **toda semana**, 6-20 torneios ReA.
- Jogadores cash-volume: **5-10x por semana**.
- Em média: **1-3 re-entries por sessão** para um grinder típico.

### Por que um botão diferente importa

1. **Semântica correta:** Rebuy vivo ≠ Re-entry pós-busto. Estatísticas dependem disso.
2. **Flow interrompe o jogador no momento certo:** Após clique em GG, pergunta "Re-entrar?" — oportunidade de 1 clique para decisão importante.
3. **Preparação para analytics futuro:** Cálculo de EV/entrada, breakdown por tentativa, heatmap de re-entry rate por horário/site.

---

## 2. Objetivo

**Outcome mensurável (14 dias pós-deploy):**

1. **% torneios ReA com `reentries > 0` na sessão** reflita a realidade: >= 30% dos ReA jogados (coerente com 40% taxa real, considerando subregistro residual).
2. **ABI médio por site em torneios ReA** suba em mediana **18-25%** comparado à semana pré-deploy (corrigindo o erro de ~22%).
3. **KPI "Entradas Totais"** aparece no SessionDashboard e é sempre >= volume de torneios; delta = número de re-entries.
4. **Taxa de uso do botão "Re-entrar"** vs clique acidental em "GG definitivo": 70%+ dos torneios ReA bustados têm decisão explícita registrada (sem modal fechado por escape).
5. **Zero regressão** no fluxo de Rebuy existente — torneios não-ReA continuam com UX idêntica.

---

## 3. Escopo

### Incluído

- **Separação semântica de Rebuy e Re-entry:**
  - Botão `REBUY` continua existindo para torneios com rebuy tradicional (mantém UX atual).
  - Novo flow `Re-entry` é disparado **após clique em GG**, não é um botão persistente.
- **Modal "Bustou. Re-entrar?"** após clique GG em torneio com `allowsReentry=true` e `(maxReentries == null || reentries < maxReentries)`.
- Incremento de `reentries` no `session_tournaments` e reset de `status` para `registered`.
- Badge "ReA" ao lado dos badges Site/Tipo/Velocidade no card.
- Badge contador "Tentativa N+1/max" ou "Tentativa N+1/∞" quando `reentries > 0`.
- KPI novo **"Entradas Totais"** no `SessionDashboard` = `volume + Σ reentries`.
- Checkbox "Permite Re-entry" + input "Máx. re-entradas" (opcional, null=ilimitado) em `AddTournamentDialog` e `EditTournamentDialog`.
- Handler `handleReentry` em `GrindSessionLive.tsx` separado do `handleRebuyTournament` existente.
- Integração com o summary modal: re-entries aparecem no cálculo final.

### Fora do escopo (explícito)

- **Não mudar o botão REBUY** — continua para torneios de rebuy. `handleRebuyTournament` em `GrindSessionLive.tsx:922` permanece intocado.
- **Não tocar em Add-on** — Spec 2.
- **Não tocar em cálculo de `totalInvestido`** — fórmula da Spec 1 já inclui `reentries`.
- **Não tocar em analytics/dashboard de histórico** — KPI novo é só no SessionDashboard ao vivo; histórico passa a refletir automaticamente via agregação.
- **Não implementar multi-entry tracking com timestamps por tentativa** — incrementa contador simples. Analytics futuro pode desnormalizar se necessário.
- **Não tratar "fire-re-entry" (re-entrar antes mesmo de bustar, que alguns sites permitem)** — é comportamento raro; tratar como edge case v2.
- **Não alterar `planned_tournaments`** na UX de re-entry — só `session_tournaments` (instância de jogo). Planned só recebe `allowsReentry` e `maxReentries` como configuração.
- **Não permitir decrementar `reentries`** (retornar de 2 para 1) — apenas incrementar. Se houver bug, corrigir via EditDialog (campo "Re-entries" editável).

---

## 4. Solução técnica

### 4.1 Schema

Nenhuma mudança. Spec 1 já adicionou: `allowsReentry`, `maxReentries`, `reentries` em `session_tournaments`, `planned_tournaments`, `tournament_library`.

### 4.2 API

#### Endpoint usado

**PUT `/api/session-tournaments/:id`** — usado para:
- `{ reentries: N+1, status: 'registered' }` (ao re-entrar, volta ao status ativo)
- `{ allowsReentry: true, maxReentries: 5 }` (via Edit dialog)

#### Validação adicional (Zod, em `shared/schema.ts`)

Já contemplado na Spec 1 (refinement `reentries <= maxReentries`), mas reforçar:

```ts
.refine(
  d => d.status !== 'registered' || !d.hasPreviousFinishedSameInstance,
  // Aqui o refinement é aplicado no backend ao processar o PUT,
  // checando se o torneio estava em 'finished' antes do incremento.
)
```

Em `server/routes/grind-sessions.ts`, no handler do PUT de `session-tournaments`:

```ts
// Se status mudando de 'finished' para 'registered' E reentries incrementou:
if (existing.status === 'finished' && body.status === 'registered' && body.reentries > existing.reentries) {
  if (!existing.allowsReentry) return res.status(400).json({ message: "Torneio não permite re-entrada" });
  const max = existing.maxReentries;
  if (max != null && body.reentries > max) {
    return res.status(400).json({ message: `Excede limite de re-entradas (max ${max})` });
  }
  // OK: aceitar incremento + reset status. Resetar também: position=null, result=0, bounty=0 (limpar registro da tentativa anterior já registrada? Decidir).
}
```

**Decisão: o que fazer com prize/bounty/position da tentativa anterior ao re-entrar?**

Opções:
- **A. Zerar** campos `prize`, `bounty`, `position` — nova tentativa é um registro limpo. Perde dado histórico (posição bustada em tentativa 1).
- **B. Preservar** os campos e aceitar que só a última tentativa fica registrada.
- **C. Acumular** — somar prize/bounty de cada tentativa. Position = melhor. **Semanticamente mais correto** para ROI (premiação total é soma das tentativas).

**Decisão v1: C (acumular), com simplificação prática.**

Como no fluxo v1 o **frontend NÃO envia prize/bounty no payload de re-entry** (ver §4.3), a acumulação backend é parcial:

- **Tentativa 1 termina SEM premiação** (jogador bustou, clicou GG, re-entrou no modal): `prize` fica `0`, `bounty` fica `0`, `position` fica `null`. Nenhum dado a acumular.
- **Tentativa 1 termina COM premiação** (jogador marcou Resultado antes de re-entrar): fluxo v1 descarta esse registrationData (§4.3 decisão a). Na prática, "re-entrar após premiação" é cenário raro em ReA (já ganhou prize do torneio = fez mesa final = não vai re-entrar). Se ocorrer, jogador edita via EditDialog após.
- **Tentativa N (última, não re-entra)**: prize/bounty/position SÃO registrados normalmente via `applyFinishWithRegistrationData`.

**Implementação no backend** (`server/routes/grind-sessions.ts:706` handler PUT):

```ts
// Se transição finished → registered E reentries incrementou:
if (existing.status === 'finished' && body.status === 'registered' &&
    (body.reentries || 0) > (existing.reentries || 0)) {
  // Validação (movida de Zod, porque cruza body com existing)
  if (!existing.allowsReentry) return res.status(400).json({ message: "Torneio não permite re-entrada" });
  const max = existing.maxReentries;
  if (max != null && body.reentries > max) {
    return res.status(400).json({ message: `Excede limite de re-entradas (max ${max})` });
  }
  // Decisão C: NÃO zerar prize/bounty/position. O cliente não envia esses campos
  // no re-entry payload; se alguém enviar no futuro, faça o merge acumulativo:
  // prize_final = COALESCE(body.prize, 0) + existing.prize
  // bounty_final = COALESCE(body.bounty, 0) + existing.bounty
  // position_final = LEAST(body.position, existing.position) ignorando nulls
  // Por ora (v1), basta passar os campos existentes adiante.
  body.endTime = null; // limpa endTime da tentativa anterior
}
```

Isso espelha como os CSVs de PokerStars/WPN agregam resultados ReA: uma linha por torneio com o resultado consolidado. **Simplifica analytics futuro.**

**Teste obrigatório:** `position_final = min(posição mais profunda)` considerando null-safety. Se `existing.position=42` e nova tentativa busta em `58`, campo final é `42`. Se existing=null e nova=3, campo final é `3`. Usar `LEAST(NULLIF(a, NULL), NULLIF(b, NULL))` ou lógica equivalente.

### 4.3 UI

#### Modal de confirmação pós-GG

Arquivo novo sugerido: `B:\grindfy\client\src\components\grind-session-live\ReentryConfirmDialog.tsx`.

Estrutura:
```tsx
// Em GrindSessionLive.tsx (chamada do Dialog):
<ReentryConfirmDialog
  open={showReentryDialog}
  onOpenChange={(open) => {
    // ESC ou backdrop click → tratado como "GG definitivo" (invariante #4)
    if (!open && currentReentryTournament) {
      handleConfirmBust();
    }
  }}
  tournamentName={generateTournamentName(currentReentryTournament)}
  buyIn={currentReentryTournament?.buyIn ?? '0'}
  currentReentries={currentReentryTournament?.reentries ?? 0}
  maxReentries={currentReentryTournament?.maxReentries ?? null}
  onConfirmReentry={handleConfirmReentry}
  onConfirmBust={handleConfirmBust}
/>

// Dentro de ReentryConfirmDialog.tsx:
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="bg-gray-900 border-2 border-amber-500/60 text-white max-w-sm">
    <DialogHeader>
      <DialogTitle className="text-lg font-bold flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-amber-400" />
        Bustou no {tournamentName}
      </DialogTitle>
    </DialogHeader>
    <div className="space-y-4 pt-2">
      <p className="text-sm text-gray-300">
        Este torneio permite <span className="font-semibold text-amber-400">re-entrada</span>.
        {maxReentries != null && (
          <> Você já fez <span className="font-bold">{currentReentries}</span> de{' '}
          <span className="font-bold">{maxReentries}</span> re-entradas permitidas.</>
        )}
      </p>
      <p className="text-xs text-gray-400">
        Investimento atual da tentativa: ${buyIn}. Re-entrar adicionará mais ${buyIn} ao total.
      </p>
      <div className="flex flex-col gap-2 pt-2">
        <Button
          onClick={onConfirmReentry}
          disabled={atMax}
          className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold h-12"
        >
          <RotateCw className="w-4 h-4 mr-2" />
          Sim, re-entrar
        </Button>
        <Button
          variant="outline"
          onClick={onConfirmBust}
          className="border-gray-600 bg-gray-700 hover:bg-gray-600 text-white h-10"
        >
          Não, GG definitivo
        </Button>
      </div>
      {atMax && (
        <p className="text-xs text-red-400 text-center">
          Limite de re-entradas atingido.
        </p>
      )}
    </div>
  </DialogContent>
</Dialog>
```

**Props:**
```ts
interface ReentryConfirmDialogProps {
  open: boolean;
  tournamentName: string;
  buyIn: string;
  currentReentries: number;
  maxReentries: number | null;
  onConfirmReentry: () => void;
  onConfirmBust: () => void;
  onOpenChange: (open: boolean) => void;
}
```

#### Integração com `handleFinishTournamentDirect` em `GrindSessionLive.tsx`

**Correção de nome:** o handler real em `GrindSessionLive.tsx:142` chama-se `handleFinishTournamentDirect` (não `handleFinishTournamentDirect`). Prop passada ao TournamentCard via `onFinishDirect={handleFinishTournamentDirect}` em `GrindSessionLive.tsx:1407`. O callback no TournamentCard chama `onFinishDirect(tournament.id)` em 2 lugares (linha 241 botão GG, linha 341 "Salvar e Finalizar" do result dialog).

**Complexidade adicional:** `handleFinishTournamentDirect` atualmente (linhas 142-163) **já tem lógica** de ler `registrationData` (prize/bounty/position digitados pelo jogador no result dialog) e enviar no update quando presente. O refactor para ReA **NÃO deve quebrar esse fluxo**. Abordagem correta:

Refactor:
```ts
const handleFinishTournamentDirect = (tournamentId: string) => {
  const tournament = sessionTournaments?.find(t => t.id === tournamentId);
  if (!tournament) return;

  const canReenter = !!tournament.allowsReentry && (
    tournament.maxReentries == null ||
    (tournament.reentries || 0) < tournament.maxReentries
  );

  if (canReenter) {
    // Abre modal ANTES de finalizar. registrationData preservado — se usuário
    // clicar "GG definitivo", seguimos o fluxo existente de aplicar prize/bounty.
    setReentryDialog({ open: true, tournament });
    return;
  }

  // Fluxo atual preservado: aplica prize/bounty do registrationData se houver
  applyFinishWithRegistrationData(tournament);
};

// Extrair lógica atual (linhas 143-162) para função dedicada:
const applyFinishWithRegistrationData = (tournament: any) => {
  const entryData = registrationData[tournament.id];
  const hasBounty = entryData?.bounty && entryData.bounty.trim() !== '';
  const hasPrize = entryData?.prize && entryData.prize.trim() !== '';
  const hasPosition = entryData?.position && entryData.position.trim() !== '';

  let updateData: any = { status: 'finished', endTime: new Date().toISOString() };
  if (hasBounty || hasPrize || hasPosition) {
    updateData.bounty = normalizeDecimalInput(entryData?.bounty || '0');
    updateData.result = normalizeDecimalInput(entryData?.prize || '0');
    updateData.position = hasPosition ? parseInt(entryData.position) : null;
  } else {
    updateData.result = '0'; updateData.bounty = '0'; updateData.position = null;
  }
  updateTournamentMutation.mutate({ id: tournament.id, data: updateData });
  setRegistrationData(prev => { const u = { ...prev }; delete u[tournament.id]; return u; });
};

// Fila de modais (§edge case 7):
const [reentryQueue, setReentryQueue] = useState<any[]>([]);
const currentReentryTournament = reentryQueue[0] ?? null;

const handleConfirmReentry = () => {
  const t = currentReentryTournament;
  if (!t) return;
  // Ao re-entrar: incrementa reentries, volta status, limpa endTime.
  // Prize/bounty/position acumulados SÃO preservados (decisão C no backend).
  // registrationData pendente para tentativa atual é descartado (nova tentativa começa limpa).
  updateTournamentMutation.mutate({
    id: t.id,
    data: {
      reentries: (t.reentries || 0) + 1,
      status: 'registered',
      endTime: null,
      // NÃO enviar prize/bounty/position — backend os acumula se já preenchidos
    },
  });
  setRegistrationData(prev => { const u = { ...prev }; delete u[t.id]; return u; });
  setReentryQueue(q => q.slice(1)); // avança fila
};

const handleConfirmBust = () => {
  const t = currentReentryTournament;
  if (!t) return;
  // "GG definitivo" do modal segue o MESMO fluxo que o handleFinishTournamentDirect
  // teria seguido se não houvesse re-entry — aplica prize/bounty do registrationData.
  applyFinishWithRegistrationData(t);
  setReentryQueue(q => q.slice(1)); // avança fila
};

// Em handleFinishTournamentDirect, onde era `setReentryDialog({ open: true, tournament })`:
// trocar por:
//   setReentryQueue(q => [...q, tournament]);
```

**Crítico:** o refactor preserva o fluxo do "result dialog" existente no `RegisteredCard` (linhas 249-351 do TournamentCard.tsx). Usuário pode seguir fluxo: clicar Resultado → preencher prize/bounty → clicar "Salvar e Finalizar" (linha 340 chama `onFinishDirect`) → modal de re-entry aparece SE for ReA → se clicar "Sim re-entrar", prize/bounty preenchido **ainda não foi aplicado** ao banco (está em `registrationData` client-side). Duas escolhas: (a) **jogar fora** o registrationData preenchido ao re-entrar (v1, mais simples), ou (b) **aplicar + incrementar reentries** em 2 PUTs (mais fiel). **Decisão v1: (a) — descartar** — se o jogador registrou prize parcial da tentativa 1 e decide re-entrar, ele edita depois via EditDialog. Documentar no modal: "Re-entrar descarta o prize/posição digitados desta tentativa."

#### Badges em `TournamentCard.tsx`

Ao lado dos badges de Site/Tipo/Velocidade (linhas 127–143, 417–445, 589–604):

```tsx
{tournament.allowsReentry && (
  <Badge className="px-1.5 py-0.5 bg-purple-600 text-white font-semibold">
    ReA
  </Badge>
)}
{tournament.reentries > 0 && (
  <Badge className="px-1.5 py-0.5 bg-purple-700 text-white font-semibold">
    Tentativa {(tournament.reentries || 0) + 1}
    {tournament.maxReentries != null ? `/${tournament.maxReentries + 1}` : `/∞`}
  </Badge>
)}
```

**Nota:** "Tentativa N+1" = 1 original + N re-entries. Se `reentries=2`, está na 3ª tentativa. `maxReentries=3` permite 4 tentativas totais — portanto max na UI é `maxReentries + 1`.

#### `AddTournamentDialog.tsx` — checkbox + input

Análogo ao add-on (Spec 2):
```tsx
<div className="flex items-center gap-3">
  <Checkbox
    id="allowsReentry"
    checked={form.allowsReentry}
    onCheckedChange={c => setForm({ ...form, allowsReentry: !!c })}
  />
  <label htmlFor="allowsReentry" className="text-sm text-gray-200 cursor-pointer">
    Permite Re-entry (ReA)
  </label>
</div>
{form.allowsReentry && (
  <div className="ml-6">
    <label className="text-xs text-gray-400 mb-1 block">
      Máx. re-entradas (vazio = ilimitado)
    </label>
    <Input
      type="number"
      min="1"
      step="1"
      value={form.maxReentries ?? ''}
      onChange={e => setForm({
        ...form,
        maxReentries: e.target.value ? parseInt(e.target.value) : null
      })}
      placeholder="Ilimitado"
      className="..."
    />
  </div>
)}
```

#### `EditTournamentDialog.tsx`

Mesmo, pré-populado. Adicional: **campo `reentries` editável** (número simples) para correção manual caso o usuário precise ajustar retroativamente.

```tsx
{tournament.allowsReentry && (
  <div className="ml-6 mt-2">
    <label className="text-xs text-gray-400 mb-1 block">Re-entradas feitas</label>
    <Input
      type="number"
      min="0"
      max={tournament.maxReentries ?? undefined}
      value={form.reentries}
      onChange={e => setForm({ ...form, reentries: parseInt(e.target.value) || 0 })}
    />
  </div>
)}
```

#### `SessionDashboard.tsx` — KPI "Entradas Totais"

```tsx
<div className="bg-gray-900/50 border border-gray-700 rounded p-3">
  <div className="text-xs text-gray-400">Entradas Totais</div>
  <div className="text-lg font-bold text-purple-400">
    {totalEntries}
    {totalEntries > volume && (
      <span className="text-xs text-gray-500 ml-1">
        ({volume} torneios + {totalEntries - volume} re-entries)
      </span>
    )}
  </div>
</div>
```

Onde `totalEntries = volume + sum(t.reentries || 0 for all session tournaments)`.

### 4.4 Lógica de negócio

#### Invariantes

1. **`reentries` só incrementa** via flow de re-entry ou EditDialog manual. Nunca via REBUY.
2. **`rebuys` continua independente** — torneios podem ter ambos (raro: ReA com rebuy permitido). Um clique em REBUY só incrementa rebuys; um confirmar no modal só incrementa reentries.
3. **Modal só aparece** se `allowsReentry=true` e `reentries < maxReentries` (ou maxReentries=null).
4. **Se jogador fecha modal por ESC ou clica fora**: comportamento = cancelar (nenhum update). Torneio permanece em `status='registered'` — **bug importante**: jogador vê card ainda como "Jogando" mas ele bustou. **Decisão UX**: modal `onOpenChange` com ESC ou backdrop click **é tratado como "GG definitivo"** (finaliza). Só "Sim, re-entrar" re-abre o torneio. Documentar claramente no tooltip/hint.
5. **Se `allowsReentry=true` mas `maxReentries=0`**: tratar como `allowsReentry=false` efetivamente (sem modal, finaliza direto). Regra: `atMax = (maxReentries != null && reentries >= maxReentries)`.
6. **Re-entry preserva** `addOnTaken` (Spec 2) — se o jogador pagou add-on na tentativa 1 e re-entrou, segunda tentativa "herda" `addOnTaken=true`. Na prática isso é errado (add-on é por tentativa), mas v1 trata como flag única do torneio. v2 pode desambiguar.
7. **`prize`, `bounty`, `position` acumulados** conforme decisão C. UI do EditDialog permite corrigir manualmente se necessário.

#### Fórmula já pronta (Spec 1)

```ts
totalInvestido = buyIn * (1 + rebuys + reentries) + (addOnTaken ? addOnCost : 0)
```

Esta spec apenas **dispara** o incremento correto de `reentries`. Não toca na fórmula.

---

## 5. Fluxo do usuário

### Fluxo A — Jogador busta em ReA e decide re-entrar

1. Jogador está com torneio "Bounty Builder ReA $22" em "Jogando" (badge `ReA` roxo visível).
2. Jogador vai all-in pré-flop e perde — bustou.
3. Clica em **GG!** (botão vermelho no card).
4. **Em vez de finalizar direto**, abre modal:
   > **"Bustou no Bounty Builder ReA $22"**
   > Este torneio permite re-entrada. Você já fez **0** de **∞** re-entradas permitidas.
   > Investimento atual: $22. Re-entrar adicionará $22 ao total.
   > [**Sim, re-entrar**] [Não, GG definitivo]
5. Jogador clica "Sim, re-entrar".
6. Mutation PUT: `{ reentries: 1, status: 'registered' }`.
7. Modal fecha. Card permanece em "Jogando". Badge "Tentativa 2" aparece roxo escuro ao lado do badge "ReA". Dashboard atualiza `totalInvestido` (+$22), `Entradas Totais` (+1).
8. Jogador volta ao Grind.

### Fluxo B — Jogador busta e decide NÃO re-entrar

1. Passos 1-4 idênticos ao Fluxo A.
2. Jogador clica "Não, GG definitivo".
3. Mutation PUT: `{ status: 'finished' }`. `reentries` não muda.
4. Modal fecha. Card move para "Finalizados".

### Fluxo C — Jogador fecha modal por ESC / clica fora

1. Passos 1-4 idênticos.
2. Jogador aperta ESC ou clica no backdrop.
3. **Tratado como GG definitivo** (item 4 da seção de invariantes). Torneio finaliza.
4. **Mitigação**: opcionalmente, em v1.1, mostrar um toast discreto "Torneio finalizado sem re-entry — use Editar se foi acidental".

### Fluxo D — Jogador atinge limite de re-entradas

1. `maxReentries=3, reentries=3` (4ª tentativa foi bustada).
2. Jogador clica GG.
3. Modal abre mas botão "Sim, re-entrar" está **disabled**. Texto vermelho: "Limite de re-entradas atingido."
4. Opção disponível: "Não, GG definitivo".
5. Jogador finaliza.

### Fluxo E — Torneio com Rebuy E Re-entry (raro mas existe)

1. Torneio "SuperSunday PKO Plus ReA" com `allowsRebuy` (implícito via botão persistente) e `allowsReentry=true`.
2. Jogador está jogando. Pode:
   - **Clicar REBUY** (enquanto vivo, para stack adicional) → `rebuys++`.
   - **Bustar → clicar GG → confirmar re-entry** → `reentries++`.
3. Ambos contadores independentes. Fórmula soma ambos.

### Fluxo F — Jogador cria torneio ReA pelo AddDialog

1. Clica "+ Torneio".
2. Preenche. Marca checkbox "Permite Re-entry (ReA)".
3. (Opcional) Preenche "Máx. re-entradas" = 3. Deixa vazio = ilimitado.
4. Salva. Torneio entra com `allowsReentry=true, maxReentries=3 ou null, reentries=0`.

### Fluxo G — Correção manual via EditDialog

1. Jogador percebe que clicou GG definitivo em um torneio ReA quando deveria ter re-entrado (ou o inverso: modal fechou por ESC acidental).
2. Abre Editar no `CompletedCard` (ou no `RegisteredCard` via botão Editar — verificar se existe).
3. `EditTournamentDialog` abre.
4. Ajusta campo "Re-entradas feitas" para valor correto.
5. (Se o torneio ficou 'finished', pode precisar também mudar status — decisão: se `reentries` muda para número que **deveria** indicar ativo, usuário precisa marcar status manualmente. Ou mantemos limitação: EditDialog não muda status, só valores).
6. Salva. Dashboard recalcula.

---

## 6. Critérios de aceitação

- [ ] Clique em GG em torneio com `allowsReentry=true` e `reentries < maxReentries` (ou maxReentries=null) **abre modal** em vez de finalizar
- [ ] Clique em GG em torneio com `allowsReentry=false` **finaliza direto** (comportamento atual preservado)
- [ ] Clique em GG em torneio com `allowsReentry=true` e `reentries >= maxReentries` **abre modal** mas botão "Sim, re-entrar" está disabled
- [ ] Modal exibe nome correto do torneio, buy-in correto, contagem atual de re-entries, max correto (ou "∞")
- [ ] "Sim, re-entrar" dispara PUT com `{ reentries: N+1, status: 'registered' }`
- [ ] "Não, GG definitivo" dispara PUT com `{ status: 'finished' }` e não toca em reentries
- [ ] Fechar modal via ESC ou backdrop click equivale a "GG definitivo" (torneio finaliza)
- [ ] Card do torneio, após re-entry, **permanece como "Jogando"** (status='registered')
- [ ] Badge "ReA" aparece em todos 3 modos do `TournamentCard` quando `allowsReentry=true`
- [ ] Badge "Tentativa N+1" aparece quando `reentries > 0`, com notação `/max` ou `/∞`
- [ ] Dashboard KPI "Entradas Totais" = volume + sum(reentries); mostra breakdown quando há re-entries
- [ ] `totalInvestido` incrementa corretamente após re-entry (fórmula Spec 1 já testada)
- [ ] `handleRebuyTournament` existente não é tocado — clique em REBUY continua incrementando `rebuys`, não `reentries`
- [ ] `AddTournamentDialog` envia `allowsReentry` e `maxReentries` no payload
- [ ] `EditTournamentDialog` pré-popula, permite editar `allowsReentry`, `maxReentries` e `reentries`
- [ ] Validação cruzada: PUT com `reentries > maxReentries` retorna 400 (da Spec 1)
- [ ] Validação cruzada: PUT com `reentries > 0` e `allowsReentry=false` retorna 400
- [ ] Acumulação de prize/bounty/position em re-entries (decisão C) — se tentativa 1 teve prize=$10 e tentativa 2 teve prize=$50, campo final é $60; position final é o melhor dos dois
- [ ] Backend (handler do PUT) valida a transição `finished → registered` (disparada por re-entry) apenas se `allowsReentry=true` e `reentries` incrementou
- [ ] KPI "Entradas Totais" atualiza em tempo real via React Query invalidation
- [ ] Summary modal (`SessionSummaryModal.tsx`) mostra métricas consistentes com dashboard ao vivo (também inclui Entradas Totais)
- [ ] Botão REBUY **não** aparece substituído ou alterado em torneios ReA — ambos coexistem
- [ ] Tooltip no modal ou no botão explica claramente: "Re-entrar = nova entrada após bustar"
- [ ] Handler real se chama `handleFinishTournamentDirect` (não `handleFinishTournamentDirect`) — implementer confirma nome no arquivo existente antes de refatorar
- [ ] Função `applyFinishWithRegistrationData` extraída do handler original sem perder comportamento atual (prize/bounty/position via registrationData)
- [ ] Fluxo: clicar Resultado → preencher prize → clicar Salvar → modal ReA aparece → clicar "Sim re-entrar" → registrationData é descartado, reentries incrementa, status volta a registered
- [ ] Fila de modais: 3 GGs disparados em rápida sucessão em torneios ReA diferentes → modais aparecem em sequência, cada decisão registrada
- [ ] Reentry preserva `prize=0, bounty=0, position=null` quando tentativa anterior bustou sem premiação
- [ ] Backend acumula prize/bounty corretamente quando payload explicitamente envia valores (futuro-proof, mesmo que v1 frontend não envie)
- [ ] `position_final = min(existing, new)` com null-safety (se ambos são 42 e 3, fica 3; se um é null, usa o outro)
- [ ] `handleConfirmEndSession` continua funcionando: finaliza pendentes com result=0, não abre modal ReA em massa
- [ ] Campo `endTime` é resetado para null ao re-entrar (torneio volta a "em andamento")
- [ ] Char `∞` renderiza corretamente no badge "Tentativa N/∞" em desktop e mobile (Safari iOS incluso)

---

## 7. Casos de borda

1. **Torneio com `allowsReentry=true` mas também `allowsRebuy` (raro)**: ambos botões/flows coexistem. Jogador pode rebuy vivo e re-entry após bustar. Contadores independentes. Fórmula: `buyIn * (1 + rebuys + reentries)`.

2. **Add-on pago + re-entry**: como noted no caso 6 da Spec 2 — `addOnTaken=true` é booleano único. Se pagou na tentativa 1, segunda tentativa herda a flag. Pode resultar em sub-contagem: se jogador pagou add-on nas 2 tentativas, v1 conta só 1. **Limitação aceita**. Documentar.

3. **Re-entry em torneio já finalizado**: não é possível via UI (modal só abre após clique no GG). Via EditDialog, editar `reentries` em torneio finalizado também não retorna ao estado "jogando" — só reflete retroativamente no cálculo. Se jogador quer continuar jogando, precisa recriar manualmente (edge case extremo).

4. **Re-entry preserva posição anterior**: `position` da tentativa 1 foi registrada (ex: bustou 42º). Na tentativa 2, jogador faz mesa final (posição 3). Decisão C → `position = min(42, 3) = 3`. Se jogador bustar de novo posição 58 na tentativa 3: `min(3, 58) = 3`. Campo guarda o melhor. Testar.

5. **`maxReentries=0`**: invariante 5 diz tratar como `allowsReentry=false`. Testar edge — ao clicar GG, modal não aparece; finaliza direto.

6. **Rede cai durante confirm do re-entry**: modal em loading; se falha → reverte; toast de erro; torneio permanece em 'registered' (não finaliza nem re-entra). Jogador pode tentar de novo.

7. **Dois torneios bustam "ao mesmo tempo"** (jogador multi-tableando): 2 modais empilhados — Radix Dialog não suporta nativamente.

    **Decisão v1 DEFINITIVA: FILA.** Estado `reentryDialog` vira `reentryQueue: Tournament[]` (array). Novo GG em torneio ReA faz `push`. Modal exibe sempre o `queue[0]`. Ao clicar "Sim re-entrar" ou "Não GG definitivo", faz `shift` e re-renderiza com o próximo. Isso preserva decisão explícita em cada torneio.

    Implementação:
    ```ts
    const [reentryQueue, setReentryQueue] = useState<any[]>([]);
    const currentReentryTournament = reentryQueue[0] ?? null;
    const showReentryDialog = !!currentReentryTournament;

    // Em handleFinishTournamentDirect, trocar setReentryDialog por:
    setReentryQueue(q => [...q, tournament]);

    // Em handleConfirmReentry/handleConfirmBust, trocar setReentryDialog(false) por:
    setReentryQueue(q => q.slice(1));
    ```

    Importante: guardar **referência ao torneio** (não só ID), pois se o torneio vier do array `sessionTournaments` e ele mudar entre GG e confirmação, a fila deve preservar o snapshot.

8. **Jogador edita `reentries` via EditDialog de 2 para 5 num torneio com `maxReentries=3`**: backend rejeita com 400. UI captura erro e exibe no form: "Valor excede máximo permitido (3)".

9. **Jogador marca `allowsReentry=false` via EditDialog num torneio que já tem `reentries=2`**: analogo ao caso 2 da Spec 2. Decisão: **UI bloqueia** desmarcar enquanto `reentries > 0`. Tooltip: "Zere as re-entradas antes de desabilitar ReA".

10. **Torneio com `allowsReentry=true` criado antes da Spec 3 estar deployada**: Spec 1 já fez backfill. UI da Spec 3 ao ser deployada simplesmente começa a funcionar — torneios antigos ganham o badge ReA, e novos GGs disparam o modal. Compat retroativa.

11. **Snapshot da sessão (session recovery)**: `reentries` está persistido. Ao reabrir sessão interrompida, torneio volta com o contador correto. Sem bug.

12. **Re-entry dispara recálculo de KPI "Entradas Totais"**: ao mutation onSuccess, invalidar query correta. Testar que o número incrementa sem reload manual.

13. **Jogador cria torneio com `maxReentries=null` e depois edita para `maxReentries=1` quando já tem `reentries=3`**: UI bloqueia (validation) ou aceita e backend rejeita. **Decisão**: frontend valida antes — input `maxReentries` tem `min={tournament.reentries}` quando em edit mode, prevenindo set abaixo.

14. **Suporte a `fire re-entry` (re-entry enquanto ainda vivo, antes de bustar)**: raro. Para v1, NÃO suportado — botão não expõe re-entry enquanto status='registered' a não ser via GG. Jogador que quiser "fogo" precisa usar REBUY como workaround ou aceitar que v1 não contempla. v2 pode adicionar botão separado.

15. **Torneio com `allowsReentry=true` e `reentries > 0` mas `allowsAddOn=false`**: compatível. Apenas re-entry visível/ativo. Sem impacto.

16. **Jogador busta quando late-reg já fechou (reg period over)**: algumas redes permitem ReA só dentro do late-reg. Backend Grindfy não conhece esse estado. v1: modal aparece igualmente; se jogador clicar "Sim", backend aceita (não valida janela de tempo). Jogador precisa saber se o torneio ainda permite re-entrar. Limitação documentada.

17. **Jogador clica "Sim re-entrar" mas late-reg fechou na rede real**: o torneio real não permite re-buy-in, mas o Grindfy incrementa `reentries` mesmo assim. Resultado: investimento inflado. Mitigação: confiar no jogador (self-report). Na v2, integração com rede pode validar.

18. **Usuário dispara re-entry por GG acidental, percebe, e o modal já registrou**: se usuário clicou "Sim re-entrar" sem querer, `reentries` incrementou. Para corrigir: abrir EditDialog → reduzir `reentries` para valor correto. UI do EditDialog aceita decremento (§4.3 tem input "Re-entradas feitas" editável sem lock).

19. **Fechamento de sessão com torneio ReA ainda em `status=registered` pós-re-entry**: handler `handleConfirmEndSession` (linha 200 em GrindSessionLive.tsx) já finaliza todos os torneios pendentes com `result='0'`. Esse flow continua válido para ReA — o re-entry não se acumula no fim; jogador encerra a sessão com X entradas e Y re-entries registrados. Sem regressão.

20. **Badge "Tentativa N+1" em torneio com `maxReentries=null`**: notação `/∞` exibida. Tenha certeza que o char `∞` (U+221E) renderiza nos fonts padrão do app — se não, usar `"ilim."` ou `"∞"` dentro de `<span>` com fallback CSS. Testar em Safari mobile (iOS).

21. **Reverter `allowsReentry` via EditDialog num torneio com `reentries=0`**: permitido. Se `reentries=0`, UI não bloqueia, backend aceita (`reentries<=maxReentries` continua válido com ambos 0).

22. **`reentries > 0` numa sessão que nunca teve Spec 3 deployada** (backfill retroativo): Spec 1 não popula `reentries > 0` em `session_tournaments` (invariante §4.5 item 2). Então a UI nunca encontra esse estado em sessões pré-deploy. Só torneios jogados pós-deploy de Spec 3 terão contadores > 0.

23. **Interação com botão REBUY em torneio ReA**: se torneio tem `rebuys=2` e jogador busta e re-entra, novo ciclo começa com `rebuys=2` preservados (tentativa anterior), `reentries=1`. Rebuys na nova tentativa continuam incrementando o mesmo contador `rebuys`. **Limitação v1**: não há separação de rebuys por tentativa. Fórmula trata rebuys+reentries como entradas independentes somadas ao buyIn.

---

## 8. Impactos em cascata

Arquivos que mudam fora do escopo principal:

- `B:\grindfy\client\src\components\grind-session-live\TournamentCard.tsx` — badges ReA + Tentativa em RegisteredCard, UpcomingCard, CompletedCard
- `B:\grindfy\client\src\components\grind-session-live\AddTournamentDialog.tsx` — checkbox + input maxReentries
- `B:\grindfy\client\src\components\grind-session-live\EditTournamentDialog.tsx` — checkbox + input maxReentries + reentries editável
- `B:\grindfy\client\src\components\grind-session-live\SessionDashboard.tsx` — KPI "Entradas Totais"
- `B:\grindfy\client\src\components\grind-session-live\SessionSummaryModal.tsx` — Entradas Totais no summary
- `B:\grindfy\client\src\components\grind-session-live\ReentryConfirmDialog.tsx` — **arquivo novo**
- `B:\grindfy\client\src\components\grind-session-live\types.ts` — confirmar tipo `SessionTournament` tem `allowsReentry, maxReentries, reentries` (já da Spec 1); `SessionStats` ganha `totalEntries: number`
- `B:\grindfy\client\src\pages\GrindSessionLive.tsx` — refactor do `handleFinishTournamentDirect` (nome real, linha 142), extração de `applyFinishWithRegistrationData`, novos handlers `handleConfirmReentry` e `handleConfirmBust`, state `reentryQueue: Tournament[]` (fila, não objeto único), renderização condicional do `ReentryConfirmDialog`
- `B:\grindfy\server\routes\grind-sessions.ts` — lógica de transição finished→registered no PUT (linha 706) + acumulação de prize/bounty/position + merge com registro atual para validar refinements cruzados (essa última parte vem da Spec 1 §4.3)
- `B:\grindfy\shared\schema.ts` — reforçar refinement se necessário (já tem maxReentries da Spec 1). Spec 3 não adiciona refinements novos.
- `B:\grindfy\client\src\components\grind-session-live\calculateSessionStats.ts` — adicionar campo `totalEntries` no retorno de `calculateSessionStats` e `calculateFinalSessionStats` (soma de 1 + reentries para cada torneio finished/registered). Verificar inconsistência atual: variável `reentradas` em calculateSessionStats (linha 111) atualmente está calculando `rebuys` (não reentries). Essa variável **não mudar** para não quebrar nada — criar campo NOVO `totalEntries` separado.
- `B:\grindfy\client\src\components\grind-session-live\types.ts` — `SessionStats` ganha `totalEntries: number`. `SessionTournament` já tem `reentries`, `allowsReentry`, `maxReentries` da Spec 1.
- Testes: `tests/unit/grind-session/` novos casos (mínimo 12 para cobrir os 23 edge cases)

Não afeta:
- Add-on flow (Spec 2) — ortogonal
- Analytics, Dashboard histórico — consome via snapshot + fórmula
- Upload, Auth, Calendar, Studies, AI Coach

---

## 9. Métricas de sucesso

7 dias pós-deploy:
- **Adoção:** >= 40% dos usuários ativos têm 1+ re-entry registrado na semana.
- **Modal fechado por ESC/backdrop:** < 15% das abertas (se alto, UX está ambígua).
- **Clique em "Sim, re-entrar" vs "Não":** distribuição saudável 50/50 ou 60/40 (reflete decisão real). Se 95% clicam sim, talvez o modal esteja mal posicionado.

14 dias pós-deploy:
- **% torneios ReA com decisão registrada** (reentries > 0 OU finished com allowsReentry=true e decisão explícita) >= 80%.
- **ABI médio por site em ReA sobe** 18-25% (correção do leak).
- **KPI "Entradas Totais" >= volume** sempre (sanity — se não, bug no cálculo).
- **Zero reclamações** de "meu torneio sumiu" ou "cliquei GG e não finalizou" (indicaria confusão com modal).

Sanidade:
- **Delta entre reentries registrados e reentries detectados pelo CSV na semana seguinte** deve convergir (usuário registra ao vivo ≈ dados oficiais vindos da rede de poker).

---

## 10. Rollout

- **Feature flag:** desnecessária — UI self-gating por `allowsReentry`.
- **Dependência:** Spec 1 deployada e backfill rodado >= 48h antes.
- **Ordem recomendada:** deployar **após** Spec 2 (add-on), porque Spec 2 é quick-win e permite observar reação dos usuários às novas badges antes de introduzir o flow mais complexo de re-entry.
- **Aviso aos usuários:** recomendado — toast proativo ou changelog visível: "Novo flow de Re-entry: ao bustar em torneio ReA, você agora pode re-entrar direto pelo Grindfy." Com link para doc ou tour de 1 tela.
- **Rollback:** `git revert`. Badges somem, modal para de aparecer, botão GG volta a finalizar direto. Dados persistem.
- **Monitoramento 48h:** Sentry em `ReentryConfirmDialog`, handler `handleConfirmReentry`, endpoint PUT — error rate < 0.1%.

---

## 11. Ações para outros agentes

- **system-architect:**
  - Fluxograma Mermaid em `docs/architecture/flows/grind-live/reentry.mermaid`:
    ```
    Click GG → decide(allowsReentry && !atMax?) → [yes] modal → [yes] PUT reentries+1, status=registered → card volta a 'Jogando' → ...
                                                 → [no] PUT status=finished
                                       [no] direct PUT status=finished
    ```
  - Sequence diagram do modal: User → TournamentCard → GrindSessionLive.handleFinishTournamentDirect → ReentryConfirmDialog → mutation → server/routes/grind-sessions.ts → DB → React Query invalidate → re-render.
  - ADR documentando decisão C (acumular prize/bounty/position) vs A (zerar) vs B (preservar último) — e por quê.
  - Documentar convenção de estado de fila de modais (caso 7) se implementado.

- **test-writer:**
  - **Áreas críticas:**
    - Branching de `handleFinishTournamentDirect` (nome real): 3 paths (não-ReA, ReA sub-max, ReA at-max).
    - Preservação do fluxo atual `applyFinishWithRegistrationData` (prize/bounty/position via registrationData) quando usuário clicou "GG definitivo" no modal.
    - Descarte de `registrationData` pendente quando usuário clica "Sim re-entrar" (v1 decisão).
    - Modal: abre com dados corretos, botão disabled em at-max, esc/backdrop → finaliza ("Não GG definitivo").
    - PUT payload correto em cada botão: "Sim" envia `{ reentries: N+1, status: 'registered', endTime: null }`, "Não" envia payload do `applyFinishWithRegistrationData`.
    - Acumulação de prize/bounty/position no backend (decisão C) — testes de integração. Teste especial: position null-safe.
    - Backend rejeita `reentries > maxReentries` — 400.
    - Backend valida refinement cruzado com merge DB (finished→registered só se allowsReentry=true no registro atual).
    - **Fila de modais**: simular 3 GGs seguidos em torneios ReA → 3 modais em sequência (`reentryQueue.length` progressão 1→2→3→2→1→0).
    - UI: badges renderizam em 3 variantes do card. KPI "Entradas Totais" soma correto (volume + sum(reentries)).
    - Regressão: torneios não-ReA continuam finalizando em 1 clique (zero modal).
    - REBUY intocado em torneios ReA e não-ReA.
  - Criar pelo menos 18 testes unitários novos para cobrir os 23 casos de borda.

- **implementer:**
  - **Ordem sugerida:**
    1. **Validar pré-requisitos Spec 1**: `session_tournaments.reentries`, `allowsReentry`, `maxReentries` existem no schema e Zod. Merge-DB-antes-de-validar no handler PUT existe. Caso contrário, bloqueia.
    2. Badge "ReA" nos 3 cards + teste visual.
    3. Badge "Tentativa N+1" condicional + teste.
    4. `ReentryConfirmDialog.tsx` standalone + storybook ou sandbox.
    5. Extrair `applyFinishWithRegistrationData` do `handleFinishTournamentDirect` atual (preservar comportamento existente).
    6. Refactor `handleFinishTournamentDirect` com branching canReenter (usar nome correto `handleFinishTournamentDirect`, não `handleFinishDirect`).
    7. Handlers `handleConfirmReentry`, `handleConfirmBust` + plugar no Dialog.
    8. State `reentryQueue: Tournament[]` (fila) + render condicional baseado em `queue[0]`.
    9. Backend PUT em `server/routes/grind-sessions.ts:706`: detectar transição finished→registered, validar (allowsReentry, maxReentries cruzados com DB), acumular prize/bounty/position (decisão C, atualmente descarta pois frontend não envia).
    10. Checkbox + input em `AddTournamentDialog.tsx`.
    11. Mesmo em `EditTournamentDialog.tsx` + campo `reentries` editável.
    12. KPI "Entradas Totais" em `SessionDashboard.tsx` e `SessionSummaryModal.tsx`.
    13. Adicionar `totalEntries` ao `SessionStats` em `types.ts` e `calculateSessionStats.ts` (variável nova, sem alterar `reentradas` pré-existente que confusamente conta rebuys).
    14. Testes novos (mínimo 18).
  - **Não tocar** no botão REBUY ou `handleRebuyTournament`. **Não tocar** na fórmula de `totalInvestido` (Spec 1). Reutilize `updateTournamentMutation`.
  - **Não renomear** `reentradas` em calculateSessionStats (linha 111) que confusamente hoje conta rebuys — mudanças naquela variável exigem coordenação com Dashboard/types e está fora deste escopo. Adicionar `totalEntries` como campo NOVO e distinto.

- **reviewer:**
  - Focar em:
    - **Dois fluxos independentes** — rebuy e re-entry nunca se cruzam. Verificar em código.
    - **Modal UX** — acessível (tab navegável, ESC funciona, focus trap), copy clara, botões grandes em mobile.
    - **Acumulação de campos** — valida decisão C está implementada consistentemente no backend. Teste manual: pagar prize em tentativa 1, re-entrar, bustar sem prize → campo final = prize1.
    - **Posição melhor (min)** — cuidado com null/undefined em position; usar `Math.min(...[pos1, pos2].filter(Boolean))`.
    - **Fila de modais** se implementada — não perde decisões em multi-tabling.
    - **Zero regressão** no flow não-ReA — torneios tradicionais finalizam em 1 clique.
    - **Teste de stress multi-tabling**: simular 6 GGs consecutivos em 2s em torneios ReA → todos tratados corretamente.
    - **Validação cruzada** no backend cobre os 3 refinements (allowsReentry, maxReentries, transição status).
    - **Segurança**: usuário só pode re-entrar em torneios da própria sessão (permission check no PUT já existente).
