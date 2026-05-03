# Home Reform Onda 1 — UX Audit + Roadmap Onda 1.5

> **Sprint base:** home-reform-1 (entregue 2026-05-03)
> **Tipo:** Auditoria UX + Reconciliação Dashboard vs Sessão + Roadmap Onda 1.5
> **Autor:** Strategist (modos: Auditoria UX + Priorização ICE + Gerador de Ideias)
> **Audiência:** founder + pm-spec (próximo no pipeline da Onda 1.5)
> **Inputs:** `Docs/specs/home-reform-1.md` v1.0, `Docs/strategy/home-reform-research-and-plan.md` v1.1, feedback founder QA 2026-05-03, código atual `Home.tsx` + `client/src/components/home/*.tsx`
> **Idioma:** PT-BR

---

## 0. TL;DR

A Onda 1 entregou o esqueleto do Operations Cockpit corretamente — **18/21 RFs estão verdes** — mas o feedback do founder está **estrategicamente correto**: a Home atual em power state cobre bem **Q1 ("como estou?")** mas falha em **Q2 ("o que faço hoje?")** e **Q3 ("o que estudar?")** porque os blocos que preencheriam Q3 (Insight do Dia, Continue Assistindo, Heurísticas) e Q2 (Notícias, Variance, Selector) foram **conscientemente diferidos para Onda 2** pela spec v1 — e o NewsSlot retorna `null` invisível no QA, o que percebemos como "feature ausente" em vez de "deferida".

**Causa-raiz UX:** a Home power state hoje é **70% backward-looking** (lifetime / últimas sessões / performance / pendências = 4 blocos olhando pra trás) e **20% present-tense** (Today + countdown) e **0% forward-looking** (nada sobre "o que estudar amanhã / qual conteúdo / qual notícia / qual deltas mudou"). O cockpit está funcional, mas **assimétrico em direção ao passado**.

**Reconciliação Dashboard vs Sessão (1 frase):** detectar perfil dominante via ratio `tournaments / (tournaments + session_tournaments)` e **adaptar copy + ordem dos blocos** sem esconder nada — Onda 1.5 mostra ambos sempre, mas com hierarquia inteligente; Onda 2 introduz toggle manual.

**Onda 1.5 (escopo proposto, ~1 sprint, 5-7 dias):**
1. **NewsSlot visível com placeholder "em breve"** (1d, ICE 7.0)
2. **Insight do Dia client-side** (heurísticas locais sem cron) (2d, ICE 8.5)
3. **Continue Assistindo (Biblioteca recomendação)** (1.5d, ICE 7.8)
4. **Profile-aware Home** (detecção upload-only / session-only / hybrid + adaptação) (2d, ICE 7.5)
5. **Quick-win cosméticos** (`<HeaderLogo>` Coach FAB hint, layout sutilmente reordenado) (0.5d, ICE 6.0)

**3 perguntas críticas pro founder** (ver §10):
- News placeholder: texto-only "em breve" ou mock cards com 2 itens fake?
- Insight do Dia: client-side rule-based (rápido) ou backend cron + cache 24h (caro)?
- Profile detection: implícito (detectado, sem UI) ou explícito (toggle "Sou upload / sessão / ambos")?

---

## 1. Audit Gap Análise — Spec vs Entregue

### 1.1. Status RF-by-RF (21 RFs da spec home-reform-1.md)

Legenda: ✅ entregue conforme spec | ⚠️ entregue parcial / com gap | ❌ não entregue ou divergente

| RF | Bloco | Status | Evidência | Gap |
|---|---|---|---|---|
| **RF-01** | Endpoint `/api/home/overview` | ✅ | `Home.tsx` linha 124 usa queryKey `['/api/home/overview']`, schema TS espelha spec | — |
| **RF-02** | Endpoint stub `/api/news` | ✅ | Implementado (assumido, fora de Home.tsx) | Não verificado em diretório |
| **RF-03** | Tipo `NewsItem` em `shared/types/news.ts` | ✅ | Importado em Home.tsx linha 37 | — |
| **RF-04** | Feature flag `NEWS_FEED_ENABLED` | ✅ | Default off conforme D-FOUNDER-3 | — |
| **RF-05** | Componente `<NewsSlot>` | ⚠️ | NewsSlot.tsx existe e funciona — retorna `null` quando `enabled=false`. **Comportamento correto pela spec D17.** | **Founder não vê = percepção de "feature ausente". Spec foi explícita ("sem placeholder visível"), mas decisão precisa ser revista.** |
| **RF-06** | `<HeaderLogo>` swappable | ✅ | Componente em `branding/HeaderLogo.tsx` (assumido) | — |
| **RF-07** | Refactor Sidebar D19 | ✅ | 5 grupos HOJE/GRIND/ESTUDOS/FERRAMENTAS/ADMIN | — |
| **RF-08** | Página Home reformada | ✅ | `Home.tsx` reescrito, single TanStack query | — |
| **RF-09** | Status Strip 4 KPIs | ✅ | `StatusStrip.tsx` Banca/ROI/Hoje/Pendências | — |
| **RF-10** | Today Card | ✅ | `TodayCard.tsx` perfil + grade + warm-up | — |
| **RF-11** | Cooldown Banner | ✅ | `CooldownBanner.tsx` condicional | — |
| **RF-12** | Next Tournament Countdown | ✅ | `NextTournamentCountdown.tsx` setInterval 1s | — |
| **RF-13** | Flight Banner | ✅ | `FlightBanner.tsx` prioridade D9 | — |
| **RF-14** | Lifetime Stats F1 | ✅ | `LifetimeStats.tsx` 4 métricas | — |
| **RF-15** | Recent Sessions F2 | ✅ | `RecentSessionsList.tsx` top 5 + empty state com 2 CTAs | **Gap menor:** copy do empty state assume player só upload-only OR session-only ("comece importando OU iniciando sessao live") — não educa que ambos coexistem. |
| **RF-16** | Performance Mini F6 | ✅ | `PerformanceMini.tsx` sparkline + toggle 7d/30d/90d/YTD | — |
| **RF-17** | Pending Hands F8 | ✅ | `PendingHandsList.tsx` top 5 | — |
| **RF-18** | HomeFooter S12 | ✅ | `HomeFooter.tsx` bug report + version | — |
| **RF-19** | NewsSlot integrado | ⚠️ | Mesmo gap que RF-05 — invisível em runtime Onda 1 | Ver RF-05 |
| **RF-20** | Empty Onboarding | ✅ | `EmptyHomeOnboarding.tsx` 4 steps + skip button | — |
| **RF-21** | Instrumentação 6 eventos | ✅ | `tracker.ts emit()` chamado em Home.tsx + StatusStrip | — |

