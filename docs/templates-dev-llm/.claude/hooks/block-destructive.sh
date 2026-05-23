#!/usr/bin/env bash
# Destino: .claude/hooks/block-destructive.sh na raiz do PROJETO do usuário.
# Maio 2026.
#
# Hook PreToolUse: bloqueia padrões claramente destrutivos no Bash.
# Recebe via stdin um JSON com o tool_input. Retorna exit 0 (libera) ou 2 (bloqueia + envia stderr de volta ao Claude).

set -euo pipefail

# Lê o tool input
input=$(cat)

# Extrai o comando (assume formato { "tool_input": { "command": "..." } } )
command=$(echo "$input" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")

if [[ -z "$command" ]]; then
  exit 0
fi

# Padrões destrutivos. Adicione/remova conforme seu workflow.
deny_patterns=(
  'rm -rf /'
  'rm -rf ~'
  'rm -rf \*'
  ':\(\)\{ :|:&'      # fork bomb
  'mkfs\.'
  'dd if=/dev/zero'
  'dd if=/dev/random'
  '> /dev/sda'
  'chmod -R 777 /'
  'chown -R'
  '\| sh$'             # pipe to sh no final
  '\| bash$'           # pipe to bash no final
)

for pattern in "${deny_patterns[@]}"; do
  if [[ "$command" =~ $pattern ]]; then
    echo "Bloqueado pelo hook block-destructive: o comando contém o padrão perigoso '$pattern'." >&2
    echo "Se você realmente precisa rodar este comando, faça-o manualmente no terminal, fora do Claude Code." >&2
    exit 2
  fi
done

exit 0
