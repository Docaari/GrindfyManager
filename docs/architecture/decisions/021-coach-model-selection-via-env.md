# ADR-021: Selecao de modelos do Coach via env (`COACH_CHAT_MODEL`, `COACH_MEMORY_MODEL`) com defaults atualizados

## Status
Aceito

## Data
2026-04-24

## Contexto

O Sprint Coach-1 (`docs/specs/coach-sprint-1-fundacao-economica.md`, RF-01) requer migracao de modelos da Anthropic:
- **Chat streaming:** `claude-sonnet-4-5-20250514` -> `claude-sonnet-4-6`
- **Compactacao de memoria:** `claude-3-5-haiku-20241022` -> `claude-haiku-4-5-20251001`

Atualmente, os IDs de modelo estao **hardcoded** em `server/routes/coach.ts` (chat) e `server/coachMemory.ts` (compactacao). A migracao direta por replace + deploy tem dois riscos:

1. **Novo modelo pode regredir em qualidade** em comparacao ao atual. Mesmo com smoke test antes do merge, problemas sutis podem aparecer so em producao com volume real.
2. **Rollback requer redeploy.** Se detectarmos regressao as 22h de sexta-feira, reverter exige commit + push + deploy — pressao alta, janela de incidente longa.

A **pergunta central:** hardcode do ID de modelo ou parametrizacao via variavel de ambiente?

### Restricoes

- **Deploy atual e local (memory/deploy_strategy_2026-04-24.md).** Nao usamos agente deployer automaticamente. Qualquer mudanca de codigo exige ciclo manual.
- **Modelos Anthropic tem IDs versionados com data** (`claude-sonnet-4-6` vs `claude-sonnet-4-5-20250514`). A API rejeita IDs invalidos — nao podemos "chutar".
- **Dois modelos diferentes sao usados** (Sonnet no chat, Haiku na memoria). Precisam ser parametrizaveis independentemente.
- **Modelo premium futuro:** Coach-2 vai expor `claude-opus-4-7[1m]` como opcao paga (gate por plano Premium). A estrutura precisa suportar isso sem refactor.
- **Compatibilidade retroativa:** se env nao estiver definida, o codigo deve funcionar com default seguro — nao quebrar deploys antigos.

## Opcoes Consideradas

### Opcao A: Parametrizar via env com defaults atualizados (ESCOLHIDA)

```ts
const CHAT_MODEL = process.env.COACH_CHAT_MODEL ?? 'claude-sonnet-4-6';
const MEMORY_MODEL = process.env.COACH_MEMORY_MODEL ?? 'claude-haiku-4-5-20251001';
```

- **Pros:**
  - **Rollback em segundos.** Se novo modelo regride em producao, setar `COACH_CHAT_MODEL=claude-sonnet-4-5-20250514` em env e reiniciar processo. Sem redeploy.
  - **Testes A/B simples.** Dois ambientes (staging + producao) podem rodar modelos diferentes sem branch de codigo.
  - **Upgrade para opus-4-7 no Coach-2** e so mudar env. O codigo fica preparado.
  - **Defaults sao seguros.** Sem env, o codigo usa os modelos atuais documentados no spec.
  - **Compativel com feature flag patterns.** Facil evoluir para per-user ou per-plan (modelo diferente para Premium no Coach-2).
  - **Observabilidade melhora.** Logar `model` em `chat_messages.model` permite reconstruir qual modelo respondeu qual msg historicamente (para debugging de regressao).

- **Contras:**
  - **Mais 1 variavel de ambiente para gerenciar.** Custo baixo — ja temos 10+ envs e documentamos em CLAUDE.md.
  - **Risco de config drift** entre ambientes se esquecer de sincronizar. Mitigacao: defaults seguros + log do modelo em cada msg.
  - **Env vazia/mal escrita pode passar como ID invalido.** Mitigacao: nao validar na partida (evitar crash); deixar a API Anthropic rejeitar com erro 400 logavel.

### Opcao B: Hardcode dos IDs no codigo (migracao direta)

```ts
const CHAT_MODEL = 'claude-sonnet-4-6';
```

- **Pros:**
  - **Zero configuracao extra.** Um commit migra tudo.
  - **Simplicidade maxima.** Estado do modelo e o estado do codigo.

- **Contras:**
  - **Rollback exige redeploy.** Janela de incidente longa.
  - **Testar novo modelo em staging + rollback rapido em producao** vira branching de git (feature flag via codigo), que e pior que env.
  - **Coach-2 premium via opus** precisaria de if/else no codigo. Vira gambit.
  - **Log de `chatMessages.model`** ainda faz sentido, mas reconstruir historico fica restrito a commits.

### Opcao C: Config via tabela de banco (feature flags dinamicas)

