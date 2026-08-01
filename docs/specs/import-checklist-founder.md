# Import (/upload) — o que falta revisar e o próximo passo

**Atualizado:** 2026-08-01, ao encerrar a primeira passada na área Import.
**Para quem:** founder. Estado da página `/upload` + o trabalho grande que ainda
não foi feito.

---

## 1. O que foi entregue nesta passada

Remodelação de layout (commit `d25fc5b9`): a página agora segue o padrão das
telas modernas (Dashboard, Grade) — abas Importar / Histórico / Limpeza, tudo à
esquerda, tokens semânticos. Detalhe no proprio commit.

Junto, código morto removido e um bug de cache corrigido (desfazer import
deixava gráficos do dashboard com dado morto).

---

## 2. Verificar no navegador — `/upload`

1. As três abas trocam; os indicadores do topo continuam visíveis em qualquer
   uma.
2. **Histórico → Desfazer**: abre o diálogo novo (não é mais o pop-up do
   navegador). Confirme e veja o dashboard atualizar na hora.
3. **Limpeza**: o painel de remoção em massa continua funcionando.
4. Envie um CSV real e confira que a "Conferência do último import" aparece com
   linhas lidas x importadas x duplicadas x rejeitadas.

Se algo estiver quebrado, me diga qual aba e o que apareceu.

---

## 3. O TRABALHO GRANDE — classificação de satélite e flight

Esta é a razão principal de a área Import existir como sessão. **Ainda não foi
feito** — só a evidência foi levantada (na sessão Dashboard). É trabalho de
lógica de parser, demora, e você já disse que quer fazer com calma.

**O que está errado hoje** (`shared/tournament-type-detector.ts` + `csvParser.ts`):

1. **`FLIGHT_DAY_REGEX` aceita a palavra "Final".** Qualquer torneio com "Final"
   no nome vira "flight". Ex. real: `BoM: ₮25 Final Knight Freezeout` — um vanilla
   comum — é classificado como perna de multi-flight.
2. **O balde "Satélite" vem contaminado do import, não da leitura do nome.**
   `SATELLITE_REGEX` NÃO casa "Weekender" nem "Mystery" — logo essas linhas têm
   `type`/`category` gravados errado na importação. Suspeita principal: a bandeira
   `Satellite` do export SharkScope (o parser cita 104 linhas com ela) sendo
   aceita como verdade cega.
3. **Sinal correto de satélite, segundo você:** o nome costuma trazer
   "satelite"/"satellite", "seats" ou equivalente. Você não achou NENHUM satélite
   de verdade na lista filtrada do dashboard.
4. **Falta a regra de contagem do Day 2.** Day 1 só tem custo; sem juntar as
   pernas da série, o ROI de flight fica cronicamente negativo.

**Antes de escrever código, precisamos DEFINIR AS CHAVES** (suas palavras): o que
exatamente marca um flight, o que marca um satélite, e como o parser distingue os
dois de um vanilla que só tem "Final"/"Weekly" no nome. Isso é conversa + amostra
real do seu histórico, não é sair mexendo em regex.

⚠️ **Colisão de áreas:** Import escreve em `tournaments` / `storage.ts`, as mesmas
tabelas que **Torneios** e **Dashboard** leem. Pela regra §4.5 do documento de
sessões, essas áreas NÃO podem ter sessões rodando ao mesmo tempo que a de
Import. Rodar uma por vez.

---

## 4. Outros achados da área (menores, não bloqueiam)

- **Upload devolve 500 após salvar** (`memory/followup_upload_500_pos_persist`):
  o CSV é persistido com sucesso mas a resposta é 500; o front mascara em
  `AutoUpload.tsx` tratando como sucesso. Investigar a causa raiz.
- `routes/upload.ts` tem 1872 linhas — candidato a modularização quando a área
  for mexida a fundo.
- A classificação de tipo (`type` vs a coluna legada `category`) ainda arrasta a
  deprecação do ADR-032; vale terminar junto com o trabalho de satélite/flight.

---

## 5. Próxima sessão sugerida: Grade-Planner

Você sinalizou evoluir o Grade-Planner. Área já mapeada no documento de sessões
(§4.1): `/grade-planner` + `/coach`, `pages/GradePlanner.tsx`,
`components/grade-planner/*`, `components/grade/*`, `routes/grade-planner.ts` +
`grade-day-detail.ts` + `tournament-series.ts`.

Grade-Planner NÃO colide com Import (escrevem em tabelas diferentes —
`planned_tournaments` vs `tournaments`), então pode rodar em paralelo se quiser.
