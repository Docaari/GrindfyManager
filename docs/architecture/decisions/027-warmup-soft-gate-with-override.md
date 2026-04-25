# ADR-027: Gate Go/No-Go do warm-up como SOFT (warning + double-confirm) em vez de HARD

## Status
Aceito

## Data
2026-04-25

## Contexto

A Sprint W-1 do warm-up (`Docs/specs/warm-up-sprint-w1-spec.md`, RF-04 e RF-05) introduz a **Feature F-02: Gate Go/No-Go** como o item de maior ICE (9.0) do plano de refatoracao. A regra do metodo C8 do fundador e binaria: se o jogador, apos o check emocional 0-10 do Bloco 1, reportar score < 6, **nao deve jogar**. Sessoes em estado mental abaixo de 6 sao estatisticamente -EV (briga com parceira, sono curto, fadiga emocional).

A pergunta arquitetural: **como impor essa regra na UI sem produzir churn?**

Existem duas abordagens canonicas:
- **Hard gate:** botao "Iniciar Grind" fica permanentemente bloqueado quando score < 6. Usuario nao tem como jogar. Implementa a regra C8 sem desvios.
- **Soft gate:** dispara modal de aviso + sugestoes alternativas, mas permite override com confirmacao adicional. A regra C8 e respeitada por default, mas o jogador adulto mantem agencia.

O plano estrategico (`Docs/specs/warm-up-refactor-plan.md`, secao 9 R-1) ja sinalizava que gate hard gera risco de churn ("bloquear "Iniciar Grind" pode gerar churn de quem quer so usar tracker"). A spec confirmou a decisao do fundador (2026-04-25): **soft com telemetria de override**, com possibilidade de migrar para hard depois com base em dados.

### Restricoes

- **Sprint W-1 e a primeira entrega real do metodo C8 no produto.** Se o gate for percebido como paternalismo, jogadores experimentados podem desinstalar/desativar a feature antes que ela prove valor.
- **Nao temos baseline de comportamento.** Nao sabemos % de sessoes onde score < 6, nem % onde override seria usado. Sem dados, gate hard e adivinhacao.
- **A cultura "respeite o adulto" alinha com IZOF (Hanin):** zona otima e individual, nao universal. Score 5 para um jogador veterano pode ser produtivo; para outro, desastre. Hard gate trata todos iguais.
- **Telemetria client-side ja existe nesta sprint** (ADR-030). Mensurar % de override e baixo custo.
- **Risco regulatorio/contratual zero.** Diferente de domains regulados (saude, financeiro), nao ha obrigacao legal de bloquear o usuario.

## Opcoes Consideradas

### Opcao A: Soft-gate com warning + double-confirm + telemetria (ESCOLHIDA)

Score < 6 abre `GoNoGoModal` com 3 sugestoes (Estudar / Descansar / Conversar) e dois botoes:
- **"Nao vou jogar"** -> POST com `version='aborted'`, `decisionToPlay=false`. Hub volta com toast neutro. `Iniciar Grind` continua disabled.
- **"Ainda quero jogar"** -> abre `OverrideConfirmDialog` ("Tem certeza? Sessoes em estado mental abaixo de 6 sao estatisticamente -EV"). So apos segundo clique o ritual prossegue para Bloco 2 com `overrideUsed=true`.

Telemetria registra `gate_triggered` e `override_used`. Resposta serve de baseline.

- **Pros:**
  - **Respeita agencia do adulto.** Jogador profissional nao tolera produto que decide por ele sem porta de saida.
  - **Fricao calibrada.** Confirmacao dupla cria pausa cognitiva real (~3-5 segundos), suficiente para o Sistema 2 (C6) entrar em cena. Ja documentado em produtos similares (Calm Pro, Headspace) como mais eficaz que hard block.
  - **Coleta dados antes de endurecer.** Em 4 semanas saberemos quanto de override e usado. Se < 20%, mantemos soft. Se > 50%, pivotamos para hard (ou exigimos justificativa textual).
  - **Mensagem alinhada com C8.** A copia do modal cita explicitamente "decisao -EV-positiva" e oferece alternativas concretas.
  - **Audit trail.** Cada override e linha em `warmup_rituals` com `overrideUsed=true`. Coach AI futura (W-2) pode usar isso para personalizar conversa.
  - **Reversivel sem migracao.** Tornar hard depois e mudanca de feature flag - 1 dia de trabalho. Tornar soft depois de hard envolve UX redesign + churn.
  - **Mitigacao R-1 do plano:** "Telemetria: observar % de 'ainda quero jogar' - se >50%, repensar UX." E exatamente o que esta opcao habilita.