Tabela `coach_config` com key/value:

```sql
SELECT value FROM coach_config WHERE key = 'chat_model'
```

- **Pros:**
  - Mudanca em tempo real sem reiniciar.
  - Auditavel (quem mudou, quando).
  - Per-user overrides triviais.

- **Contras:**
  - **Overengineering para Coach-1.** Coach-1 tem 1 modelo chat + 1 modelo memoria, globais. Nao precisa de tabela.
  - **Latencia extra:** query por msg (ou cache local que invalida via LISTEN/NOTIFY). Complexidade nao justificada.
  - **Migration + CRUD admin** so para isso.
  - **Rejeitada por overengineering no Coach-1.** Revisitar no Coach-3 se feature flags dinamicas virarem necessidade.

### Opcao D: Manter modelo atual (`claude-sonnet-4-5-20250514`) e nao migrar

- **Pros:**
  - Zero risco de regressao.

- **Contras:**
  - **Perde ganho de qualidade documentado** dos modelos mais recentes.
  - **Perde melhor suporte de prompt caching** (cache read do 4.6 e otimizado).
  - **Deprecacao futura:** modelos antigos sao deprecated com 6-12 meses de antecedencia. Deixar a migracao para depois so atrasa o risco.
  - **Rejeitada:** migrar AGORA com opcao de rollback e melhor que migrar DEPOIS sem opcao.

## Decisao

**Adotar Opcao A: parametrizar via env com defaults atualizados.**

### Detalhes-chave do design

1. **Duas variaveis:**
   - `COACH_CHAT_MODEL` — default `claude-sonnet-4-6`. Usada em `handleCoachChat`.
   - `COACH_MEMORY_MODEL` — default `claude-haiku-4-5-20251001`. Usada em `compactSession` e `checkMonthlyCompaction` em `server/coachMemory.ts`.

2. **Leitura no startup (nao por request).** Valor capturado uma vez em `const MODEL = process.env.COACH_CHAT_MODEL ?? 'claude-sonnet-4-6'`. Alterar env exige reiniciar processo (suficiente — estamos em deploy local).

3. **Sem validacao na partida.** Se env tiver valor invalido, a API Anthropic rejeita com 400 logavel. Vantagem: nao quebramos boot por typo.

4. **Persistencia:** gravar `model` usado em `chat_messages.model` (coluna varchar(64) adicionada no Sprint Coach-1). Permite analise historica "qual modelo respondeu mal?".

5. **Documentacao:** listar as duas envs em CLAUDE.md secao 4 (Variaveis de Ambiente).

6. **Upgrade futuro para opus (Coach-2):** quando Premium ganhar acesso a opus, criar env adicional `COACH_CHAT_MODEL_PREMIUM` e `if tier === 'premium' && COACH_CHAT_MODEL_PREMIUM` usar opus. Gate e trivial porque modelo ja e variavel.

## Consequencias

### Positivas
- **Rollback de modelo em <1 minuto** sem redeploy (reiniciar processo apos mudar env).
- **A/B test entre modelos** trivial (dois deploys, duas envs).
- **Caminho para Coach-2 opus premium limpo.**
- **Log de `chat_messages.model`** permite debugging historico de regressao.
- **Defaults seguros:** sem env, codigo funciona com modelo atual.
- **Compativel com qualquer ambiente** (local, staging, Render, futuros).

### Negativas
- **+2 envs para documentar** em CLAUDE.md + `.env.example`. Custo marginal.
- **Config drift possivel** entre ambientes se nao sincronizado. Mitigacao: log do modelo + monitoramento de cache hit rate por modelo.

### Neutras
- **Proxima mudanca de modelo (4.6 -> 4.7) sera por env, nao por commit.** Uma linha no .env + restart = rollout.
- **Se Anthropic deprecar `claude-sonnet-4-6`** durante a janela do Coach-1, basta mudar env. Sem hotfix urgente no codigo.

## Confianca

**Alta.** Padrao da industria para config de modelos de LLM (OpenAI clients, Anthropic SDKs, LangChain). Baixo custo, alto beneficio em cenarios de incidente. Risco unico (env mal configurada) tem feedback rapido via erro 400 no primeiro request.

## Referencias

- Spec: `docs/specs/coach-sprint-1-fundacao-economica.md` (RF-01, secao "Migracao de modelos")
- CLAUDE.md secao 4 (Variaveis de Ambiente) — sera atualizado com as duas envs novas
- ADR-019 (prompt cache strategy) — depende do modelo suportar cache_control (ambos os modelos default suportam)
- `memory/deploy_strategy_2026-04-24.md` — confirma que deploy e manual/local; env como feature flag casa com esse workflow.
