# Team 4: Debug com Hipoteses Paralelas

## Quando usar
Bug em producao que pode ter multiplas causas. Em vez de investigar
uma hipotese por vez, testa todas simultaneamente.

## Pre-requisitos
- Bug reproduzivel ou stack trace disponivel

## Prompt (copie e cole no Claude Code)

```
Crie um Agent Team para debugar: "[DESCRICAO DO BUG]"

Sintomas:
- [Descrever o que esta acontecendo]
- [Stack trace, se disponivel]
- [Quando comecou, se souber]

Teste estas hipoteses em paralelo:

1. Hipotese DB (nome: "db-investigator"):
   - Verifique: queries lentas, deadlocks, conexoes
     esgotadas, migrations faltando, dados corrompidos
   - Examine logs de query se disponiveis
   - Tente reproduzir o problema isolando a camada de banco
   - Foco em: server/db.ts, server/storage.ts, shared/schema.ts

2. Hipotese Logica (nome: "logic-investigator"):
   - Verifique: race conditions, estado inconsistente,
     edge case nao tratado, erro de validacao silencioso
   - Trace o fluxo completo do request que falha
   - Identifique onde o comportamento diverge do esperado
   - Foco em: server/routes.ts, server/auth.ts, server/csvParser.ts

3. Hipotese Infra (nome: "infra-investigator"):
   - Verifique: timeout de servico externo, rate limit
     atingido, variavel de ambiente errada, DNS/SSL,
     memoria/CPU saturados, versao de dependencia
   - Examine logs de erro e health checks
   - Foco em: .env, package.json, server/index.ts, server/emailService.ts

Cada investigador:
- Profile o problema na sua camada
- Tente reproduzir
- Reporte achados com evidencia (logs, queries, traces)

Apos investigacao:
- Sintetize qual hipotese tem mais evidencia
- Proponha fix especifico com teste que reproduz o bug
- Se nenhuma hipotese se confirmar, proponha proximos
  passos de investigacao
```

## Custo estimado
~3x de debug sequencial. Valor: encontra a causa em 15 min vs horas de investigacao linear.
