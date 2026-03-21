# ADR-010: Perfil OFF como 4o estado (nao substituindo C)

## Status
Aceito

## Data
2026-03-21

## Contexto

O sistema de grade semanal usa perfis A/B/C por dia da semana, permitindo que o jogador planeje diferentes volumes/intensidades. Atualmente, o campo `profile_states.activeProfile` aceita 'A', 'B', 'C' ou null (para dia inativo).

A spec original da Biblioteca v2 tratava C como "dia OFF". No entanto, a analise do codigo revelou que C e um perfil jogavel valido — muitos usuarios ja tem torneios planejados com perfil C. Tratar C como OFF quebraria dados existentes.

A questao e: como representar "dia desativado" sem destruir o perfil C?

## Opcoes Consideradas

### Opcao 1: C = OFF (spec original)
- **Pros:** Apenas 3 valores (A/B/OFF), UI mais simples
- **Contras:** Quebra dados existentes — usuarios com torneios em perfil C perderiam planejamento. Reduz flexibilidade de 3 perfis para 2. Semantica confusa (C e um perfil e tambem significa "desligado"?).

### Opcao 2: null = OFF (manter comportamento atual)
- **Pros:** Zero mudanca no schema, null ja significa "inativo"
- **Contras:** Semantica ambigua — null pode significar "nao configurado" ou "desativado intencionalmente". Frontend precisa tratar null como caso especial em todo lugar. Dificil de comunicar ao usuario ("seu dia esta null" vs "seu dia esta OFF").

### Opcao 3: OFF como 4o valor explicito
- **Pros:** Semantica clara (A/B/C sao perfis jogaveis, OFF desativa). Preserva todos os dados existentes. Default OFF para dias nao configurados (em vez de null ambiguo). UI pode mostrar segmented control de 4 opcoes com visual distinto para OFF. Regra simples: dia OFF oculta torneios sem deletar.
- **Contras:** 4 valores no segmented control ocupa mais espaco. Migration necessaria para converter null -> OFF nos registros existentes.

## Decisao

Adotar OFF como 4o valor explicito no campo `profile_states.activeProfile`. Os valores aceitos passam a ser: 'A', 'B', 'C', 'OFF'.

Regras:
- A, B, C: perfis jogaveis com torneios proprios
- OFF: dia desativado — oculta torneios (nao deleta), rejeita drag-and-drop, visual esmaecido
- Default para dias sem configuracao: OFF (nao null)
- Mudar de A/B/C para OFF: aviso se houver torneios, oculta sem deletar
- Mudar de OFF para A/B/C: torneios reaparecem

Migration: UPDATE profile_states SET active_profile = 'OFF' WHERE active_profile IS NULL

## Consequencias

- **Positiva:** Semantica clara para todos os agentes e para o usuario
- **Positiva:** Dados existentes preservados — C continua sendo perfil jogavel
- **Positiva:** Default explicito evita ambiguidade de null
- **Negativa:** Migration necessaria (simples, uma query)
- **Negativa:** Segmented control com 4 opcoes ocupa mais espaco — mitigado com design compacto
- **Neutra:** hook useProfileStates precisa ser atualizado para tratar 'OFF' como valor valido

## Confianca
Alta