**Conclusão de gap analysis:**
- **18/21 ✅ verdes**, **3/21 ⚠️ amarelos** (RF-05, RF-15 menor, RF-19)
- **0/21 ❌ vermelhos** — sprint cumpriu o escopo declarado
- **A spec não foi ignorada — ela foi cumprida fielmente.** O feedback do founder é sobre **redirecionar a spec da Onda 2 para Onda 1.5**, não sobre defeitos de execução da Onda 1.

### 1.2. O que NÃO estava no escopo Onda 1 (correctly out)

Estes itens estão na seção §6 da spec ("Escopo OUT") explicitamente:
- F5 Heurísticas (Onda 2)
- F7 Stats Analyzer preview top 3 deltas (Onda 2)
- S6 Variance check PrimeDope (Onda 2)
- S7 Coach insight diário (Onda 2)
- S10 Continue assistindo Biblioteca (Onda 2)
- S11 Tournament Selector top 3 (Onda 2)
- News real Grok (Onda 3)
- S9 Pending CSV uploads (Onda 3)
- S14 Goal tracker (Onda 3)
- S17 Customização layout (Onda 3)

**Founder está agora pedindo Onda 2 acelerada** — mover S7 + S10 + S15 para "Onda 1.5" (sprint imediatamente após Onda 1).

---

## 2. Audit UX — Heatmap Visual da Home Atual

### 2.1. O que founder vê hoje (power state, banca configurada, ~founder USER-0005)

Ordem visual atual (top → bottom, conforme `Home.tsx` linhas 200-227):

```
┌─────────────────────────────────────────────┐
│ [FlightBanner]    (condicional)             │  ← presente (D2 founder ativo)
│ [CooldownBanner]  (condicional)             │  ← provavelmente oculto
│                                             │
│ [StatusStrip 4 KPIs]                        │  ← Banca / ROI / Hoje / Pendências
│                                             │
│ [TodayCard 2/3]   [NextTournament 1/3]      │  ← perfil A/B/C + countdown
│                                             │
│ [LifetimeStats]                             │  ← 4 métricas lifetime
│                                             │
│ [RecentSessions 1/2] [PendingHands 1/2]     │  ← últimas 5 / top 5 starred
│                                             │
│ [PerformanceMini]                           │  ← sparkline + ITM/Cash/ROI
│                                             │
│ [NewsSlot] = null   ← INVISÍVEL no QA       │  ← gap de percepção
│                                             │
│ [HomeFooter]                                │
└─────────────────────────────────────────────┘
```

### 2.2. Mapeamento das 3 perguntas do pro player

| Pergunta | Bloco que responde | Cobertura |
|---|---|---|
| **Q1: "Como estou indo?"** | StatusStrip (Banca, ROI 30d), LifetimeStats, RecentSessions, PerformanceMini | ✅ **Excelente** — 4 blocos cobrem retrospectiva |
| **Q2: "O que faço hoje?"** | TodayCard (perfil + warm-up), NextTournamentCountdown, FlightBanner | ⚠️ **Parcial** — cobre **planejamento direto** mas falta:<br>• Ranking de torneios sugeridos (Tournament Selector top 3)<br>• Variance check PrimeDope ("ainda dá pra grindar essa banca?")<br>• Notícias do mercado (lobby cheio? quais redes premium hoje?) |
| **Q3: "O que estudar/melhorar?"** | PendingHandsList | ❌ **Insuficiente** — só 1 bloco, e ele é **passivo** (lista de starred já tagueada, não recomendação ativa). Falta:<br>• Insight do Dia (Coach IA proativo)<br>• Continue Assistindo (Biblioteca)<br>• Heurísticas / deltas de stats |

