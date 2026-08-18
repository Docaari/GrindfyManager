---
description: Qual modelo do Claude e qual esforco usar para cada tipo de trabalho no Grindfy
---

# Modelo e esforco

Raciocinio completo: `Docs/desenvolvimento/09-MODELO-E-ESFORCO.md`.
Toda spec abre declarando modelo e esforco escolhidos.

| Trabalho | Modelo | Esforco |
|---|---|---|
| Copy PT-BR, rotulo, ajuste de token visual | Sonnet 5 | `low` |
| Componente novo, layout, teste de UI | Sonnet 5 | `medium` |
| Rota nova, storage novo, migration simples | Sonnet 5 | `high` |
| Parser CSV, FX, bankroll, permissao/tier, prompts do Coach | Opus 5 | `high` |
| Query de dashboard/analytics (secao 6.1), scoring, variancia, migration com back-fill | Opus 5 | `xhigh` |
| Diagnostico de bug desconhecido, auditoria, varredura de regressao | Opus 5 | `xhigh` |
| Refatoracao estrutural grande | Fable 5 / Opus 5 | `xhigh` |
| Renomear em massa, converter formato, gerar indice | Haiku 4.5 | — |

**Zona critica nunca roda abaixo de `high`.** Zonas criticas: parser CSV, fonte
do historico (secao 6.1), FX/dinheiro, permissao e tier, prompts e custo do
Coach, schema/migration, ordem de rota.

## Regras de uso

- Resultado raso: **suba o esforco** antes de reescrever o prompt. Esforco baixo
  escopa o trabalho ao pedido literal por obediencia, nao por incapacidade.
- Nao mude o esforco no meio de sessao longa: invalida o cache do prompt.
- `high` e o padrao; passar `high` e igual a nao passar nada.
- Esforco afeta tambem o numero de chamadas de ferramenta, nao so o raciocinio.

## Subagentes

O gargalo e o contexto, nao o modelo. Quem decide roda alto (Opus 5); quem varre
e resume roda economico (Sonnet `medium`, ou Haiku para leitura pura).

Casos que se pagam aqui: varrer lessons-learned atras de vizinhos da mudanca,
rodar suite e resumir, achar todos os callsites de um padrao, conferir se uma
migration ja foi aplicada.

Nao dispare subagente sem pedido do founder para tarefa que voce mesmo resolve no
turno — spawn frio re-deriva contexto que voce ja tem.

## Modelos do produto (nao confundir)

O que o Coach usa em runtime e outra decisao: `COACH_MODEL` (Sonnet para
narrativa) e `COACH_REPORT_SUMMARIZER_MODEL` (Haiku para sumarizacao
hierarquica). Ver ADR-021 e ADR-159.
