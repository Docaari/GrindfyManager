/**
 * Dinheiro nos cards do dashboard.
 *
 * Re-export do formatador canônico do projeto (`lib/utils`) — antes este arquivo
 * tinha implementação própria em `en-US` (`$1,234.56`) enquanto o resto da
 * aplicação usa `pt-BR` com símbolo `$` (`$1.234,56`). O mesmo valor aparecia
 * escrito de dois jeitos em telas vizinhas.
 *
 * Para eixo de gráfico e frase corrida, onde os centavos só poluem, use
 * `formatCurrencyRounded` de `lib/formatting`.
 */
export { formatCurrency } from '@/lib/utils';