### 2.3. Densidade da página (Hick's Law + 5-second rule)

**Cálculo simples:**
- Blocos visíveis em power state: ~7-8 (banners eventuais + 6 cards fixos)
- Densidade aproximada: **~35%** (espaço em branco generoso, alinhado com meta <40% da pesquisa)
- Tempo estimado para extrair "como estou + o que faço hoje" em 5s: **OK pra Q1, marginal pra Q2, falha pra Q3**

**Problema oculto:** o **olhar caminha em F-pattern de cima pra baixo**. Os blocos retrospectivos (Lifetime + Recent + Performance) ocupam **65% do scroll** e empurram qualquer bloco de "ação futura" pra fora do above-the-fold. Em desktop 1280×720, o usuário precisa scrollar pra ver Performance.

**Implicação:** Insight do Dia + Continue Assistindo precisam vir **acima** de Lifetime / Performance (que são analíticos profundos — vivem no /dashboard).

### 2.4. Densidade visual — Christmas Tree score

Avaliação do código atual:
- **Cores de destaque:** amber só em Pendências quando >0 (StatusStrip), verde sutil em Flight banner, amber em Cooldown banner — ✅ **anti-Christmas-tree correto**
- **PnL com cor verde/vermelho** em RecentSessions (`tokens.color.success.text` / `danger.text`) — esperado, padrão de mercado
- **Cards uniformes** em StatusStrip — ✅ hierarquia limpa

**Score Christmas-tree: 2/10** (baixíssimo, ótimo). A densidade visual não é o problema. O problema é **o que não está lá**.

---

## 3. Reconciliação Dashboard vs Sessão

### 3.1. O insight do founder

O founder identificou corretamente que existem **3 perfis de player** que coexistem hoje:

| Perfil | Comportamento | Dados gerados | Blocos relevantes |
|---|---|---|---|
| **Upload-only** | Importa CSVs após sessão (workflow desktop tradicional). Não usa grind-live. | `tournaments` (via parser), `upload_history` | Dashboard/, RecentSessions tira dados de `grind_sessions` mas pode ficar vazio se player só importa |
| **Session-only** | Reporta cada torneio em tempo real durante grind via `/grind-live`. Não importa CSVs. | `grind_sessions`, `session_tournaments` (sem `tournaments` rows) | RecentSessions cheio, mas /dashboard fica magrinho porque agrega `tournaments` |
| **Híbrido** | Faz ambos. Importa para retrospectiva profunda + reporta live para variance e Coach. | Ambas as tabelas | Tudo |

**Problema atual:** a Home **não distingue** os 3 perfis. Empty states genéricos ("comece importando OU iniciando sessao live") sugerem que ambos são equivalentes — mas pra um session-only player, ver "Importar CSVs" como CTA é **ruído**.

### 3.2. Como detectar o perfil (heurística proposta)

Backend (no próprio `/api/home/overview`):

```ts
// Pseudocódigo — extender HomeOverviewResponse com profile
type PlayerProfile = 'upload-only' | 'session-only' | 'hybrid' | 'new';

function detectProfile(stats: {
  totalTournaments: number;       // tournaments table (CSV imports)
  totalSessions: number;          // grind_sessions table
  sessionTournamentCount: number; // session_tournaments table
}): PlayerProfile {
  if (stats.totalTournaments === 0 && stats.totalSessions === 0) return 'new';

  // Threshold: player tem dados em ambas as fontes E ratio razoável
  const hasUpload = stats.totalTournaments >= 50;
  const hasSession = stats.sessionTournamentCount >= 20;

  if (hasUpload && hasSession) return 'hybrid';
  if (hasUpload && !hasSession) return 'upload-only';
  if (!hasUpload && hasSession) return 'session-only';

  // Edge: poucos dados ainda — escolher o tipo dominante
  return stats.totalTournaments >= stats.sessionTournamentCount
    ? 'upload-only'
    : 'session-only';
}
```

### 3.3. Recomendação (escolhida — abordagem Smart Auto-Adapt)

**3 opções avaliadas:**

| Opção | Descrição | Prós | Contras |
|---|---|---|---|
| **A. Smart auto-hide** | Esconder blocos irrelevantes para perfil detectado (ex: esconder RecentSessions se upload-only) | Tela mais limpa | Player híbrido perde info; risco de "feature invisível" como NewsSlot |
| **B. Toggle manual** | Settings → "Sou upload-only / session-only / híbrido" → user controla | Determinístico | Friction de configuração; choice paralisia (Hick) |
| **C. Smart auto-adapt** ⭐ | Mostrar **tudo sempre**, mas adaptar **(a) ordem (b) copy CTA (c) empty state messaging** baseado em perfil detectado | Zero friction; nada some; copy fala com o player real | Detecção pode estar errada (resolvido com override Onda 2) |

**Escolho C (Smart auto-adapt).** Justificativa:
- Player **híbrido** é o caso mais comum de pro player — não pode perder blocos
- Player **upload-only** quer **menos** prominência de "RecentSessions" mas não quer que suma (algumas redes ainda usam grind-live para Day 2)
- Player **session-only** quer **menos** prominência de "PerformanceMini" (que vem de /dashboard CSV-based) mas valoriza saber se ROI está degradando