- **Contras:**
  - **Override loophole.** Jogadores que querem ignorar o gate sempre podem (custo de override = 2 cliques). Aceito como tradeoff conhecido.
  - **Risco de "fadiga de aviso":** se score < 6 e comum, jogador habitua-se a apertar override sem ler. Mitigado por: (a) confirmacao dupla com texto especifico; (b) telemetria detecta padrao e Coach pode intervir em sprint futura.
  - **Mais codigo que hard:** 2 componentes (`GoNoGoModal` + `OverrideConfirmDialog`) em vez de 1 botao disabled. Custo trivial.

### Opcao B: Hard gate (bloqueio total sem override)

Score < 6 -> `Iniciar Grind` permanentemente disabled. UI exibe motivo. Jogador deve fazer novo warm-up amanha.

- **Pros:**
  - **Aderencia perfeita ao C8.** Implementa a regra binaria do metodo sem desvios.
  - **Zero ambiguidade.** Estado mental ruim = nao joga. Ponto.

- **Contras:**
  - **Churn potencial alto.** Jogador veterano que sabe gerenciar seu estado pode abandonar a feature (ou o produto) ao primeiro bloqueio que considerar arbitrario.
  - **Impossivel medir false positives.** Sem override, nao sabemos quantas vezes o gate bloqueou jogador que teria jogado bem. Decisao "no escuro".
  - **Conflita com IZOF.** Score 5 universal vs zona otima individual. Hard gate ignora variacao individual.
  - **Workaround inevitavel.** Jogador determinado vai mentir o score (reportar 7 quando esta 4) - feature degenera em ritual decorativo.
  - **Reverter depois e custoso.** Se telemetria mostrar que hard nao resolve, voltar para soft envolve UX redesign + comunicar mudanca aos usuarios = churn adicional.
  - **Rejeitada por: agencia, falta de baseline, conflito com IZOF.**

### Opcao C: Hard gate com toggle em settings ("desativar gate")

Default hard, mas usuario pode desativar em settings com aviso explicito ("voce esta abrindo mao da feature").

- **Pros:**
  - Combina aderencia C8 (default) com escape (toggle).

- **Contras:**
  - **Alto custo cognitivo.** Jogador frustrado precisa: (1) entender que existe toggle, (2) navegar a settings, (3) ler aviso, (4) confirmar. Quem desativa nunca mais reativa.
  - **Bifurcacao.** Metade dos usuarios usa gate, metade nao. Telemetria fica fragmentada - dificil tirar conclusao agregada.
  - **Pior UX que soft.** Soft permite caso-a-caso (override pontual). Toggle e tudo-ou-nada.
  - **Mesma fragilidade do hard.** Quem desativa para "este dia" provavelmente nao reativa amanha.
  - **Rejeitada por bifurcacao + UX inferior ao soft.**

### Opcao D: Soft com input obrigatorio de justificativa textual ("por que vou jogar mesmo assim?")

Override exige preencher campo "por que" antes de prosseguir.

- **Pros:**
  - Maior friccao que double-confirm puro.
  - Cria registro qualitativo das justificativas (input rico para Coach AI).

- **Contras:**
  - **Excesso de friccao na primeira sprint.** Sem ter calibrado o uso, exigir texto pode irritar.
  - **Texto "porque sim" e inutil.** Telemetria mostra que campos obrigatorios sem validacao geram lixo.
  - **Pode ser adicionado depois.** Se telemetria de override > 50%, evoluimos soft para soft+texto. Comecar simples e enriquecer.
  - **Rejeitada para W-1; revisitavel em W-2.**

### Opcao E: Sem gate algum (so registra score)

Score 0-10 vira metrica decorativa.

- **Pros:**
  - Zero atrito.

- **Contras:**
  - **Anula F-02 do plano (ICE 9.0).** A feature de maior valor estrategico deixa de existir.
  - **Volta ao status quo da pagina /mental atual.** Score 60/40 decorativo - exatamente o problema que essa sprint resolve.
  - **Rejeitada.**

## Decisao

**Adotar Opcao A: soft-gate com warning + double-confirm + telemetria de override.**

### Detalhes-chave do design

