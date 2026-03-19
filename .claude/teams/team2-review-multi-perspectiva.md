# Team 2: Review Multi-Perspectiva

## Quando usar
Antes de merge de features criticas (auth, pagamentos, dados sensiveis).
Substitui o subagente Reviewer quando a feature e complexa o suficiente
para multiplas perspectivas.

## Decisao: Subagente Reviewer vs Team 2

| Situacao | Use |
|---|---|
| PR pequeno, bugfix, feature simples | Subagente Reviewer |
| Feature que toca auth, tokens, senhas | Team 2 |
| Feature de pagamentos, dados financeiros | Team 2 |
| Feature CRUD simples, testes passando | Subagente Reviewer |

Regra: "Se esse codigo tiver um bug, qual o impacto?"
Impacto alto → Team 2. Impacto baixo → Subagente.

## Pre-requisitos
- Feature implementada
- Testes passando
- Pronto para merge

## Prompt (copie e cole no Claude Code)

```
Crie um Agent Team para review da feature "[NOME DA FEATURE]"
antes do merge para main.

Contexto:
- Leia CLAUDE.md para padroes e convencoes do projeto
- A feature esta na branch feature/[nome]
- Diff disponivel via: git diff main...feature/[nome]

Teammates:

1. Security Reviewer (nome: "security"):
   - Audite contra OWASP Top 10
   - Verifique: injection (SQL, XSS), auth/authz,
     exposicao de dados sensiveis, rate limiting
   - Verifique que senhas sao hasheadas, tokens tem
     expiracao, CORS esta configurado
   - Classifique cada achado: CRITICAL / HIGH / MEDIUM / LOW
   - So reporte com confianca alta (evite falsos positivos)

2. Performance Reviewer (nome: "performance"):
   - Identifique: queries N+1, falta de indices,
     chamadas sincronas que deviam ser async,
     objetos grandes em memoria, falta de paginacao
   - Verifique se endpoints pesados tem caching
   - Classifique por impacto: CRITICAL / HIGH / MEDIUM / LOW

3. Standards Reviewer (nome: "standards"):
   - Verifique aderencia as convencoes do CLAUDE.md
   - Naming, estrutura de diretorios, patterns do projeto
   - Cobertura de testes: cada regra de negocio tem teste?
   - Verifique que nao ha funcionalidade sem teste
   - Classifique: MUST FIX / SHOULD FIX / NICE TO HAVE

Coordenacao:
- Cada reviewer trabalha em paralelo na mesma diff
- Se um reviewer encontrar algo que afeta a area de outro,
  comunique via mensagem
- Nao dupliquem achados entre si

Apos todos terminarem, sintetize um relatorio unico:
- Achados por severidade (CRITICAL primeiro)
- Quais sao bloqueantes para merge
- Quais podem ser resolvidos em PR separado
- Veredicto: APPROVE / REQUEST CHANGES / BLOCK
```

## Custo estimado
~3x de um review simples. Valor: pega problemas que um reviewer solo nao veria.