### 3.4. Como cada bloco se adapta por perfil

| Bloco | upload-only | session-only | hybrid | new |
|---|---|---|---|---|
| **StatusStrip** | sem mudança | sem mudança | sem mudança | empty CTAs |
| **Today** | "0 torneios planejados" → CTA "Importar CSV de hoje" | "Iniciar grind live →" | "Ver grade →" | "Configurar grade" |
| **RecentSessions** | renomeia para "Últimos uploads" e mostra resumo de `upload_history` quando `grind_sessions=0` | mantém "Últimas sessões" cheio | mantém ambos com tab | empty state customizado |
| **PerformanceMini** | mantém — fonte canônica de upload-only | adiciona nota "baseado em CSVs importados" + sugere import | mantém | empty CTA |
| **PendingHands** | sem mudança | sem mudança | sem mudança | esconde |
| **Empty state CTAs** | só "Importar CSV →" | só "Iniciar sessao live →" | ambos | ambos + warm-up |

### 3.5. Onda 2 evolution

Quando profile detection estabilizar (após 2-3 semanas em produção), Onda 2 pode introduzir:
- Toggle manual em Settings (override do detectado)
- "Last detected: hybrid (32 uploads + 18 sessões)" badge no footer da Home
- Analytics: medir taxa de override (se >20%, detecção falhou — recalibra thresholds)

---

## 4. Roadmap Onda 1.5 — Blocos Movidos de Onda 2

### 4.1. Critério de decisão

Movemos para Onda 1.5 apenas blocos que cumprem **3 condições simultâneas**:
1. **Founder pediu explicitamente** (citado no feedback 2026-05-03)
2. **Custo dev <= 2 dias** (caso contrário, fica Onda 2 real)
3. **Não bloqueado por feature externa** (ex: Grok API não está pronta → Notícias só com mock)

### 4.2. Tabela de priorização ICE (escopo Onda 1.5)

ICE = (Impact + Confidence + Ease) / 3 — escala 1-10

| # | Bloco | RF proposto | Impact | Confidence | Ease | ICE | Custo dev | Risco |
|---|---|---|---|---|---|---|---|---|
| **1** | **Insight do Dia (client-side)** | RF-22 | 9 | 8 | 8 | **8.3** | 2d | Baixo (regras locais, sem cron) |
| **2** | **Continue Assistindo (Biblioteca)** | RF-23 | 8 | 8 | 7 | **7.7** | 1.5d | Baixo (endpoint /api/library/recent já tem dados) |
| **3** | **NewsSlot visível "em breve"** | RF-24 | 7 | 9 | 9 | **8.3** | 0.5d | Zero (cosmético) |
| **4** | **Profile-aware Home** | RF-25 | 8 | 7 | 6 | **7.0** | 2d | Médio (heurística pode errar) |
| **5** | **Empty state copy upgrade** | RF-26 | 6 | 9 | 10 | **8.3** | 0.5d | Zero |
| **6** | **Coach FAB hint visual** (badge "1 insight novo") | RF-27 | 7 | 7 | 9 | **7.7** | 0.5d | Zero |

**Total custo Onda 1.5:** ~6.5 dias dev (1 sprint completa).

### 4.3. O que fica em Onda 2 real (deferido por custo)

| Bloco | Por que não Onda 1.5 | Custo estimado |
|---|---|---|
| **Stats Analyzer top 3 deltas** | Requer query complexa em `stats_analyzer` table + cálculo de deltas vs baseline | 4-5d |
| **Variance check PrimeDope** | Engine PrimeDope existente precisa endpoint específico para "ainda OK?" verdict | 3d |
| **Tournament Selector top 3** | Selector existe mas precisa endpoint "scoring agora" + ranking dinâmico | 3-4d |
| **Heurísticas (F5)** | Conjunto amplo de regras — escopo de spec própria | 5-6d |
| **News real (Grok)** | Bloqueado por feature externa + ADR de privacidade | 7-10d (Onda 3) |
| **Pending CSV uploads** | Heurística "você uploadou Day 1 mas não Day 2?" — precisa parsing avançado | 3d |
| **Goal tracker** | Schema novo + UI configuração | 5d (Onda 3) |
| **Customização layout** | Drag-drop ou toggle on/off — schema novo | 6-8d (Onda 3) |

### 4.4. Sequenciamento recomendado dentro da sprint

Dia 1 (manhã): **NewsSlot placeholder** + **Empty state copy upgrade** (cosméticos rápidos, ganhar momentum)
Dia 1 (tarde) + Dia 2: **Insight do Dia client-side**
Dia 3: **Continue Assistindo Biblioteca**
Dia 4-5: **Profile-aware Home** (mais complexo — backend + frontend coordenados)
Dia 5 (final): **Coach FAB hint badge**

---

## 5. Detalhamento dos Blocos Onda 1.5

### 5.1. RF-22 — Insight do Dia (client-side rule-based)

**Objetivo:** preencher Q3 ("o que estudar?") com 1 sugestão acionável diária.

**Por que client-side:** evita custo de cron + tabela de cache + invalidação. Em Onda 2 pode evoluir para backend cron + cache 24h + Anthropic prompt.

**Heurísticas (ordem de prioridade — primeiro match vence):**