1. **Trigger:** ao submeter score < 6 no `EmotionalCheckBlock`, o componente abre `GoNoGoModal` (em vez de avancar ao Bloco 2).
2. **GoNoGoModal:** dois botoes claros - "Nao vou jogar" (CTA primaria) e "Ainda quero jogar" (CTA secundaria, menos enfase visual).
3. **OverrideConfirmDialog:** AlertDialog do shadcn com copia "Tem certeza? Sessoes em estado mental abaixo de 6 sao estatisticamente -EV". CTAs: "Sim, registrar override" (destrutiva, ambar/vermelha) + "Cancelar" (default).
4. **Persistencia:**
   - "Nao vou jogar" -> `POST /api/warmup-rituals` com `version='aborted'`, `decisionToPlay=false`, `overrideUsed=false`, `emotionalCheckScore=score`.
   - Override confirmado -> ritual prossegue normalmente; ao concluir Bloco 5, POST com `version='full'`, `decisionToPlay=true`, `overrideUsed=true`.
5. **Validacao server-side cross-field:** se `overrideUsed=true`, deve ter `emotionalCheckScore < 6` E `decisionToPlay=true`. Server rejeita 400 se inconsistente.
6. **Telemetria (ADR-030):**
   - `gate_triggered` com `{score}` no momento em que GoNoGoModal abre.
   - `override_used` com `{score}` no momento da confirmacao dupla.
   - `warmup_aborted` com `reason='gate_no_go'` no caminho "Nao vou jogar".
7. **Badge visual no historico:** ritual com `overrideUsed=true` recebe tag amarela "override" no `WarmupHistoryCard` e em `/grind` (botao "Iniciar Grind" mostra "override registrado").
8. **Metrica de monitoramento:** % override-used / total de gate-triggered. Threshold de re-avaliacao: > 50% em janela rolling de 4 semanas dispara discussao para passar a hard gate (ou Opcao D).

## Consequencias

### Positivas
- **Respeita agencia do jogador profissional.** Maior chance de adocao em segmento veterano.
- **Cria baseline mensuravel.** Telemetria de override gera dado real para decidir endurecer no futuro.
- **Audit trail rico.** Cada override e linha persistida; permite estudos correlacionais futuros (override vs ROI, override vs streak).
- **Implementacao simples.** 2 componentes + uma flag no schema.
- **Reversivel.** Migrar para hard ou Opcao D em sprint futura e refactor pequeno - so esconder o botao "Ainda quero jogar".

### Negativas
- **Override loophole conhecido.** Jogadores podem ignorar o gate com 2 cliques. Aceito como tradeoff que troca aderencia perfeita por agencia + dados.
- **Possivel "habituacao ao aviso"** se override for frequente. Mitigacao: telemetria + revisao em 4 semanas.
- **Score reportado pode ser desonesto.** Jogador que sabe que score < 6 dispara modal pode mentir. Nenhuma solucao tecnica resolve isso; e dependencia da relacao do usuario com a propria pratica deliberada.

### Neutras
- **Re-avaliacao em 4 semanas obrigatoria.** Se override > 50%, mover para hard ou Opcao D. Se < 20%, manter soft. Decisao baseada em dado, nao em opiniao.
- **Coach AI (W-2) pode usar sinal de override** para conversa: "Voce overrideou o gate 3x esta semana. Quer falar sobre o que esta acontecendo?".

## Confianca

**Alta.** Padrao soft-gate com double-confirm e usado em produtos similares (Headspace "Take a moment", Calm Pro "Pause"). Tradeoff agencia vs aderencia bem documentado em literatura de behavior design (Fogg, BJ; "Tiny Habits" Cap. 6). Risco principal - override > 50% - e detectavel via telemetria desta mesma sprint e mitigavel sem migration.

## Referencias

- Spec: `Docs/specs/warm-up-sprint-w1-spec.md` (RF-04, RF-05, Secao 14 R-1)
- Plano: `Docs/specs/warm-up-refactor-plan.md` (Secao 9 R-1; F-02)
- ADR-030: telemetria client-only (suporta a metrica de monitoramento)
- ADR-028: tabela `warmup_rituals` (campos `overrideUsed`, `decisionToPlay`)
- Hanin, Y. (2014). "Individual Zones of Optimal Functioning" - fundamento para nao tratar score 6 como universal.
- Fogg, BJ. "Tiny Habits" (2019) - friccao calibrada > bloqueio total.
