# Modelo de Negócio — Road News

> Mantido por `product-docs-agent`. Última revisão: 2026-08-06 (primeira publicação). Valores em R$ não fazem parte deste documento — ver [`PRICING.md`](PRICING.md) para a estrutura de pacotes e a nota sobre validação pendente.

## Formato

SaaS B2B, multi-tenant, por assinatura de pacote com limite de uso mensal — não é cobrança por notícia individual nem por API pública aberta. Cada cliente (`clients` no banco) tem um ou mais usuários (`profiles`), vinculados a um pacote (`packages`) que define o que podem usar e quanto.

## Como o pacote controla o que o cliente recebe

O modelo técnico já implementado (`api/_auth.js`) define, por pacote:

| Dimensão | Controla |
|---|---|
| `monthly_news_limit` | Quantas consultas de notícia por mês |
| `monthly_ai_summary_limit` | Quantos resumos de IA (individual + semanal) por mês |
| `monthly_pdf_limit` | Quantos PDFs gerados por mês |
| `monthly_route_limit` | Quantas análises de rota (Minha Rota) por mês |
| `max_users` | Quantos usuários o cliente pode ter |
| `can_generate_individual_summary` | Se o resumo de IA por notícia está habilitado |
| `can_generate_weekly_summary` | Se o resumo semanal por e-mail está habilitado |
| `can_access_map` | Se o mapa rodoviário está habilitado |

Papéis `admin`/`manager` (uso operacional interno da gerenciadora de risco) têm acesso ilimitado por desenho — a régua de pacote existe para o cliente final (`client`), não para quem opera a plataforma.

## Quem vende, quem usa

Provisionamento hoje é manual: `admin`/`manager` criam o cliente, o(s) usuário(s), e vinculam o pacote pelo próprio painel (`/admin`, `/gestor`) — não há fluxo de self-signup. Ver [`ONBOARDING.md`](ONBOARDING.md).

## Custo variável principal

IA (OpenAI) é o maior custo variável direto por cliente/uso — por isso o produto já nasce com pré-filtro determinístico antes de qualquer chamada de IA e um interruptor de custo (`SCRAPER_AI_SUMMARIES_ENABLED`) desligado em produção até que o volume de clientes justifique religar (ver `finops-agent` em [`../docs/AGENTS.md`](../docs/AGENTS.md)).

## O que este documento não define

Preço em R$ por pacote, número de tiers comerciais, e desconto por volume/contrato anual são decisões de negócio que exigem validação humana explícita — ver [`PRICING.md`](PRICING.md).
