# ADR-057 — HUD stat targets como knowledge base global

- Status: Accepted
- Date: 2026-04-29
- Sprint: F4
- Decision owner: autonomous (founder revisa post-pipeline)

## Contexto

F3 introduziu `StatField` com `min/max` que confundiu validacao de input
(0-100 pra %) com target estrategico GTO (ex: VPIP target 28-30 — recomendacao
Tier S MTT 6-max).

Print founder revelou ~140 stats com **target = range GTO** distinto de
**input range valido**. Targets:
- Sao **knowledge base universal** por (formato, stake bucket).
- **Variam pouco por jogador** (so personalizam quando aplicam estilo proprio).
- **Evoluem ao longo do tempo** (meta GTO muda 2x/ano).

Decidir: targets vivem inline em `StatField` ou em tabela global?

## Decisao

**Hibrido — knowledge base global + override inline:**

1. **Tabela `hud_stat_targets`** (knowledge base):
   - PK = `(statKey, format, stakeBucket, version)` UNIQUE
   - Colunas: `targetMin`, `targetMax`, `source`, timestamps
   - Seed inicial = top 30 stats Tier S+A do print founder

2. **`StatField` ganha 3 campos opcionais:**
   - `targetRef?: string` — formato `{format}/{stakeBucket}` (ex: `mtt-6max/mid`)
   - `targetMin?: number` — override inline
   - `targetMax?: number` — override inline

3. **Resolucao em runtime (helper `resolveTarget`):**
   - Se `targetMin && targetMax` inline → usa eles (precedencia maxima).
   - Senao se `targetRef` → busca em `hud_stat_targets` cached.
   - Senao → sem target (UI mostra "—", Coach omite).

4. **Validation rename:** `min/max` → `inputMin/inputMax`. Back-compat mantem
   ambos (Zod aceita os dois, normaliza no parse).

## Razoes

### Tabela global vs inline puro

- **DRY:** founder atualiza meta 1x, todos layouts pegam.
- **Versionado:** meta evolui (GTOWizard publica novo solver), `version`
  incrementa, layouts continuam apontando pra latest.
- **Compartilhavel:** templates do Grindfy (PT4/HM3/MTT) referenciam mesmo
  knowledge base — sem duplicacao.

### Override inline preservado

- Jogadores TAG/LAG personalizam targets pessoais.
- Coaches publicam layouts com targets proprios divergentes do GTO.
- Permite experimentacao sem editar knowledge base global.

### `targetRef` formato `{format}/{stakeBucket}`

- Resolucao trivial: split por `/`.
- Knowledge base PK `(statKey, format, stakeBucket)` casa direto.
- StakeBucket vem do `users.user_settings` (auto) ou layout (override).

### Validation rename `inputMin/inputMax`

- Clareza semantica: `min/max` ambiguo entre 2 escopos.
- Back-compat zero-cost (Zod alias).
- Lesson #7: deprecation gradual via Zod.

## Alternativas

1. **Inline puro** (`targetMin/targetMax` so em StatField):
   140 stats x 3 templates = 420 cells duplicados. Atualizar meta = editar todos.
2. **Tabela so, sem override:** rigidez. Jogadores LAG ficam presos ao default.
3. **JSON blob `targets` em users:** sem versioning, sem indice por stat.

## Consequencias

- Migration `0014_stats_analyzer_targets.sql` cria tabela.
- Seed script `server/services/seedHudStatTargets.ts` popula 30 rows iniciais.
- Cache em memoria server-side TTL 1h (RNF-02 perf).
- Coach tool `read_user_hud_stats` data ganha campo `target` por stat.
- UI: editor mostra `target: 28-30` ao lado do label, comparator ganha coluna "Target" + status `vsTarget`.
- F8 (futuro) adicionara painel admin pra CRUD de targets sem SQL.
