# Pricing — Road News

> Mantido por `product-docs-agent`. Última revisão: 2026-08-06 (primeira publicação).
>
> **Nenhum valor em R$ está publicado aqui de propósito.** A regra deste projeto é clara: `product-docs-agent` nunca escreve preço final sem validação humana explícita — só estrutura a lógica de pacote/limite, que já existe implementada em código. Preencha os valores com o usuário antes de usar este documento externamente.

## Estrutura técnica já implementada

Cada pacote (`packages` no banco) já define, tecnicamente, estas dimensões — a precificação real é decidir **quanto cada uma vale em R$** e **como combiná-las em tiers**:

| Dimensão do pacote | O que limita |
|---|---|
| `monthly_news_limit` | Consultas de notícia por mês |
| `monthly_ai_summary_limit` | Resumos de IA (individual + semanal) por mês |
| `monthly_pdf_limit` | PDFs gerados por mês |
| `monthly_route_limit` | Análises de rota (Minha Rota) por mês |
| `max_users` | Usuários por cliente |
| `can_generate_individual_summary` | Liga/desliga resumo de IA por notícia |
| `can_generate_weekly_summary` | Liga/desliga resumo semanal |
| `can_access_map` | Liga/desliga acesso ao mapa |

Hoje existe pelo menos um pacote ativo em produção (uso interno/piloto) — os valores exatos de limite desse pacote não estão neste documento porque são dado operacional, não posicionamento comercial; consultar diretamente a tabela `packages` via `database-expert`/`saas-platform-engineer` se necessário para uma proposta comercial concreta.

## Perguntas que precisam de resposta humana antes de publicar preço

1. Quantos tiers comerciais existem (ex. Starter/Pro/Enterprise) e como cada um mapeia para as 8 dimensões acima?
2. Cobrança é por cliente (tenant) ou por usuário (`max_users`)?
3. Existe desconto por contrato anual/volume?
4. Minha Rota e o mapa são parte do pacote base ou add-on pago à parte?
5. Como funciona overage (cliente estoura o limite mensal antes do fim do mês) — bloqueia, cobra excedente, ou oferece upgrade automático? Hoje o comportamento técnico é **bloquear** com mensagem pedindo contato com o gestor (ver `FEATURE_RULES` em `api/_auth.js`) — decidir se isso é o comportamento comercial desejado ou só o piso técnico atual.

## Quando este documento estiver validado

Ele deve conter: nome de cada tier, valor em R$/mês (ou critério de cobrança), o que cada tier inclui nas 8 dimensões acima, e a política de overage. Até lá, use [`BUSINESS_MODEL.md`](BUSINESS_MODEL.md) para entender a lógica sem os números.
