# Dicas Rápidas — Como Trabalhar com IA para Criar Skills
## Guia prático para o usuário

---

## O Básico em 30 Segundos

Uma **skill** é um conjunto de instruções que ensina o Claude a fazer uma tarefa específica muito bem. Pense nela como um manual de procedimentos que o Claude consulta automaticamente quando detecta que precisa daquela habilidade.

Você não precisa saber programar para criar uma skill — mas precisa saber descrever claramente **o que quer**, **por que quer** e **como saber se ficou bom**.

---

## 8 Dicas que Fazem Diferença

### 1. Comece pelo entediante

Escolha uma tarefa repetitiva com regras claras. Formatação de documentos, entrada de dados, reviews padronizados. Uma IA que faz uma coisa com 99% de acerto vale mais que uma que faz dez coisas a 80%.

> Primeiro funciona. Depois impressiona.

---

### 2. Diga o que você NÃO quer — mas explique por quê

Dizer "não use jargão" é bom. Dizer "não use jargão porque o leitor é um executivo sem formação técnica" é melhor. O Claude entende intenção e aplica a regra mesmo em situações que você não previu.

**Fraco:** "Escreva de forma profissional."

**Forte:** "Não use frases acima de 20 palavras. Não use termos técnicos sem tradução. O leitor toma decisões rápidas e escaneia o texto."

---

### 3. Mostre exemplos — com o raciocínio

Quando pedir para a IA criar uma skill, forneça 3-5 exemplos reais do que espera. Inclua não só a entrada e saída, mas **por que** aquela saída é a correta.

```
Entrada: Cliente pediu reembolso fora do prazo
Raciocínio: Prazo expirado = regra clara. Mas cliente
  é recorrente e valor é baixo. Encaminhar para gerente.
Saída: Escalar para aprovação manual com nota de contexto
```

Sem o raciocínio, a IA decora o padrão. Com o raciocínio, ela entende a lógica.

---

### 4. Separe as instruções do conteúdo

Quando testar ou usar uma skill, mantenha claro o que são **regras** e o que são **dados de entrada**. Misturar os dois confunde o modelo e abre brecha para erros.

- **Regras** = o que o Claude deve fazer e como se comportar
- **Dados** = o material que ele vai processar

---

### 5. Quebre tarefas grandes em passos

Em vez de pedir tudo de uma vez, divida em etapas. Cada etapa produz algo verificável antes de avançar.

```
Passo 1: Extrair dados do arquivo
Passo 2: Validar se os dados estão completos
Passo 3: Gerar o relatório a partir dos dados validados
```

Se o passo 2 falhar, você sabe exatamente onde o problema está.

---

### 6. Peça que o Claude verifique antes de entregar

Inclua na skill uma instrução simples:

> "Antes de entregar o resultado, verifique: todos os requisitos foram atendidos? O formato está correto? Há contradições? Se algo estiver incerto, sinalize."

Isso sozinho já pega muitos erros que passariam despercebidos.

---

### 7. Teste com casos que você não mostrou

Depois que a skill funcionar com seus exemplos, teste com entradas diferentes. Se só funciona com os exemplos que você deu, a skill está "decorando" em vez de "aprendendo". Uma boa skill generaliza.

---

### 8. Itere — não tente acertar de primeira

O processo é circular:

```
Rascunho → Teste → Feedback → Melhoria → Teste → ...
```

Skills de produção passam por 3-5 rodadas de refinamento. Cada rodada melhora algo específico baseado no que você observou na rodada anterior.

---

## Perguntas para se Fazer Antes de Criar uma Skill

| Pergunta | Por quê |
|---|---|
| Essa tarefa tem regras claras? | Skills funcionam melhor com regras definidas |
| Qual é o output ideal? | Se você não sabe descrever o resultado, a IA também não vai saber |
| Como vou saber se ficou bom? | Defina critérios antes de começar, não depois |
| Essa tarefa é repetida frequentemente? | Skills brilham em tarefas recorrentes |
| Quem vai usar o resultado? | Saber o público muda como a skill deve se comportar |

---

## Quando NÃO usar uma Skill

- Tarefa é única e nunca vai se repetir → use um prompt direto
- O resultado é 100% subjetivo e muda toda vez → skills preferem padrões
- Você ainda não sabe descrever o que quer → primeiro explore com conversas livres, depois crie a skill

---

## Vocabulário Mínimo

| Termo | O que significa |
|---|---|
| **Skill** | Pacote de instruções que ensina o Claude uma habilidade específica |
| **SKILL.md** | O arquivo principal com as instruções da skill |
| **Frontmatter** | O cabeçalho do arquivo com nome e descrição (entre `---`) |
| **Trigger** | Quando o Claude decide que precisa usar aquela skill |
| **Edge case** | Situação incomum que testa os limites da skill |
| **Few-shot** | Técnica de dar exemplos para o modelo seguir |
| **Chain of Thought** | Pedir que o modelo mostre o raciocínio antes da resposta |
| **XML tags** | Marcações tipo `<isso>conteúdo</isso>` para organizar instruções |
| **Prompt chaining** | Dividir uma tarefa grande em prompts menores encadeados |
| **Validação** | Verificar se o resultado está correto antes de entregar |

---

*Lembre-se: a melhor skill é aquela que faz uma coisa simples de forma confiável. Comece pequeno, teste bastante, e expanda quando a base estiver sólida.*
