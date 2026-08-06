# Proposta de Valor — Road News

> Mantido por `product-docs-agent`. Última revisão: 2026-08-06 (primeira publicação).

## A promessa central

Você não precisa ler notícia. Você precisa saber se a sua carga, na sua rota, agora, está segura para seguir — e o Road News entrega essa resposta, não uma lista de manchetes.

## Por capacidade real (não aspiracional)

| O cliente ganha | Como o produto entrega hoje |
|---|---|
| Não perder tempo filtrando notícia irrelevante | Coleta contínua já filtrada por keyword/relevância rodoviária antes de chegar à tela |
| Saber a gravidade real de um evento, não achismo | Classificação de risco (Baixo/Médio/Alto/Crítico) e, para eventos logísticos maiores, confiança mínima + evidência auditável (link da fonte) |
| Decidir sobre uma rota específica, não sobre o Brasil inteiro | Minha Rota: cruza o trajeto real (com trânsito, via Google Routes) com notícias das últimas 24h no raio da rota |
| Confiar na resposta mesmo quando a IA está fora | Toda análise crítica tem fallback determinístico por regra — a tela nunca fica sem resposta só porque a IA falhou |
| Ver o que aconteceu num mapa, não só numa lista | Mapa com marcador de risco, agrupamento por zoom, e trecho destacado quando há bloqueio/risco na rota |
| Resumo executivo sem precisar entrar no painel todo dia | Resumo operacional semanal por e-mail, gerado por IA |
| Confiança de que o dado do seu concorrente não aparece pro seu usuário | Isolamento de tenant real (RLS + validação em código), não um "modo demo" com dado compartilhado |

## Para quem isso importa mais

Gerenciadoras de risco e operações de torre de controle que decidem, em tempo real, se uma carga de alto valor pode seguir por uma rota — não para quem só quer "ficar informado" sobre rodovia em geral. Ver [`PERSONAS.md`](PERSONAS.md).

## O que conscientemente não é a proposta de valor

Não é ser a fonte mais rápida de notícia genérica (existem agregadores maiores e mais rápidos para isso). Não é substituir o julgamento humano de quem libera a carga — é dar a esse julgamento a base de evidência que faltava. Não é cobertura internacional ampla — a cobertura internacional existe só onde afeta rota/porto/frete/combustível do Brasil (ver [`../docs/AI_PIPELINE.md`](../docs/AI_PIPELINE.md), `STRATEGIC_INFRA_PATTERN`).