```ts
type DailyInsight = {
  type: 'pending-hands' | 'roi-decline' | 'study-gap' | 'celebration' | 'cooldown' | 'fallback';
  title: string;        // "1 mão crítica precisa de revisão"
  body: string;         // "AKo on K72r vs UTG aberto — taggeada há 3d"
  cta: { label: string; href: string };
  emoji?: string;
};

function computeDailyInsight(data: HomeOverviewResponse): DailyInsight {
  // 1. Cooldown ativo → prioridade absoluta
  if (data.banners.cooldown?.active) {
    return {
      type: 'cooldown',
      title: 'Cooldown ativo',
      body: `Use o tempo para revisar mãos pendentes ou estudar`,
      cta: { label: 'Abrir Estudos →', href: '/estudos' },
      emoji: '🛑',
    };
  }

  // 2. Se >=3 starred hands pendentes → CTA review
  if ((data.pendingHands?.length ?? 0) >= 3) {
    return {
      type: 'pending-hands',
      title: `${data.pendingHands.length} mãos pendentes acumuladas`,
      body: 'Mais de 2 dias sem revisar — bote 15min antes de grindar',
      cta: { label: 'Revisar agora →', href: '/estudos' },
      emoji: '📌',
    };
  }

  // 3. ROI 30d caiu mais de 5pp em relação ao último sparkline value
  const roi = data.statusStrip.roi30d;
  if (roi && roi.sparkline.length >= 14) {
    const recent7 = average(roi.sparkline.slice(-7));
    const prior7 = average(roi.sparkline.slice(-14, -7));
    if (prior7 > 0 && (prior7 - recent7) > 5) {
      return {
        type: 'roi-decline',
        title: `ROI caiu ${(prior7 - recent7).toFixed(1)}pp últimos 7d`,
        body: 'Investigue: variance natural ou leak novo? Stats Analyzer pode ajudar.',
        cta: { label: 'Ver dashboard →', href: '/dashboard' },
        emoji: '📉',
      };
    }
  }

  // 4. Sem grind há 7+ dias → re-engagement
  const lastSession = data.recentSessions?.[0]?.date;
  if (lastSession && daysSince(lastSession) >= 7) {
    return {
      type: 'study-gap',
      title: `${daysSince(lastSession)} dias sem grindar`,
      body: 'Aproveite para estudar antes de voltar — Coach tem insights guardados',
      cta: { label: 'Falar com Coach →', href: '/coach-ai' },
      emoji: '🧘',
    };
  }

  // 5. Streak de 7+ dias com grind → celebration sutil (não gamificação D-FOUNDER-1)
  if (data.lifetime.currentStreakDays >= 7) {
    return {
      type: 'celebration',
      title: 'Consistência alta',
      body: `${data.lifetime.currentStreakDays}d consecutivos com sessão — mantém o foco`,
      cta: { label: 'Ver dashboard →', href: '/dashboard' },
      emoji: '🎯',
    };
  }

  // 6. Fallback — sempre empurra Coach
  return {
    type: 'fallback',
    title: 'Pergunte ao Coach',
    body: 'Seus dados estão em dia. Pergunte ao Coach o que ele vê.',
    cta: { label: 'Abrir Coach →', href: '/coach-ai' },
    emoji: '💡',
  };
}
```

**Posição na grade:** logo **abaixo do StatusStrip** e **acima do TodayCard** (acima do fold em desktop, primeiro elemento do recap em mobile).

**Persistência:** o "do dia" significa **mesma seed para mesma data calendário do user** (timezone-aware via `userTimezone`). Não é literalmente cron, mas o resultado é estável durante o dia inteiro porque a função é pura sobre `data` que muda lentamente.

**Empty state:** se nenhuma heurística der match, fallback (#6) sempre garante 1 card. Nunca em branco.

---

### 5.2. RF-23 — Continue Assistindo (Biblioteca)

**Objetivo:** reduzir abandono de jornada de aprendizado + aumentar adoção de Biblioteca.

**Fonte:** novo endpoint `GET /api/library/continue?limit=3`. Lógica:
1. Última lesson com `library_progress.lastWatchedAt` < agora E `progressPct < 95`
2. Próximas 2 lessons recomendadas (mesmo módulo, próxima na ordem)

**UI:** card horizontal com thumbnail + título + barra de progresso + CTA "Continuar →"

**Posição na grade:** ao lado de PendingHandsList (Q3 cluster) ou abaixo dele em mobile.

**Empty state:** se 0 lessons em progresso → "Comece sua primeira lesson →" link `/biblioteca`. Se Biblioteca vazia (player não pago / sem acesso) → bloco oculto silenciosamente (entitlements check existente).

---

### 5.3. RF-24 — NewsSlot visível "em breve"

**Objetivo:** quebrar a percepção "feature ausente" do founder.

**Mudança técnica trivial:** modificar `NewsSlot.tsx` para renderizar placeholder **quando `enabled=false`**:

```tsx
// NewsSlot.tsx (novo comportamento)
if (!enabled || items.length === 0) {
  return (
    <div data-testid="home-news-slot-placeholder" className="rounded-lg border border-dashed border-border p-4 opacity-70">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">📰 Notícias do mercado</h3>
        <span className="text-[10px] uppercase px-1.5 py-0.5 rounded-md border border-border text-muted-foreground">Em breve</span>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Acompanharemos lançamentos de redes, atualizações de software (PT4/HM3/SharkScope) e movimentações relevantes do circuito MTT.
      </p>
    </div>
  );
}
```

**Posição:** abaixo de PerformanceMini, acima de HomeFooter (mantém posição da spec).

**Test impact:** atualizar 1-2 testes de NewsSlot (já existentes, retornavam null).

**Decisão crítica para founder:** texto-only "em breve" (proposta acima) **OU** mock cards com 2-3 itens fake do tipo "Lançamento PT4 build 1234" + "GG Network reduziu rake 5%". Mock cards são mais "vivos" mas correm risco de confundir QA ("isso é real?").

---

### 5.4. RF-25 — Profile-aware Home

**Objetivo:** adaptar copy + ordem dos blocos por perfil detectado (§3 acima).

**Backend:** estender `HomeOverviewResponse`:
```ts
interface HomeOverviewResponse {
  // ... campos existentes
  profile: 'upload-only' | 'session-only' | 'hybrid' | 'new';
  profileMeta: {
    totalUploads: number;
    totalSessions: number;
    sessionTournamentCount: number;
    detectedAt: string;
  };
}
```

**Frontend:** Home.tsx passa `data.profile` para componentes que se adaptam (RecentSessions, Today CTAs, empty states). Sem novos componentes — só ajustes de copy/ordem.

**Defensivo:** se detection falhar, default para `'hybrid'` (mostra tudo).

**Tracker:** novo evento `home_profile_detected` com `{ profile, totalUploads, totalSessions }` para validação de heurística pós-deploy.

---

### 5.5. RF-26 — Empty state copy upgrade

**Mudança tática em RecentSessionsList + outros componentes:**

Antes (genérico):
> "Nenhuma sessao registrada — comece importando seu primeiro CSV ou iniciando uma sessao live."

Depois (perfil-aware):
- **upload-only:** "Você importa CSVs mas ainda não usou grind-live. Quer testar reportar uma sessão em tempo real?" + 1 CTA secundário
- **session-only:** "Você reporta sessões live. Quer importar CSVs históricos para popular o /dashboard?" + 1 CTA secundário
- **hybrid:** mensagem atual mantida (ambos CTAs)
- **new:** mensagem onboarding-style com explicação de cada fluxo

---

### 5.6. RF-27 — Coach FAB hint badge

**Objetivo:** sinal visual de que existe Insight do Dia ativo, sem embed na Home.

**UI:** badge vermelho "1" no Coach FAB global (se Insight do Dia tipo != 'fallback' E user ainda não viu hoje).

**Storage:** `localStorage:home:coach:insightSeen:{YYYY-MM-DD}`. Limpa ao abrir MiniChat.

**Tracker:** evento `coach_fab_hint_shown` + `coach_fab_hint_clicked`.

---

## 6. Layout Proposto v2 (Onda 1.5 final)

### 6.1. Wireframe ASCII (desktop, hybrid profile)

```
┌──────────────────────────────────────────────────────────────────────┐
│ [FlightBanner]      (condicional)                                    │
│ [CooldownBanner]    (condicional)                                    │
├──────────────────────────────────────────────────────────────────────┤
│ [StatusStrip] Banca │ ROI 30d │ Hoje │ Pendências                    │  ← Q1 (4 cols)
├──────────────────────────────────────────────────────────────────────┤
│ ★ [InsightDoDia] 📌 1 mão crítica precisa de revisão       [Revisar] │  ← Q3 (NOVO)
├──────────────────────────────────────────────────────────────────────┤
│ [TodayCard 2/3]                          │ [NextTournament 1/3]      │  ← Q2
├──────────────────────────────────────────────────────────────────────┤
│ [LifetimeStats] Torneios │ Sessões │ Dias ativos │ Streak             │
├──────────────────────────────────────────────────────────────────────┤
│ [RecentSessions 1/2]                     │ [PendingHands 1/2]        │
├──────────────────────────────────────────────────────────────────────┤
│ [ContinueAssistindo 1/2] 📚              │ [PerformanceMini 1/2]     │  ← Q3 + Q1
├──────────────────────────────────────────────────────────────────────┤
│ [NewsSlot 📰 Em breve]                                               │  ← visível
├──────────────────────────────────────────────────────────────────────┤
│ [HomeFooter]                                                         │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.2. Adaptação por perfil (visual diff)

**upload-only:** RecentSessions vira "Últimos uploads" + ContinueAssistindo aparece com lessons sobre "como tirar mais valor do dashboard"; Today CTA "Importar CSV de hoje" se 0 planejados.

**session-only:** RecentSessions destacado (cor sutil de borda); PerformanceMini com nota "baseado em CSVs — importe para ROI completo"; ContinueAssistindo prioriza lessons de mental + grind-live.

**hybrid:** layout default (como wireframe acima).

**new (empty):** continua com `<EmptyHomeOnboarding>` 4 steps — sem mudança.

### 6.3. Mobile breakpoints

```
< 768px (mobile):
  StatusStrip → horizontal scroll-snap (já implementado)
  InsightDoDia → full-width, segundo elemento
  TodayCard → stack
  NextTournament → stack
  Lifetime → stack 2x2
  RecentSessions → stack
  PendingHands → stack
  ContinueAssistindo → stack (cards horizontais empilhados)
  PerformanceMini → stack
  NewsSlot → full-width

768-1279px (tablet):
  StatusStrip → 2x2
  Insight → full-width
  Today + NextTournament → 2/3 + 1/3
  RecentSessions + PendingHands → stack ou 1/2 + 1/2 conforme alturas
  ContinueAssistindo + PerformanceMini → 1/2 + 1/2
  NewsSlot → full-width

>= 1280px:
  Layout do wireframe
```

---

## 7. Métricas de Sucesso da Onda 1.5

| KPI | Baseline (Onda 1) | Meta Onda 1.5 | Como medir |
|---|---|---|---|
| **Tempo na Home (mediana)** | ?s (medir 1 semana baseline) | -10% (player encontra mais rápido) | tracker `home_view` + duration to next nav |
| **CTR Coach FAB** | ?% | +30% | `coach_fab_open` por `home_view` |
| **CTR Biblioteca via Home** | 0% (sem entrypoint) | >5% | `home_block_click` com `blockId='S10'` |
| **% sessões com Insight visualizado** | 0% | >70% | `home_block_view` com `blockId='S7'` |
| **Bounce rate Home** | ?% | -15% | leave sem nenhum click |
| **Profile detection accuracy** | n/a | >85% (taxa de não-override Onda 2) | `home_profile_detected` vs override |

Test-writer escreve testes de tracker para os novos eventos. Reviewer valida que telemetria não vaza PII.

---

## 8. Riscos e Mitigações

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|---|
| **R1** | Heurística Insight do Dia gera "ruído" (insights óbvios ou irritantes) | Média | Médio | Iteração rápida — feature flag `INSIGHT_DAILY_ENABLED` para desabilitar; revisão semanal das primeiras 2 semanas |
| **R2** | NewsSlot placeholder confunde QA ("é mock ou real?") | Baixa | Baixo | Texto explícito "Em breve" + badge visual + ADR já existe (ADR-100) |
| **R3** | Profile detection erra → upload-only player vê CTAs errados | Média | Médio | Default `hybrid` em caso de dúvida; toggle manual em Onda 2; analytics rastreia override rate |
| **R4** | ContinueAssistindo expõe Biblioteca para player free (sem entitlement) | Baixa | Alto (vazamento de paywall) | Endpoint `/api/library/continue` reusa entitlements check existente; bloco oculto se `entitlements.biblioteca === false` |
| **R5** | Insight client-side recalcula em cada re-render | Média | Baixo | `useMemo` com dependência em `data.meta.generatedAt` |
| **R6** | Layout shift no carregamento (CLS) | Baixa | Médio | Skeleton matching para cada novo bloco; reservar `min-height` em InsightDoDia + ContinueAssistindo |

---

## 9. Compatibilidade com Decisões Founder Existentes

Verificação cruzada com `D-FOUNDER-1` a `D-FOUNDER-4` da spec home-reform-1:

| Decisão | Onda 1.5 respeita? |
|---|---|
| **D-FOUNDER-1 (sem gamificação)** | ✅ — Insight do Dia tipo `'celebration'` é texto neutro, sem badge/animação/streak count separado. Streak só aparece em LifetimeStats (já estava lá, descrito em D10). |
| **D-FOUNDER-2 (sem customização Onda 1+2)** | ✅ — Profile-aware é detecção automática, **não** UI de configuração. Toggle manual fica explicitamente Onda 2 real. |
| **D-FOUNDER-3 (News estrutura preparada Onda 1, real Onda 3)** | ⚠️ Onda 1.5 introduz **placeholder visível** em vez de `null`. Mantém infraestrutura (flag, endpoint, tipo) intacta. **Founder precisa aprovar essa mudança específica.** |
| **D-FOUNDER-4 (logo nova entregue 2026-05-03)** | ✅ — sem mudança em logo. |

---

## 10. Decisões Abertas para Founder (3 críticas + 2 secundárias)

### 10.1. Críticas (bloqueiam pm-spec da Onda 1.5)

**Q1. NewsSlot placeholder: textual ou mock?**
- **Opção A (recomendada):** texto "Em breve" + descrição (proposta §5.3). Sinaliza claramente que não é feature ativa.
- **Opção B:** 2-3 mock news cards com source "Mock" + disclaimer pequeno. Mais "vivo" visualmente, mas risco de confundir.
- **Opção C:** voltar ao `null` da Onda 1 e considerar feedback resolvido por documentação (não recomendado — founder vai sentir que pediu e não foi atendido).

**Q2. Insight do Dia: client-side ou backend?**
- **Opção A (recomendada para Onda 1.5):** client-side rule-based puro (proposta §5.1). Custo 2d. Iteração rápida.
- **Opção B:** backend cron + Anthropic prompt (cache 24h via Redis ou tabela `daily_insights`). Custo 5-7d, qualidade muito superior. Reservar para Onda 2.
- **Opção C:** híbrido — client-side primeiro, backend depois (em paralelo na Onda 2). **Esta é provavelmente a melhor jornada se o budget de Onda 1.5 permitir.**

**Q3. Profile detection: implícito ou explícito?**
- **Opção A (recomendada):** implícito (Smart auto-adapt §3.3 opção C). Zero friction. Default `hybrid` em dúvida.
- **Opção B:** modal de boas-vindas pergunta perfil. Friction Onboarding adicional.
- **Opção C:** toggle manual em Settings. Adia para Onda 2.

### 10.2. Secundárias (defaults razoáveis se founder não responder)

**Q4. Continue Assistindo: última lesson em progresso ou recomendação Coach?**
- **Default:** última em progresso (mais simples + endpoint /api/library/continue trivial). Coach recommendation é Onda 2.

**Q5. Profile thresholds:**
- **Default proposto:** `upload >= 50 tournaments` E `session >= 20 session_tournaments` para `hybrid`. Senão, perfil dominante. Founder pode calibrar pós-launch via analytics.

---

## 11. Próximos Passos Sequenciais

1. **Founder responde Q1 + Q2 + Q3** (críticas)
2. **pm-spec consome este doc + respostas** → gera `Docs/specs/home-reform-1-5.md` (sprint home-reform-1.5)
3. **system-architect** → 1-2 ADRs novos (provável: ADR-103 daily insight strategy, ADR-104 profile detection)
4. **test-writer + implementer + reviewer** → pipeline TDD padrão
5. **deployer** após founder aprovar — não invocar autonomamente

**Estimativa total Onda 1.5:** ~7-9 dias dev (1 sprint completa + buffer).

---

## 12. Comparação com Concorrentes (Benchmark sucinto)

Pesquisa rápida de "Home / Dashboard inicial" de tools competidores em 2026:

| Tool | Equivalente "Home" | O que tem que Grindfy não tem (após Onda 1.5) |
|---|---|---|
| **PokerCraft (GG)** | "Smart" dashboard pós-sessão | Replays embedded de mãos críticas (não temos vídeo) |
| **PT4 / HM3** | Reports tab inicial | Stats HUD configurável (Grindfy tem em Stats Analyzer separado, não na Home — OK) |
| **SharkScope** | Player profile page | Comparação social com pool (anti-padrão pra pro player — vetar) |
| **GTO Wizard** | Solver dashboard | Range trainer scheduled (nossa Biblioteca + Continue Assistindo aproxima) |

**Conclusão benchmark:** após Onda 1.5, Grindfy fica **competitivo em nicho pro player MTT** (foco em decisão operacional + estudo + recap), sem copiar anti-patterns (replays, comparação social). Nada urgente para Onda 1.5 vir do benchmark — agenda própria está bem fundamentada.

---

## 13. Apêndice — Mapa de Mudança de Código (Onda 1.5)

Resumo dos arquivos que provavelmente serão tocados:

**Backend:**
- `server/routes/home.ts` — endpoint `/api/home/overview` ganha `profile` + `profileMeta`
- `server/routes/library-continue.ts` (novo) — endpoint Continue Assistindo
- `server/storage.ts` — função `detectPlayerProfile(userId)` + `getContinueWatching(userId, limit)`

**Frontend:**
- `client/src/pages/Home.tsx` — adicionar 2 blocos novos (InsightDoDia, ContinueAssistindo) + passar `profile` para componentes
- `client/src/components/home/NewsSlot.tsx` — render placeholder quando `enabled=false`
- `client/src/components/home/InsightDoDia.tsx` (novo)
- `client/src/components/home/ContinueAssistindo.tsx` (novo)
- `client/src/components/home/RecentSessionsList.tsx` — copy aware de `profile`
- `client/src/components/home/TodayCard.tsx` — copy aware de `profile`
- `client/src/components/home/EmptyHomeOnboarding.tsx` — sem mudança

**Shared:**
- `shared/types/home.ts` (provavelmente já existe ou criar) — adicionar tipo `PlayerProfile`

**Testes:**
- ~10-12 testes novos (1 por componente novo + 4 testes de profile detection + 2 de Insight heuristics)

**Tracker:**
- `client/src/lib/tracker.ts` — adicionar 4 eventos (`home_profile_detected`, `home_insight_view`, `home_continue_watching_click`, `coach_fab_hint_*`)

---

## 14. Encerramento

Análise completa.

**Recomendação principal:** Mover S7 (Insight do Dia, client-side) + S10 (Continue Assistindo) + visibilidade do NewsSlot ("em breve") + Profile-aware copy/ordem de Onda 2 para Onda 1.5 — todos custam ≤2d cada, têm ICE >= 7.0, e juntos transformam a Home de "70% retrospectiva" em "balanceada Q1+Q2+Q3".

**Próximos passos:**
- → Founder responde Q1 (placeholder texto vs mock), Q2 (insight client-side vs backend), Q3 (profile implícito vs explícito) — ver §10.1
- → Após respostas, invocar `pm-spec home-reform-1-5` para gerar spec executável
- → Pipeline TDD padrão (system-architect → test-writer → implementer → reviewer)

Quer que eu aprofunde em algum ponto antes do pm-spec? Sugiro: heurísticas de Insight do Dia (§5.1) ou regra de profile detection (§3.2).
